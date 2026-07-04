/**
 * Base de datos Option File PES 2018-2026
 * Team Profile Page Script
 *
 * Loads a team's full roster from pretty paths or URL params:
 *   /team/TEAMID/team-slug
 *   team.html?id=TEAMID
 */

'use strict';

// â”€â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function handleMinifaceError(img, playerId) {
  img.onerror = null;
  img.src = 'img/players/default.webp';
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
  if (!countryId) return 'img/flags/default.webp';
  return `img/flags/${countryId}.webp`;
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

function contrastTextColor(hexColor) {
  const h = hexColor.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#111' : '#fff';
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

// â”€â”€â”€ Translations (UI display only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Positions: PES abbreviation -> Spanish UI label
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

// Team type -> Spanish group label
const TYPE_LABELS = {
  '0': 'Clubes',
  '1': 'Equipos especiales',
  '2': 'Selecciones',
};

function translatePosition(pesPos) {
  return typeof i18nLookup === 'function' ? i18nLookup('positions', pesPos, pesPos) : (POSITION_LABELS[pesPos] || pesPos);
}

function teamTypeLabel(type) {
  return typeof i18nLookup === 'function' ? i18nLookup('types', String(type), TYPE_LABELS[type] || '') : (TYPE_LABELS[type] || '');
}

function positionGroupLabel(key, fallback) {
  return typeof i18nLookup === 'function' ? i18nLookup('positionGroups', key, fallback) : fallback;
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

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PES_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

// Position groups for squad display
const POSITION_GROUPS = [
  { key: 'GK',  label: positionGroupLabel('GK', 'Porteros'),        positions: ['GK'] },
  { key: 'DEF', label: positionGroupLabel('DEF', 'Defensas'),        positions: ['CB', 'RB', 'LB', 'LWB', 'RWB'] },
  { key: 'MID', label: positionGroupLabel('MID', 'Mediocampistas'),  positions: ['DMF', 'CMF', 'RMF', 'LMF', 'AMF'] },
  { key: 'FWD', label: positionGroupLabel('FWD', 'Delanteros'),      positions: ['RWF', 'LWF', 'SS', 'CF'] },
];

// Tactics labels and value maps
const FORMATION_TACTIC_FIELDS = [
  { col: 'EstiloAtaque F1',   labelKey: 'tactics.attackStyle', valuesKey: 'attackStyle' },
  { col: 'Creacion F1',       labelKey: 'tactics.buildUp', valuesKey: 'buildUp' },
  { col: 'ZonaAtaque F1',     labelKey: 'tactics.attackArea', valuesKey: 'sideCenter' },
  { col: 'Colocacion F1',     labelKey: 'tactics.positioning', valuesKey: 'positioning' },
  { col: 'ZonaApoyo F1',      labelKey: 'tactics.supportRange' },
  { col: 'EstiloDefensa F1',  labelKey: 'tactics.defenseStyle', valuesKey: 'defenseStyle' },
  { col: 'ZonaContencion F1', labelKey: 'tactics.containmentArea', valuesKey: 'centerSide' },
  { col: 'Presion F1',        labelKey: 'tactics.pressuring', valuesKey: 'pressuring' },
  { col: 'LineaDefensiva F1', labelKey: 'tactics.defensiveLine' },
  { col: 'CierreFilas F1',    labelKey: 'tactics.compactness' },
];

function tacticValue(valuesKey, raw) {
  if (!valuesKey) return raw;
  return i18nLookup('tacticValues', `${valuesKey}.${raw}`, raw);
}

// Helper: "J. Alvarez" format
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

// â”€â”€â”€ Radar chart helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function computeRadarAttributes(player) {
  const avg = (...keys) => {
    const vals = keys.map(k => parseInt(player[k], 10)).filter(v => !isNaN(v));
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };
  return {
    ATQ: avg('Attacking Prowess', 'Finishing', 'Kicking Power'),
    REG: avg('Ball Control', 'Dribbling', 'Body Control'),
    DEF: avg('Header', 'Jump', 'Defensive Prowess', 'Ball Winning'),
    PAS: avg('Low Pass', 'Lofted Pass', 'Place Kicking', 'Controlled Spin'),
    RIT: avg('Speed', 'Explosive Power'),
    FIS: avg('Physical Contact', 'Stamina'),
    COM: avg('Speed', 'Explosive Power', 'Physical Contact', 'Stamina'),
    POR: avg('Goalkeeping', 'Catching', 'Clearing', 'Reflexes', 'Coverage'),
  };
}

// â”€â”€â”€ Sort / Filter state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  'ATQ':  p => computeRadarAttributes(p).ATQ,
  'REG':  p => computeRadarAttributes(p).REG,
  'DEF':  p => computeRadarAttributes(p).DEF,
  'PAS':  p => computeRadarAttributes(p).PAS,
  'RIT':  p => computeRadarAttributes(p).RIT,
  'FIS':  p => computeRadarAttributes(p).FIS,
  'COM':  p => computeRadarAttributes(p).COM,
  'POR':  p => computeRadarAttributes(p).POR,
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
      if (icon) icon.textContent = _sortDir === 'asc' ? '\u25B2' : '\u25BC';
    } else {
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = '\u2195';
    }
  });
}

function refreshTableBody() {
  const tbody = document.querySelector('#players-table tbody');
  if (!tbody || !_teamId) return;
  const list = getSortedFilteredPlayers();
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--color-text-muted)">${t('team.noFilterResults')}</td></tr>`;
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

// â”€â”€â”€ Formation pitch rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      // Map to CSS percentage positions on a full pitch:
      //   left: 5 + (yWidth / 104) * 90%  (0=left touchline -> 5%, 52=center -> 50%, 104=right -> 95%)
      //   top:  7 + (1 - xDepth / 52) * 86%  (xDepth=52=midfield -> 7%, xDepth=0=own goal -> 93%)
      const leftPct = 5 + (yWidth / 104) * 90;
      const topPct  = 7 + (1 - xDepth / 52) * 86;
      // Lower on screen (higher topPct) = higher z-index so they appear on top
      const zIdx = Math.round(topPct);

      const fullName = escapeHtml(player.Name || '');
      const pid = escapeHtml(player.ID);
      const tid = escapeHtml(teamId || '');

      // Use the formation position rather than the player's natural position
      const posRawVal = parseInt(formationRow[`Posicion ${i} ${suffix}`], 10);
      const formationPos = (!isNaN(posRawVal) && posRawVal >= 0 && posRawVal < PES_POSITIONS.length)
        ? PES_POSITIONS[posRawVal] : (player.Position || '');
      const posDisplay = escapeHtml(translatePosition(formationPos));
      const badgeColor = positionGroupColor(formationPos);

      const ovr = escapeHtml(player.Overall || '-');
      const isCapitan = !isNaN(captainRawIdx) && squadIdx === captainRawIdx;

      tokens.push(`
        <a class="pitch-player" href="${typeof laqpPlayerUrl === 'function' ? laqpPlayerUrl(pid, tid, player.Name) : `player.html?id=${pid}&team=${tid}`}" style="left:${leftPct.toFixed(1)}%;top:${topPct.toFixed(1)}%;z-index:${zIdx}">
          <div class="pitch-player-photo-wrap">
            <img src="img/players/${pid}.webp"
              onerror="handleMinifaceError(this,'${pid}')"
              class="pitch-player-photo" alt="${fullName}">
            ${isCapitan ? '<div class="pitch-captain-badge">C</div>' : ''}
          </div>
          <div class="pitch-player-badge">
            <span class="pitch-badge-pos" style="color:${badgeColor}">${posDisplay}</span>
            <span class="pitch-badge-ovr">${ovr}</span>
          </div>
          <div class="pitch-player-name"><span>${fullName}</span></div>
        </a>`);
    }
    return tokens;
  }

  // Build pitch field HTML for a given suffix
  function buildPitchField(suffix) {
    const tokens = buildPitchTokens(suffix);

    // Compute formation label (e.g. "4-2-3-1") from player depths, excluding GK
    const formLabel = (() => {
      const xs = [];
      for (let i = 1; i <= 11; i++) {
        const posRaw = parseInt(formationRow[`Posicion ${i} ${suffix}`], 10);
        const pos = (!isNaN(posRaw) && posRaw >= 0 && posRaw < PES_POSITIONS.length) ? PES_POSITIONS[posRaw] : '';
        if (pos === 'GK') continue;
        const x = parseFloat(formationRow[`Ubicacion X${i} ${suffix}`]) || 0;
        xs.push(x);
      }
      xs.sort((a, b) => a - b);
      if (!xs.length) return '';
      const groups = [];
      let count = 1;
      for (let j = 1; j < xs.length; j++) {
        if (xs[j] - xs[j - 1] > 5) { groups.push(count); count = 1; }
        else count++;
      }
      groups.push(count);
      return groups.join('-');
    })();

    return `
      <div class="pitch-field">
        <div class="pf-mark pf-halfway"></div>
        <div class="pf-mark pf-center-circle"></div>
        <div class="pf-mark pf-penalty-top"></div>
        <div class="pf-mark pf-goal-top"></div>
        <div class="pf-mark pf-penalty-bottom"></div>
        <div class="pf-mark pf-goal-bottom"></div>
        ${tokens.join('')}
        ${formLabel ? `<div class="pitch-formation-label">${escapeHtml(formLabel)}</div>` : ''}
      </div>`;
  }

  const defaultTokens = buildPitchTokens('F1');
  if (!defaultTokens.length) return '';

  // Build tactics section
  const tacticsRows = FORMATION_TACTIC_FIELDS.map(tf => {
    const raw = formationRow[tf.col];
    if (raw === undefined || raw === '') return '';
    const display = tacticValue(tf.valuesKey, String(raw));
    return `<div class="tactic-row"><span class="tactic-label">${escapeHtml(t(tf.labelKey))}</span><span class="tactic-value">${escapeHtml(display)}</span></div>`;
  }).filter(Boolean).join('');

  // Build assignments section
  const assignmentRows = [];

  // For set-piece roles using direct squad-slot indices (0-based)
  const addSquadAssignment = (labelKey, colName) => {
    const rawIdx = parseInt(formationRow[colName], 10);
    if (isNaN(rawIdx) || rawIdx < 0 || rawIdx >= squadSlots.length) return;
    const p = squadSlots[rawIdx];
    if (!p) return;
    assignmentRows.push(`<div class="tactic-row"><span class="tactic-label">${escapeHtml(t(labelKey))}</span><span class="tactic-value">${escapeHtml(p.Name || '')}</span></div>`);
  };

  // For header roles: the value is a 0-based direct squad slot index
  const addHeaderAssignment = (labelKey, colName) => {
    const rawIdx = parseInt(formationRow[colName], 10);
    if (isNaN(rawIdx) || rawIdx < 0 || rawIdx >= squadSlots.length) return;
    const p = squadSlots[rawIdx];
    if (!p) return;
    assignmentRows.push(`<div class="tactic-row"><span class="tactic-label">${escapeHtml(t(labelKey))}</span><span class="tactic-value">${escapeHtml(p.Name || '')}</span></div>`);
  };

  addSquadAssignment('assignments.captain', 'Capitan');
  addSquadAssignment('assignments.shortFreeKick', 'TiroCorto');
  addSquadAssignment('assignments.longFreeKick', 'TiroLargo');
  addSquadAssignment('assignments.secondTaker', 'Cabeceador1');
  addSquadAssignment('assignments.rightCorner', 'EsquinaDerecho');
  addSquadAssignment('assignments.leftCorner', 'EsquinaIzquierdo');
  addSquadAssignment('assignments.penalty', 'Penalti');
  addHeaderAssignment('assignments.header1', 'SegundoCobrador');
  addHeaderAssignment('assignments.header2', 'Cabeceador2');
  addHeaderAssignment('assignments.header3', 'Cabeceador3');

  const tacticsHtml = tacticsRows
    ? `<div class="formation-tactic-block formation-tactics-panel"><div class="formation-block-title">${t('team.tactics')}</div>${tacticsRows}</div>`
    : '<div class="formation-tactic-block formation-tactics-panel is-empty"></div>';
  const assignmentsHtml = assignmentRows.length
    ? `<div class="formation-tactic-block formation-assignments-panel"><div class="formation-block-title">${t('team.assignments')}</div>${assignmentRows.join('')}</div>`
    : '<div class="formation-tactic-block formation-assignments-panel is-empty"></div>';

  const fluidaVal = parseInt(formationRow['Fluida F1'], 10);
  const isFluid = !isNaN(fluidaVal) && fluidaVal !== 0;

  if (!isFluid) {
    return `
      <div class="formation-section">
        <div class="formation-section-title">${t('team.initialFormation')}</div>
        <div class="formation-layout">
          ${tacticsHtml}
          <div class="pitch-container">
            ${buildPitchField('F1')}
          </div>
          ${assignmentsHtml}
        </div>
      </div>`;
  }

  // Fluid formation: three tabs (General / Con Balon / Sin Balon)
  return `
    <div class="formation-section">
      <div class="formation-tabs">
        <button class="formation-tab-btn active" data-variant="F1">${t('team.general')}</button>
        <button class="formation-tab-btn" data-variant="F1 Con Balon">${t('team.withBall')}</button>
        <button class="formation-tab-btn" data-variant="F1 Sin Balon">${t('team.withoutBall')}</button>
      </div>
      <div class="formation-section-title">${t('team.initialFormation')}</div>
      <div class="formation-layout" data-variant="F1">
        ${tacticsHtml}
        <div class="pitch-container">
          ${buildPitchField('F1')}
        </div>
        ${assignmentsHtml}
      </div>
      <div class="formation-layout" data-variant="F1 Con Balon" style="display:none">
        ${tacticsHtml}
        <div class="pitch-container">
          ${buildPitchField('F1 Con Balon')}
        </div>
        ${assignmentsHtml}
      </div>
      <div class="formation-layout" data-variant="F1 Sin Balon" style="display:none">
        ${tacticsHtml}
        <div class="pitch-container">
          ${buildPitchField('F1 Sin Balon')}
        </div>
        ${assignmentsHtml}
      </div>
    </div>`;
}


// â”€â”€â”€ Player card carousel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderPlayerCard(player, teamId) {
  const ovr = player.Overall || '-';
  const ovrColor = statColor(ovr);
  const posDisplay = escapeHtml(translatePosition(player.Position || ''));
  const posColor = positionGroupColor(player.Position || '');
  const radarAttrs = computeRadarAttributes(player);
  const safeName = escapeHtml(player.Name || '-');
  const pid = escapeHtml(player.ID);
  const tid = escapeHtml(teamId || '');

  const atqColor = statColor(radarAttrs.ATQ);
  const regColor = statColor(radarAttrs.REG);
  const defColor = statColor(radarAttrs.DEF);
  const pasColor = statColor(radarAttrs.PAS);
  const isGK = (player.Position || '') === 'GK';
  const stat5Color = isGK ? statColor(radarAttrs.COM) : statColor(radarAttrs.RIT);
  const stat6Color = isGK ? statColor(radarAttrs.POR) : statColor(radarAttrs.FIS);
  const stat5Val   = isGK ? radarAttrs.COM : radarAttrs.RIT;
  const stat6Val   = isGK ? radarAttrs.POR : radarAttrs.FIS;
  const stat5Key   = isGK ? 'COM' : 'RIT';
  const stat6Key   = isGK ? 'POR' : 'FIS';

  return `
    <a class="player-card" href="${typeof laqpPlayerUrl === 'function' ? laqpPlayerUrl(pid, tid, player.Name) : `player.html?id=${pid}&team=${tid}`}">
      <div class="player-card-top" style="background:linear-gradient(135deg,${ovrColor}33 0%,${ovrColor}11 100%)">
        <div class="player-card-ovr-block">
          <span class="player-card-ovr" style="color:${ovrColor}">${escapeHtml(ovr)}</span>
          <span class="player-card-pos" style="color:${posColor}">${posDisplay}</span>
        </div>
        <div class="player-card-badge-col">
          <img class="player-card-flag" src="${flagSrc(player.Nationality)}"
            onerror="this.onerror=null;this.src='img/flags/default.webp'" alt="">
          <img class="player-card-crest" src="img/teams/${tid}.webp"
            onerror="this.onerror=null;this.src='img/teams/default.webp'" alt="">
        </div>
      </div>
      <div class="player-card-photo-wrap">
        <img class="player-card-photo" src="img/players/${pid}.webp"
          onerror="handleMinifaceError(this,'${pid}')" alt="${safeName}">
      </div>
      <div class="player-card-footer">
        <div class="player-card-name">${safeName}</div>
        <div class="player-card-stats">
          <div class="pcs"><span class="pcs-val" style="color:${atqColor}">${radarAttrs.ATQ}</span><span class="pcs-key">ATQ</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${regColor}">${radarAttrs.REG}</span><span class="pcs-key">REG</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${defColor}">${radarAttrs.DEF}</span><span class="pcs-key">DEF</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${pasColor}">${radarAttrs.PAS}</span><span class="pcs-key">PAS</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${stat5Color}">${stat5Val}</span><span class="pcs-key">${stat5Key}</span></div>
          <div class="pcs"><span class="pcs-val" style="color:${stat6Color}">${stat6Val}</span><span class="pcs-key">${stat6Key}</span></div>
        </div>
      </div>
    </a>`;
}

function renderPlayerCarousel(players, teamId) {
  if (!players || !players.length) {
    return `<div class="player-cards-section"><p style="color:var(--color-text-muted);padding:16px 0">${t('team.noPlayers')}</p></div>`;
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
          <span class="player-cards-group-title">${t('team.others')}</span>
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
        <span class="player-cards-title">${t('team.squad')}</span>
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
    counter.textContent = `${currentIndex + 1}-${displayEnd} de ${total}`;
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

function renderShirtNumberDirectory(players, teamId) {
  const byNumber = new Map();
  players.forEach(player => {
    const num = parseInt(player._shirtNumber, 10);
    if (num >= 1 && num <= 99 && !byNumber.has(num)) byNumber.set(num, player);
  });

  const items = [];
  for (let num = 1; num <= 99; num++) {
    const player = byNumber.get(num);
    if (player) {
      const safeName = escapeHtml(player.Name || '');
      items.push(`
        <a class="shirt-number-slot is-used" href="${typeof laqpPlayerUrl === 'function' ? laqpPlayerUrl(player.ID, teamId, player.Name) : `player.html?id=${encodeURIComponent(player.ID)}&team=${encodeURIComponent(teamId)}`}">
          <span class="shirt-number-value">${num}</span>
          <span class="shirt-number-name-clip" title="${safeName}">
            <span class="shirt-number-name">${safeName}</span>
          </span>
        </a>`);
    } else {
      items.push(`
        <div class="shirt-number-slot is-free">
          <span class="shirt-number-value">${num}</span>
          <span class="shirt-number-name-clip">
            <span class="shirt-number-name">${t('team.freeNumber')}</span>
          </span>
        </div>`);
    }
  }

  return `
    <details class="shirt-number-directory">
      <summary>
        <span>${t('team.showShirtNumbers')}</span>
      </summary>
      <div class="shirt-number-grid" aria-label="${t('team.shirtNumbers')}">
        ${items.join('')}
      </div>
    </details>`;
}

function renderPlayerRow(player, teamId) {
  const ovr = player.Overall || '-';
  const ovrColor = statColor(ovr);
  const ovrTextColor = statTextColor(ovrColor);
  const posDisplay = translatePosition(player.Position);
  const radarAttrs = computeRadarAttributes(player);
  const safeName = escapeHtml(player.Name);
  const shirtNum = player._shirtNumber ? escapeHtml(String(player._shirtNumber)) : '-';
  const fav = (typeof isFavorite === 'function') && isFavorite(player.ID, teamId);

  return `<tr class="player-row" data-player-id="${escapeHtml(player.ID)}" data-team-id="${escapeHtml(teamId)}">
    <td class="shirt-number-cell">${shirtNum}</td>
    <td>
      <img class="player-row-photo"
        src="img/players/${escapeHtml(player.ID)}.webp"
        onerror="handleMinifaceError(this,'${escapeHtml(player.ID)}')"
        alt="${safeName}">
    </td>
    <td><strong>${safeName || '-'}</strong></td>
    <td>
      <img class="player-flag"
        src="${flagSrc(player.Nationality)}"
        onerror="this.onerror=null;this.src='img/flags/default.webp'"
        alt="">
    </td>
    <td><span class="position-badge" style="${positionBadgeStyle(player.Position)}">${escapeHtml(posDisplay) || '-'}</span></td>
    <td><span class="overall-badge" style="background:${ovrColor};color:${ovrTextColor}">${escapeHtml(ovr)}</span></td>
    <td>${radarAttrs.ATQ}</td>
    <td>${radarAttrs.REG}</td>
    <td>${radarAttrs.DEF}</td>
    <td>${radarAttrs.PAS}</td>
    <td>${(player.Position || '') === 'GK' ? radarAttrs.COM : radarAttrs.RIT}</td>
    <td>${(player.Position || '') === 'GK' ? radarAttrs.POR : radarAttrs.FIS}</td>
    <td class="fav-col" onclick="event.stopPropagation()">
      <button class="fav-btn${fav ? ' is-fav' : ''}"
        onclick="toggleTeamFavBtn(this,'${escapeHtml(player.ID)}','${escapeHtml(teamId)}')"
        title="${fav ? t('favorites.remove') : t('favorites.add')}"
        aria-label="${t('common.favorites')}">
        ${fav ? '&#9733;' : '&#9734;'}
      </button>
    </td>
  </tr>`;
}

function selectPlayer(playerId, teamId) {
  const player = _players.find(p => p.ID === String(playerId));
  window.location.href = typeof laqpPlayerUrl === 'function'
    ? laqpPlayerUrl(playerId, teamId, player && player.Name)
    : `player.html?id=${encodeURIComponent(playerId)}&team=${encodeURIComponent(teamId)}`;
}

function renderTeamPage(team, players, formationRow, squadSlots, coachName, stadiumName, leagueName) {
  _players = players;
  _teamId = team.id;

  const typeLabel = teamTypeLabel(team.type);
  const safeTeamName = escapeHtml(team.displayName);

  // Build extra info row
  const extraInfoHtml = [
    leagueName ? `<span class="team-info-item"><span class="team-info-label">${t('common.league')}</span> ${escapeHtml(leagueName)}</span>` : '',
    stadiumName ? `<span class="team-info-item"><span class="team-info-label">${t('team.stadium')}</span> ${escapeHtml(stadiumName)}</span>` : '',
    coachName ? `<span class="team-info-item"><span class="team-info-label">${t('team.coach')}</span> ${escapeHtml(coachName)}</span>` : '',
  ].filter(Boolean).join('');

  // Build player card carousel
  const carouselHtml = renderPlayerCarousel(players, team.id);
  const shirtNumbersHtml = renderShirtNumberDirectory(players, team.id);

  // Build formation pitch (above the carousel)
  const pitchHtml = renderFormationPitch(players, formationRow, squadSlots, team.id);

  const content = document.getElementById('team-content');
  content.innerHTML = `
    <div class="breadcrumb-row"><nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('index.html') : 'index.html'}">${t('common.home')}</a>
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html'}">${t('common.database')}</a>
      <span>${safeTeamName}</span>
    </nav></div>
    <button class="back-btn" id="btn-back">‹ ${t('common.back')}</button>

    <div class="view-header">
      <img class="team-crest" src="img/teams/${escapeHtml(team.id)}.webp"
        onerror="this.onerror=null;this.src='img/teams/default.webp'"
        alt="${safeTeamName}">
      <div>
        <div class="view-title">${safeTeamName}</div>
        <div class="view-subtitle">${escapeHtml(typeLabel)} · ${t('db.playerCount', { count: players.length })}</div>
        ${extraInfoHtml ? `<div class="team-extra-info">${extraInfoHtml}</div>` : ''}
      </div>
    </div>

    ${pitchHtml}

    ${carouselHtml}

    ${shirtNumbersHtml}`;

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

  // Apply marquee scroll to pitch player names that overflow their container
  content.querySelectorAll('.pitch-player-name').forEach(el => {
    const span = el.querySelector('span');
    if (!span) return;
    if (el.scrollWidth > el.clientWidth) {
      span.textContent = span.textContent + '\u00A0\u00A0\u00A0\u00A0' + span.textContent;
      el.classList.add('scrolling');
    }
  });

  // Apply the same overflow marquee to shirt numbers.
  content.querySelectorAll('.shirt-number-name-clip').forEach(el => {
    const span = el.querySelector('.shirt-number-name');
    if (!span || el.closest('.shirt-number-slot.is-free')) return;
    if (span.scrollWidth > el.clientWidth) {
      span.textContent = span.textContent + '\u00A0\u00A0\u00A0\u00A0' + span.textContent;
      el.classList.add('scrolling');
    }
  });

  // Update page title
  document.title = `${team.displayName} - ${t('common.database')} PES`;
  const teamPath = typeof laqpTeamUrl === 'function' ? laqpTeamUrl(team.id, team.displayName) : `/team.html?id=${encodeURIComponent(team.id)}`;
  const teamUrl = typeof laqpAbsoluteUrl === 'function' ? laqpAbsoluteUrl(teamPath) : `https://laqp.website${teamPath}`;
  const canonical = document.querySelector('link[rel="canonical"]');
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (canonical) canonical.setAttribute('href', teamUrl);
  if (ogUrl) ogUrl.setAttribute('content', teamUrl);
  if (window.location.pathname !== teamPath && typeof history.replaceState === 'function') {
    history.replaceState(null, '', teamPath);
  }
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
              <th>ATQ</th>
              <th>REG</th>
              <th>DEF</th>
              <th>PAS</th>
              <th>RIT/COM</th>
              <th>FIS/POR</th>
              <th class="fav-col"></th>
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
              <th>OVR</th><th>ATQ</th><th>REG</th><th>DEF</th><th>PAS</th><th>RIT/COM</th><th>FIS/POR</th>
              <th class="fav-col"></th>
            </tr>
          </thead>
          <tbody>${uncategorized.map(p => renderPlayerRow(p, teamId)).join('')}</tbody>
        </table>
      </div>`;
  }

  if (!html) {
    html = `<div class="error-message">${t('team.noPlayers')}</div>`;
  }

  return html;
}

// â”€â”€â”€ Back navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function goBack() {
  if (document.referrer && new URL(document.referrer).hostname === window.location.hostname) {
    history.back();
  } else {
    window.location.href = typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html';
  }
}

// â”€â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const embeddedTeamId = document.querySelector('meta[name="laqp-team-id"]')?.content || '';
  const teamId = embeddedTeamId || params.get('id');

  if (!teamId) {
    showError(t('errors.noTeamParam'));
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
    showError(t('errors.databaseLoad'));
    return;
  }

  const { rows: teamRows } = parseCSV(teamsText);
  const { rows: playerRows } = parseCSV(playersText);
  const { rows: squadRows } = parseCSV(squadsText);
  const { rows: formationRows } = formationsText ? parseCSV(formationsText) : { rows: [] };
  const { rows: coachRows } = coachsText ? parseCSV(coachsText) : { rows: [] };
  const { rows: leagueRows } = leaguesText ? parseCSV(leaguesText) : { rows: [] };
  const validTeamIds = new Set();
  leagueRows.forEach(row => {
    String(row['team_ids'] || '').split(',').map(id => id.trim()).filter(Boolean).forEach(id => validTeamIds.add(id));
  });
  if (!validTeamIds.has(teamId)) {
    showError(t('errors.teamNotPublished'));
    return;
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

  // Build normalized player map
  const playerMap = {};
  playerRows.forEach(row => {
    const pid = row['Id'];
    if (pid) playerMap[pid] = normalizePlayerRow(row);
  });

  // Build corrected overall map from medias_corregidas.csv
  const corregidosMap = corregidosText ? buildCorrectedOverallMap(parseCSV(corregidosText).rows) : null;

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
        // Apply corrected overall if available for this player ID.
        const corregidosOvr = correctedOverallFor(playerWithShirt, teamId, corregidosMap);
        if (corregidosOvr) playerWithShirt.Overall = corregidosOvr;
        players.push(playerWithShirt);
        squadSlots[i - 1] = playerWithShirt;  // 0-indexed (slot i -> index i-1)
      }
    }
  }

  // Find this team's formation data
  const formationRow = formationRows.find(f => f['Id'] === teamId) || null;

  // Build coach map: coachId -> coachName
  const coachsMap = {};
  coachRows.forEach(row => {
    const cid = row['Id'];
    if (cid) coachsMap[cid] = toTitleCaseName(row['Name'] || '');
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

// â”€â”€â”€ Error display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  anchor.href = typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html';
  anchor.style.color = 'var(--color-highlight)';
  anchor.textContent = t('common.backToDatabase');
  backLink.appendChild(anchor);

  content.appendChild(errorDiv);
  content.appendChild(backLink);
  content.style.display = 'block';
}

// â”€â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(t('errors.unexpected', { message: err.message }));
    console.error(err);
  });
});

