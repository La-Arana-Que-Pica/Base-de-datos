'use strict';

const SITE_NAV_ITEMS = [
  { href: 'index.html', labelKey: 'nav.home', fallback: 'Inicio', key: 'index' },
  { href: 'downloads.html', labelKey: 'nav.downloads', fallback: 'Option Files', key: 'downloads' },
  { href: 'tutorials.html', labelKey: 'nav.tutorials', fallback: 'Tutoriales', key: 'tutorials' },
  { href: 'database.html', labelKey: 'nav.database', fallback: 'Base de datos', key: 'database' },
];

function siteText(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function currentPageKey() {
  const file = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (file === '' || file === 'index.html') return 'index';
  if (file === 'downloads.html') return 'downloads';
  if (file === 'tutorials.html') return 'tutorials';
  if (file === 'database.html' || file === 'player.html' || file === 'team.html' || file === 'league.html') return 'database';
  if (file === 'acerca-de.html') return 'about';
  if (file === 'news.html') return 'news';
  if (file === 'faq.html') return 'faq';
  return '';
}

function renderMainNav() {
  const nav = document.querySelector('.header-nav');
  if (!nav) return;
  const active = currentPageKey();
  nav.innerHTML = SITE_NAV_ITEMS.map(item => `
    <a href="${item.href}" class="header-nav-link${item.key === active ? ' active' : ''}">
      ${siteText(item.labelKey, item.fallback)}
    </a>`).join('');
}

function renderLanguageSelector() {
  if (document.querySelector('.language-switcher')) return;
  if (typeof getCurrentLanguage !== 'function' || !window.I18N_LANGUAGES) return;

  const row = document.querySelector('#header');
  if (!row) return;

  const wrap = document.createElement('label');
  wrap.className = 'language-switcher';
  wrap.setAttribute('aria-label', siteText('language.label', 'Idioma'));
  wrap.innerHTML = `
    <span>${siteText('language.label', 'Idioma')}</span>
    <select onchange="setLanguage(this.value)">
      ${Object.entries(window.I18N_LANGUAGES).map(([code, info]) =>
        `<option value="${code}"${getCurrentLanguage() === code ? ' selected' : ''}>${info.native}</option>`
      ).join('')}
    </select>`;
  row.appendChild(wrap);
}

function renderSiteFooter() {
  if (document.querySelector('.site-footer')) return;
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div>
        <div class="site-footer-title">La Araña Que Pica</div>
        <div class="site-footer-copy">${siteText('footer.copy', 'LAqP.website: canal, Option Files, tutoriales y base de datos.')}</div>
      </div>
      <nav class="site-footer-links" aria-label="${siteText('footer.linksLabel', 'Enlaces utiles')}">
        <a href="faq.html#contacto">${siteText('footer.contact', 'Contacto')}</a>
        <a href="acerca-de.html">${siteText('nav.about', 'Acerca de')}</a>
        <a href="https://www.youtube.com/@L.A.q.P" target="_blank" rel="noopener noreferrer">YouTube</a>
        <a href="faq.html#privacidad">${siteText('footer.privacy', 'Politica de privacidad')}</a>
        <a href="faq.html">${siteText('footer.help', 'Ayuda / FAQ')}</a>
      </nav>
    </div>`;
  document.body.appendChild(footer);
}

document.addEventListener('DOMContentLoaded', () => {
  renderMainNav();
  renderLanguageSelector();
  renderSiteFooter();
  if (typeof applyI18nToDocument === 'function') applyI18nToDocument();
  if (typeof renderLanguagePrompt === 'function') {
    renderLanguagePrompt();
  }
});

window.renderLanguageSelector = renderLanguageSelector;
