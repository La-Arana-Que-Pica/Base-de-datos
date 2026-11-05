import {groupPresentations,eventSequence,EVENT_PRESENTATION_TIMING} from './eventPresentation.js?v=event-sync-2';
import { DRAFT_CONFIG as config } from '../config.js';
import { kickDescriptor, shootoutContext, presentationOutcome, phaseNarrative, revealNarrative } from './shootoutPresentation.js';

const VIEW_FIELDS=['initialForecast','coaches','captains','leadershipEnabled','pregameOverall','entryMinutes','coachTelemetry','minute','userScore','rivalScore','userTeamName','rivalTeamName','rivalCrest','formationId','rivalFormation','userTactic','rivalTactic','userIntensity','rivalIntensity','setPieces','specialists','userChemistry','rivalChemistry','initialUserChemistry','initialRivalChemistry','userStarters','userBench','userSentOff','rivalStarters','rivalBench','rivalSentOff','playerPerformance','rivalPerformance','stats','events','extraTime','penalties','substitutionsUsed','substitutionWindowsUsed','substitutionWindowOpen','halftimePending','halftimeCompleted','shootoutPending','departedIds','isFinished','isPaused'];
export function captureMatchView(match,clone=structuredClone) {
 const view=Object.create(Object.getPrototypeOf(match));
 view.recentActions=clone(match.actions?.slice(-12)||match.recentActions||[]);
 for(const key of VIEW_FIELDS)view[key]=clone(match[key]);
 for(const key of ['rivalSubstitutionsUsed','rivalSubstitutionWindowsUsed','rivalSubstitutionWindowOpen','rivalDepartedIds'])view[key]=clone(match[key]);
 return view;
}
const defaultScheduler={now:()=>performance.now(),set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)};

// Owns waiting and presentation only. Every sporting minute is computed exactly once by MatchEngine.tick.
export class MatchPlayback {
 constructor(match,{onView=match.onTick,onEvent=match.onEvent,onFinish=match.onFinish,onSuspense=null,onControls=null,onShootout=null,scheduler=defaultScheduler,reducedMotion=false,manualShootout=false,diagnostic=null,onCheckpoint=null}={}) {
  this.match=match;this.onView=onView;this.onEvent=onEvent;this.onFinish=onFinish;this.onSuspense=onSuspense;this.onControls=onControls;this.onShootout=onShootout;this.shootout=null;this.shootoutHistory=[];this.shootoutBuildView=null;
  this.scheduler=scheduler;this.reducedMotion=reducedMotion;this.simpleAnimations=false;this.speed=1;this.paused=true;this.disposed=false;this.finished=false;this.halftimeReady=!!(match.authoritative&&match.halftimePending);this.shootoutReady=!!(match.authoritative&&match.shootoutPending);
  this.onCheckpoint=onCheckpoint;this.diagnostic=diagnostic;this.eventCounter=0;this.activePresentation=null;
  this.queue=[];this.wait=null;this.timer=null;this.generation=0;this.suspense=null;this.skipRequested=false;this.lastChanceMinute=-Infinity;
  this.decisionJournal=[];this.view=captureMatchView(match);this.view.isPaused=true;
  this.originalCallbacks={onTick:match.onTick,onEvent:match.onEvent,onFinish:match.onFinish};
  match.stopTimer();match.playback=this;match.isPaused=true;match.requiresHalftimeConfirmation=true;match.requiresShootoutSelection=manualShootout;
  match.onTick=()=>{};
  match.onEvent=(event)=>{const entry={event,id:++this.eventCounter,view:captureMatchView(match)};this.trace('event-generated',{eventId:entry.id,type:event.type,minute:event.minute});if(this.capturing)this.captured.push(entry);else if(this.queue.length||this.activePresentation||this.wait?.kind==='scene'||this.wait?.kind==='suspense'){this.queue.push({kind:'event',...entry});}else{this._publish(entry.view);this.onEvent?.(event,this.view);}};
  match.onFinish=result=>{this.pendingResult=result;};
 }
 trace(action,data={}){if(typeof this.diagnostic==='function')try{this.diagnostic({at:this.scheduler.now(),action,presentationId:this.activePresentation?.id,minute:this.match.minute,paused:this.paused,speed:this.speed,queueLength:this.queue.length,timerActive:this.timer!==null,...data});}catch{/* Diagnostics must never interrupt sporting or presentation flow. */}}
 setDiagnostic(listener){this.diagnostic=typeof listener==='function'?listener:null;}
 _setScene(scene){
  if(!this.activePresentation){this.activePresentation={id:scene.presentationId,type:scene.kind,minute:scene.minute,startedAt:this.scheduler.now()};this.trace('presentation-start',{type:scene.kind});}
  this.suspense=scene;this.trace('phase-start',{phase:scene.phase,expectedMs:scene.delay});this.onSuspense?.(scene);this._controls();
 }
 _endPresentation(reason){if(this.activePresentation)this.trace('presentation-end',{reason,actualWallMs:this.scheduler.now()-this.activePresentation.startedAt});this.activePresentation=null;}
 get hasPendingAction(){return !!this.suspense;}
 checkpoint(reason){this.onCheckpoint?.(reason,this);}
 restoreCheckpoint(data){
  this._cancel();this.wait=null;this.queue=[];Object.assign(this,data);this.finished=false;this.disposed=false;this.paused=true;this.match.isPaused=true;this.view.isPaused=true;this.visibleFrame??=this.view;this.activePresentation=null;this.capturing=false;this.captured=[];this._controls();return this;
 }
 _controls(){this.onControls?.(this);}
 _publish(view) {
  // Decisions made while a precomputed action is hidden affect the live XI, not its already determined outcome.
  for(const d of this.decisionJournal){
   if(d.type==='intensity'){view.userIntensity=d.intensity;continue;}
   if(d.type==='setPieces'){view.setPieces.user=structuredClone(d.settings);continue;}
   if(d.type==='tactic'){view.userTactic=d.tactic;continue;}
   const outIndex=view.userStarters.findIndex(p=>p.id===d.outId),inIndex=view.userBench.findIndex(p=>p.id===d.inId);
   if(outIndex<0||inIndex<0)continue;
   const out=view.userStarters[outIndex],incoming=view.userBench.splice(inIndex,1)[0];
   view.userStarters[outIndex]={...incoming,slotId:out.slotId,slotPosition:out.slotPosition,superSubActive:d.superSubActive,matchChemistry:d.matchChemistry};
   view.userBench.push({...out,slotId:incoming.slotId,substitutedOut:true});view.departedIds.add(out.id);view.substitutionsUsed++;
   view.playerPerformance[incoming.id] ||= {id:incoming.id,name:incoming.name,minutes:0,rating:config.PLAYER_RATING.BASE,goals:0,assists:0,benchEntries:1};
  }
  view.isPaused=this.paused;this.view=view;const renderStart=performance.now();this.onView?.(view);this.trace('public-view-render',{cpuMs:performance.now()-renderStart});
 }
 _cancel(){
  if(this.timer!==null){this.scheduler.clear(this.timer);this.timer=null;
   if(this.wait){const elapsed=this.scheduler.now()-this.scheduledAt;this.wait.elapsedActive+=elapsed;this.wait.remaining=Math.max(0,this.wait.remaining-elapsed*this._presentationRate());}
  }
  this.generation++;
 }
 _presentationRate(){return this.wait?.kind==='shootout'?Math.min(this.speed,this.reducedMotion?1:2):this.speed;}
 _schedule(){
  if(this.disposed||this.paused||!this.wait||this.timer!==null)return;
  const token=this.generation;this.scheduledAt=this.scheduler.now();
  this.timer=this.scheduler.set(()=>{if(token!==this.generation||this.disposed||this.paused)return;this.timer=null;const task=this.wait;if(!task)return;this.wait=null;this.trace('timer-completed',{kind:task.kind,phase:this.suspense?.phase,expectedMs:task.duration,actualActiveMs:task.elapsedActive+this.scheduler.now()-this.scheduledAt,actualWallMs:this.scheduler.now()-task.startedAt});task.action();},this.wait.remaining/this._presentationRate());
 }
 _wait(ms,action,kind='minute'){if(this.timer!==null){this.trace('timer-replaced',{reason:'explicit replacement'});this._cancel();}this.wait={remaining:ms,duration:ms,elapsedActive:0,startedAt:this.scheduler.now(),action,kind};this._schedule();}
 pause(){if(this.disposed||this.paused)return;if(this.match.authoritative)this.match.setRemotePause(true).catch(e=>this.remoteFailure(e));this._cancel();this.paused=true;this.match.isPaused=true;this.view.isPaused=true;this.trace('paused');this._controls();this.checkpoint('pause');}
 resume(){
  if(this.disposed||this.finished||!this.paused||this.halftimeReady||this.shootoutReady)return false;
  this.paused=false;this.match.isPaused=false;this.view.isPaused=false;if(this.match.authoritative)this.match.setRemotePause(false).catch(e=>this.remoteFailure(e));this.trace('resumed');
  if(this.skipRequested&&['suspense','shootout'].includes(this.wait?.kind))this.wait.remaining=0;
  if(this.wait)this._schedule();else if(this.queue.length||this.pendingResult)this._drain();else this._wait(config.SIMULATION_TICK_MS,()=>this._advance());
  this._controls();
  return true;
 }
 continueSecondHalf(){
  if(this.match.authoritative)return this.remoteSecondHalf();
  if(this.disposed||!this.halftimeReady||!this.match.continueSecondHalf())return false;
  this.halftimeReady=false;this.checkpoint('second-half');
  this._publish(captureMatchView(this.match));
  return this.resume();
 }
 setSpeed(speed){
  speed=Number(speed);if(!config.PLAYBACK.SPEEDS.includes(speed))return false;
  this._cancel();this.speed=speed;this.trace('speed-changed');this._schedule();this._controls();return true;
 }
 skip(){
  if(!this.suspense)return false;
  if(this.suspense.kind!=='shootout'&&this.wait?.kind==='scene'){
   this._cancel();this.wait=null;
   if(this.suspense.phase==='reveal'){
    this.trace('skip-requested');this._wait(0,()=>{this._endPresentation('skipped');this._drain();},'scene');return true;
   }
   this.trace('skip-requested');const id=this.suspense.presentationId;let entry;while(this.queue.length&&this.queue[0].presentationId===id){entry=this.queue.shift();if(entry.kind==='scene-result')break;}
   if(entry?.kind==='scene-result')this._revealGroup(entry);
   // Explicit skip can reveal while paused, but never resumes sporting time.
   this.skipRequested=false;
   this._wait(0,()=>{this._endPresentation('skipped');this._drain();},'scene');
   return true;
  }
  this.skipRequested=true;
  if(!this.paused&&['suspense','shootout'].includes(this.wait?.kind)){this._cancel();this.wait.remaining=0;this._schedule();}
  this._controls();return true;
 }
 setIntensity(intensity){if(this.match.authoritative)return this.match.setIntensity(intensity).then(ok=>{if(this.queue.length||this.suspense)this.decisionJournal.push({type:'intensity',intensity});this.refreshDecisions();return ok;}).catch(e=>{this.remoteFailure(e);return false;});if(!this.match.setIntensity(intensity))return false;if(this.queue.length||this.suspense)this.decisionJournal.push({type:'intensity',intensity});this.refreshDecisions();return true;}
 configureSetPieces(settings){if(this.match.authoritative)return this.match.configureSetPieces(settings).then(ok=>{if(this.queue.length||this.suspense)this.decisionJournal.push({type:'setPieces',settings:structuredClone(this.match.setPieces.user)});this.refreshDecisions();return ok;}).catch(e=>{this.remoteFailure(e);return false;});if(!this.match.configureSetPieces(settings))return false;if(this.queue.length||this.suspense)this.decisionJournal.push({type:'setPieces',settings:structuredClone(this.match.setPieces.user)});this.refreshDecisions();return true;}
 setTactic(tactic){if(this.match.authoritative)return this.match.setTactic(tactic).then(ok=>{if(this.queue.length||this.suspense)this.decisionJournal.push({type:'tactic',tactic});this.refreshDecisions();return ok;}).catch(e=>{this.remoteFailure(e);return false;});if(this.match.isFinished||this.match.shootoutPending)return false;this.match.setTactic(tactic);if(this.queue.length||this.suspense)this.decisionJournal.push({type:'tactic',tactic});this.refreshDecisions();}
 substitute(outId,inId){
  const result=this.match.substitute(outId,inId);
  if(result.success){if(this.queue.length||this.suspense)this.decisionJournal.push({type:'sub',outId:result.playerOut.id,inId:result.playerIn.id,superSubActive:this.match.userStarters.find(p=>p.id===result.playerIn.id)?.superSubActive,matchChemistry:this.match.userStarters.find(p=>p.id===result.playerIn.id)?.matchChemistry});this.refreshDecisions();}
  return result;
 }
 async remoteSubstitutions(pairs){await this.match.substituteBatch(pairs);if(this.queue.length||this.suspense)for(const p of pairs){const incoming=this.match.userStarters.find(v=>v.id===p.in);if(incoming)this.decisionJournal.push({type:'sub',outId:p.out,inId:p.in,superSubActive:incoming.superSubActive,matchChemistry:incoming.matchChemistry});}this.refreshDecisions();return true;}
 refreshDecisions(){
  if(this.queue.length||this.suspense){this._publish(captureMatchView(this.visibleFrame));}
  else this._publish(captureMatchView(this.match));
  this._controls();this.checkpoint('decision');
 }
 confirmShootoutOrder(ids){
  if(this.match.authoritative)return this.remoteShootout(ids);
  if(this.disposed||!this.shootoutReady)return false;
  this.captured=[];this.capturing=true;
  const success=this.match.confirmShootoutOrder(ids);this.capturing=false;
  if(!success)return false;
  this.shootoutReady=false;this.paused=false;this.match.isPaused=false;
  for(const entry of this.captured)this._enqueue(entry);this.captured=[];
  this._drain();this.checkpoint('shootout-order');return true;
 }
 remoteSecondHalf(){if(this.halfContinuation)return this.halfContinuation;const task=this._remoteSecondHalf();this.halfContinuation=task;task.finally(()=>{if(this.halfContinuation===task){this.halfContinuation=null;this._controls();}});return task;}
 async _remoteSecondHalf(){try{if(this.disposed||!this.halftimeReady||!await this.match.continueSecondHalf())return false;this.halftimeReady=false;this._publish(captureMatchView(this.match));return this.resume();}catch(e){this.remoteFailure(e);return false;}}
 async remoteShootout(ids){try{if(this.disposed||!this.shootoutReady)return false;this.captured=[];this.capturing=true;const ok=await this.match.confirmShootoutOrder(ids);this.capturing=false;if(!ok)return false;this.shootoutReady=false;this.paused=false;this.match.isPaused=false;for(const entry of this.captured)this._enqueue(entry);this.captured=[];this._drain();return true;}catch(e){this.capturing=false;this.remoteFailure(e);return false;}}
 remoteFailure(error){this._cancel();this.paused=true;this.view.isPaused=true;this.match.onRemoteError?.(error);this._controls();}
 async _advance(){
  if(this.advancing||this.paused||this.disposed||this.match.isFinished||this.match.shootoutPending||this.activePresentation||this.queue.length)return;
  this.decisionJournal=[];this.visibleFrame=captureMatchView(this.view);this.captured=[];this.capturing=true;
  this.trace('minute-start');const computeStart=performance.now();try{this.advancing=true;if(this.match.authoritative)await this.match.advance();else this.match.tick();}catch(error){this.capturing=false;this.remoteFailure(error);return;}finally{this.advancing=false;}if(this.disposed)return;this.capturing=false;this.trace('minute-computed',{cpuMs:performance.now()-computeStart});
  this.frame=captureMatchView(this.match);this.visibleFrame.minute=this.match.minute;
  this._publish(captureMatchView(this.visibleFrame));
  let before=this.visibleFrame;
  for(const group of groupPresentations(this.captured)){this._enqueueGroup(group,before);before=group.at(-1).view;}
  this.captured=[];
  this._drain();
 }
 setSimpleAnimations(value){this.simpleAnimations=!!value;this._controls();}
 _enqueueGroup(group,before) {
  const seq=eventSequence(group,before,{reduced:this.reducedMotion,simple:this.simpleAnimations});
  if(!seq){for(const entry of group){if(entry.event.type==='opportunity')continue;this._enqueue(entry);}return;}
  this.narrativeHistory ||= new Map();
  const previous=this.narrativeHistory.get(seq.result.kind);
  if(previous===seq.result.label){
   seq.result.label=seq.result.label.includes('¡¡¡GOOOOOOL!!!')?seq.result.label.replace('¡¡¡GOOOOOOL!!!','¡LA MANDÓ A GUARDAR!'):seq.result.label.includes('¡LA MANDÓ A GUARDAR!')?seq.result.label.replace('¡LA MANDÓ A GUARDAR!','¡¡¡GOOOOOOL!!!'):seq.result.label.includes('¡QUÉ ATAJADA!')?seq.result.label.replace('¡QUÉ ATAJADA!','¡SE LO NEGÓ EL ARQUERO!'):seq.result.label.includes('¡SE LO NEGÓ EL ARQUERO!')?seq.result.label.replace('¡SE LO NEGÓ EL ARQUERO!','¡QUÉ ATAJADA!'):seq.result.label.includes('¡SE FUE AFUERA!')?seq.result.label.replace('¡SE FUE AFUERA!','¡REMATE DESVIADO!'):seq.result.label.replace('¡REMATE DESVIADO!','¡SE FUE AFUERA!');
  }
  this.narrativeHistory.set(seq.result.kind,seq.result.label);
  const presentationId=group.at(-1).id;seq.stages=seq.stages.map(stage=>({...stage,presentationId,animationMs:EVENT_PRESENTATION_TIMING.ENTRY}));seq.result={...seq.result,presentationId};this.trace('presentation-queued',{presentationId,type:seq.result.kind,minute:seq.result.minute});
  this.queue.push(...seq.stages.map(stage=>({kind:'scene-stage',presentationId,stage})),{kind:'scene-result',presentationId,group,scene:seq.result});
 }
 _revealGroup(entry) {
  this.visibleFrame=captureMatchView(entry.group.at(-1).view);
  this._publish(captureMatchView(this.visibleFrame));
  for(const item of entry.group)if(!item.event.presentationOnly)this.onEvent?.(item.event,this.view);
  this._setScene(entry.scene);
 }
 _showShootout(scene) {
  this.shootout=scene;this.suspense={kind:'shootout',label:scene.headline};
  this.onShootout?.(structuredClone(scene));this._controls();
 }
 _enqueue(entry){
  if(entry.event.type==='penalty-kick'){
   const kick=kickDescriptor(entry.event,entry.view,this.shootoutBuildView||this.view);
   this.shootoutBuildView=entry.view;
   for(const phase of this.reducedMotion?['prepare']:['prepare','runup','strike'])this.queue.push({kind:'shootout-stage',phase,kick});
   this.queue.push({kind:'shootout-result',...entry,kick},{kind:'shootout-reveal',...entry,kick},{kind:'shootout-gap'});return;
  }
  if(entry.event.type==='penalties'&&this.shootoutBuildView){this.queue.push({kind:'shootout-final',...entry});return;}

  if(entry.event.type!=='opportunity')this.queue.push({kind:'event',...entry});
 }
 _drain(){
  if(this.paused||this.disposed||this.wait)return;
  while(this.queue.length&&!this.paused){
   const entry=this.queue.shift();
   if(entry.kind==='scene-stage') {
    this._setScene(entry.stage);
    this._wait(entry.stage.delay,()=>this._drain(),'scene');return;
   }
   if(entry.kind==='scene-result') {
    this._revealGroup(entry);
    this._wait(entry.scene.delay,()=>{this._endPresentation('completed');this._drain();},'scene');return;
   }
   if(entry.kind==='shootout-stage'){
    if(entry.phase==='prepare')this.skipRequested=false;
    if(this.skipRequested)continue;
    const c=config.PLAYBACK.SHOOTOUT,delay=this.reducedMotion?c.REDUCED_MS:c[entry.phase.toUpperCase()+'_MS'];
    this._showShootout({phase:entry.phase,kick:entry.kick,context:shootoutContext(this.shootoutHistory,entry.kick),history:structuredClone(this.shootoutHistory),headline:phaseNarrative(entry.phase,entry.kick,this.match.seed),duration:delay,reducedMotion:this.reducedMotion});
    this._wait(delay,()=>this._drain(),'shootout');return;
   }
   if(entry.kind==='shootout-result'){
    if(this.skipRequested)continue;
    const context=shootoutContext(this.shootoutHistory,entry.kick),scored=entry.event.text.includes('✅'),outcome=presentationOutcome({...entry.kick,scored},this.match.seed);
    const delay=this.reducedMotion?config.PLAYBACK.SHOOTOUT.REDUCED_MS:config.PLAYBACK.SHOOTOUT.RESULT_MS;
    this._showShootout({phase:'result',kick:entry.kick,context,history:structuredClone(this.shootoutHistory),headline:outcome==='goal'?'¡GOOOOOOL!':outcome==='save'?'¡ATAJÓ EL ARQUERO!':outcome==='post'?'¡AL PALO!':'¡AFUERA!',outcome,duration:delay,reducedMotion:this.reducedMotion});
    this._wait(delay,()=>this._drain(),'shootout');return;
   }
   if(entry.kind==='shootout-gap'){
    if(this.skipRequested)continue;
    const delay=this.reducedMotion?config.PLAYBACK.SHOOTOUT.REDUCED_GAP_MS:config.PLAYBACK.SHOOTOUT.GAP_MS;
    this._showShootout({...this.shootout,phase:'interval',headline:'Marcador actualizado · Próximo lanzamiento',duration:delay});
    this._wait(delay,()=>this._drain(),'shootout');return;
   }
   if(entry.kind==='shootout-reveal'){
    const context=shootoutContext(this.shootoutHistory,entry.kick),scored=entry.event.text.includes('✅');
    const record={...entry.kick,scored,outcome:presentationOutcome({...entry.kick,scored},this.match.seed)};
    this.shootoutHistory.push(record);
    const headline=revealNarrative(record,context,this.shootoutHistory);
    this._publish(entry.view);this.onEvent?.({...entry.event,round:record.round,text:headline},this.view);
    const delay=this.skipRequested?0:this.reducedMotion?config.PLAYBACK.SHOOTOUT.REDUCED_REVEAL_MS:config.PLAYBACK.SHOOTOUT.REVEAL_MS;
    this.checkpoint('penalty');
    this._showShootout({phase:'reveal',kick:entry.kick,context,history:structuredClone(this.shootoutHistory),headline,outcome:record.outcome,duration:delay,reducedMotion:this.reducedMotion});
    this._wait(delay,()=>this._drain(),'shootout');return;
   }
   if(entry.kind==='shootout-final'){
    this.skipRequested=false;this._publish(entry.view);this.onEvent?.(entry.event,this.view);
    const delay=this.reducedMotion?config.PLAYBACK.SHOOTOUT.REDUCED_MS:config.PLAYBACK.SHOOTOUT.FINAL_MS;
    this._showShootout({...this.shootout,phase:'final',headline:'Tanda terminada',duration:delay});
    this._wait(delay,()=>this._drain(),'shootout');return;
   }
   if(entry.kind==='suspense'){

    if(this.skipRequested)continue;
    this.suspense=entry.stage;this.onSuspense?.(this.suspense);this._controls();
    this._wait(entry.stage.delay,()=>this._drain(),'suspense');return;
   }
   this.skipRequested=false;
   this.visibleFrame=captureMatchView(entry.view);this._publish(entry.view);this.onEvent?.(entry.event,this.view);
  }
  if(this.paused||this.disposed)return;
  this.suspense=null;this.skipRequested=false;this.onSuspense?.(null);
  this.decisionJournal=[];this._publish(captureMatchView(this.match));this._controls();this.checkpoint('boundary');
  if(this.match.halftimePending){
   this.paused=true;this.match.isPaused=true;this.halftimeReady=true;
   this._publish(captureMatchView(this.match));this._controls();return;
  }
  if(this.match.shootoutPending){
   this.paused=true;this.match.isPaused=true;this.shootoutReady=true;
   this._publish(captureMatchView(this.match));this._controls();return;
  }
  if(this.pendingResult){this.finished=true;this.captured=[];this.frame=null;this.visibleFrame=this.view;this.shootoutBuildView=null;this._controls();this.onFinish?.(this.pendingResult,this.match);this.pendingResult=null;}
  else this._wait(config.SIMULATION_TICK_MS,()=>this._advance());
 }
 dispose(){
  if(this.disposed)return;this._endPresentation('disposed');this.trace('disposed');this._cancel();this.disposed=true;this.paused=true;this.match.isPaused=true;
  this.queue=[];this.captured=[];this.frame=null;this.visibleFrame=null;this.shootoutBuildView=null;this.wait=null;this.suspense=null;this.pendingResult=null;this.shootout=null;this.onShootout?.(null);this.onSuspense?.(null);
  Object.assign(this.match,this.originalCallbacks);if(this.match.playback===this)this.match.playback=null;
 }
}
