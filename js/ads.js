'use strict';

(function initLAQPAds(global) {
  const CONFIG = Object.freeze({
    enabled: true,
    requireAdConsent: true,
    provider: 'adsterra',
    consentStorageKey: 'laqp_cookie_consent_v1',
    renderTimeoutMs: 10000,
    unit: Object.freeze({
      format: 'iframe',
      key: '8a3fb93caf85fe0ba7fb51f68738589f',
      width: 728,
      height: 90,
      src: 'https://www.highrevenueformat.com/8a3fb93caf85fe0ba7fb51f68738589f/invoke.js',
    }),
  });

  const renderedSlots = new Set();
  const frameRecords = new WeakMap();
  const recordsByToken = new Map();
  let frameSequence = 0;

  function readConsent() {
    if (!CONFIG.requireAdConsent) return true;
    try {
      const consent = JSON.parse(global.localStorage.getItem(CONFIG.consentStorageKey) || 'null');
      return consent?.ads === true;
    } catch {
      return false;
    }
  }

  function safeAvailableWidth(slot) {
    const content = slot.querySelector('.ad-slot__content');
    const measured = Math.floor(content?.getBoundingClientRect().width || slot.getBoundingClientRect().width || 0);
    if (!slot.closest('.ad-bootstrap') && measured > 0) return measured;

    const viewport = Math.floor(document.documentElement.clientWidth || global.innerWidth || 0);
    if (slot.dataset.adContext === 'database' && viewport > 768) {
      return Math.max(0, viewport - 220 - 48);
    }
    const gutter = slot.dataset.adContext === 'profile' && viewport > 768 ? 64 : 32;
    return Math.max(0, viewport - gutter);
  }

  function frameToken() {
    frameSequence += 1;
    return `laqp-ad-${Date.now().toString(36)}-${frameSequence.toString(36)}`;
  }

  function bannerMarkup(unit) {
    return [
      '<script>',
      'atOptions = {',
      `  'key' : '${unit.key}',`,
      "  'format' : 'iframe',",
      `  'height' : ${unit.height},`,
      `  'width' : ${unit.width},`,
      "  'params' : {}",
      '};',
      '<\/script>',
      `<script src="${unit.src}"><\/script>`,
    ].join('\n');
  }

  function sandboxDocument(unit, token) {
    const safeToken = JSON.stringify(token);
    const bridge = `<script>
      (() => {
        const token = ${safeToken};
        let creativeReported = false;
        const notify = status => parent.postMessage({ type: 'laqp-ad-status', token, status }, '*');
        const creativeSelector = 'iframe[src]:not([src="about:blank"]), object[data], embed[src], img[src]';
        const inspect = () => {
          if (creativeReported || !document.body?.querySelector(creativeSelector)) return;
          creativeReported = true;
          notify('creative');
        };

        const browserOpen = window.open.bind(window);
        const userActivatedOpen = (...args) => navigator.userActivation?.isActive === true
          ? browserOpen(...args)
          : null;
        try {
          Object.defineProperty(window, 'open', {
            configurable: false,
            writable: false,
            value: userActivatedOpen
          });
        } catch {
          window.open = userActivatedOpen;
        }

        addEventListener('click', event => {
          if (event.isTrusted) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, true);
        addEventListener('error', event => {
          if (event.target?.tagName === 'SCRIPT') notify('provider-error');
        }, true);

        const observer = new MutationObserver(inspect);
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        addEventListener('DOMContentLoaded', inspect, { once: true });
        const inspectionTimer = setInterval(inspect, 250);
        setTimeout(() => clearInterval(inspectionTimer), ${CONFIG.renderTimeoutMs});
      })();
    <\/script>`;

    return `<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="referrer" content="strict-origin-when-cross-origin">
          <style>
            html, body { width: ${unit.width}px; height: ${unit.height}px; margin: 0; padding: 0; overflow: hidden; background: transparent; }
            iframe, img, object, embed { display: block; max-width: 100%; border: 0; }
          </style>
        </head>
        <body>${bridge}${bannerMarkup(unit)}</body>
      </html>`;
  }

  function clearFrameRecord(slot) {
    const record = frameRecords.get(slot);
    if (!record) return;
    if (record.timeoutId) global.clearTimeout(record.timeoutId);
    recordsByToken.delete(record.token);
    frameRecords.delete(slot);
  }

  function finish(slot, state, removeCreative = false) {
    clearFrameRecord(slot);
    if (removeCreative) slot.querySelector('.ad-slot__content')?.replaceChildren();
    if (state !== 'loaded') delete slot.dataset.adCreative;
    slot.dataset.adState = state;
  }

  function armFillTimeout(slot) {
    const record = frameRecords.get(slot);
    if (!record || record.timeoutId || slot.dataset.adState !== 'loading') return;
    record.timeoutId = global.setTimeout(() => finish(slot, 'empty', true), CONFIG.renderTimeoutMs);
  }

  function createSandboxedFrame(unit, slot) {
    const frame = document.createElement('iframe');
    const token = frameToken();
    const record = { frame, slot, token, timeoutId: 0 };

    frame.className = 'ad-sandbox-frame';
    frame.title = 'Publicidad';
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('loading', 'eager');
    frame.dataset.adSandbox = 'isolated';
    frame.width = String(unit.width);
    frame.height = String(unit.height);
    frame.style.width = `${unit.width}px`;
    frame.style.height = `${unit.height}px`;
    frame.addEventListener('load', () => armFillTimeout(slot), { once: true });
    frame.addEventListener('error', () => finish(slot, 'error', true), { once: true });

    frameRecords.set(slot, record);
    recordsByToken.set(token, record);
    frame.srcdoc = sandboxDocument(unit, token);
    armFillTimeout(slot);
    return frame;
  }

  global.addEventListener('message', event => {
    const message = event.data;
    if (!message || message.type !== 'laqp-ad-status' || typeof message.token !== 'string') return;
    const record = recordsByToken.get(message.token);
    if (!record || event.source !== record.frame.contentWindow) return;

    if (message.status === 'creative') {
      record.slot.dataset.adCreative = 'true';
      finish(record.slot, 'loaded');
    } else if (message.status === 'provider-error') {
      finish(record.slot, 'error', true);
    }
  });

  function selectUnit(slot) {
    if (slot.dataset.adUnit !== 'responsive') return null;
    return safeAvailableWidth(slot) >= CONFIG.unit.width
      ? { name: 'desktop', unit: CONFIG.unit }
      : null;
  }

  function setState(slot, state) {
    slot.dataset.adState = state;
  }

  function render(slot) {
    if (!(slot instanceof Element) || !slot.matches('.ad-slot[data-ad-unit]')) return false;
    if (slot.dataset.adState && !['pending', 'consent-blocked', 'unsupported-width'].includes(slot.dataset.adState)) return false;

    if (!CONFIG.enabled) {
      setState(slot, 'disabled');
      return false;
    }
    if (!readConsent()) {
      setState(slot, 'consent-blocked');
      return false;
    }
    const selected = selectUnit(slot);
    if (!selected) {
      setState(slot, 'unsupported-width');
      return false;
    }
    if (renderedSlots.has(slot)) return false;

    renderedSlots.add(slot);
    slot.dataset.adVariant = selected.name;
    slot.dataset.adProvider = CONFIG.provider;
    slot.dataset.adKey = selected.unit.key;
    setState(slot, 'loading');

    try {
      const content = slot.querySelector('.ad-slot__content');
      if (!content) throw new Error('Contenedor publicitario ausente.');
      content.replaceChildren(createSandboxedFrame(selected.unit, slot));
      return true;
    } catch (error) {
      finish(slot, 'error', true);
      console.warn('[LAqP Ads] No se pudo montar la unidad publicitaria.', error);
      return false;
    }
  }

  function monitor(slot) {
    if (!(slot instanceof Element) || slot.dataset.adState !== 'loading') return;
    const frame = slot.querySelector('.ad-sandbox-frame');
    if (frame?.contentDocument?.readyState === 'complete') armFillTimeout(slot);
  }

  function monitorAll(root = document) {
    root.querySelectorAll?.('.ad-slot[data-ad-state="loading"]').forEach(monitor);
  }

  function renderAll(root = document) {
    root.querySelectorAll?.('.ad-slot[data-ad-unit]').forEach(slot => {
      if (!slot.dataset.adState || ['pending', 'consent-blocked', 'unsupported-width'].includes(slot.dataset.adState)) render(slot);
    });
  }

  function parkingArea() {
    let parking = document.getElementById('laqp-ad-parking');
    if (parking) return parking;
    parking = document.createElement('div');
    parking.id = 'laqp-ad-parking';
    parking.hidden = true;
    parking.setAttribute('aria-hidden', 'true');
    document.body.appendChild(parking);
    return parking;
  }

  function createSlot(placement, context = 'profile') {
    const slot = document.createElement('aside');
    slot.className = 'ad-slot';
    slot.setAttribute('aria-label', 'Publicidad');
    slot.dataset.adSlot = placement;
    slot.dataset.adUnit = 'responsive';
    slot.dataset.adFormat = 'responsive';
    slot.dataset.adContext = context;
    slot.dataset.adState = 'pending';
    slot.innerHTML = '<span class="ad-slot__label">Publicidad</span><div class="ad-slot__content"></div>';
    return slot;
  }

  function preserve(root) {
    if (!(root instanceof Element)) return;
    const parking = parkingArea();
    root.querySelectorAll('.ad-slot[data-ad-unit]').forEach(slot => parking.appendChild(slot));
  }

  function placeAll(root = document) {
    root.querySelectorAll?.('[data-ad-placement][data-ad-unit-target]').forEach(target => {
      const unitName = target.dataset.adUnitTarget;
      const placement = target.dataset.adPlacement;
      const slots = Array.from(document.querySelectorAll('.ad-slot[data-ad-unit]'));
      let slot = slots.find(candidate => candidate.dataset.adSlot === placement)
        || slots.find(candidate => candidate.dataset.adUnit === unitName && candidate.closest('#laqp-ad-parking'));
      if (!slot) {
        slot = createSlot(placement, target.closest('#layout') ? 'database' : 'profile');
        parkingArea().appendChild(slot);
        render(slot);
      }
      target.replaceChildren(slot);
      monitor(slot);
    });
  }

  function hasBlockedConsentSlots() {
    return Boolean(document.querySelector('.ad-slot[data-ad-state="consent-blocked"]'));
  }

  function removeAll() {
    renderedSlots.clear();
    document.querySelectorAll('.ad-slot[data-ad-unit]').forEach(slot => {
      clearFrameRecord(slot);
      slot.querySelector('.ad-slot__content')?.replaceChildren();
      delete slot.dataset.adCreative;
      setState(slot, 'consent-blocked');
    });
  }

  global.LAQPAds = Object.freeze({
    config: CONFIG,
    hasBlockedConsentSlots,
    monitorAll,
    placeAll,
    preserve,
    render,
    renderAll,
    removeAll,
  });

  document.addEventListener('laqp:consentchange', event => {
    if (event.detail?.ads === true) {
      renderAll(document);
      placeAll(document);
      monitorAll(document);
    } else {
      removeAll();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    renderAll(document);
    monitorAll(document);
    global.setTimeout(() => {
      if (!document.documentElement.classList.contains('laqp-hydrated')) placeAll(document);
    }, 6200);
  });
}(window));
