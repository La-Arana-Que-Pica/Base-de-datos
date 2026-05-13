'use strict';

const SITE_NAV_ITEMS = [
  { href: 'index.html', label: 'Inicio', key: 'index' },
  { href: 'downloads.html', label: 'Option Files', key: 'downloads' },
  { href: 'tutorials.html', label: 'Tutoriales', key: 'tutorials' },
  { href: 'database.html', label: 'Base de datos', key: 'database' },
  { href: 'acerca-de.html', label: 'Acerca de', key: 'about' },
];

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
      ${item.label}
    </a>`).join('');
}

function renderSiteFooter() {
  if (document.querySelector('.site-footer')) return;
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div>
        <div class="site-footer-title">La Araña Que Pica</div>
        <div class="site-footer-copy">LAqP.website: canal, Option Files, tutoriales y base de datos.</div>
      </div>
      <nav class="site-footer-links" aria-label="Enlaces utiles">
        <a href="faq.html#contacto">Contacto</a>
        <a href="acerca-de.html">Acerca de</a>
        <a href="https://www.youtube.com/@L.A.q.P" target="_blank" rel="noopener noreferrer">YouTube</a>
        <a href="faq.html#privacidad">Politica de privacidad</a>
        <a href="faq.html">Ayuda / FAQ</a>
      </nav>
    </div>`;
  document.body.appendChild(footer);
}

document.addEventListener('DOMContentLoaded', () => {
  renderMainNav();
  renderSiteFooter();
});
