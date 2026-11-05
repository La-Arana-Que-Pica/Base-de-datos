import {identity,recordId,digest,canonical,fail} from './format.js';
import {verifyMatchCheckpoint,sealMatchCheckpoint} from '../persistence/matchCheckpoint.js';
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export const matchRunContent=run=>{const snapshot=run?.snapshot||run?.legacy?.snapshot;return snapshot?{id:run.id,snapshot}:run;};
export const matchKey=(owner,runId)=>'lf3-match:'+identity(owner)+':'+recordId(runId);
export class PersonalMatchStore{
 constructor(repository){this.repository=repository;this.anchors=new WeakSet();}
 async anchor(owner,runId,revision,run){const runText=canonical(matchRunContent(run)),bytes=new TextEncoder().encode(runText),runHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');const anchor=Object.freeze({owner,runId,revision,runText,runHash});this.anchors.add(anchor);return anchor;}
 async inspect(owner,runId){return this.repository.transaction(['metadata'],'readonly',tx=>req(tx.objectStore('metadata').get(matchKey(owner,runId))));}
 async load(owner,runId,run){
  const row=await this.inspect(owner,runId);if(!row)return {sequence:0,checkpoint:null};
  if(row.owner!==owner||row.runId!==runId||row.version!==1||!Number.isSafeInteger(row.sequence)||!Array.isArray(row.generations))fail('MATCH_STORAGE','Registro deportivo incompatible; se conserva');
  const runHash=await digest(matchRunContent(run));let damaged=false;
  for(const g of row.generations){
   if(g.runHash!==runHash)continue;
   try{await verifyMatchCheckpoint(g.sealed,{owner,runId});return {sequence:row.sequence,checkpoint:g.sealed.checkpoint,damaged,operationId:g.operationId};}catch{damaged=true;}
  }
  if(damaged)fail('MATCH_RECOVERY','Los checkpoints de este encuentro están dañados; se conservan para recuperación',{sequence:row.sequence});
  return {sequence:row.sequence,checkpoint:null};
 }
 async preserveAndUsePreview(owner,runId,{revision,sequence}){if(!Number.isSafeInteger(sequence))fail('MATCH_RECOVERY','Exportá la copia incompatible antes de resolverla');return this.repository.transaction(['profiles','metadata'],'readwrite',async tx=>{const head=await req(tx.objectStore('profiles').get(owner)),s=tx.objectStore('metadata'),key=matchKey(owner,runId),old=await req(s.get(key));if(head?.revision!==revision||old?.sequence!==sequence||old.owner!==owner)fail('CONFLICT','La copia cambió en otra pestaña');await req(s.add({key:'lf3-protected:'+owner+':'+crypto.randomUUID(),owner,runId,reason:'explicit-preview-fallback',original:old}));await req(s.put({...old,generations:[]}));});}
 async save(owner,{runId,run,revision,anchor=null,sequence,operationId,checkpoint,repair=false}){
  identity(owner);recordId(runId);recordId(operationId);if(checkpoint.owner!==owner||checkpoint.runId!==runId)fail('OWNER','Checkpoint de otro propietario');
  anchor??=await this.anchor(owner,runId,revision,run);if(!this.anchors.has(anchor)||anchor.owner!==owner||anchor.runId!==runId||anchor.revision!==revision)fail('MATCH_STORAGE','Ancla deportiva inválida');const {runHash,runText}=anchor,sealed=await sealMatchCheckpoint(checkpoint),key=matchKey(owner,runId),bytes=sealed.bytes;
  const validPrior=new Set();if(repair){const prior=await this.inspect(owner,runId);for(const g of prior?.generations||[]){try{await verifyMatchCheckpoint(g.sealed,{owner,runId});validPrior.add(g.sequence);}catch{/* The untouched original is retained in a protected record. */}}}
  // All hashing/capture finish before opening the atomic IDB transaction.
  return this.repository.transaction(['profiles','runs','metadata'],'readwrite',async tx=>{
   const head=await req(tx.objectStore('profiles').get(owner)),current=await req(tx.objectStore('runs').get([owner,runId])),s=tx.objectStore('metadata'),old=await req(s.get(key));
   const replay=old?.generations?.find(g=>g.operationId===operationId);if(replay){if(replay.sealed.hash!==sealed.hash||replay.runHash!==runHash)fail('IDEMPOTENCY','Reintento deportivo distinto');return {sequence:old.sequence,minute:checkpoint.minute,bytes};}
   if(head?.revision!==revision||!current||(JSON.stringify(matchRunContent(current.value))!==runText&&canonical(matchRunContent(current.value))!==runText)||(old?.sequence||0)!==sequence)fail('CONFLICT','Otra pestaña cambió la campaña o el partido; no se reemplazó el checkpoint');
   if(old?.owner&&old.owner!==owner)fail('OWNER','Registro deportivo de otro propietario');
   if(repair)await req(s.add({key:'lf3-protected:'+owner+':'+crypto.randomUUID(),owner,runId,reason:'before-match-recovery',original:old}));
   const generation={sequence:sequence+1,operationId,runHash,sealed};
   const value={key,owner,runId,version:1,sequence:sequence+1,generations:[generation,...(old?.generations||[]).filter(g=>!repair||validPrior.has(g.sequence)).slice(0,2)]};
   await req(s.put(value));return {sequence:value.sequence,minute:checkpoint.minute,bytes};
  });
 }
}

export async function readMatchCopies(repository,owner){
 const prefixes=['lf3-match:'+owner+':','lf3-protected:'+owner+':'];
 return repository.transaction(['metadata'],'readonly',async tx=>{const s=tx.objectStore('metadata');if(!globalThis.IDBKeyRange)return (await req(s.getAll())).filter(r=>prefixes.some(p=>r.key.startsWith(p)));const rows=await Promise.all(prefixes.map(p=>req(s.getAll(IDBKeyRange.bound(p,p+'\uffff')))));return rows.flat();});
}
export async function validateMatchCopies(rows,owner){
 identity(owner);if(!Array.isArray(rows)||rows.length>1000)fail('MATCH_FORMAT','Copias deportivas inválidas');const keys=new Set();
 for(const row of rows){if(!row||typeof row.key!=='string'||row.owner!==owner||keys.has(row.key))fail('OWNER','Copia deportiva de otro propietario');keys.add(row.key);recordId(row.runId);
  if(row.key.startsWith('lf3-protected:'+owner+':')){canonical(row);continue;}
  if(row.key!==matchKey(owner,row.runId)||row.version!==1||!Number.isSafeInteger(row.sequence)||row.sequence<1||!Array.isArray(row.generations)||row.generations.length>3)fail('MATCH_FORMAT','Generaciones deportivas inválidas');
  let previous=row.sequence+1;for(const g of row.generations){if(!Number.isSafeInteger(g.sequence)||g.sequence>=previous||g.sequence<1||!/^[a-f0-9]{64}$/.test(g.runHash))fail('MATCH_FORMAT','Revisión deportiva inválida');previous=g.sequence;recordId(g.operationId);await verifyMatchCheckpoint(g.sealed,{owner,runId:row.runId});}
 }
 return rows;
}
export async function installMatchCopies(tx,rows,owner){
 const s=tx.objectStore('metadata');for(const row of rows){const old=await req(s.get(row.key));if(old&&JSON.stringify(old)!==JSON.stringify(row))await req(s.add({key:'lf3-protected:'+owner+':'+crypto.randomUUID(),owner,runId:old.runId,reason:'before-personal-restore',original:old}));await req(s.put(row));}
}
