import {rankSpecialists,specialistExecutionQuality} from './setPieceSpecialists.js';
import { DRAFT_CONFIG as config } from '../config.js';
import { playerPerformanceMultiplier, effectivePlayerRating, effectiveGoalkeeperRating, individualChemistryBonus, isGoalkeeper } from './fatigue.js';
import { penaltyProbability } from './penalties.js';
export function weightedPlayer(players,weight,rng) {
 const weights=players.map(p=>Math.max(0,weight(p)));let point=rng()*weights.reduce((a,b)=>a+b,0);
 for(let i=0;i<players.length;i++){point-=weights[i];if(point<0)return players[i];}
 return players.at(-1)||null;
}
export function selectShooter(xi,rng) {
 const attackers=xi.filter(p=>['CF','SS','LWF','RWF','AMF'].includes(p.slotPosition||p.primaryPosition));
 const pool=attackers.length?attackers:xi.filter(p=>!isGoalkeeper(p));
 return weightedPlayer(pool,p=>effectivePlayerRating(p),rng);
}
export function selectAssistProvider(xi,shooter,rng) {
 const c=config.MATCH_EVENTS;
 const pool=xi.filter(p=>p.id!==shooter.id && !isGoalkeeper(p) && !p.sentOff);
 return weightedPlayer(pool,p=>(c.ASSIST_ROLE_WEIGHT[p.slotPosition||p.primaryPosition]??c.ASSIST_DEFAULT_ROLE_WEIGHT)*(Object.entries(c.ASSIST_PASS_WEIGHTS).reduce((sum,[key,weight])=>sum+(p[key]??p.overall)*weight,0)/100)**c.PASS_QUALITY_EXPONENT*playerPerformanceMultiplier(p)**c.PARTICIPATION_EXPONENT,rng);
}
export function selectDefender(xi,rng,forFoul=false) {
 return weightedPlayer(xi,p=>(config.MATCH_EVENTS.FOUL_ROLE_WEIGHT[p.slotPosition||p.primaryPosition]??1)*((p.defensiveProwess??p.overall)+(p.ballWinning??p.overall))*playerPerformanceMultiplier(p)*(forFoul&&p.yellowCards?config.MATCH_EVENTS.BOOKED_FOUL_FACTOR:1),rng);
}
export function weightedAttributeScore(p,weights) {
 const attribute=Object.entries(weights).reduce((sum,[key,weight])=>sum+(p[key]??p.overall)*weight,0);
 return (.85*(p.overall??70)+.15*attribute+individualChemistryBonus(p.matchChemistry??4.5))*playerPerformanceMultiplier(p);
}
export function selectFreeKickTaker(xi) { return rankSpecialists(xi,'freeKick')[0]||null; }
export function selectPenaltyTaker(xi) { return rankSpecialists(xi,'penalty')[0]||null; }
export function inMatchPenaltyProbability(shooter,keeper) {
 const quality=specialistExecutionQuality(shooter,'penalty');
 const effectiveKeeper=keeper?{...keeper,goalkeeping:effectiveGoalkeeperRating(keeper)}:{goalkeeping:0};
 return penaltyProbability({...shooter,finishing:quality},effectiveKeeper);
}
export function directFreeKickProbabilities(taker,keeper) {
 const c=config.MATCH_EVENTS.DIRECT_FK,quality=specialistExecutionQuality(taker,'freeKick');
 const keeperPower=keeper?(keeper.goalkeeping??keeper.overall)*playerPerformanceMultiplier(keeper):0;
 return {target:Math.max(c.MIN_TARGET,Math.min(c.MAX_TARGET,c.TARGET_BASE+(quality-75)*c.TARGET_SKILL)),goal:Math.max(c.MIN_GOAL,Math.min(c.MAX_GOAL,c.GOAL_BASE+(quality-75)*c.GOAL_SKILL-(keeperPower-75)*c.KEEPER_WEIGHT))};
}
export function injuryProbability(player,fromFoul=false) {
 const c=config.MATCH_EVENTS;
 return (fromFoul?c.FOUL_INJURY_RATE:c.INJURY_RATE)*(c.INJURY_RESISTANCE_FACTOR[player.injuryResistance]??c.INJURY_RESISTANCE_FACTOR[c.INJURY_RESISTANCE_FALLBACK]);
}

export function individualActionModifier(player,xi) {
 const pool=xi.filter(p=>['CF','SS','LWF','RWF','AMF'].includes(p.slotPosition||p.primaryPosition));
 const group=pool.length?pool:xi;
 const average=group.reduce((sum,p)=>sum+playerPerformanceMultiplier(p),0)/(group.length||1);
 return Math.max(config.MATCH_EVENTS.ACTION_RELATIVE_MIN,Math.min(config.MATCH_EVENTS.ACTION_RELATIVE_MAX,playerPerformanceMultiplier(player)/(average||1)));
}

export function selectBuilder(xi,rng){
 return weightedPlayer(xi.filter(p=>!isGoalkeeper(p)),p=>effectivePlayerRating(p)*(['DMF','CMF','AMF','LMF','RMF'].includes(p.slotPosition||p.primaryPosition)?2:['CB','LB','RB'].includes(p.slotPosition||p.primaryPosition)?.4:.8),rng);
}
