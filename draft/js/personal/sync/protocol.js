import {canonical,identity,fail,verify,digest} from '../format.js';
import {downloadBatches,LEGACY_TRANSPORT} from './batching.js';
import {bytes,SYNC_LIMITS} from './limits.js';
export {bytes,SYNC_LIMITS} from './limits.js';
export const SYNC_FORMAT='laqp-draft-personal-sync',SYNC_VERSION=1;
export const STAGING_REF='niyqnkoqngyoogpwkegl',PROTECTED_REF='npyvbqzgcdoujfxefsdr';
export async function textHash(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function accountOwner(owner,projectRef){identity(owner);if(!/^[a-z0-9]{20}$/.test(projectRef)||!owner.startsWith('account:'+projectRef+':'))fail('SYNC_OWNER','Sólo se sincroniza el perfil local de la cuenta seleccionada');return owner.split(':')[2];}
const hashPattern=/^[a-f0-9]{64}$/;
export function checkManifest(m,owner){
 if(!m||m.format!==SYNC_FORMAT||m.version!==SYNC_VERSION||m.identity!==owner||m.verification!=='personal-unverified'||!Number.isSafeInteger(m.localRevision)||m.localRevision<1||!Array.isArray(m.components)||!m.components.length||m.components.length>SYNC_LIMITS.components)fail('SYNC_VERSION','Formato de respaldo personal incompatible');
 canonical(m,{bytes:SYNC_LIMITS.manifestBytes,depth:16,nodes:250000,records:100000});const seen=new Set();let total=0;
 for(const c of m.components){const key=c.kind+':'+c.key;if(!['header','shared','run','history','receipt','outbox','match'].includes(c.kind)||typeof c.key!=='string'||!c.key.length||c.key.length>600||seen.has(key)||!Array.isArray(c.chunks)||!c.chunks.length||c.chunks.length>256||c.chunks.some(h=>!hashPattern.test(h))||!hashPattern.test(c.hash)||!Number.isSafeInteger(c.bytes)||c.bytes<1)fail('SYNC_FORMAT','Componente personal inválido');seen.add(key);total+=c.bytes;}
 if(total>SYNC_LIMITS.profileBytes)fail('SYNC_SIZE','El respaldo supera el límite personal de 32 MiB');return m;
}
export function profileSummary(bundle){const p=bundle.data.shared.progress;return {coins:p?.expansion?.balance??0,cards:Object.keys(p?.collection||{}).length,campaigns:bundle.data.runs.length,history:bundle.data.history.length,revision:bundle.revision};}
// Validate the complete durable upload before emitting its first PUT. A damaged
// late chunk must not turn a partial upload into a stream of retry attempts.
export async function validateUploadJob(job,{knownBlobs=[],boundary=async()=>{}}={}){
 const required=new Set(job.manifest.components.flatMap(c=>c.chunks)),known=new Set(knownBlobs),seen=new Set();let total=0;
 if(!Array.isArray(job.blobs)||job.blobs.length>required.size)fail('SYNC_INTEGRITY','Los fragmentos pendientes no corresponden al manifiesto');
 for(const b of job.blobs){await boundary();if(!b||typeof b.text!=='string'||!required.has(b.hash)||seen.has(b.hash))fail('SYNC_INTEGRITY','Fragmento pendiente incompatible');const size=bytes(b.text);total+=size;if(size>SYNC_LIMITS.chunkBytes||total>SYNC_LIMITS.profileBytes)fail('SYNC_SIZE','Los fragmentos pendientes superan el límite');if(await textHash(b.text)!==b.hash)fail('SYNC_INTEGRITY','Un fragmento pendiente está dañado');seen.add(b.hash);}
 if([...required].some(h=>!seen.has(h)&&!known.has(h)))fail('SYNC_INTEGRITY','Faltan fragmentos del respaldo pendiente');await boundary();
}
// A component is independently addressed. Unchanged history/receipts reuse their
// fragments; no ordinary LF1 recovery generations or unconfirmed sync jobs travel.
export async function packSnapshot(snapshot,{previous=null,immutableRows=false,knownBlobs=[],boundary=async()=>{}}={}){
 const start=performance.now(),b=snapshot.active.bundle,rows=[['header','profile',{format:b.format,version:b.version,identity:b.identity,revision:b.revision,updatedAt:b.updatedAt,hash:snapshot.active.hash}]];
 for(const [key,value]of Object.entries(b.data.shared))rows.push(['shared',key,value]);
 for(const [kind,values]of [['run',b.data.runs],['history',b.data.history],['receipt',b.receipts],['outbox',b.data.outbox],['match',snapshot.matches]])for(const value of values)rows.push([kind,value.id||value.key,value]);
 const cache=previous?.cache||new Map(),nextCache=new Map(),components=[],blobs=new Map(),known=new Set(knownBlobs);let total=0,cacheBytes=0;
 for(const [kind,key,value]of rows){await boundary();const id=kind+':'+key,old=cache.get(id),text=immutableRows&&['history','receipt'].includes(kind)&&old?old.text:canonical(value);let c;
  if(old?.text===text){c=old.component;let partIndex=0;for(let i=0;i<text.length;){let end=Math.min(text.length,i+64*1024);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;const hash=c.chunks[partIndex++];if(!known.has(hash))blobs.set(hash,text.slice(i,end));i=end;}}
  else {const chunks=[];for(let i=0;i<text.length;){let end=Math.min(text.length,i+64*1024);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;const part=text.slice(i,end),hash=await textHash(part);chunks.push(hash);if(!known.has(hash))blobs.set(hash,part);i=end;}c={kind,key,hash:await textHash(text),bytes:bytes(text),chunks};}
  total+=c.bytes;components.push(c);if(cacheBytes+text.length*2<=8*1024*1024){nextCache.set(id,{text,component:c});cacheBytes+=text.length*2;}
 }
 const manifest=checkManifest({format:SYNC_FORMAT,version:SYNC_VERSION,identity:b.identity,localRevision:b.revision,verification:'personal-unverified',summary:profileSummary(b),components},b.identity),text=canonical(manifest),hash=await textHash(text);
 return {manifest,text,hash,blobs,cache:nextCache,metrics:{prepareMs:performance.now()-start,profileBytes:total,manifestBytes:bytes(text),components:rows.length}};
}
export async function unpackSnapshot(manifestText,hash,owner,getChunks,{transport=LEGACY_TRANSPORT,boundary=async()=>{}}={}){
 if(typeof manifestText!=='string'||bytes(manifestText)>SYNC_LIMITS.manifestBytes||await textHash(manifestText)!==hash)fail('SYNC_INTEGRITY','El respaldo de la cuenta está dañado');let manifest;try{manifest=checkManifest(JSON.parse(manifestText),owner);}catch(e){if(e.code)throw e;fail('SYNC_FORMAT','Respaldo ilegible');}
 const data={shared:{},runs:[],history:[],outbox:[]},receipts=[],matches=[];let header=null;const texts=new Map();
 for(const batch of downloadBatches(manifest,transport)){await boundary();const rows=await getChunks(batch);await boundary();if(!Array.isArray(rows)||rows.length!==batch.length||bytes(JSON.stringify(rows))>transport.getBytes)fail('SYNC_INTEGRITY','Faltan fragmentos del respaldo o la respuesta supera el límite');for(const row of rows){if(!row||!batch.includes(row.hash)||typeof row.text!=='string'||bytes(row.text)>SYNC_LIMITS.chunkBytes||await textHash(row.text)!==row.hash||texts.has(row.hash))fail('SYNC_INTEGRITY','Fragmento de otra copia o dañado');texts.set(row.hash,row.text);}}
 for(const c of manifest.components){await boundary();const text=c.chunks.map(h=>texts.get(h)).join('');if(bytes(text)!==c.bytes||await textHash(text)!==c.hash)fail('SYNC_INTEGRITY','Componente incompleto');let value;try{value=JSON.parse(text);}catch{fail('SYNC_FORMAT','JSON de respaldo inválido');}canonical(value);
  if(c.kind==='header'){if(header||c.key!=='profile')fail('SYNC_FORMAT','Cabecera duplicada');header=value;}
  else if(c.kind==='shared'){if(['__proto__','constructor','prototype'].includes(c.key))fail('SYNC_FORMAT','Clave insegura');data.shared[c.key]=value;}
  else {const target={run:data.runs,history:data.history,receipt:receipts,outbox:data.outbox,match:matches}[c.kind];if((c.kind==='match'?value.key:value.id)!==c.key)fail('SYNC_FORMAT','Referencia inconsistente');target.push(value);}
 }
 if(!header||header.identity!==owner||header.revision!==manifest.localRevision)fail('SYNC_OWNER','La copia pertenece a otra cuenta');
 const active={hash:header.hash,bundle:{format:header.format,version:header.version,identity:owner,revision:header.revision,updatedAt:header.updatedAt,data,receipts}};await verify(active);
 return {active,matches,manifest};
}
export async function snapshotExport(snapshot){const payload={format:'laqp-draft-personal-export',version:2,identity:snapshot.active.bundle.identity,active:snapshot.active,recovery:[],matches:snapshot.matches};return canonical({payload,hash:await digest(payload)});}
