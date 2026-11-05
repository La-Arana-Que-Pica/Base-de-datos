import {DRAFT_CONFIG as config} from '../config.js';
import {playerPerformanceMultiplier} from './fatigue.js';
export const specialistEligible=p=>!p.sentOff&&!p.injured&&!p.substitutedOut;
export function specialistScore(player,kind){
 const weights=config.SET_PIECE_SPECIALISTS.WEIGHTS[kind];if(!weights)throw new Error('Categoría de especialista desconocida');
 let total=0,weight=0,count=0;const source=player.setPieceAttributes||player;
 for(const [key,w] of Object.entries(weights)){const value=player.setPieceAttributes&&source[key]==null?null:player[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=99){total+=value*w;weight+=w;count++;}}
 return {score:weight?total/weight:null,coverage:weight,available:count,complete:count===Object.keys(weights).length};
}
export function rankSpecialists(players,kind,eligible=specialistEligible){return players.filter(eligible).slice().sort((a,b)=>{
 const x=specialistScore(a,kind),y=specialistScore(b,kind);
 return (y.score??-1)-(x.score??-1)||String(a.id).localeCompare(String(b.id),'en');
});}
export function specialistExecutionQuality(player,kind){return (specialistScore(player,kind).score??config.SET_PIECE_SPECIALISTS.UNKNOWN_EXECUTION)*playerPerformanceMultiplier(player);}
export function initializeSpecialists(match){
 match.specialists={user:{},rival:{}};
 for(const side of ['user','rival'])for(const kind of Object.keys(config.SET_PIECE_SPECIALISTS.WEIGHTS))refreshSpecialists(match,side==='user',kind);
}
export function refreshSpecialists(match,isUser,kind){
 const side=isUser?'user':'rival',pool=match.players(isUser).filter(specialistEligible),signature=pool.map(p=>String(p.id)).sort().join('|');
 match.specialists ||= {user:{},rival:{}};let entry=match.specialists[side][kind];
 if(!entry||entry.signature!==signature){const order=rankSpecialists(pool,kind).map(p=>String(p.id));entry=match.specialists[side][kind]={signature,order,principal:pool.some(p=>String(p.id)===entry?.principal)?entry.principal:order[0]??null};}
 return entry;
}
export function specialistTaker(match,isUser,kind){
 const pool=match.players(isUser).filter(specialistEligible),settings=match.setPieces[isUser?'user':'rival'];
 const manual=settings[kind],chosen=pool.find(p=>String(p.id)===String(manual));
 const entry=refreshSpecialists(match,isUser,kind);
 if(chosen)return chosen;
 return pool.find(p=>String(p.id)===entry.principal)||null;
}
