import { MatchEngine } from './matchEngine.js';
import {coordination} from './possessionModel.js';
import {advisoryForecast,planningForecastInput} from './forecastWorkerClient.js';

// A small, fixed sample keeps the preview responsive and independent of the tournament RNG.
export const PREVIEW_SIMULATIONS = 64;
const SEED_BASE = 0x51a2d;
const SEED_STEP = 0x9e3779b1;
let cachedKey = null;
let cachedResult = null;

function playerKey(player) {
  return [player.id, player.slotId, player.slotPosition, player.overall, player.energy,
    player.injured, player.stamina, player.hasSuperSub,player.primaryPosition,player.naturalPositions?.join(','),player.lowPass,player.loftedPass,player.finishing,player.controlledSpin,player.kickingPower,player.defensiveProwess,player.ballWinning,player.goalkeeping,player.slotX,player.slotY,player.age,player.hasCaptaincy,player.originalOverall,player.sourcePlayerId,JSON.stringify(player.pesStats??null)].join(':');
}

function estimateKey(starters, bench, formationId, chemistry, rival) {
  return JSON.stringify([formationId, chemistry, starters.map(playerKey), bench.map(playerKey),
    rival.id, rival.coachId, rival.chemistry, rival.tactic, rival.startingXI.map(playerKey),(rival.bench||[]).map(playerKey)]);
}

function shortObservations(starters, chemistry, rival,formationId,coachId,captainId) {
  const preview=new MatchEngine({userTeam:{starters,bench:[],formationId,coachId,captainId},rivalTeam:rival,userChemistry:chemistry,seed:SEED_BASE});
  const ratings=preview.getEffectiveRatings();
  const pack=r=>({effectiveAttack:r.att,effectiveMidfield:r.mid,effectiveDefense:r.def,effectiveGoalkeeper:r.gk});
  const own=pack(ratings.user),theirs=pack(ratings.rival);
  const candidates = [
    ['effectiveAttack', 'Tu ataque llega con ventaja.', 'El ataque rival presenta ventaja.'],
    ['effectiveMidfield', 'Tu mediocampo llega con ventaja.', 'El mediocampo rival presenta ventaja.'],
    ['effectiveDefense', 'Tu defensa llega con ventaja.', 'La defensa rival presenta ventaja.'],
    ['effectiveGoalkeeper', 'Tu arquero llega con ventaja.', 'El arquero rival presenta ventaja.']
  ].map(([key, positive, negative]) => ({ difference: own[key] - theirs[key], positive, negative }));
  const chemistryDifference = (coordination(chemistry) - coordination(rival.chemistry ?? 50)) * 100;
  candidates.push({ difference: chemistryDifference, positive: 'Tus conexiones de química favorecen al equipo.', negative: 'El rival tiene mejores conexiones de química.' });
  const averageEnergy = players => players.reduce((sum, player) => sum + (player.energy ?? 100), 0) / players.length;
  const energyDifference = (averageEnergy(starters) - averageEnergy(rival.startingXI)) / 4;
  candidates.push({ difference: energyDifference, positive: 'Tu XI llega con más energía.', negative: 'El XI rival llega con más energía.' });
  const observations = candidates.filter(item => Math.abs(item.difference) >= 3)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)).slice(0, 3)
    .map(item => item.difference > 0 ? item.positive : item.negative);
  return observations.length ? observations : ['Los dos equipos llegan con fuerzas similares.'];
}

export function estimateQualification({ starters, bench = [], formationId, chemistry, rival, coachId=null,captainId=null, tactic='BALANCED', intensity='NORMAL', setPieces=null, frozenChemistry=null, simulations = PREVIEW_SIMULATIONS }) {
  if (starters.length !== 11 || rival?.startingXI?.length !== 11) return null;
  let advances = 0, initialForces=null;
  const regulation = {win:0,draw:0,loss:0};
  for (let index = 0; index < simulations; index++) {
    const match = new MatchEngine({
      userTeam: { starters, bench, formationId,coachId,captainId }, rivalTeam: rival, userChemistry: chemistry,
      seed: (SEED_BASE + Math.imul(index, SEED_STEP)) >>> 0
    });
    if(frozenChemistry)for(const side of ['user','rival'])for(const p of match.players(side==='user'))if(Object.hasOwn(frozenChemistry[side]||{},String(p.id)))p.matchChemistry=frozenChemistry[side][String(p.id)];
    match.userTactic=tactic;match.userIntensity=intensity;if(setPieces)match.configureSetPieces(setPieces);
    if(index===0){const ratings=match.getEffectiveRatings();initialForces=Object.fromEntries(Object.entries(ratings).map(([side,r])=>[side,Math.round((r.att*.25+r.mid*.30+r.def*.30+r.gk*.15)*10)/10]));}
    while (!match.isFinished) {
      match.tick();
      if(match.minute===90) regulation[match.userScore>match.rivalScore?'win':match.userScore===match.rivalScore?'draw':'loss']++;
    }
    if (match.userScore > match.rivalScore || (match.penalties && match.penalties.user > match.penalties.rival)) advances++;
  }
  // One prior win and loss prevent a small sample from claiming certainty.
  const raw = (advances + 1) / (simulations + 2) * 100;
  const userPercent = Math.max(5, Math.min(95, Math.round(raw / 5) * 5));
  const verdict = userPercent >= 70 ? 'Muy favorito' : userPercent >= 55 ? 'Ligero favorito'
    : userPercent > 45 ? 'Partido parejo' : userPercent > 30 ? 'Ligero desfavorecido' : 'Muy desfavorecido';
  return { initialForces, userPercent, rivalPercent: 100 - userPercent, verdict,
    observations: shortObservations(starters, chemistry, rival,formationId,coachId,captainId), simulations,
    regulation: regulationPercentages(Object.fromEntries(Object.entries(regulation).map(([key,n])=>[key,2*n+1])),2*simulations+3), regulationCounts: {...regulation}, prior: 'Jeffreys 0.5 por resultado', period: '90 minutos' };
}

export function getPlanningAnalysis(planningState) {
  if(planningState.accountAuthority){
    if(!planningState.rivalSquad||planningState.getStartingXIList().length!==11)return null;
    const input=planningForecastInput(planningState),owner=planningState.albumSubject,key=JSON.stringify(input);
    return advisoryForecast(input,()=>{if(planningState.accountAuthority&&planningState.albumSubject===owner&&JSON.stringify(planningForecastInput(planningState))===key)planningState.notify();},String(owner));
  }
  const rival = planningState.rivalSquad;
  if (!rival) return null;
  const starters = planningState.getStartingXIList(), bench = planningState.benchList;
  const key = estimateKey(starters, bench, planningState.formationId, planningState.chemistry.score, rival)+JSON.stringify(planningState.staff??null);
  if (key !== cachedKey) {
    cachedResult = estimateQualification({ starters, bench, formationId: planningState.formationId,
      chemistry: planningState.chemistry.score, rival,coachId:planningState.staff?.coachId,captainId:planningState.matchCaptain?.()?.id });
    cachedKey = key;
  }
  return cachedResult;
}

// Largest remainder rounding preserves exactly100 without inventing draws or victories.
export function regulationPercentages(counts,samples){
  if(!Number.isInteger(samples)||samples<1)throw new Error('Muestra inválida');
  const keys=['win','draw','loss'];
  if(keys.some(k=>!Number.isInteger(counts[k])||counts[k]<0)||keys.reduce((s,k)=>s+counts[k],0)!==samples)throw new Error('Resultados de90 minutos inconsistentes');
  const rows=keys.map((key,index)=>({key,index,raw:counts[key]/samples*100}));
  for(const row of rows)row.rounded=Math.floor(row.raw);
  const remaining=100-rows.reduce((s,row)=>s+row.rounded,0);
  const order=[...rows].sort((a,b)=>(b.raw-b.rounded)-(a.raw-a.rounded)||a.index-b.index);
  for(let i=0;i<remaining;i++)order[i].rounded++;
  return Object.fromEntries(rows.map(row=>[row.key,row.rounded]));
}
