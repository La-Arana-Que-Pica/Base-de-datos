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
  if (!img.dataset.ddsTried) {
    img.dataset.ddsTried = '1';
    img.src = 'img/players/player_' + playerId + '.dds';
  } else {
    img.onerror = null;
    img.src = 'img/players/default.png';
  }
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

function positionGroupColor(pesPos) {
  if (pesPos === 'GK') return '#f9d901';
  if (['CB', 'LB', 'RB'].includes(pesPos)) return '#2cccfa';
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(pesPos)) return '#57e42b';
  if (['LWF', 'RWF', 'SS', 'CF'].includes(pesPos)) return '#ff2c77';
  return '#8b949e';
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

function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
  if (!countryId) return 'img/flags/default.png';
  return `img/flags/${countryId}.png`;
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
      displayName: teamName,
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
  const playerMap = {};
  playerRows.forEach(playerRow => {
    const playerId = playerRow['Id'];
    if (!playerId) return;
    playerMap[playerId] = normalizePlayerRow(playerRow);
  });

  // Build corrected overall map from medias_corregidas.csv
  const corregidosMap = {};
  if (corregidosText) {
    const corregidosRows = parseCSV(corregidosText);
    corregidosRows.forEach(r => {
      const pid = r['PlayerId'] || r['Id'] || r['id'] || r['player_id'] || '';
      const tid = r['TeamId'] || r['team_id'] || '';
      const ovr = r['OverallStats'] || r['Overall'] || r['corrected_overall'] || r['media'] || '';
      if (pid && ovr) {
        if (tid) corregidosMap[tid + '_' + pid] = ovr;
        if (!tid) corregidosMap[pid] = ovr;
      }
    });
  }

  // Assign players to teams using squad data
  squadRows.forEach(squadRow => {
    const teamId = squadRow['Id'];
    const team = teamById[teamId];
    if (!team) return;
    for (let i = 1; i <= 32; i++) {
      const playerId = squadRow[`Player ${i}`];
      if (!playerId || playerId === '0') continue;
      const player = playerMap[playerId];
      if (!player) continue;
      const p = { ...player, _team: team };
      // Apply corrected overall if available (team-specific key takes precedence)
      const corregidosOvr = corregidosMap[teamId + '_' + playerId] || corregidosMap[playerId];
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

// ─── Navigation state (session) ──────────────────────────────────────────────

const NAV_STATE_KEY = 'pes_nav_state';

function saveNavState(state) {
  try { sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify(state)); } catch(e) {}
}

function loadNavState() {
  try { return JSON.parse(sessionStorage.getItem(NAV_STATE_KEY) || 'null'); } catch(e) { return null; }
}

function restoreNavState() {
  const state = loadNavState();
  if (!state || !state.view) { showAllPlayers(); return; }
  switch (state.view) {
    case 'leagues':
      showLeaguesView();
      if (state.query) {
        const input = document.getElementById('leagues-search-input');
        if (input) { input.value = state.query; filterLeaguesGrid(state.query); }
      }
      break;
    case 'leagueTeams': if (state.leagueId) showLeagueTeamsView(state.leagueId); else showLeaguesView(); break;
    case 'teams':
      showTeamsView();
      if (state.query) {
        const input = document.getElementById('teams-search-input');
        if (input) { input.value = state.query; filterTeamsGrid(state.query); }
      }
      break;
    case 'players':
      if (state.filters) {
        Object.assign(_advFilters, state.filters);
      }
      showAllPlayers();
      break;
    default: showAllPlayers(); break;
  }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');

  const html = `
    <!-- ── LIGAS ── -->
    <div class="sidebar-nav-section">
      <div class="sidebar-nav-header" id="nav-header-ligas" onclick="showLeaguesView()">
        <span class="sidebar-nav-title">Ligas</span>
      </div>
    </div>

    <!-- ── EQUIPOS ── -->
    <div class="sidebar-nav-section">
      <div class="sidebar-nav-header" id="nav-header-equipos" onclick="showTeamsView()">
        <span class="sidebar-nav-title">Equipos</span>
      </div>
    </div>

    <!-- ── JUGADORES ── -->
    <div class="sidebar-nav-section">
      <div class="sidebar-nav-header" id="nav-header-jugadores" onclick="showAllPlayersFromSidebar()">
        <span class="sidebar-nav-title">Jugadores</span>
      </div>
      <div class="sidebar-nav-body" id="nav-jugadores" style="display:none">
        <div class="sidebar-filter-wrap">
          <input type="text" class="sidebar-filter-input"
            placeholder="Buscar jugadores..."
            oninput="filterAllPlayers(this.value)"
            autocomplete="off">
        </div>
      </div>
    </div>`;

  sidebar.innerHTML = html;
}

function _setActiveSidebarNav(viewName) {
  ['nav-header-ligas', 'nav-header-equipos', 'nav-header-jugadores'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const map = {
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
  const body = document.getElementById('nav-jugadores');
  if (body) {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : '';
  }
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

function showLeaguesView() {
  saveNavState({ view: 'leagues' });
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
          src="img/leagues/${league.id}.png"
          onerror="this.onerror=null;this.src='img/leagues/default.png'"
          alt="${league.name}">
        <div class="grid-card-name">${league.name}</div>
        <div class="grid-card-sub">${teamCount} equipo${teamCount !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');

  view.innerHTML = `
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
          src="img/leagues/${league.id}.png"
          onerror="this.onerror=null;this.src='img/leagues/default.png'"
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
        src="img/teams/${team.id}.png"
        onerror="this.onerror=null;this.src='img/teams/default.png'"
        alt="${team.displayName}">
      <div class="grid-card-name">${team.displayName}</div>
    </div>`).join('');

  view.innerHTML = `
    <div class="view-header">
      <img class="grid-card-img" style="width:48px;height:48px;object-fit:contain"
        src="img/leagues/${leagueId}.png"
        onerror="this.onerror=null;this.src='img/leagues/default.png'"
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

let _teamsForGrid = [];

function showTeamsView() {
  saveNavState({ view: 'teams' });
  _setActiveSidebarNav('teams');
  // Only show teams that belong to a league
  const teamsInLeagues = new Set();
  DB.leagues.forEach(l => l.teamIds.forEach(id => teamsInLeagues.add(id)));
  const filteredTeams = DB.teams.filter(t => teamsInLeagues.has(t.id));
  _teamsForGrid = filteredTeams;

  hideAllViews();
  const view = document.getElementById('teams-grid-view');
  view.classList.add('active');

  const cardsHtml = filteredTeams.map(team => {
    const avg = teamAvgOvr(team);
    const avgHtml = avg !== null
      ? `<div class="grid-card-ovr"><span class="team-avg-badge" style="background:${statColor(avg)};color:${statTextColor(statColor(avg))}">${avg}</span></div>`
      : '';
    return `
    <div class="grid-card" onclick="selectTeam('${team.id}')">
      <img class="grid-card-img"
        src="img/teams/${team.id}.png"
        onerror="this.onerror=null;this.src='img/teams/default.png'"
        alt="${team.displayName}">
      <div class="grid-card-name">${team.displayName}</div>
      ${avgHtml}
    </div>`;
  }).join('');

  view.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Equipos</div>
        <div class="view-subtitle" id="teams-grid-subtitle">${filteredTeams.length} equipos con liga asignada</div>
      </div>
    </div>
    <div class="grid-search-wrap">
      <input type="text" class="grid-search-input" id="teams-search-input"
        placeholder="Buscar equipo..." autocomplete="off"
        oninput="filterTeamsGrid(this.value)">
    </div>
    <div class="grid-cards" id="teams-grid-cards">${cardsHtml}</div>`;
}

function filterTeamsGrid(query) {
  const q = query.toLowerCase().trim();
  const container = document.getElementById('teams-grid-cards');
  const subtitle = document.getElementById('teams-grid-subtitle');
  if (!container) return;
  saveNavState({ view: 'teams', query });
  const matches = q ? _teamsForGrid.filter(t => (t.displayName || '').toLowerCase().includes(q)) : _teamsForGrid;
  const cardsHtml = matches.map(team => {
    const avg = teamAvgOvr(team);
    const avgHtml = avg !== null
      ? `<div class="grid-card-ovr"><span class="team-avg-badge" style="background:${statColor(avg)};color:${statTextColor(statColor(avg))}">${avg}</span></div>`
      : '';
    return `
    <div class="grid-card" onclick="selectTeam('${team.id}')">
      <img class="grid-card-img"
        src="img/teams/${team.id}.png"
        onerror="this.onerror=null;this.src='img/teams/default.png'"
        alt="${team.displayName}">
      <div class="grid-card-name">${team.displayName}</div>
      ${avgHtml}
    </div>`;
  }).join('');
  container.innerHTML = cardsHtml;
  if (subtitle) subtitle.textContent = `${matches.length} equipo${matches.length !== 1 ? 's' : ''} encontrado${matches.length !== 1 ? 's' : ''}`;
}


// ─── Views ────────────────────────────────────────────────────────────────────

function hideAllViews() {
  document.querySelectorAll('#home-view, #players-view, #player-view, #search-view, #leagues-view, #teams-grid-view').forEach(el => {
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
  hideAllViews();
  document.getElementById('home-view').classList.add('active');

  const leagueCount = DB.leagues.length;
  document.getElementById('stat-leagues').textContent = leagueCount;
  document.getElementById('stat-teams').textContent = DB.teams.length;
  // Count unique players
  const uniqueIds = new Set(DB.players.map(p => p.ID));
  document.getElementById('stat-players').textContent = uniqueIds.size;

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
        <img src="img/teams/${t.id}.png"
          onerror="this.onerror=null;this.src='img/teams/default.png'"
          alt="${safeTName}">
      </a>`;
    }).join('');
    return `<div class="home-league-block">
      <div class="home-league-header" data-league-id="${l.id.replace(/"/g, '&quot;')}">
        <img src="img/leagues/${l.id}.png"
          onerror="this.onerror=null;this.src='img/leagues/default.png'"
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
  if (DB.loaded) showHome();
}

// ─── All-players default view (infinite scroll) ───────────────────────────────

const ALL_PLAYERS_PAGE_SIZE = 50;

// State for the infinite-scroll all-players view
let _allPlayersList = [];      // sorted, filtered, deduplicated player array
let _allPlayersOffset = 0;     // how many have been rendered so far
let _allPlayersObserver = null; // IntersectionObserver watching the sentinel

// Advanced filter state
const _advFilters = {
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
  skill: '',
  comStyle: '',
};

// Playing role → position group for filter
const ROLE_POSITIONS = {
  'GK':  ['GK'],
  'DEF': ['CB', 'LB', 'RB'],
  'MID': ['DMF', 'CMF', 'LMF', 'RMF', 'AMF'],
  'FWD': ['LWF', 'RWF', 'SS', 'CF'],
};

/**
 * Build (or rebuild) the sorted, deduplicated players array with active filters.
 * Players who appear in both a club team and a national team are shown only
 * under their club team (national team duplicate entries are skipped).
 */
function _prepareAllPlayersList() {
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

  // Apply advanced filters
  const f = _advFilters;

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
  // Skill filter
  if (f.skill) {
    unique = unique.filter(p => p[f.skill] === 'True');
  }
  // COM style filter
  if (f.comStyle) {
    unique = unique.filter(p => p[f.comStyle] === 'True');
  }

  unique.sort((a, b) => (parseInt(b.Overall, 10) || 0) - (parseInt(a.Overall, 10) || 0));
  _allPlayersList = unique;
  _allPlayersOffset = 0;
}

/**
 * Append the next batch of player rows to the table body and advance the
 * sentinel; disconnect the observer when all rows have been rendered.
 */
function _appendNextBatch() {
  const tbody = document.getElementById('all-players-tbody');
  const sentinel = document.getElementById('all-players-sentinel');
  if (!tbody || !sentinel) return;

  const batch = _allPlayersList.slice(_allPlayersOffset, _allPlayersOffset + ALL_PLAYERS_PAGE_SIZE);
  if (!batch.length) {
    // No more players – remove sentinel and stop observing
    sentinel.remove();
    if (_allPlayersObserver) {
      _allPlayersObserver.disconnect();
      _allPlayersObserver = null;
    }
    return;
  }

  const rowsHtml = batch.map(p => renderPlayerRow(p, p._team)).join('');
  tbody.insertAdjacentHTML('beforeend', rowsHtml);
  _allPlayersOffset += batch.length;

  // If all players have now been rendered, clean up
  if (_allPlayersOffset >= _allPlayersList.length) {
    sentinel.remove();
    if (_allPlayersObserver) {
      _allPlayersObserver.disconnect();
      _allPlayersObserver = null;
    }
  }
}

function _buildFilterPanel() {
  // Collect unique sorted nationalities from all (deduplicated) players
  const clubPlayerIds = new Set(DB.players.filter(p => p._team.type !== '2').map(p => p.ID));
  const seen = new Set();
  const basePlayers = DB.players.filter(p => {
    if (p._team.type === '2' && clubPlayerIds.has(p.ID)) return false;
    if (seen.has(p.ID)) return false;
    seen.add(p.ID);
    return true;
  });

  const nationalities = [...new Set(basePlayers.map(p => p.Nationality || '').filter(Boolean))]
    .sort((a, b) => nationalityName(a).localeCompare(nationalityName(b), 'es'));
  const clubTeams = DB.teams
    .filter(t => t.type !== '2' && t.players.length > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  const f = _advFilters;

  const natOptions = nationalities.map(n =>
    `<option value="${n}"${f.nationality === n ? ' selected' : ''}>${nationalityName(n)}</option>`
  ).join('');

  const clubOptions = clubTeams.map(t =>
    `<option value="${t.id}"${f.club === t.id ? ' selected' : ''}>${t.displayName}</option>`
  ).join('');

  // IDs 9001/9002 are internal placeholder leagues (e.g. "Free Agents", "Unknown") not shown in filters
  const leagueOptions = DB.leagues
    .filter(l => l.name && l.id !== '9001' && l.id !== '9002')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map(l => `<option value="${l.id}"${f.league === l.id ? ' selected' : ''}>${l.name}</option>`)
    .join('');

  const posOptions = PES_POSITIONS.map(p =>
    `<option value="${p}"${f.position === p ? ' selected' : ''}>${translatePosition(p)} (${p})</option>`
  ).join('');

  return `
    <div class="adv-filter-panel" id="adv-filter-panel">
      <div class="adv-filter-grid">
        <div class="adv-filter-group">
          <label>Posición</label>
          <select id="flt-position" onchange="onAdvFilterChange()">
            <option value="">Todas</option>
            ${posOptions}
          </select>
        </div>
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
          <label>Nacionalidad</label>
          <select id="flt-nationality" onchange="onAdvFilterChange()">
            <option value="">Todas</option>
            ${natOptions}
          </select>
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
          <label>Estilo de juego</label>
          <select id="flt-playing-style" onchange="onAdvFilterChange()">
            <option value="">Todos</option>
            ${Object.entries(PLAYING_STYLE_LABELS).map(([k,v]) =>
              `<option value="${k}"${f.playingStyle === k ? ' selected' : ''}>${v}</option>`
            ).join('')}
          </select>
        </div>
        <div class="adv-filter-group">
          <label>Habilidad específica</label>
          <select id="flt-skill" onchange="onAdvFilterChange()">
            <option value="">Cualquiera</option>
            ${PLAYER_SKILLS_LABELS.map(([k,v]) =>
              `<option value="${k}"${f.skill === k ? ' selected' : ''}>${v}</option>`
            ).join('')}
          </select>
        </div>
        <div class="adv-filter-group">
          <label>Estilo COM</label>
          <select id="flt-com-style" onchange="onAdvFilterChange()">
            <option value="">Cualquiera</option>
            ${COM_STYLES_LABELS.map(([k,v]) =>
              `<option value="${k}"${f.comStyle === k ? ' selected' : ''}>${v}</option>`
            ).join('')}
          </select>
        </div>
        <div class="adv-filter-group">
          <label>Pie dominante</label>
          <select id="flt-foot" onchange="onAdvFilterChange()">
            <option value="">Ambos</option>
            <option value="right"${f.foot === 'right' ? ' selected' : ''}>Derecho</option>
            <option value="left"${f.foot === 'left' ? ' selected' : ''}>Izquierdo</option>
          </select>
        </div>
        <div class="adv-filter-group">
          <label>Cara escaneada</label>
          <select id="flt-facescan" onchange="onAdvFilterChange()">
            <option value="">Todos</option>
            <option value="yes"${f.hasFaceScan === 'yes' ? ' selected' : ''}>Sí</option>
            <option value="no"${f.hasFaceScan === 'no' ? ' selected' : ''}>No</option>
          </select>
        </div>
        <div class="adv-filter-group adv-filter-range">
          <label>Valoración (OVR)</label>
          <div class="range-inputs">
            <input type="number" id="flt-min-ovr" placeholder="Min" min="0" max="99" value="${f.minOvr}" oninput="onAdvFilterChange()">
            <span>–</span>
            <input type="number" id="flt-max-ovr" placeholder="Máx" min="0" max="99" value="${f.maxOvr}" oninput="onAdvFilterChange()">
          </div>
        </div>
        <div class="adv-filter-group adv-filter-range">
          <label>Edad</label>
          <div class="range-inputs">
            <input type="number" id="flt-min-age" placeholder="Min" min="15" max="50" value="${f.minAge}" oninput="onAdvFilterChange()">
            <span>–</span>
            <input type="number" id="flt-max-age" placeholder="Máx" min="15" max="50" value="${f.maxAge}" oninput="onAdvFilterChange()">
          </div>
        </div>
        <div class="adv-filter-group adv-filter-range">
          <label>Altura (cm)</label>
          <div class="range-inputs">
            <input type="number" id="flt-min-height" placeholder="Min" min="150" max="220" value="${f.minHeight}" oninput="onAdvFilterChange()">
            <span>–</span>
            <input type="number" id="flt-max-height" placeholder="Máx" min="150" max="220" value="${f.maxHeight}" oninput="onAdvFilterChange()">
          </div>
        </div>
        <div class="adv-filter-group adv-filter-range">
          <label>Peso (kg)</label>
          <div class="range-inputs">
            <input type="number" id="flt-min-weight" placeholder="Min" min="50" max="120" value="${f.minWeight}" oninput="onAdvFilterChange()">
            <span>–</span>
            <input type="number" id="flt-max-weight" placeholder="Máx" min="50" max="120" value="${f.maxWeight}" oninput="onAdvFilterChange()">
          </div>
        </div>
        <div class="adv-filter-group adv-filter-range">
          <label>Velocidad</label>
          <div class="range-inputs">
            <input type="number" id="flt-min-speed" placeholder="Min" min="40" max="99" value="${f.minSpeed}" oninput="onAdvFilterChange()">
            <span>–</span>
            <input type="number" id="flt-max-speed" placeholder="Máx" min="40" max="99" value="${f.maxSpeed}" oninput="onAdvFilterChange()">
          </div>
        </div>
        <div class="adv-filter-group adv-filter-range">
          <label>Finalización</label>
          <div class="range-inputs">
            <input type="number" id="flt-min-shooting" placeholder="Min" min="40" max="99" value="${f.minShooting}" oninput="onAdvFilterChange()">
            <span>–</span>
            <input type="number" id="flt-max-shooting" placeholder="Máx" min="40" max="99" value="${f.maxShooting}" oninput="onAdvFilterChange()">
          </div>
        </div>
        <div class="adv-filter-group adv-filter-range">
          <label>Pase al ras</label>
          <div class="range-inputs">
            <input type="number" id="flt-min-passing" placeholder="Min" min="40" max="99" value="${f.minPassing}" oninput="onAdvFilterChange()">
            <span>–</span>
            <input type="number" id="flt-max-passing" placeholder="Máx" min="40" max="99" value="${f.maxPassing}" oninput="onAdvFilterChange()">
          </div>
        </div>
      </div>
      <div class="adv-filter-actions">
        <button class="adv-filter-reset" onclick="resetAdvancedFilters()">✕ Limpiar filtros</button>
      </div>
    </div>`;
}

function onAdvFilterChange() {
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
  _advFilters.skill        = (document.getElementById('flt-skill')          || {}).value || '';
  _advFilters.comStyle     = (document.getElementById('flt-com-style')      || {}).value || '';

  // Tear down existing observer
  if (_allPlayersObserver) {
    _allPlayersObserver.disconnect();
    _allPlayersObserver = null;
  }

  _prepareAllPlayersList();
  const total = _allPlayersList.length;

  // Update subtitle
  const subtitle = document.getElementById('all-players-subtitle');
  if (subtitle) subtitle.textContent = `${total} jugadores encontrados`;

  // Reset and re-render tbody
  const tbody = document.getElementById('all-players-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    // Re-add sentinel
    const old = document.getElementById('all-players-sentinel');
    if (old) old.remove();
    tbody.insertAdjacentHTML('afterend', '<div id="all-players-sentinel" class="infinite-scroll-sentinel"><div class="spinner"></div></div>');
    _appendNextBatch();

    const sentinel = document.getElementById('all-players-sentinel');
    if (sentinel && _allPlayersOffset < total) {
      _allPlayersObserver = new IntersectionObserver(
        (entries) => { if (entries[0].isIntersecting) _appendNextBatch(); },
        { rootMargin: '200px' }
      );
      _allPlayersObserver.observe(sentinel);
    }
  }
}

function resetAdvancedFilters() {
  Object.keys(_advFilters).forEach(k => { _advFilters[k] = ''; });
  // Reset all filter inputs
  ['flt-position','flt-role','flt-nationality','flt-league','flt-club','flt-foot','flt-facescan',
   'flt-min-ovr','flt-max-ovr','flt-min-age','flt-max-age',
   'flt-min-height','flt-max-height','flt-min-weight','flt-max-weight',
   'flt-playing-style','flt-skill','flt-com-style',
   'flt-min-speed','flt-max-speed','flt-min-shooting','flt-max-shooting',
   'flt-min-passing','flt-max-passing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  onAdvFilterChange();
}

function toggleFilterPanel() {
  const panel = document.getElementById('adv-filter-panel');
  const btn = document.getElementById('btn-toggle-filters');
  if (!panel) return;
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : '';
  if (btn) btn.textContent = isVisible ? '⚙ Filtros avanzados' : '⚙ Ocultar filtros';
}

function showAllPlayers() {
  saveNavState({ view: 'players', filters: { ..._advFilters } });
  _setActiveSidebarNav('players');
  // Tear down any existing observer before rebuilding the view
  if (_allPlayersObserver) {
    _allPlayersObserver.disconnect();
    _allPlayersObserver = null;
  }

  hideAllViews();
  const view = document.getElementById('players-view');
  view.classList.add('active');

  _prepareAllPlayersList();
  const total = _allPlayersList.length;

  const hasActiveFilters = Object.values(_advFilters).some(v => v !== '');

  // Render initial skeleton (header + filter panel + empty tbody + sentinel)
  view.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Todos los jugadores</div>
        <div class="view-subtitle" id="all-players-subtitle">${total} jugadores · ordenados por valoración</div>
      </div>
      <button id="btn-toggle-filters" class="adv-filter-toggle" onclick="toggleFilterPanel()">⚙ Filtros avanzados</button>
    </div>
    ${_buildFilterPanel()}
    <table class="players-table">
      <thead>
        <tr>
          <th></th><th></th><th>Nombre</th><th>Nac</th><th>Pos</th>
          <th>OVR</th><th>VEL</th><th>DRI</th><th>TIR</th><th>PAS</th><th>FIS</th><th>DEF</th>
        </tr>
      </thead>
      <tbody id="all-players-tbody"></tbody>
    </table>
    <div id="all-players-sentinel" class="infinite-scroll-sentinel">
      <div class="spinner"></div>
    </div>`;

  // Hide the filter panel by default unless filters are active
  const filterPanel = document.getElementById('adv-filter-panel');
  if (filterPanel && !hasActiveFilters) filterPanel.style.display = 'none';

  // Render the first batch immediately
  _appendNextBatch();

  // Set up IntersectionObserver to load more when sentinel becomes visible
  const sentinel = document.getElementById('all-players-sentinel');
  if (sentinel && _allPlayersOffset < total) {
    _allPlayersObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) _appendNextBatch();
      },
      { rootMargin: '200px' }
    );
    _allPlayersObserver.observe(sentinel);
  }
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
        <img class="team-crest" src="img/teams/${team.id}.png"
          onerror="this.onerror=null;this.src='img/teams/default.png'"
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
          <th>VEL</th>
          <th>DRI</th>
          <th>TIR</th>
          <th>PAS</th>
          <th>FIS</th>
          <th>DEF</th>
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

  return `<tr onclick="selectPlayer('${player.ID}', '${team.id}')">
    <td>
      <img class="player-row-photo"
        src="img/players/${player.ID}.png"
        onerror="handleMinifaceError(this,'${player.ID}')"
        alt="${player.Name}">
    </td>
    <td class="team-crest-cell">
      <a href="team.html?id=${team.id}" onclick="event.stopPropagation()">
        <img class="player-row-team-crest"
          src="img/teams/${team.id}.png"
          onerror="this.onerror=null;this.src='img/teams/default.png'"
          alt="${team.displayName}"
          title="${team.displayName}">
      </a>
    </td>
    <td><strong>${player.Name || '–'}</strong>${nationalNote}</td>
    <td>
      <img class="player-flag"
        src="${flagSrc(player.Nationality)}"
        onerror="this.onerror=null;this.src='img/flags/default.png'"
        alt="">
    </td>
    <td><span class="position-badge" style="color:${positionGroupColor(player.Position)};border-color:${positionGroupColor(player.Position)};background:${positionGroupColor(player.Position)}18">${posDisplay || '–'}</span></td>
    <td><span class="overall-badge" style="background:${ovrColor};color:${ovrTextColor}">${ovr}</span></td>
    <td>${radarAttrs.VEL}</td>
    <td>${radarAttrs.DRI}</td>
    <td>${radarAttrs.TIR}</td>
    <td>${radarAttrs.PAS}</td>
    <td>${radarAttrs.FIS}</td>
    <td>${radarAttrs.DEF}</td>
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

  return {
    PAS: avg('Low Pass', 'Lofted Pass', 'Controlled Spin', 'Place Kicking'),
    TIR: avg('Finishing', 'Attacking Prowess'),
    FIS: avg('Physical Contact'),
    DEF: avg('Defensive Prowess'),
    VEL: avg('Speed'),
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
            src="img/players/${player.ID}.png"
            onerror="handleMinifaceError(this,'${player.ID}')"
            alt="${player.Name}">
        </div>
        <div class="player-info-card">
          <div class="player-info-row">
            <span class="info-label">Nacionalidad</span>
            <img src="${flagSrc(player.Nationality)}"
              onerror="this.onerror=null;this.src='img/flags/default.png'"
              alt="">
            <span>${player.Nationality || '–'}</span>
          </div>
          <div class="player-info-row">
            <span class="info-label">Equipo</span>
            <a href="team.html?id=${team.id}" class="team-crest-link">
              <img class="team-crest-sm"
                src="img/teams/${team.id}.png"
                onerror="this.onerror=null;this.src='img/teams/default.png'"
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
  ctx.fillStyle = 'rgba(192, 57, 43, 0.25)';
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
  const seenIds = new Set();
  const results = rawResults.filter(p => {
    if (p._team.type === '2' && clubPlayerIds.has(p.ID)) return false;
    if (seenIds.has(p.ID)) return false;
    seenIds.add(p.ID);
    return true;
  });

  hideAllViews();
  const view = document.getElementById('search-view');
  view.classList.add('active');

  if (!results.length) {
    view.innerHTML = `<div class="view-header"><div class="view-title">Resultados: "${query}"</div></div>
      <div class="error-message">No se encontraron jugadores para "${query}"</div>`;
    return;
  }

  const rowsHtml = results.map(p => renderPlayerRow(p, p._team)).join('');

  view.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Búsqueda: "${query}"</div>
        <div class="view-subtitle">${results.length} jugador(es) encontrado(s)</div>
      </div>
    </div>
    <table class="players-table">
      <thead>
        <tr>
          <th></th><th></th><th>Nombre</th><th>Nac</th><th>Pos</th>
          <th>OVR</th><th>VEL</th><th>DRI</th><th>TIR</th>
          <th>PAS</th><th>FIS</th><th>DEF</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Attach search handler
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', onSearchInput);
  }

  // Boot the indexer
  boot().catch(err => {
    showError(`Error inesperado al iniciar: ${err.message}`);
    console.error(err);
  });
});
