/* Apoyo voluntario a LAqP — componente único reutilizado en:
 *  · el footer general (y el footer de Spider Patch), con id="apoyar-laqp";
 *  · una invitación compacta después de las descargas de Spider Patch;
 *  · un acceso secundario «❤️ Apoyar LAqP» en el menú.
 * Solo enlaces a plataformas oficiales configurados en /database/community.json → support.
 * Una opción sin enlace válido no se muestra; si no hay ninguna, el componente no aparece.
 * Sin ventanas emergentes, contadores ni bloqueos: nada depende de colaborar.
 */
(function () {
  'use strict';
  if (window.LAQPSupport) return;

  const TEXT = {
    es: {
      title: '¿Te gusta LAqP?',
      body: 'Todas nuestras herramientas, juegos y parches son gratuitos. Si disfrutás del proyecto y querés ayudarnos a seguir creando contenido y nuevas funcionalidades, podés apoyarnos voluntariamente. ¡Cada aporte suma!',
      note: 'Colaborar es totalmente opcional: las descargas, los juegos y las herramientas siguen siendo gratis para todos.',
      about: 'Conocé el proyecto',
      nav: 'Apoyar LAqP',
      region: 'Apoyá el proyecto',
      downloadTitle: '¿Te sirvió Spider Patch?',
      downloadBody: 'Es gratis y siempre lo va a ser. Si querés, podés apoyar a LAqP para que sigamos actualizándolo.',
      once: 'Aporte único', monthly: 'Mensual',
      mp: 'Mercado Pago', mpHint: 'Desde Argentina',
      pp: 'PayPal', ppHint: 'Desde cualquier país',
      yt: 'Membresía de YouTube', ytHint: 'Unite al canal La Araña Que Pica y apoyá cada mes',
      external: '(se abre en una pestaña nueva)',
    },
    en: {
      title: 'Do you like LAqP?',
      body: 'All our tools, games and patches are free. If you enjoy the project and want to help us keep creating content and new features, you can support us voluntarily. Every contribution helps!',
      note: 'Supporting is completely optional: downloads, games and tools stay free for everyone.',
      about: 'About the project',
      nav: 'Support LAqP',
      region: 'Support the project',
      downloadTitle: 'Did Spider Patch help you?',
      downloadBody: 'It is free and always will be. If you like, you can support LAqP so we can keep updating it.',
      once: 'One-time', monthly: 'Monthly',
      mp: 'Mercado Pago', mpHint: 'From Argentina',
      pp: 'PayPal', ppHint: 'From any country',
      yt: 'YouTube membership', ytHint: 'Join the La Araña Que Pica channel and support us every month',
      external: '(opens in a new tab)',
    },
    pt: {
      title: 'Você curte o LAqP?',
      body: 'Todas as nossas ferramentas, jogos e patches são gratuitos. Se você gosta do projeto e quer nos ajudar a continuar criando conteúdo e novos recursos, pode nos apoiar voluntariamente. Toda ajuda conta!',
      note: 'Apoiar é totalmente opcional: downloads, jogos e ferramentas continuam gratuitos para todos.',
      about: 'Conheça o projeto',
      nav: 'Apoiar o LAqP',
      region: 'Apoie o projeto',
      downloadTitle: 'O Spider Patch foi útil?',
      downloadBody: 'É grátis e sempre será. Se quiser, você pode apoiar o LAqP para continuarmos atualizando-o.',
      once: 'Contribuição única', monthly: 'Mensal',
      mp: 'Mercado Pago', mpHint: 'Da Argentina',
      pp: 'PayPal', ppHint: 'De qualquer país',
      yt: 'Assinatura do YouTube', ytHint: 'Seja membro do canal La Araña Que Pica e apoie todo mês',
      external: '(abre em uma nova aba)',
    },
    it: {
      title: 'Ti piace LAqP?',
      body: 'Tutti i nostri strumenti, giochi e patch sono gratuiti. Se il progetto ti piace e vuoi aiutarci a continuare a creare contenuti e nuove funzioni, puoi sostenerci volontariamente. Ogni contributo conta!',
      note: 'Contribuire è del tutto facoltativo: download, giochi e strumenti restano gratuiti per tutti.',
      about: 'Scopri il progetto',
      nav: 'Sostieni LAqP',
      region: 'Sostieni il progetto',
      downloadTitle: 'Spider Patch ti è stato utile?',
      downloadBody: 'È gratuito e lo sarà sempre. Se vuoi, puoi sostenere LAqP per aiutarci a continuare ad aggiornarlo.',
      once: 'Contributo singolo', monthly: 'Mensile',
      mp: 'Mercado Pago', mpHint: 'Dall’Argentina',
      pp: 'PayPal', ppHint: 'Da qualsiasi paese',
      yt: 'Abbonamento YouTube', ytHint: 'Diventa membro del canale La Araña Que Pica e sostienici ogni mese',
      external: '(si apre in una nuova scheda)',
    },
    ar: {
      title: 'هل يعجبك LAqP؟',
      body: 'جميع أدواتنا وألعابنا وباتشاتنا مجانية. إذا كنت تستمتع بالمشروع وتريد مساعدتنا على مواصلة إنشاء المحتوى والميزات الجديدة، يمكنك دعمنا طوعًا. كل مساهمة تُحدث فرقًا!',
      note: 'الدعم اختياري تمامًا: التنزيلات والألعاب والأدوات تبقى مجانية للجميع.',
      about: 'تعرّف على المشروع',
      nav: 'ادعم LAqP',
      region: 'ادعم المشروع',
      downloadTitle: 'هل أفادك Spider Patch؟',
      downloadBody: 'إنه مجاني وسيبقى كذلك دائمًا. إن أردت، يمكنك دعم LAqP لنواصل تحديثه.',
      once: 'مساهمة لمرة واحدة', monthly: 'شهري',
      mp: 'Mercado Pago', mpHint: 'من الأرجنتين',
      pp: 'PayPal', ppHint: 'من أي بلد',
      yt: 'عضوية يوتيوب', ytHint: 'انضم إلى قناة La Araña Que Pica وادعمنا كل شهر',
      external: '(يفتح في علامة تبويب جديدة)',
    },
  };

  // Solo plataformas oficiales y HTTPS; cualquier otro valor se descarta.
  const PROVIDERS = [
    { key: 'mercadoPagoUrl', id: 'mp', kind: 'once', hosts: ['link.mercadopago.com.ar', 'mpago.la', 'mpago.li', 'mercadopago.com.ar', 'www.mercadopago.com.ar'] },
    { key: 'paypalUrl', id: 'pp', kind: 'once', hosts: ['paypal.com', 'www.paypal.com', 'paypal.me', 'www.paypal.me'] },
    { key: 'youtubeMembershipUrl', id: 'yt', kind: 'monthly', hosts: ['youtube.com', 'www.youtube.com'], path: /\/join\/?$/ },
  ];

  function language() {
    const root = document.documentElement;
    const spider = root.dataset.spiderLanguage;
    if (spider && TEXT[spider]) return spider;
    try {
      if (typeof i18nPageSupportsTranslations === 'function' && i18nPageSupportsTranslations() && typeof getCurrentLanguage === 'function') {
        const current = getCurrentLanguage();
        if (TEXT[current]) return current;
      }
    } catch { /* idioma por defecto */ }
    const lang = (root.lang || 'es').slice(0, 2).toLowerCase();
    return TEXT[lang] ? lang : 'es';
  }

  function validOptions(config) {
    const support = config && config.support;
    if (!support) return [];
    return PROVIDERS.flatMap(provider => {
      const raw = support[provider.key];
      if (typeof raw !== 'string' || !raw.trim()) return [];
      try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.username || url.password || !provider.hosts.includes(url.hostname)) return [];
        if (provider.path && !provider.path.test(url.pathname)) return [];
        return [{ ...provider, href: url.href }];
      } catch { return []; }
    });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function optionLink(option, tr, compact) {
    const a = el('a', 'laqp-support-option laqp-support-' + option.id);
    a.href = option.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const name = el('strong', null, tr[option.id]);
    const badge = el('span', 'laqp-support-kind' + (option.kind === 'monthly' ? ' is-monthly' : ''), option.kind === 'monthly' ? tr.monthly : tr.once);
    a.append(name, badge);
    if (!compact) a.append(el('small', null, tr[option.id + 'Hint']));
    a.append(el('span', 'laqp-support-sr', ' ' + (compact ? tr[option.id + 'Hint'] + ' ' : '') + tr.external));
    return a;
  }

  /** Crea el componente. variant: 'footer' (completo) | 'download' (invitación compacta). */
  function create(options, variant) {
    const lang = language(), tr = TEXT[lang];
    const compact = variant === 'download';
    const section = el('section', 'laqp-support laqp-support--' + variant);
    section.lang = lang;
    section.dir = lang === 'ar' ? 'rtl' : 'ltr';
    const headingId = 'laqp-support-title-' + variant;
    section.setAttribute('aria-labelledby', headingId);
    const intro = el('div', 'laqp-support-intro');
    const heading = el('h2', 'laqp-support-title', compact ? tr.downloadTitle : tr.title);
    heading.id = headingId;
    if (!compact) { const heart = el('span', 'laqp-support-heart', ' ❤️'); heart.setAttribute('aria-hidden', 'true'); heading.append(heart); }
    intro.append(heading, el('p', 'laqp-support-body', compact ? tr.downloadBody : tr.body));
    if (!compact) intro.append(el('p', 'laqp-support-note', tr.note));
    const about = el('a', 'laqp-support-about', tr.about + (lang === 'ar' ? ' ←' : ' →'));
    about.href = '/acerca-de.html';
    intro.append(about);
    const list = el('ul', 'laqp-support-options');
    list.setAttribute('aria-label', tr.region);
    for (const option of options) { const li = el('li'); li.append(optionLink(option, tr, compact)); list.append(li); }
    section.append(intro, list);
    return section;
  }

  function mountFooter(options) {
    const footer = document.querySelector('.site-footer');
    if (!footer || footer.querySelector('.laqp-support--footer')) return;
    const section = create(options, 'footer');
    section.id = 'apoyar-laqp';
    footer.prepend(section);
  }

  function mountDownloads(options) {
    // Después de las descargas: nunca antes ni en medio de los archivos.
    document.querySelectorAll('.sp-download-panel').forEach(panel => {
      if (panel.nextElementSibling?.classList.contains('laqp-support--download')) return;
      panel.after(create(options, 'download'));
    });
  }

  function mountNav() {
    const nav = document.querySelector('#header .header-nav');
    if (!nav || nav.querySelector('.site-support-link')) return;
    const tr = TEXT[language()];
    const link = el('a', 'header-nav-link site-support-link');
    link.href = '#apoyar-laqp';
    const heart = el('span', 'site-support-heart', '❤️');
    heart.setAttribute('aria-hidden', 'true');
    link.append(heart, el('span', 'site-support-label', ' ' + tr.nav));
    link.setAttribute('aria-label', tr.nav);
    link.addEventListener('click', event => {
      const target = document.getElementById('apoyar-laqp');
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
    nav.insertBefore(link, nav.querySelector('.site-account-fallback'));
  }

  function loadStyles() {
    if (document.querySelector('link[data-laqp-support]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/laqp-support.css?v=20261110';
    link.dataset.laqpSupport = '';
    document.head.append(link);
  }

  async function init() {
    const getConfig = window.laqpCommunityConfig || (() => fetch('/database/community.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})));
    const options = validOptions(await getConfig());
    if (!options.length) return; // nada configurado: no se muestra ningún botón
    loadStyles();
    mountFooter(options);
    mountDownloads(options);
    // El menú se re-renderiza al cargar; se agrega el acceso cuando ya está listo.
    mountNav();
    const nav = document.querySelector('#header .header-nav');
    if (nav) new MutationObserver(() => mountNav()).observe(nav, { childList: true });
  }

  window.LAQPSupport = { create, validOptions };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
