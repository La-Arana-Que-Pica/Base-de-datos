/**
 * Team Rating Engine for LAqP Draft
 * Computes squad OVR, departmental ratings (Attack, Midfield, Defense, Goalkeeper)
 * and applies chemistry & tactical modifiers.
 */

import { DRAFT_CONFIG } from '../config.js';
import { effectivePlayerRating, effectiveGoalkeeperRating } from './fatigue.js';
import { getPositionFit } from './positions.js';

export function calculateTeamRatings(starters = [], chemistryScore = 50, tacticId = 'BALANCED', live = false) {
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
  // Position A and the existing non-A policy both preserve full OVR.
  starters = starters.map(p => {
    const overall = p.overall * getPositionFit(p, p.slotPosition || p.primaryPosition).performanceMultiplier;
    // Ratings only read players. Under the existing no-penalty position policy,
    // avoid cloning the entire attributes record for every team on every tick.
    return overall === p.overall ? p : { ...p, overall };
  });
  const ovrSum = starters.reduce((acc, p) => acc + (p.overall || 70), 0);
  const baseOverall = Math.round(ovrSum / starters.length);

  // Departmental groupings
  const gkList = starters.filter(p => (p.slotPosition || p.primaryPosition) === 'GK');
  const defRoles = ['CB', 'LB', 'RB', 'DMF'];
  const defList = starters.filter(p => defRoles.includes((p.slotPosition || p.primaryPosition)));
  const midRoles = ['DMF', 'CMF', 'LMF', 'RMF', 'AMF'];
  const midList = starters.filter(p => midRoles.includes((p.slotPosition || p.primaryPosition)));
  const attRoles = ['LWF', 'RWF', 'SS', 'CF', 'AMF'];
  const attList = starters.filter(p => attRoles.includes((p.slotPosition || p.primaryPosition)));

  const avg = (list, fallback) => {
    if (!list.length) return fallback;
    return Math.round(list.reduce((acc, p) => acc + (p.overall || fallback), 0) / list.length);
  };

  const rawGk = avg(gkList, baseOverall);
  const rawDef = avg(defList, baseOverall);
  const rawMid = avg(midList, baseOverall);
  const rawAtt = avg(attList, baseOverall);

  const effectiveAvg = (list,score=effectivePlayerRating) => list.length ? list.reduce((sum,p)=>sum+score(p),0)/list.length : starters.reduce((sum,p)=>sum+score(p),0)/starters.length;
  const liveGk = live ? effectiveAvg(gkList,effectiveGoalkeeperRating) : rawGk;
  const liveDef = live ? effectiveAvg(defList) : rawDef;
  const liveMid = live ? effectiveAvg(midList) : rawMid;
  const liveAtt = live ? effectiveAvg(attList) : rawAtt;

  // Chemistry modifier: neutral at 50, range: [1 - weight, 1 + weight]
  const chemMultiplier = chemistryMultiplier(chemistryScore);

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
    effectiveAttack: live ? liveAtt : (liveAtt * chemMultiplier * attackTacticMod),
    effectiveMidfield: live ? liveMid : (liveMid * chemMultiplier),
    effectiveDefense: live ? liveDef : (liveDef * chemMultiplier * defenseTacticMod),
    effectiveGoalkeeper: liveGk
  };
}

export { staminaDrain, playerPerformanceMultiplier } from './fatigue.js';
export function chemistryMultiplier(score) { const q=Math.max(0,Math.min(100,score)),c=DRAFT_CONFIG.CHEMISTRY;return 1+(q-50)/50*(q<50?c.NEGATIVE_EFFECT:c.POSITIVE_EFFECT); }
