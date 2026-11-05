// Typed, fail-closed preparation. No persistence, Auth or sporting execution.
import {identity,verify,clone,seal,canonical,digest,fail} from './format.js';
import {validateMatchCopies,matchKey,matchRunContent} from './matches.js';
import {verifyMatchCheckpoint,sealMatchCheckpoint} from '../persistence/matchCheckpoint.js';
import {verifyTransferParity} from './transferParity.js';
function keys(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('TRANSFER_SCHEMA','Campo no reconocido en el grafo deportivo');}
export async function remapGuestSnapshot(input,target){
 keys(input,['active','matches']);keys(input.active,['hash','bundle']);
 await verify(input.active);const from=identity(input.active.bundle.identity);identity(target);
 if(!from.startsWith('guest:')||!target.startsWith('account:'))fail('TRANSFER_OWNER','Sólo se admite invitado hacia cuenta');
 const source=clone(input);await validateMatchCopies(source.matches||[],from);
 const progress=source.active.bundle.data.shared.progress,expansion=progress?.expansion;
 if(progress?.version!==undefined&&progress.version!==1||expansion?.version!==undefined&&expansion.version!==1)fail('TRANSFER_SCHEMA','Versión de progreso o economía no soportada');
 if(expansion&&(!Number.isSafeInteger(expansion.balance)||expansion.balance<0))fail('TRANSFER_SCHEMA','El saldo no es compatible con el modelo económico');
 const result=clone(source),bundle=result.active.bundle;
 const subject=value=>value===from?target:value==='dream:'+from?'dream:'+target:value;
 const fields=(object,names)=>{if(object)for(const name of names)if(Object.hasOwn(object,name)){const value=object[name];if(value!=null&&!['albumSubject','albumSource'].includes(name)&&value!==from&&value!=='dream:'+from)fail('TRANSFER_OWNER','Una referencia activa pertenece a otro propietario');object[name]=subject(value);}};
 const snapshot=s=>{if(!s)return;fields(s.data,['albumSubject','expansionSubject']);fields(s.data?.survival,['economySubject']);};
 const archived=[...(bundle.data.shared.legacy.replaced||[]),...(bundle.data.shared.legacy.abandoned||[])];
 for(const row of [...bundle.data.runs,...bundle.data.history,...archived]){
  fields(row,['subject','economySubject','albumSubject']);fields(row.legacy,['subject','economySubject','albumSubject']);snapshot(row.snapshot);snapshot(row.legacy?.snapshot);
 }
 for(const profile of Object.values(bundle.data.shared.survivalProfiles)){fields(profile,['subject']);fields(profile.lastParticipation,['subject','economySubject','albumSubject']);}
 fields(bundle.data.shared.settings,['albumSource']);
 for(const value of Object.values(bundle.data.shared.legacy.survivalResults||{}))fields(value,['subject','economySubject','albumSubject']);
 for(const namespaces of [bundle.data.shared.albumNamespaces,bundle.data.shared.progress?.expansion?.albums].filter(Boolean))for(const old of [from,'dream:'+from])if(Object.hasOwn(namespaces,old)){const next=subject(old);if(Object.hasOwn(namespaces,next))fail('TRANSFER_CONFLICT','Namespace de Álbum en conflicto');namespaces[next]=namespaces[old];delete namespaces[old];}
 bundle.identity=target;
 const runs=new Map(bundle.data.runs.map(r=>[r.id,r]));
 for(const row of result.matches||[]){
  if(row.key.startsWith('lf3-protected:'+from+':')){
   const reasons=['before-match-recovery','explicit-preview-fallback','before-personal-restore','checkpoint-conflict'];
   if(!reasons.includes(row.reason))fail('TRANSFER_SCHEMA','Recuperación protegida sin handler conocido');
   keys(row,row.reason==='checkpoint-conflict'?['key','owner','runId','reason','pendingCheckpoint','operationId','baseRevision','baseRunHash']:['key','owner','runId','reason','original']);
   const original=row.reason==='checkpoint-conflict'?row.pendingCheckpoint:row.original;
   if(!original||typeof original!=='object'||original.owner!==from||original.runId!==row.runId)fail('TRANSFER_SCHEMA','La procedencia de la recuperación protegida es incompatible');
   // This is a provenance archive, including possibly damaged original bytes.
   // It is never a candidate generation for PersonalMatchStore.load().
   row.key='lf3-protected:'+target+':'+row.key.slice(('lf3-protected:'+from+':').length);row.owner=target;row.sourceOwner=from;row.transferDisposition='preserved-only';continue;
  }
  if(row.key!==matchKey(from,row.runId))fail('TRANSFER_SCHEMA','Una copia deportiva protegida requiere revisión específica');
  keys(row,['key','owner','runId','version','sequence','generations']);
  const priorRun=source.active.bundle.data.runs.find(r=>r.id===row.runId),run=runs.get(row.runId);
  if(!run)fail('TRANSFER_ORPHAN','Checkpoint sin campaña');
  const beforeHash=await digest(matchRunContent(priorRun)),afterHash=await digest(matchRunContent(run));
  row.key=matchKey(target,row.runId);row.owner=target;
  for(const generation of row.generations){
   keys(generation,['sequence','operationId','runHash','sealed']);
   keys(generation.sealed,['checkpoint','hash','bytes']);
   if(generation.runHash!==beforeHash)fail('TRANSFER_ORPHAN','Generación de otra revisión de campaña');
   await verifyMatchCheckpoint(generation.sealed,{owner:from,runId:row.runId});
   const checkpoint=clone(generation.sealed.checkpoint);checkpoint.owner=target;
   generation.sealed=await sealMatchCheckpoint(checkpoint);generation.runHash=afterHash;
  }
 }
 // An owner reference outside the allowlist needs a typed handler, not a string replacement.
 const inspect=value=>{if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){if(/owner|identity|subject/i.test(k)&&(v===from||v==='dream:'+from))fail('TRANSFER_SCHEMA','Hay referencias de propietario sin remapeador aprobado');inspect(v);}};
 inspect(bundle.data);
 result.active=await seal(bundle);await validateMatchCopies(result.matches||[],target);
 if(canonical(input)!==canonical(source))fail('TRANSFER_MUTATION','El origen cambió durante la preparación');
 await verifyTransferParity(source,result);
 return result;
}
