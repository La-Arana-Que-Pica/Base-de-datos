'use strict';

(function () {
  const root = () => document.querySelector('#admin-comments-content');
  const client = () => window.LAQP_SUPABASE || null;

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function action(text, handler) {
    const item = node('button', '', text);
    item.type = 'button';
    item.addEventListener('click', handler);
    return item;
  }

  function showState(message) {
    root()?.replaceChildren(node('p', 'laqp-comments-state', message));
  }

  async function currentRole() {
    const user = window.LAQPAuth?.user;
    if (!user) return '';
    const { data, error } = await client().from('staff_roles').select('role').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data?.role || '';
  }

  async function setCommentStatus(id, status) {
    const { error } = await client().from('comments').update({ status }).eq('id', id);
    if (error) {
      console.warn('[LAqP Moderación]', error);
      window.alert('No pudimos actualizar el comentario.');
      return;
    }
    await load();
  }

  async function setReportStatus(id, status) {
    const { error } = await client().from('comment_reports').update({ status }).eq('id', id);
    if (error) {
      console.warn('[LAqP Moderación]', error);
      window.alert('No pudimos actualizar el reporte.');
      return;
    }
    await load();
  }

  function renderReport(report) {
    const card = node('article', 'laqp-comment');
    const comment = Array.isArray(report.comment) ? report.comment[0] : report.comment;
    const heading = node('header', 'laqp-comment-header');
    const meta = node('div');
    meta.append(node('strong', '', `Reporte: ${report.reason}`), node('time', '', `${comment?.page_type || 'página'} · ${comment?.page_id || ''}`));
    heading.appendChild(meta);
    card.append(heading, node('p', 'laqp-comment-content', comment?.content || 'Comentario eliminado'));
    const actions = node('div', 'laqp-comment-actions');
    if (comment?.id && comment.status === 'visible') {
      actions.append(action('Ocultar comentario', () => setCommentStatus(comment.id, 'hidden')));
      actions.append(action('Eliminar comentario', () => setCommentStatus(comment.id, 'deleted')));
    } else if (comment?.id && comment.status === 'hidden') {
      actions.append(action('Restaurar visible', () => setCommentStatus(comment.id, 'visible')));
      actions.append(action('Eliminar definitivamente', () => setCommentStatus(comment.id, 'deleted')));
    }
    actions.append(action('Marcar revisado', () => setReportStatus(report.id, 'reviewed')), action('Descartar reporte', () => setReportStatus(report.id, 'dismissed')));
    card.appendChild(actions);
    return card;
  }

  function renderComment(comment) {
    const card = node('article', 'laqp-comment');
    const heading = node('header', 'laqp-comment-header');
    const meta = node('div');
    meta.append(node('strong', '', `${comment.page_type} · ${comment.page_id}`), node('time', '', `Estado: ${comment.status}`));
    heading.appendChild(meta);
    card.append(heading, node('p', 'laqp-comment-content', comment.content || 'Comentario eliminado'));
    const actions = node('div', 'laqp-comment-actions');
    if (comment.status === 'visible') {
      actions.appendChild(action('Ocultar', () => setCommentStatus(comment.id, 'hidden')));
      actions.appendChild(action('Eliminar definitivamente', () => setCommentStatus(comment.id, 'deleted')));
    } else if (comment.status === 'hidden') {
      actions.appendChild(action('Restaurar visible', () => setCommentStatus(comment.id, 'visible')));
      actions.appendChild(action('Eliminar definitivamente', () => setCommentStatus(comment.id, 'deleted')));
    }
    card.appendChild(actions);
    return card;
  }

  async function load() {
    if (!root()) return;
    if (!client()) return showState('Supabase no está configurado.');
    if (!window.LAQPAuth?.ready) return;
    if (!window.LAQPAuth.user) return showState('Iniciá sesión para acceder a moderación.');
    showState('Cargando moderación…');
    try {
      const role = await currentRole();
      if (!['moderator', 'admin'].includes(role)) return showState('No tenés permisos de moderación.');
      const [reportsResult, commentsResult] = await Promise.all([
        client()
          .from('comment_reports')
          .select('id,reason,status,created_at,comment:comments(id,page_type,page_id,content,status)')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(100),
        client()
          .from('comments')
          .select('id,page_type,page_id,content,status,created_at')
          .in('status', ['hidden', 'deleted'])
          .order('updated_at', { ascending: false })
          .limit(100),
      ]);
      if (reportsResult.error) throw reportsResult.error;
      if (commentsResult.error) throw commentsResult.error;

      const container = node('div', 'laqp-moderation-grid');
      const reports = node('section', 'laqp-comments-list');
      reports.appendChild(node('h2', '', `Reportes pendientes · ${(reportsResult.data || []).length}`));
      if (!reportsResult.data?.length) reports.appendChild(node('p', 'laqp-comments-state', 'No hay reportes pendientes.'));
      else reportsResult.data.forEach(item => reports.appendChild(renderReport(item)));

      const moderated = node('section', 'laqp-comments-list');
      moderated.appendChild(node('h2', '', 'Comentarios moderados'));
      if (!commentsResult.data?.length) moderated.appendChild(node('p', 'laqp-comments-state', 'No hay comentarios ocultos o eliminados.'));
      else commentsResult.data.forEach(item => moderated.appendChild(renderComment(item)));
      container.append(reports, moderated);
      root().replaceChildren(container);
    } catch (error) {
      console.warn('[LAqP Moderación]', error);
      showState('No pudimos cargar las herramientas de moderación.');
    }
  }

  async function init() {
    await window.LAQPAccountReady;
    if (window.LAQPAuth?.ready) load();
    else document.addEventListener('laqp-auth-change', load, { once: true });
  }

  document.addEventListener('laqp-auth-change', load);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
