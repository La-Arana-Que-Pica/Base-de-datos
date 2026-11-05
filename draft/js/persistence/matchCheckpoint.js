import {MatchEngine,createRng} from '../core/matchEngine.js';
import {DRAFT_CONFIG} from '../config.js';
import {getPlayerById} from '../data/adapter.js';
import {DATA_REVISION} from './campaignSnapshot.js';
import {canonical,digest,identity,recordId,fail} from '../personal/format.js';
export const MATCH_FORMAT='laqp-draft-match',MATCH_VERSION=1,MATCH_RULES='reform-2026-10-v1';
const certified=new WeakSet();
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const runtime=new Set(['rng','playback','onTick','onEvent','onFinish','onRemoteError','timerId']);
const credential=/^(access_?token|refresh_?token|id_token|authorization|service_?role(_?key)?|anon_?key|supabase_?key|api_?key|password|session|sessions|jwt)$/i;
const forbidden=new Set(['__proto__','prototype','constructor']);
const DISPLAY_KEYS=['view','visibleFrame','frame','queue','decisionJournal','pendingResult','eventCounter','lastChanceMinute','halftimeReady','shootoutReady','shootout','shootoutHistory','shootoutBuildView','narrativeHistory','suspense','speed','simpleAnimations','reducedMotion','skipRequested'];
const kinds=new Set(['event','scene-stage','scene-result','shootout-stage','shootout-result','shootout-reveal','shootout-gap','shootout-final','suspense']);
// A bounded reference graph preserves aliases, Sets, Maps, undefined and nonfinite
// sentinels. Catalog scalars are referenced; mutable player state is never inferred.
export function encodeMatchGraph(root,{events=null}={}){
 const nodes=[],seen=new Map(),journals=new WeakMap(),keys=[],keyIds=new Map();const keyId=k=>{if(!keyIds.has(k)){keyIds.set(k,keys.length);keys.push(k);}return keyIds.get(k);};
 function value(v,depth=0){
  if(depth>90)fail('DEPTH','Estado deportivo demasiado profundo');
  if(v===undefined)return {u:1};if(typeof v==='number'&&!Number.isFinite(v))return {n:String(v)};
  if(v===null||['string','boolean','number'].includes(typeof v))return v;
  if(typeof v!=='object')fail('MATCH_FORMAT','Valor deportivo ejecutable');
  if(seen.has(v))return {r:seen.get(v)};if(nodes.length>=100000)fail('SIZE','Demasiados objetos deportivos');
  const own=Object.getOwnPropertyDescriptors(v);if(Object.getOwnPropertySymbols(v).length||Object.entries(own).some(([k,d])=>!('value'in d)||credential.test(k)||forbidden.has(k)))fail('MATCH_FORMAT','Propiedad ejecutable o privada');if(Array.isArray(v)&&(Object.keys(v).length!==v.length||Object.keys(own).length!==v.length+1))fail('MATCH_FORMAT','Array deportivo inválido');if((v instanceof Map||v instanceof Set)&&Object.keys(own).length)fail('MATCH_FORMAT','Propiedad adicional en colección');
  const ref=nodes.length;seen.set(v,ref);nodes.push(null);let node;
  if(journals.has(v))node={t:'events',v:[],cursor:journals.get(v),count:v.length};
  else if(v instanceof Set)node={t:'set',v:[...v].map(x=>value(x,depth+1))};
  else if(v instanceof Map)node={t:'map',v:[...v].map(([k,x])=>[value(k,depth+1),value(x,depth+1)])};
  else if(Array.isArray(v))node={t:'array',v:Array.from(v,x=>value(x,depth+1))};
  else{
   const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null&&proto!==MatchEngine.prototype)fail('MATCH_FORMAT','Tipo deportivo incompatible');
   if(proto===MatchEngine.prototype&&events&&Array.isArray(v.events)&&v.events!==events&&v.events.length<=events.length){const cursor=events.length-v.events.length;if(JSON.stringify(v.events)===JSON.stringify(events.slice(cursor)))journals.set(v.events,cursor);}
   const base=v.id&&v.name&&Array.isArray(v.naturalPositions)?getPlayerById(String(v.id)):null;
   node={t:proto===MatchEngine.prototype?'view':base?'player':'object',v:[]};
   if(base&&node.t==='player'){node.id=String(v.id);node.omit=Object.keys(base).filter(k=>!Object.hasOwn(v,k));}
   if(Object.getOwnPropertySymbols(v).length)fail('MATCH_FORMAT','Propiedad simbólica');
   for(const k of Object.getOwnPropertyNames(v)){
    if(forbidden.has(k))fail('MATCH_FORMAT','Clave deportiva insegura');
    const d=own[k];if(!d.enumerable||!('value'in d))fail('MATCH_FORMAT','Accesor deportivo no permitido');
    if(base&&node.t==='player'&&Object.hasOwn(base,k)&&typeof d.value!=='object'&&typeof d.value!=='function'&&Object.is(d.value,base[k]))continue;
    node.v.push(keyId(k),value(d.value,depth+1));
   }
  }
  nodes[ref]=node;return {r:ref};
 }
 const rootRef=value(root);return {root:rootRef,nodes,keys,journal:events?seen.get(events):null};
}
export function decodeMatchGraph(graph){
 if(!graph||!Array.isArray(graph.keys)||graph.keys.length>4096||graph.keys.some(k=>typeof k!=='string'||forbidden.has(k)||credential.test(k))||!Array.isArray(graph.nodes)||graph.nodes.length>100000)fail('MATCH_FORMAT','Grafo deportivo inválido');
 const nodes=graph.nodes,objects=nodes.map(n=>{
  if(!n||!Array.isArray(n.v))fail('MATCH_FORMAT','Nodo deportivo inválido');
  if(n.t==='array'||n.t==='events')return [];if(n.t==='set')return new Set();if(n.t==='map')return new Map();
  if(n.t==='player'){const p=getPlayerById(n.id);if(!p||!Array.isArray(n.omit)||n.omit.some(k=>!Object.hasOwn(p,k)))fail('MATCH_CATALOG','Futbolista incompatible');const copy={...p};for(const k of n.omit)delete copy[k];return copy;}
  if(n.t==='view')return Object.create(MatchEngine.prototype);if(n.t==='object')return {};fail('MATCH_FORMAT','Tipo de nodo desconocido');
 });
 function val(v){
  if(v===null||['number','string','boolean'].includes(typeof v))return v;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==1)fail('MATCH_FORMAT','Referencia inválida');
  if(v.u===1)return undefined;
  if(Object.hasOwn(v,'n')){if(!['Infinity','-Infinity','NaN'].includes(v.n))fail('MATCH_FORMAT','Número especial inválido');return Number(v.n);}
  if(Number.isInteger(v.r)&&v.r>=0&&v.r<objects.length)return objects[v.r];fail('MATCH_FORMAT','Referencia fuera del grafo');
 }
 nodes.forEach((n,i)=>{const o=objects[i];if(n.t==='array')for(const v of n.v)o.push(val(v));
  else if(n.t==='events')return;
  else if(n.t==='set')for(const v of n.v)o.add(val(v));
  else if(n.t==='map'){for(const pair of n.v){if(!Array.isArray(pair)||pair.length!==2)fail('MATCH_FORMAT','Entrada inválida');o.set(val(pair[0]),val(pair[1]));}}else{if(n.v.length%2)fail('MATCH_FORMAT','Propiedades incompletas');const used=new Set();for(let j=0;j<n.v.length;j+=2){const index=n.v[j],key=graph.keys[index];if(!Number.isInteger(index)||typeof key!=='string'||forbidden.has(key)||used.has(key)||n.t==='view'&&typeof MatchEngine.prototype[key]==='function')fail('MATCH_FORMAT','Propiedad deportiva inválida');used.add(key);o[key]=val(n.v[j+1]);}}
 });for(let i=0;i<nodes.length;i++){const n=nodes[i];if(n.t!=='events')continue;const source=objects[graph.journal];if(!Array.isArray(source)||!Number.isInteger(n.cursor)||!Number.isInteger(n.count)||n.cursor<0||n.count<0||n.cursor+n.count!==source.length)fail('MATCH_FORMAT','Cursor del relato inválido');objects[i].push(...structuredClone(source.slice(n.cursor)));}return val(graph.root);
}
const requiredEngineFields=["coaches","leadershipEnabled","captains","pregameOverall","entryMinutes","coachTelemetry","seed","sportModelVersion","roundLabel","playerPerformance","rivalPerformance","initialBenchIds","rivalChemistry","initialRivalChemistry","rivalFormation","rivalTactic","userSentOff","rivalSentOff","rivalBench","extraTime","userTeamName","rivalTeamName","rivalCrest","userChemistry","initialUserChemistry","formationId","departedIds","rivalDepartedIds","rivalInitialBenchIds","rivalSubstitutionsUsed","rivalSubstitutionWindowsUsed","rivalSubstitutionWindowOpen","rivalLastSubstitutionMinute","userStarters","userBench","rivalStarters","userGraphSlots","kickoffUserMap","planningSquads","userTactic","userIntensity","rivalIntensity","rivalLastTacticalMinute","setPieces","substitutionsUsed","substitutionWindowsUsed","substitutionWindowOpen","halftimePending","halftimeCompleted","requiresHalftimeConfirmation","minute","userScore","rivalScore","isPaused","isFinished","penalties","shootoutPending","requiresShootoutSelection","shootoutOrder","stats","events","actions","actionCounter","possessionOwner","pendingCorner","duelModelVersion","duelTrends","lastDuelNarration","transitionTeam"];
export function validateLiveMatch(m){
 if(!m||requiredEngineFields.some(k=>!Object.hasOwn(m,k))||Object.keys(m).some(k=>runtime.has(k)||typeof MatchEngine.prototype[k]==='function'))fail('MATCH_STATE','Campos de motor incompletos o ejecutables');
 if(!m||m.sportModelVersion!==MATCH_RULES||!Number.isSafeInteger(m.seed)||!Number.isInteger(m.minute)||m.minute<0||m.minute>120)fail('MATCH_RULES','Estado o reglas del partido incompatibles');
 for(const k of ['userScore','rivalScore','substitutionsUsed','substitutionWindowsUsed','rivalSubstitutionsUsed','rivalSubstitutionWindowsUsed'])if(!Number.isSafeInteger(m[k])||m[k]<0||m[k]>(k.includes('Windows')?3:k.includes('Substitutions')||k==='substitutionsUsed'?5:200))fail('MATCH_STATE','Marcador o sustituciones inválidas');
 for(const k of ['isFinished','isPaused','extraTime','halftimePending','halftimeCompleted','shootoutPending','substitutionWindowOpen','rivalSubstitutionWindowOpen'])if(typeof m[k]!=='boolean')fail('MATCH_STATE','Etapa deportiva incompleta');
 for(const k of ['departedIds','rivalDepartedIds','initialBenchIds','rivalInitialBenchIds'])if(!(m[k] instanceof Set))fail('MATCH_STATE','Conjunto deportivo incompleto');
 for(const side of ['user','rival']){
  const xi=m[side+'Starters'],bench=m[side+'Bench'];if(!Array.isArray(xi)||!Array.isArray(bench)||xi.length>11||xi.length<0||bench.length>23)fail('MATCH_STATE','Alineación inválida');
  const ids=new Set();for(const p of [...xi,...bench]){if(!p||!p.id||!Array.isArray(p.naturalPositions)||!Number.isFinite(p.overall)||!Number.isFinite(p.energy)||p.energy<0||p.energy>100||ids.has(String(p.id)))fail('MATCH_STATE','Futbolista duplicado o inválido');ids.add(String(p.id));}
 }
 if(!m.stats||!m.playerPerformance||!m.rivalPerformance||!Array.isArray(m.events)||!Array.isArray(m.actions))fail('MATCH_STATE','Estadísticas incompletas');
 for(const v of Object.values(m.stats))if(!Number.isFinite(v)||v<0)fail('MATCH_STATE','Estadística inválida');
 if(m.shootoutPending&&(!m.extraTime||m.minute!==120||m.isFinished||m.shootoutOrder!==null))fail('MATCH_STATE','Selección de penales incoherente');
 if(m.penalties&&(!m.isFinished||!Array.isArray(m.penalties.kicks)||m.shootoutOrder===null))fail('MATCH_STATE','Tanda incoherente');
 return m;
}
export function captureMatchCheckpoint(playback,context){
 const m=playback.match;if(m.authoritative||playback.advancing||playback.capturing||playback.disposed)fail('MATCH_BUSY','No hay un límite deportivo consistente');
 const properties=Object.getOwnPropertyDescriptors(m);if(Object.values(properties).some(d=>!('value'in d)))fail('MATCH_FORMAT','Accesor de motor no permitido');const engine=Object.fromEntries(Object.entries(properties).filter(([k])=>!runtime.has(k)).map(([k,d])=>[k,d.value]));
 for(const key of Object.keys(engine))if(typeof MatchEngine.prototype[key]==='function')fail('MATCH_FORMAT','Método en el estado del motor');
 const keys=DISPLAY_KEYS;
 const display=Object.fromEntries(keys.map(k=>[k,playback[k]]));if(!playback.queue.length&&!playback.suspense){display.frame=null;display.visibleFrame=display.view;}
 const checkpoint={format:MATCH_FORMAT,version:MATCH_VERSION,rules:MATCH_RULES,catalog:DATA_REVISION,...context,rng:m.rng.getState(),minute:m.minute,graph:encodeMatchGraph({engine,display},{events:m.events})};
 validateLiveMatch(engine);identity(checkpoint.owner);for(const k of ['runId','campaignId','encounterId'])recordId(checkpoint[k]);if(!['CLASSIC','CAREER','SURVIVAL','SURVIVAL_DREAM'].includes(checkpoint.mode)||!['EUROPA','AMERICA'].includes(checkpoint.region))fail('MATCH_STATE','Contexto inválido');freeze(checkpoint);certified.add(checkpoint);return checkpoint;
}
export function validateMatchCheckpoint(c,expected={}){
 if(!c||c.format!==MATCH_FORMAT||c.version!==MATCH_VERSION||c.rules!==MATCH_RULES||c.catalog!==DATA_REVISION)fail('MATCH_VERSION','Versión de partido incompatible');
 canonical(c,{bytes:4*1024*1024,depth:96,nodes:1000000,records:100000});identity(c.owner);for(const k of ['runId','campaignId','encounterId'])recordId(c[k]);
 if(!['CLASSIC','CAREER','SURVIVAL','SURVIVAL_DREAM'].includes(c.mode)||!['EUROPA','AMERICA'].includes(c.region)||!Number.isInteger(c.rng)||c.rng<0||c.rng>4294967295)fail('MATCH_STATE','Contexto deportivo inválido');
 for(const [k,v] of Object.entries(expected))if(c[k]!==v)fail('OWNER','El partido pertenece a otra campaña o perfil');
 const {engine,display}=decodeMatchGraph(c.graph);validateLiveMatch(engine);if(c.minute!==engine.minute)fail('MATCH_STATE','Minuto inconsistente');
 if(!display||Object.keys(display).some(k=>!DISPLAY_KEYS.includes(k))||DISPLAY_KEYS.some(k=>!Object.hasOwn(display,k))||!Array.isArray(display.queue)||display.queue.length>20000||display.queue.some(e=>!e||!kinds.has(e.kind))||!Array.isArray(display.decisionJournal)||!Array.isArray(display.shootoutHistory)||!display.view||!Number.isInteger(display.eventCounter)||display.eventCounter<0)fail('MATCH_PRESENTATION','Presentación incompleta');
 if(!DRAFT_CONFIG.PLAYBACK.SPEEDS.includes(display.speed)||['simpleAnimations','reducedMotion','skipRequested','halftimeReady','shootoutReady'].some(k=>typeof display[k]!=='boolean')||!(display.lastChanceMinute===-Infinity||Number.isInteger(display.lastChanceMinute)&&display.lastChanceMinute>=0&&display.lastChanceMinute<=120)||['userScore','rivalScore'].some(k=>!Number.isSafeInteger(display.view[k])||display.view[k]<0))fail('MATCH_PRESENTATION','Controles o marcador visual inválidos');
 if(!Number.isInteger(display.view.minute)||display.view.minute<0||display.view.minute>engine.minute||display.view.userScore>engine.userScore||display.view.rivalScore>engine.rivalScore)fail('MATCH_PRESENTATION','Vista y motor incoherentes');
 if(display.pendingResult&&(display.pendingResult.userScore!==engine.userScore||display.pendingResult.rivalScore!==engine.rivalScore||display.pendingResult.duration!==engine.minute||display.pendingResult.userWon!==(engine.userScore>engine.rivalScore||Boolean(engine.penalties&&engine.penalties.user>engine.penalties.rival))))fail('MATCH_STATE','Resultado pendiente incoherente');
 if(engine.isFinished&&!display.pendingResult)fail('MATCH_STATE','Resultado pendiente ausente');
 return {engine,display};
}
export function restoreMatchCheckpoint(c,expected={}){
 const {engine,display}=validateMatchCheckpoint(c,expected),match=Object.assign(Object.create(MatchEngine.prototype),engine,{timerId:null,playback:null,onTick:null,onEvent:null,onFinish:null});
 match.rng=createRng(match.seed);match.rng.setState(c.rng);match.isPaused=true;return {match,display};
}
export async function sealMatchCheckpoint(checkpoint){if(!certified.has(checkpoint))validateMatchCheckpoint(checkpoint);const text=canonical(checkpoint,{bytes:4*1024*1024,depth:96,nodes:1000000,records:100000}),bytes=new TextEncoder().encode(text),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');return {checkpoint,hash,bytes:bytes.byteLength};}
export async function verifyMatchCheckpoint(sealed,expected={}){if(!sealed||await digest(sealed.checkpoint)!==sealed.hash)fail('INTEGRITY','Checkpoint deportivo dañado');return validateMatchCheckpoint(sealed.checkpoint,expected);}
