'use strict';

(() => {
  const shell = document.querySelector('.dts-detail-shell');
  if (!shell) return;
  const tabs = Array.from(shell.querySelectorAll('[data-dts-tab]'));
  const panels = Array.from(shell.querySelectorAll('[data-dts-panel]'));
  const names = new Set(panels.map(panel => panel.dataset.dtsPanel));
  if (!tabs.length || !panels.length) return;

  shell.classList.add('dts-tabs-enhanced');
  function openPanel(name, updateUrl = false) {
    const target = names.has(name) ? name : 'resumen';
    tabs.forEach(tab => {
      const active = tab.dataset.dtsTab === target;
      tab.setAttribute('aria-selected', String(active));
      tab.classList.toggle('is-active', active);
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => {
      const active = panel.dataset.dtsPanel === target;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    if (updateUrl) history.pushState(null, '', `#${target}`);
  }

  shell.querySelector('[data-dts-tabs]').setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', event => {
      event.preventDefault();
      openPanel(tab.dataset.dtsTab, true);
    });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      openPanel(tabs[next].dataset.dtsTab, true);
      tabs[next].focus();
    });
  });

  shell.querySelectorAll('[data-dts-open]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      openPanel(link.dataset.dtsOpen, true);
      shell.querySelector(`[data-dts-tab="${link.dataset.dtsOpen}"]`)?.focus({ preventScroll: true });
      shell.querySelector('.dts-profile-nav')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  window.addEventListener('hashchange', () => openPanel(location.hash.slice(1)));
  openPanel(location.hash.slice(1) || 'resumen');
})();
