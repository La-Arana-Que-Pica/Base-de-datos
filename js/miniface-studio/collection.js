// Colección de minifaces de la sesión. Cada elemento guarda su propia imagen original,
// ID y transformación; el editor trabaja siempre sobre el elemento activo.
// Un elemento puede no tener imagen todavía (jugador de una plantilla del EDIT, pendiente).

import { validatePlayerId } from './export-profiles.js';

export const STATUS = Object.freeze({ DONE: 'done', PENDING: 'pending', SKIPPED: 'skipped' });
export const MODES = Object.freeze({ PES2018: 'pes2018', PERSONAL: 'personal' });

export class MinifaceCollection {
  constructor() {
    this.items = [];
    this.activeUid = null;
    this.nextUid = 1;
    this.listeners = new Set();
    // PES 2018: exige ID válido y único. Uso personal: solo imagen, con nombre y carpeta libres.
    this.mode = MODES.PES2018;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(reason) {
    for (const listener of this.listeners) listener(this, reason);
  }

  get size() { return this.items.length; }
  get active() { return this.get(this.activeUid); }
  get(uid) { return this.items.find(item => item.uid === uid) || null; }
  indexOf(uid) { return this.items.findIndex(item => item.uid === uid); }

  createItem({ source = null, id = '', name = '', shirtName = '', teamId = null, fileName = '', folder = '', x = null, y = null, scale = null, skipped = false, updatedAt = Date.now() } = {}) {
    return { uid: this.nextUid++, source, id: String(id ?? ''), name, shirtName, teamId, fileName, folder, x, y, scale, skipped, updatedAt };
  }

  /** Agrega una imagen; la transformación queda en null hasta que el editor la encaje. */
  add(source, id = '', extra = {}) {
    const item = this.createItem({ ...extra, source, id });
    this.items.push(item);
    this.emit('add');
    return item;
  }

  /** Agrega varios elementos ya construidos (restaurar o combinar proyectos). */
  addMany(items) {
    for (const item of items) this.items.push(item);
    if (items.length) this.emit('add');
  }

  /** Jugador de una plantilla sin imagen todavía. */
  addSlot({ id, name, shirtName = '', teamId }) {
    const item = this.createItem({ id, name, shirtName, teamId });
    this.items.push(item);
    this.emit('add');
    return item;
  }

  findPlayer(teamId, playerId) {
    const id = String(playerId);
    return this.items.find(item => item.teamId === teamId && item.id === id) || null;
  }

  select(uid) {
    if (!this.get(uid) || uid === this.activeUid) return;
    this.activeUid = uid;
    this.emit('select');
  }

  /** Deja de editar: ningún jugador activo (por ejemplo, al abrir una carpeta vacía). */
  deselect() {
    if (this.activeUid == null) return;
    this.activeUid = null;
    this.emit('select');
  }

  /** Elimina varios elementos de una vez y libera sus imágenes. */
  removeMany(uids) {
    const gone = new Set(uids);
    if (!gone.size) return;
    for (const item of this.items) if (gone.has(item.uid)) { item.source?.release?.(); item.original?.release?.(); }
    this.items = this.items.filter(item => !gone.has(item.uid));
    if (gone.has(this.activeUid)) this.activeUid = null;
    this.emit('remove');
  }

  /** Elimina y libera la imagen. Devuelve el elemento que queda activo (o null). */
  remove(uid) {
    const index = this.indexOf(uid);
    if (index < 0) return this.active;
    const [item] = this.items.splice(index, 1);
    item.source?.release?.();
    item.original?.release?.();
    if (this.activeUid === uid) {
      const next = this.items[Math.min(index, this.items.length - 1)];
      this.activeUid = next ? next.uid : null;
    }
    this.emit('remove');
    return this.active;
  }

  clear() {
    for (const item of this.items) { item.source?.release?.(); item.original?.release?.(); }
    this.items = [];
    this.activeUid = null;
    this.emit('clear');
  }

  setId(uid, raw) {
    const item = this.get(uid);
    if (!item || item.id === raw) return;
    item.id = raw;
    item.updatedAt = Date.now();
    this.emit('id');
  }

  /** Asigna (o reemplaza) la imagen de un elemento existente. */
  setSource(uid, source, transform, { release = true } = {}) {
    const item = this.get(uid);
    if (!item) return;
    // release = false conserva la imagen anterior (por ejemplo, la original al quitar el fondo).
    if (release && item.source && item.source !== source) item.source.release?.();
    Object.assign(item, { source, skipped: false, updatedAt: Date.now() }, transform);
    this.emit('source');
  }

  setMode(mode) {
    if (!Object.values(MODES).includes(mode) || mode === this.mode) return;
    this.mode = mode;
    this.emit('mode');
  }

  /** Nombre de archivo y carpeta (modo personal). */
  setMeta(uid, patch) {
    const item = this.get(uid);
    if (!item) return;
    let changed = false;
    for (const key of ['fileName', 'folder']) {
      if (key in patch && item[key] !== patch[key]) { item[key] = patch[key]; changed = true; }
    }
    if (!changed) return;
    item.updatedAt = Date.now();
    this.emit('meta');
  }

  folders() {
    return [...new Set(this.items.map(item => item.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  }

  /** ¿La miniface está en la carpeta (o en una subcarpeta)? '' = sin carpeta. */
  static inFolder(item, folder, { recursive = true } = {}) {
    const own = item.folder || '';
    if (!folder) return own === '';
    return own === folder || (recursive && own.startsWith(folder + '/'));
  }

  /** Mueve minifaces a una carpeta ('' = sin carpeta). Devuelve cuántas cambiaron. */
  moveToFolder(uids, folder) {
    let moved = 0;
    for (const uid of uids) {
      const item = this.get(uid);
      if (!item || (item.folder || '') === folder) continue;
      item.folder = folder;
      item.updatedAt = Date.now();
      moved++;
    }
    if (moved) this.emit('meta');
    return moved;
  }

  /** Renombra una carpeta y sus subcarpetas en todas las minifaces. */
  renameFolder(from, to) {
    let changed = 0;
    for (const item of this.items) {
      const own = item.folder || '';
      if (own === from || own.startsWith(from + '/')) {
        item.folder = to + own.slice(from.length);
        item.updatedAt = Date.now();
        changed++;
      }
    }
    if (changed) this.emit('meta');
    return changed;
  }

  /** Elimina una carpeta: sus minifaces pasan a la carpeta superior (no se borra ninguna). */
  removeFolder(folder) {
    const parent = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '';
    return this.renameFolder(folder, parent);
  }

  setSkipped(uid, skipped) {
    const item = this.get(uid);
    if (!item || item.skipped === skipped) return;
    item.skipped = skipped;
    item.updatedAt = Date.now();
    this.emit('skip');
  }

  /** Guarda la transformación del editor en el elemento (sin notificar: es continua). */
  storeTransform(uid, { x, y, scale }) {
    const item = this.get(uid);
    if (!item) return;
    if (item.x !== x || item.y !== y || item.scale !== scale) item.updatedAt = Date.now();
    Object.assign(item, { x, y, scale });
  }

  /** Terminada = tiene imagen y un ID válido; omitida = marcada para no exportar. */
  status(item) {
    if (item.skipped) return STATUS.SKIPPED;
    if (this.mode === MODES.PERSONAL) return item.source ? STATUS.DONE : STATUS.PENDING;
    return item.source && validatePlayerId(item.id).ok ? STATUS.DONE : STATUS.PENDING;
  }

  /** Elementos que se exportan: con imagen y no omitidos. */
  exportable() {
    return this.items.filter(item => item.source && !item.skipped);
  }

  counts() {
    const counts = { done: 0, pending: 0, skipped: 0 };
    for (const item of this.items) counts[this.status(item)]++;
    return counts;
  }

  /**
   * Problemas que impiden exportar (solo minifaces con imagen y no omitidas).
   * @returns {{byUid: Map<number, string>, missing: number, invalid: number, duplicateIds: string[]}}
   */
  issues() {
    const byUid = new Map();
    const owners = new Map();
    let missing = 0, invalid = 0;
    if (this.mode === MODES.PERSONAL) return { byUid, missing, invalid, duplicateIds: [] };
    for (const item of this.exportable()) {
      const result = validatePlayerId(item.id);
      if (!result.ok) {
        if (String(item.id).trim()) { invalid++; byUid.set(item.uid, result.error); }
        else { missing++; byUid.set(item.uid, 'Falta el ID.'); }
        continue;
      }
      if (!owners.has(result.id)) owners.set(result.id, []);
      owners.get(result.id).push(item.uid);
    }
    const duplicateIds = [];
    for (const [id, uids] of owners) {
      if (uids.length < 2) continue;
      duplicateIds.push(id);
      for (const uid of uids) byUid.set(uid, `ID ${id} repetido.`);
    }
    return { byUid, missing, invalid, duplicateIds };
  }

  /** Primer elemento exportable con ID faltante o repetido, empezando después de `afterUid`. */
  nextWithIssue(afterUid = null) {
    const { byUid } = this.issues();
    return this.nextMatching(item => byUid.has(item.uid), afterUid);
  }

  /**
   * Siguiente elemento que necesita trabajo: sin imagen, o con ID faltante/repetido (no omitidos).
   * Con `within` se limita a los elementos que cumplan esa condición (por ejemplo, el mismo equipo).
   */
  nextPending(afterUid = null, within = null) {
    const { byUid } = this.issues();
    return this.nextMatching(item => (!within || within(item)) && !item.skipped && (!item.source || byUid.has(item.uid)), afterUid);
  }

  nextMatching(predicate, afterUid = null) {
    if (!this.items.length) return null;
    const start = afterUid == null ? 0 : this.indexOf(afterUid) + 1;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[(start + i) % this.items.length];
      if (item.uid !== afterUid && predicate(item)) return item;
    }
    return null;
  }
}
