// Proyectos de Miniface Studio: guardado local (IndexedDB), archivo exportable y combinación.
// El archivo de proyecto es un ZIP (sin compresión) con project.json y las imágenes ORIGINALES
// (los mismos bytes importados), identificadas por su SHA-256. No depende de rutas locales.

import { createZip, readZip, crc32 } from './zip.js';

export const PROJECT_FORMAT = 'laqp-miniface-studio-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.laqpmf';

const EXTENSIONS = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp' };

export class ProjectError extends Error {}

/** SHA-256 de los bytes originales (identifica la imagen y evita duplicados al combinar). */
export async function hashBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (globalThis.crypto?.subtle) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  }
  return `crc-${crc32(bytes).toString(16)}-${bytes.length}`;
}

/** Estado serializable del proyecto. */
export function serializeProject({ items, activeUid, teams, cpkName, mode = 'pes2018', personal = null, folders = [] }) {
  const images = new Map();
  const outItems = items.map(item => {
    const describe = source => {
      if (!source?.blob || !source.hash) return null;
      const { hash, blob, type, name, width, height } = source;
      images.set(hash, blob);
      return { hash, type: type || blob.type || '', name: name || '', width, height };
    };
    const image = describe(item.source);
    // Imagen original antes de quitar el fondo: permite restaurarla después de recargar o importar.
    const original = describe(item.original);
    return {
      id: item.id, name: item.name || '', shirtName: item.shirtName || '', teamId: item.teamId ?? null, fileName: item.fileName || '', folder: item.folder || '',
      skipped: Boolean(item.skipped), x: item.x, y: item.y, scale: item.scale, updatedAt: item.updatedAt || 0, image, original,
    };
  });
  const json = {
    format: PROJECT_FORMAT, version: PROJECT_VERSION, app: 'LAqP Miniface Studio 0.7', savedAt: new Date().toISOString(),
    mode, personal, folders: [...new Set(folders)].filter(Boolean), cpkName: cpkName || '', activeIndex: Math.max(0, items.findIndex(item => item.uid === activeUid)),
    teams: teams.map(team => ({ id: team.id, name: team.name, abbr: team.abbr || '', squad: team.squad })),
    items: outItems,
  };
  return { json, images };
}

export function validateProjectJson(json) {
  if (!json || json.format !== PROJECT_FORMAT) throw new ProjectError('El archivo no es un proyecto de Miniface Studio.');
  if (json.version > PROJECT_VERSION) throw new ProjectError('El proyecto fue creado con una versión más nueva de Miniface Studio.');
  if (!Array.isArray(json.items) || !Array.isArray(json.teams || [])) throw new ProjectError('El proyecto está incompleto.');
  return json;
}

/** Archivo descargable: project.json + images/<sha256>.<ext>. */
export async function buildProjectFile(state) {
  const { json, images } = serializeProject(state);
  const encoder = new TextEncoder();
  const entries = [{ path: 'project.json', data: encoder.encode(JSON.stringify(json, null, 1)) }, { path: 'images/' }];
  for (const [hash, blob] of images) {
    entries.push({ path: `images/${hash}.${EXTENSIONS[blob.type] || 'bin'}`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return { bytes: createZip(entries), json };
}

/** Lee un archivo de proyecto. Verifica que cada imagen exista y coincida con su hash. */
export async function readProjectFile(file) {
  let files;
  try {
    files = readZip(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    throw new ProjectError(error.message);
  }
  const raw = files.get('project.json');
  if (!raw) throw new ProjectError('El archivo no contiene project.json.');
  let json;
  try { json = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new ProjectError('project.json está dañado.'); }
  validateProjectJson(json);
  const blobs = new Map();
  for (const item of json.items) {
    for (const image of [item.image, item.original]) {
      if (!image || blobs.has(image.hash)) continue;
      const entry = [...files.keys()].find(path => path.startsWith(`images/${image.hash}.`));
      if (!entry) throw new ProjectError(`Falta la imagen de ${item.name || 'ID ' + item.id} en el proyecto.`);
      const blob = new Blob([files.get(entry)], { type: image.type });
      if (await hashBlob(blob) !== image.hash) throw new ProjectError(`La imagen de ${item.name || 'ID ' + item.id} está dañada.`);
      blobs.set(image.hash, blob);
    }
  }
  return { json, getBlob: async hash => blobs.get(hash) };
}

const sameTransform = (a, b) => a.x === b.x && a.y === b.y && a.scale === b.scale;

/**
 * Plan de combinación sin pérdidas.
 * - Mismo jugador del mismo equipo: si el actual no tiene imagen, toma la importada;
 *   si ambos tienen imágenes distintas, se conservan las dos (el ID repetido queda marcado).
 * - Elementos idénticos (misma imagen, ID y ajuste) no se duplican.
 * @returns {{fill: [existing, incoming][], add: incoming[], skipped: number}}
 */
export function planMerge(existingItems, incomingItems) {
  const plan = { fill: [], add: [], skipped: 0 };
  const key = item => (item.teamId != null && item.id ? `${item.teamId}:${item.id}` : null);
  const sameMeta = (a, b) => (a.fileName || '') === (b.fileName || '') && (a.folder || '') === (b.folder || '');
  const byPlayer = new Map(existingItems.filter(key).map(item => [key(item), item]));
  const identical = (a, b) => (a.source?.hash || null) === (b.image?.hash || null) && a.id === b.id && sameTransform(a, b) && sameMeta(a, b);
  for (const incoming of incomingItems) {
    const existing = key(incoming) ? byPlayer.get(key(incoming)) : null;
    if (existing) {
      if (identical(existing, incoming)) { plan.skipped++; continue; }
      if (!incoming.image) { plan.skipped++; continue; }
      if (!existing.source) { plan.fill.push([existing, incoming]); continue; }
      plan.add.push(incoming);
      continue;
    }
    if (existingItems.some(item => identical(item, incoming))) { plan.skipped++; continue; }
    plan.add.push(incoming);
  }
  return plan;
}

/** Une plantillas por ID de equipo, conservando las existentes. */
export function mergeTeams(current, incoming) {
  const map = new Map(current.map(team => [team.id, team]));
  for (const team of incoming || []) if (!map.has(team.id)) map.set(team.id, team);
  return [...map.values()];
}

// ---------- IndexedDB ----------

const DB_NAME = 'laqp-miniface-studio';
const DB_VERSION = 1;

function request(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export class ProjectStore {
  static get available() { return typeof indexedDB !== 'undefined'; }

  async open() {
    if (this.db) return this.db;
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    this.db = await request(req);
    return this.db;
  }

  /** Guarda el estado y las imágenes nuevas; borra imágenes que ya nadie usa. */
  async save(state) {
    const db = await this.open();
    const { json, images } = serializeProject(state);
    const known = await request(db.transaction('images').objectStore('images').getAllKeys());
    const tx = db.transaction(['state', 'images'], 'readwrite');
    const imageStore = tx.objectStore('images');
    for (const [hash, blob] of images) if (!known.includes(hash)) imageStore.put(blob, hash);
    for (const hash of known) if (!images.has(hash)) imageStore.delete(hash);
    tx.objectStore('state').put(json, 'current');
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    return json;
  }

  async load() {
    const db = await this.open();
    const json = await request(db.transaction('state').objectStore('state').get('current'));
    if (!json) return null;
    validateProjectJson(json);
    return { json, getBlob: hash => request(db.transaction('images').objectStore('images').get(hash)) };
  }

  async clear() {
    const db = await this.open();
    const tx = db.transaction(['state', 'images'], 'readwrite');
    tx.objectStore('state').clear(); tx.objectStore('images').clear();
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
}
