'use strict';

const TACTICS_CSV_PATH = 'database/tacticas.csv';
const TACTICS_METADATA_PATH = 'database/tacticas-metadata.csv';
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
let tacticsRenderRevision = 0;

// Compatibilidad durante despliegues en los que el navegador conserve una
// versión anterior de country-filter.js. El mapeo país → continente sigue
// perteneciendo exclusivamente al módulo compartido.
const TACTIC_CONTINENT_FALLBACK_LABELS = {
  europe: 'Europa',
  'south-america': 'Sudamérica',
  'north-america': 'Norteamérica / Centroamérica / Caribe',
  africa: 'África',
  asia: 'Asia',
  oceania: 'Oceanía',
  other: 'Otros',
};

const TACTIC_FILTER_DEFINITIONS = [
  { key: 'formacion', label: 'Formación', value: tactic => tacticFormation(tactic) },
  { key: 'temporada', label: 'Temporada', value: tactic => tactic.temporada || '', sort: (a, b) => tacticSeasonStart({ temporada: b }) - tacticSeasonStart({ temporada: a }) },
  { key: 'entrenador', label: 'Entrenador', value: tactic => tactic.entrenador || '' },
];

const TACTIC_TECHNICAL_FILTERS = [
  { key: 'estilo_ataque', label: 'Ataque' },
  { key: 'construccion', label: 'Construcción' },
  { key: 'zona_ataque', label: 'Zona de ataque' },
  { key: 'posicionamiento', label: 'Posicionamiento' },
  { key: 'estilo_defensivo', label: 'Defensa' },
  { key: 'zona_contencion', label: 'Zona defensiva' },
  { key: 'presion', label: 'Presión' },
];

// Reglas deliberadamente conservadoras: cada etiqueta se apoya en parámetros
// PES explícitos y no en el texto editorial de la tarjeta.
const TACTIC_DERIVED_STYLE_RULES = [
  { key: 'posesion', label: 'Posesión', matches: tactic => tactic.estilo_ataque === 'Posesión' },
  { key: 'contraataque', label: 'Contraataque', matches: tactic => tactic.estilo_ataque === 'Contraataque' },
  { key: 'juego-directo', label: 'Juego directo', matches: tactic => tactic.construccion === 'Pase largo' },
  { key: 'ataque-bandas', label: 'Ataque por bandas', matches: tactic => tactic.zona_ataque === 'Banda' },
  { key: 'juego-interior', label: 'Juego interior', matches: tactic => tactic.zona_ataque === 'Centro' },
  { key: 'presion-alta', label: 'Presión alta', matches: tactic => tactic.estilo_defensivo === 'Presión en primera línea' && tacticNumber(tactic.linea_defensiva) >= 7 },
  { key: 'bloque-bajo', label: 'Bloque bajo', matches: tactic => tactic.estilo_defensivo === 'Defensa total' && tacticNumber(tactic.linea_defensiva) <= 4 },
  { key: 'defensa-agresiva', label: 'Defensa agresiva', matches: tactic => tactic.presion === 'Agresiva' },
  { key: 'equipo-compacto', label: 'Equipo compacto', matches: tactic => tacticNumber(tactic.compacidad) >= 8 },
];

const tacticFilterState = {
  query: '',
  team: null,
  formacion: '',
  temporada: '',
  entrenador: '',
  styles: new Set(),
  instructions: new Set(),
  onlyAdvanced: false,
  sort: 'recent',
};

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
  return `/tactics/${encodeURIComponent(id)}/`;
}

function requestedTacticId() {
  const params = new URLSearchParams(window.location.search);
  const queryId = params.get('id');
  if (queryId) return queryId;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if ((parts[0] || '').toLowerCase() === 'tactics' && parts[1]) {
    return decodeURIComponent(parts[1]);
  }
  return '';
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

function normalizeTacticSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function tacticInstructionBase(value) {
  return String(value || '').split(':')[0].trim();
}

function tacticAdvancedInstructions(tactic) {
  return [
    ['offense', tactic.ataque_avanzada_1],
    ['offense', tactic.ataque_avanzada_2],
    ['defense', tactic.defensa_avanzada_1],
    ['defense', tactic.defensa_avanzada_2],
  ].filter(([, value]) => String(value || '').trim()).map(([group, value]) => ({ group, value: tacticInstructionBase(value) }));
}

function tacticContinent(tactic) {
  return window.LAQPCountryFilter?.continentFor(tactic.pais_id) || 'other';
}

function prepareTacticFilterData(tactic) {
  tactic.filterData = {
    continent: tacticContinent(tactic),
    instructions: tacticAdvancedInstructions(tactic),
    derivedStyles: new Set(TACTIC_DERIVED_STYLE_RULES.filter(rule => rule.matches(tactic)).map(rule => rule.key)),
    search: normalizeTacticSearch([
      tactic.equipo, tactic.apodo, tactic.temporada, tactic.entrenador, tactic.pais,
      tacticFormation(tactic), tactic.descripcion, tactic.estilo, tactic.claves,
      ...tacticAdvancedInstructions(tactic).map(item => item.value),
    ].filter(Boolean).join(' ')),
  };
  return tactic;
}

function tacticMatchesFilters(tactic, state = tacticFilterState) {
  const query = normalizeTacticSearch(state.query);
  if (query && !tactic.filterData.search.includes(query)) return false;
  if (state.team) {
    const { type, value } = state.team;
    if (type === 'continent' && tactic.filterData.continent !== value) return false;
    if (type === 'country' && tactic.pais !== value) return false;
    if (type === 'team' && tactic.equipo !== value) return false;
  }
  if (state.formacion && tacticFormation(tactic) !== state.formacion) return false;
  if (state.temporada && tactic.temporada !== state.temporada) return false;
  if (state.entrenador && tactic.entrenador !== state.entrenador) return false;
  if (state.onlyAdvanced && !tactic.filterData.instructions.length) return false;
  if (![...state.styles].every(token => {
    if (token.startsWith('derived:')) return tactic.filterData.derivedStyles.has(token.slice(8));
    const [, field, ...valueParts] = token.split(':');
    return tactic[field] === valueParts.join(':');
  })) return false;
  const instructions = new Set(tactic.filterData.instructions.map(item => `${item.group}:${item.value}`));
  return [...state.instructions].every(token => instructions.has(token));
}

function uniqueFilterValues(getter, sorter) {
  const values = [...new Set(historicalTactics.map(getter).filter(Boolean))];
  return values.sort(sorter || ((a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base', numeric: true })));
}

function renderSingleFilter(definition) {
  const values = uniqueFilterValues(definition.value, definition.sort);
  if (!values.length) return '';
  return `
    <div class="history-filter-popover" data-filter-popover="${definition.key}">
      <button class="history-filter-trigger" type="button" aria-expanded="false"><span>${definition.label}</span><b data-filter-count="${definition.key}"></b><i aria-hidden="true">⌄</i></button>
      <div class="history-filter-menu history-filter-options" hidden>
        <button type="button" data-filter-single="${definition.key}" data-value="">Todas</button>
        ${values.map(value => `<button type="button" data-filter-single="${definition.key}" data-value="${tacticsEscape(value)}">${tacticsEscape(value)}</button>`).join('')}
      </div>
    </div>`;
}

function teamTaxonomy() {
  const continents = new Map();
  historicalTactics.forEach(tactic => {
    const continent = tactic.filterData.continent;
    if (!continents.has(continent)) continents.set(continent, new Map());
    const countries = continents.get(continent);
    const country = tactic.pais || 'Sin país';
    if (!countries.has(country)) countries.set(country, new Set());
    countries.get(country).add(tactic.equipo);
  });
  return continents;
}

function renderTeamFilter() {
  const taxonomy = teamTaxonomy();
  const continentOrder = window.LAQPCountryFilter?.continentOrder || [...taxonomy.keys()];
  const allTeams = uniqueFilterValues(tactic => tactic.equipo);
  return `
    <div class="history-filter-popover history-team-filter" data-filter-popover="team">
      <button class="history-filter-trigger" type="button" aria-expanded="false"><span>Equipo</span><b data-filter-count="team"></b><i aria-hidden="true">⌄</i></button>
      <div class="history-filter-menu history-team-menu" hidden>
        <label class="history-team-search"><span class="sr-only">Buscar equipo</span><input type="search" data-team-search placeholder="Buscar equipo..." autocomplete="off"></label>
        <button class="history-team-all" type="button" data-team-type="" data-value="" data-label="Todos los equipos">Todos los equipos</button>
        <div class="history-team-tree">
          ${continentOrder.filter(key => taxonomy.has(key)).map(continent => {
            const countries = taxonomy.get(continent);
            const continentLabel = window.LAQPCountryFilter?.continentLabel?.(continent, 'es') || TACTIC_CONTINENT_FALLBACK_LABELS[continent] || TACTIC_CONTINENT_FALLBACK_LABELS.other;
            return `<details class="history-team-continent"><summary>${tacticsEscape(continentLabel)}<small>${[...countries.values()].reduce((sum, teams) => sum + teams.size, 0)}</small></summary>
              <button type="button" data-team-type="continent" data-value="${continent}" data-label="${tacticsEscape(continentLabel)}">Todo ${tacticsEscape(continentLabel)}</button>
              ${[...countries.entries()].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([country, teams]) => `<details class="history-team-country"><summary>${tacticsEscape(country)}<small>${teams.size}</small></summary>
                <button type="button" data-team-type="country" data-value="${tacticsEscape(country)}" data-label="${tacticsEscape(country)}">Todo ${tacticsEscape(country)}</button>
                ${[...teams].sort((a, b) => a.localeCompare(b, 'es')).map(team => `<button type="button" data-team-type="team" data-value="${tacticsEscape(team)}" data-label="${tacticsEscape(team)}">${tacticsEscape(team)}</button>`).join('')}
              </details>`).join('')}
            </details>`;
          }).join('')}
        </div>
        <div class="history-team-results" hidden>
          ${allTeams.map(team => {
            const tactic = historicalTactics.find(item => item.equipo === team);
            return `<button type="button" data-team-type="team" data-value="${tacticsEscape(team)}" data-label="${tacticsEscape(team)}"><strong>${tacticsEscape(team)}</strong><small>${tacticsEscape(tactic?.pais || '')}</small></button>`;
          }).join('')}
          <p hidden>No se encontraron equipos.</p>
        </div>
      </div>
    </div>`;
}

function styleToken(field, value) {
  return `technical:${field}:${value}`;
}

function renderStyleFilter() {
  const derived = TACTIC_DERIVED_STYLE_RULES.filter(rule => historicalTactics.some(tactic => tactic.filterData.derivedStyles.has(rule.key)));
  return `
    <div class="history-filter-popover" data-filter-popover="styles">
      <button class="history-filter-trigger" type="button" aria-expanded="false"><span>Estilo</span><b data-filter-count="styles"></b><i aria-hidden="true">⌄</i></button>
      <div class="history-filter-menu history-filter-sections" hidden>
        <section><h3>Lectura rápida</h3>${derived.map(rule => `<label><input type="checkbox" data-style-token="derived:${rule.key}" data-label="${tacticsEscape(rule.label)}"><span>${tacticsEscape(rule.label)}</span></label>`).join('')}</section>
        ${TACTIC_TECHNICAL_FILTERS.map(field => {
          const values = uniqueFilterValues(tactic => tactic[field.key]);
          if (!values.length) return '';
          return `<section><h3>${tacticsEscape(field.label)}</h3>${values.map(value => `<label><input type="checkbox" data-style-token="${tacticsEscape(styleToken(field.key, value))}" data-label="${tacticsEscape(value)}"><span>${tacticsEscape(value)}</span></label>`).join('')}</section>`;
        }).join('')}
      </div>
    </div>`;
}

function renderInstructionsFilter() {
  const instructionValues = group => [...new Set(historicalTactics.flatMap(tactic => tactic.filterData.instructions.filter(item => item.group === group).map(item => item.value)))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const valuesByGroup = { offense: instructionValues('offense'), defense: instructionValues('defense') };
  return `
    <div class="history-filter-popover" data-filter-popover="instructions">
      <button class="history-filter-trigger" type="button" aria-expanded="false"><span>Instrucciones</span><b data-filter-count="instructions"></b><i aria-hidden="true">⌄</i></button>
      <div class="history-filter-menu history-filter-sections" hidden>
        <label class="history-filter-only"><input type="checkbox" data-only-advanced><span>Solo tácticas con instrucciones avanzadas</span></label>
        ${[['offense', 'Ofensivas'], ['defense', 'Defensivas']].map(([group, label]) => `<section><h3>${label}</h3>${valuesByGroup[group].map(value => `<label><input type="checkbox" data-instruction-token="${group}:${tacticsEscape(value)}" data-label="${tacticsEscape(value)}"><span>${tacticsEscape(value)}</span></label>`).join('')}</section>`).join('')}
      </div>
    </div>`;
}

function renderTacticSearchTools() {
  return `
    <section class="history-search-panel" aria-label="Buscador y filtros de tácticas">
      <div class="history-search-row">
        <label class="history-main-search"><span class="sr-only">Buscar táctica</span><input id="history-tactic-search" type="search" placeholder="Buscar táctica, equipo, entrenador..." autocomplete="off"><i aria-hidden="true">⌕</i></label>
        <button id="history-mobile-filter-toggle" class="history-mobile-filter-toggle" type="button" aria-expanded="false"><span>Filtros</span><b id="history-mobile-filter-count"></b></button>
        <label class="history-sort"><span>Ordenar por</span><select id="history-tactic-sort"><option value="recent">Más recientes</option><option value="team">Equipo A-Z</option><option value="formation">Formación</option></select></label>
      </div>
      <div id="history-filter-panel" class="history-filter-bar">
        <div class="history-mobile-filter-head"><strong>Filtrar tácticas</strong><button type="button" data-close-filters aria-label="Cerrar filtros">×</button></div>
        ${renderTeamFilter()}
        ${renderSingleFilter(TACTIC_FILTER_DEFINITIONS[0])}
        ${renderStyleFilter()}
        ${renderInstructionsFilter()}
        ${renderSingleFilter(TACTIC_FILTER_DEFINITIONS[1])}
        ${renderSingleFilter(TACTIC_FILTER_DEFINITIONS[2])}
        <button id="clear-tactic-filters" class="history-clear-button" type="button">Limpiar</button>
        <button class="history-apply-mobile" type="button" data-close-filters>Ver resultados</button>
      </div>
      <div class="history-active-filters"><span>Filtros activos:</span><div id="history-active-filter-list"></div></div>
    </section>`;
}

async function ensureTacticPlayers(tactics) {
  await Promise.all(tactics.map(async tactic => {
    if (tactic.playersLoaded) return;
    tactic.players = await loadTacticPlayers(tactic);
    tactic.playersLoaded = true;
  }));
}

async function renderVisibleTactics() {
  const revision = ++tacticsRenderRevision;
  const list = document.querySelector('#history-tactics-list');
  const status = document.querySelector('#history-tactics-status');
  const loadMore = document.querySelector('#history-load-more');
  if (!list) return;

  const visible = filteredTactics.slice(0, visibleTacticsCount);
  await ensureTacticPlayers(visible);
  if (revision !== tacticsRenderRevision) return;
  list.innerHTML = visible.length
    ? visible.map(renderTacticCard).join('')
    : '<div class="history-empty-state">No hay tácticas que coincidan con esos filtros.</div>';

  if (status) {
    status.textContent = filteredTactics.length
      ? `${filteredTactics.length} ${filteredTactics.length === 1 ? 'táctica encontrada' : 'tácticas encontradas'}`
      : '0 tácticas encontradas';
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
  filteredTactics = historicalTactics
    .filter(tactic => tacticMatchesFilters(tactic));
  const comparators = {
    recent: compareTacticsBySeason,
    team: (a, b) => String(a.equipo).localeCompare(String(b.equipo), 'es', { sensitivity: 'base' }) || compareTacticsBySeason(a, b),
    formation: (a, b) => tacticFormation(a).localeCompare(tacticFormation(b), 'es', { numeric: true }) || String(a.equipo).localeCompare(String(b.equipo), 'es'),
  };
  filteredTactics.sort(comparators[tacticFilterState.sort] || comparators.recent);
  if (resetCount) visibleTacticsCount = TACTICS_PAGE_SIZE;
  syncTacticFilterUI();
  renderVisibleTactics();
}

function activeTacticFilters() {
  const filters = [];
  if (tacticFilterState.team) filters.push({ kind: 'team', label: tacticFilterState.team.label });
  TACTIC_FILTER_DEFINITIONS.forEach(definition => {
    if (tacticFilterState[definition.key]) filters.push({ kind: definition.key, label: tacticFilterState[definition.key] });
  });
  tacticFilterState.styles.forEach(token => {
    const input = document.querySelector(`[data-style-token="${CSS.escape(token)}"]`);
    filters.push({ kind: 'style', value: token, label: input?.dataset.label || token });
  });
  tacticFilterState.instructions.forEach(token => {
    const input = document.querySelector(`[data-instruction-token="${CSS.escape(token)}"]`);
    filters.push({ kind: 'instruction', value: token, label: input?.dataset.label || token });
  });
  if (tacticFilterState.onlyAdvanced) filters.push({ kind: 'advanced', label: 'Con instrucciones avanzadas' });
  return filters;
}

function syncTacticFilterUI() {
  const active = activeTacticFilters();
  const list = document.querySelector('#history-active-filter-list');
  if (list) list.innerHTML = active.map(item => `<button type="button" data-remove-filter="${tacticsEscape(item.kind)}"${item.value ? ` data-value="${tacticsEscape(item.value)}"` : ''}>${tacticsEscape(item.label)}<span aria-hidden="true">×</span></button>`).join('');
  document.querySelector('.history-active-filters')?.classList.toggle('has-filters', active.length > 0);
  document.querySelector('#clear-tactic-filters')?.toggleAttribute('disabled', !active.length && !tacticFilterState.query);
  const mobileCount = document.querySelector('#history-mobile-filter-count');
  if (mobileCount) mobileCount.textContent = active.length ? String(active.length) : '';

  document.querySelectorAll('[data-filter-count]').forEach(element => {
    const key = element.dataset.filterCount;
    let count = 0;
    if (key === 'team') count = tacticFilterState.team ? 1 : 0;
    else if (key === 'styles') count = tacticFilterState.styles.size;
    else if (key === 'instructions') count = tacticFilterState.instructions.size + Number(tacticFilterState.onlyAdvanced);
    else count = tacticFilterState[key] ? 1 : 0;
    element.textContent = count ? String(count) : '';
    element.closest('.history-filter-trigger')?.classList.toggle('has-selection', count > 0);
  });
  document.querySelectorAll('[data-filter-single]').forEach(button => button.classList.toggle('is-selected', tacticFilterState[button.dataset.filterSingle] === button.dataset.value));
  document.querySelectorAll('[data-team-type]').forEach(button => button.classList.toggle('is-selected', !!tacticFilterState.team && tacticFilterState.team.type === button.dataset.teamType && tacticFilterState.team.value === button.dataset.value));
  document.querySelectorAll('[data-style-token]').forEach(input => { input.checked = tacticFilterState.styles.has(input.dataset.styleToken); });
  document.querySelectorAll('[data-instruction-token]').forEach(input => { input.checked = tacticFilterState.instructions.has(input.dataset.instructionToken); });
  const onlyAdvanced = document.querySelector('[data-only-advanced]');
  if (onlyAdvanced) onlyAdvanced.checked = tacticFilterState.onlyAdvanced;
  const popular = document.querySelector('#history-popular-section');
  if (popular) popular.hidden = Boolean(active.length || tacticFilterState.query);
}

function closeTacticMenus(except) {
  document.querySelectorAll('.history-filter-popover.is-open').forEach(popover => {
    if (popover === except) return;
    popover.classList.remove('is-open');
    popover.querySelector('.history-filter-trigger')?.setAttribute('aria-expanded', 'false');
    const menu = popover.querySelector('.history-filter-menu');
    if (menu) menu.hidden = true;
  });
}

function closeMobileFilters() {
  const panel = document.querySelector('#history-filter-panel');
  panel?.classList.remove('is-mobile-open');
  document.body.classList.remove('history-filters-open');
  document.querySelector('#history-mobile-filter-toggle')?.setAttribute('aria-expanded', 'false');
}

function resetTeamSearch() {
  const search = document.querySelector('[data-team-search]');
  const menu = search?.closest('.history-team-menu');
  if (search) search.value = '';
  if (!menu) return;
  const tree = menu.querySelector('.history-team-tree');
  const results = menu.querySelector('.history-team-results');
  if (tree) tree.hidden = false;
  if (results) results.hidden = true;
  results?.querySelectorAll('button').forEach(button => { button.hidden = false; });
  const empty = results?.querySelector('p');
  if (empty) empty.hidden = true;
}

function clearTacticFilters() {
  tacticFilterState.query = '';
  tacticFilterState.team = null;
  tacticFilterState.formacion = '';
  tacticFilterState.temporada = '';
  tacticFilterState.entrenador = '';
  tacticFilterState.styles.clear();
  tacticFilterState.instructions.clear();
  tacticFilterState.onlyAdvanced = false;
  const search = document.querySelector('#history-tactic-search');
  if (search) search.value = '';
  resetTeamSearch();
  applyTacticFilters();
}

function removeTacticFilter(kind, value) {
  if (kind === 'team') tacticFilterState.team = null;
  else if (kind === 'style') tacticFilterState.styles.delete(value);
  else if (kind === 'instruction') tacticFilterState.instructions.delete(value);
  else if (kind === 'advanced') tacticFilterState.onlyAdvanced = false;
  else if (Object.hasOwn(tacticFilterState, kind)) tacticFilterState[kind] = '';
  applyTacticFilters();
}

function bindTacticFilters() {
  const searchPanel = document.querySelector('.history-search-panel');
  if (!searchPanel) return;
  searchPanel.addEventListener('click', event => {
    const trigger = event.target.closest('.history-filter-trigger');
    if (trigger) {
      const popover = trigger.closest('.history-filter-popover');
      const opening = !popover.classList.contains('is-open');
      closeTacticMenus(popover);
      popover.classList.toggle('is-open', opening);
      trigger.setAttribute('aria-expanded', String(opening));
      popover.querySelector('.history-filter-menu').hidden = !opening;
      if (opening) popover.querySelector('input[type="search"]')?.focus();
      return;
    }
    const team = event.target.closest('[data-team-type]');
    if (team) {
      tacticFilterState.team = team.dataset.value ? { type: team.dataset.teamType, value: team.dataset.value, label: team.dataset.label } : null;
      resetTeamSearch();
      closeTacticMenus();
      applyTacticFilters();
      return;
    }
    const single = event.target.closest('[data-filter-single]');
    if (single) {
      tacticFilterState[single.dataset.filterSingle] = single.dataset.value;
      closeTacticMenus();
      applyTacticFilters();
      return;
    }
    const remove = event.target.closest('[data-remove-filter]');
    if (remove) { removeTacticFilter(remove.dataset.removeFilter, remove.dataset.value || ''); return; }
    if (event.target.closest('#clear-tactic-filters')) { clearTacticFilters(); return; }
    if (event.target.closest('#history-mobile-filter-toggle')) {
      const panel = document.querySelector('#history-filter-panel');
      const open = !panel.classList.contains('is-mobile-open');
      panel.classList.toggle('is-mobile-open', open);
      document.body.classList.toggle('history-filters-open', open);
      document.querySelector('#history-mobile-filter-toggle').setAttribute('aria-expanded', String(open));
      return;
    }
    if (event.target.closest('[data-close-filters]')) closeMobileFilters();
  });
  searchPanel.addEventListener('input', event => {
    if (event.target.matches('#history-tactic-search')) {
      tacticFilterState.query = event.target.value;
      applyTacticFilters();
      return;
    }
    if (event.target.matches('[data-team-search]')) {
      const query = normalizeTacticSearch(event.target.value);
      const menu = event.target.closest('.history-team-menu');
      menu.querySelector('.history-team-tree').hidden = Boolean(query);
      const results = menu.querySelector('.history-team-results');
      results.hidden = !query;
      let matches = 0;
      results.querySelectorAll('button').forEach(button => {
        button.hidden = !normalizeTacticSearch(button.dataset.value).includes(query);
        if (!button.hidden) matches += 1;
      });
      results.querySelector('p').hidden = matches > 0;
    }
  });
  searchPanel.addEventListener('change', event => {
    if (event.target.matches('#history-tactic-sort')) {
      tacticFilterState.sort = event.target.value;
      applyTacticFilters(false);
    } else if (event.target.matches('[data-style-token]')) {
      tacticFilterState.styles[event.target.checked ? 'add' : 'delete'](event.target.dataset.styleToken);
      applyTacticFilters();
    } else if (event.target.matches('[data-instruction-token]')) {
      tacticFilterState.instructions[event.target.checked ? 'add' : 'delete'](event.target.dataset.instructionToken);
      applyTacticFilters();
    } else if (event.target.matches('[data-only-advanced]')) {
      tacticFilterState.onlyAdvanced = event.target.checked;
      applyTacticFilters();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.history-filter-popover')) closeTacticMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeTacticMenus(); closeMobileFilters(); }
  });
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

    ${renderTacticSearchTools()}

    <div id="history-popular-section">
      <div class="history-list-heading">
        <div>
          <span class="history-kicker">Más vistas</span>
          <h2>Tácticas populares</h2>
        </div>
      </div>
      <section id="history-popular-tactics-list" class="history-tactics-list history-popular-tactics-list" aria-label="Tácticas populares"></section>
    </div>

    <div class="history-list-heading">
      <div>
        <span class="history-kicker">Catálogo completo</span>
        <h2>Resultados</h2>
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

  bindTacticFilters();
  document.querySelector('#history-load-more')?.addEventListener('click', () => {
    visibleTacticsCount += TACTICS_PAGE_SIZE;
    renderVisibleTactics();
  });
  await renderPopularTactics();
  applyTacticFilters();
}

function renderTacticDetail(tactic) {
  const target = document.querySelector('#tactics-content');
  // El generador resuelve la identidad estable del DT. Conservarla durante la
  // hidratación evita degradar el enlace prerenderizado a texto plano.
  const managerUrl = target.dataset.laqpManagerUrl || '';
  const managerMarkup = tactic.entrenador
    ? ` · ${managerUrl
      ? `<a class="history-manager-link" href="${tacticsEscape(managerUrl)}">${tacticsEscape(tactic.entrenador)}</a>`
      : tacticsEscape(tactic.entrenador)}`
    : '';
  const keys = tacticsList(tactic.claves);
  const related = historicalTactics.filter(item => item.id !== tactic.id).sort(compareTacticsBySeason).slice(0, 3);
  const relatedMarkup = related.length ? `
    <section class="history-related">
      <div class="history-list-heading">
        <div><span class="history-kicker">Seguí explorando</span><h2>Otras tácticas</h2></div>
        <a href="tactics.html">Ver todas</a>
      </div>
      <div class="history-related-grid">
        ${related.map(item => `<a href="${tacticsUrl(item.id)}">${tacticImage(item.escudo, item.equipo, 'history-related-badge', TACTICS_FALLBACK_BADGE)}<span><strong>${tacticsEscape(item.equipo)}</strong><small>${tacticsEscape(item.temporada)} · ${tacticsEscape(tacticFormation(item))}</small></span></a>`).join('')}
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
          <span class="history-kicker">${tacticsEscape(tactic.temporada)} · ${tacticsEscape(tactic.pais || tactic.region)}${managerMarkup}</span>
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
    const [response, metadataResponse] = await Promise.all([
      fetch(TACTICS_CSV_PATH),
      fetch(TACTICS_METADATA_PATH).catch(() => null),
    ]);
    if (!response.ok) throw new Error('No se pudieron cargar las tácticas.');
    const metadataRows = metadataResponse?.ok ? parseTacticsCSV(await metadataResponse.text()) : [];
    const metadataById = new Map(metadataRows.filter(item => item.id).map(item => [item.id, item]));
    historicalTactics = parseTacticsCSV(await response.text())
      .filter(tactic => tactic.id)
      .map(tactic => ({ ...tactic, ...(metadataById.get(tactic.id) || {}) }))
      .sort(compareTacticsBySeason)
      .map(prepareTacticFilterData);
    const requestedId = requestedTacticId();
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
