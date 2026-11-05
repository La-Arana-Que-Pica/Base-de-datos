import {PersonalRepository} from './repository.js';
import {identity,clone,digest,digestInfo,seal,fail} from './format.js';
import {freshCareer} from '../career/rules.js';
import {ensureExpansion,creditCampaign} from '../expansion/economy.js';
import {recordDiscovery} from '../expansion/album.js';
import {historicalDiscoveries} from '../album/recovery.js';
import {setPersonalContext} from './context.js';
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export class PersonalCoordinator {
 constructor(repository=new PersonalRepository()){
  this.repository=repository;this.queue=Promise.resolve();this.pending=null;this.failure=null;this.saving=0;this.listeners=new Set();this.timings=[];
  const rows=new Map();this.transientStorage={get length(){return rows.size;},key:i=>[...rows.keys()][i]??null,getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)};
 }
 async open(id=null){
  this.identity=id?identity(id):await this.repository.guestIdentity();this.tab=crypto.randomUUID();try{this.tab=sessionStorage.getItem('laqp-personal-tab')||this.tab;sessionStorage.setItem('laqp-personal-tab',this.tab);}catch{/* The tab token is not progress; durable owner journals still recover from IndexedDB. */}
  this.bundle=await this.repository.read(this.identity)||await this.repository.createProfile(this.identity);
  if(!this.bundle.data.shared.progress)await this.update('initialize:'+this.identity,'initialize',d=>{d.shared.progress=freshCareer();ensureExpansion(d.shared.progress);});
  const journals=await this.repository.transaction(['metadata'],'readonly',tx=>req(tx.objectStore('metadata').getAll(globalThis.IDBKeyRange?IDBKeyRange.bound('lf2-pending:'+this.identity+':','lf2-pending:'+this.identity+':\uffff'):undefined)));
  for(const row of journals.filter(r=>r.key.startsWith('lf2-pending:'+this.identity+':')).sort((a,b)=>a.job.expectedRevision-b.job.expectedRevision)){
   this.pending=row.job;try{await this.perform(row.job);this.pending=null;}catch(e){this.failure=e;break;}
  }
  if(!this.failure&&!this.progress.expansion)await this.update('initialize-economy:'+this.identity,'initialize-economy',data=>{ensureExpansion(data.shared.progress);});
  setPersonalContext(this);return this;
 }
 get progress(){return this.bundle.data.shared.progress;}
 get albumSource(){return this.bundle.data.shared.settings.albumSource||this.identity;}
 get dream(){return this.bundle.data.shared.dreamTeam?.model??this.bundle.data.shared.dreamTeam??null;}
 assertOwner(subject){if(this.detached||subject!==this.identity)fail('OWNER','El perfil cambió. No se modificó ningún progreso.');}
 async read(){await this.flush();return this.bundle;}
 subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 changed(progressChanged=true){if(this.detached)return;for(const fn of this.listeners)fn();this.renderStatus();const detail={subject:this.identity,revision:this.bundle.revision};globalThis.document?.dispatchEvent(new CustomEvent(progressChanged?'laqp-expansion-change':'laqp-personal-change',{detail}));}
 async perform(job){
  if(job.identity!==this.identity)fail('INTEGRITY','La operación pendiente no es válida');const fingerprint=await digestInfo(job.data);if(fingerprint.hash!==job.dataHash)fail('INTEGRITY','La operación pendiente no es válida');
  const start=performance.now();await this.repository.transaction(['metadata'],'readwrite',tx=>req(tx.objectStore('metadata').put({key:job.key,job})));
  const commitStart=performance.now();this.bundle=await this.repository.commit(this.identity,{expectedRevision:job.expectedRevision,operationId:job.operationId,kind:job.kind,data:job.data});
  const commitMs=performance.now()-commitStart;
  await this.repository.transaction(['metadata'],'readwrite',tx=>req(tx.objectStore('metadata').delete(job.key)));
  this.timings.push({kind:job.kind,ms:performance.now()-start,commitMs,bytes:fingerprint.bytes});if(this.timings.length>100)this.timings.shift();
 }
 update(operationId,kind,prepare){
  if(this.detached)return Promise.reject(new Error('La identidad cambió'));if(this.failure)return Promise.reject(this.failure);this.saving++;this.renderStatus();
  const task=this.queue.then(async()=>{
   if(this.failure)throw this.failure;const data=clone(this.bundle.data),result=prepare(data);if(result?.then)fail('ASYNC_DOMAIN','Prepará las reglas fuera de la transacción');
   const dataHash=await digest(data);
   // digest() strictly validated both JSON trees before this native comparison.
   const progressChanged=JSON.stringify(data.shared.progress)!==JSON.stringify(this.progress);
   const job={identity:this.identity,key:'lf2-pending:'+this.identity+':'+this.tab,expectedRevision:this.bundle.revision,operationId,kind,data,dataHash,progressChanged};
   this.pending=job;try{await this.perform(job);this.pending=null;if(this.detached)fail('OWNER','La identidad cambió después del guardado; el resultado no se presenta en otra cuenta');this.changed(progressChanged);return {progress:clone(this.progress),result,bundle:this.bundle};}catch(e){this.failure=e;this.onFailure?.();throw e;}
  });
  this.queue=task.catch(()=>{}).finally(()=>{this.saving--;this.renderStatus();});return task;
 }
 async flush(){await Promise.resolve();await this.queue;if(this.failure)throw this.failure;return true;}
 async retry(){if(!this.pending){this.failure=null;this.renderStatus();await this.onRecovered?.();return;}this.saving++;this.failure=null;this.renderStatus();try{const job=this.pending;await this.perform(job);this.pending=null;this.changed(job.progressChanged!==false);}catch(e){this.failure=e;throw e;}finally{this.saving--;this.renderStatus();}await this.onRecovered?.();}
 async archiveConflict(){
  if(!this.pending)return;const latest=await this.repository.read(this.identity),sealed=await seal(latest),pending=clone(this.pending);
  await this.repository.transaction(['recovery','metadata'],'readwrite',async tx=>{
   await req(tx.objectStore('recovery').add({identity:this.identity,id:'protected:lf2-conflict:'+crypto.randomUUID(),kind:'protected',reason:'lf2-pending-conflict',sealed,pending}));await req(tx.objectStore('metadata').delete(pending.key));
  });location.reload();
 }
 renderStatus(){
  if(!globalThis.document||this.detached)return;
  let node=document.querySelector('#personal-save-status');if(!node){node=document.createElement('aside');node.id='personal-save-status';node.className='personal-save-status';document.querySelector('.draft-header')?.after(node);}
  const app=document.querySelector('#app'),blocked=!!(this.saving||this.failure);if(app)app.inert=blocked;
  const statusKey=JSON.stringify([this.identity,this.failure?.code,this.failure?.message,!!this.saving,!!this.matchActive]);
  if(this.statusNode===node&&this.statusKey===statusKey)return;this.statusNode=node;this.statusKey=statusKey;
  const text=this.failure?'No se confirmó el guardado: '+this.failure.message:this.saving?'Guardando en este dispositivo…':this.matchActive?this.matchRecovery?'Partido en curso · Consultá el último checkpoint confirmado.':'Previa guardada en este dispositivo · Si cerrás durante el partido, recuperás la previa.':'Guardado en este dispositivo';
  node.replaceChildren();const message=document.createElement('span');message.setAttribute('role',this.failure?'alert':'status');message.textContent=text;node.append(message);
  if(this.failure){const b=document.createElement('button');b.className='menu-secondary';b.textContent='REINTENTAR GUARDADO';b.onclick=()=>this.retry().catch(()=>{});node.append(b);if(this.failure.code==='CONFLICT'){const c=b.cloneNode();c.textContent='CONSERVAR COPIA Y CARGAR EL GUARDADO';c.onclick=()=>this.archiveConflict().catch(()=>{});node.append(c);}}
  document.body.dataset.personalOwner=this.identity||'';document.body.dataset.personalStore='laqp-draft-personal';document.body.dataset.personalSaving=String(!!this.saving);document.body.dataset.personalError=this.failure?.code||'';
 }
 discoveries(data,snapshot){
  const source=snapshot.data.albumSubject;if(!source)return;const progress=data.shared.progress;
  // Only actual owned players, never offers/opponents/permanent Dream cards.
  data.shared.legacy.personalSeen??={};const seen=data.shared.legacy.personalSeen[snapshot.campaignId]??={};
  for(const id of historicalDiscoveries(snapshot))if(!seen[id]){recordDiscovery(progress,source,id,'personal:'+snapshot.campaignId+':'+id,{});seen[id]=true;}
 }
 mutate(subject,fn){this.assertOwner(subject);return this.update('mutation:'+crypto.randomUUID(),'economy',d=>fn(d.shared.progress));}
 async saveDream(model){return this.update('dream:'+crypto.randomUUID(),'dream',d=>{d.shared.dreamTeam=clone(model);});}
 async saveClassic(snapshot){return this.update('classic:'+crypto.randomUUID(),'classic',data=>{
  this.discoveries(data,snapshot);const entry={id:'classic',snapshot};data.runs=data.runs.filter(r=>r.id!=='classic'&&!r.id.startsWith('classic:'));data.runs.push(entry);
  if(['champion','eliminated'].includes(snapshot.data.tournament?.status)){
   const t=snapshot.data.tournament,key='CLASSIC:'+(snapshot.data.expansionRunId||snapshot.campaignId);
   if(!data.shared.legacy.importedFinals?.[snapshot.campaignId])creditCampaign(data.shared.progress,key,{mode:'CLASSIC',played:t.history.length,wins:t.history.filter(m=>m.userWon).length,champion:t.status==='champion'});
   if(!data.history.some(h=>h.id==='classic:'+snapshot.campaignId))data.history.push({id:'classic:'+snapshot.campaignId,mode:'CLASSIC',legacy:{campaignId:snapshot.campaignId,snapshot,finishedAt:new Date().toISOString()}});
  }
 });}
}
