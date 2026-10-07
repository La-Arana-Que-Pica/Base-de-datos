/**
 * Team Rating Engine for LAqP Draft
 * Computes squad OVR, departmental ratings (Attack, Midfield, Defense, Goalkeeper)
 * and applies chemistry & tactical modifiers.
 */

import { DRAFT_CONFIG } from '../config.js';

export function calculateTeamRatings(starters = [], chemistryScore = 50, tacticId = 'BALANCED') {
  if (!starters.length) {
    return {
      overall: 70,
      attack: 70,
      midfield: 70,
      defense: 70,
      goalkeeper: 70,
      effectiveAttack: 70,
      effectiveMidfield: 70,
      effectiveDefense: 70,
      effectiveGoalkeeper: 70
    };
  }

  // Base overall: average of all starting players
  const ovrSum = starters.reduce((acc, p) => acc + (p.overall || 70), 0);
  const baseOverall = Math.round(ovrSum / starters.length);

  // Departmental groupings
  const gkList = starters.filter(p => p.primaryPosition === 'GK');
  const defRoles = ['CB', 'LB', 'RB', 'DMF'];
  const defList = starters.filter(p => defRoles.includes(p.primaryPosition));
  const midRoles = ['DMF', 'CMF', 'LMF', 'RMF', 'AMF'];
  const midList = starters.filter(p => midRoles.includes(p.primaryPosition));
  const attRoles = ['LWF', 'RWF', 'SS', 'CF', 'AMF'];
  const attList = starters.filter(p => attRoles.includes(p.primaryPosition));

  const avg = (list, fallback) => {
    if (!list.length) return fallback;
    return Math.round(list.reduce((acc, p) => acc + (p.overall || fallback), 0) / list.length);
  };

  const rawGk = avg(gkList, baseOverall);
  const rawDef = avg(defList, baseOverall);
  const rawMid = avg(midList, baseOverall);
  const rawAtt = avg(attList, baseOverall);

  // Chemistry modifier: neutral at 50, range: [1 - weight, 1 + weight]
  const chemDelta = (chemistryScore - 50) / 50; // -1 to +1
  const chemMultiplier = 1 + (chemDelta * DRAFT_CONFIG.CHEMISTRY.EFFECT_WEIGHT);

  // Tactical modifiers
  const tactic = DRAFT_CONFIG.TACTICS[tacticId] || DRAFT_CONFIG.TACTICS.BALANCED;
  const attackTacticMod = tactic.attackMod || 1.0;
  const defenseTacticMod = tactic.defenseMod || 1.0;

  return {
    overall: baseOverall,
    attack: rawAtt,
    midfield: rawMid,
    defense: rawDef,
    goalkeeper: rawGk,
    effectiveAttack: Math.round(rawAtt * chemMultiplier * attackTacticMod),
    effectiveMidfield: Math.round(rawMid * chemMultiplier),
    effectiveDefense: Math.round(rawDef * chemMultiplier * defenseTacticMod),
    effectiveGoalkeeper: Math.round(rawGk * chemMultiplier * defenseTacticMod)
  };
}
