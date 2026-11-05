'use strict';

(function () {
  if (window.LAQPUserContent) {
    window.LAQPUserContent.mount();
    return;
  }

  const VALID_TYPES = new Set(['player', 'team', 'tactic', 'download', 'manager']);
  const SAVED_TYPES = new Set(['player', 'team', 'tactic', 'manager']);
  const RATING_TYPES = new Set(['tactic', 'download']);
  const state = { host: null, panel: null, itemType: '', itemId: '', revision: 0 };
  const client = () => window.LAQP_SUPABASE || window.LAQPCreateSupabaseClient?.() || null;
  const user = () => window.LAQPAuth?.user || null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function canonicalPanel(host) {
    const panels = [...document.querySelectorAll('[data-laqp-user-content-actions]')];
    let panel = panels.find(candidate => candidate.nextElementSibling === host) || panels[0] || null;
    panels.forEach(candidate => {
      if (candidate !== panel) candidate.remove();
    });
    if (!panel) {
      panel = el('section', 'laqp-user-content-actions');
      panel.dataset.laqpUserContentActions = '';
    }
    if (panel.nextElementSibling !== host) host.before(panel);
    return panel;
  }

  async function savedControl(itemType, itemId, currentUser) {
    let saved = false;
    const supabase = client();
    if (currentUser && supabase) {
      const { data, error } = await supabase.from('saved_items').select('item_id').eq('user_id', currentUser.id).eq('item_type', itemType).eq('item_id', itemId).maybeSingle();
      if (!error) saved = Boolean(data);
    }
    const label = itemType === 'tactic'
      ? (saved ? 'Quitar de guardadas' : 'Guardar táctica')
      : (saved ? '♥ Quitar favorito' : '♡ Agregar favorito');
    const saveButton = el('button', `laqp-save-item-button${saved ? ' is-saved' : ''}`, label);
    saveButton.type = 'button';
    saveButton.addEventListener('click', async () => {
      if (!user()) return window.LAQPAuth?.open('login');
      const activeClient = client();
      if (!activeClient) return;
      saveButton.disabled = true;
      const query = activeClient.from('saved_items');
      const result = saved
        ? await query.delete().eq('user_id', user().id).eq('item_type', itemType).eq('item_id', itemId)
        : await query.insert({ user_id: user().id, item_type: itemType, item_id: itemId });
      if (result.error) {
        console.warn('[LAqP Guardados]', result.error);
        saveButton.disabled = false;
        return;
      }
      void render();
    });
    return saveButton;
  }

  async function ratingControl(itemType, itemId, currentUser) {
    let currentRating = 0;
    const supabase = client();
    if (currentUser && supabase) {
      const { data, error } = await supabase.from('ratings').select('rating').eq('user_id', currentUser.id).eq('item_type', itemType).eq('item_id', itemId).maybeSingle();
      if (!error) currentRating = Number(data?.rating || 0);
    }
    const rating = el('div', 'laqp-rating-control');
    rating.appendChild(el('span', '', 'Tu valoración'));
    const stars = el('div', 'laqp-rating-stars');
    stars.setAttribute('role', 'radiogroup');
    for (let value = 1; value <= 5; value += 1) {
      const star = el('button', value <= currentRating ? 'is-active' : '', value <= currentRating ? '★' : '☆');
      star.type = 'button';
      star.setAttribute('aria-label', `${value} estrella${value === 1 ? '' : 's'}`);
      star.setAttribute('aria-checked', String(value === currentRating));
      star.setAttribute('role', 'radio');
      star.addEventListener('click', async () => {
        if (!user()) return window.LAQPAuth?.open('login');
        const activeClient = client();
        if (!activeClient) return;
        const { error } = await activeClient.from('ratings').upsert({ user_id: user().id, item_type: itemType, item_id: itemId, rating: value }, { onConflict: 'user_id,item_type,item_id' });
        if (error) return console.warn('[LAqP Valoraciones]', error);
        void render();
      });
      stars.appendChild(star);
    }
    if (currentRating) {
      const remove = el('button', 'laqp-rating-remove', 'Quitar');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        const activeClient = client();
        if (!activeClient || !user()) return;
        const { error } = await activeClient.from('ratings').delete().eq('user_id', user().id).eq('item_type', itemType).eq('item_id', itemId);
        if (error) return console.warn('[LAqP Valoraciones]', error);
        void render();
      });
      rating.append(stars, remove);
    } else rating.appendChild(stars);
    return rating;
  }

  async function render() {
    const { host, panel, itemType, itemId } = state;
    if (!host?.isConnected || !panel?.isConnected) return;
    const revision = ++state.revision;
    const currentUser = user();
    const controls = [];
    if (SAVED_TYPES.has(itemType)) controls.push(await savedControl(itemType, itemId, currentUser));
    if (RATING_TYPES.has(itemType)) controls.push(await ratingControl(itemType, itemId, currentUser));
    if (revision !== state.revision || state.host !== host || !host.isConnected) return;
    panel.replaceChildren(...controls);
  }

  function mount() {
    const host = document.querySelector('[data-laqp-comments]');
    if (!host) return;
    const itemType = host.dataset.pageType || '';
    const itemId = host.dataset.pageId || '';
    if (!VALID_TYPES.has(itemType) || !itemId) return;
    const panel = canonicalPanel(host);
    const unchanged = state.host === host && state.panel === panel && state.itemType === itemType && state.itemId === itemId;
    state.host = host;
    state.panel = panel;
    state.itemType = itemType;
    state.itemId = itemId;
    panel.dataset.laqpUserContentMounted = 'true';
    if (!unchanged || !panel.childElementCount) void render();
  }

  window.LAQPUserContent = Object.freeze({ mount, render });
  document.addEventListener('laqp-auth-change', render);
  document.addEventListener('laqp-social-refresh', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
