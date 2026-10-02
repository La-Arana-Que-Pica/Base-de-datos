'use strict';

(function initLAQPAds(global) {
  const CONFIG = Object.freeze({
    enabled: true,
    requireAdConsent: true,
    provider: 'adsterra',
    consentStorageKey: 'laqp_cookie_consent_v1',
    renderTimeoutMs: 10000,
    units: Object.freeze({
      responsive: Object.freeze({
        desktop: Object.freeze({
          format: 'iframe', key: '8a3fb93caf85fe0ba7fb51f68738589f', width: 728, height: 90,
          src: 'https://www.highrevenueformat.com/8a3fb93caf85fe0ba7fb51f68738589f/invoke.js',
        }),
        mobile: Object.freeze({
          format: 'iframe', key: 'b1c24022cb90c506d235026f3c56738b', width: 320, height: 50,
          src: 'https://mittengulped.com/b1c24022cb90c506d235026f3c56738b/invoke.js',
        }),
      }),
      native: Object.freeze({
        format: 'native', key: '597f4baefd789b5a554a76a03af8bc9b',
        containerId: 'container-597f4baefd789b5a554a76a03af8bc9b', width: 728, height: 180,
        minWidth: 280, maxHeight: 600,
        src: 'https://mittengulped.com/597f4baefd789b5a554a76a03af8bc9b/invoke.js',
      }),
      rectangle: Object.freeze({
        format: 'iframe', key: 'd7f6b2bd0a3bdbc016d2bcff231bd9bd', width: 300, height: 250,
        src: 'https://mittengulped.com/d7f6b2bd0a3bdbc016d2bcff231bd9bd/invoke.js',
      }),
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
    if (slot.dataset.adContext === 'database' && viewport > 768) return Math.max(0, viewport - 220 - 48);
    const gutter = slot.dataset.adContext === 'profile' && viewport > 768 ? 64 : 32;
    return Math.max(0, viewport - gutter);
  }

  function frameToken() {
    frameSequence += 1;
    return `laqp-ad-${Date.now().toString(36)}-${frameSequence.toString(36)}`;
  }

  function bannerMarkup(unit) {
    return ['<script>', 'atOptions = {', `  'key' : '${unit.key}',`, "  'format' : 'iframe',",
      `  'height' : ${unit.height},`, `  'width' : ${unit.width},`, "  'params' : {}", '};',
      '<\/script>', `<script src="${unit.src}"><\/script>`].join('\n');
  }

  function nativeMarkup(unit) {
    return `<script async="async" data-cfasync="false" src="${unit.src}"><\/script><div id="${unit.containerId}"></div>`;
  }

  function sandboxDocument(unit, token) {
    const selector = unit.format === 'native'
      ? `#${unit.containerId} > *, iframe[src]:not([src="about:blank"]), object[data], embed[src], img[src]`
      : 'iframe[src]:not([src="about:blank"]), object[data], embed[src], img[src]';
    const bridge = `<script>
      (() => {
        const token = ${JSON.stringify(token)};
        const nativeUnit = ${unit.format === 'native'};
        const maxHeight = ${unit.maxHeight || unit.height};
        let creativeReported = false;
        const notify = (status, height) => parent.postMessage({ type: 'laqp-ad-status', token, status, height }, '*');
        const measuredHeight = () => Math.min(maxHeight, Math.max(1, Math.ceil(Math.max(
          document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0
        ))));
        const inspect = () => {
          if (!document.body?.querySelector(${JSON.stringify(selector)})) return;
          const height = nativeUnit ? measuredHeight() : ${unit.height};
          if (!creativeReported) {
            creativeReported = true;
            notify('creative', height);
          } else if (nativeUnit) notify('resize', height);
        };
        addEventListener('error', event => {
          if (event.target?.tagName === 'SCRIPT') notify('provider-error');
        }, true);
        const observer = new MutationObserver(inspect);
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        addEventListener('DOMContentLoaded', inspect, { once: true });
        if (nativeUnit && 'ResizeObserver' in window) new ResizeObserver(inspect).observe(document.documentElement);
        const inspectionTimer = setInterval(inspect, 250);
        setTimeout(() => clearInterval(inspectionTimer), ${CONFIG.renderTimeoutMs});
      })();
    <\/script>`;
    const dimensions = unit.format === 'native'
      ? `html, body { width: ${unit.width}px; min-height: 1px; } #${unit.containerId} { width: 100%; }`
      : `html, body { width: ${unit.width}px; height: ${unit.height}px; }`;
    const markup = unit.format === 'native' ? nativeMarkup(unit) : bannerMarkup(unit);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin"><style>
      html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
      ${dimensions}
      iframe, img, object, embed { display: block; max-width: 100%; border: 0; }
      </style></head><body>${bridge}${markup}</body></html>`;
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

  function resizeFrame(record, height) {
    if (record.unit.format !== 'native' || !Number.isFinite(Number(height))) return;
    const nextHeight = Math.min(record.unit.maxHeight, Math.max(1, Math.ceil(Number(height))));
    record.frame.height = String(nextHeight);
    record.frame.style.height = `${nextHeight}px`;
  }

  function markLoaded(record, height) {
    if (record.timeoutId) global.clearTimeout(record.timeoutId);
    record.timeoutId = 0;
    record.loaded = true;
    record.slot.dataset.adCreative = 'true';
    record.slot.dataset.adState = 'loaded';
    resizeFrame(record, height);
  }

  function armFillTimeout(slot) {
    const record = frameRecords.get(slot);
    if (!record || record.timeoutId || record.loaded || slot.dataset.adState !== 'loading') return;
    record.timeoutId = global.setTimeout(() => finish(slot, 'empty', true), CONFIG.renderTimeoutMs);
  }

  function createSandboxedFrame(unit, slot) {
    const frame = document.createElement('iframe');
    const token = frameToken();
    const record = { frame, slot, token, unit, timeoutId: 0, loaded: false };
    frame.className = 'ad-sandbox-frame';
    frame.title = 'Publicidad';
    frame.setAttribute('sandbox', 'allow-scripts allow-popups');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('loading', 'eager');
    frame.dataset.adSandbox = 'isolated';
    frame.width = String(unit.width);
    frame.height = String(unit.height);
    frame.style.width = `${unit.width}px`;
    frame.style.height = `${unit.height}px`;
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
    if (message.status === 'creative') markLoaded(record, message.height);
    else if (message.status === 'resize' && record.loaded) resizeFrame(record, message.height);
    else if (message.status === 'provider-error' && !record.loaded) finish(record.slot, 'error', true);
  });

  function selectUnit(slot) {
    const availableWidth = safeAvailableWidth(slot);
    if (slot.dataset.adUnit === 'responsive') {
      if (availableWidth >= CONFIG.units.responsive.desktop.width) return { name: 'desktop', unit: CONFIG.units.responsive.desktop };
      if (availableWidth >= CONFIG.units.responsive.mobile.width) return { name: 'mobile', unit: CONFIG.units.responsive.mobile };
      return null;
    }
    if (slot.dataset.adUnit === 'native') {
      if (availableWidth < CONFIG.units.native.minWidth) return null;
      return { name: 'native', unit: { ...CONFIG.units.native, width: Math.min(CONFIG.units.native.width, availableWidth) } };
    }
    if (slot.dataset.adUnit === 'rectangle') {
      return availableWidth >= CONFIG.units.rectangle.width ? { name: 'rectangle', unit: CONFIG.units.rectangle } : null;
    }
    return null;
  }

  function expectedUnit(placement) {
    if (placement?.endsWith('-top')) return 'responsive';
    if (placement?.endsWith('-mid')) return 'native';
    if (placement?.endsWith('-bottom')) return 'rectangle';
    return 'responsive';
  }

  function normalizePageSlots() {
    document.querySelectorAll('[data-ad-placement="player-stats"], [data-ad-slot="player-stats"]').forEach(node => node.remove());
    document.querySelectorAll('[data-ad-placement][data-ad-unit-target]').forEach(target => {
      target.dataset.adUnitTarget = expectedUnit(target.dataset.adPlacement);
    });
    document.querySelectorAll('.ad-slot[data-ad-slot]').forEach(slot => {
      const unitName = expectedUnit(slot.dataset.adSlot);
      slot.dataset.adUnit = unitName;
      slot.dataset.adFormat = unitName;
    });
  }

  function render(slot) {
    if (!(slot instanceof Element) || !slot.matches('.ad-slot[data-ad-unit]')) return false;
    const unitName = expectedUnit(slot.dataset.adSlot);
    slot.dataset.adUnit = unitName;
    slot.dataset.adFormat = unitName;
    if (slot.dataset.adState && !['pending', 'consent-blocked', 'unsupported-width'].includes(slot.dataset.adState)) return false;
    if (!CONFIG.enabled) { slot.dataset.adState = 'disabled'; return false; }
    if (!readConsent()) { slot.dataset.adState = 'consent-blocked'; return false; }
    const selected = selectUnit(slot);
    if (!selected) { slot.dataset.adState = 'unsupported-width'; return false; }
    if (renderedSlots.has(slot)) return false;
    renderedSlots.add(slot);
    slot.dataset.adVariant = selected.name;
    slot.dataset.adProvider = CONFIG.provider;
    slot.dataset.adKey = selected.unit.key;
    slot.dataset.adState = 'loading';
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

  function monitorAll(root = document) {
    root.querySelectorAll?.('.ad-slot[data-ad-state="loading"]').forEach(armFillTimeout);
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

  function createSlot(placement, unitName, context = 'profile') {
    const slot = document.createElement('aside');
    slot.className = 'ad-slot';
    slot.setAttribute('aria-label', 'Publicidad');
    slot.dataset.adSlot = placement;
    slot.dataset.adUnit = unitName;
    slot.dataset.adFormat = unitName;
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
        slot = createSlot(placement, unitName, target.closest('#layout') ? 'database' : 'profile');
        parkingArea().appendChild(slot);
        render(slot);
      }
      target.replaceChildren(slot);
      armFillTimeout(slot);
    });
  }

  function hasBlockedConsentSlots() { return Boolean(document.querySelector('.ad-slot[data-ad-state="consent-blocked"]')); }

  function removeAll() {
    renderedSlots.clear();
    document.querySelectorAll('.ad-slot[data-ad-unit]').forEach(slot => {
      clearFrameRecord(slot);
      slot.querySelector('.ad-slot__content')?.replaceChildren();
      delete slot.dataset.adCreative;
      slot.dataset.adState = 'consent-blocked';
    });
  }

  global.LAQPAds = Object.freeze({ config: CONFIG, hasBlockedConsentSlots, monitorAll, placeAll, preserve, render, renderAll, removeAll });

  document.addEventListener('laqp:consentchange', event => {
    if (event.detail?.ads === true) {
      normalizePageSlots();
      renderAll(document);
      placeAll(document);
      monitorAll(document);
    } else removeAll();
  });

  document.addEventListener('DOMContentLoaded', () => {
    normalizePageSlots();
    renderAll(document);
    monitorAll(document);
    global.setTimeout(() => {
      if (!document.documentElement.classList.contains('laqp-hydrated')) placeAll(document);
    }, 6200);
  });
}(window));
