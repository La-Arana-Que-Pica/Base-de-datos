import { DRAFT_CONFIG as config } from '../config.js';
export const isGoalkeeper = p => (p.slotPosition || p.primaryPosition) === 'GK';
export function getStamina(p) { const value=Number(p.stamina);return p.stamina!=null && Number.isFinite(value) && value>0 ? value : config.FATIGUE.STAMINA_FALLBACK; }
export function getStaminaConsumptionFactor(p) { return (config.FATIGUE.STAMINA_REFERENCE/getStamina(p))**config.FATIGUE.STAMINA_EXPONENT; }
export function staminaDrain(p,tactic='BALANCED',intensity='NORMAL') {
 const c=config.FATIGUE, factor=getStaminaConsumptionFactor(p)*(p.permanentVariantId&&p.fatigueScale===.72?.72:1);
 if(isGoalkeeper(p))return c.GK_BASE_FATIGUE_RATE*factor; // No direct tactical multiplier for GK.
 return c.DRAIN_PER_MINUTE*factor*(c.ROLE_DRAIN[p.slotPosition||p.primaryPosition]??1)*(c.TACTIC_DRAIN[tactic]??1)*(config.INTENSITIES[intensity]?.drain??1);
}
export function getFatiguePerformanceModifier(p) {
 const c=config.FATIGUE,energy=Math.max(0,Math.min(100,p.energy??c.INITIAL_ENERGY));
 const threshold=isGoalkeeper(p)?c.GK_PERFORMANCE_THRESHOLD:c.PERFORMANCE_THRESHOLD;
 const maxPenalty=isGoalkeeper(p)?c.GK_MAX_PENALTY:c.MAX_PERFORMANCE_PENALTY;
 return 1-maxPenalty*(Math.max(0,threshold-energy)/threshold)**c.PERFORMANCE_EXPONENT;
}
export function playerPerformanceMultiplier(p) {
 return (p.sentOff?0:1)*getFatiguePerformanceModifier(p)*(p.injured?config.MATCH_EVENTS.INJURY_PERFORMANCE:1);
}
// Piecewise linear interpolation preserves decimal chemistry, with plateaus for each band.
export const INDIVIDUAL_CHEMISTRY_ANCHORS = [[0,-4],[1,-4],[2,-2],[3,-2],[4,0],[5,0],[6,1],[7,1],[8,2],[9,2],[10,3]];
export function individualChemistryBonus(value) {
 const q=Number.isFinite(Number(value))?Math.max(0,Math.min(10,Number(value))):4.5;
 for(let i=1;i<INDIVIDUAL_CHEMISTRY_ANCHORS.length;i++){
  const [x,y]=INDIVIDUAL_CHEMISTRY_ANCHORS[i], [prevX,prevY]=INDIVIDUAL_CHEMISTRY_ANCHORS[i-1];
  if(q<=x)return prevY+(y-prevY)*(q-prevX)/(x-prevX);
 }
 return 3;
}
// Bench entrants have no individual chemistry bonus/penalty. The team chemistry stays frozen.
export function matchChemistryModifier(p){return p.matchChemistry==null?0:individualChemistryBonus(p.matchChemistry);}
export function matchReferenceRating(p){return Math.max(1,Math.min(99,(p.overall??70)+matchChemistryModifier(p)+(p.superSubActive?config.SUPER_SUB_BONUS:0)));}
export function effectivePlayerRating(p) {return matchReferenceRating(p)*playerPerformanceMultiplier(p);}
export function effectiveGoalkeeperRating(p) {
    if(p.emergencyKeeper)return Math.max(1,Math.min(99,p.goalkeeping??40))*playerPerformanceMultiplier(p);
 const quality=.85*(p.overall??70)+.15*(p.goalkeeping??p.overall??70)+matchChemistryModifier(p)+(p.superSubActive?config.SUPER_SUB_BONUS:0);
 return Math.max(1,Math.min(99,quality))*playerPerformanceMultiplier(p);
}
export function goalkeeperWorkloadDrain(p,{onTarget=false,saved=false,difficult=false,penalty=false}={}) {
 const w=config.FATIGUE.GK_WORKLOAD;
 return (w.SHOT+(onTarget?w.ON_TARGET:0)+(saved?w.SAVE:0)+(difficult?w.DIFFICULT_SAVE:0)+(penalty?w.PENALTY:0))*getStaminaConsumptionFactor(p)*(p.permanentVariantId&&p.fatigueScale===.72?.72:1);
}
export function resetMatchStatus(p) {
 const {matchChemistry,emergencyKeeper,emergencyOriginalPosition,...persistent}=p;
 return {...persistent,energy:p.energy??config.FATIGUE.INITIAL_ENERGY,superSubActive:false,injured:false,sentOff:false,yellowCards:0,redCards:0,substitutedOut:false,goalkeeperWorkload:0};
}
