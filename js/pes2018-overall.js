/*
 * Fórmula reconstruida del algoritmo original de PES 2018.
 * No modificar pesos/redondeos sin validación contra el ejecutable original.
 *
 * Esta es la única fuente de verdad JavaScript para el OVR de LAQP. El orden de
 * columnas de la matriz recuperada es distinto de los IDs numéricos del juego y
 * de los IDs POS exportados por LAQP; por eso todo se convierte primero a códigos.
 */
(function attachPes2018Overall(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PES2018Overall = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPes2018Overall() {
  'use strict';

  // Columnas de la matriz recuperada de PES2018.exe.
  const POSITIONS = Object.freeze(['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF']);
  const POS_INDEX = Object.freeze(Object.fromEntries(POSITIONS.map((position, index) => [position, index])));

  // IDs POS del CSV activo de LAQP (All players exported.csv).
  const LAQP_CSV_POSITIONS = POSITIONS;

  // IDs internos documentados para PES 2018. Nunca se usan como índices de W.
  const PES2018_POSITION_IDS = Object.freeze(['CF', 'SS', 'RWF', 'LWF', 'AMF', 'DMF', 'CMF', 'RMF', 'LMF', 'CB', 'RB', 'LB', 'GK']);

  const W = Object.freeze([
    [0,0,6,6,7,5,7,7,14,17,17,15,31],
    [0,0,10,10,18,24,15,15,24,19,19,19,24],
    [0,0,14,14,15,24,25,25,24,22,22,19,14],
    [0,0,0,0,18,24,7,7,22,5,5,9,0],
    [0,0,14,14,19,21,12,12,14,9,9,9,0],
    [0,0,0,0,0,0,0,0,17,11,11,14,36],
    [0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,12,0,4,4,0,0,0,0,0],
    [0,23,0,0,0,0,0,0,0,0,0,0,3],
    [0,26,14,14,8,3,0,0,0,0,0,0,0],
    [0,26,13,13,4,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,5,5,6,3],
    [0,10,16,16,3,4,24,24,5,15,15,9,5],
    [0,0,14,14,3,6,22,22,7,15,15,22,5],
    [11,20,12,12,13,5,0,0,5,6,6,7,9],
    [11,20,12,12,5,0,0,0,0,0,0,0,3],
    [49,0,0,0,0,0,0,0,0,0,0,0,0],
    [49,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,9,14,14,14,17,13,13,3,6,6,4,0],
    [0,24,58,58,24,24,56,56,38,47,47,38,38],
  ]);

  const NATURAL = Object.freeze([8,8,9,9,9,8,8,8,8,10,10,9,8]);
  const FULL = Object.freeze([5,5,4,4,4,5,5,5,5,4,4,5,5]);
  const PARTIAL = Object.freeze([3,3,2,2,2,3,3,3,3,2,2,3,3]);

  const GLOBAL = Object.freeze([
    31,32,33,34,35,36,37,38,39,40,
    41,42,43,44,45,46,47,48,49,50,
    51,52,56,59,62,65,67,70,73,75,
    77,79,82,83,85,87,89,90,92,93,
    94,95,96,97,98,99,100,101,102,103,
    104,105,106,107,108,109,110,111,112,113,
  ]);

  const LAQP_STAT_ALIASES = Object.freeze({
    attacking_prowess: ['OffensiveAwareness', 'Attacking Prowess', 'attacking_prowess'],
    ball_control: ['BallControl', 'Ball Control', 'ball_control'],
    dribbling: ['Dribbling', 'dribbling'],
    low_pass: ['LowPass', 'Low Pass', 'low_pass'],
    lofted_pass: ['LoftedPass', 'Lofted Pass', 'lofted_pass'],
    finishing: ['Finishing', 'finishing'],
    set_piece_taking: ['PlaceKicking', 'Place Kicking', 'set_piece_taking', 'place_kicking'],
    curve: ['Curl', 'Controlled Spin', 'curve', 'swerve'],
    header: ['Heading', 'Header', 'header'],
    defensive_prowess: ['DefensiveAwareness', 'Defensive Prowess', 'defensive_prowess'],
    ball_winning: ['BallWinning', 'Ball Winning', 'ball_winning'],
    kicking_power: ['KickingPower', 'Kicking Power', 'kicking_power'],
    speed: ['Speed', 'speed'],
    explosive_power: ['Acceleration', 'Explosive Power', 'explosive_power'],
    body_control: ['Balance', 'Body Control', 'body_control'],
    physical_contact: ['PhysicalContact', 'Physical Contact', 'physical_contact'],
    jump: ['Jump', 'jump'],
    goalkeeping: ['GKAwareness', 'Goalkeeping', 'goalkeeping'],
    catching: ['GKCatching', 'Catching', 'catching'],
    clearing: ['GKClearing', 'Clearing', 'clearing'],
    reflexes: ['GKReflexes', 'Reflexes', 'reflexes'],
    coverage: ['GKReach', 'Coverage', 'coverage'],
    stamina: ['Stamina', 'stamina'],
    non_dom_leg_precision: ['WeakFootAcc', 'Weak Foot Acc.', 'non_dom_leg_precision'],
  });

  const normalize = value => value >= 25 ? value - 25 : 1;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function rowNumber(row, aliases, fallback) {
    for (const alias of aliases) {
      const raw = row && row[alias];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const value = Number(raw);
        if (Number.isFinite(value)) return value;
      }
    }
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing PES stat: ${aliases[0]}`);
  }

  function statsFromLaqpRow(row) {
    const stats = {};
    Object.entries(LAQP_STAT_ALIASES).forEach(([key, aliases]) => {
      stats[key] = rowNumber(row, aliases, key === 'non_dom_leg_precision' ? 3 : undefined);
    });
    return stats;
  }

  function calculationRows(stats) {
    return [
      stats.attacking_prowess,
      stats.ball_control,
      stats.dribbling,
      stats.low_pass,
      stats.lofted_pass,
      stats.finishing,
      stats.set_piece_taking,
      stats.curve,
      stats.header,
      stats.defensive_prowess,
      stats.ball_winning,
      stats.kicking_power,
      stats.speed,
      stats.explosive_power,
      Math.floor((stats.body_control + stats.physical_contact) / 2),
      stats.jump,
      Math.floor((stats.goalkeeping + stats.coverage) / 2),
      Math.floor((stats.clearing + stats.reflexes + stats.catching) / 3),
      stats.stamina,
      stats.non_dom_leg_precision ?? 3,
    ].map(Number);
  }

  function normalizePosition(position) {
    const code = String(position || '').trim().toUpperCase();
    if (!(code in POS_INDEX)) throw new Error(`Unknown PES position: ${position}`);
    return code;
  }

  function positionFromLaqp(value) {
    const raw = String(value ?? '').trim();
    if (/^\d+$/.test(raw)) {
      const code = LAQP_CSV_POSITIONS[Number(raw)];
      if (code) return code;
    }
    return normalizePosition(raw);
  }

  function positionFromPes2018Id(value) {
    const index = Number(value);
    if (!Number.isInteger(index) || !PES2018_POSITION_IDS[index]) {
      throw new Error(`Unknown PES 2018 position id: ${value}`);
    }
    return PES2018_POSITION_IDS[index];
  }

  function pes2018Overall(stats, targetPosition, naturalPosition = targetPosition, familiarity = 0) {
    const target = normalizePosition(targetPosition);
    const natural = normalizePosition(naturalPosition);
    const positionIndex = POS_INDEX[target];
    const raw = calculationRows(stats);
    const normalized = raw.map(normalize);
    let positional = Math.floor((W.reduce((sum, weights, rowIndex) => sum + weights[positionIndex] * normalized[rowIndex], 0) + 50) / 100);

    if (target === natural) positional += NATURAL[positionIndex];
    else if (Number(familiarity) >= 2) positional += FULL[positionIndex];
    else if (Number(familiarity) === 1) positional += PARTIAL[positionIndex];

    let overall = positional;
    if (target === natural && target !== 'GK') {
      const total = raw.slice(0, 19).reduce((sum, value) => sum + value, 0);
      const averageX100 = Math.floor(total * 100 / 19);
      const average = Math.floor((averageX100 + 50) / 100);
      const globalScore = GLOBAL[clamp(average, 40, 99) - 40];
      overall = Math.floor((60 * positional + 40 * globalScore + 50) / 100);
    }
    return clamp(overall, 40, 109);
  }

  function familiarityFromLaqpRow(row, targetPosition) {
    const target = normalizePosition(targetPosition);
    const value = Number(row && row[target]);
    return Number.isFinite(value) ? clamp(Math.trunc(value), 0, 2) : 0;
  }

  function overallFromLaqpRow(row, targetPosition) {
    const natural = positionFromLaqp(row && (row.POS ?? row.Position ?? row.position));
    const target = targetPosition ? normalizePosition(targetPosition) : natural;
    const familiarity = target === natural ? 0 : familiarityFromLaqpRow(row, target);
    return pes2018Overall(statsFromLaqpRow(row), target, natural, familiarity);
  }

  function assignOverall(row) {
    const overall = overallFromLaqpRow(row);
    row.OverallStats = String(overall);
    if (Object.prototype.hasOwnProperty.call(row, 'Overall')) row.Overall = String(overall);
    return overall;
  }

  return Object.freeze({
    POSITIONS,
    LAQP_CSV_POSITIONS,
    PES2018_POSITION_IDS,
    LAQP_STAT_ALIASES,
    statsFromLaqpRow,
    positionFromLaqp,
    positionFromPes2018Id,
    familiarityFromLaqpRow,
    pes2018Overall,
    overallFromLaqpRow,
    assignOverall,
  });
}));
