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
  'cookies.html': 'cookies.html',
  'news.html': 'news.html',
  'faq.html': 'faq.html',
  'privacy-policy.html': 'privacy-policy.html',
  'terms.html': 'terms.html',
  'dmca.html': 'dmca.html',
  '404.html': '404.html',
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
  return `/guia/${encodeURIComponent(articleId)}/`;
}

function laqpDownloadUrl(downloadId, title) {
  return `/download/${encodeURIComponent(downloadId)}/`;
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
  if (first === 'downloads' || first === 'download' || file === 'downloads.html') return 'downloads';
  if (first === 'guides' || first === 'guia' || first === 'article' || file === 'guias.html' || file === 'articulo.html') return 'guides';
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
  title.innerHTML = 'PES 2018 Actualizado <span>LAqP.website</span>';
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
        <div class="site-footer-title">PES 2018 Actualizado</div>
        <div class="site-footer-copy">${siteText('footer.copy', 'LAqP.website: stats, caras, plantillas, guias, tacticas, descargas y base de datos para mantener PES 2018 actualizado.')}</div>
      </div>
      <nav class="site-footer-links" aria-label="${siteText('footer.linksLabel', 'Enlaces utiles')}">
        <a href="contact.html">${siteText('footer.contact', 'Contacto')}</a>
        <a href="acerca-de.html">${siteText('nav.about', 'Acerca de')}</a>
        <a href="https://www.youtube.com/@L.A.q.P" target="_blank" rel="noopener noreferrer">YouTube</a>
        <a href="privacy-policy.html">${siteText('footer.privacy', 'Politica de privacidad')}</a>
        <a href="cookies.html">Cookies</a>
        <a href="terms.html">Terminos</a>
        <a href="dmca.html">DMCA</a>
        <a href="faq.html">${siteText('footer.help', 'Ayuda / FAQ')}</a>
      </nav>
    </div>`;
  document.body.appendChild(footer);
}

const LAQP_CONSENT_KEY = 'laqp_cookie_consent_v1';

function getStoredConsent() {
  try {
    return JSON.parse(localStorage.getItem(LAQP_CONSENT_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveConsent(choice) {
  const payload = {
    choice,
    analytics: choice === 'accept',
    ads: choice === 'accept',
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LAQP_CONSENT_KEY, JSON.stringify(payload));
  } catch {}

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('consent', 'update', {
    analytics_storage: payload.analytics ? 'granted' : 'denied',
    ad_storage: payload.ads ? 'granted' : 'denied',
    ad_user_data: payload.ads ? 'granted' : 'denied',
    ad_personalization: payload.ads ? 'granted' : 'denied',
  });
  document.querySelector('.cookie-consent')?.remove();
}

function applyConsentDefaults() {
  const consent = getStoredConsent();
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    analytics_storage: consent?.analytics ? 'granted' : 'denied',
    ad_storage: consent?.ads ? 'granted' : 'denied',
    ad_user_data: consent?.ads ? 'granted' : 'denied',
    ad_personalization: consent?.ads ? 'granted' : 'denied',
    wait_for_update: 500,
  });
}

function renderCookieConsent() {
  if (getStoredConsent() || document.querySelector('.cookie-consent')) return;
  const banner = document.createElement('section');
  banner.className = 'cookie-consent';
  banner.setAttribute('aria-label', 'Aviso de cookies');
  banner.innerHTML = `
    <div class="cookie-consent-copy">
      <strong>Cookies y anuncios</strong>
      <p>LAqP usa cookies tecnicas para recordar preferencias y puede usar Google Analytics, Google AdSense y Adsterra para medicion y publicidad. Podes aceptar o rechazar las cookies no esenciales.</p>
    </div>
    <div class="cookie-consent-actions">
      <a href="cookies.html">Ver detalles</a>
      <button type="button" class="secondary" data-cookie-choice="reject">Rechazar</button>
      <button type="button" data-cookie-choice="accept">Aceptar</button>
    </div>`;
  banner.querySelectorAll('[data-cookie-choice]').forEach(button => {
    button.addEventListener('click', () => saveConsent(button.dataset.cookieChoice));
  });
  document.body.appendChild(banner);
}

function getDatabaseDirectoryView() {
  const metaView = document.querySelector('meta[name="laqp-database-view"]')?.content;
  if (metaView) return metaView;
  const path = window.location.pathname.replace(/\/+$/, '/').toLowerCase();
  if (path.endsWith('/database/v2/players/')) return 'players';
  if (path.endsWith('/database/v2/teams/')) return 'teams';
  if (path.endsWith('/database/v2/leagues/')) return 'leagues';
  return '';
}

function getDatabaseDirectoryTarget(view) {
  const params = new URLSearchParams(window.location.search);
  params.set('view', view);
  const page = typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html';
  return `${page}?${params.toString()}`;
}

function rescueDatabaseDirectoryPage() {
  const view = getDatabaseDirectoryView();
  if (!view) return;

  const targetId = view === 'teams' ? 'teams-grid-view' : `${view}-view`;
  const activeView = document.getElementById(targetId)?.classList.contains('active');
  if (activeView) return;

  document.documentElement.classList.add('laqp-js');

  const main = document.getElementById('main');
  const fallback = document.querySelector('.js-prerender-fallback') || document.querySelector('#main > .guides-library-panel');
  const breadcrumbs = document.querySelector('#main > .breadcrumbs');
  if (fallback) fallback.style.display = 'none';
  if (breadcrumbs) breadcrumbs.style.display = 'none';

  let loader = document.getElementById('loading-overlay');
  if (!loader && main) {
    loader = document.createElement('div');
    loader.id = 'loading-overlay';
    loader.innerHTML = '<div class="spinner"></div><span class="loading-message">Cargando base de datos...</span>';
    main.prepend(loader);
  }
  if (loader) {
    loader.classList.add('js-hydration-loader');
    loader.style.display = 'flex';
  }

  const hasAppScript = Array.from(document.scripts).some(script => {
    const src = script.getAttribute('src') || '';
    return src.includes('js/app.js');
  });
  const hasInteractiveShell = !!document.getElementById(targetId);
  const delay = hasAppScript && hasInteractiveShell ? 6000 : 250;

  window.clearTimeout(window.__laqpDatabaseDirectoryRescueTimer);
  window.__laqpDatabaseDirectoryRescueTimer = window.setTimeout(() => {
    const hydrated = document.getElementById(targetId)?.classList.contains('active');
    if (!hydrated) window.location.replace(getDatabaseDirectoryTarget(view));
  }, delay);
}

applyConsentDefaults();

document.addEventListener('DOMContentLoaded', () => {
  renderHeaderBrand();
  renderMainNav();
  renderLanguageSelector();
  renderSiteFooter();
  renderCookieConsent();
  if (typeof applyI18nToDocument === 'function') applyI18nToDocument();
  if (typeof renderLanguagePrompt === 'function') {
    renderLanguagePrompt();
  }
  rescueDatabaseDirectoryPage();
});

window.addEventListener('pageshow', rescueDatabaseDirectoryPage);

window.renderLanguageSelector = renderLanguageSelector;
