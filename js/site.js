'use strict';

const SITE_NAV_ITEMS = [
  { href: 'index.html', labelKey: 'nav.home', fallback: 'Inicio', key: 'index' },
  { href: 'database.html', labelKey: 'nav.database', fallback: 'Base de Datos', key: 'database' },
  { href: 'database/DTs/', labelKey: 'nav.dts', fallback: 'DTs', key: 'dts' },
  { href: 'rankings.html', labelKey: 'nav.scouting', fallback: 'Scouting', key: 'rankings' },
  { href: 'tactics.html', labelKey: 'nav.tactics', fallback: 'Tacticas', key: 'tactics' },
  { href: 'guias.html', labelKey: 'nav.guides', fallback: 'Guías', key: 'guides' },
  { href: 'tutorials.html', labelKey: 'nav.tutorials', fallback: 'Tutoriales', key: 'tutorials' },
  { href: 'calculadora-medias.html', labelKey: 'nav.calculator', fallback: 'Calculadora', key: 'calculator' },
  { href: 'downloads.html', labelKey: 'nav.downloads', fallback: 'Option Files', key: 'downloads' },
];

const LAQP_PRETTY_PATHS = {
  'index.html': 'index.html',
  'downloads.html': 'downloads.html',
  'guias.html': 'guias.html',
  'tutorials.html': 'tutorials.html',
  'rankings.html': 'rankings.html',
  'tactics.html': 'tactics.html',
  'calculadora-medias.html': 'calculadora-medias.html',
  'database.html': 'database.html',
  'contact.html': 'contact.html',
  'about.html': 'about.html',
  'acerca-de.html': 'acerca-de.html',
  'news.html': 'news.html',
  'faq.html': 'faq.html',
  'privacy-policy.html': 'privacy-policy.html',
  'terms.html': 'terms.html',
  'dmca.html': 'dmca.html',
};

function laqpSlugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function laqpPageUrl(page) {
  return LAQP_PRETTY_PATHS[page] || String(page || '').replace(/^\/+/, '');
}

function laqpRouteParts(prefix) {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] === prefix ? parts.slice(1) : [];
}

function laqpFirstRoutePart(prefix, queryParam) {
  const parts = laqpRouteParts(prefix);
  if (parts[0]) return decodeURIComponent(parts[0]);
  return new URLSearchParams(window.location.search).get(queryParam || 'id');
}

function laqpTeamUrl(teamId, teamName) {
  return `/team/v2/${laqpSlugify(teamName)}-${encodeURIComponent(teamId)}/`;
}

function laqpLeagueUrl(leagueId, leagueName) {
  return `/league/v2/${laqpSlugify(leagueName)}-${encodeURIComponent(leagueId)}/`;
}

function laqpPlayerUrl(playerId, teamId, playerName) {
  return `/player/v2/${encodeURIComponent(teamId)}/${laqpSlugify(playerName)}-${encodeURIComponent(playerId)}/`;
}

function laqpDatabaseUrl(view) {
  const paths = {
    players: '/database/v2/players/',
    teams: '/database/v2/teams/',
    leagues: '/database/v2/leagues/',
    dts: '/database/DTs/',
  };
  return paths[view] || 'database.html';
}

function laqpArticleUrl(articleId, title) {
  return `articulo.html?id=${encodeURIComponent(articleId)}`;
}

function laqpDownloadUrl(downloadId, title) {
  return `downloads.html?id=${encodeURIComponent(downloadId)}`;
}

function laqpAbsoluteUrl(path) {
  return `https://laqp.website${path.startsWith('/') ? path : `/${path}`}`;
}

function siteText(key, fallback) {
  if (typeof t !== 'function') return fallback;
  const value = t(key);
  return value && value !== key ? value : fallback;
}

function currentPageKey() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const first = (parts[0] || 'index.html').toLowerCase();
  const file = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (first === 'index.html' || first === '') return 'index';
  if (first === 'downloads' || file === 'downloads.html') return 'downloads';
  if (first === 'guides' || first === 'article' || file === 'guias.html' || file === 'articulo.html') return 'guides';
  if (first === 'tutorials' || file === 'tutorials.html') return 'tutorials';
  if (first === 'rankings' || file === 'rankings.html') return 'rankings';
  if (first === 'tactics' || file === 'tactics.html') return 'tactics';
  if (first === 'calculadora-medias' || file === 'calculadora-medias.html') return 'calculator';
  if (first === 'database' && (parts[1] || '').toLowerCase() === 'dts') return 'dts';
  if (first === 'database' || file === 'database.html') {
    return 'database';
  }
  if (first === 'player' || file === 'player.html') return 'database';
  if (first === 'team' || file === 'team.html') return 'database';
  if (first === 'league' || file === 'league.html') return 'database';
  if (first === 'acerca-de' || first === 'about' || file === 'acerca-de.html' || file === 'about.html') return 'about';
  if (first === 'news' || file === 'news.html') return 'news';
  if (first === 'faq' || file === 'faq.html') return 'faq';
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
  ensureMobileNavToggle(nav);
}

function renderHeaderBrand() {
  const header = document.querySelector('#header');
  if (!header) return;
  let title = header.querySelector('.header-title');
  if (!title) {
    title = document.createElement('div');
    title.className = 'header-title';
    const nav = header.querySelector('.header-nav');
    if (nav) {
      header.insertBefore(title, nav);
    } else {
      header.appendChild(title);
    }
  }
  title.innerHTML = 'La Ara&ntilde;a Que Pica <span>LAqP.website</span>';
}

function ensureMobileNavToggle(nav) {
  const header = document.querySelector('#header');
  if (!header || !nav) return;
  nav.id = nav.id || 'site-main-nav';

  let button = header.querySelector('.header-menu-toggle');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'header-menu-toggle';
    button.setAttribute('aria-controls', nav.id);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Abrir menu principal');
    button.innerHTML = `
      <span class="header-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
      <span class="header-menu-text">Menu</span>`;
    nav.before(button);
  }

  const closeMenu = () => {
    header.classList.remove('nav-open');
    button.setAttribute('aria-expanded', 'false');
  };

  button.onclick = event => {
    event.stopPropagation();
    const shouldOpen = button.getAttribute('aria-expanded') !== 'true';
    header.classList.toggle('nav-open', shouldOpen);
    button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  };

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  if (!window.__laqpMobileNavBound) {
    window.__laqpMobileNavBound = true;
    document.addEventListener('click', event => {
      const currentHeader = document.querySelector('#header');
      if (currentHeader && !currentHeader.contains(event.target)) {
        currentHeader.classList.remove('nav-open');
        currentHeader.querySelector('.header-menu-toggle')?.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1920) closeMenu();
    });
  }
}

function renderLanguageSelector() {
  if (document.querySelector('.language-switcher')) return;
  if (typeof getCurrentLanguage !== 'function' || !window.I18N_LANGUAGES) return;
  if (typeof i18nPageSupportsTranslations === 'function' && !i18nPageSupportsTranslations()) return;

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
        <a href="contact.html">${siteText('footer.contact', 'Contacto')}</a>
        <a href="about.html">${siteText('nav.about', 'Acerca de')}</a>
        <a href="https://www.youtube.com/@L.A.q.P" target="_blank" rel="noopener noreferrer">YouTube</a>
        <a href="privacy-policy.html">${siteText('footer.privacy', 'Politica de privacidad')}</a>
        <a href="terms.html">Terminos</a>
        <a href="dmca.html">DMCA</a>
        <a href="faq.html">${siteText('footer.help', 'Ayuda / FAQ')}</a>
      </nav>
    </div>`;
  document.body.appendChild(footer);
}

document.addEventListener('DOMContentLoaded', () => {
  renderHeaderBrand();
  renderMainNav();
  renderLanguageSelector();
  renderSiteFooter();
  if (typeof applyI18nToDocument === 'function') applyI18nToDocument();
  if (typeof renderLanguagePrompt === 'function') {
    renderLanguagePrompt();
  }
});

window.renderLanguageSelector = renderLanguageSelector;
