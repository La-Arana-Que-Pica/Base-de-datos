'use strict';

(function initMinifaceSwitcher() {
  const STORAGE_KEY = 'minifaceMode';
  const CURRENT_MODE = 'current';
  const PES_2018_MODE = 'pes2018';
  const DEFAULT_IMAGE = 'img/players/default.webp';
  const PLAYER_IMAGE_RE = /(?:^|\/)img\/(?:players|pes_original_minifaces)\/(\d+)\.webp(?:[?#].*)?$/i;

  function readMode() {
    try {
      return localStorage.getItem(STORAGE_KEY) === PES_2018_MODE ? PES_2018_MODE : CURRENT_MODE;
    } catch (_error) {
      return CURRENT_MODE;
    }
  }

  let mode = readMode();

  function playerIdFromImage(image) {
    const explicitId = String(image.dataset.playerId || '').trim();
    if (/^\d+$/.test(explicitId)) return explicitId;

    const source = image.getAttribute('src') || '';
    const match = source.match(PLAYER_IMAGE_RE);
    return match ? match[1] : '';
  }

  function currentSource(image, playerId) {
    if (image.dataset.minifaceCurrentSrc) return image.dataset.minifaceCurrentSrc;

    const source = image.getAttribute('src') || '';
    const isPesOriginal = /(?:^|\/)img\/pes_original_minifaces\//i.test(source);
    const resolved = source && !isPesOriginal ? source : `img/players/${encodeURIComponent(playerId)}.webp`;
    image.dataset.minifaceCurrentSrc = resolved;
    return resolved;
  }

  function setImageSource(image, source, stage) {
    image.dataset.minifaceStage = stage;
    if (image.getAttribute('src') !== source) image.setAttribute('src', source);
  }

  function applyToImage(image, force) {
    if (!(image instanceof HTMLImageElement)) return;

    const playerId = playerIdFromImage(image);
    if (!playerId) return;
    if (!force && image.dataset.minifaceAppliedMode === mode) return;

    image.dataset.playerId = playerId;
    image.dataset.miniface = 'player';
    image.onerror = null;

    const current = currentSource(image, playerId);
    image.dataset.minifaceAppliedMode = mode;
    const original = image.dataset.minifacePesSrc;
    if (mode === PES_2018_MODE) {
      setImageSource(image, original === '' ? DEFAULT_IMAGE : (original || `img/pes_original_minifaces/${encodeURIComponent(playerId)}.webp`), original === '' ? 'default' : PES_2018_MODE);
    } else {
      setImageSource(image, current, CURRENT_MODE);
    }

    if (image.complete && image.naturalWidth === 0) handleImageError(image);
  }

  function applyToTree(root, force) {
    if (!root) return;
    if (root instanceof HTMLImageElement) applyToImage(root, force);
    if (root.querySelectorAll) root.querySelectorAll('img').forEach(image => applyToImage(image, force));
  }

  function handleImageError(image) {
    if (!(image instanceof HTMLImageElement) || image.dataset.miniface !== 'player') return;

    const stage = image.dataset.minifaceStage;
    if (stage === PES_2018_MODE) {
      setImageSource(image, DEFAULT_IMAGE, 'default');
      return;
    }
    const current = image.dataset.minifaceCurrentSrc || DEFAULT_IMAGE;

    if (stage === CURRENT_MODE && current !== DEFAULT_IMAGE) {
      setImageSource(image, DEFAULT_IMAGE, 'default');
      return;
    }

    image.dataset.minifaceStage = 'default';
  }

  function updateControls() {
    document.querySelectorAll('[data-miniface-mode]').forEach(button => {
      const active = button.dataset.minifaceMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setMode(nextMode) {
    mode = nextMode === PES_2018_MODE ? PES_2018_MODE : CURRENT_MODE;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_error) {
      // The switch still works for this page when storage is unavailable.
    }
    applyToTree(document, true);
    updateControls();
    document.dispatchEvent(new CustomEvent('laqp:miniface-mode-change', { detail: { mode } }));
  }

  function isDatabasePage() {
    if (document.querySelector('meta[name="laqp-player-id"], meta[name="laqp-team-id"], meta[name="laqp-league-id"], meta[name="laqp-database-view"]')) return true;
    if (document.querySelector('#player-page, #team-page, #league-page, #layout #main')) return true;
    return /(?:^|\/)(?:database(?:\.html|\/)|player(?:\.html|\/)|team(?:\.html|\/)|league(?:\.html|\/))/i.test(window.location.pathname);
  }

  function renderControl() {
    if (!isDatabasePage() || document.querySelector('.miniface-mode-control')) return;
    if (typeof window.i18nPageSupportsTranslations === 'function' && !window.i18nPageSupportsTranslations()) return;

    const translate = (key, fallback) => typeof window.t === 'function' ? (window.t(key) || fallback) : fallback;

    const host = document.querySelector('[data-miniface-control-host]') || document.querySelector('#main, #player-page, #team-page, #league-page');
    if (!host) return;

    const control = document.createElement('div');
    control.className = 'miniface-mode-control';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', translate('minifaces.aria', 'Seleccionar estilo de minifaces'));
    control.innerHTML = `
      <span class="miniface-mode-label">${translate('minifaces.label', 'Minifaces:')}</span>
      <button type="button" data-miniface-mode="${CURRENT_MODE}">${translate('minifaces.current', 'Actuales')}</button>
      <span class="miniface-mode-separator" aria-hidden="true">|</span>
      <button type="button" data-miniface-mode="${PES_2018_MODE}">${translate('minifaces.pes2018', 'PES 2018')}</button>`;
    control.addEventListener('click', event => {
      const button = event.target.closest('[data-miniface-mode]');
      if (button) setMode(button.dataset.minifaceMode);
    });
    host.prepend(control);
    updateControls();
  }

  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.miniface !== 'player') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleImageError(image);
  }, true);

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) applyToTree(node, false);
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('DOMContentLoaded', () => {
    applyToTree(document, false);
    renderControl();
  });

  window.LAQPMinifaces = {
    getMode: () => mode,
    setMode,
    refresh: root => applyToTree(root || document, true),
    sourceFor(playerId, requestedMode) {
      const safeId = encodeURIComponent(String(playerId || '').trim());
      return requestedMode === PES_2018_MODE
        ? `img/pes_original_minifaces/${safeId}.webp`
        : `img/players/${safeId}.webp`;
    },
  };
})();
