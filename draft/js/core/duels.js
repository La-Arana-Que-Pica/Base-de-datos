import {sportAttribute,sportAttributeReference} from './sportAttributes.js';
import {coachFactor,coachedQuality,duelCoaching} from './coaching.js';
import {DRAFT_CONFIG as C} from '../config.js';
import {matchReferenceRating,getStaminaConsumptionFactor} from './fatigue.js';
import {coordination,bounded} from './possessionModel.js';
import {weightedPlayer} from './matchActions.js';
export const DUEL_FIELDS=['duels','duelsWon','dribblesAttempted','dribblesCompleted','tacklesAttempted','tacklesWon','keyPasses','passesAttempted','passesCompleted'];
const role=p=>p.slotPosition||p.primaryPosition;
// Verified full PES attributes, with explicit OVR fallback when the source is unavailable.
export function actionQuality(p,kind){
 const weights=C.DUELS.ATTRIBUTES[kind]||C.DUELS.ATTRIBUTES.pass;
 const attributes=Object.entries(weights).reduce((s,[k,w])=>s+sportAttribute(p,k)*w,0);
 const base=matchReferenceRating(p)+C.DUELS.ATTRIBUTE_WEIGHT*(attributes-sportAttributeReference(p));
 const energy=bounded(p.energy??100,0,100),physical=kind==='carry'||kind==='tackle'||kind==='run';
 const fatigue=1-(physical?C.DUELS.PHYSICAL_PENALTY:C.DUELS.TECHNICAL_PENALTY)*(Math.max(0,80-energy)/80)**1.3;
 // Use injury/send-off once; task-specific fatigue replaces the generic reduction.
 const availability=p.sentOff?0:p.injured?C.MATCH_EVENTS.INJURY_PERFORMANCE:1;
 const familiar=(p.naturalPositions||[p.primaryPosition]).includes(role(p));
 return bounded(base*fatigue*availability*(familiar?1:C.DUELS.UNFAMILIAR_FACTOR),0,110);
}
export function fieldPosition(p,formationId){
 if(Number.isFinite(p.slotX)&&Number.isFinite(p.slotY))return {x:p.slotX,y:p.slotY};
 const slot=C.FORMATIONS[formationId]?.slots.find(s=>s.id===p.slotId);
 const r=role(p),fallback={GK:[50,92],CB:[50,77],LB:[15,72],RB:[85,72],DMF:[50,60],CMF:[50,50],AMF:[50,35],LMF:[18,45],RMF:[82,45],LWF:[18,22],RWF:[82,22],CF:[50,15],SS:[50,25]}[r]||[50,50];
 return {x:p.slotX??slot?.x??fallback[0],y:p.slotY??slot?.y??fallback[1]};
}
export function sectorPlayers(match,isUser,lane,stage){
 const formation=isUser?match.formationId:match.rivalFormation;
 return match.players(isUser).filter(p=>role(p)!=='GK').map(p=>{const pos=fieldPosition(p,formation);const x=pos.x;return {player:p,x,y:pos.y};}).filter(p=>stage==='exit'?p.y>=55:stage==='midfield'?p.y>=30&&p.y<=65:p.y<=48);
}
export function pickActor(match,isUser,lane,stage){
 const xi=match.players(isUser).filter(p=>role(p)!=='GK'),preferred=sectorPlayers(match,isUser,lane,stage).map(x=>x.player);
 return weightedPlayer(preferred.length?preferred:xi,p=>{const {x}=fieldPosition(p,isUser?match.formationId:match.rivalFormation);return (stage==='finish'&&['CF','SS'].includes(role(p))?2:1)*(.4+Math.exp(-Math.abs(x-lane)/24))*Math.max(1,actionQuality(p,stage==='finish'?'run':stage==='progression'?'carry':'pass'))**2;},match.rng);
}
export function defensiveCover(match,isUser,attacker,lane,stage){
 const defenders=match.players(!isUser).filter(p=>role(p)!=='GK'),form=isUser?match.rivalFormation:match.formationId;
 const target=100-lane,targetY=stage==='exit'?35:stage==='midfield'?52:75;
 const ranked=defenders.map(p=>{const pos=fieldPosition(p,form);return {p,distance:Math.abs(pos.x-target)+Math.abs(pos.y-targetY)*1.3};}).sort((a,b)=>a.distance-b.distance);
 const marker=ranked[0]?.p;if(!marker)return {marker:null,helpers:[],bonus:0};
 const pressure=(isUser?match.rivalIntensity:match.userIntensity)==='HIGH',defensive=(isUser?match.rivalTactic:match.userTactic)==='DEFENSIVE';
 const trend=match.duelTrends?.[(isUser?'user:':'rival:')+attacker.id+':'+marker.id+':'+stage];
 const reinforced=trend?.attempts>=6&&trend.wins/trend.attempts>=.75;
 const helpers=ranked.slice(1,defensive||reinforced?3:2).filter(x=>x.distance<C.DUELS.COVER_RADIUS).map(x=>x.p);
 const chem=coordination(isUser?match.initialRivalChemistry:match.initialUserChemistry);
 const bonus=helpers.reduce((s,p)=>s+actionQuality(p,'tackle')/100*C.DUELS.COVER_WEIGHT,0)*chem;
 return {marker,helpers,reinforced,bonus:bonus+(pressure&&(stage==='exit'||stage==='midfield')?4*Math.min(1,(marker.energy??100)/80):0)};
}
export function duelProbability({attack,defense,base,support=0,cover=0,tactical=0}){return bounded(1/(1+Math.exp(-(Math.log(base/(1-base))+(attack-defense+support-cover+tactical)/C.DUELS.SCALE))),.08,.95);}
export function exert(match,p,isUser,kind){
 if(!p)return;const intensity=C.INTENSITIES[isUser?match.userIntensity:match.rivalIntensity]?.drain??1;
 const effort=(kind==='carry'||kind==='tackle'||kind==='run'?.12:.055)*getStaminaConsumptionFactor(p)*intensity*coachFactor(match,isUser,'fatigue',p);
 const before=p.energy;p.energy=Math.max(C.FATIGUE.MIN_ENERGY,p.energy-effort);
 const r=match.performance(p,isUser);r.effortEnergy=(r.effortEnergy||0)+(before-p.energy);
}
function tendency(match,isUser,attacker,marker,stage,won,lane){
 const key=(isUser?'user:':'rival:')+attacker.id+':'+marker.id+':'+stage;
 const t=match.duelTrends[key]||={attempts:0,wins:0,lastNarrated:-100};t.attempts++;t.wins+=won;
 if(t.attempts<5||match.minute-t.lastNarrated<20||match.minute-match.lastDuelNarration<9)return;
 if(t.wins/t.attempts<.75&&t.wins/t.attempts>.25)return;
 t.lastNarrated=match.minute;match.lastDuelNarration=match.minute;
 const dominant=t.wins/t.attempts>=.75;
 match.logEvent({minute:match.minute,type:'duel-trend',presentationOnly:true,team:isUser?'user':'rival',playerId:dominant?attacker.id:marker.id,text:dominant?attacker.name+' está imponiéndose a '+marker.name+(lane!==50?' por la banda.':' en la circulación.')+(match.performance(attacker,isUser).benchEntries&&(attacker.energy??100)>(marker.energy??100)+12?' Su frescura marca la diferencia.':''):marker.name+' está neutralizando los intentos de '+attacker.name+'.'});
}
export function resolveDuel(match,isUser,attacker,lane,stage,{transition=false,space=0,ratings=null}={}){
 const cover=defensiveCover(match,isUser,attacker,lane,stage),marker=cover.marker;if(!marker)return {won:true,margin:20,space:0};
 const kind=stage==='progression'&&lane!==50?'carry':stage==='finish'?'run':'pass',defKind=kind==='pass'?'intercept':'tackle';
 const own=match.players(isUser).filter(p=>p.id!==attacker.id&&role(p)!=='GK'),form=isUser?match.formationId:match.rivalFormation;
 const helpers=own.filter(p=>Math.abs(fieldPosition(p,form).x-lane)<30&&Math.abs(fieldPosition(p,form).y-fieldPosition(attacker,form).y)<30);
 const support=Math.min(6,helpers.length*1.3)*coordination(isUser?match.initialUserChemistry:match.initialRivalChemistry);
 const powers=ratings||match.getEffectiveRatings(),ownPower=isUser?powers.user:powers.rival,theirPower=isUser?powers.rival:powers.user;
 const tactical=((isUser?match.userTactic:match.rivalTactic)==='OFFENSIVE'?2:0)+((isUser?match.rivalTactic:match.userTactic)==='DEFENSIVE'?-3:0)+(transition?5:0)+(transition&&(isUser?match.rivalIntensity:match.userIntensity)==='HIGH'?4:0)+space;
 const effects=duelCoaching(match,isUser,stage,lane,transition);
 // Without the super-sub flag the second quality calculation is identical.
 // Avoid cloning full player attributes and recomputing it in every NPC duel.
 const attackQuality=actionQuality(attacker,kind),defenseQuality=actionQuality(marker,defKind);
 const attack=(coachedQuality(match,isUser,attacker,attackQuality,attacker.superSubActive?actionQuality({...attacker,superSubActive:false},kind):attackQuality)*.8+(stage==='exit'?ownPower.def:stage==='midfield'?ownPower.mid:ownPower.att)*.2)*effects.attack;
 const defense=(coachedQuality(match,!isUser,marker,defenseQuality,marker.superSubActive?actionQuality({...marker,superSubActive:false},defKind):defenseQuality)*.8+(stage==='exit'?theirPower.att:stage==='midfield'?theirPower.mid:theirPower.def)*.2)*effects.defense;
 const probability=duelProbability({attack,defense,base:C.DUELS.STAGE_BASE[stage],support,cover:cover.bonus,tactical});
 match.credit(attacker,isUser,'duels',{},false);match.credit(marker,!isUser,'duels',{},false);exert(match,attacker,isUser,kind);exert(match,marker,!isUser,'tackle');cover.helpers.forEach(p=>exert(match,p,!isUser,'run'));
 const won=match.rng()<probability;
 match.credit(won?attacker:marker,won?isUser:!isUser,'duelsWon',{},false);
 const details={stage,lane,attackerId:attacker.id,defenderId:marker.id,attackingWon:won,probability,support,coverIds:cover.helpers.map(p=>p.id),cover:cover.bonus,reinforced:cover.reinforced,attackQuality:attack,defenseQuality:defense};
 const actionId=match.recordAction('duel',isUser,attacker,details);
 if(kind==='carry'){match.credit(attacker,isUser,'dribblesAttempted',{},false);if(won)match.credit(attacker,isUser,'dribblesCompleted',{},false);}
 if(kind==='pass'){match.credit(attacker,isUser,'passesAttempted',{},false);if(won)match.credit(attacker,isUser,'passesCompleted',{},false);}
 else {match.credit(marker,!isUser,'tacklesAttempted',{},false);if(!won)match.credit(marker,!isUser,'tacklesWon',{},false);}
 tendency(match,isUser,attacker,marker,stage,won,lane);
 // A whistle interrupts this possession; the existing set-piece/card/injury resolver owns it.
 const pressure=(isUser?match.rivalIntensity:match.userIntensity)==='HIGH';
 if(match.rng()<C.DUELS.FOUL_RATE*(pressure?1.25:1)*(1+Math.max(0,60-(marker.energy??100))/150)){
  match.resolveFoul({committingUser:!isUser,offender:marker,victim:attacker,zone:stage==='finish'&&match.rng()<.06?'penalty':stage==='finish'||stage==='progression'?(match.rng()<.35?'direct':'dangerous'):'normal'});return {stopped:true,won,actionId};
 }
 if(!won){match.credit(attacker,isUser,'losses',{duelId:actionId});match.credit(marker,!isUser,kind==='pass'?'interceptions':'recoveries',{duelId:actionId});if(kind==='pass')match.credit(marker,!isUser,'recoveries',{},false);match.possessionOwner=!isUser;match.transitionTeam=!isUser;
  if(stage==='finish')match.credit(marker,!isUser,'clearances',{},false);
 }
 return {won,actionId,margin:attack-defense,space:cover.helpers.length?cover.helpers.length*1.5:0,marker};
}
export function playPossession(match,isUser,ratings){
 const transition=match.transitionTeam===isUser;match.transitionTeam=null;
 const xi=match.players(isUser),lanes=[18,50,82];
 let lane=weightedPlayer(lanes.map(x=>({x})),l=>1+xi.filter(p=>Math.abs(fieldPosition(p,isUser?match.formationId:match.rivalFormation).x-l.x)<20&&fieldPosition(p,isUser?match.formationId:match.rivalFormation).y<50).length*.45,match.rng)?.x??50;
 let builder=pickActor(match,isUser,lane,'exit');if(!builder)return;
 match.performance(builder,isUser).possessionTouches++;
 match.recordAction('possession',isUser,builder,{lane,transition});
 // Patient circulation retains the ball but cannot manufacture a shot.
 if(match.rng()<C.DUELS.CIRCULATION_RATE+((isUser?match.userIntensity:match.rivalIntensity)==='LOW'?.10:0)) {match.recordAction('circulation',isUser,builder,{lane});return;}
 let space=0,margin=0,lastPasser=null;
 for(const stage of ['exit','midfield','progression','finish']){
  const actor=stage==='exit'?builder:pickActor(match,isUser,lane,stage);if(!actor)return;
  const result=resolveDuel(match,isUser,actor,lane,stage,{transition,space,ratings});if(result.stopped||!result.won)return;
  margin+=result.margin;space=0;builder=actor;
  if(stage==='exit'||stage==='midfield')match.credit(actor,isUser,'constructions',{stage,duelId:result.actionId});
  if(stage!=='finish')lastPasser=actor;
  if(stage==='progression'&&lane!==50&&result.space&&match.rng()<.25){space=result.space;match.recordAction('switch-play',isUser,actor,{fromLane:lane,toLane:100-lane,coverDrawn:space});lane=100-lane;}
 }
 const shooter=builder,creator=lastPasser?.id!==shooter.id?lastPasser:null;
 match.resolveAttack(isUser,ratings,{shooter,builder:creator,assist:creator,kind:'open-play',lane,transition,clearProbability:bounded(.20+margin*.00125+(transition?.06:0),.08,.50)});
}
