'use strict';

let laqpAuthSession = null;
let laqpAuthMode = 'login';
let laqpCurrentProfileCache = null;
let laqpProfileMode = 'setup';
let laqpSelectedAvatarId = 'avatar-1';

const DEFAULT_AVATARS = [
  { id: 'avatar-1', name: 'Balon clasico', url: 'assets/avatars/avatar-1.svg' },
  { id: 'avatar-2', name: 'Botin dorado', url: 'assets/avatars/avatar-2.svg' },
  { id: 'avatar-3', name: 'Cancha', url: 'assets/avatars/avatar-3.svg' },
  { id: 'avatar-4', name: 'Copa', url: 'assets/avatars/avatar-4.svg' },
];

function laqpAuthClient() {
  return window.LAQP_SUPABASE || null;
}

function laqpAuthConfigured() {
  return Boolean(window.LAQP_SUPABASE_CONFIG?.configured?.() && laqpAuthClient());
}

function laqpCurrentUser() {
  return laqpAuthSession?.user || null;
}

function laqpCurrentProfile() {
  return laqpCurrentProfileCache;
}

function getAvatarById(avatarId) {
  return DEFAULT_AVATARS.find(avatar => avatar.id === avatarId) || DEFAULT_AVATARS[0];
}

function validateUsername(username) {
  const value = String(username || '').trim();
  if (!value) return { ok: false, message: 'Ingresá un nombre de usuario.' };
  if (value.length < 3) return { ok: false, message: 'El usuario debe tener al menos 3 caracteres.' };
  if (value.length > 20) return { ok: false, message: 'El usuario no puede superar los 20 caracteres.' };
  if (!/^[a-zA-Z0-9._]+$/.test(value)) return { ok: false, message: 'Usá solo letras, números, guion bajo y punto.' };
  return { ok: true, value: value.toLowerCase() };
}

function laqpAuthSafeError(error, fallback) {
  if (!error) return fallback;
  const msg = String(error.message || '').toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) return 'Email o contraseña incorrectos.';
  if (msg.includes('already registered') || msg.includes('already exists')) return 'Ese email ya tiene una cuenta.';
  if (msg.includes('email')) return 'Revisá que el email sea correcto.';
  if (msg.includes('password')) return 'Revisá la contraseña ingresada.';
  return fallback;
}

function laqpAuthEmailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function laqpAuthSetMessage(text, type = 'info') {
  const box = document.querySelector('#laqp-auth-message');
  if (!box) return;
  box.textContent = text || '';
  box.className = `auth-message ${type}`;
}

function laqpAuthOpen(mode = 'login') {
  laqpAuthMode = mode;
  laqpAuthRenderModal();
  document.body.classList.add('auth-modal-open');
}

function laqpAuthClose() {
  document.body.classList.remove('auth-modal-open');
}

function laqpAuthModeTitle() {
  if (laqpAuthMode === 'register') return 'Crear cuenta';
  if (laqpAuthMode === 'recover') return 'Recuperar contraseña';
  if (laqpAuthMode === 'update-password') return 'Nueva contraseña';
  return 'Iniciar sesión';
}

function laqpAuthRenderControls() {
  const header = document.querySelector('#header');
  if (!header) return;
  let wrap = document.querySelector('#auth-controls');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'auth-controls';
    wrap.className = 'auth-controls';
    header.appendChild(wrap);
  }

  const user = laqpCurrentUser();
  if (user) {
    const profile = laqpCurrentProfile();
    const avatar = getAvatarById(profile?.avatar_id);
    if (profile) {
      wrap.innerHTML = `
        <button type="button" class="auth-account-btn" onclick="openProfileSetupModal('edit')" title="${laqpAuthEscape(user.email || 'Mi cuenta')}">
          <img src="${laqpAuthEscape(avatar.url)}" alt="">
          <span>${laqpAuthEscape(profile.username)}</span>
        </button>
        <button type="button" class="auth-btn auth-btn-secondary" onclick="laqpAuthLogout()">Cerrar sesión</button>`;
      return;
    }
    wrap.innerHTML = `
      <button type="button" class="auth-btn" onclick="openProfileSetupModal('setup')">Configurar perfil</button>
      <button type="button" class="auth-btn auth-btn-secondary" onclick="laqpAuthLogout()">Cerrar sesión</button>`;
    return;
  }

  wrap.innerHTML = `
    <button type="button" class="auth-btn" onclick="laqpAuthOpen('login')">Iniciar sesión</button>
    <button type="button" class="auth-btn auth-btn-secondary" onclick="laqpAuthOpen('register')">Crear cuenta</button>`;
}

async function getCurrentProfile(force = false) {
  const client = laqpAuthClient();
  const user = laqpCurrentUser();
  if (!client || !user) {
    laqpCurrentProfileCache = null;
    return null;
  }
  if (!force && laqpCurrentProfileCache?.user_id === user.id) return laqpCurrentProfileCache;
  const { data, error } = await client
    .from('profiles')
    .select('user_id,username,avatar_id,created_at,updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    laqpCurrentProfileCache = null;
    return null;
  }
  laqpCurrentProfileCache = data || null;
  return laqpCurrentProfileCache;
}

function renderAvatarPicker(selectedId = 'avatar-1') {
  return `
    <div class="profile-avatar-grid">
      ${DEFAULT_AVATARS.map(avatar => `
        <button type="button" class="profile-avatar-option${avatar.id === selectedId ? ' is-selected' : ''}" onclick="selectProfileAvatar('${avatar.id}')">
          <img src="${laqpAuthEscape(avatar.url)}" alt="${laqpAuthEscape(avatar.name)}">
          <span>${laqpAuthEscape(avatar.name)}</span>
        </button>`).join('')}
    </div>`;
}

function selectProfileAvatar(avatarId) {
  if (!getAvatarById(avatarId)) return;
  laqpSelectedAvatarId = avatarId;
  const picker = document.querySelector('#profile-avatar-picker');
  if (picker) picker.innerHTML = renderAvatarPicker(avatarId);
}

function openProfileSetupModal(mode = 'setup') {
  const user = laqpCurrentUser();
  if (!user) return laqpAuthOpen('login');
  laqpProfileMode = mode;
  const profile = laqpCurrentProfile();
  laqpSelectedAvatarId = profile?.avatar_id || 'avatar-1';
  laqpRenderProfileModal();
  document.body.classList.add('profile-modal-open');
}

function closeProfileSetupModal() {
  if (!laqpCurrentProfile()) return;
  document.body.classList.remove('profile-modal-open');
}

function laqpRenderProfileModal() {
  let modal = document.querySelector('#profile-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'profile-modal';
    modal.className = 'profile-modal';
    document.body.appendChild(modal);
  }
  const profile = laqpCurrentProfile();
  const required = !profile;
  modal.innerHTML = `
    <div class="profile-modal-backdrop" ${required ? '' : 'onclick="closeProfileSetupModal()"'}></div>
    <section class="profile-card" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      ${required ? '' : '<button type="button" class="auth-close" onclick="closeProfileSetupModal()" aria-label="Cerrar">×</button>'}
      <div class="auth-card-head">
        <span>Mi cuenta</span>
        <h2 id="profile-title">Configurá tu perfil</h2>
        <p>Elegí un nombre público y un avatar predeterminado para comentar en LAqP.</p>
      </div>
      <form class="auth-form" onsubmit="saveProfile(event)">
        <label>
          <span>Nombre de usuario</span>
          <input id="profile-username" type="text" maxlength="20" autocomplete="nickname" value="${laqpAuthEscape(profile?.username || '')}" placeholder="editor2018" required>
        </label>
        <div>
          <div class="profile-picker-label">Avatar</div>
          <div id="profile-avatar-picker">${renderAvatarPicker(laqpSelectedAvatarId)}</div>
        </div>
        <button type="submit" class="auth-submit">Guardar perfil</button>
      </form>
      <div id="profile-message" class="auth-message"></div>
    </section>`;
}

function profileSetMessage(text, type = '') {
  const box = document.querySelector('#profile-message');
  if (!box) return;
  box.textContent = text || '';
  box.className = `auth-message ${type}`;
}

async function createProfile(username, avatarId) {
  const client = laqpAuthClient();
  const user = laqpCurrentUser();
  if (!client || !user) return { error: { message: 'Sin sesión.' } };
  return client.from('profiles').insert({ user_id: user.id, username, avatar_id: avatarId }).select().single();
}

async function updateProfile(username, avatarId) {
  const client = laqpAuthClient();
  const user = laqpCurrentUser();
  if (!client || !user) return { error: { message: 'Sin sesión.' } };
  return client
    .from('profiles')
    .update({ username, avatar_id: avatarId, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select()
    .single();
}

async function saveProfile(event) {
  event.preventDefault();
  const usernameCheck = validateUsername(document.querySelector('#profile-username')?.value || '');
  if (!usernameCheck.ok) return profileSetMessage(usernameCheck.message, 'error');
  if (!DEFAULT_AVATARS.some(avatar => avatar.id === laqpSelectedAvatarId)) return profileSetMessage('Elegí un avatar válido.', 'error');

  profileSetMessage('Guardando...', '');
  const result = laqpCurrentProfile()
    ? await updateProfile(usernameCheck.value, laqpSelectedAvatarId)
    : await createProfile(usernameCheck.value, laqpSelectedAvatarId);

  if (result.error) {
    const msg = String(result.error.message || '').toLowerCase().includes('duplicate') || String(result.error.message || '').toLowerCase().includes('unique')
      ? 'Ese nombre de usuario ya está usado.'
      : 'No pudimos guardar el perfil.';
    return profileSetMessage(msg, 'error');
  }

  laqpCurrentProfileCache = result.data;
  laqpAuthRenderControls();
  profileSetMessage('Perfil guardado.', 'success');
  document.dispatchEvent(new CustomEvent('laqp-profile-change', { detail: { profile: laqpCurrentProfileCache } }));
  setTimeout(() => document.body.classList.remove('profile-modal-open'), 600);
}

async function ensureUserProfile() {
  const user = laqpCurrentUser();
  if (!user || !laqpAuthConfigured()) {
    laqpCurrentProfileCache = null;
    laqpAuthRenderControls();
    return null;
  }
  const profile = await getCurrentProfile(true);
  laqpAuthRenderControls();
  document.dispatchEvent(new CustomEvent('laqp-profile-change', { detail: { profile } }));
  if (!profile) openProfileSetupModal('setup');
  return profile;
}

function laqpAuthRenderModal() {
  let modal = document.querySelector('#auth-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.className = 'auth-modal';
    document.body.appendChild(modal);
  }

  const isRegister = laqpAuthMode === 'register';
  const isRecover = laqpAuthMode === 'recover';
  const isUpdate = laqpAuthMode === 'update-password';
  const passwordFields = !isRecover;

  modal.innerHTML = `
    <div class="auth-modal-backdrop" onclick="laqpAuthClose()"></div>
    <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" class="auth-close" onclick="laqpAuthClose()" aria-label="Cerrar">×</button>
      <div class="auth-card-head">
        <span>LAqP</span>
        <h2 id="auth-title">${laqpAuthModeTitle()}</h2>
        <p>${isRecover ? 'Te mandamos un enlace para volver a entrar.' : isUpdate ? 'Ingresá una nueva contraseña para tu cuenta.' : 'El login es opcional. La web sigue funcionando sin cuenta.'}</p>
      </div>
      <form class="auth-form" onsubmit="laqpAuthSubmit(event)">
        ${!isUpdate ? `
          <label>
            <span>Email</span>
            <input id="auth-email" type="email" autocomplete="email" required>
          </label>` : ''}
        ${passwordFields ? `
          <label>
            <span>Contraseña</span>
            <input id="auth-password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" required>
          </label>` : ''}
        ${isRegister || isUpdate ? `
          <label>
            <span>Repetir contraseña</span>
            <input id="auth-password-repeat" type="password" autocomplete="new-password" required>
          </label>` : ''}
        <button type="submit" class="auth-submit">${isRegister ? 'Crear cuenta' : isRecover ? 'Enviar recuperación' : isUpdate ? 'Guardar contraseña' : 'Entrar'}</button>
      </form>
      <div id="laqp-auth-message" class="auth-message"></div>
      ${laqpAuthConfigured() ? '' : '<div class="auth-message warning">Falta configurar Supabase en js/supabaseClient.js.</div>'}
      <div class="auth-switches">
        ${laqpAuthMode !== 'login' ? "<button type=\"button\" onclick=\"laqpAuthOpen('login')\">Ya tengo cuenta</button>" : ''}
        ${laqpAuthMode !== 'register' && !isUpdate ? "<button type=\"button\" onclick=\"laqpAuthOpen('register')\">Crear cuenta</button>" : ''}
        ${laqpAuthMode !== 'recover' && !isUpdate ? "<button type=\"button\" onclick=\"laqpAuthOpen('recover')\">Olvidé mi contraseña</button>" : ''}
      </div>
    </section>`;
}

async function laqpAuthSubmit(event) {
  event.preventDefault();
  if (!laqpAuthConfigured()) {
    laqpAuthSetMessage('Primero configurá Supabase en js/supabaseClient.js.', 'error');
    return;
  }

  const client = laqpAuthClient();
  const email = document.querySelector('#auth-email')?.value.trim();
  const password = document.querySelector('#auth-password')?.value || '';
  const repeat = document.querySelector('#auth-password-repeat')?.value || '';

  if (laqpAuthMode !== 'update-password' && !laqpAuthEmailIsValid(email)) {
    laqpAuthSetMessage('Ingresá un email válido.', 'error');
    return;
  }
  if (laqpAuthMode !== 'recover' && !password) {
    laqpAuthSetMessage('Ingresá una contraseña.', 'error');
    return;
  }
  if ((laqpAuthMode === 'register' || laqpAuthMode === 'update-password') && password !== repeat) {
    laqpAuthSetMessage('Las contraseñas no coinciden.', 'error');
    return;
  }

  laqpAuthSetMessage('Procesando...', 'info');

  if (laqpAuthMode === 'register') {
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return laqpAuthSetMessage(laqpAuthSafeError(error, 'No pudimos crear la cuenta.'), 'error');
    laqpAuthSetMessage('Revisá tu correo para confirmar la cuenta.', 'success');
    return;
  }

  if (laqpAuthMode === 'recover') {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.split('#')[0],
    });
    if (error) return laqpAuthSetMessage(laqpAuthSafeError(error, 'No pudimos enviar la recuperación.'), 'error');
    laqpAuthSetMessage('Te enviamos un enlace para recuperar tu contraseña.', 'success');
    return;
  }

  if (laqpAuthMode === 'update-password') {
    const { error } = await client.auth.updateUser({ password });
    if (error) return laqpAuthSetMessage(laqpAuthSafeError(error, 'No pudimos actualizar la contraseña.'), 'error');
    laqpAuthSetMessage('Contraseña actualizada.', 'success');
    setTimeout(laqpAuthClose, 900);
    return;
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return laqpAuthSetMessage(laqpAuthSafeError(error, 'Email o contraseña incorrectos.'), 'error');
  laqpAuthSetMessage('Sesión iniciada.', 'success');
  setTimeout(laqpAuthClose, 700);
}

async function laqpAuthLogout() {
  if (!laqpAuthConfigured()) return;
  await laqpAuthClient().auth.signOut();
  laqpAuthSession = null;
  laqpCurrentProfileCache = null;
  laqpAuthRenderControls();
  laqpAuthToast('Sesión cerrada.');
}

function laqpAuthToast(text) {
  let toast = document.querySelector('#auth-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'auth-toast';
    toast.className = 'auth-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('is-visible');
  setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function laqpAuthEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function laqpAuthInit() {
  laqpAuthRenderControls();
  laqpAuthRenderModal();
  if (!laqpAuthConfigured()) return;

  const client = laqpAuthClient();
  const { data } = await client.auth.getSession();
  laqpAuthSession = data?.session || null;
  await ensureUserProfile();

  client.auth.onAuthStateChange(async (event, session) => {
    laqpAuthSession = session || null;
    if (event === 'PASSWORD_RECOVERY') {
      laqpAuthMode = 'update-password';
      laqpAuthOpen('update-password');
    }
    if (session) await ensureUserProfile();
    else {
      laqpCurrentProfileCache = null;
      laqpAuthRenderControls();
      document.dispatchEvent(new CustomEvent('laqp-profile-change', { detail: { profile: null } }));
    }
    document.dispatchEvent(new CustomEvent('laqp-auth-change', { detail: { event, session } }));
  });
}

document.addEventListener('DOMContentLoaded', laqpAuthInit);

window.laqpAuthOpen = laqpAuthOpen;
window.laqpAuthClose = laqpAuthClose;
window.laqpAuthSubmit = laqpAuthSubmit;
window.laqpAuthLogout = laqpAuthLogout;
window.laqpCurrentUser = laqpCurrentUser;
window.laqpCurrentProfile = laqpCurrentProfile;
window.getCurrentProfile = getCurrentProfile;
window.ensureUserProfile = ensureUserProfile;
window.openProfileSetupModal = openProfileSetupModal;
window.closeProfileSetupModal = closeProfileSetupModal;
window.validateUsername = validateUsername;
window.getAvatarById = getAvatarById;
window.renderAvatarPicker = renderAvatarPicker;
window.selectProfileAvatar = selectProfileAvatar;
window.createProfile = createProfile;
window.updateProfile = updateProfile;
window.saveProfile = saveProfile;
window.DEFAULT_AVATARS = DEFAULT_AVATARS;
