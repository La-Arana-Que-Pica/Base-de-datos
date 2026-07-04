'use strict';

const TACTICS_CSV_PATH = 'database/tacticas.csv';
const TACTICS_TEAMS_PATH = 'database/tacticas/teams';
const TACTICS_FALLBACK_COVER = 'assets/images/home-banner-main-2.png';
const TACTICS_FALLBACK_BADGE = 'img/teams/default.webp';
const TACTICS_FALLBACK_PLAYER = 'img/players/default.webp';
const TACTICS_PAGE_SIZE = 6;
const TACTICS_POPULAR_LIMIT = 4;

const TACTIC_POPULAR_IDS = [
  'river-2018-2019',
  'boca-2000-2001',
  'barcelona-2010-2011',
  'real-madrid-2016-2018',
  'argentina-1986',
  'manchester-united-1998-1999',
  'liverpool-2018-2020',
  'ac-milan-1988-90',
];

let historicalTactics = [];
let filteredTactics = [];
let visibleTacticsCount = TACTICS_PAGE_SIZE;

const TACTIC_PHASES = [
  { key: 'inicial', label: 'Inicial', formationKey: 'formacion' },
  { key: 'con_balon', label: 'Con balón', formationKey: 'formacion_con_balon' },
  { key: 'sin_balon', label: 'Sin balón', formationKey: 'formacion_sin_balon' },
];

function tacticsEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseTacticsCSV(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  const headers = (rows.shift() || []).map(header => header.replace(/^\uFEFF/, '').trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function tacticsList(value) {
  return String(value || '').split('|').map(item => item.trim()).filter(Boolean);
}

function tacticNumber(value) {
  const number = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function tacticSeasonStart(tactic) {
  const match = String(tactic.temporada || '').match(/\d{4}/);
  return match ? Number(match[0]) : 0;
}

function tacticPopularScore(tactic) {
  const analyticsScore = Math.max(
    tacticNumber(tactic.visitas),
    tacticNumber(tactic.views),
    tacticNumber(tactic.analytics),
    tacticNumber(tactic.popularidad),
  );
  if (analyticsScore > 0) return analyticsScore + 1000;
  const curatedIndex = TACTIC_POPULAR_IDS.indexOf(tactic.id);
  return curatedIndex >= 0 ? TACTIC_POPULAR_IDS.length - curatedIndex : 0;
}

function compareTacticsByImportance(a, b) {
  return tacticPopularScore(b) - tacticPopularScore(a)
    || tacticSeasonStart(b) - tacticSeasonStart(a)
    || String(a.equipo || '').localeCompare(String(b.equipo || ''), 'es');
}

function compareTacticsBySeason(a, b) {
  return tacticSeasonStart(b) - tacticSeasonStart(a)
    || String(a.equipo || '').localeCompare(String(b.equipo || ''), 'es')
    || String(a.temporada || '').localeCompare(String(b.temporada || ''), 'es');
}

function tacticsUrl(id) {
  return `tactics.html?id=${encodeURIComponent(id)}`;
}

function tacticImage(path, alt, className, fallback) {
  return `<img class="${className}" src="${tacticsEscape(path || fallback)}" alt="${tacticsEscape(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">`;
}

function tacticTeamPath(tacticId) {
  return `${TACTICS_TEAMS_PATH}/${encodeURIComponent(tacticId)}`;
}

function handleTacticPlayerImageError(image, baseId) {
  const fallbackStep = Number(image.dataset.fallbackStep || 0);
  if (fallbackStep === 0 && baseId) {
    image.dataset.fallbackStep = '1';
    image.src = `img/players/${encodeURIComponent(baseId)}.webp`;
    return;
  }
  image.onerror = null;
  image.src = TACTICS_FALLBACK_PLAYER;
}

function isDynamicTactic(tactic) {
  return ['si', 'sí', 'true', '1', 'yes'].includes(String(tactic.dinamica || '').trim().toLowerCase());
}

function normalizeFormationLabel(value) {
  const label = String(value || '').trim();
  const excelDate = label.match(/^(\d{1,2})\/(\d{1,2})\/20(\d{2})$/);
  return excelDate ? `${Number(excelDate[1])}-${Number(excelDate[2])}-${Number(excelDate[3])}` : label;
}

function normalizeSupportRange(value) {
  const label = String(value || '').trim();
  const months = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
  };
  const excelMonth = label.toLowerCase().match(/^(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/);
  return excelMonth ? `${Number(excelMonth[1])}-${months[excelMonth[2]]}` : label;
}

const TACTIC_SETTING_FIELDS = [
  { key: 'attackStyle', labelKey: 'tactics.attackStyle', valueKey: 'estilo_ataque', valuesKey: 'attackStyle' },
  { key: 'buildUp', labelKey: 'tactics.buildUp', valueKey: 'construccion', valuesKey: 'buildUp' },
  { key: 'attackArea', labelKey: 'tactics.attackArea', valueKey: 'zona_ataque', valuesKey: 'sideCenter' },
  { key: 'positioning', labelKey: 'tactics.positioning', valueKey: 'posicionamiento', valuesKey: 'positioning' },
  { key: 'supportRange', labelKey: 'tactics.supportRange', valueKey: 'rango_apoyo', normalize: normalizeSupportRange },
  { key: 'defenseStyle', labelKey: 'tactics.defenseStyle', valueKey: 'estilo_defensivo', valuesKey: 'defenseStyle' },
  { key: 'containmentArea', labelKey: 'tactics.containmentArea', valueKey: 'zona_contencion', valuesKey: 'centerSide' },
  { key: 'pressuring', labelKey: 'tactics.pressuring', valueKey: 'presion', valuesKey: 'pressuring' },
  { key: 'defensiveLine', labelKey: 'tactics.defensiveLine', valueKey: 'linea_defensiva' },
  { key: 'compactness', labelKey: 'tactics.compactness', valueKey: 'compacidad' },
];

const TACTIC_COMPACT_SETTING_KEYS = new Set(['attackStyle', 'buildUp', 'positioning', 'pressuring', 'defensiveLine', 'compactness']);

const TACTIC_VALUE_ALIASES = {
  attackStyle: {
    contraataque: '0',
    contragolpe: '0',
    posesion: '1',
    posesión: '1',
    'juego de posesion': '1',
    'juego de posesión': '1',
  },
  buildUp: {
    'pase largo': '0',
    'pase corto': '1',
  },
  sideCenter: {
    banda: '0',
    bandas: '0',
    'por las bandas': '0',
    centro: '1',
    central: '1',
  },
  centerSide: {
    centro: '0',
    central: '0',
    banda: '1',
    bandas: '1',
    'por las bandas': '1',
  },
  positioning: {
    'mantener formacion': '0',
    'mantener formación': '0',
    flexible: '1',
  },
  defenseStyle: {
    'presion en primera linea': '0',
    'presión en primera línea': '0',
    'presion en la frontal': '0',
    'presión en la frontal': '0',
    'defensa total': '1',
  },
  pressuring: {
    agresiva: '0',
    agresivo: '0',
    conservadora: '1',
    conservador: '1',
  },
};

function tacticMessage(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function tacticSettingValue(valuesKey, raw) {
  const label = String(raw || '').trim();
  if (!valuesKey) return label;
  const normalized = label.toLowerCase();
  const valueId = TACTIC_VALUE_ALIASES[valuesKey]?.[normalized];
  if (!valueId || typeof i18nLookup !== 'function') return label;
  return i18nLookup('tacticValues', `${valuesKey}.${valueId}`, label);
}

function tacticFormation(tactic, phase = 'inicial') {
  const config = TACTIC_PHASES.find(item => item.key === phase) || TACTIC_PHASES[0];
  return normalizeFormationLabel(tactic[config.formationKey] || tactic.formacion || '');
}

function tacticPlayerPhaseValue(player, field, phase = 'inicial') {
  if (phase === 'inicial') return player[`${field}_inicial`] || player[field] || '';
  return player[`${field}_${phase}`] || player[`${field}_inicial`] || player[field] || '';
}

function compactTacticPlayerPositions(players, phase) {
  const positions = players.map(player => ({
    x: Number(tacticPlayerPhaseValue(player, 'x', phase)) || 50,
    y: Number(tacticPlayerPhaseValue(player, 'y', phase)) || 50,
  }));
  const lines = [];

  positions
    .map((position, index) => ({ ...position, index }))
    .sort((a, b) => a.y - b.y)
    .forEach(position => {
      const line = lines.find(item => Math.abs(item.y - position.y) <= 7);
      if (line) {
        line.players.push(position);
        line.y = line.players.reduce((sum, player) => sum + player.y, 0) / line.players.length;
      } else {
        lines.push({ y: position.y, players: [position] });
      }
    });

  lines.forEach(line => {
    const sorted = line.players.sort((a, b) => a.x - b.x);
    const minimumGap = 16;
    const requiredWidth = minimumGap * (sorted.length - 1);
    const hasCollision = sorted.some((player, index) => (
      index > 0 && player.x - sorted[index - 1].x < minimumGap
    ));
    if (!hasCollision) return;

    const center = sorted.reduce((sum, player) => sum + player.x, 0) / sorted.length;
    const start = Math.max(8, Math.min(center - requiredWidth / 2, 92 - requiredWidth));
    sorted.forEach((player, index) => {
      positions[player.index].x = start + minimumGap * index;
    });
  });

  return positions;
}

function renderTacticPitch(tactic, compact = false, phase = 'inicial', hidden = false) {
  if (!(tactic.players || []).length) {
    return `
    <div class="history-tactic-pitch${compact ? ' is-compact' : ''}" data-tactic-phase="${phase}"${hidden ? ' hidden' : ''} aria-label="Formación ${tacticsEscape(tacticFormation(tactic, phase))}">
      <span class="history-pitch-half"></span>
      <span class="history-pitch-circle"></span>
      <span class="history-pitch-area history-pitch-area-top"></span>
      <span class="history-pitch-area history-pitch-area-bottom"></span>
    </div>`;
  }

  const playerPositions = compact ? compactTacticPlayerPositions(tactic.players, phase) : [];
  const markers = (tactic.players || []).map((player, index) => {
    const name = player.nombre || 'Jugador';
    const position = tacticPlayerPhaseValue(player, 'posicion', phase) || '-';
    const x = compact ? playerPositions[index].x : tacticPlayerPhaseValue(player, 'x', phase);
    const y = compact ? playerPositions[index].y : tacticPlayerPhaseValue(player, 'y', phase);
    const playerId = player.id || '';
    const baseId = player.base_id || '';
    const longNameClass = name.length > 11 ? ' is-long' : '';
    return `
      <span class="history-tactic-player" style="left:${Number(x) || 50}%;top:${Number(y) || 50}%" title="${tacticsEscape(`${name} - ${position}`)}">
        <span class="history-player-photo-wrap">
          <img src="${tacticTeamPath(tactic.id)}/${encodeURIComponent(playerId)}.webp" alt="${tacticsEscape(name)}" loading="lazy" onerror="handleTacticPlayerImageError(this,'${tacticsEscape(baseId)}')">
        </span>
        <span class="history-player-position">${tacticsEscape(position)}</span>
        <span class="history-player-name${longNameClass}"><span>${tacticsEscape(name)}</span></span>
      </span>`;
  }).join('');

  return `
    <div class="history-tactic-pitch${compact ? ' is-compact' : ''}" data-tactic-phase="${phase}"${hidden ? ' hidden' : ''} aria-label="Formación ${tacticsEscape(tacticFormation(tactic, phase))}">
      <span class="history-pitch-half"></span>
      <span class="history-pitch-circle"></span>
      <span class="history-pitch-area history-pitch-area-top"></span>
      <span class="history-pitch-area history-pitch-area-bottom"></span>
      ${markers}
    </div>`;
}

function renderFormationViewer(tactic) {
  if (!(tactic.players || []).length) {
    return `
      <div class="history-detail-panel-head"><span class="history-kicker">Formación</span><h2>${tacticsEscape(tacticFormation(tactic))}</h2></div>
      <div class="history-formation-empty">
        <strong>Plantel pendiente</strong>
        <span>Esta táctica todavía no tiene los once jugadores cargados.</span>
      </div>`;
  }

  if (!isDynamicTactic(tactic)) {
    return `
      <div class="history-detail-panel-head"><span class="history-kicker">Formación</span><h2>${tacticsEscape(tacticFormation(tactic))}</h2></div>
      ${renderTacticPitch(tactic)}`;
  }

  return `
    <div class="history-detail-panel-head history-dynamic-head">
      <div><span class="history-kicker">Táctica dinámica</span><h2 id="history-active-formation">${tacticsEscape(tacticFormation(tactic))}</h2></div>
      <div class="history-phase-tabs" role="tablist" aria-label="Fase de la táctica">
        ${TACTIC_PHASES.map((phase, index) => `<button type="button" role="tab" data-history-phase-button="${phase.key}" aria-selected="${index === 0 ? 'true' : 'false'}" class="${index === 0 ? 'is-active' : ''}">${phase.label}</button>`).join('')}
      </div>
    </div>
    <div class="history-dynamic-pitches">
      ${TACTIC_PHASES.map((phase, index) => renderTacticPitch(tactic, false, phase.key, index !== 0)).join('')}
    </div>`;
}

function bindDynamicFormation(tactic) {
  if (!isDynamicTactic(tactic)) return;
  const buttons = [...document.querySelectorAll('[data-history-phase-button]')];
  const pitches = [...document.querySelectorAll('.history-dynamic-pitches [data-tactic-phase]')];
  const formationLabel = document.querySelector('#history-active-formation');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const phase = button.dataset.historyPhaseButton;
      buttons.forEach(item => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      pitches.forEach(pitch => { pitch.hidden = pitch.dataset.tacticPhase !== phase; });
      if (formationLabel) formationLabel.textContent = tacticFormation(tactic, phase);
    });
  });
}

function renderTacticSettings(tactic, compact = false) {
  const settings = TACTIC_SETTING_FIELDS
    .map(field => {
      const rawValue = field.normalize ? field.normalize(tactic[field.valueKey]) : tactic[field.valueKey];
      return {
        field,
        label: tacticMessage(field.labelKey, field.labelKey),
        value: tacticSettingValue(field.valuesKey, rawValue),
      };
    })
    .filter(({ value }) => String(value || '').trim())
    .filter(({ field }) => !compact || TACTIC_COMPACT_SETTING_KEYS.has(field.key));
  return `
    <dl class="history-tactic-settings${compact ? ' is-compact' : ''}">
      ${settings.map(({ label, value }) => `<div><dt>${tacticsEscape(label)}</dt><dd>${tacticsEscape(value)}</dd></div>`).join('')}
    </dl>`;
}

function renderAdvancedInstructions(tactic) {
  const groups = [
    ['Ataque', tactic.ataque_avanzada_1, tactic.ataque_avanzada_2],
    ['Defensa', tactic.defensa_avanzada_1, tactic.defensa_avanzada_2],
  ].map(([label, ...values]) => [label, ...values.filter(value => String(value || '').trim())])
    .filter(([, ...values]) => values.length);
  if (!groups.length) return '';
  return `
    <section class="history-advanced-instructions">
      <span class="history-tactic-section-label">Instrucciones avanzadas</span>
      <div class="history-advanced-grid">
        ${groups.map(([label, ...values]) => `
          <div class="history-advanced-group">
            <strong>${tacticsEscape(label)}</strong>
            ${values.map(value => `<span>${tacticsEscape(value)}</span>`).join('')}
          </div>`).join('')}
      </div>
    </section>`;
}

function renderTacticCard(tactic) {
  return `
    <article class="history-tactic-card">
      <div class="history-tactic-cover">
        ${tacticImage(tactic.portada, `${tactic.equipo} ${tactic.temporada}`, 'history-tactic-cover-image', TACTICS_FALLBACK_COVER)}
        <div class="history-tactic-cover-shade"></div>
        ${tacticImage(tactic.escudo, `Escudo de ${tactic.equipo}`, 'history-tactic-badge', TACTICS_FALLBACK_BADGE)}
      </div>
      <div class="history-tactic-summary">
        <span class="history-tactic-season">${tacticsEscape(tactic.temporada)}</span>
        <h2>${tacticsEscape(tactic.equipo)}</h2>
        <strong>${tacticsEscape(tactic.apodo)}</strong>
        <p>${tacticsEscape(tactic.descripcion)}</p>
        <a class="history-secondary-button" href="${tacticsUrl(tactic.id)}">Leer más</a>
      </div>
      <div class="history-tactic-formation">
        <span>${tacticsEscape(tacticFormation(tactic, 'inicial'))}</span>
        ${renderTacticPitch(tactic, true, 'inicial')}
      </div>
      <div class="history-tactic-actions">
        <span class="history-tactic-section-label">Ajustes clave en PES 2018</span>
        ${renderTacticSettings(tactic, true)}
        <a class="history-primary-button" href="${tacticsUrl(tactic.id)}">Ver táctica completa</a>
      </div>
    </article>`;
}

function renderPopularTacticCard(tactic) {
  return `
    <article class="history-popular-card">
      <div class="history-tactic-cover">
        ${tacticImage(tactic.portada, `${tactic.equipo} ${tactic.temporada}`, 'history-tactic-cover-image', TACTICS_FALLBACK_COVER)}
        <div class="history-tactic-cover-shade"></div>
        ${tacticImage(tactic.escudo, `Escudo de ${tactic.equipo}`, 'history-tactic-badge', TACTICS_FALLBACK_BADGE)}
      </div>
      <div class="history-tactic-summary">
        <span class="history-tactic-season">${tacticsEscape(tactic.temporada)}</span>
        <h2>${tacticsEscape(tactic.equipo)}</h2>
        <strong>${tacticsEscape(tactic.apodo)}</strong>
        <p>${tacticsEscape(tactic.descripcion)}</p>
        <a class="history-primary-button" href="${tacticsUrl(tactic.id)}">Ver táctica</a>
      </div>
    </article>`;
}

function uniqueTacticValues(key) {
  return [...new Set(historicalTactics.map(item => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

function renderFilterSelect(key, label) {
  return `
    <label class="history-filter">
      <span>${label}</span>
      <select data-tactic-filter="${key}">
        <option value="">Todas</option>
        ${uniqueTacticValues(key).map(value => `<option value="${tacticsEscape(value)}">${tacticsEscape(key === 'formacion' ? normalizeFormationLabel(value) : value)}</option>`).join('')}
      </select>
    </label>`;
}

function tacticFilterValue(tactic, key) {
  if (key === 'decada') return tactic.epoca || '';
  if (key === 'zona') return tactic.region || '';
  if (key === 'tipo') return tactic.estilo_ataque || '';
  if (key === 'equipo') return tactic.equipo || '';
  return tactic[key] || '';
}

function uniqueTacticFilterValues(key) {
  return [...new Set(historicalTactics.map(item => tacticFilterValue(item, key)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}

function renderSimpleFilterSelect(key, label) {
  return `
    <label class="history-filter">
      <span>${label}</span>
      <select data-tactic-filter="${key}">
        <option value="">Todas</option>
        ${uniqueTacticFilterValues(key).map(value => `<option value="${tacticsEscape(value)}">${tacticsEscape(value)}</option>`).join('')}
      </select>
    </label>`;
}

async function ensureTacticPlayers(tactics) {
  await Promise.all(tactics.map(async tactic => {
    if (tactic.playersLoaded) return;
    tactic.players = await loadTacticPlayers(tactic);
    tactic.playersLoaded = true;
  }));
}

async function renderVisibleTactics() {
  const list = document.querySelector('#history-tactics-list');
  const status = document.querySelector('#history-tactics-status');
  const loadMore = document.querySelector('#history-load-more');
  if (!list) return;

  const visible = filteredTactics.slice(0, visibleTacticsCount);
  await ensureTacticPlayers(visible);
  list.innerHTML = visible.length
    ? visible.map(renderTacticCard).join('')
    : '<div class="history-empty-state">No hay tácticas que coincidan con esos filtros.</div>';

  if (status) {
    status.textContent = filteredTactics.length
      ? `${visible.length} de ${filteredTactics.length} ${filteredTactics.length === 1 ? 'táctica' : 'tácticas'}`
      : '0 tácticas';
  }

  if (loadMore) {
    const hasMore = visibleTacticsCount < filteredTactics.length;
    loadMore.hidden = !hasMore;
    loadMore.textContent = hasMore ? `Ver ${Math.min(TACTICS_PAGE_SIZE, filteredTactics.length - visibleTacticsCount)} más` : 'Todas cargadas';
  }
}

async function renderPopularTactics() {
  const list = document.querySelector('#history-popular-tactics-list');
  if (!list) return;
  const popular = [...historicalTactics]
    .sort(compareTacticsByImportance)
    .slice(0, TACTICS_POPULAR_LIMIT);
  list.innerHTML = popular.map(renderPopularTacticCard).join('');
}

function applyTacticFilters(resetCount = true) {
  const filters = [...document.querySelectorAll('[data-tactic-filter]')]
    .map(select => [select.dataset.tacticFilter, select.value])
    .filter(([, value]) => value);
  filteredTactics = historicalTactics
    .filter(tactic => filters.every(([key, value]) => tacticFilterValue(tactic, key) === value))
    .sort(compareTacticsBySeason);
  if (resetCount) visibleTacticsCount = TACTICS_PAGE_SIZE;
  renderVisibleTactics();
}

async function renderTacticsIndex() {
  const target = document.querySelector('#tactics-content');
  target.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><span>Tácticas</span></nav>
    <section class="history-tactics-hero">
      <div class="history-tactics-hero-copy">
        <span class="history-kicker">Fútbol histórico en PES 2018</span>
        <h1>Tácticas</h1>
        <p>Reviví equipos que marcaron una época con esquemas y ajustes listos para recrear.</p>
      </div>
    </section>

    <section class="history-filter-bar" aria-label="Filtros de tácticas">
      ${renderSimpleFilterSelect('decada', 'Época')}
      ${renderSimpleFilterSelect('zona', 'Zona')}
      ${renderSimpleFilterSelect('tipo', 'Tipo')}
      ${renderSimpleFilterSelect('equipo', 'Equipo')}
      <button id="clear-tactic-filters" class="history-clear-button" type="button">Limpiar filtros</button>
    </section>

    <div class="history-list-heading">
      <div>
        <span class="history-kicker">Más vistas</span>
        <h2>Tácticas populares</h2>
      </div>
    </div>
    <section id="history-popular-tactics-list" class="history-tactics-list history-popular-tactics-list" aria-label="Tácticas populares"></section>

    <div class="history-list-heading">
      <div>
        <span class="history-kicker">Colección LAqP</span>
        <h2>Todas las tácticas</h2>
      </div>
      <strong id="history-tactics-status"></strong>
    </div>
    <section id="history-tactics-list" class="history-tactics-list" aria-label="Listado de tácticas"></section>
    <div class="history-load-more-wrap">
      <button id="history-load-more" class="history-primary-button" type="button">Ver más</button>
    </div>

    <section class="history-benefits" aria-label="Características">
      <div><strong>Tácticas históricas</strong><span>Ideas reales de equipos legendarios.</span></div>
      <div><strong>Adaptadas a PES 2018</strong><span>Ajustes claros para recrearlas.</span></div>
      <div><strong>Fáciles de usar</strong><span>Formación y claves en una sola vista.</span></div>
      <div><strong>Siempre ampliable</strong><span>Más equipos históricos para recrear.</span></div>
    </section>`;

  document.querySelectorAll('[data-tactic-filter]').forEach(select => select.addEventListener('change', applyTacticFilters));
  document.querySelector('#history-load-more')?.addEventListener('click', () => {
    visibleTacticsCount += TACTICS_PAGE_SIZE;
    renderVisibleTactics();
  });
  document.querySelector('#clear-tactic-filters')?.addEventListener('click', () => {
    document.querySelectorAll('[data-tactic-filter]').forEach(select => { select.value = ''; });
    applyTacticFilters();
  });
  await renderPopularTactics();
  applyTacticFilters();
}

function renderTacticDetail(tactic) {
  const target = document.querySelector('#tactics-content');
  const keys = tacticsList(tactic.claves);
  const related = historicalTactics.filter(item => item.id !== tactic.id).sort(compareTacticsBySeason).slice(0, 3);
  const relatedMarkup = related.length ? `
    <section class="history-related">
      <div class="history-list-heading">
        <div><span class="history-kicker">Seguí explorando</span><h2>Otras tácticas</h2></div>
        <a href="tactics.html">Ver todas</a>
      </div>
      <div class="history-related-grid">
        ${related.map(item => `<a href="${tacticsUrl(item.id)}">${tacticImage(item.escudo, '', 'history-related-badge', TACTICS_FALLBACK_BADGE)}<span><strong>${tacticsEscape(item.equipo)}</strong><small>${tacticsEscape(item.temporada)} · ${tacticsEscape(tacticFormation(item))}</small></span></a>`).join('')}
      </div>
    </section>` : '';
  document.title = `${tactic.equipo} ${tactic.temporada} - Táctica PES 2018 | LAqP`;

  target.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="tactics.html">Tácticas</a><span>${tacticsEscape(tactic.equipo)}</span></nav>
    <section class="history-detail-hero">
      ${tacticImage(tactic.portada, `${tactic.equipo} ${tactic.temporada}`, 'history-detail-cover', TACTICS_FALLBACK_COVER)}
      <div class="history-detail-shade"></div>
      <div class="history-detail-copy">
        ${tacticImage(tactic.escudo, `Escudo de ${tactic.equipo}`, 'history-detail-badge', TACTICS_FALLBACK_BADGE)}
        <div>
          <span class="history-kicker">${tacticsEscape(tactic.temporada)} · ${tacticsEscape(tactic.region)}</span>
          <h1>${tacticsEscape(tactic.equipo)}</h1>
          <strong>${tacticsEscape(tactic.apodo)}</strong>
          <p>${tacticsEscape(tactic.descripcion)}</p>
        </div>
      </div>
    </section>

    <section class="history-detail-grid">
      <article class="history-detail-panel history-detail-formation">
        ${renderFormationViewer(tactic)}
      </article>
      <div class="history-detail-side">
        <article class="history-detail-panel">
          <div class="history-detail-panel-head"><span class="history-kicker">Configuración</span><h2>Ajustes en PES 2018</h2></div>
          ${renderTacticSettings(tactic)}
          ${keys.length ? `<div class="history-key-list">${keys.map(key => `<span>${tacticsEscape(key)}</span>`).join('')}</div>` : ''}
          ${renderAdvancedInstructions(tactic)}
        </article>
        ${relatedMarkup}
      </div>
    </section>`;

  bindDynamicFormation(tactic);
}

async function loadTacticPlayers(tactic) {
  try {
    const response = await fetch(`${tacticTeamPath(tactic.id)}/players.csv`);
    if (!response.ok) return [];
    return parseTacticsCSV(await response.text()).filter(player => player.id && player.nombre);
  } catch (error) {
    console.warn(`No se pudo cargar el plantel de ${tactic.id}.`, error);
    return [];
  }
}

async function initTactics() {
  const loading = document.querySelector('#tactics-loading');
  try {
    const response = await fetch(TACTICS_CSV_PATH);
    if (!response.ok) throw new Error('No se pudieron cargar las tácticas.');
    historicalTactics = parseTacticsCSV(await response.text()).filter(tactic => tactic.id).sort(compareTacticsBySeason);
    const requestedId = new URLSearchParams(window.location.search).get('id');
    if (requestedId) {
      const tactic = historicalTactics.find(item => item.id === requestedId);
      if (!tactic) throw new Error(`No existe una táctica con el ID "${requestedId}".`);
      tactic.players = await loadTacticPlayers(tactic);
      tactic.playersLoaded = true;
      renderTacticDetail(tactic);
    } else {
      await renderTacticsIndex();
    }
  } catch (error) {
    document.querySelector('#tactics-content').innerHTML = `<div class="history-empty-state">${tacticsEscape(error.message)}</div>`;
  } finally {
    if (loading) loading.remove();
  }
}

window.handleTacticPlayerImageError = handleTacticPlayerImageError;
document.addEventListener('DOMContentLoaded', initTactics);
