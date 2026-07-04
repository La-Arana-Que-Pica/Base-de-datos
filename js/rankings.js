'use strict';

const RANK_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];
const RANK_POSITION_LABELS = {
  GK: 'PT', CB: 'DFC', LB: 'LI', RB: 'LD', DMF: 'MCD', CMF: 'MC', LMF: 'MI', RMF: 'MD',
  AMF: 'MP', LWF: 'EI', RWF: 'ED', SS: 'SD', CF: 'DC',
};

const SORT_OPTIONS = [
  ['fit', 'Mejor'],
  ['meta', 'Mas meta'],
  ['young', 'Joven'],
  ['regional', 'Realista'],
  ['undervalued', 'Infraval.'],
  ['overall', 'Media'],
];

const QUICK_SCOUTING_PRESETS = [
  ['starter', 'Titular'],
  ['rotation', 'Suplente'],
  ['prospect', 'Promesa'],
  ['veteran', 'Veterano'],
  ['realistic', 'Realista'],
  ['undervalued', 'Infravalorado'],
  ['utility', 'Polifuncional'],
];

const FORMATION_OPTIONS = [
  ['4-3-3', '4-3-3'],
  ['4-2-3-1', '4-2-3-1'],
  ['4-4-2', '4-4-2'],
  ['4-3-1-2', '4-3-1-2'],
  ['3-5-2', '3-5-2'],
  ['5-3-2', '5-3-2'],
  ['4-1-2-3', '4-1-2-3'],
  ['4-2-1-3', '4-2-1-3'],
];

const FORMATION_REQUIREMENTS = {
  '4-3-3': [
    { key: 'gk', label: 'PT', count: 1, positions: ['GK'] },
    { key: 'cb', label: 'DFC', count: 2, positions: ['CB'] },
    { key: 'lb', label: 'LI', count: 1, positions: ['LB'] },
    { key: 'rb', label: 'LD', count: 1, positions: ['RB'] },
    { key: 'dm', label: 'MCD/MC', count: 1, positions: ['DMF', 'CMF'] },
    { key: 'cm', label: 'MC/MP', count: 2, positions: ['CMF', 'AMF', 'DMF'] },
    { key: 'lw', label: 'EI', count: 1, positions: ['LWF', 'LMF'] },
    { key: 'rw', label: 'ED', count: 1, positions: ['RWF', 'RMF'] },
    { key: 'cf', label: 'DC', count: 1, positions: ['CF', 'SS'] },
  ],
  '4-2-3-1': [
    { key: 'gk', label: 'PT', count: 1, positions: ['GK'] },
    { key: 'cb', label: 'DFC', count: 2, positions: ['CB'] },
    { key: 'lb', label: 'LI', count: 1, positions: ['LB'] },
    { key: 'rb', label: 'LD', count: 1, positions: ['RB'] },
    { key: 'dm', label: 'MCD/MC', count: 2, positions: ['DMF', 'CMF'] },
    { key: 'am', label: 'MP', count: 1, positions: ['AMF', 'CMF', 'SS'] },
    { key: 'lw', label: 'EI', count: 1, positions: ['LWF', 'LMF'] },
    { key: 'rw', label: 'ED', count: 1, positions: ['RWF', 'RMF'] },
    { key: 'cf', label: 'DC', count: 1, positions: ['CF', 'SS'] },
  ],
  '4-4-2': [
    { key: 'gk', label: 'PT', count: 1, positions: ['GK'] },
    { key: 'cb', label: 'DFC', count: 2, positions: ['CB'] },
    { key: 'lb', label: 'LI', count: 1, positions: ['LB'] },
    { key: 'rb', label: 'LD', count: 1, positions: ['RB'] },
    { key: 'cm', label: 'MC/MCD', count: 2, positions: ['CMF', 'DMF'] },
    { key: 'lm', label: 'MI', count: 1, positions: ['LMF', 'LWF'] },
    { key: 'rm', label: 'MD', count: 1, positions: ['RMF', 'RWF'] },
    { key: 'fw', label: 'DC/SD', count: 2, positions: ['CF', 'SS'] },
  ],
  '4-3-1-2': [
    { key: 'gk', label: 'PT', count: 1, positions: ['GK'] },
    { key: 'cb', label: 'DFC', count: 2, positions: ['CB'] },
    { key: 'lb', label: 'LI', count: 1, positions: ['LB'] },
    { key: 'rb', label: 'LD', count: 1, positions: ['RB'] },
    { key: 'cm', label: 'MC/MCD', count: 3, positions: ['CMF', 'DMF'] },
    { key: 'am', label: 'MP', count: 1, positions: ['AMF', 'SS'] },
    { key: 'fw', label: 'DC/SD', count: 2, positions: ['CF', 'SS'] },
  ],
  '3-5-2': [
    { key: 'gk', label: 'PT', count: 1, positions: ['GK'] },
    { key: 'cb', label: 'DFC', count: 3, positions: ['CB', 'DMF'] },
    { key: 'wb', label: 'Carrileros', count: 2, positions: ['LB', 'RB', 'LMF', 'RMF'] },
    { key: 'cm', label: 'MC/MCD', count: 2, positions: ['CMF', 'DMF'] },
    { key: 'am', label: 'MP/MC', count: 1, positions: ['AMF', 'CMF'] },
    { key: 'fw', label: 'DC/SD', count: 2, positions: ['CF', 'SS'] },
  ],
  '5-3-2': [
    { key: 'gk', label: 'PT', count: 1, positions: ['GK'] },
    { key: 'cb', label: 'DFC', count: 3, positions: ['CB'] },
    { key: 'fb', label: 'Laterales', count: 2, positions: ['LB', 'RB', 'LMF', 'RMF'] },
    { key: 'cm', label: 'MC/MCD', count: 3, positions: ['CMF', 'DMF', 'AMF'] },
    { key: 'fw', label: 'DC/SD', count: 2, positions: ['CF', 'SS'] },
  ],
  '4-1-2-3': [
    { key: 'gk', label: 'PT', count: 1, positions: ['GK'] },
    { key: 'cb', label: 'DFC', count: 2, positions: ['CB'] },
    { key: 'lb', label: 'LI', count: 1, positions: ['LB'] },
    { key: 'rb', label: 'LD', count: 1, positions: ['RB'] },
    { key: 'dm', label: 'MCD', count: 1, positions: ['DMF'] },
    { key: 'cm', label: 'MC/MP', count: 2, positions: ['CMF', 'AMF'] },
    { key: 'lw', label: 'EI', count: 1, positions: ['LWF', 'LMF'] },
    { key: 'rw', label: 'ED', count: 1, positions: ['RWF', 'RMF'] },
    { key: 'cf', label: 'DC', count: 1, positions: ['CF', 'SS'] },
  ],
  '4-2-1-3': [
    { key: 'gk', label: 'PT', count: 1, positions: ['GK'] },
    { key: 'cb', label: 'DFC', count: 2, positions: ['CB'] },
    { key: 'lb', label: 'LI', count: 1, positions: ['LB'] },
    { key: 'rb', label: 'LD', count: 1, positions: ['RB'] },
    { key: 'dm', label: 'MCD/MC', count: 2, positions: ['DMF', 'CMF'] },
    { key: 'am', label: 'MP', count: 1, positions: ['AMF', 'SS'] },
    { key: 'lw', label: 'EI', count: 1, positions: ['LWF', 'LMF'] },
    { key: 'rw', label: 'ED', count: 1, positions: ['RWF', 'RMF'] },
    { key: 'cf', label: 'DC', count: 1, positions: ['CF', 'SS'] },
  ],
};

const SPECIAL_TEAM_IDS = new Set(['2703', '2704']);
const SPECIAL_LEAGUE_IDS = new Set(['9002']);
const SPECIAL_TEAM_NAME_PATTERNS = [/halcones dorados/i, /metegol/i, /clas/i, /classic/i, /fantasy/i];

const STAT_ALIASES = {
  speed: ['Speed', 'Velocidad'],
  acceleration: ['Explosive Power', 'Acceleration', 'Aceleracion', 'Fuerza explosiva'],
  dribbling: ['Dribbling', 'Regate', 'Drible'],
  ballControl: ['Ball Control', 'Control de balon'],
  lowPass: ['Low Pass', 'Pase raso', 'Pase al ras'],
  loftedPass: ['Lofted Pass', 'Pase elevado', 'Pase bombeado'],
  stamina: ['Stamina', 'Resistencia'],
  attackingProwess: ['Attacking Prowess', 'Ataque'],
  finishing: ['Finishing', 'Definicion', 'Finalizacion'],
  physicalContact: ['Physical Contact', 'Contacto fisico'],
  kickingPower: ['Kicking Power', 'Potencia de tiro'],
  defensiveProwess: ['Defensive Prowess', 'Defensa'],
  ballWinning: ['Ball Winning', 'Recuperacion de balon'],
  header: ['Header', 'Cabezazo', 'Cabeza'],
  jump: ['Jump', 'Salto'],
  bodyControl: ['Body Control', 'Control corporal', 'Balance'],
  controlledSpin: ['Controlled Spin', 'Efecto'],
  catching: ['Catching', 'Atajada', 'Atajar'],
  reflexes: ['Reflexes', 'Reflejos'],
  coverage: ['Coverage', 'Cobertura', 'Alcance'],
  clearing: ['Clearing', 'Despeje', 'Despejar'],
  goalkeeping: ['Goalkeeping', 'Porteria'],
  height: ['Height', 'Altura'],
};

const META_PROFILES = {
  any: {
    tag: 'Scouting flexible',
    weights: [['speed', 0.16], ['acceleration', 0.14], ['ballControl', 0.13], ['lowPass', 0.12], ['stamina', 0.12], ['physicalContact', 0.10], ['ballWinning', 0.09], ['finishing', 0.08], ['defensiveProwess', 0.06]],
    keyStats: ['speed', 'acceleration', 'ballControl', 'lowPass', 'stamina'],
  },
  fast: {
    tag: 'Rapido',
    weights: [['speed', 0.28], ['acceleration', 0.28], ['ballControl', 0.16], ['dribbling', 0.16], ['stamina', 0.12]],
    keyStats: ['speed', 'acceleration', 'dribbling', 'ballControl', 'stamina'],
  },
  scorer: {
    tag: 'Goleador',
    weights: [['finishing', 0.25], ['kickingPower', 0.18], ['ballControl', 0.15], ['header', 0.14], ['physicalContact', 0.14], ['speed', 0.14]],
    keyStats: ['finishing', 'kickingPower', 'ballControl', 'header', 'physicalContact'],
  },
  physical: {
    tag: 'Fisico',
    weights: [['physicalContact', 0.25], ['bodyControl', 0.18], ['stamina', 0.18], ['jump', 0.15], ['header', 0.14], ['speed', 0.10]],
    keyStats: ['physicalContact', 'bodyControl', 'stamina', 'jump', 'header'],
  },
  technical: {
    tag: 'Tecnico',
    weights: [['ballControl', 0.25], ['dribbling', 0.22], ['lowPass', 0.18], ['loftedPass', 0.14], ['controlledSpin', 0.11], ['bodyControl', 0.10]],
    keyStats: ['ballControl', 'dribbling', 'lowPass', 'loftedPass', 'controlledSpin'],
  },
  defensive: {
    tag: 'Defensivo',
    weights: [['defensiveProwess', 0.25], ['ballWinning', 0.24], ['physicalContact', 0.18], ['jump', 0.12], ['header', 0.11], ['speed', 0.10]],
    keyStats: ['defensiveProwess', 'ballWinning', 'physicalContact', 'jump', 'speed'],
  },
  creator: {
    tag: 'Creador',
    weights: [['lowPass', 0.24], ['loftedPass', 0.20], ['ballControl', 0.18], ['controlledSpin', 0.14], ['dribbling', 0.12], ['stamina', 0.12]],
    keyStats: ['lowPass', 'loftedPass', 'ballControl', 'controlledSpin', 'stamina'],
  },
  boxToBox: {
    tag: 'Todoterreno',
    weights: [['stamina', 0.20], ['ballWinning', 0.18], ['lowPass', 0.15], ['ballControl', 0.14], ['physicalContact', 0.14], ['speed', 0.11], ['acceleration', 0.08]],
    keyStats: ['stamina', 'ballWinning', 'lowPass', 'physicalContact', 'speed'],
  },
  young: {
    tag: 'Promesa',
    weights: [['speed', 0.18], ['acceleration', 0.16], ['ballControl', 0.16], ['dribbling', 0.13], ['lowPass', 0.12], ['stamina', 0.12], ['finishing', 0.08], ['ballWinning', 0.05]],
    keyStats: ['speed', 'acceleration', 'ballControl', 'dribbling', 'stamina'],
  },
  undervalued: {
    tag: 'Infravalorado',
    weights: [['speed', 0.17], ['acceleration', 0.15], ['stamina', 0.14], ['physicalContact', 0.13], ['ballControl', 0.13], ['lowPass', 0.11], ['ballWinning', 0.10], ['finishing', 0.07]],
    keyStats: ['speed', 'acceleration', 'stamina', 'physicalContact', 'ballControl'],
  },
  gk_reflex: {
    tag: 'Arquero reflejos',
    weights: [['reflexes', 0.32], ['coverage', 0.20], ['catching', 0.18], ['jump', 0.16], ['clearing', 0.10], ['goalkeeping', 0.04]],
    keyStats: ['reflexes', 'coverage', 'catching', 'jump', 'clearing'],
  },
  gk_safe: {
    tag: 'Arquero seguro',
    weights: [['catching', 0.28], ['goalkeeping', 0.22], ['coverage', 0.18], ['reflexes', 0.18], ['clearing', 0.14]],
    keyStats: ['catching', 'goalkeeping', 'coverage', 'reflexes', 'clearing'],
  },
  gk_tall: {
    tag: 'Arquero alto',
    weights: [['height', 0.22], ['jump', 0.20], ['coverage', 0.18], ['catching', 0.16], ['reflexes', 0.16], ['clearing', 0.08]],
    keyStats: ['height', 'jump', 'coverage', 'catching', 'reflexes'],
  },
  gk_clear: {
    tag: 'Arquero buen despeje',
    weights: [['clearing', 0.30], ['kickingPower', 0.18], ['catching', 0.17], ['reflexes', 0.17], ['coverage', 0.12], ['goalkeeping', 0.06]],
    keyStats: ['clearing', 'kickingPower', 'catching', 'reflexes', 'coverage'],
  },
  gk_complete: {
    tag: 'Arquero completo',
    weights: [['catching', 0.22], ['reflexes', 0.22], ['coverage', 0.20], ['clearing', 0.16], ['jump', 0.12], ['goalkeeping', 0.08]],
    keyStats: ['catching', 'reflexes', 'coverage', 'clearing', 'jump'],
  },
  cb_fast: {
    tag: 'Central rapido',
    weights: [['speed', 0.22], ['acceleration', 0.18], ['defensiveProwess', 0.20], ['ballWinning', 0.18], ['physicalContact', 0.12], ['header', 0.10]],
    keyStats: ['speed', 'acceleration', 'defensiveProwess', 'ballWinning', 'physicalContact'],
  },
  cb_strong: {
    tag: 'Central fuerte',
    weights: [['physicalContact', 0.26], ['defensiveProwess', 0.22], ['ballWinning', 0.20], ['header', 0.14], ['jump', 0.10], ['speed', 0.08]],
    keyStats: ['physicalContact', 'defensiveProwess', 'ballWinning', 'header', 'jump'],
  },
  cb_air: {
    tag: 'Central aereo',
    weights: [['header', 0.28], ['jump', 0.22], ['physicalContact', 0.18], ['defensiveProwess', 0.17], ['ballWinning', 0.10], ['height', 0.05]],
    keyStats: ['header', 'jump', 'height', 'physicalContact', 'defensiveProwess'],
  },
  cb_technical: {
    tag: 'Central tecnico',
    weights: [['defensiveProwess', 0.20], ['ballWinning', 0.19], ['lowPass', 0.18], ['ballControl', 0.15], ['loftedPass', 0.12], ['physicalContact', 0.10], ['speed', 0.06]],
    keyStats: ['defensiveProwess', 'ballWinning', 'lowPass', 'ballControl', 'loftedPass'],
  },
  cb_complete: {
    tag: 'Central completo',
    weights: [['defensiveProwess', 0.22], ['ballWinning', 0.22], ['physicalContact', 0.16], ['speed', 0.14], ['header', 0.12], ['jump', 0.08], ['lowPass', 0.06]],
    keyStats: ['defensiveProwess', 'ballWinning', 'physicalContact', 'speed', 'header'],
  },
  fullback_attacking: {
    tag: 'Lateral ofensivo',
    weights: [['speed', 0.20], ['acceleration', 0.18], ['stamina', 0.18], ['loftedPass', 0.16], ['dribbling', 0.14], ['lowPass', 0.08], ['ballWinning', 0.06]],
    keyStats: ['speed', 'acceleration', 'stamina', 'loftedPass', 'dribbling'],
  },
  fullback_defensive: {
    tag: 'Lateral defensivo',
    weights: [['speed', 0.17], ['stamina', 0.17], ['defensiveProwess', 0.20], ['ballWinning', 0.20], ['physicalContact', 0.12], ['acceleration', 0.10], ['lowPass', 0.04]],
    keyStats: ['defensiveProwess', 'ballWinning', 'speed', 'stamina', 'physicalContact'],
  },
  fullback_fast: {
    tag: 'Lateral rapido',
    weights: [['speed', 0.27], ['acceleration', 0.25], ['stamina', 0.18], ['dribbling', 0.12], ['ballWinning', 0.10], ['loftedPass', 0.08]],
    keyStats: ['speed', 'acceleration', 'stamina', 'dribbling', 'ballWinning'],
  },
  fullback_stamina: {
    tag: 'Lateral resistente',
    weights: [['stamina', 0.26], ['speed', 0.20], ['acceleration', 0.17], ['ballWinning', 0.14], ['defensiveProwess', 0.12], ['loftedPass', 0.11]],
    keyStats: ['stamina', 'speed', 'acceleration', 'ballWinning', 'loftedPass'],
  },
  fullback_wingback: {
    tag: 'Carrilero',
    weights: [['stamina', 0.22], ['speed', 0.20], ['acceleration', 0.18], ['loftedPass', 0.15], ['dribbling', 0.12], ['lowPass', 0.08], ['ballWinning', 0.05]],
    keyStats: ['stamina', 'speed', 'acceleration', 'loftedPass', 'dribbling'],
  },
  fullback_complete: {
    tag: 'Lateral completo',
    weights: [['speed', 0.18], ['acceleration', 0.16], ['stamina', 0.18], ['defensiveProwess', 0.15], ['ballWinning', 0.15], ['loftedPass', 0.11], ['dribbling', 0.07]],
    keyStats: ['speed', 'acceleration', 'stamina', 'defensiveProwess', 'loftedPass'],
  },
  dmf_recover: {
    tag: '5 recuperador',
    weights: [['ballWinning', 0.26], ['defensiveProwess', 0.22], ['stamina', 0.16], ['physicalContact', 0.14], ['lowPass', 0.12], ['speed', 0.10]],
    keyStats: ['ballWinning', 'defensiveProwess', 'stamina', 'physicalContact', 'lowPass'],
  },
  dmf_distributor: {
    tag: '5 distribuidor',
    weights: [['lowPass', 0.24], ['loftedPass', 0.20], ['ballControl', 0.18], ['ballWinning', 0.14], ['stamina', 0.12], ['defensiveProwess', 0.12]],
    keyStats: ['lowPass', 'loftedPass', 'ballControl', 'ballWinning', 'stamina'],
  },
  midfielder_creator: {
    tag: 'Volante creador',
    weights: [['lowPass', 0.22], ['loftedPass', 0.18], ['ballControl', 0.17], ['dribbling', 0.14], ['controlledSpin', 0.12], ['stamina', 0.10], ['speed', 0.07]],
    keyStats: ['lowPass', 'loftedPass', 'ballControl', 'dribbling', 'controlledSpin'],
  },
  midfielder_box: {
    tag: 'Volante todoterreno',
    weights: [['stamina', 0.20], ['ballWinning', 0.17], ['lowPass', 0.15], ['ballControl', 0.14], ['physicalContact', 0.13], ['speed', 0.12], ['acceleration', 0.09]],
    keyStats: ['stamina', 'ballWinning', 'lowPass', 'physicalContact', 'speed'],
  },
  amf_classic: {
    tag: 'Enganche clasico',
    weights: [['ballControl', 0.24], ['lowPass', 0.21], ['dribbling', 0.18], ['loftedPass', 0.14], ['controlledSpin', 0.13], ['finishing', 0.10]],
    keyStats: ['ballControl', 'lowPass', 'dribbling', 'loftedPass', 'controlledSpin'],
  },
  amf_goal: {
    tag: 'Mediapunta goleador',
    weights: [['finishing', 0.22], ['kickingPower', 0.18], ['ballControl', 0.18], ['dribbling', 0.16], ['speed', 0.14], ['acceleration', 0.12]],
    keyStats: ['finishing', 'kickingPower', 'ballControl', 'dribbling', 'speed'],
  },
  amf_complete: {
    tag: 'Mediapunta completo',
    weights: [['ballControl', 0.20], ['dribbling', 0.17], ['lowPass', 0.16], ['finishing', 0.14], ['speed', 0.13], ['acceleration', 0.10], ['kickingPower', 0.10]],
    keyStats: ['ballControl', 'dribbling', 'lowPass', 'finishing', 'speed'],
  },
  winger_fast: {
    tag: 'Extremo rapido',
    weights: [['speed', 0.25], ['acceleration', 0.25], ['dribbling', 0.16], ['ballControl', 0.14], ['stamina', 0.10], ['lowPass', 0.10]],
    keyStats: ['speed', 'acceleration', 'dribbling', 'ballControl', 'stamina'],
  },
  winger_assist: {
    tag: 'Extremo asistidor',
    weights: [['speed', 0.18], ['acceleration', 0.16], ['loftedPass', 0.18], ['lowPass', 0.16], ['dribbling', 0.15], ['ballControl', 0.12], ['stamina', 0.05]],
    keyStats: ['speed', 'acceleration', 'loftedPass', 'lowPass', 'dribbling'],
  },
  winger_goal: {
    tag: 'Extremo goleador',
    weights: [['speed', 0.20], ['acceleration', 0.18], ['finishing', 0.20], ['dribbling', 0.15], ['ballControl', 0.12], ['kickingPower', 0.10], ['stamina', 0.05]],
    keyStats: ['speed', 'acceleration', 'finishing', 'dribbling', 'kickingPower'],
  },
  ss_associative: {
    tag: 'Segundo delantero asociativo',
    weights: [['ballControl', 0.20], ['lowPass', 0.18], ['dribbling', 0.17], ['finishing', 0.15], ['speed', 0.13], ['acceleration', 0.10], ['kickingPower', 0.07]],
    keyStats: ['ballControl', 'lowPass', 'dribbling', 'finishing', 'speed'],
  },
  ss_complete: {
    tag: 'Segundo delantero completo',
    weights: [['finishing', 0.19], ['ballControl', 0.18], ['dribbling', 0.16], ['speed', 0.15], ['acceleration', 0.12], ['lowPass', 0.11], ['kickingPower', 0.09]],
    keyStats: ['finishing', 'ballControl', 'dribbling', 'speed', 'lowPass'],
  },
  cf_box: {
    tag: '9 de area',
    weights: [['finishing', 0.26], ['physicalContact', 0.18], ['header', 0.17], ['kickingPower', 0.16], ['ballControl', 0.12], ['jump', 0.11]],
    keyStats: ['finishing', 'physicalContact', 'header', 'kickingPower', 'ballControl'],
  },
  cf_fast: {
    tag: '9 rapido',
    weights: [['finishing', 0.22], ['speed', 0.20], ['acceleration', 0.18], ['kickingPower', 0.14], ['ballControl', 0.14], ['physicalContact', 0.12]],
    keyStats: ['finishing', 'speed', 'acceleration', 'kickingPower', 'ballControl'],
  },
  cf_physical: {
    tag: '9 fisico',
    weights: [['physicalContact', 0.24], ['finishing', 0.22], ['kickingPower', 0.16], ['header', 0.15], ['jump', 0.11], ['ballControl', 0.08], ['speed', 0.04]],
    keyStats: ['physicalContact', 'finishing', 'kickingPower', 'header', 'jump'],
  },
  cf_header: {
    tag: '9 cabeceador',
    weights: [['header', 0.25], ['jump', 0.20], ['finishing', 0.19], ['physicalContact', 0.16], ['kickingPower', 0.10], ['height', 0.06], ['ballControl', 0.04]],
    keyStats: ['header', 'jump', 'height', 'finishing', 'physicalContact'],
  },
  cf_complete: {
    tag: '9 completo',
    weights: [['finishing', 0.22], ['kickingPower', 0.15], ['physicalContact', 0.14], ['speed', 0.14], ['acceleration', 0.11], ['ballControl', 0.13], ['header', 0.11]],
    keyStats: ['finishing', 'kickingPower', 'physicalContact', 'speed', 'ballControl'],
  },
};

const GENERAL_PROFILE_OPTIONS = [
  { id: 'auto', label: 'Cualquiera', tag: 'Perfil flexible' },
  { id: 'fast', label: 'Rapido', tag: 'Rapido' },
  { id: 'scorer', label: 'Goleador', tag: 'Goleador' },
  { id: 'physical', label: 'Fisico', tag: 'Fisico' },
  { id: 'technical', label: 'Tecnico', tag: 'Tecnico' },
  { id: 'defensive', label: 'Defensivo', tag: 'Defensivo' },
  { id: 'creator', label: 'Creador', tag: 'Creador' },
  { id: 'boxToBox', label: 'Todoterreno', tag: 'Todoterreno' },
  { id: 'young', label: 'Joven/promesa', tag: 'Promesa' },
  { id: 'undervalued', label: 'Infravalorado', tag: 'Infravalorado' },
];

const PROTOTYPES_BY_POSITION = {
  GK: [
    ['gk_reflex', 'Arquero reflejos'], ['gk_safe', 'Arquero seguro'], ['gk_tall', 'Arquero alto'],
    ['gk_clear', 'Arquero con buen despeje'], ['gk_complete', 'Arquero completo'],
  ],
  CB: [
    ['cb_fast', 'Central rapido'], ['cb_strong', 'Central fuerte'], ['cb_air', 'Central aereo'],
    ['cb_technical', 'Central tecnico'], ['cb_complete', 'Central completo'], ['young', 'Central joven/promesa'],
  ],
  LB: [
    ['fullback_attacking', 'Lateral ofensivo'], ['fullback_defensive', 'Lateral defensivo'], ['fullback_fast', 'Lateral rapido'],
    ['fullback_stamina', 'Lateral resistente'], ['fullback_wingback', 'Carrilero'], ['fullback_complete', 'Lateral completo'],
  ],
  RB: [
    ['fullback_attacking', 'Lateral ofensivo'], ['fullback_defensive', 'Lateral defensivo'], ['fullback_fast', 'Lateral rapido'],
    ['fullback_stamina', 'Lateral resistente'], ['fullback_wingback', 'Carrilero'], ['fullback_complete', 'Lateral completo'],
  ],
  DMF: [
    ['dmf_recover', '5 recuperador'], ['physical', '5 fisico'], ['dmf_distributor', '5 distribuidor'],
    ['boxToBox', 'Mediocentro equilibrado'], ['defensive', 'Volante tapon'], ['young', 'Mediocentro joven'],
  ],
  CMF: [
    ['midfielder_box', 'Volante todoterreno'], ['midfielder_creator', 'Volante creador'], ['physical', 'Volante fisico'],
    ['technical', 'Volante tecnico'], ['boxToBox', 'Volante mixto'], ['young', 'Volante joven/promesa'],
  ],
  LMF: [
    ['midfielder_box', 'Volante todoterreno'], ['midfielder_creator', 'Volante creador'], ['fast', 'Volante rapido'],
    ['technical', 'Volante tecnico'], ['boxToBox', 'Volante mixto'], ['young', 'Volante joven/promesa'],
  ],
  RMF: [
    ['midfielder_box', 'Volante todoterreno'], ['midfielder_creator', 'Volante creador'], ['fast', 'Volante rapido'],
    ['technical', 'Volante tecnico'], ['boxToBox', 'Volante mixto'], ['young', 'Volante joven/promesa'],
  ],
  AMF: [
    ['amf_classic', 'Enganche clasico'], ['creator', 'Creador de juego'], ['fast', 'Mediapunta rapido'],
    ['amf_goal', 'Mediapunta goleador'], ['technical', 'Mediapunta tecnico'], ['amf_complete', 'Mediapunta completo'],
  ],
  LWF: [
    ['winger_fast', 'Extremo rapido'], ['technical', 'Extremo regateador'], ['winger_assist', 'Extremo asistidor'],
    ['winger_goal', 'Extremo goleador'], ['physical', 'Extremo fisico'], ['fast', 'Extremo completo'],
  ],
  RWF: [
    ['winger_fast', 'Extremo rapido'], ['technical', 'Extremo regateador'], ['winger_assist', 'Extremo asistidor'],
    ['winger_goal', 'Extremo goleador'], ['physical', 'Extremo fisico'], ['fast', 'Extremo completo'],
  ],
  SS: [
    ['fast', 'Segundo delantero rapido'], ['technical', 'Segundo delantero tecnico'], ['scorer', 'Segundo delantero goleador'],
    ['ss_associative', 'Segundo delantero asociativo'], ['ss_complete', 'Segundo delantero completo'],
  ],
  CF: [
    ['cf_box', '9 de area'], ['cf_fast', '9 rapido'], ['cf_physical', '9 fisico'], ['cf_header', '9 cabeceador'],
    ['cf_complete', '9 completo'], ['young', 'Delantero joven/promesa'], ['undervalued', 'Delantero infravalorado'],
  ],
};

const POSITION_GROUPS = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['DMF', 'CMF', 'LMF', 'RMF', 'AMF'],
  FWD: ['LWF', 'RWF', 'SS', 'CF'],
};

const POSITION_PROFILE_HINT = {
  GK: 'gk_complete',
  CB: 'cb_complete',
  LB: 'fullback_complete',
  RB: 'fullback_complete',
  DMF: 'dmf_recover',
  CMF: 'midfielder_box',
  LMF: 'fast',
  RMF: 'fast',
  AMF: 'creator',
  LWF: 'winger_fast',
  RWF: 'winger_fast',
  SS: 'ss_associative',
  CF: 'cf_complete',
};

const IDEAL_POSITION_DEPTH = {
  GK: 2, CB: 4, LB: 2, RB: 2, DMF: 2, CMF: 3, LMF: 1, RMF: 1, AMF: 2, LWF: 1, RWF: 1, SS: 1, CF: 3,
};

const CONMEBOL_COUNTRIES = new Set(['144', '145', '146', '147', '148', '149', '150', '151', '152', '153']);
const EUROPE_COUNTRIES = new Set(['194', '196', '197', '198', '199', '200', '201', '202', '203', '204', '207', '208', '209', '210', '211', '212', '213', '214', '215', '219', '221', '223', '224', '225', '226', '227', '228', '229', '230', '232', '234', '235', '236', '237', '238', '239', '241', '303', '304', '311']);
const COUNTRY_NAMES = {
  '144': 'Argentina', '145': 'Bolivia', '146': 'Brasil', '147': 'Chile', '148': 'Colombia',
  '149': 'Ecuador', '150': 'Paraguay', '151': 'Peru', '152': 'Uruguay', '153': 'Venezuela',
  '110': 'Canada', '112': 'Costa Rica', '120': 'Haiti', '121': 'Honduras', '122': 'Jamaica',
  '124': 'Mexico', '128': 'Panama', '135': 'Estados Unidos', '162': 'Australia',
  '166': 'Nueva Zelanda', '189': 'Israel', '190': 'Turquia', '191': 'Albania',
  '193': 'Armenia', '194': 'Austria', '196': 'Bielorrusia', '197': 'Belgica',
  '198': 'Bosnia y Herzegovina', '199': 'Bulgaria', '200': 'Croacia', '201': 'Chipre',
  '202': 'Rep. Checa', '203': 'Dinamarca', '204': 'Inglaterra', '207': 'Finlandia',
  '208': 'Francia', '209': 'Georgia', '210': 'Alemania', '211': 'Grecia',
  '212': 'Hungria', '213': 'Islandia', '214': 'Irlanda', '215': 'Italia',
  '219': 'Lituania', '221': 'Macedonia del Norte', '223': 'Moldavia', '224': 'Paises Bajos',
  '225': 'Irlanda del Norte', '226': 'Noruega', '227': 'Polonia', '228': 'Portugal',
  '229': 'Rumania', '230': 'Rusia', '232': 'Escocia', '234': 'Eslovaquia',
  '235': 'Eslovenia', '236': 'Espana', '237': 'Suecia', '238': 'Suiza',
  '239': 'Ucrania', '240': 'Uzbekistan', '241': 'Gales', '303': 'Serbia',
  '304': 'Montenegro', '311': 'Kosovo',
};

let scoutingDataset = null;
let scoutingFormulas = null;
let scoutingState = {
  leagueId: '',
  teamId: '',
  formation: '',
  position: 'any',
  profile: 'auto',
  minAge: '',
  maxAge: '',
  minOverall: '',
  maxOverall: '',
  minMeta: '',
  regional: true,
  undervalued: false,
  excludeOwn: true,
  showSpecialPlayers: false,
  onlySouthAmerican: false,
  onlyU23: false,
  sort: 'fit',
  quickRole: '',
  advancedOpen: false,
  view: 'cards',
  comparePlayerId: '',
  surpriseId: '',
  offset: 0,
};
let scoutingDropdownOpen = '';
const SCOUTING_CARD_PAGE_SIZE = 4;
const SCOUTING_TABLE_PAGE_SIZE = 24;
const SCOUTING_SAVED_KEY = 'laqp_scouted_players';

function rankEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scoutInlineValue(value) {
  return JSON.stringify(String(value ?? ''));
}

function scoutingPageSize() {
  return scoutingState.view === 'table' ? SCOUTING_TABLE_PAGE_SIZE : SCOUTING_CARD_PAGE_SIZE;
}

function getSavedScouts() {
  try {
    const rows = JSON.parse(localStorage.getItem(SCOUTING_SAVED_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter(row => row && row.playerId).slice(0, 32) : [];
  } catch {
    return [];
  }
}

function setSavedScouts(rows) {
  try {
    localStorage.setItem(SCOUTING_SAVED_KEY, JSON.stringify((rows || []).slice(0, 32)));
  } catch {
    // Local storage can be blocked in private contexts.
  }
}

function scoutSaveKey(playerId, teamId = '') {
  return `${String(playerId || '')}::${String(teamId || '')}`;
}

function playerLinkForScouting(player) {
  if (!player) return typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html';
  return player.teamId
    ? (typeof laqpPlayerUrl === 'function' ? laqpPlayerUrl(player.Id, player.teamId, player.Name) : `player.html?id=${encodeURIComponent(player.Id)}&team=${encodeURIComponent(player.teamId)}`)
    : (typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html');
}

function scoutItemToStorage(item) {
  const player = item.player;
  return {
    playerId: String(player.Id || ''),
    teamId: String(player.teamId || ''),
    name: player.Name || 'Jugador',
    pos: RANK_POSITION_LABELS[item.targetPosition || player.pos] || item.targetPosition || player.pos || '-',
    overall: stat(player, 'OverallStats') || '',
    age: stat(player, 'Age') || '',
    teamName: player.teamName || 'Sin club',
    leagueName: player.leagueName || '',
    fit: Math.round(item.fit || 0),
    savedAt: Date.now(),
  };
}

function effectiveScoutingFormation(formationId = scoutingState.formation) {
  return FORMATION_REQUIREMENTS[formationId] ? formationId : '4-3-3';
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const parseLine = line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };
  const headers = parseLine(lines[0].replace(/^\uFEFF/, ''));
  return lines.slice(1).map(line => {
    if (!line.trim()) return null;
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] !== undefined ? values[index] : ''; });
    return row;
  }).filter(Boolean);
}

async function fetchText(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function stat(row, key) {
  const value = parseInt(row[key], 10);
  return Number.isFinite(value) ? value : 0;
}

function statValue(row, aliasKey) {
  const candidates = STAT_ALIASES[aliasKey] || [aliasKey];
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== '') return stat(row, key);
  }
  return 0;
}

function statLabel(aliasKey) {
  return {
    speed: 'VEL', acceleration: 'ACE', dribbling: 'REG', ballControl: 'CON', lowPass: 'PAS',
    loftedPass: 'PE', stamina: 'RES', attackingProwess: 'ATQ', finishing: 'FIN', physicalContact: 'FIS',
    kickingPower: 'POT', defensiveProwess: 'DEF', ballWinning: 'REC', header: 'CAB', jump: 'SAL',
    bodyControl: 'EQU', controlledSpin: 'EFE', catching: 'ATA', reflexes: 'REF', coverage: 'COB',
    clearing: 'DES', goalkeeping: 'POR', height: 'ALT',
  }[aliasKey] || aliasKey.toUpperCase();
}

function statColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return '#d33d35';
  if (v >= 95) return '#00ff87';
  if (v >= 90) return '#62ff51';
  if (v >= 80) return '#a8ff00';
  if (v >= 70) return '#e5dc00';
  if (v >= 60) return '#e59f01';
  return '#d33d35';
}

function positionGroupColor(pesPos) {
  if (pesPos === 'GK') return '#f9d901';
  if (['CB', 'LB', 'RB'].includes(pesPos)) return '#3EBEC8';
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(pesPos)) return '#57e42b';
  if (['LWF', 'RWF', 'SS', 'CF'].includes(pesPos)) return '#ff2c77';
  return '#8b949e';
}

function flagSrc(countryId) {
  return countryId ? `img/flags/${countryId}.webp` : 'img/flags/default.webp';
}

function computeRadarAttributes(player) {
  const statAvg = (...keys) => Math.round(avg(keys.map(key => stat(player, key))));
  return {
    ATQ: statAvg('Attacking Prowess', 'Finishing', 'Kicking Power'),
    REG: statAvg('Ball Control', 'Dribbling', 'Body Control'),
    DEF: statAvg('Header', 'Jump', 'Defensive Prowess', 'Ball Winning'),
    PAS: statAvg('Low Pass', 'Lofted Pass', 'Place Kicking', 'Controlled Spin'),
    RIT: statAvg('Speed', 'Explosive Power'),
    FIS: statAvg('Physical Contact', 'Stamina'),
    COM: statAvg('Speed', 'Explosive Power', 'Physical Contact', 'Stamina'),
    POR: statAvg('Goalkeeping', 'Catching', 'Clearing', 'Reflexes', 'Coverage'),
  };
}

function playerPosition(player) {
  const raw = player.POS || '';
  const idx = parseInt(raw, 10);
  return /^\d+$/.test(raw) && idx >= 0 && idx < RANK_POSITIONS.length ? RANK_POSITIONS[idx] : raw;
}

function titleCase(value) {
  return String(value || '').toLocaleLowerCase('es').split(' ').filter(Boolean).map(word => {
    const upper = word.toLocaleUpperCase('es').replace(/[^\p{L}\p{N}]/gu, '');
    if (['FC', 'AC', 'CF', 'CA', 'SC', 'RC', 'CD', 'UD', 'AFC', 'PSG', 'PSV'].includes(upper)) return upper;
    return word.charAt(0).toLocaleUpperCase('es') + word.slice(1);
  }).join(' ');
}

function countryName(countryId) {
  return COUNTRY_NAMES[String(countryId)] || String(countryId || '-');
}

function regionForCountry(countryId) {
  const id = String(countryId || '');
  if (CONMEBOL_COUNTRIES.has(id)) return 'south-america';
  if (EUROPE_COUNTRIES.has(id)) return 'europe';
  return 'other';
}

function normalizeSearchText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function regionLabel(region) {
  if (region === 'south-america') return 'Sudamerica';
  if (region === 'europe') return 'Europa';
  return 'Otra region';
}

function isSpecialTeam(team) {
  if (!team) return false;
  if (String(team.type || '') === '1') return true;
  if (SPECIAL_TEAM_IDS.has(String(team.id || ''))) return true;
  if (SPECIAL_LEAGUE_IDS.has(String(team.leagueId || ''))) return true;
  return SPECIAL_TEAM_NAME_PATTERNS.some(pattern => pattern.test(normalizeSearchText(team.name || team.rawName || '')));
}

function isSpecialPlayer(player) {
  if (!player) return false;
  if (player.isSpecial) return true;
  if (String(player.teamType || '') === '1') return true;
  if (SPECIAL_TEAM_IDS.has(String(player.teamId || ''))) return true;
  if (SPECIAL_LEAGUE_IDS.has(String(player.leagueId || ''))) return true;
  return SPECIAL_TEAM_NAME_PATTERNS.some(pattern => pattern.test(normalizeSearchText(player.teamName || '')));
}

function buildCorrectedOverallMap(rows) {
  const map = new Map();
  rows.forEach(row => {
    const playerId = row.PlayerId || row.Id || row.id || row.player_id || '';
    const overall = row.OverallStats || row.Overall || row.corrected_overall || row.media || '';
    if (!playerId || !overall) return;
    map.set(playerId, overall);
  });
  return map;
}

function avg(values) {
  const nums = values.filter(value => Number.isFinite(value) && value > 0);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function inferClubLevel(avgOverall) {
  if (avgOverall < 70) return { id: 'small', label: 'Chico', delta: [-2, 5] };
  if (avgOverall <= 75) return { id: 'medium', label: 'Medio', delta: [-2, 6] };
  if (avgOverall <= 81) return { id: 'competitive', label: 'Media alta', delta: [-3, 5] };
  if (avgOverall <= 86) return { id: 'europe', label: 'Grande', delta: [-2, 4] };
  return { id: 'world', label: 'Elite', delta: [-1, 3] };
}

function positionGroup(pos) {
  return Object.entries(POSITION_GROUPS).find(([, list]) => list.includes(pos))?.[0] || '';
}

function groupLabel(group) {
  return { GK: 'arco', DEF: 'defensa', MID: 'mediocampo', FWD: 'ataque' }[group] || group;
}

function buildDataset(players, teams, squads, leagues, correctedRows) {
  const correctedMap = buildCorrectedOverallMap(correctedRows || []);
  const leagueRows = leagues || [];
  const teamMap = new Map();
  const leagueMap = new Map();
  const validTeamIds = new Set();
  const teamLeagueMap = new Map();
  const playerMap = new Map(players.filter(player => player.Id).map(player => [player.Id, player]));
  const playerAssignments = new Map();

  leagueRows.forEach(league => {
    const leagueId = String(league.league_id || league.Id || league.id || '').trim();
    const leagueName = league.league_name || league.name || league.Name || '';
    const teamIds = String(league.team_ids || '').split(',').map(id => id.trim()).filter(Boolean);
    if (!leagueId || !leagueName || !teamIds.length) return;
    leagueMap.set(leagueId, { id: leagueId, name: leagueName, teamIds, teams: [] });
    teamIds.forEach(id => {
      validTeamIds.add(id);
      teamLeagueMap.set(id, { id: leagueId, name: leagueName });
    });
  });

  teams.forEach(team => {
    if (!team.Id || !team.Name || team.Name === '-') return;
    if (validTeamIds.size && !validTeamIds.has(team.Id)) return;
    const league = teamLeagueMap.get(team.Id) || { id: '', name: '' };
    teamMap.set(team.Id, {
      id: team.Id,
      name: titleCase(team.Name),
      rawName: team.Name,
      country: String(team.Country || ''),
      region: regionForCountry(team.Country),
      type: team.Type || '0',
      leagueId: league.id,
      leagueName: league.name,
      squad: [],
    });
    const created = teamMap.get(team.Id);
    created.isSpecial = isSpecialTeam(created);
  });

  squads.forEach(squad => {
    const team = teamMap.get(squad.Id);
    if (!team) return;
    for (let i = 1; i <= 32; i++) {
      const playerId = squad[`Player ${i}`];
      if (!playerId || playerId === '0') continue;
      const row = playerMap.get(playerId);
      if (!row) continue;
      const overall = correctedMap.get(playerId) || row.OverallStats || '';
      const player = {
        ...row,
        OverallStats: overall,
        teamId: team.id,
        teamName: team.name,
        teamCountry: team.country,
        teamRegion: team.region,
        teamType: team.type,
        leagueId: team.leagueId,
        leagueName: team.leagueName,
        pos: playerPosition(row),
        isSpecial: team.isSpecial,
      };
      team.squad.push(player);
      const currentAssignment = playerAssignments.get(playerId);
      if (
        !currentAssignment ||
        (String(currentAssignment.teamType || '') === '2' && team.type !== '2') ||
        (String(currentAssignment.teamType || '') === '1' && team.type === '0')
      ) {
        playerAssignments.set(playerId, player);
      }
    }
  });

  const clubs = Array.from(teamMap.values()).filter(team => team.type !== '2' && team.squad.length && !team.isSpecial);
  const clubIds = new Set(clubs.map(team => team.id));
  clubs.forEach(team => {
    const ovrs = team.squad.map(player => stat(player, 'OverallStats')).filter(Boolean).sort((a, b) => b - a);
    team.avgOverall = Math.round(avg(ovrs));
    team.startersAvg = Math.round(avg(ovrs.slice(0, 11)));
    team.maxOverall = ovrs[0] || 0;
    team.avgAge = Math.round(avg(team.squad.map(player => stat(player, 'Age'))));
    team.level = inferClubLevel(team.avgOverall);
    team.recommendedRange = [
      Math.max(40, Math.round(team.avgOverall + team.level.delta[0])),
      Math.min(99, Math.round(team.avgOverall + team.level.delta[1])),
    ];
    if (leagueMap.has(team.leagueId)) leagueMap.get(team.leagueId).teams.push(team);
  });

  const availableLeagues = Array.from(leagueMap.values())
    .map(league => ({ ...league, teams: league.teams.sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
    .filter(league => league.teams.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return {
    leagues: availableLeagues,
    teams: clubs.sort((a, b) => a.name.localeCompare(b.name, 'es')),
    players: Array.from(playerAssignments.values())
      .filter(player => clubIds.has(player.teamId) && stat(player, 'OverallStats') > 0),
  };
}

function detectSquadNeeds(teamPlayers, clubAvg, formationId = scoutingState.formation) {
  const effectiveFormation = effectiveScoutingFormation(formationId);
  const formation = FORMATION_REQUIREMENTS[effectiveFormation];
  const needMap = new Map();

  formation.forEach(slot => {
    const candidates = teamPlayers.map(player => {
      const bestTarget = slot.positions
        .map(pos => ({
          pos,
          projected: getProjectedPositionRating(player, pos),
          fit: projectedPositionFit(player, pos, clubAvg),
          natural: player.pos === pos,
        }))
        .sort((a, b) => b.fit - a.fit || b.projected - a.projected)[0];
      return { player, ...bestTarget };
    }).filter(item => item.fit >= 66 || item.natural);

    const naturalCount = candidates.filter(item => slot.positions.includes(item.player.pos)).length;
    const viableCount = candidates.filter(item => item.fit >= 70).length;
    const projectedTop = candidates.map(item => item.projected).sort((a, b) => b - a).slice(0, slot.count);
    const projectedAvg = avg(projectedTop);
    const ages = candidates.map(item => stat(item.player, 'Age')).filter(Boolean);
    const targetPos = slot.positions[0];
    const reasons = [];
    let score = 0;

    const needsExtraDepth = ['lw', 'rw', 'lm', 'rm', 'wb'].includes(slot.key);
    const depthTarget = slot.count + (needsExtraDepth ? 1 : 0);

    if (naturalCount < depthTarget) {
      score += 28 + (depthTarget - naturalCount) * 8;
      reasons.push(`pocos naturales para ${effectiveFormation}`);
    }
    if (viableCount < depthTarget + 1) {
      score += 18;
      reasons.push('poca profundidad tactica');
    }
    if (projectedAvg && projectedAvg <= clubAvg - 2) {
      score += 22 + Math.min(14, (clubAvg - projectedAvg) * 2);
      reasons.push('media proyectada baja');
    }
    if (effectiveFormation === '4-3-3' && ['lw', 'rw'].includes(slot.key) && (naturalCount < 3 || projectedAvg <= clubAvg + 1)) {
      score += 26;
      reasons.push('clave para dar amplitud al 4-3-3');
    }
    if (avg(ages) >= 29 && viableCount) {
      score += 10;
      reasons.push('edad promedio alta');
    }

    const existing = needMap.get(targetPos);
    const need = {
      pos: targetPos,
      label: slot.label,
      positions: slot.positions,
      count: naturalCount,
      avg: Math.round(projectedAvg || 0),
      topAvg: Math.round(projectedAvg || 0),
      avgAge: Math.round(avg(ages) || 0),
      formation: effectiveFormation,
      required: slot.count,
      score: Math.min(100, Math.round(score)),
      reasons,
    };
    if (!existing || need.score > existing.score) needMap.set(targetPos, need);
  });

  RANK_POSITIONS.forEach(pos => {
    const players = teamPlayers.filter(player => player.pos === pos);
    const ovrs = players.map(player => stat(player, 'OverallStats')).filter(Boolean).sort((a, b) => b - a);
    const count = players.length;
    const posAvg = avg(ovrs);
    const idealDepth = IDEAL_POSITION_DEPTH[pos] || 2;
    if (count >= idealDepth && (!posAvg || posAvg > clubAvg - 2)) return;
    const reasons = [];
    let score = 0;
    if (count < idealDepth) {
      score += 18 + (idealDepth - count) * 5;
      reasons.push(count ? 'poca profundidad general' : 'sin variantes claras');
    }
    if (posAvg && posAvg <= clubAvg - 2) {
      score += 16;
      reasons.push('media baja para el nivel del plantel');
    }
    const current = needMap.get(pos);
    const merged = {
      pos,
      label: RANK_POSITION_LABELS[pos] || pos,
      positions: [pos],
      count,
      avg: Math.round(posAvg || 0),
      topAvg: Math.round(avg(ovrs.slice(0, 2)) || 0),
      avgAge: Math.round(avg(players.map(player => stat(player, 'Age'))) || 0),
      formation: effectiveFormation,
      required: idealDepth,
      score: Math.min(100, Math.round(score)),
      reasons,
    };
    if (!current || merged.score > current.score) needMap.set(pos, merged);
  });

  return Array.from(needMap.values())
    .filter(need => need.score >= 25)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'es'));
}

function analyzeClubSquad(team, formationId = scoutingState.formation) {
  const selectedFormation = FORMATION_REQUIREMENTS[formationId] ? formationId : '';
  const effectiveFormation = effectiveScoutingFormation(formationId);
  const byPosition = RANK_POSITIONS.map(pos => {
    const players = team.squad.filter(player => player.pos === pos);
    const ovrs = players.map(player => stat(player, 'OverallStats')).filter(Boolean).sort((a, b) => b - a);
    return {
      pos,
      label: RANK_POSITION_LABELS[pos] || pos,
      count: players.length,
      avg: Math.round(avg(ovrs)),
      topAvg: Math.round(avg(ovrs.slice(0, Math.min(2, Math.max(1, ovrs.length))))),
      avgAge: Math.round(avg(players.map(player => stat(player, 'Age')))),
    };
  });

  const groupRows = Object.entries(POSITION_GROUPS).map(([group, positions]) => {
    const groupPlayers = team.squad.filter(player => positions.includes(player.pos));
    return {
      group,
      label: groupLabel(group),
      avg: Math.round(avg(groupPlayers.map(player => stat(player, 'OverallStats')))),
    };
  }).filter(row => row.avg);

  const strengths = groupRows
    .filter(row => row.avg >= team.avgOverall + 1)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 2);
  const weakGroups = groupRows
    .filter(row => row.avg <= team.avgOverall - 1)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 2);
  const needs = detectSquadNeeds(team.squad, team.avgOverall, effectiveFormation).slice(0, 6);

  const pace = avg(team.squad.map(player => avg([statValue(player, 'speed'), statValue(player, 'acceleration')])));
  const passing = avg(team.squad.map(player => avg([statValue(player, 'lowPass'), statValue(player, 'loftedPass')])));
  const defending = avg(team.squad.map(player => avg([statValue(player, 'defensiveProwess'), statValue(player, 'ballWinning')])));
  const physical = avg(team.squad.map(player => avg([statValue(player, 'physicalContact'), statValue(player, 'stamina')])));
  const attack = avg(team.squad.map(player => avg([statValue(player, 'attackingProwess'), statValue(player, 'finishing'), statValue(player, 'kickingPower')])));
  const styleNotes = [
    pace >= team.avgOverall + 2 ? 'ritmo alto' : '',
    passing >= team.avgOverall + 1 ? 'buen pase' : '',
    defending >= team.avgOverall + 1 ? 'orden defensivo' : '',
    physical >= team.avgOverall + 1 ? 'plantel fisico' : '',
    attack >= team.avgOverall + 1 ? 'ataque fuerte' : '',
  ].filter(Boolean);

  return {
    avgOverall: team.avgOverall,
    byPosition,
    strengths,
    weakGroups,
    needs,
    formation: selectedFormation || 'Sin formacion asignada',
    effectiveFormation,
    styleNotes,
    topPlayers: team.squad.slice().sort((a, b) => stat(b, 'OverallStats') - stat(a, 'OverallStats')).slice(0, 3),
  };
}

function getLeaguesForScouting() {
  return scoutingDataset ? scoutingDataset.leagues : [];
}

function getTeamsByLeague(leagueId) {
  const league = getLeaguesForScouting().find(item => item.id === leagueId);
  return league ? league.teams : [];
}

function getPrototypeOptionsForPosition(position) {
  const base = [{ id: 'auto', label: 'Cualquiera', tag: 'Perfil flexible' }];
  if (!position || position === 'any') return GENERAL_PROFILE_OPTIONS;
  const seen = new Set(['auto']);
  const options = base;
  (PROTOTYPES_BY_POSITION[position] || []).forEach(([id, label]) => {
    const uniqueKey = `${id}_${label}`;
    if (seen.has(uniqueKey)) return;
    seen.add(uniqueKey);
    options.push({ id, label, tag: META_PROFILES[id]?.tag || label });
  });
  return options;
}

const FORMULA_STAT_MAP = {
  attacking_prowess: 'attackingProwess',
  ball_control: 'ballControl',
  dribbling: 'dribbling',
  low_pass: 'lowPass',
  lofted_pass: 'loftedPass',
  finishing: 'finishing',
  place_kicking: 'Place Kicking',
  swerve: 'controlledSpin',
  header: 'header',
  defensive_prowess: 'defensiveProwess',
  ball_winning: 'ballWinning',
  kicking_power: 'kickingPower',
  speed: 'speed',
  explosive_power: 'acceleration',
  body_control: 'bodyControl',
  physical_contact: 'physicalContact',
  jump: 'jump',
  stamina: 'stamina',
  goalkeeper: 'goalkeeping',
  catching: 'catching',
  clearing: 'clearing',
  reflexes: 'reflexes',
  coverage: 'coverage',
};

function formulaStatValue(player, formulaKey) {
  const mapped = FORMULA_STAT_MAP[formulaKey] || formulaKey;
  return STAT_ALIASES[mapped] ? statValue(player, mapped) : stat(player, mapped);
}

function getProjectedPositionRating(player, targetPosition) {
  const target = targetPosition || player.pos || playerPosition(player);
  if (!target) return stat(player, 'OverallStats');
  const formula = scoutingFormulas && scoutingFormulas[target];
  if (formula && formula.interpretable_formula && formula.weights) {
    const decimal = Object.entries(formula.weights).reduce((sum, [key, weight]) => {
      return sum + formulaStatValue(player, key) * Number(weight || 0);
    }, Number(formula.base || 0));
    return Math.max(40, Math.min(99, Math.round(decimal)));
  }
  if (target === player.pos) return stat(player, 'OverallStats');
  return Math.max(40, Math.min(99, Math.round(rawMetaScore(player, POSITION_PROFILE_HINT[target] || 'any'))));
}

function positionAptitude(player, targetPosition) {
  if (!targetPosition) return 0;
  if (player.pos === targetPosition) return 100;
  const value = stat(player, targetPosition);
  if (value >= 2) return 92;
  if (value === 1) return 78;
  if (positionGroup(player.pos) && positionGroup(player.pos) === positionGroup(targetPosition)) return 58;
  return 30;
}

function projectedPositionFit(player, targetPosition, clubAvg) {
  const projected = getProjectedPositionRating(player, targetPosition);
  const aptitude = positionAptitude(player, targetPosition);
  const quality = Math.max(40, Math.min(100, 64 + (projected - clubAvg) * 4));
  return Math.round(aptitude * 0.55 + quality * 0.45);
}

function rawMetaScore(player, profileId) {
  const profile = META_PROFILES[profileId] || META_PROFILES.any;
  return profile.weights.reduce((sum, [aliasKey, weight]) => {
    const value = statValue(player, aliasKey);
    const score = aliasKey === 'height' ? Math.max(40, Math.min(99, (value - 160) * 1.6 + 50)) : value;
    return sum + score * weight;
  }, 0);
}

function bestProfileForPlayer(player, selectedPosition) {
  if (selectedPosition && selectedPosition !== 'any' && PROTOTYPES_BY_POSITION[selectedPosition]) {
    return PROTOTYPES_BY_POSITION[selectedPosition]
      .filter(([id]) => !['young', 'undervalued'].includes(id))
      .map(([id]) => [id, rawMetaScore(player, id)])
      .sort((a, b) => b[1] - a[1])[0]?.[0] || POSITION_PROFILE_HINT[player.pos] || 'any';
  }
  if (player.pos === 'GK') return 'gk_complete';
  const hint = POSITION_PROFILE_HINT[player.pos];
  if (hint) return hint;
  return Object.keys(META_PROFILES)
    .filter(key => !key.startsWith('gk_') && !['any', 'young', 'undervalued'].includes(key))
    .map(key => [key, rawMetaScore(player, key)])
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'any';
}

function getPlayerPrototypeScore(player, prototypeId) {
  const profile = prototypeId === 'auto' ? bestProfileForPlayer(player, scoutingState.position) : prototypeId;
  let score = rawMetaScore(player, profile);
  const age = stat(player, 'Age');
  const overall = stat(player, 'OverallStats');
  if (profile === 'young') {
    const youthBoost = age ? Math.max(0, 24 - age) * 0.9 : 0;
    score = score * 0.82 + overall * 0.10 + youthBoost;
  }
  if (profile === 'undervalued') {
    score += Math.max(0, score - overall) * 0.35;
  }
  return score;
}

function resolveProfileForPlayer(player) {
  return scoutingState.profile === 'auto'
    ? bestProfileForPlayer(player, scoutingState.position)
    : scoutingState.profile;
}

function getClubLevelFit(player, clubAnalysis) {
  const overall = stat(player, 'OverallStats');
  const [min, max] = clubAnalysis.recommendedRange;
  let distance = 0;
  if (overall < min) distance = min - overall;
  if (overall > max) distance = overall - max;
  if (!distance) return 100;
  if (distance <= 2) return 90 - distance * 4;
  if (distance <= 5) return 76 - (distance - 2) * 7;
  return Math.max(20, 50 - (distance - 5) * 5);
}

function sameRegionLeague(player, region) {
  if (player.teamRegion === region) return true;
  const league = String(player.leagueName || '').toLowerCase();
  if (region === 'south-america') return /argentina|brasil|brasile|colombia|chile|uruguay|paraguay|peru|ecuador|bolivia|venezuela|libertadores|sudamericana/.test(league);
  if (region === 'europe') return /premier|liga|serie a|ligue|bundesliga|eredivisie|championship|europe|champions/.test(league);
  return false;
}

function getRegionalFitScore(player, targetClub) {
  if (!targetClub) return 70;
  const playerRegion = regionForCountry(player.Country);
  const playerOverall = stat(player, 'OverallStats');
  let score = 62;

  if (targetClub.region === 'south-america') {
    if (playerRegion === 'south-america') score += 28;
    if (sameRegionLeague(player, 'south-america')) score += 14;
    if (playerRegion === 'europe' && playerOverall >= 82) score -= 16;
    if (player.isFreeAgent) score += 6;
  } else if (targetClub.region === 'europe') {
    if (playerRegion === 'europe') score += 18;
    if (playerRegion === 'south-america' && playerOverall >= 72) score += 14;
    if (sameRegionLeague(player, 'europe')) score += 10;
    if (player.isFreeAgent) score += 3;
  } else {
    if (playerRegion === targetClub.region) score += 14;
    if (player.isFreeAgent) score += 6;
  }

  if (String(player.Country || '') === String(targetClub.country || '')) score += 12;
  return Math.max(0, Math.min(100, score));
}

function getSquadNeedFit(player, squadNeeds, selectedPosition) {
  if (!squadNeeds || !squadNeeds.length) return selectedPosition === 'any' || player.pos === selectedPosition ? 72 : 45;
  const exact = squadNeeds.find(need => need.pos === player.pos);
  const selectedNeed = selectedPosition && selectedPosition !== 'any'
    ? squadNeeds.find(need => need.pos === selectedPosition)
    : null;

  if (selectedPosition && selectedPosition !== 'any') {
    if (player.pos !== selectedPosition) return 25;
    return selectedNeed ? Math.min(100, 78 + selectedNeed.score * 0.22) : 72;
  }
  if (exact) return Math.min(100, 70 + exact.score * 0.30);
  const groupMatch = squadNeeds.find(need => positionGroup(need.pos) === positionGroup(player.pos));
  return groupMatch ? 66 : 52;
}

function needPriority(need) {
  const score = need?.score || 0;
  if (score >= 70) return { label: 'Prioridad alta', className: 'high' };
  if (score >= 45) return { label: 'Prioridad media', className: 'medium' };
  return { label: 'Prioridad baja', className: 'low' };
}

function getCandidateTargetPosition(player, clubAnalysis) {
  if (scoutingState.position && scoutingState.position !== 'any') return scoutingState.position;
  const tacticalNeeds = (clubAnalysis.needs || [])
    .map(need => ({ pos: need.pos, need }))
    .map(item => ({
      ...item,
      projected: getProjectedPositionRating(player, item.pos),
      fit: projectedPositionFit(player, item.pos, clubAnalysis.avgOverall || 70),
    }))
    .filter(item => item.fit >= 66 || player.pos === item.pos)
    .sort((a, b) => (b.need.score + b.fit + b.projected * 0.2) - (a.need.score + a.fit + a.projected * 0.2));
  return tacticalNeeds[0]?.pos || player.pos || playerPosition(player);
}

function getTacticalFitScore(player, clubAnalysis, targetPosition, meta) {
  const needs = clubAnalysis.needs || [];
  const relatedNeed = needs.find(need => need.pos === targetPosition || (need.positions || []).includes(targetPosition));
  const projected = getProjectedPositionRating(player, targetPosition);
  const compatibility = projectedPositionFit(player, targetPosition, clubAnalysis.avgOverall || 70);
  const multiUseful = new Set(
    needs.flatMap(need => need.positions || [need.pos])
      .filter(pos => projectedPositionFit(player, pos, clubAnalysis.avgOverall || 70) >= 72)
  ).size;
  let score = compatibility * 0.55 + Math.max(0, Math.min(100, 60 + (projected - clubAnalysis.avgOverall) * 5)) * 0.20 + Math.min(100, meta) * 0.10;
  if (relatedNeed) score += Math.min(24, relatedNeed.score * 0.24);
  if (multiUseful >= 2) score += 8;
  if (scoutingState.position !== 'any' && player.pos !== targetPosition && projected >= stat(player, 'OverallStats') - 1) score += 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function positionFitScore(player, desiredPosition) {
  if (!desiredPosition || desiredPosition === 'any') return 82;
  if (player.pos === desiredPosition) return 100;
  if (positionGroup(player.pos) && positionGroup(player.pos) === positionGroup(desiredPosition)) return 58;
  return 25;
}

function ageProfileFit(player, profileId, undervaluedWanted, meta) {
  const age = stat(player, 'Age');
  const overall = stat(player, 'OverallStats');
  let score = 58;
  if (profileId === 'young' || scoutingState.onlyU23) {
    if (age && age <= 20) score += 34;
    else if (age && age <= 23) score += 25;
    else if (age && age <= 26) score += 8;
    else score -= 14;
  }
  if (profileId === 'undervalued' || undervaluedWanted) {
    score += Math.max(0, Math.min(35, (meta - overall) * 5));
    if (overall <= 78) score += 8;
  }
  return Math.max(0, Math.min(100, score));
}

function fitLabel(score) {
  const value = Math.round(score || 0);
  if (value >= 90) return 'Encaje perfecto';
  if (value >= 75) return 'Muy buen fichaje';
  if (value >= 60) return 'Buena opcion';
  if (value >= 40) return 'Dudoso';
  return 'Poco recomendable';
}

function transferDifficulty(item, club) {
  const player = item.player;
  const overall = stat(player, 'OverallStats');
  const diff = overall - (club.avgOverall || 70);
  const playerRegion = regionForCountry(player.Country);
  let score = 0;
  if (diff > 8) score += 38;
  else if (diff > 5) score += 24;
  else if (diff > 2) score += 12;
  if (club.region === 'south-america' && playerRegion === 'europe' && overall >= 80) score += 26;
  if (player.teamId && stat(player, 'OverallStats') >= (item.club?.maxOverall || club.maxOverall || 99) - 1) score += 12;
  if (item.regionalFit < 55) score += 14;
  if (player.isFreeAgent) score -= 18;

  if (score >= 55) return { label: 'Poco realista', className: 'unrealistic' };
  if (score >= 34) return { label: 'Dificil', className: 'hard' };
  if (score >= 16) return { label: 'Media', className: 'medium' };
  return { label: 'Facil', className: 'easy' };
}

function scoutingTags(item, club) {
  const player = item.player;
  const age = stat(player, 'Age');
  const overall = stat(player, 'OverallStats');
  const tags = [];
  const difficulty = item.difficulty || transferDifficulty(item, club);
  if (age && age <= 23) tags.push('Promesa');
  if (age && age >= 30 && item.fit >= 60) tags.push('Veterano util');
  if (item.levelFit >= 82 && overall >= (club.avgOverall || 70) - 1) tags.push('Titular inmediato');
  if (item.levelFit >= 70 && overall < (club.avgOverall || 70)) tags.push('Suplente confiable');
  if (item.regionalFit >= 82) tags.push('Realista');
  if (item.metaDiff >= 3 || item.profileId === 'undervalued') tags.push('Infravalorado');
  if (item.multiPositionCount >= 2) tags.push('Polifuncional');
  if (difficulty.className === 'hard') tags.push('Dificil de fichar');
  if (difficulty.className === 'unrealistic') tags.push('Poco realista');
  return [...new Set(tags)].slice(0, 5);
}

function recommendationReason(item, club, clubAnalysis) {
  const bits = [];
  const overall = stat(item.player, 'OverallStats');
  const [min, max] = club.recommendedRange;
  const need = clubAnalysis.needs.find(row => row.pos === item.targetPosition || (row.positions || []).includes(item.targetPosition));

  if (need) bits.push(`el club necesita ${need.label} por ${need.reasons[0] || 'necesidad del plantel'}`);
  if (item.targetPosition && item.targetPosition !== item.player.pos) bits.push(`puede rendir como ${RANK_POSITION_LABELS[item.targetPosition] || item.targetPosition}: media proyectada ${item.projectedRating}`);
  if (overall >= min && overall <= max) bits.push('media acorde al nivel del club');
  if (item.regionalFit >= 82) bits.push(club.region === 'south-america' ? 'perfil regional realista' : 'encaje regional logico');
  if (item.metaDiff >= 4 || item.profileId === 'undervalued') bits.push('puede rendir mas de lo que indica su media');
  if (item.meta >= 80) bits.push(`buen puntaje como ${item.profileLabel.toLowerCase()}`);
  return `Encaja porque ${bits.slice(0, 4).join(', ') || 'combina nivel, tactica, perfil y estadisticas utiles para PES 2018'}.`;
}

function calculateScoutingFitScore(player, club, prototypeId, clubAnalysis = analyzeClubSquad(club, scoutingState.formation)) {
  const targetPosition = getCandidateTargetPosition(player, clubAnalysis);
  const profileId = prototypeId === 'auto' ? bestProfileForPlayer({ ...player, pos: targetPosition }, targetPosition) : prototypeId;
  const meta = getPlayerPrototypeScore(player, profileId);
  const levelFit = getClubLevelFit(player, club);
  const regionalFit = scoutingState.regional ? getRegionalFitScore(player, club) : 75;
  const squadNeedFit = getSquadNeedFit({ ...player, pos: targetPosition }, clubAnalysis.needs, scoutingState.position);
  const tacticalFit = getTacticalFitScore(player, clubAnalysis, targetPosition, meta);
  const positionFit = positionFitScore(player, scoutingState.position);
  const ageFit = ageProfileFit(player, profileId, scoutingState.undervalued, meta);
  const fit = squadNeedFit * 0.30 + levelFit * 0.20 + ageFit * 0.15 + regionalFit * 0.15 + tacticalFit * 0.10 + meta * 0.10;
  const overall = stat(player, 'OverallStats');
  const projectedRating = getProjectedPositionRating(player, targetPosition);
  const usefulPositions = new Set((clubAnalysis.needs || [])
    .flatMap(need => need.positions || [need.pos])
    .filter(pos => projectedPositionFit(player, pos, clubAnalysis.avgOverall || club.avgOverall || 70) >= 72));
  const profileLabel = scoutingState.profile === 'auto'
    ? (META_PROFILES[profileId]?.tag || 'Scouting')
    : (getPrototypeOptionsForPosition(scoutingState.position).find(item => item.id === scoutingState.profile)?.label || META_PROFILES[profileId]?.tag || 'Scouting');

  return {
    player,
    club,
    profileId,
    profileLabel,
    meta,
    fit,
    levelFit,
    regionalFit,
    squadNeedFit,
    tacticalFit,
    positionFit,
    ageFit,
    targetPosition,
    projectedRating,
    multiPositionCount: usefulPositions.size,
    metaDiff: meta - overall,
    reason: '',
  };
}

function passesFilters(item, club) {
  const player = item.player;
  const overall = stat(player, 'OverallStats');
  const age = stat(player, 'Age');
  if (scoutingState.excludeOwn && player.teamId && player.teamId === club.id) return false;
  if (!scoutingState.showSpecialPlayers && isSpecialPlayer(player)) return false;
  if (scoutingState.position !== 'any' && item.targetPosition !== scoutingState.position) return false;
  if (scoutingState.position !== 'any' && item.tacticalFit < 58) return false;
  if (scoutingState.minAge && age && age < parseInt(scoutingState.minAge, 10)) return false;
  if (scoutingState.maxAge && age && age > parseInt(scoutingState.maxAge, 10)) return false;
  if (scoutingState.minOverall && overall < parseInt(scoutingState.minOverall, 10)) return false;
  if (scoutingState.maxOverall && overall > parseInt(scoutingState.maxOverall, 10)) return false;
  if (scoutingState.onlySouthAmerican && !CONMEBOL_COUNTRIES.has(String(player.Country || ''))) return false;
  if (scoutingState.onlyU23 && (!age || age > 23)) return false;
  if (scoutingState.minMeta && item.meta < parseInt(scoutingState.minMeta, 10)) return false;
  if ((item.profileId === 'young' || scoutingState.profile === 'young') && age && age > 25) return false;
  if ((item.profileId === 'undervalued' || scoutingState.undervalued) && item.metaDiff < 1.5) return false;
  return true;
}

function sortedRecommendations(items) {
  const sort = scoutingState.sort;
  return items.slice().sort((a, b) => {
    if (scoutingState.surpriseId) {
      if (String(a.player.Id) === String(scoutingState.surpriseId)) return -1;
      if (String(b.player.Id) === String(scoutingState.surpriseId)) return 1;
    }
    if (sort === 'meta') return b.meta - a.meta || b.fit - a.fit;
    if (sort === 'young') return (stat(a.player, 'Age') || 99) - (stat(b.player, 'Age') || 99) || b.fit - a.fit;
    if (sort === 'regional') return b.regionalFit - a.regionalFit || b.fit - a.fit;
    if (sort === 'undervalued') return b.metaDiff - a.metaDiff || b.fit - a.fit;
    if (sort === 'overall') return stat(b.player, 'OverallStats') - stat(a.player, 'OverallStats') || b.fit - a.fit;
    return b.fit - a.fit || b.squadNeedFit - a.squadNeedFit || b.meta - a.meta;
  });
}

function getScoutingRecommendations() {
  const club = scoutingDataset.teams.find(team => team.id === scoutingState.teamId);
  if (!club) return { club: null, items: [] };
  const clubAnalysis = analyzeClubSquad(club, scoutingState.formation);
  const candidates = scoutingDataset.players
    .map(player => calculateScoutingFitScore(player, club, scoutingState.profile, clubAnalysis))
    .filter(item => passesFilters(item, club))
    .map(item => {
      const difficulty = transferDifficulty(item, club);
      const tags = scoutingTags({ ...item, difficulty }, club);
      return { ...item, difficulty, tags, reason: recommendationReason(item, club, clubAnalysis) };
    });

  return { club: { ...club, analysis: clubAnalysis }, items: sortedRecommendations(candidates) };
}

function renderStatChips(item) {
  const profile = META_PROFILES[item.profileId] || META_PROFILES.any;
  return profile.keyStats.slice(0, 5).map(aliasKey => `
    <span class="meta-stat-chip">
      <small>${rankEscape(statLabel(aliasKey))}</small>
      <strong>${statValue(item.player, aliasKey)}</strong>
    </span>`).join('');
}

function renderTagChips(tags) {
  return (tags || []).slice(0, 3).map(tag => {
    const key = String(tag || '').toLowerCase();
    const tone = /titular/.test(key) ? 'green' : /infravalorado|polifuncional/.test(key) ? 'purple' : 'gray';
    const label = {
      'titular inmediato': 'Titular',
      'suplente confiable': 'Suplente',
      'veterano util': 'Veterano',
      'dificil de fichar': 'Dificil',
    }[key] || tag;
    return `<span class="scouting-tag scouting-tag-${tone}">${rankEscape(label)}</span>`;
  }).join('');
}

function isSavedScout(playerId, teamId = '') {
  const player = scoutingDataset?.players.find(item => String(item.Id) === String(playerId));
  const resolvedTeamId = teamId || player?.teamId || '';
  const key = scoutSaveKey(playerId, resolvedTeamId);
  return getSavedScouts().some(row => scoutSaveKey(row.playerId, row.teamId) === key);
}

function renderLeagueOptions() {
  return getLeaguesForScouting().map(league => `
    <option value="${rankEscape(league.id)}"${league.id === scoutingState.leagueId ? ' selected' : ''}>
      ${rankEscape(league.name)}
    </option>`).join('');
}

function renderTeamOptions() {
  return getTeamsByLeague(scoutingState.leagueId).map(team => `
    <option value="${rankEscape(team.id)}"${team.id === scoutingState.teamId ? ' selected' : ''}>
      ${rankEscape(team.name)}
    </option>`).join('');
}

function renderProfileOptions() {
  return getPrototypeOptionsForPosition(scoutingState.position).map(profile => `
    <option value="${rankEscape(profile.id)}"${profile.id === scoutingState.profile ? ' selected' : ''}>
      ${rankEscape(profile.label)}
    </option>`).join('');
}

function selectedClubForScouting() {
  return scoutingDataset?.teams.find(team => team.id === scoutingState.teamId) || null;
}

function quickPresetDescription(id) {
  return {
    starter: 'Media cercana o superior al plantel.',
    rotation: 'Recambio confiable y realista.',
    prospect: 'Sub-23 con margen para crecer.',
    veteran: 'Experiencia para rendir ya.',
    realistic: 'Prioriza mercado y region.',
    undervalued: 'Stats mejores que su media.',
    utility: 'Puede cubrir varios puestos.',
  }[id] || '';
}

function compactText(text, max = 92) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function compactPlayerName(name, max = 18) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const parts = clean.split(' ');
  const last = parts.pop();
  const first = parts.shift();
  return first && last ? `${first.charAt(0)}. ${last}` : compactText(clean, max);
}

function shortScoutingReason(item, club) {
  const player = item.player;
  const pos = RANK_POSITION_LABELS[item.targetPosition || player.pos] || item.targetPosition || player.pos || 'puesto';
  const age = stat(player, 'Age');
  const difficulty = item.difficulty || transferDifficulty(item, club || item.club);
  const parts = [item.targetPosition && item.targetPosition !== player.pos ? `Cubre ${pos}` : `Buen encaje ${pos}`];

  if ((item.tags || []).some(tag => /titular/i.test(tag))) parts.push('Titular posible');
  else if (age && age <= 23) parts.push('Proyecto joven');
  else if (item.metaDiff >= 3) parts.push('Rinde sobre su media');
  else if (item.regionalFit >= 82) parts.push('Mercado realista');
  else if (difficulty.className === 'easy') parts.push('Fichaje viable');
  else parts.push('Recambio util');

  return parts.slice(0, 2).join(' · ');
}

function renderQuickPresetChips() {
  return QUICK_SCOUTING_PRESETS.map(([id, label]) => `
    <button type="button" class="scouting-preset-chip${scoutingState.quickRole === id ? ' is-active' : ''}" onclick="applyQuickScoutingPreset('${id}')">
      <strong>${rankEscape(label)}</strong>
      <span>${rankEscape(quickPresetDescription(id))}</span>
    </button>`).join('');
}

function renderScoutingDropdown({ id, label, stateKey, value, options, placeholder, disabled = false }) {
  const normalizedValue = String(value ?? '');
  const current = options.find(option => String(option.value) === normalizedValue);
  const display = current?.label || placeholder;
  const isOpen = scoutingDropdownOpen === id && !disabled;
  const allOptions = placeholder ? [{ value: '', label: placeholder }, ...options] : options;

  return `
    <div class="scouting-control scouting-custom-select${isOpen ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}">
      <label id="${id}-label">${rankEscape(label)}</label>
      <button id="${id}" type="button" class="scouting-select-button" aria-haspopup="listbox" aria-expanded="${isOpen ? 'true' : 'false'}" aria-labelledby="${id}-label ${id}" ${disabled ? 'disabled' : ''} onclick="toggleScoutingDropdown('${id}')">
        <span>${rankEscape(display)}</span>
        <i aria-hidden="true"></i>
      </button>
      ${isOpen ? `
        <div class="scouting-select-menu" role="listbox" aria-labelledby="${id}-label">
          ${allOptions.map(option => {
            const optionValue = String(option.value ?? '');
            const selected = optionValue === normalizedValue;
            return `<button type="button" role="option" aria-selected="${selected ? 'true' : 'false'}" class="${selected ? 'is-selected' : ''}" onclick='selectScoutingDropdown("${stateKey}", ${scoutInlineValue(optionValue)})'>${rankEscape(option.label)}</button>`;
          }).join('')}
        </div>` : ''}
    </div>`;
}

function renderScoutingSidebar(club) {
  const selectedLeague = getLeaguesForScouting().find(league => league.id === scoutingState.leagueId);
  const leagueOptions = getLeaguesForScouting().map(league => ({ value: league.id, label: league.name }));
  const teamOptions = getTeamsByLeague(scoutingState.leagueId).map(team => ({ value: team.id, label: team.name }));
  return `
    <aside class="scouting-sidebar">
      <section class="scouting-step scouting-club-picker">
        <div class="scouting-step-head">
          <span>1</span>
          <h2>Tu club</h2>
        </div>
        ${renderScoutingDropdown({
          id: 'scout-league',
          label: 'Liga',
          stateKey: 'leagueId',
          value: scoutingState.leagueId,
          options: leagueOptions,
          placeholder: 'Elegir liga',
        })}
        ${renderScoutingDropdown({
          id: 'scout-team',
          label: 'Equipo',
          stateKey: 'teamId',
          value: scoutingState.teamId,
          options: teamOptions,
          placeholder: scoutingState.leagueId ? 'Elegir equipo' : 'Elegir liga',
          disabled: !scoutingState.leagueId,
        })}
        ${club ? renderClubAnalysis(club) : `
          <div class="scouting-club-placeholder">
            <strong>Sin club seleccionado</strong>
            <span>${selectedLeague ? `Liga: ${rankEscape(selectedLeague.name)}` : 'Selecciona liga y equipo.'}</span>
          </div>`}
      </section>
      <section class="scouting-step scouting-purpose">
        <div class="scouting-step-head">
          <span>2</span>
          <h2>Buscas</h2>
        </div>
        <div class="scouting-preset-grid">${renderQuickPresetChips()}</div>
        <button type="button" class="scouting-reset-button" onclick="resetScoutingSearch()">Limpiar</button>
      </section>
    </aside>`;
}

function renderScoutingFilters() {
  const club = selectedClubForScouting();
  const positionOptions = [{ value: 'any', label: 'Cualquiera' }, ...RANK_POSITIONS.map(pos => ({ value: pos, label: RANK_POSITION_LABELS[pos] || pos }))];
  const profileOptions = getPrototypeOptionsForPosition(scoutingState.position).map(profile => ({ value: profile.id, label: profile.label }));
  const formationOptions = FORMATION_OPTIONS.map(([id, label]) => ({ value: id, label }));
  const sortOptions = SORT_OPTIONS.map(([id, label]) => ({ value: id, label }));
  return `
      <section class="scouting-step scouting-filter-card">
        <div class="scouting-step-head">
          <span>3</span>
          <h2>Filtros</h2>
        </div>
        <div class="scouting-tool-panel scouting-tool-panel-simple">
          ${renderScoutingDropdown({
            id: 'scout-position',
            label: 'Pos.',
            stateKey: 'position',
            value: scoutingState.position,
            options: positionOptions,
          })}
          ${renderScoutingDropdown({
            id: 'scout-profile',
            label: 'Tipo',
            stateKey: 'profile',
            value: scoutingState.profile,
            options: profileOptions,
          })}
          ${renderScoutingDropdown({
            id: 'scout-formation',
            label: 'Form.',
            stateKey: 'formation',
            value: scoutingState.formation,
            options: formationOptions,
            placeholder: 'Sin asignar',
          })}
          <div class="scouting-control">
            <label for="scout-max-age">Edad max.</label>
            <input id="scout-max-age" type="number" min="15" max="45" placeholder="Sin limite" value="${rankEscape(scoutingState.maxAge)}" oninput="updateScoutingState('maxAge', this.value)">
          </div>
          <div class="scouting-control">
            <label for="scout-min-overall">Media min.</label>
            <input id="scout-min-overall" type="number" min="40" max="99" placeholder="Sin limite" value="${rankEscape(scoutingState.minOverall)}" oninput="updateScoutingState('minOverall', this.value)">
          </div>
          ${renderScoutingDropdown({
            id: 'scout-sort',
            label: 'Orden',
            stateKey: 'sort',
            value: scoutingState.sort,
            options: sortOptions,
          })}
          <div class="scouting-toolbar">
            <button type="button" class="advanced-filter-toggle" onclick="toggleScoutingAdvanced()">${scoutingState.advancedOpen ? 'Ocultar' : 'Ajustes'}</button>
          </div>
          ${scoutingState.advancedOpen ? `
            <div class="scouting-advanced-panel">
              <div class="scouting-control">
                <label for="scout-min-age">Edad min.</label>
                <input id="scout-min-age" type="number" min="15" max="45" placeholder="Sin limite" value="${rankEscape(scoutingState.minAge)}" oninput="updateScoutingState('minAge', this.value)">
              </div>
              <div class="scouting-control">
                <label for="scout-max-overall">Media max.</label>
                <input id="scout-max-overall" type="number" min="40" max="99" placeholder="Sin limite" value="${rankEscape(scoutingState.maxOverall)}" oninput="updateScoutingState('maxOverall', this.value)">
              </div>
              <div class="scouting-control">
                <label for="scout-min-meta">Meta min.</label>
                <input id="scout-min-meta" type="number" min="40" max="99" placeholder="Sin limite" value="${rankEscape(scoutingState.minMeta)}" oninput="updateScoutingState('minMeta', this.value)">
              </div>
              <div class="scouting-toggles">
                <label><input type="checkbox" ${scoutingState.regional ? 'checked' : ''} onchange="updateScoutingState('regional', this.checked)"> Realistas</label>
                <label><input type="checkbox" ${scoutingState.undervalued ? 'checked' : ''} onchange="updateScoutingState('undervalued', this.checked)"> Infraval.</label>
                <label><input type="checkbox" ${scoutingState.excludeOwn ? 'checked' : ''} onchange="updateScoutingState('excludeOwn', this.checked)"> Excluir club</label>
                <label><input type="checkbox" ${scoutingState.showSpecialPlayers ? 'checked' : ''} onchange="updateScoutingState('showSpecialPlayers', this.checked)"> Especiales</label>
                <label><input type="checkbox" ${scoutingState.onlySouthAmerican ? 'checked' : ''} onchange="updateScoutingState('onlySouthAmerican', this.checked)"> Sudam.</label>
                <label><input type="checkbox" ${scoutingState.onlyU23 ? 'checked' : ''} onchange="updateScoutingState('onlyU23', this.checked)"> Sub-23</label>
              </div>
            </div>` : ''}
        </div>
      </section>`;
}

function listText(items, fallback) {
  return items.length ? items.map(item => rankEscape(item)).join(', ') : fallback;
}

function needShortLabel(need) {
  return compactText(need?.label || RANK_POSITION_LABELS[need?.pos] || need?.pos || 'Puesto', 18);
}

function needPriorityShort(priority) {
  if (priority.className === 'high') return 'Alta';
  if (priority.className === 'medium') return 'Media';
  return 'Baja';
}

function renderClubAnalysis(club) {
  if (!club) {
    return `
      <section class="scouting-empty-state">
        <h2>Elegir liga y equipo para empezar</h2>
        <p>Primero elegi una liga y despues un equipo para recibir recomendaciones.</p>
      </section>`;
  }
  const analysis = club.analysis;
  const strengths = analysis.strengths.map(row => row.label);
  const needs = analysis.needs.slice(0, 4);
  const teamUrl = typeof laqpTeamUrl === 'function' ? laqpTeamUrl(club.id, club.name) : `team.html?id=${encodeURIComponent(club.id)}`;
  const leagueUrl = club.leagueId
    ? (typeof laqpLeagueUrl === 'function' ? laqpLeagueUrl(club.leagueId, club.leagueName) : `league.html?id=${encodeURIComponent(club.leagueId)}`)
    : '';
  const wideNeed = needs.find(need => (need.positions || []).some(pos => ['LWF', 'RWF', 'LMF', 'RMF'].includes(pos)));
  const recommendedType = club.region === 'south-america'
    ? `jugadores sudamericanos de media ${club.recommendedRange[0]}-${club.recommendedRange[1]}`
    : `jugadores de media ${club.recommendedRange[0]}-${club.recommendedRange[1]} acordes al mercado`;

  return `
    <section class="club-analysis-panel">
      <div class="club-analysis-main">
        <img src="img/teams/${rankEscape(club.id)}.webp" onerror="this.onerror=null;this.src='img/teams/default.webp'" alt="">
        <span>Analisis de</span>
        <strong>${rankEscape(club.name)}</strong>
        <small>${rankEscape(club.leagueName || 'Liga no asignada')}</small>
      </div>
      <div><span>Media plantel</span><strong>${club.avgOverall}</strong><small>Top 11: ${club.startersAvg}</small></div>
      <div><span>Edad promedio</span><strong>${club.avgAge || '-'}</strong><small>${club.squad.length} jugadores</small></div>
      <div><span>Nivel estimado</span><strong>${rankEscape(club.level.label)}</strong><small>${rankEscape(analysis.formation)}</small></div>
      <div class="club-analysis-copy">
        <span>Lectura del plantel</span>
        <p>Fortalezas: ${listText(strengths, 'sin una linea dominante')}. En ${rankEscape(analysis.formation)}, ${wideNeed ? 'faltan variantes por banda' : 'prioriza las necesidades marcadas'}.</p>
      </div>
      <div class="club-analysis-copy">
        <span>Tipo de fichajes recomendados</span>
        <p>${rankEscape(recommendedType)} con buen encaje tactico.</p>
      </div>
      <div class="club-analysis-links">
        <span>Enlaces internos</span>
        <p>
          <a href="${teamUrl}">Ver equipo</a>
          ${leagueUrl ? `<a href="${leagueUrl}">Ver liga</a>` : ''}
        </p>
      </div>
      <div class="scouting-need-list">
        <span>Necesidades detectadas</span>
        <p>
          ${needs.length ? needs.map(need => {
            const priority = needPriority(need);
            return `<button type="button" class="scouting-need-pill ${priority.className}" onclick="updateScoutingState('position', '${need.pos}')">
              <strong>${rankEscape(needShortLabel(need))}</strong>
              <small>${rankEscape(needPriorityShort(priority))}</small>
            </button>`;
          }).join('') : '<em>No hay necesidades fuertes; podes buscar variantes por perfil.</em>'}
        </p>
      </div>
    </section>`;
}

function renderPlayerCard(item, index) {
  const player = item.player;
  const pos = player.pos || playerPosition(player);
  const overall = stat(player, 'OverallStats');
  const age = stat(player, 'Age') || '-';
  const currentTeamId = player.teamId || '';
  const projectedText = item.targetPosition && item.targetPosition !== pos
    ? `Proy. ${item.projectedRating} como ${RANK_POSITION_LABELS[item.targetPosition] || item.targetPosition}`
    : `Proy. ${item.projectedRating}`;
  const link = playerLinkForScouting(player);
  const fitRounded = Math.round(item.fit);
  const difficulty = item.difficulty || transferDifficulty(item, item.club);
  const saved = isSavedScout(player.Id, player.teamId || '');
  const metaRounded = Math.round(item.meta);
  const targetLabel = RANK_POSITION_LABELS[item.targetPosition || pos] || item.targetPosition || pos;
  const difficultyWidth = difficulty.className === 'easy' ? 32 : difficulty.className === 'medium' ? 58 : difficulty.className === 'hard' ? 78 : 92;

  return `
    <article class="scouting-recommendation-card${index === 0 && !scoutingState.offset ? ' is-featured' : ''}">
      <div class="scouting-card-topline">
        <a class="scouting-player-photo" href="${link}">
          <img src="img/players/${rankEscape(player.Id)}.webp" onerror="this.onerror=null;this.src='img/players/default.webp'" alt="${rankEscape(player.Name)}" loading="lazy">
        </a>
        <div class="scouting-player-main">
          <a href="${link}" class="scouting-player-name scouting-marquee"><span class="scouting-marquee-text">${rankEscape(player.Name || 'Jugador')}</span></a>
          <div class="scouting-player-club">
            <img src="${currentTeamId ? `img/teams/${rankEscape(currentTeamId)}.webp` : 'img/teams/default.webp'}" onerror="this.onerror=null;this.src='img/teams/default.webp'" alt="">
            <span class="scouting-marquee"><span class="scouting-marquee-text">${rankEscape(player.teamName || 'Sin club')}</span></span>
          </div>
          <div class="scouting-position-row">
            <span>${rankEscape(targetLabel)}</span>
            <span>${rankEscape(RANK_POSITION_LABELS[pos] || pos)}</span>
          </div>
        </div>
        <div class="scouting-fit-ring" style="--fit:${fitRounded}">
          <strong>${fitRounded}%</strong>
          <span>Encaje</span>
        </div>
      </div>
      <div class="scouting-number-row">
        <span><small>Media</small><strong>${overall || '-'}</strong></span>
        <span><small>Edad</small><strong>${age}</strong></span>
      </div>
      <div class="scouting-tag-row">${renderTagChips(item.tags)}</div>
      <p class="scouting-reason">${rankEscape(shortScoutingReason(item, item.club))}</p>
      <div class="scouting-difficulty">
        <span>Dificultad</span>
        <i><b style="width:${difficultyWidth}%"></b></i>
        <em class="${rankEscape(difficulty.className)}">${rankEscape(difficulty.label)}</em>
      </div>
      <div class="scouting-projection">${rankEscape(projectedText)}</div>
      <div class="meta-card-actions scouting-card-actions">
        <a href="${link}">Ver jugador</a>
        <button type="button" onclick="toggleSavedScout('${rankEscape(player.Id)}')">${saved ? 'Guardado' : 'Guardar'}</button>
      </div>
    </article>`;
}

function renderResultsToolbar(items, club, hasMore) {
  const pageSize = scoutingPageSize();
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(totalPages, Math.floor(scoutingState.offset / pageSize) + 1);
  const hasPrevious = scoutingState.offset > 0;
  return `
    <section class="scouting-results-head">
      <div>
        <span>${items.length} encontrados</span>
        <h2>Recomendados</h2>
        <p>${rankEscape(club.name)} - ${rankEscape(scoutingState.formation || 'Sin formacion asignada')}</p>
      </div>
      <div class="scouting-results-actions">
        <div class="scouting-view-toggle" role="group" aria-label="Vista de resultados">
          <button type="button" class="${scoutingState.view === 'cards' ? 'is-active' : ''}" onclick="setScoutingView('cards')">Tarjetas</button>
          <button type="button" class="${scoutingState.view === 'table' ? 'is-active' : ''}" onclick="setScoutingView('table')">Tabla</button>
        </div>
        <div class="scouting-page-controls" aria-label="Paginacion de scouting">
          <button type="button" onclick="moveScoutingPage(-1)" ${hasPrevious ? '' : 'disabled'} aria-label="Ver 4 anteriores">‹</button>
          <span>${currentPage}/${totalPages}</span>
          <button type="button" onclick="moveScoutingPage(1)" ${hasMore ? '' : 'disabled'} aria-label="Ver 4 siguientes">›</button>
        </div>
      </div>
    </section>`;
}

function renderScoutingTable(items) {
  const visible = items.slice(scoutingState.offset, scoutingState.offset + 24);
  if (!visible.length) return '<div class="error-message">No encontramos jugadores con esos filtros. Proba bajar la media minima o ampliar la edad maxima.</div>';
  return `
    <div class="scouting-table-wrap">
      <table class="scouting-table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Pos.</th>
            <th>Media</th>
            <th>Edad</th>
            <th>Club</th>
            <th>Pais</th>
            <th>Encaje</th>
            <th>Realismo</th>
            <th>Etiquetas</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map(item => {
            const player = item.player;
            return `<tr>
              <td>${rankEscape(player.Name)}</td>
              <td>${rankEscape(RANK_POSITION_LABELS[item.targetPosition || player.pos] || item.targetPosition || player.pos)}</td>
              <td>${stat(player, 'OverallStats')}</td>
              <td>${stat(player, 'Age') || '-'}</td>
              <td>${rankEscape(player.teamName || 'Sin club')}</td>
              <td>${rankEscape(countryName(player.Country))}</td>
              <td><strong>${Math.round(item.fit)}%</strong></td>
              <td>${rankEscape((item.difficulty || transferDifficulty(item, item.club)).label)}</td>
              <td>${rankEscape((item.tags || []).join(', '))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderScoutingCards(items) {
  const visible = items.slice(scoutingState.offset, scoutingState.offset + SCOUTING_CARD_PAGE_SIZE);
  return visible.length
    ? visible.map((item, index) => renderPlayerCard(item, index)).join('')
    : '<div class="error-message">Los filtros estan muy exigentes. Afloja un poquito, Guardiola.</div>';
}

function findCurrentClubComparison(item, club) {
  const target = item.targetPosition || item.player.pos;
  return (club.squad || [])
    .filter(player => player.Id !== item.player.Id)
    .map(player => ({
      player,
      projected: getProjectedPositionRating(player, target),
      fit: projectedPositionFit(player, target, club.avgOverall || 70),
    }))
    .filter(row => row.fit >= 58 || row.player.pos === target || positionGroup(row.player.pos) === positionGroup(target))
    .sort((a, b) => b.projected - a.projected || b.fit - a.fit)[0]?.player || null;
}

function getScoutingItemByPlayerId(playerId, items, club) {
  if (!playerId || !club) return null;
  const existing = items.find(row => String(row.player.Id) === String(playerId));
  if (existing) return existing;
  const player = scoutingDataset?.players.find(row => String(row.Id) === String(playerId));
  if (!player) return null;
  const clubAnalysis = club.analysis || analyzeClubSquad(club, scoutingState.formation);
  const item = calculateScoutingFitScore(player, club, scoutingState.profile, clubAnalysis);
  const difficulty = transferDifficulty(item, club);
  const tags = scoutingTags({ ...item, difficulty }, club);
  return { ...item, difficulty, tags, reason: recommendationReason(item, club, clubAnalysis) };
}

function compareCandidateItems(items, club) {
  const seen = new Set();
  const add = item => {
    if (!item || seen.has(String(item.player.Id))) return null;
    seen.add(String(item.player.Id));
    return item;
  };
  return [
    ...items.slice(0, 24).map(add).filter(Boolean),
    ...getSavedScouts().map(row => add(getScoutingItemByPlayerId(row.playerId, items, club))).filter(Boolean),
  ];
}

function renderCompareOptions(items, club, selectedId) {
  return compareCandidateItems(items, club).map(item => {
    const player = item.player;
    const label = `${player.Name || 'Jugador'} - ${RANK_POSITION_LABELS[item.targetPosition || player.pos] || item.targetPosition || player.pos || '-'}`;
    return `<option value="${rankEscape(player.Id)}"${String(player.Id) === String(selectedId) ? ' selected' : ''}>${rankEscape(label)}</option>`;
  }).join('');
}

function renderComparisonPanel(club, items) {
  if (!club || !items.length) return '';
  const selectedId = scoutingState.comparePlayerId || items[0]?.player.Id || '';
  const item = getScoutingItemByPlayerId(selectedId, items, club) || items[0];
  if (!item) return '';
  const current = findCurrentClubComparison(item, club);
  if (!current) return '';
  const candidateRadar = computeRadarAttributes(item.player);
  const currentRadar = computeRadarAttributes(current);
  const rows = [
    ['Media', stat(item.player, 'OverallStats'), stat(current, 'OverallStats')],
    ['Edad', stat(item.player, 'Age') || '-', stat(current, 'Age') || '-'],
    ['Ritmo', candidateRadar.RIT, currentRadar.RIT],
    ['Fisico', candidateRadar.FIS, currentRadar.FIS],
    ['Pase', candidateRadar.PAS, currentRadar.PAS],
    ['Defensa', candidateRadar.DEF, currentRadar.DEF],
    ['Ataque', candidateRadar.ATQ, currentRadar.ATQ],
  ];
  const overallDiff = stat(item.player, 'OverallStats') - stat(current, 'OverallStats');
  const verdict = item.difficulty?.className === 'unrealistic'
    ? 'Es menos realista para este club.'
    : overallDiff >= 2
      ? 'Seria una mejora clara como titular.'
      : stat(item.player, 'Age') + 3 < stat(current, 'Age')
        ? 'Es una apuesta a futuro.'
        : 'No mejora al titular, pero sirve como recambio.';

  return `
    <section class="scouting-compare-panel">
      <div class="scouting-compare-head">
        <div>
          <span>Comparacion rapida - ${rankEscape(RANK_POSITION_LABELS[item.targetPosition || item.player.pos] || item.targetPosition || item.player.pos)}</span>
          <h2 class="scouting-marquee"><span class="scouting-marquee-text">${rankEscape(item.player.Name)} vs ${rankEscape(current.Name)}</span></h2>
        </div>
        <label class="scouting-compare-picker">
          <span>Comparar</span>
          <select onchange="compareScoutingPlayer(this.value)">
            ${renderCompareOptions(items, club, item.player.Id)}
          </select>
        </label>
      </div>
      <div class="scouting-compare-grid">
        ${rows.map(([label, candidateValue, currentValue]) => `
          <div>
            <span>${rankEscape(label)}</span>
            <strong>${rankEscape(candidateValue)}</strong>
            <small>Actual: ${rankEscape(currentValue)}</small>
          </div>`).join('')}
      </div>
      <p>${rankEscape(verdict)}</p>
    </section>`;
}

function renderScoutedListPanel(items, club) {
  const saved = getSavedScouts()
    .map(entry => {
      const item = getScoutingItemByPlayerId(entry.playerId, items, club);
      const player = item?.player;
      const playerId = player?.Id || entry.playerId;
      const teamId = player?.teamId || entry.teamId || '';
      return {
        playerId,
        teamId,
        name: player?.Name || entry.name || 'Jugador',
        pos: item ? (RANK_POSITION_LABELS[item.targetPosition || player.pos] || item.targetPosition || player.pos || '-') : (entry.pos || '-'),
        teamName: player?.teamName || entry.teamName || 'Sin club',
        score: item ? Math.round(item.fit || 0) : (entry.fit || entry.overall || '-'),
      };
    })
    .slice(0, 5);

  return `
    <section class="scouting-list-panel">
      <div class="scouting-list-head">
        <div>
          <span>Guardados</span>
          <h2>Scouteados</h2>
        </div>
        <small>${getSavedScouts().length}</small>
      </div>
      ${saved.length ? `
        <div class="scouting-saved-list">
          ${saved.map(player => `
            <div class="scouting-saved-row">
              <button type="button" class="scouting-saved-player" onclick="compareScoutingPlayer('${rankEscape(player.playerId)}')">
                <img src="img/players/${rankEscape(player.playerId)}.webp" onerror="this.onerror=null;this.src='img/players/default.webp'" alt="">
                <span class="scouting-saved-info">
                  <strong>${rankEscape(player.name)}</strong>
                  <small>
                    <em>${rankEscape(player.pos)}</em>
                    <span>${rankEscape(player.teamName)}</span>
                  </small>
                </span>
                <b>${rankEscape(player.score)}</b>
              </button>
            </div>`).join('')}
        </div>` : `
        <p class="scouting-empty-copy">Guarda jugadores desde las tarjetas para armar tu lista.</p>`}
    </section>`;
}

function applyScoutingMarquees() {
  requestAnimationFrame(() => {
    document.querySelectorAll('#rankings-page .scouting-marquee').forEach(box => {
      const text = box.querySelector('.scouting-marquee-text');
      if (!text) return;
      const original = box.dataset.scoutingText || text.textContent.trim();
      box.dataset.scoutingText = original;
      box.classList.remove('scrolling');
      text.textContent = original;
      if (text.scrollWidth > box.clientWidth) {
        text.textContent = `${original}    ${original}`;
        box.classList.add('scrolling');
      }
    });
  });
}

function renderResultsView(items) {
  return scoutingState.view === 'table'
    ? renderScoutingTable(items)
    : `<div class="scouting-cards-grid">${renderScoutingCards(items)}</div>`;
}

function renderResults() {
  const { club, items } = getScoutingRecommendations();
  const content = document.getElementById('rankings-content');
  if (!content) return;
  const pageSize = scoutingPageSize();
  const hasMore = scoutingState.offset + pageSize < items.length;

  content.innerHTML = `
    <section class="scouting-shell">
      ${renderScoutingSidebar(club)}
      <div class="scouting-main-area">
        ${renderScoutingFilters()}
        ${club ? `
          ${renderResultsToolbar(items, club, hasMore)}
          <div class="scouting-results-zone">
            ${renderResultsView(items)}
            <div class="scouting-bottom-grid">
              ${renderComparisonPanel(club, items)}
              ${renderScoutedListPanel(items, club)}
            </div>
          </div>` : `
          <section class="scouting-empty-state">
            <h2>Elegir liga y equipo para empezar</h2>
            <p>Primero elegi una liga y despues un equipo para recibir recomendaciones.</p>
          </section>`}
      </div>
    </section>`;
  applyScoutingMarquees();
}

function resetScoutingSearch() {
  scoutingDropdownOpen = '';
  scoutingState = {
    ...scoutingState,
    formation: '',
    position: 'any',
    profile: 'auto',
    minAge: '',
    maxAge: '',
    minOverall: '',
    maxOverall: '',
    minMeta: '',
    regional: true,
    undervalued: false,
    excludeOwn: true,
    showSpecialPlayers: false,
    onlySouthAmerican: false,
    onlyU23: false,
    sort: 'fit',
    quickRole: '',
    comparePlayerId: '',
    surpriseId: '',
    offset: 0,
  };
  renderResults();
}

function toggleScoutingDropdown(id) {
  scoutingDropdownOpen = scoutingDropdownOpen === id ? '' : id;
  renderResults();
}

function selectScoutingDropdown(key, value) {
  scoutingDropdownOpen = '';
  updateScoutingState(key, value);
}

function updateScoutingState(key, value) {
  scoutingDropdownOpen = '';
  scoutingState[key] = value;
  scoutingState.offset = 0;
  scoutingState.surpriseId = '';

  if (key === 'leagueId') {
    scoutingState.teamId = '';
    scoutingState.comparePlayerId = '';
  }
  if (key === 'teamId') {
    scoutingState.comparePlayerId = '';
    const club = selectedClubForScouting();
    if (club && scoutingState.quickRole === 'starter') scoutingState.minOverall = String(Math.max(40, club.avgOverall - 1));
    if (club && scoutingState.quickRole === 'rotation') {
      scoutingState.minOverall = String(Math.max(40, club.avgOverall - 4));
      scoutingState.maxOverall = String(Math.min(99, club.avgOverall + 2));
    }
    if (club && scoutingState.quickRole === 'veteran') scoutingState.minOverall = String(Math.max(40, club.avgOverall - 2));
  }
  if (key === 'position') {
    const validProfiles = new Set(getPrototypeOptionsForPosition(value).map(profile => profile.id));
    if (!validProfiles.has(scoutingState.profile)) scoutingState.profile = 'auto';
  }
  renderResults();
}

function applyQuickScoutingPreset(id) {
  const club = selectedClubForScouting();
  scoutingState.quickRole = id;
  scoutingState.offset = 0;
  scoutingState.surpriseId = '';
  if (id === 'prospect') {
    scoutingState.maxAge = '23';
    scoutingState.minAge = '';
    scoutingState.onlyU23 = true;
    scoutingState.profile = 'young';
    scoutingState.sort = 'young';
  } else if (id === 'veteran') {
    scoutingState.minAge = '30';
    scoutingState.maxAge = '';
    scoutingState.onlyU23 = false;
    scoutingState.sort = 'fit';
    if (club) scoutingState.minOverall = String(Math.max(40, club.avgOverall - 2));
  } else if (id === 'starter') {
    scoutingState.minAge = '';
    scoutingState.onlyU23 = false;
    scoutingState.sort = 'fit';
    if (club) scoutingState.minOverall = String(Math.max(40, club.avgOverall - 1));
  } else if (id === 'rotation') {
    scoutingState.minAge = '';
    scoutingState.onlyU23 = false;
    scoutingState.sort = 'fit';
    if (club) {
      scoutingState.minOverall = String(Math.max(40, club.avgOverall - 4));
      scoutingState.maxOverall = String(Math.min(99, club.avgOverall + 2));
    }
  } else if (id === 'realistic') {
    scoutingState.regional = true;
    scoutingState.sort = 'regional';
  } else if (id === 'undervalued') {
    scoutingState.undervalued = true;
    scoutingState.profile = 'undervalued';
    scoutingState.sort = 'undervalued';
  } else if (id === 'utility') {
    scoutingState.profile = 'auto';
    scoutingState.position = 'any';
    scoutingState.sort = 'fit';
  }
  renderResults();
}

function toggleScoutingAdvanced() {
  scoutingState.advancedOpen = !scoutingState.advancedOpen;
  renderResults();
}

function setScoutingView(view) {
  scoutingState.view = view === 'table' ? 'table' : 'cards';
  scoutingState.offset = 0;
  renderResults();
}

function moveScoutingPage(direction) {
  const { items } = getScoutingRecommendations();
  const pageSize = scoutingPageSize();
  const maxOffset = Math.max(0, (Math.ceil(items.length / pageSize) - 1) * pageSize);
  const nextOffset = scoutingState.offset + (direction > 0 ? pageSize : -pageSize);
  scoutingState.offset = Math.max(0, Math.min(maxOffset, nextOffset));
  renderResults();
}

function showMoreScoutingOptions() {
  moveScoutingPage(1);
}

function removeSavedScout(playerId, teamId = '') {
  const key = scoutSaveKey(playerId, teamId);
  const player = scoutingDataset?.players.find(row => String(row.Id) === String(playerId));
  const fallbackKey = scoutSaveKey(playerId, player?.teamId || '');
  setSavedScouts(getSavedScouts().filter(row => {
    const rowKey = scoutSaveKey(row.playerId, row.teamId);
    return rowKey !== key && rowKey !== fallbackKey;
  }));
  renderResults();
}

function surpriseScoutingPick() {
  const { items } = getScoutingRecommendations();
  const pool = items.filter(item => item.fit >= 60 && (!scoutingState.regional || item.regionalFit >= 48));
  if (!pool.length) return;
  const candidates = pool.slice(0, Math.min(pool.length, 40));
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  scoutingState.surpriseId = pick.player.Id;
  scoutingState.offset = 0;
  renderResults();
}

function toggleSavedScout(playerId) {
  const { items } = getScoutingRecommendations();
  const item = items.find(row => String(row.player.Id) === String(playerId));
  if (!item) return;
  const key = scoutSaveKey(item.player.Id, item.player.teamId || '');
  const saved = getSavedScouts();
  const existingIndex = saved.findIndex(row => scoutSaveKey(row.playerId, row.teamId) === key);
  if (existingIndex >= 0) {
    saved.splice(existingIndex, 1);
  } else {
    saved.unshift(scoutItemToStorage(item));
  }
  setSavedScouts(saved);
  scoutingState.comparePlayerId = item.player.Id;
  renderResults();
}

function compareScoutingPlayer(playerId) {
  scoutingState.comparePlayerId = playerId || '';
  renderResults();
}

function findSimilarScout(playerId) {
  const { items } = getScoutingRecommendations();
  const item = items.find(row => String(row.player.Id) === String(playerId));
  if (!item) return;
  scoutingState.position = item.targetPosition || item.player.pos || 'any';
  scoutingState.profile = item.profileId || 'auto';
  scoutingState.sort = 'meta';
  scoutingState.offset = 0;
  renderResults();
}

async function initScouting() {
  const loading = document.getElementById('rankings-loading');
  const content = document.getElementById('rankings-content');
  if (!content) return;

  const [playersText, teamsText, squadsText, leaguesText, correctedText, formulasText] = await Promise.all([
    fetchText('database/All players exported.csv'),
    fetchText('database/All teams exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All leagues exported.csv'),
    fetchText('database/medias_corregidas.csv'),
    fetchText('F%C3%B3rmula%20Medias/output/formulas_por_posicion.json'),
  ]);

  if (!playersText || !teamsText || !squadsText) {
    if (loading) loading.style.display = 'none';
    content.innerHTML = '<div class="error-message">No se pudo cargar la base de datos para generar Scouting.</div>';
    return;
  }

  scoutingFormulas = formulasText ? JSON.parse(formulasText) : null;

  scoutingDataset = buildDataset(
    parseCSV(playersText),
    parseCSV(teamsText),
    parseCSV(squadsText),
    leaguesText ? parseCSV(leaguesText) : [],
    correctedText ? parseCSV(correctedText) : []
  );

  renderResults();
  if (loading) loading.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', event => {
    if (!scoutingDropdownOpen || event.target.closest('.scouting-custom-select')) return;
    scoutingDropdownOpen = '';
    renderResults();
  });

  initScouting().catch(err => {
    const loading = document.getElementById('rankings-loading');
    const content = document.getElementById('rankings-content');
    if (loading) loading.style.display = 'none';
    if (content) content.innerHTML = `<div class="error-message">Error inesperado: ${rankEscape(err.message)}</div>`;
    console.error(err);
  });
});

window.updateScoutingState = updateScoutingState;
window.toggleScoutingDropdown = toggleScoutingDropdown;
window.selectScoutingDropdown = selectScoutingDropdown;
window.applyQuickScoutingPreset = applyQuickScoutingPreset;
window.toggleScoutingAdvanced = toggleScoutingAdvanced;
window.setScoutingView = setScoutingView;
window.moveScoutingPage = moveScoutingPage;
window.showMoreScoutingOptions = showMoreScoutingOptions;
window.surpriseScoutingPick = surpriseScoutingPick;
window.toggleSavedScout = toggleSavedScout;
window.removeSavedScout = removeSavedScout;
window.compareScoutingPlayer = compareScoutingPlayer;
window.findSimilarScout = findSimilarScout;
window.resetScoutingSearch = resetScoutingSearch;
window.initScouting = initScouting;
window.getLeaguesForScouting = getLeaguesForScouting;
window.getTeamsByLeague = getTeamsByLeague;
window.analyzeClubSquad = analyzeClubSquad;
window.detectSquadNeeds = detectSquadNeeds;
window.getPlayerPrototypeScore = getPlayerPrototypeScore;
window.getClubLevelFit = getClubLevelFit;
window.getRegionalFitScore = getRegionalFitScore;
window.getSquadNeedFit = getSquadNeedFit;
window.calculateScoutingFitScore = calculateScoutingFitScore;
window.getScoutingRecommendations = getScoutingRecommendations;
window.renderScoutingCards = renderScoutingCards;
window.getProjectedPositionRating = getProjectedPositionRating;
window.isSpecialPlayer = isSpecialPlayer;
