import {fail} from '../format.js';
import {accountOwner,STAGING_REF,PROTECTED_REF,bytes} from './protocol.js';
import {LEGACY_TRANSPORT,ADAPTIVE_TRANSPORT} from './batching.js';
import {syncAccess,watchSyncAccess} from './access.js';
// Reuses the web's singleton. Never creates a second Auth client or stores JWTs.
export function syncConfiguration(scope=globalThis.window){
 const config=scope?.LAQP_DRAFT_PERSONAL_SYNC_CONFIG,client=scope?.LAQP_SUPABASE;
 if(config?.enabled!==true||config?.contractVerified!==true)return null;
 const url=new URL(client?.supabaseUrl||'https://unconfigured.invalid');
 if(config.projectRef!==STAGING_REF||url.hostname!==config.projectRef+'.supabase.co'||url.protocol!=='https:'||url.hostname.startsWith(PROTECTED_REF))fail('SYNC_CONFIGURATION','La sincronización de prueba requiere el singleton Auth exclusivo de staging');
 return {client,projectRef:config.projectRef,access:owner=>syncAccess(scope,config.projectRef,owner),watchAccess:fn=>watchSyncAccess(scope,fn)};
}
export class PersonalSyncClient{
 constructor({client,projectRef,timeoutMs=15000,access=()=>true,watchAccess}){if(projectRef!==STAGING_REF||new URL(client.supabaseUrl).origin!=='https://'+projectRef+'.supabase.co')fail('SYNC_CONFIGURATION','Destino de sincronización no autorizado');Object.assign(this,{client,projectRef,timeoutMs,access,watchAccess});this.epoch=0;this.controllers=new Set();this.metrics=[];}
 assertAccess(owner){if(!this.access(owner))fail('SYNC_DISABLED','El respaldo está pausado para esta cuenta. Tu progreso local se conserva');}
 disconnect(){this.epoch++;this.transport=null;for(const c of this.controllers)c.abort();this.controllers.clear();}
 async negotiate(owner){
  if(this.transport)return this.transport;const epoch=this.epoch;let result;
  try{result=await this.call(owner,'draft_personal_transport_v2');}catch(e){if(e.code!=='SYNC_UNSUPPORTED')throw e;result=LEGACY_TRANSPORT;}
  if(epoch!==this.epoch)fail('SYNC_DETACHED','La cuenta cambió');
  if(result?.version===1)this.transport=LEGACY_TRANSPORT;
  else if(Object.keys(ADAPTIVE_TRANSPORT).every(k=>result?.[k]===ADAPTIVE_TRANSPORT[k]))this.transport=ADAPTIVE_TRANSPORT;
  else fail('SYNC_VERSION','Transporte de respaldo incompatible');return this.transport;
 }
 async session(owner){
  this.assertAccess(owner);
  const uid=accountOwner(owner,this.projectRef),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);this.controllers.add(controller);let abort;
  const canceled=new Promise((resolve,reject)=>{abort=()=>reject(new DOMException('Aborted','AbortError'));controller.signal.addEventListener('abort',abort,{once:true});});
  try{const {data,error}=await Promise.race([this.client.auth.getSession(),canceled]),s=data?.session;
   if(error&&(/Fetch|Network/i.test(error.name||'')||error.status>=500))fail('SYNC_NETWORK','No se pudo consultar la sesión; la partida local continúa');
   this.assertAccess(owner);if(error||!s?.access_token||s.user?.id!==uid||s.user.is_anonymous||s.expires_at&&s.expires_at*1000<=Date.now())fail('SYNC_AUTH','Sesión vencida · Podés seguir jugando en este dispositivo');return s;
  }catch(e){if(typeof e.code==='string')throw e;fail('SYNC_NETWORK','No se pudo consultar la sesión; la partida local continúa');}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);this.controllers.delete(controller);}
 }
 async call(owner,name,args={}){
  if(!['draft_personal_head_v1','draft_personal_get_v1','draft_personal_put_v1','draft_personal_commit_v1','draft_personal_transport_v2','draft_personal_get_v2','draft_personal_put_v2'].includes(name))fail('SYNC_RPC','Operación de sincronización desconocida');
  const epoch=this.epoch;await this.session(owner);if(epoch!==this.epoch)fail('SYNC_DETACHED','La cuenta cambió');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);this.controllers.add(controller);const start=performance.now();let abort;
  const canceled=new Promise((resolve,reject)=>{abort=()=>reject(new DOMException('Aborted','AbortError'));controller.signal.addEventListener('abort',abort,{once:true});});let result='ok';
  try{this.assertAccess(owner);let query=this.client.rpc(name,args);if(query.abortSignal)query=query.abortSignal(controller.signal);const {data,error,status}=await Promise.race([query,canceled]);
   if(epoch!==this.epoch)fail('SYNC_DETACHED','Respuesta de una cuenta anterior descartada');
   // SDK session changes can precede the shared web event.
   await this.session(owner);if(epoch!==this.epoch)fail('SYNC_DETACHED','La cuenta cambió');
   if(error){const message=String(error.message||''),http=error.status||status;const code=name==='draft_personal_transport_v2'&&error.code==='PGRST202'?'SYNC_UNSUPPORTED':http===401||/JWT|token.*expired/i.test(message)?'SYNC_AUTH':http===403?'SYNC_PERMISSION':/LF4_CONFLICT/.test(message)?'SYNC_CONFLICT':/LF4_OPERATION/.test(message)?'SYNC_IDEMPOTENCY':http===413||/LF4_SIZE|LF4_QUOTA/.test(message)?'SYNC_SIZE':http===429||/LF4_RATE/.test(message)?'SYNC_RATE':'SYNC_NETWORK';fail(code,code==='SYNC_CONFLICT'?'Hay otra versión en la cuenta':code==='SYNC_AUTH'?'Sesión vencida · El juego continúa localmente':code==='SYNC_SIZE'?'El respaldo alcanzó un límite de tamaño. El progreso local se conserva':code==='SYNC_RATE'?'Demasiados respaldos recientes. Podés seguir jugando y reintentar más tarde':'No se confirmó el respaldo de la cuenta');}
   return data;
  }catch(e){result=typeof e.code==='string'?e.code:'SYNC_NETWORK';if(typeof e.code==='string')throw e;fail('SYNC_NETWORK','Sin conexión con el respaldo · Tu progreso local se conserva');}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);this.controllers.delete(controller);this.metrics.push({rpc:name,result,ms:performance.now()-start,requestBytes:bytes(JSON.stringify(args))});if(this.metrics.length>100)this.metrics.shift();}
 }
 async head(owner,backup=null,includeManifest=false){const h=await this.call(owner,'draft_personal_head_v1',{p_backup:backup,p_manifest:includeManifest});if(h!==null&&(!h||Array.isArray(h)||!Number.isSafeInteger(h.revision)||h.revision<1||typeof h.hash!=='string'||!/^[a-f0-9]{64}$/.test(h.hash)||includeManifest&&typeof h.manifest!=='string'))fail('SYNC_FORMAT','No se pudo verificar el estado de la cuenta. Tu copia local se conserva');return h;}
 get(owner,hashes){return this.call(owner,this.transport?.version===2?'draft_personal_get_v2':'draft_personal_get_v1',{p_hashes:hashes});}
 async put(owner,chunks){const receipt=await this.call(owner,this.transport?.version===2?'draft_personal_put_v2':'draft_personal_put_v1',{p_chunks:chunks});if(!Number.isSafeInteger(receipt?.stored)||receipt.stored<0||receipt.stored>chunks.length)fail('SYNC_FORMAT','No se confirmó la recepción de los fragmentos');return receipt;}
 commit(owner,job){return this.call(owner,'draft_personal_commit_v1',{p_operation:job.operationId,p_expected_revision:job.expectedRevision,p_manifest:job.text,p_hash:job.hash,p_protect_current:!!job.protectCurrent});}
}
