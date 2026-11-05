import {actionQuality} from './duels.js';
import { DRAFT_CONFIG as config } from '../config.js';
import { isNaturalPosition } from './positions.js';
import { effectivePlayerRating, isGoalkeeper } from './fatigue.js';

const substitutionQuality=p=>actionQuality(p,['LB','RB','LWF','RWF','CF','SS'].includes(p.slotPosition||p.primaryPosition)?'carry':['CB','DMF'].includes(p.slotPosition||p.primaryPosition)?'tackle':'pass');

export function compatibleRivalReserves(match, outgoing, isUser=false) {
  const position=outgoing.slotPosition||outgoing.primaryPosition;
  return (isUser?match.userBench:match.rivalBench).filter(player=>!player.injured&&!player.sentOff&&!player.substitutedOut&&!(isUser?match.departedIds:match.rivalDepartedIds).has(String(player.id))&&isNaturalPosition(player,position));
}

// Invoked by the same tick used by interactive playback; no separate sporting RNG.
export function manageRivalSubstitutions(match,isUser=false) {
  const xi=isUser?match.userStarters:match.rivalStarters,bench=isUser?match.userBench:match.rivalBench;
  const count=isUser?'substitutionsUsed':'rivalSubstitutionsUsed',windows=isUser?'substitutionWindowsUsed':'rivalSubstitutionWindowsUsed',open=isUser?'substitutionWindowOpen':'rivalSubstitutionWindowOpen',last=isUser?'userLastAutoSubstitutionMinute':'rivalLastSubstitutionMinute';
  const departed=isUser?match.departedIds:match.rivalDepartedIds;
  match[last]??=-Infinity;
  const settings=config.RIVAL_SUBSTITUTIONS,halftime=match.minute===45;
  if((isUser?match.userAutoSubstitutions===false:match.rivalAutoSubstitutions===false)||match.isFinished||match[count]>=config.MAX_SUBSTITUTIONS)return;
  const injury=xi.some(player=>player.injured||player.emergencyKeeper);
  const firstMinute=settings.FIRST_MINUTE+(match.seed>>>0)%settings.FIRST_JITTER;
  if(!halftime&&!injury&&match.minute<firstMinute)return;
  // Do not let the normal cooldown push an otherwise valid final window past full time.
  const closingWindow=match.minute>=settings.LAST_WINDOW_MINUTE+(match.seed>>>0)%settings.GAP_JITTER&&match[last]<settings.LAST_WINDOW_MINUTE;
  if(!halftime&&!injury&&!closingWindow&&match.minute-match[last]<settings.WINDOW_GAP+(match.seed>>>0)%settings.GAP_JITTER)return;
  if(!halftime&&!match[open]&&match[windows]>=config.MAX_SUBSTITUTION_WINDOWS)return;
  const score=isUser?match.userScore-match.rivalScore:match.rivalScore-match.userScore;
  const threshold=halftime?settings.HALFTIME_ENERGY:match.minute>=settings.LAST_WINDOW_MINUTE?settings.LATE_ENERGY_THRESHOLD:settings.ENERGY_THRESHOLD;
  const candidates=[];
  for(const outgoing of xi){
    if(outgoing.sentOff||isGoalkeeper(outgoing)&&!outgoing.injured&&!outgoing.emergencyKeeper)continue;
    const energy=outgoing.energy??100,rating=(isUser?match.playerPerformance:match.rivalPerformance)[outgoing.id]?.rating??6;
    const poor=rating<settings.POOR_RATING;
    const booked=outgoing.yellowCards&&(!halftime||((match.seed>>>0)+xi.indexOf(outgoing))%3===0);
    if(!outgoing.injured&&!outgoing.emergencyKeeper&&energy>=threshold&&!poor&&!booked)continue;
    let priority=(outgoing.injured||outgoing.emergencyKeeper?1000:0)+Math.max(0,threshold-energy)*3+Math.max(0,6-rating)*12+(booked?10:0);
    const position=outgoing.slotPosition||outgoing.primaryPosition;
    if(score<0&&['CF','SS','LWF','RWF','AMF'].includes(position))priority+=8;
    if(score>0&&['CB','LB','RB','DMF'].includes(position))priority+=8;
    const reserves=compatibleRivalReserves(match,outgoing,isUser).filter(incoming=>{
      if(outgoing.injured||outgoing.emergencyKeeper)return true;
      if((incoming.energy??100)-energy<settings.MIN_ENERGY_GAIN&&!poor)return false;
      return energy<settings.EXTREME_ENERGY||substitutionQuality({...incoming,slotPosition:position,matchChemistry:null})>=substitutionQuality(outgoing)*settings.MIN_QUALITY_RATIO;
    });
    reserves.sort((left,right)=>substitutionQuality({...right,slotPosition:position,matchChemistry:null})-substitutionQuality({...left,slotPosition:position,matchChemistry:null}));
    if(reserves.length)candidates.push({outgoing,reserves,priority});
  }
  candidates.sort((left,right)=>right.priority-left.priority);
  const batch=halftime?settings.BATCH_SIZE:match[windows]>=config.MAX_SUBSTITUTION_WINDOWS-1?config.MAX_SUBSTITUTIONS-match[count]:settings.BATCH_SIZE;
  let used=0;
  for(const candidate of candidates){
    if(used>=batch)break;
    if(!halftime&&!match[open]&&match[windows]===config.MAX_SUBSTITUTION_WINDOWS-1&&match.minute<settings.LAST_WINDOW_MINUTE&&!candidate.outgoing.injured&&!candidate.outgoing.emergencyKeeper&&(candidate.outgoing.energy??100)>=settings.EXTREME_ENERGY)continue;
    const incoming=candidate.reserves.find(player=>bench.some(reserve=>reserve.id===player.id)&&!departed.has(String(player.id)));
    if(incoming&&match.substitute(candidate.outgoing.id,incoming.id,isUser,halftime).success)used++;
  }
  if(used)match[last]=match.minute;
}
