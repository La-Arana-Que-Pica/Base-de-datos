import {DRAFT_CONFIG as config} from '../config.js';

// Explicit offer-only equivalence: same back four, two CMFs, wide midfielders
// and two forwards. CF/SS roles remain distinct in the actual formations.
export const FORMATION_EQUIVALENCE_GROUPS = Object.freeze([
 Object.freeze(['4-4-2', '4-2-2-2'])
]);
export function getFormationEquivalenceKey(id) {
 return FORMATION_EQUIVALENCE_GROUPS.find(group => group.includes(id))?.[0] ?? id;
}
export function createFormationOffer(rng=Math.random) {
 const groups = new Map();
 for (const id of config.FORMATION_PRESET_IDS) {
  const key = getFormationEquivalenceKey(id);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(id);
 }
 const pool = [...groups.values()];
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 // Pick a representative after choosing groups so every retained variant can appear.
 return pool.slice(0,config.FORMATION_OPTIONS).map(group => group[Math.floor(rng()*group.length)]);
}
