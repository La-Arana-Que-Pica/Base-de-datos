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

function positionGroupColor(pesPos) {
  if (pesPos === 'GK') return '#f9d901';
  if (['CB', 'LB', 'RB'].includes(pesPos)) return '#2cccfa';
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(pesPos)) return '#57e42b';
  if (['LWF', 'RWF', 'SS', 'CF'].includes(pesPos)) return '#ff2c77';
  return '#8b949e';
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

// Tactics labels and value maps
const FORMATION_TACTIC_FIELDS = [
  { col: 'EstiloAtaque F1',   label: 'Estilo de ataque',   values: { '0': 'Pelotazo', '1': 'Pase corto', '2': 'Contragolpe', '3': 'Por las bandas', '4': 'Posesión' } },
  { col: 'Creacion F1',       label: 'Creación',           values: { '0': 'Saque de meta', '1': 'Pase corto', '2': 'Pase largo', '3': 'Ataque total' } },
  { col: 'ZonaAtaque F1',     label: 'Zona de ataque',     values: { '0': 'Por las bandas', '1': 'Central', '2': 'Mixto' } },
  { col: 'NumAtaq F1',        label: 'Nº atacantes',       values: {} },
  { col: 'EstiloDefensa F1',  label: 'Estilo defensivo',   values: { '0': 'Caer atrás', '1': 'Corte básico', '2': 'Presión', '3': 'Presión agresiva' } },
  { col: 'ZonaContencion F1', label: 'Zona de contención', values: { '0': 'Media', '1': 'Alta', '2': 'Baja' } },
  { col: 'Presion F1',        label: 'Presión',            values: { '0': 'Sin presión', '1': 'Moderada', '2': 'Agresiva' } },
  { col: 'LineaDefensiva F1', label: 'Línea defensiva',    values: {} },
  { col: 'CierreFilas F1',    label: 'Compacidad',         values: {} },
  { col: 'NumDef F1',         label: 'Nº defensores',      values: {} },
];

// Helper: "J. Álvarez" format
function formatShortName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || '';
  return parts[0].charAt(0).toUpperCase() + '. ' + parts[parts.length - 1];
}

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
 *
 * Note: "Indice Jugador i" values are 0-based indices into the 32-slot squad
 * array, so we use squadSlots[idx] (a 32-element array indexed from 0).
 */
function renderFormationPitch(players, formationRow, squadSlots, teamId) {
  if (!formationRow || !squadSlots || !players.length) return '';

  const captainRawIdx = parseInt(formationRow['Capitan'], 10);
  const tokens = [];

  // Build the starting-11 squad-index array for formation-slot lookups
  const startingSquadIndices = [];
  for (let i = 1; i <= 11; i++) {
    const raw = formationRow[`Indice Jugador ${i}`];
    startingSquadIndices.push(parseInt(raw, 10));
  }

  for (let i = 1; i <= 11; i++) {
    const squadIdx = startingSquadIndices[i - 1];
    // Indice Jugador is 0-based into the 32-slot squad array
    if (isNaN(squadIdx) || squadIdx < 0 || squadIdx >= squadSlots.length) continue;
    const player = squadSlots[squadIdx];
    if (!player) continue;

    const xDepth = parseFloat(formationRow[`Ubicacion X${i} F1`]) || 0;
    const yWidth  = parseFloat(formationRow[`Ubicacion Y${i} F1`]) || 50;

    // Map to CSS percentage positions with 5% padding on each side:
    //   left: 5 + (yWidth / 100) * 90%  (0=left, 100=right, padded to 5%..95%)
    //   top:  3 + (1 - xDepth / 52) * 94%  (xDepth=0 → bottom, xDepth=52 → top)
    const leftPct = 5 + (yWidth / 100) * 90;
    const topPct  = 3 + (1 - xDepth / 52) * 94;

    const shortName = escapeHtml(formatShortName(player.Name || ''));
    const pid = escapeHtml(player.ID);
    const tid = escapeHtml(teamId || '');

    // Use the formation position (Posicion i F1) rather than the player's natural position
    const posRawVal = parseInt(formationRow[`Posicion ${i} F1`], 10);
    const formationPos = (!isNaN(posRawVal) && posRawVal >= 0 && posRawVal < PES_POSITIONS.length)
      ? PES_POSITIONS[posRawVal] : (player.Position || '');
    const posDisplay = escapeHtml(translatePosition(formationPos));
    const posColor = positionGroupColor(formationPos);

    const ovr = escapeHtml(player.Overall || '–');
    const ovrColor = statColor(player.Overall || '');
    const ovrTextColor = statTextColor(ovrColor);
    const isCapitan = !isNaN(captainRawIdx) && squadIdx === captainRawIdx;

    tokens.push(`
      <a class="pitch-player" href="player.html?id=${pid}&team=${tid}" style="left:${leftPct.toFixed(1)}%;top:${topPct.toFixed(1)}%">
        <div class="pitch-player-top">
          <span class="pitch-player-pos-sm" style="color:${posColor}">${posDisplay}</span>
          <div class="pitch-player-photo-wrap">
            <img src="img/players/${pid}.png"
              onerror="handleMinifaceError(this,'${pid}')"
              class="pitch-player-photo" alt="${shortName}">
          </div>${isCapitan ? '<span class="pitch-captain-badge">C</span>' : ''}
        </div>
        <div class="pitch-player-bar">
          <span class="pitch-player-ovr" style="background:${ovrColor};color:${ovrTextColor}">${ovr}</span>
          <span class="pitch-player-name">${shortName}</span>
        </div>
      </a>`);
  }

  if (!tokens.length) return '';

  // Build tactics section
  const tacticsRows = FORMATION_TACTIC_FIELDS.map(tf => {
    const raw = formationRow[tf.col];
    if (raw === undefined || raw === '') return '';
    const translated = tf.values[raw];
    const display = translated !== undefined ? `${translated} (${raw})` : raw;
    return `<div class="tactic-row"><span class="tactic-label">${escapeHtml(tf.label)}</span><span class="tactic-value">${escapeHtml(display)}</span></div>`;
  }).filter(Boolean).join('');

  // Build assignments section
  const assignmentRows = [];

  // For set-piece roles using direct squad-slot indices (0-based)
  const addSquadAssignment = (label, colName) => {
    const rawIdx = parseInt(formationRow[colName], 10);
    if (isNaN(rawIdx) || rawIdx < 0 || rawIdx >= squadSlots.length) return;
    const p = squadSlots[rawIdx];
    if (!p) return;
    assignmentRows.push(`<div class="tactic-row"><span class="tactic-label">${label}</span><span class="tactic-value">${escapeHtml(formatShortName(p.Name || ''))}</span></div>`);
  };

  // For header roles: the value is a 0-based index into the starting-11 formation array
  // (so value 10 means the 11th player in the formation, i.e. startingSquadIndices[10])
  const addHeaderAssignment = (label, colName) => {
    const rawIdx = parseInt(formationRow[colName], 10);
    if (isNaN(rawIdx) || rawIdx < 0) return;
    let p = null;
    if (rawIdx <= 10) {
      // 0-based formation-slot index → look up through the starting-11 squad-index array
      const squadIdx = startingSquadIndices[rawIdx];
      if (!isNaN(squadIdx) && squadIdx >= 0 && squadIdx < squadSlots.length) {
        p = squadSlots[squadIdx];
      }
    }
    if (!p && rawIdx < squadSlots.length) {
      // Fallback: direct squad index
      p = squadSlots[rawIdx];
    }
    if (!p) return;
    assignmentRows.push(`<div class="tactic-row"><span class="tactic-label">${label}</span><span class="tactic-value">${escapeHtml(formatShortName(p.Name || ''))}</span></div>`);
  };

  addSquadAssignment('Capitán', 'Capitan');
  addSquadAssignment('Tiro libre corto', 'TiroCorto');
  addSquadAssignment('Tiro libre largo', 'TiroLargo');
  addSquadAssignment('Córner derecho', 'EsquinaDerecho');
  addSquadAssignment('Córner izquierdo', 'EsquinaIzquierdo');
  addSquadAssignment('Penal', 'Penalti');
  addHeaderAssignment('Remate de cabeza 1', 'Cabeceador1');
  addHeaderAssignment('Remate de cabeza 2', 'Cabeceador2');
  addHeaderAssignment('Remate de cabeza 3', 'Cabeceador3');

  const infoHtml = (tacticsRows || assignmentRows.length) ? `
    <div class="formation-info-columns">
      ${tacticsRows ? `<div class="formation-tactic-block"><div class="formation-block-title">Tácticas</div>${tacticsRows}</div>` : ''}
      ${assignmentRows.length ? `<div class="formation-tactic-block"><div class="formation-block-title">Asignaciones</div>${assignmentRows.join('')}</div>` : ''}
    </div>` : '';

  return `
    <div class="formation-section">
      <div class="formation-section-title">Formación inicial</div>
      <div class="formation-layout">
        <div class="pitch-container">
          <div class="pitch-field">
            ${tokens.join('')}
          </div>
        </div>
        ${infoHtml}
      </div>
    </div>`;
}



function renderPlayerRow(player, teamId) {
  const ovr = player.Overall || '–';
  const ovrColor = statColor(ovr);
  const ovrTextColor = statTextColor(ovrColor);
  const posDisplay = translatePosition(player.Position);
  const radarAttrs = computeRadarAttributes(player);
  const safeName = escapeHtml(player.Name);
  const shirtNum = player._shirtNumber ? escapeHtml(String(player._shirtNumber)) : '–';

  return `<tr class="player-row" data-player-id="${escapeHtml(player.ID)}" data-team-id="${escapeHtml(teamId)}">
    <td class="shirt-number-cell">${shirtNum}</td>
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
    <td><span class="position-badge" style="color:${positionGroupColor(player.Position)};border-color:${positionGroupColor(player.Position)};background:${positionGroupColor(player.Position)}18">${escapeHtml(posDisplay) || '–'}</span></td>
    <td><span class="overall-badge" style="background:${ovrColor};color:${ovrTextColor}">${escapeHtml(ovr)}</span></td>
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

function renderTeamPage(team, players, formationRow, squadSlots) {
  _players = players;
  _teamId = team.id;

  const typeLabel = TYPE_LABELS[team.type] || '';
  const safeTeamName = escapeHtml(team.displayName);

  // Build grouped layout
  const groupedHtml = renderPositionGroups(players, team.id);

  // Build formation pitch (above the squad table)
  const pitchHtml = renderFormationPitch(players, formationRow, squadSlots, team.id);

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
              <th class="shirt-number-cell">#</th>
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
              <th class="shirt-number-cell">#</th>
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
  // Build a 0-indexed 32-slot array (some slots may be null) for formation lookup
  const squadSlots = new Array(32).fill(null);
  if (squadRow) {
    for (let i = 1; i <= 32; i++) {
      const pid = squadRow[`Player ${i}`];
      if (!pid || pid === '0') continue;
      const player = playerMap[pid];
      if (player) {
        const shirtNum = squadRow[`Shirt number ${i}`];
        const playerWithShirt = { ...player, _shirtNumber: shirtNum && shirtNum !== '0' ? parseInt(shirtNum, 10) || null : null };
        players.push(playerWithShirt);
        squadSlots[i - 1] = playerWithShirt;  // 0-indexed (slot i → index i-1)
      }
    }
  }

  // Find this team's formation data
  const formationRow = formationRows.find(f => f['Id'] === teamId) || null;

  renderTeamPage(team, players, formationRow, squadSlots);
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
