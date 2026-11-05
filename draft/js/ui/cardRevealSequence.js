// The formation reveal's original state machine, shared by all three stages.
// Presentation only: never generate candidates or mutate the offer.
export const REVEAL_INITIAL_MS=350,REVEAL_ANIMATION_MS=450,REVEAL_PAUSE_MS=200;
export function createCardRevealSequence({paint,cards,motionScale=()=>1}){
 const sessions=new WeakMap(),panelSessions=new WeakMap();let active=null,timer=null,generation=0,frames=[];
 function cancel(){
  if(active&&Number.isFinite(active.session.deadline))active.session.remaining=Math.max(0,active.session.deadline-Date.now());
  generation++;for(const id of frames)globalThis.cancelAnimationFrame?.(id);frames=[];if(timer!==null)clearTimeout(timer);timer=null;active=null;
 }
 function schedule(s,ms){s.deadline=Date.now()+ms;s.remaining=ms;arm();}
 function arm(){const token=generation,s=active.session;timer=setTimeout(()=>{
  timer=null;if(token!==generation||!active)return;const total=cards(active.panel).length;
  if(s.step==='waiting'){s.phase='revealing';s.step='turning';paint(active.panel,s);schedule(s,REVEAL_ANIMATION_MS/2*s.scale);}
  else if(s.step==='turning'){s.count++;s.step='finishing';paint(active.panel,s);schedule(s,REVEAL_ANIMATION_MS/2*s.scale);}
  else if(s.step==='finishing'){if(s.count===total){s.phase='completed';s.step='done';paint(active.panel,s);active=null;}else{s.step='waiting';paint(active.panel,s);schedule(s,REVEAL_PAUSE_MS*s.scale);}}
 },Math.max(0,s.deadline-Date.now()));}
 function start(panel,offer,reducedMotion=false){
  if(!panel||active?.panel===panel)return;cancel();const key=offer||panel;let s=sessions.get(key);
  if(!s){s={phase:'idle',step:'waiting',count:0,reducedMotion:!!reducedMotion,scale:motionScale(),remaining:REVEAL_INITIAL_MS*motionScale()};sessions.set(key,s);}
  s.reducedMotion=!!reducedMotion;panelSessions.set(panel,s);active={panel,session:s};
  if(reducedMotion||!cards(panel).length){skip();return;}paint(panel,s);if(s.phase==='completed'){active=null;return;}
  if(s.phase==='idle'&&typeof globalThis.requestAnimationFrame==='function'){const token=generation;frames.push(requestAnimationFrame(()=>{if(token!==generation||!active)return;frames.push(requestAnimationFrame(()=>{frames=[];if(token===generation&&active)schedule(s,s.remaining);}));}));}
  else schedule(s,s.remaining);
 }
 function skip(panel=active?.panel){
  if(!panel||active&&active.panel!==panel)return false;const s=active?.session||panelSessions.get(panel);if(!s)return false;
  s.count=cards(panel).length;s.phase='completed';s.step='done';cancel();paint(panel,s);return true;
 }
 function refresh(panel,offer,reduced,replayOmitted=false){
  const key=offer||panel,s=sessions.get(key);if(!s){start(panel,offer,reduced);return;}
  if(reduced){s.reducedMotion=true;if(active?.panel===panel)skip();else{s.count=cards(panel).length;s.phase='completed';s.step='done';paint(panel,s);}return;}
  if(s.reducedMotion&&replayOmitted){cancel();sessions.delete(key);start(panel,offer,false);return;}
  s.reducedMotion=false;const scale=motionScale();if(s.scale===scale)return;
  const remaining=(active?.panel===panel?Math.max(0,s.deadline-Date.now()):s.remaining)*scale/s.scale;s.scale=scale;
  paint(panel,s);if(active?.panel===panel){if(timer!==null)clearTimeout(timer);schedule(s,remaining);}else s.remaining=remaining;
 }
 return {start,cancel,skip,refresh};
}
