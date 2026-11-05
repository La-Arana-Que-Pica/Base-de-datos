import {LocalSyncStore,snapshotMarker,validateCloudMatches} from './local.js';
import {packSnapshot,unpackSnapshot,profileSummary,textHash,checkManifest,validateUploadJob} from './protocol.js';
import {fail,canonical} from '../format.js';
import {uploadBatches,LEGACY_TRANSPORT} from './batching.js';
import {VerifiedDownloadCache} from './downloadCache.js';
export class PersonalSyncCoordinator{
 constructor({runtime,client,intervalMs=45000,online=()=>globalThis.navigator?.onLine!==false,onChange=()=>{},onInstalled=()=>globalThis.location?.reload()}){
  Object.assign(this,{runtime,client,intervalMs:Math.max(30000,Math.min(60000,intervalMs)),online,onChange,onInstalled});this.store=new LocalSyncStore(runtime.repository,runtime.identity,client.projectRef);this.status='local';this.epoch=0;this.attempts=0;this.metrics=[];this.downloadCache=new VerifiedDownloadCache();
 }
 async start(){this.state=await this.store.state();if(this.state.version!==1)fail('SYNC_VERSION','Estado de sincronización incompatible');this.unsubscribe=this.runtime.subscribe(()=>this.dirty());this.unwatchAccess=this.client.watchAccess?.(()=>this.configurationChanged());if(!this.allowed())this.status='disabled';else if(this.state.conflict)this.status='conflict';else if(this.state.enabled){this.status='pending';this.schedule();}this.emit();return this;}
 allowed(){return !this.client.access||this.client.access(this.runtime.identity);}
 configurationChanged(){if(this.closed)return;this.epoch++;this.client.disconnect();this.downloadCache.clear();clearTimeout(this.timer);this.timer=null;this.status=this.allowed()?(this.state?.enabled?'pending':'local'):'disabled';this.emit();if(this.allowed()&&this.state?.enabled)this.schedule();}
 emit(){if(!this.closed)this.onChange(this);}
 dirty(){if(this.closed||!this.state?.enabled)return;if(!this.allowed()){this.status='disabled';this.emit();return;}this.status=this.state.conflict?'conflict':'pending';this.schedule();this.emit();}
 playing(){const r=this.runtime;return !!(r.matchActive&&!r.matchRecovery?.playback?.paused);}
 schedule(delay=this.intervalMs){if(this.timer||this.closed||!this.allowed()||!this.state?.enabled||this.state.conflict)return;this.timer=setTimeout(()=>{this.timer=null;this.sync().catch(()=>{});},delay);}
 async enable(){await this.client.session(this.runtime.identity);this.state=await this.store.updateState(s=>({...s,enabled:true}));return this.sync();}
 async disable(){clearTimeout(this.timer);this.timer=null;this.downloadCache.clear();this.client.disconnect();this.epoch++;this.state=await this.store.updateState(s=>({...s,enabled:false}));this.status='local';this.emit();}
 async sync(){
  if(this.closed||!this.state?.enabled)return;if(!this.allowed()){this.configurationChanged();return;}if(this.inflight)return this.inflight;
  if(this.playing()){this.status='pending';this.schedule();this.emit();return;}
  if(!this.online()){this.status='offline';this.emit();return;}
  clearTimeout(this.timer);this.timer=null;const epoch=this.epoch;
  // Publish the new operation before the first IndexedDB await. Otherwise a
  // waiter can mistake a previous 'synced' status for this request's result.
  this.status=this.state.conflict?'conflict':'syncing';this.emit();
  const task=this.run(epoch).catch(e=>{if(e.code==='SYNC_BASE_CHANGED'&&epoch===this.epoch&&!this.closed)return this.run(epoch);throw e;}).catch(e=>{if(epoch!==this.epoch||this.closed)return;this.error=e;this.status=this.state.conflict?'conflict':e.code==='SYNC_DISABLED'?'disabled':e.code==='SYNC_PLAYING'?'pending':e.code==='SYNC_AUTH'?'expired':e.code==='SYNC_CONFLICT'?'conflict':e.code==='SYNC_DETACHED'?'local':e.code==='SYNC_NETWORK'?'offline':'error';this.emit();if(e.code==='SYNC_PLAYING')this.schedule();else if(['SYNC_NETWORK','SYNC_LOCAL_CHANGED'].includes(e.code)&&this.attempts++<3)this.schedule(Math.min(60000,2000*2**this.attempts));});
  this.inflight=task;try{return await task;}finally{if(this.inflight===task)this.inflight=null;}
 }
 assert(epoch){if(this.closed||this.runtime.detached||epoch!==this.epoch)fail('SYNC_DETACHED','El perfil cambió');}
 gate(epoch=this.epoch){this.assert(epoch);this.client.assertAccess?.(this.runtime.identity);if(this.playing())fail('SYNC_PLAYING','El respaldo continuará cuando el partido esté pausado');}
 async download(head,epoch=this.epoch){
  this.gate(epoch);if(!head||!Number.isSafeInteger(head.revision)||head.revision<1)fail('SYNC_FORMAT','Cabecera remota incompatible');
  const cached=this.downloadCache.get(this.runtime.identity,this.client.projectRef,head);
  if(cached){
   try{
   await this.client.session(this.runtime.identity);this.gate(epoch);
   // No shared mutable aliases. Revalidate the sealed export and LF3 graph,
   // even though these exact immutable bytes were verified before caching.
   if(await textHash(cached.manifest)!==head.hash)fail('SYNC_INTEGRITY','El respaldo temporal está dañado');this.gate(epoch);
   const payload=await this.runtime.repository.inspectExport(cached.exportText);this.gate(epoch);
   const copy={active:payload.active,matches:payload.matches||[],manifest:checkManifest(JSON.parse(cached.manifest),this.runtime.identity)};
   await validateCloudMatches(copy);this.gate(epoch);return copy;
   }catch(e){this.downloadCache.clear();throw e;}
  }
  if(!head.manifest){const full=await this.client.head(this.runtime.identity,null,true);this.gate(epoch);if(!full||full.revision!==head.revision||full.hash!==head.hash)fail('SYNC_CONFLICT','La cuenta avanzó durante la descarga; se conserva la copia local');head=full;}
  const transport=this.client.negotiate?await this.client.negotiate(this.runtime.identity):LEGACY_TRANSPORT;this.gate(epoch);
  const copy=await unpackSnapshot(head.manifest,head.hash,this.runtime.identity,hs=>this.client.get(this.runtime.identity,hs),{transport,boundary:async()=>this.gate(epoch)});this.gate(epoch);await validateCloudMatches(copy);this.gate(epoch);
  const exportText=await (await import('./protocol.js')).snapshotExport(copy);await this.runtime.repository.inspectExport(exportText);this.gate(epoch);
  this.downloadCache.rememberVerified(this.runtime.identity,this.client.projectRef,head,exportText);return copy;
 }
 async conflict(head,local,epoch){
  const remote=await this.download(head,epoch);this.assert(epoch);const backup=await this.store.backupConflict(local,remote,head);this.assert(epoch);
  this.state=await this.store.updateState(s=>({...s,conflict:{remoteRevision:head.revision,hash:head.hash,localStamp:local.stamp,local:profileSummary(local.active.bundle),remote:profileSummary(remote.active.bundle),backup}}));this.status='conflict';this.emit();
 }
 async prepare(local,protectCurrent=false){
  this.gate();
  const branch=this.state.branchToken||null;if(this.cache?.branch!==branch)this.cache=null;
  // LF1 makes history/receipts immutable within a branch; explicit cloud branch
  // replacement changes branchToken, including replacements made by another tab.
  const packed=await packSnapshot(local,{previous:this.cache,immutableRows:true,knownBlobs:this.state.knownBlobs,boundary:async()=>this.gate()});this.gate();this.cache={cache:packed.cache,branch};
  const known=new Set(this.state.knownBlobs||[]),blobs=[...packed.blobs].filter(([hash])=>!known.has(hash)).map(([hash,text])=>({hash,text}));
  const job={version:1,owner:this.runtime.identity,projectRef:this.client.projectRef,operationId:crypto.randomUUID(),expectedRevision:this.state.remoteRevision,localRevision:local.active.bundle.revision,localStamp:local.stamp,profileHash:local.active.hash,marker:snapshotMarker(local),manifest:packed.manifest,text:packed.text,hash:packed.hash,blobs,protectCurrent};
  this.metrics.push(packed.metrics);if(this.metrics.length>50)this.metrics.shift();return this.store.putJob(job);
 }
 async run(epoch){
  this.state=await this.store.state();if(!this.state.enabled)return;this.status='syncing';this.emit();await this.runtime.flush();this.assert(epoch);let job=await this.store.pending();const stamp=await this.store.stamp();this.assert(epoch);
  if(this.state.conflict){this.status='conflict';this.emit();return;}
  if(!job){const head=await this.client.head(this.runtime.identity);this.gate(epoch);
   if(this.state.remoteRevision===null){if(head){await this.conflict(head,await this.store.capture(),epoch);return;}this.state=await this.store.updateState(s=>({...s,remoteRevision:0}));}
   else if((head?.revision||0)!==this.state.remoteRevision){const fresh=await this.store.state();this.assert(epoch);if(head&&fresh.remoteRevision===head.revision&&fresh.cloudHash===head.hash)this.state=fresh;else{if(!head)fail('SYNC_CONFLICT','El respaldo remoto ya no coincide; conservá la copia local');await this.conflict(head,await this.store.capture(),epoch);return;}}
   if(stamp===this.state.baseStamp){this.status='synced';this.emit();return;}job=await this.prepare(await this.store.capture());
  }
  this.gate(epoch);if(job.owner!==this.runtime.identity||job.projectRef!==this.client.projectRef||job.version!==1)fail('SYNC_OWNER','La intención pertenece a otra cuenta o proyecto');
  if(await textHash(job.text)!==job.hash||canonical(checkManifest(JSON.parse(job.text),this.runtime.identity))!==canonical(job.manifest))fail('SYNC_INTEGRITY','La intención de respaldo está dañada; se conserva para recuperación');
  await validateUploadJob(job,{knownBlobs:this.state.knownBlobs,boundary:async()=>this.gate(epoch)});
  this.assert(epoch);
  const transport=this.client.negotiate?await this.client.negotiate(this.runtime.identity):LEGACY_TRANSPORT;this.gate(epoch);
  const batches=[...uploadBatches(job.blobs,transport)];for(const batch of batches){this.gate(epoch);await this.client.put(this.runtime.identity,batch);this.gate(epoch);}
  let receipt;try{receipt=await this.client.commit(this.runtime.identity,job);}catch(e){if(e.code==='SYNC_CONFLICT'){const head=await this.client.head(this.runtime.identity);this.assert(epoch);await this.conflict(head,await this.store.capture(),epoch);return;}throw e;}
  this.assert(epoch);this.state=await this.store.acknowledge(job,receipt);this.assert(epoch);this.downloadCache.clear();this.error=null;this.attempts=0;
  const latest=await this.store.stamp();this.assert(epoch);this.status=latest===job.localStamp?'synced':'pending';this.emit();if(this.status==='pending')this.schedule();
 }
 async resolve(choice,{confirm=false}={}){
  if(!confirm||!['local','remote'].includes(choice))fail('CONFIRMATION','Elegí una versión completa; no se combinarán monedas ni cartas');
  if(this.inflight)await this.inflight;if(this.playing())fail('SYNC_PLAYING','Pausá el partido antes de elegir una versión');const epoch=this.epoch,c=this.state.conflict;if(!c)fail('SYNC_CONFLICT','Revisá primero las dos versiones');
  await this.runtime.flush();const local=await this.store.capture(),head=await this.client.head(this.runtime.identity);this.assert(epoch);
  if(!head||head.revision!==c.remoteRevision||head.hash!==c.hash||local.stamp!==c.localStamp){if(head)await this.conflict(head,local,epoch);fail('SYNC_CONFLICT','Una versión cambió; revisá los resúmenes actualizados');}
  const remote=await this.download(head,epoch);await this.store.backupConflict(local,remote,head);this.assert(epoch);
  if(choice==='remote'){
   const checked=await this.client.head(this.runtime.identity);this.assert(epoch);if(checked.revision!==head.revision||checked.hash!==head.hash){await this.conflict(checked,local,epoch);fail('SYNC_CONFLICT','La cuenta avanzó en otro dispositivo');}
   this.gate(epoch);const installed=await this.store.install(remote,{expectedStamp:local.stamp,head,confirm:true,boundary:()=>this.gate(epoch)});this.assert(epoch);this.cache=null;this.downloadCache.clear();this.runtime.bundle=installed.bundle;this.state=installed.state;this.status='synced';this.emit();await this.onInstalled({bundle:installed.bundle,snapshot:remote});return;
  }
  await this.store.discardJobForResolution();this.state=await this.store.updateState(s=>({...s,remoteRevision:head.revision,conflict:null}));await this.prepare(local,true);return this.sync();
 }
 async networkChanged(){if(this.closed)return;this.attempts=0;if(!this.allowed()){this.configurationChanged();return;}if(!this.state?.enabled){this.status='local';this.emit();return;}if(this.online()){
  // A renewed session can arrive before the canceled request's finally clears
  // inflight. Wait for that old epoch, then start a fresh request for this owner.
  if(this.status==='expired'&&this.inflight){const epoch=this.epoch;await this.inflight;if(this.closed||this.runtime.detached||epoch!==this.epoch)return;}
  return this.sync();
 }this.status='offline';this.emit();}
 sessionExpired(){this.epoch++;this.downloadCache.clear();this.client.disconnect();clearTimeout(this.timer);this.timer=null;this.status='expired';this.emit();}
 stop(){this.closed=true;this.epoch++;clearTimeout(this.timer);this.timer=null;this.unsubscribe?.();this.unwatchAccess?.();this.client.disconnect();this.cache=null;this.downloadCache.clear();}
}
