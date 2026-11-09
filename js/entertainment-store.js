/**
 * Preferencias locales de Entretenimiento (favoritos y últimos jugados).
 * Sólo localStorage: no requiere cuenta ni Supabase. Si el navegador bloquea
 * el almacenamiento, todo sigue funcionando sin recordar nada.
 */
(function () {
  'use strict';
  const KEY = 'laqp-entertainment-v1';
  const MAX_RECENT = 6;

  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (data && Array.isArray(data.favorites) && Array.isArray(data.recent)) return data;
    } catch { /* almacenamiento no disponible o dañado */ }
    return { version: 1, favorites: [], recent: [] };
  }

  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }

  window.LAQPEntertainmentStore = {
    favorites() { return read().favorites.slice(); },
    isFavorite(id) { return read().favorites.includes(id); },
    toggleFavorite(id) {
      const data = read();
      const index = data.favorites.indexOf(id);
      if (index >= 0) data.favorites.splice(index, 1);
      else data.favorites.unshift(id);
      write(data);
      return index < 0;
    },
    recordVisit(id) {
      const data = read();
      data.recent = [{ id, at: new Date().toISOString() }, ...data.recent.filter(item => item.id !== id)].slice(0, MAX_RECENT);
      write(data);
    },
    recent() { return read().recent.slice(); },
    resume(item) {
      if (!item || !item.resumeKey) return null;
      const state = readJson(item.resumeKey);
      return state && state.active && state.label ? state : null;
    },
    writeResume(key, state) {
      try {
        if (state) localStorage.setItem(key, JSON.stringify({ ...state, active: true, updatedAt: new Date().toISOString() }));
        else localStorage.removeItem(key);
      } catch { /* sin almacenamiento */ }
    },
  };
}());
