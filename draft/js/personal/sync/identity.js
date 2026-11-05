import {accountOwner} from './protocol.js';
import {fail} from '../format.js';
const req=q=>new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
const key=owner=>'lf4-local-access:'+owner;
// This is a local cache permission, not proof of server identity or a cloud grant.
// An expired/offline account can continue its existing device cache. Explicit
// logout revokes this shortcut; another signed-in user always takes precedence.
export async function assertPersonalSelection(repository,selected,{scope=window,sessionTimeoutMs=1500}={}){
 if(!selected?.startsWith('account:'))return;
 const [,project,userId]=selected.split(':');accountOwner(selected,project);
 if(scope.LAQP_DRAFT_PERSONAL_TEST_IDENTITY&&['127.0.0.1','localhost','[::1]'].includes(scope.location?.hostname))return;
 const client=scope.LAQP_SUPABASE,projectURL=client?.supabaseUrl||scope.LAQP_SUPABASE_CONFIG?.url;
 if(projectURL&&new URL(projectURL).hostname!==project+'.supabase.co')fail('SYNC_OWNER','El perfil pertenece a otro proyecto de cuentas');
 let user=scope.LAQPAuth?.user;if(client?.auth?.getSession){let timer;try{const session=await Promise.race([Promise.resolve().then(()=>client.auth.getSession()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Local cache session timeout')),Math.max(1,Math.min(1500,sessionTimeoutMs)));})]);user=session.error?null:session.data?.session?.user||null;}catch{user=null;/* Only an already granted cache may survive an offline refresh. */}finally{clearTimeout(timer);}} 
 if(user){if(user.id!==userId||user.is_anonymous)fail('SYNC_OWNER','La cuenta seleccionada no coincide con la sesión');await repository.transaction(['metadata'],'readwrite',tx=>req(tx.objectStore('metadata').put({key:key(selected),allowed:true})));return;}
 const access=await repository.transaction(['metadata'],'readonly',tx=>req(tx.objectStore('metadata').get(key(selected))));
 if(access?.allowed&&(await repository.listProfiles()).some(p=>p.identity===selected))return;
 fail('SYNC_OWNER','Iniciá sesión para abrir por primera vez este perfil de cuenta. El invitado y todos los guardados se conservan.');
}
export async function revokeLocalAccountAccess(repository,owner){if(!owner.startsWith('account:'))return;await repository.transaction(['metadata'],'readwrite',tx=>req(tx.objectStore('metadata').put({key:key(owner),allowed:false})));}
