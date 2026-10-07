'use strict';

/*
 * Configuracion publica de Supabase para LAqP.website.
 *
 * La publishable key (o anon key heredada) puede estar en el navegador: RLS es
 * la barrera de seguridad. NUNCA pegues aca una service_role ni otra clave
 * administrativa.
 */
const SUPABASE_URL = 'https://npyvbqzgcdoujfxefsdr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DEkFKiLQFRQtkovGyNSA9g_6vk12ouU';

function laqpSupabaseConfigured() {
  return Boolean(
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
    SUPABASE_PUBLISHABLE_KEY &&
    !SUPABASE_PUBLISHABLE_KEY.includes('PEGAR_') &&
    !/service_role/i.test(SUPABASE_PUBLISHABLE_KEY)
  );
}

window.LAQP_SUPABASE_CONFIG = Object.freeze({
  url: SUPABASE_URL,
  publishableKey: SUPABASE_PUBLISHABLE_KEY,
  configured: laqpSupabaseConfigured(),
});

window.LAQPCreateSupabaseClient = function createLAQPSupabaseClient() {
  if (!window.LAQP_SUPABASE_CONFIG.configured || !window.supabase?.createClient) return null;
  if (window.LAQP_SUPABASE) return window.LAQP_SUPABASE;

  window.LAQP_SUPABASE = window.supabase.createClient(
    window.LAQP_SUPABASE_CONFIG.url,
    window.LAQP_SUPABASE_CONFIG.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'laqp-auth-v1',
      },
    }
  );
  return window.LAQP_SUPABASE;
};

// Si la librería ya fue cargada, crear inmediatamente la única instancia.
// La fábrica sigue disponible para consumidores que se inicialicen después.
window.LAQPCreateSupabaseClient();
