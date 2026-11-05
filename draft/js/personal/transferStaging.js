import {stagingTransferRequested} from './context.js';
import {PersonalSyncClient,syncConfiguration} from './sync/client.js';
import {accountIdentity} from './identity.js';
import {fail} from './format.js';
import {routeURL} from '../navigation/routes.js';

// Auth belongs to the website singleton. This adapter neither creates a client
// nor stores credentials. getUser authenticates each new in-memory session token.
export async function createStagingTransferAdapter({scope=window}={}){
 if(!stagingTransferRequested(scope))fail('TRANSFER_CONFIGURATION','Staging no está activado para este entorno');
 const config=syncConfiguration(scope),sdk=config.client,restriction=scope.LAQP_DRAFT_GUEST_TRANSFER_CONFIG;
 if(scope.LAQP_DRAFT_PERSONAL_TEST_IDENTITY||scope.LAQP_LF5_LAB)fail('TRANSFER_CONFIGURATION','Una sesión ficticia no habilita staging');
 let observed=null,verified=null,verifiedToken=null,inflight=null,epoch=0,closed=false,refreshTimer=null,renewed=false;const listeners=new Set(),waiters=new Set();
 const networkError=e=>e?.code==='SYNC_NETWORK'||e?.status>=500||/Fetch|Network/i.test(e?.name||'')||e instanceof TypeError;
 const emit=value=>{for(const fn of listeners){try{fn(value);}catch{}}};
 function current(){return !closed&&stagingTransferRequested(scope)&&observed?.access_token===verifiedToken&&observed?.user?.id===verified?.id&&observed?.expires_at*1000>Date.now()?accountIdentity(config.projectRef,verified.id):null;}
 async function refresh(){
  if(closed)return null;if(inflight)return inflight;const generation=epoch;
  const task=(async()=>{const {data,error}=await sdk.auth.getSession();if(closed||generation!==epoch)fail('TRANSFER_IDENTITY','La sesión cambió durante la verificación');if(error||!data?.session){verified=null;verifiedToken=null;return null;}const session=data.session;observed=session;
   if(session.user?.is_anonymous||session.expires_at*1000<=Date.now())fail('SYNC_AUTH','Iniciá sesión con una cuenta verificada');
   if(verifiedToken===session.access_token&&verified?.id===session.user.id)return current();
   let result;try{result=await sdk.auth.getUser(session.access_token);}catch(e){if(networkError(e))fail('SYNC_NETWORK','Sin conexión para verificar la cuenta; tu copia local se conserva');throw e;}if(closed||generation!==epoch)fail('TRANSFER_IDENTITY','La sesión cambió durante la verificación');
   if(networkError(result.error))fail('SYNC_NETWORK','Sin conexión para verificar la cuenta; tu copia local se conserva');
   const user=result.data?.user;if(result.error||user?.id!==session.user.id||user.is_anonymous||user.role!=='authenticated'||!user.email_confirmed_at&&!user.phone_confirmed_at)fail('SYNC_AUTH','La cuenta todavía no está verificada');
   if(restriction.allowedUserId&&user.id!==restriction.allowedUserId||restriction.deniedUserIds?.includes(user.id))fail('TRANSFER_IDENTITY','Esta cuenta no es el destino descartable autorizado');
   verified=user;verifiedToken=session.access_token;const owner=current();emit({type:'verified',userId:user.id,owner,renewed});renewed=false;for(const w of waiters)w.resolve(owner);waiters.clear();return owner;
  })();inflight=task;try{return await task;}finally{if(inflight===task)inflight=null;}
 }
 const subscription=sdk.auth.onAuthStateChange((event,session)=>{
  const changed=observed?.user?.id!==session?.user?.id||event==='SIGNED_OUT',tokenChanged=observed?.access_token!==session?.access_token;
  if(changed||tokenChanged){renewed=!changed&&(!!verified||renewed);epoch++;verified=null;verifiedToken=null;}
  observed=session;if(changed){renewed=false;emit({type:'changed',userId:session?.user?.id||null});}
  if(session){clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{refreshTimer=null;try{if(inflight)await inflight.catch(()=>{});if(!closed)await refresh();}catch{if(!closed)emit({type:'unverified',userId:observed?.user?.id||null});}},0);}
 });
 for(let attempt=0;attempt<2;attempt++){try{await refresh();break;}catch(e){if(e.code==='TRANSFER_IDENTITY'&&attempt===0)continue;if(networkError(e))break;subscription?.data?.subscription?.unsubscribe?.();throw e;}}
 const online=()=>{refresh().catch(()=>emit({type:'unverified',userId:observed?.user?.id||null}));};scope.addEventListener?.('online',online);
 const client=owner=>{if(owner!==current())fail('TRANSFER_IDENTITY','La cuenta autenticada cambió');return new PersonalSyncClient(config);};
 return {
  kind:'staging',projectRef:config.projectRef,current,refresh,autoBackup:true,storagePrefix:'lf5-staging',online:()=>scope.navigator?.onLine!==false,
  label:()=>verified?.email||'Tu cuenta de staging',
  client,
  async signIn(){const owner=await refresh();if(owner)return owner;if(!scope.LAQPAuth?.open)fail('SYNC_AUTH','El ingreso de LAqP todavía no está listo');const waiting=new Promise((resolve,reject)=>waiters.add({resolve,reject}));scope.LAQPAuth.open('login');return waiting;},
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  backend:{kind:'staging',projectRef:config.projectRef,guard(owner){if(owner!==current())fail('TRANSFER_IDENTITY','La sesión autenticada cambió');if(config.access&&!config.access(owner))fail('SYNC_DISABLED','El respaldo está pausado para esta cuenta');},async inspect(owner){await refresh();if(owner!==current())fail('TRANSFER_IDENTITY','La cuenta autenticada cambió');const c=client(owner);try{await c.session(owner);const head=await c.head(owner);return {owner,empty:head===null,revision:head?.revision||0,verification:'staging',projectRef:config.projectRef};}finally{c.disconnect();}}},
  navigate(owner,snapshot){if(owner!==current())fail('TRANSFER_IDENTITY','La cuenta autenticada cambió');localStorage.setItem('lf5-staging-active',owner);const c=snapshot?.matches?.find(r=>r.key.startsWith('lf3-match:'))?.generations?.[0]?.sealed?.checkpoint,name=c?.mode==='CAREER'?'career':c?.mode==='SURVIVAL_DREAM'?'survivalDream':c?.mode==='SURVIVAL'?'survival':'classic';scope.location.assign(routeURL(name,{personal:1,personalProfile:owner,...(name==='career'?{continue:c.region}:{})}));},
  dispose(){closed=true;epoch++;clearTimeout(refreshTimer);verified=null;verifiedToken=null;subscription?.data?.subscription?.unsubscribe?.();scope.removeEventListener?.('online',online);listeners.clear();for(const w of waiters)w.reject(Error('Sesión cerrada'));waiters.clear();}
 };
}
