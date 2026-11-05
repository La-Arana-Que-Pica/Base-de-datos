import {completedCampaign,createHistoryDisplay} from './campaignHistory.js';
import {createCampaignSnapshot,restoreCampaignSnapshot,safeCheckpoint,validateCampaignSnapshot} from './campaignSnapshot.js';
import {CampaignSaveError,sameCampaignWrite} from './cloudCampaigns.js';
const uuid=()=>globalThis.crypto.randomUUID();
const checkpointMethods=['prepareFormationOffer','backToRegion','setFormation','confirmFormation','chooseCoach','chooseCaptain','openDraftSlot','resumePendingPick','closeDraftPick','selectCandidate','selectSquadSlot','confirmLineup','completeRound','openRewardChoices','chooseReward','previewReward','upgradePlayer','acquireRivalPlayer','advanceCampaign'];
export class CampaignPersistence{
 constructor(state,service,{storage=null,confirm=()=>false,onChange=()=>{},delay=450,clock=globalThis}={}){
  Object.assign(this,{state,service,storage,confirm,onChange,delay,clock});this.owner=null;this.boundOwner=null;this.ready=false;this.remote=null;this.revision=0;this.campaignId=uuid();this.tabId=uuid();this.epoch=0;this.enabled=false;this.suspended=false;this.status='Invitado · sin guardado cloud';this.error=null;this.pending=null;this.inFlight=null;this.retryJob=null;this.latest=null;this.lastSafe=null;this.timer=null;this.busy=false;this.lastAck=null;this.archiveReceipt=null;this.archiveTask=null;this.archiving=false;
 }
 emit(message,error=null){this.status=message;this.error=error;this.onChange(this);}
 key(){return 'laqp-draft-outbox-v1:'+this.owner;}
 readOutbox(){if(!this.storage||!this.owner)return null;const raw=this.storage.getItem(this.key());if(!raw)return null;const box=JSON.parse(raw);if(box.owner!==this.owner||!Array.isArray(box.jobs)||box.jobs.length>2)throw new Error('Checkpoint local incompatible');for(const job of box.jobs){validateCampaignSnapshot(job.snapshot);if(!Number.isSafeInteger(job.revision)||job.revision<0||typeof job.writeId!=='string')throw new Error('Checkpoint local inválido');}return box;}
 writeOutbox(){if(!this.storage||!this.owner)return;const existing=this.readOutbox();if(existing&&existing.tabId!==this.tabId)throw new CampaignSaveError('conflict','Hay cambios pendientes en otra pestaña. Usá Continuar Draft para revisar el guardado.');const jobs=[this.inFlight||this.retryJob,this.pending].filter(Boolean);if(jobs.length)this.storage.setItem(this.key(),JSON.stringify({owner:this.owner,tabId:this.tabId,jobs}));else this.storage.removeItem(this.key());}
 async refreshIdentity(){const token=++this.epoch;this.ready=false;this.enabled=false;this.boundOwner=null;this.archiveReceipt=null;this.remote=null;this.pending=null;this.retryJob=null;this.latest=null;this.revision=0;this.clock.clearTimeout(this.timer);try{const owner=await this.service.identity();if(token!==this.epoch)return;this.owner=owner;if(!owner){this.emit('Invitado · sin guardado cloud');return;}this.emit('Buscando campaña…');const row=await this.service.load(owner);if(token!==this.epoch)return;this.remote=row;this.revision=row?.revision||0;this.ready=true;this.emit(row?'Campaña guardada disponible':'Cuenta lista · sin campaña guardada');if(completedCampaign(row?.snapshot))await this.ensureArchived(row);}catch(e){if(token===this.epoch)this.emit(e.message,e);} }
 install(){if(this.installed)return;this.installed=true;for(const name of checkpointMethods){const original=this.state[name];this.state[name]=(...args)=>{const result=original.apply(this.state,args);this.capture();return result;};}const notify=this.state.notify;this.state.notify=()=>{this.capture();notify.call(this.state);};}
 capture(){
  if(this.suspended||!safeCheckpoint(this.state))return;
  try{const snapshot=createCampaignSnapshot(this.state,this.campaignId);this.lastSafe=snapshot;if(!this.enabled||this.boundOwner!==this.owner||!this.ready||this.error?.code==='conflict')return;
   const json=JSON.stringify(snapshot);if(json===this.latest||json===this.lastAck)return;this.latest=json;
   const revision=(this.inFlight||this.retryJob)?(this.inFlight||this.retryJob).revision+1:this.revision;
   this.pending={snapshot,revision,writeId:uuid()};this.writeOutbox();this.emit('Cambios pendientes de guardar…');this.clock.clearTimeout(this.timer);this.timer=this.clock.setTimeout(()=>{this.flush().catch(()=>{});},this.delay);
  }catch(e){this.emit(e.message,e);}
 }
 async flush(){
  this.clock.clearTimeout(this.timer);if(this.busy){await this.running;return this.flush();}
  if(!this.enabled||this.boundOwner!==this.owner||!this.ready)throw new CampaignSaveError('auth',this.owner?'Activá el guardado de esta campaña antes de salir.':'Iniciá sesión para guardar en la nube.');
  if(this.error?.code==='conflict')throw this.error;
  if(!this.pending&&!this.retryJob){if(completedCampaign(this.remote?.snapshot))await this.ensureArchived(this.remote);return this.remote;}
  const token=this.epoch,owner=this.owner;this.busy=true;
  this.running=(async()=>{while(this.retryJob||this.pending){const job=this.retryJob||this.pending;if(this.retryJob)this.retryJob=null;else this.pending=null;this.inFlight=job;this.emit('Guardando…');let row;try{this.writeOutbox();row=await this.service.save(owner,job.snapshot,job.revision,job.writeId);}catch(e){if(token===this.epoch){this.retryJob=job;this.inFlight=null;this.emit(e.message,e);this.writeOutbox();}throw e;}if(token!==this.epoch||owner!==this.owner)throw new CampaignSaveError('auth','La cuenta cambió; la respuesta anterior no se aplicó a esta sesión.');this.remote=row;this.revision=row.revision;this.lastAck=JSON.stringify(job.snapshot);this.inFlight=null;if(this.pending)this.pending.revision=this.revision;this.writeOutbox();}if(completedCampaign(this.remote?.snapshot))await this.ensureArchived(this.remote);else this.emit('Partida guardada');return this.remote;})();
  try{return await this.running;}finally{this.busy=false;this.running=null;this.inFlight=null;}
 }
 async ensureArchived(row=this.remote){
  if(!completedCampaign(row?.snapshot))return null;
  if(this.archiveReceipt?.campaign_id===row.campaign_id&&this.archiveReceipt.user_id===this.owner)return this.archiveReceipt;
  if(this.archiveTask){await this.archiveTask.catch(()=>{});if(this.archiveReceipt?.campaign_id===row.campaign_id&&this.archiveReceipt.user_id===this.owner)return this.archiveReceipt;}
  const epoch=this.epoch,owner=this.owner;if(row.user_id!==owner)throw new CampaignSaveError('auth','La campaña pertenece a otra cuenta.');if(!owner||!this.ready)throw new CampaignSaveError('auth','Iniciá sesión para archivar la campaña terminada.');
  this.archiving=true;this.emit('Archivando campaña terminada…');
  const task=(async()=>{try{if(typeof this.service.archive!=='function')throw new CampaignSaveError('unavailable','El historial está pendiente de habilitación. La campaña final se conserva; reintentá antes de comenzar otra.');const record=await this.service.archive(owner,row,createHistoryDisplay(row.snapshot));if(epoch!==this.epoch||owner!==this.owner)throw new CampaignSaveError('auth','La cuenta cambió durante el archivado.');this.archiveReceipt=record;this.emit('Campaña archivada en tu historial');return record;}catch(e){if(epoch===this.epoch)this.emit('No se pudo archivar. La campaña se conserva. '+e.message,e);throw e;}finally{this.archiving=false;}})();
  this.archiveTask=task;try{return await task;}finally{if(this.archiveTask===task)this.archiveTask=null;}
 }
 async beginNew(){
  if(this.busy)await this.running;
  const epoch=this.epoch,owner=this.owner;
  if(owner&&!this.ready)throw new CampaignSaveError('auth','Recuperá la conexión de tu cuenta antes de reemplazar la campaña.');
  let finished=false;
  if(owner&&!this.enabled&&!this.suspended&&this.state.currentScreen!=='START'&&completedCampaign(this.state)){if(!await this.adoptCurrent())return false;}
  if(owner&&this.enabled&&this.boundOwner===owner&&completedCampaign(this.state)){
   this.capture();await this.flush();finished=!!await this.ensureArchived(this.remote);
  }else if(owner&&(this.suspended||this.state.currentScreen==='START')&&completedCampaign(this.readOutbox()?.jobs.at(-1)?.snapshot)){
   await this.continueDraft();finished=!!await this.ensureArchived(this.remote);
  }else if(owner&&completedCampaign(this.remote?.snapshot)&&(this.suspended||this.state.currentScreen==='START')){
   const box=this.readOutbox();if(box){if(completedCampaign(box.jobs.at(-1)?.snapshot)){await this.continueDraft();finished=!!await this.ensureArchived(this.remote);}}
   else finished=!!await this.ensureArchived(this.remote);
  }
  const localProgress=!this.suspended&&this.state.currentScreen!=='START'&&!completedCampaign(this.state)&&(this.state.formationConfirmed||this.state.formationOffer?.length||this.state.getFullSquad().length||this.state.tournament);
  if(!finished&&(localProgress||this.remote||this.readOutbox())){if(!await this.confirm('Ya tenés una campaña guardada o cambios pendientes. ¿Querés reemplazarla por un nuevo Draft?'))return false;}
  if(epoch!==this.epoch||owner!==this.owner)throw new CampaignSaveError('auth','La cuenta cambió; no se reemplazó la campaña.');
  // No DELETE cloud. La fila final permanece hasta el próximo CAS confirmado.
  this.clock.clearTimeout(this.timer);if(this.owner)this.storage?.removeItem(this.key());this.pending=this.retryJob=null;this.error=null;this.latest=this.lastAck=null;this.archiveReceipt=null;this.campaignId=uuid();this.suspended=false;this.enabled=!!(this.owner&&this.ready);this.boundOwner=this.enabled?this.owner:null;return true;
 }
 async adoptCurrent(){
  if(!this.owner||!this.ready)throw new CampaignSaveError('auth',this.owner?'El guardado cloud todavía no está disponible.':'Iniciá sesión para guardar esta campaña.');
  if(!safeCheckpoint(this.state))throw new Error('Activá el guardado en una pantalla segura, fuera del partido en curso.');
  if(!this.enabled){const epoch=this.epoch,owner=this.owner;const check=()=>{if(epoch!==this.epoch||owner!==this.owner)throw new CampaignSaveError('auth','La cuenta cambió; no se reemplazó la campaña.');};const row=await this.service.load(owner);check();if(row||this.readOutbox()){if(completedCampaign(row?.snapshot)&&!this.readOutbox())await this.ensureArchived(row);else if(!await this.confirm('Guardar esta campaña reemplazará tu campaña cloud o sus cambios pendientes. ¿Confirmás?'))return false;}check();this.remote=row;this.revision=row?.revision||0;this.storage?.removeItem(this.key());this.enabled=true;this.boundOwner=this.owner;this.suspended=false;this.latest=this.lastAck=null;this.pending=this.retryJob=null;}
  this.capture();await this.flush();return true;
 }
 async continueDraft(){
  if(!this.owner||!this.ready)throw new Error('No hay una campaña cloud disponible para continuar.');
  if(this.busy)await this.running;
  const token=this.epoch,owner=this.owner;let row=await this.service.load(owner);const box=this.readOutbox();
  if(box){for(const job of box.jobs){if(row?.write_id===job.writeId){if(!sameCampaignWrite(row,job))throw new CampaignSaveError('conflict','El identificador de escritura corresponde a otro contenido. Los cambios locales no se aplicaron.');continue;}if((row?.revision||0)!==job.revision){if(completedCampaign(job.snapshot))throw new CampaignSaveError('conflict','Hay una campaña terminada pendiente y una revisión cloud diferente. Sus datos locales se conservan; resolvé el conflicto antes de iniciar otro Draft.');if(!row||!await this.confirm('Otra pestaña o dispositivo avanzó más. ¿Querés descartar los cambios locales pendientes y continuar la versión cloud?'))throw new CampaignSaveError('conflict','Los cambios locales no se sobrescribieron. Elegí qué campaña continuar.');break;}row=await this.service.save(owner,job.snapshot,job.revision,job.writeId);}}
  if(token!==this.epoch||owner!==this.owner)throw new Error('La cuenta cambió durante la recuperación');if(!row)throw new Error('No hay campaña recuperable');
  // Validation and reconstruction complete before touching current game state.
  validateCampaignSnapshot(row.snapshot);this.suspended=true;
  try{this.campaignId=restoreCampaignSnapshot(this.state,row.snapshot);}finally{this.suspended=false;}
  this.clock.clearTimeout(this.timer);this.pending=this.retryJob=null;this.latest=this.lastAck=JSON.stringify(row.snapshot);this.remote=row;this.revision=row.revision;this.boundOwner=owner;this.enabled=true;this.storage?.removeItem(this.key());this.emit('Campaña recuperada');if(completedCampaign(row.snapshot)){try{await this.ensureArchived(row);}catch{/* Final restaurado; error visible, nuevo Draft bloqueado hasta archivar. */}}return true;
 }
 async saveAndExit(){
  if(!this.enabled){if(!await this.adoptCurrent())return false;}
  if(!safeCheckpoint(this.state)){if(!this.lastSafe)throw new Error('No existe una previa segura para guardar');if(!await this.confirm('Se guardará la previa del partido. Al continuar tendrás que jugarlo desde el inicio. ¿Guardar y salir?'))return false;}
  else this.capture();await this.flush();
  if(!this.remote)throw new Error('El servidor no confirmó un guardado');
  this.suspended=true;this.state.activeMatch?.playback?.dispose();this.state.activeMatch?.stopTimer?.();this.state.currentScreen='START';this.state.notify();this.emit('Partida guardada · podés continuarla');return true;
 }
 async restart(){if(!await this.beginNew())return false;this.state.activeMatch?.playback?.dispose();this.state.activeMatch?.stopTimer?.();this.state.reset();this.state.setScreen('START');return true;}
}
