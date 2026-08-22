'use strict';

(function initLAQPAds(global) {
  const CONFIG = Object.freeze({
    enabled: true,
    requireAdConsent: true,
    provider: 'adsterra',
    consentStorageKey: 'laqp_cookie_consent_v1',
    renderTimeoutMs: 10000,
    units: Object.freeze({
      native: Object.freeze({
        format: 'native',
        key: '597f4baefd789b5a554a76a03af8bc9b',
        src: 'https://pl30976527.profitableratecpmnetwork.com/597f4baefd789b5a554a76a03af8bc9b/invoke.js',
      }),
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
      rectangle: Object.freeze({
        format: 'iframe',
        key: 'd7f6b2bd0a3bdbc016d2bcff231bd9bd',
        width: 300,
        height: 250,
        src: 'https://www.highrevenueformat.com/d7f6b2bd0a3bdbc016d2bcff231bd9bd/invoke.js',
      }),
    }),
  });

  const renderedUnits = new Set();
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

  function nativeMarkup(unit) {
    return [
      `<script async="async" data-cfasync="false" src="${unit.src}"><\/script>`,
      `<div id="container-${unit.key}"><\/div>`,
    ].join('\n');
  }

  function selectUnit(slot) {
    const requested = slot.dataset.adUnit;
    if (requested === 'responsive') {
      const available = safeAvailableWidth(slot);
      if (available >= CONFIG.units.desktop.width) return { name: 'desktop', unit: CONFIG.units.desktop };
      if (available >= CONFIG.units.mobile.width) return { name: 'mobile', unit: CONFIG.units.mobile };
      return null;
    }
    const unit = CONFIG.units[requested];
    if (!unit) return null;
    if (unit.width && safeAvailableWidth(slot) < unit.width) return null;
    return { name: requested, unit };
  }

  function setState(slot, state) {
    slot.dataset.adState = state;
  }

  function render(slot) {
    if (!(slot instanceof Element) || !slot.matches('.ad-slot[data-ad-unit]')) return false;
    if (slot.dataset.adState && slot.dataset.adState !== 'pending') return false;

    if (!CONFIG.enabled) {
      setState(slot, 'disabled');
      return false;
    }
    if (!readConsent()) {
      setState(slot, 'consent-blocked');
      return false;
    }
    if (document.readyState !== 'loading') {
      setState(slot, 'unsafe-late-render');
      return false;
    }

    const selected = selectUnit(slot);
    if (!selected) {
      setState(slot, 'unsupported-width');
      return false;
    }

    const uniquenessKey = slot.dataset.adUnit === 'responsive' ? 'responsive' : selected.name;
    if (renderedUnits.has(uniquenessKey)) {
      setState(slot, 'duplicate-blocked');
      return false;
    }

    renderedUnits.add(uniquenessKey);
    slot.dataset.adVariant = selected.name;
    slot.dataset.adProvider = CONFIG.provider;
    slot.dataset.adKey = selected.unit.key;
    setState(slot, 'loading');

    try {
      document.write(selected.name === 'native' ? nativeMarkup(selected.unit) : bannerMarkup(selected.unit));
      return true;
    } catch (error) {
      setState(slot, 'error');
      console.warn('[LAqP Ads] No se pudo montar la unidad publicitaria.', error);
      return false;
    }
  }

  function creativeExists(slot) {
    if (slot.querySelector('iframe, object, embed, video')) return true;
    if (slot.querySelector('.ad-slot__content > a[href], .ad-slot__content img')) return true;
    const nativeContainer = slot.querySelector('[id^="container-"]');
    return Boolean(nativeContainer && (nativeContainer.children.length || nativeContainer.textContent.trim()));
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
      const slot = document.querySelector(`.ad-slot[data-ad-unit="${unitName}"]`);
      if (!slot) return;
      slot.dataset.adSlot = target.dataset.adPlacement;
      target.replaceChildren(slot);
      monitor(slot);
    });
  }

  function hasBlockedConsentSlots() {
    return Boolean(document.querySelector('.ad-slot[data-ad-state="consent-blocked"]'));
  }

  global.LAQPAds = Object.freeze({
    config: CONFIG,
    hasBlockedConsentSlots,
    monitorAll,
    placeAll,
    preserve,
    render,
  });

  document.addEventListener('DOMContentLoaded', () => {
    monitorAll(document);
    global.setTimeout(() => {
      if (!document.documentElement.classList.contains('laqp-hydrated')) placeAll(document);
    }, 6200);
  });
}(window));
