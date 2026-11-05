import {PersonalMatchStore} from './matches.js';
import {captureMatchCheckpoint,restoreMatchCheckpoint} from '../persistence/matchCheckpoint.js';
import {state} from '../state.js';
import {fail} from './format.js';
export class PersonalMatchRecovery{
 constructor(runtime,{prepare=async()=>{},mount}={}){this.runtime=runtime;this.store=new PersonalMatchStore(runtime.repository);this.prepare=prepare;this.mount=mount;this.sequence=0;this.timings=[];this.applied=new WeakSet();this.lastMinute=-1;this.lastAt=0;this.wanted=false;this.restored=false;this.closed=false;}
 context(){
  const runId=state.survival?'survival:'+(state.survival.variant==='DREAM_TEAM'?'dream':'traditional'):state.career?'career:'+state.region:'classic';
  const run=this.runtime.bundle.data.runs.find(r=>r.id===runId||runId==='classic'&&r.id.startsWith('classic:'));if(!run)return null;
  const snapshot=run.snapshot||run.legacy?.snapshot,d=snapshot.data,t=d.tournament;
  const campaignId=snapshot.campaignId||d.survival?.id;
  return {run,context:{owner:this.runtime.identity,runId:run.id,campaignId,encounterId:campaignId+':'+(t?.seed??d.survival?.seed)+':'+(d.survival?.wins??t?.roundIndex??0),mode:d.survival?(d.survival.variant==='DREAM_TEAM'?'SURVIVAL_DREAM':'SURVIVAL'):d.career?'CAREER':'CLASSIC',region:d.region||'EUROPA'}};
 }
 attach(p){
  this.epoch=(this.epoch||0)+1;this.cancelTimer();this.playback=p;this.lastMinute=-1;this.lastAt=0;this.anchorCache=null;this.closed=false;
  const c=this.context();if(!c)return;
  this.ready=this.restoring?Promise.resolve():this.store.inspect(this.runtime.identity,c.context.runId).then(row=>{this.sequence=row?.sequence||0;});
  p.onCheckpoint=reason=>this.request(reason);
  const resume=p.resume.bind(p);p.resume=()=>{if(this.failure||this.repairNeeded)return false;return resume();};
  this.request('initial',true);
 }
 eligible(){return !this.closed&&!this.runtime.detached&&this.playback&&!this.playback.disposed&&state.currentScreen==='MATCH'&&state.activeMatch===this.playback.match;}
 request(reason,force=false){
  if(!this.eligible()||this.playback.finished||this.failure||this.runtime.failure||this.repairNeeded)return;
  const m=this.playback.match;
  const critical=force||['pause','decision','penalty','shootout-order','second-half','hidden','navigation'].includes(reason)||m.halftimePending||m.shootoutPending||[90,105,120].includes(m.minute)||m.isFinished;
  if(!critical&&(m.minute-this.lastMinute<5||performance.now()-this.lastAt<1500))return;
  this.wanted=true;this.reason=reason;if(this.timer||this.inflight)return;
  this.timer=setTimeout(()=>{this.timer=null;this.drain().catch(e=>this.fail(e));},critical?80:150);
 }
 cancelTimer(){if(this.timer){clearTimeout(this.timer);this.timer=null;}}
 capture(){const start=performance.now(),c=this.context();if(!c)throw Error('No se encontró la campaña confirmada del partido');const checkpoint=captureMatchCheckpoint(this.playback,c.context);this.captureMs=performance.now()-start;return {checkpoint,run:c.run};}
 async anchor(run){const revision=this.runtime.bundle.revision;if(this.anchorCache?.run===run&&this.anchorCache.revision===revision)return this.anchorCache.value;const value=await this.store.anchor(this.runtime.identity,run.id,revision,run);this.anchorCache={run,revision,value};return value;}
 async persist(captured){
  await this.ready;await this.runtime.flush();this.runtime.assertOwner(captured.checkpoint.owner);
  const current=this.context();if(!current||current.context.encounterId!==captured.checkpoint.encounterId)fail('CONFLICT','El encuentro cambió antes de guardar');
  const anchor=await this.anchor(current.run);
  const job={runId:current.run.id,revision:this.runtime.bundle.revision,anchor,sequence:this.sequence,operationId:'match:'+crypto.randomUUID(),checkpoint:captured.checkpoint,repair:!!this.repairAllowed};this.failedJob=job;
  const start=performance.now(),saved=await this.store.save(this.runtime.identity,job);this.confirm(saved,start);return saved;
 }
 confirm(saved,start){this.sequence=saved.sequence;this.lastMinute=saved.minute;this.lastAt=performance.now();this.failure=null;this.failedJob=null;this.repairNeeded=false;this.repairAllowed=false;this.timings.push({captureMs:this.captureMs||0,persistMs:performance.now()-start,bytes:saved.bytes,minute:saved.minute,sequence:saved.sequence});if(this.timings.length>100)this.timings.shift();this.display();}
 async drain(){
  if(this.inflight)return this.inflight;if(!this.wanted||!this.eligible()||this.failure)return;
  this.wanted=false;this.cancelTimer();const captured=this.capture();
  const task=this.persist(captured);this.inflight=task;
  try{await task;}finally{this.inflight=null;if(this.wanted&&!this.failure){const reason=this.reason||'boundary';this.wanted=false;this.request(reason,reason!=='boundary');}}
 }
 async flush(){if(this.playback?.finished){if(this.finalizing)await this.finalizing;return;}if(!this.eligible())return;this.cancelTimer();if(this.inflight)await this.inflight;if(!this.eligible()||this.playback.finished)return;if(this.failure)throw this.failure;this.wanted=true;await this.drain();}
 finalize(p,result,apply){
  if(this.finalizing)return this.finalizing;
  this.cancelTimer();this.wanted=false;const captured=this.capture();this.pendingApply=()=>{if(this.runtime.detached||state.activeMatch!==p.match)return;if(this.applied.has(p))return;this.applied.add(p);apply();};
  const task=(async()=>{if(this.inflight)await this.inflight;await this.persist(captured);this.pendingApply();this.pendingApply=null;await this.prepare();await this.runtime.flush();})();
  this.finalizing=task;task.catch(e=>this.fail(e)).finally(()=>{if(this.playback===p&&this.applied.has(p)){this.anchorCache=null;this.failedJob=null;}this.finalizing=null;});return task;
 }
 fail(error){this.failure=error;this.cancelTimer();this.wanted=false;this.playback?.pause();this.display();}
 async retry(){
  try{if(!this.eligible()&&!this.failedJob){this.failure=null;await this.recover();return;}if(this.repairNeeded){this.repairAllowed=true;this.repairNeeded=false;}
   if(this.failedJob){const start=performance.now(),saved=await this.store.save(this.runtime.identity,this.failedJob);this.confirm(saved,start);}else{this.failure=null;await this.flush();}
   if(this.pendingApply){this.pendingApply();this.pendingApply=null;await this.prepare();await this.runtime.flush();}
  }catch(e){this.fail(e);}
 }
 async recover(){
  if(this.recovering||this.eligible()||this.closed||this.runtime.detached||!['OPPONENT','NEXT_RIVAL','REVIEW'].includes(state.currentScreen))return;
  const c=this.context();if(!c||!c.run)return;
  this.recovering=true;const epoch=this.epoch,active=state.activeMatch;
  const obsolete=()=>this.closed||this.runtime.detached||this.epoch!==epoch||state.activeMatch!==active||!'OPPONENT,NEXT_RIVAL,REVIEW'.split(',').includes(state.currentScreen);
  try{await this.runtime.flush();if(obsolete())return;const fresh=this.context();if(!fresh)return;const restored=await this.store.load(this.runtime.identity,fresh.context.runId,fresh.run);if(obsolete())return;this.sequence=restored.sequence;
   if(!restored.checkpoint)return;
   const {match,display}=restoreMatchCheckpoint(restored.checkpoint,fresh.context);
   this.repairNeeded=!!restored.damaged;this.restoring=true;this.restored=true;this.lastMinute=match.minute;this.mount(match,display);this.restoring=false;this.lastMinute=match.minute;this.display();
  }catch(e){if(!obsolete()){this.failure=e;this.display();}}finally{this.restoring=false;this.recovering=false;}
 }
 async resolveConflict(){try{const job=this.failedJob;if(!job)throw Error('No hay un checkpoint pendiente para conservar');this.runtime.assertOwner(job.checkpoint.owner);await this.runtime.repository.transaction(['metadata'],'readwrite',tx=>new Promise((resolve,reject)=>{const q=tx.objectStore('metadata').add({key:'lf3-protected:'+this.runtime.identity+':'+crypto.randomUUID(),owner:this.runtime.identity,runId:job.runId,reason:'checkpoint-conflict',pendingCheckpoint:job.checkpoint,operationId:job.operationId,baseRevision:job.revision,baseRunHash:job.anchor.runHash});q.onsuccess=()=>resolve();q.onerror=()=>reject(q.error);}));location.reload();}catch(e){this.fail(e);}}
 async usePreview(){try{const c=this.context();if(!c)return;await this.store.preserveAndUsePreview(this.runtime.identity,c.context.runId,{revision:this.runtime.bundle.revision,sequence:this.failure?.details?.sequence});this.failure=null;this.repairNeeded=false;this.lastMinute=-1;this.display();}catch(e){this.fail(e);}}
 display(){
  if(this.runtime.detached)return;const host=document.querySelector('#personal-save-status');if(!host)return;
  let node=document.querySelector('#personal-match-checkpoint');if(!node){node=document.createElement('span');node.id='personal-match-checkpoint';node.setAttribute('role','status');host.append(node);}
  const text=this.failure?'No se confirmó el checkpoint del partido: '+this.failure.message:this.repairNeeded?'Se recuperó una copia anterior válida. Confirmá antes de continuar.':this.lastMinute>=0?(this.restored?'Partido recuperado en pausa · ':'Partido guardado · ')+this.lastMinute+'′':'El partido se guardará durante el juego.';
  const play=document.querySelector('#btn-play-match');if(play)play.disabled=!!this.failure;
  if(node.dataset.message!==text){node.dataset.message=text;node.replaceChildren(document.createTextNode(text));if(this.failure||this.repairNeeded){const b=document.createElement('button');b.type='button';b.className='menu-secondary';b.textContent=this.repairNeeded?'CONTINUAR DESDE COPIA VALIDADA':'REINTENTAR CHECKPOINT';b.onclick=()=>this.retry();node.append(b);if(this.failure?.code==='CONFLICT'&&this.failedJob){const conflict=document.createElement('button');conflict.type='button';conflict.className='menu-secondary';conflict.textContent='CONSERVAR COPIA Y CARGAR GUARDADO';conflict.onclick=()=>this.resolveConflict();node.append(conflict);}if(this.failure&&!this.eligible()){const fallback=document.createElement('button');fallback.type='button';fallback.className='menu-secondary';fallback.textContent='CONSERVAR COPIA Y USAR PREVIA';fallback.onclick=()=>this.usePreview();node.append(fallback);}}}
 }
 suspend(){this.cancelTimer();this.closed=true;this.wanted=false;}
}
