import {DRAFT_DEPLOYMENT} from './deploymentConfig.js';
const loads=new Map();
function script(src){if(!loads.has(src))loads.set(src,new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=src;node.onload=resolve;node.onerror=()=>reject(Error('No se pudo cargar la conexión de cuentas. Tus guardados siguen disponibles.'));document.head.append(node);}));return loads.get(src);}
export async function configureDraftDeployment(config=DRAFT_DEPLOYMENT,scope=window){
 if(config.enabled!==true)return false;
 const refs={production:'npyvbqzgcdoujfxefsdr',staging:'niyqnkoqngyoogpwkegl'};
 if(config.contractVerified!==true||config.uiEnabled!==true||refs[config.environment]!==config.projectRef||scope.location.origin!==config.webOrigin||config.environment==='production'&&config.webOrigin!=='https://laqp.website')throw Error('La beta no tiene una configuración verificada para este entorno.');
 if(!scope.LAQP_SUPABASE){if(!scope.supabase)await script('/draft/vendor/supabase-sdk.js');if(!scope.LAQPCreateSupabaseClient)await script('/js/supabaseClient.js');scope.LAQPCreateSupabaseClient?.();}
 const client=scope.LAQP_SUPABASE;if(client?.supabaseUrl!=='https://'+config.projectRef+'.supabase.co')throw Error('La conexión de cuentas no pertenece al proyecto aprobado. No se cambió de perfil.');
 if(!scope.LAQPAuth)await script('/js/auth.js');
 // Admission is evaluated only at entry: Auth events never replace a running
 // local game. Server JWT/allowlist checks remain authoritative on every call.
 const audience=config.audience||'allowlist',ids=config.userIds||[];
 if(!['allowlist','public'].includes(audience)||!Array.isArray(ids)||ids.length>64||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||! /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))||audience==='allowlist'&&!ids.length||audience==='public'&&config.publicApproved!==true)throw Error('El grupo de la beta no tiene una activación aprobada.');
 if(audience==='allowlist'){try{const {sharedIdentity}=await import('./accounts/client.js'),identity=await sharedIdentity(client)();if(!identity||!ids.includes(identity.id))return false;}catch{return false;}}
 scope.LAQP_DRAFT_ACCOUNT_CONFIG={enabled:true,uiEnabled:true};return true;
}
