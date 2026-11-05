import {StateStore} from '../state.js';
import {CAREER_CATALOG} from '../career/catalog.js';
import {getPlayerById} from '../data/adapter.js';
import {createRng} from '../core/matchEngine.js';
import {consumeReward} from '../core/campaignRewards.js';

export const survivalRoster=s=>[...s.getFullSquad(),...(s.survival?.reserves||[])];
export function reinforcementOffer(s){
 const used=new Set(survivalRoster(s).map(p=>String(p.id))),wins=s.survival.wins;
 const target=Math.min(92,Math.max(70,s.initialDraftOverall||75)-1+16*(1-Math.exp(-wins/18)));
 const available=CAREER_CATALOG.players.map(p=>getPlayerById(p.id)).filter(p=>p&&!used.has(String(p.id)));
 let pool=available.filter(p=>p.overall>=Math.floor(target-3)&&p.overall<=Math.ceil(target+4));
 if(pool.length<5)pool=available.slice().sort((a,b)=>Math.abs(a.overall-target)-Math.abs(b.overall-target)).slice(0,Math.max(5,30));
 const rng=createRng((s.survival.seed^Math.imul(wins,2654435761))>>>0),offer=[];
 while(offer.length<5&&pool.length){const weights=pool.map(p=>Math.exp(-(((p.overall-target)/3)**2))+.03),sum=weights.reduce((a,b)=>a+b,0);let roll=rng()*sum,index=weights.length-1;for(let i=0;i<weights.length;i++){roll-=weights[i];if(roll<=0){index=i;break;}}offer.push({...pool.splice(index,1)[0]});}
 return {version:1,wins,target,candidates:offer,selectedId:null};
}
export function chooseReinforcement(s,id){
 const reward=s.getPendingReward(),pick=s.survival?.recruitment;
 if(s.currentScreen!=='REWARD_CHOICE'||s.survival?.variant==='DREAM_TEAM'||reward?.type!=='RECRUIT'||!pick||pick.wins!==s.survival.wins||pick.selectedId)return false;
 const offered=pick.candidates.find(p=>String(p.id)===String(id)),canonical=offered&&getPlayerById(offered.id);
 if(!canonical||survivalRoster(s).some(p=>String(p.id)===String(id)))return false;
 const player={...canonical,energy:100,slotId:'reserve:'+canonical.id,slotPosition:canonical.primaryPosition};
 s.survival.reserves??=[];s.survival.reserves.push(player);pick.selectedId=player.id;
 consumeReward(s.tournament,{type:'RECRUIT',playerId:player.id});
 s.lastRewardSummary={type:'RECRUIT',name:player.name,overall:player.overall};
 StateStore.onPlayerObtained?.(s,player,'reinforcement');
 s.confirmedLineup=null;s.selectedSquadSlot=null;s.currentScreen='BRACKET';s.notify();return true;
}
export function validateSurvivalReserves(s){
 const reserves=s.survival.reserves||[],players=survivalRoster(s);
 if(!Array.isArray(reserves)||s.survival.variant==='DREAM_TEAM'&&reserves.length||new Set(players.map(p=>String(p.id))).size!==players.length||reserves.some(p=>!getPlayerById(p.id)||p.slotId!=='reserve:'+p.id||!Number.isFinite(p.energy)||p.energy<0||p.energy>100))throw Error('Reservas de Supervivencia incompatibles');
 const reward=s.getPendingReward(),pick=s.survival.recruitment;
 if(reward?.type==='RECRUIT'&&(!pick||pick.wins!==s.survival.wins||pick.selectedId||pick.candidates?.length!==5||new Set(pick.candidates.map(p=>p.id)).size!==5||pick.candidates.some(p=>!getPlayerById(p.id)||players.some(q=>q.id===p.id))))throw Error('Pick de refuerzo incompatible');
}
