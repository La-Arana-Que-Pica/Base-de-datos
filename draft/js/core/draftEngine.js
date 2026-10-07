/**
 * Draft Engine for LAqP Draft
 * Handles candidate generation, no-duplicate guarantee, and position compatibility.
 */

import { DRAFT_CONFIG } from '../config.js';
import { getPlayersByRegion } from '../data/adapter.js';

export function positionFamily(pos = '') {
  const p = pos.toUpperCase();
  if (p === 'GK') return 'GK';
  if (['CB', 'LB', 'RB'].includes(p)) return 'DEF';
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(p)) return 'MID';
  return 'FWD'; // LWF, RWF, SS, CF
}

/**
 * Returns the planned 16 pick steps: 11 starters + 5 bench
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
      title: `Pick ${index + 1}/16: Titular (${slot.label} - ${slot.position})`
    });
  });

  // Bench (5)
  DRAFT_CONFIG.BENCH_ROLES.forEach((benchRole, index) => {
    const totalIndex = DRAFT_CONFIG.STARTERS_COUNT + index;
    steps.push({
      pickIndex: totalIndex,
      isStarter: false,
      slotId: benchRole.id,
      position: benchRole.position,
      label: benchRole.label,
      title: `Pick ${totalIndex + 1}/16: ${benchRole.label} (${benchRole.position})`
    });
  });

  return steps;
}

/**
 * Generates 5 candidates for a specific pick, prioritizing position fit and preventing duplicates.
 */
export function generatePickCandidates(region, targetPosition, draftedPlayerIds = new Set(), rng = Math.random) {
  const allRegionPlayers = getPlayersByRegion(region);
  const targetPos = (targetPosition || 'CMF').toUpperCase();
  const targetFam = positionFamily(targetPos);

  // Exclude players already drafted
  const available = allRegionPlayers.filter(p => !draftedPlayerIds.has(p.id));

  // Partition into priority tiers
  const tier1 = []; // exact natural position
  const tier2 = []; // secondary position match
  const tier3 = []; // same positional family
  const tier4 = []; // others

  for (const p of available) {
    if (p.primaryPosition === targetPos) {
      tier1.push(p);
    } else if (p.secondaryPositions && p.secondaryPositions.includes(targetPos)) {
      tier2.push(p);
    } else if (positionFamily(p.primaryPosition) === targetFam) {
      tier3.push(p);
    } else {
      tier4.push(p);
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
    ...shuffle(tier1),
    ...shuffle(tier2),
    ...shuffle(tier3),
    ...shuffle(tier4)
  ];

  const needed = DRAFT_CONFIG.CANDIDATES_PER_PICK;
  const candidates = pool.slice(0, needed);

  return candidates;
}
