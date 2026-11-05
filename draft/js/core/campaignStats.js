import {DUEL_FIELDS} from './duels.js';
import { DRAFT_CONFIG as config } from '../config.js';
export function accumulatePlayerStats(stats, match, result) {
  for(const item of Object.values(match.playerPerformance)) {
    if(item.minutes===0) continue;
    const record=stats[item.id] ||= {id:item.id,name:item.name,matches:0,minutes:0,goals:0,assists:0,yellowCards:0,redCards:0,benchEntries:0,ratingTotal:0,averageRating:0,matchRatings:[]};
    const rating=item.rating ?? config.PLAYER_RATING.BASE;
    const player=match.getAllPlayers?.().find(p=>p.id===item.id);
    if(player)Object.assign(record,{image:player.image,primaryPosition:player.primaryPosition,overall:player.overall,originalOverall:player.originalOverall,campaignBoost:player.campaignBoost,teamName:player.teamName});
    record.matches++;record.minutes+=item.minutes;record.goals+=item.goals;record.assists=(record.assists||0)+(item.assists||0);record.yellowCards=(record.yellowCards||0)+(item.yellowCards||0);record.redCards=(record.redCards||0)+(item.redCards||0);record.benchEntries+=item.benchEntries;record.ratingTotal+=rating;
    for(const key of [...DUEL_FIELDS,'effortEnergy','shots','shotsOnTarget','saves','difficultSaves','goalsConceded','recoveries','interceptions','clearances','blocks','constructions','chancesCreated','losses','clearMisses'])record[key]=(record[key]||0)+(item[key]||0);
    record.matchRatings.push({rating,minutes:item.minutes,round:match.roundLabel,goals:item.goals,assists:item.assists||0,yellowCards:item.yellowCards||0,redCards:item.redCards||0});record.averageRating=record.ratingTotal/record.matches;
  }
  return stats;
}
export function getCampaignSummary(state) {
  const history=state.tournament?.history || [];
  const players=Object.values(state.campaignStats);
  const byGoals=[...players].sort((a,b)=>b.goals-a.goals || b.minutes-a.minutes || String(a.id).localeCompare(String(b.id)));
  const byRating=[...players].sort((a,b)=>b.averageRating-a.averageRating || b.minutes-a.minutes || String(a.id).localeCompare(String(b.id)));
  const topAssister=[...players].sort((a,b)=>(b.assists||0)-(a.assists||0)||b.minutes-a.minutes||String(a.id).localeCompare(String(b.id)))[0];
  return {history,played:history.length,wins:history.filter(m=>m.userWon).length,losses:history.filter(m=>!m.userWon).length,topAssister:topAssister?.assists>0?topAssister:null,goalsFor:history.reduce((sum,m)=>sum+m.userScore,0),goalsAgainst:history.reduce((sum,m)=>sum+m.rivalScore,0),initialOverall:state.initialDraftOverall,finalOverall:state.ratings.overall,topScorer:byGoals[0]||null,bestPlayer:byRating[0]||null};
}
