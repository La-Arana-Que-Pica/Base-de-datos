'use strict';

(function () {
  const client = () => window.LAQP_SUPABASE || null;
  const user = () => window.LAQPAuth?.user || null;
  const host = document.querySelector('[data-laqp-comments]');
  if (!host) return;
  const itemType = host.dataset.pageType || '';
  const itemId = host.dataset.pageId || '';
  if (!itemId || !['player', 'team', 'tactic', 'download'].includes(itemType)) return;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function render() {
    let panel = document.querySelector('[data-laqp-user-content-actions]');
    if (!panel) {
      panel = el('section', 'laqp-user-content-actions');
      panel.dataset.laqpUserContentActions = '';
      host.before(panel);
    }
    panel.replaceChildren();
    const currentUser = user();

    if (['player', 'team', 'tactic'].includes(itemType)) {
      let saved = false;
      if (currentUser) {
        const { data, error } = await client().from('saved_items').select('item_id').eq('user_id', currentUser.id).eq('item_type', itemType).eq('item_id', itemId).maybeSingle();
        if (!error) saved = Boolean(data);
      }
      const label = itemType === 'tactic'
        ? (saved ? 'Quitar de guardadas' : 'Guardar táctica')
        : (saved ? '♥ Quitar favorito' : '♡ Agregar favorito');
      const saveButton = el('button', `laqp-save-item-button${saved ? ' is-saved' : ''}`, label);
      saveButton.type = 'button';
      saveButton.addEventListener('click', async () => {
        if (!user()) return window.LAQPAuth?.open('login');
        saveButton.disabled = true;
        const query = client().from('saved_items');
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
      panel.appendChild(saveButton);
    }

    if (['tactic', 'download'].includes(itemType)) {
      let currentRating = 0;
      if (currentUser) {
        const { data, error } = await client().from('ratings').select('rating').eq('user_id', currentUser.id).eq('item_type', itemType).eq('item_id', itemId).maybeSingle();
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
          const { error } = await client().from('ratings').upsert({ user_id: user().id, item_type: itemType, item_id: itemId, rating: value }, { onConflict: 'user_id,item_type,item_id' });
          if (error) return console.warn('[LAqP Valoraciones]', error);
          void render();
        });
        stars.appendChild(star);
      }
      if (currentRating) {
        const remove = el('button', 'laqp-rating-remove', 'Quitar');
        remove.type = 'button';
        remove.addEventListener('click', async () => {
          const { error } = await client().from('ratings').delete().eq('user_id', user().id).eq('item_type', itemType).eq('item_id', itemId);
          if (error) return console.warn('[LAqP Valoraciones]', error);
          void render();
        });
        rating.append(stars, remove);
      } else rating.appendChild(stars);
      panel.appendChild(rating);
    }
  }

  document.addEventListener('laqp-auth-change', render);
  void render();
})();
