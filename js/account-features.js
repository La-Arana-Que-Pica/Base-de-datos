'use strict';

(function () {
  const client = () => window.LAQP_SUPABASE || window.LAQPCreateSupabaseClient?.() || null;
  const user = () => window.LAQPAuth?.user || null;
  let renderRevision = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, className, handler) {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  }

  function date(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(parsed);
  }

  function message(target, text, type = '') {
    target.textContent = text;
    target.className = `laqp-form-message${type ? ` is-${type}` : ''}`;
  }

  function safeError(error, fallback) {
    console.warn('[LAqP Cuenta]', error);
    const raw = String(error?.message || '').toLowerCase();
    if (raw.includes('identity') && raw.includes('link')) return 'No pudimos actualizar ese método de acceso.';
    if (raw.includes('email')) return 'Revisá el correo ingresado e intentá otra vez.';
    if (raw.includes('fetch') || raw.includes('network')) return 'Supabase no está disponible temporalmente.';
    return fallback;
  }

  function section(title, emptyText, open = false) {
    const details = el('details', 'laqp-activity-section');
    details.open = open;
    const summary = el('summary');
    summary.append(el('strong', '', title), el('span', 'laqp-activity-count', '…'));
    const body = el('div', 'laqp-activity-section-body');
    body.appendChild(el('p', 'laqp-activity-section-state', emptyText));
    details.append(summary, body);
    return { details, count: summary.lastElementChild, body };
  }

  async function renderSecurity(root, revision) {
    const currentUser = user();
    if (!currentUser || revision !== renderRevision) return;
    root.replaceChildren();

    const emailCard = el('article', 'laqp-setting-card');
    emailCard.append(el('span', 'laqp-setting-label', 'Email de la cuenta · Privado'), el('strong', 'laqp-private-email', currentUser.email || 'No informado'));
    const emailForm = el('form', 'laqp-inline-setting-form');
    const emailLabel = el('label', '', 'Nuevo email');
    const emailInput = el('input');
    emailInput.type = 'email';
    emailInput.name = 'email';
    emailInput.autocomplete = 'email';
    emailInput.required = true;
    emailLabel.appendChild(emailInput);
    const emailSubmit = el('button', 'laqp-secondary-button', 'Cambiar email');
    emailSubmit.type = 'submit';
    const emailMessage = el('p', 'laqp-form-message');
    emailMessage.setAttribute('role', 'status');
    emailForm.append(emailLabel, emailSubmit, emailMessage);
    emailForm.addEventListener('submit', async event => {
      event.preventDefault();
      const nextEmail = emailInput.value.trim();
      if (!nextEmail || !emailInput.checkValidity()) return emailInput.reportValidity();
      emailSubmit.disabled = true;
      message(emailMessage, 'Enviando confirmación…');
      try {
        const redirect = new URL('/mi-cuenta.html', window.location.origin).toString();
        const { error } = await client().auth.updateUser({ email: nextEmail }, { emailRedirectTo: redirect });
        if (error) throw error;
        emailInput.value = '';
        const confirmation = el('strong', '', 'Te enviamos una confirmación a tu correo actual y otra al nuevo. Tenés que confirmar los dos mensajes para completar el cambio de correo.');
        emailMessage.className = 'laqp-form-message is-success';
        emailMessage.replaceChildren(
          confirmation,
          document.createElement('br'),
          document.createTextNode(`Correo actual: ${currentUser.email || 'No informado'}`),
          document.createElement('br'),
          document.createTextNode(`Correo nuevo: ${nextEmail}`),
        );
      } catch (error) {
        message(emailMessage, safeError(error, 'No pudimos iniciar el cambio de email.'), 'error');
      } finally {
        emailSubmit.disabled = false;
      }
    });
    emailCard.append(emailForm);

    const methodsCard = el('article', 'laqp-setting-card');
    methodsCard.append(el('span', 'laqp-setting-label', 'Métodos de acceso'), el('h3', '', 'Identidades vinculadas'));
    const methodsMessage = el('p', 'laqp-form-message');
    methodsMessage.setAttribute('role', 'status');
    try {
      const { data, error } = await client().auth.getUserIdentities();
      if (error) throw error;
      if (revision !== renderRevision) return;
      const identities = data?.identities || [];
      const list = el('ul', 'laqp-access-methods');
      for (const identity of identities) {
        const item = el('li');
        item.append(el('span', 'laqp-access-check', '✓'), el('strong', '', identity.provider === 'google' ? 'Google' : identity.provider === 'email' ? 'Correo electrónico' : identity.provider));
        const description = el('small', '', identity.email || 'Identidad confirmada por Supabase');
        item.appendChild(description);
        if (identity.provider === 'google' && identities.length > 1) {
          const unlink = button('Desvincular', 'laqp-inline-danger', async () => {
            if (!window.confirm('¿Desvincular Google de esta cuenta?')) return;
            unlink.disabled = true;
            try {
              const { error: unlinkError } = await client().auth.unlinkIdentity(identity);
              if (unlinkError) throw unlinkError;
              message(methodsMessage, 'Google fue desvinculado.', 'success');
              mount();
            } catch (error) {
              message(methodsMessage, safeError(error, 'No pudimos desvincular Google.'), 'error');
              unlink.disabled = false;
            }
          });
          item.appendChild(unlink);
        }
        list.appendChild(item);
      }
      methodsCard.appendChild(list);
      if (!identities.some(identity => identity.provider === 'google')) {
        const linkGoogle = button('Vincular Google', 'laqp-secondary-button', async () => {
          linkGoogle.disabled = true;
          message(methodsMessage, 'Abriendo Google…');
          const redirectTo = new URL('/mi-cuenta.html', window.location.origin).toString();
          const { error: linkError } = await client().auth.linkIdentity({ provider: 'google', options: { redirectTo } });
          if (linkError) {
            message(methodsMessage, safeError(linkError, 'No pudimos vincular Google.'), 'error');
            linkGoogle.disabled = false;
          }
        });
        methodsCard.appendChild(linkGoogle);
      }
      methodsCard.appendChild(methodsMessage);
    } catch (error) {
      methodsCard.appendChild(el('p', 'laqp-account-note', safeError(error, 'No pudimos consultar las identidades.')));
    }

    const grid = el('div', 'laqp-security-grid');
    grid.append(emailCard, methodsCard);
    const actions = el('div', 'laqp-account-session-actions');
    const local = button('Cerrar sesión', 'laqp-secondary-button', () => window.LAQPAuth.signOut());
    const global = button('Cerrar todas las sesiones', 'laqp-danger-button', async () => {
      if (!window.confirm('¿Cerrar todas tus sesiones, también en otros dispositivos?')) return;
      global.disabled = true;
      try {
        const { error } = await client().auth.signOut({ scope: 'global' });
        if (error) throw error;
        window.location.assign('/');
      } catch (error) {
        console.warn('[LAqP Cuenta] No se pudo cerrar todas las sesiones.', error);
        window.alert(safeError(error, 'No pudimos cerrar todas las sesiones.'));
        global.disabled = false;
      }
    });
    actions.append(local, global);
    root.append(grid, actions);
  }

  function activityRow(title, subtitle, href = '') {
    const row = el('div', 'laqp-activity-row');
    const copy = el('span');
    if (href) {
      const link = el('a', '', title);
      link.href = href;
      copy.appendChild(link);
    } else copy.appendChild(el('strong', '', title));
    copy.appendChild(el('small', '', subtitle));
    row.appendChild(copy);
    return row;
  }

  async function renderActivity(root, revision) {
    const currentUser = user();
    if (!currentUser || revision !== renderRevision) return;
    root.replaceChildren();
    const definitions = [
      ['comments', 'Mis comentarios', 'Todavía no publicaste comentarios.'],
      ['player', 'Jugadores favoritos', 'Todavía no guardaste jugadores.'],
      ['team', 'Equipos favoritos', 'Todavía no guardaste equipos.'],
      ['tactic', 'Tácticas guardadas', 'Todavía no guardaste tácticas.'],
      ['lineups', 'Alineaciones guardadas', 'Todavía no guardaste alineaciones.'],
      ['ratings', 'Valoraciones', 'Todavía no valoraste contenido.'],
    ];
    const sections = Object.fromEntries(definitions.map(([key, title, empty]) => [key, section(title, empty, key === 'comments')]));
    const list = el('div', 'laqp-activity-sections');
    definitions.forEach(([key]) => list.appendChild(sections[key].details));
    root.appendChild(list);

    try {
      const [commentsResult, savedResult, lineupsResult, ratingsResult] = await Promise.all([
        client().from('comments').select('id,page_type,page_id,content,status,created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20),
        client().from('saved_items').select('item_type,item_id,created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }),
        client().from('saved_lineups').select('id,name,created_at,updated_at').eq('user_id', currentUser.id).order('updated_at', { ascending: false }).limit(20),
        client().from('ratings').select('item_type,item_id,rating,updated_at').eq('user_id', currentUser.id).order('updated_at', { ascending: false }),
      ]);
      for (const result of [commentsResult, savedResult, lineupsResult, ratingsResult]) if (result.error) throw result.error;
      if (revision !== renderRevision) return;

      const comments = commentsResult.data || [];
      sections.comments.count.textContent = String(comments.length);
      if (comments.length) {
        sections.comments.body.replaceChildren();
        for (const comment of comments) {
          const item = await window.LAQPContentIndex.resolve(comment.page_type, comment.page_id);
          const kind = window.LAQPContentIndex.labels[comment.page_type] || 'Contenido';
          const canLink = comment.status === 'visible' && item.url;
          const title = `${kind} · ${item.title}`;
          const excerpt = comment.status === 'deleted' ? 'Comentario eliminado' : comment.status === 'hidden' ? `Oculto por moderación · ${comment.content}` : comment.content;
          const row = activityRow(title, `${date(comment.created_at)} · ${excerpt}`, canLink ? `${item.url}#comment-${comment.id}` : '');
          if (comment.status !== 'visible') row.appendChild(el('span', `laqp-status-pill is-${comment.status}`, comment.status === 'hidden' ? 'Oculto' : 'Eliminado'));
          sections.comments.body.appendChild(row);
        }
      }

      const saved = savedResult.data || [];
      for (const type of ['player', 'team', 'tactic']) {
        const rows = saved.filter(item => item.item_type === type);
        sections[type].count.textContent = String(rows.length);
        if (!rows.length) continue;
        sections[type].body.replaceChildren();
        for (const savedItem of rows) {
          const item = await window.LAQPContentIndex.resolve(type, savedItem.item_id);
          const row = activityRow(item.title, `Guardado el ${date(savedItem.created_at)}`, item.url);
          row.appendChild(button('Quitar', 'laqp-inline-danger', async () => {
            const { error } = await client().from('saved_items').delete().eq('user_id', currentUser.id).eq('item_type', type).eq('item_id', savedItem.item_id);
            if (error) return window.alert(safeError(error, 'No pudimos quitarlo.'));
            mount();
          }));
          sections[type].body.appendChild(row);
        }
      }

      const lineups = lineupsResult.data || [];
      sections.lineups.count.textContent = String(lineups.length);
      if (lineups.length) {
        sections.lineups.body.replaceChildren();
        lineups.forEach(lineup => {
          const row = activityRow(lineup.name, `Actualizada el ${date(lineup.updated_at)}`, `/alineaciones.html?lineup=${encodeURIComponent(lineup.id)}`);
          row.appendChild(button('Eliminar', 'laqp-inline-danger', async () => {
            if (!window.confirm(`¿Eliminar “${lineup.name}”?`)) return;
            const { error } = await client().from('saved_lineups').delete().eq('id', lineup.id).eq('user_id', currentUser.id);
            if (error) return window.alert(safeError(error, 'No pudimos eliminar la alineación.'));
            mount();
          }));
          sections.lineups.body.appendChild(row);
        });
      }

      const ratings = ratingsResult.data || [];
      sections.ratings.count.textContent = String(ratings.length);
      if (ratings.length) {
        sections.ratings.body.replaceChildren();
        for (const rating of ratings) {
          const item = await window.LAQPContentIndex.resolve(rating.item_type, rating.item_id);
          const row = activityRow(item.title, `${'★'.repeat(rating.rating)}${'☆'.repeat(5 - rating.rating)} · ${date(rating.updated_at)}`, item.url);
          row.appendChild(button('Quitar', 'laqp-inline-danger', async () => {
            const { error } = await client().from('ratings').delete().eq('user_id', currentUser.id).eq('item_type', rating.item_type).eq('item_id', rating.item_id);
            if (error) return window.alert(safeError(error, 'No pudimos quitar la valoración.'));
            mount();
          }));
          sections.ratings.body.appendChild(row);
        }
      }
    } catch (error) {
      console.warn('[LAqP Cuenta] No se pudo cargar la actividad.', error);
      root.replaceChildren(el('p', 'laqp-account-state is-error', 'No pudimos cargar tu actividad. Probá de nuevo más tarde.'));
    }
  }

  function mount() {
    const security = document.querySelector('[data-laqp-account-security]');
    const activity = document.querySelector('[data-laqp-account-activity]');
    if (!security && !activity) return;
    const revision = ++renderRevision;
    if (security) void renderSecurity(security, revision);
    if (activity) void renderActivity(activity, revision);
  }

  window.LAQPAccountFeatures = Object.freeze({ mount });
  document.addEventListener('laqp-auth-change', mount);
  document.addEventListener('laqp-profile-change', mount);
  document.addEventListener('laqp-account-render', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
