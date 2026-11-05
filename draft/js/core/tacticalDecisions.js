import {DRAFT_CONFIG as c} from '../config.js';
import {getCoach} from '../data/coaches.js';
// Side-neutral recommendations: change the real plan/intensity, never the outcome.
export function recommendTactics(match,isUser=true){
 const xi=match.players(isUser).filter(p=>(p.slotPosition||p.primaryPosition)!=='GK');
 const energy=xi.reduce((a,p)=>a+(p.energy??100),0)/Math.max(1,xi.length),score=isUser?match.userScore-match.rivalScore:match.rivalScore-match.userScore;
 const coach=getCoach(match.coaches?.[isUser?'user':'rival']),s=c.RIVAL_TACTICAL;
 let tactic=isUser?match.userTactic:match.rivalTactic,intensity=isUser?match.userIntensity:match.rivalIntensity;
 if(match.minute>=s.LATE_MINUTE&&score<0){tactic='OFFENSIVE';intensity=energy<s.TIRED_ENERGY?'LOW':'HIGH';}
 else if(match.minute>=s.LATE_MINUTE&&score>0){tactic='DEFENSIVE';intensity='LOW';}
 else if(match.players(isUser).length<match.players(!isUser).length&&score>=0){tactic='DEFENSIVE';intensity='NORMAL';}
 else if(score===0&&coach&&['offensive','balanced','defensive'].includes(coach.condition)){tactic={offensive:'OFFENSIVE',balanced:'BALANCED',defensive:'DEFENSIVE'}[coach.condition];intensity='NORMAL';}
 else if(score===0&&match.minute>=90){const r=match.getEffectiveRatings(),own=isUser?r.user:r.rival,other=isUser?r.rival:r.user;if(own.att>other.def){tactic='OFFENSIVE';intensity='NORMAL';}}
 if(energy<s.TIRED_ENERGY)intensity='LOW';
 return {tactic,intensity,energy};
}
export function manageRivalTactics(match,isUser=false){
 const s=c.RIVAL_TACTICAL,tacticKey=isUser?'userTactic':'rivalTactic',intensityKey=isUser?'userIntensity':'rivalIntensity',last=isUser?'userLastAutoTacticalMinute':'rivalLastTacticalMinute';
 const shortHanded=match.players(isUser).length<match.players(!isUser).length;
 match[last]??=-Infinity;
 if((isUser?match.userAutoTactics===false:match.rivalAutoTactics===false)||match.minute>=c.EXTRA_TIME_END||match.isFinished||match.shootoutPending||match.minute<s.FIRST_MINUTE&&!shortHanded||match.minute-match[last]<s.GAP)return;
 match[last]=match.minute;const {tactic,intensity}=recommendTactics(match,isUser);
 if(tactic===match[tacticKey]&&intensity===match[intensityKey])return;
 if(!shortHanded&&match.rng()>s.DECISION_RATE)return;
 match[tacticKey]=tactic;match[intensityKey]=intensity;
 match.logEvent({minute:match.minute,type:'tactic',team:isUser?'user':'rival',text:(isUser?match.userTeamName:match.rivalTeamName)+' ajusta su planteamiento: '+c.TACTICS[tactic].label+' · Intensidad '+c.INTENSITIES[intensity].label+'.'});
}
