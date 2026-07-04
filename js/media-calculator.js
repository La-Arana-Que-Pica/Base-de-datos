'use strict';

const MEDIA_CALC_BASE_STAT = 80;
const MEDIA_CALC_MIN_STAT = 40;
const MEDIA_CALC_MAX_STAT = 99;
const MEDIA_CALC_STORAGE_KEY = 'laqp.mediaCalculator.v2';

const MEDIA_CALC_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

const MEDIA_CALC_POSITION_LABELS = {
  GK: 'PT',
  CB: 'DFC',
  LB: 'LI',
  RB: 'LD',
  DMF: 'MCD',
  CMF: 'MC',
  LMF: 'MI',
  RMF: 'MD',
  AMF: 'MP',
  LWF: 'EI',
  RWF: 'ED',
  SS: 'SD',
  CF: 'DC',
};

const MEDIA_CALC_POSITION_DISPLAY = [
  { pos: 'LWF', abbr: 'EI',  name: 'Extremo izquierdo', category: 'forward' },
  { pos: 'CF',  abbr: 'DC',  name: 'Centro delantero', category: 'forward' },
  { pos: 'RWF', abbr: 'ED',  name: 'Extremo derecho', category: 'forward' },
  { pos: 'SS',  abbr: 'SD',  name: 'Segundo delantero', category: 'forward' },
  { pos: 'AMF', abbr: 'MO',  name: 'Mediocampista ofensivo', category: 'midfielder' },
  { pos: 'LMF', abbr: 'MI',  name: 'Mediocampista izquierdo', category: 'midfielder' },
  { pos: 'CMF', abbr: 'MC',  name: 'Mediocampista central', category: 'midfielder' },
  { pos: 'RMF', abbr: 'MD',  name: 'Mediocampista derecho', category: 'midfielder' },
  { pos: 'DMF', abbr: 'MCD', name: 'Mediocampista defensivo', category: 'midfielder' },
  { pos: 'LB',  abbr: 'LI',  name: 'Lateral izquierdo', category: 'defender' },
  { pos: 'CB',  abbr: 'DFC', name: 'Defensa central', category: 'defender' },
  { pos: 'RB',  abbr: 'LD',  name: 'Lateral derecho', category: 'defender' },
  { pos: 'GK',  abbr: 'PT',  name: 'Portero', category: 'goalkeeper' },
];

const MEDIA_CALC_POSITION_GRID_LAYOUT = {
  LWF: { col: 1, row: 1 },
  CF:  { col: 2, row: 1 },
  RWF: { col: 3, row: 1 },
  SS:  { col: 2, row: 2 },
  AMF: { col: 2, row: 3 },
  LMF: { col: 1, row: 4 },
  CMF: { col: 2, row: 4 },
  RMF: { col: 3, row: 4 },
  DMF: { col: 2, row: 5 },
  LB:  { col: 1, row: 6 },
  CB:  { col: 2, row: 6 },
  RB:  { col: 3, row: 6 },
  GK:  { col: 2, row: 7 },
};

const MEDIA_CALC_GOALKEEPER_STATS = new Set(['goalkeeper', 'catching', 'clearing', 'reflexes', 'coverage']);

const MEDIA_CALC_STAT_LABELS = {
  attacking_prowess: 'Ataque',
  ball_control: 'Control de balon',
  dribbling: 'Drible',
  low_pass: 'Pase al ras',
  lofted_pass: 'Pase bombeado',
  finishing: 'Finalizacion',
  place_kicking: 'Balon parado',
  swerve: 'Efecto',
  header: 'Cabeza',
  defensive_prowess: 'Defensa',
  ball_winning: 'Recuperacion',
  kicking_power: 'Potencia',
  speed: 'Velocidad',
  explosive_power: 'Fuerza explosiva',
  body_control: 'Control corporal',
  physical_contact: 'Contacto fisico',
  jump: 'Salto',
  stamina: 'Resistencia',
  goalkeeper: 'Portero',
  catching: 'Atajar',
  clearing: 'Despejar',
  reflexes: 'Reflejos',
  coverage: 'Alcance',
};

const MEDIA_CALC_STAT_ORDER = [
  'attacking_prowess',
  'ball_control',
  'dribbling',
  'low_pass',
  'lofted_pass',
  'finishing',
  'place_kicking',
  'swerve',
  'header',
  'defensive_prowess',
  'ball_winning',
  'kicking_power',
  'speed',
  'explosive_power',
  'body_control',
  'physical_contact',
  'jump',
  'stamina',
  'goalkeeper',
  'catching',
  'clearing',
  'reflexes',
  'coverage',
];

const MEDIA_CALC_STAT_CATEGORIES = [
  {
    id: 'attack',
    label: 'Ataque',
    marker: 'ATQ',
    stats: ['attacking_prowess', 'finishing', 'place_kicking', 'kicking_power', 'header', 'jump'],
  },
  {
    id: 'technique',
    label: 'Tecnica',
    marker: 'TEC',
    stats: ['ball_control', 'dribbling', 'low_pass', 'lofted_pass', 'swerve', 'body_control'],
  },
  {
    id: 'physical',
    label: 'Fisico',
    marker: 'FIS',
    stats: ['speed', 'explosive_power', 'physical_contact', 'stamina'],
  },
  {
    id: 'defense',
    label: 'Defensa',
    marker: 'DEF',
    stats: ['defensive_prowess', 'ball_winning'],
  },
  {
    id: 'goalkeeper',
    label: 'Arquero',
    marker: 'PT',
    stats: ['goalkeeper', 'catching', 'clearing', 'reflexes', 'coverage'],
  },
];

const MEDIA_CALC_PRESETS = [
  { id: 'base80', label: 'Base 80', values: {} },
  {
    id: 'defensive',
    label: 'Defensivo',
    values: {
      defensive_prowess: 86,
      ball_winning: 86,
      physical_contact: 84,
      stamina: 84,
      header: 83,
      jump: 82,
      speed: 79,
      attacking_prowess: 74,
      finishing: 72,
    },
  },
  {
    id: 'offensive',
    label: 'Ofensivo',
    values: {
      attacking_prowess: 87,
      finishing: 86,
      ball_control: 85,
      dribbling: 85,
      low_pass: 83,
      lofted_pass: 82,
      speed: 84,
      explosive_power: 84,
      defensive_prowess: 72,
      ball_winning: 72,
    },
  },
  {
    id: 'physical',
    label: 'Fisico',
    values: {
      speed: 87,
      explosive_power: 87,
      physical_contact: 88,
      stamina: 88,
      kicking_power: 85,
      jump: 86,
      body_control: 76,
    },
  },
  {
    id: 'midfielder',
    label: 'Mediocampista',
    values: {
      low_pass: 86,
      lofted_pass: 85,
      ball_control: 85,
      dribbling: 83,
      stamina: 86,
      defensive_prowess: 80,
      ball_winning: 80,
      attacking_prowess: 81,
    },
  },
  {
    id: 'goalkeeper',
    label: 'Arquero',
    reactivateGoalkeeper: true,
    values: {
      goalkeeper: 89,
      catching: 87,
      clearing: 86,
      reflexes: 90,
      coverage: 88,
      jump: 85,
      physical_contact: 83,
      attacking_prowess: 45,
      finishing: 45,
      ball_winning: 55,
    },
  },
];

const MEDIA_CALC_CATEGORY_BY_STAT = MEDIA_CALC_STAT_CATEGORIES.reduce((map, category) => {
  category.stats.forEach(stat => {
    map[stat] = category.id;
  });
  return map;
}, {});

let mediaCalcFormulas = null;
let mediaCalcSaveTimer = null;
let mediaCalcFeedbackTimer = null;

const mediaCalcState = {
  stats: {},
  goalkeeperMinimum: false,
  selectedPosition: null,
  selectedCategory: 'all',
  search: '',
  lastPreset: '',
  collapsedCategories: new Set(),
};

function mediaCalcEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mediaCalcCssKey(value) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

async function mediaCalcFetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
  return response.text();
}

function mediaCalcPositions() {
  const keys = mediaCalcFormulas ? Object.keys(mediaCalcFormulas).filter(pos => mediaCalcFormulas[pos]?.weights) : [];
  return MEDIA_CALC_POSITIONS.filter(pos => keys.includes(pos)).concat(keys.filter(pos => !MEDIA_CALC_POSITIONS.includes(pos)));
}

function mediaCalcFormula(position) {
  return mediaCalcFormulas ? mediaCalcFormulas[position] : null;
}

function mediaCalcClampStat(value, fallback = MEDIA_CALC_BASE_STAT) {
  const number = parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(MEDIA_CALC_MIN_STAT, Math.min(MEDIA_CALC_MAX_STAT, number));
}

function mediaCalcRawStatValue(key) {
  return mediaCalcClampStat(mediaCalcState.stats[key] ?? MEDIA_CALC_BASE_STAT);
}

function mediaCalcStatValue(key) {
  if (mediaCalcState.goalkeeperMinimum && MEDIA_CALC_GOALKEEPER_STATS.has(key)) {
    return MEDIA_CALC_MIN_STAT;
  }
  return mediaCalcRawStatValue(key);
}

function mediaCalcValueClass(value) {
  const number = parseInt(value, 10);
  if (!Number.isFinite(number)) return 'stat-range-1';
  if (number >= 95) return 'stat-range-6';
  if (number >= 90) return 'stat-range-5';
  if (number >= 80) return 'stat-range-4';
  if (number >= 70) return 'stat-range-3';
  if (number >= 60) return 'stat-range-2';
  return 'stat-range-1';
}

function mediaCalcDeltaClass(value) {
  if (value > MEDIA_CALC_BASE_STAT) return 'is-above';
  if (value < MEDIA_CALC_BASE_STAT) return 'is-below';
  return 'is-equal';
}

function mediaCalcAllStatKeys() {
  const formulaKeys = mediaCalcPositions()
    .flatMap(pos => {
      const formula = mediaCalcFormula(pos) || {};
      return [
        ...Object.keys(formula.weights || {}),
        ...(formula.anchor_stats || []),
      ];
    });
  const uniqueKeys = [...new Set(formulaKeys)];
  return MEDIA_CALC_STAT_ORDER
    .filter(key => uniqueKeys.includes(key))
    .concat(uniqueKeys.filter(key => !MEDIA_CALC_STAT_ORDER.includes(key)));
}

function mediaCalcEditableStatKeys() {
  return mediaCalcAllStatKeys().filter(key => {
    return !(mediaCalcState.goalkeeperMinimum && MEDIA_CALC_GOALKEEPER_STATS.has(key));
  });
}

function mediaCalcActiveComparisonKeys() {
  return mediaCalcAllStatKeys().filter(key => {
    return !(mediaCalcState.goalkeeperMinimum && MEDIA_CALC_GOALKEEPER_STATS.has(key));
  });
}

function mediaCalcAnchorCurveValue(formula, level) {
  const curve = formula?.anchor_curve || {};
  const points = Object.keys(curve)
    .map(key => ({ level: Number(key), value: Number(curve[key]) }))
    .filter(point => Number.isFinite(point.level) && Number.isFinite(point.value))
    .sort((a, b) => a.level - b.level);

  if (!points.length) return Number(formula?.base || 0);
  if (points.length === 1) return points[0].value;

  if (level <= points[0].level) {
    const first = points[0];
    const second = points[1];
    const slope = (second.value - first.value) / (second.level - first.level);
    return first.value + (level - first.level) * slope;
  }

  const last = points[points.length - 1];
  if (level >= last.level) {
    const previous = points[points.length - 2];
    const slope = (last.value - previous.value) / (last.level - previous.level);
    return last.value + (level - last.level) * slope;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (level >= left.level && level <= right.level) {
      const progress = (level - left.level) / (right.level - left.level);
      return left.value + (right.value - left.value) * progress;
    }
  }

  return Number(formula?.base || 0);
}

function mediaCalcAnchoredResult(formula) {
  const stats = formula.anchor_stats?.length
    ? formula.anchor_stats
    : Object.keys(formula.weights || {});
  const values = stats.map(key => mediaCalcStatValue(key));
  const level = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : MEDIA_CALC_BASE_STAT;
  const anchor = mediaCalcAnchorCurveValue(formula, level);
  const adjustment = stats.reduce((sum, key) => {
    return sum + (mediaCalcStatValue(key) - level) * Number(formula.weights?.[key] || 0);
  }, 0);
  return anchor + adjustment;
}

function mediaCalcResult(position) {
  const formula = mediaCalcFormula(position);
  if (!formula || !formula.weights) return { decimal: 0, rounded: 0 };
  const decimal = formula.formula_mode === 'anchored_direct'
    ? mediaCalcAnchoredResult(formula)
    : Object.entries(formula.weights).reduce((sum, [key, weight]) => {
      return sum + mediaCalcStatValue(key) * Number(weight || 0);
    }, Number(formula.base || 0));
  return {
    decimal,
    rounded: Math.max(MEDIA_CALC_MIN_STAT, Math.min(MEDIA_CALC_MAX_STAT, Math.round(decimal))),
  };
}

function mediaCalcPositionColor(position) {
  if (position === 'GK') return '#D6A84F';
  if (['CB', 'LB', 'RB'].includes(position)) return '#25c7da';
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(position)) return '#6fda60';
  if (['LWF', 'RWF', 'SS', 'CF'].includes(position)) return '#ff4d5b';
  return '#8b949e';
}

function mediaCalcPositionResults() {
  return mediaCalcPositions()
    .map(position => ({
      position,
      label: MEDIA_CALC_POSITION_LABELS[position] || position,
      name: MEDIA_CALC_POSITION_DISPLAY.find(item => item.pos === position)?.name || position,
      ...mediaCalcResult(position),
    }))
    .filter(item => item.rounded > 0);
}

function mediaCalcBestResult(results) {
  return results.reduce((best, item) => (!best || item.rounded > best.rounded ? item : best), null);
}

function mediaCalcSelectedResult(results, best) {
  return results.find(item => item.position === mediaCalcState.selectedPosition) || best;
}

function mediaCalcSortedResults(results) {
  return [...results].sort((a, b) => b.rounded - a.rounded || a.label.localeCompare(b.label));
}

function mediaCalcStoragePayload() {
  return {
    stats: mediaCalcState.stats,
    goalkeeperMinimum: mediaCalcState.goalkeeperMinimum,
    selectedPosition: mediaCalcState.selectedPosition,
    selectedCategory: mediaCalcState.selectedCategory,
    search: mediaCalcState.search,
    lastPreset: mediaCalcState.lastPreset,
    collapsedCategories: [...mediaCalcState.collapsedCategories],
  };
}

function mediaCalcLoadState() {
  try {
    const raw = localStorage.getItem(MEDIA_CALC_STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored && typeof stored.stats === 'object') {
      mediaCalcState.stats = Object.fromEntries(
        Object.entries(stored.stats).map(([key, value]) => [key, mediaCalcClampStat(value)]),
      );
    }
    mediaCalcState.goalkeeperMinimum = !!stored.goalkeeperMinimum;
    mediaCalcState.selectedPosition = stored.selectedPosition || null;
    mediaCalcState.selectedCategory = stored.selectedCategory || 'all';
    mediaCalcState.search = stored.search || '';
    mediaCalcState.lastPreset = stored.lastPreset || '';
    mediaCalcState.collapsedCategories = new Set(Array.isArray(stored.collapsedCategories) ? stored.collapsedCategories : []);
  } catch (error) {
    console.warn('No se pudo recuperar la configuracion de la calculadora.', error);
  }
}

function mediaCalcSaveState(immediate = false) {
  const save = () => {
    try {
      localStorage.setItem(MEDIA_CALC_STORAGE_KEY, JSON.stringify(mediaCalcStoragePayload()));
      mediaCalcSetFeedback('Configuracion guardada', 'ok', false);
    } catch (error) {
      mediaCalcSetFeedback('No se pudo guardar localmente', 'warn');
    }
  };

  if (immediate) {
    clearTimeout(mediaCalcSaveTimer);
    save();
    return;
  }

  clearTimeout(mediaCalcSaveTimer);
  mediaCalcSaveTimer = setTimeout(save, 160);
}

function mediaCalcSetFeedback(message, type = 'ok', autohide = true) {
  const feedback = document.getElementById('media-calc-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = `media-calc-feedback is-${type}`;
  clearTimeout(mediaCalcFeedbackTimer);
  if (autohide) {
    mediaCalcFeedbackTimer = setTimeout(() => {
      feedback.textContent = 'Configuracion guardada';
      feedback.className = 'media-calc-feedback is-ok';
    }, 1800);
  }
}

function renderMediaCalculatorMap(results, selected, best) {
  const resultMap = new Map(results.map(item => [item.position, item]));
  const cells = MEDIA_CALC_POSITION_DISPLAY.map(item => {
    const layout = MEDIA_CALC_POSITION_GRID_LAYOUT[item.pos];
    const result = resultMap.get(item.pos);
    if (!layout || !result) return '';
    const isSelected = selected && item.pos === selected.position;
    const isBest = best && item.pos === best.position;
    const valueClass = mediaCalcValueClass(result.rounded);
    const color = mediaCalcPositionColor(item.pos);
    return `
      <button class="position-cell media-calc-position-cell position-${item.category}${isSelected ? ' is-primary' : ' is-strong'}${isBest ? ' is-best' : ''}"
        type="button"
        data-media-position-cell="${item.pos}"
        style="--position-color:${color};grid-column:${layout.col};grid-row:${layout.row};"
        onclick="setMediaCalculatorPosition('${item.pos}')"
        title="${mediaCalcEscape(item.name)}: ${result.rounded}"
        aria-label="${mediaCalcEscape(item.name)} ${result.rounded}">
        <span class="position-code">${mediaCalcEscape(item.abbr)}</span>
        <span class="position-grade stat-value ${valueClass}" data-media-position-score="${item.pos}">${result.rounded}</span>
      </button>`;
  }).join('');

  return `
    <div class="positions-map media-calc-position-map" aria-label="Mapa de posiciones calculadas">
      <div class="positions-grid">
        ${cells}
      </div>
    </div>`;
}

function renderMediaCalculatorRankingList(results) {
  return mediaCalcSortedResults(results).slice(0, 5).map((item, index) => `
    <li>
      <span>${index + 1}</span>
      <strong>${mediaCalcEscape(item.label)}</strong>
      <b class="${mediaCalcValueClass(item.rounded)}">${item.rounded}</b>
    </li>
  `).join('');
}

function renderMediaCalculatorQuickActions() {
  return `
    <div class="media-calc-quick-actions">
      <h3>Acciones rapidas</h3>
      <button type="button" class="is-primary" onclick="restoreMediaCalculatorBase()">Poner todo en 80</button>
      <div class="media-calc-action-grid">
        <button type="button" onclick="adjustAllMediaCalculatorStats(1)">+1 a todas</button>
        <button type="button" onclick="adjustAllMediaCalculatorStats(5)">+5 a todas</button>
        <button type="button" onclick="adjustAllMediaCalculatorStats(-1)">-1 a todas</button>
        <button type="button" onclick="adjustAllMediaCalculatorStats(-5)">-5 a todas</button>
      </div>
      <button type="button" onclick="restoreMediaCalculatorBase()">Restaurar a 80</button>
    </div>`;
}

function renderMediaCalculatorSidebar(results, best, selected) {
  const selectedClass = mediaCalcValueClass(selected?.rounded);
  return `
    <aside class="media-calc-sidebar">
      <div class="media-calc-overview">
        <div>
          <span>Calculadora de medias</span>
          <h2 id="media-calc-selected-label">${selected ? mediaCalcEscape(selected.label) : '-'}</h2>
          <p id="media-calc-selected-name">${selected ? mediaCalcEscape(selected.name) : 'Sin posicion'}</p>
        </div>
        <div class="media-calc-overall ${selectedClass}">
          <strong id="media-calc-selected-score">${selected ? selected.rounded : '-'}</strong>
          <small>Media general</small>
        </div>
      </div>
      ${renderMediaCalculatorMap(results, selected, best)}
      <div class="media-calc-ranking">
        <h3>Mejores posiciones</h3>
        <ol id="media-calc-ranking-list">
          ${renderMediaCalculatorRankingList(results)}
        </ol>
      </div>
      ${renderMediaCalculatorQuickActions()}
    </aside>`;
}

function renderMediaCalculatorToolbar() {
  const isDisabled = mediaCalcState.goalkeeperMinimum;
  return `
    <div class="media-calc-toolbar">
      <label class="media-calc-search">
        <span>Buscar estadistica</span>
        <input id="media-calc-search-input" type="search" value="${mediaCalcEscape(mediaCalcState.search)}" placeholder="Buscar estadistica..." oninput="updateMediaCalculatorSearch(this.value)">
      </label>
      <label class="media-calc-toggle">
        <input type="checkbox" onchange="toggleMediaCalculatorGoalkeeperMinimum(this.checked)"${isDisabled ? ' checked' : ''}>
        <span class="media-calc-switch" aria-hidden="true"></span>
        <strong>Desactivar stats de arquero</strong>
      </label>
      <button type="button" onclick="copyMediaCalculatorConfig()">Copiar configuracion</button>
      <button type="button" class="is-danger" onclick="clearMediaCalculatorSaved()">Limpiar guardado</button>
      <button type="button" class="is-highlight" onclick="restoreMediaCalculatorBase()">Restaurar valores</button>
    </div>`;
}

function renderMediaCalculatorTabs() {
  const tabs = [{ id: 'all', label: 'Todas' }].concat(MEDIA_CALC_STAT_CATEGORIES.map(category => ({
    id: category.id,
    label: category.label,
  })));

  return `
    <div class="media-calc-tabs" role="tablist" aria-label="Filtros de estadisticas">
      ${tabs.map(tab => `
        <button type="button" class="${mediaCalcState.selectedCategory === tab.id ? 'is-active' : ''}"
          onclick="setMediaCalculatorCategory('${tab.id}')">
          ${mediaCalcEscape(tab.label)}
        </button>
      `).join('')}
    </div>`;
}

function mediaCalcStatMatchesFilter(key) {
  const categoryId = MEDIA_CALC_CATEGORY_BY_STAT[key] || 'technique';
  if (mediaCalcState.selectedCategory !== 'all' && categoryId !== mediaCalcState.selectedCategory) return false;
  const query = mediaCalcState.search.trim().toLowerCase();
  if (!query) return true;
  const label = MEDIA_CALC_STAT_LABELS[key] || key;
  return `${label} ${key}`.toLowerCase().includes(query);
}

function renderMediaCalculatorStatRow(key) {
  const value = mediaCalcRawStatValue(key);
  const isGoalkeeperStat = MEDIA_CALC_GOALKEEPER_STATS.has(key);
  const isLocked = mediaCalcState.goalkeeperMinimum && isGoalkeeperStat;
  const label = MEDIA_CALC_STAT_LABELS[key] || key;
  const deltaClass = mediaCalcDeltaClass(value);
  const valueClass = mediaCalcValueClass(value);
  const safeKey = mediaCalcEscape(key);
  return `
    <label class="stat-row media-stat-control ${deltaClass}${isLocked ? ' is-locked' : ''}" data-media-stat="${safeKey}">
      <span class="stat-name">${mediaCalcEscape(label)}</span>
      <input class="media-stat-number" data-media-key="${safeKey}" type="number" min="${MEDIA_CALC_MIN_STAT}" max="${MEDIA_CALC_MAX_STAT}" step="1"
        value="${value}" inputmode="numeric"
        oninput="updateMediaCalculatorStatInput('${safeKey}', this.value)"
        onblur="commitMediaCalculatorStatInput('${safeKey}', this.value)"
        onkeydown="handleMediaCalculatorStatKeydown(event, '${safeKey}')"${isLocked ? ' disabled' : ''}>
      <input class="media-stat-range" data-media-key="${safeKey}" type="range" min="${MEDIA_CALC_MIN_STAT}" max="${MEDIA_CALC_MAX_STAT}" value="${value}"
        oninput="updateMediaCalculatorStat('${safeKey}', this.value)"${isLocked ? ' disabled' : ''}>
      <span class="stat-value media-stat-live ${valueClass} ${deltaClass}" data-media-value="${safeKey}">${value}</span>
    </label>`;
}

function renderMediaCalculatorStatGroups(keys) {
  const groups = MEDIA_CALC_STAT_CATEGORIES.map(category => {
    const categoryKeys = category.stats
      .filter(key => keys.includes(key))
      .filter(mediaCalcStatMatchesFilter);
    return { category, keys: categoryKeys };
  }).filter(group => group.keys.length);

  if (!groups.length) {
    return '<div class="media-calc-empty">No hay estadisticas para ese filtro.</div>';
  }

  return `
    <div class="media-calc-stat-groups">
      ${groups.map(({ category, keys: categoryKeys }) => {
        const isCollapsed = mediaCalcState.collapsedCategories.has(category.id);
        const isGoalkeeper = category.id === 'goalkeeper';
        return `
          <section class="media-stat-card${isCollapsed ? ' is-collapsed' : ''}${isGoalkeeper && mediaCalcState.goalkeeperMinimum ? ' is-disabled' : ''}">
            <button class="media-stat-card-head" type="button" onclick="toggleMediaCalculatorCategoryCollapse('${category.id}')">
              <span>${mediaCalcEscape(category.marker)}</span>
              <strong>${mediaCalcEscape(category.label)}</strong>
              <b>${isCollapsed ? '+' : '-'}</b>
            </button>
            <div class="media-stat-card-body">
              ${isCollapsed ? '' : categoryKeys.map(renderMediaCalculatorStatRow).join('')}
            </div>
          </section>`;
      }).join('')}
    </div>`;
}

function renderMediaCalculatorLegend() {
  return `
    <div class="media-calc-legend">
      <p>Los valores de referencia (${MEDIA_CALC_BASE_STAT}) corresponden al promedio base configurado para la calculadora.</p>
      <span><i class="is-above"></i>Mayor a 80</span>
      <span><i class="is-equal"></i>Igual a 80</span>
      <span><i class="is-below"></i>Menor a 80</span>
    </div>`;
}

function renderMediaCalculatorPresets() {
  return `
    <section class="media-calc-panel media-calc-presets">
      <h3>Presets rapidos</h3>
      <div class="media-calc-preset-grid">
        ${MEDIA_CALC_PRESETS.map(preset => `
          <button type="button" class="${mediaCalcState.lastPreset === preset.id ? 'is-active' : ''}" onclick="applyMediaCalculatorNamedPreset('${preset.id}')">
            <strong>${mediaCalcEscape(preset.label)}</strong>
          </button>
        `).join('')}
      </div>
      <p>Los presets aplican valores recomendados como punto de partida.</p>
    </section>`;
}

function mediaCalcComparisonStats(keys = mediaCalcActiveComparisonKeys()) {
  const values = keys.map(key => ({ key, value: mediaCalcRawStatValue(key) }));
  const above = values.filter(item => item.value > MEDIA_CALC_BASE_STAT).length;
  const below = values.filter(item => item.value < MEDIA_CALC_BASE_STAT).length;
  const average = values.length
    ? values.reduce((sum, item) => sum + item.value, 0) / values.length
    : MEDIA_CALC_BASE_STAT;
  const highest = values.reduce((best, item) => (!best || item.value > best.value ? item : best), null);
  const lowest = values.reduce((best, item) => (!best || item.value < best.value ? item : best), null);
  return { above, below, average, highest, lowest };
}

function renderMediaCalculatorComparisonContent() {
  const stats = mediaCalcComparisonStats();
  const averagePosition = Math.max(0, Math.min(100, ((stats.average - MEDIA_CALC_MIN_STAT) / (MEDIA_CALC_MAX_STAT - MEDIA_CALC_MIN_STAT)) * 100));
  return `
    <h3>Comparativa con base 80</h3>
    <div class="media-calc-comparison-grid">
      <div><span>Por encima de 80</span><strong class="is-above">${stats.above}</strong></div>
      <div><span>Por debajo de 80</span><strong class="is-below">${stats.below}</strong></div>
      <div><span>Promedio general</span><strong>${stats.average.toFixed(1)}</strong></div>
      <div><span>Mas alta</span><strong class="is-above">${stats.highest ? mediaCalcEscape(MEDIA_CALC_STAT_LABELS[stats.highest.key] || stats.highest.key) : '-'}</strong><b>${stats.highest ? stats.highest.value : '-'}</b></div>
      <div><span>Mas baja</span><strong class="is-below">${stats.lowest ? mediaCalcEscape(MEDIA_CALC_STAT_LABELS[stats.lowest.key] || stats.lowest.key) : '-'}</strong><b>${stats.lowest ? stats.lowest.value : '-'}</b></div>
    </div>
    <div class="media-calc-average-bar" style="--average-position:${averagePosition}%">
      <span></span>
    </div>`;
}

function renderMediaCalculatorComparison() {
  return `
    <section class="media-calc-panel media-calc-comparison" id="media-calc-comparison">
      ${renderMediaCalculatorComparisonContent()}
    </section>`;
}

function renderMediaCalculatorWorkspace(keys) {
  return `
    <div class="media-calculator-editor media-calc-workspace">
      <div class="media-calculator-head media-calc-workspace-head">
        <div>
          <h2>Estadisticas</h2>
        </div>
        <span id="media-calc-feedback" class="media-calc-feedback is-ok">Configuracion guardada</span>
      </div>
      ${renderMediaCalculatorToolbar()}
      ${renderMediaCalculatorTabs()}
      ${renderMediaCalculatorLegend()}
      ${renderMediaCalculatorStatGroups(keys)}
      <div class="media-calc-bottom-grid">
        ${renderMediaCalculatorPresets()}
        ${renderMediaCalculatorComparison()}
      </div>
    </div>`;
}

function renderMediaCalculatorPage() {
  const content = document.getElementById('media-calculator-content');
  if (!content) return;

  const keys = mediaCalcAllStatKeys();
  const results = mediaCalcPositionResults();
  const best = mediaCalcBestResult(results);
  const selected = mediaCalcSelectedResult(results, best);
  if (selected && !mediaCalcState.selectedPosition) {
    mediaCalcState.selectedPosition = selected.position;
  }

  content.innerHTML = `
    <section class="media-calculator-section" id="calculadora-medias">
      <div class="media-calculator-layout media-calculator-dashboard">
        ${renderMediaCalculatorSidebar(results, best, selected)}
        ${renderMediaCalculatorWorkspace(keys)}
      </div>
    </section>`;
}

function mediaCalcUpdateDynamicSections() {
  const results = mediaCalcPositionResults();
  const best = mediaCalcBestResult(results);
  const selected = mediaCalcSelectedResult(results, best);
  const resultMap = new Map(results.map(item => [item.position, item]));

  if (selected) {
    const label = document.getElementById('media-calc-selected-label');
    const name = document.getElementById('media-calc-selected-name');
    const score = document.getElementById('media-calc-selected-score');
    const overall = document.querySelector('.media-calc-overall');
    if (label) label.textContent = selected.label;
    if (name) name.textContent = selected.name;
    if (score) score.textContent = String(selected.rounded);
    if (overall) overall.className = `media-calc-overall ${mediaCalcValueClass(selected.rounded)}`;
  }

  document.querySelectorAll('[data-media-position-cell]').forEach(cell => {
    const position = cell.getAttribute('data-media-position-cell');
    const result = resultMap.get(position);
    if (!result) return;
    const isSelected = selected && selected.position === position;
    const isBest = best && best.position === position;
    cell.classList.toggle('is-primary', !!isSelected);
    cell.classList.toggle('is-strong', !isSelected);
    cell.classList.toggle('is-best', !!isBest);
    cell.setAttribute('title', `${result.name}: ${result.rounded}`);
    cell.setAttribute('aria-label', `${result.name} ${result.rounded}`);
  });

  document.querySelectorAll('[data-media-position-score]').forEach(score => {
    const position = score.getAttribute('data-media-position-score');
    const result = resultMap.get(position);
    if (!result) return;
    score.textContent = String(result.rounded);
    score.className = `position-grade stat-value ${mediaCalcValueClass(result.rounded)}`;
  });

  const ranking = document.getElementById('media-calc-ranking-list');
  if (ranking) ranking.innerHTML = renderMediaCalculatorRankingList(results);

  const comparison = document.getElementById('media-calc-comparison');
  if (comparison) comparison.innerHTML = renderMediaCalculatorComparisonContent();
}

function mediaCalcUpdateStatControls(key, options = {}) {
  const value = mediaCalcRawStatValue(key);
  const selectorKey = mediaCalcCssKey(key);
  const deltaClass = mediaCalcDeltaClass(value);
  const valueClass = mediaCalcValueClass(value);
  const active = document.activeElement;

  document.querySelectorAll(`[data-media-key="${selectorKey}"]`).forEach(input => {
    const isActiveNumber = options.skipActiveNumber && input === active && input.classList.contains('media-stat-number');
    if (!isActiveNumber) input.value = String(value);
  });

  document.querySelectorAll(`[data-media-value="${selectorKey}"]`).forEach(el => {
    el.textContent = String(value);
    el.className = `stat-value media-stat-live ${valueClass} ${deltaClass}`;
  });

  document.querySelectorAll(`[data-media-stat="${selectorKey}"]`).forEach(row => {
    row.classList.remove('is-above', 'is-equal', 'is-below');
    row.classList.add(deltaClass);
  });
}

function updateMediaCalculatorStat(key, value) {
  if (mediaCalcState.goalkeeperMinimum && MEDIA_CALC_GOALKEEPER_STATS.has(key)) return;
  mediaCalcState.stats[key] = mediaCalcClampStat(value);
  mediaCalcUpdateStatControls(key);
  mediaCalcUpdateDynamicSections();
  mediaCalcSaveState();
}

function updateMediaCalculatorStatInput(key, value) {
  if (mediaCalcState.goalkeeperMinimum && MEDIA_CALC_GOALKEEPER_STATS.has(key)) return;
  const text = String(value || '').trim();
  if (!text) return;
  const number = parseInt(text, 10);
  if (!Number.isFinite(number)) return;
  if (number < MEDIA_CALC_MIN_STAT && text.length < 2) return;
  mediaCalcState.stats[key] = mediaCalcClampStat(number);
  mediaCalcUpdateStatControls(key, {
    skipActiveNumber: number >= MEDIA_CALC_MIN_STAT && number <= MEDIA_CALC_MAX_STAT,
  });
  mediaCalcUpdateDynamicSections();
  mediaCalcSaveState();
}

function commitMediaCalculatorStatInput(key, value) {
  if (mediaCalcState.goalkeeperMinimum && MEDIA_CALC_GOALKEEPER_STATS.has(key)) return;
  const text = String(value || '').trim();
  const fallback = mediaCalcRawStatValue(key);
  mediaCalcState.stats[key] = mediaCalcClampStat(text || fallback, fallback);
  mediaCalcUpdateStatControls(key);
  mediaCalcUpdateDynamicSections();
  mediaCalcSaveState(true);
}

function handleMediaCalculatorStatKeydown(event, key) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  commitMediaCalculatorStatInput(key, event.currentTarget.value);
  event.currentTarget.blur();
}

function setMediaCalculatorPosition(position) {
  mediaCalcState.selectedPosition = position;
  mediaCalcUpdateDynamicSections();
  mediaCalcSaveState();
}

function setAllMediaCalculatorStats(value) {
  const nextValue = mediaCalcClampStat(value);
  mediaCalcAllStatKeys().forEach(key => {
    mediaCalcState.stats[key] = nextValue;
  });
}

function restoreMediaCalculatorBase() {
  setAllMediaCalculatorStats(MEDIA_CALC_BASE_STAT);
  mediaCalcState.lastPreset = 'base80';
  renderMediaCalculatorPage();
  mediaCalcSaveState(true);
  mediaCalcSetFeedback('Valores restaurados a 80', 'ok');
}

function adjustAllMediaCalculatorStats(delta) {
  mediaCalcEditableStatKeys().forEach(key => {
    mediaCalcState.stats[key] = mediaCalcClampStat(mediaCalcRawStatValue(key) + Number(delta || 0));
  });
  mediaCalcState.lastPreset = '';
  renderMediaCalculatorPage();
  mediaCalcSaveState(true);
  mediaCalcSetFeedback(delta > 0 ? `+${delta} aplicado` : `${delta} aplicado`, 'ok');
}

function applyMediaCalculatorPreset(value) {
  setAllMediaCalculatorStats(value);
  mediaCalcState.lastPreset = '';
  renderMediaCalculatorPage();
  mediaCalcSaveState(true);
}

function applyMediaCalculatorNamedPreset(presetId) {
  const preset = MEDIA_CALC_PRESETS.find(item => item.id === presetId);
  if (!preset) return;
  setAllMediaCalculatorStats(MEDIA_CALC_BASE_STAT);
  Object.entries(preset.values || {}).forEach(([key, value]) => {
    mediaCalcState.stats[key] = mediaCalcClampStat(value);
  });
  if (preset.reactivateGoalkeeper) {
    mediaCalcState.goalkeeperMinimum = false;
  }
  mediaCalcState.lastPreset = preset.id;
  renderMediaCalculatorPage();
  mediaCalcSaveState(true);
  mediaCalcSetFeedback(`Preset ${preset.label} aplicado`, 'ok');
}

function toggleMediaCalculatorGoalkeeperMinimum(checked) {
  mediaCalcState.goalkeeperMinimum = !!checked;
  renderMediaCalculatorPage();
  mediaCalcSaveState(true);
  mediaCalcSetFeedback(mediaCalcState.goalkeeperMinimum ? 'Stats de arquero desactivadas' : 'Stats de arquero activadas', 'ok');
}

function updateMediaCalculatorSearch(value) {
  mediaCalcState.search = value || '';
  renderMediaCalculatorPage();
  const searchInput = document.getElementById('media-calc-search-input');
  if (searchInput) {
    searchInput.focus();
    const cursor = searchInput.value.length;
    searchInput.setSelectionRange(cursor, cursor);
  }
  mediaCalcSaveState();
}

function setMediaCalculatorCategory(categoryId) {
  mediaCalcState.selectedCategory = categoryId || 'all';
  renderMediaCalculatorPage();
  mediaCalcSaveState();
}

function toggleMediaCalculatorCategoryCollapse(categoryId) {
  if (mediaCalcState.collapsedCategories.has(categoryId)) {
    mediaCalcState.collapsedCategories.delete(categoryId);
  } else {
    mediaCalcState.collapsedCategories.add(categoryId);
  }
  renderMediaCalculatorPage();
  mediaCalcSaveState();
}

function mediaCalcBuildCopyText() {
  const results = mediaCalcPositionResults();
  const best = mediaCalcBestResult(results);
  const selected = mediaCalcSelectedResult(results, best);
  const statLines = mediaCalcAllStatKeys().map(key => `${MEDIA_CALC_STAT_LABELS[key] || key}: ${mediaCalcRawStatValue(key)}`);
  const resultLines = results.map(item => `${item.label}: ${item.rounded}`);

  return [
    'Calculadora de medias PES 2018',
    '',
    `Mejor posicion: ${best ? `${best.label} ${best.rounded}` : '-'}`,
    `Media general: ${selected ? selected.rounded : '-'}`,
    '',
    'Stats:',
    ...statLines,
    '',
    'Medias por posicion:',
    ...resultLines,
  ].join('\n');
}

async function copyMediaCalculatorConfig() {
  const text = mediaCalcBuildCopyText();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    mediaCalcSetFeedback('Configuracion copiada', 'ok');
  } catch (error) {
    mediaCalcSetFeedback('No se pudo copiar', 'warn');
  }
}

function clearMediaCalculatorSaved() {
  try {
    localStorage.removeItem(MEDIA_CALC_STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo limpiar el guardado.', error);
  }
  mediaCalcState.stats = {};
  mediaCalcState.goalkeeperMinimum = false;
  mediaCalcState.selectedPosition = null;
  mediaCalcState.selectedCategory = 'all';
  mediaCalcState.search = '';
  mediaCalcState.lastPreset = '';
  mediaCalcState.collapsedCategories = new Set();
  renderMediaCalculatorPage();
  mediaCalcSetFeedback('Guardado limpiado', 'ok');
}

async function initMediaCalculator() {
  const loading = document.getElementById('media-calculator-loading');
  const content = document.getElementById('media-calculator-content');
  if (!content) return;
  try {
    mediaCalcLoadState();
    const formulasText = await mediaCalcFetchText('assets/data/formulas_por_posicion.json');
    mediaCalcFormulas = JSON.parse(formulasText);
    renderMediaCalculatorPage();
    mediaCalcSaveState(true);
  } catch (error) {
    content.innerHTML = `<div class="error-message">No se pudieron cargar las formulas: ${mediaCalcEscape(error.message)}</div>`;
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', initMediaCalculator);

window.setMediaCalculatorPosition = setMediaCalculatorPosition;
window.applyMediaCalculatorPreset = applyMediaCalculatorPreset;
window.applyMediaCalculatorNamedPreset = applyMediaCalculatorNamedPreset;
window.restoreMediaCalculatorBase = restoreMediaCalculatorBase;
window.adjustAllMediaCalculatorStats = adjustAllMediaCalculatorStats;
window.toggleMediaCalculatorGoalkeeperMinimum = toggleMediaCalculatorGoalkeeperMinimum;
window.updateMediaCalculatorSearch = updateMediaCalculatorSearch;
window.setMediaCalculatorCategory = setMediaCalculatorCategory;
window.toggleMediaCalculatorCategoryCollapse = toggleMediaCalculatorCategoryCollapse;
window.updateMediaCalculatorStat = updateMediaCalculatorStat;
window.updateMediaCalculatorStatInput = updateMediaCalculatorStatInput;
window.commitMediaCalculatorStatInput = commitMediaCalculatorStatInput;
window.handleMediaCalculatorStatKeydown = handleMediaCalculatorStatKeydown;
window.copyMediaCalculatorConfig = copyMediaCalculatorConfig;
window.clearMediaCalculatorSaved = clearMediaCalculatorSaved;
window.initMediaCalculator = initMediaCalculator;
