const DEFENSIVE_STAGE_WEIGHTS={'2':{exit:1.4,midfield:1.3,progression:.7,finish:.6},'4':{exit:.5,midfield:.8,progression:1.3,finish:1.4},'18':{exit:.6,midfield:1.3,progression:1.2,finish:.9},'29':{exit:.7,midfield:1.6,progression:1.1,finish:.6},'34':{exit:1.5,midfield:1.2,progression:.8,finish:.5},'37':{exit:.4,midfield:.6,progression:1.2,finish:1.8},'38':{exit:.8,midfield:1.1,progression:1.2,finish:.9},'14':{exit:.4,midfield:1.5,progression:1.1,finish:1},'17':{exit:.4,midfield:.7,progression:1.5,finish:1.4},'39':{exit:.4,midfield:.8,progression:1.1,finish:1.7},'50':{exit:.6,midfield:1,progression:1.4,finish:1}};
const CREATION_STAGE_WEIGHTS={"1":{"exit":1.4,"midfield":1.7,"progression":0.6,"finish":0.3},"3":{"exit":0.8,"midfield":1.5,"progression":1.1,"finish":0.6},"8":{"exit":1.5,"midfield":1.3,"progression":0.8,"finish":0.4},"9":{"exit":0.7,"midfield":0.8,"progression":1.7,"finish":0.8},"12":{"exit":0.6,"midfield":1.2,"progression":1.6,"finish":0.6},"23":{"exit":1.8,"midfield":1.4,"progression":0.6,"finish":0.2},"28":{"exit":0.5,"midfield":0.7,"progression":1.5,"finish":1.3},"31":{"exit":0.4,"midfield":0.6,"progression":1.4,"finish":1.6},"32":{"exit":1.1,"midfield":1.1,"progression":1.1,"finish":0.7},"40":{"exit":0.4,"midfield":0.6,"progression":1.3,"finish":1.7},"46":{"exit":0.6,"midfield":0.8,"progression":1.2,"finish":1.4},"48":{"exit":0.5,"midfield":0.8,"progression":1.2,"finish":1.5}};
import {COACHES,getCoach} from '../data/coaches.js';
import {captainMultiplier} from './leadership.js';
export function coachOffer(rng=Math.random){const pool=COACHES.map(c=>c.id);for(let i=0;i<4;i++){const j=i+Math.min(pool.length-i-1,Math.floor(Math.max(0,rng())*(pool.length-i)));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,4);}
export function coachActive(match,isUser,player=null){
 const side=isUser?'user':'rival',c=getCoach(match.coaches?.[side]);if(!c)return false;
 const tactic=isUser?match.userTactic:match.rivalTactic,score=isUser?match.userScore-match.rivalScore:match.rivalScore-match.userScore;
 switch(c.condition){case 'always':return true;case 'offensive':return tactic==='OFFENSIVE';case 'balanced':return tactic==='BALANCED';case 'defensive':return tactic==='DEFENSIVE';case 'leading':return score>0;case 'trailing':return score<0;case 'late_tied':return match.minute>=75&&score===0;case 'late_trailing':return match.minute>=75&&score<0;case 'underdog':return (match.pregameOverall?.[isUser?'rival':'user']??0)>=(match.pregameOverall?.[side]??0)+4;case 'sub_after_45':{const entry=match.entryMinutes?.[side]?.[player?.id];return entry>=46&&match.minute>=entry&&match.minute<entry+(c.duration||30);}default:return false;}
}
export function coachEffect(match,isUser,family,player=null){
 const c=getCoach(match.coaches?.[isUser?'user':'rival']);if(!c||!coachActive(match,isUser,player))return 0;
 return (c.family===family?c.effect:0)+(c.counterFamily===family?c.counterEffect:0);
}
export function coachFactor(match,isUser,family,player=null){
 let effect=coachEffect(match,isUser,family,player);const c=getCoach(match.coaches?.[isUser?'user':'rival']);
 if(effect&&family==='fatigue'&&c.id==='24')effect*= ['DMF','CMF','AMF','LMF','RMF'].includes(player?.slotPosition||player?.primaryPosition)?1.25:.875;
 if(effect&&family==='fatigue'&&c.id==='41')effect*= (player?.energy??100)<60?1.375:.625;
 return Math.max(.85,Math.min(1.15,1+effect));
}
export function conversionFactor(match,isUser,player,{assist=null,clear=false,setPieceSource=null}={}){
 const c=getCoach(match.coaches?.[isUser?'user':'rival']);if(!c)return 1;
 if(setPieceSource)return c.id==='11'?1:coachFactor(match,isUser,'set_piece',player);
 let effect=coachEffect(match,isUser,'conversion',player),weight=1;
 if(c.id==='20')weight=assist?1.5:.5;
 if(c.id==='42')weight=assist?(['DMF','CMF','AMF'].includes(assist.slotPosition||assist.primaryPosition)?1.6:1.1):.4;
 if(c.id==='35')weight=assist?.8:1.4;
 if(c.id==='30')weight=['CMF','AMF','SS'].includes(player.slotPosition||player.primaryPosition)?1.5:.8;
 if(c.id==='49')weight=['CF','LWF','RWF'].includes(player.slotPosition||player.primaryPosition)?1.1:.7;
 if(c.id==='7'||c.id==='36')weight=clear?1.4:.8;
 return Math.max(.85,Math.min(1.15,1+effect*weight));
}

export function coachedQuality(match,isUser,player,quality,neutralQuality=quality){
 const boost=coachEffect(match,isUser,'substitute',player);
 if(!boost)return quality;
 // Existing +3 OVR Super Refuerzo is already inside quality; cap the combined component.
 return Math.min(110,quality*(1+boost),neutralQuality*1.10);
}
export function duelCoaching(match,isUser,stage,lane,transition){
 const coach=getCoach(match.coaches?.[isUser?'user':'rival']);
 const profile=coach?.archetype;
 let weight=CREATION_STAGE_WEIGHTS[coach?.id]?.[stage]??(profile==='Posesion'?(stage==='exit'||stage==='midfield'?1.6:.4):profile==='Transiciones'?(transition?1.6:.4):profile==='Presion Alta'?(stage==='midfield'?1.4:stage==='progression'?1.2:.7):profile==='Estratega'?(stage==='progression'?1.6:.8):profile==='Ofensivo'?(stage==='finish'?1.6:.8):1);
 if(coach?.id==='9'&&stage==='progression')weight=lane===50?.8:1.7;
 if(['8','40'].includes(coach?.id))weight*=transition?1.3:.75;
 const defending=getCoach(match.coaches?.[isUser?'rival':'user']);
 const defensiveWeight=DEFENSIVE_STAGE_WEIGHTS[defending?.id]?.[stage]??1;
 const create=coachEffect(match,isUser,'creation'),opposition=coachEffect(match,!isUser,'defense');
 // Apply relative quality at actual actions, never add chances or alter final statistics.
 return {attack:Math.max(.85,Math.min(1.15,(1+create*weight)*captainMultiplier(match,isUser))),defense:Math.max(.85,Math.min(1.15,(1-opposition*defensiveWeight)*captainMultiplier(match,!isUser)))};
}
export function trackLeadership(match){
 if(!match.coachTelemetry)return;
 for(const isUser of [true,false]){const side=isUser?'user':'rival',c=getCoach(match.coaches?.[side]),t=match.coachTelemetry[side];
  const active=c?.condition==='sub_after_45'?match.players(isUser).some(p=>coachActive(match,isUser,p)):coachActive(match,isUser);
  if(active){t.activeMinutes++;if(!t.previousActive)t.activations++;}t.previousActive=active;
  if(captainMultiplier(match,isUser)>1)t.captainMinutes++;
 }
}
