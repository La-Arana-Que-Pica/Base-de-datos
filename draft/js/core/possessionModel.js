import {DRAFT_CONFIG as config} from '../config.js';
const c=config.POSSESSION_MODEL;
export const bounded=(value,min,max)=>Math.max(min,Math.min(max,value));
export function coordination(score=50){const q=bounded(score,0,100);return 1+(q-50)/50*(q>=50?config.CHEMISTRY.POSITIVE_EFFECT:config.CHEMISTRY.NEGATIVE_EFFECT);}
export function possessionPowers(match,ratings){
 const power=(isUser,r)=>{
  const tactic=c.TACTICS[isUser?match.userTactic:match.rivalTactic],chem=coordination(isUser?match.initialUserChemistry:match.initialRivalChemistry);
  const intensity=config.INTENSITIES[isUser?match.userIntensity:match.rivalIntensity]||config.INTENSITIES.NORMAL;
  const xi=(match.players?.(isUser)||[]).filter(p=>(p.slotPosition||p.primaryPosition)!=='GK');
  const energy=xi.length?xi.reduce((a,p)=>a+(p.energy??100),0)/xi.length:100;
  const pressure=intensity.pressure>0?intensity.pressure*Math.min(1,energy/config.FATIGUE.PERFORMANCE_THRESHOLD):intensity.pressure;
  const difference=isUser?match.userScore-match.rivalScore:match.rivalScore-match.userScore;
  const urgency=match.minute>=60?bounded(-difference,-2,2)*.012:0;
  return {...r,pressure,tempo:intensity.tempo,control:r.mid*chem*tactic.control*(1+urgency+pressure),construction:(r.mid*.65+r.att*.35)*chem*tactic.build,organization:(r.def*.9+r.mid*.1)*chem*tactic.organization,depth:r.att*tactic.depth,coordination:chem,tactic};
 };
 return {user:power(true,ratings.user),rival:power(false,ratings.rival)};
}
export function controlProbability(powers,previousOwner=null){
 let p=bounded(1/(1+Math.exp(-(powers.user.control-powers.rival.control)/c.CONTROL_SCALE)),c.MIN_CONTROL,c.MAX_CONTROL);
 if(previousOwner!==null)p=(1-c.RETENTION)*p+c.RETENTION*(previousOwner?1:0);
 return p;
}
export function constructionProbability(attack,defense){return bounded(c.BUILD_BASE+(attack.construction-defense.organization)*c.BUILD_DIFFERENCE-defense.pressure,c.MIN_BUILD,c.MAX_BUILD);}
export function breachProbability(attack,defense){return bounded(c.BREACH_BASE+(attack.depth-defense.organization)*c.BREACH_DIFFERENCE+(attack.tempo-1)*config.INTENSITY_MODEL.TEMPO_BREACH_WEIGHT,c.MIN_BREACH,c.MAX_BREACH);}
export function clearChanceProbability(attack,defense){return bounded(c.CLEAR_BASE+(attack.depth-defense.organization)*c.CLEAR_DIFFERENCE+attack.tactic.counter,c.MIN_CLEAR,c.MAX_CLEAR);}
