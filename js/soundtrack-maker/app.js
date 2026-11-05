// LAqP Soundtrack Maker: interfaz. Todo se procesa en el navegador; ningún archivo se sube.

import { MIN_SONGS, MAX_SONGS, TEXT_MAX_BYTES } from './bank.js';
import { buildSoundtrack, sanitizeCpkName, estimateCpkBytes } from './build.js';
import { readSongMeta } from './id3.js';
import { decodeToPcm, createEncoder, createPreviewer, probeDuration, fileHash } from './audio.js';
import { loadSoundtrack, SoundtrackLoadError } from './soundtrack-reader.js';

// Textos: claves soundtrack.* del sistema de idiomas del sitio (js/i18n.js); si no hay traducción, español.
const msg = (key, fallback, params = {}) => {
  let text = fallback;
  if (typeof window.t === 'function') {
    const value = window.t('soundtrack.' + key, params);
    if (value && value !== 'soundtrack.' + key) text = value;
  }
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
};

const $ = sel => document.querySelector(sel);
const utf8 = new TextEncoder();
const byteLength = s => utf8.encode(s).length;
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtMB = b => (b < 104858 ? '<0,1 MB' : `${(b / 1048576).toLocaleString('es-AR', { maximumFractionDigits: b < 10485760 ? 1 : 0 })} MB`);
const isMp3 = file => /\.mp3$/i.test(file.name) || file.type === 'audio/mpeg' || file.type === 'audio/mp3';
const isCpk = file => /\.cpk$/i.test(file.name);
const MAX_PREVIEWS = 2; // WAV de escucha que se conservan (unos 40 MB cada uno)

const state = {
  songs: [], nextId: 1, generating: null, playingId: null, urls: new Map(), lastBlob: null, lastName: '',
  loadingCpk: false, previewingId: null, previews: [], previewer: null, replaceTarget: null,
};
const els = {
  list: $('#sm-list'), empty: $('#sm-empty'), drop: $('#sm-drop'), file: $('#sm-file'), library: $('#sm-library'),
  count: $('#sm-count'), meter: $('#sm-meter-fill'), meterWrap: $('#sm-meter'), summary: $('#sm-summary'), total: $('#sm-total'),
  generate: $('#sm-generate'), cancel: $('#sm-cancel'), progress: $('#sm-progress'), progressBar: $('#sm-progress-bar'),
  progressText: $('#sm-progress-text'), status: $('#sm-status'), cpkName: $('#sm-cpk-name'), audio: $('#sm-audio'),
  cpkFile: $('#sm-cpk-file'), replaceFile: $('#sm-replace-file'), source: $('#sm-source'), sourceText: $('#sm-source-text'),
  sourceList: $('#sm-source-list'), listHead: $('#sm-list-head'), result: $('#sm-result'), resultText: $('#sm-result-text'), redownload: $('#sm-redownload'), checks: $('#sm-checks'),
};

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

// ---------- validación ----------
function songIssues(song) {
  const issues = [];
  if (song.error) issues.push({ level: 'error', text: song.error });
  if (!song.title.trim()) issues.push({ level: 'error', text: msg('issue.noTitle', 'Falta el título.') });
  if (byteLength(song.title.trim()) > TEXT_MAX_BYTES) issues.push({ level: 'warn', text: msg('issue.longTitle', 'El título supera el máximo del juego: se recortará.') });
  if (byteLength(song.artist.trim()) > TEXT_MAX_BYTES) issues.push({ level: 'warn', text: msg('issue.longArtist', 'El artista supera el máximo del juego: se recortará.') });
  const key = (song.title.trim() + '\u0000' + song.artist.trim()).toLocaleLowerCase('es');
  if (song.title.trim() && state.songs.some(o => o !== song && (o.title.trim() + '\u0000' + o.artist.trim()).toLocaleLowerCase('es') === key)) {
    issues.push({ level: 'warn', text: msg('issue.duplicate', 'Hay otra canción con el mismo título y artista.') });
  }
  if (song.duration && song.duration < 20) issues.push({ level: 'warn', text: msg('issue.short', 'Dura menos de 20 segundos.') });
  return issues;
}

function collectionStatus() {
  const n = state.songs.length;
  const errors = state.songs.filter(s => songIssues(s).some(i => i.level === 'error')).length;
  const ready = n >= MIN_SONGS && n <= MAX_SONGS && errors === 0;
  let text;
  if (!n) text = msg('summary.empty', 'Agregá tus MP3: necesitás entre {min} y {max} canciones.', { min: MIN_SONGS, max: MAX_SONGS });
  else if (n < MIN_SONGS) text = msg('summary.missing', 'Faltan {n} para el mínimo de {min}.', { n: MIN_SONGS - n, min: MIN_SONGS });
  else if (errors) text = msg('summary.errors', 'Corregí {n} canción(es) marcadas en rojo.', { n: errors });
  else text = msg('summary.ready', 'Listo para generar.');
  return { n, errors, ready, text };
}

// ---------- render ----------
function render() {
  const { n, ready, text, errors } = collectionStatus();
  els.count.textContent = `${n}/${MAX_SONGS}`;
  els.meter.style.width = `${(n / MAX_SONGS) * 100}%`;
  els.meterWrap.style.setProperty('--sm-min', `${(MIN_SONGS / MAX_SONGS) * 100}%`);
  els.meterWrap.dataset.state = n >= MIN_SONGS ? 'ok' : 'low';
  els.meterWrap.setAttribute('aria-valuenow', String(n));
  els.summary.textContent = text;
  els.summary.dataset.kind = ready ? 'ok' : errors || (n && n < MIN_SONGS) ? 'warn' : '';
  const seconds = state.songs.reduce((s, x) => s + (x.duration || 0), 0);
  // Las canciones de un CPK cargado se copian tal cual: se conoce su tamaño exacto.
  const bytes = state.songs.reduce((sum, x) => sum + (x.hca ? x.file?.size || 0 : estimateCpkBytes(x.duration || 0)), 0);
  els.total.textContent = n ? msg('total', '{time} de música · CPK aprox. {size}', { time: fmtTime(seconds), size: fmtMB(bytes) }) : '';
  els.empty.hidden = n > 0;
  els.listHead.hidden = n === 0;
  els.library.classList.toggle('is-full', n >= MAX_SONGS);
  const busy = Boolean(state.generating);
  els.generate.disabled = !ready || busy;
  document.querySelectorAll('[data-action=add]').forEach(b => { b.disabled = busy || n >= MAX_SONGS; });
  document.querySelectorAll('[data-action=load-cpk]').forEach(b => { b.disabled = busy || state.loadingCpk; });
  document.body.classList.toggle('sm-busy', busy);
  renderChecks(n, errors);
  renderList();
}

function renderChecks(n, errors) {
  const items = [
    [n >= MIN_SONGS, msg('check.min', 'Mínimo {min} canciones', { min: MIN_SONGS })],
    [n <= MAX_SONGS && n > 0, msg('check.max', 'Máximo {max} canciones (límite del juego)', { max: MAX_SONGS })],
    [n > 0 && errors === 0, msg('check.titles', 'Todas con título y archivo válido')],
  ];
  els.checks.innerHTML = '';
  for (const [ok, label] of items) {
    const li = document.createElement('li');
    li.className = ok ? 'is-ok' : '';
    li.innerHTML = `<span aria-hidden="true">${ok ? '✓' : '·'}</span>`;
    li.append(label);
    li.setAttribute('aria-label', `${label}: ${ok ? msg('check.ok', 'cumplido') : msg('check.pending', 'pendiente')}`);
    els.checks.append(li);
  }
}

function renderList() {
  const focusedId = document.activeElement?.closest?.('.sm-song')?.dataset.id;
  const focusedField = document.activeElement?.dataset?.field || document.activeElement?.dataset?.action;
  const existing = new Map([...els.list.children].map(li => [li.dataset.id, li]));
  const busy = Boolean(state.generating);
  state.songs.forEach((song, index) => {
    let li = existing.get(String(song.id));
    if (!li) li = createRow(song);
    existing.delete(String(song.id));
    li.querySelector('.sm-song-num').textContent = String(index + 1).padStart(2, '0');
    li.querySelector('.sm-song-meta').textContent = [song.duration ? fmtTime(song.duration) : '', song.file ? fmtMB(song.file.size) : ''].filter(Boolean).join(' · ');
    li.querySelector('[data-action=undo-replace]').hidden = !song.undo;
    const issues = songIssues(song);
    li.classList.toggle('has-error', issues.some(i => i.level === 'error'));
    li.classList.toggle('has-warn', issues.some(i => i.level === 'warn') && !issues.some(i => i.level === 'error'));
    const box = li.querySelector('.sm-song-issues');
    box.textContent = issues.map(i => i.text).join(' ');
    box.hidden = !issues.length;
    li.querySelector('[data-action=up]').disabled = busy || index === 0;
    li.querySelector('[data-action=down]').disabled = busy || index === state.songs.length - 1;
    li.querySelectorAll('input,[data-action=remove],[data-action=replace],[data-action=undo-replace],.sm-handle').forEach(x => { x.disabled = busy; });
    const play = li.querySelector('[data-action=play]');
    const playing = state.playingId === song.id;
    play.classList.toggle('is-playing', playing);
    const preparing = state.previewingId === song.id;
    play.classList.toggle('is-loading', preparing);
    play.disabled = !song.file;
    play.setAttribute('aria-label', (preparing ? msg('preparing', 'Preparando') : playing ? msg('pause', 'Pausar') : msg('play', 'Escuchar')) + ': ' + (song.title || song.name));
    play.querySelector('span').textContent = preparing ? '…' : playing ? '❚❚' : '▶';
    if (els.list.children[index] !== li) els.list.insertBefore(li, els.list.children[index] || null);
  });
  for (const li of existing.values()) li.remove();
  if (focusedId && focusedField) {
    const target = els.list.querySelector(`.sm-song[data-id="${focusedId}"] [data-field="${focusedField}"], .sm-song[data-id="${focusedId}"] [data-action="${focusedField}"]`);
    if (target && document.activeElement !== target) target.focus();
  }
}

function createRow(song) {
  const li = document.createElement('li');
  li.className = 'sm-song';
  li.dataset.id = String(song.id);
  li.innerHTML = `
    <button type="button" class="sm-handle" data-action="handle" draggable="true" aria-label="${msg('reorder', 'Mover (arrastrá o usá las flechas)')}" title="${msg('reorder', 'Mover (arrastrá o usá las flechas)')}"><span aria-hidden="true">⋮⋮</span></button>
    <span class="sm-song-num" aria-hidden="true"></span>
    <button type="button" class="sm-play" data-action="play"><span aria-hidden="true">▶</span></button>
    <div class="sm-song-fields">
      <label class="sm-song-field"><span>${msg('title', 'Título')}</span><input type="text" data-field="title" maxlength="120" autocomplete="off" spellcheck="false" placeholder="${msg('title', 'Título')}"></label>
      <label class="sm-song-field"><span>${msg('artist', 'Artista')}</span><input type="text" data-field="artist" maxlength="120" autocomplete="off" spellcheck="false" placeholder="${msg('artist', 'Artista')}"></label>
      <p class="sm-song-file"><span class="sm-song-badge" hidden></span> <span class="sm-song-name"></span> <span class="sm-song-meta"></span> <button type="button" class="sm-link" data-action="undo-replace" hidden>${msg('undoReplace', 'Deshacer reemplazo')}</button></p>
      <p class="sm-song-issues" hidden></p>
    </div>
    <div class="sm-song-actions">
      <button type="button" class="sm-icon" data-action="replace" aria-label="${msg('replace', 'Reemplazar por otro MP3')}" title="${msg('replace', 'Reemplazar por otro MP3')}">⇄</button>
      <button type="button" class="sm-icon" data-action="up" aria-label="${msg('up', 'Subir')}" title="${msg('up', 'Subir')}">↑</button>
      <button type="button" class="sm-icon" data-action="down" aria-label="${msg('down', 'Bajar')}" title="${msg('down', 'Bajar')}">↓</button>
      <button type="button" class="sm-icon sm-icon-danger" data-action="remove" aria-label="${msg('remove', 'Quitar')}" title="${msg('remove', 'Quitar')}">✕</button>
    </div>`;
  li.querySelector('[data-field=title]').value = song.title;
  li.querySelector('[data-field=artist]').value = song.artist;
  li.querySelector('.sm-song-name').textContent = song.name;
  const badge = li.querySelector('.sm-song-badge');
  const label = { cpk: msg('badge.cpk', 'Del CPK'), replaced: msg('badge.replaced', 'Reemplazada') }[song.origin];
  badge.hidden = !label;
  badge.textContent = label || '';
  badge.dataset.origin = song.origin || '';
  return li;
}

// ---------- importación ----------
async function addFiles(fileList) {
  if (state.generating) return;
  const all = [...fileList];
  const cpks = all.filter(isCpk);
  if (cpks.length) { await loadCpk(cpks[0]); if (state.loadingCpk) return; }
  const files = all.filter(f => !isCpk(f));
  if (!files.length) return;
  const skipped = { format: [], duplicate: [], unreadable: [], full: [] };
  let added = 0;
  setStatus(msg('importing', 'Leyendo {n} archivo(s)…', { n: files.length }));
  for (const file of files) {
    if (state.songs.length >= MAX_SONGS) { skipped.full.push(file.name); continue; }
    if (!isMp3(file)) { skipped.format.push(file.name); continue; }
    try {
      const hash = await fileHash(file);
      if (state.songs.some(s => s.hash === hash)) { skipped.duplicate.push(file.name); continue; }
      const [meta, duration] = await Promise.all([readSongMeta(file), probeDuration(file)]);
      state.songs.push({ id: state.nextId++, file, name: file.name, hash, duration, title: meta.title || file.name.replace(/\.[^.]+$/, ''), artist: meta.artist || '', error: '' });
      added++;
      render();
    } catch {
      skipped.unreadable.push(file.name);
    }
  }
  const notes = [];
  if (added) notes.push(msg('added', '{n} canción(es) agregada(s).', { n: added }));
  if (skipped.format.length) notes.push(msg('skip.format', 'No son MP3: {list}.', { list: skipped.format.join(', ') }));
  if (skipped.duplicate.length) notes.push(msg('skip.duplicate', 'Ya estaban en la colección: {list}.', { list: skipped.duplicate.join(', ') }));
  if (skipped.unreadable.length) notes.push(msg('skip.unreadable', 'No se pudieron leer (¿archivo dañado?): {list}.', { list: skipped.unreadable.join(', ') }));
  if (skipped.full.length) notes.push(msg('skip.full', 'El juego admite hasta {max} canciones; no se agregaron: {list}.', { max: MAX_SONGS, list: skipped.full.join(', ') }));
  const problems = skipped.format.length + skipped.duplicate.length + skipped.unreadable.length + skipped.full.length;
  setStatus(notes.join(' '), problems ? (added ? 'warn' : 'error') : 'ok');
  render();
}

// ---------- cargar un CPK ----------
function forgetAudio(song) {
  if (state.playingId === song.id) els.audio.pause();
  if (state.previewingId === song.id) state.previewingId = null;
  const url = state.urls.get(song.id);
  if (url) { URL.revokeObjectURL(url); state.urls.delete(song.id); }
  state.previews = state.previews.filter(id => id !== song.id);
}

function clearCollection() {
  els.audio.pause();
  state.songs.forEach(forgetAudio);
  state.songs = [];
  els.list.replaceChildren();
  els.source.hidden = true;
}

function showSource(fileName, result) {
  const count = result.songs.length;
  const lines = [];
  if (result.xml === 'ok') lines.push(['ok', msg('source.xmlOk', 'Playlist.xml encontrado: se cargaron títulos, artistas y orden.')]);
  else if (result.xml === 'missing') lines.push(['warn', msg('source.xmlMissing', 'No se encontró Playlist.xml en el CPK: se va a crear uno nuevo. Completá los títulos y artistas.')]);
  else if (result.xml === 'invalid') lines.push(['warn', msg('source.xmlInvalid', 'El Playlist.xml del CPK no se pudo leer: se va a crear uno nuevo. Completá los títulos y artistas.')]);
  else lines.push(['warn', msg('source.xmlUnused', 'Sin BGM_P2P.acb no se puede saber a qué canción corresponde cada nombre de Playlist.xml: se va a crear una lista nueva.')]);
  if (!result.acb) lines.push(['warn', msg('source.acbMissing', 'No se encontró BGM_P2P.acb en el CPK: se va a crear uno nuevo con las pistas de BGM_P2P.awb, en orden.')]);
  for (const warning of result.warnings) lines.push(['warn', warning]);
  if (result.otherFiles) lines.push(['', msg('source.others', 'El CPK trae otros {n} archivo(s) que no son del soundtrack: no se tocan ni van en el CPK nuevo. Dejá instalado el original y poné el nuevo con más prioridad.', { n: result.otherFiles.toLocaleString('es-AR') })]);
  lines.push(['', msg('source.keep', 'Las canciones que no cambies se copian tal cual, sin perder calidad. Tu CPK original no se modifica.')]);
  els.sourceText.textContent = msg('source.title', '{file}: {n} canción(es) cargada(s).', { file: fileName, n: count });
  els.sourceList.replaceChildren(...lines.map(([kind, text]) => {
    const li = document.createElement('li');
    li.dataset.kind = kind;
    li.textContent = text;
    return li;
  }));
  els.source.hidden = false;
}

async function loadCpk(file) {
  if (state.generating || state.loadingCpk) return;
  if (state.songs.length && !window.confirm(msg('confirmLoad', 'Cargar este CPK reemplaza la lista actual. ¿Continuar?'))) return;
  state.loadingCpk = true;
  setStatus(msg('loadingCpk', 'Leyendo {file}…', { file: file.name }));
  render();
  try {
    const result = await loadSoundtrack(file, { maxSongs: MAX_SONGS });
    clearCollection();
    state.songs = result.songs.map(s => ({
      ...s, id: state.nextId++, file: s.hca, hca: Boolean(s.hca), name: s.cueName, origin: 'cpk',
    }));
    showSource(file.name, result);
    els.cpkName.value = sanitizeCpkName(`${file.name.replace(/\.cpk$/i, '')}_editado`).replace(/\.cpk$/, '');
    els.result.hidden = true;
    els.progress.hidden = true;
    setStatus(msg('loadedCpk', 'CPK cargado: escuchá, reemplazá o reordená las canciones.'), result.xml === 'ok' && result.acb ? 'ok' : 'warn');
  } catch (error) {
    const known = error instanceof SoundtrackLoadError || /CPK/.test(error.message);
    setStatus(known ? error.message : msg('loadFailed', 'No se pudo leer este CPK: {error}', { error: error.message }), 'error');
  } finally {
    state.loadingCpk = false;
    render();
  }
}

// ---------- reemplazar una canción ----------
async function replaceSong(song, file) {
  if (!isMp3(file)) { setStatus(msg('skip.format', 'No son MP3: {list}.', { list: file.name }), 'error'); return; }
  try {
    const hash = await fileHash(file);
    if (state.songs.some(s => s !== song && s.hash === hash)) {
      setStatus(msg('skip.duplicate', 'Ya estaban en la colección: {list}.', { list: file.name }), 'error');
      return;
    }
    const [meta, duration] = await Promise.all([readSongMeta(file), probeDuration(file)]);
    if (!state.songs.includes(song)) return;
    forgetAudio(song);
    const { undo, ...previous } = song;
    Object.assign(song, {
      file, hash, duration, name: file.name, hca: false, error: '', origin: 'replaced', undo: previous,
      title: meta.title || file.name.replace(/\.[^.]+$/, ''), artist: meta.artist || '',
      numSamples: undefined, sampleRate: undefined, channels: undefined, offset: undefined,
      remainTime: undefined, fadeoutTime: undefined, fadeoutWaitTime: undefined,
    });
    els.list.querySelector(`.sm-song[data-id="${song.id}"]`)?.remove();
    setStatus(msg('replaced', 'Se reemplazó «{old}» por «{title}».', { old: previous.title || previous.name, title: song.title }), 'ok');
    render();
  } catch {
    setStatus(msg('skip.unreadable', 'No se pudieron leer (¿archivo dañado?): {list}.', { list: file.name }), 'error');
  }
}

function undoReplace(song) {
  if (!song.undo) return;
  forgetAudio(song);
  const previous = song.undo;
  for (const key of Object.keys(song)) if (key !== 'id') delete song[key];
  Object.assign(song, previous);
  els.list.querySelector(`.sm-song[data-id="${song.id}"]`)?.remove();
  setStatus(msg('undone', 'Se recuperó «{title}».', { title: song.title || song.name }), 'ok');
  render();
}

// ---------- reproducción ----------
async function urlFor(song) {
  if (state.urls.has(song.id)) return state.urls.get(song.id);
  if (!song.hca) {
    state.urls.set(song.id, URL.createObjectURL(song.file));
    return state.urls.get(song.id);
  }
  // Los navegadores no reproducen HCA: se convierte a WAV solo para escuchar.
  state.previewer ??= createPreviewer();
  const source = song.file;
  const wav = await state.previewer(source);
  if (song.file !== source) return null;
  state.urls.set(song.id, URL.createObjectURL(wav));
  state.previews.push(song.id);
  while (state.previews.length > MAX_PREVIEWS) {
    const oldest = state.previews.find(id => id !== song.id && id !== state.playingId);
    if (oldest === undefined) break;
    state.previews = state.previews.filter(id => id !== oldest);
    URL.revokeObjectURL(state.urls.get(oldest));
    state.urls.delete(oldest);
  }
  return state.urls.get(song.id);
}
async function togglePlay(song) {
  const audio = els.audio;
  if (state.playingId === song.id && !audio.paused) { audio.pause(); return; }
  if (state.previewingId === song.id) return;
  try {
    if (state.playingId !== song.id) {
      if (!state.urls.has(song.id)) audio.pause();
      state.previewingId = song.id;
      render();
      const url = await urlFor(song);
      if (state.previewingId !== song.id) return; // mientras tanto se pidió otra canción
      state.previewingId = null;
      if (!url) { render(); return; }
      audio.src = url;
    }
    state.playingId = song.id;
    await audio.play();
  } catch {
    state.previewingId = null;
    state.playingId = null;
    setStatus(msg('playError', 'El navegador no pudo reproducir este archivo.'), 'error');
  }
  render();
}
els.audio.addEventListener('pause', () => { state.playingId = null; render(); });
els.audio.addEventListener('ended', () => { state.playingId = null; render(); });

function removeSong(song) {
  forgetAudio(song);
  state.songs.splice(state.songs.indexOf(song), 1);
  setStatus(msg('removed', 'Se quitó «{title}».', { title: song.title || song.name }));
  render();
}

function move(song, delta) {
  const i = state.songs.indexOf(song);
  const j = i + delta;
  if (j < 0 || j >= state.songs.length) return;
  state.songs.splice(i, 1);
  state.songs.splice(j, 0, song);
  setStatus(msg('moved', '«{title}» ahora es la número {n}.', { title: song.title || song.name, n: j + 1 }));
  render();
}

const songOf = el => state.songs.find(s => String(s.id) === el.closest('.sm-song')?.dataset.id);

els.list.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  const song = button && songOf(button);
  if (!song || state.generating) return;
  const action = button.dataset.action;
  if (action === 'play') togglePlay(song);
  else if (action === 'up') move(song, -1);
  else if (action === 'down') move(song, 1);
  else if (action === 'remove') removeSong(song);
  else if (action === 'replace') { state.replaceTarget = song; els.replaceFile.click(); }
  else if (action === 'undo-replace') undoReplace(song);
});
els.list.addEventListener('input', event => {
  const input = event.target.closest('input[data-field]');
  const song = input && songOf(input);
  if (!song) return;
  song[input.dataset.field] = input.value;
  render();
});
els.list.addEventListener('keydown', event => {
  const handle = event.target.closest('.sm-handle');
  const song = handle && songOf(handle);
  if (!song || state.generating) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    move(song, event.key === 'ArrowUp' ? -1 : 1);
    els.list.querySelector(`.sm-song[data-id="${song.id}"] .sm-handle`)?.focus();
  }
});

// Reordenar arrastrando la manija.
let dragId = null;
els.list.addEventListener('dragstart', event => {
  const handle = event.target.closest?.('.sm-handle');
  if (!handle || state.generating) { event.preventDefault(); return; }
  const row = handle.closest('.sm-song');
  dragId = row.dataset.id;
  row.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragId);
  event.dataTransfer.setDragImage(row, 24, 24);
});
els.list.addEventListener('dragover', event => {
  if (!dragId) return;
  event.preventDefault();
  const row = event.target.closest('.sm-song');
  els.list.querySelectorAll('.drop-before,.drop-after').forEach(r => r.classList.remove('drop-before', 'drop-after'));
  if (row && row.dataset.id !== dragId) {
    const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    row.classList.add(after ? 'drop-after' : 'drop-before');
  }
});
els.list.addEventListener('drop', event => {
  if (!dragId) return;
  event.preventDefault();
  event.stopPropagation();
  const row = event.target.closest('.sm-song');
  const song = state.songs.find(s => String(s.id) === dragId);
  if (row && song && row.dataset.id !== dragId) {
    const after = row.classList.contains('drop-after');
    state.songs.splice(state.songs.indexOf(song), 1);
    const targetIndex = state.songs.findIndex(s => String(s.id) === row.dataset.id) + (after ? 1 : 0);
    state.songs.splice(targetIndex, 0, song);
    setStatus(msg('moved', '«{title}» ahora es la número {n}.', { title: song.title || song.name, n: targetIndex + 1 }));
  }
  endDrag();
  render();
});
els.list.addEventListener('dragend', endDrag);
function endDrag() {
  dragId = null;
  els.list.querySelectorAll('.is-dragging,.drop-before,.drop-after').forEach(r => r.classList.remove('is-dragging', 'drop-before', 'drop-after'));
}

// Soltar archivos sobre la biblioteca.
let fileDragDepth = 0;
const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
els.library.addEventListener('dragenter', event => { if (!hasFiles(event) || state.generating) return; event.preventDefault(); fileDragDepth++; els.drop.hidden = false; });
els.library.addEventListener('dragleave', event => { if (!hasFiles(event)) return; fileDragDepth = Math.max(0, fileDragDepth - 1); if (!fileDragDepth) els.drop.hidden = true; });
els.library.addEventListener('dragover', event => { if (hasFiles(event) && !state.generating) event.preventDefault(); });
els.library.addEventListener('drop', event => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  fileDragDepth = 0;
  els.drop.hidden = true;
  addFiles(event.dataTransfer.files);
});
document.addEventListener('dragover', event => { if (hasFiles(event)) event.preventDefault(); });
document.addEventListener('drop', event => { if (hasFiles(event)) event.preventDefault(); });

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action=add],[data-action=load-cpk],[data-action=clear-source]');
  if (!button || button.disabled) return;
  if (button.dataset.action === 'add') els.file.click();
  else if (button.dataset.action === 'load-cpk') els.cpkFile.click();
  else if (!state.generating && window.confirm(msg('confirmClear', '¿Vaciar la lista? Tu CPK original no cambia.'))) {
    clearCollection();
    setStatus('');
    render();
  }
});
els.file.addEventListener('change', () => { addFiles(els.file.files); els.file.value = ''; });
els.cpkFile.addEventListener('change', () => { if (els.cpkFile.files[0]) loadCpk(els.cpkFile.files[0]); els.cpkFile.value = ''; });
els.replaceFile.addEventListener('change', () => {
  const file = els.replaceFile.files[0];
  els.replaceFile.value = '';
  if (file && state.replaceTarget) replaceSong(state.replaceTarget, file);
  state.replaceTarget = null;
});

// ---------- generación ----------
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function setProgress(fraction, text) {
  els.progress.hidden = false;
  els.progressBar.style.width = `${Math.round(fraction * 100)}%`;
  els.progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  els.progressText.textContent = text;
}

async function generate() {
  if (state.generating || !collectionStatus().ready) return;
  els.audio.pause();
  const controller = new AbortController();
  const encoder = createEncoder();
  state.generating = controller;
  els.result.hidden = true;
  els.cancel.hidden = false;
  render();
  const songs = state.songs.map(s => {
    const common = { title: s.title.trim(), artist: s.artist.trim(), playlistId: s.playlistId };
    return s.hca
      ? { ...common, hca: s.file, numSamples: s.numSamples, sampleRate: s.sampleRate, channels: s.channels, offset: s.offset, remainTime: s.remainTime, fadeoutTime: s.fadeoutTime, fadeoutWaitTime: s.fadeoutWaitTime }
      : { ...common, file: s.file };
  });
  const name = sanitizeCpkName(els.cpkName.value);
  const started = performance.now();
  try {
    const result = await buildSoundtrack(songs, {
      decode: decodeToPcm,
      encode: (pcm, onProgress) => encoder.encode(pcm, onProgress),
      keepHcaAs: hca => new Blob([hca]),
      signal: controller.signal,
      onProgress: ({ stage, index, fraction }) => {
        const song = index !== undefined ? songs[index] : null;
        const label = stage === 'decode' ? msg('stage.decode', 'Leyendo {i}/{n}: {title}')
          : stage === 'encode' ? msg('stage.encode', 'Convirtiendo {i}/{n}: {title}')
            : stage === 'copy' ? msg('stage.copy', 'Copiando {i}/{n}: {title}')
              : msg('stage.package', 'Armando el CPK…');
        setProgress(fraction, label.replace('{i}', String((index ?? 0) + 1)).replace('{n}', String(songs.length)).replace('{title}', song ? song.title : ''));
      },
    });
    const blob = new Blob(result.parts, { type: 'application/octet-stream' });
    state.lastBlob = blob;
    state.lastName = name;
    setProgress(1, msg('stage.done', 'Listo'));
    download(blob, name);
    const secs = Math.round((performance.now() - started) / 1000);
    els.resultText.textContent = msg('done', '{file} ({size}, {n} canciones) generado en {secs} s. Si la descarga no empezó, usá el botón.', { file: name, size: fmtMB(blob.size), n: songs.length, secs });
    els.result.hidden = false;
    setStatus(msg('doneStatus', 'Soundtrack generado. Instalalo con DpFileList Generator.'), 'ok');
  } catch (error) {
    els.progress.hidden = true;
    if (error.name === 'AbortError') setStatus(msg('cancelled', 'Generación cancelada.'));
    else {
      const failing = /«(.+)»/.exec(error.message)?.[1];
      setStatus(msg('failed', 'No se pudo generar: {error}', { error: error.message }) + (failing ? '' : ' ' + msg('failedHint', 'Si un MP3 está dañado, quitá esa canción y probá de nuevo.')), 'error');
    }
  } finally {
    encoder.dispose();
    state.generating = null;
    els.cancel.hidden = true;
    render();
  }
}

els.generate.addEventListener('click', generate);
els.cancel.addEventListener('click', () => state.generating?.abort());
els.redownload.addEventListener('click', () => { if (state.lastBlob) download(state.lastBlob, state.lastName); });
els.cpkName.addEventListener('change', () => { els.cpkName.value = sanitizeCpkName(els.cpkName.value).replace(/\.cpk$/, ''); });
window.addEventListener('beforeunload', event => {
  if (state.generating || state.songs.length) { event.preventDefault(); event.returnValue = ''; }
});

render();
document.body.dataset.ready = 'true';
