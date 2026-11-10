// Perfiles de exportación. Cada juego/formato futuro se agrega como un perfil nuevo.

import { encodeDdsBc3 } from './dds.js';
import { renderComposite, imageDataToPngBlob, imageDataToBlob } from './render.js';
import { createZip, zipEntriesForPath } from './zip.js';
import { createCpk } from './cpk.js';
import { TEMPLATE } from './template.js';

const MAX_PLAYER_ID = 4294967295; // los IDs de PES 2018 son enteros sin signo de 32 bits
// Jugadores de datapacks o creados: el EDIT guarda su ID «inflado» con 0x40000000 sumado, pero el juego
// busca la miniface con el ID real (por ejemplo, 1073857291 → 115467).
export const INFLATED_ID_OFFSET = 0x40000000;

/**
 * Valida un ID y devuelve el que usa el juego para la miniface (sin el 0x40000000 de los IDs inflados).
 * @returns {{ok: true, id: string, editId?: string} | {ok: false, error: string}}
 */
export function validatePlayerId(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'Ingresá el ID del jugador.' };
  if (!/^\d+$/.test(value)) return { ok: false, error: 'El ID solo puede contener números.' };
  const normalized = value.replace(/^0+(?=\d)/, '');
  if (normalized.length > 10 || Number(normalized) > MAX_PLAYER_ID) return { ok: false, error: 'El ID es demasiado grande.' };
  const value32 = Number(normalized);
  if (value32 >= INFLATED_ID_OFFSET && value32 < INFLATED_ID_OFFSET * 2) {
    return { ok: true, id: String(value32 - INFLATED_ID_OFFSET), editId: normalized };
  }
  return { ok: true, id: normalized };
}

export const PES2018_PROFILE = Object.freeze({
  id: 'pes2018',
  label: 'PES 2018',
  size: 128,
  supersample: 4,
  // Ruta interna de los recursos del juego (dentro de un CPK o de la carpeta de contenidos),
  // no la carpeta de instalación en Windows.
  internalDir: 'common/render/symbol/player',
  fileName: id => `player_${id}.dds`,
  internalPath(id) { return `${this.internalDir}/${this.fileName(id)}`; },
  renderPixels(state) { return renderComposite(state, this.size, this.supersample); },
  encode(state) {
    const pixels = this.renderPixels(state);
    return encodeDdsBc3(pixels.data, pixels.width, pixels.height);
  },
  zip(id, dds) { return createZip(zipEntriesForPath(this.internalPath(id), dds)); },
  /** Un único ZIP con varios DDS dentro de la misma carpeta interna. @param {{id: string, dds: Uint8Array}[]} files */
  zipAll(files) {
    const folders = zipEntriesForPath(this.internalPath('0'), null).slice(0, -1);
    return createZip([...folders, ...files.map(({ id, dds }) => ({ path: this.internalPath(id), data: dds }))]);
  },
  /** CPK listo para la carpeta download de PES 2018 (modo FILENAME, alineación 512). */
  cpk(files) { return createCpk(files.map(({ id, dds }) => ({ path: this.internalPath(id), data: dds }))); },
});

// DpFileList.bin reserva 36 bytes por nombre de CPK; si el nombre es más largo, pisa el orden de la lista y PES 2018
// no arranca (confirmado en el juego con Soundtrack Maker, 2026-11-09). Máximo seguro: 35 caracteres contando «.cpk».
export const CPK_NAME_MAX = 35;

/** Nombre de archivo CPK seguro (PES y DpFileList usan nombres simples sin espacios). */
export function sanitizeCpkName(raw) {
  const base = String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\.cpk$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, CPK_NAME_MAX - 4).replace(/_+$/, '');
  return (base || 'LAqP_Minifaces') + '.cpk';
}

export const PNG_PROFILE = Object.freeze({
  id: 'png',
  size: TEMPLATE.size,
  fileName: id => (id ? `player_${id}.png` : 'miniface.png'),
  async encode(state) { return imageDataToPngBlob(renderComposite(state, this.size, 1)); },
});

// ---------- Uso personal (SoFIFA, Football Manager, FIFA, diseños) ----------

export const PERSONAL_FORMATS = Object.freeze({
  png: Object.freeze({ label: 'PNG', mime: 'image/png', ext: 'png', alpha: true }),
  webp: Object.freeze({ label: 'WebP', mime: 'image/webp', ext: 'webp', alpha: true }),
  jpeg: Object.freeze({ label: 'JPG', mime: 'image/jpeg', ext: 'jpg', alpha: false }),
});
export const PERSONAL_SIZES = Object.freeze([128, 256, 360, 512]);

/** Nombre de archivo libre pero válido en Windows, macOS y ZIP (sin extensión). */
export function sanitizeFileName(raw, fallback = 'miniface') {
  const clean = String(raw ?? '').normalize('NFC').replace(/\.(png|webp|jpe?g|gif|dds)$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.-]+$/g, '').slice(0, 80);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) ? `${clean}_` : clean || fallback;
}

/** Carpeta o subcarpetas ("Argentina/River") con cada parte saneada. */
export function sanitizeFolder(raw) {
  return String(raw ?? '').split(/[\\/]+/).map(part => sanitizeFileName(part, '')).filter(Boolean).join('/');
}

function personalRender(state, size) {
  const supersample = size >= TEMPLATE.size ? 1 : Math.min(4, Math.ceil(512 / size));
  return renderComposite(state, size, supersample);
}

export async function encodePersonal(state, { format = 'png', size = TEMPLATE.size, background = '#ffffff' } = {}) {
  const spec = PERSONAL_FORMATS[format] || PERSONAL_FORMATS.png;
  return imageDataToBlob(personalRender(state, size), spec.mime, { background });
}

/**
 * Rutas únicas dentro del ZIP: carpeta/nombre.ext; si se repite un nombre en la misma carpeta
 * se agrega " (2)", " (3)"…
 */
export function personalPaths(entries, format) {
  const ext = (PERSONAL_FORMATS[format] || PERSONAL_FORMATS.png).ext;
  const used = new Set();
  return entries.map(({ folder, fileName }) => {
    const dir = sanitizeFolder(folder);
    const base = sanitizeFileName(fileName);
    let path = `${dir ? dir + '/' : ''}${base}.${ext}`;
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${dir ? dir + '/' : ''}${base} (${n}).${ext}`;
    used.add(path.toLowerCase());
    return path;
  });
}

/** ZIP organizado por carpetas. @param {{path: string, data: Uint8Array}[]} files */
export function personalZip(files) {
  const entries = [];
  const dirs = new Set();
  for (const { path } of files) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') + '/');
  }
  for (const dir of [...dirs].sort()) entries.push({ path: dir });
  for (const file of files) entries.push(file);
  return createZip(entries);
}
