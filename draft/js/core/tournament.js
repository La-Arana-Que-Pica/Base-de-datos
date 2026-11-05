import {tournamentFormat} from './tournamentFormat.js';
import {createVictoryReward} from './campaignRewards.js';
import { DRAFT_CONFIG as config } from '../config.js';
import { getTeamsByRegion, getRivalSquad } from '../data/adapter.js';
import { createRng,MatchEngine } from './matchEngine.js';
import {simulateLegacyQuickMatch,legacyStaminaDrain} from './legacyTournamentProjection.js';
import { accumulatePlayerStats } from './campaignStats.js';
export const USER_TEAM_ID = 'user-draft';

export function createTournament(region, seed = Date.now(), options = {}) {
  const rng = createRng(seed);
  const participants=options.participants??config.TOURNAMENT.PARTICIPANTS;
  const format=tournamentFormat(participants);
  const pool = (options.pool??getTeamsByRegion(region).map(t => getRivalSquad(t.id))).filter(t => t?.startingXI.length === 11);
  if (new Set(pool.map(t => t.id)).size < participants - 1) throw Error('No hay suficientes rivales únicos');
  for (let i=pool.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const entrants = [{id:USER_TEAM_ID,name:'Mi Draft',region}, ...pool.slice(0,participants-1)];
  const rounds = format.labels.map((label,index) => ({ label, matches: Array.from({length:participants/2**(index+1)},(_,i)=>({id:index+'-'+i,homeId:index===0?entrants[i*2].id:null,awayId:index===0?entrants[i*2+1].id:null,result:null,winnerId:null})) }));
  return {format,seed, rng, region, teams:Object.fromEntries(entrants.map(t=>[t.id,t])), rounds, roundIndex:0, status:'active', history:[], rewards:{}, pendingRewardId:null, pendingAcquisition:false, championId:null};
}
export function getUserMatch(tournament) {
  return tournament.rounds[tournament.roundIndex].matches.find(m=>m.homeId===USER_TEAM_ID || m.awayId===USER_TEAM_ID);
}
export function getNextOpponent(tournament) {
  const match=getUserMatch(tournament);
  return match ? tournament.teams[match.homeId===USER_TEAM_ID?match.awayId:match.homeId] : null;
}
/** Instant NPC execution of the same sporting engine, without UI or timers. */
export function simulateQuickMatch(home,away,rng) {
 const match=new MatchEngine({userTeam:{name:home.name,starters:home.startingXI,bench:home.bench||[],formationId:home.formation||'4-3-3',coachId:home.coachId??null,captainId:home.captainId??null,leadershipEnabled:home.leadershipEnabled},rivalTeam:away,userChemistry:home.chemistry??100,seed:Math.floor(rng()*4294967296)});
 match.userAutoSubstitutions=true;match.userAutoTactics=true;
 match.userTactic=home.tactic||'BALANCED';
 for(const p of match.userStarters)p.matchChemistry=10;
 while(!match.isFinished)match.tick();
 const performances=[match.playerPerformance,match.rivalPerformance];
 [true,false].forEach((side,i)=>{for(const p of match.getAllPlayers(side))if(performances[i][p.id])performances[i][p.id].finalEnergy=p.energy;});
 return {homeScore:match.userScore,awayScore:match.rivalScore,penalties:match.penalties?{home:match.penalties.user,away:match.penalties.rival}:null,duration:match.minute,extraTime:match.extraTime,performances};
}

function winner(match) {
  const r=match.result;
  return (r.homeScore>r.awayScore || (r.penalties && r.penalties.home>r.penalties.away)) ? match.homeId : match.awayId;
}
export function resolveOtherMatches(tournament,roundIndex=tournament.roundIndex,{legacy=false}={}) {
  const round=tournament.rounds[roundIndex];
  for(const match of round.matches) if(!match.result && match.homeId!==USER_TEAM_ID && match.awayId!==USER_TEAM_ID) {
    const teams=[tournament.teams[match.homeId],tournament.teams[match.awayId]];
    const {performances,...result}=(legacy?simulateLegacyQuickMatch:simulateQuickMatch)(...teams,tournament.rng);
    match.result=result;match.winnerId=winner(match);
    teams.forEach((team,i)=>{
      team.campaignStats ||= {};
      accumulatePlayerStats(team.campaignStats,{playerPerformance:performances[i],roundLabel:round.label},{});
      [...team.startingXI,...(team.bench||[])].forEach(p=>{const record=performances[i][p.id];if(record)p.energy=legacy?Math.max(10,(p.energy??100)-result.duration*legacyStaminaDrain(p)):record.finalEnergy;});
    });
  }
}
/** Finish only outstanding NPC ties; retain the user's exit round and personal history. */
export function completeEliminatedTournament(tournament,{legacy=false}={}) {
  if(tournament?.status!=='eliminated') return false;
  const final=tournament.rounds.at(-1).matches[0];
  if(tournament.rounds.every(r=>r.matches.every(m=>m.result))&&tournament.championId===final.winnerId) return false;
  for(let r=0;r<tournament.rounds.length;r++) {
    const round=tournament.rounds[r];
    if(round.matches.some(m=>!m.result&&(!m.homeId||!m.awayId||m.homeId===USER_TEAM_ID||m.awayId===USER_TEAM_ID))) throw Error('Cuadro eliminado incompleto o incoherente');
    resolveOtherMatches(tournament,r,{legacy});
    const next=tournament.rounds[r+1];
    if(next) for(let i=0;i<next.matches.length;i++) {
      const match=next.matches[i],home=round.matches[i*2].winnerId,away=round.matches[i*2+1].winnerId;
      if((match.homeId!==null&&match.homeId!==home)||(match.awayId!==null&&match.awayId!==away)) throw Error('Avance del cuadro inconsistente');
      if(!match.result){match.homeId=home;match.awayId=away;}
    }
  }
  tournament.championId=final.winnerId;
  return true;
}
/** v1 derived presentation for legacy finals; never mutate a saved tournament or its RNG. */
export function completedTournamentProjection(tournament) {
  if(tournament?.status!=='eliminated'||tournament.rounds.every(r=>r.matches.every(m=>m.result))) return {tournament,projected:false};
  if(typeof tournament.rng?.getState!=='function') return {tournament,projected:false,unavailable:true};
  const copy=structuredClone({...tournament,rng:null});copy.rng=createRng(tournament.seed);copy.rng.setState(tournament.rng.getState());
  completeEliminatedTournament(copy,{legacy:true});
  return {tournament:copy,projected:true,version:1};
}
export function recordRoundResult(tournament,result,{completeOnElimination=true}={}) {
  if(tournament.status!=='active') return false;
  const match=getUserMatch(tournament);
  if(!match || match.result) return false;
  const userHome=match.homeId===USER_TEAM_ID;
  match.result={duration:result.duration,extraTime:result.extraTime,homeScore:userHome?result.userScore:result.rivalScore,awayScore:userHome?result.rivalScore:result.userScore,penalties:result.penalties?{home:userHome?result.penalties.user:result.penalties.rival,away:userHome?result.penalties.rival:result.penalties.user}:null};
  match.winnerId=winner(match);
  tournament.history.push({...(result.initialForecast?{initialForecast:structuredClone(result.initialForecast)}:{}),roundIndex:tournament.roundIndex,label:tournament.rounds[tournament.roundIndex].label,duration:result.duration,extraTime:result.extraTime,opponentId:getNextOpponent(tournament).id,userScore:result.userScore,rivalScore:result.rivalScore,penalties:result.penalties,userWon:match.winnerId===USER_TEAM_ID});
  resolveOtherMatches(tournament);
  const next=tournament.rounds[tournament.roundIndex+1];
  if(next) for(let i=0;i<next.matches.length;i++) {
    next.matches[i].homeId=tournament.rounds[tournament.roundIndex].matches[i*2].winnerId;
    next.matches[i].awayId=tournament.rounds[tournament.roundIndex].matches[i*2+1].winnerId;
  }
  if(match.winnerId!==USER_TEAM_ID) tournament.status='eliminated';
  else if(next) createVictoryReward(tournament,match,getNextOpponent(tournament).id);
  else {tournament.status='champion';tournament.pendingAcquisition=false;tournament.pendingRewardId=null;}
  if(!next) tournament.championId=match.winnerId;
  if(completeOnElimination) completeEliminatedTournament(tournament);
  return true;
}
export function advanceTournament(tournament) {
  if(tournament.status!=='active' || tournament.pendingAcquisition || !getUserMatch(tournament)?.result) return false;
  if(tournament.roundIndex===tournament.rounds.length-1) tournament.status='champion';
  else tournament.roundIndex++;
  return true;
}
