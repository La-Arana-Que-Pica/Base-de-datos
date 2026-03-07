/**
 * Base de datos Option File PES 2018–2026
 * Main Application Script
 *
 * Architecture:
 *  1. Boot indexer: loads all CSV files on startup
 *  2. In-memory indexes for players, teams, leagues
 *  3. UI rendering for player list and player profile
 */

'use strict';

// ─── In-memory indexes ────────────────────────────────────────────────────────
const DB = {
  leagues: {},    // league_id -> { league_id, league_name, country_id }
  teams: [],      // [{ folder, displayName, filePrefix, teamData, players, appearances, leagueId }]
  players: [],    // flat list for global search
  loaded: false,
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Parse a semicolon-delimited CSV string into an array of objects.
 * Handles Windows-style line endings.
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
 * Fetch a JSON file from the given URL. Returns null on error.
 */
async function fetchJSON(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Return a path to an image, falling back to default if the specific image is missing.
 * We detect broken images via onerror handlers in HTML.
 */
function imgSrc(folder, name, ext = 'png') {
  if (!name) return `img/${folder}/default.${ext}`;
  return `img/${folder}/${name}.${ext}`;
}

/**
 * Set onerror fallback on an <img> element.
 */
function setImgFallback(img, fallbackSrc) {
  img.onerror = () => {
    img.onerror = null; // prevent infinite loop
    img.src = fallbackSrc;
  };
}

/**
 * Convert a country_id (stored as Nationality in player CSV) to a flag image filename.
 * We use the numeric ID as the filename.
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
  showLoading('Loading database...');

  // 1. Load leagues
  const leagueText = await fetchText('database/leagues/leagues.csv');
  if (leagueText) {
    const rows = parseCSV(leagueText);
    rows.forEach(row => {
      DB.leagues[row.league_id] = row;
    });
  }

  // 2. Load teams manifest
  const manifest = await fetchJSON('database/teams/index.json');
  if (!manifest || !Array.isArray(manifest.teams)) {
    showError('Failed to load teams manifest (database/teams/index.json).');
    return;
  }

  // 3. Load each team's CSV files in parallel
  await Promise.all(manifest.teams.map(async teamMeta => {
    const { folder, displayName, filePrefix } = teamMeta;
    const base = `database/teams/${folder}`;

    // Determine which CSV types to load.
    // If the manifest specifies a list, use it; otherwise fall back to the
    // standard 5-file convention expected from the extractor tool.
    // Note: "appearence" (without the extra 'a') is the intentional spelling
    // used by the CSV extractor.
    const csvTypes = Array.isArray(teamMeta.csvFiles) && teamMeta.csvFiles.length
      ? teamMeta.csvFiles
      : ['team', 'players', 'appearence', 'goalkeeper', 'playerinfo'];

    // Fetch all declared CSV files in parallel
    const fetchMap = {};
    await Promise.all(csvTypes.map(async type => {
      const text = await fetchText(`${base}/${filePrefix}_${type}.csv`);
      fetchMap[type] = text ? parseCSV(text) : [];
    }));

    const teamRows   = fetchMap.team     || [];
    const playerRows = fetchMap.players  || [];

    // Build lookup maps keyed by PlayerID for all per-player CSV types
    const appearanceMap = {};
    const goalkeeperMap = {};
    const playerinfoMap = {};

    (fetchMap.appearence  || []).forEach(r => { appearanceMap[r.PlayerID] = r; });
    (fetchMap.goalkeeper  || []).forEach(r => { goalkeeperMap[r.PlayerID] = r; });
    (fetchMap.playerinfo  || []).forEach(r => { playerinfoMap[r.PlayerID] = r; });

    // Determine league from Country field in team CSV
    const leagueId = teamRows.length > 0 ? teamRows[0].Country : null;
    const league = leagueId ? DB.leagues[leagueId] : null;

    const team = {
      folder,
      displayName,
      filePrefix,
      csvTypes,
      teamData: teamRows[0] || {},
      players: playerRows,
      appearanceMap,
      goalkeeperMap,
      playerinfoMap,
      leagueId,
      league,
    };

    DB.teams.push(team);

    // Add players to global flat list with team reference
    playerRows.forEach(p => {
      DB.players.push({ ...p, _team: team });
    });
  }));

  DB.loaded = true;
  buildSidebar();
  showHome();
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');

  // Group teams by league
  const leagueGroups = {};
  DB.teams.forEach(team => {
    const lid = team.leagueId || 'unknown';
    if (!leagueGroups[lid]) {
      leagueGroups[lid] = {
        league: team.league || { league_id: lid, league_name: 'Unknown League', country_id: '' },
        teams: [],
      };
    }
    leagueGroups[lid].teams.push(team);
  });

  let html = `<div class="sidebar-section">
    <div class="sidebar-section-title">Leagues &amp; Teams</div>`;

  Object.values(leagueGroups).forEach(group => {
    const lid = group.league.league_id;
    const leagueName = group.league.league_name;
    html += `
    <div class="sidebar-league" data-league-id="${lid}">
      <div class="sidebar-league-header" onclick="toggleLeague('${lid}')">
        <img class="sidebar-league-logo" src="img/leagues/${lid}.png"
          onerror="this.onerror=null;this.src='img/leagues/default.png'"
          alt="${leagueName}">
        <span class="sidebar-league-name">${leagueName}</span>
        <span class="sidebar-league-arrow">▶</span>
      </div>
      <div class="sidebar-teams-list" id="league-teams-${lid}">`;

    group.teams.forEach(team => {
      html += `
        <div class="sidebar-team-item" id="sidebar-team-${team.folder}"
          onclick="selectTeam('${team.folder}')">
          <img class="sidebar-team-crest" src="img/teams/${team.folder}.png"
            onerror="this.onerror=null;this.src='img/teams/default.png'"
            alt="${team.displayName}">
          <span>${team.displayName}</span>
        </div>`;
    });

    html += `
      </div>
    </div>`;
  });

  html += `</div>`;
  sidebar.innerHTML = html;
}

function toggleLeague(leagueId) {
  const header = document.querySelector(`[data-league-id="${leagueId}"] .sidebar-league-header`);
  const list = document.getElementById(`league-teams-${leagueId}`);
  if (!header || !list) return;
  header.classList.toggle('open');
  list.classList.toggle('open');
}

function openLeague(leagueId) {
  const header = document.querySelector(`[data-league-id="${leagueId}"] .sidebar-league-header`);
  const list = document.getElementById(`league-teams-${leagueId}`);
  if (!header || !list) return;
  header.classList.add('open');
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

function showLoading(message = 'Loading...') {
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

  // Update stats
  document.getElementById('stat-teams').textContent = DB.teams.length;
  document.getElementById('stat-players').textContent = DB.players.length;
  document.getElementById('stat-leagues').textContent = Object.keys(DB.leagues).length;
}

// ─── Team / Players view ──────────────────────────────────────────────────────

let currentTeam = null;

function selectTeam(folder) {
  const team = DB.teams.find(t => t.folder === folder);
  if (!team) return;

  currentTeam = team;

  // Highlight in sidebar
  document.querySelectorAll('.sidebar-team-item').forEach(el => el.classList.remove('active'));
  const sidebarItem = document.getElementById(`sidebar-team-${folder}`);
  if (sidebarItem) sidebarItem.classList.add('active');

  // Open the league section
  if (team.leagueId) openLeague(team.leagueId);

  renderPlayersList(team);
}

function renderPlayersList(team) {
  hideAllViews();

  const view = document.getElementById('players-view');
  view.classList.add('active');

  const leagueName = team.league ? team.league.league_name : 'Unknown League';

  view.innerHTML = `
    <div class="view-header">
      <img class="team-crest" src="img/teams/${team.folder}.png"
        onerror="this.onerror=null;this.src='img/teams/default.png'"
        alt="${team.displayName}">
      <div>
        <div class="view-title">${team.displayName}</div>
        <div class="view-subtitle">${leagueName}</div>
      </div>
    </div>
    <table class="players-table">
      <thead>
        <tr>
          <th></th>
          <th>#</th>
          <th>Name</th>
          <th>Nat</th>
          <th>Pos</th>
          <th>OVR</th>
          <th>SPD</th>
          <th>DRI</th>
          <th>SHT</th>
          <th>PAS</th>
          <th>PHY</th>
          <th>DEF</th>
          <th>Apps</th>
          <th>Goals</th>
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
  const appearance = team.appearanceMap[player.ID] || {};
  const games = appearance.Games || '–';
  const goals = appearance.Goals || '–';

  const radarAttrs = computeRadarAttributes(player);

  return `<tr onclick="selectPlayer('${player.ID}', '${team.folder}')">
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
    <td><span class="position-badge">${player.Position || '–'}</span></td>
    <td><span class="overall-badge ${ovrClass}">${ovr}</span></td>
    <td>${radarAttrs.SPD}</td>
    <td>${radarAttrs.DRI}</td>
    <td>${radarAttrs.SHT}</td>
    <td>${radarAttrs.PAS}</td>
    <td>${radarAttrs.PHY}</td>
    <td>${radarAttrs.DEF}</td>
    <td>${games}</td>
    <td>${goals}</td>
  </tr>`;
}

// ─── Player profile ───────────────────────────────────────────────────────────

function selectPlayer(playerId, teamFolder) {
  const team = DB.teams.find(t => t.folder === teamFolder);
  if (!team) return;
  const player = team.players.find(p => p.ID === playerId);
  if (!player) return;
  renderPlayerProfile(player, team);
}

/**
 * The stats to show in the Ability Settings panel.
 */
const ABILITY_STATS = [
  { key: 'AttackingProwess', label: 'Attacking Prowess' },
  { key: 'BallControl',      label: 'Ball Control' },
  { key: 'Dribbling',        label: 'Dribbling' },
  { key: 'LowPass',          label: 'Low Pass' },
  { key: 'LoftedPass',       label: 'Lofted Pass' },
  { key: 'Finishing',        label: 'Finishing' },
  { key: 'SetPieceTaking',   label: 'Set Piece Taking' },
  { key: 'Curve',            label: 'Curve' },
  { key: 'Speed',            label: 'Speed' },
  { key: 'PhysicalContact',  label: 'Physical Contact' },
  { key: 'DefensiveAwareness', label: 'Defensive Awareness' },
];

/**
 * Compute the 6 radar chart attributes from raw player stats.
 */
function computeRadarAttributes(player) {
  const avg = (...keys) => {
    const vals = keys.map(k => parseInt(player[k], 10)).filter(v => !isNaN(v));
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  return {
    PAS: avg('LowPass', 'LoftedPass', 'Curve', 'SetPieceTaking'),
    SHT: avg('Finishing', 'AttackingProwess'),
    PHY: avg('PhysicalContact'),
    DEF: avg('DefensiveAwareness'),
    SPD: avg('Speed'),
    DRI: avg('Dribbling', 'BallControl'),
  };
}

/**
 * The GK-specific stats shown when a player's position is GK.
 */
const GK_STATS = [
  { key: 'GKDiving',      label: 'Diving' },
  { key: 'GKReflexes',    label: 'Reflexes' },
  { key: 'GKHandling',    label: 'Handling' },
  { key: 'GKKicking',     label: 'Kicking' },
  { key: 'GKSpeed',       label: 'GK Speed' },
  { key: 'GKPositioning', label: 'Positioning' },
];

function renderPlayerProfile(player, team) {
  hideAllViews();
  const view = document.getElementById('player-view');
  view.classList.add('active');

  const appearance  = team.appearanceMap[player.ID]  || {};
  const gkData      = team.goalkeeperMap[player.ID]  || {};
  const playerInfo  = team.playerinfoMap[player.ID]  || {};
  const radarAttrs  = computeRadarAttributes(player);
  const leagueName  = team.league ? team.league.league_name : 'Unknown League';
  const isGK        = (player.Position || '').toUpperCase() === 'GK';

  // Ability stats rows
  const statsHtml = ABILITY_STATS.map(stat => {
    const val = player[stat.key] || '0';
    const colorClass = statColorClass(val);
    const barColor = statColor(val);
    const pct = Math.min(100, parseInt(val, 10) || 0);
    return `<div class="stat-row">
      <span class="stat-name">${stat.label}</span>
      <span class="stat-value ${colorClass}">${val}</span>
      <div class="stat-bar-container">
        <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
    </div>`;
  }).join('');

  // GK stats rows (only for GK position)
  const gkHtml = isGK ? `
    <div class="ability-title gk-title">Goalkeeper Stats</div>
    <div class="stats-list">
      ${GK_STATS.map(stat => {
        const val = gkData[stat.key] || '0';
        const colorClass = statColorClass(val);
        const barColor = statColor(val);
        const pct = Math.min(100, parseInt(val, 10) || 0);
        return `<div class="stat-row">
          <span class="stat-name">${stat.label}</span>
          <span class="stat-value ${colorClass}">${val}</span>
          <div class="stat-bar-container">
            <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  // Physical info rows (from playerinfo CSV)
  const physicalHtml = (playerInfo.Height || playerInfo.Age || playerInfo.KitNumber) ? `
    <div class="player-physical-card">
      ${playerInfo.KitNumber ? `<div class="physical-row"><span class="info-label">Kit #</span><span>${playerInfo.KitNumber}</span></div>` : ''}
      ${playerInfo.Age       ? `<div class="physical-row"><span class="info-label">Age</span><span>${playerInfo.Age}</span></div>` : ''}
      ${playerInfo.Height    ? `<div class="physical-row"><span class="info-label">Height</span><span>${playerInfo.Height} cm</span></div>` : ''}
      ${playerInfo.Weight    ? `<div class="physical-row"><span class="info-label">Weight</span><span>${playerInfo.Weight} kg</span></div>` : ''}
      ${playerInfo.DominantFoot ? `<div class="physical-row"><span class="info-label">Foot</span><span>${playerInfo.DominantFoot}</span></div>` : ''}
      ${playerInfo.WeakFoot  ? `<div class="physical-row"><span class="info-label">Weak Foot</span><span>${'★'.repeat(parseInt(playerInfo.WeakFoot, 10) || 0)}</span></div>` : ''}
    </div>` : '';

  view.innerHTML = `
    <button class="back-btn" onclick="goBackToTeam()">◀ Back to ${team.displayName}</button>

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
            <span class="info-label">Nationality</span>
            <img src="${flagSrc(player.Nationality)}"
              onerror="this.onerror=null;this.src='img/flags/default.png'"
              alt="">
            <span>${player.Nationality || '–'}</span>
          </div>
          <div class="player-info-row">
            <span class="info-label">Team</span>
            <img class="team-crest-sm"
              src="img/teams/${team.folder}.png"
              onerror="this.onerror=null;this.src='img/teams/default.png'"
              alt="${team.displayName}">
            <span>${team.displayName}</span>
          </div>
          <div class="player-info-row">
            <span class="info-label">League</span>
            <img class="sidebar-league-logo"
              src="img/leagues/${team.leagueId || 'default'}.png"
              onerror="this.onerror=null;this.src='img/leagues/default.png'"
              alt="${leagueName}">
            <span>${leagueName}</span>
          </div>
        </div>
        ${physicalHtml}
      </div>

      <!-- CENTER: ability settings -->
      <div class="player-center">
        <div class="player-name-line">${player.Name || 'Unknown Player'}</div>
        <div class="player-position-overall">
          <span class="position-badge">${player.Position || '–'}</span>
          <span class="overall-large">${player.Overall || '–'}</span>
        </div>
        <div class="ability-title">Ability Settings</div>
        <div class="stats-list">
          ${statsHtml}
        </div>
        ${gkHtml}
      </div>

      <!-- RIGHT: radar + appearances -->
      <div class="player-right">
        <div class="radar-card">
          <h3>Attribute Radar</h3>
          <canvas id="radar-canvas" width="260" height="260"></canvas>
          <div id="radar-labels-row" style="margin-top:8px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;font-size:0.72rem;color:var(--color-text-muted)"></div>
        </div>
        <div class="appearance-card">
          <h3>Season Stats</h3>
          <div class="appearance-stats">
            <div class="appearance-item">
              <div class="value">${appearance.Games || 0}</div>
              <div class="label">Games</div>
            </div>
            <div class="appearance-item">
              <div class="value">${appearance.Goals || 0}</div>
              <div class="label">Goals</div>
            </div>
            <div class="appearance-item">
              <div class="value">${appearance.Assists || 0}</div>
              <div class="label">Assists</div>
            </div>
            <div class="appearance-item">
              <div class="value">${appearance.YellowCards || 0}</div>
              <div class="label">Yellow Cards</div>
            </div>
            <div class="appearance-item">
              <div class="value">${appearance.RedCards || 0}</div>
              <div class="label">Red Cards</div>
            </div>
            <div class="appearance-item">
              <div class="value">${appearance.MinutesPlayed || 0}</div>
              <div class="label">Minutes</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  // Draw radar chart after DOM is updated
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
  ctx.fillStyle = 'rgba(233, 69, 96, 0.3)';
  ctx.fill();
  ctx.strokeStyle = '#e94560';
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
    ctx.fillStyle = '#e94560';
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
    ctx.fillStyle = '#e94560';
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
  const q = query.toLowerCase();
  const results = DB.players.filter(p =>
    (p.Name && p.Name.toLowerCase().includes(q)) ||
    (p.Position && p.Position.toLowerCase().includes(q))
  );

  hideAllViews();
  const view = document.getElementById('search-view');
  view.classList.add('active');

  if (!results.length) {
    view.innerHTML = `<div class="view-header"><div class="view-title">Search results for "${query}"</div></div>
      <div class="error-message">No players found matching "${query}"</div>`;
    return;
  }

  const rowsHtml = results.map(p => renderPlayerRow(p, p._team)).join('');

  view.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Search: "${query}"</div>
        <div class="view-subtitle">${results.length} player(s) found</div>
      </div>
    </div>
    <table class="players-table">
      <thead>
        <tr>
          <th></th><th>#</th><th>Name</th><th>Nat</th><th>Pos</th>
          <th>OVR</th><th>SPD</th><th>DRI</th><th>SHT</th>
          <th>PAS</th><th>PHY</th><th>DEF</th><th>Apps</th><th>Goals</th>
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
    showError(`Unexpected error during startup: ${err.message}`);
    console.error(err);
  });
});
