/**
 * Base de datos Option File PES 2018–2026
 * Player Profile Page Script
 *
 * Loads a single player's full data from generated HTML or URL params:
 *   /player/v2/TEAMID/player-slug/
 *   player.html?id=PLAYERID&team=TEAMID
 */

'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────

function handleMinifaceError(img, playerId) {
  img.onerror = null;
  img.src = 'img/players/default.webp';
}

// Profile miniface (outside card): hides the element instead of falling back to default
function handleProfileMinifaceError(img, playerId) {
  img.onerror = null;
  img.style.display = 'none';
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(';').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';').map(v => v.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function pickValue(obj, keys, fallback = '') {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return fallback;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toTitleCaseName(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const keepUpper = new Set(['FC', 'AC', 'CF', 'CD', 'CA', 'SC', 'RC', 'AFC', 'BSC', 'PSG', 'PSV', 'UFC', 'UD', 'SD']);
  const lowerWords = new Set(['de', 'del', 'da', 'das', 'do', 'dos', 'y', 'e']);
  return raw.toLocaleLowerCase('es').split(' ').map((word, index) => {
    const clean = word.replace(/[^\p{L}\p{N}]/gu, '').toLocaleUpperCase('es');
    if (keepUpper.has(clean)) return clean;
    if (index > 0 && lowerWords.has(word)) return word;
    return word.split('-').map(part => part ? part.charAt(0).toLocaleUpperCase('es') + part.slice(1) : part).join('-');
  }).join(' ');
}

function correctedPlayerFallbackKey(row) {
  const name = normalizeText(row['Name'] || row['nombre'] || row['PlayerName'] || '');
  const country = row['Country'] || row['Nationality'] || row['nacionalidad'] || '';
  const pos = row['POS'] || row['Position'] || row['posicion'] || '';
  return { nameCountry: name && country ? `${name}|${country}` : '', namePos: name && pos ? `${name}|${pos}` : '' };
}

function buildCorrectedOverallMap(rows) {
  const map = { byPlayer: Object.create(null), byNameCountry: Object.create(null), byNamePos: Object.create(null) };
  rows.forEach(r => {
    const pid = r['PlayerId'] || r['Id'] || r['id'] || r['player_id'] || '';
    const ovr = r['OverallStats'] || r['Overall'] || r['corrected_overall'] || r['media'] || '';
    if (!ovr) return;
    if (pid) map.byPlayer[pid] = ovr;
    const fallback = correctedPlayerFallbackKey(r);
    if (fallback.nameCountry) map.byNameCountry[fallback.nameCountry] = ovr;
    if (fallback.namePos) map.byNamePos[fallback.namePos] = ovr;
  });
  return map;
}

function correctedOverallFor(row, teamId, correctedMap) {
  if (!row || !correctedMap) return '';
  const pid = row['Id'] || row.ID || row['PlayerId'] || '';
  if (pid && correctedMap.byPlayer[pid]) return correctedMap.byPlayer[pid];
  const fallback = correctedPlayerFallbackKey(row);
  return correctedMap.byNameCountry[fallback.nameCountry] || correctedMap.byNamePos[fallback.namePos] || '';
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

function flagSrc(countryId) {
  if (!countryId) return 'img/flags/default.webp';
  return `img/flags/${countryId}.webp`;
}

function statColorClass(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'stat-range-1';
  if (v >= 95) return 'stat-range-6';
  if (v >= 90) return 'stat-range-5';
  if (v >= 80) return 'stat-range-4';
  if (v >= 70) return 'stat-range-3';
  if (v >= 60) return 'stat-range-2';
  return 'stat-range-1';
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

function statTextColor(hexColor) {
  return ['#e5dc00', '#a8ff00', '#62ff51', '#00ff87'].includes(hexColor) ? '#111' : '#fff';
}

function overallColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'stat-range-1';
  if (v >= 95) return 'stat-range-6';
  if (v >= 90) return 'stat-range-5';
  if (v >= 80) return 'stat-range-4';
  if (v >= 70) return 'stat-range-3';
  if (v >= 60) return 'stat-range-2';
  return 'stat-range-1';
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Translations (UI display only) ──────────────────────────────────────────

// Stats: CSV column name → Spanish display label
const STAT_LABELS = {
  'Attacking Prowess': 'Ataque',
  'Ball Control':      'Control de balón',
  'Dribbling':         'Drible',
  'Low Pass':          'Pase al ras',
  'Lofted Pass':       'Pase bombeado',
  'Finishing':         'Finalización',
  'Place Kicking':     'Balón parado',
  'Controlled Spin':   'Efecto',
  'Header':            'Cabeza',
  'Defensive Prowess': 'Defensa',
  'Ball Winning':      'Recup. de balón',
  'Kicking Power':     'Potencia de tiro',
  'Speed':             'Velocidad',
  'Explosive Power':   'Fuerza explosiva',
  'Body Control':      'Control corporal',
  'Physical Contact':  'Contacto físico',
  'Jump':              'Salto',
  'Goalkeeping':       'Capac. de portero',
  'Catching':          'Atajar',
  'Clearing':          'Despejar',
  'Reflexes':          'Reflejos',
  'Coverage':          'Alcance',
  'Stamina':           'Resistencia',
  'Weak Foot Usage':   'Uso de pie malo',
  'Weak Foot Acc.':    'Precisión de pie malo',
  'Form':              'Estabilidad',
  'Injury Resistance': 'Resist. a lesiones',
};

// Positions: PES abbreviation → Spanish UI label
const POSITION_LABELS = {
  'GK':  'PT',
  'CB':  'DEC',
  'LB':  'LI',
  'RB':  'LD',
  'DMF': 'MCD',
  'CMF': 'MC',
  'LMF': 'MDI',
  'RMF': 'MDD',
  'AMF': 'MO',
  'LWF': 'EXI',
  'RWF': 'EXD',
  'SS':  'SD',
  'CF':  'CD',
};

const NATIONALITY_NAMES = {
  '7':   'China',        '10':  'Indonesia',   '11':  'Irán',
  '12':  'Irak',         '13':  'Japón',        '14':  'Jordania',
  '15':  'Corea del Norte', '16': 'Corea del Sur', '17': 'Kuwait',
  '21':  'Malasia', '34':  'Siria', 
  '19':  'Líbano',       '26':  'Omán',         '30':  'Qatar',
  '31':  'Arabia Saudita', '36': 'Tailandia',   '37':  'Emiratos Árabes Unidos',
  '44':  'Argelia',      '45':  'Angola',       '48':  'Burkina Faso',
  '50':  'Camerún',      '51':  'Cabo Verde',   '52':  'República Centroafricana',
  '55':  'Congo DR',     '56':  'Costa de Marfil', '58': 'Egipto',
  '62':  'Gabón',
  '59':  'Guinea Ecuatorial',      '63':  'Gambia',       '64':  'Ghana',
  '65':  'Guinea',       '66':  'Guinea-Bisáu', '70':  'Libia',
  '73':  'Malí',         '76':  'Marruecos',    '77':  'Mozambique',
  '79':  'Níger',        '80':  'Nigeria',      '83':  'Senegal',
  '87':  'Sudáfrica',    '91':  'Togo',         '92':  'Túnez',
  '94':  'Zambia',       '95':  'Zimbabue',     '110': 'Canadá',
  '112': 'Costa Rica',   '115': 'Rep. Dominicana', '120': 'Haití',
  '121': 'Honduras',     '122': 'Jamaica',      '124': 'México',
  '128': 'Panamá',       '133': 'Trinidad y Tobago',    '135': 'Estados Unidos',
  '139': 'Surinam',      '144': 'Argentina',    '145': 'Bolivia',
  '146': 'Brasil',       '147': 'Chile',        '148': 'Colombia',
  '149': 'Ecuador',      '150': 'Paraguay',     '151': 'Perú',
  '152': 'Uruguay',      '153': 'Venezuela',    '162': 'Australia',
  '166': 'Nueva Zelanda','189': 'Israel',       '190': 'Turquía',
  '191': 'Albania',      '193': 'Armenia',      '194': 'Austria',
  '196': 'Bielorrusia',  '197': 'Bélgica',      '198': 'Bosnia y Herzegovina',
  '199': 'Bulgaria',     '200': 'Croacia',       '201': 'Chipre',
  '202': 'Rep. Checa',   '203': 'Dinamarca',    '204': 'Inglaterra',
  '207': 'Finlandia',    '208': 'Francia',      '209': 'Georgia',
  '210': 'Alemania',     '211': 'Grecia',       '212': 'Hungría',
  '213': 'Islandia',     '214': 'Irlanda',      '215': 'Italia',
  '219': 'Lituania',     '221': 'Macedonia del Norte', '223': 'Moldavia',
  '224': 'Países Bajos', '225': 'Irlanda del Norte', '226': 'Noruega',
  '227': 'Polonia',      '228': 'Portugal',     '229': 'Rumanía',
  '230': 'Rusia',        '232': 'Escocia',      '234': 'Eslovaquia',
  '235': 'Eslovenia',    '236': 'España',       '237': 'Suecia',
  '238': 'Suiza',        '239': 'Ucrania',      '240': 'Uzbekistán',
  '241': 'Gales',        '303': 'Serbia',       '304': 'Montenegro',
  '311': 'Kosovo', '129': 'Puerto Rico', '206': 'Islas Feroe',
};

function nationalityName(countryId) {
  if (!countryId) return '–';
  return (typeof i18nLookup === 'function' ? i18nLookup('countries', String(countryId), '') : '')
    || NATIONALITY_NAMES[String(countryId)]
    || countryId;
}

// Team type → Spanish label
const TYPE_LABELS = {
  '0': 'Clubes',
  '1': 'Equipos especiales',
  '2': 'Selecciones',
};

function translateStat(csvCol) {
  return typeof i18nLookup === 'function' ? i18nLookup('stats', csvCol, csvCol) : (STAT_LABELS[csvCol] || csvCol);
}

function translatePosition(pesPos) {
  return typeof i18nLookup === 'function' ? i18nLookup('positions', pesPos, pesPos) : (POSITION_LABELS[pesPos] || pesPos);
}

function teamTypeLabel(type) {
  return typeof i18nLookup === 'function' ? i18nLookup('types', String(type), TYPE_LABELS[type] || '') : (TYPE_LABELS[type] || '');
}

function playingStyleLabel(value) {
  return typeof i18nLookup === 'function' ? i18nLookup('playingStyles', String(value), PLAYING_STYLE_LABELS[value] || value) : (PLAYING_STYLE_LABELS[value] || value);
}

function pairLabel(group, code, fallback) {
  const pairs = typeof i18nPairs === 'function' ? i18nPairs(group) : [];
  return (pairs.find(([key]) => key === code) || [null, fallback || code])[1];
}

const DEFENSIVE_POSITION_COLOR = '#3EBEC8';
const DEFENSIVE_POSITIONS = new Set(['CB', 'CT', 'DFC', 'LB', 'LI', 'RB', 'LD', 'LWB', 'RWB']);

function isDefensivePosition(pesPos) {
  return DEFENSIVE_POSITIONS.has(String(pesPos || '').toUpperCase());
}

function positionGroupColor(pesPos) {
  if (pesPos === 'GK') return '#f9d901';
  if (isDefensivePosition(pesPos)) return DEFENSIVE_POSITION_COLOR;
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(pesPos)) return '#57e42b';
  if (['LWF', 'RWF', 'SS', 'CF'].includes(pesPos)) return '#ff2c77';
  return '#8b949e';
}

function positionBadgeStyle(pesPos) {
  const color = positionGroupColor(pesPos);
  return `color:${color};border-color:${color};background:${color}18`;
}

// ─── Boot mapping (boot ID → { pesNumber, brand }) ───────────────────────────
// PES numbers are as defined in the game. Note that boot ID 0 and PES boot 62
// intentionally share PES number 47 per the official game equivalence table.

const BOOT_MAPPING = {
  // Adidas
  '0':    { pesNumber: 47, brand: 'Adidas' },
  '1053': { pesNumber: 1,  brand: 'Adidas' },
  '1052': { pesNumber: 2,  brand: 'Adidas' },
  '1051': { pesNumber: 3,  brand: 'Adidas' },
  '1063': { pesNumber: 4,  brand: 'Adidas' },
  '1064': { pesNumber: 5,  brand: 'Adidas' },
  '1062': { pesNumber: 6,  brand: 'Adidas' },
  '1061': { pesNumber: 7,  brand: 'Adidas' },
  '1073': { pesNumber: 8,  brand: 'Adidas' },
  '1072': { pesNumber: 9,  brand: 'Adidas' },
  '1071': { pesNumber: 10, brand: 'Adidas' },
  // Joma
  '6011': { pesNumber: 11, brand: 'Joma' },
  '6021': { pesNumber: 12, brand: 'Joma' },
  // Mizuno
  '5013': { pesNumber: 13, brand: 'Mizuno' },
  '5012': { pesNumber: 14, brand: 'Mizuno' },
  '5011': { pesNumber: 15, brand: 'Mizuno' },
  '5032': { pesNumber: 16, brand: 'Mizuno' },
  '5033': { pesNumber: 17, brand: 'Mizuno' },
  '5031': { pesNumber: 18, brand: 'Mizuno' },
  // New Balance
  '7012': { pesNumber: 19, brand: 'New Balance' },
  '7011': { pesNumber: 20, brand: 'New Balance' },
  '7022': { pesNumber: 21, brand: 'New Balance' },
  '7021': { pesNumber: 22, brand: 'New Balance' },
  // Nike
  '2013': { pesNumber: 23, brand: 'Nike' },
  '2012': { pesNumber: 24, brand: 'Nike' },
  '2011': { pesNumber: 25, brand: 'Nike' },
  '2024': { pesNumber: 26, brand: 'Nike' },
  '2023': { pesNumber: 27, brand: 'Nike' },
  '2021': { pesNumber: 28, brand: 'Nike' },
  '2022': { pesNumber: 29, brand: 'Nike' },
  '2053': { pesNumber: 30, brand: 'Nike' },
  '2052': { pesNumber: 31, brand: 'Nike' },
  '2051': { pesNumber: 32, brand: 'Nike' },
  '2063': { pesNumber: 33, brand: 'Nike' },
  '2062': { pesNumber: 34, brand: 'Nike' },
  '2061': { pesNumber: 35, brand: 'Nike' },
  // Puma
  '3043': { pesNumber: 36, brand: 'Puma' },
  '3042': { pesNumber: 37, brand: 'Puma' },
  '3041': { pesNumber: 38, brand: 'Puma' },
  '3053': { pesNumber: 39, brand: 'Puma' },
  '3052': { pesNumber: 40, brand: 'Puma' },
  '3051': { pesNumber: 41, brand: 'Puma' },
  // Umbro
  '4012': { pesNumber: 42, brand: 'Umbro' },
  '4011': { pesNumber: 43, brand: 'Umbro' },
  '4032': { pesNumber: 44, brand: 'Umbro' },
  '4031': { pesNumber: 45, brand: 'Umbro' },
  // PES
  '61': { pesNumber: 46, brand: 'PES' },
  '62': { pesNumber: 47, brand: 'PES' },
  '63': { pesNumber: 48, brand: 'PES' },
  '64': { pesNumber: 49, brand: 'PES' },
  '65': { pesNumber: 50, brand: 'PES' },
  '66': { pesNumber: 51, brand: 'PES' },
  '71': { pesNumber: 52, brand: 'PES' },
  '72': { pesNumber: 53, brand: 'PES' },
  '73': { pesNumber: 54, brand: 'PES' },
  '81': { pesNumber: 55, brand: 'PES' },
  '82': { pesNumber: 56, brand: 'PES' },
  '83': { pesNumber: 57, brand: 'PES' },
  '84': { pesNumber: 58, brand: 'PES' },
  '51': { pesNumber: 59, brand: 'PES' },
  '52': { pesNumber: 60, brand: 'PES' },
};

// ─── Gloves mapping (gloves ID → { pesNumber }) ───────────────────────────────
// IDs match the CSV values; pesNumber is the internal index shown to the user.
// ID 1 is stored as '1' in the CSV but the image file is named '001.webp'.

const GLOVES_MAPPING = {
  '101': { pesNumber: 1  },
  '102': { pesNumber: 2  },
  '901': { pesNumber: 3  },
  '201': { pesNumber: 4  },
  '211': { pesNumber: 5  },
  '311': { pesNumber: 6  },
  '301': { pesNumber: 7  },
  '601': { pesNumber: 8  },
  '701': { pesNumber: 9  },
  '801': { pesNumber: 10 },
  '1':   { pesNumber: 11 },
};

// ─── Equipment mapping helper ─────────────────────────────────────────────────

function getEquipmentData(type, id) {
  if (type === 'boots')  return BOOT_MAPPING[id];
  if (type === 'gloves') return GLOVES_MAPPING[id];
  return null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PES_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

// Position rating columns (same order as PES_POSITIONS)
const POSITION_RATING_COLS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

const POSITION_DISPLAY = [
  { pos: 'CF',  abbr: 'CD',   name: 'Centro delantero', category: 'forward' },
  { pos: 'SS',  abbr: 'SD',   name: 'Segundo delantero', category: 'forward' },
  { pos: 'LWF', abbr: 'EXI',  name: 'Extremo izquierdo', category: 'forward' },
  { pos: 'RWF', abbr: 'EXD',  name: 'Extremo derecho', category: 'forward' },
  { pos: 'AMF', abbr: 'MO',   name: 'Mediocampista ofensivo', category: 'midfielder' },
  { pos: 'LMF', abbr: 'MCI',  name: 'Mediocampista izquierdo', category: 'midfielder' },
  { pos: 'CMF', abbr: 'MC',   name: 'Mediocampista central', category: 'midfielder' },
  { pos: 'RMF', abbr: 'MCD',  name: 'Mediocampista derecho', category: 'midfielder' },
  { pos: 'DMF', abbr: 'MCD', name: 'Mediocampista contencion', category: 'midfielder' },
  { pos: 'LB',  abbr: 'LI',   name: 'Lateral izquierdo', category: 'defender' },
  { pos: 'CB',  abbr: 'DFC',  name: 'Defensa central', category: 'defender' },
  { pos: 'RB',  abbr: 'LD',   name: 'Lateral derecho', category: 'defender' },
  { pos: 'GK',  abbr: 'PT',   name: 'Portero', category: 'goalkeeper' },
];

const POSITION_GRID_LAYOUT = {
  'LWF': { col: 1, row: 1 },
  'CF':  { col: 2, row: 1 },
  'RWF': { col: 3, row: 1 },
  'SS':  { col: 2, row: 2 },
  'AMF': { col: 2, row: 3 },
  'LMF': { col: 1, row: 4 },
  'CMF': { col: 2, row: 4 },
  'RMF': { col: 3, row: 4 },
  'DMF': { col: 2, row: 5 },
  'LB':  { col: 1, row: 6 },
  'CB':  { col: 2, row: 6 },
  'RB':  { col: 3, row: 6 },
  'GK':  { col: 2, row: 7 },
};

// Ordered stat columns for the Habilidades section (exact game order)
const STAT_COLUMNS_ORDERED = [
  'Attacking Prowess', 'Ball Control', 'Dribbling',
  'Low Pass', 'Lofted Pass', 'Finishing',
  'Place Kicking', 'Controlled Spin', 'Header',
  'Defensive Prowess', 'Ball Winning', 'Kicking Power',
  'Speed', 'Explosive Power', 'Body Control',
  'Physical Contact', 'Jump', 'Goalkeeping',
  'Catching', 'Clearing', 'Reflexes',
  'Coverage', 'Stamina',
  'Weak Foot Usage', 'Weak Foot Acc.', 'Form', 'Injury Resistance',
];

// Playing style numeric index → Spanish label
const PLAYING_STYLE_LABELS = {
  '0':  '-',
  '1':  'Cazagoles',
  '2':  'Señuelo',
  '3':  'Hombre de área',
  '4':  'Extremo prolífico',
  '5':  'Diez clásico',
  '6':  'Jugador de huecos',
  '7':  'Omnipresente',
  '8':  'Medio escudo',
  '9':  'El destructor',
  '10': 'Atacante extra',
  '11': 'Lateral ofensivo',
  '12': 'Lateral defensivo',
  '13': 'Referente',
  '14': 'Creador de jugadas',
  '15': 'Creación',
  '16': 'Portero ofensivo',
  '17': 'Portero defensivo',
  '18': '-',
};

// Player skills S01–S28 (True/False) — Habilidades de jugador
const PLAYER_SKILLS = [
  { col: 'S01', label: 'Tijera' },
  { col: 'S02', label: 'Gambeta' },
  { col: 'S03', label: 'Marsellesa' },
  { col: 'S04', label: 'Sombrerito' },
  { col: 'S05', label: 'Amago por detrás y giro' },
  { col: 'S06', label: 'Rebote interior' },
  { col: 'S07', label: 'Cabeceador' },
  { col: 'S08', label: 'Cañonero' },
  { col: 'S09', label: 'Tiro con empeine' },
  { col: 'S10', label: 'Finaliz. acrobática' },
  { col: 'S11', label: 'Taconazo' },
  { col: 'S12', label: 'Remate primer toque' },
  { col: 'S13', label: 'Pase al primer toque' },
  { col: 'S14', label: 'Pase a profundidad' },
  { col: 'S15', label: 'Pase cruzado' },
  { col: 'S16', label: 'Centro con rosca' },
  { col: 'S17', label: 'Rabona' },
  { col: 'S18', label: 'Pase bombeado bajo' },
  { col: 'S19', label: 'Trayect. en picada' },
  { col: 'S20', label: 'Saque largo de banda' },
  { col: 'S21', label: 'Saq. meta largo' },
  { col: 'S22', label: 'Malicia' },
  { col: 'S23', label: 'Marcar hombre' },
  { col: 'S24', label: 'Delantero atrasado' },
  { col: 'S25', label: 'Despeje acrobático' },
  { col: 'S26', label: 'Capitanía' },
  { col: 'S27', label: 'Super refuerzo' },
  { col: 'S28', label: 'Espíritu de lucha' },
];

// COM playing styles P01–P07 (True/False) — Estilos de juego COM
const COM_PLAYING_STYLES = [
  { col: 'P01', label: 'Mago del balón' },
  { col: 'P02', label: 'Esquivo' },
  { col: 'P03', label: 'Misil con el balón' },
  { col: 'P04', label: 'Llegador' },
  { col: 'P05', label: 'Experto pases largos' },
  { col: 'P06', label: 'Centrador' },
  { col: 'P07', label: 'Cañonero' },
];

// ─── Appearance section/subsection definitions ────────────────────────────────

// Fields with image: path is img/appearance/{imageKey}/{value}.webp
// Fields with enum: numeric/bool value → Spanish label
// Fields with source:'player': read from the players CSV row, not appearances
// Fields with conditionalDash: show '-' when another col matches a value
// Fields with dashIfZero: show '-' when the field value is '0'
// Fields with showImageIf: show image only when value is not '0' (and not empty)

const APPEARANCE_SECTIONS = [
  {
    title: 'Cara',
    subsections: [
      {
        title: 'Color de piel / Proporción de cabeza',
        fields: [
          { col: 'Skin Colour',  label: 'Color de piel',          imageKey: 'skin_colour' },
          { col: 'Head Length',  label: 'Altura de la cabeza' },
          { col: 'Head Width',   label: 'Anchura de la cabeza' },
          { col: 'Head Depth',   label: 'Profundidad de la cabeza' },
          { col: 'Face Height',  label: 'Largo de la cara' },
          { col: 'Face Size',    label: 'Tamaño de la cara' },
        ],
      },
      {
        title: 'Ojos',
        fields: [
          { col: 'Upper Eyelid Type',        label: 'Tipo de párpado superior',   imageKey: 'upper_eyelid' },
          { col: 'Bottom Eyelid Type',       label: 'Tipo de párpado inferior',   imageKey: 'bottom_eyelid' },
          { col: 'Eye Height',               label: 'Altura de los ojos' },
          { col: 'Horizontal Eye Position',  label: 'Posición horizontal ojos' },
          { col: 'Iris Colour',              label: 'Color del iris',             imageKey: 'iris_colour' },
          { col: 'Pupil Size',               label: 'Tamaño del iris' },
          { col: 'Upper Eyelid Ht. (Inner)', label: 'Alt. Párpado sup. (I.)' },
          { col: 'Upper Eyelid Wd. (Inner)', label: 'Ancho Párpado sup. (I.)' },
          { col: 'Upper Eyelid Ht. (Outer)', label: 'Alt. Párpado sup. (E.)' },
          { col: 'Upper Eyelid Wd. (Outer)', label: 'Ancho Párpado sup. (E.)' },
          { col: 'Inner Eye Height',         label: 'Altura interior ojos' },
          { col: 'Inner Eye Position',       label: 'Posición interior de ojos' },
          { col: 'Eye Corner Height',        label: 'Altura exterior ojos' },
          { col: 'Outer Eye Position',       label: 'Posición exterior de ojos' },
          { col: 'Bottom Eyelid Height',     label: 'Altura Párpado Inferior' },
          { col: 'Eye Depth',                label: 'Prof. de los ojos' },
        ],
      },
      {
        title: 'Frente / Cejas',
        fields: [
          { col: 'Forehead',            label: 'Frente',               imageKey: 'forehead' },
          { col: 'Eyebrow Type',        label: 'Estilo de cejas',      imageKey: 'eyebrow_type' },
          { col: 'Eyebrow Thickness',   label: 'Espesor de cejas' },
          { col: 'Eyebrow Style',       label: 'Tipo de cejas',        enum: { '0': 'Fina', '1': 'Normal', '2': 'Gruesa' } },
          { col: 'Eyebrow Density',     label: 'Densidad de cejas' },
          { col: 'Eyebrow Colour R',    label: 'Color de cejas R',   noPlus: true },
          { col: 'Eyebrow Colour G',    label: 'Color de cejas V',   noPlus: true },
          { col: 'Eyebrow Colour B',    label: 'Color de cejas A',   noPlus: true },
          { col: 'Inner Eyebrow Height',label: 'Altura interior cejas' },
          { col: 'Brow Width',          label: 'Ancho del entrecejo' },
          { col: 'Outer Edyebrow Height',label: 'Altura exterior cejas' },
          { col: 'Temple Width',        label: 'Ancho de la sien' },
          { col: 'Eyebrow Depth',       label: 'Profundidad de las cejas' },
        ],
      },
      {
        title: 'Nariz',
        fields: [
          { col: 'Nose Type',      label: 'Tipo de nariz',         imageKey: 'nose_type' },
          { col: 'Laughter Lines', label: 'Arrugas',               imageKey: 'laughter_lines' },
          { col: 'Nose Height',    label: 'Altura de la nariz' },
          { col: 'Nostril Width',  label: 'Tamaño fosas nasales' },
          { col: 'Nose Width',     label: 'Grosor de la nariz' },
          { col: 'Nose Tip Depth', label: 'Profundidad punta nariz' },
          { col: 'Nose Depth',     label: 'Profundidad nariz' },
        ],
      },
      {
        title: 'Boca',
        fields: [
          { col: 'Upper Lip Type',     label: 'Tipo labio sup.',    imageKey: 'upper_lip' },
          { col: 'Lower Lip Type',     label: 'Tipo labio inf.',    imageKey: 'lower_lip' },
          { col: 'Mouth Position',     label: 'Posición de la boca' },
          { col: 'Lip Size',           label: 'Tamaño labios' },
          { col: 'Lip Width',          label: 'Ancho de labio' },
          { col: 'Mouth Corner Height',label: 'Alt. comisuras lab.' },
          { col: 'Mouth Depth',        label: 'Profundidad de boca' },
        ],
      },
      {
        title: 'Vello Facial',
        fields: [
          { col: 'Facial Hair Type',    label: 'Tipo vello fac.',          imageKey: 'facial_hair', conditionalLabel: { value: '1', label: 'No' } },
          { col: 'Facial Hair Colour R',label: 'Color del vello facial R', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Facial Hair Colour G',label: 'Color del vello facial V', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Facial Hair Colour B',label: 'Color del vello facial A', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Thickness',           label: 'Espesura',                              conditionalDash: { col: 'Facial Hair Type', value: '1' } },
        ],
      },
      {
        title: 'Mejillas / Maxilar / Mentón',
        fields: [
          { col: 'Cheek Type',    label: 'Tipo mejillas',              imageKey: 'cheek_type' },
          { col: 'Neck Line Type',label: 'Tipo de línea del cuello',   imageKey: 'neck_line' },
          { col: 'Cheekbones',    label: 'Pómulos' },
          { col: 'Chin Height',   label: 'Altura del mentón' },
          { col: 'Chin Width',    label: 'Ancho del mentón' },
          { col: 'Jaw Height',    label: 'Altura del maxilar' },
          { col: 'Jawline',       label: 'Línea del maxilar' },
          { col: 'Chin Depth',    label: 'Profundidad del mentón' },
        ],
      },
      {
        title: 'Orejas',
        fields: [
          { col: 'Ear Length', label: 'Largo de orejas' },
          { col: 'Ear Width',  label: 'Ancho de orejas' },
          { col: 'Ear Angle',  label: 'Ángulo de la oreja' },
        ],
      },
    ],
  },
  {
    title: 'Peinado',
    subsections: [
      {
        title: 'General',
        fields: [
          { col: 'Overall - Style',         label: 'Estilo',    enum: { '0': '-', '1': 'Normal', '2': 'Seco', '3': 'Mohicano', '4': 'Afro', '5': 'Rastas', '6': 'Trenzado', '7': 'Especial' } },
          { col: 'Overall - Length',        label: 'Longitud',  enum: { '0': '-', '1': 'Afeitado', '2': 'Muy corto', '3': 'Corto', '4': 'Mediano', '5': 'Largo' }, notApplicableWhen: { col: 'Overall - Style', value: '7' } },
          { col: 'Overall - Wave Level',    label: 'Ondulado',  notApplicableWhen: { col: 'Overall - Style', value: '7' } },
          { col: 'Overall - Hair Variation',label: 'Variación del pelo', imageKey: 'hair_variation' },
        ],
      },
      {
        title: 'Delante',
        fields: [
          { col: 'Font - Style',          label: 'Estilo',        enum: { '0': '-', '1': 'Arriba', '2': 'Abajo', '3': 'Hacia atrás' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
          { col: 'Font - Parted',         label: 'Con raya',      enum: { '0': '-', '1': 'No', '2': 'Izquierda 2', '3': 'Izquierda 1', '4': 'Centro', '5': 'Derecha 1', '6': 'Derecha 2' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
          { col: 'Font - Hairline',       label: 'A raíz',        enum: { '0': '-', '1': 'Tipo 1', '2': 'Tipo 2', '3': 'Tipo 3' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
          { col: 'Font - Forehead Width', label: 'Ancho de frente', enum: { '0': '-', '1': 'Estrecha', '2': 'Normal', '3': 'Amplia' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
        ],
      },
      {
        title: 'Lateral / Atrás',
        fields: [
          { col: 'Side/Back - Style',   label: 'Estilo',    enum: { '0': '-', '1': 'Normal', '2': 'Menos volumen', '3': 'Menos lateral', '4': 'Recortado' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
          { col: 'Side/Back - Cropped', label: 'Recortado', showImageIf: true, imageKey: 'hair_cropped', conditionalDash: { col: 'Overall - Style', value: '7' } },
        ],
      },
      {
        title: 'Color de pelo / Accesorios',
        fields: [
          { col: 'Hair Colour',    label: 'Color de pelo',    imageKey: 'hair_colour' },
          { col: 'Hair Colour R',  label: 'Color de pelo R',  noPlus: true },
          { col: 'Hair Colour G',  label: 'Color de pelo V',  noPlus: true },
          { col: 'Hair Colour B',  label: 'Color de pelo A',  noPlus: true },
          { col: 'Accessories',    label: 'Accesorios',       enum: { 'False': 'No', 'True': 'Sí' } },
          { col: 'Accessory Colour',label: 'Color de accesorio', noPlus: true },
        ],
      },
    ],
  },
  {
    title: 'Físico',
    subsections: [
      {
        title: null,
        fields: [
          { col: 'Height',            label: 'Altura (cm)',          source: 'player', noPlus: true },
          { col: 'Weight',            label: 'Peso (kg)',            source: 'player', noPlus: true },
          { col: 'Neck Length',       label: 'Longitud del cuello' },
          { col: 'Neck Size',         label: 'Anchura del cuello' },
          { col: 'Shoulder Height',   label: 'Altura de hombros' },
          { col: 'Shoulder Width',    label: 'Anchura de hombros' },
          { col: 'Chest Measurement', label: 'Medida del pecho' },
          { col: 'Waist Size',        label: 'Grosor cintura' },
          { col: 'Arm Size',          label: 'Medida de brazos' },
          { col: 'Thigh Size',        label: 'Grosor muslos' },
          { col: 'Calf Size',         label: 'Grosor pantorrillas' },
          { col: 'Leg Length',        label: 'Longitud de piernas' },
          { col: 'Arm Length',        label: 'Longitud del brazo' },
        ],
      },
    ],
  },
  {
    title: 'Forma de vestir',
    subsections: [
      {
        title: null,
        fields: [
          { col: 'Boots',              label: 'Calzado',                       imageKey: 'boots', imagePath: 'img/boots', bootDisplay: true, zeroLabel: 'Botines por defecto' },
          { col: 'Wrist taping',       label: 'Vendaje',                       enum: { '0': 'No', '1': 'Derecha', '2': 'Izquierda', '3': 'Ambos' } },
          { col: 'Wrist Tape Colou',   label: 'Color vendaje muñeca',          conditionalDash: { col: 'Wrist taping', value: '0' }, enum: { '1': 'Color del Kit', '2': 'Blanco', '3': 'Negro', '4': 'Beige', '9': 'Beige', '10': 'Blanco' } },
          { col: 'Ankle Taping',       label: 'Vendaje tobillo',               enum: { '0': 'No', '1': 'Sí' } },
          { col: 'Player Gloves',      label: 'Guantes',                       enum: { '0': 'No', '1': 'Para invierno' } },
          { col: 'Colour',             label: 'Color de guantes',              conditionalDash: { col: 'Player Gloves', value: '0' } },
          { col: 'Gloves',             label: 'Guantes portero',               imageKey: 'gloves', bootDisplay: true, zeroLabel: 'Guantes por defecto', gkOnly: true },
          { col: 'Undershorts',        label: 'Calentadores',                  enum: { '0': 'V: No / I: No', '1': 'V: No / I: Largo', '2': 'V: Corto / I: Corto', '3': 'V: Corto / I: Largo' } },
          { col: 'Shirttail',          label: 'Estilo de la camiseta',         enum: { '0': 'Dentro', '1': 'Fuera' } },
          { col: 'Sock Length',        label: 'Largo de las calcetas',         enum: { '0': 'Normal', '1': 'Corto', '2': 'Largo' } },
          { col: 'Long-Sleeved Inners',label: 'Playera interior manga larga',  enum: { '0': 'No', '1': 'Normal', '2': 'Cuello tortuga' } },
        ],
      },
    ],
  },
  {
    title: 'Movimiento',
    subsections: [
      {
        title: 'Drible',
        fields: [
          { col: 'Drib. Hunching', label: 'Encorvadura', source: 'player', noPlus: true },
          { col: 'Drib. Arm Move.',label: 'Mov. de brazo', source: 'player', noPlus: true },
        ],
      },
      {
        title: 'Animación de carrera',
        fields: [
          { col: 'Run. Hunching', label: 'Encorvadura', source: 'player', noPlus: true },
          { col: 'Run. Arm Move.',label: 'Mov. de brazo', source: 'player', noPlus: true },
        ],
      },
      {
        title: 'Animación de disparo',
        fields: [
          { col: 'Corner Kicks', label: 'Tiro de esquina', source: 'player', noPlus: true },
          { col: 'Free Kicks',   label: 'Tiro libre',      source: 'player', noPlus: true },
          { col: 'Penalty Kick', label: 'Penal',           source: 'player', noPlus: true },
        ],
      },
      {
        title: 'Celebración de goles',
        fields: [
          { col: 'Celebration 1', label: 'Celebración de goles 1', source: 'player', noPlus: true, zeroLabel: 'No' },
          { col: 'Celebration 2', label: 'Celebración de goles 2', source: 'player', noPlus: true, zeroLabel: 'No' },
        ],
      },
    ],
  },
];

// ─── Radar chart ─────────────────────────────────────────────────────────────

function computeRadarAttributes(player) {
  const avg = (...keys) => {
    const vals = keys.map(k => parseInt(player[k], 10)).filter(v => !isNaN(v));
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };
  const posIdx = parseInt(player['POS'], 10);
  const isGK = posIdx === 0;
  if (isGK) {
    return {
      PAS: avg('Low Pass', 'Lofted Pass', 'Controlled Spin', 'Place Kicking'),
      TIR: avg('Finishing', 'Attacking Prowess'),
      FIS: avg('Physical Contact'),
      DEF: avg('Defensive Prowess'),
      VEL: avg('Speed'),
      DRI: avg('Dribbling', 'Ball Control'),
      POR: avg('Goalkeeping', 'Catching', 'Clearing', 'Reflexes', 'Coverage'),
    };
  }
  return {
    PAS: avg('Low Pass', 'Lofted Pass', 'Controlled Spin', 'Place Kicking'),
    TIR: avg('Finishing', 'Attacking Prowess'),
    FIS: avg('Physical Contact', 'Stamina'),
    DEF: avg('Defensive Prowess'),
    RIT: avg('Speed', 'Explosive Power'),
    DRI: avg('Dribbling', 'Ball Control'),
    POR: avg('Goalkeeping', 'Catching', 'Clearing', 'Reflexes', 'Coverage'),
  };
}

function drawRadar(canvasId, attrs) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(cx, cy) - 42;
  const MIN_VAL = 40;
  const MAX_VAL = 99;
  const labels = Object.keys(attrs);
  const values = Object.values(attrs);
  const n = labels.length;

  ctx.clearRect(0, 0, W, H);

  // Grid rings (5 levels, center = MIN_VAL)
  for (let ring = 1; ring <= 5; ring++) {
    const r = (maxR * ring) / 5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = ring === 5 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = ring === 5 ? 1.5 : 1;
    ctx.stroke();
  }

  // Axis lines
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Data polygon fill (center = MIN_VAL)
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = Math.max(0, (values[i] - MIN_VAL) / (MAX_VAL - MIN_VAL)) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(214, 168, 79, 0.22)';
  ctx.fill();
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Data points
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = Math.max(0, (values[i] - MIN_VAL) / (MAX_VAL - MIN_VAL)) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Labels: attribute name only (no numeric value)
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const labelR = maxR + 24;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);

    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#eaeaea';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly);
  }
}

// ─── Special attribute configuration ─────────────────────────────────────────

// Stat bar range for standard attributes (PES stats go from 40 to 99)
const STAT_MIN = 40;
const STAT_MAX = 99;

// Attributes that use special ranges and should NOT use standard 40-99 bars
const SPECIAL_ATTRS = {
  'Weak Foot Usage':   { max: 4 },
  'Weak Foot Acc.':    { max: 4 },
  'Form':              { max: 8 },
  'Injury Resistance': { max: 3 },
};

// ─── Rendering helpers ────────────────────────────────────────────────────────

function renderStatRow(label, value, col) {
  const v = parseInt(value, 10) || 0;
  // Special attributes: render as bar scaled to their own range
  if (col && SPECIAL_ATTRS[col]) {
    const { max } = SPECIAL_ATTRS[col];
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    const barColor = v >= max * 0.75 ? '#a8ff00' : v >= max * 0.5 ? '#e59f01' : '#d33d35';
    const textColor = statTextColor(barColor);
    return `<div class="stat-row">
      <span class="stat-name">${label}</span>
      <span class="stat-value" style="background:${barColor};color:${textColor}">${v}</span>
      <div class="stat-bar-container">
        <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
    </div>`;
  }
  // Normal stat: scale bar from STAT_MIN to STAT_MAX
  const barColor = statColor(value);
  const textColor = statTextColor(barColor);
  const pct = Math.max(0, Math.min(100, ((v - STAT_MIN) / (STAT_MAX - STAT_MIN)) * 100));
  return `<div class="stat-row">
    <span class="stat-name">${label}</span>
    <span class="stat-value" style="background:${barColor};color:${textColor}">${value || '–'}</span>
    <div class="stat-bar-container">
      <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
    </div>
  </div>`;
}

function renderPositionGrid(player) {
  const cells = POSITION_RATING_COLS.map(pos => {
    const val = parseInt(player[pos], 10);
    let profDisplay, profClass;
    if (isNaN(val)) {
      profDisplay = '–';
      profClass = '';
    } else if (val === 0) {
      profDisplay = 'C';
      profClass = 'pos-prof-c';
    } else if (val === 1) {
      profDisplay = 'B';
      profClass = 'pos-prof-b';
    } else {
      profDisplay = 'A';
      profClass = 'pos-prof-a';
    }
    return `<div class="pos-rating-cell">
      <div class="pos-rating-label">${translatePosition(pos)}</div>
      <div class="pos-rating-value ${profClass}">${profDisplay}</div>
    </div>`;
  }).join('');
  return `<div class="pos-rating-grid">${cells}</div>`;
}

function renderHabilidades(player) {
  const rows = STAT_COLUMNS_ORDERED
    .filter(col => player[col] !== undefined && player[col] !== '')
    .map(col => renderStatRow(translateStat(col), player[col], col))
    .join('');
  return `<div class="player-section">
    <div class="player-section-title">${t('player.abilities')}</div>
    <div class="stats-list">${rows}</div>
  </div>`;
}

function renderEstiloDeJuego(player) {
  const val = player['PlayingStyle'] || '';
  const styleName = playingStyleLabel(val) || (val ? `${t('filters.playingStyle')} ${val}` : '-');
  const isEmpty = !val || val === '0' || val === '18' || styleName === '-';
  return `<div class="player-section">
    <div class="player-section-title">${t('player.roles')}</div>
    <div class="skill-items-list">
      <div class="skill-item-row${isEmpty ? ' skill-item-empty' : ''}">${isEmpty ? '-' : styleName}</div>
    </div>
  </div>`;
}

function renderHabilidadesJugador(player) {
  const active = PLAYER_SKILLS.filter(s => player[s.col] === 'True');
  const content = active.length
    ? `<div class="skill-items-list">${active.map(s => `<div class="skill-item-row">${pairLabel('playerSkills', s.col, s.label)}</div>`).join('')}</div>`
    : `<div class="skill-items-list"><div class="skill-item-row skill-item-empty">-</div></div>`;
  return `<div class="player-section">
    <div class="player-section-title">${t('player.playerSkills')}</div>
    ${content}
  </div>`;
}

function renderEstilosJuegoCOM(player) {
  const active = COM_PLAYING_STYLES.filter(s => player[s.col] === 'True');
  const content = active.length
    ? `<div class="skill-items-list">${active.map(s => `<div class="skill-item-row">${pairLabel('comStyles', s.col, s.label)}</div>`).join('')}</div>`
    : `<div class="skill-items-list"><div class="skill-item-row skill-item-empty">-</div></div>`;
  return `<div class="player-section">
    <div class="player-section-title">${t('player.comStyles')}</div>
    ${content}
  </div>`;
}

function appearanceImagePath(imageKey, value) {
  if (imageKey === 'boots')  return `img/boots/${value}.webp`;
  if (imageKey === 'gloves') return `img/gloves/${String(value).padStart(3, '0')}.webp`;
  return `img/appearance/${imageKey}/${value}.webp`;
}

function appearanceSectionTitle(title) {
  return title ? i18nLookup('appearanceSections', title, title) : '';
}

function appearanceFieldLabel(field) {
  return i18nLookup('appearanceFields', field.col, field.label || field.col);
}

function appearanceEnumLabel(value) {
  return i18nLookup('appearanceEnums', value, value);
}

function renderAppearanceField(field, appearance, player) {
  const source = field.source === 'player' ? player : appearance;
  const rawVal = source ? (source[field.col] !== undefined ? source[field.col] : '') : '';
  const fieldLabel = appearanceFieldLabel(field);

  // Conditional dash: show '-' when a dependency column matches a specific value
  if (field.conditionalDash) {
    const depVal = appearance ? (appearance[field.conditionalDash.col] || '') : '';
    if (depVal === field.conditionalDash.value) {
      return renderAppearanceRow(fieldLabel, '-', null, null);
    }
  }

  // gkOnly: show '-' if player is not a GK (POS index 0 = GK)
  if (field.gkOnly) {
    const posIdx = parseInt(player ? (player['POS'] || '') : '', 10);
    if (isNaN(posIdx) || posIdx !== 0) {
      return renderAppearanceRow(fieldLabel, '-', null, null);
    }
  }

  // notApplicableWhen: show '*' when a dependency column matches a specific value
  if (field.notApplicableWhen) {
    const depVal = appearance ? (appearance[field.notApplicableWhen.col] || '') : '';
    if (depVal === field.notApplicableWhen.value) {
      return renderAppearanceRow(fieldLabel, '*', null, null);
    }
  }

  // conditionalLabel: show a specific label when rawVal matches the given value (takes priority over imageKey)
  if (field.conditionalLabel && rawVal === field.conditionalLabel.value) {
    return renderAppearanceRow(fieldLabel, appearanceEnumLabel(field.conditionalLabel.label), null, null);
  }

  // zeroLabel: show a custom label (e.g. "No") when value is '0'
  if (field.zeroLabel !== undefined && rawVal === '0') {
    return renderAppearanceRow(fieldLabel, appearanceEnumLabel(field.zeroLabel), null, null);
  }

  // dashIfZero: show '-' if value is '0'
  if (field.dashIfZero && rawVal === '0') {
    return renderAppearanceRow(fieldLabel, '-', null, null);
  }

  const displayVal = rawVal !== undefined && rawVal !== '' ? rawVal : '-';

  // Enum translation
  if (field.enum) {
    const translated = field.enum[rawVal];
    const label = translated !== undefined ? appearanceEnumLabel(translated) : displayVal;
    return renderAppearanceRow(fieldLabel, label, null, null);
  }

  // imageKey with bootDisplay: show equipment image using ID, display 2-digit PES number
  if (field.imageKey && field.bootDisplay && rawVal) {
    const imgPath = appearanceImagePath(field.imageKey, rawVal);
    const info = getEquipmentData(field.imageKey, rawVal);
    let displayText;
    if (info) {
      displayText = String(info.pesNumber).padStart(2, '0');
    } else {
      displayText = rawVal;
    }
    return renderAppearanceRow(fieldLabel, displayText, imgPath, field.imageKey);
  }

  // imageKey: always show image for the field when value is present
  if (field.imageKey && rawVal) {
    const imgPath = appearanceImagePath(field.imageKey, rawVal);
    return renderAppearanceRow(fieldLabel, rawVal, imgPath, field.imageKey);
  }

  // showImageIf: show image only when value is non-zero and non-empty (e.g. Side/Back - Cropped)
  if (field.showImageIf && rawVal && rawVal !== '0') {
    const imgPath = appearanceImagePath(field.imageKey, rawVal);
    return renderAppearanceRow(fieldLabel, rawVal, imgPath, field.imageKey);
  }

  const numVal = Number(displayVal);
  const isNumeric = !isNaN(numVal) && displayVal !== '' && displayVal !== '-';
  let formattedVal;
  if (isNumeric && !field.noPlus) {
    formattedVal = numVal >= 0 ? '+' + numVal : String(numVal);
  } else {
    formattedVal = displayVal;
  }
  return renderAppearanceRow(fieldLabel, formattedVal, null, null);
}

function renderAppearanceRow(label, value, imgPath, imageKey) {
  let valueHtml;
  if (imgPath) {
    const fallback = `img/appearance/placeholder.webp`;
    valueHtml = `<span class="face-data-value face-data-with-img">
      <img class="appearance-thumb" src="${imgPath}"
        onerror="this.onerror=null;this.src='${fallback}'"
        alt="${imageKey || ''}" title="${value}">
      <span class="appearance-thumb-val">${value}</span>
    </span>`;
  } else {
    const VALUE_EXTRA_CLASS = { '-': ' face-data-dash', '*': ' face-data-na' };
    const extraClass = VALUE_EXTRA_CLASS[value] || '';
    valueHtml = `<span class="face-data-value${extraClass}">${value}</span>`;
  }
  return `<div class="face-data-row">
    <span class="face-data-label">${escapeHtml(label)}</span>
    ${valueHtml}
  </div>`;
}

function renderFaceData(appearance, player, baseCopyPlayerName, isScanned) {
  if (!appearance && !player) {
    return `<div class="appearance-empty">${t('player.noAppearance')}</div>`;
  }

  // Check if the player has a scanned face (Id_Face ≠ 0)
  const idFace = appearance ? (appearance['Id_Face'] || '0') : '0';
  const hasScannedFace = idFace !== '0';

  // Determine which sections to show:
  // - Scanned player (in-game scan) or player using another's face: skip Cara and Peinado
  // - Normal player: show all sections
  const sectionsToShow = (isScanned || hasScannedFace)
    ? APPEARANCE_SECTIONS.slice(2)
    : APPEARANCE_SECTIONS;

  // Build notice HTML
  let noticeHtml = '';
  if (isScanned) {
    noticeHtml = `<div class="scanned-face-notice">
        <span class="scanned-face-icon">i</span>
        ${t('player.scanned')}
      </div>`;
  } else if (hasScannedFace) {
    noticeHtml = `<div class="scanned-face-notice">
        <span class="scanned-face-icon">i</span>
        ${baseCopyPlayerName
          ? t('player.usesBaseFace', { name: escapeHtml(baseCopyPlayerName) })
          : t('player.usesBaseFaceUnknown')}
      </div>`;
  }

  const navButtons = sectionsToShow.map((section, i) =>
    `<button class="appearance-section-btn${i === 0 ? ' active' : ''}" onclick="switchAppearanceSection(${i})">${appearanceSectionTitle(section.title)}</button>`
  ).join('');

  const sectionsHtml = sectionsToShow.map((section, i) => {
    const subsectionsHtml = section.subsections.map(sub => {
      const fieldsHtml = sub.fields
        .map(field => renderAppearanceField(field, appearance, player))
        .join('');
      if (!fieldsHtml) return '';
      const subTitle = sub.title
        ? `<div class="face-subsection-title">${appearanceSectionTitle(sub.title)}</div>`
        : '';
      return `<div class="face-subsection">${subTitle}<div class="face-data-grid">${fieldsHtml}</div></div>`;
    }).join('');

    if (!subsectionsHtml) return '';
    return `<div class="face-section${i === 0 ? ' active' : ''}" id="appearance-section-${i}">
      ${subsectionsHtml}
    </div>`;
  }).join('');

  return `${noticeHtml}
<div class="appearance-section-nav">${navButtons}</div>
<div class="appearance-section-panels">${sectionsHtml}</div>`;
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function switchAppearanceSection(idx) {
  document.querySelectorAll('.appearance-section-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('.face-section').forEach((panel, i) => {
    panel.classList.toggle('active', i === idx);
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.profile-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.profile-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

function selectPlayerPosition(pos) {
  if (!pos) return;
  document.querySelectorAll('.position-cell').forEach(cell => {
    cell.classList.toggle('is-selected', cell.dataset.position === pos);
  });
}

function setPositionViewMode(mode) {
  const nextMode = mode === 'letters' ? 'letters' : 'colors';
  const section = document.querySelector('.position-map-section');
  if (!section) return;
  section.dataset.viewMode = nextMode;
  try {
    localStorage.setItem('positionViewMode', nextMode);
  } catch {}
  document.querySelectorAll('.position-view-toggle').forEach(btn => {
    const active = btn.dataset.mode === nextMode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function getPositionViewMode() {
  try {
    return localStorage.getItem('positionViewMode') === 'letters' ? 'letters' : 'colors';
  } catch {
    return 'colors';
  }
}

// ─── Main render ─────────────────────────────────────────────────────────────

function renderPositionPitchLegacy(player) {
  const rawPos = player['POS'] || '';
  const posIdx = parseInt(rawPos, 10);
  const primaryPos = /^\d+$/.test(rawPos) && posIdx >= 0 && posIdx < PES_POSITIONS.length
    ? PES_POSITIONS[posIdx] : rawPos;

  const markers = [];

  PES_POSITIONS.forEach(pos => {
    const coords = POSITION_FIELD_COORDS[pos];
    if (!coords) return;

    const val = parseInt(player[pos], 10);
    const color = positionGroupColor(pos);
    const isPrimary = pos === primaryPos;

    let bgStyle, borderStyle, textColor, zIdx;

    if (isNaN(val)) {
      // No rating data – show very faintly
      bgStyle = 'background:rgba(0,0,0,0.25)';
      borderStyle = `border-color:rgba(255,255,255,0.12)`;
      textColor = 'rgba(255,255,255,0.25)';
      zIdx = 1;
    } else if (val === 0) {
      // Grade C – transparent fill, visible border and text
      bgStyle = 'background:transparent';
      borderStyle = `border-color:${color}`;
      textColor = color;
      zIdx = 3;
    } else if (val === 1) {
      // Grade B – medium opacity fill
      bgStyle = `background:${hexToRgba(color, 0.40)}`;
      borderStyle = `border-color:${color}`;
      textColor = color;
      zIdx = 4;
    } else {
      // Grade A – fully filled
      bgStyle = `background:${color}`;
      borderStyle = `border-color:${color}`;
      textColor = '#111';
      zIdx = 5;
    }

    if (isPrimary && !isNaN(val)) zIdx = 10;

    markers.push(`
      <div class="field-pos-marker" style="${bgStyle};${borderStyle};color:${textColor};z-index:${zIdx}${isPrimary && !isNaN(val) ? ';box-shadow:0 0 6px rgba(0,0,0,0.5)' : ''};left:${coords.left}%;top:${coords.top}%">
        <span class="field-pos-label">${pos}</span>
      </div>`);
  });

  if (!markers.length) return '';

  return `
    <div class="player-section" style="margin-bottom:0">
      <div class="player-section-title">Posiciones en el campo</div>
      <div class="position-field-wrap">
        <div class="position-field">
          <div class="position-field-line pf-halfway"></div>
          <div class="position-field-line pf-penalty-bottom"></div>
          <div class="position-field-line pf-goal-bottom"></div>
          <div class="position-field-line pf-penalty-top"></div>
          <div class="position-field-line pf-goal-top"></div>
          <div class="position-field-center-circle"></div>
          ${markers.join('')}
        </div>
      </div>
    </div>`;
}

function getPositionGrade(value, isPrimary = false) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'A' || raw === '3' || raw === '2') return 'A';
  if (raw === 'B' || raw === '1') return 'B';
  if (raw === 'C' || raw === '0') return isPrimary ? 'A' : 'C';
  return null;
}

function getPositionValueClass(grade) {
  if (grade === 'A') return 'value-a';
  if (grade === 'B') return 'value-b';
  if (grade === 'C') return 'value-c';
  return '';
}

function getPositionCategoryClass(category) {
  return `position-${category || 'unknown'}`;
}

function getPositionCellState(grade, isPrimary) {
  if (isPrimary) return 'is-primary';
  if (grade === 'A') return 'is-strong';
  if (grade === 'B') return 'is-medium';
  if (grade === 'C') return 'is-low';
  return 'is-disabled';
}

function renderPositionPitch(player) {
  const rawPos = player['POS'] || '';
  const posIdx = parseInt(rawPos, 10);
  const primaryPos = /^\d+$/.test(rawPos) && posIdx >= 0 && posIdx < PES_POSITIONS.length
    ? PES_POSITIONS[posIdx] : rawPos;

  const positions = POSITION_DISPLAY.map(item => ({
    ...item,
    abbr: translatePosition(item.pos),
    grade: getPositionGrade(player[item.pos], item.pos === primaryPos),
  }));
  const selectedPos = (positions.find(item => item.pos === primaryPos) || positions.find(item => item.grade) || positions[0]).pos;
  const viewMode = getPositionViewMode();

  const cells = positions.map(item => {
    const layout = POSITION_GRID_LAYOUT[item.pos];
    if (!layout) return '';
    const isPrimary = item.pos === primaryPos;
    const state = getPositionCellState(item.grade, isPrimary);
    const color = positionGroupColor(item.pos);
    return `
      <button class="position-cell ${getPositionCategoryClass(item.category)} ${state}${item.pos === selectedPos ? ' is-selected' : ''}"
        type="button"
        data-position="${item.pos}"
        style="--position-color:${color};grid-column:${layout.col};grid-row:${layout.row};"
        title="${item.abbr} - ${item.name}: ${item.grade}"
        aria-label="${item.abbr} ${item.name} ${item.grade}"
        onclick="selectPlayerPosition('${item.pos}')">
        <span class="position-code">${item.abbr}</span>
        ${item.grade ? `<span class="position-grade">${item.grade}</span>` : ''}
      </button>`;
  }).join('');

  return `
    <div class="player-section position-map-section" data-view-mode="${viewMode}" style="margin-bottom:0">
      <div class="position-map-header">
        <div class="player-section-title">${t('player.suitablePositions')}</div>
        <div class="position-view-switch" aria-label="${t('player.positionView')}">
          <button class="position-view-toggle${viewMode === 'colors' ? ' is-active' : ''}" type="button" data-mode="colors" aria-pressed="${viewMode === 'colors' ? 'true' : 'false'}" onclick="setPositionViewMode('colors')">${t('player.colors')}</button>
          <button class="position-view-toggle${viewMode === 'letters' ? ' is-active' : ''}" type="button" data-mode="letters" aria-pressed="${viewMode === 'letters' ? 'true' : 'false'}" onclick="setPositionViewMode('letters')">${t('player.letters')}</button>
        </div>
      </div>
      <div class="positions-map" aria-label="${t('player.positionMap')}">
        <div class="positions-grid">
          ${cells}
        </div>
      </div>
    </div>`;
}

function getPesPosition(player) {
  const rawPos = player['POS'] || '';
  const posIdx = parseInt(rawPos, 10);
  return /^\d+$/.test(rawPos) && posIdx >= 0 && posIdx < PES_POSITIONS.length
    ? PES_POSITIONS[posIdx]
    : rawPos;
}

function playerStatValue(player, key) {
  const value = parseInt(player[key], 10);
  return Number.isFinite(value) ? value : 0;
}

function topPlayerStrengths(player, limit = 4) {
  const candidates = [
    ['Speed', 'velocidad'], ['Explosive Power', 'aceleracion'], ['Finishing', 'definicion'],
    ['Attacking Prowess', 'movimientos ofensivos'], ['Ball Control', 'control de balon'],
    ['Dribbling', 'drible'], ['Low Pass', 'pase corto'], ['Lofted Pass', 'pase largo'],
    ['Kicking Power', 'potencia de tiro'], ['Header', 'juego aereo'], ['Defensive Prowess', 'lectura defensiva'],
    ['Ball Winning', 'recuperacion'], ['Physical Contact', 'contacto fisico'], ['Jump', 'salto'],
    ['Stamina', 'resistencia'], ['Goalkeeping', 'capacidad de portero'], ['Reflexes', 'reflejos'],
    ['Coverage', 'cobertura'],
  ];
  return candidates
    .map(([key, label]) => ({ key, label, value: playerStatValue(player, key) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function tacticalProfileText(player, pesPosition, team) {
  const strengths = topPlayerStrengths(player, 5);
  const names = strengths.map(item => item.label);
  const ovr = player['OverallStats'] || '';
  const age = player['Age'] || '';
  const style = playingStyleLabel(player['PlayingStyle'] || '');
  const pos = translatePosition(pesPosition);
  const teamName = team && team.displayName ? team.displayName : 'su equipo';

  const has = key => playerStatValue(player, key);
  const phrasePool = {
    GK: [
      `${player['Name']} es un arquero de perfil ${has('Reflexes') >= 80 ? 'reactivo' : 'ordenado'}, util para sostener partidos donde el rival llega con remates claros.`,
      `Como ${pos}, su valor dentro de ${teamName} aparece sobre todo en ${names.slice(0, 3).join(', ') || 'atributos de porteria'}.`,
    ],
    DEF: [
      `${player['Name']} es un defensor ${has('Physical Contact') >= 80 ? 'fuerte en el cuerpo a cuerpo' : 'de perfil tactico'} que puede aportar equilibrio cuando el equipo necesita cerrar espacios.`,
      `Su ficha destaca por ${names.slice(0, 3).join(', ') || 'atributos defensivos'}, rasgos importantes para sostener la linea de fondo de ${teamName}.`,
    ],
    MID: [
      `${player['Name']} es un mediocampista ${has('Low Pass') >= 80 ? 'asociativo y preciso' : 'funcional para conectar lineas'} dentro de la base de datos de PES 2018.`,
      `En ${teamName}, su utilidad pasa por ${names.slice(0, 3).join(', ') || 'equilibrio con pelota y sin pelota'}, especialmente si se lo usa cerca de su posicion natural.`,
    ],
    FWD: [
      `${player['Name']} es un atacante ${has('Speed') >= 82 ? 'profundo y peligroso al espacio' : 'de movimientos ofensivos utiles'} para esquemas que buscan dañar en los ultimos metros.`,
      `Su perfil combina ${names.slice(0, 3).join(', ') || 'recursos ofensivos'}, por lo que puede funcionar como referencia o alternativa segun el plan de partido de ${teamName}.`,
    ],
    UNK: [
      `${player['Name']} tiene un perfil versatil dentro de PES 2018, con atributos que conviene revisar antes de cambiarlo de posicion.`,
      `Sus puntos fuertes principales son ${names.slice(0, 3).join(', ') || 'sus atributos generales'}.`,
    ],
  };

  const family = positionFamily(pesPosition);
  const base = phrasePool[family] || phrasePool.UNK;
  const context = [];
  if (ovr) context.push(`Con media ${ovr}, se ubica como una opcion ${parseInt(ovr, 10) >= 80 ? 'de alto impacto' : 'interesante'} para su rol.`);
  if (age) context.push(`${parseInt(age, 10) <= 23 ? 'Por edad, tambien puede leerse como una pieza de proyeccion.' : 'Por edad, encaja mejor como pieza de rendimiento inmediato.'}`);
  if (style && style !== player['PlayingStyle']) context.push(`Su estilo de juego registrado es ${style}, un dato clave para compararlo con jugadores similares.`);
  return [...base, ...context].join(' ');
}

function renderPlayerEditorial(player, team, pesPosition, similarPlayers) {
  const strengths = topPlayerStrengths(player, 5);
  const family = positionFamily(pesPosition);
  const scoutingLink = typeof laqpPageUrl === 'function' ? laqpPageUrl('rankings.html') : 'rankings.html';
  const similarNames = (similarPlayers || []).slice(0, 3).map(item => item.player && item.player.Name).filter(Boolean);

  return `
    <section class="player-section player-editorial-section">
      <div class="player-section-title">Analisis del jugador</div>
      <p>${escapeHtml(tacticalProfileText(player, pesPosition, team))}</p>
      ${strengths.length ? `
        <div class="player-strength-tags">
          ${strengths.map(item => `<span>${escapeHtml(item.label)} <strong>${item.value}</strong></span>`).join('')}
        </div>` : ''}
      <div class="player-context-links">
        <a href="${scoutingLink}">Abrir Scouting</a>
        <a href="${typeof laqpArticleUrl === 'function' ? laqpArticleUrl('sistema-medias-pes-2018', 'Como interpretar medias') : 'articulo.html?id=sistema-medias-pes-2018'}">Como interpretar medias</a>
        <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html'}">Explorar mas jugadores</a>
      </div>
      ${similarNames.length ? `<p class="player-editorial-note">Perfiles cercanos en la base: ${escapeHtml(similarNames.join(', '))}. Abrir esas fichas ayuda a comparar alternativas por media, posicion y fortalezas.</p>` : ''}
    </section>`;
}

function positionFamily(pos) {
  if (pos === 'GK') return 'GK';
  if (isDefensivePosition(pos)) return 'DEF';
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(pos)) return 'MID';
  if (['LWF', 'RWF', 'SS', 'CF'].includes(pos)) return 'FWD';
  return 'UNK';
}

const SIMILARITY_PROFILE_STATS = {
  GK: [
    ['Goalkeeping', 1.8], ['Catching', 1.7], ['Clearing', 1.5], ['Reflexes', 1.8], ['Coverage', 1.6],
    ['Jump', 0.8], ['OverallStats', 0.7],
  ],
  CB: [
    ['Defensive Prowess', 1.8], ['Ball Winning', 1.7], ['Physical Contact', 1.5], ['Jump', 1.2], ['Header', 1.2],
    ['Speed', 0.7], ['OverallStats', 0.7],
  ],
  FB: [
    ['Speed', 1.5], ['Stamina', 1.5], ['Defensive Prowess', 1.2], ['Ball Winning', 1.2], ['Low Pass', 1.0],
    ['Lofted Pass', 1.0], ['Dribbling', 0.9], ['OverallStats', 0.7],
  ],
  DMCM: [
    ['Low Pass', 1.5], ['Ball Control', 1.3], ['Defensive Prowess', 1.2], ['Ball Winning', 1.2],
    ['Physical Contact', 1.0], ['Stamina', 1.1], ['OverallStats', 0.7],
  ],
  AMW: [
    ['Ball Control', 1.5], ['Dribbling', 1.5], ['Body Control', 1.1], ['Low Pass', 1.1],
    ['Speed', 1.2], ['Explosive Power', 1.2], ['Finishing', 0.9], ['OverallStats', 0.7],
  ],
  ST: [
    ['Finishing', 1.8], ['Attacking Prowess', 1.6], ['Kicking Power', 1.2], ['Speed', 1.0],
    ['Physical Contact', 1.0], ['Header', 0.9], ['OverallStats', 0.8],
  ],
};

function similarityProfile(pos) {
  if (pos === 'GK') return 'GK';
  if (pos === 'CB') return 'CB';
  if (pos === 'LB' || pos === 'RB') return 'FB';
  if (pos === 'DMF' || pos === 'CMF') return 'DMCM';
  if (['AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS'].includes(pos)) return 'AMW';
  if (pos === 'CF') return 'ST';
  return 'DMCM';
}

function weightedStatDistance(a, b, profile) {
  const stats = SIMILARITY_PROFILE_STATS[profile] || SIMILARITY_PROFILE_STATS.DMCM;
  let sum = 0;
  let weightSum = 0;
  stats.forEach(([col, weight]) => {
    const va = parseFloat(a[col]);
    const vb = parseFloat(b[col]);
    if (isNaN(va) || isNaN(vb)) return;
    const diff = (va - vb) / 99;
    sum += diff * diff * weight;
    weightSum += weight;
  });
  if (!weightSum) return null;
  return 1 - Math.sqrt(sum / weightSum);
}

function positionCompatibility(currentPos, candidatePos) {
  if (currentPos === candidatePos) return 0.1;
  if (similarityProfile(currentPos) === similarityProfile(candidatePos)) return 0.06;
  if (positionFamily(currentPos) === positionFamily(candidatePos)) return 0.03;
  return -0.14;
}

function playerSkillSet(player) {
  return new Set(PLAYER_SKILLS.filter(skill => player[skill.col] === 'True').map(skill => skill.col));
}

function sharedSkillScore(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach(skill => { if (b.has(skill)) shared++; });
  return Math.min(0.04, shared * 0.008);
}

function findSimilarPlayers(currentPlayer, currentTeamId, playerRows, teamRows, squadRows, correctedMap, validTeamIds) {
  const currentPos = getPesPosition(currentPlayer);
  const profile = similarityProfile(currentPos);

  const teamMap = {};
  teamRows.forEach(row => {
    if (!row['Id'] || !String(row['Name'] || '').trim() || row['Name'] === '-') return;
    if (validTeamIds && !validTeamIds.has(row['Id'])) return;
    teamMap[row['Id']] = {
      id: row['Id'],
      rawName: row['Name'],
      displayName: toTitleCaseName(row['Name']),
      type: row['Type'] || '0',
    };
  });

  const playerMap = {};
  playerRows.forEach(row => {
    if (row['Id']) playerMap[row['Id']] = row;
  });

  const byPlayerId = new Map();
  squadRows.forEach(squad => {
    if (validTeamIds && !validTeamIds.has(squad['Id'])) return;
    const team = teamMap[squad['Id']];
    if (!team) return;
    for (let i = 1; i <= 32; i++) {
      const playerId = squad[`Player ${i}`];
      if (!playerId || playerId === '0' || playerId === currentPlayer['Id']) continue;
      const player = playerMap[playerId];
      if (!player) continue;
      const candidate = { ...player };
      const correctedOvr = correctedOverallFor(candidate, team.id, correctedMap);
      if (correctedOvr) candidate['OverallStats'] = correctedOvr;

      const previous = byPlayerId.get(playerId);
      if (!previous || (previous.team.type === '2' && team.type !== '2')) {
        byPlayerId.set(playerId, { player: candidate, team });
      }
    }
  });

  const currentSkills = playerSkillSet(currentPlayer);

  return Array.from(byPlayerId.values()).map(entry => {
    const base = weightedStatDistance(currentPlayer, entry.player, profile);
    if (base === null) return null;

    const pos = getPesPosition(entry.player);
    let score = base + positionCompatibility(currentPos, pos);
    if ((currentPlayer['PlayingStyle'] || '') && currentPlayer['PlayingStyle'] === entry.player['PlayingStyle']) score += 0.04;
    score += sharedSkillScore(currentSkills, playerSkillSet(entry.player));

    return {
      ...entry,
      pos,
      score,
    };
  })
    .filter(Boolean)
    .filter(item => positionFamily(item.pos) === positionFamily(currentPos) || item.score >= 0.9)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function renderSimilarPlayers(similarPlayers) {
  if (!similarPlayers || !similarPlayers.length) {
    return `
      <section class="player-section similar-players-section">
        <div class="player-section-title">${t('player.similar')}</div>
        <p class="similar-players-empty">${t('player.noSimilar')}</p>
      </section>`;
  }

  return `
    <section class="player-section similar-players-section">
      <div class="player-section-title">${t('player.similar')}</div>
      <div class="similar-players-grid">
        ${similarPlayers.map(({ player, team, pos }) => {
          const ovr = player['OverallStats'] || '-';
          const ovrColor = statColor(ovr);
          const posStyle = positionBadgeStyle(pos);
          return `
            <article class="similar-player-card">
              <div class="similar-player-main">
                <img class="similar-player-photo"
                  src="img/players/${player['Id']}.webp"
                  onerror="handleMinifaceError(this,'${player['Id']}')"
                  alt="${escapeHtml(player['Name'] || '')}">
                <div>
                  <div class="similar-player-name">${escapeHtml(player['Name'] || t('player.unknown'))}</div>
                  <div class="similar-player-team">${escapeHtml(team.displayName || '')}</div>
                </div>
              </div>
              <div class="similar-player-meta">
                <span class="similar-player-position" style="${posStyle}">${escapeHtml(translatePosition(pos))}</span>
                <span style="background:${ovrColor};color:${statTextColor(ovrColor)}">${escapeHtml(ovr)}</span>
              </div>
              <a class="similar-player-link" href="${typeof laqpPlayerUrl === 'function' ? laqpPlayerUrl(player['Id'], team.id, player['Name']) : `player.html?id=${encodeURIComponent(player['Id'])}&team=${encodeURIComponent(team.id)}`}">${t('player.openCard')}</a>
            </article>`;
        }).join('')}
      </div>
    </section>`;
}

function renderPlayerPage(player, team, appearance, typeLabel, playsForNational, baseCopyPlayerName, minifacePlayerName, isScanned, dorsal, similarPlayers = []) {
  const ovrColor = statColor(player['OverallStats'] || '');
  const ovr = player['OverallStats'] || '–';

  const rawPos = player['POS'] || '';
  const posIdx = parseInt(rawPos, 10);
  const pesPosition = /^\d+$/.test(rawPos) && posIdx >= 0 && posIdx < PES_POSITIONS.length
    ? PES_POSITIONS[posIdx]
    : rawPos;
  const posDisplay = translatePosition(pesPosition);

  const radarAttrs = computeRadarAttributes(player);

  const footVal = player['Foot'];
  let footDisplay;
  if (footVal === 'True') footDisplay = t('filters.left');
  else if (footVal === 'False') footDisplay = t('filters.right');
  else footDisplay = footVal || '–';

  // Position pitch rendered in header (removed from stats tab)
  const positionPitchHtml = renderPositionPitch(player);

  const dorsalHtml = dorsal
    ? `<span class="player-info-card-dorsal">#${dorsal}</span>`
    : '';

  const statsHtml = `
    <div class="stats-compact-layout">
      <div class="stats-compact-left">
        ${renderHabilidades(player)}
      </div>
      <div class="stats-compact-right">
        ${renderEstiloDeJuego(player)}
        ${renderHabilidadesJugador(player)}
        ${renderEstilosJuegoCOM(player)}
      </div>
    </div>`;

  const appearanceHtml = renderFaceData(appearance, player, baseCopyPlayerName, isScanned);

  const content = document.getElementById('player-content');

  // Favorites button state for this player
  const favActive = (typeof isFavorite === 'function') && isFavorite(player['Id'], team.id);
  const favBtnHtml = (typeof isFavorite === 'function')
    ? `<button id="profile-fav-btn" class="profile-fav-btn${favActive ? ' is-fav' : ''}"
         onclick="toggleProfileFavorite('${player['Id']}','${team.id}')"
         title="${favActive ? t('favorites.remove') : t('favorites.add')}">
         ${favActive ? `★ ${t('favorites.in')}` : `☆ ${t('favorites.add')}`}
       </button>`
    : '';

  content.innerHTML = `
    <div class="breadcrumb-row"><nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('index.html') : 'index.html'}">${t('common.home')}</a>
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html'}">${t('common.database')}</a>
      <a href="${typeof laqpTeamUrl === 'function' ? laqpTeamUrl(team.id, team.displayName) : `team.html?id=${team.id}`}">${team.displayName}</a>
      <span>${player['Name'] || t('player.unknown')}</span>
    </nav></div>
    <button class="back-btn" onclick="goBack()">◀ ${t('common.back')}</button>

    <div class="player-profile-page">

      <!-- Header: three cards side by side -->
      <div class="player-profile-header">

        <!-- Column 1: Player info card -->
        <div class="player-header-info-col">
          <div class="player-header-card player-info-card">
            <div class="player-info-card-top" style="background:linear-gradient(135deg,${ovrColor}33 0%,${ovrColor}11 100%)">
              <div class="player-info-card-ovr-block">
                <span class="player-info-card-ovr" style="color:${ovrColor}">${ovr}</span>
                <span class="player-info-card-pos" style="color:${positionGroupColor(pesPosition)}">${posDisplay || '–'}</span>
              </div>
              <div class="player-info-card-badge-col">
                <img class="player-info-card-flag"
                  src="${flagSrc(player['Country'])}"
                  onerror="this.onerror=null;this.src='img/flags/default.webp'" alt="">
                <img class="player-info-card-crest"
                  src="img/teams/${team.id}.webp"
                  onerror="this.onerror=null;this.src='img/teams/default.webp'"
                  alt="${team.displayName}">
                ${dorsalHtml}
              </div>
            </div>
            <div class="player-info-card-photo-wrap">
              <img class="player-info-card-photo"
                src="img/players/${player['Id']}.webp"
                onerror="handleMinifaceError(this,'${player['Id']}')"
                alt="${player['Name'] || ''}">
            </div>
            <div class="player-info-card-body">
              <div class="player-info-card-name" title="${player['Name'] || ''}">${player['Name'] || t('player.unknown')}</div>
              ${typeLabel ? `<div class="player-info-card-type">${typeLabel}</div>` : ''}
              ${playsForNational ? `<div class="national-team-note">${t('player.alsoNational')}</div>` : ''}
              ${minifacePlayerName ? `<div class="profile-miniface-note">${t('player.miniface', { name: minifacePlayerName })}</div>` : ''}
              <div class="player-card-stats player-info-card-stats">
                <div class="pcs"><span class="pcs-val">${player['Age'] || '–'}</span><span class="pcs-key">${t('common.age')}</span></div>
                <div class="pcs"><span class="pcs-val">${player['Height'] || '–'} cm</span><span class="pcs-key">${t('common.heightShort')}</span></div>
                <div class="pcs"><span class="pcs-val">${player['Weight'] || '–'} kg</span><span class="pcs-key">${t('common.weight')}</span></div>
                <div class="pcs"><span class="pcs-val">${footDisplay}</span><span class="pcs-key">${t('common.foot')}</span></div>
              </div>
              ${favBtnHtml}
            </div>
          </div>
        </div>

        <!-- Column 2: Radar chart card -->
        <div class="player-header-card player-radar-card">
          <div class="player-header-card-title">${t('player.stats')}</div>
          <div class="player-header-radar-wrap">
            <canvas id="radar-canvas" width="240" height="240"></canvas>
          </div>
        </div>

        <!-- Column 3: Secondary positions pitch card -->
        <div class="player-header-card player-positions-card">
          ${positionPitchHtml}
        </div>

      </div>

      ${renderPlayerEditorial(player, team, pesPosition, similarPlayers)}

      <!-- Tabs -->
      <div class="profile-tabs">
        <div class="profile-tab-bar">
          <button class="profile-tab-btn active" data-tab="tab-stats" onclick="switchTab('tab-stats')">${t('player.stats')}</button>
          <button class="profile-tab-btn" data-tab="tab-appearance" onclick="switchTab('tab-appearance')">${t('player.appearance')}</button>
        </div>

        <div id="tab-stats" class="profile-tab-panel active">
          ${statsHtml}
        </div>

        <div id="tab-appearance" class="profile-tab-panel">
          <div class="appearance-info">
            ${t('player.appearanceInfo')}
          </div>
          ${appearanceHtml}
        </div>
      </div>

      ${renderSimilarPlayers(similarPlayers)}

    </div>`;

  content.style.display = 'block';
  document.getElementById('loading-overlay').style.display = 'none';

  // Update page title
  document.title = `${player['Name'] || t('player.unknown')} - ${t('common.database')} PES`;
  const playerPath = typeof laqpPlayerUrl === 'function'
    ? laqpPlayerUrl(player['Id'], team.id, player['Name'])
    : `/player.html?id=${encodeURIComponent(player['Id'])}&team=${encodeURIComponent(team.id)}`;
  const playerUrl = typeof laqpAbsoluteUrl === 'function' ? laqpAbsoluteUrl(playerPath) : `https://laqp.website${playerPath}`;
  const playerDescription = `${player['Name'] || 'Jugador'} en PES 2018 actualizado: media ${player['OverallStats'] || '-'}, posicion ${posDisplay || '-'}, equipo ${team.displayName}, stats, apariencia, fortalezas y jugadores similares.`;
  const canonical = document.querySelector('link[rel="canonical"]');
  const metaDescription = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');
  const ogUrl = document.querySelector('meta[property="og:url"]');
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (canonical) canonical.setAttribute('href', playerUrl);
  if (metaDescription) metaDescription.setAttribute('content', playerDescription);
  if (ogTitle) ogTitle.setAttribute('content', `${player['Name'] || t('player.unknown')} PES 2018 - Stats y analisis`);
  if (ogDescription) ogDescription.setAttribute('content', playerDescription);
  if (ogUrl) ogUrl.setAttribute('content', playerUrl);
  if (ogImage) ogImage.setAttribute('content', `https://laqp.website/img/players/${player['Id']}.webp`);
  if (window.location.pathname !== playerPath && typeof history.replaceState === 'function') {
    history.replaceState(null, '', playerPath);
  }

  document.querySelectorAll('script[data-dynamic-schema="player"]').forEach(el => el.remove());
  const schema = document.createElement('script');
  schema.type = 'application/ld+json';
  schema.dataset.dynamicSchema = 'player';
  schema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `${player['Name'] || 'Jugador'} - PES 2018`,
    description: playerDescription,
    url: playerUrl,
    about: {
      '@type': 'Person',
      name: player['Name'] || 'Jugador',
      nationality: nationalityName(player['Country']),
      memberOf: { '@type': 'SportsTeam', name: team.displayName },
    },
  });
  document.head.appendChild(schema);

  requestAnimationFrame(() => drawRadar('radar-canvas', radarAttrs));
}

// ─── Back navigation ─────────────────────────────────────────────────────────

/**
 * Toggles a favorite directly from the player profile page.
 * Updates the button text/style in place.
 * @param {string} playerId
 * @param {string} teamId
 */
function toggleProfileFavorite(playerId, teamId) {
  if (typeof toggleFavorite !== 'function') return;
  const added = toggleFavorite(playerId, teamId);
  const btn = document.getElementById('profile-fav-btn');
  if (btn) {
    btn.textContent = added ? `★ ${t('favorites.in')}` : `☆ ${t('favorites.add')}`;
    btn.classList.toggle('is-fav', added);
    btn.title = added ? t('favorites.remove') : t('favorites.add');
  }
}

function goBack() {
  if (document.referrer && new URL(document.referrer).hostname === window.location.hostname) {
    history.back();
  } else {
    window.location.href = typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html';
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const embeddedPlayerId = document.querySelector('meta[name="laqp-player-id"]')?.content || '';
  const embeddedTeamId = document.querySelector('meta[name="laqp-team-id"]')?.content || '';
  const playerId = embeddedPlayerId || params.get('id');
  const teamId = embeddedTeamId || params.get('team');

  if (!playerId || !teamId) {
    showError(t('errors.noPlayerParams'));
    return;
  }

  // Load all global CSV files in parallel (including optional override files)
  const [playersText, teamsText, squadsText, appearancesText, originalPlayersText, corregidosText, scannedPlayersText, leaguesText] = await Promise.all([
    fetchText('database/All players exported.csv'),
    fetchText('database/All teams exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All appeaarances exported.csv'),
    fetchText('database/players_original.csv'),
    fetchText('database/medias_corregidas.csv'),
    fetchText('database/scanned_players.csv'),
    fetchText('database/All leagues exported.csv'),
  ]);

  if (!playersText || !teamsText) {
    showError(t('errors.databaseLoad'));
    return;
  }

  const { rows: playerRows } = parseCSV(playersText);
  const { rows: teamRows } = parseCSV(teamsText);
  const { rows: appearanceRows } = appearancesText ? parseCSV(appearancesText) : { rows: [] };
  const { rows: squadRows } = squadsText ? parseCSV(squadsText) : { rows: [] };
  const { rows: leagueRows } = leaguesText ? parseCSV(leaguesText) : { rows: [] };
  const validTeamIds = new Set();
  leagueRows.forEach(row => {
    String(row['team_ids'] || '').split(',').map(id => id.trim()).filter(Boolean).forEach(id => validTeamIds.add(id));
  });
  if (!validTeamIds.has(teamId)) {
    showError(t('errors.teamNotPublished'));
    return;
  }

  const teamSquadRow = squadRows.find(r => r['Id'] === teamId);
  const playerIsAssignedToRequestedTeam = !!teamSquadRow && Array.from({ length: 32 }, (_, idx) => teamSquadRow[`Player ${idx + 1}`])
    .some(pid => pid && pid !== '0' && pid === playerId);

  if (!playerIsAssignedToRequestedTeam) {
    showError(t('errors.playerNotPublished'));
    return;
  }

  // Build corrected overall map from medias_corregidas.csv.
  // Keys are plain player IDs because corrected ratings are global per player.
  const corregidosMap = corregidosText ? buildCorrectedOverallMap(parseCSV(corregidosText).rows) : null;

  // Build original players map (id → name) for face ID lookups
  const originalPlayersMap = {};
  if (originalPlayersText) {
    const { rows: origRows } = parseCSV(originalPlayersText);
    origRows.forEach(r => {
      const id = r['Id'] || '';
      const name = r['Name'] || '';
      if (id) originalPlayersMap[id] = name;
    });
  }

  // Build scanned players set
  const scannedPlayerIds = new Set();
  if (scannedPlayersText) {
    const { rows: scannedRows } = parseCSV(scannedPlayersText);
    scannedRows.forEach(r => {
      const id = r['Id'] || '';
      if (id) scannedPlayerIds.add(id);
    });
  }

  // Find the player
  const player = playerRows.find(p => p['Id'] === playerId);
  if (!player) {
    showError(t('errors.playerNotFound', { id: playerId }));
    return;
  }

  // Override overall from medias_corregidas.csv if available for this player ID.
  const corregidosOvr = correctedOverallFor(player, teamId, corregidosMap);
  if (corregidosOvr) {
    player['OverallStats'] = corregidosOvr;
  }

  // Find the team
  const teamRow = teamRows.find(t => t['Id'] === teamId);
  if (!teamRow || !String(teamRow['Name'] || '').trim() || teamRow['Name'] === '-') {
    showError(t('errors.teamNotFound', { id: teamId }));
    return;
  }

  const team = {
    id: teamId,
    rawName: teamRow['Name'] || teamId,
    displayName: toTitleCaseName(teamRow['Name'] || teamId),
    type: teamRow['Type'] || '0',
  };
  const typeLabel = teamTypeLabel(team.type);

  // Build appearance map and find this player's appearance data
  const appearanceMap = {};
  appearanceRows.forEach(a => {
    const pid = a['Id'];
    if (pid) appearanceMap[pid] = a;
  });
  const appearance = appearanceMap[playerId] || null;

  // Miniface: always determined from the player's own ID in players_original.csv.
  const minifacePlayerName = originalPlayersMap[playerId] || null;

  // Base copy: only when Id_Face is set (non-zero), look up that player's name.
  const idFace = appearance ? (appearance['Id_Face'] || '0') : '0';
  let baseCopyPlayerName = null;
  if (idFace !== '0') {
    baseCopyPlayerName = originalPlayersMap[idFace] || null;
    if (!baseCopyPlayerName) {
      const facePlayer = playerRows.find(p => p['Id'] === idFace);
      if (facePlayer) baseCopyPlayerName = facePlayer['Name'] || null;
    }
  }

  // Determine if player is scanned in the game
  const isScanned = scannedPlayerIds.has(playerId);

  // Check if player also plays for a national team (type '2')
  const teamTypeMap = {};
  teamRows.forEach(t => { teamTypeMap[t['Id']] = t['Type'] || '0'; });
  const currentTeamType = teamTypeMap[teamId] || '0';
  let playsForNational = false;
  if (currentTeamType !== '2') {
    for (const squadRow of squadRows) {
      const sqTeamId = squadRow['Id'];
      if (sqTeamId === teamId) continue;
      if ((teamTypeMap[sqTeamId] || '0') !== '2') continue;
      for (let i = 1; i <= 32; i++) {
        if (squadRow[`Player ${i}`] === playerId) {
          playsForNational = true;
          break;
        }
      }
      if (playsForNational) break;
    }
  }

  // Find the player's jersey number (dorsal) in the selected team's squad
  let dorsal = null;
  if (teamSquadRow) {
    for (let i = 1; i <= 32; i++) {
      if (teamSquadRow[`Player ${i}`] === playerId) {
        const shirtNum = teamSquadRow[`Shirt number ${i}`];
        if (shirtNum && shirtNum !== '0') dorsal = shirtNum;
        break;
      }
    }
  }

  const similarPlayers = findSimilarPlayers(player, teamId, playerRows, teamRows, squadRows, corregidosMap, validTeamIds);
  renderPlayerPage(player, team, appearance, typeLabel, playsForNational, baseCopyPlayerName, minifacePlayerName, isScanned, dorsal, similarPlayers);
}

// ─── Error display ────────────────────────────────────────────────────────────

function showError(message) {
  document.getElementById('loading-overlay').style.display = 'none';
  const content = document.getElementById('player-content');
  content.textContent = '';

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;

  const backLink = document.createElement('p');
  backLink.style.marginTop = '16px';
  const anchor = document.createElement('a');
  anchor.href = typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html';
  anchor.style.color = 'var(--color-highlight)';
  anchor.textContent = t('common.backToDatabase');
  backLink.appendChild(anchor);

  content.appendChild(errorDiv);
  content.appendChild(backLink);
  content.style.display = 'block';
}

// ─── Entry point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(t('errors.unexpected', { message: err.message }));
    console.error(err);
  });
});
