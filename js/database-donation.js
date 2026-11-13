import { DATABASE_SHOWN_KEY, offerDatabaseDonation } from './download-donation.js?v=20261113-ga4';

const USE_KEY = 'laqp_database_donation_active_ms';
const REQUIRED_TIME = 20 * 60_000;
const IDLE_TIME = 90_000;
const CHECK_INTERVAL = 15_000;

export function startDatabaseDonation() {
  const listeners = new AbortController();
  const options = { signal: listeners.signal, passive: true };
  let timer;
  let lastActivity = -Infinity;
  let countedUntil = performance.now();
  let trying = false;
  let styles;

  function stop() {
    listeners.abort();
    clearInterval(timer);
  }

  function loadStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/download-donation.css?v=20261113-ga4';
    return new Promise((resolve, reject) => {
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    });
  }

  const isActive = () => document.visibilityState === 'visible' && document.hasFocus();
  function record(flush = false) {
    const now = performance.now();
    const elapsed = Math.max(0, Math.min(now, lastActivity + IDLE_TIME) - countedUntil);
    countedUntil = now;
    try {
      if (localStorage.getItem(DATABASE_SHOWN_KEY) !== null) {
        stop();
        return;
      }
      if (!elapsed || (!flush && !isActive())) return;
      const stored = Number(localStorage.getItem(USE_KEY));
      const total = Math.min(REQUIRED_TIME, (Number.isFinite(stored) && stored > 0 ? stored : 0) + elapsed);
      localStorage.setItem(USE_KEY, String(total));
      if (total < REQUIRED_TIME || flush || trying) return;
      trying = true;
      styles ??= loadStyles();
      styles.then(offerDatabaseDonation).then(() => {
        if (localStorage.getItem(DATABASE_SHOWN_KEY) === null) return;
        stop();
        localStorage.removeItem(USE_KEY);
      }).catch(stop).finally(() => { trying = false; });
    } catch { stop(); }
  }

  function pause() {
    record(true);
    lastActivity = -Infinity;
  }

  function activity(event) {
    if (!event.isTrusted || !isActive()) return;
    const now = performance.now();
    if (now - lastActivity >= IDLE_TIME) {
      record();
      countedUntil = now;
    }
    lastActivity = now;
  }

  try { if (localStorage.getItem(DATABASE_SHOWN_KEY) !== null) return; }
  catch { return; }
  for (const type of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(type, activity, { ...options, capture: true });
  window.addEventListener('blur', pause, options);
  window.addEventListener('pagehide', pause, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, options);
  timer = setInterval(record, CHECK_INTERVAL);
}
