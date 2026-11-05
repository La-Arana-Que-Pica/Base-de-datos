// Frozen pre-Phase8 projection v1. Read-only compatibility, never used by new matches.
import {resolveShootout} from './penalties.js';
const config={TOURNAMENT:{NPC_AVERAGE_STRENGTH_FACTOR:.99},EXTRA_TIME_END:120,POSSESSION_MODEL:{SEQUENCES_PER_MINUTE:2}};
const bound=(v,l,h)=>Math.max(l,Math.min(h,v));
const getPositionFit=()=>({chemistryMultiplier:1});
const score=(p,gk=false)=>{
 const energy=bound(p.energy??100,0,100),isGK=(p.slotPosition||p.primaryPosition)==='GK';
 const fatigue=1-(isGK?.16:.22)*(Math.max(0,(isGK?50:80)-energy)/(isGK?50:80))**1.4;
 return bound((gk?.85*(p.overall??70)+.15*(p.goalkeeping??p.overall??70):p.overall??70)+3,1,99)*fatigue*(p.injured?.45:1)*(p.sentOff?0:1);
};
function calculateTeamRatings(xi){const roles={Attack:['CF','SS','LWF','RWF','AMF'],Midfield:['DMF','CMF','LMF','RMF','AMF'],Defense:['CB','LB','RB','DMF'],Goalkeeper:['GK']};return Object.fromEntries(Object.entries(roles).map(([key,rs])=>{const pool=xi.filter(p=>rs.includes(p.slotPosition||p.primaryPosition));const list=pool.length?pool:xi;return ['effective'+key,list.reduce((s,p)=>s+score(p,key==='Goalkeeper'),0)/list.length];}));}
const tactics={DEFENSIVE:{control:.94,build:.93,organization:1.065,depth:.92,counter:.07},BALANCED:{control:1,build:1,organization:1,depth:1,counter:0},OFFENSIVE:{control:1.035,build:1.06,organization:.94,depth:1.06,counter:0}};
function possessionPowers(m,ratings){return Object.fromEntries(['user','rival'].map(side=>{const r=ratings[side],t=tactics[m[side+'Tactic']]||tactics.BALANCED,q=m[side==='user'?'initialUserChemistry':'initialRivalChemistry'],chem=1+(q-50)/50*(q>=50?.035:.045);return [side,{control:r.mid*chem*t.control,construction:(r.mid*.65+r.att*.35)*chem*t.build,organization:(r.def*.9+r.mid*.1)*chem*t.organization,depth:r.att*t.depth,tactic:t}];}));}
const controlProbability=p=>bound(1/(1+Math.exp(-(p.user.control-p.rival.control)/30)),.22,.78);
const constructionProbability=(a,d)=>bound(.54+(a.construction-d.organization)*.0035,.28,.80);
const breachProbability=(a,d)=>bound(.30+(a.depth-d.organization)*.004,.10,.62);
const clearChanceProbability=(a,d)=>bound(.25+(a.depth-d.organization)*.004+a.tactic.counter,.10,.50);
const targetProbability=(q,c=false)=>bound(.50+(q-80)*.003+(c?.13:0),.05,.95);
const goalProbability=(q,g,c=false)=>bound(.22+(q-g)*.004+(c?.13:0),.05,.95);
const shotProbability=(a,d)=>bound(.76+(a-d)*.003,.05,.95);
export function legacyStaminaDrain(p){const r=p.slotPosition||p.primaryPosition,factor=(75/(Number(p.stamina)>0?p.stamina:75))**1.7;return r==='GK'?.08*factor:.5*factor*({CB:.95,DMF:1.03,CMF:1.05,LB:1.04,RB:1.04,LMF:1.04,RMF:1.04}[r]??1);}
function poisson(lambda,rng) {
  const limit=Math.exp(-lambda); let product=1, count=0;
  do { count++; product*=rng(); } while(product>limit);
  return count-1;
}
/** Aggregate expected opportunities; no NPC clock or minute-by-minute simulation. */
export function simulateLegacyQuickMatch(home,away,rng) {
  const ratings = [home,away].map(t=>calculateTeamRatings(t.startingXI.map(p=>({...p,matchChemistry:10*getPositionFit(p,p.slotPosition||p.primaryPosition).chemistryMultiplier})),t.chemistry??100,'BALANCED',true));
  const factor=config.TOURNAMENT.NPC_AVERAGE_STRENGTH_FACTOR;
  const power=ratings.map(r=>({att:r.effectiveAttack*factor,mid:r.effectiveMidfield*factor,def:r.effectiveDefense*factor,gk:r.effectiveGoalkeeper*factor}));
  // Preserve the aggregate NPC contract, using the same sporting stage probabilities.
  const powers=possessionPowers({userTactic:home.tactic||'BALANCED',rivalTactic:away.tactic||'BALANCED',initialUserChemistry:home.chemistry??100,initialRivalChemistry:away.chemistry??100,userScore:0,rivalScore:0,minute:45},{user:power[0],rival:power[1]});
  const control=controlProbability(powers),retention=.18;
  // Completed possessions hand the ball over; use the stationary control share.
  const ownership=((1-retention)*control+retention)/(1+retention);
  const expectedGoals=(i,minutes)=>{
    const a=power[i],b=power[1-i],attack=i===0?powers.user:powers.rival,defense=i===0?powers.rival:powers.user;
    const chances=minutes*config.POSSESSION_MODEL.SEQUENCES_PER_MINUTE*(i===0?ownership:1-ownership)*constructionProbability(attack,defense)*breachProbability(attack,defense);
    const clear=clearChanceProbability(attack,defense),low=.18;
    const conversion=clear*targetProbability(a.att,true)*goalProbability(a.att,b.gk,true)+(1-clear-low)*targetProbability(a.att)*goalProbability(a.att,b.gk)+low*.85*.70*targetProbability(a.att)*goalProbability(a.att,b.gk);
    return chances*shotProbability(a.att,b.def)*conversion;
  };
  const goals=power.map((_,i)=>poisson(expectedGoals(i,90),rng));
  let penalties=null, duration=90, extraTime=false;
  if(goals[0]===goals[1]) {
    extraTime=true;duration=config.EXTRA_TIME_END;
    power.forEach((_,i)=>{goals[i]+=poisson(expectedGoals(i,30),rng);});
    if(goals[0]===goals[1]) penalties=resolveShootout(home.startingXI,away.startingXI,rng);
  }
  const performances=[];
  [home,away].forEach((team,i)=>{
    const records=Object.fromEntries(team.startingXI.map(p=>[p.id,{id:p.id,name:p.name,minutes:duration,goals:0,benchEntries:0,rating:6,position:p.slotPosition||p.primaryPosition}]));
    const attackers=team.startingXI.filter(p=>['CF','SS','LWF','RWF','AMF'].includes(p.slotPosition||p.primaryPosition));
    const pool=attackers.length?attackers:team.startingXI;
    for(let g=0;g<goals[i];g++){const p=pool[Math.floor(rng()*pool.length)];records[p.id].goals++;records[p.id].rating=Math.min(10,records[p.id].rating+.55);}
    performances.push(records);
  });
  return {homeScore:goals[0],awayScore:goals[1],penalties,duration,extraTime,performances};
}
