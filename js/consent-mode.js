'use strict';

(function initAnalytics() {
  if (window.LAQPAnalytics) return;
  const id = 'G-M7ZNDRZB27';
  const key = 'laqp_cookie_consent_v1';
  const disableKey = 'ga-disable-' + id;
  const production = location.protocol === 'https:' && ['laqp.website', 'www.laqp.website'].includes(location.hostname);
  const adsDenied = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  let started = false;
  let lastPage = '';
  let currentContext;
  let choice = readChoice();

  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved?.analytics === true) return 'accept';
      if (saved?.analytics === false) return 'reject';
    } catch {}
    return null;
  }

  function pageLocation() {
    const url = new URL(location.pathname, location.origin);
    const query = new URLSearchParams(location.search);
    const view = query.get('view');
    if (url.pathname === '/database.html' && ['home', 'leagueTeams', 'search', 'favorites'].includes(view)) {
      url.searchParams.set('view', view);
      const league = query.get('leagueId');
      if (view === 'leagueTeams' && /^\d{1,8}$/.test(league || '')) url.searchParams.set('leagueId', league);
    }
    if (url.pathname === '/tier-list.html' && ['#community', '#tier-list'].includes(location.hash)) url.hash = location.hash;
    if (url.pathname.startsWith('/draft/')) {
      const mode = query.get('modo');
      if (mode && /^[a-z-]{1,32}$/.test(mode)) url.searchParams.set('modo', mode);
    }
    return url;
  }

  function pageContext() {
    const url = pageLocation();
    const page = url.href;
    let referrer = lastPage;
    if (!referrer && document.referrer) {
      try {
        const previous = new URL(document.referrer);
        referrer = previous.origin === location.origin ? previous.origin + previous.pathname : previous.origin;
      } catch {}
    }
    const query = new URLSearchParams(location.search);
    for (const field of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content']) {
      const value = query.get(field);
      if (value && /^[\p{L}\p{N} ._+~-]{1,100}$/u.test(value)) url.searchParams.set(field, value);
    }
    return { page, context: { page_location: url.href, page_referrer: referrer, page_title: document.title } };
  }

  function pageView() {
    if (!started || choice !== 'accept') return;
    const { page, context } = pageContext();
    if (page === lastPage) return;
    lastPage = page;
    currentContext = context;
    window.gtag('set', context);
    window.gtag('event', 'page_view', context);
  }

  function event(name, params) {
    if (started && choice === 'accept') window.gtag('event', name, { ...currentContext, ...params });
  }

  function download(tool, filename) {
    const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
    event('tool_download_start', extension ? { tool, file_extension: extension } : { tool });
  }

  function update() {
    if (!production) return;
    window[disableKey] = choice !== 'accept';
    if (choice !== 'accept') {
      if (started) window.gtag('consent', 'update', { analytics_storage: 'denied', ...adsDenied });
      lastPage = '';
      return;
    }
    if (!started) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
      window.gtag('consent', 'default', { analytics_storage: 'denied', ...adsDenied });
    }
    window.gtag('consent', 'update', { analytics_storage: 'granted', ...adsDenied });
    if (!started) {
      started = true;
      window.gtag('js', new Date());
      window.gtag('config', id, { ...pageContext().context, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      const tag = document.createElement('script');
      tag.async = true;
      tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
      document.head.append(tag);
    }
    pageView();
  }

  function saveChoice(next) {
    choice = next;
    try { localStorage.setItem(key, JSON.stringify({ choice, analytics: choice === 'accept', updatedAt: new Date().toISOString() })); }
    catch {}
    update();
    document.querySelector('.cookie-consent')?.remove();
  }

  function renderConsent() {
    if (document.querySelector('.cookie-consent')) return;
    const banner = document.createElement('section');
    banner.className = 'cookie-consent';
    if (location.pathname.startsWith('/draft/') && !document.querySelector('link[href="/css/analytics-consent.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/css/analytics-consent.css';
      document.head.append(css);
    }
    banner.setAttribute('aria-label', 'Preferencias de analítica');
    banner.innerHTML = `
      <div class="cookie-consent-copy">
        <strong>Cookies y analítica</strong>
        <p>LAqP usa almacenamiento técnico para recordar preferencias. Podés aceptar o rechazar la medición de visitas con Google Analytics.</p>
      </div>
      <div class="cookie-consent-actions">
        <a href="/cookies.html">Ver detalles</a>
        <button type="button" class="secondary" data-cookie-choice="reject">Rechazar</button>
        <button type="button" data-cookie-choice="accept">Aceptar</button>
      </div>`;
    for (const button of banner.querySelectorAll('button')) {
      button.addEventListener('click', () => saveChoice(button.dataset.cookieChoice));
    }
    document.body.append(banner);
    return banner;
  }

  function trackLink(click) {
    if (!started || choice !== 'accept' || click.defaultPrevented || !click.isTrusted || click.button > 1) return;
    const link = click.target.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    const domain = url.hostname.replace(/^www\./, '');
    if (!/^https?:$/.test(url.protocol)) return;
    if (['laqp.website', 'www.laqp.website'].includes(url.hostname)) {
      const filename = url.pathname.split('/').pop();
      if (link.hasAttribute('download') || /\.(?:zip|rar|7z|cpk)$/i.test(filename)) {
        event('site_download_click', { file_name: filename });
      }
      return;
    }
    const file = url.pathname.split('/').find(part => /\.(?:zip|rar|7z|cpk|bin)(?:\.html)?$/i.test(part));
    const hostDownload = ['sharemods.com', 'mediafire.com', 'mega.nz', 'mega.co.nz'].includes(domain);
    if (!hostDownload || (!file && !link.closest('.sp-files, .sp-download-panel'))) {
      if (!link.closest('.download-donation')) event('outbound_link_click', { link_domain: domain });
      return;
    }
    const params = { link_domain: domain };
    if (file) params.file_name = file.replace(/\.html$/i, '');
    event('external_download_click', params);
  }

  window.LAQPAnalytics = { event, download, pageView };
  window.addEventListener('storage', ({ key: changed }) => {
    if (changed !== key && changed !== null) return;
    const next = readChoice();
    if (next === choice) return;
    choice = next;
    update();
  });
  window.addEventListener('popstate', pageView);
  window.addEventListener('hashchange', pageView);
  document.addEventListener('click', trackLink);
  document.addEventListener('auxclick', trackLink);
  function ready() {
    update();
    if (!choice && production) renderConsent();
    document.querySelector('[data-manage-analytics]')?.addEventListener('click', () => {
      (renderConsent() || document.querySelector('.cookie-consent'))?.querySelector('button')?.focus();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
