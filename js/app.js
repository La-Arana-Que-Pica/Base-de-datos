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

// ─── In-memory indexes ────────────────────────────────────────────────────────
const DB = {
  teams: [],      // [{ id, folder, displayName, type, teamData, players, appearanceMap }]
  players: [],    // flat list for global search
  searchIndex: Object.create(null), // token/prefix -> Set<"teamId:playerId">
  playersByKey: Object.create(null),
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
  const [teamsText, playersText, squadsText, appearancesText] = await Promise.all([
    fetchText('database/All teams exported.csv'),
    fetchText('database/All players exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All appeaarances exported.csv'),
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

  if (!DB.teams.length) {
    showError('No se encontraron equipos en la base de datos.');
    return;
  }

  DB.loaded = true;
  buildSidebar();
  showHome();
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

// Map country ID → league/competition display name (for club teams)
const COUNTRY_LEAGUE_LABELS = {
  '204': 'Liga Inglesa',
  '236': 'La Liga',
  '208': 'Ligue 1',
  '215': 'Serie A',
  '210': 'Bundesliga',
  '224': 'Eredivisie',
  '228': 'Primeira Liga',
  '232': 'Liga Escocesa',
  '197': 'Liga Belga',
  '190': 'Süper Lig',
  '211': 'Liga Griega',
  '239': 'Liga Ucraniana',
  '230': 'Liga Rusa',
  '144': 'Liga Argentina',
  '146': 'Brasileirão',
  '147': 'Primera División Chile',
  '148': 'Liga BetPlay',
  '150': 'Liga Paraguaya',
  '151': 'Liga Peruana',
  '152': 'Liga Uruguaya',
  '162': 'Liga Australiana',
  '135': 'MLS',
  '31':  'Liga Saudí',
  '37':  'Liga Emiratos',
  '13':  'J.League',
  '16':  'K League',
  '11':  'Liga Persa del Golfo',
  '200': 'HNL Croata',
  '240': 'Liga Uzbeka',
};

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');

  // Separate teams by Type: 0=Clubs, 1=Special, 2=National
  const clubs = DB.teams.filter(t => t.type === '0');
  const nationals = DB.teams.filter(t => t.type === '2');
  const special = DB.teams.filter(t => t.type === '1');
  const other = DB.teams.filter(t => t.type !== '0' && t.type !== '1' && t.type !== '2');

  let html = `<div class="sidebar-section">
    <div class="sidebar-section-title">Navegación</div>
    <div class="sidebar-filter-wrap">
      <input type="text" id="sidebar-team-filter"
        class="sidebar-filter-input"
        placeholder="Filtrar equipos..."
        oninput="filterSidebarTeams(this.value)"
        autocomplete="off">
    </div>`;

  // ── Clubs grouped by country/league ──
  if (clubs.length) {
    // Group clubs by country
    const countryGroups = {};
    clubs.forEach(team => {
      const countryId = team.teamData && team.teamData['Country'] ? team.teamData['Country'] : '__unknown';
      if (!countryGroups[countryId]) countryGroups[countryId] = [];
      countryGroups[countryId].push(team);
    });

    // Sort country groups: known leagues first (by label alpha), then unknowns
    // Unknown country IDs are prefixed with 'zz' so they sort to the end
    const sortedCountryKeys = Object.keys(countryGroups).sort((a, b) => {
      const la = COUNTRY_LEAGUE_LABELS[a] || 'zz' + a;
      const lb = COUNTRY_LEAGUE_LABELS[b] || 'zz' + b;
      return la.localeCompare(lb, 'es');
    });

    html += `
    <div class="sidebar-league" data-type="clubs">
      <div class="sidebar-league-header" onclick="toggleLeague('type-clubs')">
        <span class="sidebar-league-name">Clubes</span>
        <span class="sidebar-league-count">(${clubs.length})</span>
        <span class="sidebar-league-arrow">▶</span>
      </div>
      <div class="sidebar-teams-list" id="league-teams-type-clubs">`;

    sortedCountryKeys.forEach(countryId => {
      const leagueLabel = COUNTRY_LEAGUE_LABELS[countryId] || `Liga (${countryId})`;
      const leagueTeams = countryGroups[countryId];
      const safeId = `country-${countryId}`;

      html += `
        <div class="sidebar-country-group">
          <div class="sidebar-country-header" onclick="toggleCountryGroup('${safeId}')">
            <span>${leagueLabel}</span>
            <span style="color:var(--color-text-muted);font-size:0.72rem">(${leagueTeams.length})</span>
            <span class="sidebar-country-arrow">▶</span>
          </div>
          <div class="sidebar-country-teams" id="country-group-${safeId}">`;

      leagueTeams.forEach(team => {
        html += `
            <div class="sidebar-team-item" id="sidebar-team-${team.id}"
              data-team-name="${normalizeText(team.displayName)}"
              onclick="selectTeam('${team.id}')">
              <img class="sidebar-team-crest" src="img/teams/${team.id}.png"
                onerror="this.onerror=null;this.src='img/teams/default.png'"
                alt="${team.displayName}">
              <span>${team.displayName}</span>
            </div>`;
      });

      html += `
          </div>
        </div>`;
    });

    html += `
      </div>
    </div>`;
  }

  // ── National teams ──
  if (nationals.length) {
    html += `
    <div class="sidebar-league" data-type="2">
      <div class="sidebar-league-header" onclick="toggleLeague('type-2')">
        <span class="sidebar-league-name">Selecciones</span>
        <span class="sidebar-league-count">(${nationals.length})</span>
        <span class="sidebar-league-arrow">▶</span>
      </div>
      <div class="sidebar-teams-list" id="league-teams-type-2">`;

    nationals.forEach(team => {
      html += `
        <div class="sidebar-team-item" id="sidebar-team-${team.id}"
          data-team-name="${normalizeText(team.displayName)}"
          onclick="selectTeam('${team.id}')">
          <img class="sidebar-team-crest" src="img/teams/${team.id}.png"
            onerror="this.onerror=null;this.src='img/teams/default.png'"
            alt="${team.displayName}">
          <span>${team.displayName}</span>
        </div>`;
    });

    html += `
      </div>
    </div>`;
  }

  // ── Special teams ──
  if (special.length) {
    html += `
    <div class="sidebar-league" data-type="1">
      <div class="sidebar-league-header" onclick="toggleLeague('type-1')">
        <span class="sidebar-league-name">Equipos especiales</span>
        <span class="sidebar-league-count">(${special.length})</span>
        <span class="sidebar-league-arrow">▶</span>
      </div>
      <div class="sidebar-teams-list" id="league-teams-type-1">`;

    special.forEach(team => {
      html += `
        <div class="sidebar-team-item" id="sidebar-team-${team.id}"
          data-team-name="${normalizeText(team.displayName)}"
          onclick="selectTeam('${team.id}')">
          <img class="sidebar-team-crest" src="img/teams/${team.id}.png"
            onerror="this.onerror=null;this.src='img/teams/default.png'"
            alt="${team.displayName}">
          <span>${team.displayName}</span>
        </div>`;
    });

    html += `
      </div>
    </div>`;
  }

  // ── Other types ──
  other.forEach(team => {
    html += `
        <div class="sidebar-team-item" id="sidebar-team-${team.id}"
          data-team-name="${normalizeText(team.displayName)}"
          onclick="selectTeam('${team.id}')">
          <img class="sidebar-team-crest" src="img/teams/${team.id}.png"
            onerror="this.onerror=null;this.src='img/teams/default.png'"
            alt="${team.displayName}">
          <span>${team.displayName}</span>
        </div>`;
  });

  html += `</div>`;
  sidebar.innerHTML = html;
}

function filterSidebarTeams(query) {
  const normalized = normalizeText(query);
  const hasFilter = normalized.length > 0;

  document.querySelectorAll('.sidebar-team-item').forEach(el => {
    const name = el.dataset.teamName || '';
    el.style.display = !hasFilter || name.includes(normalized) ? '' : 'none';
  });

  // When filtering, open all sections so results are visible
  if (hasFilter) {
    document.querySelectorAll('.sidebar-league').forEach(section => {
      const list = section.querySelector('.sidebar-teams-list');
      const header = section.querySelector('.sidebar-league-header');
      if (!list || !header) return;
      const visible = list.querySelectorAll('.sidebar-team-item:not([style*="none"])').length;
      if (visible > 0) {
        header.classList.add('open');
        list.classList.add('open');
      }
    });
    document.querySelectorAll('.sidebar-country-group').forEach(group => {
      const list = group.querySelector('.sidebar-country-teams');
      const header = group.querySelector('.sidebar-country-header');
      if (!list || !header) return;
      const visible = list.querySelectorAll('.sidebar-team-item:not([style*="none"])').length;
      if (visible > 0) {
        header.classList.add('open');
        list.classList.add('open');
      }
    });
  }
}

function toggleLeague(id) {
  const list = document.getElementById(`league-teams-${id}`);
  if (!list) return;
  const header = list.previousElementSibling;
  if (header) header.classList.toggle('open');
  list.classList.toggle('open');
}

function toggleCountryGroup(id) {
  const list = document.getElementById(`country-group-${id}`);
  if (!list) return;
  const header = list.previousElementSibling;
  if (header) header.classList.toggle('open');
  list.classList.toggle('open');
}

function openLeague(id) {
  const list = document.getElementById(`league-teams-${id}`);
  if (!list) return;
  const header = list.previousElementSibling;
  if (header) header.classList.add('open');
  list.classList.add('open');
}

// ─── Views ────────────────────────────────────────────────────────────────────

function hideAllViews() {
  document.querySelectorAll('#home-view, #players-view, #player-view, #search-view').forEach(el => {
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

  // Count unique leagues (clubs by country + national + special categories)
  const clubCountries = new Set(
    DB.teams.filter(t => t.type === '0')
      .map(t => t.teamData && t.teamData['Country'] ? t.teamData['Country'] : '__unknown')
  );
  const leagueCount = clubCountries.size + (DB.teams.some(t => t.type === '2') ? 1 : 0) + (DB.teams.some(t => t.type === '1') ? 1 : 0);
  document.getElementById('stat-leagues').textContent = leagueCount;
  document.getElementById('stat-teams').textContent = DB.teams.length;
  document.getElementById('stat-players').textContent = DB.players.length;
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
          <th>#</th>
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

  return `<tr onclick="selectPlayer('${player.ID}', '${team.id}')">
    <td>
      <img class="player-row-photo"
        src="img/players/${player.ID}.png"
        onerror="this.onerror=null;this.src='img/players/default.png'"
        alt="${player.Name}">
    </td>
    <td>${player.ID}</td>
    <td><strong>${player.Name || '–'}</strong></td>
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
    // Special attributes (pips instead of bar)
    if (SPECIAL_ATTRS[csvCol]) {
      const max = SPECIAL_ATTRS[csvCol].max;
      const v = parseInt(val, 10) || 0;
      let pips = '';
      for (let i = 1; i <= max; i++) {
        pips += `<span class="pip${i <= v ? ' filled' : ''}"></span>`;
      }
      return `<div class="stat-row">
        <span class="stat-name">${label}</span>
        <span class="stat-value" style="background:transparent;color:var(--color-text);min-width:20px">${v}</span>
        <div class="special-attr-pips">${pips}</div>
      </div>`;
    }
    const colorClass = statColorClass(val);
    const barColor = statColor(val);
    const v = parseInt(val, 10) || 0;
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
            onerror="this.onerror=null;this.src='img/players/default.png'"
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
  else showHome();
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
  const maxR = Math.min(cx, cy) - 30;
  const MAX_VAL = 99;
  const labels = Object.keys(attrs);
  const values = Object.values(attrs);
  const n = labels.length;

  ctx.clearRect(0, 0, W, H);

  // Background grid (5 rings)
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
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Axis lines
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Data polygon
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = (values[i] / MAX_VAL) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(139, 26, 26, 0.3)';
  ctx.fill();
  ctx.strokeStyle = '#8b1a1a';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Data points
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = (values[i] / MAX_VAL) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#8b1a1a';
    ctx.fill();
  }

  // Labels
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const labelR = maxR + 18;
    const x = cx + labelR * Math.cos(angle);
    const y = cy + labelR * Math.sin(angle);
    ctx.font = 'bold 11px Segoe UI, sans-serif';
    ctx.fillStyle = '#eaeaea';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], x, y);

    // Value below label
    const valY = cy + (labelR + 12) * Math.sin(angle);
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.fillStyle = '#c0392b';
    ctx.fillText(values[i], x, valY);
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

let searchTimeout = null;

function onSearchInput(event) {
  const query = event.target.value.trim();
  clearTimeout(searchTimeout);
  if (!query) {
    if (currentTeam) renderPlayersList(currentTeam);
    else showHome();
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
          <th></th><th>#</th><th>Nombre</th><th>Nac</th><th>Pos</th>
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
