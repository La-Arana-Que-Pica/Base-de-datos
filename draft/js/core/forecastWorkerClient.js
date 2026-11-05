// Advisory display only. Never receives a private seed, profile, balance,
// operation or SDK. Worker output is never an authoritative command argument.
const cache=new Map(),pending=new Map();
export function advisoryForecast(input,onReady=()=>{},scope=''){
 const key=scope+'|'+JSON.stringify(input);if(cache.has(key))return cache.get(key);
 if(pending.has(key)||typeof Worker==='undefined')return null;
 const worker=new Worker(new URL('./forecastWorker.js',import.meta.url),{type:'module'});
 let settled=false;const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();pending.delete(key);cache.set(key,result);while(cache.size>8)cache.delete(cache.keys().next().value);onReady(result);};
 const timer=setTimeout(()=>finish(null),15000);pending.set(key,worker);
 worker.onmessage=event=>finish(event.data?.ok?event.data.result:null);worker.onerror=()=>finish(null);
 try{worker.postMessage(structuredClone(input));}catch{finish(null);}return null;
}
export function planningForecastInput(state){return {starters:state.getStartingXIList(),bench:state.benchList,formationId:state.formationId,chemistry:state.chemistry.score,rival:state.rivalSquad,coachId:state.staff?.coachId??null,captainId:state.matchCaptain?.()?.id??null};}
export function kickoffForecastInput(m,rival){return {starters:m.userStarters,bench:m.userBench,formationId:m.formationId,chemistry:m.userChemistry,rival:{...rival,startingXI:m.rivalStarters,bench:m.rivalBench,tactic:m.rivalTactic},coachId:m.coaches.user,captainId:m.captains.user,tactic:m.userTactic,intensity:m.userIntensity,setPieces:m.setPieces.user,frozenChemistry:{user:Object.fromEntries(m.userStarters.map(p=>[String(p.id),p.matchChemistry])),rival:Object.fromEntries(m.rivalStarters.map(p=>[String(p.id),p.matchChemistry]))}};}
