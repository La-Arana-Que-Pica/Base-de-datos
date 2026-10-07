'use strict';

(function () {
  const LABELS = { player: 'Jugador', team: 'Equipo', tactic: 'Táctica', download: 'Option File' };
  let indexPromise = null;

  async function load() {
    if (!indexPromise) {
      indexPromise = fetch('/database/content-index.json', { credentials: 'same-origin' })
        .then(response => {
          if (!response.ok) throw new Error(`content-index: HTTP ${response.status}`);
          return response.json();
        })
        .then(payload => payload?.items || {})
        .catch(error => {
          indexPromise = null;
          console.warn('[LAqP Contenido] No se pudo cargar el índice estático.', error);
          return {};
        });
    }
    return indexPromise;
  }

  async function resolve(type, id) {
    const normalizedType = String(type || '').trim();
    const normalizedId = String(id || '').trim();
    const items = await load();
    const found = items[`${normalizedType}:${normalizedId}`];
    return found || {
      title: `${LABELS[normalizedType] || 'Contenido'} ${normalizedId}`.trim(),
      url: '',
    };
  }

  async function commentLink(type, id, commentId) {
    const item = await resolve(type, id);
    return item.url && commentId ? `${item.url}#comment-${encodeURIComponent(commentId)}` : item.url;
  }

  window.LAQPContentIndex = Object.freeze({ load, resolve, commentLink, labels: LABELS });
})();
