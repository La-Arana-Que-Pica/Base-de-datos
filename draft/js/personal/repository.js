import {FORMAT,VERSION,PersonalError,fail,identity,recordId,clone,canonical,parse,digest,blankData,copyValidatedData,seal,verify,storageBundle} from './format.js';
export const DATABASE='laqp-draft-personal';
export const STORES=Object.freeze(['profiles','runs','history','receipts','outbox','recovery','metadata']);
const owned=['runs','history','receipts','outbox','recovery'];
const ordered=rows=>rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
function dbError(error){if(error instanceof PersonalError)return error;return new PersonalError(error?.name||'STORAGE',error?.message||'No se pudo guardar en este navegador');}
// Both operands passed the strict canonical validator. Native serialization is
// a cheap equality fast path; reordered keys still use canonical comparison.
function sameRow(a,b){return JSON.stringify(a)===JSON.stringify(b)||canonical(a)===canonical(b);}
async function validateSnapshots(data){
  for(const row of [...data.runs,...data.history]){
    const snapshot=row.snapshot??row.legacy?.snapshot;if(snapshot===undefined)continue;
    if(snapshot?.mode==='SURVIVAL'){
      const {restoreSurvival}=await import('../survival/storage.js'),{StateStore}=await import('../state.js');restoreSurvival(new StateStore(),snapshot);
    }else{const {validateCampaignSnapshot}=await import('../persistence/campaignSnapshot.js');validateCampaignSnapshot(snapshot);}
  }
}
async function pruneCheckpoints(store,id){
  const keys=await request(store.index('ownerKind').getAllKeys([id,'checkpoint']));
  keys.sort((a,b)=>Number(b[1].slice(11))-Number(a[1].slice(11)));
  for(const key of keys.slice(3))await request(store.delete(key));
}
export class PersonalRepository {
  constructor({indexedDB=globalThis.indexedDB,name=DATABASE,onStatus=()=>{},clock=()=>Date.now(),testFault=null}={}){
    this.indexedDB=indexedDB;this.name=name;this.onStatus=onStatus;this.clock=clock;this.testFault=testFault;this.db=null;this.opening=null;
  }
  status(code){try{this.onStatus({code,database:this.name});}catch{/* Observers cannot change transaction outcomes. */}}
  async open(){
    if(this.db)return this.db;if(this.opening)return this.opening;
    this.opening=new Promise((resolve,reject)=>{
      if(!this.indexedDB){reject(new PersonalError('UNAVAILABLE','IndexedDB no está disponible'));return;}
      let r,settled=false;const rejectOnce=e=>{if(!settled){settled=true;reject(dbError(e));}};
      try{r=this.indexedDB.open(this.name,VERSION);}catch(e){rejectOnce(e);return;}
      r.onblocked=()=>{this.status('BLOCKED');rejectOnce(new PersonalError('BLOCKED','Otra pestaña bloquea la apertura; cerrala y reintentá'));};
      r.onerror=()=>rejectOnce(r.error);
      r.onupgradeneeded=()=>{
        if(settled){r.transaction.abort();return;}
        const db=r.result;
        db.createObjectStore('profiles',{keyPath:'identity'});
        for(const name of owned){const s=db.createObjectStore(name,{keyPath:['identity','id']});s.createIndex('owner','identity');if(name==='recovery')s.createIndex('ownerKind',['identity','kind']);}
        db.createObjectStore('metadata',{keyPath:'key'}).put({key:'schema',format:FORMAT,version:VERSION});
      };
      r.onsuccess=async()=>{
        if(settled){r.result.close();return;}const db=r.result;
        try{
          if(STORES.some(name=>!db.objectStoreNames.contains(name)))fail('VERSION','Esquema personal incompleto; conservá la base para recuperación');
          const tx=db.transaction('metadata','readonly'),schema=await request(tx.objectStore('metadata').get('schema'));
          if(schema?.format!==FORMAT||schema.version!==VERSION)fail('VERSION','Metadatos de versión incompatibles');
          settled=true;this.db=db;db.onversionchange=()=>{this.close();this.status('VERSION_CHANGE');};resolve(db);
        }catch(e){db.close();rejectOnce(e);}
      };
    });
    try{return await this.opening;}finally{this.opening=null;}
  }
  close(){this.db?.close();this.db=null;}
  async transaction(names,mode,work){
    const db=await this.open();let tx;
    try{
      if(mode==='readwrite'){
        try{tx=db.transaction(names,mode,{durability:'strict'});}
        catch(e){if(e.name!=='TypeError')throw e;tx=db.transaction(names,mode);this.status('DEFAULT_DURABILITY');}
      }else tx=db.transaction(names,mode);
    }catch(e){throw dbError(e);}
    const completed=new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(dbError(tx.error||new PersonalError('ABORTED','El guardado fue abortado')));tx.onerror=()=>{};});
    // Install rejection handling before executing any operation.
    completed.catch(()=>{});
    try{const result=await work(tx);if(mode==='readwrite')this.testFault?.(tx);await completed;return result;}
    catch(e){try{tx.abort();}catch{}await completed.catch(()=>{});this.status(e?.name==='QuotaExceededError'?'QUOTA':'ERROR');throw dbError(e);}
  }
  async guestIdentity(){
    const candidate=identity('guest:'+crypto.randomUUID());
    return this.transaction(['metadata'],'readwrite',async tx=>{
      const s=tx.objectStore('metadata'),row=await request(s.get('guest-identity'));
      if(row){identity(row.identity);if(!row.identity.startsWith('guest:'))fail('IDENTITY','La identidad de invitado está dañada');return row.identity;}await request(s.add({key:'guest-identity',identity:candidate}));return candidate;
    });
  }
  async listProfiles(){return this.transaction(['profiles'],'readonly',async tx=>(await request(tx.objectStore('profiles').getAll())).map(r=>({identity:r.identity,revision:r.revision,updatedAt:r.updatedAt})));}
  async raw(id){
    identity(id);
    return this.transaction(['profiles',...owned.filter(n=>n!=='recovery')],'readonly',async tx=>{
      const jobs=[request(tx.objectStore('profiles').get(id)),...['runs','history','receipts','outbox'].map(n=>request(tx.objectStore(n).index('owner').getAll(id)))];
      const [head,runs,history,receipts,outbox]=await Promise.all(jobs);if(!head){if(runs.length||history.length||receipts.length||outbox.length)fail('INTEGRITY','Hay datos sin cabecera; no se creará un perfil vacío');return null;}
      const unwrap=rows=>ordered(rows.map(({identity:owner,value,id:rowId})=>{if(owner!==id||value.id!==rowId)fail('INTEGRITY','Propietario o referencia incoherente');return value;}));
      return {hash:head.hash,bundle:{format:FORMAT,version:head.version,identity:id,revision:head.revision,updatedAt:head.updatedAt,data:{shared:head.shared,runs:unwrap(runs),history:unwrap(history),outbox:unwrap(outbox)},receipts:unwrap(receipts)}};
    });
  }
  async verified(id){const row=await this.raw(id);if(!row)return null;await verify(row);return row;}
  // raw() returns fresh structured-cloned IDB records, never a shared cache.
  async read(id){return (await this.verified(id))?.bundle??null;}
  async createProfile(id,{operationId='create-profile',data=blankData()}={}){
    identity(id);if(await this.read(id))return this.read(id);
    try{return await this.commit(id,{expectedRevision:0,operationId,kind:'create',data});}
    catch(e){if(e.code==='CONFLICT')return this.read(id);throw e;}
  }
  async commit(id,{expectedRevision,operationId,kind='checkpoint',data,protectedBackup=null,provenance=null,matchCopies=null}={}){
    identity(id);recordId(operationId);recordId(kind);const nextData=copyValidatedData(data);await validateSnapshots(nextData);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)fail('REVISION','Revisión esperada inválida');
    if(protectedBackup!==null)recordId(protectedBackup);
    for(const n of ['runs','history','outbox'])ordered(nextData[n]);
    // All hashing, domain preparation and validation finish BEFORE opening readwrite.
    let matchInstaller=null;if(matchCopies!==null){const helpers=await import('./matches.js');await helpers.validateMatchCopies(matchCopies,id);matchInstaller=helpers.installMatchCopies;}
    const requestHash=await digest({identity:id,expectedRevision,operationId,kind,data:nextData,protectedBackup,provenance,...(matchCopies!==null?{matchCopies}:{})});
    const previous=await this.verified(id),before=previous?.bundle,prior=before?.receipts.find(r=>r.id===operationId);
    if(prior){if(prior.requestHash!==requestHash)fail('IDEMPOTENCY','El identificador ya fue usado con otro contenido');return before;}
    if((before?.revision||0)!==expectedRevision)fail('CONFLICT','Existe una revisión más reciente');
    const next={format:FORMAT,version:VERSION,identity:id,revision:expectedRevision+1,updatedAt:this.clock(),data:nextData,receipts:ordered([...(before?.receipts||[]),{id:operationId,requestHash,revision:expectedRevision+1,kind}])};
    if(provenance!==null)canonical(provenance);
    const sealed=await seal(next);
    const changes={};
    for(const n of ['runs','history','outbox']){
      const old=new Map((before?.data[n]||[]).map(r=>[r.id,r])),incoming=new Map(nextData[n].map(r=>[r.id,r]));
      changes[n]={remove:[...old.keys()].filter(key=>!incoming.has(key)),put:nextData[n].filter(r=>!old.has(r.id)||!sameRow(old.get(r.id),r))};
      if(n==='history'){
        const changed=changes[n].remove[0]??changes[n].put.find(r=>old.has(r.id))?.id;
        if(changed!==undefined)fail('IMMUTABLE','No se puede eliminar ni cambiar historial: '+changed);
      }
    }
    try{return await this.transaction(STORES,'readwrite',async tx=>{
      const heads=tx.objectStore('profiles'),head=await request(heads.get(id));
      const replay=await request(tx.objectStore('receipts').get([id,operationId]));
      if(replay){if(replay.value.requestHash!==requestHash)fail('IDEMPOTENCY','Reintento incompatible');fail('CONFLICT','La operación se confirmó en otra pestaña; releé el perfil');}
      if((head?.revision||0)!==expectedRevision||(previous&&head.hash!==previous.hash))fail('CONFLICT','Conflicto de escritura; no se reemplazó el progreso');
      for(const name of ['runs','history','outbox']){
        const s=tx.objectStore(name);
        for(const rowId of changes[name].remove)await request(s.delete([id,rowId]));
        for(const value of changes[name].put)await request(s.put({identity:id,id:value.id,value}));
      }
      await request(tx.objectStore('receipts').add({identity:id,id:operationId,value:next.receipts.find(r=>r.id===operationId)}));
      const recovery=tx.objectStore('recovery');
      if(protectedBackup&&previous)await request(recovery.add({identity:id,id:'protected:'+crypto.randomUUID(),kind:'protected',reason:protectedBackup,sealed:previous,provenance}));
      if(kind==='legacy-import')await request(recovery.add({identity:id,id:'protected:import:'+requestHash,kind:'protected',reason:'original-legacy-import',sealed,provenance}));
      await request(heads.put({identity:id,version:VERSION,revision:next.revision,updatedAt:next.updatedAt,shared:nextData.shared,hash:sealed.hash}));
      await request(recovery.add({identity:id,id:'checkpoint:'+next.revision,kind:'checkpoint',sealed}));
      await pruneCheckpoints(recovery,id);
      if(matchInstaller)await matchInstaller(tx,matchCopies,id);
      return sealed.bundle;
    });}catch(e){
      if(e.code==='CONFLICT'){
        const latest=await this.read(id),receipt=latest?.receipts.find(r=>r.id===operationId);
        if(receipt?.requestHash===requestHash)return latest;
      }
      throw e;
    }
  }
  async recoveryCopies(id){identity(id);return this.transaction(['recovery'],'readonly',tx=>request(tx.objectStore('recovery').index('owner').getAll(id)));}
  async inspectRecovery(id){const rows=await this.recoveryCopies(id),result=[];for(const row of rows){try{await verify(row.sealed);result.push({id:row.id,kind:row.kind,revision:row.sealed.bundle.revision,valid:true});}catch(e){result.push({id:row.id,kind:row.kind,valid:false,error:e.code});}}return result;}
  async restoreRecovery(id,copyId,{expectedRevision,operationId,confirm=false}={}){
    if(!confirm)fail('CONFIRMATION','Confirmá la restauración y su copia de seguridad');
    const row=(await this.recoveryCopies(id)).find(r=>r.id===copyId);if(!row)fail('NOT_FOUND','Copia no disponible');const source=await verify(row.sealed);
    if(source.identity!==id)fail('OWNER','Copia de otra identidad');
    const raw=await this.raw(id);if(!raw)fail('NOT_FOUND','Perfil no encontrado');
    recordId(operationId);
    const requestHash=await digest({kind:'recovery',copyId,expectedRevision,hash:row.sealed.hash});
    const replay=raw.bundle.receipts.find(r=>r.id===operationId);
    if(replay){if(replay.requestHash!==requestHash)fail('IDEMPOTENCY','Recuperación repetida con otro contenido');await verify(raw);return clone(raw.bundle);}
    if(raw.bundle.revision!==expectedRevision)fail('CONFLICT','El perfil cambió');
    // Never roll back consumed awards silently. A branch with different receipts requires resolution.
    if(canonical(raw.bundle.receipts)!==canonical(source.receipts))fail('RECOVERY_CONFLICT','La copia tiene otros recibos; se conserva para resolución sin repetir premios');
    if(source.receipts.some(r=>r.id===operationId))fail('IDEMPOTENCY','Identificador de recuperación ya utilizado');
    const next={...clone(source),revision:expectedRevision+1,updatedAt:this.clock(),receipts:ordered([...source.receipts,{id:operationId,kind:'recovery',revision:expectedRevision+1,requestHash}])};
    const repaired=await seal(next);
    const damaged=clone(raw);
    return this.transaction(STORES,'readwrite',async tx=>{
      const s=tx.objectStore('profiles'),head=await request(s.get(id));if(head.revision!==expectedRevision||head.hash!==raw.hash)fail('CONFLICT','El perfil cambió');
      await request(tx.objectStore('recovery').add({identity:id,id:'protected:'+crypto.randomUUID(),kind:'protected',reason:'before-recovery',sealed:damaged}));
      for(const n of ['runs','history','outbox']){const store=tx.objectStore(n);for(const r of await request(store.index('owner').getAll(id)))await request(store.delete([id,r.id]));for(const value of source.data[n])await request(store.put({identity:id,id:value.id,value}));}
      await request(tx.objectStore('receipts').add({identity:id,id:operationId,value:next.receipts.find(r=>r.id===operationId)}));
      await request(s.put({identity:id,version:VERSION,revision:next.revision,updatedAt:next.updatedAt,shared:next.data.shared,hash:repaired.hash}));
      const recovery=tx.objectStore('recovery');await request(recovery.add({identity:id,id:'checkpoint:'+next.revision,kind:'checkpoint',sealed:repaired}));
      await pruneCheckpoints(recovery,id);
      return clone(next);
    });
  }
  async exportProfile(id){
    const active=await this.raw(id);if(!active)fail('NOT_FOUND','Perfil no encontrado');await verify(active);
    const copies=await this.recoveryCopies(id),{readMatchCopies}=await import('./matches.js'),matches=await readMatchCopies(this,id);const end=await this.raw(id);if(active.hash!==end?.hash)fail('CONFLICT','El perfil cambió durante la exportación');
    const payload={format:FORMAT+'-export',version:2,identity:id,active,recovery:copies,matches};canonical(payload);
    return canonical({payload,hash:await digest(payload)});
  }
  async inspectExport(text){
    const file=parse(text);
    if(!file?.payload||file.payload.format!==FORMAT+'-export'||![1,2].includes(file.payload.version))fail('VERSION','Formato de copia no compatible');
    if(await digest(file.payload)!==file.hash)fail('INTEGRITY','Archivo dañado');
    await verify(file.payload.active);await validateSnapshots(file.payload.active.bundle.data);
    if(file.payload.version===2){const {validateMatchCopies}=await import('./matches.js');await validateMatchCopies(file.payload.matches,file.payload.identity);}else if(Object.hasOwn(file.payload,'matches'))fail('VERSION','Los checkpoints deportivos requieren exportación v2');
    if(file.payload.identity!==file.payload.active.bundle.identity||!Array.isArray(file.payload.recovery))fail('OWNER','Identidad de copia inconsistente');
    const ids=new Set();
    for(const row of file.payload.recovery){
      recordId(row.id);
      if(row.identity!==file.payload.identity||row.sealed?.bundle?.identity!==file.payload.identity)fail('OWNER','Copia de otra identidad');
      if(ids.has(row.id)||!['checkpoint','protected'].includes(row.kind)||typeof row.sealed?.hash!=='string')fail('STRUCTURE','Generación inválida');
      ids.add(row.id);
      if(row.kind==='checkpoint')await verify(row.sealed);else canonical(row);
    }
    return clone(file.payload);
  }
  async restoreExport(text,{targetIdentity,expectedRevision=0,operationId,confirm=false}={}){
    const payload=await this.inspectExport(text),id=identity(targetIdentity),{installMatchCopies}=await import('./matches.js'),sourceExportHash=await digest(payload);
    if(payload.identity!==id)fail('OWNER','LF1 no transfiere copias entre identidades');
    if(!confirm)fail('CONFIRMATION','Confirmá antes de restaurar');
    recordId(operationId);
    const restored=await this.transaction(['metadata'],'readonly',tx=>request(tx.objectStore('metadata').get('restore:'+id+':'+operationId)));
    if(restored&&(restored.sourceHash!==payload.active.hash||restored.exportHash&&restored.exportHash!==sourceExportHash))fail('IDEMPOTENCY','La operación de restauración ya corresponde a otra copia');
    const existing=await this.read(id);
    if(restored&&existing)return existing;
    if(existing?.receipts.some(r=>r.id===operationId&&r.kind==='restore-export'))return this.commit(id,{expectedRevision,operationId,kind:'restore-export',data:payload.active.bundle.data,protectedBackup:'before-export-restore',provenance:{sourceHash:payload.active.hash},matchCopies:payload.matches?.length?payload.matches:null});
    if(existing&&canonical(existing.receipts)!==canonical(storageBundle(payload.active.bundle).receipts))fail('RECOVERY_CONFLICT','Los recibos difieren: conservá ambas ramas sin fusionar');
    if((existing?.revision||0)!==expectedRevision)fail('CONFLICT','Revisión de destino distinta');
    // New device installs the full graph (including original receipts/revisions), not a new award.
    if(!existing){
      const sealed=await seal(storageBundle(payload.active.bundle));recordId(operationId);
      return this.transaction(STORES,'readwrite',async tx=>{
        if(await request(tx.objectStore('profiles').get(id)))fail('CONFLICT','Ya existe un perfil');
        const b=sealed.bundle;await request(tx.objectStore('profiles').add({identity:id,version:VERSION,revision:b.revision,updatedAt:b.updatedAt,shared:b.data.shared,hash:sealed.hash}));
        for(const n of ['runs','history','outbox','receipts'])for(const value of n==='receipts'?b.receipts:b.data[n])await request(tx.objectStore(n).add({identity:id,id:value.id,value}));
        for(const r of payload.recovery)await request(tx.objectStore('recovery').add(r));
        await installMatchCopies(tx,payload.matches||[],id);
        await request(tx.objectStore('recovery').add({identity:id,id:'protected:restore:'+crypto.randomUUID(),kind:'protected',reason:'original-export-restore',sealed:payload.active}));
        await pruneCheckpoints(tx.objectStore('recovery'),id);
        await request(tx.objectStore('metadata').put({key:'restore:'+id+':'+operationId,sourceHash:payload.active.hash,exportHash:sourceExportHash}));return clone(b);
      });
    }
    if(await digest(existing)===payload.active.hash&&!(payload.matches?.length))return existing;
    return this.commit(id,{expectedRevision,operationId,kind:'restore-export',data:payload.active.bundle.data,protectedBackup:'before-export-restore',provenance:{sourceHash:payload.active.hash},matchCopies:payload.matches?.length?payload.matches:null});
  }
  async storageStatus(){if(!globalThis.navigator?.storage?.estimate)return {available:false};const estimate=await navigator.storage.estimate();return {available:true,usage:estimate.usage??null,quota:estimate.quota??null,persistent:navigator.storage.persisted?await navigator.storage.persisted():null};}
}
