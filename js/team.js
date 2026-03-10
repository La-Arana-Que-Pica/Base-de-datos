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
  { col: 'EstiloAtaque F1',   label: 'Estilos de ataque',              values: { '0': 'Contraataque', '1': 'Juego de posesión' } },
  { col: 'Creacion F1',       label: 'Creación',                       values: { '0': 'Pase largo', '1': 'Pase corto' } },
  { col: 'ZonaAtaque F1',     label: 'Zona de ataque',                 values: { '0': 'Por las bandas', '1': 'Centro' } },
  { col: 'Colocacion F1',     label: 'Posicionamiento',                values: { '0': 'Mantener formación', '1': 'Flexible' } },
  { col: 'ZonaApoyo F1',      label: 'Zona de apoyo',                  values: {} },
  { col: 'EstiloDefensa F1',  label: 'Estilos de defensa',             values: { '0': 'Presión en la frontal', '1': 'Defensa total' } },
  { col: 'ZonaContencion F1', label: 'Zona de contención',             values: { '0': 'Centro', '1': 'Por las bandas' } },
  { col: 'Presion F1',        label: 'Presión',                        values: { '0': 'Agresivo', '1': 'Conservador' } },
  { col: 'LineaDefensiva F1', label: 'Línea defensiva',                values: {} },
  { col: 'CierreFilas F1',    label: 'Distancia al jugador con balón', values: {} },
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

  // Build the starting-11 squad-index array for formation-slot lookups
  const startingSquadIndices = [];
  for (let i = 1; i <= 11; i++) {
    const raw = formationRow[`Indice Jugador ${i}`];
    startingSquadIndices.push(parseInt(raw, 10));
  }

  // Build player tokens for a given column suffix (e.g. 'F1', 'F1 Con Balon', 'F1 Sin Balon')
  function buildPitchTokens(suffix) {
    const tokens = [];
    for (let i = 1; i <= 11; i++) {
      const squadIdx = startingSquadIndices[i - 1];
      // Indice Jugador is 0-based into the 32-slot squad array
      if (isNaN(squadIdx) || squadIdx < 0 || squadIdx >= squadSlots.length) continue;
      const player = squadSlots[squadIdx];
      if (!player) continue;

      const xDepth = parseFloat(formationRow[`Ubicacion X${i} ${suffix}`]) || 0;
      const yWidth  = parseFloat(formationRow[`Ubicacion Y${i} ${suffix}`]) || 52;

      // Map to CSS percentage positions on a full pitch (630×670):
      //   left: 5 + (yWidth / 104) * 90%  (0=left touchline → 5%, 52=center → 50%, 104=right → 95%)
      //   top:  7 + (1 - xDepth / 52) * 86%  (xDepth=52=midfield → 7%, xDepth=0=own goal → 93%)
      const leftPct = 5 + (yWidth / 104) * 90;
      const topPct  = 7 + (1 - xDepth / 52) * 86;

      const shortName = escapeHtml(formatShortName(player.Name || ''));
      const pid = escapeHtml(player.ID);
      const tid = escapeHtml(teamId || '');

      // Use the formation position rather than the player's natural position
      const posRawVal = parseInt(formationRow[`Posicion ${i} ${suffix}`], 10);
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
            <div class="pitch-player-photo-wrap">
              <img src="img/players/${pid}.png"
                onerror="handleMinifaceError(this,'${pid}')"
                class="pitch-player-photo" alt="${shortName}">
            </div>
          </div>
          <div class="pitch-player-bar">
            <span class="pitch-player-ovr-block">
              <span class="pitch-player-pos-sm" style="color:${posColor};opacity:0.65">${posDisplay}</span>
              <span class="pitch-player-ovr" style="background:${ovrColor};color:${ovrTextColor}">${ovr}</span>
            </span>
            <span class="pitch-player-name">${shortName}</span>
            ${isCapitan ? '<span class="pitch-captain-badge">C</span>' : ''}
          </div>
        </a>`);
    }
    return tokens;
  }

  // Build pitch field HTML for a given suffix
  function buildPitchField(suffix) {
    const tokens = buildPitchTokens(suffix);
    return `
      <div class="pitch-field">
        <div class="pf-mark pf-halfway"></div>
        <div class="pf-mark pf-center-circle"></div>
        <div class="pf-mark pf-penalty-top"></div>
        <div class="pf-mark pf-goal-top"></div>
        <div class="pf-mark pf-penalty-bottom"></div>
        <div class="pf-mark pf-goal-bottom"></div>
        ${tokens.join('')}
      </div>`;
  }

  const defaultTokens = buildPitchTokens('F1');
  if (!defaultTokens.length) return '';

  // Build tactics section
  const tacticsRows = FORMATION_TACTIC_FIELDS.map(tf => {
    const raw = formationRow[tf.col];
    if (raw === undefined || raw === '') return '';
    const translated = tf.values[raw];
    const display = translated !== undefined ? translated : raw;
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

  // For header roles: the value is a 0-based direct squad slot index
  const addHeaderAssignment = (label, colName) => {
    const rawIdx = parseInt(formationRow[colName], 10);
    if (isNaN(rawIdx) || rawIdx < 0 || rawIdx >= squadSlots.length) return;
    const p = squadSlots[rawIdx];
    if (!p) return;
    assignmentRows.push(`<div class="tactic-row"><span class="tactic-label">${label}</span><span class="tactic-value">${escapeHtml(formatShortName(p.Name || ''))}</span></div>`);
  };

  addSquadAssignment('Capitán', 'Capitan');
  addSquadAssignment('Tiro libre corto', 'TiroCorto');
  addSquadAssignment('Tiro libre largo', 'TiroLargo');
  addSquadAssignment('Segundo cobrador', 'Cabeceador1');
  addSquadAssignment('Córner derecho', 'EsquinaDerecho');
  addSquadAssignment('Córner izquierdo', 'EsquinaIzquierdo');
  addSquadAssignment('Penal', 'Penalti');
  addHeaderAssignment('Remate de cabeza 1', 'SegundoCobrador');
  addHeaderAssignment('Remate de cabeza 2', 'Cabeceador2');
  addHeaderAssignment('Remate de cabeza 3', 'Cabeceador3');

  const infoHtml = (tacticsRows || assignmentRows.length) ? `
    <div class="formation-info-columns">
      ${tacticsRows ? `<div class="formation-tactic-block"><div class="formation-block-title">Tácticas</div>${tacticsRows}</div>` : ''}
      ${assignmentRows.length ? `<div class="formation-tactic-block"><div class="formation-block-title">Asignaciones</div>${assignmentRows.join('')}</div>` : ''}
    </div>` : '';

  const fluidaVal = parseInt(formationRow['Fluida F1'], 10);
  const isFluid = !isNaN(fluidaVal) && fluidaVal !== 0;

  if (!isFluid) {
    return `
      <div class="formation-section">
        <div class="formation-section-title">Formación inicial</div>
        <div class="formation-layout">
          <div class="pitch-container">
            ${buildPitchField('F1')}
          </div>
          ${infoHtml}
        </div>
      </div>`;
  }

  // Fluid formation: three tabs (General / Con Balón / Sin Balón)
  return `
    <div class="formation-section">
      <div class="formation-tabs">
        <button class="formation-tab-btn active" data-variant="F1">General</button>
        <button class="formation-tab-btn" data-variant="F1 Con Balon">Con Balón</button>
        <button class="formation-tab-btn" data-variant="F1 Sin Balon">Sin Balón</button>
      </div>
      <div class="formation-section-title">Formación inicial</div>
      <div class="formation-layout" data-variant="F1">
        <div class="pitch-container">
          ${buildPitchField('F1')}
        </div>
        ${infoHtml}
      </div>
      <div class="formation-layout" data-variant="F1 Con Balon" style="display:none">
        <div class="pitch-container">
          ${buildPitchField('F1 Con Balon')}
        </div>
        ${infoHtml}
      </div>
      <div class="formation-layout" data-variant="F1 Sin Balon" style="display:none">
        <div class="pitch-container">
          ${buildPitchField('F1 Sin Balon')}
        </div>
        ${infoHtml}
      </div>
    </div>`;
}


// ─── Player card carousel ─────────────────────────────────────────────────────

function renderPlayerCard(player, teamId) {
  const ovr = player.Overall || '–';
  const ovrColor = statColor(ovr);
  const posDisplay = escapeHtml(translatePosition(player.Position || ''));
  const posColor = positionGroupColor(player.Position || '');
  const radarAttrs = computeRadarAttributes(player);
  const safeName = escapeHtml(player.Name || '–');
  const pid = escapeHtml(player.ID);
  const tid = escapeHtml(teamId || '');

  const velColor = statColor(radarAttrs.VEL);
  const driColor = statColor(radarAttrs.DRI);
  const tirColor = statColor(radarAttrs.TIR);
  const pasColor = statColor(radarAttrs.PAS);
  const fisColor = statColor(radarAttrs.FIS);
  const defColor = statColor(radarAttrs.DEF);

  return `
    <a class="player-card" href="player.html?id=${pid}&team=${tid}">
      <div class="player-card-top" style="background:linear-gradient(135deg,${ovrColor}33 0%,${ovrColor}11 100%)">
        <div class="player-card-ovr-block">
          <span class="player-card-ovr" style="color:${ovrColor}">${escapeHtml(ovr)}</span>
          <span class="player-card-pos" style="color:${posColor}">${posDisplay}</span>
        </div>
        <div class="player-card-badge-col">
          <img class="player-card-flag" src="${flagSrc(player.Nationality)}"
            onerror="this.onerror=null;this.src='img/flags/default.png'" alt="">
          <img class="player-card-crest" src="img/teams/${tid}.png"
            onerror="this.onerror=null;this.src='img/teams/default.png'" alt="">
        </div>
      </div>
      <div class="player-card-photo-wrap">
        <img class="player-card-photo" src="img/players/${pid}.png"
          onerror="handleMinifaceError(this,'${pid}')" alt="${safeName}">
      </div>
      <div class="player-card-footer">
        <div class="player-card-name">${safeName}</div>
        <div class="player-card-stats">
          <div class="pcs"><span class="pcs-val" style="color:${velColor}">${radarAttrs.VEL}</span><span class="pcs-key">VEL</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${driColor}">${radarAttrs.DRI}</span><span class="pcs-key">DRI</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${tirColor}">${radarAttrs.TIR}</span><span class="pcs-key">TIR</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${pasColor}">${radarAttrs.PAS}</span><span class="pcs-key">PAS</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${fisColor}">${radarAttrs.FIS}</span><span class="pcs-key">FIS</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${defColor}">${radarAttrs.DEF}</span><span class="pcs-key">DEF</span></div>
        </div>
      </div>
    </a>`;
}

function renderPlayerCarousel(players, teamId) {
  if (!players || !players.length) {
    return `<div class="player-cards-section"><p style="color:var(--color-text-muted);padding:16px 0">No hay jugadores en este equipo.</p></div>`;
  }

  const sortByOvr = arr =>
    arr.slice().sort((a, b) => (parseInt(b.Overall, 10) || 0) - (parseInt(a.Overall, 10) || 0));

  // Build grouped sections by POSITION_GROUPS
  const categorizedPos = new Set(POSITION_GROUPS.flatMap(g => g.positions));
  let groupsHtml = '';

  POSITION_GROUPS.forEach(group => {
    const groupPlayers = sortByOvr(
      players.filter(p => group.positions.includes(p.Position || ''))
    );
    if (!groupPlayers.length) return;

    groupsHtml += `
      <div class="player-cards-group">
        <div class="player-cards-group-header">
          <span class="player-cards-group-title">${group.label}</span>
          <span class="player-cards-group-count">${groupPlayers.length}</span>
        </div>
        <div class="player-cards-row">
          ${groupPlayers.map(p => renderPlayerCard(p, teamId)).join('')}
        </div>
      </div>`;
  });

  // Uncategorized players
  const uncategorized = sortByOvr(players.filter(p => !categorizedPos.has(p.Position || '')));
  if (uncategorized.length) {
    groupsHtml += `
      <div class="player-cards-group">
        <div class="player-cards-group-header">
          <span class="player-cards-group-title">Otros</span>
          <span class="player-cards-group-count">${uncategorized.length}</span>
        </div>
        <div class="player-cards-row">
          ${uncategorized.map(p => renderPlayerCard(p, teamId)).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="player-cards-section">
      <div class="player-cards-header">
        <span class="player-cards-title">Plantilla</span>
      </div>
      ${groupsHtml}
    </div>`;
}

function initPlayerCarousel() {
  const track = document.getElementById('player-cards-track');
  const viewport = document.getElementById('player-cards-viewport');
  const prevBtn = document.getElementById('cards-prev');
  const nextBtn = document.getElementById('cards-next');
  const counter = document.getElementById('cards-counter');
  if (!track || !viewport || !prevBtn || !nextBtn || !counter) return;

  const cards = track.querySelectorAll('.player-card');
  const total = cards.length;
  if (!total) return;

  const GAP = 12;
  let currentIndex = 0;

  function getCardWidth() {
    return cards[0].offsetWidth + GAP;
  }

  function getVisibleCount() {
    const vpWidth = viewport.clientWidth;
    return Math.max(1, Math.floor((vpWidth + GAP) / getCardWidth()));
  }

  function update() {
    const visCount = getVisibleCount();
    const maxIndex = Math.max(0, total - visCount);
    currentIndex = Math.min(currentIndex, maxIndex);

    track.style.transform = `translateX(-${currentIndex * getCardWidth()}px)`;

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex >= maxIndex;

    const displayEnd = Math.min(currentIndex + visCount, total);
    counter.textContent = `${currentIndex + 1}–${displayEnd} de ${total}`;
  }

  prevBtn.addEventListener('click', () => {
    const visCount = getVisibleCount();
    currentIndex = Math.max(0, currentIndex - visCount);
    update();
  });

  nextBtn.addEventListener('click', () => {
    const visCount = getVisibleCount();
    const maxIndex = Math.max(0, total - visCount);
    currentIndex = Math.min(maxIndex, currentIndex + visCount);
    update();
  });

  update();
  window.addEventListener('resize', update);
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

function renderTeamPage(team, players, formationRow, squadSlots, coachName, stadiumName, leagueName) {
  _players = players;
  _teamId = team.id;

  const typeLabel = TYPE_LABELS[team.type] || '';
  const safeTeamName = escapeHtml(team.displayName);

  // Build extra info row
  const extraInfoHtml = [
    leagueName ? `<span class="team-info-item">🏆 ${escapeHtml(leagueName)}</span>` : '',
    stadiumName ? `<span class="team-info-item">🏟️ ${escapeHtml(stadiumName)}</span>` : '',
    coachName ? `<span class="team-info-item">👨‍💼 ${escapeHtml(coachName)}</span>` : '',
  ].filter(Boolean).join('');

  // Build player card carousel
  const carouselHtml = renderPlayerCarousel(players, team.id);

  // Build formation pitch (above the carousel)
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
        ${extraInfoHtml ? `<div class="team-extra-info">${extraInfoHtml}</div>` : ''}
      </div>
    </div>

    ${pitchHtml}

    ${carouselHtml}`;

  content.style.display = 'block';
  document.getElementById('loading-overlay').style.display = 'none';

  // Attach back button handler via DOM (avoids inline onclick)
  document.getElementById('btn-back').addEventListener('click', goBack);

  // Formation tab switching (fluid formation)
  const formationSection = content.querySelector('.formation-section');
  if (formationSection) {
    formationSection.addEventListener('click', e => {
      const btn = e.target.closest('.formation-tab-btn');
      if (!btn) return;
      const variant = btn.dataset.variant;
      formationSection.querySelectorAll('.formation-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      formationSection.querySelectorAll('.formation-layout').forEach(l => {
        l.style.display = l.dataset.variant === variant ? '' : 'none';
      });
    });
  }

  // Initialise the player card carousel navigation
  initPlayerCarousel();

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
  const [teamsText, playersText, squadsText, formationsText, coachsText, leaguesText, corregidosText] = await Promise.all([
    fetchText('database/All teams exported.csv'),
    fetchText('database/All players exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All formations exported.csv'),
    fetchText('database/All coachs exported.csv'),
    fetchText('database/All leagues exported.csv'),
    fetchText('database/medias_corregidas.csv'),
  ]);

  if (!teamsText || !playersText || !squadsText) {
    showError('Error al cargar los archivos de la base de datos.');
    return;
  }

  const { rows: teamRows } = parseCSV(teamsText);
  const { rows: playerRows } = parseCSV(playersText);
  const { rows: squadRows } = parseCSV(squadsText);
  const { rows: formationRows } = formationsText ? parseCSV(formationsText) : { rows: [] };
  const { rows: coachRows } = coachsText ? parseCSV(coachsText) : { rows: [] };
  const { rows: leagueRows } = leaguesText ? parseCSV(leaguesText) : { rows: [] };

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

  // Build corrected overall map from medias_corregidas.csv
  const corregidosMap = {};
  if (corregidosText) {
    const { rows: corregidosRows } = parseCSV(corregidosText);
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
        // Apply corrected overall if available (team-specific key takes precedence)
        const corregidosOvr = corregidosMap[teamId + '_' + pid] || corregidosMap[pid];
        if (corregidosOvr) playerWithShirt.Overall = corregidosOvr;
        players.push(playerWithShirt);
        squadSlots[i - 1] = playerWithShirt;  // 0-indexed (slot i → index i-1)
      }
    }
  }

  // Find this team's formation data
  const formationRow = formationRows.find(f => f['Id'] === teamId) || null;

  // Build coach map: coachId → coachName
  const coachsMap = {};
  coachRows.forEach(row => {
    const cid = row['Id'];
    if (cid) coachsMap[cid] = row['Name'] || '';
  });

  const coachId = teamRow['Coach'];
  const coachName = coachId ? (coachsMap[coachId] || null) : null;
  const stadiumName = teamRow['StadiumName'] || null;

  // Find the league this team belongs to
  const teamLeague = leagueRows.find(l => {
    const ids = (l['team_ids'] || '').split(',').map(s => s.trim());
    return ids.includes(teamId);
  });
  const leagueName = teamLeague ? (teamLeague['league_name'] || null) : null;

  renderTeamPage(team, players, formationRow, squadSlots, coachName, stadiumName, leagueName);
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
