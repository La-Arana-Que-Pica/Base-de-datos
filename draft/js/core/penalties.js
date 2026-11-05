import {rankSpecialists,specialistExecutionQuality} from './setPieceSpecialists.js';
import { DRAFT_CONFIG as config } from '../config.js';
import { playerPerformanceMultiplier, individualChemistryBonus, effectivePlayerRating, effectiveGoalkeeperRating } from './fatigue.js';
// Shared conversion curve: also used by in-match penalties. Keep its contract unchanged.
export function penaltyProbability(shooter,keeper) {
 const p=config.PENALTIES;
 return Math.max(p.MIN,Math.min(p.MAX,p.BASE+((shooter.finishing??shooter.overall)-75)*p.QUALITY_WEIGHT-((keeper?.goalkeeping??keeper?.overall??75)-75)*p.KEEPER_WEIGHT));
}
export function shootoutQuality(player) { return specialistExecutionQuality(player,'penalty');
}
export function shootoutProbability(player,keeper) {
 return penaltyProbability({...player,finishing:shootoutQuality(player)},keeper?{...keeper,goalkeeping:effectiveGoalkeeperRating(keeper)}:null);
}
export function automaticShootoutOrder(xi) {
 return rankSpecialists(xi,'penalty',p=>!p.sentOff&&!p.substitutedOut);
}
export function selectShootoutKeeper(xi) {
 const eligible=xi.filter(p=>!p.sentOff&&!p.substitutedOut);
 return eligible.find(p=>(p.slotPosition||p.primaryPosition)==='GK')||eligible.slice().sort((a,b)=>(b.goalkeeping??b.overall)*playerPerformanceMultiplier(b)-(a.goalkeeping??a.overall)*playerPerformanceMultiplier(a))[0]||null;
}
export function prepareShootout(homeXI,awayXI) {
 const teams=[automaticShootoutOrder(homeXI),automaticShootoutOrder(awayXI)];
 if(teams.some(team=>!team.length))throw new Error('La tanda necesita jugadores elegibles en ambos equipos.');
 const size=Math.min(...teams.map(team=>team.length));
 // Reduce to equate: exclude the lowest-rated outfield players, preserving the actual goalkeeper.
 const excluded=[[],[]];
 teams.forEach((team,side)=>{const keeper=selectShootoutKeeper(team);while(team.length>size){let index=team.length-1;while(index>0&&team[index].id===keeper?.id)index--;excluded[side].push(team.splice(index,1)[0]);}});
 return {home:teams[0],away:teams[1],excludedHome:excluded[0],excludedAway:excluded[1],firstCount:Math.min(5,size)};
}
export function validateShootoutOrder(players,ids,count=null) {
 // Accept legacy first-five callers; the interactive UI submits the entire cycle.
 if(count===null){if(!Array.isArray(ids)||![Math.min(5,players.length),players.length].includes(ids.length))return false;count=ids.length;}
 if(!Array.isArray(ids)||ids.length!==count||new Set(ids.map(String)).size!==count)return false;
 return ids.every(id=>players.some(p=>String(p.id)===String(id)));
}
export function resolveShootout(homeXI,awayXI,rng,onKick=null,homeOrder=null) {
 const prepared=prepareShootout(homeXI,awayXI);
 if(homeOrder!==null&&!validateShootoutOrder(prepared.home,homeOrder))throw new Error('Orden de pateadores no válido.');
 const home=homeOrder===null?prepared.home:[...homeOrder.map(id=>prepared.home.find(p=>String(p.id)===String(id))),...prepared.home.filter(p=>!homeOrder.map(String).includes(String(p.id)))];
 const teams=[home,prepared.away];
 const keepers=[prepared.home,prepared.away].map(selectShootoutKeeper);
 const score=[0,0],taken=[0,0],kicks=[];
 rounds:for(let round=0;round<5||score[0]===score[1];round++) {
  for(let side=0;side<2;side++) {
   const player=teams[side][round%teams[side].length];
   const scored=rng()<shootoutProbability(player,keepers[1-side]);
   if(scored)score[side]++;
   const kick={round:round+1,cycle:Math.floor(round/teams[side].length)+1,side:side===0?'home':'away',playerId:player.id,name:player.name,scored,suddenDeath:round>=5};
   taken[side]++;kicks.push(kick);onKick?.(kick);
   // End the initial series as soon as the trailing team cannot catch up.
   // Sudden death still gives both teams their kick in each pair.
   if(round<5&&(score[0]>score[1]+(5-taken[1])||score[1]>score[0]+(5-taken[0])))break rounds;
  }
 }
 return {home:score[0],away:score[1],kicks,excludedHome:prepared.excludedHome.map(p=>p.id),excludedAway:prepared.excludedAway.map(p=>p.id)};
}
