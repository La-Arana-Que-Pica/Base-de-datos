'use strict';

const COMMENTS_TABLE = 'comments';
const COMMENTS_MIN_LENGTH = 3;
const COMMENTS_MAX_LENGTH = 1000;
const COMMENTS_COOLDOWN_MS = 30000;
const COMMENTS_DISABLED_FILES = new Set([
  'about.html',
  'acerca-de.html',
  'contact.html',
  'terms.html',
  'privacy-policy.html',
  'dmca.html',
  'faq.html',
  'admin-comments.html',
  'squad-organizer.html',
]);
const COMMENTS_DISABLED_IDS = new Set(['about', 'acerca-de', 'contacto', 'terminos-condiciones', 'politica-privacidad', 'cookies', 'dmca', 'legal']);

let laqpCommentsContext = null;
let laqpCommentsSubmitting = false;
let laqpCommentsLastSubmitAt = 0;
let laqpCommentsEditId = '';

function commentsClient() {
  return window.LAQP_SUPABASE || null;
}

function commentsUser() {
  return typeof window.laqpCurrentUser === 'function' ? window.laqpCurrentUser() : null;
}

function commentsProfile() {
  return typeof window.laqpCurrentProfile === 'function' ? window.laqpCurrentProfile() : null;
}

function commentsAvatar(profile) {
  return typeof window.getAvatarById === 'function'
    ? window.getAvatarById(profile?.avatar_id).url
    : 'assets/avatars/avatar-1.svg';
}

function commentsEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function commentsCleanId(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pagina';
}

function commentsTitle() {
  const title = document.querySelector('h1')?.textContent?.trim() || document.title || 'LAqP';
  return title.replace(/\s+\|\s+LAqP.*$/i, '').trim();
}

function commentsContext() {
  const file = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('id') || '';
  const teamId = params.get('team') || '';
  const title = commentsTitle();
  let pageId = file.replace(/\.html$/, '') || 'home';
  let sectionType = 'page';

  if (file === 'index.html' || file === '') {
    pageId = 'inicio';
    sectionType = 'home';
  } else if (file === 'articulo.html') {
    pageId = rawId ? `guia-${commentsCleanId(rawId)}` : 'guia';
    sectionType = 'guia';
  } else if (file === 'downloads.html') {
    pageId = rawId ? `option-file-${commentsCleanId(rawId)}` : 'option-files';
    sectionType = 'option-file';
  } else if (file === 'player.html') {
    pageId = rawId ? `jugador-${commentsCleanId(rawId)}${teamId ? `-${commentsCleanId(teamId)}` : ''}` : 'jugador';
    sectionType = 'jugador';
  } else if (file === 'team.html') {
    pageId = rawId ? `equipo-${commentsCleanId(rawId)}` : 'equipo';
    sectionType = 'equipo';
  } else if (file === 'league.html') {
    pageId = rawId ? `liga-${commentsCleanId(rawId)}` : 'liga';
    sectionType = 'liga';
  } else if (file === 'rankings.html') {
    pageId = 'scouting';
    sectionType = 'scouting';
  } else if (file === 'guias.html') {
    pageId = 'guias';
    sectionType = 'guias';
  } else if (file === 'tutorials.html') {
    pageId = 'tutoriales';
    sectionType = 'tutoriales';
  } else if (file === 'database.html') {
    pageId = 'base-de-datos';
    sectionType = 'base-de-datos';
  } else if (file === 'news.html') {
    pageId = 'noticias';
    sectionType = 'noticias';
  }

  return { file, pageId, pageTitle: title, sectionType };
}

function commentsEnabled(context) {
  if (!context) return false;
  if (COMMENTS_DISABLED_FILES.has(context.file)) return false;
  if (COMMENTS_DISABLED_IDS.has(context.pageId)) return false;
  return true;
}

function commentsMountTarget() {
  return document.querySelector('main') ||
    document.querySelector('#player-page') ||
    document.querySelector('#team-page') ||
    document.querySelector('#downloads-page') ||
    document.body;
}

function commentsAuthorLabel(comment) {
  return comment.profile?.username || 'Usuario LAqP';
}

function commentsDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '';
  }
}

function commentsStatusLabel(status) {
  if (status === 'pending') return '<span class="comment-status pending">Pendiente de aprobación</span>';
  if (status === 'approved') return '<span class="comment-status approved">Aprobado</span>';
  return '';
}

async function commentsFetch(context) {
  const client = commentsClient();
  if (!client) return { comments: [], error: null };
  const user = commentsUser();

  const approved = await client
    .from(COMMENTS_TABLE)
    .select('id,user_id,page_id,page_title,section_type,content,status,created_at,updated_at,edited')
    .eq('page_id', context.pageId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (approved.error) return { comments: [], error: approved.error };

  let rows = approved.data || [];
  if (user) {
    const own = await client
      .from(COMMENTS_TABLE)
      .select('id,user_id,page_id,page_title,section_type,content,status,created_at,updated_at,edited')
      .eq('page_id', context.pageId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (!own.error) {
      const seen = new Set(rows.map(comment => comment.id));
      rows = [...(own.data || []).filter(comment => !seen.has(comment.id)), ...rows];
    }
  }

  const userIds = [...new Set(rows.map(comment => comment.user_id).filter(Boolean))];
  if (userIds.length) {
    const profiles = await client
      .from('profiles')
      .select('user_id,username,avatar_id')
      .in('user_id', userIds);
    if (!profiles.error) {
      const profileMap = new Map((profiles.data || []).map(profile => [profile.user_id, profile]));
      rows = rows.map(comment => ({ ...comment, profile: profileMap.get(comment.user_id) || null }));
    }
  }

  return { comments: rows, error: null };
}

function commentsFormHtml(user) {
  if (!user) {
    return `
      <div class="comments-login-box">
        <p>Iniciá sesión para comentar.</p>
        <button type="button" onclick="laqpAuthOpen('login')">Iniciar sesión</button>
      </div>`;
  }
  if (!commentsProfile()) {
    return `
      <div class="comments-login-box">
        <p>Configurá tu perfil para comentar.</p>
        <button type="button" onclick="openProfileSetupModal('setup')">Configurar perfil</button>
      </div>`;
  }

  return `
    <form class="comments-form" onsubmit="submitLAQPComment(event)">
      <label for="comment-content">Tu comentario</label>
      <textarea id="comment-content" maxlength="${COMMENTS_MAX_LENGTH}" placeholder="Escribí algo sobre esta sección..." oninput="updateLAQPCommentCounter()"></textarea>
      <div class="comments-form-foot">
        <span id="comment-counter">0/${COMMENTS_MAX_LENGTH}</span>
        <button id="comment-submit-btn" type="submit">Publicar comentario</button>
      </div>
      <p id="comments-message" class="comments-message"></p>
    </form>`;
}

function commentsListHtml(comments) {
  if (!comments.length) {
    return '<div class="comments-empty">Todavía no hay comentarios. Sé el primero en comentar.</div>';
  }
  const user = commentsUser();
  return `
    <div class="comments-list">
      ${comments.map(comment => {
        const canManage = user && comment.user_id === user.id && comment.status === 'pending';
        const avatar = commentsAvatar(comment.profile);
        return `
          <article class="comment-card" data-comment-id="${commentsEscape(comment.id)}">
            <div class="comment-card-head">
              <div class="comment-author">
                <img src="${commentsEscape(avatar)}" alt="">
                <div>
                  <strong>${commentsEscape(commentsAuthorLabel(comment))}</strong>
                  <small>${commentsEscape(commentsDate(comment.created_at))}${comment.edited ? ' · editado' : ''}</small>
                </div>
              </div>
              ${commentsStatusLabel(comment.status)}
            </div>
            <p>${commentsEscape(comment.content)}</p>
            ${canManage ? `
              <div class="comment-actions">
                <button type="button" onclick="editLAQPComment('${commentsEscape(comment.id)}')">Editar</button>
                <button type="button" onclick="deleteLAQPComment('${commentsEscape(comment.id)}')">Borrar</button>
              </div>` : ''}
          </article>`;
      }).join('')}
    </div>`;
}

async function renderComments(pageId, pageTitle, sectionType) {
  const context = { pageId, pageTitle, sectionType, file: '' };
  laqpCommentsContext = context;
  await renderLAQPComments(context);
}

async function renderLAQPComments(context = laqpCommentsContext) {
  if (!context || !commentsEnabled(context)) return;
  laqpCommentsContext = context;
  let section = document.querySelector('#laqp-comments');
  if (!section) {
    section = document.createElement('section');
    section.id = 'laqp-comments';
    section.className = 'comments-section';
    commentsMountTarget().appendChild(section);
  }

  const user = commentsUser();
  section.innerHTML = `
    <div class="comments-head">
      <span>${commentsEscape(context.sectionType)}</span>
      <h2>Comentarios</h2>
    </div>
    <div class="comments-loading">Cargando comentarios...</div>
    ${commentsFormHtml(user)}`;

  if (!commentsClient()) {
    section.querySelector('.comments-loading').innerHTML = '<div class="comments-empty">Los comentarios necesitan configurar Supabase.</div>';
    return;
  }

  const { comments, error } = await commentsFetch(context);
  section.querySelector('.comments-loading').outerHTML = error
    ? '<div class="comments-empty">No se pudieron cargar los comentarios.</div>'
    : commentsListHtml(comments);
}

function updateLAQPCommentCounter() {
  const textarea = document.querySelector('#comment-content');
  const counter = document.querySelector('#comment-counter');
  if (textarea && counter) counter.textContent = `${textarea.value.length}/${COMMENTS_MAX_LENGTH}`;
}

function commentsSetMessage(text, type = '') {
  const message = document.querySelector('#comments-message');
  if (!message) return;
  message.textContent = text || '';
  message.className = `comments-message ${type}`;
}

async function submitLAQPComment(event) {
  event.preventDefault();
  if (laqpCommentsSubmitting) return;
  const client = commentsClient();
  const user = commentsUser();
  const textarea = document.querySelector('#comment-content');
  const button = document.querySelector('#comment-submit-btn');
  const content = textarea?.value.trim() || '';

  if (!client || !laqpCommentsContext) return commentsSetMessage('Los comentarios no están configurados.', 'error');
  if (!user) return commentsSetMessage('Iniciá sesión para comentar.', 'error');
  if (!commentsProfile()) {
    openProfileSetupModal('setup');
    return commentsSetMessage('Configurá tu perfil antes de comentar.', 'error');
  }
  if (content.length < COMMENTS_MIN_LENGTH) return commentsSetMessage('El comentario es demasiado corto.', 'error');
  if (content.length > COMMENTS_MAX_LENGTH) return commentsSetMessage('El comentario supera el límite de caracteres.', 'error');
  if (Date.now() - laqpCommentsLastSubmitAt < COMMENTS_COOLDOWN_MS) return commentsSetMessage('Esperá unos segundos antes de comentar de nuevo.', 'error');

  laqpCommentsSubmitting = true;
  if (button) button.disabled = true;
  commentsSetMessage('Enviando...', '');

  const payload = {
    user_id: user.id,
    page_id: laqpCommentsContext.pageId,
    page_title: laqpCommentsContext.pageTitle,
    section_type: laqpCommentsContext.sectionType,
    content,
    status: 'pending',
  };

  const result = laqpCommentsEditId
    ? await client.from(COMMENTS_TABLE).update({ content, edited: true, updated_at: new Date().toISOString(), status: 'pending' }).eq('id', laqpCommentsEditId).eq('user_id', user.id)
    : await client.from(COMMENTS_TABLE).insert(payload);

  laqpCommentsSubmitting = false;
  if (button) button.disabled = false;

  if (result.error) return commentsSetMessage('No pudimos guardar el comentario.', 'error');

  laqpCommentsLastSubmitAt = Date.now();
  laqpCommentsEditId = '';
  textarea.value = '';
  updateLAQPCommentCounter();
  commentsSetMessage('Comentario enviado. Quedará visible cuando sea aprobado.', 'success');
  await renderLAQPComments();
}

async function editLAQPComment(commentId) {
  const card = document.querySelector(`.comment-card[data-comment-id="${CSS.escape(commentId)}"]`);
  const textarea = document.querySelector('#comment-content');
  if (!card || !textarea) return;
  textarea.value = card.querySelector('p')?.textContent || '';
  laqpCommentsEditId = commentId;
  updateLAQPCommentCounter();
  textarea.focus();
  commentsSetMessage('Editando comentario pendiente.', '');
}

async function deleteLAQPComment(commentId) {
  const client = commentsClient();
  const user = commentsUser();
  if (!client || !user || !commentId) return;
  const { error } = await client.from(COMMENTS_TABLE).delete().eq('id', commentId).eq('user_id', user.id);
  if (error) return commentsSetMessage('No pudimos borrar el comentario.', 'error');
  await renderLAQPComments();
}

function initLAQPComments() {
  const context = commentsContext();
  if (!commentsEnabled(context)) return;
  setTimeout(() => renderLAQPComments(context), 700);
}

window.renderComments = renderComments;
window.renderLAQPComments = renderLAQPComments;
window.submitLAQPComment = submitLAQPComment;
window.updateLAQPCommentCounter = updateLAQPCommentCounter;
window.editLAQPComment = editLAQPComment;
window.deleteLAQPComment = deleteLAQPComment;

window.addEventListener('load', initLAQPComments);
document.addEventListener('laqp-auth-change', () => renderLAQPComments());
document.addEventListener('laqp-profile-change', () => renderLAQPComments());
