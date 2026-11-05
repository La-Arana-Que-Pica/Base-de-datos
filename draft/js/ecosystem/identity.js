// Presentation adapter for the existing LAQPAuth account; no separate users.
export const DEFAULT_AVATAR='/assets/avatars/avatar-1.svg';
export function profileAvatar(profile,config=globalThis.window?.LAQP_SUPABASE_CONFIG){const raw=String(profile?.avatar_url||'').trim();if(/^\/assets\/avatars\/avatar-[1-4]\.svg$/.test(raw)||/^https:\/\/lh3\.googleusercontent\.com\//i.test(raw))return raw;const base=config?.url||'https://npyvbqzgcdoujfxefsdr.supabase.co';if(raw.startsWith(base+'/storage/v1/object/public/avatars/'))return raw;return DEFAULT_AVATAR;}
