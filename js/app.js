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

// Team type → Spanish group label
const TYPE_LABELS = {
  '0': 'Clubes',
  '1': 'Equipos especiales',
  '2': 'Selecciones',
};

function translateStat(csvCol) {
  return STAT_LABELS[csvCol] || csvCol;
}

function translatePosition(pesPos) {
  return POSITION_LABELS[pesPos] || pesPos;
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
  if (isNaN(v)) return 'stat-red';
  if (v >= 75) return 'stat-green';
  if (v >= 60) return 'stat-yellow';
  return 'stat-red';
}

/**
 * Get color hex for canvas drawing based on stat value.
 */
function statColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return '#e74c3c';
  if (v >= 75) return '#27ae60';
  if (v >= 60) return '#f39c12';
  return '#e74c3c';
}

/**
 * Compute overall badge color.
 */
function overallColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'stat-red';
  if (v >= 80) return 'stat-green';
  if (v >= 70) return 'stat-yellow';
  return 'stat-red';
}

// ─── Boot / Indexer ───────────────────────────────────────────────────────────

async function boot() {
  showLoading('Cargando base de datos...');

  // Load all global CSV files in parallel
  const [teamsText, playersText, squadsText, appearancesText, leaguesText] = await Promise.all([
    fetchText('database/All teams exported.csv'),
    fetchText('database/All players exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All appeaarances exported.csv'),
    fetchText('database/All leagues exported.csv'),
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
  showAllPlayers();
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');

  const html = `
    <!-- ── LIGAS ── -->
    <div class="sidebar-nav-section">
      <div class="sidebar-nav-header" onclick="showLeaguesView()">
        <span class="sidebar-nav-title">Ligas</span>
        <span class="sidebar-nav-arrow">▶</span>
      </div>
    </div>

    <!-- ── EQUIPOS ── -->
    <div class="sidebar-nav-section">
      <div class="sidebar-nav-header" onclick="showTeamsView()">
        <span class="sidebar-nav-title">Equipos</span>
        <span class="sidebar-nav-arrow">▶</span>
      </div>
    </div>

    <!-- ── JUGADORES ── -->
    <div class="sidebar-nav-section">
      <div class="sidebar-nav-header" onclick="showAllPlayersFromSidebar()">
        <span class="sidebar-nav-title">Jugadores</span>
        <span class="sidebar-nav-arrow sidebar-players-arrow">▶</span>
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

function showAllPlayersFromSidebar() {
  // Toggle the jugadores section body
  const body = document.getElementById('nav-jugadores');
  const arrow = document.querySelector('.sidebar-players-arrow');
  if (body) {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : '';
    if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
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

function showLeaguesView() {
  hideAllViews();
  const view = document.getElementById('leagues-view');
  view.classList.add('active');

  const cardsHtml = DB.leagues.map(league => {
    const teamCount = league.teamIds.length;
    return `
      <div class="grid-card" onclick="showLeagueTeamsView('${league.id}')">
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
        <div class="view-subtitle">${DB.leagues.length} ligas disponibles</div>
      </div>
    </div>
    <div class="grid-cards">${cardsHtml}</div>`;
}

function showLeagueTeamsView(leagueId) {
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

function showTeamsView() {
  // Only show teams that belong to a league
  const teamsInLeagues = new Set();
  DB.leagues.forEach(l => l.teamIds.forEach(id => teamsInLeagues.add(id)));
  const filteredTeams = DB.teams.filter(t => teamsInLeagues.has(t.id));

  hideAllViews();
  const view = document.getElementById('teams-grid-view');
  view.classList.add('active');

  const cardsHtml = filteredTeams.map(team => `
    <div class="grid-card" onclick="selectTeam('${team.id}')">
      <img class="grid-card-img"
        src="img/teams/${team.id}.png"
        onerror="this.onerror=null;this.src='img/teams/default.png'"
        alt="${team.displayName}">
      <div class="grid-card-name">${team.displayName}</div>
    </div>`).join('');

  view.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Equipos</div>
        <div class="view-subtitle">${filteredTeams.length} equipos con liga asignada</div>
      </div>
    </div>
    <div class="grid-cards">${cardsHtml}</div>`;
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

  const nationalities = [...new Set(basePlayers.map(p => p.Nationality || '').filter(Boolean))].sort();
  const clubTeams = DB.teams
    .filter(t => t.type !== '2' && t.players.length > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  const f = _advFilters;

  const natOptions = nationalities.map(n =>
    `<option value="${n}"${f.nationality === n ? ' selected' : ''}>${n}</option>`
  ).join('');

  const clubOptions = clubTeams.map(t =>
    `<option value="${t.id}"${f.club === t.id ? ' selected' : ''}>${t.displayName}</option>`
  ).join('');

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
  ['flt-position','flt-role','flt-nationality','flt-club','flt-foot','flt-facescan',
   'flt-min-ovr','flt-max-ovr','flt-min-age','flt-max-age',
   'flt-min-height','flt-max-height','flt-min-weight','flt-max-weight'].forEach(id => {
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
          <th></th><th>Nombre</th><th>Nac</th><th>Pos</th>
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
      <img class="team-crest" src="img/teams/${team.id}.png"
        onerror="this.onerror=null;this.src='img/teams/default.png'"
        alt="${team.displayName}">
      <div>
        <div class="view-title">${team.displayName}</div>
        <div class="view-subtitle">${typeLabel}</div>
      </div>
    </div>
    <table class="players-table">
      <thead>
        <tr>
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
  const ovrClass = overallColor(ovr);
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
    <td><strong>${player.Name || '–'}</strong>${nationalNote}</td>
    <td>
      <img class="player-flag"
        src="${flagSrc(player.Nationality)}"
        onerror="this.onerror=null;this.src='img/flags/default.png'"
        alt="">
    </td>
    <td><span class="position-badge">${posDisplay || '–'}</span></td>
    <td><span class="overall-badge ${ovrClass}">${ovr}</span></td>
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
      const barColor = v >= max * 0.75 ? '#27ae60' : v >= max * 0.5 ? '#f39c12' : '#e74c3c';
      const colorClass = v >= max * 0.75 ? 'stat-green' : v >= max * 0.5 ? 'stat-yellow' : 'stat-red';
      return `<div class="stat-row">
        <span class="stat-name">${label}</span>
        <span class="stat-value ${colorClass}">${v}</span>
        <div class="stat-bar-container">
          <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
        </div>
      </div>`;
    }
    const colorClass = statColorClass(val);
    const barColor = statColor(val);
    const pct = Math.max(0, Math.min(100, ((v - STAT_MIN) / (STAT_MAX - STAT_MIN)) * 100));
    return `<div class="stat-row">
      <span class="stat-name">${label}</span>
      <span class="stat-value ${colorClass}">${val}</span>
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
            <img class="team-crest-sm"
              src="img/teams/${team.id}.png"
              onerror="this.onerror=null;this.src='img/teams/default.png'"
              alt="${team.displayName}">
            <span>${team.displayName}</span>
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

  const results = matchedKeys
    ? Array.from(matchedKeys).map(key => DB.playersByKey[key]).filter(Boolean)
    : [];

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
          <th></th><th>Nombre</th><th>Nac</th><th>Pos</th>
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
