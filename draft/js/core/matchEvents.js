import {activeCaptain} from './leadership.js';
import {coachFactor} from './coaching.js';
import {possessionPowers} from './possessionModel.js';
import {setPieceTaker,resolveSetPieceCross} from './setPieces.js';
import { DRAFT_CONFIG as config } from '../config.js';
import { selectShooter,selectAssistProvider,selectDefender,selectFreeKickTaker,selectPenaltyTaker,inMatchPenaltyProbability,directFreeKickProbabilities,injuryProbability,weightedPlayer } from './matchActions.js';
import { isGoalkeeper } from './fatigue.js';
const c=config.MATCH_EVENTS;
export function attackContext(match,isUser,shooter) {
 const xi=match.players(isUser);
 if(match.rng()<c.ASSIST_RATE) {
  const assist=selectAssistProvider(xi,shooter,match.rng);
  if(assist)return {assist,kind:'assisted'};
 }
 const roll=match.rng();
 if(roll<c.NO_ASSIST_TYPES.INDIVIDUAL)return {kind:'individual'};
 if(roll<c.NO_ASSIST_TYPES.INDIVIDUAL+c.NO_ASSIST_TYPES.REBOUND)return {kind:'rebound'};
 return {kind:'error',errorPlayer:selectDefender(match.players(!isUser),match.rng)};
}
export function injurePlayer(match,player,isUser) {
 player=match.players(isUser).find(p=>p.id===player?.id);
 if(!player || player.injured || player.sentOff || match.isFinished)return false;
 player.injured=true;match.performance(player,isUser).injured=true;
 match.bumpStat(isUser,'Injuries');
 match.logEvent({minute:match.minute,type:'injury',team:isUser?'user':'rival',playerId:player.id,text:'🤕 LESIÓN: '+player.name+'. Necesita un cambio; si sigue, juega muy limitado.'});
 return true; // Injury itself has no rating penalty and no history outside this match.
}
export function issueCard(match,player,isUser,card='yellow') {
 player=match.players(isUser).find(p=>p.id===player?.id);
 if(!player || player.sentOff || match.isFinished)return false;
 const record=match.performance(player,isUser);
 if(card==='yellow'){
  player.yellowCards=(player.yellowCards||0)+1;record.yellowCards++;
  match.bumpStat(isUser,'YellowCards');match.rate(player,isUser,config.PLAYER_RATING.YELLOW);
  match.logEvent({minute:match.minute,type:'yellow-card',team:isUser?'user':'rival',playerId:player.id,text:'🟨 '+player.name+' · Amarilla'+(player.yellowCards===2?' (segunda)':'')});
  if(player.yellowCards<2)return true;
 }
 player.sentOff=true;player.redCards=1;record.redCards++;record.sentOff=true;
 const xi=match.players(isUser),index=xi.findIndex(p=>p.id===player.id);
 if(index>=0)xi.splice(index,1);
 (isUser?match.userSentOff:match.rivalSentOff).push(player);activeCaptain(match,isUser);
 if(isUser)match.departedIds.add(String(player.id));
 match.bumpStat(isUser,'RedCards');match.rate(player,isUser,config.PLAYER_RATING.RED);match.recalculateMatchChemistry(isUser);
 match.logEvent({minute:match.minute,type:'red-card',team:isUser?'user':'rival',playerId:player.id,text:'🟥 '+player.name+' · '+(card==='yellow'?'Doble amarilla':'Roja directa')+'. No puede ser reemplazado.'});
 if(isGoalkeeper(player)&&xi.length){
  // A remaining outfielder covers the goal; the expelled keeper cannot be replaced.
  // A legal substitution replaces this outfielder, leaving the team with ten.
  const emergency=[...xi].sort((a,b)=>(b.goalkeeping??40)-(a.goalkeeping??40)||(a.overall??70)-(b.overall??70))[0];
  emergency.emergencyKeeper=true;emergency.emergencyOriginalPosition=emergency.slotPosition||emergency.primaryPosition;
  emergency.slotPosition='GK';emergency.slotX=50;emergency.slotY=92;
  match.performance(emergency,isUser).position='GK';
  match.logEvent({minute:match.minute,type:'emergency-keeper',team:isUser?'user':'rival',playerId:emergency.id,text:emergency.name+' se pone al arco tras la expulsión. Puede salir por un arquero si quedan cambios legales.'});
 }
 return true;
}
export function resolveInMatchPenalty(match,isUser) {
 const taker=setPieceTaker(match,isUser,'penalty');if(!taker)return;
 const keeper=match.goalkeeper(!isUser);
 const record=match.performance(taker,isUser);record.penaltiesTaken++;
 match.bumpStat(isUser,'Penalties');match.bumpStat(isUser,'Chances');match.bumpStat(isUser,'ClearChances');match.recordAction('chance',isUser,taker,{chanceKind:'clear',source:'penalty'});
 match.logEvent({minute:match.minute,type:'penalty',playerName:taker.name,team:isUser?'user':'rival',playerId:taker.id,text:'PENAL · Ejecuta '+taker.name});
 match.possessionOwner=!isUser;
 const scored=match.rng()<inMatchPenaltyProbability(taker,keeper);
 const saved=!scored && !!keeper && match.rng()<c.PENALTY_SAVED_RATE;
 match.recordAttempt(isUser,taker,scored||saved);
 match.goalkeeperIntervention(keeper,!isUser,{onTarget:scored||saved,saved,penalty:true});
 if(scored){record.penaltyGoals++;match.recordGoal(isUser,taker,{kind:'penalty',assist:null});}
 else{
  record.penaltiesMissed++;match.rate(taker,isUser,config.PLAYER_RATING.PENALTY_MISS);
  if(saved){match.performance(keeper,!isUser).penaltySaves++;match.rate(keeper,!isUser,config.PLAYER_RATING.PENALTY_SAVE);}
  match.logEvent({minute:match.minute,type:'penalty-miss',team:isUser?'user':'rival',playerId:taker.id,keeperId:keeper?.id,result:saved?'saved':'wide',text:saved?'¡'+keeper.name+' ATAJA el penal de '+taker.name+'!':'Penal fallado por '+taker.name+' · Fuera del arco.'});
 }
}
export function resolveFreeKick(match,isUser,zone='normal') {
 const indirect=zone!=='direct'||match.setPieces[isUser?'user':'rival'].approach==='CROSS';
 const taker=setPieceTaker(match,isUser,indirect?'indirectFreeKick':'freeKick');if(!taker)return;
 match.bumpStat(isUser,'FreeKicks');match.performance(taker,isUser).freeKicks++;
 match.logEvent({minute:match.minute,type:'free-kick',playerName:taker.name,team:isUser?'user':'rival',playerId:taker.id,zone,approach:match.setPieces[isUser?'user':'rival'].approach,text:'Tiro libre '+(zone==='direct'?'directo':zone==='dangerous'?'en zona ofensiva':'no peligroso')+' · '+taker.name});
 if(zone==='normal')return;
 if(zone==='dangerous'||match.setPieces[isUser?'user':'rival'].approach==='CROSS'){
  resolveSetPieceCross(match,isUser,'indirect-free-kick',taker);
  return;
 }
 match.possessionOwner=!isUser;
 match.bumpStat(isUser,'DirectFreeKicks');const keeper=match.goalkeeper(!isUser);
 const probability=directFreeKickProbabilities(taker,keeper);
 const powers=possessionPowers(match,match.getEffectiveRatings()),organization=isUser?powers.rival.organization:powers.user.organization;
 const factor=Math.max(config.SET_PIECES.MIN_ORGANIZATION_FACTOR,Math.min(config.SET_PIECES.MAX_ORGANIZATION_FACTOR,1+(75-organization)*config.SET_PIECES.DIRECT_ORGANIZATION_WEIGHT));
 probability.goal=Math.max(c.DIRECT_FK.MIN_GOAL,Math.min(c.DIRECT_FK.MAX_GOAL,probability.goal*factor*coachFactor(match,isUser,'set_piece',taker)));
 const onTarget=match.rng()<probability.target;
 const scored=onTarget && (!keeper || match.rng()<probability.goal);
 match.bumpStat(isUser,'Chances');match.recordAction('chance',isUser,taker,{chanceKind:'normal',source:'direct-free-kick'});match.recordAttempt(isUser,taker,onTarget);
 match.goalkeeperIntervention(keeper,!isUser,{onTarget,saved:onTarget&&!scored,difficult:onTarget&&!scored});
 if(scored){match.bumpStat(isUser,'FreeKickGoals');match.performance(taker,isUser).freeKickGoals++;match.recordGoal(isUser,taker,{kind:'direct-free-kick',assist:null});}
 else{
  match.rate(taker,isUser,onTarget?config.PLAYER_RATING.TARGET:config.PLAYER_RATING.WIDE);
  if(onTarget && keeper)match.rate(keeper,!isUser,config.PLAYER_RATING.SAVE);
  match.logEvent({minute:match.minute,type:'free-kick-result',team:isUser?'user':'rival',playerId:taker.id,result:onTarget?'saved':'wide',text:onTarget?(keeper?.name||'La defensa')+' evita el tiro libre de '+taker.name:'Tiro libre de '+taker.name+' · Barrera o remate desviado.'});
 }
}
export function resolveFoul(match,{committingUser,offender,victim,zone,card}={}) {
 if(match.isFinished)return;
 const isUser=committingUser??(match.rng()<0.5);
 offender ||= selectDefender(match.players(isUser),match.rng,true);victim ||= selectShooter(match.players(!isUser),match.rng);
 if(!offender || !victim)return;
 match.pendingCorner=null;match.possessionOwner=!isUser;
 if(!zone){
  if(match.rng()<c.PENALTY_RATE)zone='penalty';
  else if(match.rng()<c.DANGEROUS_FREE_KICK_RATE)zone=match.rng()<c.DIRECT_FREE_KICK_RATE?'direct':'dangerous';
  else zone='normal';
 }
 match.bumpStat(isUser,'Fouls');match.performance(offender,isUser).fouls++;match.rate(offender,isUser,config.PLAYER_RATING.FOUL);
 match.logEvent({minute:match.minute,type:'foul',team:isUser?'user':'rival',playerId:offender.id,fouledPlayerId:victim.id,zone,text:'Falta de '+offender.name+' sobre '+victim.name+(zone==='penalty'?' dentro del área.':'')});
 if(card===undefined){if(match.rng()<c.RED_CARD_RATE)card='red';else if(match.rng()<c.YELLOW_CARD_RATE)card='yellow';}
 if(card==='red'||card==='yellow')issueCard(match,offender,isUser,card);
 if(match.rng()<injuryProbability(victim,true))injurePlayer(match,victim,!isUser);
 if(zone==='penalty'){match.rate(offender,isUser,config.PLAYER_RATING.PENALTY_COMMITTED);resolveInMatchPenalty(match,!isUser);}
 else resolveFreeKick(match,!isUser,zone);
}
export function simulateMatchEvents(match) {
 // Open-play fouls arise from duels; keep the original handler for set pieces and UI.
 const candidates=[...match.userStarters.map(p=>({player:p,isUser:true})),...match.rivalStarters.map(p=>({player:p,isUser:false}))].filter(({player:p})=>!p.injured);
 const selected=weightedPlayer(candidates,item=>isGoalkeeper(item.player)?c.GK_INJURY_SELECTION_WEIGHT:1,match.rng);
 if(selected && match.rng()<injuryProbability(selected.player))injurePlayer(match,selected.player,selected.isUser);
}
