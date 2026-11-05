import {coachFactor} from './coaching.js';
import {specialistTaker,specialistExecutionQuality} from './setPieceSpecialists.js';
import {DRAFT_CONFIG as c} from '../config.js';
import {selectFreeKickTaker,selectPenaltyTaker,weightedAttributeScore,weightedPlayer} from './matchActions.js';
import {effectivePlayerRating} from './fatigue.js';
export const eligibleSetPiecePlayers=(match,isUser=true)=>match.players(isUser).filter(p=>!p.sentOff&&!p.injured&&!p.substitutedOut);
export const setPieceTaker=specialistTaker;
export function resolveSetPieceCross(match,isUser,kind,taker){
 if(!taker)return;
 const pool=eligibleSetPiecePlayers(match,isUser).filter(p=>p.id!==taker.id&&(p.slotPosition||p.primaryPosition)!=='GK');
 const shooter=weightedPlayer(pool,p=>effectivePlayerRating(p)*(c.SET_PIECES.HEADER_ROLES[p.slotPosition||p.primaryPosition]??c.SET_PIECES.DEFAULT_HEADER_ROLE),match.rng);if(!shooter)return;
 const ratings=match.getEffectiveRatings(),attack=isUser?ratings.user:ratings.rival,defense=isUser?ratings.rival:ratings.user;
 const quality=(specialistExecutionQuality(taker,kind==='corner'?'corner':'indirectFreeKick')+effectivePlayerRating(shooter))/2;
 const probability=Math.max(c.SET_PIECES.MIN_CROSS,Math.min(c.SET_PIECES.MAX_CROSS,c.SET_PIECES.CROSS_BASE+(quality-defense.def)*c.SET_PIECES.QUALITY_DIFFERENCE));
 match.logEvent({minute:match.minute,type:'set-piece-cross',team:isUser?'user':'rival',playerId:taker.id,source:kind,text:'Centro al área de '+taker.name+'.'});
 match.possessionOwner=!isUser;
 if(match.rng()<Math.min(c.SET_PIECES.MAX_CROSS,probability*(match.coaches?.[isUser?'user':'rival']==='11'?coachFactor(match,isUser,'set_piece',taker):1)))match.resolveAttack(isUser,ratings,{builder:taker,shooter,kind,clearProbability:c.POSSESSION_MODEL.CLEAR_BASE});
 else match.logEvent({minute:match.minute,type:'defense',team:isUser?'rival':'user',source:kind,text:'La defensa despeja el centro sin remate.'});
}
