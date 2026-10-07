/**
 * Chemistry Engine for LAqP Draft
 * Calculates topological connection points based on:
 * - Same club: +3
 * - Same nationality: +2
 * - Same league: +1
 * Normalizes to 0-100 scale.
 */

import { DRAFT_CONFIG } from '../config.js';

export function calculateChemistry(formationId, startersMap = {}) {
  const formation = DRAFT_CONFIG.FORMATIONS[formationId];
  if (!formation || !formation.links || !formation.links.length) {
    return { score: 50, totalPoints: 0, linkDetails: [] };
  }

  const { SAME_CLUB_POINTS, SAME_NATION_POINTS, SAME_LEAGUE_POINTS, TARGET_POINTS_PER_LINK } = DRAFT_CONFIG.CHEMISTRY;
  let totalPoints = 0;
  const linkDetails = [];

  for (const [slotAId, slotBId] of formation.links) {
    const pA = startersMap[slotAId];
    const pB = startersMap[slotBId];

    let points = 0;
    const reasons = [];

    if (pA && pB) {
      if (pA.teamId && pB.teamId && pA.teamId === pB.teamId) {
        points += SAME_CLUB_POINTS;
        reasons.push('club');
      }
      if (pA.nationality && pB.nationality && pA.nationality === pB.nationality) {
        points += SAME_NATION_POINTS;
        reasons.push('nationality');
      }
      if (pA.leagueId && pB.leagueId && pA.leagueId === pB.leagueId) {
        points += SAME_LEAGUE_POINTS;
        reasons.push('league');
      }
    }

    totalPoints += points;
    linkDetails.push({
      slotA: slotAId,
      slotB: slotBId,
      points,
      reasons
    });
  }

  const targetPoints = formation.links.length * TARGET_POINTS_PER_LINK;
  const rawScore = (totalPoints / targetPoints) * 100;
  const normalizedScore = Math.min(100, Math.max(0, Math.round(rawScore)));

  return {
    score: normalizedScore,
    totalPoints,
    maxTargetPoints: targetPoints,
    linkDetails
  };
}
