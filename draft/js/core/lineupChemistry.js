import { DRAFT_CONFIG as config } from '../config.js';
import { calculateChemistry } from './chemistry.js';
// Match real roles to the closest existing link graph. Neither player roles nor data are changed.
const group=p=>p==='GK'?'gk':['CB','LB','RB'].includes(p)?'def':['CF','SS','LWF','RWF'].includes(p)?'att':'mid';
const assignmentCache=new Map();
function assign(slots,players) {
 const roles=players.map(p=>p.slotPosition||p.primaryPosition),positions=slots.map(s=>s.position),key=JSON.stringify([positions,roles]);
 if(assignmentCache.has(key))return assignmentCache.get(key);
 // Same subset dynamic program and same ascending-j/strict-< tie rule as
 // before. Flat integer tables avoid allocating a string/array at each edge.
 // Role-only caching cannot reuse chemistry scores or player attributes.
 const size=1<<players.length,costs=new Uint16Array(size),choice=new Uint8Array(size),counts=new Uint8Array(size);
 for(let mask=1;mask<size;mask++)counts[mask]=counts[mask>>1]+(mask&1);
 for(let mask=size-2;mask>=0;mask--){const i=counts[mask];let best=65535,pick=0;
  for(let j=0;j<roles.length;j++)if(!(mask&(1<<j))){const cost=(roles[j]===positions[i]?0:group(roles[j])===group(positions[i])?1:10)+costs[mask|(1<<j)];if(cost<best){best=cost;pick=j;}}
  costs[mask]=best;choice[mask]=pick;
 }
 const indices=[];for(let mask=0;indices.length<slots.length;){const j=choice[mask];indices.push(j);mask|=1<<j;}
 const result={cost:costs[0],indices};if(assignmentCache.size>=512)assignmentCache.delete(assignmentCache.keys().next().value);assignmentCache.set(key,result);return result;
}
export function calculateLineupChemistry(players=[],formationId=null) {
 players=players.map(p=>({...p,nationality:['Internacional','International'].includes(p.nationality)?'':p.nationality}));
 if(players.length!==config.STARTING_XI_SIZE || !players.every(p=>p.primaryPosition && (p.teamId||p.leagueId||p.nationality)))return {score:50,source:'neutral-fallback'};
 let best;
 for(const formation of Object.values(config.FORMATIONS)){
  const mapping=assign(formation.slots,players);
  if(!best || mapping.cost<best.cost || formation.id===formationId&&mapping.cost===best.cost)best={formation,mapping,cost:mapping.cost};
 }
 const startersMap=Object.fromEntries(best.formation.slots.map((slot,i)=>[slot.id,players[best.mapping.indices[i]]]));
 // Position chemistry uses the actual PES lineup role, not the approximation used to select links.
 const graph={...best.formation,slots:best.formation.slots.map(slot=>({...slot,position:startersMap[slot.id].slotPosition||startersMap[slot.id].primaryPosition}))};
 return {...calculateChemistry(graph,startersMap),source:'real-lineup',graphId:graph.id};
}
