'use strict';

(function initSquadBuilder(root) {
  const SCHEMA_VERSION = 4;
  const STORAGE_KEY = 'laqp_squad_builder_saves_v1';
  const DRAFT_KEY = 'laqp_squad_builder_draft_v1';
  const MAX_BENCH = 12;
  const SEARCH_LIMIT = 40;
  const CUSTOM_PLAYERS_KEY = 'laqp_squad_builder_custom_players_v1';
  const UI_KEY = 'laqp_squad_builder_ui_v1';
  const CUSTOM_DB = 'laqp_squad_builder_assets_v1';

  function positionFamily(position) {
    if (position === 'GK') return 'GK';
    if (['CB','LB','RB'].includes(position)) return 'DEF';
    if (['DMF','CMF','LMF','RMF','AMF'].includes(position)) return 'MID';
    return 'FWD';
  }

  function positionFit(player, expected) {
    if (!player || !expected) return 'out';
    if (player.position === expected) return 'natural';
    if ((player.secondaryPositions || []).includes(expected)) return 'compatible';
    return 'out';
  }

  function remapAssignments(assignments, oldFormation, newFormation, playersById) {
    const entries = Object.entries(assignments || {}).map(([slotId, assignment]) => ({
      assignment,
      oldSlot: {
        ...((oldFormation.slots || []).find(slot => slot.id === slotId) || { x: 50, y: 50, position: '' }),
        x: Number.isFinite(Number(assignment.x)) ? Number(assignment.x) : ((oldFormation.slots || []).find(slot => slot.id === slotId)?.x || 50),
        y: Number.isFinite(Number(assignment.y)) ? Number(assignment.y) : ((oldFormation.slots || []).find(slot => slot.id === slotId)?.y || 50),
      },
    }));
    const candidates = [];
    entries.forEach((entry, entryIndex) => {
      const player = playersById.get(String(entry.assignment.playerId));
      newFormation.slots.forEach((slot, slotIndex) => {
        const fit = positionFit(player, slot.position);
        const fitCost = fit === 'natural' ? 0 : fit === 'compatible' ? 18 :
          positionFamily(player && player.position) === positionFamily(slot.position) ? 38 : 72;
        const distance = Math.hypot(entry.oldSlot.x - slot.x, entry.oldSlot.y - slot.y) * .35;
        candidates.push({ entryIndex, slotIndex, score: fitCost + distance });
      });
    });
    candidates.sort((a, b) => a.score - b.score || a.entryIndex - b.entryIndex || a.slotIndex - b.slotIndex);
    const usedEntries = new Set(), usedSlots = new Set(), result = {};
    candidates.forEach(candidate => {
      if (usedEntries.has(candidate.entryIndex) || usedSlots.has(candidate.slotIndex)) return;
      usedEntries.add(candidate.entryIndex);
      usedSlots.add(candidate.slotIndex);
      const slot = newFormation.slots[candidate.slotIndex];
      result[slot.id] = { ...entries[candidate.entryIndex].assignment, x: slot.x, y: slot.y };
    });
    return result;
  }

  function encodeShareState(value) {
    const json = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') {
      const bytes = new TextEncoder().encode(json);
      let binary = '';
      bytes.forEach(byte => { binary += String.fromCharCode(byte); });
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }
    return Buffer.from(json, 'utf8').toString('base64url');
  }

  function decodeShareState(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    if (typeof TextDecoder !== 'undefined') {
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  }

  const utils = { positionFamily, positionFit, remapAssignments, encodeShareState, decodeShareState };
  root.LAQPSquadBuilderUtils = utils;
  if (typeof module !== 'undefined') module.exports = utils;
  if (typeof document === 'undefined') return;

  const formationsApi = root.LAQPBuilderFormations;
  const valueApi = root.LAQPTransferValue;
  if (!formationsApi || !valueApi) return;

  const state = {
    data: null,
    playersById: new Map(),
    customPlayersById: new Map(),
    customImageUrls: new Map(),
    teamsById: new Map(),
    teamLabelToId: new Map(),
    formationId: '4-2-3-1',
    baseTeamId: '',
    customTeam: null,
    name: 'Mi alineación',
    budget: null,
    xi: {},
    fieldSlots: {},
    bench: Array(MAX_BENCH).fill(null),
    squadLine: '',
    globalLine: '',
    selectedPlayerId: '',
    selectedTarget: null,
    currentSaveId: '',
    createdAt: '',
    guideMode: 'auto',
    playerPanelMinimized: false,
  };

  const el = {};
  let toastTimer = 0;
  let dialogTarget = null;
  let pointerDrag = null;
  let nativeDrag = null;
  let actionTarget = null;
  let suppressPitchClickUntil = 0;

  function cacheElements() {
    [
      'builder-name','builder-league','builder-team','builder-team-options','builder-create-custom-team','builder-formation','builder-budget','builder-save','builder-saved',
      'builder-share','builder-export','builder-loading','builder-error','builder-retry','builder-app','builder-pitch','builder-slots','builder-guides-overlay',
      'builder-bench-slots','builder-bench-count','builder-selection-hint','builder-scheme-status','builder-reset-formation','builder-clear','builder-clear-dialog','builder-confirm-clear','builder-squad-query','builder-squad-note',
      'builder-squad-list','builder-global-query','builder-global-team','builder-global-overall',
      'builder-search-note','builder-search-list','builder-count-label','builder-average-overall','builder-average-age',
      'builder-player-count','builder-transfer-count','builder-spend-label','builder-transfer-spend','builder-budget-summary',
      'builder-budget-left','builder-transfers-title','builder-transfer-list','builder-player-dialog','builder-player-dialog-title',
      'builder-dialog-query','builder-dialog-list','builder-saved-dialog','builder-saved-list','builder-toast','builder-team-lineup-actions','builder-team-lineup-copy','builder-load-team-lineup','builder-restore-team-lineup','builder-panel-collapse','builder-guides','builder-export-dialog','builder-export-format','builder-export-title','builder-export-subtitle','builder-export-preview','builder-preview-export','builder-confirm-export','builder-custom-dialog','builder-custom-form','builder-custom-dialog-title','builder-custom-id','builder-custom-name','builder-custom-position','builder-custom-overall','builder-custom-age','builder-custom-team','builder-custom-nationality','builder-custom-photo','builder-custom-image-url','builder-custom-photo-status','builder-delete-custom','builder-remove-custom-from-lineup','builder-send-custom-to-bench','builder-custom-manager-dialog','builder-custom-manager-list','builder-create-custom','builder-manage-custom','builder-custom-team-dialog','builder-custom-team-form','builder-custom-team-name','builder-custom-team-short','builder-custom-team-league','builder-custom-team-budget','builder-custom-team-crest','builder-custom-team-status','builder-player-actions-dialog','builder-player-actions-title',
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  }

  function showToast(message, isError) {
    window.clearTimeout(toastTimer);
    el['builder-toast'].textContent = message;
    el['builder-toast'].classList.toggle('is-error', !!isError);
    el['builder-toast'].classList.add('is-visible');
    toastTimer = window.setTimeout(() => el['builder-toast'].classList.remove('is-visible'), 2600);
  }

  function currentFormation() {
    return formationsApi.byId[state.formationId] || formationsApi.formations[0];
  }

  function formationSlot(slotId, formation = currentFormation()) {
    return (formation.slots || []).find(slot => slot.id === slotId) || null;
  }

  function createFieldSlots(formation = currentFormation()) {
    return Object.fromEntries((formation.slots || []).map(slot => [slot.id, {
      slotId: slot.id, x: slot.x, y: slot.y, role: slot.position, locked: slot.position === 'GK',
    }]));
  }

  function ensureFieldSlots() {
    const formation = currentFormation();
    if (!state.fieldSlots || !Object.keys(state.fieldSlots).length) state.fieldSlots = createFieldSlots(formation);
    formation.slots.forEach(slot => {
      if (!state.fieldSlots[slot.id]) state.fieldSlots[slot.id] = { slotId:slot.id, x:slot.x, y:slot.y, role:slot.position, locked:slot.position === 'GK' };
      if (slot.position === 'GK') {
        state.fieldSlots[slot.id].x = slot.x; state.fieldSlots[slot.id].y = slot.y; state.fieldSlots[slot.id].locked = true;
      }
    });
  }

  function clampCoordinate(value, min = 5, max = 95) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function assignmentCoordinates(slotId, assignment) {
    const slot = formationSlot(slotId) || { x: 50, y: 50 };
    const fieldSlot = state.fieldSlots && state.fieldSlots[slotId];
    return {
      x: Number.isFinite(Number(fieldSlot && fieldSlot.x)) ? clampCoordinate(fieldSlot.x) : Number.isFinite(Number(assignment && assignment.x)) ? clampCoordinate(assignment.x) : slot.x,
      y: Number.isFinite(Number(fieldSlot && fieldSlot.y)) ? clampCoordinate(fieldSlot.y) : Number.isFinite(Number(assignment && assignment.y)) ? clampCoordinate(assignment.y) : slot.y,
    };
  }

  function hasCustomLayout() {
    ensureFieldSlots();
    return Object.entries(state.fieldSlots).some(([slotId, fieldSlot]) => {
      const slot = formationSlot(slotId);
      if (!slot) return false;
      const coordinates = assignmentCoordinates(slotId, fieldSlot);
      return Math.abs(coordinates.x - slot.x) > .2 || Math.abs(coordinates.y - slot.y) > .2;
    });
  }

  function getPlayer(playerId) {
    return state.customPlayersById.get(String(playerId)) || state.playersById.get(String(playerId)) || {
      id: String(playerId || ''), name: `Jugador no disponible (${playerId})`, position: '', secondaryPositions: [],
      overall: null, age: null, clubId: '', clubIds: [], miniface: 'img/players/default.webp', pes2018Miniface: '', missing: true,
    };
  }

  function getTeam(teamId) {
    if (state.customTeam && String(state.customTeam.id) === String(teamId)) return state.customTeam;
    return state.teamsById.get(String(teamId)) || null;
  }

  function displayTeamName(name) {
    const lowerWords = new Set(['de','del','la','las','los','y']);
    return String(name || '').trim().split(/\s+/).map((word, index) => {
      if (!word) return '';
      const lowered = word.toLocaleLowerCase('es');
      if (index && lowerWords.has(lowered)) return lowered;
      if (/^[A-ZÁÉÍÓÚÜÑ.]{1,3}$/.test(word)) return word;
      return lowered.charAt(0).toLocaleUpperCase('es') + lowered.slice(1);
    }).join(' ');
  }

  function teamLabel(team) {
    return team ? displayTeamName(team.name) : '';
  }

  function assignmentForPlayer(playerId) {
    const wanted = String(playerId);
    for (const [slotId, assignment] of Object.entries(state.xi)) {
      if (String(assignment.playerId) === wanted) return { area: 'xi', id: slotId, assignment };
    }
    const benchIndex = state.bench.findIndex(assignment => assignment && String(assignment.playerId) === wanted);
    return benchIndex >= 0 ? { area: 'bench', id: benchIndex, assignment: state.bench[benchIndex] } : null;
  }

  function targetKey(target) {
    return target ? `${target.area}:${target.id}` : '';
  }

  function assignmentAt(target) {
    return target.area === 'xi' ? state.xi[target.id] || null : state.bench[Number(target.id)] || null;
  }

  function setAssignment(target, assignment) {
    if (target.area === 'xi') {
      if (assignment) state.xi[target.id] = assignment;
      else delete state.xi[target.id];
    } else {
      state.bench[Number(target.id)] = assignment || null;
    }
  }

  function createAssignment(playerId) {
    const player = getPlayer(playerId);
    return {
      playerId: String(playerId),
      originTeamId: state.baseTeamId && (player.clubIds || []).includes(state.baseTeamId) ? state.baseTeamId : (player.clubId || ''),
      estimatedTransferFee: valueApi.estimatedTransferFee(player),
    };
  }

  function isTransfer(assignment) {
    if (!state.baseTeamId) return false;
    return String(assignment.originTeamId || '') !== state.baseTeamId;
  }

  function hasChangedMembership(assignment) {
    if (!assignment.originTeamId) return false;
    const player = getPlayer(assignment.playerId);
    return !player.missing && !(player.clubIds || []).includes(String(assignment.originTeamId));
  }

  function firstEmptyBench() {
    return state.bench.findIndex(item => !item);
  }

  function removePlayer(playerId) {
    const location = assignmentForPlayer(playerId);
    if (!location) return;
    setAssignment(location, null);
    state.selectedPlayerId = '';
    state.selectedTarget = null;
    commit();
    showToast('Jugador quitado de la alineación.');
  }

  function placePlayer(playerId, target, coordinates) {
    const source = assignmentForPlayer(playerId);
    const destination = assignmentAt(target);

    if (source && source.area === 'xi' && state.fieldSlots[source.id]?.locked && targetKey(source) !== targetKey(target)) {
      showToast('El slot de arquero permanece fijo. Podés cambiar, enviar al banco o eliminar al jugador.', true);
      return;
    }

    if (source && targetKey(source) === targetKey(target)) {
      highlightLocation(source);
      showToast('Ese jugador ya está en esa posición. Tocá otra posición para moverlo.');
      return;
    }

    const moving = { ...(source ? source.assignment : createAssignment(playerId)) };
    if (target.area === 'xi') {
      ensureFieldSlots();
      const fieldSlot = state.fieldSlots[target.id];
      if (coordinates && fieldSlot && !fieldSlot.locked) {
        fieldSlot.x = clampCoordinate(coordinates.x); fieldSlot.y = clampCoordinate(coordinates.y);
      }
      delete moving.x; delete moving.y;
    } else {
      delete moving.x;
      delete moving.y;
    }
    if (destination) {
      if (source) {
        const displaced = { ...destination };
        delete displaced.x; delete displaced.y;
        setAssignment(source, displaced);
      } else {
        const emptyBench = firstEmptyBench();
        if (emptyBench < 0) {
          showToast('No hay espacio en el banco para desplazar al jugador actual.', true);
          return;
        }
        state.bench[emptyBench] = destination;
      }
    } else if (source) {
      setAssignment(source, null);
    }
    setAssignment(target, moving);
    state.selectedPlayerId = '';
    state.selectedTarget = null;
    commit();
  }

  function nearestSlotTo(x, y, onlyEmpty) {
    ensureFieldSlots();
    const slots = currentFormation().slots.filter(slot => !onlyEmpty || !state.xi[slot.id]);
    return slots.sort((a, b) => {
      const pointA = state.fieldSlots[a.id] || a, pointB = state.fieldSlots[b.id] || b;
      return Math.hypot(pointA.x - x, pointA.y - y) - Math.hypot(pointB.x - x, pointB.y - y);
    })[0] || null;
  }

  function placePlayerOnPitch(playerId, x, y) {
    const coordinates = snapCoordinates(x, y, playerId);
    const source = assignmentForPlayer(playerId);
    if (source && source.area === 'xi') {
      ensureFieldSlots();
      if (state.fieldSlots[source.id]?.locked) { showToast('El arquero permanece fijo frente al arco.', true); return; }
      state.fieldSlots[source.id].x = coordinates.x;
      state.fieldSlots[source.id].y = coordinates.y;
      state.selectedPlayerId = '';
      state.selectedTarget = null;
      commit();
      return;
    }
    const slot = nearestSlotTo(coordinates.x, coordinates.y, true) || nearestSlotTo(coordinates.x, coordinates.y, false);
    if (slot) placePlayer(playerId, { area: 'xi', id: slot.id }, coordinates);
  }

  function resetFormationLayout() {
    state.fieldSlots = createFieldSlots();
    commit();
    showToast('Jugadores reubicados según el esquema base.');
  }

  function openClearDialog() {
    if (typeof el['builder-clear-dialog'].showModal === 'function') el['builder-clear-dialog'].showModal();
    else el['builder-clear-dialog'].setAttribute('open', '');
  }

  function clearLineup() {
    state.xi = {};
    state.bench = Array(MAX_BENCH).fill(null);
    state.selectedPlayerId = '';
    state.selectedTarget = null;
    actionTarget = null;
    if (el['builder-clear-dialog'].open && typeof el['builder-clear-dialog'].close === 'function') el['builder-clear-dialog'].close();
    else el['builder-clear-dialog'].removeAttribute('open');
    commit();
    showToast('Alineación limpiada. Se conservaron el esquema y las posiciones personalizadas.');
  }

  function handlePlayerChoice(playerId) {
    const existing = assignmentForPlayer(playerId);
    if (state.selectedTarget) {
      placePlayer(playerId, state.selectedTarget);
      closePlayerDialog();
      closeMobilePanels();
      return;
    }
    if (existing) {
      state.selectedPlayerId = String(playerId);
      renderSelection();
      highlightLocation(existing);
      showToast('Ese jugador ya está en la alineación. Elegí otro destino para moverlo.');
      return;
    }
    state.selectedPlayerId = String(playerId);
    renderSelection();
  }

  function handleTarget(target) {
    const destination = assignmentAt(target);
    if (state.selectedPlayerId) {
      const existing = assignmentForPlayer(state.selectedPlayerId);
      if (existing && targetKey(existing) === targetKey(target)) openPlayerActions(target);
      else {
        placePlayer(state.selectedPlayerId, target);
      }
      return;
    }
    if (destination) {
      openPlayerActions(target);
      return;
    }
    state.selectedTarget = target;
    renderSelection();
    openPlayerDialog(target);
  }

  function openPlayerActions(target) {
    const assignment = assignmentAt(target);
    if (!assignment) return;
    actionTarget = target;
    const player = getPlayer(assignment.playerId);
    el['builder-player-actions-title'].textContent = player.name;
    if (typeof el['builder-player-actions-dialog'].showModal === 'function') el['builder-player-actions-dialog'].showModal();
  }

  function closePlayerActions() {
    if (el['builder-player-actions-dialog'].open) el['builder-player-actions-dialog'].close();
  }

  function handlePlayerSlotAction(action) {
    const target = actionTarget;
    const assignment = target && assignmentAt(target);
    if (!target || !assignment) { closePlayerActions(); return; }
    if (action === 'change') {
      closePlayerActions(); state.selectedPlayerId = ''; state.selectedTarget = target; renderSelection(); openPlayerDialog(target); return;
    }
    if (action === 'bench') {
      const index = firstEmptyBench();
      if (index < 0) { showToast('No hay espacio en el banco.', true); return; }
      state.bench[index] = assignment; setAssignment(target, null);
      closePlayerActions(); state.selectedPlayerId = ''; state.selectedTarget = null; commit(); showToast('Jugador enviado al banco.'); return;
    }
    if (action === 'remove') {
      setAssignment(target, null); closePlayerActions(); state.selectedPlayerId = ''; state.selectedTarget = null; commit(); showToast('Jugador quitado; el hueco táctico se conservó.');
    }
  }

  function imageMarkup(player, className) {
    if (player.custom) return `<img class="${className || ''}" alt="${escapeHtml(player.name)}" loading="lazy" src="img/players/default.webp" data-custom-image-id="${escapeHtml(player.id)}">`;
    return `<img class="${className || ''}" alt="${escapeHtml(player.name)}" loading="lazy" data-player-id="${escapeHtml(player.id)}" data-miniface-current-src="${escapeHtml(player.miniface || 'img/players/default.webp')}" data-miniface-pes-src="${escapeHtml(player.pes2018Miniface || '')}">`;
  }

  function playerRowMarkup(player, context) {
    const location = assignmentForPlayer(player.id);
    const external = state.baseTeamId && !(player.clubIds || []).includes(state.baseTeamId);
    const showPrice = context === 'search' && (external || !state.baseTeamId);
    const club = getTeam(player.clubId);
    return `<button type="button" class="builder-player-row${location ? ' is-used' : ''}${state.selectedPlayerId === player.id ? ' is-selected' : ''}" data-player-id="${escapeHtml(player.id)}" draggable="true">
      ${imageMarkup(player)}
      <span class="builder-player-copy"><strong>${escapeHtml(player.name)}${player.custom ? ' <em>PERSONALIZADO</em>' : ''}</strong><small>${escapeHtml(player.position || '—')}${player.age ? ` · ${player.age} años` : ''}${club ? ` · ${escapeHtml(club.name)}` : (player.teamName ? ` · ${escapeHtml(player.teamName)}` : '')}</small></span>
      <span class="builder-player-meta"><span class="builder-player-overall">${player.overall || '—'}</span>${showPrice ? `<span class="builder-player-price">${valueApi.formatEstimatedMoney(valueApi.estimatedTransferFee(player))}</span>` : ''}</span>
      <span class="builder-player-add" aria-hidden="true">${location ? '✓' : '+'}</span>
    </button>`;
  }

  function slotCardMarkup(assignment, bench) {
    const player = getPlayer(assignment.playerId);
    const transfer = isTransfer(assignment);
    const changed = hasChangedMembership(assignment);
    const title = changed ? 'El jugador ya no pertenece al club que tenía al guardar esta alineación.' : '';
    return `<span class="builder-slot-card" title="${escapeHtml(title)}">
      ${imageMarkup(player)}
      <span class="builder-slot-overall">${player.overall || '—'}</span>
      <span class="builder-slot-position">${escapeHtml(player.position || '—')}</span>
      ${transfer ? '<span class="builder-transfer-mark" aria-label="Fichaje">€</span>' : changed ? '<span class="builder-transfer-mark" aria-label="Club actualizado">!</span>' : ''}
      <span class="builder-slot-name">${escapeHtml(player.name)}</span>
    </span>`;
  }

  function renderPitch() {
    const formation = currentFormation();
    ensureFieldSlots();
    el['builder-slots'].innerHTML = formation.slots.map(slot => {
      const fieldSlot = state.fieldSlots[slot.id] || slot;
      const assignment = state.xi[slot.id];
      const player = assignment ? getPlayer(assignment.playerId) : null;
      const fit = assignment ? positionFit(player, slot.position) : '';
      const coordinates = assignmentCoordinates(slot.id, assignment);
      const selected = assignment && state.selectedPlayerId === String(assignment.playerId);
      const isTarget = state.selectedTarget && state.selectedTarget.area === 'xi' && state.selectedTarget.id === slot.id;
      return `<button type="button" class="builder-slot${assignment ? ` is-${fit}` : ''}${selected || isTarget ? ' is-target' : ''}${fieldSlot.locked ? ' is-locked' : ''}" data-target-area="xi" data-target-id="${slot.id}" data-slot-role="${escapeHtml(fieldSlot.role || slot.position)}"${fieldSlot.locked ? ' data-slot-locked="true"' : ''}${assignment ? ' data-has-player="true"' : ''} style="left:${coordinates.x}%;top:${coordinates.y}%;z-index:${assignment ? Math.round(coordinates.y) + 3 : 2}" aria-label="${escapeHtml(fieldSlot.role || slot.position)}${player ? `: ${player.name}` : ', libre'}">
        ${assignment ? slotCardMarkup(assignment, false) : `<span class="builder-slot-empty"><b>+</b><small>${escapeHtml(fieldSlot.role || slot.position)}</small></span>`}
      </button>`;
    }).join('');
    el['builder-scheme-status'].textContent = `${formation.name}${hasCustomLayout() ? ' · Personalizada' : ''}`;
    refreshMinifaces(el['builder-pitch']);
    hydrateCustomImages(el['builder-pitch']);
  }

  function renderBench() {
    el['builder-bench-slots'].innerHTML = state.bench.map((assignment, index) => {
      const selected = assignment && state.selectedPlayerId === String(assignment.playerId);
      const isTarget = state.selectedTarget && state.selectedTarget.area === 'bench' && Number(state.selectedTarget.id) === index;
      return `<button type="button" class="builder-bench-slot${selected || isTarget ? ' is-target' : ''}" data-target-area="bench" data-target-id="${index}" aria-label="Suplente ${index + 1}${assignment ? `: ${escapeHtml(getPlayer(assignment.playerId).name)}` : ', libre'}"${assignment ? ' data-has-player="true"' : ''}>${assignment ? slotCardMarkup(assignment, true) : '<span class="builder-bench-empty">+</span>'}</button>`;
    }).join('');
    el['builder-bench-count'].textContent = `${state.bench.filter(Boolean).length}/${MAX_BENCH}`;
    refreshMinifaces(el['builder-bench-slots']);
    hydrateCustomImages(el['builder-bench-slots']);
  }

  function playerMatchesLine(player, line) {
    if (!line) return true;
    return [player.position, ...(player.secondaryPositions || [])].some(position => positionFamily(position) === line);
  }

  function renderSquad() {
    const team = getTeam(state.baseTeamId);
    if (!team) {
      el['builder-squad-note'].textContent = 'Elegí un equipo base para ver su plantilla.';
      el['builder-squad-list'].innerHTML = '';
      return;
    }
    const term = normalize(el['builder-squad-query'].value);
    const players = (team.playerIds || []).map(getPlayer).filter(player =>
      (!term || normalize(player.name).includes(term)) && playerMatchesLine(player, state.squadLine)
    );
    el['builder-squad-note'].textContent = `${players.length} de ${team.playerIds.length} jugadores · tocá o arrastrá para añadir.`;
    el['builder-squad-list'].innerHTML = players.map(player => playerRowMarkup(player, 'squad')).join('');
    refreshMinifaces(el['builder-squad-list']);
    hydrateCustomImages(el['builder-squad-list']);
  }

  function renderSearch() {
    const term = normalize(el['builder-global-query'].value.trim());
    if (term.length < 2) {
      el['builder-search-note'].textContent = 'Escribí al menos 2 caracteres. Se muestran hasta 40 resultados.';
      el['builder-search-list'].innerHTML = '';
      return;
    }
    const teamId = el['builder-global-team'].value;
    const minOverall = Number(el['builder-global-overall'].value) || 0;
    const matches = [...state.customPlayersById.values(), ...state.data.players].filter(player =>
      normalize(player.name).includes(term) &&
      playerMatchesLine(player, state.globalLine) &&
      (!teamId || (!player.custom && (player.teamIds || []).includes(teamId))) &&
      (!minOverall || Number(player.overall) >= minOverall)
    ).slice(0, SEARCH_LIMIT);
    el['builder-search-note'].textContent = matches.length === SEARCH_LIMIT ? `Primeros ${SEARCH_LIMIT} resultados.` : `${matches.length} resultado${matches.length === 1 ? '' : 's'}.`;
    el['builder-search-list'].innerHTML = matches.map(player => playerRowMarkup(player, 'search')).join('') || '<p class="builder-panel-note">No hay coincidencias.</p>';
    refreshMinifaces(el['builder-search-list']);
    hydrateCustomImages(el['builder-search-list']);
  }

  function allAssignments() {
    return [...Object.values(state.xi), ...state.bench.filter(Boolean)];
  }

  function renderSummary() {
    const xiAssignments = Object.values(state.xi);
    const xiPlayers = xiAssignments.map(item => getPlayer(item.playerId)).filter(player => !player.missing);
    const overalls = xiPlayers.map(player => Number(player.overall)).filter(Number.isFinite);
    const ages = xiPlayers.map(player => Number(player.age)).filter(Number.isFinite);
    const transfers = allAssignments().filter(isTransfer);
    const valued = state.baseTeamId ? transfers : allAssignments();
    const spend = valued.reduce((sum, assignment) => sum + (Number(assignment.estimatedTransferFee) || valueApi.estimatedTransferFee(getPlayer(assignment.playerId))), 0);
    el['builder-count-label'].textContent = `${xiAssignments.length}/11`;
    el['builder-average-overall'].textContent = overalls.length ? (overalls.reduce((a,b) => a+b,0) / overalls.length).toFixed(1).replace('.', ',') : '—';
    el['builder-average-age'].textContent = ages.length ? (ages.reduce((a,b) => a+b,0) / ages.length).toFixed(1).replace('.', ',') : '—';
    el['builder-player-count'].textContent = `${allAssignments().length} jugador${allAssignments().length === 1 ? '' : 'es'}`;
    el['builder-transfer-count'].textContent = state.baseTeamId ? String(transfers.length) : '—';
    el['builder-spend-label'].textContent = state.baseTeamId ? 'Gasto estimado' : 'Valor estimado';
    el['builder-transfer-spend'].textContent = valueApi.formatEstimatedMoney(spend);
    el['builder-transfers-title'].textContent = state.baseTeamId ? 'Fichajes' : 'Jugadores seleccionados';
    el['builder-budget-summary'].hidden = state.budget == null;
    if (state.budget != null) {
      const remaining = state.budget - spend;
      el['builder-budget-left'].textContent = `${remaining < 0 ? '−' : ''}${valueApi.formatEstimatedMoney(Math.abs(remaining)).replace('~','')}`;
      el['builder-budget-left'].style.color = remaining < 0 ? '#ff8d95' : '';
    }
    const summaryItems = state.baseTeamId ? transfers : allAssignments();
    el['builder-transfer-list'].innerHTML = summaryItems.length ? summaryItems.map(assignment => {
      const player = getPlayer(assignment.playerId);
      return `<div class="builder-transfer-row"><strong>${escapeHtml(player.name)}</strong><span>${valueApi.formatEstimatedMoney(assignment.estimatedTransferFee || valueApi.estimatedTransferFee(player))}</span></div>`;
    }).join('') : `<p>${state.baseTeamId ? 'Sin fichajes.' : 'Todavía no seleccionaste jugadores.'}</p>`;
  }

  function renderSelection() {
    const player = state.selectedPlayerId ? getPlayer(state.selectedPlayerId) : null;
    el['builder-selection-hint'].textContent = state.selectedTarget ? 'Elegí un jugador para esta posición.' : player ? `${player.name}: elegí un destino.` : 'Tocá un jugador o una posición para empezar.';
    document.querySelectorAll('.builder-player-row').forEach(row => row.classList.toggle('is-selected', row.dataset.playerId === state.selectedPlayerId));
  }

  function renderAll() {
    renderPitch();
    renderBench();
    renderSquad();
    renderSearch();
    renderSummary();
    renderSelection();
  }

  function refreshMinifaces(container) {
    if (root.LAQPMinifaces) root.LAQPMinifaces.refresh(container);
  }

  function loadCustomPlayers() {
    const stored = safeStorageGet(CUSTOM_PLAYERS_KEY, []);
    state.customPlayersById = new Map((Array.isArray(stored) ? stored : []).filter(item => item && String(item.id).startsWith('custom_')).map(item => [String(item.id), {
      ...item, id: String(item.id), custom: true, secondaryPositions: Array.isArray(item.secondaryPositions) ? item.secondaryPositions : [],
      clubIds: [], teamIds: [], clubId: '', miniface: 'img/players/default.webp', pes2018Miniface: '',
    }]));
  }

  function saveCustomPlayers() {
    return safeStorageSet(CUSTOM_PLAYERS_KEY, Array.from(state.customPlayersById.values()).map(({ miniface, pes2018Miniface, clubIds, teamIds, clubId, ...player }) => player));
  }

  function customDb() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB no está disponible'));
      const request = root.indexedDB.open(CUSTOM_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento de imágenes'));
    });
  }

  async function putCustomImage(id, blob) {
    const db = await customDb();
    await new Promise((resolve, reject) => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put(blob, id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  }
  async function getCustomImage(id) {
    const db = await customDb();
    const result = await new Promise((resolve, reject) => { const tx = db.transaction('images'); const request = tx.objectStore('images').get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); });
    db.close(); return result;
  }
  async function deleteCustomImage(id) {
    try { const db = await customDb(); await new Promise((resolve, reject) => { const tx = db.transaction('images','readwrite'); tx.objectStore('images').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); } catch (_error) {}
  }
  async function hydrateCustomImages(container) {
    if (!container) return;
    const images = container.querySelectorAll('[data-custom-image-id]');
    for (const image of images) {
      const player = getPlayer(image.dataset.customImageId);
      const ref = player.imageRef || {};
      if (ref.type === 'url' && /^https?:\/\//i.test(ref.url || '')) { image.src = ref.url; image.onerror = () => { image.src = 'img/players/default.webp'; }; continue; }
      if (ref.type === 'inline' && /^data:image\//i.test(ref.data || '')) { image.src = ref.data; continue; }
      if (ref.type !== 'idb') continue;
      try {
        let url = state.customImageUrls.get(player.id);
        if (!url) { const blob = await getCustomImage(ref.key || player.id); if (!blob) continue; url = URL.createObjectURL(blob); state.customImageUrls.set(player.id, url); }
        image.src = url;
      } catch (_error) {}
    }
  }

  async function resizeCustomPhoto(file) {
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Usá PNG, JPG o WebP de hasta 8 MB.');
    const source = await new Promise((resolve, reject) => { const image = new Image(); const url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); }; image.src = url; });
    const size = 256, scale = Math.min(size / source.naturalWidth, size / source.naturalHeight, 1);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(source.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo optimizar la foto.')), 'image/webp', .84));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error || new Error('No se pudo conservar la imagen local.')); reader.readAsDataURL(blob); });
  }

  function openCustomDialog(player) {
    const item = player || null;
    el['builder-custom-dialog-title'].textContent = item ? 'Editar jugador personalizado' : 'Crear jugador personalizado';
    el['builder-custom-id'].value = item ? item.id : '';
    el['builder-custom-name'].value = item ? item.name : '';
    el['builder-custom-position'].value = item ? item.position : 'CF';
    el['builder-custom-overall'].value = item ? item.overall : '';
    el['builder-custom-age'].value = item && item.age ? item.age : '';
    el['builder-custom-team'].value = item ? item.teamName || '' : '';
    el['builder-custom-nationality'].value = item ? item.nationality || '' : '';
    el['builder-custom-photo'].value = '';
    el['builder-custom-image-url'].value = item && item.imageRef && item.imageRef.type === 'url' ? item.imageRef.url : '';
    el['builder-custom-photo-status'].textContent = item && item.imageRef && item.imageRef.type === 'idb' ? 'La foto local se conserva al guardar. Elegí otra solo para reemplazarla.' : '';
    el['builder-delete-custom'].hidden = !item;
    const location = item && assignmentForPlayer(item.id);
    el['builder-remove-custom-from-lineup'].hidden = !(location && location.area === 'xi');
    el['builder-send-custom-to-bench'].hidden = !(location && location.area === 'xi');
    el['builder-custom-dialog'].showModal();
  }

  function closeCustomDialog() { if (el['builder-custom-dialog'].open) el['builder-custom-dialog'].close(); }

  async function saveCustomPlayer(event) {
    event.preventDefault();
    const id = el['builder-custom-id'].value || `custom_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const name = el['builder-custom-name'].value.trim();
    const position = el['builder-custom-position'].value;
    const overall = Number(el['builder-custom-overall'].value);
    const file = el['builder-custom-photo'].files[0];
    const url = el['builder-custom-image-url'].value.trim();
    const existing = state.customPlayersById.get(id);
    if (!name || !formationsApi.formations.length || !position || !Number.isInteger(overall) || overall < 40 || overall > 109) { showToast('Completá nombre, posición y una media entre 40 y 109.', true); return; }
    if (url && !/^https?:\/\//i.test(url)) { showToast('La URL de imagen debe comenzar con http:// o https://.', true); return; }
    if (!file && !url && !(existing && existing.imageRef && existing.imageRef.type)) { showToast('Agregá una foto o una URL de imagen.', true); return; }
    const player = { ...(existing || {}), id, custom:true, name, position, overall, age:Number(el['builder-custom-age'].value) || null, teamName:el['builder-custom-team'].value.trim(), nationality:el['builder-custom-nationality'].value.trim(), secondaryPositions:[], clubIds:[], teamIds:[], clubId:'', miniface:'img/players/default.webp', pes2018Miniface:'' };
    try {
      if (file) {
        const blob = await resizeCustomPhoto(file);
        try {
          await putCustomImage(id, blob);
          if (state.customImageUrls.has(id)) { URL.revokeObjectURL(state.customImageUrls.get(id)); state.customImageUrls.delete(id); }
          player.imageRef = { type:'idb', key:id };
        } catch (_storageError) {
          player.imageRef = { type:'inline', data:await blobToDataUrl(blob) };
        }
      } else if (url) player.imageRef = { type:'url', url };
      state.customPlayersById.set(id, player);
      if (!saveCustomPlayers()) throw new Error('No se pudo guardar el jugador en este navegador.');
      closeCustomDialog(); renderAll(); showToast(existing ? 'Jugador personalizado actualizado.' : 'Jugador personalizado creado. Tocálo para añadirlo.');
    } catch (error) { showToast(error.message || 'No se pudo guardar la foto personalizada.', true); }
  }

  function deleteCustomPlayer() {
    const id = el['builder-custom-id'].value;
    if (!id || !state.customPlayersById.has(id) || !window.confirm('¿Eliminar este jugador personalizado de este navegador?')) return;
    const assigned = assignmentForPlayer(id); if (assigned) setAssignment(assigned, null);
    state.customPlayersById.delete(id); deleteCustomImage(id); if (state.customImageUrls.has(id)) { URL.revokeObjectURL(state.customImageUrls.get(id)); state.customImageUrls.delete(id); }
    saveCustomPlayers(); closeCustomDialog(); renderAll(); showToast('Jugador personalizado eliminado.');
  }

  function removeCustomFromLineup() {
    const location = assignmentForPlayer(el['builder-custom-id'].value);
    if (!location) return;
    setAssignment(location, null); closeCustomDialog(); commit(); showToast('Jugador personalizado quitado de la alineación.');
  }

  function sendCustomToBench() {
    const id = el['builder-custom-id'].value, location = assignmentForPlayer(id), index = firstEmptyBench();
    if (!location || location.area !== 'xi') return;
    if (index < 0) { showToast('No hay espacio en el banco.', true); return; }
    placePlayer(id, { area:'bench', id:index }); closeCustomDialog();
  }

  function renderCustomManager() {
    const players = Array.from(state.customPlayersById.values());
    el['builder-custom-manager-list'].innerHTML = players.length ? players.map(player => `<div class="builder-saved-item" data-custom-id="${escapeHtml(player.id)}"><span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${escapeHtml(player.overall)}${player.teamName ? ` · ${escapeHtml(player.teamName)}` : ''}</small></span><button type="button" data-custom-action="edit">Editar</button></div>`).join('') : '<p class="builder-dialog-copy">Todavía no creaste jugadores personalizados.</p>';
  }

  function openCustomTeamDialog() {
    const team = state.customTeam;
    el['builder-custom-team-name'].value = team ? team.name || '' : '';
    el['builder-custom-team-short'].value = team ? team.shortName || '' : '';
    el['builder-custom-team-league'].value = team ? team.leagueName || '' : '';
    el['builder-custom-team-budget'].value = team && Number.isFinite(Number(team.budget)) ? String(Number(team.budget) / 1e6) : '';
    el['builder-custom-team-crest'].value = '';
    el['builder-custom-team-status'].textContent = team && ['idb','inline'].includes(team.crestRef?.type)
      ? 'El escudo local se conserva. Elegí otro archivo solo para reemplazarlo.'
      : 'El equipo solo existirá dentro de esta alineación.';
    el['builder-custom-team-dialog'].showModal();
  }

  function closeCustomTeamDialog() {
    if (el['builder-custom-team-dialog'].open) el['builder-custom-team-dialog'].close();
  }

  async function saveCustomTeam(event) {
    event.preventDefault();
    const name = el['builder-custom-team-name'].value.trim();
    if (!name) { showToast('Ingresá un nombre para el equipo.', true); return; }
    const current = state.customTeam || {};
    const id = current.id || `custom_team_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const budgetInput = el['builder-custom-team-budget'].value;
    const team = {
      ...current,
      id,
      custom:true,
      name,
      shortName:el['builder-custom-team-short'].value.trim(),
      leagueName:el['builder-custom-team-league'].value.trim(),
      budget:budgetInput === '' ? null : Math.max(0, Number(budgetInput) * 1e6),
      playerIds:[],
      type:0,
    };
    const file = el['builder-custom-team-crest'].files[0];
    try {
      if (file) {
        const blob = await resizeCustomPhoto(file);
        const key = `crest_${id}`;
        try {
          await putCustomImage(key, blob);
          team.crestRef = { type:'idb', key };
        } catch (_storageError) {
          team.crestRef = { type:'inline', data:await blobToDataUrl(blob) };
        }
      } else if (!team.crestRef) team.crestRef = { type:'none' };
      state.customTeam = team;
      state.baseTeamId = id;
      if (team.budget != null) state.budget = team.budget;
      el['builder-league'].value = '';
      closeCustomTeamDialog();
      syncControls();
      commit();
      showToast('Equipo personalizado listo para usar.');
    } catch (error) {
      showToast(error.message || 'No se pudo guardar el escudo.', true);
    }
  }

  function serializeState(full) {
    const base = {
      schemaVersion: SCHEMA_VERSION,
      name: state.name,
      baseTeamId: state.baseTeamId,
      formationId: state.formationId,
      budget: state.budget,
      customTeam: state.customTeam ? { ...state.customTeam } : null,
      slots: Object.fromEntries(Object.entries(state.fieldSlots).map(([slotId, slot]) => [slotId, {
        slotId, x:Math.round(clampCoordinate(slot.x)*10)/10, y:Math.round(clampCoordinate(slot.y)*10)/10,
        role:String(slot.role || formationSlot(slotId)?.position || ''), locked:!!slot.locked,
      }])),
      xi: Object.fromEntries(Object.entries(state.xi).map(([slotId, item]) => [slotId, {
        playerId: String(item.playerId), originTeamId: String(item.originTeamId || ''), estimatedTransferFee: Number(item.estimatedTransferFee) || 0,
      }])),
      bench: state.bench.filter(Boolean).map(item => ({ playerId: String(item.playerId), originTeamId: String(item.originTeamId || ''), estimatedTransferFee: Number(item.estimatedTransferFee) || 0 })),
      databaseVersion: state.data && state.data.databaseVersion,
      customPlayers: selectedCustomPlayers(),
    };
    if (full) {
      base.id = state.currentSaveId;
      base.createdAt = state.createdAt || new Date().toISOString();
      base.modifiedAt = new Date().toISOString();
    }
    return base;
  }

  function compactShareState() {
    const sharedTeam = state.customTeam ? { ...state.customTeam, crestRef:{ type:'none' } } : undefined;
    return {
      v: SCHEMA_VERSION, t: state.baseTeamId || undefined, f: state.formationId, n: state.name !== 'Mi alineación' ? state.name : undefined,
      b: state.budget == null ? undefined : Math.round(state.budget / 1e6),
      l: Object.entries(state.fieldSlots).map(([slotId,slot]) => [slotId,Math.round(clampCoordinate(slot.x)*10)/10,Math.round(clampCoordinate(slot.y)*10)/10,String(slot.role || ''),slot.locked ? 1 : 0]),
      x: Object.entries(state.xi).map(([slotId,item]) => [slotId,String(item.playerId),String(item.originTeamId || ''),Number(item.estimatedTransferFee) || 0]),
      s: state.bench.filter(Boolean).map(item => [String(item.playerId),String(item.originTeamId || ''),Number(item.estimatedTransferFee) || 0]),
      c: selectedCustomPlayers().map(({ imageRef, ...player }) => ({ ...player, imageRef: imageRef && imageRef.type === 'url' ? imageRef : { type:'none' } })),
      ct: sharedTeam,
    };
  }

  function selectedCustomPlayers() {
    const ids = new Set(allAssignments().map(item => String(item.playerId)));
    return Array.from(state.customPlayersById.values()).filter(player => ids.has(String(player.id))).map(({ miniface, pes2018Miniface, clubIds, teamIds, clubId, ...player }) => ({ ...player }));
  }

  function importCustomPlayers(players) {
    (Array.isArray(players) ? players : []).forEach(raw => {
      if (!raw || !String(raw.id || '').startsWith('custom_')) return;
      const existing = state.customPlayersById.get(String(raw.id));
      state.customPlayersById.set(String(raw.id), { ...existing, ...raw, id:String(raw.id), custom:true, secondaryPositions:Array.isArray(raw.secondaryPositions) ? raw.secondaryPositions : [], clubIds:[], teamIds:[], clubId:'', miniface:'img/players/default.webp', pes2018Miniface:'' });
    });
    saveCustomPlayers();
  }

  function normalizeAssignment(raw, slotId, formation) {
    if (!raw || raw.playerId == null) return null;
    const slot = slotId ? formationSlot(slotId, formation || currentFormation()) : null;
    const normalized = { playerId: String(raw.playerId), originTeamId: String(raw.originTeamId || ''), estimatedTransferFee: Number(raw.estimatedTransferFee) || valueApi.estimatedTransferFee(getPlayer(raw.playerId)) };
    if (slotId) {
      normalized.x = Number.isFinite(Number(raw.x)) ? clampCoordinate(raw.x) : (slot ? slot.x : 50);
      normalized.y = Number.isFinite(Number(raw.y)) ? clampCoordinate(raw.y) : (slot ? slot.y : 50);
    }
    return normalized;
  }

  function loadState(raw, options) {
    const version = Number(raw && raw.schemaVersion);
    if (!raw || ![1, 2, 3, SCHEMA_VERSION].includes(version)) throw new Error('Versión de alineación no compatible.');
    importCustomPlayers(raw.customPlayers);
    const formation = formationsApi.byId[raw.formationId] || formationsApi.formations[0];
    const validSlots = new Set(formation.slots.map(slot => slot.id));
    const seen = new Set();
    const xi = {};
    Object.entries(raw.xi || {}).forEach(([slotId,item]) => {
      const normalized = normalizeAssignment(item, slotId, formation);
      if (!validSlots.has(slotId) || !normalized || seen.has(normalized.playerId)) return;
      seen.add(normalized.playerId);
      xi[slotId] = normalized;
    });
    const fieldSlots = createFieldSlots(formation);
    Object.entries(raw.slots || {}).forEach(([slotId, item]) => {
      const base = fieldSlots[slotId];
      if (!base || !item) return;
      base.x = base.locked ? base.x : (Number.isFinite(Number(item.x)) ? clampCoordinate(item.x) : base.x);
      base.y = base.locked ? base.y : (Number.isFinite(Number(item.y)) ? clampCoordinate(item.y) : base.y);
      base.role = String(item.role || base.role); base.locked = base.role === 'GK' || !!item.locked;
    });
    if (version < 4) Object.entries(raw.xi || {}).forEach(([slotId,item]) => {
      const base = fieldSlots[slotId]; if (!base || base.locked) return;
      if (Number.isFinite(Number(item.x))) base.x = clampCoordinate(item.x);
      if (Number.isFinite(Number(item.y))) base.y = clampCoordinate(item.y);
    });
    const bench = [];
    (raw.bench || []).forEach(item => {
      const normalized = normalizeAssignment(item);
      if (!normalized || seen.has(normalized.playerId) || bench.length >= MAX_BENCH) return;
      seen.add(normalized.playerId);
      bench.push(normalized);
    });
    state.name = String(raw.name || 'Mi alineación').slice(0,60);
    state.customTeam = raw.customTeam && String(raw.customTeam.id || '').startsWith('custom_team_') ? { ...raw.customTeam, custom:true, playerIds:[] } : null;
    state.baseTeamId = state.customTeam && String(raw.baseTeamId) === String(state.customTeam.id) ? state.customTeam.id : state.teamsById.has(String(raw.baseTeamId || '')) ? String(raw.baseTeamId) : '';
    state.formationId = formation.id;
    state.budget = Number.isFinite(Number(raw.budget)) && raw.budget !== '' && raw.budget != null ? Number(raw.budget) : null;
    state.xi = xi;
    state.fieldSlots = fieldSlots;
    state.bench = [...bench, ...Array(MAX_BENCH - bench.length).fill(null)];
    state.selectedPlayerId = '';
    state.selectedTarget = null;
    state.currentSaveId = options && options.id ? String(options.id) : '';
    state.createdAt = options && options.createdAt ? options.createdAt : '';
    syncControls();
    commit(false);
  }

  function parseCompactState(compact) {
    const version = Number(compact && compact.v);
    if (!compact || ![1, 2, 3, SCHEMA_VERSION].includes(version)) throw new Error('Enlace de alineación no compatible.');
    return {
      schemaVersion: SCHEMA_VERSION,
      name: compact.n || 'Mi alineación',
      baseTeamId: compact.t || '',
      formationId: compact.f || '4-2-3-1',
      budget: compact.b == null ? null : Number(compact.b) * 1e6,
      xi: Object.fromEntries((compact.x || []).map(item => [item[0], { playerId:item[1], originTeamId:item[2], estimatedTransferFee:item[3], x:item[4], y:item[5] }])),
      slots: Object.fromEntries((compact.l || []).map(item => [item[0], { slotId:item[0], x:item[1], y:item[2], role:item[3], locked:!!item[4] }])),
      bench: (compact.s || []).map(item => ({ playerId:item[0], originTeamId:item[1], estimatedTransferFee:item[2] })),
      customPlayers: compact.c || [],
      customTeam: compact.ct || null,
    };
  }

  function safeStorageGet(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_error) { return fallback; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_error) { return false; }
  }

  function commit(saveDraft = true) {
    renderAll();
    if (saveDraft) safeStorageSet(DRAFT_KEY, serializeState(false));
  }

  function syncControls() {
    if (state.customTeam) state.teamLabelToId.set(teamLabel(state.customTeam), state.customTeam.id);
    el['builder-name'].value = state.name;
    el['builder-formation'].value = state.formationId;
    el['builder-budget'].value = state.budget == null ? '' : String(state.budget / 1e6);
    el['builder-team'].value = teamLabel(getTeam(state.baseTeamId));
    if (state.data) filterTeamOptions();
    renderTeamLineupActions();
  }

  function teamDefaultLineup() {
    const lineup = getTeam(state.baseTeamId)?.defaultLineup;
    return lineup && Array.isArray(lineup.xi) && lineup.xi.length === 11 ? lineup : null;
  }

  function inferDefaultFormation(lineup) {
    if (!lineup) return currentFormation();
    return formationsApi.formations.map(formation => ({ formation, score: lineup.xi.reduce((sum, item) => {
      const nearest = formation.slots.map(slot => Math.hypot(slot.x - item.x, slot.y - item.y) + (slot.position === item.position ? 0 : positionFamily(slot.position) === positionFamily(item.position) ? 18 : 42)).sort((a,b) => a-b)[0] || 100;
      return sum + nearest;
    }, 0) })).sort((a,b) => a.score - b.score)[0].formation;
  }

  function renderTeamLineupActions() {
    const lineup = teamDefaultLineup();
    const visible = !!state.baseTeamId && !getTeam(state.baseTeamId)?.custom;
    el['builder-team-lineup-actions'].hidden = !visible;
    if (!visible) return;
    if (lineup) {
      el['builder-team-lineup-copy'].textContent = 'XI y suplentes registrados en la Base de Datos.';
      el['builder-load-team-lineup'].hidden = false;
      el['builder-restore-team-lineup'].hidden = false;
    } else {
      el['builder-team-lineup-copy'].textContent = 'Este equipo no tiene una alineación predeterminada registrada.';
      el['builder-load-team-lineup'].hidden = true;
      el['builder-restore-team-lineup'].hidden = true;
    }
  }

  function loadTeamLineup(confirmReplace) {
    const lineup = teamDefaultLineup();
    if (!lineup) { showToast('No hay una alineación predeterminada para este equipo.', true); return; }
    if (confirmReplace && allAssignments().length && !window.confirm('Esto reemplazará el XI y los suplentes actuales por la alineación registrada del equipo. ¿Continuar?')) return;
    const formation = inferDefaultFormation(lineup);
    const available = new Set(formation.slots.map(slot => slot.id));
    const xi = {};
    lineup.xi.forEach(item => {
      const candidates = formation.slots.filter(slot => available.has(slot.id)).map(slot => ({ slot, score: Math.hypot(slot.x-item.x,slot.y-item.y) + (slot.position === item.position ? 0 : positionFamily(slot.position) === positionFamily(item.position) ? 18 : 45) })).sort((a,b) => a.score-b.score);
      const selected = candidates[0];
      if (!selected) return;
      available.delete(selected.slot.id);
      xi[selected.slot.id] = { ...createAssignment(item.playerId), baseSlot:selected.slot.id };
      selected.item = item;
    });
    state.formationId = formation.id;
    state.xi = xi;
    state.fieldSlots = createFieldSlots(formation);
    lineup.xi.forEach(item => {
      const entry = Object.entries(xi).find(([,assignment]) => String(assignment.playerId) === String(item.playerId));
      if (!entry || state.fieldSlots[entry[0]].locked) return;
      state.fieldSlots[entry[0]].x = clampCoordinate(item.x); state.fieldSlots[entry[0]].y = clampCoordinate(item.y);
    });
    state.bench = Array(MAX_BENCH).fill(null);
    state.bench = (lineup.benchPlayerIds || []).filter(id => !assignmentForPlayer(id)).slice(0,MAX_BENCH).map(id => createAssignment(id));
    state.bench.push(...Array(MAX_BENCH - state.bench.length).fill(null));
    state.selectedPlayerId = ''; state.selectedTarget = '';
    syncControls(); commit();
    showToast('XI y suplentes cargados desde la Base de Datos.');
  }

  function saveLineup() {
    state.name = el['builder-name'].value.trim() || 'Mi alineación';
    const saves = safeStorageGet(STORAGE_KEY, []);
    const now = new Date().toISOString();
    if (!state.currentSaveId) {
      state.currentSaveId = `squad-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      state.createdAt = now;
    }
    const saved = serializeState(true);
    const index = saves.findIndex(item => item && item.id === state.currentSaveId);
    if (index >= 0) saves[index] = saved;
    else saves.unshift(saved);
    if (!safeStorageSet(STORAGE_KEY, saves.slice(0,50))) {
      showToast('No se pudo guardar en este navegador.', true);
      return;
    }
    safeStorageSet(DRAFT_KEY, serializeState(false));
    showToast('Alineación guardada en este navegador.');
  }

  function renderSavedList() {
    const saves = safeStorageGet(STORAGE_KEY, []);
    el['builder-saved-list'].innerHTML = saves.length ? saves.map(item => {
      const team = item.customTeam && String(item.customTeam.id) === String(item.baseTeamId) ? item.customTeam : getTeam(item.baseTeamId);
      const date = item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString('es-AR') : '';
      return `<div class="builder-saved-item" data-save-id="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.name || 'Sin nombre')}</strong><small>${escapeHtml(team ? team.name : 'Sin equipo')} · ${escapeHtml(item.formationId || '')}${date ? ` · ${date}` : ''}</small></span><button type="button" data-save-action="load">Cargar</button><button type="button" class="danger" data-save-action="delete">Eliminar</button></div>`;
    }).join('') : '<p class="builder-dialog-copy">Todavía no guardaste ninguna alineación.</p>';
  }

  function openSavedDialog() {
    renderSavedList();
    if (typeof el['builder-saved-dialog'].showModal === 'function') el['builder-saved-dialog'].showModal();
    else el['builder-saved-dialog'].setAttribute('open','');
  }

  function shareLineup() {
    const hasLocalImages = selectedCustomPlayers().some(player => ['idb','inline'].includes(player.imageRef?.type)) || ['idb','inline'].includes(state.customTeam?.crestRef?.type);
    if (hasLocalImages && !window.confirm('Las fotos y escudos subidos desde tu dispositivo no se incluirán en el enlace compartido. ¿Crear enlace de todos modos?')) return;
    const encoded = encodeShareState(compactShareState());
    const url = `${location.origin}/alineaciones.html#s=${encoded}`;
    history.replaceState(null, '', url);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => showToast('Enlace copiado al portapapeles.')).catch(() => window.prompt('Copiá este enlace:', url));
    } else {
      window.prompt('Copiá este enlace:', url);
    }
  }

  function playerDialogCandidates() {
    const term = normalize(el['builder-dialog-query'].value);
    const baseIds = new Set(state.baseTeamId ? (getTeam(state.baseTeamId)?.playerIds || []) : []);
    const ordered = state.baseTeamId
      ? [...baseIds].map(getPlayer).concat(Array.from(state.customPlayersById.values()), state.data.players.filter(player => !baseIds.has(player.id)))
      : [...state.customPlayersById.values(), ...state.data.players];
    return ordered.filter(player => !term || normalize(player.name).includes(term)).slice(0, SEARCH_LIMIT);
  }

  function renderPlayerDialog() {
    const candidates = playerDialogCandidates();
    el['builder-dialog-list'].innerHTML = candidates.map(player => playerRowMarkup(player, state.baseTeamId ? 'squad' : 'search')).join('') || '<p class="builder-dialog-copy">No hay coincidencias.</p>';
    refreshMinifaces(el['builder-dialog-list']);
  }

  function openPlayerDialog(target) {
    dialogTarget = target;
    const slot = target.area === 'xi' ? currentFormation().slots.find(item => item.id === target.id) : null;
    el['builder-player-dialog-title'].textContent = slot ? `Jugador para ${slot.position}` : 'Jugador suplente';
    el['builder-dialog-query'].value = '';
    renderPlayerDialog();
    if (typeof el['builder-player-dialog'].showModal === 'function') el['builder-player-dialog'].showModal();
    else el['builder-player-dialog'].setAttribute('open','');
    window.setTimeout(() => el['builder-dialog-query'].focus(), 40);
  }

  function closePlayerDialog() {
    dialogTarget = null;
    if (el['builder-player-dialog'].open && typeof el['builder-player-dialog'].close === 'function') el['builder-player-dialog'].close();
    else el['builder-player-dialog'].removeAttribute('open');
  }

  function highlightLocation(location) {
    const selector = `[data-target-area="${location.area}"][data-target-id="${location.id}"]`;
    const target = document.querySelector(selector);
    if (!target) return;
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeMobilePanels() {
    document.querySelectorAll('[data-builder-panel]').forEach(panel => panel.classList.remove('is-mobile-open'));
    document.querySelectorAll('[data-mobile-panel]').forEach(button => button.setAttribute('aria-pressed','false'));
  }

  function toggleMobilePanel(name) {
    const players = document.querySelector('[data-builder-panel="players"]');
    const summary = document.querySelector('[data-builder-panel="summary"]');
    const requested = name === 'summary' ? summary : players;
    const wasOpen = requested.classList.contains('is-mobile-open') &&
      (name === 'summary' || document.querySelector(`[data-player-tab="${name}"]`)?.getAttribute('aria-selected') === 'true');
    closeMobilePanels();
    if (wasOpen) return;
    requested.classList.add('is-mobile-open');
    document.querySelector(`[data-mobile-panel="${name}"]`)?.setAttribute('aria-pressed','true');
    if (name === 'squad' || name === 'search') selectPlayerTab(name);
  }

  function selectPlayerTab(name) {
    document.querySelectorAll('[data-player-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.playerTab === name)));
    document.querySelectorAll('[data-player-view]').forEach(view => { view.hidden = view.dataset.playerView !== name; });
  }

  function changeFormation(nextId) {
    const oldFormation = currentFormation();
    const nextFormation = formationsApi.byId[nextId] || formationsApi.formations[0];
    if (oldFormation.id !== nextFormation.id) {
      const allPlayers = new Map([...state.playersById, ...state.customPlayersById]);
      state.xi = remapAssignments(state.xi, oldFormation, nextFormation, allPlayers);
      state.fieldSlots = createFieldSlots(nextFormation);
    }
    state.formationId = nextFormation.id;
    commit();
  }

  function pitchCoordinates(clientX, clientY) {
    const rect = el['builder-pitch'].getBoundingClientRect();
    return {
      x: clampCoordinate((clientX - rect.left) / rect.width * 100),
      y: clampCoordinate((clientY - rect.top) / rect.height * 100),
    };
  }

  function snapCoordinates(x, y, playerId) {
    const tolerance = 1.25;
    let nextX = clampCoordinate(x), nextY = clampCoordinate(y);
    const candidatesX = [50, ...currentFormation().slots.map(slot => slot.x)];
    const candidatesY = currentFormation().slots.map(slot => slot.y);
    Object.entries(state.xi).forEach(([slotId, assignment]) => {
      if (String(assignment.playerId) === String(playerId)) return;
      const point = assignmentCoordinates(slotId, assignment); candidatesX.push(point.x); candidatesY.push(point.y);
    });
    const close = (value, candidates) => candidates.reduce((best, candidate) => Math.abs(candidate-value) < Math.abs(best-value) ? candidate : best, value);
    const targetX = close(nextX,candidatesX), targetY = close(nextY,candidatesY);
    if (Math.abs(targetX-nextX) <= tolerance) nextX = targetX;
    if (Math.abs(targetY-nextY) <= tolerance) nextY = targetY;
    return {x:nextX,y:nextY};
  }

  function showDragGuides(x, y, playerId) {
    if (state.guideMode === 'hidden') return;
    const overlay = el['builder-guides-overlay'];
    if (!overlay) return;
    const activeSlot = pointerDrag && pointerDrag.playerId === String(playerId) ? pointerDrag.slot : null;
    const activeCard = activeSlot && activeSlot.querySelector('.builder-slot-card');
    const ghostAssignment = assignmentForPlayer(playerId)?.assignment || createAssignment(playerId);
    const lane = x < 20 ? 'BANDA IZQUIERDA' : x < 40 ? 'HALF-SPACE IZQ.' : x < 60 ? 'CENTRO' : x < 80 ? 'HALF-SPACE DER.' : 'BANDA DERECHA';
    const third = y < 33.333 ? 'ATAQUE' : y < 66.666 ? 'MEDIO' : 'DEFENSA';
    const labelX = Math.min(82, Math.max(18, x));
    const lines = [
      `<span class="builder-guide-line vertical primary" style="left:${x}%"></span>`,
      `<span class="builder-guide-line horizontal primary" style="top:${y}%"></span>`,
      `<span class="builder-guide-crosshair" style="left:${x}%;top:${y}%"></span>`,
      `<span class="builder-guide-zone" style="left:${labelX}%;top:${Math.min(94, y + 7)}%">${third} · ${lane}</span>`,
    ];
    lines.push(`<span class="builder-drag-preview" style="left:${x}%;top:${y}%">${activeCard ? activeCard.outerHTML : slotCardMarkup(ghostAssignment, false)}</span>`);
    const tolerance = 1.5;
    Object.entries(state.xi).forEach(([slotId, assignment]) => {
      if (String(assignment.playerId) === String(playerId)) return;
      const point = assignmentCoordinates(slotId, assignment);
      if (Math.abs(point.x-x) <= tolerance) lines.push(`<span class="builder-guide-line vertical alignment" style="left:${point.x}%"></span>`);
      if (Math.abs(point.y-y) <= tolerance) lines.push(`<span class="builder-guide-line horizontal alignment" style="top:${point.y}%"></span>`);
    });
    overlay.innerHTML = lines.join('');
    if (!activeCard && nativeDrag?.imageSrc) {
      const previewImage = overlay.querySelector('.builder-drag-preview img');
      if (previewImage) previewImage.src = nativeDrag.imageSrc;
    }
    el['builder-pitch'].classList.add('is-guiding');
  }
  function clearDragGuides() {
    if (el['builder-guides-overlay']) el['builder-guides-overlay'].innerHTML = '';
    el['builder-pitch'].classList.remove('is-guiding');
  }

  function applyUiPreferences() {
    const preferences = safeStorageGet(UI_KEY, {});
    state.guideMode = ['auto','always','hidden'].includes(preferences.guideMode) ? preferences.guideMode : 'auto';
    state.playerPanelMinimized = !!preferences.playerPanelMinimized;
    el['builder-guides'].value = state.guideMode;
    document.querySelector('.builder-workspace').classList.toggle('is-player-panel-minimized', state.playerPanelMinimized);
    document.querySelector('.builder-player-panel').classList.toggle('is-minimized', state.playerPanelMinimized);
    el['builder-panel-collapse'].setAttribute('aria-expanded', String(!state.playerPanelMinimized));
    el['builder-panel-collapse'].setAttribute('aria-label', state.playerPanelMinimized ? 'Expandir panel de jugadores' : 'Minimizar panel de jugadores');
    el['builder-panel-collapse'].title = state.playerPanelMinimized ? 'Expandir panel' : 'Minimizar panel';
    el['builder-pitch'].classList.toggle('guides-always', state.guideMode === 'always');
  }
  function saveUiPreferences() { safeStorageSet(UI_KEY, { guideMode:state.guideMode, playerPanelMinimized:state.playerPanelMinimized }); }

  function setBaseTeamFromInput() {
    const typed = el['builder-team'].value.trim();
    if (normalize(typed) === normalize('Sin equipo')) {
      state.baseTeamId = '';
      state.selectedPlayerId = '';
      state.selectedTarget = null;
      el['builder-team'].value = '';
      renderTeamLineupActions();
      commit();
      return;
    }
    let teamId = state.teamLabelToId.get(typed) || '';
    if (!teamId && typed) {
      const match = Array.from(state.teamLabelToId.entries()).find(([label]) => normalize(label) === normalize(typed));
      teamId = match ? match[1] : '';
    }
    if (typed && !teamId) return;
    state.baseTeamId = teamId;
    const team = getTeam(teamId);
    if (team && !team.custom && Array.isArray(team.leagueIds) && team.leagueIds[0]) el['builder-league'].value = team.leagueIds[0];
    state.selectedPlayerId = '';
    state.selectedTarget = null;
    renderTeamLineupActions();
    commit();
  }

  async function imageForExport(player) {
    if (player.custom) {
      const ref = player.imageRef || {};
      if (ref.type === 'idb') {
        try { const blob = await getCustomImage(ref.key || player.id); if (blob) return await new Promise((resolve, reject) => { const image = new Image(); const url = URL.createObjectURL(blob); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(); }; image.src = url; }); } catch (_error) {}
      }
      if (ref.type === 'url') {
        try { return await new Promise((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = reject; image.src = ref.url; }); } catch (_error) {}
      }
      if (ref.type === 'inline' && /^data:image\//i.test(ref.data || '')) {
        try { return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = ref.data; }); } catch (_error) {}
      }
      return null;
    }
    const source = root.LAQPMinifaces ? root.LAQPMinifaces.sourceFor(player.id, root.LAQPMinifaces.getMode()) : player.miniface;
    const fallbacks = [source, player.miniface, 'img/players/default.webp'];
    for (const path of [...new Set(fallbacks.filter(Boolean))]) {
      try {
        const image = await new Promise((resolve, reject) => {
          const candidate = new Image();
          candidate.crossOrigin = 'anonymous';
          candidate.onload = () => resolve(candidate);
          candidate.onerror = reject;
          candidate.src = new URL(path, document.baseURI).href;
        });
        return image;
      } catch (_error) {}
    }
    return null;
  }

  async function loadExportImage(path) {
    if (!path) return null;
    try { return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = new URL(path, document.baseURI).href; }); } catch (_error) { return null; }
  }

  async function teamCrestForExport(team) {
    if (!team) return null;
    if (team.custom && team.crestRef?.type === 'idb') {
      try {
        const blob = await getCustomImage(team.crestRef.key || `crest_${team.id}`);
        if (blob) return await new Promise((resolve, reject) => {
          const image = new Image();
          const url = URL.createObjectURL(blob);
          image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
          image.onerror = () => { URL.revokeObjectURL(url); reject(); };
          image.src = url;
        });
      } catch (_error) {}
    }
    if (team.custom && team.crestRef?.type === 'inline' && /^data:image\//i.test(team.crestRef.data || '')) {
      try { return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = team.crestRef.data; }); } catch (_error) {}
    }
    return loadExportImage(team.crest || 'img/teams/default.webp');
  }

  function fitCanvasText(ctx, text, maxWidth, startSize, weight) {
    let size = startSize;
    do { ctx.font = `${weight || 700} ${size}px Arial, sans-serif`; size -= 1; } while (size > 12 && ctx.measureText(text).width > maxWidth);
  }

  function drawExportPitch(ctx, pitch) {
    const gradient = ctx.createLinearGradient(0,pitch.y,0,pitch.y+pitch.h);
    gradient.addColorStop(0,'#1b6246'); gradient.addColorStop(1,'#0b3529');
    ctx.fillStyle = gradient; ctx.fillRect(pitch.x,pitch.y,pitch.w,pitch.h);
    ctx.fillStyle = 'rgba(255,255,255,.018)';
    for (let index = 0; index < 8; index += 2) ctx.fillRect(pitch.x + pitch.w * index / 8,pitch.y,pitch.w / 8,pitch.h);
    ctx.strokeStyle = 'rgba(240,248,242,.72)'; ctx.lineWidth = 3;
    ctx.strokeRect(pitch.x,pitch.y,pitch.w,pitch.h);
    ctx.beginPath(); ctx.moveTo(pitch.x,pitch.y+pitch.h/2); ctx.lineTo(pitch.x+pitch.w,pitch.y+pitch.h/2); ctx.stroke();
    ctx.beginPath(); ctx.arc(pitch.x+pitch.w/2,pitch.y+pitch.h/2,pitch.w*.12,0,Math.PI*2); ctx.stroke();
    const areaW = pitch.w * .54, areaH = pitch.h * .16, smallW = pitch.w * .25, smallH = pitch.h * .075;
    ctx.strokeRect(pitch.x+(pitch.w-areaW)/2,pitch.y,areaW,areaH);
    ctx.strokeRect(pitch.x+(pitch.w-areaW)/2,pitch.y+pitch.h-areaH,areaW,areaH);
    ctx.strokeRect(pitch.x+(pitch.w-smallW)/2,pitch.y,smallW,smallH);
    ctx.strokeRect(pitch.x+(pitch.w-smallW)/2,pitch.y+pitch.h-smallH,smallW,smallH);
    ctx.fillStyle = 'rgba(240,248,242,.74)';
    ctx.beginPath(); ctx.arc(pitch.x+pitch.w/2,pitch.y+pitch.h*.11,3,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(pitch.x+pitch.w/2,pitch.y+pitch.h*.89,3,0,Math.PI*2); ctx.fill();
  }

  function drawExportPlayerHud(ctx, x, y, player, assignment, image, options, scale) {
    const size = 78 * scale, half = size / 2, plate = 60 * scale, font = Math.max(9, 16 * scale);
    if (image) ctx.drawImage(image,x-half,y-size*.64,size,size);
    if (options.name) { ctx.fillStyle = 'rgba(8,12,15,.95)'; ctx.fillRect(x-plate,y+size*.3,plate*2,27*scale); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; fitCanvasText(ctx, player.name, plate*2-10, font, 800); ctx.fillText(player.name,x,y+size*.3+19*scale); }
    if (options.overall) { ctx.fillStyle = 'rgba(8,12,15,.96)'; ctx.fillRect(x-plate+2*scale,y-size*.62,28*scale,22*scale); ctx.fillStyle = '#fff'; ctx.font = `800 ${14*scale}px Arial, sans-serif`; ctx.fillText(player.overall || '—',x-plate+16*scale,y-size*.35); }
    if (options.position) { ctx.fillStyle = 'rgba(8,12,15,.96)'; ctx.fillRect(x+plate-30*scale,y-size*.62,28*scale,22*scale); ctx.fillStyle = '#43e3d3'; ctx.font = `800 ${11*scale}px Arial, sans-serif`; ctx.fillText(player.position || '—',x+plate-16*scale,y-size*.35); }
    if (options.transfer && isTransfer(assignment)) { ctx.fillStyle = '#21d4c2'; ctx.fillRect(x+plate-24*scale,y-size*.15,20*scale,19*scale); ctx.fillStyle = '#111'; ctx.font = `900 ${13*scale}px Arial, sans-serif`; ctx.fillText('€',x+plate-14*scale,y+size*.09); }
  }

  function exportSettings() {
    const options = {}; document.querySelectorAll('[data-export-option]').forEach(input => { options[input.dataset.exportOption] = input.checked; });
    return { format:el['builder-export-format'].value, title:el['builder-export-title'].value.trim() || state.name || 'Mi alineación', subtitle:el['builder-export-subtitle'].value.trim(), options };
  }
  function openExportDialog() {
    const team = getTeam(state.baseTeamId);
    const teamContext = team ? `${displayTeamName(team.name)}${team.custom && team.leagueName ? ` · ${displayTeamName(team.leagueName)}` : ''}` : 'Sin equipo base';
    el['builder-export-title'].value = state.name || 'Mi alineación'; el['builder-export-subtitle'].value = `${teamContext} · ${currentFormation().name}${hasCustomLayout() ? ' · Personalizada' : ''}`;
    renderExportPreview(); el['builder-export-dialog'].showModal();
  }
  function renderExportPreview() { const setting = exportSettings(); const formats = {vertical:'1080×1350',square:'1080×1080',horizontal:'1920×1080'}; const optionalCount = Object.values(setting.options).filter(Boolean).length; el['builder-export-preview'].textContent = `${formats[setting.format]} · ${setting.title} · ${optionalCount} elementos configurables · marca LAQP incluida.`; }

  async function exportPng(settings, previewOnly = false) {
    const setting = settings || exportSettings();
    el['builder-export'].disabled = true;
    el['builder-export'].textContent = 'Exportando…';
    try {
      const canvas = document.createElement('canvas');
      const formats = { vertical:[1080,1350], square:[1080,1080], horizontal:[1920,1080] };
      [canvas.width,canvas.height] = formats[setting.format] || formats.vertical;
      const width = canvas.width, height = canvas.height, horizontal = width > height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0,0,width,height);
      const margin = horizontal ? 82 : 62, headerH = horizontal ? 150 : 168, footerH = horizontal ? 112 : 148;
      const team = getTeam(state.baseTeamId);
      const teamContext = team ? `${displayTeamName(team.name)}${team.custom && team.leagueName ? ` · ${displayTeamName(team.leagueName)}` : ''}` : 'Sin equipo base';
      const subtitle = setting.subtitle || `${teamContext} · ${currentFormation().name}${hasCustomLayout() ? ' · Personalizada' : ''}`;
      const crestSize = horizontal ? 72 : 76;
      const rightEdge = width - margin;
      const rightBlockWidth = setting.options.crest && team ? crestSize + 170 : 170;
      const leftMaxWidth = width - margin * 2 - rightBlockWidth - 72;
      ctx.fillStyle = '#21d4c2'; ctx.fillRect(margin,42,7,headerH-56);
      ctx.fillStyle = '#f5f5f5'; ctx.textAlign = 'left'; fitCanvasText(ctx, setting.title, leftMaxWidth, horizontal ? 42 : 43, 800); ctx.fillText(setting.title,margin+28,88);
      ctx.fillStyle = '#b8b8b8'; fitCanvasText(ctx, subtitle, leftMaxWidth, 21, 600); ctx.fillText(subtitle,margin+28,126);
      ctx.strokeStyle = 'rgba(33,212,194,.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rightEdge-rightBlockWidth-18,45); ctx.lineTo(rightEdge-rightBlockWidth-18,headerH-31); ctx.stroke();
      let brandRight = rightEdge;
      if (setting.options.crest && team) {
        const crest = await teamCrestForExport(team);
        if (crest) {
          const crestX = rightEdge - crestSize;
          ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fillRect(crestX-7,43,crestSize+14,crestSize+14);
          ctx.drawImage(crest,crestX,50,crestSize,crestSize);
          brandRight = crestX - 19;
        }
      }
      ctx.textAlign = 'right'; ctx.fillStyle = '#21d4c2'; ctx.font = '800 22px Arial, sans-serif'; ctx.fillText('LAQP.website',brandRight,78);
      ctx.fillStyle = '#7e8994'; ctx.font = '600 13px Arial, sans-serif'; ctx.fillText('Creador de alineaciones',brandRight,101);
      ctx.textAlign = 'left';
      const benchH = setting.options.bench && state.bench.filter(Boolean).length ? (horizontal ? 78 : 104) : 0;
      const usableH = height - headerH - footerH - benchH - 28, usableW = width - margin*2;
      const pitchH = horizontal ? usableH : Math.min(usableH, usableW / .68);
      const pitchW = pitchH * .68;
      const pitch = { x:(width-pitchW)/2, y:headerH, w:pitchW, h:pitchH };
      drawExportPitch(ctx, pitch);

      const assignments = currentFormation().slots.map(slot => ({ slot, assignment: state.xi[slot.id] })).filter(item => item.assignment);
      const loaded = await Promise.all(assignments.map(async item => ({ ...item, image: await imageForExport(getPlayer(item.assignment.playerId)) })));
      loaded.forEach(({ slot, assignment, image }) => {
        const player = getPlayer(assignment.playerId);
        const coordinates = assignmentCoordinates(slot.id, assignment);
        const x = pitch.x + pitch.w * coordinates.x / 100;
        const y = pitch.y + pitch.h * coordinates.y / 100;
        drawExportPlayerHud(ctx, x, y, player, assignment, image, setting.options, Math.max(.62, Math.min(1, pitch.w / 820)));
      });
      if (benchH) {
        const bench = state.bench.filter(Boolean); const cell = Math.min(110, (width-margin*2) / Math.max(bench.length, 1));
        bench.forEach((assignment, index) => { const player = getPlayer(assignment.playerId); const x = margin + cell * index + cell/2; const y = pitch.y + pitch.h + 16; ctx.fillStyle='rgba(18,24,30,.95)'; ctx.fillRect(x-cell/2+2,y,cell-4,benchH-13); ctx.textAlign='center'; ctx.fillStyle='#dce2e8'; fitCanvasText(ctx,player.name,cell-10,11,800); ctx.fillText(player.name,x,y+22); ctx.fillStyle='#21d4c2'; ctx.font='800 11px Arial'; ctx.fillText(`${player.position || '—'} · ${player.overall || '—'}`,x,y+43); });
      }
      const xiPlayers = Object.values(state.xi).map(item => getPlayer(item.playerId));
      const validOveralls = xiPlayers.map(player => Number(player.overall)).filter(Number.isFinite);
      const validAges = xiPlayers.map(player => Number(player.age)).filter(Number.isFinite);
      const average = validOveralls.length ? validOveralls.reduce((sum,value) => sum + value,0) / validOveralls.length : 0;
      const averageAge = validAges.length ? validAges.reduce((sum,value) => sum + value,0) / validAges.length : 0;
      const transfers = allAssignments().filter(isTransfer);
      const valued = state.baseTeamId ? transfers : allAssignments();
      const spend = valued.reduce((sum, assignment) => sum + (Number(assignment.estimatedTransferFee) || valueApi.estimatedTransferFee(getPlayer(assignment.playerId))), 0);
      const footer = `XI ${xiPlayers.length}/11 · Media ${average ? average.toFixed(1) : '—'} · Edad ${averageAge ? averageAge.toFixed(1) : '—'} · Fichajes ${state.baseTeamId ? transfers.length : '—'} · ${valueApi.formatEstimatedMoney(spend)}`;
      const footerY = pitch.y + pitch.h + benchH;
      if (setting.options.summary) { ctx.textAlign = 'center'; ctx.fillStyle = '#f0f2f4'; fitCanvasText(ctx, footer, width-margin*2, horizontal ? 18 : 22, 700); ctx.fillText(footer,width/2,footerY+42); }
      ctx.fillStyle = '#21d4c2'; ctx.fillRect(margin,footerY+(setting.options.summary ? 66 : 24),width-margin*2,2); ctx.fillStyle = '#7e8994'; ctx.font = '500 16px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Creado con el Creador de alineaciones de LAQP.website',width/2,footerY+(setting.options.summary ? 107 : 62));
      ctx.textAlign = 'left';
      const outputUrl = canvas.toDataURL('image/png');
      if (previewOnly) {
        const preview = el['builder-export-preview'];
        preview.innerHTML = '';
        const image = document.createElement('img');
        image.src = outputUrl;
        image.alt = `Vista previa de ${setting.title}`;
        const copy = document.createElement('span');
        copy.textContent = 'Vista previa real · LAQP.website incluida obligatoriamente.';
        preview.append(image, copy);
        return;
      }
      const link = document.createElement('a');
      link.download = `${normalize(state.name || 'alineacion').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'alineacion'}-laqp.png`;
      link.href = outputUrl;
      link.click();
      showToast('PNG exportado correctamente.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo exportar la imagen. Revisá las minifaces e intentá otra vez.', true);
    } finally {
      el['builder-export'].disabled = false;
      el['builder-export'].textContent = 'Exportar PNG';
    }
  }

  function bindEvents() {
    el['builder-name'].addEventListener('input', () => { state.name = el['builder-name'].value.slice(0,60); safeStorageSet(DRAFT_KEY, serializeState(false)); });
    el['builder-team'].addEventListener('change', setBaseTeamFromInput);
    el['builder-team'].addEventListener('search', () => { if (!el['builder-team'].value) setBaseTeamFromInput(); });
    el['builder-league'].addEventListener('change', filterTeamOptions);
    el['builder-create-custom-team'].addEventListener('click', openCustomTeamDialog);
    el['builder-custom-team-form'].addEventListener('submit', saveCustomTeam);
    document.querySelectorAll('[data-close-custom-team]').forEach(button => button.addEventListener('click', closeCustomTeamDialog));
    el['builder-formation'].addEventListener('change', event => changeFormation(event.target.value));
    el['builder-reset-formation'].addEventListener('click', resetFormationLayout);
    el['builder-clear'].addEventListener('click', openClearDialog);
    el['builder-confirm-clear'].addEventListener('click', clearLineup);
    el['builder-budget'].addEventListener('input', () => { const amount = Number(el['builder-budget'].value); state.budget = el['builder-budget'].value === '' ? null : Math.max(0,amount*1e6); commit(); });
    el['builder-save'].addEventListener('click', saveLineup);
    el['builder-saved'].addEventListener('click', openSavedDialog);
    el['builder-share'].addEventListener('click', shareLineup);
    el['builder-export'].addEventListener('click', openExportDialog);
    el['builder-preview-export'].addEventListener('click', () => exportPng(exportSettings(), true));
    el['builder-confirm-export'].addEventListener('click', () => { if (el['builder-export-dialog'].open) el['builder-export-dialog'].close(); exportPng(exportSettings()); });
    el['builder-load-team-lineup'].addEventListener('click', () => loadTeamLineup(false));
    el['builder-restore-team-lineup'].addEventListener('click', () => loadTeamLineup(true));
    el['builder-guides'].addEventListener('change', () => { state.guideMode = el['builder-guides'].value; saveUiPreferences(); applyUiPreferences(); });
    el['builder-panel-collapse'].addEventListener('click', () => { state.playerPanelMinimized = !state.playerPanelMinimized; saveUiPreferences(); applyUiPreferences(); });
    el['builder-create-custom'].addEventListener('click', () => openCustomDialog());
    el['builder-manage-custom'].addEventListener('click', () => { renderCustomManager(); el['builder-custom-manager-dialog'].showModal(); });
    el['builder-custom-form'].addEventListener('submit', saveCustomPlayer);
    el['builder-delete-custom'].addEventListener('click', deleteCustomPlayer);
    el['builder-remove-custom-from-lineup'].addEventListener('click', removeCustomFromLineup);
    el['builder-send-custom-to-bench'].addEventListener('click', sendCustomToBench);
    document.querySelectorAll('[data-close-custom]').forEach(button => button.addEventListener('click', closeCustomDialog));
    document.querySelectorAll('[data-player-slot-action]').forEach(button => button.addEventListener('click', () => handlePlayerSlotAction(button.dataset.playerSlotAction)));
    el['builder-retry'].addEventListener('click', loadIndex);
    el['builder-squad-query'].addEventListener('input', renderSquad);
    [el['builder-global-query'],el['builder-global-team'],el['builder-global-overall']].forEach(input => input.addEventListener('input', renderSearch));
    el['builder-dialog-query'].addEventListener('input', renderPlayerDialog);

    document.addEventListener('click', event => {
      if (performance.now() < suppressPitchClickUntil && event.target.closest('.builder-slot')) {
        event.preventDefault();
        return;
      }
      if (event.target.closest('[data-close-mobile-panels]')) {
        closeMobilePanels();
        return;
      }
      const playerRow = event.target.closest('.builder-player-row');
      if (playerRow) {
        if (playerRow.closest('#builder-player-dialog')) state.selectedTarget = dialogTarget;
        handlePlayerChoice(playerRow.dataset.playerId);
        return;
      }
      const customAction = event.target.closest('[data-custom-action]');
      if (customAction) {
        const item = customAction.closest('[data-custom-id]'); const player = item && state.customPlayersById.get(item.dataset.customId);
        if (player) { if (el['builder-custom-manager-dialog'].open) el['builder-custom-manager-dialog'].close(); openCustomDialog(player); }
        return;
      }
      const target = event.target.closest('[data-target-area]');
      if (target) {
        handleTarget({ area: target.dataset.targetArea, id: target.dataset.targetId });
        return;
      }
      const pitch = event.target.closest('#builder-pitch');
      if (pitch && state.selectedPlayerId) {
        const coordinates = pitchCoordinates(event.clientX, event.clientY);
        placePlayerOnPitch(state.selectedPlayerId, coordinates.x, coordinates.y);
        return;
      }
      const lineFilter = event.target.closest('[data-line-filter]');
      if (lineFilter) {
        const scope = lineFilter.dataset.lineFilter;
        const value = lineFilter.dataset.line || '';
        if (scope === 'squad') state.squadLine = value;
        else state.globalLine = value;
        document.querySelectorAll(`[data-line-filter="${scope}"]`).forEach(button => button.setAttribute('aria-pressed', String(button === lineFilter)));
        if (scope === 'squad') renderSquad(); else renderSearch();
        return;
      }
      const tab = event.target.closest('[data-player-tab]');
      if (tab) selectPlayerTab(tab.dataset.playerTab);
      const mobileTab = event.target.closest('[data-mobile-panel]');
      if (mobileTab) toggleMobilePanel(mobileTab.dataset.mobilePanel);
      const savedAction = event.target.closest('[data-save-action]');
      if (savedAction) {
        const item = savedAction.closest('[data-save-id]');
        const saves = safeStorageGet(STORAGE_KEY, []);
        if (savedAction.dataset.saveAction === 'load') {
          const saved = saves.find(entry => entry.id === item.dataset.saveId);
          if (saved) {
            try { loadState(saved, saved); el['builder-saved-dialog'].close(); showToast('Alineación cargada.'); } catch (error) { showToast(error.message, true); }
          }
        } else {
          safeStorageSet(STORAGE_KEY, saves.filter(entry => entry.id !== item.dataset.saveId));
          if (state.currentSaveId === item.dataset.saveId) state.currentSaveId = '';
          renderSavedList();
        }
      }
    });

    document.addEventListener('dragstart', event => {
      const player = event.target.closest('[data-player-id]');
      const target = event.target.closest('[data-target-area]');
      const assignment = target ? assignmentAt({ area:target.dataset.targetArea, id:target.dataset.targetId }) : null;
      const playerId = assignment ? assignment.playerId : player && player.dataset.playerId;
      if (!playerId || !event.dataTransfer) return;
      if (target?.dataset.targetArea === 'xi' && state.fieldSlots[target.dataset.targetId]?.locked) {
        event.preventDefault();
        return;
      }
      const sourceImage = event.target.closest('[data-player-id], [data-target-area]')?.querySelector?.('img') || (event.target.tagName === 'IMG' ? event.target : null);
      nativeDrag = { playerId:String(playerId), imageSrc:sourceImage?.currentSrc || sourceImage?.src || '' };
      event.dataTransfer.setData('text/laqp-player-id', String(playerId));
      event.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragover', event => {
      if (event.target.closest('[data-target-area]') || event.target.closest('#builder-pitch')) event.preventDefault();
      if (nativeDrag && event.target.closest('#builder-pitch')) {
        const raw = pitchCoordinates(event.clientX,event.clientY);
        const coordinates = snapCoordinates(raw.x,raw.y,nativeDrag.playerId);
        showDragGuides(coordinates.x,coordinates.y,nativeDrag.playerId);
      }
    });
    document.addEventListener('dragend', () => { nativeDrag = null; clearDragGuides(); });
    document.addEventListener('drop', event => {
      const target = event.target.closest('[data-target-area]');
      const pitch = event.target.closest('#builder-pitch');
      if ((!target && !pitch) || !event.dataTransfer) return;
      event.preventDefault();
      const playerId = event.dataTransfer.getData('text/laqp-player-id');
      if (!playerId) return;
      nativeDrag = null;
      clearDragGuides();
      if (target && target.dataset.targetArea === 'bench') {
        placePlayer(playerId, { area:'bench', id:target.dataset.targetId });
      } else if (pitch) {
        const coordinates = pitchCoordinates(event.clientX, event.clientY);
        placePlayerOnPitch(playerId, coordinates.x, coordinates.y);
      }
    });

    document.addEventListener('pointerdown', event => {
      const slot = event.target.closest('[data-target-area][data-has-player="true"]');
      if (!slot || event.button !== 0) return;
      const sourceArea = slot.dataset.targetArea;
      const assignment = assignmentAt({ area:sourceArea, id:slot.dataset.targetId });
      if (!assignment) return;
      if (sourceArea === 'xi' && state.fieldSlots[slot.dataset.targetId]?.locked) {
        return;
      }
      pointerDrag = { pointerId:event.pointerId, slot, sourceArea, playerId:String(assignment.playerId), startX:event.clientX, startY:event.clientY, moved:false, ready:event.pointerType !== 'touch', holdTimer:0 };
      if (event.pointerType === 'touch') {
        pointerDrag.holdTimer = window.setTimeout(() => { if (pointerDrag && pointerDrag.pointerId === event.pointerId) pointerDrag.ready = true; }, 180);
      }
      if (slot.setPointerCapture) slot.setPointerCapture(event.pointerId);
    });
    document.addEventListener('pointermove', event => {
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
      if (!pointerDrag.ready) return;
      if (!pointerDrag.moved && Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY) < 6) return;
      pointerDrag.moved = true;
      event.preventDefault();
      const rawCoordinates = pitchCoordinates(event.clientX, event.clientY);
      const coordinates = snapCoordinates(rawCoordinates.x, rawCoordinates.y, pointerDrag.playerId);
      pointerDrag.slot.classList.add('is-dragging');
      if (pointerDrag.sourceArea === 'xi') {
        pointerDrag.slot.style.left = `${coordinates.x}%`;
        pointerDrag.slot.style.top = `${coordinates.y}%`;
      }
      const pitchRect = el['builder-pitch'].getBoundingClientRect();
      const overPitch = event.clientX >= pitchRect.left && event.clientX <= pitchRect.right && event.clientY >= pitchRect.top && event.clientY <= pitchRect.bottom;
      if (overPitch) showDragGuides(coordinates.x, coordinates.y, pointerDrag.playerId);
      else clearDragGuides();
    }, { passive:false });
    document.addEventListener('pointerup', event => {
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
      const activeDrag = pointerDrag;
      pointerDrag = null;
      window.clearTimeout(activeDrag.holdTimer);
      activeDrag.slot.classList.remove('is-dragging');
      clearDragGuides();
      if (activeDrag.moved) {
        suppressPitchClickUntil = performance.now() + 450;
        const dropElement = document.elementFromPoint(event.clientX, event.clientY);
        const benchTarget = dropElement && dropElement.closest('[data-target-area="bench"]');
        if (benchTarget) {
          placePlayer(activeDrag.playerId, { area:'bench', id:benchTarget.dataset.targetId });
        } else if (dropElement && dropElement.closest('#builder-pitch')) {
          const rawCoordinates = pitchCoordinates(event.clientX, event.clientY);
          const coordinates = snapCoordinates(rawCoordinates.x, rawCoordinates.y, activeDrag.playerId);
          placePlayerOnPitch(activeDrag.playerId, coordinates.x, coordinates.y);
        } else {
          renderPitch();
        }
      }
    });
    document.addEventListener('pointercancel', () => { if (pointerDrag) { window.clearTimeout(pointerDrag.holdTimer); pointerDrag.slot.classList.remove('is-dragging'); } clearDragGuides(); pointerDrag = null; });
    el['builder-player-dialog'].addEventListener('close', () => { dialogTarget = null; if (state.selectedTarget && !state.selectedPlayerId) { state.selectedTarget = null; renderSelection(); } });
    window.addEventListener('hashchange', () => {
      const match = location.hash.match(/^#s=(.+)$/);
      if (!match) return;
      try { loadState(parseCompactState(decodeShareState(match[1]))); showToast('Alineación compartida cargada.'); } catch (error) { showToast(error.message, true); }
    });
  }

  function filterTeamOptions() {
    const leagueId = el['builder-league'].value;
    const teams = state.data.teams.filter(team => team.type !== 2 && (!leagueId || (team.leagueIds || []).includes(leagueId)));
    const customOption = state.customTeam ? `<option value="${escapeHtml(teamLabel(state.customTeam))}"></option>` : '';
    el['builder-team-options'].innerHTML = '<option value="Sin equipo"></option>' + customOption + teams.map(team => `<option value="${escapeHtml(teamLabel(team))}"></option>`).join('');
  }

  function populateControls() {
    state.teamLabelToId.clear();
    el['builder-formation'].innerHTML = formationsApi.formations.map(formation => `<option value="${formation.id}">${formation.name}</option>`).join('');
    el['builder-custom-position'].innerHTML = (state.data.positions || ['GK','CB','LB','RB','DMF','CMF','LMF','RMF','AMF','LWF','RWF','SS','CF']).map(position => `<option value="${escapeHtml(position)}">${escapeHtml(position)}</option>`).join('');
    el['builder-league'].innerHTML = '<option value="">Todas las ligas</option>' + (state.data.leagues || []).map(league => `<option value="${escapeHtml(league.id)}">${escapeHtml(displayTeamName(league.name))}</option>`).join('');
    el['builder-global-team'].innerHTML = '<option value="">Todos los equipos</option>';
    const teams = state.data.teams;
    teams.forEach(team => {
      const label = teamLabel(team);
      state.teamLabelToId.set(label, team.id);
    });
    filterTeamOptions();
    el['builder-global-team'].insertAdjacentHTML('beforeend', teams.map(team => `<option value="${escapeHtml(team.id)}">${escapeHtml(displayTeamName(team.name))}</option>`).join(''));
  }

  function initialState() {
    const shared = location.hash.match(/^#s=(.+)$/);
    if (shared) {
      try { loadState(parseCompactState(decodeShareState(shared[1]))); return; } catch (error) { showToast(`No se pudo abrir el enlace: ${error.message}`, true); }
    }
    const teamParam = new URLSearchParams(location.search).get('team');
    const draft = safeStorageGet(DRAFT_KEY, null);
    if (draft && (!teamParam || String(draft.baseTeamId || '') === teamParam)) {
      try { loadState(draft); return; } catch (_error) {}
    }
    if (teamParam && state.teamsById.has(teamParam) && getTeam(teamParam).type !== 2) {
      state.baseTeamId = teamParam;
      syncControls();
      commit(false);
      return;
    }
    if (draft) {
      try { loadState(draft); return; } catch (_error) {}
    }
    syncControls();
    commit(false);
  }

  async function loadIndex() {
    el['builder-loading'].hidden = false;
    el['builder-error'].hidden = true;
    el['builder-app'].hidden = true;
    try {
      const response = await fetch('database/builder-player-index.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || Number(data.schemaVersion) !== 1 || !Array.isArray(data.players) || !Array.isArray(data.teams)) throw new Error('Índice inválido');
      state.data = data;
      state.playersById = new Map(data.players.map(player => [String(player.id), player]));
      loadCustomPlayers();
      state.teamsById = new Map(data.teams.map(team => [String(team.id), team]));
      populateControls();
      applyUiPreferences();
      initialState();
      el['builder-loading'].hidden = true;
      el['builder-app'].hidden = false;
    } catch (error) {
      console.error(error);
      el['builder-loading'].hidden = true;
      el['builder-error'].hidden = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    bindEvents();
    loadIndex();
  });
})(typeof window !== 'undefined' ? window : globalThis);
