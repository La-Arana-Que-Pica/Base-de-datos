/**
 * Base de datos Option File PES 2018–2026
 * Main Application Script
 *
 * Architecture:
 *  1. Boot indexer: loads all CSV files on startup from global exports
 *  2. In-memory indexes for players, teams
 *  3. UI rendering for player list and player profile
 */

'use strict';

// ─── Image helpers ────────────────────────────────────────────────────────────

function handleMinifaceError(img, playerId) {
  img.onerror = null;
  img.src = 'img/players/default.webp';
}

// ─── In-memory indexes ────────────────────────────────────────────────────────
const DB = {
  teams: [],      // [{ id, folder, displayName, type, teamData, players, appearanceMap }]
  players: [],    // flat list for global search
  leagues: [],    // [{ id, name, teamIds }]
  searchIndex: Object.create(null), // token/prefix -> Set<"teamId:playerId">
  playersByKey: Object.create(null),
  appearanceMap: Object.create(null), // playerId → appearanceData (global)
  loaded: false,
};

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
  '311': 'Kosovo',
};

function nationalityName(countryId) {
  if (!countryId) return '–';
  return NATIONALITY_NAMES[String(countryId)] || countryId;
}

// Team type → Spanish group label
const TYPE_LABELS = {
  '0': 'Clubes',
  '1': 'Equipos especiales',
  '2': 'Selecciones',
};

const PLAYING_STYLE_LABELS = {
  '1':'Cazagoles','2':'Señuelo','3':'Hombre de área','4':'Extremo prolífico',
  '5':'Diez clásico','6':'Jugador de huecos','7':'Omnipresente','8':'Medio escudo',
  '9':'El destructor','10':'Atacante extra','11':'Lateral ofensivo','12':'Lateral defensivo',
  '13':'Referente','14':'Creador de jugadas','15':'Creación','16':'Portero ofensivo',
  '17':'Portero defensivo',
};

const PLAYER_SKILLS_LABELS = [
  ['S01','Tijera'],['S02','Gambeta'],['S03','Marsellesa'],['S04','Sombrerito'],
  ['S05','Amago por detrás'],['S06','Rebote interior'],['S07','Cabeceador'],
  ['S08','Cañonero'],['S09','Tiro con empeine'],['S10','Finaliz. acrobática'],
  ['S11','Taconazo'],['S12','Remate primer toque'],['S13','Pase al primer toque'],
  ['S14','Pase a profundidad'],['S15','Pase cruzado'],['S16','Centro con rosca'],
  ['S17','Rabona'],['S18','Pase bombeado bajo'],['S19','Trayect. en picada'],
  ['S20','Saque largo de banda'],['S21','Saq. meta largo'],['S22','Malicia'],
  ['S23','Marcar hombre'],['S24','Delantero atrasado'],['S25','Despeje acrobático'],
  ['S26','Capitanía'],['S27','Super refuerzo'],['S28','Espíritu de lucha'],
];

const COM_STYLES_LABELS = [
  ['P01','Mago del balón'],['P02','Esquivo'],['P03','Misil con el balón'],
  ['P04','Llegador'],['P05','Experto pases largos'],['P06','Centrador'],['P07','Cañonero'],
];

function translateStat(csvCol) {
  return STAT_LABELS[csvCol] || csvCol;
}

function translatePosition(pesPos) {
  return POSITION_LABELS[pesPos] || pesPos;
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
  if (isDefensivePosition(pesPos)) {
    return `color:${DEFENSIVE_POSITION_COLOR};border-color:${DEFENSIVE_POSITION_COLOR};background:${DEFENSIVE_POSITION_COLOR}18`;
  }
  const color = positionGroupColor(pesPos);
  return `color:${color};border-color:${color};background:${color}18`;
}

// Stat bar range for standard attributes (PES stats go from 40 to 99)
const STAT_MIN = 40;
const STAT_MAX = 99;

// Attributes that use special ranges and should NOT use standard bars
const SPECIAL_ATTRS = {
  'Weak Foot Usage':   { max: 4 },
  'Weak Foot Acc.':    { max: 4 },
  'Form':              { max: 8 },
  'Injury Resistance': { max: 3 },
};

function statFilterKey(csvCol) {
  return csvCol
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

const STAT_FILTERS = Object.entries(STAT_LABELS).map(([csvCol, label]) => {
  const key = statFilterKey(csvCol);
  const special = SPECIAL_ATTRS[csvCol];
  return {
    csvCol,
    label,
    minKey: `statMin_${key}`,
    maxKey: `statMax_${key}`,
    min: special ? 0 : STAT_MIN,
    max: special ? special.max : STAT_MAX,
  };
});

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Parse a semicolon-delimited CSV string into an array of objects.
 * Handles Windows-style line endings and UTF-8 BOM.
 */
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim());
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';').map(v => v.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    result.push(obj);
  }
  return result;
}

function pickValue(obj, keys, fallback = '') {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return fallback;
}

function correctedPlayerFallbackKey(row) {
  const name = normalizeText(row['Name'] || row['nombre'] || row['PlayerName'] || '');
  const country = row['Country'] || row['Nationality'] || row['nacionalidad'] || '';
  const pos = row['POS'] || row['Position'] || row['posicion'] || '';
  return { nameCountry: name && country ? `${name}|${country}` : '', namePos: name && pos ? `${name}|${pos}` : '' };
}

function buildCorrectedOverallMap(rows) {
  const map = { byTeamPlayer: Object.create(null), byPlayer: Object.create(null), byNameCountry: Object.create(null), byNamePos: Object.create(null) };
  rows.forEach(r => {
    const pid = r['PlayerId'] || r['Id'] || r['id'] || r['player_id'] || '';
    const tid = r['TeamId'] || r['team_id'] || '';
    const ovr = r['OverallStats'] || r['Overall'] || r['corrected_overall'] || r['media'] || '';
    if (!ovr) return;
    if (pid && tid) map.byTeamPlayer[`${tid}_${pid}`] = ovr;
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
  if (teamId && pid && correctedMap.byTeamPlayer[`${teamId}_${pid}`]) return correctedMap.byTeamPlayer[`${teamId}_${pid}`];
  if (pid && correctedMap.byPlayer[pid]) return correctedMap.byPlayer[pid];
  const fallback = correctedPlayerFallbackKey(row);
  return correctedMap.byNameCountry[fallback.nameCountry] || correctedMap.byNamePos[fallback.namePos] || '';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBreadcrumbTrail(items) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">
    ${items.map(item => item.href
      ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
      : `<span>${escapeHtml(item.label)}</span>`
    ).join('')}
  </nav>`;
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

function tokenizeSearchText(input) {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  return normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// PES numeric POS → abbreviated name
// Order matches: GK;CB;LB;RB;DMF;CMF;LMF;RMF;AMF;LWF;RWF;SS;CF
const PES_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

/**
 * Normalize a raw CSV player row:
 * - Convert numeric POS to PES position abbreviation
 * - Add convenience aliases (ID, Name, Position, Nationality, Overall)
 * - Keep all original CSV column names unchanged
 */
function normalizePlayerRow(row) {
  const rawPos = row['POS'] || '';
  const posIdx = parseInt(rawPos, 10);
  const pesPosition = /^\d+$/.test(rawPos) && posIdx >= 0 && posIdx < PES_POSITIONS.length
    ? PES_POSITIONS[posIdx]
    : rawPos;

  return {
    ...row,
    ID: row['Id'] || '',
    Name: row['Name'] || '',
    Position: pesPosition,
    Nationality: row['Country'] || '',
    Overall: row['OverallStats'] || '',
  };
}

function getPlayerKey(teamId, playerId) {
  return `${teamId}:${playerId}`;
}

function addToSearchIndex(term, playerKey) {
  if (!term) return;
  if (!DB.searchIndex[term]) DB.searchIndex[term] = new Set();
  DB.searchIndex[term].add(playerKey);
}

function indexPlayerForSearch(player) {
  if (!player || !player._team) return;
  const playerId = player.ID;
  if (!playerId) return;

  const playerKey = getPlayerKey(player._team.id, playerId);
  DB.playersByKey[playerKey] = player;

  const terms = new Set([
    ...tokenizeSearchText(player.Name),
    ...tokenizeSearchText(player.Position),
    ...tokenizeSearchText(playerId),
    ...tokenizeSearchText(player._team.displayName),
  ]);

  terms.forEach(term => {
    addToSearchIndex(term, playerKey);
    if (term.length >= 2) {
      for (let len = 2; len <= term.length; len++) {
        addToSearchIndex(term.slice(0, len), playerKey);
      }
    }
  });
}

function intersectSets(baseSet, nextSet) {
  if (!baseSet) return new Set(nextSet);
  const result = new Set();
  baseSet.forEach(value => {
    if (nextSet.has(value)) result.add(value);
  });
  return result;
}

/**
 * Fetch a text file from the given URL. Returns null on 404.
 */
async function fetchText(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

/**
 * Convert a country_id to a flag image filename.
 */
function flagSrc(countryId) {
  if (!countryId) return 'img/flags/default.webp';
  return `img/flags/${countryId}.webp`;
}

/**
 * Get color class for a stat value (0–99).
 */
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

/**
 * Get color hex for canvas drawing based on stat value.
 */
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

/**
 * Compute overall badge color.
 */
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

// ─── Boot / Indexer ───────────────────────────────────────────────────────────

async function boot() {
  showLoading('Cargando base de datos...');

  // Load all global CSV files in parallel
  const [teamsText, playersText, squadsText, appearancesText, leaguesText, corregidosText] = await Promise.all([
    fetchText('database/All teams exported.csv'),
    fetchText('database/All players exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All appeaarances exported.csv'),
    fetchText('database/All leagues exported.csv'),
    fetchText('database/medias_corregidas.csv'),
  ]);

  if (!teamsText || !playersText || !squadsText) {
    showError('Error al cargar los archivos de la base de datos.');
    return;
  }

  // Parse all CSVs
  const teamRows = parseCSV(teamsText);
  const playerRows = parseCSV(playersText);
  const squadRows = parseCSV(squadsText);
  const appearanceRows = appearancesText ? parseCSV(appearancesText) : [];

  // Build global appearance map (playerId → appearanceData)
  const globalAppearanceMap = {};
  appearanceRows.forEach(row => {
    const id = row['Id'];
    if (id) globalAppearanceMap[id] = row;
  });
  DB.appearanceMap = globalAppearanceMap;

  // Build team map (teamId → team object)
  const teamById = {};
  teamRows.forEach(teamRow => {
    const teamId = teamRow['Id'];
    if (!teamId) return;
    const teamName = teamRow['Name'] || '';
    // Skip placeholder teams with no real name
    if (!teamName || teamName === '-') return;
    const team = {
      id: teamId,
      folder: teamId,
      rawName: teamName,
      displayName: toTitleCaseName(teamName),
      abbreviation: teamRow['Abbreviation'] || '',
      type: teamRow['Type'] || '0',
      teamData: teamRow,
      players: [],
      appearanceMap: globalAppearanceMap,
    };
    teamById[teamId] = team;
    DB.teams.push(team);
  });

  // Sort teams alphabetically
  DB.teams.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  // Build leagues from CSV
  if (leaguesText) {
    const leagueRows = parseCSV(leaguesText);
    DB.leagues = leagueRows.map(row => ({
      id: row['league_id'] || '',
      name: row['league_name'] || '',
      teamIds: (row['team_ids'] || '').split(',').map(s => s.trim()).filter(Boolean),
    })).filter(l => l.id && l.name);
  }

  // Build normalized player map (playerId → normalized player row)
  const validTeamIds = new Set();
  DB.leagues.forEach(league => league.teamIds.forEach(id => validTeamIds.add(id)));
  DB.teams = DB.teams.filter(team => validTeamIds.has(team.id));
  Object.keys(teamById).forEach(teamId => {
    if (!validTeamIds.has(teamId)) delete teamById[teamId];
  });

  const playerMap = {};
  playerRows.forEach(playerRow => {
    const playerId = playerRow['Id'];
    if (!playerId) return;
    playerMap[playerId] = normalizePlayerRow(playerRow);
  });

  // Build corrected overall map from medias_corregidas.csv
  const corregidosMap = corregidosText ? buildCorrectedOverallMap(parseCSV(corregidosText)) : null;

  // Assign players to teams using squad data
  squadRows.forEach(squadRow => {
    const teamId = squadRow['Id'];
    if (!validTeamIds.has(teamId)) return;
    const team = teamById[teamId];
    if (!team) return;
    for (let i = 1; i <= 32; i++) {
      const playerId = squadRow[`Player ${i}`];
      if (!playerId || playerId === '0') continue;
      const player = playerMap[playerId];
      if (!player) continue;
      const p = { ...player, _team: team };
      // Apply corrected overall if available (team-specific key takes precedence)
      const corregidosOvr = correctedOverallFor(p, teamId, corregidosMap);
      if (corregidosOvr) p.Overall = corregidosOvr;
      team.players.push(p);
      DB.players.push(p);
      indexPlayerForSearch(p);
    }
  });

  // Mark players who play for both a club/special team and a national team.
  // Club entries (type 0 or 1) get _playsForNational = true when the same
  // player also appears in a national team squad (type 2).
  const playerNationalTeam = new Map(); // playerId → national team
  const playerHasClub = new Set();     // playerIds with a club/special team entry
  DB.players.forEach(p => {
    if (p._team.type === '2') {
      if (!playerNationalTeam.has(p.ID)) playerNationalTeam.set(p.ID, p._team);
    } else {
      playerHasClub.add(p.ID);
    }
  });
  DB.players.forEach(p => {
    if (p._team.type !== '2' && playerNationalTeam.has(p.ID)) {
      p._playsForNational = true;
    }
  });

  if (!DB.teams.length) {
    showError('No se encontraron equipos en la base de datos.');
    return;
  }

  DB.loaded = true;
  buildSidebar();
  restoreNavState();
}

// ─── Navigation state (URL + localStorage fallback) ──────────────────────────

const NAV_STATE_KEY = 'pes_nav_state';

/**
 * Build a URL string from a nav state object.
 * Pagination is expressed as `offset` (items skipped), e.g. offset=60 for page 2.
 */
function _stateToUrl(state) {
  if (!state || !state.view) return window.location.pathname;
  const params = new URLSearchParams();
  params.set('view', state.view);
  if (state.leagueId) params.set('leagueId', state.leagueId);
  if (state.query) params.set('q', state.query);
  if (state.page && state.page > 1) {
    // Store as byte offset so it matches the sofifa-style ?offset=60
    const pageSize = state.view === 'teams' ? TEAMS_PAGE_SIZE : PLAYERS_PAGE_SIZE;
    params.set('offset', (state.page - 1) * pageSize);
  }
  if (state.filters) {
    Object.entries(state.filters).forEach(([k, v]) => {
      if (v !== '') params.set('f_' + k, v);
    });
  }
  if (state.specialPlayers) params.set('special', '1');
  return window.location.pathname + '?' + params.toString();
}

/**
 * Parse the current URL query string into a nav state object.
 * Returns null when no `view` param is present.
 */
function _urlToState() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (!view) return null;
  const state = { view };
  const leagueId = params.get('leagueId');
  if (leagueId) state.leagueId = leagueId;
  const q = params.get('q');
  if (q) state.query = q;
  const offset = parseInt(params.get('offset'), 10);
  if (!isNaN(offset) && offset >= 0) {
    const pageSize = view === 'teams' ? TEAMS_PAGE_SIZE : PLAYERS_PAGE_SIZE;
    state.page = Math.floor(offset / pageSize) + 1;
  }
  const filters = {};
  params.forEach((v, k) => {
    if (k.startsWith('f_')) filters[k.slice(2)] = v;
  });
  if (filters.skill && !filters.skills) {
    filters.skills = filters.skill;
    delete filters.skill;
  }
  if (Object.keys(filters).length) state.filters = filters;
  if (params.get('special') === '1') state.specialPlayers = true;
  return state;
}

// Track which view was last pushed so we use replaceState for same-view changes
let _lastPushedView = null;

function saveNavState(state) {
  // Always keep localStorage in sync as a fallback
  try { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(state)); } catch(e) {}

  // Update the browser URL
  const url = _stateToUrl(state);
  const viewChanged = state.view !== _lastPushedView;
  if (viewChanged) {
    history.pushState(state, '', url);
    _lastPushedView = state.view;
  } else {
    history.replaceState(state, '', url);
  }
}

function loadNavState() {
  // Prefer explicit URL state. With no query, the database starts at its hub.
  const urlState = _urlToState();
  if (urlState) return urlState;
  return { view: 'home' };
}

/**
 * Apply a nav state object (e.g. from URL or popstate event) to the UI.
 * Does NOT call saveNavState to avoid extra history entries.
 */
function _applyNavState(state) {
  if (!state || !state.view) { showAllPlayers(); return; }
  switch (state.view) {
    case 'home':
      showHome();
      break;
    case 'leagues':
      _showLeaguesViewInternal();
      if (state.query) {
        const input = document.getElementById('leagues-search-input');
        if (input) { input.value = state.query; filterLeaguesGrid(state.query); }
      }
      break;
    case 'leagueTeams':
      if (state.leagueId) _showLeagueTeamsViewInternal(state.leagueId);
      else _showLeaguesViewInternal();
      break;
    case 'teams':
      if (state.query) _teamFilters.name = state.query;
      _showTeamsViewInternal();
      if (state.query) {
        const input = document.getElementById('team-flt-name');
        if (input) input.value = state.query;
        onTeamFilterChange(false);
      }
      if (state.page > 1) goToTeamsPage(state.page, false);
      break;
    case 'players':
      if (state.filters) Object.assign(_advFilters, state.filters);
      if (state.specialPlayers !== undefined) _showSpecialPlayers = state.specialPlayers;
      if (state.page) _allPlayersPage = state.page;
      _showAllPlayersInternal(false);
      break;
    case 'favorites':
      _showFavoritesViewInternal();
      break;
    default: showAllPlayers(); break;
  }
}

function restoreNavState() {
  _lastPushedView = null; // reset so first nav uses pushState
  const state = loadNavState();
  if (!state || !state.view) { showDatabaseHome(); return; }
  // Seed _lastPushedView to avoid a spurious pushState on first render
  _lastPushedView = state.view;
  _applyNavState(state);
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="sidebar-nav-section">
      <button type="button" class="sidebar-nav-header db-sidebar-btn" id="nav-header-inicio" onclick="showDatabaseHome()">
        <span class="sidebar-nav-title">Inicio</span>
      </button>
    </div>
    <div class="sidebar-nav-section">
      <button type="button" class="sidebar-nav-header db-sidebar-btn" id="nav-header-ligas" onclick="showLeaguesView()">
        <span class="sidebar-nav-title">Ligas</span>
      </button>
    </div>
    <div class="sidebar-nav-section">
      <button type="button" class="sidebar-nav-header db-sidebar-btn" id="nav-header-equipos" onclick="showTeamsView()">
        <span class="sidebar-nav-title">Equipos</span>
      </button>
    </div>
    <div class="sidebar-nav-section">
      <button type="button" class="sidebar-nav-header db-sidebar-btn" id="nav-header-jugadores" onclick="showAllPlayersFromSidebar()">
        <span class="sidebar-nav-title">Jugadores</span>
      </button>
    </div>`;

}

/**
 * Toggle the expand/collapse state of a league's team list in the sidebar.
 */
function toggleSidebarLeague(leagueId) {
  const hdr = document.getElementById('sidebar-league-hdr-' + leagueId);
  const list = document.getElementById('sidebar-teams-' + leagueId);
  if (!hdr || !list) return;
  const open = hdr.classList.toggle('open');
  list.classList.toggle('open', open);
}

/**
 * Filter the leagues shown in the sidebar by name.
 */
function filterSidebarLeagues(query) {
  const q = normalizeText(query).trim();
  document.querySelectorAll('#sidebar-leagues-list .sidebar-league').forEach(item => {
    const name = item.dataset.leagueName || '';
    item.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

function _setActiveSidebarNav(viewName) {
  ['nav-header-inicio', 'nav-header-ligas', 'nav-header-equipos', 'nav-header-jugadores'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const map = {
    home: 'nav-header-inicio',
    leagues: 'nav-header-ligas',
    leagueTeams: 'nav-header-ligas',
    teams: 'nav-header-equipos',
    players: 'nav-header-jugadores',
  };
  const targetId = map[viewName];
  if (targetId) {
    const el = document.getElementById(targetId);
    if (el) el.classList.add('active');
  }
}

function showAllPlayersFromSidebar() {
  showAllPlayers();
}

function filterAllPlayers(query) {
  if (!query.trim()) {
    showAllPlayers();
    return;
  }
  runSearch(query);
}

// ─── Leagues grid view ────────────────────────────────────────────────────────

let _leaguesForGrid = [];

/** Internal: render the leagues grid without saving nav state. */
function _showLeaguesViewInternal() {
  _setActiveSidebarNav('leagues');
  _leaguesForGrid = DB.leagues.slice();
  hideAllViews();
  const view = document.getElementById('leagues-view');
  view.classList.add('active');

  const cardsHtml = DB.leagues.map(league => {
    const teamCount = league.teamIds.length;
    return `
      <div class="grid-card" onclick="window.location.href='league.html?id=${encodeURIComponent(league.id)}'">
        <img class="grid-card-img"
          src="img/leagues/${league.id}.webp"
          loading="lazy"
          onerror="this.onerror=null;this.src='img/leagues/default.webp'"
          alt="${league.name}">
        <div class="grid-card-name">${league.name}</div>
        <div class="grid-card-sub">${teamCount} equipo${teamCount !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');

  view.innerHTML = `
    ${renderBreadcrumbTrail([{ label: 'Inicio', href: 'index.html' }, { label: 'Base de datos', href: 'database.html' }, { label: 'Ligas' }])}
    <div class="view-header">
      <div>
        <div class="view-title">Ligas</div>
        <div class="view-subtitle" id="leagues-grid-subtitle">${DB.leagues.length} ligas disponibles</div>
      </div>
    </div>
    <div class="grid-search-wrap">
      <input type="text" class="grid-search-input" id="leagues-search-input"
        placeholder="Buscar liga..." autocomplete="off"
        oninput="filterLeaguesGrid(this.value)">
    </div>
    <div class="grid-cards" id="leagues-grid-cards">${cardsHtml}</div>`;
}

function showLeaguesView() {
  saveNavState({ view: 'leagues' });
  _showLeaguesViewInternal();
}

function filterLeaguesGrid(query) {
  const q = query.toLowerCase().trim();
  const container = document.getElementById('leagues-grid-cards');
  const subtitle = document.getElementById('leagues-grid-subtitle');
  if (!container) return;
  saveNavState({ view: 'leagues', query });
  const matches = q ? _leaguesForGrid.filter(l => (l.name || '').toLowerCase().includes(q)) : _leaguesForGrid;
  const cardsHtml = matches.map(league => {
    const teamCount = league.teamIds.length;
    return `
      <div class="grid-card" onclick="window.location.href='league.html?id=${encodeURIComponent(league.id)}'">
        <img class="grid-card-img"
          src="img/leagues/${league.id}.webp"
          loading="lazy"
          onerror="this.onerror=null;this.src='img/leagues/default.webp'"
          alt="${league.name}">
        <div class="grid-card-name">${league.name}</div>
        <div class="grid-card-sub">${teamCount} equipo${teamCount !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
  container.innerHTML = cardsHtml;
  if (subtitle) subtitle.textContent = `${matches.length} liga${matches.length !== 1 ? 's' : ''} encontrada${matches.length !== 1 ? 's' : ''}`;
}

function showLeagueTeamsView(leagueId) {
  saveNavState({ view: 'leagueTeams', leagueId });
  _showLeagueTeamsViewInternal(leagueId);
}

/** Internal: render a league's teams without saving nav state. */
function _showLeagueTeamsViewInternal(leagueId) {
  _setActiveSidebarNav('leagueTeams');
  const league = DB.leagues.find(l => l.id === leagueId);
  if (!league) return;

  const teamById = {};
  DB.teams.forEach(t => { teamById[t.id] = t; });
  const leagueTeams = league.teamIds.map(id => teamById[id]).filter(Boolean);

  hideAllViews();
  const view = document.getElementById('leagues-view');
  view.classList.add('active');

  const cardsHtml = leagueTeams.map(team => `
    <div class="grid-card" onclick="selectTeam('${team.id}')">
      <img class="grid-card-img"
        src="img/teams/${team.id}.webp"
        loading="lazy"
        onerror="this.onerror=null;this.src='img/teams/default.webp'"
        alt="${team.displayName}">
      <div class="grid-card-name">${team.displayName}</div>
    </div>`).join('');

  view.innerHTML = `
    ${renderBreadcrumbTrail([{ label: 'Inicio', href: 'index.html' }, { label: 'Base de datos', href: 'database.html' }, { label: 'Ligas', href: 'database.html?view=leagues' }, { label: league.name }])}
    <div class="view-header">
      <img class="grid-card-img" style="width:48px;height:48px;object-fit:contain"
        src="img/leagues/${leagueId}.webp"
        onerror="this.onerror=null;this.src='img/leagues/default.webp'"
        alt="${league.name}">
      <div>
        <div class="view-title">${league.name}</div>
        <div class="view-subtitle">${leagueTeams.length} equipo${leagueTeams.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    <button class="back-btn" onclick="showLeaguesView()" style="margin-bottom:16px">◀ Volver a Ligas</button>
    <div class="grid-cards">${cardsHtml}</div>`;
}

// ─── Teams grid view ──────────────────────────────────────────────────────────

const TEAMS_PAGE_SIZE = 60;
let _teamsForGrid = [];
let _teamsFilteredList = [];
let _teamsGridPage = 1;
let _teamFilters = {
  name: '',
  league: '',
  country: '',
  type: '',
  minAvg: '',
  maxAvg: '',
  minPlayers: '',
  maxPlayers: '',
};

function _getLeagueForTeam(teamId) {
  return DB.leagues.find(l => l.teamIds.includes(teamId)) || null;
}

function _teamPlayerCount(team) {
  return (team.players || []).filter(p => p && p.ID).length;
}

function _teamFilterValue(team, key) {
  if (key === 'league') return (_getLeagueForTeam(team.id) || {}).id || '';
  if (key === 'country') return (team.teamData || {}).Country || '';
  if (key === 'type') return team.type || '';
  if (key === 'avg') return teamAvgOvr(team);
  if (key === 'players') return _teamPlayerCount(team);
  return '';
}

function _hasActiveTeamFilters() {
  return Object.values(_teamFilters).some(Boolean);
}

function _buildTeamActiveFiltersSummary() {
  if (!_hasActiveTeamFilters()) {
    return `<div class="active-filters active-filters-empty" id="team-active-filters-summary">Sin filtros activos</div>`;
  }

  const tags = [];
  const add = (label, value) => {
    if (value !== undefined && value !== null && value !== '') tags.push(`${label}: ${value}`);
  };
  const league = DB.leagues.find(l => l.id === _teamFilters.league);
  const country = _teamFilters.country ? nationalityName(_teamFilters.country) : '';
  add('Nombre', _teamFilters.name);
  add('Liga', league ? league.name : '');
  add('Pais', country);
  add('Tipo', TYPE_LABELS[_teamFilters.type] || '');
  if (_teamFilters.minAvg || _teamFilters.maxAvg) add('Media', `${_teamFilters.minAvg || 0}-${_teamFilters.maxAvg || 99}`);
  if (_teamFilters.minPlayers || _teamFilters.maxPlayers) add('Jugadores', `${_teamFilters.minPlayers || 0}-${_teamFilters.maxPlayers || 32}`);

  return `
    <div class="active-filters" id="team-active-filters-summary">
      <span class="active-filters-label">Filtros activos</span>
      <div class="active-filter-tags">
        ${tags.map(tag => `<span class="active-filter-tag">${escapeHtml(tag)}</span>`).join('')}
      </div>
    </div>`;
}

function _buildTeamFiltersPanel() {
  const leagues = DB.leagues
    .filter(l => l.name && l.teamIds.some(id => _teamsForGrid.some(t => t.id === id)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const countries = [...new Set(_teamsForGrid.map(t => _teamFilterValue(t, 'country')).filter(Boolean))]
    .sort((a, b) => nationalityName(a).localeCompare(nationalityName(b), 'es'));
  const types = [...new Set(_teamsForGrid.map(t => t.type).filter(t => TYPE_LABELS[t]))];

  return `
    <div class="adv-filter-panel team-filter-panel">
      <div class="filter-panel-head">
        <div>
          <div class="filter-panel-title">Filtros de equipos</div>
          <div class="filter-panel-subtitle">Busca por datos reales del CSV y metricas calculadas desde el plantel.</div>
        </div>
        <button type="button" class="adv-filter-reset" id="btn-clear-team-filters" onclick="resetTeamFilters()" ${_hasActiveTeamFilters() ? '' : 'disabled'}>Limpiar filtros</button>
      </div>
      ${_buildTeamActiveFiltersSummary()}
      <div class="adv-filter-grid basic-filter-grid">
        <div class="adv-filter-group">
          <label>Nombre</label>
          <input type="text" id="team-flt-name" placeholder="Buscar equipo" value="${escapeHtml(_teamFilters.name)}" oninput="onTeamFilterChange()">
        </div>
        <div class="adv-filter-group">
          <label>Liga</label>
          <select id="team-flt-league" onchange="onTeamFilterChange()">
            <option value="">Todas</option>
            ${leagues.map(l => `<option value="${l.id}"${_teamFilters.league === l.id ? ' selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
          </select>
        </div>
        <div class="adv-filter-group">
          <label>Pais</label>
          <select id="team-flt-country" onchange="onTeamFilterChange()">
            <option value="">Todos</option>
            ${countries.map(c => `<option value="${c}"${_teamFilters.country === c ? ' selected' : ''}>${escapeHtml(nationalityName(c))}</option>`).join('')}
          </select>
        </div>
        <div class="adv-filter-group">
          <label>Tipo</label>
          <select id="team-flt-type" onchange="onTeamFilterChange()">
            <option value="">Todos</option>
            ${types.map(t => `<option value="${t}"${_teamFilters.type === t ? ' selected' : ''}>${escapeHtml(TYPE_LABELS[t])}</option>`).join('')}
          </select>
        </div>
        ${_buildRangeFilter('Media promedio', 'team-flt-min-avg', 'team-flt-max-avg', 0, 99, _teamFilters.minAvg, _teamFilters.maxAvg).replaceAll('onAdvFilterChange()', 'onTeamFilterChange()')}
        ${_buildRangeFilter('Cantidad de jugadores', 'team-flt-min-players', 'team-flt-max-players', 0, 32, _teamFilters.minPlayers, _teamFilters.maxPlayers).replaceAll('onAdvFilterChange()', 'onTeamFilterChange()')}
      </div>
    </div>`;
}

function _applyTeamFilters() {
  const name = normalizeText(_teamFilters.name);
  _teamsFilteredList = _teamsForGrid.filter(team => {
    if (name && !normalizeText(team.displayName).includes(name)) return false;
    if (_teamFilters.league && _teamFilterValue(team, 'league') !== _teamFilters.league) return false;
    if (_teamFilters.country && _teamFilterValue(team, 'country') !== _teamFilters.country) return false;
    if (_teamFilters.type && _teamFilterValue(team, 'type') !== _teamFilters.type) return false;

    const avg = _teamFilterValue(team, 'avg');
    if (_teamFilters.minAvg && (avg === null || avg < parseInt(_teamFilters.minAvg, 10))) return false;
    if (_teamFilters.maxAvg && (avg === null || avg > parseInt(_teamFilters.maxAvg, 10))) return false;

    const players = _teamFilterValue(team, 'players');
    if (_teamFilters.minPlayers && players < parseInt(_teamFilters.minPlayers, 10)) return false;
    if (_teamFilters.maxPlayers && players > parseInt(_teamFilters.maxPlayers, 10)) return false;

    return true;
  });
}

/** Internal: render teams grid without saving nav state. */
function _showTeamsViewInternal() {
  _setActiveSidebarNav('teams');
  // Only show teams that belong to a league
  const teamsInLeagues = new Set();
  DB.leagues.forEach(l => l.teamIds.forEach(id => teamsInLeagues.add(id)));
  const filteredTeams = DB.teams.filter(t => teamsInLeagues.has(t.id));
  _teamsForGrid = filteredTeams;
  _applyTeamFilters();
  _teamsGridPage = 1;

  hideAllViews();
  const view = document.getElementById('teams-grid-view');
  view.classList.add('active');

  view.innerHTML = `
    ${renderBreadcrumbTrail([{ label: 'Inicio', href: 'index.html' }, { label: 'Base de datos', href: 'database.html' }, { label: 'Equipos' }])}
    <div class="view-header">
      <div>
        <div class="view-title">Equipos</div>
        <div class="view-subtitle" id="teams-grid-subtitle">${_teamsFilteredList.length} equipos con liga asignada</div>
      </div>
    </div>
    ${_buildTeamFiltersPanel()}
    <div class="grid-cards" id="teams-grid-cards"></div>
    <div id="teams-grid-pagination"></div>`;

  _renderTeamsGridPage();
}

function showTeamsView() {
  saveNavState({ view: 'teams' });
  _showTeamsViewInternal();
}

function _renderTeamsGridPage() {
  const container = document.getElementById('teams-grid-cards');
  const paginationEl = document.getElementById('teams-grid-pagination');
  const subtitle = document.getElementById('teams-grid-subtitle');
  if (!container) return;

  const total = _teamsFilteredList.length;
  const start = (_teamsGridPage - 1) * TEAMS_PAGE_SIZE;
  const pageTeams = _teamsFilteredList.slice(start, start + TEAMS_PAGE_SIZE);

  const cardsHtml = pageTeams.map(team => {
    const avg = teamAvgOvr(team);
    const avgHtml = avg !== null
      ? `<div class="grid-card-ovr"><span class="team-avg-badge" style="background:${statColor(avg)};color:${statTextColor(statColor(avg))}">${avg}</span></div>`
      : '';
    return `
    <div class="grid-card" onclick="selectTeam('${team.id}')">
      <img class="grid-card-img"
        src="img/teams/${team.id}.webp"
        loading="lazy"
        onerror="this.onerror=null;this.src='img/teams/default.webp'"
        alt="${team.displayName}">
      <div class="grid-card-name">${team.displayName}</div>
      ${avgHtml}
    </div>`;
  }).join('');

  container.innerHTML = cardsHtml;

  if (paginationEl) {
    paginationEl.innerHTML = _buildPaginationControls(total, _teamsGridPage, TEAMS_PAGE_SIZE, 'goToTeamsPage');
  }

  if (subtitle) {
    const totalPages = Math.ceil(total / TEAMS_PAGE_SIZE) || 1;
    if (total === _teamsForGrid.length) {
      subtitle.textContent = `${total} equipos con liga asignada · página ${_teamsGridPage} de ${totalPages}`;
    } else {
      subtitle.textContent = `${total} equipo${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''} · página ${_teamsGridPage} de ${totalPages}`;
    }
  }
}

/**
 * Navigate to the given page in the teams grid.
 * @param {number} page             - 1-based target page
 * @param {boolean} [scrollToTop=true]
 */
function goToTeamsPage(page, scrollToTop) {
  const totalPages = Math.ceil(_teamsFilteredList.length / TEAMS_PAGE_SIZE) || 1;
  _teamsGridPage = Math.max(1, Math.min(page, totalPages));
  const query = _teamFilters.name || '';
  saveNavState({ view: 'teams', query, page: _teamsGridPage });
  _renderTeamsGridPage();
  if (scrollToTop !== false) {
    const view = document.getElementById('teams-grid-view');
    if (view) view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function filterTeamsGrid(query) {
  _teamFilters.name = query || '';
  onTeamFilterChange(false);
}

function onTeamFilterChange(saveState = true) {
  if (!document.getElementById('teams-grid-cards')) return;
  _teamFilters.name = (document.getElementById('team-flt-name') || {}).value || _teamFilters.name || '';
  _teamFilters.league = (document.getElementById('team-flt-league') || {}).value || '';
  _teamFilters.country = (document.getElementById('team-flt-country') || {}).value || '';
  _teamFilters.type = (document.getElementById('team-flt-type') || {}).value || '';
  _teamFilters.minAvg = (document.getElementById('team-flt-min-avg') || {}).value || '';
  _teamFilters.maxAvg = (document.getElementById('team-flt-max-avg') || {}).value || '';
  _teamFilters.minPlayers = (document.getElementById('team-flt-min-players') || {}).value || '';
  _teamFilters.maxPlayers = (document.getElementById('team-flt-max-players') || {}).value || '';

  _applyTeamFilters();
  _teamsGridPage = 1;
  if (saveState) saveNavState({ view: 'teams', query: _teamFilters.name, page: 1 });
  const summary = document.getElementById('team-active-filters-summary');
  if (summary) summary.outerHTML = _buildTeamActiveFiltersSummary();
  const clearBtn = document.getElementById('btn-clear-team-filters');
  if (clearBtn) clearBtn.disabled = !_hasActiveTeamFilters();
  _renderTeamsGridPage();
}

function resetTeamFilters() {
  Object.keys(_teamFilters).forEach(k => { _teamFilters[k] = ''; });
  ['team-flt-name','team-flt-league','team-flt-country','team-flt-type',
   'team-flt-min-avg','team-flt-max-avg','team-flt-min-players','team-flt-max-players'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  onTeamFilterChange();
}


// ─── Views ────────────────────────────────────────────────────────────────────

function hideAllViews() {
  document.querySelectorAll('#home-view, #players-view, #player-view, #search-view, #leagues-view, #teams-grid-view, #favorites-view').forEach(el => {
    el.classList.remove('active');
  });
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.style.display = 'none';
}

function showLoading(message = 'Cargando...') {
  hideAllViews();
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    const msg = overlay.querySelector('.loading-message');
    if (msg) msg.textContent = message;
  }
}

function showError(message) {
  const main = document.getElementById('main');
  hideAllViews();
  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = message;
  main.appendChild(div);
}

function showHome() {
  _setActiveSidebarNav('home');
  hideAllViews();
  document.getElementById('home-view').classList.add('active');

  const teamsInLeaguesSet = _getTeamsInLeagues();
  const leagueCount = DB.leagues.length;
  document.getElementById('stat-leagues').textContent = leagueCount;
  document.getElementById('stat-teams').textContent = DB.teams.filter(t => teamsInLeaguesSet.has(t.id)).length;
  // Count unique players from teams that have a league assigned
  const uniqueIds = new Set(DB.players.filter(p => teamsInLeaguesSet.has(p._team.id)).map(p => p.ID));
  document.getElementById('stat-players').textContent = uniqueIds.size;
  // Show favorites count
  const favCount = getFavoritesCount();
  const statFav = document.getElementById('stat-favorites');
  if (statFav) statFav.textContent = favCount > 0 ? favCount : '⭐';

  // Populate featured leagues + teams section
  const featuredSection = document.getElementById('home-leagues-section');
  if (!featuredSection) return;
  if (!DB.leagues.length) {
    featuredSection.innerHTML = '';
    return;
  }

  const teamById = {};
  DB.teams.forEach(t => { teamById[t.id] = t; });

  const leaguesHtml = DB.leagues.map(l => {
    const safeName = l.name
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const leagueTeams = l.teamIds.map(id => teamById[id]).filter(Boolean);
    const teamsHtml = leagueTeams.map(t => {
      const safeTName = (t.displayName || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return `<a class="home-team-crest" href="team.html?id=${t.id.replace(/"/g, '&quot;')}" title="${safeTName}">
        <img src="img/teams/${t.id}.webp"
          loading="lazy"
          onerror="this.onerror=null;this.src='img/teams/default.webp'"
          alt="${safeTName}">
      </a>`;
    }).join('');
    return `<div class="home-league-block">
      <div class="home-league-header" data-league-id="${l.id.replace(/"/g, '&quot;')}">
        <img src="img/leagues/${l.id}.webp"
          loading="lazy"
          onerror="this.onerror=null;this.src='img/leagues/default.webp'"
          alt="${safeName}">
        <span>${safeName}</span>
        <span class="home-league-count">${leagueTeams.length} equipos</span>
      </div>
      ${teamsHtml ? `<div class="home-team-crests-row">${teamsHtml}</div>` : ''}
    </div>`;
  }).join('');

  featuredSection.innerHTML = `<div class="home-section-title">Ligas y equipos</div>
    <div class="home-leagues-blocks">${leaguesHtml}</div>`;

  featuredSection.querySelectorAll('.home-league-header').forEach(header => {
    header.addEventListener('click', () => showLeagueTeamsView(header.dataset.leagueId));
  });
}

function goHome() {
  if (DB.loaded) showDatabaseHome();
}

function showDatabaseHome() {
  saveNavState({ view: 'home' });
  showHome();
}

function showAllPlayersAndFocusSearch() {
  showAllPlayers(true);
  requestAnimationFrame(() => {
    const input = document.getElementById('search-input');
    if (input) input.focus();
  });
}

// ─── All-players default view (pagination) ───────────────────────────────────

const PLAYERS_PAGE_SIZE = 60;

// State for the paginated all-players view
let _allPlayersList = [];      // sorted, filtered, deduplicated player array
let _allPlayersPage = 1;       // current page (1-based)
let _showSpecialPlayers = false; // whether to include type-1 (special) team players
let _playerSort = { key: null, dir: null };
let _playerFiltersOpen = false;

// Advanced filter state
const _advFilters = {
  name: '',
  position: '',
  role: '',
  nationality: '',
  league: '',
  club: '',
  minAge: '',
  maxAge: '',
  minHeight: '',
  maxHeight: '',
  minWeight: '',
  maxWeight: '',
  foot: '',
  minOvr: '',
  maxOvr: '',
  hasFaceScan: '',
  playingStyle: '',
  minSpeed: '',
  maxSpeed: '',
  minShooting: '',
  maxShooting: '',
  minPassing: '',
  maxPassing: '',
  minDribbling: '',
  maxDribbling: '',
  minDefense: '',
  maxDefense: '',
  minPhysical: '',
  maxPhysical: '',
  minStamina: '',
  maxStamina: '',
  skills: '',
  comStyle: '',
};

// Playing role → position group for filter
const ROLE_POSITIONS = {
  'GK':  ['GK'],
  'DEF': ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  'MID': ['DMF', 'CMF', 'LMF', 'RMF', 'AMF'],
  'FWD': ['LWF', 'RWF', 'SS', 'CF'],
};

function _selectedSkillCodes(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

STAT_FILTERS.forEach(stat => {
  _advFilters[stat.minKey] = '';
  _advFilters[stat.maxKey] = '';
});

const BASIC_FILTER_KEYS = new Set(['name', 'club', 'league', 'nationality', 'position', 'minOvr', 'maxOvr']);
let _advancedFiltersOpen = false;

function _hasActiveBasicFilters() {
  return Array.from(BASIC_FILTER_KEYS).some(key => _advFilters[key] !== '');
}

function _hasActiveAdvancedFilters() {
  return Object.entries(_advFilters).some(([key, value]) => value !== '' && !BASIC_FILTER_KEYS.has(key));
}

function _hasActiveFilters() {
  return Object.values(_advFilters).some(value => value !== '');
}

function _defaultPlayerSort(list) {
  list.sort((a, b) => (parseInt(b.Overall, 10) || 0) - (parseInt(a.Overall, 10) || 0));
}

function _sortValueForPlayer(player, key) {
  if (key === 'name') return normalizeText(player.Name);
  if (key === 'team') return normalizeText((player._team || {}).displayName);
  if (key === 'nationality') return nationalityName(player.Nationality);
  if (key === 'position') return player.Position || '';
  if (key === 'ovr') return parseInt(player.Overall, 10) || 0;
  if (key === 'age') return parseInt(player.Age, 10) || 0;
  if (key === 'rit') return computeRadarAttributes(player).RIT;
  if (key === 'dri') return computeRadarAttributes(player).DRI;
  if (key === 'tir') return computeRadarAttributes(player).TIR;
  if (key === 'pas') return computeRadarAttributes(player).PAS;
  if (key === 'fis') return computeRadarAttributes(player).FIS;
  if (key === 'def') return computeRadarAttributes(player).DEF;
  return player[key] || '';
}

function _applyPlayerSort(list) {
  if (!_playerSort.key || !_playerSort.dir) {
    _defaultPlayerSort(list);
    return;
  }
  const key = _playerSort.key;
  const dir = _playerSort.dir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    const va = _sortValueForPlayer(a, key);
    const vb = _sortValueForPlayer(b, key);
    if (typeof va === 'number' || typeof vb === 'number') return ((va || 0) - (vb || 0)) * dir;
    return String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' }) * dir;
  });
}

/** Returns the set of team IDs that are assigned to at least one league. */
function _getTeamsInLeagues() {
  const s = new Set();
  if (DB.leagues) DB.leagues.forEach(l => l.teamIds.forEach(id => s.add(id)));
  return s;
}

/**
 * Build (or rebuild) the sorted, deduplicated players array with active filters.
 * Players who appear in both a club team and a national team are shown only
 * under their club team (national team duplicate entries are skipped).
 */
function _prepareAllPlayersList() {
  // Build set of team IDs that belong to a league
  const teamsInLeagues = _getTeamsInLeagues();

  // Collect all player IDs that have a club/special team entry
  const clubPlayerIds = new Set(
    DB.players.filter(p => p._team.type !== '2').map(p => p.ID)
  );

  const seen = new Set();
  let unique = DB.players.filter(p => {
    // Skip national team entry if the same player also has a club entry
    if (p._team.type === '2' && clubPlayerIds.has(p.ID)) return false;
    if (seen.has(p.ID)) return false;
    seen.add(p.ID);
    return true;
  });

  // Always hide players from teams that have no league assigned
  unique = unique.filter(p => teamsInLeagues.has(p._team.id));

  // Hide type-1 (special) team players unless the toggle is active
  if (!_showSpecialPlayers) {
    unique = unique.filter(p => p._team.type !== '1');
  }

  // Apply advanced filters
  const f = _advFilters;

  if (f.name) {
    const q = normalizeText(f.name);
    unique = unique.filter(p => normalizeText(p.Name).includes(q));
  }
  if (f.position) {
    unique = unique.filter(p => p.Position === f.position);
  }
  if (f.role) {
    const rolePosSet = new Set(ROLE_POSITIONS[f.role] || []);
    unique = unique.filter(p => rolePosSet.has(p.Position));
  }
  if (f.nationality) {
    unique = unique.filter(p => (p.Nationality || '') === f.nationality);
  }
  if (f.club) {
    unique = unique.filter(p => p._team.id === f.club);
  }
  if (f.minAge !== '') {
    const min = parseInt(f.minAge, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Age'], 10) || 0) >= min);
  }
  if (f.maxAge !== '') {
    const max = parseInt(f.maxAge, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Age'], 10) || 0) <= max);
  }
  if (f.minHeight !== '') {
    const min = parseInt(f.minHeight, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Height'], 10) || 0) >= min);
  }
  if (f.maxHeight !== '') {
    const max = parseInt(f.maxHeight, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Height'], 10) || 0) <= max);
  }
  if (f.minWeight !== '') {
    const min = parseInt(f.minWeight, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Weight'], 10) || 0) >= min);
  }
  if (f.maxWeight !== '') {
    const max = parseInt(f.maxWeight, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Weight'], 10) || 0) <= max);
  }
  if (f.foot) {
    // Foot column: 'True' = left foot, 'False' = right foot
    if (f.foot === 'left')  unique = unique.filter(p => p['Foot'] === 'True');
    if (f.foot === 'right') unique = unique.filter(p => p['Foot'] === 'False');
  }
  if (f.minOvr !== '') {
    const min = parseInt(f.minOvr, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p.Overall, 10) || 0) >= min);
  }
  if (f.maxOvr !== '') {
    const max = parseInt(f.maxOvr, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p.Overall, 10) || 0) <= max);
  }
  if (f.hasFaceScan !== '') {
    unique = unique.filter(p => {
      const app = DB.appearanceMap ? DB.appearanceMap[p.ID] : null;
      const idFace = app ? (app['Id_Face'] || '0') : '0';
      const hasScan = idFace !== '0' && idFace !== '';
      return f.hasFaceScan === 'yes' ? hasScan : !hasScan;
    });
  }

  // League filter
  if (f.league) {
    const leagueTeamIds = new Set();
    const league = DB.leagues ? DB.leagues.find(l => l.id === f.league) : null;
    if (league) league.teamIds.forEach(id => leagueTeamIds.add(id));
    unique = unique.filter(p => leagueTeamIds.has(p._team.id));
  }
  // Playing style filter
  if (f.playingStyle) {
    unique = unique.filter(p => (p['PlayingStyle'] || '') === f.playingStyle);
  }
  // Speed filter
  if (f.minSpeed !== '') {
    const min = parseInt(f.minSpeed, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Speed'], 10) || 0) >= min);
  }
  if (f.maxSpeed !== '') {
    const max = parseInt(f.maxSpeed, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Speed'], 10) || 0) <= max);
  }
  // Shooting filter (Finishing)
  if (f.minShooting !== '') {
    const min = parseInt(f.minShooting, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Finishing'], 10) || 0) >= min);
  }
  if (f.maxShooting !== '') {
    const max = parseInt(f.maxShooting, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Finishing'], 10) || 0) <= max);
  }
  // Passing filter (Low Pass)
  if (f.minPassing !== '') {
    const min = parseInt(f.minPassing, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Low Pass'], 10) || 0) >= min);
  }
  if (f.maxPassing !== '') {
    const max = parseInt(f.maxPassing, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Low Pass'], 10) || 0) <= max);
  }
  if (f.minDribbling !== '') {
    const min = parseInt(f.minDribbling, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Dribbling'], 10) || 0) >= min);
  }
  if (f.maxDribbling !== '') {
    const max = parseInt(f.maxDribbling, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Dribbling'], 10) || 0) <= max);
  }
  if (f.minDefense !== '') {
    const min = parseInt(f.minDefense, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Defensive Prowess'], 10) || 0) >= min);
  }
  if (f.maxDefense !== '') {
    const max = parseInt(f.maxDefense, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Defensive Prowess'], 10) || 0) <= max);
  }
  if (f.minPhysical !== '') {
    const min = parseInt(f.minPhysical, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Physical Contact'], 10) || 0) >= min);
  }
  if (f.maxPhysical !== '') {
    const max = parseInt(f.maxPhysical, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Physical Contact'], 10) || 0) <= max);
  }
  if (f.minStamina !== '') {
    const min = parseInt(f.minStamina, 10);
    if (!isNaN(min)) unique = unique.filter(p => (parseInt(p['Stamina'], 10) || 0) >= min);
  }
  if (f.maxStamina !== '') {
    const max = parseInt(f.maxStamina, 10);
    if (!isNaN(max)) unique = unique.filter(p => (parseInt(p['Stamina'], 10) || 0) <= max);
  }
  STAT_FILTERS.forEach(stat => {
    const minValue = f[stat.minKey];
    const maxValue = f[stat.maxKey];
    if (minValue !== '') {
      const min = parseInt(minValue, 10);
      if (!isNaN(min)) unique = unique.filter(p => (parseInt(p[stat.csvCol], 10) || 0) >= min);
    }
    if (maxValue !== '') {
      const max = parseInt(maxValue, 10);
      if (!isNaN(max)) unique = unique.filter(p => (parseInt(p[stat.csvCol], 10) || 0) <= max);
    }
  });
  // Skill filter: selected players must have every selected skill.
  const selectedSkills = _selectedSkillCodes(f.skills);
  if (selectedSkills.length) {
    unique = unique.filter(p => selectedSkills.every(skill => p[skill] === 'True'));
  }
  // COM style filter
  if (f.comStyle) {
    unique = unique.filter(p => p[f.comStyle] === 'True');
  }

  _applyPlayerSort(unique);
  _allPlayersList = unique;
}

/**
 * Build pagination controls HTML.
 * @param {number} total      - total number of items
 * @param {number} currentPage - 1-based current page
 * @param {number} pageSize   - items per page
 * @param {string} onPageFn   - name of the JS function to call with a page number
 */
function _buildPaginationControls(total, currentPage, pageSize, onPageFn) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return '';

  const WINDOW = 2;
  const pages = [];

  pages.push(1);
  if (currentPage - WINDOW > 2) pages.push('…');
  for (let p = Math.max(2, currentPage - WINDOW); p <= Math.min(totalPages - 1, currentPage + WINDOW); p++) {
    pages.push(p);
  }
  if (currentPage + WINDOW < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);

  const pageButtons = pages.map(p => {
    if (p === '…') return `<span class="page-ellipsis">…</span>`;
    return `<button class="page-btn${p === currentPage ? ' active' : ''}" onclick="${onPageFn}(${p})" ${p === currentPage ? 'disabled' : ''}>${p}</button>`;
  }).join('');

  return `
    <div class="pagination">
      <button class="page-btn page-nav" onclick="${onPageFn}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹ Anterior</button>
      <div class="page-numbers">${pageButtons}</div>
      <button class="page-btn page-nav" onclick="${onPageFn}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Siguiente ›</button>
    </div>`;
}

/**
 * Render the current page of all-players into the table body and update
 * the pagination controls and subtitle.
 */
function _renderPlayersPage() {
  const tbody = document.getElementById('all-players-tbody');
  const paginationEl = document.getElementById('all-players-pagination');
  if (!tbody) return;

  const total = _allPlayersList.length;
  const start = (_allPlayersPage - 1) * PLAYERS_PAGE_SIZE;
  const pagePlayers = _allPlayersList.slice(start, start + PLAYERS_PAGE_SIZE);

  const table = tbody.closest('table');
  if (table) {
    const oldHead = table.querySelector('thead');
    if (oldHead) oldHead.outerHTML = _buildPlayerTableHead();
  }
  tbody.innerHTML = pagePlayers.map(p => renderPlayerRow(p, p._team)).join('');

  if (paginationEl) {
    paginationEl.innerHTML = _buildPaginationControls(total, _allPlayersPage, PLAYERS_PAGE_SIZE, 'goToPlayersPage');
  }

  const subtitle = document.getElementById('all-players-subtitle');
  if (subtitle) {
    const totalPages = Math.ceil(total / PLAYERS_PAGE_SIZE) || 1;
    subtitle.textContent = `${total} jugadores · página ${_allPlayersPage} de ${totalPages}`;
  }
  _syncMobilePlayerSortControls();
}

function sortPlayersBy(key) {
  if (_playerSort.key !== key) {
    _playerSort = { key, dir: (key === 'name' || key === 'team' || key === 'nationality' || key === 'position') ? 'asc' : 'desc' };
  } else if (_playerSort.dir === 'desc') {
    _playerSort.dir = 'asc';
  } else if (_playerSort.dir === 'asc') {
    _playerSort = { key: null, dir: null };
  } else {
    _playerSort.dir = 'desc';
  }
  _prepareAllPlayersList();
  _allPlayersPage = 1;
  _renderPlayersPage();
}

function setMobilePlayerSort(key) {
  if (!key) {
    _playerSort = { key: null, dir: null };
  } else {
    _playerSort = {
      key,
      dir: (key === 'name' || key === 'team' || key === 'nationality' || key === 'position') ? 'asc' : 'desc',
    };
  }
  _prepareAllPlayersList();
  _allPlayersPage = 1;
  _renderPlayersPage();
}

function toggleMobilePlayerSortDir() {
  if (!_playerSort.key) return;
  _playerSort.dir = _playerSort.dir === 'asc' ? 'desc' : 'asc';
  _prepareAllPlayersList();
  _allPlayersPage = 1;
  _renderPlayersPage();
}

function resetMobilePlayerSort() {
  _playerSort = { key: null, dir: null };
  _prepareAllPlayersList();
  _allPlayersPage = 1;
  _renderPlayersPage();
}

function _syncMobilePlayerSortControls() {
  const select = document.getElementById('mobile-player-sort-key');
  const dirBtn = document.getElementById('mobile-player-sort-dir');
  if (select) select.value = _playerSort.key || '';
  if (dirBtn) {
    dirBtn.textContent = _playerSort.dir === 'asc' ? 'A-Z / menor-mayor' : 'Z-A / mayor-menor';
    dirBtn.disabled = !_playerSort.key;
  }
}

function _sortClass(key) {
  return _playerSort.key === key && _playerSort.dir ? ` sort-${_playerSort.dir}` : '';
}

function _sortIcon(key) {
  if (_playerSort.key !== key || !_playerSort.dir) return '↕';
  return _playerSort.dir === 'asc' ? '▲' : '▼';
}

function _buildPlayerTableHead() {
  const th = (key, label, extra = '') =>
    `<th class="sortable${_sortClass(key)} ${extra}" onclick="sortPlayersBy('${key}')">${label}<span class="sort-icon">${_sortIcon(key)}</span></th>`;
  return `
    <thead>
      <tr>
        <th></th><th class="desktop-stat"></th>${th('name', 'Nombre')}${th('nationality', 'Nac')}${th('position', 'Pos')}
        ${th('team', 'Equipo', 'mobile-team-col')}${th('ovr', 'OVR')}${th('rit', 'RIT', 'desktop-stat')}${th('dri', 'DRI', 'desktop-stat')}${th('tir', 'TIR', 'desktop-stat')}${th('pas', 'PAS', 'desktop-stat')}${th('fis', 'FIS', 'desktop-stat')}${th('def', 'DEF', 'desktop-stat')}
        <th class="fav-col"></th>
      </tr>
    </thead>`;
}

function applyQuickPlayerFilter(type, value) {
  if (!value) return;
  if (type === 'position') _advFilters.position = value;
  if (type === 'nationality') _advFilters.nationality = value;
  if (type === 'club') _advFilters.club = value;
  _playerFiltersOpen = true;
  _showAllPlayersInternal(true);
  saveNavState({ view: 'players', filters: { ..._advFilters }, specialPlayers: _showSpecialPlayers, page: 1 });
}

/**
 * Navigate to the given page in the all-players view.
 * @param {number} page         - 1-based target page
 * @param {boolean} [scrollToTop=true]
 */
function goToPlayersPage(page, scrollToTop) {
  const totalPages = Math.ceil(_allPlayersList.length / PLAYERS_PAGE_SIZE) || 1;
  _allPlayersPage = Math.max(1, Math.min(page, totalPages));
  saveNavState({ view: 'players', filters: { ..._advFilters }, specialPlayers: _showSpecialPlayers, page: _allPlayersPage });
  _renderPlayersPage();
  if (scrollToTop !== false) {
    const view = document.getElementById('players-view');
    if (view) view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function _buildRangeFilter(label, minId, maxId, min, max, minValue, maxValue) {
  return `
    <div class="adv-filter-group adv-filter-range">
      <label>${label}</label>
      <div class="range-inputs">
        <input type="number" id="${minId}" placeholder="Min" min="${min}" max="${max}" value="${minValue || ''}" oninput="onAdvFilterChange()">
        <span>-</span>
        <input type="number" id="${maxId}" placeholder="Max" min="${min}" max="${max}" value="${maxValue || ''}" oninput="onAdvFilterChange()">
      </div>
    </div>`;
}

function _buildActiveFiltersSummary() {
  const items = [];
  const f = _advFilters;
  const add = (label, value) => {
    if (value !== undefined && value !== null && value !== '') items.push(`${label}: ${value}`);
  };

  add('Nombre', f.name);
  add('Club', f.club ? (DB.teams.find(t => t.id === f.club) || {}).displayName : '');
  add('Liga', f.league ? (DB.leagues.find(l => l.id === f.league) || {}).name : '');
  add('Nacionalidad', f.nationality ? nationalityName(f.nationality) : '');
  add('Posicion', f.position ? translatePosition(f.position) : '');
  if (f.minOvr || f.maxOvr) add('Media', `${f.minOvr || '0'}-${f.maxOvr || '99'}`);
  if (f.role) add('Rol', f.role);
  if (f.playingStyle) add('Estilo', PLAYING_STYLE_LABELS[f.playingStyle] || f.playingStyle);
  if (f.comStyle) add('COM', (COM_STYLES_LABELS.find(([key]) => key === f.comStyle) || [null, f.comStyle])[1]);
  if (f.foot) add('Pie', f.foot === 'left' ? 'Izquierdo' : 'Derecho');
  if (f.hasFaceScan) add('Cara', f.hasFaceScan === 'yes' ? 'Si' : 'No');
  if (f.minAge || f.maxAge) add('Edad', `${f.minAge || '15'}-${f.maxAge || '50'}`);
  if (f.minHeight || f.maxHeight) add('Altura', `${f.minHeight || '150'}-${f.maxHeight || '220'}`);
  if (f.minWeight || f.maxWeight) add('Peso', `${f.minWeight || '50'}-${f.maxWeight || '120'}`);

  STAT_FILTERS.forEach(stat => {
    if (f[stat.minKey] || f[stat.maxKey]) {
      add(stat.label, `${f[stat.minKey] || stat.min}-${f[stat.maxKey] || stat.max}`);
    }
  });

  const selectedSkills = _selectedSkillCodes(f.skills)
    .map(code => (PLAYER_SKILLS_LABELS.find(([key]) => key === code) || [null, code])[1]);
  if (selectedSkills.length) add('Habilidades', selectedSkills.join(', '));

  if (!items.length) {
    return `<div class="active-filters active-filters-empty" id="active-filters-summary">Sin filtros activos</div>`;
  }

  return `
    <div class="active-filters" id="active-filters-summary">
      <span class="active-filters-label">Filtros activos</span>
      <div class="active-filter-tags">
        ${items.map(item => `<span class="active-filter-tag">${escapeHtml(item)}</span>`).join('')}
      </div>
    </div>`;
}

function _buildFilterPanel() {
  const teamsInLeagues = _getTeamsInLeagues();

  const clubPlayerIds = new Set(DB.players.filter(p => p._team.type !== '2').map(p => p.ID));
  const seen = new Set();
  const basePlayers = DB.players.filter(p => {
    if (p._team.type === '2' && clubPlayerIds.has(p.ID)) return false;
    if (seen.has(p.ID)) return false;
    seen.add(p.ID);
    return teamsInLeagues.has(p._team.id);
  });

  const nationalities = [...new Set(basePlayers.map(p => p.Nationality || '').filter(Boolean))]
    .sort((a, b) => nationalityName(a).localeCompare(nationalityName(b), 'es'));
  const clubTeams = DB.teams
    .filter(t => t.type !== '2' && t.players.length > 0 && teamsInLeagues.has(t.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  const f = _advFilters;
  const natOptions = nationalities.map(n =>
    `<option value="${n}"${f.nationality === n ? ' selected' : ''}>${nationalityName(n)}</option>`
  ).join('');
  const clubOptions = clubTeams.map(t =>
    `<option value="${t.id}"${f.club === t.id ? ' selected' : ''}>${escapeHtml(t.displayName)}</option>`
  ).join('');
  const leagueOptions = DB.leagues
    .filter(l => l.name && l.id !== '9001' && l.id !== '9002')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map(l => `<option value="${l.id}"${f.league === l.id ? ' selected' : ''}>${escapeHtml(l.name)}</option>`)
    .join('');
  const posOptions = PES_POSITIONS.map(p =>
    `<option value="${p}"${f.position === p ? ' selected' : ''}>${translatePosition(p)} (${p})</option>`
  ).join('');

  const selectedSkills = new Set(_selectedSkillCodes(f.skills));
  const skillOptions = PLAYER_SKILLS_LABELS.map(([key, label]) => `
    <label class="skill-check${selectedSkills.has(key) ? ' is-selected' : ''}">
      <input type="checkbox" value="${key}"${selectedSkills.has(key) ? ' checked' : ''} onchange="onAdvFilterChange()">
      <span>${escapeHtml(label)}</span>
    </label>`).join('');

  const statFiltersHtml = STAT_FILTERS.map(stat =>
    _buildRangeFilter(escapeHtml(stat.label), `flt-${stat.minKey}`, `flt-${stat.maxKey}`, stat.min, stat.max, f[stat.minKey], f[stat.maxKey])
  ).join('');

  const advancedOpen = _advancedFiltersOpen || _hasActiveAdvancedFilters();
  const advancedToggleLabel = advancedOpen ? 'Ocultar filtros avanzados' : 'Mostrar filtros avanzados';
  const panelOpen = _playerFiltersOpen || _hasActiveFilters();

  return `
    <div class="adv-filter-panel" id="adv-filter-panel">
      <div class="filter-panel-head">
        <div>
          <div class="filter-panel-title">Filtros de jugadores</div>
          <div class="filter-panel-subtitle">Usa lo basico para buscar rapido y abre lo avanzado cuando necesites precision.</div>
        </div>
        <div class="filter-panel-actions">
          <button type="button" class="advanced-filter-toggle" id="btn-toggle-player-filters" onclick="togglePlayerFilters()">${panelOpen ? 'Ocultar filtros' : 'Mostrar filtros'}</button>
          <button type="button" class="adv-filter-reset" id="btn-clear-filters" onclick="resetAdvancedFilters()" ${_hasActiveFilters() ? '' : 'disabled'}>Limpiar filtros</button>
        </div>
      </div>

      ${_buildActiveFiltersSummary()}

      <div id="player-filter-body" ${panelOpen ? '' : 'hidden'}>
      <section class="filter-section filter-section-basic">
        <div class="filter-section-title">Filtros basicos</div>
        <div class="adv-filter-grid basic-filter-grid">
          <div class="adv-filter-group">
            <label>Nombre</label>
            <input type="text" id="flt-name" placeholder="Buscar jugador" value="${escapeHtml(f.name)}" oninput="onAdvFilterChange()">
          </div>
          <div class="adv-filter-group">
            <label>Club</label>
            <select id="flt-club" onchange="onAdvFilterChange()">
              <option value="">Todos</option>
              ${clubOptions}
            </select>
          </div>
          <div class="adv-filter-group">
            <label>Liga</label>
            <select id="flt-league" onchange="onAdvFilterChange()">
              <option value="">Todas</option>
              ${leagueOptions}
            </select>
          </div>
          <div class="adv-filter-group">
            <label>Nacionalidad</label>
            <select id="flt-nationality" onchange="onAdvFilterChange()">
              <option value="">Todas</option>
              ${natOptions}
            </select>
          </div>
          <div class="adv-filter-group">
            <label>Posicion</label>
            <select id="flt-position" onchange="onAdvFilterChange()">
              <option value="">Todas</option>
              ${posOptions}
            </select>
          </div>
          ${_buildRangeFilter('Media', 'flt-min-ovr', 'flt-max-ovr', 0, 99, f.minOvr, f.maxOvr)}
        </div>
      </section>

      <div class="advanced-filter-toggle-row">
        <button type="button" id="btn-toggle-advanced-filters" class="advanced-filter-toggle" onclick="toggleAdvancedFilters()">
          ${advancedToggleLabel}
        </button>
      </div>

      <div id="advanced-filter-section" class="advanced-filter-section${advancedOpen ? ' is-open' : ''}" ${advancedOpen ? '' : 'hidden'}>
        <section class="filter-section">
          <div class="filter-section-title">Datos avanzados</div>
          <div class="adv-filter-grid">
            <div class="adv-filter-group">
              <label>Rol</label>
              <select id="flt-role" onchange="onAdvFilterChange()">
                <option value="">Todos</option>
                <option value="GK"${f.role === 'GK' ? ' selected' : ''}>Portero</option>
                <option value="DEF"${f.role === 'DEF' ? ' selected' : ''}>Defensa</option>
                <option value="MID"${f.role === 'MID' ? ' selected' : ''}>Mediocampista</option>
                <option value="FWD"${f.role === 'FWD' ? ' selected' : ''}>Delantero</option>
              </select>
            </div>
            <div class="adv-filter-group">
              <label>Estilo de juego</label>
              <select id="flt-playing-style" onchange="onAdvFilterChange()">
                <option value="">Todos</option>
                ${Object.entries(PLAYING_STYLE_LABELS).map(([k,v]) => `<option value="${k}"${f.playingStyle === k ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('')}
              </select>
            </div>
            <div class="adv-filter-group">
              <label>Estilo COM</label>
              <select id="flt-com-style" onchange="onAdvFilterChange()">
                <option value="">Cualquiera</option>
                ${COM_STYLES_LABELS.map(([k,v]) => `<option value="${k}"${f.comStyle === k ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('')}
              </select>
            </div>
            <div class="adv-filter-group">
              <label>Pie dominante</label>
              <select id="flt-foot" onchange="onAdvFilterChange()">
                <option value="">Cualquiera</option>
                <option value="right"${f.foot === 'right' ? ' selected' : ''}>Derecho</option>
                <option value="left"${f.foot === 'left' ? ' selected' : ''}>Izquierdo</option>
              </select>
            </div>
            <div class="adv-filter-group">
              <label>Cara escaneada</label>
              <select id="flt-facescan" onchange="onAdvFilterChange()">
                <option value="">Todos</option>
                <option value="yes"${f.hasFaceScan === 'yes' ? ' selected' : ''}>Si</option>
                <option value="no"${f.hasFaceScan === 'no' ? ' selected' : ''}>No</option>
              </select>
            </div>
            ${_buildRangeFilter('Edad', 'flt-min-age', 'flt-max-age', 15, 50, f.minAge, f.maxAge)}
            ${_buildRangeFilter('Altura', 'flt-min-height', 'flt-max-height', 150, 220, f.minHeight, f.maxHeight)}
            ${_buildRangeFilter('Peso', 'flt-min-weight', 'flt-max-weight', 50, 120, f.minWeight, f.maxWeight)}
          </div>
        </section>

        <section class="filter-section">
          <div class="filter-section-title">Stats del jugador</div>
          <div class="adv-filter-grid stat-filter-grid">
            ${statFiltersHtml}
          </div>
        </section>

        <section class="filter-section">
          <div class="filter-section-title">Habilidades</div>
          <div class="skill-filter-grid" id="flt-skills">
            ${skillOptions}
          </div>
          <p class="filter-help">Se muestran jugadores que tengan todas las habilidades elegidas.</p>
        </section>
      </div>
      </div>
    </div>`;
}
function onAdvFilterChange() {
  _advFilters.name       = (document.getElementById('flt-name')       || {}).value || '';
  _advFilters.position   = (document.getElementById('flt-position')   || {}).value || '';
  _advFilters.role       = (document.getElementById('flt-role')       || {}).value || '';
  _advFilters.nationality= (document.getElementById('flt-nationality') || {}).value || '';
  _advFilters.club       = (document.getElementById('flt-club')       || {}).value || '';
  _advFilters.foot       = (document.getElementById('flt-foot')       || {}).value || '';
  _advFilters.hasFaceScan= (document.getElementById('flt-facescan')   || {}).value || '';
  _advFilters.minOvr     = (document.getElementById('flt-min-ovr')    || {}).value || '';
  _advFilters.maxOvr     = (document.getElementById('flt-max-ovr')    || {}).value || '';
  _advFilters.minAge     = (document.getElementById('flt-min-age')    || {}).value || '';
  _advFilters.maxAge     = (document.getElementById('flt-max-age')    || {}).value || '';
  _advFilters.minHeight  = (document.getElementById('flt-min-height') || {}).value || '';
  _advFilters.maxHeight  = (document.getElementById('flt-max-height') || {}).value || '';
  _advFilters.minWeight  = (document.getElementById('flt-min-weight') || {}).value || '';
  _advFilters.maxWeight  = (document.getElementById('flt-max-weight') || {}).value || '';
  _advFilters.league       = (document.getElementById('flt-league')         || {}).value || '';
  _advFilters.playingStyle = (document.getElementById('flt-playing-style')  || {}).value || '';
  _advFilters.minSpeed     = (document.getElementById('flt-min-speed')      || {}).value || '';
  _advFilters.maxSpeed     = (document.getElementById('flt-max-speed')      || {}).value || '';
  _advFilters.minShooting  = (document.getElementById('flt-min-shooting')   || {}).value || '';
  _advFilters.maxShooting  = (document.getElementById('flt-max-shooting')   || {}).value || '';
  _advFilters.minPassing   = (document.getElementById('flt-min-passing')    || {}).value || '';
  _advFilters.maxPassing   = (document.getElementById('flt-max-passing')    || {}).value || '';
  _advFilters.minDribbling = (document.getElementById('flt-min-dribbling')  || {}).value || '';
  _advFilters.maxDribbling = (document.getElementById('flt-max-dribbling')  || {}).value || '';
  _advFilters.minDefense   = (document.getElementById('flt-min-defense')    || {}).value || '';
  _advFilters.maxDefense   = (document.getElementById('flt-max-defense')    || {}).value || '';
  _advFilters.minPhysical  = (document.getElementById('flt-min-physical')   || {}).value || '';
  _advFilters.maxPhysical  = (document.getElementById('flt-max-physical')   || {}).value || '';
  _advFilters.minStamina   = (document.getElementById('flt-min-stamina')    || {}).value || '';
  _advFilters.maxStamina   = (document.getElementById('flt-max-stamina')    || {}).value || '';
  STAT_FILTERS.forEach(stat => {
    _advFilters[stat.minKey] = (document.getElementById(`flt-${stat.minKey}`) || {}).value || '';
    _advFilters[stat.maxKey] = (document.getElementById(`flt-${stat.maxKey}`) || {}).value || '';
  });
  _advFilters.skills       = Array.from(document.querySelectorAll('#flt-skills input[type="checkbox"]:checked')).map(el => el.value).join(',');
  _advFilters.comStyle     = (document.getElementById('flt-com-style')      || {}).value || '';

  _prepareAllPlayersList();
  _allPlayersPage = 1;
  saveNavState({ view: 'players', filters: { ..._advFilters }, specialPlayers: _showSpecialPlayers, page: 1 });
  const summary = document.getElementById('active-filters-summary');
  if (summary) summary.outerHTML = _buildActiveFiltersSummary();
  const clearBtn = document.getElementById('btn-clear-filters');
  if (clearBtn) clearBtn.disabled = !_hasActiveFilters();
  document.querySelectorAll('#flt-skills .skill-check').forEach(label => {
    const input = label.querySelector('input[type="checkbox"]');
    label.classList.toggle('is-selected', !!input && input.checked);
  });
  _renderPlayersPage();
}

function resetAdvancedFilters() {
  Object.keys(_advFilters).forEach(k => { _advFilters[k] = ''; });
  // Reset all filter inputs
  ['flt-name','flt-position','flt-role','flt-nationality','flt-league','flt-club','flt-foot','flt-facescan',
   'flt-min-ovr','flt-max-ovr','flt-min-age','flt-max-age',
   'flt-min-height','flt-max-height','flt-min-weight','flt-max-weight',
   'flt-playing-style','flt-com-style',
   'flt-min-speed','flt-max-speed','flt-min-shooting','flt-max-shooting',
   'flt-min-passing','flt-max-passing','flt-min-dribbling','flt-max-dribbling',
   'flt-min-defense','flt-max-defense','flt-min-physical','flt-max-physical',
   'flt-min-stamina','flt-max-stamina',
   ...STAT_FILTERS.flatMap(stat => [`flt-${stat.minKey}`, `flt-${stat.maxKey}`])].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('#flt-skills input[type="checkbox"]').forEach(el => { el.checked = false; });
  _advancedFiltersOpen = false;
  _playerFiltersOpen = false;
  onAdvFilterChange();
}

function togglePlayerFilters() {
  _playerFiltersOpen = !_playerFiltersOpen;
  const body = document.getElementById('player-filter-body');
  const btn = document.getElementById('btn-toggle-player-filters');
  if (body) body.hidden = !_playerFiltersOpen;
  if (btn) btn.textContent = _playerFiltersOpen ? 'Ocultar filtros' : 'Mostrar filtros';
}

function toggleAdvancedFilters() {
  _advancedFiltersOpen = !_advancedFiltersOpen;
  const section = document.getElementById('advanced-filter-section');
  const btn = document.getElementById('btn-toggle-advanced-filters');
  if (section) {
    section.hidden = !_advancedFiltersOpen;
    section.classList.toggle('is-open', _advancedFiltersOpen);
  }
  if (btn) btn.textContent = _advancedFiltersOpen ? 'Ocultar filtros avanzados' : 'Mostrar filtros avanzados';
}
function toggleSpecialPlayers() {
  _showSpecialPlayers = !_showSpecialPlayers;
  const btn = document.getElementById('btn-toggle-special');
  if (btn) btn.classList.toggle('active', _showSpecialPlayers);
  _prepareAllPlayersList();
  _allPlayersPage = 1;
  saveNavState({ view: 'players', filters: { ..._advFilters }, specialPlayers: _showSpecialPlayers, page: 1 });
  _renderPlayersPage();
}

/** Internal: render all-players view without saving nav state. */
function _showAllPlayersInternal(resetPage) {
  _setActiveSidebarNav('players');

  hideAllViews();
  const view = document.getElementById('players-view');
  view.classList.add('active');

  if (resetPage !== false) _allPlayersPage = 1;
  _prepareAllPlayersList();
  const total = _allPlayersList.length;

  if (_hasActiveAdvancedFilters()) _advancedFiltersOpen = true;
  if (_hasActiveFilters()) _playerFiltersOpen = true;

  // Render skeleton: header + filter panel + table + pagination placeholder
  view.innerHTML = `
    ${renderBreadcrumbTrail([{ label: 'Inicio', href: 'index.html' }, { label: 'Base de datos', href: 'database.html' }, { label: 'Jugadores' }])}
    <div class="view-header">
      <div>
        <div class="view-title">Todos los jugadores</div>
        <div class="view-subtitle" id="all-players-subtitle">${total} jugadores · página 1 de ${Math.ceil(total / PLAYERS_PAGE_SIZE) || 1}</div>
      </div>
      <div class="view-header-actions">
        <button id="btn-toggle-special" class="adv-filter-toggle${_showSpecialPlayers ? ' active' : ''}" onclick="toggleSpecialPlayers()">★ Jugadores especiales</button>
      </div>
    </div>
    ${_buildFilterPanel()}
    <div class="mobile-sort-controls" aria-label="Ordenar jugadores">
      <label for="mobile-player-sort-key">Ordenar</label>
      <select id="mobile-player-sort-key" onchange="setMobilePlayerSort(this.value)">
        <option value="">Orden original</option>
        <option value="ovr">OVR</option>
        <option value="name">Nombre</option>
        <option value="age">Edad</option>
        <option value="position">Posicion</option>
        <option value="team">Equipo</option>
        <option value="nationality">Nacionalidad</option>
        <option value="rit">Ritmo</option>
        <option value="dri">Regate</option>
        <option value="tir">Tiro</option>
        <option value="pas">Pase</option>
        <option value="fis">Fisico</option>
        <option value="def">Defensa</option>
      </select>
      <button type="button" id="mobile-player-sort-dir" onclick="toggleMobilePlayerSortDir()">Z-A / mayor-menor</button>
      <button type="button" onclick="resetMobilePlayerSort()">Reset</button>
    </div>
    <div class="table-responsive">
      <table class="players-table players-table--directory">
        ${_buildPlayerTableHead()}
        <tbody id="all-players-tbody"></tbody>
      </table>
    </div>
    <div id="all-players-pagination"></div>`;


  // Render the first page
  _renderPlayersPage();
}

function showAllPlayers(resetPage) {
  if (resetPage !== false) _allPlayersPage = 1;
  saveNavState({ view: 'players', filters: { ..._advFilters }, specialPlayers: _showSpecialPlayers, page: _allPlayersPage });
  _showAllPlayersInternal(resetPage);
}

// ─── Team / Players view ──────────────────────────────────────────────────────

let currentTeam = null;

function selectTeam(teamId) {
  window.location.href = `team.html?id=${encodeURIComponent(teamId)}`;
}

function renderPlayersList(team) {
  hideAllViews();

  const view = document.getElementById('players-view');
  view.classList.add('active');

  const typeLabel = TYPE_LABELS[team.type] || '';

  view.innerHTML = `
    <div class="view-header">
      <a href="team.html?id=${team.id}">
        <img class="team-crest" src="img/teams/${team.id}.webp"
          onerror="this.onerror=null;this.src='img/teams/default.webp'"
          alt="${team.displayName}" title="Ver página del equipo">
      </a>
      <div>
        <a class="view-title-link" href="team.html?id=${team.id}">${team.displayName}</a>
        <div class="view-subtitle">${typeLabel}</div>
      </div>
    </div>
    <table class="players-table">
      <thead>
        <tr>
          <th></th>
          <th></th>
          <th>Nombre</th>
          <th>Nac</th>
          <th>Pos</th>
          <th>OVR</th>
          <th>RIT</th>
          <th>DRI</th>
          <th>TIR</th>
          <th>PAS</th>
          <th>FIS</th>
          <th>DEF</th>
          <th class="fav-col"></th>
        </tr>
      </thead>
      <tbody>
        ${team.players.map(p => renderPlayerRow(p, team)).join('')}
      </tbody>
    </table>`;
}

function renderPlayerRow(player, team) {
  const ovr = player.Overall || '–';
  const ovrColor = statColor(ovr);
  const ovrTextColor = statTextColor(ovrColor);
  const posDisplay = translatePosition(player.Position);
  const radarAttrs = computeRadarAttributes(player);
  const nationalNote = player._playsForNational
    ? `<span class="national-team-badge" title="También juega para su selección">🌍</span>`
    : '';
  const fav = isFavorite(player.ID, team.id);

  return `<tr onclick="selectPlayer('${player.ID}', '${team.id}')">
    <td>
      <img class="player-row-photo"
        src="img/players/${player.ID}.webp"
        loading="lazy"
        onerror="handleMinifaceError(this,'${player.ID}')"
        alt="${player.Name}">
    </td>
    <td class="team-crest-cell desktop-stat">
      <a href="team.html?id=${team.id}" onclick="event.stopPropagation()">
        <img class="player-row-team-crest"
          src="img/teams/${team.id}.webp"
          loading="lazy"
          onerror="this.onerror=null;this.src='img/teams/default.webp'"
          alt="${team.displayName}"
          title="${team.displayName}">
      </a>
    </td>
    <td><strong>${player.Name || '–'}</strong>${nationalNote}</td>
    <td>
      <img class="player-flag"
        src="${flagSrc(player.Nationality)}"
        onerror="this.onerror=null;this.src='img/flags/default.webp'"
        onclick="event.stopPropagation();applyQuickPlayerFilter('nationality','${player.Nationality}')"
        title="${nationalityName(player.Nationality)}"
        alt="${nationalityName(player.Nationality)}">
    </td>
    <td><span class="position-badge quick-filter-chip" onclick="event.stopPropagation();applyQuickPlayerFilter('position','${player.Position}')" style="${positionBadgeStyle(player.Position)}">${posDisplay || '–'}</span></td>
    <td class="mobile-team-col"><button type="button" class="row-team-filter" onclick="event.stopPropagation();applyQuickPlayerFilter('club','${team.id}')">${team.displayName}</button></td>
    <td><span class="overall-badge" style="background:${ovrColor};color:${ovrTextColor}">${ovr}</span></td>
    <td class="desktop-stat">${radarAttrs.RIT}</td>
    <td class="desktop-stat">${radarAttrs.DRI}</td>
    <td class="desktop-stat">${radarAttrs.TIR}</td>
    <td class="desktop-stat">${radarAttrs.PAS}</td>
    <td class="desktop-stat">${radarAttrs.FIS}</td>
    <td class="desktop-stat">${radarAttrs.DEF}</td>
    <td class="fav-col" onclick="event.stopPropagation()">
      <button class="fav-btn${fav ? ' is-fav' : ''}"
        onclick="toggleFavoriteFromBtn(this,'${player.ID}','${team.id}')"
        title="${fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}"
        aria-label="Favorito">
        ${fav ? '★' : '☆'}
      </button>
    </td>
  </tr>`;
}

// ─── Player profile ───────────────────────────────────────────────────────────

function selectPlayer(playerId, teamId) {
  window.location.href = `player.html?id=${encodeURIComponent(playerId)}&team=${encodeURIComponent(teamId)}`;
}

/**
 * Compute the 6 radar chart attributes from raw player CSV stats.
 */
function computeRadarAttributes(player) {
  const avg = (...keys) => {
    const vals = keys.map(k => parseInt(player[k], 10)).filter(v => !isNaN(v));
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };
  const isGK = (player.Position || '') === 'GK';

  return {
    PAS: avg('Low Pass', 'Lofted Pass', 'Controlled Spin', 'Place Kicking'),
    TIR: avg('Finishing', 'Attacking Prowess'),
    FIS: isGK ? avg('Physical Contact') : avg('Physical Contact', 'Stamina'),
    DEF: avg('Defensive Prowess'),
    RIT: isGK ? avg('Speed') : avg('Speed', 'Explosive Power'),
    DRI: avg('Dribbling', 'Ball Control'),
  };
}

/**
 * Compute average OVR of top 16 players on a team.
 */
function teamAvgOvr(team) {
  const ovrs = (team.players || [])
    .map(p => parseInt(p.Overall, 10))
    .filter(v => !isNaN(v) && v > 0)
    .sort((a, b) => b - a)
    .slice(0, 16);
  if (!ovrs.length) return null;
  return Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length);
}

function renderPlayerProfile(player, team) {
  hideAllViews();
  const view = document.getElementById('player-view');
  view.classList.add('active');

  const appearance = team.appearanceMap ? team.appearanceMap[player.ID] : null;
  const radarAttrs = computeRadarAttributes(player);
  const typeLabel = TYPE_LABELS[team.type] || '';
  const posDisplay = translatePosition(player.Position);

  const statsHtml = Object.entries(STAT_LABELS).map(([csvCol, label]) => {
    const val = player[csvCol] || '0';
    const v = parseInt(val, 10) || 0;
    // Special attributes: bar scaled to their own range
    if (SPECIAL_ATTRS[csvCol]) {
      const max = SPECIAL_ATTRS[csvCol].max;
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
    const barColor = statColor(val);
    const textColor = statTextColor(barColor);
    const pct = Math.max(0, Math.min(100, ((v - STAT_MIN) / (STAT_MAX - STAT_MIN)) * 100));
    return `<div class="stat-row">
      <span class="stat-name">${label}</span>
      <span class="stat-value" style="background:${barColor};color:${textColor}">${val}</span>
      <div class="stat-bar-container">
        <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
    </div>`;
  }).join('');

  view.innerHTML = `
    <button class="back-btn" onclick="goBackToTeam()">◀ Volver a ${team.displayName}</button>

    <div class="player-profile">
      <!-- LEFT: photo + info -->
      <div class="player-left">
        <div class="player-photo-container">
          <img class="player-photo"
            id="profile-photo"
            src="img/players/${player.ID}.webp"
            onerror="handleMinifaceError(this,'${player.ID}')"
            alt="${player.Name}">
        </div>
        <div class="player-info-card">
          <div class="player-info-row">
            <span class="info-label">Nacionalidad</span>
            <img src="${flagSrc(player.Nationality)}"
              onerror="this.onerror=null;this.src='img/flags/default.webp'"
              alt="">
            <span>${player.Nationality || '–'}</span>
          </div>
          <div class="player-info-row">
            <span class="info-label">Equipo</span>
            <a href="team.html?id=${team.id}" class="team-crest-link">
              <img class="team-crest-sm"
                src="img/teams/${team.id}.webp"
                onerror="this.onerror=null;this.src='img/teams/default.webp'"
                alt="${team.displayName}">
              <span>${team.displayName}</span>
            </a>
          </div>
          <div class="player-info-row">
            <span class="info-label">Categoría</span>
            <span>${typeLabel}</span>
          </div>
          ${player._playsForNational ? `<div class="national-team-note">🌍 También juega para su selección.</div>` : ''}
        </div>
      </div>

      <!-- CENTER: ability settings -->
      <div class="player-center">
        <div class="player-name-line">${player.Name || 'Jugador desconocido'}</div>
        <div class="player-position-overall">
          <span class="position-badge">${posDisplay || '–'}</span>
          <span class="overall-large">${player.Overall || '–'}</span>
        </div>
        <div class="ability-title">Estadísticas</div>
        <div class="stats-list">
          ${statsHtml}
        </div>
      </div>

      <!-- RIGHT: radar -->
      <div class="player-right">
        <div class="radar-card">
          <h3>Radar de atributos</h3>
          <canvas id="radar-canvas" width="260" height="260"></canvas>
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => drawRadar('radar-canvas', radarAttrs));
}

function goBackToTeam() {
  if (currentTeam) renderPlayersList(currentTeam);
  else showAllPlayers();
}

// ─── Radar Chart ─────────────────────────────────────────────────────────────

function drawRadar(canvasId, attrs) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(cx, cy) - 42;
  const MAX_VAL = 99;
  const labels = Object.keys(attrs);
  const values = Object.values(attrs);
  const n = labels.length;

  ctx.clearRect(0, 0, W, H);

  // Grid rings (5 levels)
  const ringLevels = [20, 40, 60, 80, 99];
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
    // Ring value label at top
    ctx.font = '9px Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(ringLevels[ring - 1]), cx, cy - r - 2);
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

  // Data polygon fill
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = (values[i] / MAX_VAL) * maxR;
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
    const r = (values[i] / MAX_VAL) * maxR;
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

  // Labels: attribute name + value outside each axis
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const labelR = maxR + 26;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);

    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#eaeaea';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly - 6);

    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(String(values[i]), lx, ly + 8);
  }
}

// ─── Favorites ────────────────────────────────────────────────────────────────

/**
 * Updates the favorites count badge in the sidebar.
 */
function _updateFavoritesCount() {
  const el = document.getElementById('nav-fav-count');
  if (!el) return;
  const count = getFavoritesCount();
  el.textContent = count > 0 ? String(count) : '';
}

/**
 * Called by the inline ☆/★ button in each player row.
 * Toggles the favorite state and updates the button's appearance.
 * @param {HTMLButtonElement} btn
 * @param {string} playerId
 * @param {string} teamId
 */
function toggleFavoriteFromBtn(btn, playerId, teamId) {
  const added = toggleFavorite(playerId, teamId);
  btn.textContent = added ? '★' : '☆';
  btn.classList.toggle('is-fav', added);
  btn.title = added ? 'Quitar de favoritos' : 'Agregar a favoritos';
  _updateFavoritesCount();
  // Keep home stat updated if visible
  const statFav = document.getElementById('stat-favorites');
  if (statFav) {
    const count = getFavoritesCount();
    statFav.textContent = count > 0 ? count : '⭐';
  }
}

/** Internal: render the favorites view without pushing nav state. */
function _showFavoritesViewInternal() {
  _setActiveSidebarNav('favorites');
  hideAllViews();
  const view = document.getElementById('favorites-view');
  if (!view) return;
  view.classList.add('active');

  const favs = getFavorites();
  if (!favs.length) {
    view.innerHTML = `
      ${renderBreadcrumbTrail([{ label: 'Inicio', href: 'index.html' }, { label: 'Base de datos', href: 'database.html' }, { label: 'Favoritos' }])}
      <div class="view-header">
        <div class="view-title">⭐ Mis Favoritos</div>
      </div>
      <div class="empty-state">
        <div class="empty-state-icon">⭐</div>
        <p>No tienes jugadores en favoritos todavía.</p>
        <p>Usa el botón ☆ en cualquier jugador para agregarlo aquí.</p>
      </div>`;
    return;
  }

  // Look up actual player objects from in-memory index
  const playerEntries = favs
    .map(f => DB.playersByKey[getPlayerKey(f.teamId, f.playerId)])
    .filter(Boolean);

  // Notify user if some favorited players are no longer in the DB
  const missingCount = favs.length - playerEntries.length;
  const missingNote = missingCount > 0
    ? `<div class="favorites-missing-note">⚠️ ${missingCount} jugador(es) ya no están disponibles en la base de datos.</div>`
    : '';

  const rowsHtml = playerEntries.map(p => renderPlayerRow(p, p._team)).join('');

  view.innerHTML = `
    ${renderBreadcrumbTrail([{ label: 'Inicio', href: 'index.html' }, { label: 'Base de datos', href: 'database.html' }, { label: 'Favoritos' }])}
    <div class="view-header">
      <div>
        <div class="view-title">⭐ Mis Favoritos</div>
        <div class="view-subtitle">${playerEntries.length} jugador(es)</div>
      </div>
      <div class="view-header-actions">
        <button class="adv-filter-toggle btn-danger" onclick="clearAllFavorites()">✕ Limpiar favoritos</button>
      </div>
    </div>
    ${missingNote}
    <div class="table-responsive">
      <table class="players-table">
        <thead>
          <tr>
            <th></th><th></th><th>Nombre</th><th>Nac</th><th>Pos</th>
            <th>OVR</th><th>RIT</th><th>DRI</th><th>TIR</th><th>PAS</th><th>FIS</th><th>DEF</th>
            <th class="fav-col"></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

/** Public: navigate to the favorites view and save state. */
function showFavoritesView() {
  saveNavState({ view: 'favorites' });
  _showFavoritesViewInternal();
}

/**
 * Clears all favorites after user confirmation, then re-renders the view.
 */
function clearAllFavorites() {
  if (!confirm('¿Eliminar todos los favoritos?')) return;
  clearFavorites();
  _updateFavoritesCount();
  _showFavoritesViewInternal();
  // Update home stat if visible
  const statFav = document.getElementById('stat-favorites');
  if (statFav) statFav.textContent = '⭐';
}

// ─── Search ───────────────────────────────────────────────────────────────────

let searchTimeout = null;

function onSearchInput(event) {
  const query = event.target.value.trim();
  clearTimeout(searchTimeout);
  if (!query) {
    if (currentTeam) renderPlayersList(currentTeam);
    else showAllPlayers();
    return;
  }
  searchTimeout = setTimeout(() => runSearch(query), 200);
}

function runSearch(query) {
  const terms = tokenizeSearchText(query);
  let matchedKeys = null;

  terms.forEach(term => {
    const keysForTerm = DB.searchIndex[term] || new Set();
    matchedKeys = intersectSets(matchedKeys, keysForTerm);
  });

  const rawResults = matchedKeys
    ? Array.from(matchedKeys).map(key => DB.playersByKey[key]).filter(Boolean)
    : [];

  // Deduplicate by player ID: prefer club/special-team entries over national team entries
  const clubPlayerIds = new Set(DB.players.filter(p => p._team.type !== '2').map(p => p.ID));
  const teamsInLeagues = _getTeamsInLeagues();
  const seenIds = new Set();
  const results = rawResults.filter(p => {
    if (p._team.type === '2' && clubPlayerIds.has(p.ID)) return false;
    if (seenIds.has(p.ID)) return false;
    if (!teamsInLeagues.has(p._team.id)) return false;
    seenIds.add(p.ID);
    return true;
  });

  hideAllViews();
  const view = document.getElementById('search-view');
  view.classList.add('active');

  if (!results.length) {
    view.innerHTML = `${renderBreadcrumbTrail([{ label: 'Inicio', href: 'index.html' }, { label: 'Base de datos', href: 'database.html' }, { label: 'Busqueda' }])}
      <div class="view-header"><div class="view-title">Resultados: "${query}"</div></div>
      <div class="error-message">No se encontraron jugadores para "${query}"</div>`;
    return;
  }

  const rowsHtml = results.map(p => renderPlayerRow(p, p._team)).join('');

  view.innerHTML = `
    ${renderBreadcrumbTrail([{ label: 'Inicio', href: 'index.html' }, { label: 'Base de datos', href: 'database.html' }, { label: 'Busqueda' }])}
    <div class="view-header">
      <div>
        <div class="view-title">Búsqueda: "${query}"</div>
        <div class="view-subtitle">${results.length} jugador(es) encontrado(s)</div>
      </div>
    </div>
    <div class="table-responsive">
      <table class="players-table">
        <thead>
          <tr>
            <th></th><th></th><th>Nombre</th><th>Nac</th><th>Pos</th>
            <th>OVR</th><th>RIT</th><th>DRI</th><th>TIR</th>
            <th>PAS</th><th>FIS</th><th>DEF</th>
            <th class="fav-col"></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Attach search handler
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', onSearchInput);
  }

  // Handle browser back/forward navigation
  window.addEventListener('popstate', (event) => {
    if (!DB.loaded) return;
    const state = (event.state && event.state.view) ? event.state : _urlToState();
    // Update _lastPushedView to prevent duplicate pushState on the restored view
    if (state) _lastPushedView = state.view;
    _applyNavState(state || { view: 'players' });
  });

  // Boot the indexer
  boot().catch(err => {
    showError(`Error inesperado al iniciar: ${err.message}`);
    console.error(err);
  });
});
