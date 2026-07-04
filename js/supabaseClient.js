'use strict';

const SUPABASE_URL = 'https://npyvbqzgcdoujfxefsdr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DEkFKiLQFRQtkovGyNSA9g_6vk12ouU';

function laqpSupabaseConfigured() {
  return Boolean(
    window.supabase &&
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('PEGAR_ACA') &&
    !SUPABASE_ANON_KEY.includes('PEGAR_ACA')
  );
}

window.LAQP_SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  configured: laqpSupabaseConfigured,
};

window.LAQP_SUPABASE = laqpSupabaseConfigured()
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
