/**
 * Base de datos Option File PES 2018–2026
 * Team Profile Page Script
 *
 * Loads a team's full roster from URL params:
 *   team.html?id=TEAMID
 */

'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────

function handleMinifaceError(img, playerId) {
  if (!img.dataset.ddsTried) {
    img.dataset.ddsTried = '1';
    img.src = 'img/players/player_' + playerId + '.dds';
  } else {
    img.onerror = null;
    img.src = 'img/players/default.png';
  }
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
  if (!countryId) return 'img/flags/default.png';
  return `img/flags/${countryId}.png`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statColorClass(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'stat-red';
  if (v >= 75) return 'stat-green';
  if (v >= 60) return 'stat-yellow';
  return 'stat-red';
}

function overallColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'stat-red';
  if (v >= 80) return 'stat-green';
  if (v >= 70) return 'stat-yellow';
  return 'stat-red';
}

// ─── Translations (UI display only) ──────────────────────────────────────────

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

function translatePosition(pesPos) {
  return POSITION_LABELS[pesPos] || pesPos;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PES_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

// Position groups for squad display
const POSITION_GROUPS = [
  { key: 'PT',  label: 'Porteros',        positions: ['GK'] },
  { key: 'DEF', label: 'Defensas',        positions: ['CB', 'RB', 'LB'] },
  { key: 'MID', label: 'Mediocampistas',  positions: ['DMF', 'CMF', 'RMF', 'LMF', 'AMF'] },
  { key: 'FWD', label: 'Delanteros',      positions: ['RWF', 'LWF', 'SS', 'CF'] },
];

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

// ─── Radar chart helpers ──────────────────────────────────────────────────────

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

// ─── Sort / Filter state ──────────────────────────────────────────────────────

let _sortCol = 'OVR';
let _sortDir = 'desc';
let _players = [];
let _teamId = null;
let _filterPos = '';
let _filterMinOvr = '';
let _filterMaxOvr = '';

const SORT_COLS = {
  'OVR':  p => parseInt(p.Overall, 10) || 0,
  'NAME': p => (p.Name || '').toLowerCase(),
  'POS':  p => (p.Position || ''),
  'VEL':  p => computeRadarAttributes(p).VEL,
  'DRI':  p => computeRadarAttributes(p).DRI,
  'TIR':  p => computeRadarAttributes(p).TIR,
  'PAS':  p => computeRadarAttributes(p).PAS,
  'FIS':  p => computeRadarAttributes(p).FIS,
  'DEF':  p => computeRadarAttributes(p).DEF,
};

function getSortedFilteredPlayers() {
  let list = _players.slice();

  // Filter by position
  if (_filterPos) {
    list = list.filter(p => (p.Position || '') === _filterPos);
  }

  // Filter by OVR range
  if (_filterMinOvr !== '') {
    const min = parseInt(_filterMinOvr, 10);
    if (!isNaN(min)) list = list.filter(p => (parseInt(p.Overall, 10) || 0) >= min);
  }
  if (_filterMaxOvr !== '') {
    const max = parseInt(_filterMaxOvr, 10);
    if (!isNaN(max)) list = list.filter(p => (parseInt(p.Overall, 10) || 0) <= max);
  }

  // Sort
  const getter = SORT_COLS[_sortCol] || SORT_COLS['OVR'];
  list.sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);
    if (va < vb) return _sortDir === 'asc' ? -1 : 1;
    if (va > vb) return _sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return list;
}

function setSort(col) {
  if (_sortCol === col) {
    _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _sortCol = col;
    _sortDir = col === 'NAME' || col === 'POS' ? 'asc' : 'desc';
  }
  refreshTableBody();
  updateSortHeaders();
}

function updateSortHeaders() {
  document.querySelectorAll('#players-table th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const col = th.dataset.sortCol;
    if (col === _sortCol) {
      th.classList.add(_sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = _sortDir === 'asc' ? '▲' : '▼';
    } else {
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = '⇅';
    }
  });
}

function refreshTableBody() {
  const tbody = document.querySelector('#players-table tbody');
  if (!tbody || !_teamId) return;
  const list = getSortedFilteredPlayers();
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--color-text-muted)">Sin resultados para los filtros seleccionados.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(p => renderPlayerRow(p, _teamId)).join('');
}

function applyFilters() {
  const posEl = document.getElementById('filter-position');
  const minEl = document.getElementById('filter-min-ovr');
  const maxEl = document.getElementById('filter-max-ovr');
  _filterPos = posEl ? posEl.value : '';
  _filterMinOvr = minEl ? minEl.value.trim() : '';
  _filterMaxOvr = maxEl ? maxEl.value.trim() : '';
  refreshTableBody();
}

function resetFilters() {
  _filterPos = '';
  _filterMinOvr = '';
  _filterMaxOvr = '';
  const posEl = document.getElementById('filter-position');
  const minEl = document.getElementById('filter-min-ovr');
  const maxEl = document.getElementById('filter-max-ovr');
  if (posEl) posEl.value = '';
  if (minEl) minEl.value = '';
  if (maxEl) maxEl.value = '';
  refreshTableBody();
}

// ─── Formation pitch rendering ────────────────────────────────────────────────

/**
 * Build an HTML string showing the formation as a football pitch with player
 * mini-faces and names. Coordinates from the formation CSV:
 *   Ubicacion X = depth (0 = own goal, ~52 = midfield)
 *   Ubicacion Y = width  (0 = left touchline, ~100 = right touchline)
 */
function renderFormationPitch(players, formationRow) {
  if (!formationRow || !players.length) return '';

  const tokens = [];

  for (let i = 1; i <= 11; i++) {
    const rawIdx = formationRow[`Indice Jugador ${i}`];
    const squadIdx = parseInt(rawIdx, 10);
    if (isNaN(squadIdx) || squadIdx < 1 || squadIdx > players.length) continue;
    const player = players[squadIdx - 1];
    if (!player) continue;

    const xDepth = parseFloat(formationRow[`Ubicacion X${i} F1`]) || 0;
    const yWidth  = parseFloat(formationRow[`Ubicacion Y${i} F1`]) || 50;

    // Map to CSS percentage positions:
    //   left: yWidth / 100 * 100%   (0=left, 100=right)
    //   top:  (1 - xDepth / 52) * 100%  (xDepth=0 → bottom, xDepth=52 → top)
    const leftPct   = (yWidth / 100) * 100;
    const topPct    = (1 - xDepth / 52) * 100;

    // Show the last word of the name as a short label
    const shortName = escapeHtml((player.Name || '').split(' ').slice(-1)[0] || player.Name);
    const pid = escapeHtml(player.ID);

    tokens.push(`
      <div class="pitch-player" style="left:${leftPct.toFixed(1)}%;top:${topPct.toFixed(1)}%">
        <div class="pitch-player-photo-wrap">
          <img src="img/players/${pid}.png"
            onerror="handleMinifaceError(this,'${pid}')"
            class="pitch-player-photo" alt="${shortName}">
        </div>
        <div class="pitch-player-name">${shortName}</div>
      </div>`);
  }

  if (!tokens.length) return '';

  return `
    <div class="formation-section">
      <div class="formation-section-title">Formación inicial</div>
      <div class="pitch-container">
        <div class="pitch-field">
          <div class="pitch-halfway-line"></div>
          <div class="pitch-penalty-area-bottom"></div>
          <div class="pitch-goal-area-bottom"></div>
          ${tokens.join('')}
        </div>
      </div>
    </div>`;
}



function renderPlayerRow(player, teamId) {
  const ovr = player.Overall || '–';
  const ovrClass = overallColor(ovr);
  const posDisplay = translatePosition(player.Position);
  const radarAttrs = computeRadarAttributes(player);
  const safeName = escapeHtml(player.Name);

  return `<tr class="player-row" data-player-id="${escapeHtml(player.ID)}" data-team-id="${escapeHtml(teamId)}">
    <td>
      <img class="player-row-photo"
        src="img/players/${escapeHtml(player.ID)}.png"
        onerror="handleMinifaceError(this,'${escapeHtml(player.ID)}')"
        alt="${safeName}">
    </td>
    <td><strong>${safeName || '–'}</strong></td>
    <td>
      <img class="player-flag"
        src="${flagSrc(player.Nationality)}"
        onerror="this.onerror=null;this.src='img/flags/default.png'"
        alt="">
    </td>
    <td><span class="position-badge">${escapeHtml(posDisplay) || '–'}</span></td>
    <td><span class="overall-badge ${ovrClass}">${escapeHtml(ovr)}</span></td>
    <td>${radarAttrs.VEL}</td>
    <td>${radarAttrs.DRI}</td>
    <td>${radarAttrs.TIR}</td>
    <td>${radarAttrs.PAS}</td>
    <td>${radarAttrs.FIS}</td>
    <td>${radarAttrs.DEF}</td>
  </tr>`;
}

function selectPlayer(playerId, teamId) {
  window.location.href = `player.html?id=${encodeURIComponent(playerId)}&team=${encodeURIComponent(teamId)}`;
}

function renderTeamPage(team, players, formationRow) {
  _players = players;
  _teamId = team.id;

  const typeLabel = TYPE_LABELS[team.type] || '';
  const safeTeamName = escapeHtml(team.displayName);

  // Build grouped layout
  const groupedHtml = renderPositionGroups(players, team.id);

  // Build formation pitch (above the squad table)
  const pitchHtml = renderFormationPitch(players, formationRow);

  const content = document.getElementById('team-content');
  content.innerHTML = `
    <button class="back-btn" id="btn-back">◀ Volver</button>

    <div class="view-header">
      <img class="team-crest" src="img/teams/${escapeHtml(team.id)}.png"
        onerror="this.onerror=null;this.src='img/teams/default.png'"
        alt="${safeTeamName}">
      <div>
        <div class="view-title">${safeTeamName}</div>
        <div class="view-subtitle">${escapeHtml(typeLabel)} · ${players.length} jugadores</div>
      </div>
    </div>

    ${pitchHtml}

    <div class="squad-groups">
      ${groupedHtml}
    </div>`;

  content.style.display = 'block';
  document.getElementById('loading-overlay').style.display = 'none';

  // Attach back button handler via DOM (avoids inline onclick)
  document.getElementById('btn-back').addEventListener('click', goBack);

  // Event delegation: clicking any player row navigates to the player page
  content.addEventListener('click', function (e) {
    const row = e.target.closest('.player-row');
    if (!row) return;
    const pid = row.dataset.playerId;
    const tid = row.dataset.teamId;
    if (pid && tid) selectPlayer(pid, tid);
  });

  // Update page title
  document.title = `${team.displayName} – Base de datos PES`;
}

function renderPositionGroups(players, teamId) {
  // Sort each group by OVR descending
  const byPos = {};
  players.forEach(p => {
    const pos = p.Position || '__other';
    if (!byPos[pos]) byPos[pos] = [];
    byPos[pos].push(p);
  });

  const sortByOvr = arr =>
    arr.slice().sort((a, b) => (parseInt(b.Overall, 10) || 0) - (parseInt(a.Overall, 10) || 0));

  let html = '';

  POSITION_GROUPS.forEach(group => {
    const groupPlayers = [];
    group.positions.forEach(pos => {
      if (byPos[pos]) groupPlayers.push(...byPos[pos]);
    });
    if (!groupPlayers.length) return;

    const sorted = sortByOvr(groupPlayers);
    const rowsHtml = sorted.map(p => renderPlayerRow(p, teamId)).join('');

    // Show position abbreviations in the group header
    const posLabels = group.positions.map(p => translatePosition(p)).join(', ');

    html += `
      <div class="position-group">
        <div class="position-group-header">
          <span class="position-group-label">${group.label}</span>
          <span class="position-group-positions">${posLabels}</span>
          <span class="position-group-count">(${sorted.length})</span>
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
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  });

  // Uncategorized players (positions not in any group)
  const categorizedPos = new Set(POSITION_GROUPS.flatMap(g => g.positions));
  const uncategorized = sortByOvr(players.filter(p => !categorizedPos.has(p.Position || '')));
  if (uncategorized.length) {
    html += `
      <div class="position-group">
        <div class="position-group-header">
          <span class="position-group-label">Otros</span>
          <span class="position-group-count">(${uncategorized.length})</span>
        </div>
        <table class="players-table">
          <thead>
            <tr>
              <th></th><th>Nombre</th><th>Nac</th><th>Pos</th>
              <th>OVR</th><th>VEL</th><th>DRI</th><th>TIR</th><th>PAS</th><th>FIS</th><th>DEF</th>
            </tr>
          </thead>
          <tbody>${uncategorized.map(p => renderPlayerRow(p, teamId)).join('')}</tbody>
        </table>
      </div>`;
  }

  if (!html) {
    html = `<div class="error-message">No hay jugadores en este equipo.</div>`;
  }

  return html;
}

// ─── Back navigation ─────────────────────────────────────────────────────────

function goBack() {
  if (document.referrer && new URL(document.referrer).hostname === window.location.hostname) {
    history.back();
  } else {
    window.location.href = 'index.html';
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get('id');

  if (!teamId) {
    showError('Falta el ID del equipo en la URL.');
    return;
  }

  // Load all global CSV files in parallel
  const [teamsText, playersText, squadsText, formationsText] = await Promise.all([
    fetchText('database/All teams exported.csv'),
    fetchText('database/All players exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All formations exported.csv'),
  ]);

  if (!teamsText || !playersText || !squadsText) {
    showError('Error al cargar los archivos de la base de datos.');
    return;
  }

  const { rows: teamRows } = parseCSV(teamsText);
  const { rows: playerRows } = parseCSV(playersText);
  const { rows: squadRows } = parseCSV(squadsText);
  const { rows: formationRows } = formationsText ? parseCSV(formationsText) : { rows: [] };

  // Find the team
  const teamRow = teamRows.find(t => t['Id'] === teamId);
  if (!teamRow) {
    showError(`Equipo con ID "${teamId}" no encontrado en la base de datos.`);
    return;
  }

  const team = {
    id: teamId,
    displayName: teamRow['Name'] || teamId,
    type: teamRow['Type'] || '0',
  };

  // Build normalized player map
  const playerMap = {};
  playerRows.forEach(row => {
    const pid = row['Id'];
    if (pid) playerMap[pid] = normalizePlayerRow(row);
  });

  // Find this team's squad
  const squadRow = squadRows.find(s => s['Id'] === teamId);
  const players = [];
  if (squadRow) {
    for (let i = 1; i <= 32; i++) {
      const pid = squadRow[`Player ${i}`];
      if (!pid || pid === '0') continue;
      const player = playerMap[pid];
      if (player) players.push(player);
    }
  }

  // Find this team's formation data
  const formationRow = formationRows.find(f => f['Id'] === teamId) || null;

  renderTeamPage(team, players, formationRow);
}

// ─── Error display ────────────────────────────────────────────────────────────

function showError(message) {
  document.getElementById('loading-overlay').style.display = 'none';
  const content = document.getElementById('team-content');
  content.textContent = '';

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;

  const backLink = document.createElement('p');
  backLink.style.marginTop = '16px';
  const anchor = document.createElement('a');
  anchor.href = 'index.html';
  anchor.style.color = 'var(--color-highlight)';
  anchor.textContent = '← Volver a la base de datos';
  backLink.appendChild(anchor);

  content.appendChild(errorDiv);
  content.appendChild(backLink);
  content.style.display = 'block';
}

// ─── Entry point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(`Error inesperado: ${err.message}`);
    console.error(err);
  });
});
