/* Portal de Entretenimiento LAqP: tarjetas, búsqueda aproximada, filtros, favoritos y recientes. */
(function () {
  'use strict';
  const catalog = window.LAQP_ENTERTAINMENT || { categories: [], items: [] };
  const store = window.LAQPEntertainmentStore;
  const fuzzy = window.LAQPHangman && window.LAQPHangman.fuzzyScore;
  const $ = selector => document.querySelector(selector);
  const state = { query: '', filter: 'all' };

  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6 4.3 13a4.9 4.9 0 0 1 0-7 4.9 4.9 0 0 1 6.9 0l.8.8.8-.8a4.9 4.9 0 0 1 6.9 7Z"/></svg>';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  const available = item => item.status === 'available';
  const byId = id => catalog.items.find(item => item.id === id);

  function haystack(item) {
    const category = catalog.categories.find(entry => entry.key === item.category);
    return [item.name, item.categoryLabel, category && category.filterLabel, item.description, item.keywords, item.statusLabel].join(' ');
  }

  function relativeTime(iso) {
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (!Number.isFinite(minutes)) return '';
    if (minutes < 1) return 'recién';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'ayer' : `hace ${days} días`;
  }

  function accessLink(item, className, label) {
    if (!available(item)) return `<span class="${className} is-disabled" aria-disabled="true">${escapeHtml(item.statusLabel || 'Próximamente')}</span>`;
    return `<a class="${className}" href="${escapeHtml(item.href)}" data-visit="${escapeHtml(item.id)}">${escapeHtml(label || item.cta || 'Jugar')} <span aria-hidden="true">→</span></a>`;
  }

  function cardHtml(item, favorites) {
    const favorite = favorites.includes(item.id);
    const media = `<img src="${escapeHtml(item.image)}" alt="" width="640" height="400" loading="lazy">`;
    const badge = item.badge && available(item) ? `<span class="ent-badge">${escapeHtml(item.badge)}</span>` : '';
    const soon = !available(item) ? `<span class="ent-badge is-soon">${escapeHtml(item.statusLabel || 'Próximamente')}</span>` : '';
    const title = available(item)
      ? `<a href="${escapeHtml(item.href)}" data-visit="${escapeHtml(item.id)}">${escapeHtml(item.name)}</a>`
      : escapeHtml(item.name);
    return `<article class="ent-card${available(item) ? '' : ' is-soon'}" data-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}">
      <div class="ent-card-media">${media}${badge}${soon}</div>
      <button type="button" class="ent-fav" data-favorite="${escapeHtml(item.id)}" aria-pressed="${favorite}" aria-label="${favorite ? 'Quitar' : 'Agregar'} ${escapeHtml(item.name)} ${favorite ? 'de' : 'a'} favoritos" title="${favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}">${HEART}</button>
      <div class="ent-card-body">
        <span class="ent-card-cat">${escapeHtml(item.categoryLabel)}</span>
        <h3>${title}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="ent-card-foot">${accessLink(item, 'ent-play')}</div>
      </div>
    </article>`;
  }

  function visibleItems(favorites) {
    let items = catalog.items.slice();
    if (state.filter === 'favorites') items = items.filter(item => favorites.includes(item.id));
    else if (state.filter !== 'all') items = items.filter(item => item.category === state.filter);
    const scores = new Map(items.map(item => [item.id, state.query && fuzzy ? fuzzy(state.query, haystack(item)) : 1]));
    items = items.filter(item => scores.get(item.id) > 0);
    return items.sort((a, b) =>
      (favorites.includes(b.id) - favorites.includes(a.id))
      || (scores.get(b.id) - scores.get(a.id))
      || (available(b) - available(a))
      || (Boolean(b.featured) - Boolean(a.featured))
      || String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
  }

  function renderFilters(favorites) {
    const chips = [{ key: 'all', label: 'Todos', count: catalog.items.length }];
    catalog.categories.forEach(category => {
      const count = catalog.items.filter(item => item.category === category.key).length;
      if (count) chips.push({ key: category.key, label: category.filterLabel, count });
    });
    chips.push({ key: 'favorites', label: 'Favoritos', count: favorites.length, icon: true });
    if (!chips.some(chip => chip.key === state.filter)) state.filter = 'all';
    $('#ent-filters').innerHTML = chips.map(chip => `<button type="button" class="ent-chip${chip.icon ? ' is-fav' : ''}" data-filter="${chip.key}" aria-pressed="${state.filter === chip.key}">${chip.icon ? HEART : ''}${escapeHtml(chip.label)} <span>${chip.count}</span></button>`).join('');
  }

  function renderGrid(favorites) {
    const items = visibleItems(favorites);
    $('#ent-grid').innerHTML = items.map(item => cardHtml(item, favorites)).join('');
    const empty = $('#ent-empty');
    empty.hidden = items.length > 0;
    if (!items.length) {
      const favoritesEmpty = state.filter === 'favorites' && !state.query;
      $('#ent-empty-title').textContent = favoritesEmpty ? 'Todavía no tenés favoritos' : 'No encontramos esa experiencia';
      $('#ent-empty-text').textContent = favoritesEmpty ? 'Tocá el corazón de una tarjeta para guardarla acá.' : 'Probá con otra palabra o mirá todo el catálogo.';
    }
    const total = items.length;
    $('#ent-status').textContent = state.query
      ? `${total} ${total === 1 ? 'resultado' : 'resultados'} para «${state.query}»`
      : `${total} ${total === 1 ? 'experiencia' : 'experiencias'}`;
  }

  function renderFeatured() {
    const item = catalog.items.find(entry => entry.featured && available(entry));
    const host = $('#ent-featured');
    if (!item) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = `<div class="ent-featured-copy">
        <span class="ent-kicker">${escapeHtml(item.badge ? `${item.badge} lanzamiento` : 'Destacado')}</span>
        <h2>${escapeHtml(item.name)}</h2>
        <p>${escapeHtml(item.featuredText || item.description)}</p>
        <div class="ent-featured-actions">${accessLink(item, 'ent-play is-large', 'Jugar ahora')}<span class="ent-card-cat">${escapeHtml(item.categoryLabel)}</span></div>
      </div>
      <a class="ent-featured-art" href="${escapeHtml(item.href)}" data-visit="${escapeHtml(item.id)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(item.image)}" alt="" width="640" height="400"></a>`;
  }

  function renderContinue() {
    const host = $('#ent-continue');
    const resumable = catalog.items.filter(available).map(item => ({ item, resume: store && store.resume(item) })).filter(entry => entry.resume);
    host.hidden = !resumable.length;
    host.innerHTML = resumable.map(({ item, resume }) => `<div class="ent-continue-card">
        <img src="${escapeHtml(item.image)}" alt="" width="96" height="60">
        <div><span class="ent-kicker">Continuar jugando</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(resume.label)}</small></div>
        <a class="ent-play" href="${escapeHtml(resume.href || item.href)}" data-visit="${escapeHtml(item.id)}">Continuar <span aria-hidden="true">→</span></a>
      </div>`).join('');
  }

  function renderRecent() {
    const host = $('#ent-recent');
    const recent = (store ? store.recent() : []).map(entry => ({ entry, item: byId(entry.id) })).filter(({ item }) => item && available(item));
    host.hidden = !recent.length;
    $('#ent-recent-list').innerHTML = recent.map(({ entry, item }) => `<a class="ent-recent-item" href="${escapeHtml(item.href)}" data-visit="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image)}" alt="" width="56" height="35" loading="lazy"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(relativeTime(entry.at))}</small></span></a>`).join('');
  }

  function render() {
    const favorites = store ? store.favorites() : [];
    renderFilters(favorites);
    renderGrid(favorites);
    renderRecent();
  }

  function init() {
    const searchInput = $('#ent-query');
    $('#ent-search').hidden = false;
    $('#ent-search').addEventListener('submit', event => { event.preventDefault(); });
    searchInput.addEventListener('input', () => { state.query = searchInput.value.trim(); renderGrid(store ? store.favorites() : []); });
    $('#ent-filters').addEventListener('click', event => {
      const chip = event.target.closest('[data-filter]');
      if (!chip) return;
      state.filter = chip.dataset.filter;
      render();
    });
    document.addEventListener('click', event => {
      const favorite = event.target.closest('[data-favorite]');
      if (favorite) {
        const added = store && store.toggleFavorite(favorite.dataset.favorite);
        render();
        const again = document.querySelector(`[data-favorite="${favorite.dataset.favorite}"]`);
        if (again) again.focus();
        $('#ent-live').textContent = added ? 'Agregado a favoritos' : 'Quitado de favoritos';
        return;
      }
      const visit = event.target.closest('[data-visit]');
      if (visit && store) store.recordVisit(visit.dataset.visit);
    });
    document.querySelectorAll('[data-clear-search]').forEach(button => button.addEventListener('click', () => {
      searchInput.value = ''; state.query = ''; state.filter = 'all'; render(); searchInput.focus();
    }));
    renderFeatured();
    renderContinue();
    render();
    window.addEventListener('pageshow', () => { renderContinue(); render(); });
    document.documentElement.dataset.entertainmentReady = 'true';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
