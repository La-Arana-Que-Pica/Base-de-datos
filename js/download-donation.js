const STORAGE_KEY = 'laqp_download_donation_shown_at';
export const DATABASE_SHOWN_KEY = 'laqp_database_donation_shown_at';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const PROVIDERS = [
  { key: 'mercadoPagoUrl', id: 'mercado_pago', host: 'link.mercadopago.com.ar', label: '🇦🇷 Mercado Pago' },
  { key: 'paypalUrl', id: 'paypal', host: 'paypal.me', label: '🌎 PayPal' },
];
let pending = false;

function track(name, tool, params = {}) {
  try {
    window.LAQPAnalytics?.event(name, { tool, ...params });
  } catch { /* La analítica es opcional. */ }
}

function isDue(key, cooldown) {
  const last = localStorage.getItem(key);
  return last === null || Date.now() - Number(last) >= cooldown;
}

function createNotice(support, tool, previousFocus) {
  const notice = document.createElement('section');
  notice.className = 'download-donation';
  notice.setAttribute('aria-labelledby', 'download-donation-title');
  notice.innerHTML = `
    <button class="download-donation-close" type="button" aria-label="Cerrar invitación a donar">×</button>
    <h2 id="download-donation-title"></h2>
    <p>LAqP es un proyecto gratuito. Si te gustó y querés apoyar el desarrollo de nuevas herramientas y actualizaciones, podés colaborar con una donación voluntaria. ¡Cualquier aporte ayuda muchísimo! 🕷️</p>
    <div class="download-donation-links"></div>
    <p class="download-donation-note">Donar es completamente opcional. ¡Gracias por usar LAqP!</p>
    <span class="download-donation-status" role="status"></span>
  `;
  notice.querySelector('h2').textContent = tool === 'database'
    ? '❤️ ¿Te sirve la base de datos?'
    : '❤️ ¿Te sirvió esta herramienta?';
  const links = notice.querySelector('.download-donation-links');
  for (const { key, id, host, label } of PROVIDERS) {
    let url;
    try { url = new URL(support?.[key]); } catch { continue; }
    if (url.origin !== `https://${host}` || url.username || url.password) continue;
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    link.setAttribute('aria-label', `${label} (se abre en una pestaña nueva)`);
    const recordClick = () => track('donation_invite_click', tool, { donation_provider: id });
    link.addEventListener('click', recordClick);
    link.addEventListener('auxclick', event => { if (event.button === 1) recordClick(); });
    links.append(link);
  }
  if (!links.childElementCount) return null;

  function close() {
    const restoreFocus = notice.contains(document.activeElement);
    notice.remove();
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  notice.querySelector('button').addEventListener('click', close);
  notice.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  return notice;
}

async function offerDonation(tool, previousFocus, key = STORAGE_KEY, cooldown = THIRTY_DAYS) {
  const canShow = () => document.visibilityState === 'visible'
    && (tool !== 'database' || document.hasFocus())
    && !document.querySelector('.download-donation')
    && isDue(key, cooldown);
  try {
    if (!canShow()) return;
    const config = await (window.laqpCommunityConfig?.() ?? fetch('/database/community.json').then(response => response.ok ? response.json() : null));
    const notice = createNotice(config?.support, tool, previousFocus);
    if (!notice) return;
    const show = () => {
      if (!canShow()) return;
      const now = String(Date.now());
      localStorage.setItem(key, now);
      if (localStorage.getItem(key) !== now) return;
      document.body.append(notice);
      track('donation_invite_shown', tool);
      requestAnimationFrame(() => {
        notice.querySelector('[role="status"]').textContent = 'Invitación opcional para apoyar a LAqP.';
      });
    };
    if (navigator.locks) await navigator.locks.request(key, show);
    else show();
  } catch { /* Ante un fallo, la invitación se omite. */ }
  finally { pending = false; }
}

export function offerDatabaseDonation() {
  return offerDonation('database', document.activeElement, DATABASE_SHOWN_KEY, Infinity);
}

// La activación del enlace sigue siendo síncrona, dentro del flujo de exportación.
// El navegador no expone a la página el resultado de la transferencia.
export function clickDownload(link, tool) {
  const previousFocus = document.activeElement;
  let activation;
  const observeClick = event => { activation = event; };
  link.addEventListener('click', observeClick, { once: true });
  try { link.click(); }
  finally { link.removeEventListener('click', observeClick); }
  if (!activation || activation.defaultPrevented) return;
  window.LAQPAnalytics?.download(tool, link.download);
  if (pending) return;
  pending = true;
  setTimeout(() => void offerDonation(tool, previousFocus), 0);
}
