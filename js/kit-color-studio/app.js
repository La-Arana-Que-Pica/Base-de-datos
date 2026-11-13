import { clickDownload } from '../download-donation.js?v=20261113-ga4';
// Kit Color Studio: interfaz. Todo se procesa y se guarda en el dispositivo (IndexedDB); nada se envía a servidores.
import { Viewer } from './viewer.js';
import { ROLES, editorValues, gameHex, parseHex, hex as toHex, from63 } from './colors.js';
import * as lib from './library.js';
import * as store from './store.js';
import { exportProject, readProjectFile, ProjectFileError } from './project-file.js';
import { buildSheet } from './sheet.js';
import { ImportError, fetchImageUrl, imageUrlFromDataTransfer } from '../miniface-studio/image-import.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MB = 1024 * 1024;
const COARSE = matchMedia('(pointer: coarse)').matches;
const SMALL_DEVICE = COARSE || (navigator.deviceMemory && navigator.deviceMemory <= 4);
export const LIMITS = {
  maxEntry: 128 * MB,                              // una imagen (también descomprimida)
  maxTotal: (SMALL_DEVICE ? 700 : 2048) * MB,      // datos descomprimidos por importación
  maxRar: (SMALL_DEVICE ? 300 : 1024) * MB,        // el RAR se lee completo en memoria
  maxZip: 4096 * MB,                               // el ZIP se lee por partes
};
const QUICK_NAMES = ['Dorsales', 'Número del pecho', 'Nombre', 'Marca', 'Escudo', 'Detalles', 'Cuello', 'Puños', 'Logo'];
const ROLE_ALT = { principal: 'camiseta', secundario: 'camiseta', pantalon: 'pantalon', medias: 'medias' };

const els = {
  app: $('#kcs-app'), tree: $('#kcs-tree'), treeEmpty: $('#kcs-explorer-empty'), count: $('#kcs-count'), search: $('#kcs-search'),
  stage: $('#kcs-stage'), empty: $('#kcs-empty'), drop: $('#kcs-drop'), loading: $('#kcs-loading'), zoom: $('#kcs-zoom'),
  title: $('#kcs-kit-title'), path: $('#kcs-kit-path'), meta: $('#kcs-kit-meta'), colors: $('#kcs-colors'), custom: $('#kcs-custom'),
  customEmpty: $('#kcs-custom-empty'), mode: $('#kcs-mode'), modeText: $('#kcs-mode-text'), target: $('#kcs-target'), targetText: $('#kcs-target-text'),
  projectName: $('#kcs-project-name'), save: $('#kcs-save'), toast: $('#kcs-toast'), progress: $('#kcs-progress'), progressText: $('#kcs-progress-text'),
  file: $('#kcs-file'), folder: $('#kcs-folder'), projectFile: $('#kcs-project-file'), scrim: $('#kcs-scrim'),
  pick: $('#kcs-pick-dialog'), projects: $('#kcs-projects-dialog'), ask: $('#kcs-ask-dialog'), console: $('#kcs-console'),
};

const state = {
  project: null, selectedId: null, loaded: null, target: null, queue: [], busy: false, consoleId: null, wakeLock: null,
  thumbUrls: new Map(), focusId: null, cancelImport: false, overlay: null,
};

// ---------------- Workers ----------------
let worker = null, archiveWorker = null, rpcSeq = 0;
const pending = new Map();
function imageWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.js?v=20261102a', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; pending.delete(data.id); data.ok ? p.resolve(data.result) : p.reject(Object.assign(new Error(data.error), { code: data.code })); };
    worker.onerror = e => { for (const p of pending.values()) p.reject(new Error('El procesador de imágenes se detuvo' + (e.message ? ': ' + e.message : '.'))); pending.clear(); worker = null; };
  }
  return worker;
}
function call(type, payload = {}, transfer = []) {
  return new Promise((resolve, reject) => { const id = ++rpcSeq; pending.set(id, { resolve, reject }); imageWorker().postMessage({ id, type, ...payload }, transfer); });
}

/** Decodificación en el hilo principal (navegadores sin OffscreenCanvas en workers) para JPG y WebP. */
async function decodeOnMain(blob) {
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0); bmp.close();
  const data = new Uint8Array(g.getImageData(0, 0, c.width, c.height).data.buffer);
  let hasAlpha = false; for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { hasAlpha = true; break; }
  return { width: c.width, height: c.height, data, hasAlpha, formatName: blob.type === 'image/webp' ? 'WebP' : 'JPG' };
}
async function workerDecode(blob) {
  try { return await call('decode', { blob }); }
  catch (e) { if (e.code === 'NEEDS_MAIN') return decodeOnMain(blob); throw e; }
}
async function workerAnalyze(blob, opts) {
  try { return await call('analyze', { blob, ...opts }); }
  catch (e) {
    if (e.code !== 'NEEDS_MAIN') throw e;
    const rgba = await decodeOnMain(blob);
    return call('analyze', { rgba, ...opts }, [rgba.data.buffer]);
  }
}

// ---------------- Utilidades de interfaz ----------------
let toastTimer;
function toast(msg, kind = '') {
  els.toast.textContent = msg; els.toast.className = 'kcs-toast is-visible' + (kind ? ' is-' + kind : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { els.toast.className = 'kcs-toast'; }, kind === 'error' ? 6500 : 2600);
}
function progress(text, cancellable = false) {
  els.progress.hidden = !text; els.progressText.textContent = text || '';
  els.progress.querySelector('[data-action="cancel-import"]').hidden = !cancellable;
}
async function copyText(text, label = text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0';
    document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch { toast('No se pudo copiar. Seleccioná el valor a mano.', 'error'); t.remove(); return; }
    t.remove();
  }
  toast('Copiado: ' + label);
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); clickDownload(a, 'kit_color_studio'); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const fileSafe = s => (s || 'proyecto').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'proyecto';
const valuesText = h => { const v = editorValues(h); return v ? `R ${v[0]} G ${v[1]} B ${v[2]}` : '—'; };

/** Diálogo genérico. actions: [{ value, label, kind }] → { action, value, folder } */
function ask({ title, text = '', input = null, actions, folders = null }) {
  const d = els.ask;
  $('#kcs-ask-title').textContent = title;
  $('#kcs-ask-text').innerHTML = text;
  const field = $('#kcs-ask-field'), inp = $('#kcs-ask-input');
  field.hidden = !input;
  if (input) { $('#kcs-ask-label').textContent = input.label; inp.value = input.value || ''; inp.placeholder = input.placeholder || ''; }
  const tree = $('#kcs-ask-tree');
  tree.hidden = !folders;
  if (folders) {
    tree.innerHTML = folders.map((f, i) => `<label style="--level:${f.level}"><input type="radio" name="kcs-move" value="${esc(f.id ?? '')}" ${i === 0 ? 'checked' : ''} ${f.disabled ? 'disabled' : ''}><span>${esc(f.label)}</span></label>`).join('');
  }
  $('#kcs-ask-actions').innerHTML = actions.map(a => `<button value="${esc(a.value)}" class="kcs-btn ${a.kind === 'primary' ? 'kcs-btn-primary' : a.kind === 'danger' ? 'kcs-btn-danger' : a.kind === 'ghost' ? 'kcs-btn-ghost' : ''}">${esc(a.label)}</button>`).join('');
  d.returnValue = '';
  return new Promise(resolve => {
    d.addEventListener('close', () => resolve({ action: d.returnValue || 'cancel', value: inp.value.trim(), folder: tree.querySelector('input:checked')?.value ?? '' }), { once: true });
    d.showModal();
    if (input) { inp.focus(); inp.select(); }
  });
}

// ---------------- Proyecto ----------------
function newProject(name = 'Mis kits') {
  const now = new Date().toISOString();
  return { id: lib.newId('p'), name, created: now, updated: now, nodes: {}, selectedId: null };
}
let saveTimer = null, saving = false;
function touch() {
  if (!state.project) return;
  state.project.updated = new Date().toISOString();
  els.save.textContent = 'Guardando…'; els.save.className = 'kcs-save';
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350);
}
async function saveNow() {
  if (saving) { touch(); return; }
  saving = true;
  try {
    state.project.selectedId = state.selectedId;
    await store.saveProject(state.project);
    await store.setMeta('current', state.project.id);
    els.save.textContent = 'Guardado'; els.save.className = 'kcs-save is-saved';
  } catch (e) {
    els.save.textContent = 'Sin guardar'; els.save.className = 'kcs-save is-error';
    toast(e?.name === 'QuotaExceededError' ? 'No hay espacio para guardar en este navegador. Guardá el proyecto como archivo y liberá espacio.' : 'No se pudo guardar el proyecto en este navegador.', 'error');
  } finally { saving = false; }
}

async function loadProject(project) {
  releaseLoaded();
  for (const u of state.thumbUrls.values()) URL.revokeObjectURL(u);
  state.thumbUrls.clear();
  state.project = project; state.queue = []; state.target = null;
  els.projectName.textContent = project.name;
  // Archivos que quedaron a mitad de análisis en una sesión anterior
  for (const n of Object.values(project.nodes)) if (n.type === 'file' && n.status === 'pending') state.queue.push(n.id);
  state.selectedId = project.nodes[project.selectedId] ? project.selectedId : null;
  renderAll();
  if (state.selectedId) select(state.selectedId, { focus: false });
  await store.setMeta('current', project.id);
  pump();
}

// ---------------- Importación ----------------
const isArchive = (kind, name) => kind === 'zip' || kind === 'rar' || /\.(zip|rar)$/i.test(name);

/** items: [{ file: Blob, name, segments: [carpetas…] }]; parentId: carpeta destino. */
async function importItems(items, parentId = null) {
  if (!items.length) return;
  if (!state.project) return;
  const est = await store.storageEstimate();
  const incoming = items.reduce((n, i) => n + (i.file.size || 0), 0);
  if (est?.quota && est.usage + incoming > est.quota * 0.92) {
    toast('No hay espacio suficiente en el almacenamiento del navegador para importar esto.', 'error'); return;
  }
  store.requestPersistence();
  state.cancelImport = false;
  const report = { added: 0, skipped: [], notes: [] };
  const topFolders = new Map();   // carpeta raíz de cada importación (siempre nueva: no mezcla importaciones)
  const folderFor = segments => {
    if (!segments.length) return parentId;
    const key = segments[0];
    let id = topFolders.get(key);
    if (!id) { id = lib.newId('d'); state.project.nodes[id] = { id, type: 'folder', name: key, parentId }; topFolders.set(key, id); }
    for (const s of segments.slice(1)) id = lib.ensureFolder(state.project, id, s);
    return id;
  };
  let i = 0;
  for (const item of items) {
    if (state.cancelImport) break;
    i++;
    const head = new Uint8Array(await item.file.slice(0, 16).arrayBuffer());
    const kind = lib.sniff(head, item.name);
    if (isArchive(kind, item.name)) {
      await importArchive(item, kind === 'rar' || /\.rar$/i.test(item.name) && kind !== 'zip' ? 'rar' : 'zip', folderFor(item.segments), report);
      continue;
    }
    progress(`Importando ${i} de ${items.length}…`, true);
    await addImage(item.file, item.name, folderFor(item.segments), item.segments.concat(item.name).join('/'), kind, report);
  }
  progress('');
  renderAll(); touch(); pump();
  const firstNew = report.firstId;
  if (firstNew && !state.selectedId) select(firstNew, { focus: false });
  if (report.added) toast(`${report.added === 1 ? 'Se importó 1 imagen' : `Se importaron ${report.added} imágenes`}${report.skipped.length ? ` · ${report.skipped.length} omitidas` : ''}.`);
  if (report.skipped.length || report.notes.length) {
    const all = report.skipped.concat(report.notes);
    const list = all.slice(0, 60).map(s => `<li><b>${esc(s.path)}</b>: ${esc(s.reason)}</li>`).join('');
    const title = !report.skipped.length ? 'Importación con avisos' : report.added ? 'Algunos archivos no se importaron' : 'No se importó ningún archivo';
    await ask({ title, text: `<ul class="kcs-skip-list">${list}</ul>${all.length > 60 ? `<p>…y ${all.length - 60} más.</p>` : ''}`, actions: [{ value: 'ok', label: 'Entendido', kind: 'primary' }] });
  } else if (!report.added && !state.cancelImport) toast('No se encontraron imágenes compatibles.', 'error');
}

async function addImage(blob, name, parentId, sourcePath, kind, report) {
  if (!lib.IMAGE_EXT.includes(kind)) { report.skipped.push({ path: sourcePath, reason: 'no es una imagen compatible (PNG, JPG, WebP, DDS o FTEX)' }); return; }
  if (blob.size > LIMITS.maxEntry) { report.skipped.push({ path: sourcePath, reason: `supera el máximo de ${LIMITS.maxEntry / MB} MB por imagen` }); return; }
  if (!blob.size) { report.skipped.push({ path: sourcePath, reason: 'está vacío' }); return; }
  const id = lib.newId('f'), key = lib.newId('b'), cls = lib.classify(name);
  try { await store.putBlob(key, blob instanceof File ? new Blob([blob], { type: blob.type }) : blob); }
  catch (e) { report.skipped.push({ path: sourcePath, reason: e?.name === 'QuotaExceededError' ? 'no hay espacio en el navegador' : 'no se pudo guardar' }); return; }
  state.project.nodes[id] = { id, type: 'file', name, parentId, blob: key, size: blob.size, format: kind, role: cls.role, aux: cls.aux, source: sourcePath,
    status: 'pending', colors: {}, manual: {}, custom: [] };
  state.queue.push(id);
  report.added++; report.firstId ||= cls.role === 'kit' ? id : report.firstId;
}

let archiveSeq = 0;
function importArchive(item, kind, parentId, report) {
  if (kind === 'rar' && item.file.size > LIMITS.maxRar) {
    report.skipped.push({ path: item.name, reason: `el RAR supera ${LIMITS.maxRar / MB} MB, el máximo que este dispositivo puede abrir de forma segura. Dividilo o usá un ZIP` });
    return Promise.resolve();
  }
  if (kind === 'zip' && item.file.size > LIMITS.maxZip) { report.skipped.push({ path: item.name, reason: 'el ZIP supera 4 GB' }); return Promise.resolve(); }
  archiveWorker ||= new Worker(new URL('./archive-worker.js?v=20261102a', import.meta.url), { type: 'module' });
  const id = ++archiveSeq, stem = item.name.replace(/\.(zip|rar)$/i, '');
  // Carpeta con el nombre del archivo comprimido; si todo ya viene dentro de una única carpeta con ese nombre, no se duplica
  let wrapper = true, rootId = null;
  const folderFor = segs => {
    if (!rootId) { rootId = lib.newId('d'); state.project.nodes[rootId] = { id: rootId, type: 'folder', name: stem, parentId }; }
    let fid = rootId;
    for (const s of wrapper ? segs : segs.slice(1)) fid = lib.ensureFolder(state.project, fid, s);
    return fid;
  };
  let count = 0;
  progress(`Abriendo ${item.name}…`, true);
  return new Promise(resolve => {
    const onMsg = async ({ data: m }) => {
      if (m.id !== id) return;
      if (m.type === 'list') {
        const tops = new Set(m.paths.map(p => lib.safeSegments(p)[0]));
        const nested = m.paths.every(p => lib.safeSegments(p).length > 1);
        wrapper = !(tops.size === 1 && nested && [...tops][0] === stem);
      } else if (m.type === 'entry') {
        chain = chain.then(async () => {
          if (state.cancelImport) return;
          const segs = lib.safeSegments(m.path), name = segs.pop();
          if (!name) return;
          if (m.unsafe) report.notes.push({ path: m.path, reason: 'tenía una ruta insegura: se importó dentro de la carpeta del archivo comprimido, sin salir de ella' });
          const head = new Uint8Array(await m.data.slice(0, 16).arrayBuffer());
          await addImage(m.data, name, folderFor(segs), `${item.name}/${segs.concat(name).join('/')}`, lib.sniff(head, name), report);
          progress(`Importando ${item.name}: ${++count} imágenes…`, true);
          if (count % 25 === 0) renderTree();
        });
      } else if (m.type === 'skip') report.skipped.push({ path: `${item.name}/${m.path}`, reason: m.reason });
      else if (m.type === 'limit') report.skipped.push({ path: item.name, reason: m.reason });
      else if (m.type === 'error' || m.type === 'done') {
        archiveWorker.removeEventListener('message', onMsg);
        await chain;
        if (m.type === 'error') report.skipped.push({ path: item.name, reason: m.error });
        else if (!m.images && !count) report.skipped.push({ path: item.name, reason: 'no contiene imágenes compatibles' });
        resolve();
      }
    };
    let chain = Promise.resolve();
    archiveWorker.addEventListener('message', onMsg);
    archiveWorker.onerror = () => { archiveWorker = null; report.skipped.push({ path: item.name, reason: 'el lector de archivos comprimidos se detuvo (probablemente por falta de memoria)' }); resolve(); };
    archiveWorker.postMessage({ id, kind, file: item.file, limits: LIMITS });
  });
}

/** Análisis en segundo plano, de a un archivo (protege la memoria del dispositivo). */
async function pump() {
  if (state.busy) return;
  state.busy = true;
  const project = state.project;
  try {
    while (state.queue.length && project === state.project) {
      const id = state.queue.shift(), n = project.nodes[id];
      if (!n || n.type !== 'file') continue;
      const left = state.queue.length;
      if (left > 2) progress(`Analizando kits… faltan ${left + 1}`);
      try {
        const blob = await store.getBlob(n.blob);
        if (!blob) throw new Error('Falta el archivo en el almacenamiento del navegador.');
        const r = await workerAnalyze(blob, { role: n.role, aux: n.aux, mode: n.mode || null });
        applyAnalysis(n, r);
        await saveThumb(n.blob, r.thumb);
      } catch (e) {
        n.status = 'error';
        n.error = e.code === 'TOO_LARGE' ? e.message + ' El máximo es 4096 × 4096.' : e.message || 'No se pudo leer el archivo.';
      }
      if (project !== state.project) break;
      renderTreeSoon();
      if (state.selectedId === id || state.selectedId === lib.siblingKit(project, n)?.id) { renderPanel(); if (state.selectedId === id && !state.loaded) select(id, { focus: false }); }
      touch();
    }
  } finally { state.busy = false; if (!state.queue.length) progress(''); }
}

function applyAnalysis(n, r) {
  Object.assign(n, { status: 'ready', error: null, width: r.width, height: r.height, formatName: r.formatName, hasAlpha: r.hasAlpha });
  if (n.role === 'kit') {
    n.analysis = r.analysis;
    for (const { key } of ROLES) if (!n.manual?.[key]) n.colors[key] = r.analysis.colors[key];
    linkDorsal(n);
  } else {
    n.dorsal = r.dorsal || null;
    const kit = lib.siblingKit(state.project, n);
    if (kit) linkDorsal(kit);
  }
}

/** Color de dorsales desde la textura _back: color personalizado «Dorsales» del kit (si el usuario no lo cambió). */
function linkDorsal(kit) {
  const base = lib.stem(kit.name).toLowerCase();
  const back = Object.values(state.project.nodes).find(x => x.type === 'file' && x.parentId === kit.parentId && x.aux === 'back' && x.dorsal && lib.classify(x.name).base.toLowerCase() === base);
  if (!back) return;
  kit.custom ||= [];
  const auto = kit.custom.find(c => c.auto === 'dorsal');
  if (!auto) kit.custom.unshift({ id: lib.newId('c'), name: 'Dorsales', hex: back.dorsal, auto: 'dorsal' });
  else if (!auto.edited) auto.hex = back.dorsal;
}

async function saveThumb(key, t) {
  if (!t) return;
  const c = document.createElement('canvas'); c.width = t.width; c.height = t.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.data), t.width, t.height), 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (!blob) return;
  await store.putThumb(key, blob).catch(() => {});
  const old = state.thumbUrls.get(key); if (old) URL.revokeObjectURL(old);
  state.thumbUrls.set(key, URL.createObjectURL(blob));
}

async function thumbUrl(key) {
  if (state.thumbUrls.has(key)) return state.thumbUrls.get(key);
  const b = await store.getThumb(key).catch(() => null);
  if (!b) return null;
  const u = URL.createObjectURL(b); state.thumbUrls.set(key, u); return u;
}

// Archivos sueltos, carpetas (input y arrastrar) y portapapeles
function itemsFromFileList(list) {
  return [...list].map(f => {
    const segs = lib.safeSegments(f.webkitRelativePath || '');
    return { file: f, name: f.name, segments: segs.length > 1 ? segs.slice(0, -1) : [] };
  });
}
async function itemsFromDataTransfer(dt) {
  const entries = [...(dt.items || [])].filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length || !entries.some(e => e.isDirectory)) return itemsFromFileList(dt.files || []);
  const out = [];
  const readAll = reader => new Promise(res => { const acc = []; const step = () => reader.readEntries(b => { if (!b.length) res(acc); else { acc.push(...b); step(); } }, () => res(acc)); step(); });
  const walk = async (entry, segs) => {
    if (entry.isFile) { const f = await new Promise(r => entry.file(r, () => r(null))); if (f) out.push({ file: f, name: f.name, segments: segs }); }
    else if (entry.isDirectory) for (const e of await readAll(entry.createReader())) await walk(e, segs.concat(entry.name));
  };
  for (const e of entries) await walk(e, []);
  return out;
}
let pasteSeq = 0;
function pastedItem(blob) {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] || 'png';
  return { file: blob, name: blob.name && blob.name !== 'image.png' ? blob.name : `Imagen pegada ${++pasteSeq}.${ext}`, segments: [] };
}
async function pasteFromButton() {
  if (!navigator.clipboard?.read) { toast('Tu navegador no permite leer imágenes con este botón: presioná Ctrl + V (⌘ + V) en la página.', 'error'); return; }
  try {
    const items = await navigator.clipboard.read();
    const blobs = [];
    for (const it of items) {
      const type = it.types.find(t => /^image\/(png|jpeg|webp)$/.test(t)) || it.types.find(t => t.startsWith('image/'));
      if (type) blobs.push(await it.getType(type));
      else if (it.types.includes('text/html')) {
        const m = (await (await it.getType('text/html')).text()).match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m) blobs.push(await fetchImageUrl(m[1].replace(/&amp;/g, '&')));
      }
    }
    if (!blobs.length) { toast('El portapapeles no tiene una imagen. Copiá el kit con «Copiar imagen».', 'error'); return; }
    await importItems(blobs.map(pastedItem));
  } catch (e) {
    toast(e instanceof ImportError ? e.message : e?.name === 'NotAllowedError' ? 'El navegador bloqueó el portapapeles. Permitilo o presioná Ctrl + V (⌘ + V).' : 'No se pudo leer el portapapeles.', 'error');
  }
}

// ---------------- Explorador ----------------
let treeTimer = null;
function renderTreeSoon() { if (!treeTimer) treeTimer = requestAnimationFrame(() => { treeTimer = null; renderTree(); }); }

function renderTree() {
  const p = state.project, q = els.search.value.trim().toLowerCase();
  const files = Object.values(p.nodes).filter(n => n.type === 'file');
  els.count.textContent = files.filter(n => n.role === 'kit').length;
  els.treeEmpty.hidden = files.length > 0 || Object.keys(p.nodes).length > 0;
  const visible = q ? new Set() : null;
  if (q) for (const f of files) if (lib.pathOf(p, f.id).join('/').toLowerCase().includes(q)) for (let n = f; n; n = p.nodes[n.parentId]) visible.add(n.id);
  const focusId = state.focusId && p.nodes[state.focusId] ? state.focusId : state.selectedId;
  const kitCount = new Map();
  for (const f of files) if (f.role === 'kit') for (let a = p.nodes[f.parentId]; a; a = p.nodes[a.parentId]) kitCount.set(a.id, (kitCount.get(a.id) || 0) + 1);
  let firstId = null;
  const html = (pid, level) => lib.children(p, pid).filter(n => !visible || visible.has(n.id)).map(n => {
    firstId ||= n.id;
    const sel = n.id === state.selectedId, tab = n.id === focusId ? 0 : -1;
    if (n.type === 'folder') {
      const open = q ? true : !n.collapsed, kids = kitCount.get(n.id) || 0;
      return `<li role="treeitem" class="kcs-node is-folder" data-id="${n.id}" data-folder-id="${n.id}" aria-level="${level}" aria-expanded="${open}" aria-selected="false" tabindex="${tab}" draggable="true">
        <div class="kcs-row" style="--level:${level - 1}"><span class="kcs-twisty" aria-hidden="true"></span><svg class="kcs-folder-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg><span class="kcs-name">${esc(n.name)}</span><span class="kcs-badge">${kids}</span><button type="button" class="kcs-more" tabindex="-1" data-more="${n.id}" aria-label="Acciones de la carpeta ${esc(n.name)}">⋯</button></div>
        ${open ? `<ul role="group">${html(n.id, level + 1)}</ul>` : ''}</li>`;
    }
    const tag = n.role === 'kit' ? lib.kitTag(n.name, p.nodes[n.parentId]?.name) : lib.AUX_LABEL[n.aux];
    const status = n.status === 'error' ? '<span class="kcs-status is-error" title="No se pudo leer">!</span>' : n.status === 'pending' ? '<span class="kcs-status is-pending" title="Analizando"></span>' : '';
    const dots = n.role === 'kit' && n.status === 'ready' ? `<span class="kcs-dots" aria-hidden="true">${ROLES.map(r => n.colors[r.key] ? `<i style="background:#${n.colors[r.key]}"></i>` : '').join('')}</span>` : '';
    return `<li role="treeitem" class="kcs-node is-file${n.role === 'aux' ? ' is-aux' : ''}" data-id="${n.id}" aria-level="${level}" aria-selected="${sel}" tabindex="${tab}" draggable="true">
      <div class="kcs-row" style="--level:${level - 1}"><img class="kcs-thumb" alt="" data-thumb="${n.blob}" width="40" height="40"><span class="kcs-file-text"><span class="kcs-name">${esc(n.name)}</span>${tag || dots ? `<span class="kcs-sub">${tag ? `<span class="kcs-tag">${esc(tag)}</span>` : ''}${dots}</span>` : ''}</span>${status}<button type="button" class="kcs-more" tabindex="-1" data-more="${n.id}" aria-label="Acciones de ${esc(n.name)}">⋯</button></div></li>`;
  }).join('');
  els.tree.innerHTML = html(null, 1);
  if (!els.tree.querySelector('[tabindex="0"]') && firstId) els.tree.querySelector(`[data-id="${firstId}"]`)?.setAttribute('tabindex', '0');
  for (const img of els.tree.querySelectorAll('img[data-thumb]')) thumbUrl(img.dataset.thumb).then(u => { if (u) img.src = u; else img.classList.add('is-empty'); });
}

function treeItems() { return [...els.tree.querySelectorAll('[role="treeitem"]')]; }
function focusTreeItem(li) {
  if (!li) return;
  for (const x of els.tree.querySelectorAll('[tabindex="0"]')) x.tabIndex = -1;
  li.tabIndex = 0; li.focus(); state.focusId = li.dataset.id;
}

function folderOptions(excludeId = null) {
  const out = [{ id: '', label: 'Raíz del proyecto', level: 0 }];
  const walk = (pid, level) => { for (const n of lib.children(state.project, pid)) if (n.type === 'folder') { const dis = excludeId && (n.id === excludeId || lib.isDescendant(state.project, n.id, excludeId)); out.push({ id: n.id, label: n.name, level, disabled: dis }); walk(n.id, level + 1); } };
  walk(null, 1);
  return out;
}

async function nodeActions(id) {
  const n = state.project.nodes[id];
  if (!n) return;
  const actions = [{ value: 'rename', label: 'Renombrar' }, { value: 'move', label: 'Mover a…' }];
  if (n.type === 'folder') actions.push({ value: 'folder', label: 'Nueva carpeta adentro' });
  actions.push({ value: 'delete', label: 'Eliminar', kind: 'danger' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' });
  const r = await ask({ title: n.name, text: n.type === 'file' ? `<span class="kcs-ask-path">${esc(n.source || n.name)}</span>` : 'Carpeta del proyecto', actions });
  if (r.action === 'rename') renameNode(id);
  else if (r.action === 'move') moveNodeDialog(id);
  else if (r.action === 'folder') createFolder(id);
  else if (r.action === 'delete') deleteNode(id);
}
async function renameNode(id) {
  const n = state.project.nodes[id];
  const r = await ask({ title: n.type === 'folder' ? 'Renombrar carpeta' : 'Renombrar kit', text: n.type === 'file' ? 'Solo cambia el nombre dentro del proyecto: tu archivo original no se modifica.' : '', input: { label: 'Nombre', value: n.name }, actions: [{ value: 'ok', label: 'Renombrar', kind: 'primary' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
  if (r.action !== 'ok' || !r.value || r.value === n.name) return;
  n.name = r.value.slice(0, 200);
  renderAll(); touch();
}
async function moveNodeDialog(id) {
  const n = state.project.nodes[id];
  const r = await ask({ title: `Mover «${n.name}»`, folders: folderOptions(n.type === 'folder' ? id : null), actions: [{ value: 'ok', label: 'Mover', kind: 'primary' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
  if (r.action !== 'ok') return;
  if (lib.moveNode(state.project, id, r.folder || null)) { renderAll(); touch(); toast('Movido.'); }
}
async function createFolder(parentId = null) {
  const r = await ask({ title: 'Nueva carpeta', input: { label: 'Nombre de la carpeta', value: '', placeholder: 'Ej.: Liga Profesional' }, actions: [{ value: 'ok', label: 'Crear', kind: 'primary' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
  if (r.action !== 'ok' || !r.value) return;
  const id = lib.newId('d');
  state.project.nodes[id] = { id, type: 'folder', name: r.value.slice(0, 200), parentId };
  if (parentId) state.project.nodes[parentId].collapsed = false;
  state.focusId = id; renderAll(); touch();
}
async function deleteNode(id) {
  const n = state.project.nodes[id];
  const inside = n.type === 'folder' ? lib.orderedFiles(state.project, f => lib.isDescendant(state.project, f.id, id)).length : 0;
  const r = await ask({ title: `¿Eliminar «${n.name}»?`, text: n.type === 'folder' ? `Se quita la carpeta${inside ? ` y sus ${inside} archivos` : ''} del proyecto.` : 'Se quita del proyecto con sus colores. Tu archivo original no se toca.', actions: [{ value: 'ok', label: 'Eliminar', kind: 'danger' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
  if (r.action !== 'ok') return;
  const freed = lib.removeNode(state.project, id);
  if (!state.project.nodes[state.selectedId]) { state.selectedId = null; releaseLoaded(); viewer.clear(); }
  state.queue = state.queue.filter(q => state.project.nodes[q]);
  await store.deleteBlobs(freed).catch(() => {});
  for (const k of freed) { const u = state.thumbUrls.get(k); if (u) URL.revokeObjectURL(u); state.thumbUrls.delete(k); }
  renderAll(); touch();
}

// ---------------- Selección y visor ----------------
function releaseLoaded() { state.loaded = null; }
let loadSeq = 0;
async function select(id, { focus = true } = {}) {
  const n = state.project.nodes[id];
  if (!n || n.type !== 'file') return;
  state.selectedId = id; state.focusId = id;
  for (const li of els.tree.querySelectorAll('[aria-selected="true"]')) li.setAttribute('aria-selected', 'false');
  els.tree.querySelector(`[data-id="${id}"]`)?.setAttribute('aria-selected', 'true');
  closeExplorer();
  renderPanel(); renderHeader();
  touch();
  if (n.status === 'pending' && !state.queue.includes(id)) state.queue.unshift(id);
  const seq = ++loadSeq;
  releaseLoaded(); viewer.clear();
  els.empty.hidden = true; els.loading.hidden = false;
  try {
    const blob = await store.getBlob(n.blob);
    if (!blob) throw new Error('Falta el archivo en el almacenamiento del navegador.');
    const img = await workerDecode(blob);
    if (seq !== loadSeq) return;
    const opaque = (n.role === 'kit' && (n.analysis?.mode ?? (img.width === img.height ? 'atlas' : 'free')) === 'atlas') || n.aux === 'srm' || !img.hasAlpha;
    const disp = new Uint8ClampedArray(img.data);
    if (opaque) for (let i = 3; i < disp.length; i += 4) disp[i] = 255;
    const bitmap = await createImageBitmap(new ImageData(disp, img.width, img.height));
    if (seq !== loadSeq) { bitmap.close(); return; }
    state.loaded = { id, raw: img.data, width: img.width, height: img.height };
    viewer.setImage({ bitmap, raw: img.data, width: img.width, height: img.height, checker: !opaque });
    if (n.status === 'error') { n.status = 'pending'; state.queue.unshift(id); pump(); }
  } catch (e) {
    if (seq !== loadSeq) return;
    els.empty.hidden = false;
    els.empty.querySelector('.kcs-empty-title').textContent = 'No se pudo abrir este archivo';
    toast(e.message || 'No se pudo abrir el archivo.', 'error');
  } finally {
    if (seq === loadSeq) els.loading.hidden = true;
    updateTools();
  }
  if (focus && COARSE) els.stage.scrollIntoView({ block: 'nearest' });
}

function kitList() { return lib.orderedFiles(state.project, n => n.role === 'kit' || !lib.siblingKit(state.project, n)); }
function step(dir) {
  const list = kitList();
  if (!list.length) return;
  const cur = state.selectedId ? state.project.nodes[state.selectedId] : null;
  const base = cur?.role === 'aux' ? lib.siblingKit(state.project, cur) || cur : cur;
  const i = list.findIndex(n => n.id === base?.id);
  select(list[(i + dir + list.length) % list.length].id, { focus: false });
}

/** Nodo donde se guardan los colores (una textura auxiliar los guarda en su kit). */
function colorNode() {
  const n = state.project?.nodes[state.selectedId];
  if (!n) return null;
  return n.role === 'aux' ? lib.siblingKit(state.project, n) || n : n;
}

function renderHeader() {
  const n = state.project.nodes[state.selectedId];
  els.title.textContent = n ? n.name : 'Sin kit seleccionado';
  els.path.textContent = n ? lib.pathOf(state.project, n.id).slice(0, -1).join(' / ') || state.project.name : '';
  els.empty.hidden = !!n;
  if (!n) els.empty.querySelector('.kcs-empty-title').textContent = Object.keys(state.project.nodes).length ? 'Elegí un kit de la lista' : 'Importá tus kits';
  const many = kitList().length > 1;
  for (const b of document.querySelectorAll('[data-action="prev"],[data-action="next"]')) b.disabled = !many;
}

function updateTools() {
  const n = state.project?.nodes[state.selectedId];
  const atlas = n?.role === 'kit' && n.analysis?.mode === 'atlas';
  const b = $('[data-action="masks"]');
  b.disabled = !atlas || !state.loaded;
  if (!atlas && viewer.showOverlay) { viewer.showOverlay = false; b.setAttribute('aria-pressed', 'false'); viewer.draw(); }
  for (const x of document.querySelectorAll('.kcs-viewer-tools button')) if (x !== b) x.disabled = !state.loaded;
}

// ---------------- Panel de colores ----------------
function colorCard({ key, label, hex, manual, alts, custom }) {
  const v = hex ? editorValues(hex) : null, rgb = hex ? parseHex(hex) : null, game = hex ? gameHex(hex) : null;
  const values = v ? `<div class="kcs-values">${['R', 'G', 'B'].map((c, i) => `<button type="button" class="kcs-ch" data-copy="${v[i]}" aria-label="Copiar ${c} ${v[i]}"><span>${c}</span><b>${v[i]}</b></button>`).join('')}</div>` : '<div class="kcs-values is-empty">Sin definir · tomalo con el cuentagotas</div>';
  const name = custom
    ? `<input type="text" class="kcs-custom-name" value="${esc(label)}" maxlength="60" aria-label="Nombre del color" data-rename="${key}">`
    : `<span class="kcs-color-label">${esc(label)}${manual ? ' <em>manual</em>' : ''}</span>`;
  const others = (alts || []).filter(a => a.hex !== hex).slice(0, 5);
  const altHtml = others.length ? `<div class="kcs-alts" role="group" aria-label="Otras opciones para ${esc(label)}"><span>Otras:</span>${others.map(a => `<button type="button" class="kcs-alt" data-alt="${a.hex}" data-role="${key}" style="--c:#${a.hex}" title="#${a.hex} · ${Math.round(a.share * 100)} % · ${valuesText(a.hex)}" aria-label="Usar #${a.hex} (${Math.round(a.share * 100)} % de la pieza)"></button>`).join('')}</div>` : '';
  return `<li class="kcs-color" data-key="${key}" ${custom ? 'data-custom="1"' : ''}>
    <button type="button" class="kcs-swatch" style="--c:${hex ? '#' + hex : 'transparent'}" data-edit="${key}" aria-label="Editar ${esc(label)}"${hex ? '' : ' data-empty="1"'}></button>
    <div class="kcs-color-main">${name}${values}
      ${hex ? `<span class="kcs-hexline">#${hex} · RGB ${rgb.join(' ')}${game !== hex ? ` · <span title="Color exacto que se ve en el juego con estos valores">juego #${game}</span>` : ''}</span>` : ''}
    </div>
    <div class="kcs-color-actions">
      ${hex ? `<button type="button" class="kcs-btn kcs-btn-small kcs-btn-primary" data-copy-color="${key}">Copiar</button>` : ''}
      <button type="button" class="kcs-icon-btn" data-dropper="${key}" aria-label="${hex ? 'Corregir' : 'Tomar'} ${esc(label)} con el cuentagotas" title="Cuentagotas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4M4 20l1-4 9.5-9.5 3 3L8 19z"/><path d="m13 4 7 7"/></svg></button>
      ${custom ? `<button type="button" class="kcs-icon-btn" data-delete-custom="${key}" aria-label="Eliminar ${esc(label)}" title="Eliminar">✕</button>` : manual ? `<button type="button" class="kcs-icon-btn" data-reset="${key}" aria-label="Volver al color detectado" title="Volver al automático">↺</button>` : ''}
    </div>${altHtml}</li>`;
}

function renderPanel() {
  const n = colorNode(), sel = state.project.nodes[state.selectedId];
  const panel = $('#kcs-panel');
  panel.classList.toggle('is-disabled', !n);
  if (!n) {
    els.colors.innerHTML = ROLES.map(r => colorCard({ key: r.key, label: r.label, hex: null })).join('');
    els.custom.innerHTML = ''; els.customEmpty.hidden = false; els.meta.textContent = 'Seleccioná un kit para ver sus colores.'; els.mode.hidden = true;
    return;
  }
  const a = n.analysis;
  const meta = [n.formatName, n.width ? `${n.width} × ${n.height}` : '', n.role === 'kit' ? lib.kitTag(n.name, state.project.nodes[n.parentId]?.name) : ''].filter(Boolean).join(' · ');
  els.meta.innerHTML = n.status === 'error' ? `<span class="kcs-error">No se pudo leer: ${esc(n.error)}</span>` : n.status === 'pending' ? 'Analizando…' : esc(meta);
  if (sel && sel.id !== n.id) els.meta.innerHTML += `<br><span class="kcs-note">Viendo ${esc(lib.AUX_LABEL[sel.aux] || 'una textura auxiliar')}: los colores se guardan en «${esc(n.name)}».</span>`;
  else if (sel?.role === 'aux') els.meta.innerHTML += `<br><span class="kcs-note">${esc(lib.AUX_LABEL[sel.aux])}${sel.dorsal ? ` · color de dorsales detectado #${sel.dorsal}` : ''}.</span>`;
  els.mode.hidden = n.role !== 'kit' || !a;
  if (a) {
    els.modeText.textContent = a.mode === 'atlas' ? 'Analizado como textura de kit (piezas del juego).' : 'Analizado como imagen libre: elegí pantalón y medias.';
    $('[data-action="toggle-mode"]').textContent = a.mode === 'atlas' ? 'Es otra imagen' : 'Es una textura de kit';
  }
  const altsFor = key => a ? (a.alternatives[ROLE_ALT[key]] || a.alternatives.imagen || []) : [];
  els.colors.innerHTML = ROLES.map(r => colorCard({ key: r.key, label: r.label, hex: n.colors?.[r.key] || null, manual: n.manual?.[r.key], alts: altsFor(r.key) })).join('');
  els.custom.innerHTML = (n.custom || []).map(c => colorCard({ key: c.id, label: c.name, hex: c.hex, custom: true })).join('');
  els.customEmpty.hidden = !!n.custom?.length;
}

function setColor(key, hexValue) {
  const n = colorNode();
  if (!n) return;
  const custom = n.custom?.find(c => c.id === key);
  if (custom) { custom.hex = hexValue; custom.edited = true; }
  else { n.colors[key] = hexValue; n.manual ||= {}; n.manual[key] = true; }
  renderPanel(); renderTreeSoon(); touch(); renderConsole();
}

async function editColor(key) {
  const n = colorNode();
  if (!n) return;
  const custom = n.custom?.find(c => c.id === key);
  const cur = custom ? custom.hex : n.colors[key];
  const label = custom ? custom.name : ROLES.find(r => r.key === key).label;
  const v = cur ? editorValues(cur) : [0, 0, 0];
  const r = await ask({ title: `Editar: ${label}`, text: `<div class="kcs-edit-grid">${['R', 'G', 'B'].map((c, i) => `<label>${c}<input type="number" min="0" max="63" step="1" inputmode="numeric" value="${v[i]}" data-ch="${i}"></label>`).join('')}</div><p class="kcs-hint">Valores del editor de PES 2018 (0–63). O escribí un HEX:</p>`, input: { label: 'HEX', value: cur ? '#' + cur : '', placeholder: '#C81020' }, actions: [{ value: 'ok', label: 'Aplicar', kind: 'primary' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
  if (r.action !== 'ok') return;
  const typedHex = parseHex(r.value);
  const chans = [...els.ask.querySelectorAll('[data-ch]')].map(i => Math.max(0, Math.min(63, Number(i.value) | 0)));
  const changed63 = chans.some((c, i) => c !== v[i]);
  const result = changed63 || !typedHex ? toHex(chans.map(from63)) : toHex(typedHex);
  setColor(key, result);
}

// ---------------- Cuentagotas ----------------
function armTarget(target) {
  state.target = target;
  setTool('pick');
  const n = colorNode();
  const label = !target ? '' : target === 'new' ? 'nuevo color personalizado' : n?.custom?.find(c => c.id === target)?.name || ROLES.find(r => r.key === target)?.label;
  els.target.hidden = !target;
  els.targetText.textContent = target ? `Tocá el color para «${label}»` : '';
  if (target) { els.stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); if (!COARSE) els.stage.focus({ preventScroll: true }); }
}

function onPick(sample) {
  const n = colorNode();
  if (!n) return;
  if (state.target && state.target !== 'new') { setColor(state.target, sample.hex); toast(`Color aplicado: ${valuesText(sample.hex)}`); armTarget(null); return; }
  openPickDialog(sample, state.target === 'new');
  armTarget(null);
}

function openPickDialog(sample, focusName) {
  const d = els.pick, n = colorNode(), v = editorValues(sample.hex);
  $('#kcs-pick-swatch').style.background = '#' + sample.hex;
  $('#kcs-pick-values').innerHTML = `<b>R ${v[0]} · G ${v[1]} · B ${v[2]}</b><span>#${sample.hex} · píxel ${sample.x}, ${sample.y}${viewer.sample === 3 ? ' · promedio 3 × 3' : ''}</span>`;
  $('#kcs-pick-roles').innerHTML = ROLES.map(r => `<button type="button" class="kcs-btn" data-pick="${r.key}"><i style="background:${n.colors[r.key] ? '#' + n.colors[r.key] : 'transparent'}"></i>${esc(r.label.replace('Camiseta: ', ''))}</button>`).join('');
  const used = new Set((n.custom || []).map(c => c.name));
  $('#kcs-pick-suggest').innerHTML = QUICK_NAMES.filter(q => !used.has(q)).slice(0, 6).map(q => `<button type="button" class="kcs-chip-btn" data-name="${esc(q)}">${esc(q)}</button>`).join('');
  $('#kcs-pick-replace').innerHTML = n.custom?.length ? `<p class="kcs-dialog-label">Reemplazar uno guardado</p><div class="kcs-pick-grid">${n.custom.map(c => `<button type="button" class="kcs-btn" data-pick="${c.id}"><i style="background:#${c.hex}"></i>${esc(c.name)}</button>`).join('')}</div>` : '';
  const name = $('#kcs-pick-name'); name.value = '';
  d.dataset.hex = sample.hex;
  d.showModal();
  if (focusName || !COARSE) name.focus();
}

function addCustom(name, hexValue) {
  const n = colorNode();
  n.custom ||= [];
  n.custom.push({ id: lib.newId('c'), name: (name || `Color ${n.custom.length + 1}`).slice(0, 60), hex: hexValue });
  renderPanel(); touch(); renderConsole();
  toast(`Guardado «${n.custom.at(-1).name}»: ${valuesText(hexValue)}`);
}

function setTool(tool) {
  viewer.tool = tool;
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
  els.stage.dataset.tool = tool;
}

// ---------------- Modo consola ----------------
function renderConsole() {
  if (els.console.hidden) return;
  const n = state.project.nodes[state.consoleId];
  if (!n) { $('#kcs-console-list').innerHTML = '<li class="kcs-console-empty">Importá un kit para ver sus colores.</li>'; return; }
  $('#kcs-console-title').textContent = n.name;
  $('#kcs-console-path').textContent = lib.pathOf(state.project, n.id).slice(0, -1).join(' / ');
  const rows = ROLES.map(r => ({ label: r.label, hex: n.colors?.[r.key] })).concat((n.custom || []).map(c => ({ label: c.name, hex: c.hex })));
  $('#kcs-console-list').innerHTML = rows.map(r => {
    const v = r.hex ? editorValues(r.hex) : null;
    return `<li><button type="button" ${r.hex ? `data-console-copy="${r.hex}"` : 'disabled'} aria-label="${esc(r.label)}: ${v ? `R ${v[0]}, G ${v[1]}, B ${v[2]}. Tocá para copiar` : 'sin definir'}">
      <i style="background:${r.hex ? '#' + r.hex : 'transparent'}"></i><span class="kcs-console-label">${esc(r.label)}</span>
      <span class="kcs-console-values">${v ? `<span>R<b>${v[0]}</b></span><span>G<b>${v[1]}</b></span><span>B<b>${v[2]}</b></span>` : '<span class="kcs-muted">Sin definir</span>'}</span></button></li>`;
  }).join('');
  const list = kitList(), i = list.findIndex(x => x.id === n.id);
  $('#kcs-console-foot').textContent = `${i + 1} de ${list.length} · Deslizá o usá ‹ › para cambiar de kit`;
}
async function openConsole() {
  const n = colorNode();
  state.consoleId = n?.id || kitList()[0]?.id || null;
  els.console.hidden = false; document.body.classList.add('kcs-console-open');
  renderConsole();
  els.console.querySelector('.kcs-console-close').focus();
  try { state.wakeLock = await navigator.wakeLock?.request('screen'); } catch { state.wakeLock = null; }
}
function closeConsole() {
  els.console.hidden = true; document.body.classList.remove('kcs-console-open');
  state.wakeLock?.release?.().catch(() => {}); state.wakeLock = null;
  if (state.consoleId && state.consoleId !== colorNode()?.id) select(state.consoleId, { focus: false });
  $('[data-action="console"]').focus();
}
function consoleStep(dir) {
  const list = kitList();
  if (!list.length) return;
  const i = list.findIndex(x => x.id === state.consoleId);
  state.consoleId = list[(i + dir + list.length) % list.length].id;
  renderConsole();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !els.console.hidden && !state.wakeLock) {
    try { state.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* sin Wake Lock: la herramienta sigue funcionando */ }
  }
});

// ---------------- Proyectos: guardar, abrir, PDF ----------------
async function exportCurrent() {
  if (!Object.keys(state.project.nodes).length) { toast('El proyecto está vacío.', 'error'); return; }
  try {
    progress('Preparando el proyecto…');
    await saveNow();
    const blob = await exportProject(state.project, { getBlob: store.getBlob, getThumb: store.getThumb, onProgress: (i, t) => progress(`Preparando el proyecto… ${i} de ${t}`) });
    download(blob, `${fileSafe(state.project.name)}.laqpkits`);
    toast('Proyecto guardado como archivo .laqpkits.');
  } catch (e) { toast(e.message || 'No se pudo guardar el proyecto.', 'error'); }
  finally { progress(''); }
}

async function importProjectFile(file) {
  try {
    progress('Leyendo el proyecto…');
    const { project, files, thumbs } = await readProjectFile(file);
    progress('');
    const existing = await store.getProject(project.id);
    let asCopy = false;
    if (existing) {
      const r = await ask({ title: 'Este proyecto ya existe', text: `En este navegador ya está «${esc(existing.name)}» (modificado ${new Date(existing.updated).toLocaleString('es-AR')}). ¿Querés reemplazarlo con el archivo o importarlo como una copia?`, actions: [{ value: 'copy', label: 'Importar como copia', kind: 'primary' }, { value: 'replace', label: 'Reemplazar', kind: 'danger' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
      if (r.action === 'cancel') return;
      asCopy = r.action === 'copy';
    }
    // Claves nuevas para los archivos: nunca se pisan los datos de otro proyecto
    const p = structuredClone(project);
    if (asCopy) { p.id = lib.newId('p'); p.name = `${p.name} (copia)`; }
    let i = 0;
    const total = Object.values(p.nodes).filter(n => n.type === 'file').length;
    for (const n of Object.values(p.nodes)) {
      if (n.type !== 'file') continue;
      progress(`Restaurando archivos… ${++i} de ${total}`);
      const entry = files.get(n.blob), key = lib.newId('b');
      await store.putBlob(key, new Blob([await entry.read(LIMITS.maxEntry)]));
      const t = thumbs.get(n.blob);
      if (t) await store.putThumb(key, new Blob([await t.read(8 * MB)], { type: 'image/png' })).catch(() => {});
      else n.status = 'pending';
      n.blob = key;
    }
    if (existing && !asCopy) await store.deleteProject(existing);
    await store.saveProject(p);
    await loadProject(p);
    toast(`Proyecto «${p.name}» abierto.`);
  } catch (e) {
    toast(e instanceof ProjectFileError ? e.message : e?.name === 'QuotaExceededError' ? 'No hay espacio en el navegador para abrir este proyecto.' : 'No se pudo abrir el proyecto: ' + (e.message || 'archivo dañado'), 'error');
  } finally { progress(''); }
}

async function renderProjects() {
  const list = (await store.listProjects()).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  $('#kcs-project-list').innerHTML = list.map(p => {
    const kits = Object.values(p.nodes).filter(n => n.type === 'file' && n.role === 'kit').length, cur = p.id === state.project.id;
    return `<li class="${cur ? 'is-current' : ''}"><div><b>${esc(p.name)}</b><span>${kits} kits · ${new Date(p.updated).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}${cur ? ' · abierto' : ''}</span></div>
      <div class="kcs-project-actions">${cur ? '' : `<button type="button" class="kcs-btn kcs-btn-small" data-open-project="${p.id}">Abrir</button>`}<button type="button" class="kcs-btn kcs-btn-small kcs-btn-ghost" data-rename-project="${p.id}">Renombrar</button><button type="button" class="kcs-btn kcs-btn-small kcs-btn-ghost kcs-danger" data-delete-project="${p.id}">Eliminar</button></div></li>`;
  }).join('');
  const est = await store.storageEstimate();
  $('#kcs-storage').textContent = est?.usage != null ? `Espacio usado en este navegador: ${(est.usage / MB).toFixed(1)} MB${est.quota ? ` de ${(est.quota / MB / 1024).toFixed(1)} GB disponibles` : ''}.` : '';
}

async function thumbJpeg(n) {
  const b = await store.getThumb(n.blob).catch(() => null);
  if (!b) return null;
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0); bmp.close();
  const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  return jpg ? { bytes: new Uint8Array(await jpg.arrayBuffer()), width: c.width, height: c.height } : null;
}
async function exportPdf(single) {
  const nodes = single ? [colorNode()].filter(Boolean) : kitList().filter(n => n.status !== 'error');
  if (!nodes.length) { toast(single ? 'Seleccioná un kit.' : 'No hay kits para exportar.', 'error'); return; }
  try {
    progress('Armando el PDF…');
    const thumbs = new Map();
    for (const [i, n] of nodes.entries()) { progress(`Armando el PDF… ${i + 1} de ${nodes.length}`); const t = await thumbJpeg(n); if (t) thumbs.set(n.id, t); }
    const blob = buildSheet(state.project, nodes, thumbs);
    download(blob, `${fileSafe(single ? `${state.project.name} - ${lib.stem(nodes[0].name)}` : state.project.name)} - colores.pdf`);
    toast('PDF descargado.');
  } catch (e) { toast('No se pudo generar el PDF: ' + (e.message || ''), 'error'); }
  finally { progress(''); }
}

function sheetText(n) {
  const lines = [`${lib.pathOf(state.project, n.id).join(' / ')}`, 'Valores para el editor de PES 2018 (R G B de 0 a 63):'];
  for (const r of ROLES) lines.push(`${r.label}: ${n.colors[r.key] ? `${valuesText(n.colors[r.key])} (#${n.colors[r.key]})` : 'sin definir'}`);
  for (const c of n.custom || []) lines.push(`${c.name}: ${valuesText(c.hex)} (#${c.hex})`);
  return lines.join('\n');
}

// ---------------- Render general ----------------
function renderAll() {
  if (!state.project) return;
  els.projectName.textContent = state.project.name;
  renderTree(); renderHeader(); renderPanel(); updateTools(); renderConsole();
}
function openExplorer() { els.app.classList.add('is-explorer-open'); els.scrim.hidden = false; (els.tree.querySelector('[tabindex="0"]') || els.search).focus({ preventScroll: true }); }
function closeExplorer() { if (!els.app.classList.contains('is-explorer-open')) return; els.app.classList.remove('is-explorer-open'); els.scrim.hidden = true; }

// ---------------- Eventos ----------------
const viewer = new Viewer({
  stage: els.stage, canvas: $('#kcs-canvas'), loupe: $('#kcs-loupe'), readout: $('#kcs-readout'), onPick,
  onChange: ({ zoom }) => { els.zoom.textContent = zoom >= 10 ? `${Math.round(zoom)}×` : `${Math.round(zoom * 100)} %`; },
});

const actions = {
  'open-files': () => { els.file.accept = lib.ACCEPT; els.file.click(); },
  'open-folder': () => els.folder.click(),
  paste: pasteFromButton,
  projects: async () => { await renderProjects(); els.projects.showModal(); },
  'new-project': async () => {
    const r = await ask({ title: 'Nuevo proyecto', input: { label: 'Nombre', value: '', placeholder: 'Ej.: Kitpack Liga 2026' }, actions: [{ value: 'ok', label: 'Crear', kind: 'primary' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
    if (r.action !== 'ok') return;
    els.projects.close();
    await saveNow();
    const p = newProject(r.value || 'Mis kits'); await store.saveProject(p); await loadProject(p); viewer.clear();
  },
  'export-project': () => { els.projects.open && els.projects.close(); exportCurrent(); },
  'import-project': () => { els.projects.open && els.projects.close(); els.projectFile.click(); },
  'pdf-project': () => exportPdf(false),
  'pdf-kit': () => exportPdf(true),
  console: openConsole, 'console-close': closeConsole, 'console-prev': () => consoleStep(-1), 'console-next': () => consoleStep(1),
  'new-folder': () => createFolder(null),
  'open-explorer': openExplorer, 'close-explorer': closeExplorer,
  'goto-colors': () => $('#kcs-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }),
  prev: () => step(-1), next: () => step(1),
  'zoom-in': () => viewer.zoomBy(1.6), 'zoom-out': () => viewer.zoomBy(1 / 1.6), fit: () => viewer.fit(), actual: () => viewer.actual(),
  sample: b => { viewer.sample = viewer.sample === 1 ? 3 : 1; b.textContent = viewer.sample === 1 ? '1 px' : '3 × 3'; b.setAttribute('aria-pressed', String(viewer.sample === 3)); },
  masks: async b => {
    if (!state.overlay) {
      const m = await call('masks');
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d'), img = g.createImageData(512, 512);
      const tint = { camiseta_completa: [33, 212, 194], pantalon: [255, 184, 0], medias: [255, 80, 200] };
      for (const [k, col] of Object.entries(tint)) for (let i = 0; i < 512 * 512; i++) if (m[k].data[i]) { img.data.set(col, i * 4); img.data[i * 4 + 3] = 120; }
      g.putImageData(img, 0, 0); state.overlay = c; viewer.setOverlay(c);
    }
    viewer.showOverlay = !viewer.showOverlay; b.setAttribute('aria-pressed', String(viewer.showOverlay)); viewer.draw();
    if (viewer.showOverlay) toast('Turquesa: camiseta · amarillo: pantalón · rosa: medias');
  },
  'cancel-target': () => armTarget(null),
  'add-custom': () => { if (!colorNode()) { toast('Seleccioná un kit primero.', 'error'); return; } armTarget('new'); },
  swap: () => {
    const n = colorNode(); if (!n) return;
    [n.colors.principal, n.colors.secundario] = [n.colors.secundario, n.colors.principal];
    n.manual ||= {}; n.manual.principal = n.manual.secundario = true;
    renderPanel(); renderTreeSoon(); touch(); toast('Principal y secundario intercambiados.');
  },
  redetect: () => {
    const n = colorNode(); if (!n || n.role !== 'kit') return;
    n.manual = {}; n.status = 'pending'; state.queue.unshift(n.id); renderPanel(); pump(); toast('Detectando de nuevo…');
  },
  'toggle-mode': () => {
    const n = colorNode(); if (!n?.analysis) return;
    n.mode = n.analysis.mode === 'atlas' ? 'free' : 'atlas'; n.manual = {}; n.status = 'pending';
    state.queue.unshift(n.id); pump(); select(state.selectedId, { focus: false });
  },
  'copy-sheet': () => { const n = colorNode(); if (n) copyText(sheetText(n), 'ficha del kit'); },
  'cancel-import': () => { state.cancelImport = true; toast('Importación cancelada.'); },
};

document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-action]');
  if (!t) return;
  const a = t.dataset.action;
  if (a && actions[a]) { e.preventDefault(); actions[a](t); return; }
  if (t.dataset.tool) { setTool(t.dataset.tool); return; }
  if (t.dataset.copy !== undefined && t.classList.contains('kcs-ch')) { copyText(t.dataset.copy); return; }
  if (t.dataset.copyColor) {
    const n = colorNode(), c = n.custom?.find(x => x.id === t.dataset.copyColor);
    const h = c ? c.hex : n.colors[t.dataset.copyColor]; if (h) copyText(valuesText(h)); return;
  }
  if (t.dataset.dropper) { armTarget(t.dataset.dropper); return; }
  if (t.dataset.edit) { editColor(t.dataset.edit); return; }
  if (t.dataset.reset) {
    const n = colorNode(); n.manual[t.dataset.reset] = false; n.colors[t.dataset.reset] = n.analysis?.colors[t.dataset.reset] ?? null;
    renderPanel(); renderTreeSoon(); touch(); return;
  }
  if (t.dataset.alt) { setColor(t.dataset.role, t.dataset.alt); return; }
  if (t.dataset.deleteCustom) { const n = colorNode(); n.custom = n.custom.filter(c => c.id !== t.dataset.deleteCustom); renderPanel(); touch(); renderConsole(); return; }
  if (t.dataset.more) { e.stopPropagation(); nodeActions(t.dataset.more); return; }
  if (t.dataset.consoleCopy) { copyText(valuesText(t.dataset.consoleCopy)); return; }
  if (t.dataset.openProject) { els.projects.close(); await saveNow(); const p = await store.getProject(t.dataset.openProject); if (p) { viewer.clear(); await loadProject(p); } return; }
  if (t.dataset.renameProject) {
    const p = t.dataset.renameProject === state.project.id ? state.project : await store.getProject(t.dataset.renameProject);
    els.projects.close();
    const r = await ask({ title: 'Renombrar proyecto', input: { label: 'Nombre', value: p.name }, actions: [{ value: 'ok', label: 'Renombrar', kind: 'primary' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
    if (r.action === 'ok' && r.value) { p.name = r.value.slice(0, 200); if (p === state.project) { renderAll(); touch(); } else await store.saveProject(p); }
    await renderProjects(); els.projects.showModal(); return;
  }
  if (t.dataset.deleteProject) {
    const p = t.dataset.deleteProject === state.project.id ? state.project : await store.getProject(t.dataset.deleteProject);
    els.projects.close();
    const r = await ask({ title: `¿Eliminar «${p.name}»?`, text: 'Se borra de este navegador con todos sus kits y colores. Si tenés el archivo .laqpkits, podés volver a abrirlo.', actions: [{ value: 'ok', label: 'Eliminar', kind: 'danger' }, { value: 'cancel', label: 'Cancelar', kind: 'ghost' }] });
    if (r.action === 'ok') {
      await store.deleteProject(p);
      if (p.id === state.project.id) { const rest = await store.listProjects(); viewer.clear(); await loadProject(rest[0] || newProject()); }
    }
    await renderProjects(); els.projects.showModal(); return;
  }
  if (t.closest('[data-close]')) t.closest('dialog').close();
});

// Diálogo del cuentagotas
els.pick.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const hexValue = els.pick.dataset.hex;
  if (b.dataset.name) { $('#kcs-pick-name').value = b.dataset.name; $('#kcs-pick-name').focus(); return; }
  const k = b.dataset.pick; if (!k) return;
  if (k === 'new') addCustom($('#kcs-pick-name').value.trim(), hexValue);
  else if (k === 'copy') copyText(valuesText(hexValue));
  else { setColor(k, hexValue); toast(`Color aplicado: ${valuesText(hexValue)}`); }
  els.pick.close();
});
$('#kcs-pick-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(e.target.value.trim(), els.pick.dataset.hex); els.pick.close(); } });

// Renombrar colores personalizados
els.custom.addEventListener('change', e => {
  const i = e.target.closest('[data-rename]'); if (!i) return;
  const c = colorNode()?.custom?.find(x => x.id === i.dataset.rename);
  if (c && i.value.trim()) { c.name = i.value.trim().slice(0, 60); touch(); renderConsole(); }
});

// Explorador: selección, carpetas, teclado y arrastrar
els.tree.addEventListener('click', e => {
  const li = e.target.closest('[role="treeitem"]'); if (!li || e.target.closest('.kcs-more')) return;
  const n = state.project.nodes[li.dataset.id];
  if (n.type === 'folder') { n.collapsed = !n.collapsed; state.focusId = n.id; renderTree(); touch(); els.tree.querySelector(`[data-id="${n.id}"]`)?.focus(); }
  else select(n.id);
});
els.tree.addEventListener('keydown', e => {
  const li = e.target.closest('[role="treeitem"]'); if (!li) return;
  const items = treeItems(), i = items.indexOf(li), n = state.project.nodes[li.dataset.id];
  const k = e.key;
  if (k === 'ArrowDown') focusTreeItem(items[i + 1]);
  else if (k === 'ArrowUp') focusTreeItem(items[i - 1]);
  else if (k === 'Home') focusTreeItem(items[0]);
  else if (k === 'End') focusTreeItem(items.at(-1));
  else if (k === 'ArrowRight' && n.type === 'folder') { if (n.collapsed) { n.collapsed = false; state.focusId = n.id; renderTree(); els.tree.querySelector(`[data-id="${n.id}"]`).focus(); } else focusTreeItem(items[i + 1]); }
  else if (k === 'ArrowLeft') { if (n.type === 'folder' && !n.collapsed) { n.collapsed = true; state.focusId = n.id; renderTree(); els.tree.querySelector(`[data-id="${n.id}"]`).focus(); } else if (n.parentId) focusTreeItem(els.tree.querySelector(`[data-id="${n.parentId}"]`)); }
  else if (k === 'Enter' || k === ' ') { if (n.type === 'folder') li.click(); else select(n.id); }
  else if (k === 'F2') renameNode(n.id);
  else if (k === 'Delete') deleteNode(n.id);
  else if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) nodeActions(n.id);
  else return;
  e.preventDefault();
});
els.tree.addEventListener('dragstart', e => { const li = e.target.closest('[role="treeitem"]'); if (!li) return; e.dataTransfer.setData('application/x-kcs-node', li.dataset.id); e.dataTransfer.effectAllowed = 'move'; });
els.search.addEventListener('input', () => renderTree());

// Arrastrar y soltar: nodos internos (mover) y archivos externos (importar)
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
const isNodeDrag = e => [...(e.dataTransfer?.types || [])].includes('application/x-kcs-node');
window.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; els.drop.hidden = false; } });
window.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; els.drop.hidden = true; } });
window.addEventListener('dragover', e => {
  if (!hasFiles(e) && !isNodeDrag(e)) return;
  e.preventDefault();
  const f = e.target.closest?.('[data-folder-id], .kcs-explorer');
  for (const x of document.querySelectorAll('.is-drop-target')) if (x !== f) x.classList.remove('is-drop-target');
  f?.classList.add('is-drop-target');
  e.dataTransfer.dropEffect = isNodeDrag(e) ? 'move' : 'copy';
});
window.addEventListener('drop', async e => {
  if (!hasFiles(e) && !isNodeDrag(e)) return;
  e.preventDefault(); dragDepth = 0; els.drop.hidden = true;
  for (const x of document.querySelectorAll('.is-drop-target')) x.classList.remove('is-drop-target');
  const folderEl = e.target.closest?.('[data-folder-id]');
  const folderId = folderEl?.dataset.folderId || null;
  if (isNodeDrag(e)) {
    const id = e.dataTransfer.getData('application/x-kcs-node');
    if (!e.target.closest?.('.kcs-explorer')) return;
    if (id && id !== folderId && lib.moveNode(state.project, id, folderId)) { renderAll(); touch(); }
    return;
  }
  const items = await itemsFromDataTransfer(e.dataTransfer);
  const project = items.length === 1 && /\.laqpkits$/i.test(items[0].name);
  if (project) importProjectFile(items[0].file);
  else importItems(items, folderId);
});

// Pegar con Ctrl + V
document.addEventListener('paste', async e => {
  if (e.target.closest?.('input, textarea')) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); importItems(files.map(f => f.type.startsWith('image/') ? pastedItem(f) : { file: f, name: f.name, segments: [] })); return; }
  const url = imageUrlFromDataTransfer(e.clipboardData);
  if (url) { e.preventDefault(); try { importItems([pastedItem(await fetchImageUrl(url))]); } catch (err) { toast(err.message, 'error'); } }
});

els.file.addEventListener('change', () => {
  const list = [...els.file.files]; els.file.value = '';
  const proj = list.filter(f => /\.laqpkits$/i.test(f.name));
  if (proj.length) importProjectFile(proj[0]);
  importItems(itemsFromFileList(list.filter(f => !/\.laqpkits$/i.test(f.name))));
});
els.folder.addEventListener('change', () => { const list = [...els.folder.files]; els.folder.value = ''; importItems(itemsFromFileList(list)); });
els.projectFile.addEventListener('change', () => { const f = els.projectFile.files[0]; els.projectFile.value = ''; if (f) importProjectFile(f); });
els.scrim.addEventListener('click', closeExplorer);

// Consola: deslizar para cambiar de kit
let swipe = null;
els.console.addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY }; });
els.console.addEventListener('pointerup', e => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) consoleStep(dx < 0 ? 1 : -1);
});

document.addEventListener('keydown', e => {
  if (!els.console.hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closeConsole(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') consoleStep(1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') consoleStep(-1);
    return;
  }
  if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'PageDown') { e.preventDefault(); step(1); }
  else if (e.key === 'PageUp') { e.preventDefault(); step(-1); }
  else if (e.key === 'Escape') { if (state.target) armTarget(null); closeExplorer(); }
  else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'i' || e.key === 'I')) setTool('pick');
  else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'h' || e.key === 'H')) setTool('pan');
});

// ---------------- Inicio ----------------
async function init() {
  if ('webkitdirectory' in els.folder && !COARSE) $('#kcs-folder-btn').hidden = false;
  if (typeof Worker === 'undefined' || typeof DecompressionStream === 'undefined' || typeof HTMLDialogElement === 'undefined') {
    els.empty.querySelector('.kcs-empty-title').textContent = 'Tu navegador es demasiado antiguo';
    els.empty.querySelector('p:not(.kcs-empty-title)').textContent = 'Actualizalo (Chrome, Edge, Firefox o Safari recientes) para usar Kit Color Studio.';
    return;
  }
  setTool('pick');
  let project = null;
  try {
    const id = await store.getMeta('current');
    project = id ? await store.getProject(id) : null;
    if (!project) project = (await store.listProjects())[0] || null;
  } catch (e) {
    toast('No se puede guardar en este navegador (¿modo privado?): el trabajo se perderá al cerrar la página. Usá «Guardar proyecto».', 'error');
  }
  if (!project) { project = newProject(); store.saveProject(project).catch(() => {}); }
  await loadProject(project);
  window.kcs = { state, viewer, LIMITS };   // para pruebas y depuración
  document.documentElement.dataset.kcsReady = '1';
}
init();
