'use strict';

(function () {
  const USERNAME_RE = /^[A-Za-z0-9._]{3,24}$/;
  const DEFAULT_AVATAR = '/assets/avatars/avatar-1.svg';
  const LOCAL_AVATARS = Object.freeze([
    '/assets/avatars/avatar-1.svg',
    '/assets/avatars/avatar-2.svg',
    '/assets/avatars/avatar-3.svg',
    '/assets/avatars/avatar-4.svg',
  ]);
  const GOOGLE_AVATAR_RE = /^https:\/\/lh3\.googleusercontent\.com\//i;
  const USERNAME_COOLDOWN_DAYS = 30;
  const USERNAME_COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const state = {
    session: null,
    profile: null,
    profileError: null,
    authError: null,
    ready: false,
    mode: 'login',
  };
  let authSubscription = null;
  let recoveryModeActive = false;
  let recoveryExitPromise = null;

  function client() {
    if (window.LAQP_SUPABASE) return window.LAQP_SUPABASE;
    return window.LAQPCreateSupabaseClient?.() || null;
  }

  async function waitForClient() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const instance = client();
      if (instance) return instance;
      await new Promise(resolve => window.setTimeout(resolve, 25));
    }
    return null;
  }
  const user = () => state.session?.user || null;
  const profile = () => state.profile;

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function siteRootUrl() {
    if (window.location.hostname === 'laqp.website' || window.location.hostname === 'www.laqp.website') {
      return 'https://laqp.website/';
    }
    return `${window.location.origin}/`;
  }

  function authRedirectUrl() {
    const target = new URL(window.location.href);
    target.hash = '';
    target.searchParams.delete('laqp-recovery');
    if (target.origin !== window.location.origin || !['http:', 'https:'].includes(target.protocol)) {
      return siteRootUrl();
    }
    return target.toString();
  }

  function passwordRedirectUrl() {
    return `${siteRootUrl()}?laqp-recovery=1`;
  }

  function hasPasswordRecoveryParam() {
    return new URLSearchParams(window.location.search).get('laqp-recovery') === '1';
  }

  function clearPasswordRecoveryParam() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('laqp-recovery')) return;
    url.searchParams.delete('laqp-recovery');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function enterPasswordRecovery(session = state.session) {
    if (!session) return false;
    const wasActive = recoveryModeActive;
    recoveryModeActive = true;
    state.session = null;
    state.profile = null;
    state.profileError = null;
    state.authError = null;
    state.ready = true;
    renderHeader();
    renderAccountPage();
    if (!wasActive) openModal('update-password');
    clearPasswordRecoveryParam();
    if (!wasActive) emit('laqp-auth-change', { event: 'PASSWORD_RECOVERY', session: null, profile: null, recovery: true });
    return true;
  }

  function normalizeUsername(value) {
    return String(value || '').trim();
  }

  function validateUsername(value) {
    const normalized = normalizeUsername(value);
    if (!normalized) return { ok: false, message: 'Ingresá un nombre de usuario.' };
    if (!USERNAME_RE.test(normalized)) {
      return { ok: false, message: 'Usá entre 3 y 24 letras, números, punto o guion bajo.' };
    }
    return { ok: true, value: normalized };
  }

  function projectStoragePrefix() {
    const projectUrl = window.LAQP_SUPABASE_CONFIG?.url || 'https://npyvbqzgcdoujfxefsdr.supabase.co';
    return `${projectUrl}/storage/v1/object/public/avatars/`;
  }

  function isStorageAvatar(value) {
    const raw = String(value || '').trim();
    return raw.startsWith(projectStoragePrefix());
  }

  function safeUserStoragePath(avatarUrl, currentUserId) {
    const raw = String(avatarUrl || '').trim();
    const prefix = projectStoragePrefix();
    if (!raw.startsWith(prefix) || !currentUserId) return null;
    const subPath = raw.slice(prefix.length);
    // Debe tener exactamente el formato <currentUserId>/<filename seguro>
    const expectedPrefix = `${currentUserId}/`;
    if (!subPath.startsWith(expectedPrefix)) return null;
    const fileName = subPath.slice(expectedPrefix.length);
    if (!/^[A-Za-z0-9._-]+$/.test(fileName)) return null;
    return subPath;
  }

  function safeAvatarUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_AVATAR;
    if (LOCAL_AVATARS.includes(raw) || GOOGLE_AVATAR_RE.test(raw) || isStorageAvatar(raw)) return raw;
    return DEFAULT_AVATAR;
  }

  function isGoogleAvatar(value) {
    return GOOGLE_AVATAR_RE.test(String(value || '').trim());
  }

  function humanError(error, fallback = 'No pudimos completar la operación.') {
    if (error) console.warn('[LAqP Auth]', error);
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    if (message.includes('invalid login') || message.includes('invalid credentials')) return 'El correo o la contraseña no son correctos.';
    if (message.includes('email not confirmed')) return 'Primero confirmá tu correo desde el mensaje que te enviamos.';
    if (message.includes('already registered') || message.includes('user already registered')) return 'Ese correo ya tiene una cuenta.';
    if (message.includes('password') && (message.includes('weak') || message.includes('least'))) return 'La contraseña no cumple los requisitos mínimos.';
    if (message.includes('rate limit') || message.includes('too many')) return 'Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.';
    if (message.includes('username_change_cooldown')) return 'No podés volver a cambiar tu nombre de usuario todavía.';
    if (code === '23505' || message.includes('duplicate') || message.includes('unique')) return 'Ese nombre de usuario ya está utilizado.';
    if (message.includes('fetch') || message.includes('network')) return 'No pudimos conectarnos. Revisá tu conexión e intentá otra vez.';
    return fallback;
  }

  async function loadProfile() {
    if (!client() || !user()) {
      state.profile = null;
      state.profileError = null;
      return null;
    }
    const { data, error } = await client()
      .from('profiles')
      .select('id,username,display_name,avatar_url,bio,created_at')
      .eq('id', user().id)
      .maybeSingle();
    if (error) throw error;
    if (data && document.querySelector('[data-laqp-account-page]')) {
      data.username_changed_at = await loadOwnUsernameChangedAt();
    }
    state.profile = data || null;
    state.profileError = data ? null : new Error('profile_not_found');
    return state.profile;
  }

  async function loadOwnUsernameChangedAt() {
    const { data, error } = await client()
      .from('account_settings')
      .select('username_changed_at')
      .eq('user_id', user().id)
      .maybeSingle();
    if (error) throw error;
    return data?.username_changed_at || null;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function usernameCooldownState(currentProfile = state.profile) {
    const changedAt = currentProfile?.username_changed_at ? new Date(currentProfile.username_changed_at) : null;
    if (!changedAt || Number.isNaN(changedAt.getTime())) return { available: true, nextChangeAt: null };
    const nextChangeAt = new Date(changedAt.getTime() + USERNAME_COOLDOWN_MS);
    return { available: Date.now() >= nextChangeAt.getTime(), nextChangeAt };
  }

  function renderUsernameCooldown(node, currentProfile = state.profile) {
    if (!node) return;
    const cooldown = usernameCooldownState(currentProfile);
    node.classList.toggle('is-blocked', !cooldown.available);
    if (cooldown.available) {
      node.textContent = 'Podés cambiar tu nombre de usuario.';
      return;
    }
    const formatted = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(cooldown.nextChangeAt);
    node.textContent = `Podrás volver a cambiar tu nombre de usuario el ${formatted}. Los cambios sólo de mayúsculas/minúsculas siguen permitidos.`;
  }

  function confirmedAuthProviders(authUser) {
    const providers = new Set();
    (Array.isArray(authUser?.identities) ? authUser.identities : []).forEach(identity => {
      if (identity?.provider) providers.add(String(identity.provider));
    });
    const metadataProviders = authUser?.app_metadata?.providers;
    if (Array.isArray(metadataProviders)) metadataProviders.forEach(providerName => providers.add(String(providerName)));
    if (authUser?.app_metadata?.provider) providers.add(String(authUser.app_metadata.provider));
    return [...providers];
  }

  function authProviderLabel(providerName) {
    if (providerName === 'email') return ['Correo electrónico', 'Identidad de correo confirmada por Supabase.'];
    if (providerName === 'google') return ['Google', 'Cuenta de Google vinculada.'];
    return [providerName, 'Método de acceso confirmado por Supabase.'];
  }

  function renderHeader() {
    const header = document.querySelector('#header');
    if (!header) return;
    let root = header.querySelector('#laqp-account-control');
    if (!root) {
      root = element('div', 'laqp-account-control');
      root.id = 'laqp-account-control';
      header.appendChild(root);
    }
    root.replaceChildren();

    if (!state.ready) {
      root.classList.add('is-loading');
      root.setAttribute('aria-hidden', 'true');
      return;
    }
    root.classList.remove('is-loading');
    root.removeAttribute('aria-hidden');

    if (!user()) {
      const sessionUnavailable = Boolean(state.authError);
      const button = element('button', 'laqp-login-button', sessionUnavailable ? 'Reintentar cuenta' : 'Iniciar sesión');
      button.type = 'button';
      if (sessionUnavailable) button.addEventListener('click', () => refreshAuth('SESSION_RETRY'));
      else button.addEventListener('click', () => openModal('login'));
      root.appendChild(button);
      return;
    }

    const details = element('details', 'laqp-user-menu');
    const summary = element('summary', 'laqp-user-summary');
    const image = element('img');
    image.src = safeAvatarUrl(state.profile?.avatar_url);
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => { image.src = DEFAULT_AVATAR; }, { once: true });
    const label = element('span', '', state.profile?.display_name || state.profile?.username || 'Mi cuenta');
    summary.append(image, label);
    const menu = element('div', 'laqp-user-menu-panel');
    const accountLink = element('a', '', 'Mi cuenta');
    accountLink.href = '/mi-cuenta.html';
    const logout = element('button', '', 'Cerrar sesión');
    logout.type = 'button';
    logout.addEventListener('click', signOut);
    menu.append(accountLink, logout);
    details.append(summary, menu);
    root.appendChild(details);
  }

  function ensureModal() {
    let modal = document.querySelector('#laqp-auth-modal');
    if (modal) return modal;
    modal = element('div', 'laqp-auth-modal');
    modal.id = 'laqp-auth-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <button class="laqp-auth-backdrop" type="button" aria-label="Cerrar"></button>
      <section class="laqp-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="laqp-auth-title">
        <button class="laqp-auth-close" type="button" aria-label="Cerrar">×</button>
        <div class="laqp-auth-brand">LAqP.website</div>
        <h2 id="laqp-auth-title"></h2>
        <p id="laqp-auth-intro" class="laqp-auth-intro"></p>
        <button id="laqp-google-login" class="laqp-google-button" type="button"><span aria-hidden="true">G</span> Continuar con Google</button>
        <div id="laqp-auth-separator" class="laqp-auth-separator"><span>o con email</span></div>
        <form id="laqp-auth-form" class="laqp-auth-form" novalidate>
          <label id="laqp-auth-username-row">Nombre de usuario<input id="laqp-auth-username" name="username" maxlength="24"></label>
          <label id="laqp-auth-email-row">Correo electrónico<input id="laqp-auth-email" name="email" type="email"></label>
          <label id="laqp-auth-password-row"><span id="laqp-auth-password-label">Contraseña</span><input id="laqp-auth-password" name="password" type="password" minlength="8"></label>
          <label id="laqp-auth-repeat-row"><span id="laqp-auth-repeat-label">Repetir contraseña</span><input id="laqp-auth-repeat" name="repeat" type="password" minlength="8"></label>
          <button id="laqp-auth-submit" class="laqp-primary-button" type="submit"></button>
        </form>
        <p id="laqp-auth-message" class="laqp-form-message" role="status" aria-live="polite"></p>
        <div id="laqp-auth-links" class="laqp-auth-links"></div>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelector('.laqp-auth-backdrop').addEventListener('click', closeModal);
    modal.querySelector('.laqp-auth-close').addEventListener('click', closeModal);
    modal.querySelector('#laqp-auth-form').addEventListener('submit', submitAuth);
    modal.querySelector('#laqp-google-login').addEventListener('click', signInGoogle);
    modal.querySelector('#laqp-auth-links').addEventListener('click', event => {
      const target = event.target.closest('button[data-auth-mode]');
      if (target) openModal(target.dataset.authMode);
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !recoveryModeActive || state.mode !== 'update-password') return;
      if (!modal.classList.contains('is-open')) return;
      event.preventDefault();
      closeModal();
    });
    return modal;
  }

  function modeCopy() {
    if (state.mode === 'register') return ['Crear cuenta', 'Elegí tu nombre público. El correo nunca se muestra en tu perfil.', 'Crear cuenta'];
    if (state.mode === 'recover') return ['Recuperar contraseña', 'Te enviaremos un enlace seguro para elegir una contraseña nueva.', 'Enviar enlace'];
    if (state.mode === 'update-password') return ['Nueva contraseña', 'Elegí una contraseña nueva para tu cuenta.', 'Guardar contraseña'];
    return ['Iniciar sesión', 'Entrá para comentar y responder en LAqP.', 'Iniciar sesión'];
  }

  function addModeLink(container, text, mode) {
    const button = element('button', '', text);
    button.type = 'button';
    button.dataset.authMode = mode;
    container.appendChild(button);
  }

  function configureAuthField(modal, name, { visible, required = false, autocomplete = 'off', clear = false }) {
    const row = modal.querySelector(`#laqp-auth-${name}-row`);
    const input = modal.querySelector(`#laqp-auth-${name}`);
    row.hidden = !visible;
    input.disabled = !visible;
    input.required = visible && required;
    input.autocomplete = visible ? autocomplete : 'off';
    if (!visible || clear) input.value = '';
  }

  function renderModal() {
    const modal = ensureModal();
    const [title, intro, submit] = modeCopy();
    modal.querySelector('#laqp-auth-title').textContent = title;
    modal.querySelector('#laqp-auth-intro').textContent = intro;
    modal.querySelector('#laqp-auth-submit').textContent = submit;
    modal.querySelector('#laqp-auth-message').textContent = '';
    modal.querySelector('#laqp-auth-message').className = 'laqp-form-message';
    const isRegister = state.mode === 'register';
    const isRecover = state.mode === 'recover';
    const isUpdate = state.mode === 'update-password';
    const isLogin = state.mode === 'login';
    configureAuthField(modal, 'username', {
      visible: isRegister,
      required: isRegister,
      autocomplete: 'username',
    });
    configureAuthField(modal, 'email', {
      visible: isLogin || isRegister || isRecover,
      required: isLogin || isRegister || isRecover,
      autocomplete: 'email',
    });
    configureAuthField(modal, 'password', {
      visible: isLogin || isRegister || isUpdate,
      required: isLogin || isRegister || isUpdate,
      autocomplete: isLogin ? 'current-password' : 'new-password',
      clear: true,
    });
    configureAuthField(modal, 'repeat', {
      visible: isRegister || isUpdate,
      required: isRegister || isUpdate,
      autocomplete: 'new-password',
      clear: true,
    });
    modal.querySelector('#laqp-auth-password-label').textContent = isUpdate ? 'Nueva contraseña' : 'Contraseña';
    modal.querySelector('#laqp-auth-repeat-label').textContent = isUpdate ? 'Repetir nueva contraseña' : 'Repetir contraseña';
    modal.querySelector('#laqp-google-login').hidden = isRecover || isUpdate;
    modal.querySelector('#laqp-auth-separator').hidden = isRecover || isUpdate;
    const links = modal.querySelector('#laqp-auth-links');
    links.replaceChildren();
    links.hidden = isUpdate;
    if (state.mode !== 'login' && !isUpdate) addModeLink(links, 'Ya tengo cuenta', 'login');
    if (state.mode !== 'register' && !isUpdate) addModeLink(links, 'Crear cuenta', 'register');
    if (!isRecover && !isUpdate) addModeLink(links, 'Olvidé mi contraseña', 'recover');
  }

  function openModal(mode = 'login') {
    state.mode = recoveryModeActive ? 'update-password' : mode;
    renderModal();
    const modal = ensureModal();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('laqp-modal-open');
    setTimeout(() => modal.querySelector('input:not(:disabled)')?.focus(), 0);
  }

  function hideModal() {
    const modal = document.querySelector('#laqp-auth-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('laqp-modal-open');
  }

  function closeModal() {
    if (recoveryModeActive && state.mode === 'update-password') {
      void endPasswordRecovery();
      return;
    }
    hideModal();
  }

  async function endPasswordRecovery({ openLogin = false, successMessage = '' } = {}) {
    if (recoveryExitPromise) return recoveryExitPromise;
    hideModal();
    recoveryExitPromise = (async () => {
      try {
        const { error } = await client().auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch (error) {
        console.warn('[LAqP Auth] No se pudo cerrar limpiamente la sesión de recuperación.', error);
      } finally {
        hideModal();
        recoveryModeActive = false;
        clearPasswordRecoveryParam();
        state.session = null;
        state.profile = null;
        state.profileError = null;
        state.authError = null;
        state.ready = true;
        state.mode = 'login';
        renderHeader();
        renderAccountPage();
        emit('laqp-auth-change', { event: 'RECOVERY_ENDED', session: null, profile: null });
        if (openLogin) {
          openModal('login');
          if (successMessage) setMessage(successMessage, 'success');
        }
      }
    })();
    try {
      await recoveryExitPromise;
    } finally {
      recoveryExitPromise = null;
    }
  }

  function setMessage(text, type = '') {
    const node = document.querySelector('#laqp-auth-message');
    if (!node) return;
    node.textContent = text;
    node.className = `laqp-form-message${type ? ` is-${type}` : ''}`;
  }

  async function usernameAvailable(username) {
    const { data, error } = await client().from('profiles').select('id').eq('username', username).limit(1);
    if (error) throw error;
    return !data?.length;
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const email = form.email.value.trim();
    const password = form.password.value;
    const repeat = form.repeat.value;
    submit.disabled = true;
    setMessage('Procesando…');
    try {
      if (state.mode === 'register') {
        const check = validateUsername(form.username.value);
        if (!check.ok) throw new Error(check.message);
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        if (password !== repeat) throw new Error('Las contraseñas no coinciden.');
        if (!(await usernameAvailable(check.value))) throw Object.assign(new Error('username_taken'), { code: '23505' });
        const { data, error } = await client().auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: authRedirectUrl(),
            data: { username: check.value, display_name: check.value },
          },
        });
        if (error) throw error;
        setMessage(data.session ? 'Cuenta creada. Ya podés participar.' : 'Revisá tu correo para confirmar la cuenta.', 'success');
        return;
      }
      if (state.mode === 'recover') {
        const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: passwordRedirectUrl() });
        if (error) throw error;
        setMessage('Revisá tu correo para continuar con la recuperación.', 'success');
        return;
      }
      if (state.mode === 'update-password') {
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        if (password !== repeat) throw new Error('Las contraseñas no coinciden.');
        const { error } = await client().auth.updateUser({ password });
        if (error) throw error;
        await endPasswordRecovery({
          openLogin: true,
          successMessage: 'Contraseña actualizada. Iniciá sesión con tu nueva contraseña.',
        });
        return;
      }
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMessage('Sesión iniciada.', 'success');
      setTimeout(closeModal, 500);
    } catch (error) {
      const direct = ['Las contraseñas no coinciden.', 'La contraseña debe tener al menos 8 caracteres.'].includes(error?.message) || error?.message?.startsWith('Usá entre');
      setMessage(direct ? error.message : humanError(error), 'error');
    } finally {
      submit.disabled = false;
    }
  }

  async function signInGoogle() {
    setMessage('Abriendo Google…');
    const { error } = await client().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    });
    if (error) setMessage(humanError(error, 'No pudimos iniciar sesión con Google.'), 'error');
  }

  async function signOut() {
    try {
      const { error } = await client().auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (error) {
      console.warn('[LAqP Auth] No se pudo cerrar la sesión remota.', error);
    } finally {
      state.session = null;
      state.profile = null;
      state.profileError = null;
      state.authError = null;
      renderHeader();
      renderAccountPage();
      emit('laqp-auth-change', { session: null, profile: null });
    }
  }

  async function saveProfile(values) {
    const check = validateUsername(values.username);
    if (!check.ok) throw new Error(check.message);
    const displayName = String(values.display_name || '').trim().slice(0, 60);
    const bio = String(values.bio || '').trim().slice(0, 280);
    const avatar = String(values.avatar_url || DEFAULT_AVATAR).trim();
    const currentAvatar = String(state.profile?.avatar_url || '').trim();
    const keepsGoogleAvatar = isGoogleAvatar(currentAvatar) && avatar === currentAvatar;
    const keepsStorageAvatar = isStorageAvatar(currentAvatar) && avatar === currentAvatar;
    if (!LOCAL_AVATARS.includes(avatar) && !keepsGoogleAvatar && !keepsStorageAvatar) {
      throw new Error('Elegí uno de los avatares de LAqP disponibles o subí una foto de perfil.');
    }
    const { data, error } = await client()
      .from('profiles')
      .update({ username: check.value, display_name: displayName || null, avatar_url: avatar || null, bio: bio || null })
      .eq('id', user().id)
      .select('id,username,display_name,avatar_url,bio,created_at')
      .single();
    if (error) throw error;
    if (document.querySelector('[data-laqp-account-page]')) {
      data.username_changed_at = await loadOwnUsernameChangedAt();
    }
    state.profile = data;
    state.profileError = null;
    renderHeader();
    emit('laqp-profile-change', { profile: data });
    return data;
  }

  function renderAccountPage() {
    const root = document.querySelector('[data-laqp-account-page]');
    if (!root) return;
    root.replaceChildren();
    if (!state.ready) {
      root.appendChild(element('p', 'laqp-account-state', 'Comprobando sesión…'));
      return;
    }
    if (!user()) {
      const card = element('section', 'laqp-account-empty');
      const sessionUnavailable = Boolean(state.authError);
      card.append(
        element('h1', '', 'Mi cuenta'),
        element('p', '', sessionUnavailable
          ? 'No pudimos comprobar tu sesión. Tu cuenta no fue cerrada; revisá la conexión e intentá otra vez.'
          : 'Iniciá sesión para ver y editar tu perfil.'),
      );
      const button = element('button', 'laqp-primary-button', sessionUnavailable ? 'Reintentar' : 'Iniciar sesión');
      button.type = 'button';
      if (sessionUnavailable) {
        button.addEventListener('click', async () => {
          button.disabled = true;
          await refreshAuth('SESSION_RETRY');
        });
      } else {
        button.addEventListener('click', () => openModal('login'));
      }
      card.appendChild(button);
      root.appendChild(card);
      return;
    }

    if (!state.profile) {
      const card = element('section', 'laqp-account-empty');
      card.append(
        element('h1', '', 'Mi cuenta'),
        element('p', '', 'Tu sesión sigue activa, pero no pudimos cargar los datos de tu perfil.'),
      );
      const retry = element('button', 'laqp-primary-button', 'Reintentar');
      retry.type = 'button';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          await loadProfile();
        } catch (error) {
          console.warn('[LAqP Auth] No se pudo cargar el perfil.', error);
          state.profile = null;
          state.profileError = error;
        } finally {
          renderHeader();
          renderAccountPage();
        }
      });
      card.appendChild(retry);
      root.appendChild(card);
      return;
    }

    const shell = element('section', 'laqp-account-shell');
    const heading = element('header', 'laqp-account-heading');
    const headingCopy = element('div');
    headingCopy.append(
      element('span', 'laqp-account-kicker', 'Configuración'),
      element('h1', '', 'Mi cuenta'),
      element('p', '', 'Administrá tu perfil, revisá tu acceso y encontrá tu actividad en un solo lugar.'),
    );
    heading.appendChild(headingCopy);

    const tabs = element('nav', 'laqp-account-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Secciones de Mi cuenta');
    const panelDefinitions = [
      ['profile', 'Perfil'],
      ['security', 'Cuenta y seguridad'],
      ['activity', 'Actividad'],
    ];
    const panels = new Map();
    const tabButtons = new Map();
    panelDefinitions.forEach(([name, label], index) => {
      const button = element('button', 'laqp-account-tab', label);
      button.type = 'button';
      button.id = `laqp-account-tab-${name}`;
      button.dataset.accountTab = name;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `laqp-account-panel-${name}`);
      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      button.tabIndex = index === 0 ? 0 : -1;
      tabs.appendChild(button);
      tabButtons.set(name, button);
    });

    const panelWrap = element('div', 'laqp-account-panels');
    panelDefinitions.forEach(([name], index) => {
      const panel = element('section', 'laqp-account-panel');
      panel.id = `laqp-account-panel-${name}`;
      panel.dataset.accountPanel = name;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `laqp-account-tab-${name}`);
      panel.hidden = index !== 0;
      panels.set(name, panel);
      panelWrap.appendChild(panel);
    });

    const activateTab = (name, focus = false) => {
      panelDefinitions.forEach(([panelName]) => {
        const active = panelName === name;
        const button = tabButtons.get(panelName);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
        panels.get(panelName).hidden = !active;
      });
      if (focus) tabButtons.get(name)?.focus();
    };
    tabs.addEventListener('click', event => {
      const button = event.target.closest('[data-account-tab]');
      if (button) activateTab(button.dataset.accountTab);
    });
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const names = panelDefinitions.map(([name]) => name);
      const current = names.indexOf(event.target.dataset.accountTab);
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? names.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
      activateTab(names[next], true);
    });

    const form = element('form', 'laqp-profile-editor');
    form.innerHTML = `
      <div class="laqp-profile-heading"><img alt=""><div><span>Perfil</span><h2>Tu identidad en LAqP</h2><p class="laqp-member-since"></p></div></div>
      <div class="laqp-profile-grid">
        <div class="laqp-profile-field"><label>Nombre de usuario<input name="username" maxlength="24" autocomplete="username" spellcheck="false" aria-describedby="laqp-username-cooldown" required></label><small id="laqp-username-cooldown" class="laqp-username-cooldown" data-username-cooldown></small></div>
        <div class="laqp-profile-field"><label>Nombre visible<input name="display_name" maxlength="60" autocomplete="name"></label></div>
        <fieldset class="laqp-avatar-picker is-wide"><legend>Avatar</legend><div data-avatar-options></div><input name="avatar_url" type="hidden"></fieldset>
        <div class="laqp-avatar-custom-section is-wide">
          <div class="laqp-avatar-custom-header">
            <strong>Foto de perfil personalizada</strong>
            <p class="laqp-avatar-custom-hint">JPG, PNG o WEBP (máx. 2 MB)</p>
          </div>
          <div class="laqp-avatar-custom-body">
            <div class="laqp-avatar-preview-wrap">
              <img class="laqp-avatar-preview" data-custom-avatar-preview alt="" src="/assets/avatars/avatar-1.svg">
            </div>
            <div class="laqp-avatar-custom-actions">
              <input type="file" accept="image/jpeg,image/png,image/webp" class="laqp-file-input-hidden" data-avatar-file-input id="laqp-avatar-file">
              <label for="laqp-avatar-file" class="laqp-secondary-button" style="cursor:pointer; display:inline-flex; align-items:center;">Elegir foto</label>
              <button type="button" class="laqp-primary-button" data-avatar-upload-btn style="display:none;">Subir foto</button>
              <button type="button" class="laqp-secondary-button" data-avatar-cancel-btn style="display:none;">Cancelar</button>
              <button type="button" class="laqp-secondary-button" data-avatar-remove-btn style="display:none; color:var(--account-danger);">Eliminar foto personalizada</button>
            </div>
          </div>
          <p class="laqp-form-message" data-avatar-custom-message role="status"></p>
        </div>
        <label class="is-wide">Bio<textarea name="bio" maxlength="280" rows="4"></textarea><small><span data-bio-count>0</span>/280</small></label>
      </div>
      <div class="laqp-profile-actions"><button class="laqp-primary-button" type="submit">Guardar cambios</button><a class="laqp-secondary-button laqp-button-link" data-public-profile-link>Ver perfil público</a></div>
      <p class="laqp-form-message" data-profile-message role="status"></p>`;
    const avatar = form.querySelector('.laqp-profile-heading img');
    avatar.src = safeAvatarUrl(state.profile?.avatar_url);
    avatar.referrerPolicy = 'no-referrer';
    avatar.addEventListener('error', () => { avatar.src = DEFAULT_AVATAR; }, { once: true });
    form.username.value = state.profile?.username || '';
    form.display_name.value = state.profile?.display_name || '';
    const storedAvatar = String(state.profile?.avatar_url || '').trim();
    form.avatar_url.value = safeAvatarUrl(storedAvatar);
    const avatarOptions = form.querySelector('[data-avatar-options]');
    const selectAvatar = value => {
      form.avatar_url.value = value;
      avatarOptions.querySelectorAll('[data-avatar-choice]').forEach(option => {
        option.classList.toggle('is-selected', option.dataset.avatarChoice === value);
        option.setAttribute('aria-pressed', option.dataset.avatarChoice === value ? 'true' : 'false');
      });
      avatar.src = safeAvatarUrl(value);
    };
    const addAvatarChoice = (value, label) => {
      const option = element('button', 'laqp-avatar-option');
      option.type = 'button';
      option.dataset.avatarChoice = value;
      const image = element('img');
      image.src = safeAvatarUrl(value);
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { image.src = DEFAULT_AVATAR; }, { once: true });
      option.append(image, element('span', '', label));
      option.addEventListener('click', () => selectAvatar(value));
      avatarOptions.appendChild(option);
    };
    if (isStorageAvatar(storedAvatar)) addAvatarChoice(storedAvatar, 'Foto personalizada');
    if (isGoogleAvatar(storedAvatar)) addAvatarChoice(storedAvatar, 'Foto de Google');
    LOCAL_AVATARS.forEach((value, index) => addAvatarChoice(value, `Avatar ${index + 1}`));
    selectAvatar(form.avatar_url.value);

    // Controles de foto personalizada
    const customPreview = form.querySelector('[data-custom-avatar-preview]');
    const fileInput = form.querySelector('[data-avatar-file-input]');
    const uploadBtn = form.querySelector('[data-avatar-upload-btn]');
    const cancelBtn = form.querySelector('[data-avatar-cancel-btn]');
    const removeBtn = form.querySelector('[data-avatar-remove-btn]');
    const customMsg = form.querySelector('[data-avatar-custom-message]');

    const syncCustomPreview = () => {
      const current = safeAvatarUrl(state.profile?.avatar_url);
      customPreview.src = current;
      customPreview.addEventListener('error', () => { customPreview.src = DEFAULT_AVATAR; }, { once: true });
      const hasCustom = isStorageAvatar(state.profile?.avatar_url);
      removeBtn.style.display = hasCustom ? 'inline-flex' : 'none';
      uploadBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      fileInput.value = '';
    };
    syncCustomPreview();

    let pendingFile = null;
    let pendingObjectUrl = null;

    fileInput.addEventListener('change', async () => {
      customMsg.textContent = '';
      customMsg.className = 'laqp-form-message';
      const file = fileInput.files?.[0];
      if (!file) return;

      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(file.type)) {
        customMsg.textContent = 'Formato no permitido. Elegí una imagen JPG, PNG o WEBP.';
        customMsg.className = 'laqp-form-message is-error';
        fileInput.value = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        customMsg.textContent = 'La imagen supera los 2 MB máximos permitidos.';
        customMsg.className = 'laqp-form-message is-error';
        fileInput.value = '';
        return;
      }

      // Validar decodificación real en el navegador
      try {
        const testUrl = URL.createObjectURL(file);
        await new Promise((resolve, reject) => {
          const testImg = new Image();
          testImg.onload = () => resolve();
          testImg.onerror = () => reject(new Error('decode_failed'));
          testImg.src = testUrl;
        });
        if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
        pendingObjectUrl = testUrl;
        pendingFile = file;
        customPreview.src = testUrl;
        uploadBtn.style.display = 'inline-flex';
        cancelBtn.style.display = 'inline-flex';
        removeBtn.style.display = 'none';
        customMsg.textContent = 'Vista previa lista. Hacé clic en "Subir foto" para guardarla.';
        customMsg.className = 'laqp-form-message is-success';
      } catch {
        if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
        pendingFile = null;
        pendingObjectUrl = null;
        customMsg.textContent = 'El archivo seleccionado no es una imagen válida o está dañado.';
        customMsg.className = 'laqp-form-message is-error';
        fileInput.value = '';
        syncCustomPreview();
      }
    });

    cancelBtn.addEventListener('click', () => {
      if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
      pendingFile = null;
      pendingObjectUrl = null;
      customMsg.textContent = '';
      customMsg.className = 'laqp-form-message';
      syncCustomPreview();
    });

    uploadBtn.addEventListener('click', async () => {
      if (!pendingFile || !client() || !user()) return;
      uploadBtn.disabled = true;
      cancelBtn.disabled = true;
      customMsg.textContent = 'Subiendo imagen…';
      customMsg.className = 'laqp-form-message';

      const extensionMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };
      const ext = extensionMap[pendingFile.type] || 'jpg';
      const fileName = `${Date.now()}-avatar.${ext}`;
      const filePath = `${user().id}/${fileName}`;
      let newlyUploadedPath = null;
      const oldAvatarUrl = state.profile?.avatar_url;

      try {
        // 1. Subir la imagen nueva
        const { error: uploadError } = await client().storage.from('avatars').upload(filePath, pendingFile, {
          cacheControl: '3600',
          upsert: false,
        });
        if (uploadError) throw uploadError;
        newlyUploadedPath = filePath;

        // 2. Obtener URL pública exacta
        const { data: pubData } = client().storage.from('avatars').getPublicUrl(filePath);
        const newPublicUrl = pubData?.publicUrl;
        if (!newPublicUrl) throw new Error('No se pudo generar la URL de la imagen.');

        // 3. Actualizar profiles.avatar_url
        const { data: updatedProfile, error: profileError } = await client()
          .from('profiles')
          .update({ avatar_url: newPublicUrl })
          .eq('id', user().id)
          .select('id,username,display_name,avatar_url,bio,created_at')
          .single();

        if (profileError) throw profileError;

        // 4. Si se actualizó el perfil correctamente, borrar el avatar custom anterior si existía
        const oldStoragePath = safeUserStoragePath(oldAvatarUrl, user().id);
        if (oldStoragePath && oldStoragePath !== filePath) {
          try {
            await client().storage.from('avatars').remove([oldStoragePath]);
          } catch (err) {
            console.warn('[LAqP Storage] No se pudo eliminar el avatar anterior.', err);
          }
        }

        if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
        pendingFile = null;
        pendingObjectUrl = null;

        state.profile = updatedProfile;
        state.profileError = null;
        renderHeader();
        emit('laqp-profile-change', { profile: updatedProfile });

        customMsg.textContent = 'Foto de perfil actualizada con éxito.';
        customMsg.className = 'laqp-form-message is-success';
        renderAccountPage();
      } catch (err) {
        console.warn('[LAqP Storage]', err);
        // Rollback: Si se subió el archivo nuevo pero falló la actualización del perfil, eliminar la imagen recién subida
        const rollbackPath = safeUserStoragePath(`${projectStoragePrefix()}${newlyUploadedPath}`, user().id);
        if (rollbackPath) {
          try {
            await client().storage.from('avatars').remove([rollbackPath]);
          } catch (rbErr) {
            console.warn('[LAqP Storage] Error en rollback de imagen subida.', rbErr);
          }
        }
        customMsg.textContent = humanError(err, 'No pudimos subir la foto de perfil.');
        customMsg.className = 'laqp-form-message is-error';
      } finally {
        uploadBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });

    removeBtn.addEventListener('click', async () => {
      const storagePath = safeUserStoragePath(state.profile?.avatar_url, user()?.id);
      if (!storagePath || !client() || !user()) return;
      if (!window.confirm('¿Querés eliminar tu foto de perfil personalizada y volver al avatar predeterminado?')) return;
      removeBtn.disabled = true;
      customMsg.textContent = 'Eliminando foto…';
      customMsg.className = 'laqp-form-message';

      try {
        // 1. Actualizar perfil al avatar predeterminado
        const { data: updatedProfile, error: profileError } = await client()
          .from('profiles')
          .update({ avatar_url: DEFAULT_AVATAR })
          .eq('id', user().id)
          .select('id,username,display_name,avatar_url,bio,created_at')
          .single();

        if (profileError) throw profileError;

        // 2. Tras confirmar actualización del perfil, eliminar de Storage el archivo verificado
        try {
          await client().storage.from('avatars').remove([storagePath]);
        } catch (rmErr) {
          console.warn('[LAqP Storage] No se pudo borrar el archivo de Storage tras actualizar el perfil.', rmErr);
        }

        state.profile = updatedProfile;
        state.profileError = null;
        renderHeader();
        emit('laqp-profile-change', { profile: updatedProfile });

        customMsg.textContent = 'Foto personalizada eliminada.';
        customMsg.className = 'laqp-form-message is-success';
        renderAccountPage();
      } catch (err) {
        console.warn('[LAqP Storage]', err);
        customMsg.textContent = humanError(err, 'No pudimos eliminar la foto de perfil.');
        customMsg.className = 'laqp-form-message is-error';
        removeBtn.disabled = false;
      }
    });

    form.bio.value = state.profile?.bio || '';
    form.querySelector('[data-bio-count]').textContent = String(form.bio.value.length);
    form.querySelector('.laqp-member-since').textContent = state.profile?.created_at
      ? `Miembro desde ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(state.profile.created_at))}`
      : 'Perfil de usuario';
    form.querySelector('[data-public-profile-link]').href = `/perfil/?id=${encodeURIComponent(user().id)}`;
    renderUsernameCooldown(form.querySelector('[data-username-cooldown]'));
    form.bio.addEventListener('input', () => { form.querySelector('[data-bio-count]').textContent = String(form.bio.value.length); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const message = form.querySelector('[data-profile-message]');
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      message.textContent = 'Guardando…';
      message.className = 'laqp-form-message';
      try {
        await saveProfile(Object.fromEntries(new FormData(form)));
        message.textContent = 'Perfil actualizado.';
        message.className = 'laqp-form-message is-success';
        avatar.src = safeAvatarUrl(state.profile?.avatar_url);
        form.username.value = state.profile?.username || form.username.value;
        renderUsernameCooldown(form.querySelector('[data-username-cooldown]'));
      } catch (error) {
        const direct = error?.message?.startsWith('Usá ') || error?.message?.startsWith('Elegí uno');
        message.textContent = direct ? error.message : humanError(error, 'No pudimos guardar el perfil.');
        message.className = 'laqp-form-message is-error';
      } finally {
        button.disabled = false;
      }
    });

    panels.get('profile').appendChild(form);

    const securityPanel = panels.get('security');
    const securityHeading = element('div', 'laqp-account-section-heading');
    securityHeading.append(
      element('span', 'laqp-account-kicker', 'Privacidad y acceso'),
      element('h2', '', 'Cuenta y seguridad'),
      element('p', '', 'Estos datos son privados y sólo se muestran dentro de Mi cuenta.'),
    );
    const securityFeatures = element('div', 'laqp-account-feature-root');
    securityFeatures.dataset.laqpAccountSecurity = '';
    securityFeatures.appendChild(element('p', 'laqp-account-state', 'Cargando seguridad…'));
    securityPanel.append(securityHeading, securityFeatures);

    const activityPanel = panels.get('activity');
    const activityHeading = element('div', 'laqp-account-section-heading');
    activityHeading.append(
      element('span', 'laqp-account-kicker', 'Actividad'),
      element('h2', '', 'Tu espacio en LAqP'),
      element('p', '', 'Tu actividad y contenido guardado aparecerán acá.'),
    );
    const activityFeatures = element('div', 'laqp-account-feature-root');
    activityFeatures.dataset.laqpAccountActivity = '';
    activityFeatures.appendChild(element('p', 'laqp-account-state', 'Cargando actividad…'));
    activityPanel.append(activityHeading, activityFeatures);

    shell.append(heading, tabs, panelWrap);
    root.appendChild(shell);
    emit('laqp-account-render', { user: user(), profile: state.profile });
  }

  async function refreshAuth(eventName = 'INITIAL_SESSION') {
    const recoveryRequested = hasPasswordRecoveryParam();
    try {
      const { data, error } = await client().auth.getSession();
      if (error) throw error;
      state.authError = null;
      if (data.session && (recoveryRequested || recoveryModeActive)) {
        enterPasswordRecovery(data.session);
        return;
      }
      state.session = data.session || null;
      if (!state.session) {
        state.profile = null;
        state.profileError = null;
      } else {
        try {
          await loadProfile();
        } catch (error) {
          console.warn('[LAqP Auth] La sesión sigue activa, pero no se pudo cargar el perfil.', error);
          state.profile = null;
          state.profileError = error;
        }
      }
    } catch (error) {
      console.warn('[LAqP Auth] No se pudo comprobar la sesión. Se conserva el estado local actual.', error);
      state.authError = error;
    } finally {
      state.ready = true;
      renderHeader();
      renderAccountPage();
      emit('laqp-auth-change', { event: eventName, session: state.session, profile: state.profile });
    }
  }

  function handleAuthChange(event, session) {
    window.setTimeout(async () => {
      state.authError = null;
      if (session && (event === 'PASSWORD_RECOVERY' || recoveryModeActive || hasPasswordRecoveryParam())) {
        enterPasswordRecovery(session);
        return;
      }
      state.session = session || null;
      try {
        state.profile = session ? await loadProfile() : null;
        if (!session) state.profileError = null;
      } catch (error) {
        console.warn('[LAqP Auth] No se pudo cargar el perfil.', error);
        state.profile = null;
        state.profileError = error;
      }
      state.ready = true;
      renderHeader();
      renderAccountPage();
      emit('laqp-auth-change', { event, session: state.session, profile: state.profile });
    }, 0);
  }

  async function init() {
    ensureModal();
    renderHeader();
    const authClient = await waitForClient();
    if (!authClient) {
      const error = new Error('No se pudo inicializar el cliente de Supabase.');
      console.error('[LAqP Auth]', error);
      state.authError = error;
      state.ready = true;
      renderHeader();
      renderAccountPage();
      emit('laqp-auth-change', { event: 'CLIENT_UNAVAILABLE', session: state.session, profile: state.profile, error: true });
      return;
    }
    const result = authClient.auth.onAuthStateChange(handleAuthChange);
    authSubscription = result.data.subscription;
    await refreshAuth();
    if (hasPasswordRecoveryParam()) enterPasswordRecovery(state.session);
  }

  window.LAQPAuth = Object.freeze({
    get user() { return user(); },
    get profile() { return profile(); },
    get ready() { return state.ready; },
    open: openModal,
    close: closeModal,
    signOut,
    refreshProfile: async () => {
      try {
        await loadProfile();
      } catch (error) {
        console.warn('[LAqP Auth] No se pudo cargar el perfil.', error);
        state.profile = null;
        state.profileError = error;
      }
      renderHeader();
      renderAccountPage();
    },
    saveProfile,
    validateUsername,
  });
  window.laqpAuthOpen = openModal;
  window.laqpCurrentUser = user;
  window.laqpCurrentProfile = profile;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('pagehide', () => authSubscription?.unsubscribe?.(), { once: true });
})();
