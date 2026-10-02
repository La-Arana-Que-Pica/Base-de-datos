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
        desktop: Object.freeze([
          Object.freeze({
            format: 'iframe', key: '8a3fb93caf85fe0ba7fb51f68738589f', width: 728, height: 90,
            src: 'https://mittengulped.com/8a3fb93caf85fe0ba7fb51f68738589f/invoke.js',
          }),
          Object.freeze({
            format: 'iframe', key: '773a61a788f6eb62ac193612dd67ce6d', width: 728, height: 90,
            src: 'https://mittengulped.com/773a61a788f6eb62ac193612dd67ce6d/invoke.js',
          }),
          Object.freeze({
            format: 'iframe', key: 'f6c2dfca11f920a6f33d547a57042ebd', width: 728, height: 90,
            src: 'https://mittengulped.com/f6c2dfca11f920a6f33d547a57042ebd/invoke.js',
          }),
          Object.freeze({
            format: 'iframe', key: '15f06f812a82d88a666136d4084cdcc7', width: 728, height: 90,
            src: 'https://mittengulped.com/15f06f812a82d88a666136d4084cdcc7/invoke.js',
          }),
        ]),
        mobile: Object.freeze({
          format: 'iframe', key: 'b1c24022cb90c506d235026f3c56738b', width: 320, height: 50,
          src: 'https://mittengulped.com/b1c24022cb90c506d235026f3c56738b/invoke.js',
        }),
      }),
      native: Object.freeze({
        format: 'native', key: '597f4baefd789b5a554a76a03af8bc9b',
        containerId: 'container-597f4baefd789b5a554a76a03af8bc9b', width: 728, height: 180,
        minWidth: 280,
        src: 'https://mittengulped.com/597f4baefd789b5a554a76a03af8bc9b/invoke.js',
      }),
      rectangle: Object.freeze({
        format: 'iframe', key: 'd7f6b2bd0a3bdbc016d2bcff231bd9bd', width: 300, height: 250,
        src: 'https://mittengulped.com/d7f6b2bd0a3bdbc016d2bcff231bd9bd/invoke.js',
      }),
    }),
  });

  const renderedSlots = new Set();
  const slotRecords = new WeakMap();
  const desktopAssignments = new WeakMap();
  let desktopSequence = 0;
  let providerQueue = Promise.resolve();

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

  function desktopUnitFor(slot) {
    let unit = desktopAssignments.get(slot);
    if (unit) return unit;
    const units = CONFIG.units.responsive.desktop;
    unit = units[desktopSequence % units.length];
    desktopSequence += 1;
    desktopAssignments.set(slot, unit);
    return unit;
  }

  function selectUnit(slot) {
    const availableWidth = safeAvailableWidth(slot);
    if (slot.dataset.adUnit === 'responsive') {
      const desktop = CONFIG.units.responsive.desktop[0];
      if (availableWidth >= desktop.width) return { name: 'desktop', unit: desktopUnitFor(slot) };
      if (availableWidth >= CONFIG.units.responsive.mobile.width) return { name: 'mobile', unit: CONFIG.units.responsive.mobile };
      return null;
    }
    if (slot.dataset.adUnit === 'native') {
      if (availableWidth < CONFIG.units.native.minWidth) return null;
      return { name: 'native', unit: CONFIG.units.native };
    }
    if (slot.dataset.adUnit === 'rectangle') {
      return availableWidth >= CONFIG.units.rectangle.width ? { name: 'rectangle', unit: CONFIG.units.rectangle } : null;
    }
    return null;
  }

  function clearRecord(slot) {
    const record = slotRecords.get(slot);
    if (!record) return;
    if (record.timeoutId) global.clearTimeout(record.timeoutId);
    if (record.pollId) global.clearInterval(record.pollId);
    record.observer?.disconnect();
    slotRecords.delete(slot);
  }

  function finish(slot, state, removeCreative = false) {
    clearRecord(slot);
    if (removeCreative) slot.querySelector('.ad-slot__content')?.replaceChildren();
    if (state !== 'loaded') delete slot.dataset.adCreative;
    slot.dataset.adState = state;
  }

  function frameContainsCreative(frame) {
    try {
      const body = frame.contentDocument?.body;
      if (!body) return false;
      return body.childElementCount > 0 || Boolean(body.textContent?.trim());
    } catch {
      return true;
    }
  }

  function containsCreative(record) {
    const content = record.slot.querySelector('.ad-slot__content');
    if (!content) return false;
    for (const frame of content.querySelectorAll('iframe')) {
      if (frameContainsCreative(frame)) return true;
    }
    if (content.querySelector('object[data], embed[src], img[src]')) return true;
    if (record.unit.format === 'native') {
      const container = content.querySelector(`#${record.unit.containerId}`);
      return Boolean(container?.childElementCount || container?.textContent?.trim());
    }
    return false;
  }

  function markLoaded(record) {
    if (record.slot.dataset.adState !== 'loading' || !containsCreative(record)) return false;
    record.slot.dataset.adCreative = 'true';
    record.slot.dataset.adState = 'loaded';
    clearRecord(record.slot);
    return true;
  }

  function inspectSlot(slot) {
    const record = slotRecords.get(slot);
    if (record) markLoaded(record);
  }

  function monitorDirectCreative(record) {
    record.observer = new MutationObserver(() => markLoaded(record));
    record.observer.observe(record.slot, { childList: true, subtree: true, attributes: true });
    record.pollId = global.setInterval(() => markLoaded(record), 250);
    record.timeoutId = global.setTimeout(() => {
      if (!markLoaded(record)) finish(record.slot, 'empty', true);
    }, CONFIG.renderTimeoutMs);
  }

  function appendConfiguration(content, unit) {
    const config = document.createElement('script');
    config.dataset.adsterraConfig = unit.key;
    config.textContent = `window.atOptions = ${JSON.stringify({
      key: unit.key,
      format: 'iframe',
      height: unit.height,
      width: unit.width,
      params: {},
    })};`;
    content.appendChild(config);
  }

  function appendProviderScript(content, unit) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = unit.src;
      script.async = false;
      script.dataset.adsterraUnit = unit.key;
      if (unit.format === 'native') {
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
      }
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${unit.src}`)), { once: true });
      content.appendChild(script);
    });
  }

  async function loadDirect(record) {
    const { slot, unit } = record;
    if (slotRecords.get(slot) !== record || slot.dataset.adState !== 'loading' || !readConsent()) return;
    const content = slot.querySelector('.ad-slot__content');
    if (!content) throw new Error('Contenedor publicitario ausente.');
    content.replaceChildren();
    if (unit.format === 'native') {
      const container = document.createElement('div');
      container.id = unit.containerId;
      content.appendChild(container);
    } else appendConfiguration(content, unit);
    await appendProviderScript(content, unit);
    inspectSlot(slot);
  }

  function enqueue(record) {
    providerQueue = providerQueue
      .then(() => loadDirect(record))
      .catch(error => {
        if (slotRecords.get(record.slot) === record) finish(record.slot, 'error', true);
        console.warn('[LAqP Ads] No se pudo cargar la unidad publicitaria.', error);
      });
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
    const content = slot.querySelector('.ad-slot__content');
    if (!content) { slot.dataset.adState = 'error'; return false; }

    renderedSlots.add(slot);
    slot.dataset.adVariant = selected.name;
    slot.dataset.adProvider = CONFIG.provider;
    slot.dataset.adKey = selected.unit.key;
    slot.dataset.adState = 'loading';
    const record = { slot, unit: selected.unit, observer: null, pollId: 0, timeoutId: 0 };
    slotRecords.set(slot, record);
    monitorDirectCreative(record);
    enqueue(record);
    return true;
  }

  function monitorAll(root = document) {
    root.querySelectorAll?.('.ad-slot[data-ad-state="loading"]').forEach(inspectSlot);
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
      inspectSlot(slot);
    });
  }

  function hasBlockedConsentSlots() { return Boolean(document.querySelector('.ad-slot[data-ad-state="consent-blocked"]')); }

  function removeAll() {
    renderedSlots.clear();
    document.querySelectorAll('.ad-slot[data-ad-unit]').forEach(slot => {
      clearRecord(slot);
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
