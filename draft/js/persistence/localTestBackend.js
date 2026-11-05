export const TEST_PROJECT='niyqnkoqngyoogpwkegl';
export const TEST_URL='https://'+TEST_PROJECT+'.supabase.co';
export function localTestRequested(location){return new URLSearchParams(location?.search||'').get('draftTest')==='1';}
export function validateLocalTestConfig(config){
 if(config?.url!==TEST_URL)throw new Error('Modo pruebas: URL incorrecta; debe pertenecer a LAqP Draft - Pruebas.');
 const key=config.publishableKey;
 if(typeof key!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)||key.includes('PEGAR_'))throw new Error('Modo pruebas: falta una clave publishable válida. No uses secret/service_role ni contraseñas.');
 return {url:TEST_URL,publishableKey:key};
}
export async function createLocalTestClient(location,sdk,loadConfig){
 if(!localTestRequested(location))return null;
 if(!['localhost','127.0.0.1'].includes(location.hostname))throw new Error('Modo pruebas bloqueado: solo disponible en localhost o 127.0.0.1.');
 const config=validateLocalTestConfig(await loadConfig());
 if(!sdk?.createClient)throw new Error('Modo pruebas: no se pudo cargar Supabase. No se conectará a producción.');
 return sdk.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'laqp-draft-test-auth-'+TEST_PROJECT}});
}
export function testScopedStorage(storage){if(!storage)return null;const prefix='laqp-draft-test-'+TEST_PROJECT+':';return {getItem:k=>storage.getItem(prefix+k),setItem:(k,v)=>storage.setItem(prefix+k,v),removeItem:k=>storage.removeItem(prefix+k)};}
