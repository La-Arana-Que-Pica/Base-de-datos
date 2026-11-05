// LF5 local transfer core. Isolated fictional laboratory or explicitly verified
// loopback staging adapter; public configuration never enables this module.
import {STORES} from './repository.js';
import {canonical,digest,clone,blankData,verify,recordId,fail} from './format.js';
import {remapGuestSnapshot} from './transferRemap.js';
import {installMatchCopies} from './matches.js';
import {freshCareer} from '../career/rules.js';
import {ensureExpansion} from '../expansion/economy.js';
import {stagingTransferRequested} from './context.js';
const req=q=>new Promise((ok,no)=>{q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
const key=id=>'lf5-transfer:'+id;
export async function verifyTransferBackup(row){
 if(row?.transferBackupVersion!==1||row.kind!=='protected'||row.reason!=='before-guest-transfer-full-seven-stores')fail('TRANSFER_BACKUP','Respaldo de transferencia incompatible');
 for(const part of ['source','target']){const stores=row.original?.[part];if(!stores||Object.keys(stores).sort().join(',')!==[...STORES].sort().join(',')||STORES.some(n=>!Array.isArray(stores[n])))fail('TRANSFER_BACKUP','El respaldo no contiene los siete stores');}
 await verify(row.sealed);
 if(row.sealed.bundle.identity!==row.identity)fail('TRANSFER_BACKUP','Propietario de respaldo inconsistente');
 if(await digest(row.original.source)!==row.sourceHash||await digest(row.original.target)!==row.targetHash)fail('TRANSFER_BACKUP','El contenido original del respaldo cambió');return clone(row.original);
}
const ownerPrefixes=['lf3-match:','lf3-protected:','lf2-pending:','lf4-state:','lf4-job:','lf4-protected-job:','lf4-local-access:','restore:'];
async function rows(tx,owner){
 const all={};for(const n of STORES){const store=tx.objectStore(n);
  if(n==='profiles'){const head=await req(store.get(owner));all[n]=head?[head]:[];continue;}
  if(n!=='metadata'){all[n]=await req(store.index('owner').getAll(owner));continue;}
  // Read keys before values: unrelated durable transfer journals can be large.
  // Never clone every other identity's graph just to discard it afterwards.
  all[n]=[];for(const key of await req(store.getAllKeys())){
   if(typeof key!=='string'||key==='schema'||key.startsWith('lf5-transfer:'))continue;
   const prefix=ownerPrefixes.find(p=>key.startsWith(p));
   if(prefix&&key!==prefix+owner&&!key.startsWith(prefix+owner+':'))continue;
   const row=await req(store.get(key));if(prefix||row?.owner===owner||row?.identity===owner)all[n].push(row);
  }
 }return all;
}
function empty(snapshot){
 const p=snapshot.profiles;
 if(snapshot.runs.length||snapshot.history.length||snapshot.outbox.length||snapshot.metadata.some(r=>r.key!=='lf4-local-access:'+(p[0]?.identity)||typeof r.allowed!=='boolean'||Object.keys(r).sort().join(',')!=='allowed,key'))return false;
 if(!p.length)return !snapshot.receipts.length&&!snapshot.recovery.length;
 if(p.length!==1||!snapshot.recovery.every(r=>r.kind==='checkpoint'))return false;
 const data=blankData(),initial=freshCareer();ensureExpansion(initial);
 const created=canonical(p[0].shared)===canonical(data.shared)&&snapshot.receipts.length===1&&snapshot.receipts[0].value.kind==='create'&&p[0].revision===1;
 data.shared.progress=initial;
 const initialized=p[0].revision===2&&canonical(p[0].shared)===canonical(data.shared)&&snapshot.receipts.length===2&&snapshot.receipts.some(r=>r.value.kind==='create'&&r.value.id==='create-profile')&&snapshot.receipts.some(r=>r.value.kind==='initialize'&&r.value.id==='initialize:'+p[0].identity);
 return created||initialized;
}
export class GuestTransferRepository{
 constructor(repository,{backend,selectedAccount,isPlaying=()=>false,testBoundary=null}){
  if(backend?.kind!=='fictional'&&!(backend?.kind==='staging'&&backend.projectRef==='niyqnkoqngyoogpwkegl'&&stagingTransferRequested()&&repository.name==='laqp-draft-personal-lf5-staging'))fail('TRANSFER_BACKEND','La transferencia requiere un backend autorizado y aislado');
  Object.assign(this,{repository,backend,selectedAccount,isPlaying,testBoundary});
 }
 boundary(name){const result=this.testBoundary?.(name);if(result?.then)fail('TRANSFER_TEST_ASYNC','Los puntos de fallo no pueden mantener viva una transacción');}
 guard(target){if(this.backend.kind==='staging'&&(!stagingTransferRequested()||!target.startsWith('account:niyqnkoqngyoogpwkegl:')))fail('TRANSFER_BACKEND','La activación de staging cambió');this.backend.guard?.(target);if(this.selectedAccount()!==target)fail('TRANSFER_IDENTITY','La cuenta seleccionada cambió');if(this.isPlaying())fail('TRANSFER_PLAYING','Pausá y confirmá el checkpoint antes de transferir');}
 async get(id){const j=await this.repository.transaction(['metadata'],'readonly',async tx=>(await req(tx.objectStore('metadata').get(key(id))))?.value||null);if(j&&this.selectedAccount()!==j.target)fail('TRANSFER_IDENTITY','El journal pertenece a otra cuenta seleccionada');return j;}
 async proof(target){const p=await this.backend.inspect(target);if(p?.owner===target&&p.empty===false&&Number.isSafeInteger(p.revision)&&p.revision>0)fail('TRANSFER_REMOTE_UNKNOWN','La cuenta ya tiene progreso en la nube; conservá ambas partidas',{state:'requires-decision',installed:false,reason:'remote-progress'});if(p?.owner!==target||p.empty!==true||p.revision!==0)fail('TRANSFER_REMOTE_UNKNOWN','La cuenta remota no está verificada como vacía',{state:'requires-decision',installed:false});return clone(p);}
 async inspectLocalDestination(target){this.guard(target);const snapshot=await this.repository.transaction(STORES,'readonly',tx=>rows(tx,target));if(snapshot.profiles.length)await this.repository.verified(target);return {empty:empty(snapshot)};}
 async inspectDestination(target){this.guard(target);const proof=await this.proof(target);return {...await this.inspectLocalDestination(target),proof};}
 async prepare({operationId,source,target}){
  recordId(operationId);this.guard(target);if(await this.get(operationId))fail('TRANSFER_EXISTS','Recuperá la operación existente por su identificador');
  this.boundary('prepare-start');
  const proof=await this.proof(target),full=await this.repository.transaction(STORES,'readonly',async tx=>({source:await rows(tx,source),target:await rows(tx,target)}));
  if(!empty(full.target))fail('TRANSFER_DESTINATION_CONFLICT','La cuenta tiene datos o coordinación pendientes',{state:'requires-decision',installed:false});
  if(full.target.profiles.length)await this.repository.verified(target);
  if(full.source.metadata.some(r=>r.key.startsWith('lf2-pending:')))fail('TRANSFER_PENDING','Confirmá primero los guardados pendientes');
  if(full.source.metadata.some(r=>r.key!=='guest-identity'&&!ownerPrefixes.some(p=>r.key===p+source||r.key.startsWith(p+source+':'))))fail('TRANSFER_SCHEMA','Hay metadata de propietario sin contrato de transferencia');
  const original=await this.repository.inspectExport(await this.repository.exportProfile(source));
  this.boundary('before-remap');
  const prepared=await remapGuestSnapshot({active:original.active,matches:original.matches||[]},target);
  this.boundary('after-remap');
  const sourceNow=await this.repository.transaction(STORES,'readonly',tx=>rows(tx,source));
  if(canonical(sourceNow)!==canonical(full.source))fail('TRANSFER_CHANGED','El invitado cambió durante la preparación');
  const binding={operationId,source,target,sourceHash:await digest(full.source),targetHash:await digest(full.target),proof};
  const journal={version:1,...binding,requestHash:await digest(binding),state:'prepared',full,original:{active:original.active,matches:original.matches||[]},prepared,consent:null,receipt:null};
  this.guard(target);
  this.boundary('before-prepared-journal');
  await this.repository.transaction(['metadata'],'readwrite',tx=>req(tx.objectStore('metadata').add({key:key(operationId),value:journal})));
  this.boundary('after-prepared-journal');
  return {operationId,requestHash:journal.requestHash,state:journal.state};
 }
 async consent(operationId,{requestHash,confirmed=false}){
  if(!confirmed)fail('CONFIRMATION','La transferencia requiere confirmación explícita');
  this.boundary('before-consent');
  const j=await this.get(operationId);if(!j||j.requestHash!==requestHash)fail('TRANSFER_CONSENT','Vista previa inválida');this.guard(j.target);
  if(j.state!=='prepared')fail('TRANSFER_STATE','La operación ya avanzó; recuperá su estado');
  const consent={id:crypto.randomUUID(),requestHash,logicalTime:Date.now()};
  await this.repository.transaction(STORES,'readwrite',async tx=>{this.guard(j.target);const s=tx.objectStore('metadata'),current=await req(s.get(key(operationId)));if(current.value.state!=='prepared'||canonical(current.value)!==canonical(j))fail('CONFLICT','Otra pestaña cambió la decisión');if(canonical(await rows(tx,j.source))!==canonical(j.full.source)||canonical(await rows(tx,j.target))!==canonical(j.full.target))fail('TRANSFER_CHANGED','La vista previa ya no corresponde al progreso actual');this.guard(j.target);await req(s.put({key:key(operationId),value:{...j,state:'consented',consent}}));});this.boundary('after-consent');return consent;
 }
 async install(operationId,consent){
  const j=await this.get(operationId);if(!j||canonical(j.consent)!==canonical(consent))fail('TRANSFER_CONSENT','Consentimiento diferente');this.guard(j.target);
  if(j.consent?.requestHash!==j.requestHash||typeof j.consent.id!=='string'||!Number.isSafeInteger(j.consent.logicalTime)||j.consent.logicalTime<0)fail('TRANSFER_CONSENT','Consentimiento durable incompatible');
  if(j.version!==1||await digest({operationId:j.operationId,source:j.source,target:j.target,sourceHash:j.sourceHash,targetHash:j.targetHash,proof:j.proof})!==j.requestHash)fail('INTEGRITY','Journal incompatible o dañado');
  await verify(j.prepared.active);
  if(['installed','local-confirmed'].includes(j.state)&&(j.receipt?.id!=='transfer:'+operationId||j.receipt.requestHash!==j.requestHash||j.receipt.source!==j.source||j.receipt.target!==j.target||j.receipt.installedHash!==j.prepared.active.hash||j.receipt.cloudConfirmed!==false))fail('INTEGRITY','El recibo de transferencia fue alterado');
  if(j.state==='local-confirmed'){await this.checkBackup(j);return clone(j.receipt);}
  if(j.state==='installed')return this.confirmRead(j);
  if(j.state!=='consented')fail('TRANSFER_STATE','Falta consentimiento');
  if(canonical(await this.proof(j.target))!==canonical(j.proof))fail('TRANSFER_REMOTE_CHANGED','El destino remoto cambió');
  const remapped=await remapGuestSnapshot(j.original,j.target);
  if(j.full.source.profiles.length!==1||j.full.source.profiles[0].hash!==j.original.active.hash)fail('INTEGRITY','El origen preparado no corresponde al respaldo');
  const originalMatches=j.full.source.metadata.filter(r=>r.key.startsWith('lf3-match:')||r.key.startsWith('lf3-protected:')).sort((a,b)=>a.key.localeCompare(b.key));
  if(canonical(originalMatches)!==canonical([...j.original.matches].sort((a,b)=>a.key.localeCompare(b.key))))fail('INTEGRITY','La metadata deportiva no corresponde al respaldo');
  if(canonical(remapped)!==canonical(j.prepared))fail('INTEGRITY','El grafo preparado difiere del remapeo autorizado');
  // Revalidate the durable prepared graph independently of any ephemeral cache.
  await verify(j.prepared.active);
  const {validateCloudMatches}=await import('./sync/local.js');await validateCloudMatches({...j.prepared,matches:j.prepared.matches.filter(r=>r.key.startsWith('lf3-match:'))});
  if(await digest(j.full.source)!==j.sourceHash||await digest(j.full.target)!==j.targetHash)fail('INTEGRITY','Respaldo de preparación dañado');
  const receipt={version:1,id:'transfer:'+operationId,requestHash:j.requestHash,source:j.source,target:j.target,installedHash:j.prepared.active.hash,cloudConfirmed:false};
  this.boundary('before-install-transaction');
  await this.repository.transaction(STORES,'readwrite',async tx=>{
   this.guard(j.target);const meta=tx.objectStore('metadata'),current=(await req(meta.get(key(operationId))))?.value;
   if(current?.requestHash!==j.requestHash||canonical(current.consent)!==canonical(consent))fail('IDEMPOTENCY','Operación reutilizada con otro consentimiento');
   if(current.state==='installed'||current.state==='local-confirmed')return;
   if(canonical(current)!==canonical(j))fail('CONFLICT','El journal cambió durante la validación');
   if(current.state!=='consented')fail('CONFLICT','La operación cambió');
   if(canonical(await rows(tx,j.source))!==canonical(j.full.source)||canonical(await rows(tx,j.target))!==canonical(j.full.target))fail('TRANSFER_CHANGED','Origen o destino cambiaron; se requiere otra decisión');
   const recovery=tx.objectStore('recovery');await req(recovery.add({identity:j.target,id:'protected:lf5:'+operationId,kind:'protected',reason:'before-guest-transfer-full-seven-stores',transferBackupVersion:1,sourceHash:j.sourceHash,targetHash:j.targetHash,sealed:j.prepared.active,original:j.full}));
   for(const n of ['profiles','runs','history','receipts','outbox'])for(const r of j.full.target[n])await req(tx.objectStore(n).delete(n==='profiles'?j.target:[j.target,r.id]));
   const b=j.prepared.active.bundle;await req(tx.objectStore('profiles').add({identity:j.target,version:b.version,revision:b.revision,updatedAt:b.updatedAt,shared:b.data.shared,hash:j.prepared.active.hash}));
   for(const n of ['runs','history','receipts','outbox'])for(const value of n==='receipts'?b.receipts:b.data[n])await req(tx.objectStore(n).add({identity:j.target,id:value.id,value}));
   this.boundary('after-profile-write');
   await installMatchCopies(tx,j.prepared.matches,j.target);this.guard(j.target);
   if(this.backend.kind==='staging')await req(meta.add({key:'lf4-state:'+j.target,value:{version:1,enabled:false,remoteRevision:0,baseStamp:null,knownBlobs:[],lastCloudAt:null}}));
   await req(meta.put({key:key(operationId),value:{...j,state:'installed',receipt,cloud:{state:'pending',verification:this.backend.kind}}}));
   this.boundary('before-install-complete');
   this.guard(j.target);
  });
  this.boundary('after-install-complete');
  return this.confirmRead(await this.get(operationId));
 }
 async checkBackup(j){const backup=await this.repository.transaction(['recovery'],'readonly',tx=>req(tx.objectStore('recovery').get([j.target,'protected:lf5:'+j.operationId])));await verifyTransferBackup(backup);if(backup.sourceHash!==j.sourceHash||backup.targetHash!==j.targetHash||backup.sealed.hash!==j.receipt.installedHash)fail('TRANSFER_BACKUP','El respaldo no corresponde al journal');}
 async confirmRead(j){this.boundary('before-readback');const installed=await this.repository.verified(j.target);if(installed?.hash!==j.receipt.installedHash)fail('TRANSFER_READBACK','El destino cambió antes de verificar la instalación');await this.checkBackup(j);await this.repository.transaction(['metadata'],'readwrite',async tx=>{this.guard(j.target);const s=tx.objectStore('metadata'),current=(await req(s.get(key(j.operationId)))).value;if(current.requestHash!==j.requestHash)fail('CONFLICT','Journal distinto');await req(s.put({key:key(j.operationId),value:{...current,state:'local-confirmed'}}));});this.boundary('after-readback');return clone(j.receipt);}
 async acknowledgeFictionalCloud(operationId,input){if(this.backend.kind!=='fictional')fail('TRANSFER_BACKEND','Un recibo ficticio no confirma staging');return this.acknowledgeCloud(operationId,input);}
 async acknowledgeCloud(operationId,{job,receipt}){
  const j=await this.get(operationId);if(j?.state!=='local-confirmed')fail('TRANSFER_STATE','Confirmá primero la instalación local');this.guard(j.target);
  if(receipt.operationId!==job.operationId||receipt.hash!==job.hash||receipt.revision!==job.expectedRevision+1||job.profileHash!==j.receipt.installedHash)fail('TRANSFER_CLOUD_RECEIPT','El recibo no corresponde a la copia transferida');
  const {LocalSyncStore}=await import('./sync/local.js'),store=new LocalSyncStore(this.repository,j.target,j.target.split(':')[1]),state=await store.state();
  if(await store.pending()||state.remoteRevision!==receipt.revision||state.cloudHash!==receipt.hash||await store.stamp()!==state.baseStamp)fail('TRANSFER_CLOUD_PENDING','LF4 todavía no confirmó esta copia');
  const cloud={state:'confirmed',verification:this.backend.kind,operationId:receipt.operationId,revision:receipt.revision,hash:receipt.hash};
  await this.repository.transaction(['metadata'],'readwrite',async tx=>{this.guard(j.target);const s=tx.objectStore('metadata'),row=await req(s.get(key(operationId))),sync=await req(s.get('lf4-state:'+j.target)),pending=await req(s.get('lf4-job:'+j.target));if(row.value.state!=='local-confirmed'||row.value.requestHash!==j.requestHash||pending||sync?.value.remoteRevision!==receipt.revision||sync?.value.cloudHash!==receipt.hash)fail('CONFLICT','Cambió la confirmación del respaldo');await req(s.put({key:key(operationId),value:{...row.value,cloud}}));});return cloud;
 }
 async rememberFictionalCloudReceipt(operationId,input){if(this.backend.kind!=='fictional')fail('TRANSFER_BACKEND','Un recibo ficticio no confirma staging');return this.rememberCloudReceipt(operationId,input);}
 async rememberCloudReceipt(operationId,{job,receipt}){
  const j=await this.get(operationId);if(j?.state!=='local-confirmed')fail('TRANSFER_STATE','Confirmá primero la instalación local');this.guard(j.target);
  if(receipt.operationId!==job.operationId||receipt.hash!==job.hash||receipt.revision!==job.expectedRevision+1||job.profileHash!==j.receipt.installedHash)fail('TRANSFER_CLOUD_RECEIPT','El recibo no corresponde a la copia transferida');
  const candidate={job:{operationId:job.operationId,hash:job.hash,expectedRevision:job.expectedRevision,profileHash:job.profileHash},receipt:clone(receipt)};
  await this.repository.transaction(['metadata'],'readwrite',async tx=>{this.guard(j.target);const store=tx.objectStore('metadata'),row=await req(store.get(key(operationId)));if(row.value.state!=='local-confirmed'||row.value.requestHash!==j.requestHash)fail('CONFLICT','La transferencia cambió');await req(store.put({key:key(operationId),value:{...row.value,cloudCandidate:candidate}}));});return candidate;
 }
}
