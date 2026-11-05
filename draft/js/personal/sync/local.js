import {STORES} from '../repository.js';
import {canonical,verify,seal,digest,fail,storageBundle} from '../format.js';
import {matchRunContent,validateMatchCopies} from '../matches.js';
import {accountOwner,snapshotExport} from './protocol.js';
const request=q=>new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
const range=prefix=>globalThis.IDBKeyRange?.bound(prefix,prefix+'\uffff');
const key=(owner,kind)=>'lf4-'+kind+':'+owner;
const sorted=rows=>rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
async function matchRows(tx,owner){const prefix='lf3-match:'+owner+':';return (await request(tx.objectStore('metadata').getAll(range(prefix)))).filter(r=>r.key.startsWith(prefix));}
const marker=(hash,matches)=>({profile:hash,matches:matches.map(r=>[r.key,r.sequence]).sort((a,b)=>a[0].localeCompare(b[0]))});
export async function validateCloudMatches(snapshot){const owner=snapshot.active.bundle.identity;await validateMatchCopies(snapshot.matches,owner);const runs=new Map(snapshot.active.bundle.data.runs.map(r=>[r.id,r]));for(const row of snapshot.matches){const run=runs.get(row.runId);if(!run)fail('SYNC_MATCH','El partido no tiene una campaña compatible');const hash=await digest(matchRunContent(run)),s=run.snapshot||run.legacy?.snapshot,campaignId=s?.campaignId||s?.data?.survival?.id;for(const g of row.generations)if(g.runHash!==hash||g.sealed.checkpoint.campaignId!==campaignId)fail('SYNC_MATCH','El checkpoint pertenece a otra revisión de campaña');}return snapshot;}
export class LocalSyncStore{
 constructor(repository,owner,projectRef){accountOwner(owner,projectRef);Object.assign(this,{repository,owner,projectRef});}
 async state(){return this.repository.transaction(['metadata'],'readonly',async tx=>(await request(tx.objectStore('metadata').get(key(this.owner,'state'))))?.value||{version:1,enabled:false,remoteRevision:null,baseStamp:null,knownBlobs:[],lastCloudAt:null});}
 async updateState(update){return this.repository.transaction(['metadata'],'readwrite',async tx=>{const s=tx.objectStore('metadata'),row=await request(s.get(key(this.owner,'state'))),value=update(row?.value||{version:1,enabled:false,remoteRevision:null,baseStamp:null,knownBlobs:[],lastCloudAt:null});await request(s.put({key:key(this.owner,'state'),value}));return value;});}
 async pending(){return this.repository.transaction(['metadata'],'readonly',async tx=>(await request(tx.objectStore('metadata').get(key(this.owner,'job'))))?.value||null);}
 async stamp(){const value=await this.repository.transaction(['profiles','metadata'],'readonly',async tx=>{const head=await request(tx.objectStore('profiles').get(this.owner));if(!head)fail('NOT_FOUND','Perfil no encontrado');return marker(head.hash,await matchRows(tx,this.owner));});return digest(value);}
 async capture(){
  const raw=await this.repository.transaction(['profiles','runs','history','receipts','outbox','metadata'],'readonly',async tx=>{
   const head=await request(tx.objectStore('profiles').get(this.owner));if(!head)fail('NOT_FOUND','No hay perfil de cuenta en este dispositivo');
   const values=await Promise.all(['runs','history','receipts','outbox'].map(async n=>sorted((await request(tx.objectStore(n).index('owner').getAll(this.owner))).map(r=>r.value)))),[runs,history,receipts,outbox]=values,matches=await matchRows(tx,this.owner);
   return {active:{hash:head.hash,bundle:{format:'laqp-draft-personal',version:head.version,identity:this.owner,revision:head.revision,updatedAt:head.updatedAt,data:{shared:head.shared,runs,history,outbox},receipts}},matches};
  });
  await verify(raw.active);raw.marker=canonical(marker(raw.active.hash,raw.matches));raw.stamp=await digest(marker(raw.active.hash,raw.matches));raw.rawMatches=raw.matches;
  const runs=new Map(raw.active.bundle.data.runs.map(r=>[r.id,r]));raw.matches=(await Promise.all(raw.matches.map(async r=>{const run=runs.get(r.runId);if(!run)return null;const hash=await digest(matchRunContent(run));return {...r,generations:r.generations.filter(g=>g.runHash===hash)};}))).filter(r=>r&&r.generations.length);
  await validateMatchCopies(raw.matches,this.owner);return raw;
 }
 async putJob(job){canonical(job);return this.repository.transaction(['profiles','metadata'],'readwrite',async tx=>{const s=tx.objectStore('metadata'),old=await request(s.get(key(this.owner,'job')));if(old)return old.value;
   const state=(await request(s.get(key(this.owner,'state'))))?.value;if(!state?.enabled||state.remoteRevision!==job.expectedRevision)fail('SYNC_BASE_CHANGED','Otra pestaña ya actualizó el respaldo');
   const head=await request(tx.objectStore('profiles').get(this.owner)),matches=await matchRows(tx,this.owner);if(head.hash!==job.profileHash||canonical(marker(head.hash,matches))!==job.marker)fail('SYNC_LOCAL_CHANGED','El perfil cambió mientras preparábamos su respaldo');await request(s.add({key:key(this.owner,'job'),value:job}));return job;
  });}
 async acknowledge(job,receipt){return this.repository.transaction(['metadata'],'readwrite',async tx=>{const s=tx.objectStore('metadata'),stored=await request(s.get(key(this.owner,'job')));
   if(receipt.hash!==job.hash||receipt.operationId!==job.operationId||receipt.revision!==job.expectedRevision+1)fail('SYNC_RECEIPT','El servidor no confirmó la copia esperada');
   const old=(await request(s.get(key(this.owner,'state'))))?.value||{};
   if(stored?.value.operationId!==job.operationId){if(old.remoteRevision>=receipt.revision)return old;fail('SYNC_PENDING','Cambió la operación pendiente');}
   const value={...old,version:1,enabled:true,remoteRevision:receipt.revision,baseStamp:job.localStamp,localRevision:job.localRevision,knownBlobs:[...new Set(job.manifest.components.flatMap(c=>c.chunks))],lastCloudAt:receipt.updatedAt,cloudHash:receipt.hash,conflict:null};await request(s.put({key:key(this.owner,'state'),value}));await request(s.delete(key(this.owner,'job')));return value;
  });}
 async backupConflict(local,remote,head){
  const remoteExport=await this.repository.inspectExport(await snapshotExport(remote));
  return this.repository.transaction(['recovery','metadata'],'readwrite',async tx=>{const s=tx.objectStore('recovery'),id=crypto.randomUUID();await request(s.add({identity:this.owner,id:'protected:lf4-local:'+id,kind:'protected',reason:'sync-local-conflict',sealed:local.active,matchCopies:local.matches}));await request(s.add({identity:this.owner,id:'protected:lf4-remote:'+id,kind:'protected',reason:'sync-remote-conflict',sealed:remoteExport.active,matchCopies:remote.matches,remoteRevision:head.revision,manifestHash:head.hash}));return id;});
 }
 async discardJobForResolution(){return this.repository.transaction(['metadata'],'readwrite',async tx=>{const s=tx.objectStore('metadata'),old=await request(s.get(key(this.owner,'job')));if(old){await request(s.put({key:'lf4-protected-job:'+this.owner+':'+crypto.randomUUID(),value:old.value}));await request(s.delete(key(this.owner,'job')));}});}
 async install(remote,{expectedStamp,head,confirm=false,boundary=()=>{}}){
  if(!confirm)fail('CONFIRMATION','Confirmá qué versión conservar');
  await validateCloudMatches(remote);const payload=await this.repository.inspectExport(await snapshotExport(remote)),before=await this.capture();if(before.stamp!==expectedStamp)fail('SYNC_LOCAL_CHANGED','El progreso local cambió; revisá las versiones nuevamente');
  const next=storageBundle({...payload.active.bundle,revision:Math.max(before.active.bundle.revision,payload.active.bundle.revision)+1,updatedAt:Date.now()}),sealed=await seal(next),newStamp=await digest(marker(sealed.hash,payload.matches));
  const value={version:1,enabled:true,remoteRevision:head.revision,baseStamp:newStamp,localRevision:next.revision,knownBlobs:[...new Set(remote.manifest.components.flatMap(c=>c.chunks))],lastCloudAt:head.updatedAt,cloudHash:head.hash,branchToken:crypto.randomUUID(),conflict:null};
  boundary();return this.repository.transaction(STORES,'readwrite',async tx=>{
   boundary();
   const heads=tx.objectStore('profiles'),current=await request(heads.get(this.owner)),matches=await matchRows(tx,this.owner),pendingPrefix='lf2-pending:'+this.owner+':',pending=await request(tx.objectStore('metadata').getAll(range(pendingPrefix)));
   if(current.hash!==before.active.hash||pending.some(r=>r.key.startsWith(pendingPrefix)))fail('SYNC_LOCAL_CHANGED','Hay otro guardado local pendiente o más reciente');
   // The exact stamp is checked without asynchronous hashing in the transaction.
   if(canonical(marker(current.hash,matches))!==before.marker)fail('SYNC_LOCAL_CHANGED','Otro checkpoint cambió el partido');
   await request(tx.objectStore('recovery').add({identity:this.owner,id:'protected:lf4-before-download:'+crypto.randomUUID(),kind:'protected',reason:'before-personal-sync-restore',sealed:before.active,matchCopies:before.matches}));
   for(const n of ['runs','history','outbox','receipts']){const s=tx.objectStore(n);for(const r of await request(s.index('owner').getAll(this.owner)))await request(s.delete([this.owner,r.id]));for(const row of n==='receipts'?next.receipts:next.data[n])await request(s.add({identity:this.owner,id:row.id,value:row}));}
   const meta=tx.objectStore('metadata');for(const r of matches)await request(meta.delete(r.key));for(const row of payload.matches)await request(meta.put(row));
   boundary();await request(heads.put({identity:this.owner,version:next.version,revision:next.revision,updatedAt:next.updatedAt,shared:next.data.shared,hash:sealed.hash}));await request(tx.objectStore('recovery').add({identity:this.owner,id:'protected:lf4-received:'+crypto.randomUUID(),kind:'protected',reason:'original-personal-cloud-copy',sealed:payload.active,matchCopies:payload.matches}));await request(meta.put({key:key(this.owner,'state'),value}));await request(meta.delete(key(this.owner,'job')));boundary();return {bundle:sealed.bundle,state:value};
  });
 }
}
export const snapshotMarker=snapshot=>canonical(marker(snapshot.active.hash,snapshot.rawMatches||snapshot.matches));
