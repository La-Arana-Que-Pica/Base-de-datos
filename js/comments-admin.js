'use strict';

async function adminCommentsClient() {
  return window.LAQP_SUPABASE || null;
}

function adminCommentsUser() {
  return typeof window.laqpCurrentUser === 'function' ? window.laqpCurrentUser() : null;
}

function adminEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function adminDate(value) {
  try {
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '';
  }
}

async function adminRole() {
  const client = await adminCommentsClient();
  const user = adminCommentsUser();
  if (!client || !user) return '';
  const { data } = await client.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  return data?.role || '';
}

async function loadAdminComments() {
  const root = document.querySelector('#admin-comments-content');
  if (!root) return;
  const client = await adminCommentsClient();
  const user = adminCommentsUser();
  if (!client) {
    root.innerHTML = '<div class="comments-empty">Supabase no está configurado.</div>';
    return;
  }
  if (!user) {
    root.innerHTML = '<div class="comments-empty">Iniciá sesión para moderar comentarios.</div>';
    return;
  }

  const role = await adminRole();
  if (!['admin', 'moderator'].includes(role)) {
    root.innerHTML = '<div class="comments-empty">No tenés permisos de moderación.</div>';
    return;
  }

  const { data, error } = await client
    .from('comments')
    .select('id,user_id,page_id,page_title,section_type,content,status,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    root.innerHTML = '<div class="comments-empty">No se pudieron cargar los comentarios pendientes.</div>';
    return;
  }

  root.innerHTML = `
    <section class="comments-admin-panel">
      <div class="comments-head">
        <span>Moderación</span>
        <h1>Comentarios pendientes</h1>
      </div>
      ${(data || []).length ? (data || []).map(comment => `
        <article class="comment-card">
          <div class="comment-card-head">
            <div>
              <strong>${adminEscape(comment.page_title || comment.page_id)}</strong>
              <small>${adminEscape(comment.section_type)} · ${adminEscape(adminDate(comment.created_at))}</small>
            </div>
            <span class="comment-status pending">Pendiente</span>
          </div>
          <p>${adminEscape(comment.content)}</p>
          <div class="comment-actions">
            <button type="button" onclick="moderateComment('${adminEscape(comment.id)}', 'approved')">Aprobar</button>
            <button type="button" onclick="moderateComment('${adminEscape(comment.id)}', 'rejected')">Rechazar</button>
            <button type="button" onclick="moderateComment('${adminEscape(comment.id)}', 'deleted')">Eliminar</button>
          </div>
        </article>`).join('') : '<div class="comments-empty">No hay comentarios pendientes.</div>'}
    </section>`;
}

async function moderateComment(commentId, status) {
  const client = await adminCommentsClient();
  if (!client || !commentId) return;
  await client.from('comments').update({ status, updated_at: new Date().toISOString() }).eq('id', commentId);
  await loadAdminComments();
}

document.addEventListener('DOMContentLoaded', () => setTimeout(loadAdminComments, 500));
document.addEventListener('laqp-auth-change', () => loadAdminComments());

window.loadAdminComments = loadAdminComments;
window.moderateComment = moderateComment;
