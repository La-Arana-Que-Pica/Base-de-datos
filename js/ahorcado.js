/* Ahorcado Futbolero — interfaz. Las reglas viven en js/ahorcado-core.js. */
(function () {
  'use strict';
  const core = window.LAQPHangman;
  const entertainment = window.LAQPEntertainmentStore;
  const STORAGE_KEY = 'laqp-ahorcado-v1';
  const RESUME_KEY = 'laqp-ahorcado-resume-v1';
  const RECENT_LIMIT = 120;
  const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const SCOPE_LABELS = { league: 'Elegí una liga', country: 'Elegí un país', club: 'Elegí un club' };
  const KIND_LABELS = { surname: 'Apellido', mononym: 'Nombre futbolístico', footballName: 'Nombre futbolístico' };

  const $ = selector => document.querySelector(selector);
  const fmt = new Intl.NumberFormat('es-AR');
  let db = null;
  let saved = loadSaved();
  let match = null;
  let options = { leagues: [], countries: [], clubs: [] };

  /* ── Persistencia local ─────────────────────────────────────────── */

  function emptyStats() {
    return { matches: 0, roundsWon: 0, roundsLost: 0, bestScore: 0, bestStreak: 0, difficultyCounts: {} };
  }

  function loadSaved() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (data && data.version === 1) return { stats: { ...emptyStats(), ...data.stats }, lastConfig: data.lastConfig || null, recent: Array.isArray(data.recent) ? data.recent : [], match: data.match || null, version: 1 };
    } catch { /* almacenamiento no disponible */ }
    return { version: 1, stats: emptyStats(), lastConfig: null, recent: [], match: null };
  }

  function persist() {
    saved.match = match && isActive(match) ? match : null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* sin almacenamiento */ }
    if (entertainment) {
      entertainment.writeResume(RESUME_KEY, saved.match
        ? { label: `Ronda ${saved.match.rounds.length} de ${core.ROUNDS_PER_MATCH} · ${fmt.format(saved.match.score)} pts`, href: '/ahorcado-futbolero.html#continuar' }
        : null);
    }
  }

  function isActive(value) {
    return Boolean(value && (value.status === 'playing' || value.status === 'complete'));
  }

  /* ── Datos ──────────────────────────────────────────────────────── */

  async function loadDatabase() {
    $('#hg-loading').hidden = false;
    $('#hg-load-error').hidden = true;
    try {
      const [indexResponse, shirtsResponse] = await Promise.all([
        fetch('/database/builder-player-index.json'),
        fetch('/database/ahorcado-camisetas.json').catch(() => null),
      ]);
      if (!indexResponse.ok) throw new Error(`HTTP ${indexResponse.status}`);
      const index = await indexResponse.json();
      const shirts = shirtsResponse && shirtsResponse.ok ? (await shirtsResponse.json()).shirts : {};
      db = core.prepareDatabase(index, shirts);
      window.LAQPHangmanExcluded = db.excluded; // diagnóstico: jugadores sin respuesta clara y su motivo
      buildOptions();
      $('#hg-loading').hidden = true;
      $('#hg-config').hidden = false;
      $('#hg-stats').hidden = false;
      return true;
    } catch (error) {
      console.warn('[Ahorcado] No se pudo cargar la base de futbolistas.', error);
      $('#hg-loading').hidden = true;
      $('#hg-load-error').hidden = false;
      return false;
    }
  }

  function buildOptions() {
    const collator = new Intl.Collator('es', { sensitivity: 'base' });
    const leagueCounts = new Map();
    const countryCounts = new Map();
    const clubCounts = new Map();
    db.players.forEach(player => {
      player.leagueIds.forEach(id => leagueCounts.set(id, (leagueCounts.get(id) || 0) + 1));
      if (core.countryName(player.countryId)) countryCounts.set(player.countryId, (countryCounts.get(player.countryId) || 0) + 1);
      if (player.clubId) clubCounts.set(player.clubId, (clubCounts.get(player.clubId) || 0) + 1);
    });
    const leagueName = new Map(db.leagues.map(league => [league.id, league.name]));
    options.leagues = db.leagues.filter(league => leagueCounts.get(league.id))
      .map(league => ({ value: league.id, label: league.name, count: leagueCounts.get(league.id) }))
      .sort((a, b) => collator.compare(a.label, b.label));
    options.countries = [...countryCounts].map(([id, count]) => ({ value: id, label: core.countryName(id), count }))
      .sort((a, b) => collator.compare(a.label, b.label));
    options.clubs = [...clubCounts].map(([id, count]) => {
      const team = db.teamsById.get(id);
      const group = (team.leagueIds || []).map(String).map(leagueId => leagueName.get(leagueId)).find(Boolean) || 'Otros clubes';
      return { value: id, label: core.titleCaseTeam(team.name), count, group };
    }).sort((a, b) => collator.compare(a.group, b.group) || collator.compare(a.label, b.label));
  }

  /* ── Configuración ──────────────────────────────────────────────── */

  function readConfig() {
    const form = $('#hg-config');
    const scope = form.elements.scope.value;
    const value = scope === 'global' ? '' : $('#hg-scope-select').value;
    return { filter: { type: scope, value }, difficulty: form.elements.difficulty.value, hardcore: $('#hg-hardcore').checked };
  }

  function filterLabel(filter) {
    if (!filter || filter.type === 'global') return 'Todos los jugadores';
    const list = filter.type === 'league' ? options.leagues : filter.type === 'country' ? options.countries : options.clubs;
    const found = list.find(option => option.value === filter.value);
    return found ? found.label : '—';
  }

  function configLabel(config) {
    return `${filterLabel(config.filter)} · ${core.DIFFICULTIES[config.difficulty].label}${config.hardcore ? ' · Hardcore' : ''}`;
  }

  function fillScopeSelect(type, selected) {
    const wrap = $('#hg-scope-select-wrap');
    const select = $('#hg-scope-select');
    if (type === 'global') { wrap.hidden = true; return; }
    wrap.hidden = false;
    $('#hg-scope-select-label').textContent = SCOPE_LABELS[type];
    const list = type === 'league' ? options.leagues : type === 'country' ? options.countries : options.clubs;
    const option = item => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)} (${fmt.format(item.count)})</option>`;
    if (type === 'club') {
      const groups = new Map();
      list.forEach(item => { if (!groups.has(item.group)) groups.set(item.group, []); groups.get(item.group).push(item); });
      select.innerHTML = [...groups].map(([group, items]) => `<optgroup label="${escapeHtml(group)}">${items.map(option).join('')}</optgroup>`).join('');
    } else {
      select.innerHTML = list.map(option).join('');
    }
    const fallback = type === 'league' ? (list.find(item => item.value === '144') || list[0]) : type === 'country' ? (list.find(item => item.value === '144') || list[0]) : list[0];
    select.value = list.some(item => item.value === selected) ? selected : fallback ? fallback.value : '';
  }

  function applyConfig(config) {
    const form = $('#hg-config');
    const type = config && config.filter && ['global', 'league', 'country', 'club'].includes(config.filter.type) ? config.filter.type : 'global';
    form.elements.scope.value = type;
    fillScopeSelect(type, config && config.filter && config.filter.value);
    form.elements.difficulty.value = config && core.DIFFICULTIES[config.difficulty] ? config.difficulty : 'easy';
    $('#hg-hardcore').checked = Boolean(config && config.hardcore);
    updateAvailability();
  }

  function updateAvailability() {
    if (!db) return;
    const config = readConfig();
    const { poolSize, counts } = core.availability(db, config.filter);
    document.querySelectorAll('[data-count]').forEach(node => {
      const count = counts[node.dataset.count];
      node.textContent = `${fmt.format(count)} ${count === 1 ? 'jugador' : 'jugadores'}`;
    });
    const eligible = counts[config.difficulty];
    $('#hg-summary').innerHTML = `<strong>${fmt.format(eligible)}</strong> ${eligible === 1 ? 'jugador elegible' : 'jugadores elegibles'} en ${core.DIFFICULTIES[config.difficulty].label} · ${fmt.format(poolSize)} en total en ${escapeHtml(filterLabel(config.filter))}`;
    const warning = $('#hg-warning');
    const actions = [];
    let text = '';
    if (eligible < core.MIN_POOL_TO_PLAY) {
      text = `Con este filtro hay sólo ${eligible} ${eligible === 1 ? 'jugador' : 'jugadores'} en ${core.DIFFICULTIES[config.difficulty].label}: no alcanza para ${core.ROUNDS_PER_MATCH} rondas distintas.`;
    } else if (eligible < core.SMALL_POOL_WARNING) {
      text = `Pocos candidatos (${eligible}): probablemente reconozcas a varios. Los puntos se reducen según la amplitud del filtro.`;
    }
    if (text) {
      if (config.difficulty !== 'impossible' && counts.impossible >= core.MIN_POOL_TO_PLAY) actions.push('<button type="button" class="hg-btn is-ghost is-small" data-widen="difficulty">Subir a Imposible</button>');
      if (config.filter.type !== 'global') actions.push('<button type="button" class="hg-btn is-ghost is-small" data-widen="global">Usar todos los jugadores</button>');
    }
    warning.hidden = !text;
    $('#hg-warning-text').textContent = text;
    $('#hg-warning-actions').innerHTML = actions.join('');
    $('#hg-start').disabled = eligible < core.MIN_POOL_TO_PLAY;
  }

  /* ── Estadísticas ───────────────────────────────────────────────── */

  function renderStats() {
    const stats = saved.stats;
    const counts = stats.difficultyCounts || {};
    const preferred = core.DIFFICULTY_ORDER.filter(key => counts[key]).sort((a, b) => counts[b] - counts[a])[0];
    const values = {
      matches: fmt.format(stats.matches), roundsWon: fmt.format(stats.roundsWon), roundsLost: fmt.format(stats.roundsLost),
      bestScore: fmt.format(stats.bestScore), bestStreak: fmt.format(stats.bestStreak), preferred: preferred ? core.DIFFICULTIES[preferred].label : '—',
    };
    document.querySelectorAll('[data-stat]').forEach(node => { node.textContent = values[node.dataset.stat]; });
  }

  /* ── Partida ────────────────────────────────────────────────────── */

  function show(section) {
    const changed = $(section).hidden;
    ['#hg-setup', '#hg-play', '#hg-final'].forEach(id => { $(id).hidden = id !== section; });
    document.body.dataset.screen = section.slice(4);
    // Al cambiar de pantalla, el juego arranca arriba: en celulares el dibujo y el apellido quedan a la vista.
    if (changed) window.scrollTo(0, 0);
  }

  function startMatch(config) {
    const { candidates, poolSize } = core.eligibleFor(db, config.filter, config.difficulty);
    if (candidates.length < core.MIN_POOL_TO_PLAY) return;
    saved.lastConfig = config;
    match = {
      version: 1,
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      config,
      databaseVersion: db.databaseVersion,
      poolSize,
      eligibleCount: candidates.length,
      startedAt: new Date().toISOString(),
      rounds: [],
      score: 0, won: 0, lost: 0, streak: 0, bestStreak: 0, wrongTotal: 0,
      status: 'playing',
    };
    nextRound();
  }

  function nextRound() {
    const { candidates } = core.eligibleFor(db, match.config.filter, match.config.difficulty);
    const used = new Set(match.rounds.map(round => round.playerId));
    const usedKeys = new Set(match.rounds.map(round => core.letterKey(round.answer)));
    const entry = core.pickCandidate(candidates, { exclude: used, excludeKeys: usedKeys, recent: new Set(saved.recent) });
    const round = core.createRound(entry, { hardcore: match.config.hardcore, filterType: match.config.filter.type });
    match.rounds.push(round);
    saved.recent = [entry.player.id, ...saved.recent.filter(id => id !== entry.player.id)].slice(0, RECENT_LIMIT);
    persist();
    renderPlay();
  }

  function currentRound() {
    return match && match.rounds[match.rounds.length - 1];
  }

  function playerById(id) {
    return db && db.players.find(player => player.id === id);
  }

  function guess(letter) {
    const round = currentRound();
    if (!round || round.status !== 'playing' || !$('#hg-result').hidden) return;
    const outcome = core.applyGuess(round, letter);
    if (outcome === 'invalid' || outcome === 'over') return;
    const upper = core.baseLetter(letter);
    if (outcome === 'repeat') { announce(`Ya probaste la ${upper}`); flashKey(upper); return; }
    if (outcome === 'miss') {
      announce(`No hay ${upper}. Errores ${round.wrong.length} de ${core.MAX_ERRORS}`);
      const stage = $('#hg-stage');
      stage.classList.remove('is-shake'); void stage.offsetWidth; stage.classList.add('is-shake');
    } else {
      announce(`¡La ${upper} está!`);
    }
    if (round.status !== 'playing') finishRound(round);
    else persist();
    renderPlay(upper);
  }

  function finishRound(round) {
    const won = round.status === 'won';
    const result = core.scoreRound({
      won, difficulty: match.config.difficulty, percentile: round.percentile,
      errors: round.wrong.length, eligibleCount: match.eligibleCount, hardcore: match.config.hardcore,
    });
    round.score = result.total;
    round.breakdown = result.breakdown;
    match.score += result.total;
    match.wrongTotal += round.wrong.length;
    if (won) { match.won += 1; match.streak += 1; match.bestStreak = Math.max(match.bestStreak, match.streak); saved.stats.roundsWon += 1; }
    else { match.lost += 1; match.streak = 0; saved.stats.roundsLost += 1; }
    saved.stats.bestStreak = Math.max(saved.stats.bestStreak, match.bestStreak);
    if (match.rounds.length >= core.ROUNDS_PER_MATCH) match.status = 'complete';
    persist();
  }

  function finishMatch() {
    const stats = saved.stats;
    const record = match.score > stats.bestScore;
    stats.matches += 1;
    stats.bestScore = Math.max(stats.bestScore, match.score);
    stats.difficultyCounts[match.config.difficulty] = (stats.difficultyCounts[match.config.difficulty] || 0) + 1;
    match.status = 'finished';
    match.finishedAt = new Date().toISOString();
    persist();
    renderFinal(record);
    show('#hg-final');
    $('#hg-final-title').focus({ preventScroll: true });
  }

  /* ── Renderizado de la partida ──────────────────────────────────── */

  function renderPlay(lastLetter) {
    const round = currentRound();
    if (!round) return;
    show('#hg-play');
    const errors = round.wrong.length;
    $('#hg-round').textContent = `${match.rounds.length}/${core.ROUNDS_PER_MATCH}`;
    $('#hg-score').textContent = fmt.format(match.score);
    $('#hg-wins').textContent = fmt.format(match.won);
    $('#hg-streak').textContent = fmt.format(match.streak);
    $('#hg-config-label').textContent = configLabel(match.config);

    const stage = $('#hg-stage');
    const visibleParts = round.status === 'lost' ? core.MAX_ERRORS : errors;
    stage.querySelectorAll('.hg-part').forEach(part => part.classList.toggle('is-on', Number(part.dataset.part) <= visibleParts));
    stage.classList.toggle('is-won', round.status === 'won');
    stage.classList.toggle('is-lost', round.status === 'lost');
    stage.querySelector('title').textContent = `Futbolista: ${Math.min(visibleParts, 6)} de 6 partes`;
    $('#hg-lives').innerHTML = Array.from({ length: core.MAX_ERRORS }, (_, i) => `<span class="${i < errors ? 'is-used' : ''}"></span>`).join('');
    $('#hg-errors').textContent = round.status === 'lost'
      ? `Errores ${errors}/${core.MAX_ERRORS} · Ronda perdida`
      : `Errores ${errors}/${core.MAX_ERRORS} · Te ${core.MAX_ERRORS - errors === 1 ? 'queda' : 'quedan'} ${core.MAX_ERRORS - errors}`;

    $('#hg-answer-kind').textContent = KIND_LABELS[round.answerKind] || 'Apellido';
    const guessed = new Set(round.guesses);
    const reveal = round.status !== 'playing';
    const words = [];
    let current = [];
    round.cells.forEach(cell => {
      if (cell.type === 'space') { words.push(current); current = []; return; }
      current.push(cell);
    });
    words.push(current);
    let letterCount = 0;
    $('#hg-word').innerHTML = words.map(word => `<span class="hg-word-group">${word.map(cell => {
      if (cell.type === 'punct') return `<span class="hg-tile is-punct">${escapeHtml(cell.char)}</span>`;
      letterCount += 1;
      const known = guessed.has(cell.letter);
      const shown = known || reveal;
      const fresh = known && cell.letter === lastLetter;
      return `<span class="hg-tile${shown ? ' is-shown' : ''}${!known && reveal ? ' is-missed' : ''}${fresh ? ' is-fresh' : ''}">${shown ? escapeHtml(cell.char.toUpperCase()) : ''}</span>`;
    }).join('')}</span>`).join('');
    const spoken = round.cells.filter(cell => cell.type !== 'space').map(cell => cell.type === 'punct' ? cell.char : (guessed.has(cell.letter) || reveal ? cell.letter : 'vacía')).join(', ');
    $('#hg-word').setAttribute('aria-label', `${KIND_LABELS[round.answerKind] || 'Apellido'} de ${letterCount} letras: ${spoken}`);

    renderHints(round);
    renderKeyboard(round);
    renderResult(round);
  }

  function renderHints(round) {
    const host = $('#hg-hints');
    if (match.config.hardcore) {
      host.innerHTML = '<div class="hg-hint is-hardcore"><span>Hardcore</span><strong>Sin pistas</strong></div>';
      return;
    }
    const visible = new Set(core.visibleHints(round).map(hint => hint.key));
    host.innerHTML = round.hints.map(hint => visible.has(hint.key) || round.status === 'lost'
      ? `<div class="hg-hint is-open" data-hint="${hint.key}"><span>${escapeHtml(hint.label)}</span><strong>${escapeHtml(hint.value)}</strong></div>`
      : `<div class="hg-hint" data-hint="${hint.key}"><span>Pista ${hint.at === core.HINT_ERRORS[0] ? 1 : 2}</span><strong>Al ${hint.at}.º error</strong></div>`).join('');
  }

  function renderKeyboard(round) {
    const host = $('#hg-keyboard');
    if (!host.childElementCount) {
      host.innerHTML = KEY_ROWS.map(row => `<div class="hg-key-row">${[...row].map(letter => `<button type="button" class="hg-key" data-key="${letter}" aria-label="${letter}">${letter}</button>`).join('')}</div>`).join('');
    }
    const letters = new Set(round.cells.filter(cell => cell.type === 'letter').map(cell => cell.letter));
    host.querySelectorAll('.hg-key').forEach(key => {
      const letter = key.dataset.key;
      const used = round.guesses.includes(letter);
      key.classList.toggle('is-hit', used && letters.has(letter));
      key.classList.toggle('is-miss', used && !letters.has(letter));
      key.disabled = used || round.status !== 'playing';
      key.setAttribute('aria-label', used ? `${letter}, ${letters.has(letter) ? 'acertada' : 'fallada'}` : letter);
    });
  }

  function renderResult(round) {
    const panel = $('#hg-result');
    if (round.status === 'playing') { panel.hidden = true; return; }
    const player = playerById(round.playerId);
    const won = round.status === 'won';
    $('#hg-result-kicker').textContent = won ? (round.wrong.length === 0 ? '¡Perfecto, sin errores!' : '¡Golazo! Lo adivinaste') : 'Tarjeta roja · Ronda perdida';
    $('#hg-result-title').textContent = player ? player.name : round.answer;
    const meta = player ? [player.positionGroup, player.clubName || core.countryName(player.countryId), `Media ${player.overall}`].filter(Boolean).join(' · ') : '';
    $('#hg-result-meta').textContent = meta;
    const face = $('#hg-result-face');
    face.onerror = () => { face.onerror = null; face.src = '/img/players/default.webp'; };
    face.src = player && player.miniface ? `/${player.miniface.replace(/^\/+/, '')}` : '/img/players/default.webp';
    $('#hg-breakdown').innerHTML = (round.breakdown || []).map(item => `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></li>`).join('');
    $('#hg-result-points').textContent = `${round.score > 0 ? '+' : ''}${fmt.format(round.score || 0)}`;
    panel.classList.toggle('is-won', won);
    panel.classList.toggle('is-lost', !won);
    const last = match.rounds.length >= core.ROUNDS_PER_MATCH;
    $('#hg-next').innerHTML = last ? 'Ver resumen <span aria-hidden="true">→</span>' : 'Siguiente ronda <span aria-hidden="true">→</span>';
    const wasHidden = panel.hidden;
    panel.hidden = false;
    if (wasHidden) setTimeout(() => $('#hg-next').focus({ preventScroll: true }), 50);
  }

  function renderFinal(record) {
    $('#hg-final-points').textContent = fmt.format(match.score);
    $('#hg-final-record').hidden = !record || match.score <= 0;
    $('#hg-final-config').textContent = configLabel(match.config);
    $('#hg-final-won').textContent = `${match.won}/${core.ROUNDS_PER_MATCH}`;
    $('#hg-final-lost').textContent = fmt.format(match.lost);
    $('#hg-final-streak').textContent = fmt.format(match.bestStreak);
    $('#hg-final-errors').textContent = fmt.format(match.wrongTotal);
    $('#hg-final-rounds').innerHTML = match.rounds.map(round => {
      const player = playerById(round.playerId);
      const won = round.status === 'won';
      return `<li class="${won ? 'is-won' : 'is-lost'}"><span class="hg-final-mark" aria-label="${won ? 'Ganada' : 'Perdida'}">${won ? '✓' : '✕'}</span><span class="hg-final-name">${escapeHtml(player ? player.name : round.answer)}<small>${round.wrong.length} ${round.wrong.length === 1 ? 'error' : 'errores'}</small></span><strong>${won ? `+${fmt.format(round.score)}` : '0'}</strong></li>`;
    }).join('');
    renderStats();
  }

  /* ── Utilidades de interfaz ─────────────────────────────────────── */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function announce(text) { $('#hg-live').textContent = text; }

  function flashKey(letter) {
    const key = document.querySelector(`.hg-key[data-key="${letter}"]`);
    if (!key) return;
    key.classList.remove('is-flash'); void key.offsetWidth; key.classList.add('is-flash');
  }

  function backToSetup(focusSelector) {
    applyConfig(match ? match.config : saved.lastConfig);
    renderResume();
    renderStats();
    show('#hg-setup');
    const target = focusSelector && document.querySelector(focusSelector);
    if (target) { target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
  }

  function renderResume() {
    const active = isActive(saved.match) ? saved.match : null;
    $('#hg-resume').hidden = !active;
    if (!active) return;
    $('#hg-resume-label').textContent = `${configLabel(active.config)} · Ronda ${active.rounds.length} de ${core.ROUNDS_PER_MATCH} · ${fmt.format(active.score)} pts`;
    $('#hg-resume-progress').style.width = `${Math.round((active.rounds.length / core.ROUNDS_PER_MATCH) * 100)}%`;
  }

  function resumeMatch() {
    if (!saved.match) return;
    match = saved.match;
    renderPlay();
  }

  /* ── Eventos ────────────────────────────────────────────────────── */

  function bind() {
    const form = $('#hg-config');
    form.addEventListener('change', event => {
      if (event.target.name === 'scope') fillScopeSelect(event.target.value);
      updateAvailability();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const config = readConfig();
      if (isActive(saved.match) && !window.confirm('Tenés una partida en curso. ¿Empezar una nueva y descartarla?')) return;
      startMatch(config);
    });
    $('#hg-warning-actions').addEventListener('click', event => {
      const button = event.target.closest('[data-widen]');
      if (!button) return;
      if (button.dataset.widen === 'global') { form.elements.scope.value = 'global'; fillScopeSelect('global'); }
      else form.elements.difficulty.value = 'impossible';
      updateAvailability();
    });
    $('#hg-keyboard').addEventListener('click', event => {
      const key = event.target.closest('[data-key]');
      if (key) guess(key.dataset.key);
    });
    document.addEventListener('keydown', event => {
      if ($('#hg-play').hidden || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest && event.target.closest('input, select, textarea')) return;
      if (event.key === 'Enter' && !$('#hg-result').hidden) {
        if (document.activeElement !== $('#hg-next')) { event.preventDefault(); $('#hg-next').click(); }
        return;
      }
      if (event.key.length === 1 && core.baseLetter(event.key)) { event.preventDefault(); guess(event.key); }
    });
    $('#hg-next').addEventListener('click', () => {
      if (!match) return;
      if (match.rounds.length >= core.ROUNDS_PER_MATCH) finishMatch();
      else nextRound();
    });
    $('#hg-quit').addEventListener('click', () => {
      persist();
      backToSetup();
    });
    $('#hg-resume-btn').addEventListener('click', resumeMatch);
    $('#hg-again').addEventListener('click', () => startMatch(match.config));
    $('#hg-change-difficulty').addEventListener('click', () => backToSetup('#hg-config input[name="difficulty"]:checked'));
    $('#hg-change-filters').addEventListener('click', () => backToSetup('#hg-config input[name="scope"]:checked'));
    $('#hg-retry').addEventListener('click', () => init());
  }

  async function init() {
    if (!await loadDatabase()) return;
    applyConfig(saved.lastConfig);
    renderStats();
    renderResume();
    document.documentElement.dataset.hangmanReady = 'true';
    if (location.hash === '#continuar' && saved.match) resumeMatch();
  }

  function boot() {
    if (!core) return;
    if (entertainment) entertainment.recordVisit('ahorcado-futbolero');
    bind();
    init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
