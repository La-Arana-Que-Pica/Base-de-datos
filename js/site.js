'use strict';

if (document.querySelector('#player-page, #team-page, #league-page, #layout #main')) {
  import('/js/face-badge-preference.js');
}

let laqpPes2018OverallPromise = null;
window.LAQPEnsurePes2018Overall = function ensurePes2018Overall() {
  if (window.PES2018Overall) return Promise.resolve(window.PES2018Overall);
  if (laqpPes2018OverallPromise) return laqpPes2018OverallPromise;
  laqpPes2018OverallPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'js/pes2018-overall.js?v=20261003a';
    script.onload = () => resolve(window.PES2018Overall);
    script.onerror = () => reject(new Error('No se pudo cargar el algoritmo PES 2018'));
    document.head.appendChild(script);
  });
  return laqpPes2018OverallPromise;
};

const SITE_NAV_ITEMS = [
  { href: '/downloads.html', fallback: 'Spider Patch', key: 'downloads' },
  { fallback: 'Base de datos', key: 'database', children: [
    { href: '/database.html', fallback: 'Base de datos de jugadores y equipos', key: 'database' },
    { href: '/database/DTs/', fallback: 'Directores técnicos', key: 'dts' },
    { href: '/tactics.html', fallback: 'Tácticas históricas', key: 'tactics' },
  ] },
  // Análisis: trabajan con datos de fútbol (consultar, calcular, planificar).
  { fallback: 'Análisis', key: 'tools', children: [
    { href: '/rankings.html', fallback: 'Scouting', key: 'rankings' },
    { href: '/calculadora-medias.html', fallback: 'Calculadora de medias', key: 'calculator' },
    { href: '/alineaciones.html', fallback: 'Creador de alineaciones', key: 'lineups' },
  ] },
  // Editores: crean archivos para instalar en PES 2018.
  { fallback: 'Editores', key: 'editors', children: [
    { href: '/miniface-studio.html', fallback: 'Miniface Studio', key: 'miniface-studio' },
    { href: '/kit-color-studio.html', fallback: 'Kit Color Studio', key: 'kit-color-studio' },
    { href: '/soundtrack-maker.html', fallback: 'Soundtrack Maker', key: 'soundtrack-maker' },
  ] },
  // Entretenimiento: sección propia (portal de minijuegos, rankings y Draft), sin desplegable.
  { href: '/entretenimiento.html', fallback: 'Entretenimiento', key: 'entertainment' },
  { href: '/guias.html', fallback: 'Guías', key: 'guides' },
];
const SITE_NAV_DESKTOP_QUERY = '(min-width: 1151px)';

const LAQP_PRETTY_PATHS = {
  'index.html': 'index.html',
  'downloads.html': 'downloads.html',
  'guias.html': 'guias.html',
  'tutorials.html': 'tutorials.html',
  'rankings.html': 'rankings.html',
  'tactics.html': 'tactics.html',
  'calculadora-medias.html': 'calculadora-medias.html',
  'database.html': 'database.html',
  'alineaciones.html': 'alineaciones.html',
  'miniface-studio.html': 'miniface-studio.html',
  'kit-color-studio.html': 'kit-color-studio.html',
  'soundtrack-maker.html': 'soundtrack-maker.html',
  'entretenimiento.html': 'entretenimiento.html',
  'ahorcado-futbolero.html': 'ahorcado-futbolero.html',
  'tier-list.html': 'tier-list.html',
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
  return `/team/${laqpSlugify(teamName)}-${encodeURIComponent(teamId)}/`;
}

function laqpLeagueUrl(leagueId, leagueName) {
  return `/league/${laqpSlugify(leagueName)}-${encodeURIComponent(leagueId)}/`;
}

function laqpPlayerUrl(playerId, teamId, playerName) {
  return `/player/${encodeURIComponent(teamId)}/${laqpSlugify(playerName)}-${encodeURIComponent(playerId)}/`;
}

function laqpDatabaseUrl(view) {
  const paths = {
    players: '/database/players/',
    teams: '/database/teams/',
    leagues: '/database/leagues/',
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

function laqpOptionFileUrl(slug) {
  return `/option-files/${encodeURIComponent(slug)}/`;
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
  if (['tier-list.html', 'entretenimiento.html', 'ahorcado-futbolero.html'].includes(file) || first === 'entretenimiento' || first === 'draft') return 'entertainment';
  if (first === 'index.html' || first === '') return 'index';
  if (first === 'downloads' || first === 'download' || first === 'option-files' || file === 'downloads.html') return 'downloads';
  if (first === 'guides' || first === 'guia' || first === 'article' || file === 'guias.html' || file === 'articulo.html') return 'guides';
  if (first === 'tutorials' || file === 'tutorials.html') return 'guides';
  if (first === 'rankings' || file === 'rankings.html') return 'rankings';
  if (first === 'tactics' || file === 'tactics.html') return 'tactics';
  if (first === 'calculadora-medias' || file === 'calculadora-medias.html') return 'calculator';
  if (first === 'database' && (parts[1] || '').toLowerCase() === 'dts') return 'dts';
  if (first === 'database' || file === 'database.html') {
    return 'database';
  }
  if (first === 'alineaciones' || file === 'alineaciones.html') return 'lineups';
  if (first === 'miniface-studio' || file === 'miniface-studio.html') return 'miniface-studio';
  if (first === 'kit-color-studio' || file === 'kit-color-studio.html') return 'kit-color-studio';
  if (first === 'soundtrack-maker' || file === 'soundtrack-maker.html') return 'soundtrack-maker';
  if (first === 'player' || file === 'player.html') return 'database';
  if (first === 'team' || file === 'team.html') return 'database';
  if (first === 'league' || file === 'league.html') return 'database';
  if (first === 'acerca-de' || first === 'about' || file === 'acerca-de.html' || file === 'about.html') return 'about';
  if (file === 'squad-organizer.html') return 'organizer';
  if (first === 'news' || file === 'news.html') return 'news';
  if (first === 'faq' || file === 'faq.html') return 'faq';
  return '';
}

// Configuración pública de comunidad (Discord y enlaces de apoyo): un único pedido por página.
let laqpCommunityConfigPromise = null;
function laqpCommunityConfig() {
  if (!laqpCommunityConfigPromise) {
    laqpCommunityConfigPromise = fetch('/database/community.json')
      .then(response => (response.ok ? response.json() : {}))
      .catch(() => ({}));
  }
  return laqpCommunityConfigPromise;
}
window.laqpCommunityConfig = laqpCommunityConfig;

async function renderMainNav() {
  const nav = document.querySelector('.header-nav');
  if (!nav) return;
  const active = currentPageKey();
  const link = item => '<a href="' + item.href + '" class="header-nav-link' + (item.key === active ? ' active' : '') + '"' + (item.key === active ? ' aria-current="page"' : '') + '>' + item.fallback + '</a>';
  const items = SITE_NAV_ITEMS.map(item => {
    if (!item.children) return link(item);
    const selected = item.children.some(child => child.key === active);
    return '<details class="site-nav-group" data-nav-group="' + item.key + '"><summary' + (selected ? ' class="active"' : '') + '>' + item.fallback + ' <span aria-hidden="true">⌄</span></summary><div class="site-nav-panel">' + item.children.map(link).join('') + '</div></details>';
  }).join('');
  nav.innerHTML = items + '<a class="header-nav-link site-account-fallback" href="/mi-cuenta.html">Cuenta</a>';
  ensureMobileNavToggle(nav);
  // Community is a Discord invitation, never an avatar/account control.
  try {
    const invite = (await laqpCommunityConfig()).discord?.inviteUrl;
    if (!invite) return;
    const parsed = new URL(invite);
    if (parsed.protocol !== 'https:' || !['discord.gg', 'discord.com'].includes(parsed.hostname) || !parsed.pathname.slice(1) || (parsed.hostname === 'discord.com' && !parsed.pathname.startsWith('/invite/'))) return;
    const community = document.createElement('a'); community.className = 'header-nav-link site-discord-link';
    community.href = parsed.href; community.textContent = 'Discord'; community.target = '_blank'; community.rel = 'noopener noreferrer';
    nav.insertBefore(community, nav.querySelector('.site-account-fallback'));
  } catch { /* No invitation configured: no fake or inactive link. */ }
}

function renderHeaderBrand() {
  const header = document.querySelector('#header');
  if (!header) return;
  const logoLink = header.querySelector('.header-logo-link');
  if (logoLink) {
    logoLink.setAttribute('href', '/index.html');
    logoLink.setAttribute('aria-label', 'Volver al inicio de LAqP.website');
  }
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
  header.classList.add('site-header-v2');
  if (!document.querySelector('link[data-site-navigation]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet'; style.href = '/css/site-navigation.css';
    style.dataset.siteNavigation = ''; document.head.appendChild(style);
  }
  title.innerHTML = 'LAqP <span>PES 2018</span>';
}

function ensureMobileNavToggle(nav) {
  const header = document.querySelector('#header');
  if (!header || !nav) return;
  nav.id = nav.id || 'site-main-nav';
  let button = header.querySelector('.header-menu-toggle');
  if (!button) {
    button = document.createElement('button'); button.type = 'button';
    button.className = 'header-menu-toggle';
    button.setAttribute('aria-controls', nav.id); button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Abrir menú principal'); button.textContent = 'Menú'; nav.before(button);
  }
  const closeGroups = () => nav.querySelectorAll('details[open]').forEach(group => { group.open = false; });
  const closeMenu = (focus = false) => {
    header.classList.remove('nav-open'); button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Abrir menú principal'); closeGroups();
    if (focus) button.focus();
  };
  button.onclick = () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    header.classList.toggle('nav-open', open); button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Cerrar menú principal' : 'Abrir menú principal');
    if (!open) closeGroups();
  };
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  nav.querySelectorAll('details').forEach(group => group.addEventListener('toggle', () => {
    if (group.open) nav.querySelectorAll('details').forEach(other => { if (other !== group) other.open = false; });
  }));
  if (!window.__laqpMobileNavBound) {
    window.__laqpMobileNavBound = true;
    document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
    document.addEventListener('focusin', event => { if (!header.contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const open = nav.querySelector('details[open]');
      if (open) { open.open = false; open.querySelector('summary').focus(); }
      else if (header.classList.contains('nav-open')) closeMenu(true);
    });
    window.matchMedia(SITE_NAV_DESKTOP_QUERY).addEventListener('change', () => closeMenu());
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
  wrap.setAttribute('aria-label', siteText('language.databaseLabel', 'Idioma de la Base de Datos'));
  wrap.innerHTML = `
    <span>${siteText('language.databaseLabel', 'Idioma de la Base de Datos')}</span>
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
        <div class="site-footer-copy">LAqP.website: stats, caras, plantillas, guías, tácticas, descargas y base de datos para mantener PES 2018 actualizado.</div>
      </div>
      <nav class="site-footer-links" aria-label="Enlaces útiles">
        <a href="contact.html">Contacto</a>
        <a href="acerca-de.html">Acerca de</a>
        <a href="https://www.youtube.com/@L.A.q.P" target="_blank" rel="noopener noreferrer">YouTube</a>
        <a href="privacy-policy.html">Política de privacidad</a>
        <a href="cookies.html">Cookies</a>
        <a href="terms.html">Terminos</a>
        <a href="dmca.html">DMCA</a>
        <a href="faq.html">Ayuda / FAQ</a>
      </nav>
    </div>`;
  document.body.appendChild(footer);
}

function getDatabaseDirectoryView() {
  const metaView = document.querySelector('meta[name="laqp-database-view"]')?.content;
  if (metaView) return metaView;
  const path = window.location.pathname.replace(/\/+$/, '/').toLowerCase();
  if (path.endsWith('/database/players/')) return 'players';
  if (path.endsWith('/database/teams/')) return 'teams';
  if (path.endsWith('/database/leagues/')) return 'leagues';
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

document.addEventListener('DOMContentLoaded', () => {
  renderHeaderBrand();
  renderMainNav();
  renderLanguageSelector();
  renderSiteFooter();
  // Apoyo voluntario: footer, acceso secundario en el menú e invitación tras las descargas.
  laqpLoadScript('/js/laqp-support.js?v=20261110').catch(() => {});
  if (['database', 'dts'].includes(currentPageKey())) {
    import('/js/database-donation.js?v=20261113-ga4')
      .then(({ startDatabaseDonation }) => startDatabaseDonation()).catch(() => {});
  }
  if (typeof applyI18nToDocument === 'function') applyI18nToDocument();
  if (typeof renderLanguagePrompt === 'function') {
    renderLanguagePrompt();
  }
  rescueDatabaseDirectoryPage();
});

window.addEventListener('pageshow', rescueDatabaseDirectoryPage);

window.renderLanguageSelector = renderLanguageSelector;

/* Cuentas globales -------------------------------------------------------
 * Se carga de forma progresiva para conservar el sitio estático y evitar
 * requests de comentarios en páginas que no los tienen.
 */
function laqpLoadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-laqp-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.laqpSrc = src;
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

function laqpLoadAccountStyles() {
  if (document.querySelector('link[data-laqp-account-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/laqp-account.css?v=20261005a';
  link.dataset.laqpAccountStyles = '';
  document.head.appendChild(link);
}

function laqpCommentContext() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);
  const playerId = document.querySelector('meta[name="laqp-player-id"]')?.content;
  if ((parts[0] === 'player' || /player\.html$/i.test(path)) && playerId) {
    return { pageType: 'player', pageId: playerId };
  }
  const teamId = document.querySelector('meta[name="laqp-team-id"]')?.content;
  if ((parts[0] === 'team' || /team\.html$/i.test(path)) && teamId) {
    return { pageType: 'team', pageId: teamId };
  }
  if (parts[0] === 'tactics' && parts[1]) {
    return { pageType: 'tactic', pageId: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'option-files' && parts[1] && !parts[2]) {
    return { pageType: 'download', pageId: decodeURIComponent(parts[1]) };
  }
  const managerId = document.querySelector('[data-laqp-manager-id]')?.dataset.laqpManagerId;
  if (parts[0] === 'database' && parts[1] === 'DTs' && parts[2] && managerId) {
    return { pageType: 'manager', pageId: managerId };
  }
  return null;
}

function laqpEnsureCommentHost() {
  const context = laqpCommentContext();
  if (!context) return null;
  const hosts = [...document.querySelectorAll('[data-laqp-comments]')];
  let host = hosts.find(candidate => candidate.dataset.pageType === context.pageType && candidate.dataset.pageId === context.pageId) || hosts[0] || null;
  hosts.forEach(candidate => {
    if (candidate !== host) candidate.remove();
  });
  if (!host) {
    host = document.createElement('section');
    host.dataset.laqpComments = '';
    const mount = document.querySelector('#player-page, #team-page, #tactics-page, #downloads-page, #dts-page, main');
    (mount || document.body).appendChild(host);
  }
  host.dataset.pageType = context.pageType;
  host.dataset.pageId = context.pageId;
  return host;
}

function laqpRefreshSocialComponents() {
  const host = laqpEnsureCommentHost();
  if (!host) return;
  document.dispatchEvent(new CustomEvent('laqp-social-refresh'));
}

async function laqpBootstrapAccounts() {
  const publicProfilePage = document.querySelector('[data-laqp-public-profile]');
  const accountPage = document.querySelector('[data-laqp-account-page]');
  try {
    if (accountPage || publicProfilePage) laqpLoadAccountStyles();
    await laqpLoadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
    await laqpLoadScript('/js/supabaseClient.js?v=20261005c');
    if (!window.LAQP_SUPABASE_CONFIG?.configured) {
      console.warn('[LAqP] Cuentas y comentarios desactivados: configurá SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en js/supabaseClient.js.');
      if (accountPage) accountPage.textContent = 'Las cuentas todavía no están habilitadas.';
      if (publicProfilePage) publicProfilePage.textContent = 'Los perfiles públicos todavía no están habilitados.';
      return { configured: false };
    }
    laqpLoadAccountStyles();
    const supabaseClient = window.LAQP_SUPABASE || window.LAQPCreateSupabaseClient?.();
    if (!supabaseClient) throw new Error('No se pudo inicializar el cliente de Supabase.');
    await laqpLoadScript('/js/auth.js?v=20261005d');
    const commentHost = laqpEnsureCommentHost();
    if (accountPage || publicProfilePage) await laqpLoadScript('/js/content-index.js?v=20261008a');
    if (accountPage) await laqpLoadScript('/js/account-features.js?v=20261008a');
    if (commentHost) {
      await laqpLoadScript('/js/user-content.js?v=20261008a');
      await laqpLoadScript('/js/comments.js?v=20261008a');
      laqpRefreshSocialComponents();
    }
    if (publicProfilePage) await laqpLoadScript('/js/public-profile.js?v=20261005b');
    return { configured: true, client: window.LAQP_SUPABASE };
  } catch (error) {
    console.warn('[LAqP] Cuentas y comentarios no están disponibles; el resto del sitio continúa normalmente.', error);
    if (accountPage) accountPage.textContent = 'No pudimos inicializar tu cuenta. Revisá la conexión y recargá la página.';
    if (publicProfilePage) publicProfilePage.textContent = 'No pudimos cargar este perfil. Probá de nuevo más tarde.';
    return { configured: false, error };
  }
}

document.addEventListener('laqp-content-rendered', laqpRefreshSocialComponents);

window.LAQPAccountReady = document.readyState === 'loading'
  ? new Promise(resolve => document.addEventListener('DOMContentLoaded', () => resolve(laqpBootstrapAccounts()), { once: true })).then(value => value)
  : laqpBootstrapAccounts();
