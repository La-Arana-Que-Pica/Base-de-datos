import {getCoach} from '../data/coaches.js';
import {DRAFT_CONFIG} from '../config.js';
import {isNaturalPosition} from '../core/positions.js';
import {calculateChemistry} from '../core/chemistry.js';
import {calculateTeamRatings} from '../core/teamRating.js';
export const dreamKey=subject=>'laqp-dream-team-local-v1:'+subject;
const key=p=>String(p.cardKey||p.id);
export const dreamIdentity=p=>String(p.sourcePlayerId||p.id);
export function dreamSlots(model){return [...DRAFT_CONFIG.FORMATIONS[model.formationId].slots,...DRAFT_CONFIG.BENCH_ROLES];}
export const dreamFits=(p,slot)=>!slot.position||(slot.position==='GK'?p.primaryPosition==='GK':isNaturalPosition(p,slot.position)||(p.secondaryPositions||[]).includes(slot.position));
export function dreamModel(raw,players){const formationId=DRAFT_CONFIG.FORMATIONS[raw?.formationId]?raw.formationId:Object.keys(DRAFT_CONFIG.FORMATIONS)[0],model={version:1,formationId,slots:{},coachId:getCoach(raw?.coachId)?raw.coachId:null},used=new Set();for(const slot of dreamSlots(model)){const p=players.find(p=>key(p)===String(raw?.slots?.[slot.id])&&!p.unavailable);if(p&&!used.has(dreamIdentity(p))&&dreamFits(p,slot)){model.slots[slot.id]=key(p);used.add(dreamIdentity(p));}}return model;}
export function assignDream(model,slotId,id,players){const slot=dreamSlots(model).find(s=>s.id===slotId),p=players.find(p=>key(p)===String(id));if(!slot||!p||p.unavailable||!dreamFits(p,slot)||Object.entries(model.slots).some(([s,v])=>s!==slotId&&dreamIdentity(players.find(p=>key(p)===v)||{})===dreamIdentity(p)))return false;model.slots[slotId]=key(p);return true;}
export function dreamStats(model,players){const clean=dreamModel(model,players),starters={},bench=[];for(const slot of dreamSlots(clean)){const p=players.find(p=>key(p)===clean.slots[slot.id]);if(p){const assigned={...structuredClone(p),collectionWildcard:false,normalDreamChemistry:true,slotId:slot.id,slotPosition:slot.position||p.primaryPosition};if(slot.id.startsWith('b'))bench.push(assigned);else starters[slot.id]=assigned;}}const chemistry=calculateChemistry(clean.formationId,starters);return {starters,bench,chemistry,ratings:Object.keys(starters).length?calculateTeamRatings(Object.values(starters),chemistry.score):null};}
export function dreamReadiness(model,players){const s=dreamStats(model,players),reasons=[];if(Object.keys(s.starters).length!==11)reasons.push('Completá los 11 titulares');if(s.bench.length!==12)reasons.push('Completá los 12 suplentes (S1 debe ser arquero)');if(!getCoach(model.coachId))reasons.push('Elegí un entrenador disponible');return {ready:reasons.length===0,reasons,...s};}
