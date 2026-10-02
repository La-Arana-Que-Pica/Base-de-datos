'use strict';

(function initLAQPAds(global) {
  const CONFIG = Object.freeze({
    enabled: true,
    requireAdConsent: true,
    provider: 'adsterra',
    consentStorageKey: 'laqp_cookie_consent_v1',
    renderTimeoutMs: 10000,
    units: Object.freeze({
      desktop: Object.freeze({
        format: 'iframe',
        key: '8a3fb93caf85fe0ba7fb51f68738589f',
        width: 728,
        height: 90,
        src: 'https://www.highrevenueformat.com/8a3fb93caf85fe0ba7fb51f68738589f/invoke.js',
      }),
      mobile: Object.freeze({
        format: 'iframe',
        key: 'b1c24022cb90c506d235026f3c56738b',
        width: 320,
        height: 50,
        src: 'https://www.highrevenueformat.com/b1c24022cb90c506d235026f3c56738b/invoke.js',
      }),
    }),
  });

  const renderedSlots = new Set();
  const observers = new WeakMap();

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
    if (!slot.closest('.ad-bootstrap') && measured >= 320) return measured;

    const viewport = Math.floor(document.documentElement.clientWidth || global.innerWidth || 0);
    if (slot.dataset.adContext === 'database' && viewport > 768) {
      return Math.max(0, viewport - 220 - 48);
    }
    const gutter = slot.dataset.adContext === 'profile' && viewport > 768 ? 64 : 32;
    return Math.max(0, viewport - gutter);
  }

  function bannerMarkup(unit) {
    return [
      '<script>',
      'window.atOptions = {',
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

  function sandboxDocument(unit) {
    const markup = bannerMarkup(unit);
    const compatibilityBridge = `<script>
      (() => {
        const memory = new Map();
        const storage = Object.freeze({
          get length() { return memory.size; },
          clear() { memory.clear(); },
          getItem(key) { return memory.has(String(key)) ? memory.get(String(key)) : null; },
          key(index) { return [...memory.keys()][Number(index)] || null; },
          removeItem(key) { memory.delete(String(key)); },
          setItem(key, value) { memory.set(String(key), String(value)); }
        });

        try {
          Object.defineProperty(document, 'cookie', {
            configurable: false,
            get: () => '',
            set: () => true
          });
        } catch {}
        for (const name of ['localStorage', 'sessionStorage']) {
          try {
            Object.defineProperty(window, name, {
              configurable: false,
              get: () => storage
            });
          } catch {}
        }

        const browserOpen = window.open.bind(window);
        const userActivatedOpen = (...args) => navigator.userActivation?.isActive
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
      })();
    <\/script>`;
    return `<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="referrer" content="strict-origin-when-cross-origin">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src https: data:; frame-src https:; connect-src https:; media-src https: blob:; font-src https: data:; base-uri 'none'; form-action 'none'">
          <style>
            html, body { width: 100%; margin: 0; padding: 0; overflow: hidden; background: transparent; }
            body { min-height: 1px; text-align: center; }
            iframe, img, object, embed { max-width: 100%; border: 0; }
          </style>
        </head>
        <body>${compatibilityBridge}${markup}</body>
      </html>`;
  }

  function createSandboxedFrame(unit, slot) {
    const frame = document.createElement('iframe');

    frame.className = 'ad-sandbox-frame';
    frame.title = 'Publicidad';
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('loading', slot.dataset.adPriority === 'high' ? 'eager' : 'lazy');
    frame.dataset.adSandbox = 'isolated';
    frame.width = String(unit.width);
    frame.height = String(unit.height);
    frame.style.width = `${unit.width}px`;
    frame.style.height = `${unit.height}px`;
    frame.addEventListener('load', () => {
      if (slot.dataset.adState === 'loading') setState(slot, 'loaded');
    }, { once: true });
    frame.addEventListener('error', () => setState(slot, 'error'), { once: true });
    frame.srcdoc = sandboxDocument(unit);
    return frame;
  }

  function selectUnit(slot) {
    if (slot.dataset.adUnit !== 'responsive') return null;
    const available = safeAvailableWidth(slot);
    if (available >= CONFIG.units.desktop.width) return { name: 'desktop', unit: CONFIG.units.desktop };
    if (available >= CONFIG.units.mobile.width) return { name: 'mobile', unit: CONFIG.units.mobile };
    return null;
  }

  function setState(slot, state) {
    slot.dataset.adState = state;
  }

  function render(slot) {
    if (!(slot instanceof Element) || !slot.matches('.ad-slot[data-ad-unit]')) return false;
    if (slot.dataset.adState && !['pending', 'consent-blocked'].includes(slot.dataset.adState)) return false;

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
      setState(slot, 'error');
      console.warn('[LAqP Ads] No se pudo montar la unidad publicitaria.', error);
      return false;
    }
  }

  function creativeExists(slot) {
    if (slot.querySelector('.ad-sandbox-frame')) return true;
    if (slot.querySelector('.ad-slot__content > a[href], .ad-slot__content img')) return true;
    return false;
  }

  function monitor(slot) {
    if (!(slot instanceof Element) || slot.dataset.adState !== 'loading' || observers.has(slot)) return;

    const finish = state => {
      const record = observers.get(slot);
      if (record) {
        record.observer.disconnect();
        global.clearTimeout(record.timeoutId);
        observers.delete(slot);
      }
      setState(slot, state);
    };

    if (creativeExists(slot)) {
      finish('loaded');
      return;
    }

    const observer = new MutationObserver(() => {
      if (creativeExists(slot)) finish('loaded');
    });
    observer.observe(slot.querySelector('.ad-slot__content') || slot, { childList: true, subtree: true });
    const timeoutId = global.setTimeout(() => finish(creativeExists(slot) ? 'loaded' : 'empty'), CONFIG.renderTimeoutMs);
    observers.set(slot, { observer, timeoutId });
  }

  function monitorAll(root = document) {
    root.querySelectorAll?.('.ad-slot[data-ad-state="loading"]').forEach(monitor);
  }

  function renderAll(root = document) {
    root.querySelectorAll?.('.ad-slot[data-ad-unit]').forEach(slot => {
      if (!slot.dataset.adState || ['pending', 'consent-blocked'].includes(slot.dataset.adState)) render(slot);
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
      const slot = slots.find(candidate => candidate.dataset.adSlot === placement)
        || slots.find(candidate => candidate.dataset.adUnit === unitName && candidate.closest('#laqp-ad-parking'));
      if (!slot) return;
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
      const record = observers.get(slot);
      if (record) {
        record.observer.disconnect();
        global.clearTimeout(record.timeoutId);
        observers.delete(slot);
      }
      slot.querySelector('.ad-slot__content')?.replaceChildren();
      setState(slot, 'consent-blocked');
    });
  }

  document.addEventListener('laqp:consentchange', event => {
    if (event.detail?.ads === true) {
      renderAll(document);
      placeAll(document);
      monitorAll(document);
    } else {
      removeAll();
    }
  });

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

  document.addEventListener('DOMContentLoaded', () => {
    renderAll(document);
    monitorAll(document);
    global.setTimeout(() => {
      if (!document.documentElement.classList.contains('laqp-hydrated')) placeAll(document);
    }, 6200);
  });
}(window));
