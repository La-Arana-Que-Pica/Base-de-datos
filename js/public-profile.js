'use strict';

(function () {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DEFAULT_AVATAR = '/assets/avatars/avatar-1.svg';
  const root = document.querySelector('[data-laqp-public-profile]');
  const client = () => window.LAQP_SUPABASE || null;

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function safeAvatarUrl(value) {
    const raw = String(value || '').trim();
    if (/^\/assets\/avatars\/avatar-[1-4]\.svg$/.test(raw)) return raw;
    if (/^https:\/\/lh3\.googleusercontent\.com\//i.test(raw)) return raw;
    const projectUrl = window.LAQP_SUPABASE_CONFIG?.url || 'https://npyvbqzgcdoujfxefsdr.supabase.co';
    if (raw.startsWith(`${projectUrl}/storage/v1/object/public/avatars/`)) return raw;
    return DEFAULT_AVATAR;
  }

  function profileIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id')?.trim() || '';
  }

  function canonicalProfileUrl(userId) {
    const production = ['laqp.website', 'www.laqp.website'].includes(window.location.hostname);
    const url = new URL('/perfil/', production ? 'https://laqp.website' : window.location.origin);
    url.searchParams.set('id', userId);
    return url.toString();
  }

  function memberSince(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Miembro de LAqP';
    return `Miembro desde ${new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date)}`;
  }

  function commentDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  async function pageContext(pageType, pageId, commentId) {
    const item = await window.LAQPContentIndex.resolve(pageType, pageId);
    const kind = window.LAQPContentIndex.labels[pageType] || 'Publicación';
    return {
      label: `${kind} · ${item.title}`,
      href: item.url ? `${item.url}#comment-${encodeURIComponent(commentId)}` : '',
    };
  }

  function renderState(title, message) {
    const card = node('section', 'laqp-public-profile-state');
    card.setAttribute('role', 'status');
    card.append(node('h1', '', title), node('p', '', message));
    root.replaceChildren(card);
  }

  function fallbackCopy(url) {
    const input = node('textarea', 'laqp-copy-fallback');
    input.value = url;
    input.setAttribute('readonly', '');
    document.body.appendChild(input);
    try {
      input.select();
      return document.execCommand('copy');
    } finally {
      input.remove();
    }
  }

  async function copyProfileUrl(url, feedback) {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        copied = true;
      } else copied = fallbackCopy(url);
    } catch (error) {
      console.warn('[LAqP Perfil] No se pudo copiar el enlace.', error);
      try {
        copied = fallbackCopy(url);
      } catch (fallbackError) {
        console.warn('[LAqP Perfil] Tampoco funcionó la copia alternativa.', fallbackError);
      }
    }
    feedback.textContent = copied ? 'Enlace copiado' : 'No pudimos copiar el enlace';
    feedback.classList.toggle('is-error', !copied);
    window.setTimeout(() => {
      feedback.textContent = '';
      feedback.classList.remove('is-error');
    }, 2200);
  }

  async function renderProfile(profile, role, comments, total) {
    const shell = node('div', 'laqp-public-profile-shell');
    const hero = node('section', 'laqp-public-profile-hero');
    const avatar = node('img', 'laqp-public-profile-avatar');
    avatar.src = safeAvatarUrl(profile.avatar_url);
    avatar.alt = '';
    avatar.referrerPolicy = 'no-referrer';
    avatar.addEventListener('error', () => { avatar.src = DEFAULT_AVATAR; }, { once: true });

    const identity = node('div', 'laqp-public-profile-identity');
    const usernameRow = node('div', 'laqp-public-profile-username-row');
    usernameRow.appendChild(node('h1', '', `@${profile.username}`));
    if (role === 'admin' || role === 'moderator') {
      const badge = node('span', `laqp-role-badge is-${role}`, role === 'admin' ? 'Administrador' : 'Moderador');
      usernameRow.appendChild(badge);
    }
    identity.appendChild(usernameRow);
    if (profile.display_name) identity.appendChild(node('p', 'laqp-public-profile-name', profile.display_name));
    identity.appendChild(node('p', 'laqp-public-profile-bio', profile.bio || 'Este usuario todavía no agregó una bio.'));
    identity.appendChild(node('p', 'laqp-public-profile-member', memberSince(profile.created_at)));

    const share = node('div', 'laqp-public-profile-share');
    const shareButton = node('button', 'laqp-secondary-button', 'Compartir perfil');
    shareButton.type = 'button';
    const feedback = node('span', 'laqp-share-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const canonicalUrl = canonicalProfileUrl(profile.id);
    shareButton.addEventListener('click', () => copyProfileUrl(canonicalUrl, feedback));
    share.append(shareButton, feedback);
    hero.append(avatar, identity, share);

    const activity = node('section', 'laqp-public-profile-comments');
    const heading = node('header', 'laqp-public-comments-heading');
    const headingCopy = node('div');
    headingCopy.append(node('span', 'laqp-account-kicker', 'Actividad pública'), node('h2', '', `Comentarios · ${total}`));
    heading.appendChild(headingCopy);
    activity.appendChild(heading);

    if (!comments.length) {
      activity.appendChild(node('p', 'laqp-public-comments-empty', 'Todavía no publicó comentarios.'));
    } else {
      const list = node('div', 'laqp-public-comments-list');
      const contexts = await Promise.all(comments.map(comment => pageContext(comment.page_type, comment.page_id, comment.id)));
      comments.forEach((comment, index) => {
        const card = node('article', 'laqp-public-comment');
        const meta = node('div', 'laqp-public-comment-meta');
        const context = contexts[index];
        if (context.href) {
          const link = node('a', '', context.label);
          link.href = context.href;
          meta.appendChild(link);
        } else {
          meta.appendChild(node('span', '', context.label));
        }
        meta.appendChild(node('time', '', commentDate(comment.created_at)));
        const content = node('p', 'laqp-public-comment-content');
        content.textContent = comment.content;
        card.append(meta, content);
        list.appendChild(card);
      });
      activity.appendChild(list);
    }

    shell.append(hero, activity);
    root.replaceChildren(shell);
    document.title = `@${profile.username} | LAqP.website`;
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonicalUrl);
  }

  async function load() {
    if (!root || !client()) return;
    const userId = profileIdFromUrl();
    if (!UUID_RE.test(userId)) {
      renderState('Perfil inválido', 'El enlace de perfil no contiene un identificador válido.');
      return;
    }

    try {
      const profileResult = await client()
        .from('profiles')
        .select('id,username,display_name,avatar_url,bio,created_at')
        .eq('id', userId)
        .maybeSingle();
      if (profileResult.error) throw profileResult.error;
      if (!profileResult.data) {
        renderState('No encontramos este perfil.', 'Es posible que la cuenta ya no exista o que el enlace sea incorrecto.');
        return;
      }

      const [roleResult, commentsResult] = await Promise.all([
        client().from('staff_roles').select('role').eq('user_id', userId).maybeSingle(),
        client()
          .from('comments')
          .select('id,page_type,page_id,content,created_at', { count: 'exact' })
          .eq('user_id', userId)
          .eq('status', 'visible')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      if (roleResult.error) throw roleResult.error;
      if (commentsResult.error) throw commentsResult.error;
      await renderProfile(profileResult.data, roleResult.data?.role || '', commentsResult.data || [], commentsResult.count || 0);
    } catch (error) {
      console.warn('[LAqP Perfil] No se pudo cargar el perfil público.', error);
      renderState('No pudimos cargar este perfil.', 'Supabase no está disponible temporalmente. Probá de nuevo más tarde.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else void load();
})();
