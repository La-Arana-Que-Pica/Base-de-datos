'use strict';

(function () {
  const PAGE_SIZE = 20;
  const MAX_LENGTH = 1000;
  const state = {
    host: null,
    pageType: '',
    pageId: '',
    rows: [],
    offset: 0,
    hasMore: false,
    visibleCount: 0,
    busy: false,
    replyTo: null,
    editId: null,
    hashTargetId: '',
    hashTargetLoaded: false,
  };

  const client = () => window.LAQP_SUPABASE || null;
  const currentUser = () => window.LAQPAuth?.user || null;
  const currentProfile = () => window.LAQPAuth?.profile || null;

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function button(text, className, handler) {
    const item = node('button', className, text);
    item.type = 'button';
    item.addEventListener('click', handler);
    return item;
  }

  function profileFor(row) {
    if (Array.isArray(row.profile)) return row.profile[0] || {};
    return row.profile || {};
  }

  function authorName(row) {
    const author = profileFor(row);
    return author.display_name || author.username || 'Usuario de LAqP';
  }

  function avatarUrl(row) {
    const raw = String(profileFor(row).avatar_url || '');
    if (/^\/assets\/avatars\/avatar-[1-4]\.svg$/.test(raw)) return raw;
    if (/^https:\/\/lh3\.googleusercontent\.com\//i.test(raw)) return raw;
    const projectUrl = window.LAQP_SUPABASE_CONFIG?.url || 'https://npyvbqzgcdoujfxefsdr.supabase.co';
    if (raw.startsWith(`${projectUrl}/storage/v1/object/public/avatars/`)) return raw;
    return '/assets/avatars/avatar-1.svg';
  }

  function publicProfileUrl(userId) {
    return `/perfil/?id=${encodeURIComponent(String(userId || ''))}`;
  }

  function formattedDate(value) {
    try {
      return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return '';
    }
  }

  function wasEdited(row) {
    return row.updated_at && row.created_at && (new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 1000);
  }

  function errorMessage(error, fallback) {
    if (error) console.warn('[LAqP Comentarios]', error);
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '');
    if (code === '23505') return 'Ya reportaste este comentario.';
    if (message.includes('demasiado rápido') || message.includes('too quickly')) return 'Esperá unos segundos antes de volver a publicar.';
    if (message.includes('1000') || message.includes('too long')) return 'El comentario supera el límite de 1000 caracteres.';
    if (message.includes('parent') || message.includes('respuesta')) return 'No se pudo responder a ese comentario.';
    if (message.includes('fetch') || message.includes('network')) return 'Supabase no está disponible temporalmente. Probá de nuevo más tarde.';
    return fallback;
  }

  function commentSelect() {
    return 'id,user_id,page_type,page_id,parent_id,content,status,created_at,updated_at,profile:profiles!comments_user_id_fkey(username,display_name,avatar_url)';
  }

  function targetIdFromHash() {
    const match = window.location.hash.match(/^#comment-([0-9a-f-]{36})$/i);
    return match ? match[1] : '';
  }

  function focusHashTarget() {
    if (!state.hashTargetId) return;
    const target = document.getElementById(`comment-${state.hashTargetId}`);
    if (!target) return;
    target.classList.remove('is-highlighted');
    void target.offsetWidth;
    target.classList.add('is-highlighted');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => target.classList.remove('is-highlighted'), 3600);
  }

  async function loadHashTarget() {
    const targetId = targetIdFromHash();
    if (!targetId || !client()) return;
    state.hashTargetId = targetId;
    if (findComment(targetId)) {
      state.hashTargetLoaded = true;
      window.setTimeout(focusHashTarget, 40);
      return;
    }
    if (state.hashTargetLoaded) return;
    state.hashTargetLoaded = true;
    try {
      const targetResult = await client()
        .from('comments')
        .select(commentSelect())
        .eq('id', targetId)
        .eq('page_type', state.pageType)
        .eq('page_id', state.pageId)
        .eq('status', 'visible')
        .maybeSingle();
      if (targetResult.error) throw targetResult.error;
      const target = targetResult.data;
      if (!target) return;
      const parentId = target.parent_id || target.id;
      let parent = target.parent_id ? null : target;
      if (!parent) {
        const parentResult = await client()
          .from('comments')
          .select(commentSelect())
          .eq('id', parentId)
          .maybeSingle();
        if (parentResult.error) throw parentResult.error;
        parent = parentResult.data;
      }
      if (!parent) return;
      const repliesResult = await client()
        .from('comments')
        .select(commentSelect())
        .eq('parent_id', parentId)
        .order('created_at', { ascending: true });
      if (repliesResult.error) throw repliesResult.error;
      const thread = { ...parent, replies: repliesResult.data || [] };
      const existing = state.rows.findIndex(row => row.id === parentId);
      if (existing >= 0) state.rows[existing] = thread;
      else state.rows.unshift(thread);
      render();
      window.setTimeout(focusHashTarget, 40);
    } catch (error) {
      console.warn('[LAqP Comentarios] No se pudo cargar el comentario enlazado.', error);
    }
  }

  async function fetchPage(reset = false) {
    if (state.busy || !client()) return;
    state.busy = true;
    if (reset) {
      state.offset = 0;
      state.rows = [];
    }
    renderLoading(reset ? 'Cargando comentarios…' : 'Cargando más…');
    try {
      const from = state.offset;
      const to = from + PAGE_SIZE - 1;
      const [mainResult, countResult] = await Promise.all([
        client()
          .from('comments')
          .select(commentSelect())
          .eq('page_type', state.pageType)
          .eq('page_id', state.pageId)
          .is('parent_id', null)
          .order('created_at', { ascending: false })
          .range(from, to),
        client()
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .eq('page_type', state.pageType)
          .eq('page_id', state.pageId)
          .eq('status', 'visible'),
      ]);
      if (mainResult.error) throw mainResult.error;
      if (countResult.error) throw countResult.error;
      const mains = mainResult.data || [];
      const ids = mains.map(item => item.id);
      let replies = [];
      if (ids.length) {
        const replyResult = await client()
          .from('comments')
          .select(commentSelect())
          .in('parent_id', ids)
          .order('created_at', { ascending: true });
        if (replyResult.error) throw replyResult.error;
        replies = replyResult.data || [];
      }
      const byParent = new Map();
      replies.forEach(reply => {
        const values = byParent.get(reply.parent_id) || [];
        values.push(reply);
        byParent.set(reply.parent_id, values);
      });
      const combined = mains.map(item => ({ ...item, replies: byParent.get(item.id) || [] }));
      if (reset) state.rows = combined;
      else {
        const loadedIds = new Set(state.rows.map(item => item.id));
        state.rows = [...state.rows, ...combined.filter(item => !loadedIds.has(item.id))];
      }
      state.offset += mains.length;
      state.hasMore = mains.length === PAGE_SIZE;
      state.visibleCount = countResult.count || 0;
      render();
    } catch (error) {
      renderFailure(errorMessage(error, 'No pudimos cargar los comentarios.'));
    } finally {
      state.busy = false;
      if (targetIdFromHash()) void loadHashTarget();
    }
  }

  function renderLoading(message) {
    const list = state.host?.querySelector('[data-comments-list]');
    if (!list) return;
    if (!state.rows.length) list.replaceChildren(node('p', 'laqp-comments-state', message));
    const more = state.host.querySelector('[data-comments-more]');
    if (more) more.disabled = true;
  }

  function renderFailure(message) {
    const list = state.host?.querySelector('[data-comments-list]');
    if (!list) return;
    const box = node('div', 'laqp-comments-state is-error');
    box.append(node('p', '', message), button('Reintentar', 'laqp-secondary-button', () => fetchPage(true)));
    list.replaceChildren(box);
  }

  function buildComposer() {
    const wrapper = node('div', 'laqp-comment-composer');
    if (!currentUser()) {
      const prompt = node('div', 'laqp-comments-login');
      prompt.append(node('p', '', 'Iniciá sesión para comentar'), button('Iniciar sesión', 'laqp-primary-button', () => window.LAQPAuth?.open('login')));
      wrapper.appendChild(prompt);
      return wrapper;
    }
    const author = node('div', 'laqp-composer-author');
    const image = node('img');
    image.src = avatarUrl({ profile: currentProfile() });
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => { image.src = '/assets/avatars/avatar-1.svg'; }, { once: true });
    author.append(image, node('strong', '', currentProfile()?.display_name || currentProfile()?.username || 'Tu comentario'));

    const form = node('form', 'laqp-comment-form');
    const context = node('div', 'laqp-composer-context');
    context.hidden = true;
    const contextText = node('span');
    const cancel = button('Cancelar', '', () => {
      state.replyTo = null;
      state.editId = null;
      render();
    });
    context.append(contextText, cancel);
    const textarea = node('textarea');
    textarea.name = 'content';
    textarea.maxLength = MAX_LENGTH;
    textarea.rows = 4;
    textarea.placeholder = 'Escribí tu comentario…';
    textarea.required = true;
    const footer = node('div', 'laqp-comment-form-footer');
    const counter = node('span', '', `0/${MAX_LENGTH}`);
    const submit = node('button', 'laqp-primary-button', 'Publicar');
    submit.type = 'submit';
    footer.append(counter, submit);
    const message = node('p', 'laqp-form-message');
    message.setAttribute('role', 'status');
    textarea.addEventListener('input', () => { counter.textContent = `${textarea.value.length}/${MAX_LENGTH}`; });
    form.addEventListener('submit', event => submitComment(event, textarea, submit, message));
    form.append(context, textarea, footer, message);
    wrapper.append(author, form);

    if (state.replyTo) {
      context.hidden = false;
      contextText.textContent = `Respondiendo a ${authorName(state.replyTo)}`;
      submit.textContent = 'Responder';
      setTimeout(() => textarea.focus(), 0);
    } else if (state.editId) {
      const editing = findComment(state.editId);
      context.hidden = false;
      contextText.textContent = 'Editando tu comentario';
      textarea.value = editing?.content || '';
      counter.textContent = `${textarea.value.length}/${MAX_LENGTH}`;
      submit.textContent = 'Guardar cambios';
      setTimeout(() => textarea.focus(), 0);
    }
    return wrapper;
  }

  function findComment(id) {
    for (const row of state.rows) {
      if (row.id === id) return row;
      const reply = row.replies?.find(item => item.id === id);
      if (reply) return reply;
    }
    return null;
  }

  async function submitComment(event, textarea, submit, message) {
    event.preventDefault();
    if (state.busy) return;
    const content = textarea.value.trim();
    if (!content) {
      message.textContent = 'Escribí un comentario antes de publicar.';
      message.className = 'laqp-form-message is-error';
      return;
    }
    if (content.length > MAX_LENGTH) {
      message.textContent = 'El comentario supera el límite de 1000 caracteres.';
      message.className = 'laqp-form-message is-error';
      return;
    }
    state.busy = true;
    submit.disabled = true;
    message.textContent = state.editId ? 'Guardando…' : 'Publicando…';
    message.className = 'laqp-form-message';
    try {
      let result;
      if (state.editId) {
        result = await client().from('comments').update({ content }).eq('id', state.editId);
      } else {
        result = await client().from('comments').insert({
          user_id: currentUser().id,
          page_type: state.pageType,
          page_id: state.pageId,
          parent_id: state.replyTo?.id || null,
          content,
        });
      }
      if (result.error) throw result.error;
      state.replyTo = null;
      state.editId = null;
      state.busy = false;
      await fetchPage(true);
    } catch (error) {
      message.textContent = errorMessage(error, state.editId ? 'No pudimos guardar los cambios.' : 'No pudimos publicar el comentario.');
      message.className = 'laqp-form-message is-error';
      state.busy = false;
      submit.disabled = false;
    }
  }

  function buildComment(row, isReply = false) {
    const article = node('article', `laqp-comment${isReply ? ' is-reply' : ''}`);
    article.id = `comment-${row.id}`;
    article.dataset.commentId = row.id;
    const header = node('header', 'laqp-comment-header');
    const avatar = node('img');
    avatar.src = avatarUrl(row);
    avatar.alt = '';
    avatar.loading = 'lazy';
    avatar.referrerPolicy = 'no-referrer';
    avatar.addEventListener('error', () => { avatar.src = '/assets/avatars/avatar-1.svg'; }, { once: true });
    const identity = node('div');
    const canLinkAuthor = row.status !== 'deleted' && row.user_id && Object.keys(profileFor(row)).length > 0;
    const author = node('strong', '', authorName(row));
    if (canLinkAuthor) {
      const avatarLink = node('a', 'laqp-comment-avatar-link');
      avatarLink.href = publicProfileUrl(row.user_id);
      avatarLink.setAttribute('aria-label', `Ver perfil de ${authorName(row)}`);
      avatarLink.appendChild(avatar);
      const nameLink = node('a', 'laqp-comment-author-link');
      nameLink.href = publicProfileUrl(row.user_id);
      nameLink.appendChild(author);
      identity.append(nameLink, node('time', '', `${formattedDate(row.created_at)}${wasEdited(row) ? ' · editado' : ''}`));
      header.append(avatarLink, identity);
    } else {
      identity.append(author, node('time', '', `${formattedDate(row.created_at)}${wasEdited(row) ? ' · editado' : ''}`));
      header.append(avatar, identity);
    }
    const body = node('p', 'laqp-comment-content');
    if (row.status === 'deleted') {
      article.classList.add('is-deleted');
      body.textContent = 'Comentario eliminado';
    } else {
      // Texto plano deliberado: nunca se interpreta HTML del usuario.
      body.textContent = row.content;
    }
    article.append(header, body);

    if (row.status === 'visible') {
      const actions = node('div', 'laqp-comment-actions');
      if (!isReply && currentUser()) {
        actions.appendChild(button('Responder', '', () => { state.replyTo = row; state.editId = null; render(); scrollToComposer(); }));
      }
      if (currentUser()?.id === row.user_id) {
        actions.append(
          button('Editar', '', () => { state.editId = row.id; state.replyTo = null; render(); scrollToComposer(); }),
          button('Eliminar', 'is-danger', () => deleteComment(row))
        );
      } else if (currentUser()) {
        actions.appendChild(button('Reportar', '', () => openReport(row)));
      }
      article.appendChild(actions);
    }

    if (!isReply && row.replies?.length) {
      const replies = node('div', 'laqp-comment-replies');
      row.replies.forEach(reply => replies.appendChild(buildComment(reply, true)));
      article.appendChild(replies);
    }
    return article;
  }

  function scrollToComposer() {
    state.host?.querySelector('.laqp-comment-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function deleteComment(row) {
    if (!window.confirm('¿Querés eliminar este comentario?')) return;
    try {
      const { error } = await client().from('comments').update({ status: 'deleted' }).eq('id', row.id);
      if (error) throw error;
      if (state.editId === row.id) state.editId = null;
      await fetchPage(true);
    } catch (error) {
      window.alert(errorMessage(error, 'No pudimos eliminar el comentario.'));
    }
  }

  function openReport(row) {
    let modal = document.querySelector('#laqp-report-modal');
    if (modal) modal.remove();
    modal = node('div', 'laqp-report-modal');
    modal.id = 'laqp-report-modal';
    modal.innerHTML = `
      <button class="laqp-auth-backdrop" type="button" aria-label="Cerrar"></button>
      <form class="laqp-report-dialog" role="dialog" aria-modal="true" aria-labelledby="laqp-report-title">
        <button class="laqp-auth-close" type="button" aria-label="Cerrar">×</button>
        <span class="laqp-account-kicker">Moderación</span>
        <h2 id="laqp-report-title">Reportar comentario</h2>
        <p>Elegí el motivo. El autor no verá quién realizó el reporte.</p>
        <label>Motivo<select name="reason" required><option value="spam">Spam</option><option value="harassment">Insultos/acoso</option><option value="inappropriate">Contenido inapropiado</option><option value="other">Otro</option></select></label>
        <button class="laqp-primary-button" type="submit">Enviar reporte</button>
        <p class="laqp-form-message" role="status"></p>
      </form>`;
    const close = () => modal.remove();
    modal.querySelector('.laqp-auth-backdrop').addEventListener('click', close);
    modal.querySelector('.laqp-auth-close').addEventListener('click', close);
    modal.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('[type="submit"]');
      const message = event.currentTarget.querySelector('.laqp-form-message');
      submit.disabled = true;
      message.textContent = 'Enviando…';
      try {
        const { error } = await client().from('comment_reports').insert({
          comment_id: row.id,
          reporter_id: currentUser().id,
          reason: event.currentTarget.reason.value,
        });
        if (error) throw error;
        message.textContent = 'Reporte enviado. Gracias por avisar.';
        message.className = 'laqp-form-message is-success';
        setTimeout(close, 900);
      } catch (error) {
        message.textContent = errorMessage(error, 'No pudimos enviar el reporte.');
        message.className = 'laqp-form-message is-error';
        submit.disabled = false;
      }
    });
    document.body.appendChild(modal);
  }

  function render() {
    if (!state.host) return;
    const title = state.host.querySelector('[data-comments-title]');
    if (title) title.textContent = `Comentarios · ${state.visibleCount}`;
    const composer = state.host.querySelector('[data-comments-composer]');
    if (composer) composer.replaceChildren(buildComposer());
    const list = state.host.querySelector('[data-comments-list]');
    if (list) {
      list.replaceChildren();
      if (!state.rows.length) list.appendChild(node('p', 'laqp-comments-state', 'Todavía no hay comentarios. Sé la primera persona en comentar.'));
      else state.rows.forEach(row => list.appendChild(buildComment(row)));
    }
    const more = state.host.querySelector('[data-comments-more]');
    if (more) {
      more.hidden = !state.hasMore;
      more.disabled = false;
    }
  }

  function mount() {
    const host = document.querySelector('[data-laqp-comments]');
    if (!host || !client()) return;
    state.host = host;
    state.pageType = host.dataset.pageType || '';
    state.pageId = host.dataset.pageId || '';
    if (!['player', 'team', 'tactic', 'download'].includes(state.pageType) || !state.pageId) return;
    host.classList.add('laqp-comments');
    host.innerHTML = `
      <header class="laqp-comments-heading"><div><span>Comunidad LAqP</span><h2 data-comments-title>Comentarios</h2></div><p>Opiniones y aportes de la comunidad.</p></header>
      <div data-comments-composer></div>
      <div class="laqp-comments-list" data-comments-list><p class="laqp-comments-state">Cargando comentarios…</p></div>
      <button class="laqp-secondary-button laqp-comments-more" type="button" data-comments-more hidden>Cargar más comentarios</button>`;
    host.querySelector('[data-comments-more]').addEventListener('click', () => fetchPage(false));
    render();
    fetchPage(true);
    window.addEventListener('hashchange', () => {
      state.hashTargetId = targetIdFromHash();
      state.hashTargetLoaded = false;
      void loadHashTarget();
    });
  }

  document.addEventListener('laqp-auth-change', render);
  document.addEventListener('laqp-profile-change', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
