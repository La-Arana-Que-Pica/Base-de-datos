// Miniface Studio · interfaz. La lógica de imagen, estado, colección, render, exportación, proyectos
// y lectura del EDIT vive en módulos separados para poder sumar funciones sin rehacer la herramienta.

import { EditorState } from './editor-state.js';
import { MinifaceCollection, MODES, STATUS } from './collection.js';
import { TEMPLATE, templatePercent } from './template.js';
import { renderStage, renderComposite, createCheckerPattern } from './render.js';
import { ACCEPT_ATTRIBUTE, ImportError, decodeImage, fetchImageUrl, imageFromDataTransfer, imageUrlFromDataTransfer, isSupportedImage, readClipboardImage } from './image-import.js';
import { PERSONAL_FORMATS, PES2018_PROFILE, PNG_PROFILE, encodePersonal, personalPaths, personalZip, sanitizeCpkName, sanitizeFileName, sanitizeFolder, validatePlayerId } from './export-profiles.js';
import { ProjectStore, ProjectError, PROJECT_EXTENSION, buildProjectFile, hashBlob, mergeTeams, planMerge, readProjectFile } from './project.js';
import { EditError, POSITIONS, SPECIAL_ID_FLAG, readEditFile } from './pes2018-edit.js';
import { AutoFrameError, autoFrame, detectFaces, otherPlayers } from './auto-frame.js';
import { BackgroundError, hasTransparency, removeBackground } from './bg-remove.js';

const WHEEL_STEP = 1.1;
const MIN_EXPORT_SIZE = 16, MAX_EXPORT_SIZE = 4096;
const KEY_STEP = 1, KEY_STEP_FAST = 10;
const THUMB_DELAY = 90;
const MIN_APP_HEIGHT = 500;
const SAVE_DELAY = 700;
const CLUB_RESULTS = 60;

const $ = selector => document.querySelector(selector);
const state = new EditorState();
const collection = new MinifaceCollection();
const store = ProjectStore.available ? new ProjectStore() : null;
const els = {
  stage: $('#ms-stage'), canvas: $('#ms-canvas'), empty: $('#ms-empty'), emptyTitle: $('.ms-empty-title'), drop: $('#ms-drop'),
  face: $('#ms-ref-face'), guides: $('#ms-ref-guides'), center: $('#ms-ref-center'), showCenter: $('#ms-show-center'),
  zoom: $('#ms-zoom'), zoomValue: $('#ms-zoom-value'), source: $('#ms-source'),
  file: $('#ms-file'), showFace: $('#ms-show-face'), showGuides: $('#ms-show-guides'),
  playerId: $('#ms-player-id'), playerIdMsg: $('#ms-player-id-msg'), fileName: $('#ms-file-name'), playerName: $('#ms-player-name'),
  preview: $('#ms-preview'), status: $('#ms-status'),
  thumbs: $('#ms-thumbs'), count: $('#ms-collection-count'), summary: $('#ms-collection-summary'),
  exportAll: $('[data-action="export-all"]'), exportAllZip: $('[data-action="export-all-zip"]'), cpkName: $('#ms-cpk-name'),
  skip: $('[data-action="skip"]'),
  tabs: [...document.querySelectorAll('.ms-tabs [role="tab"]')],
  editFile: $('#ms-edit-file'), editInfo: $('#ms-edit-info'), clubSearch: $('#ms-club-search'), clubResults: $('#ms-club-results'),
  teamView: $('#ms-team-view'), teamName: $('#ms-team-name'), teamProgress: $('#ms-team-progress'), teamBar: $('#ms-team-bar'),
  playerSearch: $('#ms-player-search'), squad: $('#ms-squad'), teamBadge: $('#ms-team-badge'),
  projectFile: $('#ms-project-file'), projectStatus: $('#ms-project-status'), saveDot: $('#ms-save-dot'),
  countDone: $('#ms-count-done'), countPending: $('#ms-count-pending'), countSkipped: $('#ms-count-skipped'),
  modeButtons: [...document.querySelectorAll('.ms-mode-switch [data-mode]')], modeDesc: $('#ms-mode-desc'),
  fileBase: $('#ms-file-base'), fileExt: $('#ms-file-ext'), folder: $('#ms-folder'), folderList: $('#ms-folder-list'),
  format: $('#ms-format'), size: $('#ms-size'), bg: $('#ms-bg'), bgWrap: $('#ms-bg-wrap'), scope: $('#ms-scope'),
  exportPersonal: $('[data-action="export-personal-zip"]'),
  subtabs: [...document.querySelectorAll('.ms-subtabs [role="tab"]')],
  leagueEmpty: $('#ms-league-empty'), leagueList: $('#ms-league-list'), leagueDetail: $('#ms-league-detail'),
  leagueName: $('#ms-league-name'), leagueClubs: $('#ms-league-clubs'),
  playerGlobal: $('#ms-player-global'), playerResults: $('#ms-player-results'),
  selectAll: $('#ms-select-all'), addSelected: $('[data-action="add-selected"]'),
  autoButton: $('[data-action="auto-frame"]'), undoButton: $('[data-action="undo-frame"]'), autoOnImport: $('#ms-auto-on-import'),
  bgButton: $('[data-action="remove-bg"]'), bgOnImport: $('#ms-bg-on-import'),
  folderNewForm: $('#ms-folder-new-form'), folderNew: $('#ms-folder-new'), folders: $('#ms-folders'), moveTarget: $('#ms-move-target'),
  app: $('.ms-app'), fileOne: $('#ms-file-one'), wheelZoom: $('#ms-wheel-zoom'), pngSize: $('#ms-png-size'), undoReplace: $('[data-action="undo-replace"]'),
  collSearch: $('#ms-coll-search'), crumbs: $('#ms-crumbs'), collFolders: $('#ms-coll-folders'), collScroll: $('#ms-coll-scroll'),
};
const MODE_KEY = 'laqp-miniface-studio-mode';
const PREFS_KEY = 'laqp-miniface-studio-personal';
const MODE_TEXT = {
  [MODES.PES2018]: 'IDs del EDIT · DDS 128 × 128 · CPK listo para el juego',
  [MODES.PERSONAL]: 'Sin EDIT ni ID obligatorio · nombres y carpetas libres · PNG, WebP o JPG',
};
const isPersonal = () => collection.mode === MODES.PERSONAL;
const emptyTitleHtml = els.emptyTitle.innerHTML;
const view = { checker: null };
const thumbCanvases = new Map(); // uid → canvas 128 × 128 (se reutiliza al redibujar la lista)

// Equipos: los del EDIT importado (solo en memoria) y los usados en el proyecto (se guardan).
let editTeams = [];
let editPlayers = [];
let editLeagues = [];
const playerTeams = new Map(); // ID de jugador → IDs de los clubes en cuya plantilla figura
const projectTeams = new Map();
let currentTeamId = null;
let currentLeague = null;
const selectedPlayers = new Set(); // jugadores marcados en la plantilla abierta
// Orden de la plantilla: POR, DEC, LD, LI, MCD, MC, ID, II, MO, ED, EI, SD, DC (códigos internos de PES).
const POSITION_ORDER = [0, 1, 3, 2, 4, 5, 7, 6, 8, 10, 9, 11, 12];
const positionRank = position => { const rank = POSITION_ORDER.indexOf(position); return rank < 0 ? POSITION_ORDER.length : rank; };

// Carpetas del proyecto (también las vacías) y filtro de la colección: null = todas, '' = sin carpeta.
const projectFolders = new Set();
let folderFilter = null;
const AUTO_KEY = 'laqp-miniface-studio-auto-frame';
const BG_KEY = 'laqp-miniface-studio-remove-bg';
const WHEEL_KEY = 'laqp-miniface-studio-wheel-zoom';
const PNG_SIZE_KEY = 'laqp-miniface-studio-png-size';
// Última imagen reemplazada (solo en esta sesión), para poder deshacer un pegado por error.
let lastReplaced = null;

// ---------- Referencias del PSD ----------

function setupReferences() {
  els.face.style.opacity = String(TEMPLATE.face.opacity);
  els.guides.innerHTML = '';
  for (const guide of TEMPLATE.guides) {
    const line = document.createElement('span');
    line.className = 'ms-ref-guide';
    line.style.top = templatePercent(guide.y);
    line.style.height = templatePercent(guide.height);
    line.style.background = TEMPLATE.guideColor;
    els.guides.appendChild(line);
  }
  els.center.style.left = templatePercent(TEMPLATE.centerLine.x);
  els.showFace.checked = false;
  els.showGuides.checked = false;
  els.showCenter.checked = false;
  els.showCenter.addEventListener('change', () => { els.center.hidden = !els.showCenter.checked; });
  els.showFace.addEventListener('change', () => { els.face.hidden = !els.showFace.checked; });
  els.showGuides.addEventListener('change', () => { els.guides.hidden = !els.showGuides.checked; });
}

// ---------- Render ----------

let frameRequested = false;
let previewTimer = 0;

function requestRender() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    renderStage(els.canvas, state, view);
  });
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, THUMB_DELAY);
}

// La vista previa de 128 px y la miniatura del elemento activo comparten el mismo render.
function renderPreview() {
  const ctx = els.preview.getContext('2d');
  ctx.clearRect(0, 0, els.preview.width, els.preview.height);
  if (!state.hasImage) return;
  const pixels = PES2018_PROFILE.renderPixels(state);
  ctx.putImageData(pixels, 0, 0);
  const item = collection.active;
  if (item && item.source === state.source) thumbCanvas(item).getContext('2d').putImageData(pixels, 0, 0);
}

function thumbCanvas(item) {
  let canvas = thumbCanvases.get(item.uid);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = PES2018_PROFILE.size;
    thumbCanvases.set(item.uid, canvas);
  }
  return canvas;
}

function paintThumb(item) {
  if (!item.source) return;
  thumbCanvas(item).getContext('2d').putImageData(PES2018_PROFILE.renderPixels(item), 0, 0);
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = Math.max(1, Math.round(rect.width * dpr));
  if (els.canvas.width !== size || els.canvas.height !== size) {
    els.canvas.width = size; els.canvas.height = size;
    // Cuadros de 10 unidades de plantilla, igual que una grilla de transparencia clásica.
    view.checker = createCheckerPattern(els.canvas.getContext('2d'), Math.max(4, Math.round((size / TEMPLATE.size) * 10)));
  }
  renderStage(els.canvas, state, view);
}

// ---------- Estado → interfaz ----------

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const teamOf = item => (item?.teamId != null ? projectTeams.get(item.teamId) || editTeams.find(team => team.id === item.teamId) : null);
const displayName = item => item.name || item.shirtName || '';

function syncControls() {
  const has = state.hasImage;
  const active = collection.active;
  els.zoom.disabled = !has;
  els.playerId.disabled = !active;
  els.fileBase.disabled = els.folder.disabled = !active;
  document.querySelectorAll('[data-action="center"],[data-action="reset"],[data-action="zoom-in"],[data-action="zoom-out"],[data-action="zoom-in-10"],[data-action="zoom-out-10"],[data-action="export-dds"],[data-action="export-cpk"],[data-action="export-zip"],[data-action="export-png"],[data-action="export-image"]').forEach(button => { button.disabled = !has; });
  els.autoButton.disabled = !has || autoBusy;
  els.bgButton.disabled = !has || bgBusy;
  els.bgButton.lastChild.textContent = active?.original ? 'Restaurar fondo' : 'Quitar fondo';
  els.bgButton.classList.toggle('is-restore', Boolean(active?.original));
  els.undoButton.disabled = !active?.prevFrame;
  els.undoReplace.hidden = !active || lastReplaced?.uid !== active.uid;
  $('[data-action="move-active"]').disabled = !active;
  $('[data-action="prev"]').disabled = collection.indexOf(collection.activeUid) <= 0;
  $('[data-action="next-pending"]').disabled = collection.size < 2 && !(active && !active.source);
  els.skip.disabled = !active;
  els.skip.textContent = active?.skipped ? 'Restaurar' : 'Omitir';
  const zoom = Math.round(state.zoom * 100);
  els.zoom.value = String(zoom);
  els.zoomValue.textContent = zoom + '%';
  els.empty.hidden = has;
  els.stage.classList.toggle('has-image', has);
  // Jugador del EDIT sin imagen todavía: el área vacía indica a quién le falta la miniface.
  if (active && !active.source) {
    const who = isPersonal() ? active.fileName || displayName(active) || 'la nueva miniface' : displayName(active) || (active.id ? `ID ${active.id}` : 'el nuevo jugador');
    els.emptyTitle.innerHTML = `Pegá la miniface de <span class="ms-empty-player">${escapeHtml(who)}</span> con <kbd>Ctrl</kbd> + <kbd>V</kbd>`;
  } else {
    els.emptyTitle.innerHTML = emptyTitleHtml;
  }
  const position = collection.indexOf(collection.activeUid) + 1;
  if (has) {
    const { name, width, height } = state.source;
    els.source.textContent = `${isPersonal() ? 'Miniface' : 'Jugador'} ${position} de ${collection.size} · ${name} · ${width} × ${height} px · escala ${zoom}%`;
  } else {
    els.source.textContent = active ? `${isPersonal() ? 'Miniface' : 'Jugador'} ${position} de ${collection.size} · sin imagen todavía` : 'Sin imagen cargada.';
  }
  const team = teamOf(active);
  const name = active ? displayName(active) : '';
  els.playerName.hidden = !(name || team);
  els.playerName.innerHTML = name || team ? `${escapeHtml(name || 'Jugador')}${team ? `<small>${escapeHtml(team.name)}</small>` : ''}` : '';
}

state.subscribe(() => {
  const item = collection.active;
  if (item && item.source && item.source === state.source) { collection.storeTransform(item.uid, state); scheduleSave(); }
  syncControls();
  requestRender();
});

function setStatus(message, kind = 'info') {
  els.status.textContent = message;
  els.status.dataset.kind = kind;
}

// ---------- Colección ----------

/** Lleva el elemento activo de la colección al editor y al campo de ID. */
function loadActive() {
  const item = collection.active;
  state.load(item?.source || null, item?.source ? item : null);
  els.playerId.value = item ? item.id : '';
  els.fileBase.value = item ? item.fileName || '' : '';
  els.folder.value = item ? item.folder || '' : '';
  updatePlayerId();
}

/** Campo principal de la miniface activa: ID en PES 2018, nombre de archivo en uso personal. */
const primaryField = () => (isPersonal() ? els.fileBase : els.playerId);

function selectItem(uid, { focusId = false } = {}) {
  collection.select(uid);
  if (focusId) { primaryField().focus({ preventScroll: true }); primaryField().select(); }
}

/** Nombre de archivo efectivo en uso personal (si no se escribió ninguno). */
const personalBaseName = item => item.fileName || item.name || item.shirtName || `miniface-${String(collection.indexOf(item.uid) + 1).padStart(3, '0')}`;

const initials = text => (text || '').split(/[\s.]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();

function renderCollection() {
  const { byUid, missing, invalid, duplicateIds } = collection.issues();
  const counts = collection.counts();
  const exportable = collection.exportable().length;
  els.count.textContent = String(collection.size);
  els.exportAll.disabled = els.exportAllZip.disabled = !exportable || exportingAll;
  els.exportAll.textContent = exportable > 1 ? `Exportar ${exportable} (CPK)` : 'Exportar todas (CPK)';
  renderPersonalScope();
  const problems = [];
  if (missing) problems.push(missing === 1 ? '1 sin ID' : `${missing} sin ID`);
  if (invalid) problems.push(invalid === 1 ? '1 ID no válido' : `${invalid} IDs no válidos`);
  if (duplicateIds.length) problems.push(`ID repetido: ${duplicateIds.join(', ')}`);
  const progress = [`${counts.done} terminada${counts.done === 1 ? '' : 's'}`];
  if (counts.pending) progress.push(`${counts.pending} pendiente${counts.pending === 1 ? '' : 's'}`);
  if (counts.skipped) progress.push(`${counts.skipped} omitida${counts.skipped === 1 ? '' : 's'}`);
  els.summary.textContent = !collection.size ? 'Cada imagen que agregues se suma acá.'
    : problems.length ? problems.join(' · ') : !counts.pending && exportable ? `Todas listas para exportar · ${progress.join(' · ')}` : progress.join(' · ');
  els.summary.classList.toggle('has-issues', problems.length > 0);

  const addTile = els.thumbs.querySelector('.ms-thumb-add');
  const fragment = document.createDocumentFragment();
  const query = fold(els.collSearch.value.trim());
  renderCollectionNav(query);
  collection.items.forEach((item, index) => {
    if (query ? !matchesSearch(item, query) : (item.folder || '') !== (folderFilter || '')) return;
    const li = document.createElement('li');
    li.className = 'ms-thumb';
    li.dataset.uid = String(item.uid);
    li.draggable = true;
    const issue = byUid.get(item.uid);
    const active = item.uid === collection.activeUid;
    const status = collection.status(item);
    li.classList.toggle('is-active', active);
    li.classList.toggle('has-issue', Boolean(issue));
    li.classList.toggle('is-empty', !item.source);
    li.classList.toggle('is-skipped', status === STATUS.SKIPPED);
    li.classList.toggle('is-done', status === STATUS.DONE && !issue);
    const valid = validatePlayerId(item.id);
    const who = displayName(item);
    const label = isPersonal() ? item.fileName || who || 'Sin nombre' : item.shirtName || (valid.ok ? valid.id : who || 'Sin ID');
    const stateText = status === STATUS.SKIPPED ? 'omitida' : !item.source ? 'sin imagen' : issue || (status === STATUS.DONE ? 'terminada' : 'pendiente');
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'ms-thumb-select';
    select.dataset.thumbAction = 'select';
    select.setAttribute('aria-pressed', String(active));
    select.setAttribute('aria-label', `Jugador ${index + 1}: ${who ? who + ', ' : ''}${valid.ok ? 'ID ' + valid.id : 'sin ID'}, ${stateText}`);
    select.title = isPersonal()
      ? [`${item.folder ? sanitizeFolder(item.folder) + '/' : ''}${sanitizeFileName(personalBaseName(item))}.${personalFormat().ext}`, stateText].join(' · ')
      : [who, valid.ok ? PES2018_PROFILE.fileName(valid.id) : 'Sin ID', stateText].filter(Boolean).join(' · ');
    select.appendChild(thumbCanvas(item));
    if (!item.source) {
      const mark = document.createElement('span');
      mark.className = 'ms-thumb-initials';
      mark.textContent = initials(item.shirtName || item.name) || '?';
      select.appendChild(mark);
    }
    const caption = document.createElement('span');
    caption.className = 'ms-thumb-id';
    caption.textContent = label;
    select.appendChild(caption);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ms-thumb-remove';
    remove.dataset.thumbAction = 'remove';
    remove.setAttribute('aria-label', `Eliminar jugador ${index + 1}`);
    remove.title = 'Eliminar';
    remove.textContent = '×';
    li.append(select, remove);
    fragment.appendChild(li);
  });
  els.thumbs.replaceChildren(fragment, addTile);
  // Solo desplaza la lista de la colección (scrollIntoView movería toda la página).
  const current = els.thumbs.querySelector('.is-active');
  if (current) {
    const box = els.collScroll, view = box.getBoundingClientRect(), rect = current.getBoundingClientRect();
    if (rect.top < view.top) box.scrollTop -= view.top - rect.top + 6;
    else if (rect.bottom > view.bottom) box.scrollTop += rect.bottom - view.bottom + 6;
  }
  els.countDone.textContent = String(counts.done);
  els.countPending.textContent = String(counts.pending);
  els.countSkipped.textContent = String(counts.skipped);
  renderFolders();
}

const matchesSearch = (item, query) => fold(item.name).includes(query) || fold(item.shirtName).includes(query) || fold(item.fileName).includes(query) || String(item.id).includes(query);

/** Ruta de carpetas de la colección y carpetas (ligas, equipos) dentro de la que se está viendo. */
function renderCollectionNav(query) {
  const here = folderFilter || '';
  const parts = here ? here.split('/') : [];
  const crumb = (label, path, current) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ms-crumb-step';
    button.dataset.crumb = path;
    button.textContent = label;
    if (current) button.setAttribute('aria-current', 'location');
    return button;
  };
  els.crumbs.replaceChildren(crumb('Todas', '', !here), ...parts.map((part, index) => crumb(part, parts.slice(0, index + 1).join('/'), index === parts.length - 1)));
  els.crumbs.hidden = Boolean(query) || !allFolders().length;
  const prefix = here ? here + '/' : '';
  const children = query ? [] : allFolders().filter(folder => folder.startsWith(prefix) && !folder.slice(prefix.length).includes('/'));
  const owners = new Map([...projectTeams.values()].map(team => [teamFolderOf(team), team]));
  els.collFolders.hidden = !children.length;
  els.collFolders.replaceChildren(...children.map(folder => {
    const items = collection.items.filter(item => MinifaceCollection.inFolder(item, folder));
    const done = items.filter(item => collection.status(item) === STATUS.DONE).length;
    const team = owners.get(folder);
    const li = document.createElement('li');
    li.dataset.folder = folder;
    li.classList.toggle('is-current', collection.active != null && MinifaceCollection.inFolder(collection.active, folder));
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'ms-coll-folder';
    open.dataset.collFolder = 'open';
    open.title = folder;
    const nested = allFolders().some(other => other.startsWith(folder + '/'));
    open.innerHTML = `<span class="ms-coll-folder-ico" aria-hidden="true">${nested ? '▣' : '▸'}</span><span class="ms-coll-folder-name">${escapeHtml(folder.split('/').pop())}</span><small>${done}/${items.length}</small>`;
    li.appendChild(open);
    // Las ligas con equipos adentro no se borran de un clic; sus equipos sí.
    if (!nested) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ms-coll-folder-remove';
      remove.dataset.collFolder = 'remove';
      const what = team ? `Eliminar el equipo «${team.name}» del proyecto` : `Eliminar la carpeta «${folder}»`;
      remove.title = what;
      remove.setAttribute('aria-label', what);
      remove.textContent = '×';
      li.appendChild(remove);
    }
    return li;
  }));
}

function removeItem(uid) {
  const item = collection.get(uid);
  if (!item) return;
  const label = displayName(item) || (validatePlayerId(item.id).ok ? `ID ${item.id}` : `Jugador ${collection.indexOf(uid) + 1}`);
  if (lastReplaced?.uid === uid) forgetReplaced();
  collection.remove(uid);
  thumbCanvases.delete(uid);
  setStatus(`${label} eliminado de la colección.`, 'info');
}

collection.subscribe((_, reason) => {
  // La colección muestra siempre la carpeta del jugador que se está editando.
  if (reason === 'select' && collection.active && !els.collSearch.value.trim()) {
    const own = collection.active.folder || '';
    if (own !== (folderFilter || '')) folderFilter = own || null;
  }
  if (['select', 'remove', 'clear', 'source'].includes(reason)) loadActive();
  renderCollection();
  syncControls();
  if (reason === 'id') updatePlayerId();
  renderSquad();
  refreshEditViews();
  scheduleSave();
});

/** Mantiene al día los estados mostrados en la sección EDIT (liga abierta y búsqueda de jugadores). */
function refreshEditViews() {
  if (!document.getElementById('ms-view-player').hidden && els.playerGlobal.value.trim()) renderPlayerResults();
  if (currentLeague && !els.leagueDetail.hidden) renderLeagueDetail();
}

/** Nuevo jugador vacío: queda activo esperando su imagen (Ctrl + V, arrastrar o archivo). */
function newPlayer() {
  const item = collection.addSlot({ id: '', name: '', teamId: null });
  adoptFolder(item);
  selectItem(item.uid, { focusId: true });
  setStatus('Nuevo jugador. Escribí su ID y pegá la imagen (Ctrl + V), arrastrala o elegí un archivo.', 'ok');
}

function goPrev() {
  const index = collection.indexOf(collection.activeUid);
  if (index > 0) selectItem(collection.items[index - 1].uid, { focusId: true });
}

/** Próximo jugador con trabajo pendiente: primero en la carpeta que se está viendo y después en el resto. */
function nextPendingInView() {
  const here = folderFilter || '';
  return collection.nextPending(collection.activeUid, item => (item.folder || '') === here) || collection.nextPending(collection.activeUid);
}

function goNextPending() {
  const next = nextPendingInView() || collection.items[collection.indexOf(collection.activeUid) + 1];
  if (next) {
    selectItem(next.uid, { focusId: true });
    setStatus(next.source ? 'Siguiente miniface pendiente.' : `Siguiente: ${displayName(next) || 'jugador sin imagen'}. Pegá su miniface (Ctrl + V).`, 'info');
  } else {
    setStatus('No quedan minifaces pendientes. Pegá otra imagen o exportá todas.', 'ok');
  }
}

function toggleSkip() {
  const item = collection.active;
  if (!item) return;
  const skip = !item.skipped;
  collection.setSkipped(item.uid, skip);
  if (skip) {
    setStatus(`${displayName(item) || 'Miniface'} omitida: no se exportará.`, 'info');
    const next = nextPendingInView();
    if (next) selectItem(next.uid, { focusId: true });
  } else {
    setStatus(`${displayName(item) || 'Miniface'} restaurada.`, 'info');
  }
}

function setupCollection() {
  els.collSearch.addEventListener('input', renderCollection);
  els.crumbs.addEventListener('click', event => {
    const step = event.target.closest('[data-crumb]');
    if (step) setFolderFilter(step.dataset.crumb || null);
  });
  els.collFolders.addEventListener('click', event => {
    const button = event.target.closest('[data-coll-folder]');
    if (!button) return;
    const folder = button.closest('li').dataset.folder;
    if (button.dataset.collFolder === 'open') { setFolderFilter(folder); return; }
    const team = [...projectTeams.values()].find(entry => teamFolderOf(entry) === folder);
    if (team) removeTeam(team); else deleteFolder(folder);
  });
  els.thumbs.addEventListener('click', event => {
    const button = event.target.closest('[data-thumb-action]');
    if (!button) return;
    const uid = Number(button.closest('.ms-thumb').dataset.uid);
    if (button.dataset.thumbAction === 'remove') removeItem(uid);
    else selectItem(uid, { focusId: true });
  });
  els.thumbs.addEventListener('keydown', event => {
    const thumb = event.target.closest('.ms-thumb');
    if (!thumb) return;
    const uid = Number(thumb.dataset.uid);
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeItem(uid);
      els.thumbs.querySelector('.is-active .ms-thumb-select')?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = collection.items[collection.indexOf(uid) + (event.key === 'ArrowLeft' ? -1 : 1)];
      if (next) { selectItem(next.uid); els.thumbs.querySelector('.is-active .ms-thumb-select')?.focus(); }
    }
  });
  // Re Pág / Av Pág: anterior / siguiente pendiente, desde cualquier parte de la página.
  document.addEventListener('keydown', event => {
    if (event.key === 'PageDown' && collection.size) { event.preventDefault(); goNextPending(); }
    if (event.key === 'PageUp' && collection.size) { event.preventDefault(); goPrev(); }
  });
}

// ---------- Importación ----------

const fitTransform = source => ({ x: TEMPLATE.size / 2, y: TEMPLATE.size / 2, scale: Math.min(TEMPLATE.size / source.width, TEMPLATE.size / source.height) });

/** Decodifica y conserva los bytes originales (para proyectos) junto con su SHA-256. */
async function sourceFromBlob(blob, name) {
  const source = await decodeImage(blob, name);
  source.blob = blob;
  source.hash = await hashBlob(blob);
  return source;
}

/** Suelta la imagen guardada para deshacer, salvo que siga en uso. */
function forgetReplaced() {
  if (!lastReplaced) return;
  const inUse = image => collection.items.some(item => item.source === image || item.original === image);
  for (const image of [lastReplaced.source, lastReplaced.original]) if (image && !inUse(image)) image.release?.();
  lastReplaced = null;
}

/** Vuelve a la imagen anterior del jugador activo; otro clic vuelve a la nueva. */
function undoReplace() {
  const item = collection.active;
  if (!item || lastReplaced?.uid !== item.uid) return;
  const previous = lastReplaced;
  lastReplaced = { uid: item.uid, source: item.source, original: item.original || null, x: item.x, y: item.y, scale: item.scale };
  item.original = previous.original;
  item.prevFrame = null;
  collection.setSource(item.uid, previous.source, { x: previous.x, y: previous.y, scale: previous.scale }, { release: false });
  paintThumb(item);
  setStatus('Se recuperó la imagen anterior. «Deshacer reemplazo» vuelve a la otra.', 'info');
}

/**
 * Importa una imagen. El jugador activo la recibe si todavía no tiene (jugador del EDIT o «Nuevo») o si
 * `replace` lo pide (pegar). En cualquier otro caso se agrega un jugador nuevo a la colección.
 * Al reemplazar, todo lo que dependía de la imagen anterior deja de valer: el original para «Restaurar
 * fondo» y el encuadre anterior.
 */
async function importBlob(blobPromise, name, { select = true, replace = false } = {}) {
  try {
    const blob = await blobPromise;
    const source = await sourceFromBlob(blob, name);
    const active = collection.active;
    const transparency = /png|webp|gif|avif/.test(source.type) ? '' : ' (sin canal de transparencia)';
    if (active && (!active.source || replace)) {
      const replaced = Boolean(active.source);
      if (replaced) {
        forgetReplaced();
        lastReplaced = { uid: active.uid, source: active.source, original: active.original || null, x: active.x, y: active.y, scale: active.scale };
      }
      active.original = null;
      active.prevFrame = null;
      collection.setSource(active.uid, source, fitTransform(source), { release: false });
      paintThumb(active);
      renderCollection();
      afterImport(active);
      const who = isPersonal() ? active.fileName || displayName(active) || 'la miniface' : displayName(active) || (active.id ? `ID ${active.id}` : 'el jugador');
      setStatus(`Imagen ${replaced ? 'reemplazada en' : 'asignada a'} ${who}${transparency}. Ajustala y pasá a la siguiente (Enter o Av Pág).`, 'ok');
      return active;
    }
    // El nombre del archivo importado sirve como nombre sugerido (útil en uso personal).
    const suggested = /^imagen del portapapeles$|^image\.png$/i.test(source.name) ? '' : sanitizeFileName(source.name, '');
    const item = collection.add(source, '', { ...fitTransform(source), fileName: suggested, folder: folderFilter || '' });
    paintThumb(item);
    afterImport(item);
    if (select || !collection.active) selectItem(item.uid, { focusId: true });
    else renderCollection();
    setStatus(isPersonal()
      ? `Miniface ${collection.size} agregada: ${source.width} × ${source.height} px${transparency}. Poné un nombre si querés.`
      : `Jugador ${collection.size} agregado: ${source.width} × ${source.height} px${transparency}. Escribí su ID.`, 'ok');
    return item;
  } catch (error) {
    console.warn('[Miniface Studio]', error);
    setStatus(error instanceof ImportError ? error.message : 'No se pudo importar la imagen.', 'error');
    return null;
  }
}

/** Importa varios archivos en orden; el primero completa al jugador activo si no tiene imagen. */
async function importFiles(files) {
  const list = Array.from(files || []);
  const rejected = list.filter(file => !isSupportedImage(file));
  let first = null, added = 0;
  for (const file of list) {
    if (rejected.includes(file)) continue;
    const item = await importBlob(Promise.resolve(file), file.name, { select: !first });
    if (item) { added++; first = first || item; }
  }
  if (first && collection.activeUid !== first.uid) selectItem(first.uid, { focusId: true });
  if (rejected.length) {
    const names = rejected.map(file => `«${file.name || 'archivo'}»`).join(', ');
    setStatus(`${added ? `${added} agregada${added === 1 ? '' : 's'}. ` : ''}${names} no ${rejected.length === 1 ? 'es un formato compatible' : 'son formatos compatibles'}. Usá PNG, WebP, JPG o GIF.`, 'error');
  } else if (added > 1) {
    setStatus(`${added} imágenes agregadas. ${isPersonal() ? 'Revisá los nombres' : 'Escribí el ID de cada una'} (Enter pasa a la siguiente).`, 'ok');
  }
}

function setupImport() {
  els.file.accept = ACCEPT_ATTRIBUTE;
  els.file.addEventListener('change', () => {
    if (els.file.files?.length) importFiles(els.file.files);
    els.file.value = '';
  });
  els.fileOne.accept = ACCEPT_ATTRIBUTE;
  els.fileOne.addEventListener('change', () => {
    const file = els.fileOne.files?.[0];
    els.fileOne.value = '';
    if (!file) return;
    if (isSupportedImage(file)) importBlob(Promise.resolve(file), file.name, { replace: true });
    else setStatus(`«${file.name || 'archivo'}» no es un formato compatible. Usá PNG, WebP, JPG o GIF.`, 'error');
  });

  document.addEventListener('paste', event => {
    const file = imageFromDataTransfer(event.clipboardData);
    if (file) {
      event.preventDefault();
      importBlob(Promise.resolve(file), file.name && file.name !== 'image.png' ? file.name : 'imagen del portapapeles', { replace: true });
      return;
    }
    const url = imageUrlFromDataTransfer(event.clipboardData);
    const field = event.target.closest?.('input, textarea, [contenteditable="true"]');
    // En el campo de ID o de nombre, pegar texto lo escribe; una imagen copiada como enlace se importa igual.
    const text = event.clipboardData.getData('text/plain').trim();
    const imageAsLink = url && (field === els.playerId ? !/^\d+$/.test(text) : field === els.fileBase && (!text || /^https?:\/\//i.test(text)));
    if (field && !imageAsLink) return;
    if (url) {
      event.preventDefault();
      importBlob(fetchImageUrl(url), url.split('/').pop().split('?')[0], { replace: true });
      return;
    }
    setStatus('El portapapeles no contiene una imagen. Copiá la miniface con clic derecho → «Copiar imagen».', 'error');
  });

  let dragDepth = 0;
  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  const showDrop = visible => { els.drop.hidden = !visible; els.stage.classList.toggle('is-dragging', visible); };
  window.addEventListener('dragenter', event => {
    if (!hasFiles(event)) return;
    event.preventDefault(); dragDepth++; showDrop(true);
  });
  window.addEventListener('dragover', event => { if (hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('dragleave', event => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) showDrop(false);
  });
  window.addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault(); dragDepth = 0; showDrop(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) importFiles(files);
    else { const file = imageFromDataTransfer(event.dataTransfer); if (file) importFiles([file]); }
  });
}

// ---------- Interacción con el área de trabajo ----------

function stageUnitsPerPixel() {
  return TEMPLATE.size / els.canvas.getBoundingClientRect().width;
}

function clientToTemplate(clientX, clientY) {
  const rect = els.canvas.getBoundingClientRect();
  const k = stageUnitsPerPixel();
  return [(clientX - rect.left) * k, (clientY - rect.top) * k];
}

/** Sube o baja la escala en puntos del porcentaje que se muestra (de 100 % a 101 %, no un 1 % de la escala). */
function stepZoom(points) {
  state.setZoom((Math.round(state.zoom * 100) + points) / 100);
}

function setupStage() {
  const pointers = new Map();
  let pinch = null;

  els.stage.addEventListener('pointerdown', event => {
    if (!state.hasImage || event.button > 0) return;
    els.stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    els.stage.classList.add('is-moving');
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom };
    }
  });
  els.stage.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, current);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const [px, py] = clientToTemplate((a.x + b.x) / 2, (a.y + b.y) / 2);
      state.setZoom(pinch.zoom * (distance / pinch.distance), px, py);
      return;
    }
    const k = stageUnitsPerPixel();
    state.moveBy((current.x - previous.x) * k, (current.y - previous.y) * k);
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) els.stage.classList.remove('is-moving');
  };
  els.stage.addEventListener('pointerup', release);
  els.stage.addEventListener('pointercancel', release);

  try { els.wheelZoom.checked = localStorage.getItem(WHEEL_KEY) === '1'; } catch { /* sin almacenamiento */ }
  els.wheelZoom.addEventListener('change', () => {
    try { localStorage.setItem(WHEEL_KEY, els.wheelZoom.checked ? '1' : '0'); } catch { /* sin almacenamiento */ }
  });
  els.stage.addEventListener('wheel', event => {
    // Apagado: la rueda sigue desplazando la página aunque el ratón esté sobre la miniface.
    if (!state.hasImage || !els.wheelZoom.checked) return;
    event.preventDefault();
    const [px, py] = clientToTemplate(event.clientX, event.clientY);
    const steps = -Math.sign(event.deltaY) * Math.min(3, Math.max(1, Math.abs(event.deltaY) / 100));
    state.setZoom(state.zoom * Math.pow(WHEEL_STEP, steps), px, py);
  }, { passive: false });

  els.stage.addEventListener('keydown', event => {
    if (!state.hasImage) return;
    const step = event.shiftKey ? KEY_STEP_FAST : KEY_STEP;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) { event.preventDefault(); state.moveBy(...moves[event.key]); return; }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); stepZoom(event.shiftKey ? 10 : 1); }
    if (event.key === '-' || event.key === '_') { event.preventDefault(); stepZoom(event.shiftKey ? -10 : -1); }
  });

  els.zoom.addEventListener('input', () => state.setZoom(Number(els.zoom.value) / 100));
  new ResizeObserver(resizeCanvas).observe(els.canvas);
}

// ---------- Exportación ----------

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = fileName; link.hidden = true;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function updatePlayerId({ showError = false } = {}) {
  const result = validatePlayerId(els.playerId.value);
  els.fileName.textContent = result.ok ? PES2018_PROFILE.fileName(result.id) : 'player_ID.dds';
  const empty = !els.playerId.value.trim();
  let error = !result.ok && (showError || !empty) ? result.error : '';
  // Aviso de duplicado: no bloquea la exportación individual, sí la de todas.
  const duplicate = result.ok && collection.activeUid != null
    && collection.items.some(item => item.uid !== collection.activeUid && !item.skipped && item.source && validatePlayerId(item.id).id === result.id);
  if (duplicate) error = `El ID ${result.id} ya lo usa otra miniface.`;
  els.playerId.setAttribute('aria-invalid', String(Boolean(error)));
  els.playerIdMsg.classList.toggle('is-error', Boolean(error));
  const inflated = result.ok && result.editId ? `ID inflado ${result.editId} − 0x40000000 = ${result.id} · ` : '';
  els.playerIdMsg.firstChild.textContent = error ? error + ' ' : `${inflated}Archivo: `;
  els.playerIdMsg.title = inflated ? 'ID de datapack o jugador creado: el juego busca la miniface con el ID real.' : '';
  return result;
}

function requirePlayerId() {
  const result = updatePlayerId({ showError: true });
  if (!result.ok) {
    setStatus(result.error, 'error');
    els.playerId.focus();
    return null;
  }
  return result.id;
}

function afterExport(message) {
  setStatus(message, 'ok');
  els.playerId.select();
}

/** Exporta la miniface activa: 'dds', 'zip' (carpetas del juego) o 'cpk'. */
function exportDds(format = 'dds') {
  if (!state.hasImage) return;
  const id = requirePlayerId();
  if (!id) return;
  try {
    const dds = PES2018_PROFILE.encode(state);
    if (format === 'cpk') {
      const name = sanitizeCpkName(els.cpkName.value);
      downloadBlob(new Blob([PES2018_PROFILE.cpk([{ id, dds }])], { type: 'application/octet-stream' }), name);
      afterExport(`${name} descargado con ${PES2018_PROFILE.internalPath(id)}.`);
    } else if (format === 'zip') {
      const name = `miniface_pes2018_player_${id}.zip`;
      downloadBlob(new Blob([PES2018_PROFILE.zip(id, dds)], { type: 'application/zip' }), name);
      afterExport(`${name} descargado (${PES2018_PROFILE.internalPath(id)}).`);
    } else {
      downloadBlob(new Blob([dds], { type: 'image/vnd-ms.dds' }), PES2018_PROFILE.fileName(id));
      afterExport(`${PES2018_PROFILE.fileName(id)} descargado. Podés pegar la siguiente imagen.`);
    }
  } catch (error) {
    console.error('[Miniface Studio]', error);
    setStatus('No se pudo generar el DDS: ' + error.message, 'error');
  }
}

let exportingAll = false;

/** Exporta solo las minifaces terminadas (con imagen y sin omitir) en un CPK o un ZIP. */
async function exportAll(format = 'cpk') {
  const items = collection.exportable();
  if (!items.length || exportingAll) return;
  const { byUid } = collection.issues();
  if (byUid.size) {
    // Lleva directamente al primer problema para corregirlo sin ventanas intermedias.
    const first = collection.nextWithIssue();
    selectItem(first.uid, { focusId: true });
    updatePlayerId({ showError: true });
    setStatus(`No se exportó: ${els.summary.textContent}. Corregí las minifaces marcadas en rojo (Enter pasa a la siguiente).`, 'error');
    return;
  }
  exportingAll = true;
  els.exportAll.disabled = els.exportAllZip.disabled = true;
  try {
    const files = [];
    for (const [index, item] of items.entries()) {
      setStatus(`Generando DDS ${index + 1} de ${items.length}…`, 'info');
      files.push({ id: validatePlayerId(item.id).id, dds: PES2018_PROFILE.encode(item) });
      // Cede el hilo para que la interfaz siga respondiendo con colecciones grandes.
      if (index % 4 === 3) await new Promise(resolve => setTimeout(resolve));
    }
    const name = format === 'zip' ? `minifaces_pes2018_${files.length}_jugadores.zip` : sanitizeCpkName(els.cpkName.value);
    const bytes = format === 'zip' ? PES2018_PROFILE.zipAll(files) : PES2018_PROFILE.cpk(files);
    downloadBlob(new Blob([bytes], { type: format === 'zip' ? 'application/zip' : 'application/octet-stream' }), name);
    const pending = collection.size - items.length;
    setStatus(`${name} descargado: ${files.length} DDS en ${PES2018_PROFILE.internalDir}/.${pending ? ` ${pending} sin imagen u omitidas no se incluyeron.` : ''}${format === 'zip' ? '' : ' Copialo en la carpeta download y agregalo con DpFileList Generator.'}`, 'ok');
  } catch (error) {
    console.error('[Miniface Studio]', error);
    setStatus('No se pudo generar el archivo: ' + error.message, 'error');
  } finally {
    exportingAll = false;
    els.exportAll.disabled = els.exportAllZip.disabled = !collection.exportable().length;
  }
}

/** Lado de exportación válido, a partir de lo que se escribió. */
function exportSize(raw) {
  const size = Math.round(Number(raw));
  return Number.isFinite(size) && size > 0 ? Math.min(MAX_EXPORT_SIZE, Math.max(MIN_EXPORT_SIZE, size)) : TEMPLATE.size;
}

async function exportPng() {
  if (!state.hasImage) return;
  const result = validatePlayerId(els.playerId.value);
  try {
    const name = PNG_PROFILE.fileName(result.ok ? result.id : '');
    const size = exportSize(els.pngSize.value);
    els.pngSize.value = String(size);
    downloadBlob(await encodePersonal(state, { format: 'png', size }), name);
    setStatus(`${name} descargado (${size} × ${size} px, con transparencia).`, 'ok');
  } catch (error) {
    console.error('[Miniface Studio]', error);
    setStatus('No se pudo generar el PNG.', 'error');
  }
}

/** Enter en el ID: confirma y pasa a la siguiente miniface pendiente, o deja todo listo para pegar otra. */
function confirmIdAndAdvance() {
  const result = updatePlayerId({ showError: true });
  if (!result.ok) { setStatus(result.error, 'error'); return; }
  const next = nextPendingInView();
  if (next) {
    selectItem(next.uid, { focusId: true });
    setStatus(next.source ? `ID ${result.id} guardado. Siguiente miniface pendiente.` : `ID ${result.id} guardado. Siguiente: ${displayName(next) || 'jugador sin imagen'}. Pegá su miniface (Ctrl + V).`, 'ok');
  } else if (collection.active?.teamId == null) {
    // Sin plantilla del EDIT: queda un jugador nuevo listo, para seguir pegando sin tocar el ratón.
    newPlayer();
    setStatus(`ID ${result.id} guardado. Jugador nuevo listo: pegá su imagen (Ctrl + V) y escribí su ID.`, 'ok');
  } else {
    setStatus(`ID ${result.id} guardado. No quedan pendientes: podés exportar todas.`, 'ok');
  }
}

// ---------- Uso personal: nombres, carpetas y formatos comunes ----------

const personalFormat = () => PERSONAL_FORMATS[els.format.value] || PERSONAL_FORMATS.png;
const personalOptions = () => ({ format: els.format.value, size: exportSize(els.size.value), background: els.bg.value });

function syncPersonalOptions({ save = true } = {}) {
  els.size.value = String(exportSize(els.size.value));
  els.fileExt.textContent = '.' + personalFormat().ext;
  els.bgWrap.hidden = personalFormat().alpha;
  if (save) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(personalOptions())); } catch { /* sin almacenamiento */ }
    scheduleSave();
  }
}

function applyPersonalOptions(prefs) {
  if (!prefs) return;
  if (PERSONAL_FORMATS[prefs.format]) els.format.value = prefs.format;
  if (prefs.size) els.size.value = String(exportSize(prefs.size));
  if (/^#[0-9a-f]{6}$/i.test(prefs.background || '')) els.bg.value = prefs.background;
  syncPersonalOptions({ save: false });
}

/** Carpetas existentes como sugerencias y como alcance de la exportación. */
function renderPersonalScope() {
  const folders = allFolders();
  const unique = [...new Set(folders)];
  els.folderList.replaceChildren(...unique.map(folder => Object.assign(document.createElement('option'), { value: folder })));
  const current = els.scope.value;
  els.scope.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: 'Todas las carpetas' }),
    ...unique.map(folder => Object.assign(document.createElement('option'), { value: folder, textContent: `Solo «${folder}»` })),
  );
  els.scope.value = unique.includes(current) ? current : '';
  const count = personalItems().length;
  els.exportPersonal.disabled = !count || exportingAll;
  els.exportPersonal.textContent = els.scope.value
    ? `Exportar «${els.scope.value}» (${count}) · ZIP`
    : count > 1 ? `Exportar todas (${count}) · ZIP` : 'Exportar todas (ZIP)';
}

function personalItems() {
  const scope = els.scope.value;
  return collection.exportable().filter(item => {
    if (!scope) return true;
    const folder = sanitizeFolder(item.folder);
    return folder === scope || folder.startsWith(scope + '/');
  });
}

async function exportImage() {
  const item = collection.active;
  if (!state.hasImage || !item) return;
  try {
    const name = `${sanitizeFileName(personalBaseName(item))}.${personalFormat().ext}`;
    downloadBlob(await encodePersonal(state, personalOptions()), name);
    setStatus(`${name} descargado (${els.size.value} × ${els.size.value} px).`, 'ok');
  } catch (error) {
    console.error('[Miniface Studio]', error);
    setStatus('No se pudo generar la imagen: ' + error.message, 'error');
  }
}

/** ZIP con las minifaces terminadas, cada una dentro de su carpeta o colección. */
async function exportPersonalZip() {
  const items = personalItems();
  if (!items.length || exportingAll) return;
  exportingAll = true;
  renderPersonalScope();
  try {
    const options = personalOptions();
    const paths = personalPaths(items.map(item => ({ folder: item.folder, fileName: personalBaseName(item) })), options.format);
    const files = [];
    for (const [index, item] of items.entries()) {
      setStatus(`Generando imagen ${index + 1} de ${items.length}…`, 'info');
      files.push({ path: paths[index], data: new Uint8Array(await (await encodePersonal(item, options)).arrayBuffer()) });
    }
    const scope = els.scope.value;
    const name = `${scope ? sanitizeFileName(scope.replace(/\//g, ' - ')) : 'minifaces'}.zip`;
    downloadBlob(new Blob([personalZip(files)], { type: 'application/zip' }), name);
    const folders = new Set(paths.map(path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')).size;
    setStatus(`${name} descargado: ${files.length} ${personalFormat().label} de ${options.size} px en ${folders} carpeta${folders === 1 ? '' : 's'}.`, 'ok');
  } catch (error) {
    console.error('[Miniface Studio]', error);
    setStatus('No se pudo generar el ZIP: ' + error.message, 'error');
  } finally {
    exportingAll = false;
    renderPersonalScope();
  }
}

/** Enter en el nombre de archivo: pasa a la siguiente miniface sin imagen, o deja listo para pegar. */
function confirmNameAndAdvance() {
  const next = nextPendingInView();
  if (next) {
    selectItem(next.uid, { focusId: true });
    setStatus('Siguiente miniface pendiente. Pegá su imagen (Ctrl + V).', 'ok');
  } else {
    newPlayer();
    setStatus('Listo. Miniface nueva preparada: pegá su imagen (Ctrl + V) o exportá la colección.', 'ok');
  }
}

// ---------- Modos ----------

function setMode(mode, { save = true } = {}) {
  if (!Object.values(MODES).includes(mode)) return;
  collection.setMode(mode);
  document.body.dataset.mode = mode;
  for (const button of els.modeButtons) {
    const checked = button.dataset.mode === mode;
    button.setAttribute('aria-checked', String(checked));
    button.tabIndex = checked ? 0 : -1;
  }
  els.modeDesc.textContent = MODE_TEXT[mode];
  // La pestaña EDIT solo existe en modo PES 2018.
  const team = els.tabs.find(tab => tab.id === 'ms-tab-btn-team');
  if (mode === MODES.PERSONAL && team.getAttribute('aria-selected') === 'true') selectTab(els.tabs[0]);
  renderCollection();
  syncControls();
  if (save) {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* sin almacenamiento */ }
    scheduleSave();
    setStatus(mode === MODES.PERSONAL
      ? 'Modo uso personal: sin EDIT ni ID obligatorio. Elegí nombre, carpeta y formato (PNG, WebP o JPG).'
      : 'Modo PES 2018: IDs del EDIT, DDS 128 × 128 y CPK.', 'info');
  }
}

function setupModes() {
  els.modeButtons.forEach((button, index) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
    button.addEventListener('keydown', event => {
      const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      const next = els.modeButtons[(index + delta + els.modeButtons.length) % els.modeButtons.length];
      setMode(next.dataset.mode);
      next.focus();
    });
  });
  try { els.pngSize.value = String(exportSize(localStorage.getItem(PNG_SIZE_KEY) || TEMPLATE.size)); } catch { /* sin almacenamiento */ }
  els.pngSize.addEventListener('change', () => {
    els.pngSize.value = String(exportSize(els.pngSize.value));
    try { localStorage.setItem(PNG_SIZE_KEY, els.pngSize.value); } catch { /* sin almacenamiento */ }
  });
  for (const select of [els.format, els.size, els.bg]) select.addEventListener('change', () => { syncPersonalOptions(); renderCollection(); });
  els.scope.addEventListener('change', renderPersonalScope);
  els.fileBase.addEventListener('input', () => { if (collection.active) collection.setMeta(collection.activeUid, { fileName: els.fileBase.value }); });
  els.fileBase.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); confirmNameAndAdvance(); } });
  els.folder.addEventListener('input', () => { if (collection.active) collection.setMeta(collection.activeUid, { folder: els.folder.value }); });
  els.folder.addEventListener('change', () => {
    els.folder.value = sanitizeFolder(els.folder.value);
    if (collection.active) collection.setMeta(collection.activeUid, { folder: els.folder.value });
  });
  let prefs = null;
  try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch { /* sin almacenamiento */ }
  applyPersonalOptions(prefs);
  let saved = null;
  try { saved = localStorage.getItem(MODE_KEY); } catch { /* sin almacenamiento */ }
  setMode(saved || MODES.PES2018, { save: false });
}

// ---------- Pestañas ----------

function selectTab(tab, { focus = false } = {}) {
  for (const button of els.tabs) {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
}

function setupTabs() {
  els.tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      const visible = els.tabs.filter(button => getComputedStyle(button).display !== 'none');
      const at = visible.indexOf(tab);
      selectTab(visible[(at + delta + visible.length) % visible.length], { focus: true });
    });
  });
}

// ---------- Equipos (EDIT00000000) ----------

const fold = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function allTeams() {
  const map = new Map(editTeams.map(team => [team.id, team]));
  for (const team of projectTeams.values()) if (!map.has(team.id)) map.set(team.id, team);
  return [...map.values()];
}

function updateTeamAvailability() {
  const teams = allTeams();
  els.clubSearch.disabled = !teams.length;
  const origin = editTeams.length ? '' : ' del proyecto';
  els.clubSearch.placeholder = teams.length ? `Buscar entre ${teams.length.toLocaleString('es')} ${teams.length === 1 ? 'club' : 'clubes'}${origin}…` : 'Importá tu EDIT para ver los clubes';
  els.teamBadge.hidden = !projectTeams.size;
  els.teamBadge.textContent = String(projectTeams.size);
  els.playerGlobal.disabled = !editPlayers.length && !teams.length;
  els.playerGlobal.placeholder = editPlayers.length ? `Buscar entre ${editPlayers.length.toLocaleString('es')} jugadores (nombre o ID)…`
    : teams.length ? 'Buscar en los clubes del proyecto…' : 'Importá tu EDIT para buscar jugadores';
  renderLeagueList();
}

// ---------- Ligas del EDIT ----------

/** Ligas del EDIT (nombres leídos del propio archivo) y un grupo final con los equipos sin liga. */
function nameLeagues(leagues, teams) {
  const byId = new Map(teams.map(team => [team.id, team]));
  const named = leagues.map(league => ({ ...league, teamIds: league.teamIds.filter(id => byId.has(id)) }));
  const inLeague = new Set(leagues.flatMap(league => league.teamIds));
  const others = teams.filter(team => !inLeague.has(team.id)).map(team => team.id);
  if (others.length) named.push({ key: 'others', name: 'Selecciones y otros equipos', group: true, teamIds: others });
  return named;
}

function renderLeagueList() {
  const hasEdit = editLeagues.length > 0;
  els.leagueEmpty.hidden = hasEdit;
  els.leagueEmpty.textContent = projectTeams.size && !editTeams.length
    ? 'Las ligas salen del EDIT. Importalo de nuevo, o buscá en «Clubes» los equipos de tu proyecto.'
    : 'Importá tu EDIT para ver sus ligas.';
  if (!hasEdit) { els.leagueList.hidden = true; els.leagueDetail.hidden = true; return; }
  if (currentLeague) { renderLeagueDetail(); return; }
  els.leagueDetail.hidden = true;
  els.leagueList.hidden = false;
  const teams = new Map(editTeams.map(team => [team.id, team]));
  els.leagueList.replaceChildren(...editLeagues.map(league => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.leagueKey = league.key;
    const sample = league.teamIds.slice(0, 3).map(id => teams.get(id)?.name).filter(Boolean).join(', ');
    button.title = league.fromEdit ? 'Nombre leído de tu EDIT' : league.group ? 'Equipos que en PES 2018 no juegan una liga' : 'Nombre estándar: tu EDIT no renombra esta liga';
    button.innerHTML = `<span>${escapeHtml(league.name)}<span class="ms-league-sub">${escapeHtml(sample)}</span></span><small>${league.teamIds.length} clubes</small>`;
    li.appendChild(button);
    return li;
  }));
}

function renderLeagueDetail() {
  const league = editLeagues.find(entry => entry.key === currentLeague);
  if (!league) { currentLeague = null; renderLeagueList(); return; }
  els.leagueList.hidden = true;
  els.leagueDetail.hidden = false;
  els.leagueName.textContent = league.name;
  const teams = new Map(allTeams().map(team => [team.id, team]));
  els.leagueClubs.replaceChildren(...league.teamIds.map(id => teams.get(id)).filter(Boolean).map(team => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.teamId = String(team.id);
    const progress = teamProgress(team);
    button.innerHTML = `<span>${escapeHtml(team.name)}</span><small>${progress.done ? `${progress.done}/${progress.total} hechas` : `${team.squad.length} jugadores`}</small>`;
    li.className = 'ms-club-row';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'ms-club-add';
    add.dataset.addTeam = String(team.id);
    const added = team.squad.length > 0 && team.squad.every(player => collection.findPlayer(team.id, player.id));
    add.textContent = added ? '✓' : '+';
    add.disabled = added;
    add.title = added ? `${team.name} ya está completo en la colección` : `Agregar toda la plantilla de ${team.name} a la colección`;
    add.setAttribute('aria-label', add.title);
    li.append(button, add);
    return li;
  }));
}

// ---------- Búsqueda de jugadores ----------

const PLAYER_RESULTS = 50;

function playerPool() {
  if (editPlayers.length) return editPlayers;
  // Sin EDIT: jugadores de los clubes guardados en el proyecto.
  const map = new Map();
  for (const team of projectTeams.values()) for (const player of team.squad) if (!map.has(player.id)) map.set(player.id, player);
  return [...map.values()];
}

function itemForPlayer(playerId) {
  const id = String(playerId);
  const teams = playerTeams.get(playerId) || [];
  return collection.items.find(item => item.id === id && (item.teamId == null || teams.includes(item.teamId) || !teams.length)) || null;
}

function statusChip(item) {
  const status = item ? collection.status(item) : null;
  return status === STATUS.DONE ? '<span class="ms-chip is-done">Hecha</span>'
    : status === STATUS.SKIPPED ? '<span class="ms-chip is-skipped">Omitida</span>'
    : status === STATUS.PENDING ? '<span class="ms-chip is-pending">Pendiente</span>'
    : '<span class="ms-chip">Sin agregar</span>';
}

function renderPlayerResults() {
  const raw = els.playerGlobal.value.trim();
  const query = fold(raw);
  if (query.length < 2 && !/^\d+$/.test(raw)) {
    els.playerResults.replaceChildren();
    return;
  }
  const teams = new Map(allTeams().map(team => [team.id, team]));
  const matches = [];
  for (const player of playerPool()) {
    if (String(player.id) === raw || fold(player.name).includes(query) || fold(player.shirtName).includes(query) || (/^\d{3,}$/.test(raw) && String(player.id).startsWith(raw))) {
      matches.push(player);
      if (matches.length >= PLAYER_RESULTS) break;
    }
  }
  if (!matches.length) {
    const li = document.createElement('li');
    li.innerHTML = '<p class="ms-hint" style="padding:8px 10px">Ningún jugador coincide.</p>';
    els.playerResults.replaceChildren(li);
    return;
  }
  els.playerResults.replaceChildren(...matches.map(player => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.globalPlayer = String(player.id);
    const clubs = (playerTeams.get(player.id) || []).map(id => teams.get(id)?.name).filter(Boolean);
    const special = player.id >= SPECIAL_ID_FLAG ? `<span class="ms-chip is-special" title="ID inflado: en el juego es ${player.id - SPECIAL_ID_FLAG}">ID ${player.id - SPECIAL_ID_FLAG}</span>` : '';
    button.innerHTML = `<span class="ms-squad-num">·</span><span class="ms-squad-name">${escapeHtml(player.name || player.shirtName || 'Sin nombre')}<small>ID ${player.id}${clubs.length ? ' · ' + escapeHtml(clubs.join(', ')) : ' · sin club en el EDIT'}</small></span><span>${statusChip(itemForPlayer(player.id))}${special}</span>`;
    li.appendChild(button);
    return li;
  }));
}

/** Jugador puntual: se agrega (o se selecciona) sin cargar la plantilla completa de su club. */
function pickGlobalPlayer(playerId) {
  const player = playerPool().find(entry => entry.id === playerId);
  if (!player) return;
  const teamId = (playerTeams.get(playerId) || [])[0] ?? null;
  if (teamId != null) { const team = editTeams.find(entry => entry.id === teamId); if (team) registerTeam(team); }
  const team = teamId != null ? allTeams().find(entry => entry.id === teamId) : null;
  const created = !itemForPlayer(playerId);
  const item = itemForPlayer(playerId) || collection.addSlot({ id: player.id, name: player.name, shirtName: player.shirtName, teamId });
  if (created) {
    if (team) collection.setMeta(item.uid, { folder: ensureTeamFolder(team) });
    else adoptFolder(item);
  }
  selectItem(item.uid);
  renderPlayerResults();
  setStatus(item.source ? `${player.name}: miniface lista para ajustar.` : `${player.name || 'Jugador'} (ID ${player.id}): pegá su miniface con Ctrl + V.`, 'ok');
}

// ---------- Subpestañas del EDIT ----------

function selectSubtab(tab, { focus = false } = {}) {
  for (const button of els.subtabs) {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
  if (tab.id === 'ms-sub-club') renderClubResults();
  if (tab.id === 'ms-sub-player') { renderPlayerResults(); if (!els.playerGlobal.disabled) els.playerGlobal.focus(); }
}

function renderClubResults() {
  const query = fold(els.clubSearch.value.trim());
  const teams = allTeams();
  if (!query && !projectTeams.size) { els.clubResults.hidden = true; return; }
  // Sin búsqueda: los equipos del proyecto primero (para retomar rápido).
  const matches = query
    ? teams.filter(team => fold(team.name).includes(query) || fold(team.abbr) === query || String(team.id) === query)
    : [...projectTeams.values()];
  matches.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  els.clubResults.replaceChildren(...matches.slice(0, CLUB_RESULTS).map(team => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.dataset.teamId = String(team.id);
    const progress = teamProgress(team);
    button.innerHTML = `<span>${escapeHtml(team.name)}</span><small>${progress.done ? `${progress.done}/${progress.total} hechas` : `${team.squad.length} jugadores`}</small>`;
    li.appendChild(button);
    return li;
  }));
  if (!matches.length) {
    const li = document.createElement('li');
    li.innerHTML = '<p class="ms-hint" style="padding:8px 10px">Ningún club coincide.</p>';
    els.clubResults.appendChild(li);
  }
  els.clubResults.hidden = false;
}

function teamProgress(team) {
  let done = 0;
  for (const player of team.squad) {
    const item = collection.findPlayer(team.id, player.id);
    if (item && collection.status(item) === STATUS.DONE) done++;
  }
  return { done, total: team.squad.length };
}

/** Plantilla ordenada por posición registrada y, dentro de cada posición, por dorsal. */
function sortedSquad(team) {
  return team.squad.map((player, index) => ({ player, index }))
    .sort((a, b) => positionRank(a.player.position) - positionRank(b.player.position) || (a.player.number || 99) - (b.player.number || 99) || a.index - b.index)
    .map(entry => entry.player);
}

/**
 * Carpeta del equipo: si sus minifaces ya están en una carpeta se reutiliza esa; si no, se crea
 * una con el nombre del club. Devuelve la ruta.
 */
function teamFolderOf(team) {
  const counts = new Map();
  for (const item of collection.items) if (item.teamId === team.id && item.folder) counts.set(item.folder, (counts.get(item.folder) || 0) + 1);
  const used = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (used) return used[0];
  const plain = sanitizeFolder(team.name);
  if (projectFolders.has(plain)) return plain;
  // Equipo nuevo: dentro de la carpeta de su liga, si se la conoce por el EDIT.
  const league = editLeagues.find(entry => entry.key !== 'others' && entry.teamIds.includes(team.id));
  return league ? sanitizeFolder(`${league.name}/${team.name}`) : plain;
}

/** El equipo pasa a formar parte del proyecto (solo al agregar jugadores, no por mirarlo). */
function registerTeam(team) {
  if (projectTeams.has(team.id)) return;
  projectTeams.set(team.id, team);
  updateTeamAvailability();
}

/**
 * Quita un equipo del proyecto con sus minifaces y su carpeta. Si ya hay imágenes cargadas, primero avisa
 * cuántas se pierden. Las minifaces de esa carpeta que no son del equipo se conservan.
 */
function removeTeam(team) {
  const folder = teamFolderOf(team);
  const items = collection.items.filter(item => item.teamId === team.id);
  const withImage = items.filter(item => item.source).length;
  if (withImage && !window.confirm(`¿Eliminar «${team.name}» del proyecto?\n\nSe ${withImage === 1 ? 'va a borrar 1 miniface ya cargada' : `van a borrar ${withImage} minifaces ya cargadas`} de este equipo. Si querés conservar${withImage === 1 ? 'la' : 'las'}, exportá el proyecto antes.`)) return;
  const uids = items.map(item => item.uid);
  const keepFolder = collection.items.some(item => item.teamId !== team.id && MinifaceCollection.inFolder(item, folder));
  if (lastReplaced && uids.includes(lastReplaced.uid)) forgetReplaced();
  for (const uid of uids) thumbCanvases.delete(uid);
  projectTeams.delete(team.id);
  if (!keepFolder) {
    for (const path of [...projectFolders]) if (path === folder || path.startsWith(folder + '/')) projectFolders.delete(path);
    if ((folderFilter || '') === folder) folderFilter = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : null;
  }
  if (currentTeamId === team.id) closeTeam();
  collection.removeMany(uids);
  // Si la liga quedó vacía, la vista sube hasta donde todavía hay algo.
  while (folderFilter && !allFolders().includes(folderFilter)) folderFilter = folderFilter.includes('/') ? folderFilter.slice(0, folderFilter.lastIndexOf('/')) : null;
  renderCollection();
  updateTeamAvailability();
  scheduleSave();
  setStatus(`«${team.name}» eliminado del proyecto${uids.length ? ` (${uids.length} jugador${uids.length === 1 ? '' : 'es'})` : ''}.`, 'info');
}

function ensureTeamFolder(team) {
  const folder = addProjectFolder(teamFolderOf(team));
  // Las minifaces de este club que todavía no tienen carpeta pasan a la suya.
  const loose = collection.items.filter(item => item.teamId === team.id && !item.folder).map(item => item.uid);
  if (loose.length) collection.moveToFolder(loose, folder);
  return folder;
}

function openTeam(teamId) {
  const team = allTeams().find(entry => entry.id === teamId);
  if (!team) return;
  currentTeamId = teamId;
  selectedPlayers.clear();
  els.teamView.hidden = false;
  els.teamName.textContent = team.name;
  els.clubResults.hidden = true;
  els.clubSearch.value = '';
  els.playerSearch.value = '';
  updateTeamAvailability();
  // Abrirlo solo muestra su plantilla: entra al proyecto recién cuando se agrega algún jugador.
  if (projectTeams.has(teamId)) setFolderFilter(ensureTeamFolder(team));
  renderSquad();
  renderLeagueList();
  setStatus(`${team.name}: elegí un jugador, marcá varios o agregá toda la plantilla.`, 'info');
}

function squadStatusChip(status) {
  return status === STATUS.DONE ? '<span class="ms-chip is-done">Hecha</span>'
    : status === STATUS.SKIPPED ? '<span class="ms-chip is-skipped">Omitida</span>'
    : status === STATUS.PENDING ? '<span class="ms-chip is-pending">Pendiente</span>'
    : '<span class="ms-chip">Sin agregar</span>';
}

function renderSquad() {
  const team = currentTeamId != null ? allTeams().find(entry => entry.id === currentTeamId) : null;
  if (!team) { els.teamView.hidden = true; return; }
  const { done, total } = teamProgress(team);
  els.teamProgress.textContent = `${done}/${total} hechas`;
  els.teamBar.style.width = total ? `${(done / total) * 100}%` : '0';
  const query = fold(els.playerSearch.value.trim());
  const active = collection.active;
  const rows = sortedSquad(team).filter(player => !query || fold(player.name).includes(query) || fold(player.shirtName).includes(query) || String(player.id).includes(query) || fold(POSITIONS[player.position]) === query);
  const selectable = rows.filter(player => !collection.findPlayer(team.id, player.id));
  for (const id of [...selectedPlayers]) if (collection.findPlayer(team.id, id)) selectedPlayers.delete(id);
  els.squad.replaceChildren(...rows.map(player => {
    const item = collection.findPlayer(team.id, player.id);
    const li = document.createElement('li');
    if (item && active && item.uid === active.uid) li.className = 'is-current';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'ms-squad-check';
    check.dataset.selectPlayer = String(player.id);
    check.checked = Boolean(item) || selectedPlayers.has(player.id);
    check.disabled = Boolean(item);
    check.setAttribute('aria-label', item ? `${player.name}: ya está en la colección` : `Seleccionar a ${player.name}`);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.playerId = String(player.id);
    const position = POSITIONS[player.position] || '';
    const special = player.special ? `<span class="ms-chip is-special" title="ID inflado: en el juego es ${player.id - SPECIAL_ID_FLAG}">ID ${player.id - SPECIAL_ID_FLAG}</span>` : '';
    button.innerHTML = `<span class="ms-squad-num">${player.number || '–'}</span><span class="ms-pos" title="Posición registrada">${position}</span><span class="ms-squad-name">${escapeHtml(player.name || 'Jugador sin datos en el EDIT')}<small>ID ${player.id}</small></span><span>${squadStatusChip(item ? collection.status(item) : null)}${special}</span>`;
    li.append(check, button);
    return li;
  }));
  els.selectAll.checked = selectable.length > 0 && selectable.every(player => selectedPlayers.has(player.id));
  els.selectAll.indeterminate = !els.selectAll.checked && selectable.some(player => selectedPlayers.has(player.id));
  els.selectAll.disabled = !selectable.length;
  els.addSelected.disabled = !selectedPlayers.size;
  els.addSelected.textContent = selectedPlayers.size ? `Agregar seleccionados (${selectedPlayers.size})` : 'Agregar seleccionados';
}

/** Selecciona (o crea) la miniface del jugador elegido, con su nombre e ID del EDIT. */
function pickPlayer(teamId, playerId) {
  const team = allTeams().find(entry => entry.id === teamId);
  const player = team?.squad.find(entry => entry.id === playerId);
  if (!player) return;
  let item = collection.findPlayer(teamId, playerId);
  if (!item) {
    registerTeam(team);
    item = collection.addSlot({ id: player.id, name: player.name, shirtName: player.shirtName, teamId });
    collection.setMeta(item.uid, { folder: ensureTeamFolder(team) });
  }
  selectItem(item.uid);
  setStatus(item.source ? `${player.name}: miniface lista para ajustar.` : `${player.name || 'Jugador'} (ID ${player.id}): pegá su miniface con Ctrl + V.`, 'ok');
}

function closeTeam() {
  currentTeamId = null;
  selectedPlayers.clear();
  els.teamView.hidden = true;
}

/** Agrega a la colección (en la carpeta del club y por orden de posición) los jugadores indicados. */
function addPlayers(team, players) {
  registerTeam(team);
  const folder = ensureTeamFolder(team);
  const slots = [];
  for (const player of players) {
    if (collection.findPlayer(team.id, player.id)) continue;
    slots.push(collection.createItem({ id: player.id, name: player.name, shirtName: player.shirtName, teamId: team.id, folder }));
  }
  collection.addMany(slots);
  if (folderFilter !== folder) setFolderFilter(folder);
  const first = sortedSquad(team).map(player => collection.findPlayer(team.id, player.id)).find(item => item && !item.source && !item.skipped);
  if (first) selectItem(first.uid);
  return slots.length;
}

function addSquad() {
  const team = allTeams().find(entry => entry.id === currentTeamId);
  if (!team) return;
  const added = addPlayers(team, sortedSquad(team));
  selectedPlayers.clear();
  renderSquad();
  selectTab(els.tabs[0]);
  setStatus(added ? `${added} jugadores de ${team.name} agregados en orden de posición. Pegá la miniface de cada uno (Enter o Av Pág pasa al siguiente).` : `La plantilla de ${team.name} ya está en la colección.`, 'ok');
}

function addSelected() {
  const team = allTeams().find(entry => entry.id === currentTeamId);
  if (!team || !selectedPlayers.size) return;
  const added = addPlayers(team, sortedSquad(team).filter(player => selectedPlayers.has(player.id)));
  selectedPlayers.clear();
  renderSquad();
  selectTab(els.tabs[0]);
  setStatus(`${added} jugador${added === 1 ? '' : 'es'} de ${team.name} agregado${added === 1 ? '' : 's'} a la carpeta. Pegá la miniface de cada uno (Enter o Av Pág pasa al siguiente).`, 'ok');
}

function toggleSelectAll(checked) {
  const team = allTeams().find(entry => entry.id === currentTeamId);
  if (!team) return;
  const query = fold(els.playerSearch.value.trim());
  for (const player of team.squad) {
    if (collection.findPlayer(team.id, player.id)) continue;
    if (query && !(fold(player.name).includes(query) || fold(player.shirtName).includes(query) || String(player.id).includes(query) || fold(POSITIONS[player.position]) === query)) continue;
    if (checked) selectedPlayers.add(player.id); else selectedPlayers.delete(player.id);
  }
  renderSquad();
}

async function importEdit(file) {
  setStatus('Leyendo EDIT00000000…', 'info');
  try {
    const result = await readEditFile(file);
    editTeams = result.teams;
    editPlayers = result.players;
    playerTeams.clear();
    for (const team of result.teams) for (const player of team.squad) {
      if (!playerTeams.has(player.id)) playerTeams.set(player.id, []);
      playerTeams.get(player.id).push(team.id);
    }
    editLeagues = nameLeagues(result.leagues, result.teams);
    // Para un jugador puntual, primero su club (equipo inscripto en una liga) y después la selección.
    const leagueTeams = new Set(result.leagues.flatMap(league => league.teamIds));
    for (const ids of playerTeams.values()) ids.sort((a, b) => Number(leagueTeams.has(b)) - Number(leagueTeams.has(a)));
    currentLeague = null;
    els.editInfo.innerHTML = `EDIT leído: <strong>${result.teams.length.toLocaleString('es')} clubes</strong>, ${editLeagues.length} ligas y ${result.playerCount.toLocaleString('es')} jugadores. El archivo no se modificó ni se subió.`;
    updateTeamAvailability();
    selectSubtab(els.subtabs[0]);
    setStatus('EDIT leído. Elegí una liga, buscá un club o buscá un jugador puntual.', 'ok');
  } catch (error) {
    console.warn('[Miniface Studio]', error);
    setStatus(error instanceof EditError ? error.message : 'No se pudo leer el EDIT.', 'error');
  }
}

function setupTeams() {
  els.editFile.addEventListener('change', () => {
    const file = els.editFile.files?.[0];
    els.editFile.value = '';
    if (file) importEdit(file);
  });
  els.clubSearch.addEventListener('input', renderClubResults);
  els.clubSearch.addEventListener('focus', renderClubResults);
  els.clubSearch.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); els.clubResults.querySelector('button')?.click(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); els.clubResults.querySelector('button')?.focus(); }
  });
  els.clubResults.addEventListener('click', event => {
    const button = event.target.closest('[data-team-id]');
    if (button) openTeam(Number(button.dataset.teamId));
  });
  els.playerSearch.addEventListener('input', renderSquad);
  els.subtabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectSubtab(tab));
    tab.addEventListener('keydown', event => {
      const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      selectSubtab(els.subtabs[(index + delta + els.subtabs.length) % els.subtabs.length], { focus: true });
    });
  });
  els.leagueList.addEventListener('click', event => {
    const button = event.target.closest('[data-league-key]');
    if (!button) return;
    currentLeague = button.dataset.leagueKey;
    renderLeagueDetail();
  });
  els.leagueClubs.addEventListener('click', event => {
    const add = event.target.closest('[data-add-team]');
    if (add) {
      // Agregar de un clic y seguir en la liga, para sumar varios equipos seguidos.
      const team = allTeams().find(entry => entry.id === Number(add.dataset.addTeam));
      if (team) {
        const added = addPlayers(team, sortedSquad(team));
        renderLeagueDetail();
        setStatus(`${team.name}: ${added} jugadores agregados a la colección.`, 'ok');
      }
      return;
    }
    const button = event.target.closest('[data-team-id]');
    if (button) openTeam(Number(button.dataset.teamId));
  });
  els.playerGlobal.addEventListener('input', renderPlayerResults);
  els.playerResults.addEventListener('click', event => {
    const button = event.target.closest('[data-global-player]');
    if (button) pickGlobalPlayer(Number(button.dataset.globalPlayer));
  });
  els.squad.addEventListener('change', event => {
    const check = event.target.closest('[data-select-player]');
    if (!check) return;
    const id = Number(check.dataset.selectPlayer);
    if (check.checked) selectedPlayers.add(id); else selectedPlayers.delete(id);
    renderSquad();
  });
  els.selectAll.addEventListener('change', () => toggleSelectAll(els.selectAll.checked));
  els.squad.addEventListener('click', event => {
    const button = event.target.closest('[data-player-id]');
    if (button) pickPlayer(currentTeamId, Number(button.dataset.playerId));
  });
}

// ---------- Carpetas del proyecto ----------

/** Todas las carpetas: las creadas (aunque estén vacías), las usadas y sus carpetas superiores. */
function allFolders() {
  const set = new Set();
  const add = folder => {
    const clean = sanitizeFolder(folder);
    if (!clean) return;
    const parts = clean.split('/');
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
  };
  projectFolders.forEach(add);
  collection.folders().forEach(add);
  // Equipos del proyecto sin jugadores todavía: siguen visibles para poder entrar o quitarlos.
  for (const team of projectTeams.values()) add(teamFolderOf(team));
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

function addProjectFolder(folder) {
  const clean = sanitizeFolder(folder);
  if (clean) projectFolders.add(clean);
  return clean;
}

/** Las minifaces nuevas se crean dentro de la carpeta que se está viendo. */
function adoptFolder(item) {
  if (item && folderFilter && !item.folder) collection.setMeta(item.uid, { folder: folderFilter });
  return item;
}

function setFolderFilter(folder) {
  folderFilter = folder;
  els.collSearch.value = '';
  const here = folder || '';
  const own = collection.items.filter(item => (item.folder || '') === here);
  const inside = folder == null ? collection.items : collection.items.filter(item => MinifaceCollection.inFolder(item, folder));
  // Entrar a un equipo abre su primer jugador; en una carpeta vacía nada queda seleccionado, así
  // pegar nunca le cambia la imagen a un jugador de otra carpeta.
  if (own.length && !own.some(item => item.uid === collection.activeUid)) {
    const firstPending = own.find(item => !item.source && !item.skipped);
    collection.select((firstPending || own[0]).uid);
  } else if (folder != null && !inside.length) collection.deselect();
  renderCollection();
  syncControls();
  if (folder != null) setStatus(`Mostrando ${folder === '' ? 'las minifaces sin carpeta' : `«${folder}»`} (${inside.length}). Lo que agregues ahora se guarda ahí.`, 'info');
}

const folderCount = folder => collection.items.filter(item => MinifaceCollection.inFolder(item, folder)).length;

function renderFolders() {
  if (!els.folders) return;
  const folders = allFolders();
  const row = (folder, label, { tools = true, depth = 0 } = {}) => {
    const li = document.createElement('li');
    li.dataset.folder = folder ?? '*';
    if (folder === folderFilter) li.classList.add('is-current');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'ms-folder-open';
    open.dataset.folderAction = 'open';
    open.style.paddingLeft = `${9 + depth * 14}px`;
    open.title = folder ? folder : label;
    open.innerHTML = `<span><span class="ms-folder-ico" aria-hidden="true">${folder == null ? '▦' : folder === '' ? '◌' : '▸'}</span>${escapeHtml(label)}</span><small>${folder == null ? collection.size : folderCount(folder)}</small>`;
    li.appendChild(open);
    if (tools) {
      for (const [action, text, title, extra] of [['rename', '✎', 'Renombrar', ''], ['delete', '×', 'Eliminar carpeta', ' is-danger']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ms-folder-tool' + extra;
        button.dataset.folderAction = action;
        button.title = `${title} «${folder}»`;
        button.setAttribute('aria-label', `${title} «${folder}»`);
        button.textContent = text;
        li.appendChild(button);
      }
    }
    return li;
  };
  els.folders.replaceChildren(
    row(null, 'Todas las carpetas', { tools: false }),
    row('', 'Sin carpeta', { tools: false }),
    ...folders.map(folder => row(folder, folder.split('/').pop(), { depth: folder.split('/').length - 1 })),
  );
  const current = els.moveTarget.value;
  els.moveTarget.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: 'Sin carpeta' }),
    ...folders.map(folder => Object.assign(document.createElement('option'), { value: folder, textContent: folder })),
  );
  if ([...els.moveTarget.options].some(option => option.value === current)) els.moveTarget.value = current;
}

function createFolder() {
  const folder = addProjectFolder(els.folderNew.value);
  if (!folder) { setStatus('Escribí un nombre para la carpeta.', 'error'); els.folderNew.focus(); return; }
  els.folderNew.value = '';
  renderFolders();
  scheduleSave();
  setStatus(`Carpeta «${folder}» creada. Arrastrá minifaces sobre ella o usá «Mover».`, 'ok');
}

function startRename(li) {
  const folder = li.dataset.folder;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ms-folder-rename';
  input.value = folder;
  input.setAttribute('aria-label', `Nuevo nombre para «${folder}»`);
  li.replaceChildren(input);
  input.focus();
  input.select();
  let done = false;
  const finish = commit => {
    if (done) return;
    done = true;
    const target = sanitizeFolder(input.value);
    if (commit && target && target !== folder) renameFolder(folder, target);
    else renderFolders();
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function renameFolder(from, to) {
  const remap = path => (path === from || path.startsWith(from + '/') ? to + path.slice(from.length) : path);
  const next = [...projectFolders].map(remap);
  projectFolders.clear();
  next.forEach(addProjectFolder);
  addProjectFolder(to);
  const moved = collection.renameFolder(from, to);
  if (folderFilter && (folderFilter === from || folderFilter.startsWith(from + '/'))) folderFilter = remap(folderFilter);
  renderCollection();
  syncControls();
  loadActive();
  scheduleSave();
  setStatus(`Carpeta «${from}» renombrada a «${to}»${moved ? ` (${moved} minifaces)` : ''}.`, 'ok');
}

function deleteFolder(folder) {
  const count = folderCount(folder);
  const parent = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '';
  if (count && !window.confirm(`¿Eliminar la carpeta «${folder}»? Sus ${count} minifaces pasan a ${parent ? `«${parent}»` : '«Sin carpeta»'}; no se borra ninguna imagen.`)) return;
  for (const path of [...projectFolders]) if (path === folder || path.startsWith(folder + '/')) projectFolders.delete(path);
  if (parent) addProjectFolder(parent);
  collection.removeFolder(folder);
  if (folderFilter && (folderFilter === folder || folderFilter.startsWith(folder + '/'))) folderFilter = null;
  renderCollection();
  loadActive();
  scheduleSave();
  setStatus(`Carpeta «${folder}» eliminada${count ? `; ${count} minifaces pasaron a ${parent ? `«${parent}»` : '«Sin carpeta»'}` : ''}.`, 'info');
}

function moveItemsTo(uids, folder) {
  const target = folder ? addProjectFolder(folder) : '';
  const moved = collection.moveToFolder(uids, target);
  loadActive();
  scheduleSave();
  setStatus(moved ? `${moved === 1 ? 'Miniface movida' : `${moved} minifaces movidas`} a ${target ? `«${target}»` : '«Sin carpeta»'}.` : 'Ya estaba en esa carpeta.', moved ? 'ok' : 'info');
}

function moveActiveTo(folder) {
  if (collection.active) moveItemsTo([collection.activeUid], folder);
}

/** PES 2018: agrupa las minifaces de jugadores del EDIT en carpetas «Liga/Club» (o solo «Club»). */
function organizeByTeam() {
  const leagueOf = new Map();
  for (const league of editLeagues) if (league.key !== 'others') for (const id of league.teamIds) leagueOf.set(id, league.name);
  const changes = new Map();
  for (const item of collection.items) {
    const team = teamOf(item);
    if (!team) continue;
    // Las que están en la carpeta creada con el nombre del club también pasan a «Liga/Club».
    if (item.folder && item.folder !== sanitizeFolder(team.name)) continue;
    const target = sanitizeFolder(leagueOf.has(team.id) ? `${leagueOf.get(team.id)}/${team.name}` : team.name);
    if (item.folder === target) continue;
    if (item.folder) projectFolders.delete(item.folder);
    const folder = addProjectFolder(leagueOf.has(team.id) ? `${leagueOf.get(team.id)}/${team.name}` : team.name);
    if (!changes.has(folder)) changes.set(folder, []);
    changes.get(folder).push(item.uid);
  }
  let moved = 0;
  for (const [folder, uids] of changes) moved += collection.moveToFolder(uids, folder);
  renderCollection();
  loadActive();
  scheduleSave();
  setStatus(moved ? `${moved} minifaces organizadas en ${changes.size} carpetas por ${editLeagues.length ? 'liga y equipo' : 'equipo'}. Las que ya tenían carpeta no se tocaron.`
    : 'No hay minifaces de jugadores del EDIT sin carpeta para organizar.', moved ? 'ok' : 'info');
}

function setupFolders() {
  els.folderNewForm.addEventListener('submit', event => { event.preventDefault(); createFolder(); });
  els.folders.addEventListener('click', event => {
    const button = event.target.closest('[data-folder-action]');
    if (!button) return;
    const li = button.closest('li');
    const folder = li.dataset.folder === '*' ? null : li.dataset.folder;
    if (button.dataset.folderAction === 'open') setFolderFilter(folder);
    else if (button.dataset.folderAction === 'rename') startRename(li);
    else if (button.dataset.folderAction === 'delete') deleteFolder(folder);
  });
  // Arrastrar miniaturas de la colección sobre una carpeta.
  const DRAG_TYPE = 'application/x-miniface-uid';
  els.thumbs.addEventListener('dragstart', event => {
    const thumb = event.target.closest?.('.ms-thumb');
    if (!thumb) return;
    event.dataTransfer.setData(DRAG_TYPE, thumb.dataset.uid);
    event.dataTransfer.effectAllowed = 'move';
  });
  const target = event => (Array.from(event.dataTransfer?.types || []).includes(DRAG_TYPE) ? event.target.closest?.('#ms-folders li, #ms-coll-folders li') : null);
  for (const list of [els.folders, els.collFolders]) {
    list.addEventListener('dragover', event => {
      const li = target(event);
      if (!li || li.dataset.folder === '*') return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.is-drop').forEach(el => el !== li && el.classList.remove('is-drop'));
      li.classList.add('is-drop');
    });
    list.addEventListener('dragleave', event => { const li = target(event); if (li && !li.contains(event.relatedTarget)) li.classList.remove('is-drop'); });
    list.addEventListener('drop', event => {
      const li = target(event);
      if (!li || li.dataset.folder === '*') return;
      event.preventDefault();
      li.classList.remove('is-drop');
      moveItemsTo([Number(event.dataTransfer.getData(DRAG_TYPE))], li.dataset.folder);
    });
  }
}

// ---------- Encuadre automático (beta) ----------

let autoBusy = false;

function setAutoBusy(busy) {
  autoBusy = busy;
  els.autoButton.classList.toggle('is-busy', busy);
  els.autoButton.setAttribute('aria-busy', String(busy));
  syncControls();
}

/** Pregunta qué jugador usar cuando hay varios en la foto. Devuelve su rostro, o null si se cancela. */
function choosePlayerInPhoto(source, faces, title) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ms-player-picker';
    const heading = document.createElement('h3');
    heading.textContent = `Hay ${faces.length} jugadores en la foto`;
    const text = document.createElement('p');
    text.textContent = title;
    const list = document.createElement('div');
    list.className = 'ms-player-picker-list';
    let choice = null;
    faces.forEach((face, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Jugador ${index + 1}`);
      const thumb = document.createElement('canvas');
      thumb.width = 112; thumb.height = 112;
      const ctx = thumb.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const side = Math.max(face.w, face.h) * 1.7;
      ctx.drawImage(source.image, face.x + face.w / 2 - side / 2, face.y + face.h / 2 - side / 2, side, side, 0, 0, 112, 112);
      button.append(thumb);
      button.addEventListener('click', () => { choice = face; dialog.close(); });
      list.append(button);
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ms-button';
    cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => dialog.close());
    dialog.append(heading, text, list, cancel);
    dialog.addEventListener('close', () => { dialog.remove(); resolve(choice); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * Detecta el rostro y aplica el encuadre propuesto (solo posición y escala). Si no hay rostro, informa y
 * no cambia nada; si hay varios jugadores, pregunta cuál. Guarda el encuadre anterior para poder recuperarlo.
 */
async function runAutoFrame(item, { onImport = false } = {}) {
  if (!item?.source) return false;
  const source = item.source;
  const before = { x: item.x, y: item.y, scale: item.scale };
  setAutoBusy(true);
  setStatus('Buscando el rostro…', 'info');
  try {
    let result;
    try {
      result = await autoFrame(source);
    } catch (error) {
      if (onImport || error.reason !== 'multiple') throw error;
      const face = await choosePlayerInPhoto(source, error.faces, 'Tocá el que querés encuadrar.');
      if (!face) throw error;
      result = await autoFrame(source, { face });
    }
    if (item.source !== source || !collection.get(item.uid)) return false;
    if (onImport && (item.x !== before.x || item.y !== before.y || item.scale !== before.scale)) {
      setStatus('Encuadre automático omitido: ya ajustaste esta imagen a mano.', 'info');
      return false;
    }
    item.prevFrame = before;
    collection.storeTransform(item.uid, result);
    if (collection.activeUid === item.uid) state.load(source, item);
    paintThumb(item);
    renderCollection();
    scheduleSave();
    const notes = [];
    if (result.hairLimited) notes.push('se dejó margen para no cortar el pelo');
    if (!result.hasAlpha) notes.push('la imagen no tiene transparencia: revisá el resultado');
    setStatus(`Encuadre automático aplicado${notes.length ? ` (${notes.join('; ')})` : ''}. Podés ajustarlo a mano o recuperar el anterior (↶).`, 'ok');
    return true;
  } catch (error) {
    console.warn('[Miniface Studio] encuadre', error);
    setStatus(error instanceof AutoFrameError ? error.message : 'No se pudo encuadrar automáticamente. El control manual sigue disponible.', 'error');
    return false;
  } finally {
    setAutoBusy(false);
  }
}

function maybeAutoFrame(item) {
  if (els.autoOnImport.checked && item?.source) runAutoFrame(item, { onImport: true });
}

/** Alterna entre el encuadre actual y el anterior al automático. */
function undoFrame() {
  const item = collection.active;
  if (!item?.prevFrame || !item.source) return;
  const previous = item.prevFrame;
  item.prevFrame = { x: item.x, y: item.y, scale: item.scale };
  collection.storeTransform(item.uid, previous);
  state.load(item.source, item);
  paintThumb(item);
  scheduleSave();
  setStatus('Encuadre anterior recuperado (↶ vuelve al automático).', 'info');
}

function setupAutoFrame() {
  try { els.autoOnImport.checked = localStorage.getItem(AUTO_KEY) === '1'; } catch { /* sin almacenamiento */ }
  els.autoOnImport.addEventListener('change', () => {
    try { localStorage.setItem(AUTO_KEY, els.autoOnImport.checked ? '1' : '0'); } catch { /* sin almacenamiento */ }
    setStatus(els.autoOnImport.checked ? 'Las imágenes que importes se encuadrarán automáticamente (beta).' : 'Encuadre automático al importar desactivado.', 'info');
  });
}

// ---------- Recorte automático de fondo (beta) ----------

let bgBusy = false;

function setBgBusy(busy) {
  bgBusy = busy;
  els.bgButton.classList.toggle('is-busy', busy);
  els.bgButton.setAttribute('aria-busy', String(busy));
  syncControls();
}

/**
 * Quita el fondo de la miniface: genera una versión con transparencia del mismo tamaño y conserva
 * la imagen original para poder restaurarla. La posición y la escala no cambian.
 */
async function runRemoveBackground(item, { onImport = false } = {}) {
  if (!item?.source || item.original) return false;
  const source = item.source;
  // Al importar no se tocan imágenes que ya vienen recortadas (por ejemplo, de SoFIFA). Con el botón
  // sí se intenta: puede quedar fondo dentro de un recorte (un círculo con fondo blanco, por ejemplo).
  if (onImport && hasTransparency(source)) return false;
  setBgBusy(true);
  setStatus('Quitando el fondo… (la primera vez se carga el modelo, unos 28 MB)', 'info');
  try {
    let face = null;
    if (!onImport) {
      const { faces } = await detectFaces(source).catch(() => ({ faces: [] }));
      const others = faces.length ? otherPlayers(faces, faces[0]) : [];
      if (others.length) {
        face = await choosePlayerInPhoto(source, [faces[0], ...others], 'Tocá el que querés recortar.');
        if (!face) {
          setStatus('Recorte cancelado. La imagen no se modificó.', 'info');
          return false;
        }
        setStatus('Quitando el fondo…', 'info');
      }
    }
    const { blob, removed } = await removeBackground(source, { face });
    if (item.source !== source || !collection.get(item.uid)) return false;
    if (removed < 0.01) {
      setStatus('No encontré fondo para quitar: la imagen ya estaba recortada. No se modificó.', 'info');
      return false;
    }
    const cut = await sourceFromBlob(blob, `${source.name.replace(/\.[a-z0-9]+$/i, '')} (sin fondo).png`);
    item.original = source;
    collection.setSource(item.uid, cut, { x: item.x, y: item.y, scale: item.scale }, { release: false });
    paintThumb(item);
    setStatus('Fondo quitado (beta). Revisá los bordes; si no te convence, «Restaurar fondo» vuelve a la imagen original.', 'ok');
    return true;
  } catch (error) {
    console.warn('[Miniface Studio] recorte', error);
    setStatus(error instanceof BackgroundError ? error.message : 'No se pudo quitar el fondo. La imagen no se modificó.', 'error');
    return false;
  } finally {
    setBgBusy(false);
  }
}

function restoreBackground(item) {
  if (!item?.original) return;
  const original = item.original;
  item.original = null;
  collection.setSource(item.uid, original, { x: item.x, y: item.y, scale: item.scale });
  paintThumb(item);
  setStatus('Fondo original restaurado.', 'info');
}

function toggleBackground(item) {
  if (item?.original) restoreBackground(item);
  else runRemoveBackground(item);
}

/** Después de importar: primero quitar el fondo (si está activado) y después encuadrar. */
async function afterImport(item) {
  if (els.bgOnImport.checked) await runRemoveBackground(item, { onImport: true });
  maybeAutoFrame(item);
}

function setupBackground() {
  try { els.bgOnImport.checked = localStorage.getItem(BG_KEY) === '1'; } catch { /* sin almacenamiento */ }
  els.bgOnImport.addEventListener('change', () => {
    try { localStorage.setItem(BG_KEY, els.bgOnImport.checked ? '1' : '0'); } catch { /* sin almacenamiento */ }
    setStatus(els.bgOnImport.checked ? 'A las imágenes con fondo se les quitará automáticamente al importarlas (beta).' : 'Recorte de fondo al importar desactivado.', 'info');
  });
}

// ---------- Proyecto: guardado automático, exportar, importar y combinar ----------

let saveTimer = 0;
let restoring = false;

function projectState() {
  return { items: collection.items, activeUid: collection.activeUid, teams: [...projectTeams.values()], cpkName: els.cpkName.value, mode: collection.mode, personal: personalOptions(), folders: allFolders() };
}

function scheduleSave() {
  if (restoring || !store) return;
  clearTimeout(saveTimer);
  els.saveDot.className = 'ms-tab-dot';
  saveTimer = setTimeout(saveNow, SAVE_DELAY);
}

async function saveNow() {
  if (!store || restoring) return;
  clearTimeout(saveTimer);
  try {
    await store.save(projectState());
    els.saveDot.className = 'ms-tab-dot is-saved';
    els.projectStatus.textContent = `Guardado automático en este navegador · ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    console.warn('[Miniface Studio] guardado', error);
    els.saveDot.className = 'ms-tab-dot is-error';
    els.projectStatus.textContent = 'No se pudo guardar en este navegador. Exportá el proyecto para no perder el trabajo.';
  }
}

/** Combina un proyecto (archivo o guardado local) con la colección actual, sin perder nada. */
async function mergeProject(json, getBlob) {
  for (const team of mergeTeams([...projectTeams.values()], json.teams)) projectTeams.set(team.id, team);
  for (const folder of json.folders || []) addProjectFolder(folder);
  const plan = planMerge(collection.items, json.items);
  const materializeImage = async (image, incoming) => {
    if (!image) return null;
    const blob = await getBlob(image.hash);
    if (!blob) throw new ProjectError(`Falta la imagen de ${incoming.name || 'ID ' + incoming.id}.`);
    const source = await decodeImage(blob, image.name);
    source.blob = blob;
    source.hash = image.hash;
    return source;
  };
  const materialize = incoming => materializeImage(incoming.image, incoming);
  const added = [];
  for (const incoming of plan.add) {
    const source = await materialize(incoming);
    const item = collection.createItem({ ...incoming, source });
    item.original = await materializeImage(incoming.original, incoming);
    added.push(item);
  }
  for (const [existing, incoming] of plan.fill) {
    const source = await materialize(incoming);
    existing.original = await materializeImage(incoming.original, incoming);
    Object.assign(existing, { source, x: incoming.x, y: incoming.y, scale: incoming.scale, skipped: incoming.skipped, updatedAt: incoming.updatedAt || Date.now() });
    paintThumb(existing);
  }
  added.forEach(paintThumb);
  collection.addMany(added);
  updateTeamAvailability();
  return { added: added.length, filled: plan.fill.length, skipped: plan.skipped };
}

async function restoreProject() {
  if (!store) {
    els.projectStatus.textContent = 'Este navegador no permite guardado automático. Exportá el proyecto para conservar el trabajo.';
    return;
  }
  try {
    const saved = await store.load();
    if (!saved || !saved.json.items.length && !saved.json.teams.length) return;
    restoring = true;
    await mergeProject(saved.json, saved.getBlob);
    if (saved.json.cpkName) els.cpkName.value = saved.json.cpkName;
    if (saved.json.mode) setMode(saved.json.mode, { save: false });
    applyPersonalOptions(saved.json.personal);
    const active = collection.items[saved.json.activeIndex] || collection.items[0];
    if (active) collection.select(active.uid);
    restoring = false;
    renderCollection();
    const { done, pending } = collection.counts();
    els.saveDot.className = 'ms-tab-dot is-saved';
    els.projectStatus.textContent = `Proyecto recuperado de este navegador (guardado ${new Date(saved.json.savedAt).toLocaleString('es')}).`;
    setStatus(`Proyecto recuperado: ${done} terminada${done === 1 ? '' : 's'}, ${pending} pendiente${pending === 1 ? '' : 's'}.`, 'ok');
  } catch (error) {
    restoring = false;
    console.warn('[Miniface Studio] restaurar', error);
    els.projectStatus.textContent = 'No se pudo recuperar el proyecto guardado en este navegador.';
  }
}

async function exportProject() {
  if (!collection.size && !projectTeams.size) { setStatus('El proyecto está vacío.', 'error'); return; }
  try {
    const { bytes } = await buildProjectFile(projectState());
    const date = new Date().toISOString().slice(0, 10);
    const name = `${sanitizeCpkName(els.cpkName.value).replace(/\.cpk$/, '')}_proyecto_${date}${PROJECT_EXTENSION}`;
    downloadBlob(new Blob([bytes], { type: 'application/zip' }), name);
    setStatus(`${name} descargado: ${collection.size} minifaces con sus imágenes originales.`, 'ok');
  } catch (error) {
    console.error('[Miniface Studio]', error);
    setStatus('No se pudo exportar el proyecto: ' + error.message, 'error');
  }
}

async function importProject(file) {
  setStatus('Leyendo proyecto…', 'info');
  try {
    const { json, getBlob } = await readProjectFile(file);
    const hadItems = collection.size;
    const result = await mergeProject(json, getBlob);
    if (!hadItems && collection.items[json.activeIndex]) collection.select(collection.items[json.activeIndex].uid);
    else if (!collection.active && collection.size) collection.select(collection.items[0].uid);
    if (!hadItems && json.cpkName) els.cpkName.value = json.cpkName;
    renderCollection();
    scheduleSave();
    const parts = [`${result.added} agregada${result.added === 1 ? '' : 's'}`];
    if (result.filled) parts.push(`${result.filled} completada${result.filled === 1 ? '' : 's'}`);
    if (result.skipped) parts.push(`${result.skipped} ya existía${result.skipped === 1 ? '' : 'n'}`);
    setStatus(`Proyecto ${hadItems ? 'combinado' : 'abierto'}: ${parts.join(', ')}.`, 'ok');
  } catch (error) {
    console.warn('[Miniface Studio]', error);
    setStatus(error instanceof ProjectError || error instanceof ImportError ? error.message : 'No se pudo importar el proyecto.', 'error');
  }
}

function newProject() {
  if (collection.size && !window.confirm('¿Vaciar la colección y empezar un proyecto nuevo? Si querés conservarlo, exportalo antes.')) return;
  forgetReplaced();
  collection.clear();
  thumbCanvases.clear();
  projectTeams.clear();
  projectFolders.clear();
  folderFilter = null;
  currentTeamId = null;
  els.teamView.hidden = true;
  updateTeamAvailability();
  saveNow();
  setStatus('Proyecto nuevo.', 'info');
}

function setupProject() {
  els.projectFile.addEventListener('change', () => {
    const file = els.projectFile.files?.[0];
    els.projectFile.value = '';
    if (file) importProject(file);
  });
  els.cpkName.addEventListener('change', scheduleSave);
  // Guardar al salir o al cambiar de pestaña del navegador.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
}

// ---------- Acciones ----------

function setupActions() {
  const actions = {
    open: () => els.file.click(),
    paste: () => importBlob(readClipboardImage(), 'imagen del portapapeles', { replace: true }),
    'replace-file': () => els.fileOne.click(),
    'undo-replace': () => undoReplace(),
    'new-player': () => newPlayer(),
    prev: () => goPrev(),
    'next-pending': () => goNextPending(),
    skip: () => toggleSkip(),
    center: () => state.center(),
    reset: () => state.reset(),
    'zoom-in': () => stepZoom(1),
    'zoom-out': () => stepZoom(-1),
    'zoom-in-10': () => stepZoom(10),
    'zoom-out-10': () => stepZoom(-10),
    'export-dds': () => exportDds('dds'),
    'export-cpk': () => exportDds('cpk'),
    'export-zip': () => exportDds('zip'),
    'export-png': () => exportPng(),
    'export-all': () => exportAll('cpk'),
    'export-all-zip': () => exportAll('zip'),
    'export-image': () => exportImage(),
    'export-personal-zip': () => exportPersonalZip(),
    'leagues-back': () => { currentLeague = null; renderLeagueList(); },
    'close-team': () => closeTeam(),
    'add-selected': () => addSelected(),
    'auto-frame': () => runAutoFrame(collection.active),
    'remove-bg': () => toggleBackground(collection.active),
    'undo-frame': () => undoFrame(),
    'move-active': () => moveActiveTo(els.moveTarget.value),
    'folders-by-team': () => organizeByTeam(),
    'open-edit': () => els.editFile.click(),
    'add-squad': () => addSquad(),
    'export-project': () => exportProject(),
    'import-project': () => els.projectFile.click(),
    'new-project': () => newProject(),
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && actions[button.dataset.action] && !button.disabled) actions[button.dataset.action]();
  });
  els.playerId.addEventListener('input', () => {
    const digits = els.playerId.value.replace(/\D+/g, '');
    if (digits !== els.playerId.value) els.playerId.value = digits;
    if (collection.active) collection.setId(collection.activeUid, els.playerId.value);
    updatePlayerId();
  });
  els.cpkName.addEventListener('change', () => { els.cpkName.value = sanitizeCpkName(els.cpkName.value).replace(/\.cpk$/, ''); });
  els.playerId.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); confirmIdAndAdvance(); }
  });
}

/** Editor en una sola pantalla: ocupa lo que queda de la ventana debajo del encabezado. */
function fitAppToWindow() {
  const top = els.app.getBoundingClientRect().top + window.scrollY;
  document.documentElement.style.setProperty('--ms-app-height', `${Math.max(MIN_APP_HEIGHT, window.innerHeight - top - 10)}px`);
}

setupReferences();
window.addEventListener('resize', fitAppToWindow);
fitAppToWindow();
setupModes();
setupFolders();
setupAutoFrame();
setupBackground();
setupImport();
setupStage();
setupCollection();
setupTabs();
setupTeams();
setupProject();
setupActions();
updateTeamAvailability();
renderCollection();
syncControls();
resizeCanvas();
const ready = restoreProject();

// Gancho de depuración y pruebas automatizadas (no forma parte de la interfaz).
window.MinifaceStudio = Object.freeze({
  state, collection, store, ready, renderComposite, saveNow,
  teams: () => ({ edit: editTeams.length, project: [...projectTeams.values()] }),
  profiles: { pes2018: PES2018_PROFILE, png: PNG_PROFILE },
});
