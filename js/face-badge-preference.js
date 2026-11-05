/* A local display preference; face authorship and filtering remain unchanged. */
(function () {
  'use strict';
  const key = 'laqp.showFaceBadges';
  function readPreference() {
    try { return localStorage.getItem(key) !== 'false'; }
    catch { return true; }
  }
  let visible = readPreference();
  let control;
  let scheduled = false;
  function apply() {
    document.documentElement.dataset.faceBadges = visible ? 'visible' : 'hidden';
    if (control) control.querySelector('input').checked = visible;
  }
  function setVisible(value) {
    visible = Boolean(value);
    try { localStorage.setItem(key, String(visible)); } catch { /* Keep working for this visit. */ }
    apply();
  }
  function mount() {
    scheduled = false;
    const host = document.querySelector(
      '#players-view.active .view-header-actions, #favorites-view.active .view-header-actions, ' +
      '.player-hero-tools, .club-roster-tools, #teams-grid-view.active .view-header, ' +
      '#leagues-view.active .view-header, #league-content .league-hero > div'
    );
    if (!host) return;
    if (!control) {
      control = document.createElement('label');
      control.className = 'face-badge-preference';
      control.innerHTML = '<input type="checkbox" data-face-badges-toggle><span data-i18n="faces.showBadges"></span>';
      control.querySelector('input').addEventListener('change', event => setVisible(event.target.checked));
    }
    const label = typeof window.t === 'function' ? window.t('faces.showBadges') : 'Mostrar carteles de caras';
    const text = control.querySelector('span');
    if (text.textContent !== label) text.textContent = label;
    control.querySelector('input').checked = visible;
    if (control.parentElement !== host) host.append(control);
  }
  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(mount);
  }
  apply();
  new MutationObserver(scheduleMount).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { visible = readPreference(); apply(); }
  });
  mount();
  window.LAQPFaceBadges = { isVisible: () => visible, setVisible };
})();
