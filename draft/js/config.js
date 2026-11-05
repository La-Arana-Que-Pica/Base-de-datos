/**
 * Configuration & Balance Parameters for LAqP Draft
 * Centralized constants - no magic numbers.
 */

import { DEFAULT_TOURNAMENT_SIZE, tournamentFormat } from './core/tournamentFormat.js';
import { PES_2018_ADDITIONAL_FORMATIONS, PES_2018_PRESET_IDS } from './data/formations.js';
import { FORMATION_LINK_GRAPHS } from './data/formationLinks.js';

export const SQUAD_SIZE = 23;
export const STARTING_XI_SIZE = 11;
export const BENCH_SIZE = SQUAD_SIZE - STARTING_XI_SIZE;

export const DRAFT_CONFIG = {
  TOURNAMENT: {
    PARTICIPANTS: DEFAULT_TOURNAMENT_SIZE,
    ROUNDS: tournamentFormat(DEFAULT_TOURNAMENT_SIZE).labels,
    RECOVERY_BETWEEN_MATCHES: 35,
    NPC_AVERAGE_STRENGTH_FACTOR: 0.99
  },
  // Squad rules
  SQUAD_SIZE,
  STARTING_XI_SIZE,
  BENCH_SIZE,
  CANDIDATES_PER_PICK: 5,
  FORMATION_OPTIONS: 5,
  FORMATION_PRESET_IDS: PES_2018_PRESET_IDS,

  // Maximum manual substitutions during match
  MAX_SUBSTITUTIONS: 5,
  MAX_SUBSTITUTION_WINDOWS: 3,
  RIVAL_SUBSTITUTIONS: { FIRST_MINUTE: 56, FIRST_JITTER: 7, WINDOW_GAP: 12, GAP_JITTER: 4, LAST_WINDOW_MINUTE: 85, ENERGY_THRESHOLD: 80, LATE_ENERGY_THRESHOLD: 90, EXTREME_ENERGY: 25, MIN_ENERGY_GAIN: 8, MIN_QUALITY_RATIO: 0.72, POOR_RATING: 5.8, BATCH_SIZE: 2, HALFTIME_ENERGY: 65 },

  // Match timing
  MATCH_DURATION_MINUTES: 90,
  EXTRA_TIME_END: 120,
  SUPER_SUB_MINUTE: 46,
  SUPER_SUB_BONUS: 3,
  REVEAL_INTERVAL_MS: 480,
  REVEAL_FINISH_MS: 300,
  REVEAL_SELECTION_GUARD_MS: 250,
  SET_PIECE_SPECIALISTS: {
    WEIGHTS: {freeKick:{placeKicking:.40,controlledSpin:.30,finishing:.20,loftedPass:.10},corner:{placeKicking:.40,loftedPass:.35,controlledSpin:.25},penalty:{finishing:.50,placeKicking:.50},indirectFreeKick:{placeKicking:.35,loftedPass:.40,controlledSpin:.25}},
    // A neutral execution baseline only; unknown players rank after measured specialists.
    UNKNOWN_EXECUTION:70
  },
  PENALTIES: { SHOOTOUT_WEIGHTS: { finishing: 0.6, placeKicking: 0.25, overall: 0.15 }, BASE: 0.74, QUALITY_WEIGHT: 0.002, KEEPER_WEIGHT: 0.001, MIN: 0.55, MAX: 0.90 },
  PLAYER_RATING: { ASSIST: 0.55, PENALTY_GOAL: 0.75, PENALTY_MISS: -0.50, FREE_KICK_GOAL: 0.85, YELLOW: -0.12, RED: -0.90, PENALTY_SAVE: 0.75, PENALTY_COMMITTED: -0.40, ERROR: -0.55, FOUL: -0.025, BASE: 6, MIN: 4, MAX: 10, GOAL: 1.15, TARGET: 0, WIDE: -0.07, BLOCK: 0, SAVE: 0, CONCEDED: -0.13 },
  SIMULATION_TICK_MS: 600,
  PLAYBACK: { SPEEDS: [1,2,4,8], SUSPENSE_MS: [450,350], PENALTY_SUSPENSE_MS: [550,400], SHOOTOUT_SUSPENSE_MS: [350], SHOOTOUT: { PREPARE_MS: 1500, RUNUP_MS: 1000, STRIKE_MS: 700, RESULT_MS: 1000, REVEAL_MS: 2200, GAP_MS: 700, FINAL_MS: 2200, REDUCED_MS: 650, REDUCED_REVEAL_MS: 1300, REDUCED_GAP_MS: 450 }, DANGER_GOAL_PROBABILITY: 0.34, CHANCE_COOLDOWN_MINUTES: 7 },

  // Chemistry parameters (Provisional, conservative effect)
  CHEMISTRY: {
    LINK_POINTS: { DEAD: 0, WEAK: 1, STRONG: 2, HYPER: 3 },
    INDIVIDUAL_MAX: 10,
    TEAM_MAX: 100,
    EFFECT_WEIGHT: 0.035, // coordination only; no global goalkeeper or finishing bonus
    NEGATIVE_EFFECT: 0.045, POSITIVE_EFFECT: 0.035
  },

  MATCH_BALANCE: { CHANCE_RATE: 0.225, SHOT_BASE: 0.76, SHOT_STRENGTH: 0.005, TARGET_BASE: 0.59, TARGET_STRENGTH: 0.004, GOAL_BASE: 0.34, GOAL_STRENGTH: 0.006, MIN_PROBABILITY: 0.05, MAX_PROBABILITY: 0.95 },

  // Sporting possessions; independent from playback speed and animation preferences.
  POSSESSION_MODEL: {
    SEQUENCES_PER_MINUTE: 2, CONTROL_SCALE: 30, MIN_CONTROL: .22, MAX_CONTROL: .78,
    RETENTION: .18,
    BUILD_BASE: .54, BUILD_DIFFERENCE: .0035, MIN_BUILD: .28, MAX_BUILD: .80,
    BREACH_BASE: .30, BREACH_DIFFERENCE: .004, MIN_BREACH: .10, MAX_BREACH: .62,
    CLEAR_BASE: .25, CLEAR_DIFFERENCE: .004, MIN_CLEAR: .10, MAX_CLEAR: .50,
    TARGET_BASE: .50, TARGET_SKILL: .003, CLEAR_TARGET: .13,
    GOAL_BASE: .22, FINISH_DIFFERENCE: .004, CLEAR_GOAL: .13,
    SHOT_BASE: .76, SHOT_DIFFERENCE: .003, CORNER_ON_SAVE: .18, CORNER_ON_BLOCK: .20,
    TACTICS: {
      DEFENSIVE: {control:.94, build:.93, organization:1.065, depth:.92, counter:.07},
      BALANCED: {control:1, build:1, organization:1, depth:1, counter:0},
      OFFENSIVE: {control:1.035, build:1.06, organization:.94, depth:1.06, counter:0}
    }
  },

  DUELS: {
    VERSION: 1, ATTRIBUTE_WEIGHT: .65, SCALE: 48, PHYSICAL_PENALTY: .40, TECHNICAL_PENALTY: .16,
    UNFAMILIAR_FACTOR: .97, COVER_RADIUS: 48, COVER_WEIGHT: 3.5,
    STAGE_BASE: {exit:.82, midfield:.74, progression:.53, finish:.56},
    CIRCULATION_RATE:.12, FOUL_RATE:.027,
    ATTRIBUTES: {pass:{low_pass:.65,lofted_pass:.20,ball_control:.15},carry:{dribbling:.40,ball_control:.25,speed:.20,body_control:.15},run:{attacking_prowess:.40,speed:.25,explosive_power:.20,finishing:.15},tackle:{ball_winning:.45,defensive_prowess:.30,physical_contact:.15,speed:.10},intercept:{defensive_prowess:.55,ball_winning:.30,speed:.15},finish:{finishing:.70,kicking_power:.15,attacking_prowess:.15}}
  },
  INTENSITIES: {
    LOW: {label:'Baja', drain:.78, pressure:-.025, tempo:.94},
    NORMAL: {label:'Normal', drain:1, pressure:0, tempo:1},
    HIGH: {label:'Alta', drain:1.25, pressure:.035, tempo:1.06}
  },
  INTENSITY_MODEL: {TEMPO_BREACH_WEIGHT:.15},
  RIVAL_TACTICAL: {FIRST_MINUTE:55, GAP:12, LATE_MINUTE:75, TIRED_ENERGY:48, DECISION_RATE:.65},
  SET_PIECES: {DIRECT_ORGANIZATION_WEIGHT:.001, MIN_ORGANIZATION_FACTOR:.95, MAX_ORGANIZATION_FACTOR:1.05, CROSS_BASE:.20, QUALITY_DIFFERENCE:.003, MIN_CROSS:.08, MAX_CROSS:.35,
    DELIVERY_WEIGHTS:{loftedPass:.7,controlledSpin:.3}, DEFAULT_HEADER_ROLE:.6, HEADER_ROLES:{CF:2,SS:1.4,CB:1.6,GK:0}},

  // Tactical modifiers
  TACTICS: {
    DEFENSIVE: {
      id: 'DEFENSIVE',
      label: 'Defensivo',
      attackMod: 0.90,
      defenseMod: 1.12,
      ownChanceMod: 0.75,
      rivalChanceMod: 0.75
    },
    BALANCED: {
      id: 'BALANCED',
      label: 'Equilibrado',
      attackMod: 1.00,
      defenseMod: 1.00,
      ownChanceMod: 1.00,
      rivalChanceMod: 1.00
    },
    OFFENSIVE: {
      id: 'OFFENSIVE',
      label: 'Ofensivo',
      attackMod: 1.12,
      defenseMod: 0.90,
      ownChanceMod: 1.25,
      rivalChanceMod: 1.25
    }
  },

  // Stamina & Fatigue model
  FATIGUE: {
    INITIAL_ENERGY: 100, MIN_ENERGY: 10, STAMINA_FALLBACK: 75,
    DRAIN_PER_MINUTE: 0.43, STAMINA_REFERENCE: 75, STAMINA_EXPONENT: 1.70,
    TACTIC_DRAIN: { DEFENSIVE: 0.92, BALANCED: 1, OFFENSIVE: 1.15 },
    ROLE_DRAIN: { GK: 1, CB: 0.85, DMF: 1.10, CMF: 1.15, AMF: 1.10, LB: 1.18, RB: 1.18, LMF: 1.16, RMF: 1.16, LWF: 1.20, RWF: 1.20, CF: 1.02, SS: 1.10 },
    PERFORMANCE_THRESHOLD: 80, MAX_PERFORMANCE_PENALTY: 0.22, PERFORMANCE_EXPONENT: 1.40,
    GK_BASE_FATIGUE_RATE: 0.08, GK_PERFORMANCE_THRESHOLD: 50, GK_MAX_PENALTY: 0.16,
    GK_WORKLOAD: { SHOT: 0.16, ON_TARGET: 0.30, SAVE: 0.45, DIFFICULT_SAVE: 0.20, PENALTY: 0.80 }
  },
  MATCH_EVENTS: {
    FOUL_RATE: 0.18, YELLOW_CARD_RATE: 0.18, RED_CARD_RATE: 0.0025, BOOKED_FOUL_FACTOR: 0.15,
    PENALTY_RATE: 0.012, DANGEROUS_FREE_KICK_RATE: 0.24, DIRECT_FREE_KICK_RATE: 0.35,
    INDIRECT_ATTACK_RATE: 0.20, INJURY_RATE: 0.0006, FOUL_INJURY_RATE: 0.004,
    INJURY_RESISTANCE_FACTOR: { 1: 1.5, 2: 1, 3: 0.65 }, INJURY_PERFORMANCE: 0.45,
    MAN_DOWN_FACTOR: 0.86, MISSING_GK_FACTOR: 0.55,
    ASSIST_RATE: 0.65, NO_ASSIST_TYPES: { INDIVIDUAL: 0.55, REBOUND: 0.30 },
    ACTION_RELATIVE_MIN: 0.55, ACTION_RELATIVE_MAX: 1.10, GK_INJURY_SELECTION_WEIGHT: 0.2,
    PARTICIPATION_EXPONENT: 2, PASS_QUALITY_EXPONENT: 2, ASSIST_DEFAULT_ROLE_WEIGHT: 0.35, ASSIST_PASS_WEIGHTS: { lowPass: 0.7, loftedPass: 0.3 },
    INJURY_RESISTANCE_FALLBACK: 2, ENERGY_LEVELS: { HIGH: 80, MEDIUM: 60, TIRED: 40 },
    ASSIST_ROLE_WEIGHT: { AMF: 2, CMF: 1.5, LMF: 1.8, RMF: 1.8, LWF: 1.8, RWF: 1.8, SS: 1.4, CF: 1.2, DMF: 0.9, LB: 0.35, RB: 0.35, CB: 0.08, GK: 0 },
    FOUL_ROLE_WEIGHT: { GK: 0.08, CB: 2, LB: 1.8, RB: 1.8, DMF: 1.8, CMF: 1.2, CF: 0.6, SS: 0.6, LWF: 0.7, RWF: 0.7 },
    DIRECT_FK: { TARGET_BASE: 0.46, TARGET_SKILL: 0.004, GOAL_BASE: 0.12, GOAL_SKILL: 0.003, KEEPER_WEIGHT: 0.002, MIN_TARGET: 0.25, MAX_TARGET: 0.75, MIN_GOAL: 0.05, MAX_GOAL: 0.30 },
    PENALTY_SAVED_RATE: 0.65, DIFFICULT_SAVE_RATE: 0.25,
    FREE_KICK_WEIGHTS: { placeKicking: 0.5, controlledSpin: 0.3, kickingPower: 0.2 },
    PENALTY_WEIGHTS: { finishing: 0.6, placeKicking: 0.25, overall: 0.15 }
  },

  // Each preset has its own explicit chemistry graph.
  FORMATIONS: {
    '4-3-3': {
      id: '4-3-3',
      name: '4-3-3',
      slots: [
        { id: 'gk', label: 'PO', position: 'GK', x: 50, y: 92 },
        { id: 'lb', label: 'LI', position: 'LB', x: 15, y: 72 },
        { id: 'lcb', label: 'DFC', position: 'CB', x: 38, y: 77 },
        { id: 'rcb', label: 'DFC', position: 'CB', x: 62, y: 77 },
        { id: 'rb', label: 'LD', position: 'RB', x: 85, y: 72 },
        { id: 'dm', label: 'MCD', position: 'DMF', x: 50, y: 60 },
        { id: 'lcm', label: 'MC', position: 'CMF', x: 30, y: 50 },
        { id: 'rcm', label: 'MC', position: 'CMF', x: 70, y: 50 },
        { id: 'lw', label: 'EI', position: 'LWF', x: 18, y: 22 },
        { id: 'cf', label: 'DC', position: 'CF', x: 50, y: 15 },
        { id: 'rw', label: 'ED', position: 'RWF', x: 82, y: 22 }
      ],
      links: FORMATION_LINK_GRAPHS['4-3-3'].links
    },
    '4-2-3-1': {
      id: '4-2-3-1',
      name: '4-2-3-1',
      slots: [
        { id: 'gk', label: 'PO', position: 'GK', x: 50, y: 92 },
        { id: 'lb', label: 'LI', position: 'LB', x: 15, y: 73 },
        { id: 'lcb', label: 'DFC', position: 'CB', x: 38, y: 78 },
        { id: 'rcb', label: 'DFC', position: 'CB', x: 62, y: 78 },
        { id: 'rb', label: 'LD', position: 'RB', x: 85, y: 73 },
        { id: 'ldm', label: 'MCD', position: 'DMF', x: 35, y: 60 },
        { id: 'rdm', label: 'MCD', position: 'DMF', x: 65, y: 60 },
        { id: 'lam', label: 'MI', position: 'LMF', x: 18, y: 39 },
        { id: 'am', label: 'MCO', position: 'AMF', x: 50, y: 37 },
        { id: 'ram', label: 'MD', position: 'RMF', x: 82, y: 39 },
        { id: 'cf', label: 'DC', position: 'CF', x: 50, y: 15 }
      ],
      links: FORMATION_LINK_GRAPHS['4-2-3-1'].links
    },
    '4-4-2': {
      id: '4-4-2',
      name: '4-4-2',
      slots: [
        { id: 'gk', label: 'PO', position: 'GK', x: 50, y: 92 },
        { id: 'lb', label: 'LI', position: 'LB', x: 15, y: 73 },
        { id: 'lcb', label: 'DFC', position: 'CB', x: 38, y: 78 },
        { id: 'rcb', label: 'DFC', position: 'CB', x: 62, y: 78 },
        { id: 'rb', label: 'LD', position: 'RB', x: 85, y: 73 },
        { id: 'lm', label: 'MI', position: 'LMF', x: 16, y: 47 },
        { id: 'lcm', label: 'MC', position: 'CMF', x: 39, y: 53 },
        { id: 'rcm', label: 'MC', position: 'CMF', x: 61, y: 53 },
        { id: 'rm', label: 'MD', position: 'RMF', x: 84, y: 47 },
        { id: 'lcf', label: 'DC', position: 'CF', x: 38, y: 18 },
        { id: 'rcf', label: 'DC', position: 'CF', x: 62, y: 18 }
      ],
      links: FORMATION_LINK_GRAPHS['4-4-2'].links
    },
    ...PES_2018_ADDITIONAL_FORMATIONS
  },

  // Twelve unrestricted reserve picks
  BENCH_ROLES: Array.from({ length: BENCH_SIZE }, (_, i) => ({ id: `b${i + 1}`, label: `Suplente ${i + 1}`, position: i === 0 ? 'GK' : null }))
};
