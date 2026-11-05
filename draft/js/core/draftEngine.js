/**
 * Draft Engine for LAqP Draft
 * Handles candidate generation, no-duplicate guarantee, and position compatibility.
 */

import { DRAFT_CONFIG } from '../config.js';
import {withLegendCandidate} from './legends.js';
import { getPlayersByRegion } from '../data/adapter.js';
import { isNaturalPosition } from './positions.js';

export function positionFamily(pos = '') {
  const p = pos.toUpperCase();
  if (p === 'GK') return 'GK';
  if (['CB', 'LB', 'RB'].includes(p)) return 'DEF';
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(p)) return 'MID';
  return 'FWD'; // LWF, RWF, SS, CF
}

/**
 * Returns the planned 23 pick steps: 11 starters + goalkeeper reserve + 11 unrestricted reserves
 */
export function getDraftPlan(formationId) {
  const formation = DRAFT_CONFIG.FORMATIONS[formationId] || DRAFT_CONFIG.FORMATIONS['4-3-3'];
  const steps = [];

  // Starters (11)
  formation.slots.forEach((slot, index) => {
    steps.push({
      pickIndex: index,
      isStarter: true,
      slotId: slot.id,
      position: slot.position,
      label: slot.label,
      title: `Pick ${index + 1}/${DRAFT_CONFIG.SQUAD_SIZE}: Titular (${slot.label} - ${slot.position})`
    });
  });

  // Bench: S1 goalkeeper, S2–S12 unrestricted
  DRAFT_CONFIG.BENCH_ROLES.forEach((benchRole, index) => {
    const totalIndex = DRAFT_CONFIG.STARTING_XI_SIZE + index;
    steps.push({
      pickIndex: totalIndex,
      isStarter: false,
      slotId: benchRole.id,
      position: benchRole.position,
      label: benchRole.label,
      title: `Pick ${totalIndex + 1}/${DRAFT_CONFIG.SQUAD_SIZE}: ${benchRole.label} (${benchRole.position || 'cualquier posición'})`
    });
  });

  return steps;
}

/**
 * Generates 5 candidates for a specific pick, prioritizing position fit and preventing duplicates.
 */
export function generatePickCandidates(region, targetPosition, draftedPlayerIds = new Set(), rng = Math.random) {
  return generateCandidatesFromPool(getPlayersByRegion(region),region,targetPosition,draftedPlayerIds,rng);
}
export function generateCandidatesFromPool(allRegionPlayers,region,targetPosition,draftedPlayerIds=new Set(),rng=Math.random){
  const targetPos = targetPosition?.toUpperCase();

  // Exclude players already drafted
  const available = allRegionPlayers.filter(p => !draftedPlayerIds.has(p.id));

  // Partition into priority tiers
  const tier1 = []; // exact natural position
  const tier2 = []; // secondary position match

  for (const p of available) {
    if (!targetPos || !isNaturalPosition(p, targetPos) || targetPos === 'GK' && p.primaryPosition !== 'GK') continue;
    if (p.primaryPosition === targetPos) {
      tier1.push(p);
    } else {
      tier2.push(p);

    }
  }

  // Shuffle utility with RNG
  const shuffle = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const pool = [
    ...(targetPos ? shuffle(tier1) : shuffle(available)),
    ...shuffle(tier2)
  ];

  const needed = DRAFT_CONFIG.CANDIDATES_PER_PICK;
  const candidates = pool.slice(0, needed);

  if (candidates.length !== needed) throw new Error(`Subset insuficiente para ${region}: ${targetPos}`);
  return withLegendCandidate(candidates,targetPos,draftedPlayerIds,rng,{mode:region==='WORLD'?'SURVIVAL':'CLASSIC'});
}
