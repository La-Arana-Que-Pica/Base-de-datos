/**
 * Configuration & Balance Parameters for LAqP Draft
 * Centralized constants - no magic numbers.
 */

export const DRAFT_CONFIG = {
  // Squad rules
  TOTAL_SQUAD_SIZE: 16,
  STARTERS_COUNT: 11,
  BENCH_COUNT: 5,
  CANDIDATES_PER_PICK: 5,

  // Maximum manual substitutions during match
  MAX_SUBSTITUTIONS: 3,

  // Match timing
  MATCH_DURATION_MINUTES: 90,
  SIMULATION_TICK_MS: 200, // Duration in ms of each minute tick (~18s per full match)

  // Chemistry parameters (Provisional, conservative effect)
  CHEMISTRY: {
    SAME_CLUB_POINTS: 3,
    SAME_NATION_POINTS: 2,
    SAME_LEAGUE_POINTS: 1,
    TARGET_POINTS_PER_LINK: 2.8, // Used to normalize total points to 0-100 scale
    EFFECT_WEIGHT: 0.06 // +/- 6% max influence on match performance
  },

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
    INITIAL_STAMINA: 100,
    DRAIN_PER_MINUTE: 0.36, // -> ~67% stamina by 90'
    TIRED_THRESHOLD: 75,
    PERFORMANCE_PENALTY_PER_POINT: 0.002 // e.g., 20 points below threshold = 4% stat penalty
  },

  // Formations available in MVP
  FORMATIONS: {
    '4-3-3': {
      id: '4-3-3',
      name: '4-3-3',
      slots: [
        { id: 'gk', label: 'PO', position: 'GK', x: 50, y: 88 },
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
      // Undirected links for chemistry
      links: [
        ['gk', 'lcb'], ['gk', 'rcb'],
        ['lb', 'lcb'], ['lb', 'lcm'], ['lb', 'lw'],
        ['lcb', 'rcb'], ['lcb', 'dm'], ['lcb', 'lcm'],
        ['rcb', 'rb'], ['rcb', 'dm'], ['rcb', 'rcm'],
        ['rb', 'rcm'], ['rb', 'rw'],
        ['dm', 'lcm'], ['dm', 'rcm'],
        ['lcm', 'lw'], ['lcm', 'cf'], ['lcm', 'rcm'],
        ['rcm', 'rw'], ['rcm', 'cf'],
        ['lw', 'cf'], ['rw', 'cf']
      ]
    },
    '4-2-3-1': {
      id: '4-2-3-1',
      name: '4-2-3-1',
      slots: [
        { id: 'gk', label: 'PO', position: 'GK', x: 50, y: 88 },
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
      links: [
        ['gk', 'lcb'], ['gk', 'rcb'],
        ['lb', 'lcb'], ['lb', 'ldm'], ['lb', 'lam'],
        ['lcb', 'rcb'], ['lcb', 'ldm'],
        ['rcb', 'rb'], ['rcb', 'rdm'],
        ['rb', 'rdm'], ['rb', 'ram'],
        ['ldm', 'rdm'], ['ldm', 'lam'], ['ldm', 'am'],
        ['rdm', 'ram'], ['rdm', 'am'],
        ['lam', 'am'], ['lam', 'cf'],
        ['am', 'ram'], ['am', 'cf'],
        ['ram', 'cf']
      ]
    },
    '4-4-2': {
      id: '4-4-2',
      name: '4-4-2',
      slots: [
        { id: 'gk', label: 'PO', position: 'GK', x: 50, y: 88 },
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
      links: [
        ['gk', 'lcb'], ['gk', 'rcb'],
        ['lb', 'lcb'], ['lb', 'lm'],
        ['lcb', 'rcb'], ['lcb', 'lcm'],
        ['rcb', 'rb'], ['rcb', 'rcm'],
        ['rb', 'rm'],
        ['lm', 'lcm'], ['lm', 'lcf'],
        ['lcm', 'rcm'], ['lcm', 'lcf'],
        ['rcm', 'rm'], ['rcm', 'rcf'],
        ['rm', 'rcf'],
        ['lcf', 'rcf']
      ]
    }
  },

  // Planned positions for the 5 bench picks
  BENCH_ROLES: [
    { id: 'b1', label: 'Suplente 1', position: 'GK' },
    { id: 'b2', label: 'Suplente 2', position: 'CB' },
    { id: 'b3', label: 'Suplente 3', position: 'CMF' },
    { id: 'b4', label: 'Suplente 4', position: 'LMF' },
    { id: 'b5', label: 'Suplente 5', position: 'CF' }
  ]
};
