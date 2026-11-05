import {VERSION,fail,identity,recordId,clone,canonical,parse,digest,blankData} from './format.js';
const DATABASES=[{name:'laqp-career-local-v1',type:'career',versions:[1],stores:['profiles','active','history','backups']},{name:'laqp-survival-local-v1',type:'survival',versions:[1,2],stores:['active','profile','history','results']}];
const PREFIXES=['laqp-career-outbox-v1:','laqp-career-conflict-backup-v1:','laqp-survival-pending-v1','laqp-survival-dream-pending-v1:','laqp-expansion-intent-v1:','laqp-album-local-v1:','laqp-dream-team-local-v1:','laqp-draft-navigation-copy-v1:','laqp-draft-outbox-v1:','laqp-draft-official-outbox-v1:'];
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const isLab=owner=>/(^|:)(sandbox(-test)?|lab|laboratory|rewards-lab)(:|-|$)/i.test(owner||'');
// IndexedDB permits undefined, Dates and references that JSON alone would lose.
// Keep an inert tagged graph in the protected archive, alongside the usable JSON view.
function archiveLegacy(value){
  const nodes=[],seen=new Map();let count=0;
  function visit(v,depth=0){
    if(++count>1000000||depth>96)fail('DEPTH','Fuente demasiado grande o profunda');
    if(v===undefined)return {type:'undefined'};
    if(v===null||typeof v!=='object'){canonical(v);return {type:'value',value:v};}
    if(seen.has(v))return {type:'ref',index:seen.get(v)};
    const index=nodes.length;seen.set(v,index);nodes.push(null);
    if(v instanceof Date)nodes[index]={type:'date',value:v.toISOString()};
    else if(Array.isArray(v))nodes[index]={type:'array',value:Array.from({length:v.length},(_,i)=>visit(v[i],depth+1))};
    else{
      if(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)fail('STRUCTURE','Objeto legado no soportado');
      const pairs=[];for(const key of Object.keys(v)){
        if(/^(access_?token|refresh_?token|authorization|service_?role(_?key)?|anon_?key|supabase_?key|api_?key|password|session|sessions|jwt)$/i.test(key))fail('SECRET','Credencial en fuente legada');
        const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!('value'in d))fail('STRUCTURE','Accesor en fuente legada');pairs.push([key,visit(d.value,depth+1)]);
      }nodes[index]={type:'object',value:pairs};
    }
    return {type:'ref',index};
  }
  const root=visit(value);return {encoding:'lf1-structured-clone-v1',root,nodes};
}
function localOwner(key,payload){
  if(typeof payload?.subject==='string')return payload.subject;if(typeof payload?.owner==='string')return payload.owner;
  if(typeof key!=='string')return null;
  if(key.startsWith('laqp-dream-team-local-v1:'))return key.slice('laqp-dream-team-local-v1:'.length);
  if(key.startsWith('laqp-album-local-v1:'))return key.slice('laqp-album-local-v1:'.length).split(':player:')[0].split(':unreadable:')[0];
  return null;
}
async function validateSource(row){
  canonical(row.payload);
  const p=row.payload;
  if(!p||typeof p!=='object'||Array.isArray(p))fail('LEGACY_STRUCTURE','Fuente sin estructura');
  if(row.type==='career'&&row.store==='profiles'){
    if(!p.progress||p.progress.version!==1||!p.progress.regions?.EUROPA||!p.progress.regions?.AMERICA||!p.progress.collection||!p.progress.grants)fail('LEGACY_VERSION','Perfil Carrera incompatible');
    const ex=p.progress.expansion;if(ex&&(!Number.isSafeInteger(ex.balance)||ex.balance<0||!ex.ledger||!ex.albums||!ex.packs))fail('LEGACY_STRUCTURE','Economía histórica incompleta');
  }
  if(p.snapshot){
    if(p.snapshot.mode==='SURVIVAL'){
      const {restoreSurvival}=await import('../survival/storage.js'),{StateStore}=await import('../state.js');restoreSurvival(new StateStore(),p.snapshot);
    }else{const {validateCampaignSnapshot}=await import('../persistence/campaignSnapshot.js');validateCampaignSnapshot(p.snapshot);}
  }
  if(row.type==='career'&&row.store==='active'&&(!p.snapshot?.data?.career||!['EUROPA','AMERICA'].includes(p.region)||p.snapshot.data.region!==p.region||!Number.isSafeInteger(p.revision)))fail('LEGACY_STRUCTURE','Partida Carrera incompleta');
  if(row.type==='career'&&row.store==='history'&&(p.history_version!==1||!p.snapshot||!p.campaignId))fail('LEGACY_VERSION','Historial Carrera incompleto: se conserva para revisión');
  if(row.type==='survival'&&row.store==='active'&&(!p.snapshot||!Number.isSafeInteger(p.revision)))fail('LEGACY_STRUCTURE','Racha incompleta');
  if(row.type==='survival'&&row.store==='profile'&&(!Number.isSafeInteger(p.best)||p.best<0||!Number.isSafeInteger(p.played)||p.played<0))fail('LEGACY_STRUCTURE','Perfil Supervivencia incompleto');
  if(row.type==='survival'&&row.store==='history'&&(!p.runId||!Number.isSafeInteger(p.wins)||!p.reason))fail('LEGACY_STRUCTURE','Historial Supervivencia incompleto');
  if(row.type==='survival'&&row.store==='results'&&(!p.runId||!Number.isSafeInteger(p.index)||p.index<0))fail('LEGACY_STRUCTURE','Resultado Supervivencia incompleto');
  if(typeof row.key==='string'&&row.key.startsWith('laqp-dream-team-local-v1:')&&(p.version!==1||typeof p.formationId!=='string'||!p.slots||typeof p.slots!=='object'))fail('LEGACY_VERSION','Dream Team incompatible');
  if(typeof row.key==='string'&&row.key.startsWith('laqp-album-local-v1:')&&!row.key.includes(':player:')&&!row.key.includes(':unreadable:')&&(p.version!==1||!p.discovered))fail('LEGACY_VERSION','Álbum incompatible');
  if(p.version!==undefined&&p.version!==1)fail('LEGACY_VERSION','Versión local no soportada');
  return true;
}
// Never open a missing legacy database: databases() is required for automatic discovery.
// On browsers without it, report the limitation instead of creating/deleting a probe DB.
export async function scanLegacy({indexedDB=globalThis.indexedDB,localStorage=globalThis.localStorage,sessionStorage=globalThis.sessionStorage}={}){
  const entries=[],warnings=[],databases=[];
  async function add(row){
    try{row.archive=archiveLegacy(row.payload);}catch(e){warnings.push({key:row.key,code:e.code||'ARCHIVE_ERROR'});return;}
    row.owner=row.owner??localOwner(row.key,row.payload);row.classification=isLab(row.owner)?'laboratory':row.owner?'unresolved-owner':'ambiguous';
    try{row.payload=JSON.parse(JSON.stringify(row.payload));}catch{row.payload=null;row.parseError='NON_JSON_GRAPH';}
    try{if(row.parseError)throw new Error(row.parseError);await validateSource(row);row.valid=true;row.error=null;}catch(e){row.valid=false;row.error=e.code||e.message;}
    row.id=await digest({type:row.type,store:row.store,key:row.key});
    row.hash=await digest({payload:row.payload,archive:row.archive,rawText:row.rawText??null,owner:row.owner,version:row.version});entries.push(row);
  }
  if(indexedDB?.databases){
    const installed=await indexedDB.databases();
    for(const def of DATABASES){
      const present=installed.find(d=>d.name===def.name);if(!present)continue;
      if(!def.versions.includes(present.version)){warnings.push({database:def.name,code:'UNSUPPORTED_VERSION',version:present.version});continue;}
      let db;
      try{
        db=await new Promise((resolve,reject)=>{const r=indexedDB.open(def.name);r.onupgradeneeded=()=>{r.transaction.abort();reject(new Error('La fuente desapareció durante la lectura'));};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Fuente bloqueada'));r.onsuccess=()=>resolve(r.result);});
        const stores=def.stores.filter(n=>db.objectStoreNames.contains(n));if(!stores.length){warnings.push({database:def.name,code:'NO_KNOWN_STORES'});continue;}
        const tx=db.transaction(stores,'readonly'),done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});done.catch(()=>{});
        const groups=await Promise.all(stores.map(async store=>{
          const s=tx.objectStore(store),[keys,rows]=await Promise.all([req(s.getAllKeys()),req(s.getAll())]);return {store,keys,rows};
        }));await done;
        databases.push({name:def.name,version:db.version,stores});
        for(const group of groups)for(let i=0;i<group.rows.length;i++)await add({type:def.type,database:def.name,store:group.store,key:group.keys[i],owner:group.rows[i]?.subject??null,version:db.version,payload:group.rows[i]});
      }catch(e){warnings.push({database:def.name,code:'READ_ERROR',message:e.message});}finally{db?.close();}
    }
  }else warnings.push({code:'DATABASE_ENUMERATION_UNAVAILABLE',message:'Importación IDB pendiente: no se abrirán bases antiguas a ciegas'});
  for(const [storageName,storage]of [['localStorage',localStorage],['sessionStorage',sessionStorage]]){
    if(!storage)continue;
    try{
      const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>PREFIXES.some(p=>k?.startsWith(p))).sort();
      for(const key of keys){
        const rawText=storage.getItem(key);if(rawText===null)continue;let payload=null,parseError=null;
        try{payload=parse(rawText);}catch(e){
          if(e.code==='SECRET'){warnings.push({key,storageName,code:'CREDENTIAL_CONTENT_WITHHELD'});continue;}
          // Invalid source stays as inert text, not parsed or executed on recovery.
          if(/"(access_?token|refresh_?token|authorization|service_?role(_?key)?|anon_?key|supabase_?key|api_?key|password|session|sessions|jwt)"\s*:|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./i.test(rawText)){warnings.push({key,storageName,code:'CREDENTIAL_CONTENT_WITHHELD'});continue;}
          parseError=e.code||e.message;
        }
        await add({type:'web-storage',database:null,storage:storageName,store:storageName,key,owner:null,version:payload?.version??null,payload,rawText,parseError});
      }
    }catch(e){warnings.push({storageName,code:'READ_ERROR',message:e.message});}
  }
  entries.sort((a,b)=>a.id.localeCompare(b.id));
  const manifest={version:VERSION,databases,entries,warnings};return {...manifest,fingerprint:await digest(manifest)};
}
function conflict(code,entry,message){return {code,sourceId:entry?.id??null,message};}
export async function planLegacyImport(scan,{targetIdentity,owners=[],sourceIds=null}={}){
  identity(targetIdentity);if(scan.version!==VERSION)fail('VERSION','Inventario no compatible');
  const original={version:scan.version,databases:scan.databases,entries:scan.entries,warnings:scan.warnings};
  if(await digest(original)!==scan.fingerprint)fail('INTEGRITY','Inventario modificado');
  const selected=scan.entries.filter(e=>owners.includes(e.owner)&&(!sourceIds||sourceIds.includes(e.id))),conflicts=[],data=blankData(),pending=[];
  if(!selected.length)fail('EMPTY','Seleccioná explícitamente fuentes y propietarios');
  for(const entry of selected){
    if(!entry.owner||typeof entry.owner!=='string')conflicts.push(conflict('UNKNOWN_OWNER',entry,'La fuente debe conservarse hasta identificar su propietario'));
    if(entry.classification==='laboratory'&&!targetIdentity.startsWith('laboratory:'))conflicts.push(conflict('LABORATORY',entry,'Un perfil de laboratorio debe permanecer en laboratorio durante LF1'));
    if(!entry.valid)pending.push({id:entry.id,reason:entry.error});
  }
  const career=selected.filter(e=>e.valid&&e.type==='career'&&e.store==='profiles');
  if(career.length>1)conflicts.push(conflict('MULTIPLE_WALLETS',null,'No se suman perfiles ni saldos independientes'));
  if(career.length===1)data.shared.progress=clone(career[0].payload.progress);
  const addRun=(id,row)=>{const existing=data.runs.find(r=>r.id===id);if(existing){if(canonical(existing.legacy.snapshot)!==canonical(row.payload.snapshot))conflicts.push(conflict('ACTIVE_CONFLICT',row,'Dos fuentes de partida para el mismo espacio'));return;}data.runs.push({id,sourceId:row.id,sourceOwner:row.owner,legacy:clone(row.payload)});};
  for(const e of selected.filter(e=>e.valid)){
    const p=e.payload;
    if(e.type==='career'&&e.store==='active')addRun('career:'+p.region,e);
    else if(e.type==='survival'&&e.store==='active')addRun('survival:'+(p.snapshot.data.survival.variant==='DREAM_TEAM'?'dream':'traditional'),e);
    else if((e.type==='career'||e.type==='survival')&&e.store==='history')data.history.push({id:e.type+':'+(p.campaignId||p.runId),sourceId:e.id,sourceOwner:e.owner,legacy:clone(p)});
    else if(e.type==='survival'&&e.store==='profile')data.shared.survivalProfiles[e.owner]=clone(p);
    else if(e.type==='web-storage'){
      if(e.key.startsWith('laqp-album-local-v1:'))data.shared.albumNamespaces[e.key]=clone(p);
      else if(e.key.startsWith('laqp-dream-team-local-v1:')){
        if(data.shared.dreamTeam)conflicts.push(conflict('MULTIPLE_DREAM_TEAMS',e,'Elegí un único Dream Team'));else data.shared.dreamTeam={sourceOwner:e.owner,model:clone(p)};
      }else if(e.key.startsWith('laqp-draft-navigation-copy-v1:')&&p.snapshot?.campaignId)addRun('classic:'+p.snapshot.campaignId,e);
      else pending.push({id:e.id,reason:'PENDING_DECISION_NO_REPLAY'});
    }
  }
  const historyIds=new Set();for(const h of data.history){if(historyIds.has(h.id))conflicts.push(conflict('HISTORY_CONFLICT',null,'Colisión de identificadores históricos'));historyIds.add(h.id);}
  data.shared.legacy={version:VERSION,manifestFingerprint:scan.fingerprint,sourceOwners:owners.slice(),pending,sourceIds:selected.map(e=>e.id),activation:'isolated-lf1'};
  const plan={version:VERSION,targetIdentity,sourceFingerprint:scan.fingerprint,sources:selected,data,conflicts,pending};return {...plan,hash:await digest(plan)};
}
export async function applyLegacyImport(repository,plan,{rescan,operationId,confirm=false}={}){
  if(!confirm)fail('CONFIRMATION','La importación requiere confirmación explícita');
  recordId(operationId);const {hash,...body}=plan;if(await digest(body)!==hash)fail('INTEGRITY','Plan alterado');
  if(plan.conflicts.length)fail('LEGACY_CONFLICT','Hay fuentes que requieren resolución',plan.conflicts);
  if(typeof rescan!=='function')fail('SOURCE_CHECK','Es necesario volver a comprobar las fuentes');
  const id=identity(plan.targetIdentity),before=await repository.read(id);
  const previous=before?.data.shared.legacy;
  if(previous?.importPlanHash===hash)return {bundle:before,activationAllowed:false,sourcesUnchanged:(await rescan()).fingerprint===plan.sourceFingerprint,requiresLF2:true};
  if(before)fail('TARGET_OCCUPIED','Se conserva el destino existente: LF1 no fusiona ramas');
  const current=await rescan();if(current.fingerprint!==plan.sourceFingerprint)fail('SOURCE_CHANGED','Las fuentes cambiaron; prepará un plan nuevo');
  const data=clone(plan.data);data.shared.legacy.importPlanHash=hash;
  // Raw originals + manifest are in the SAME atomic commit, before any LF2 activation.
  data.shared.legacy.sourceArchive=clone(plan.sources);
  const result=await repository.commit(id,{expectedRevision:0,operationId,kind:'legacy-import',data,provenance:{planHash:hash,sourceFingerprint:plan.sourceFingerprint}});
  const after=await rescan();
  return {bundle:result,activationAllowed:false,sourcesUnchanged:after.fingerprint===plan.sourceFingerprint,requiresLF2:true};
}
