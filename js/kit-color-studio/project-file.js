// Archivo de proyecto portable (.laqpkits): ZIP sin compresión con laqpkits.json + archivos originales + miniaturas.
import { createZipBlob, openZip } from './zip.js';

export const FORMAT = 'laqp-kit-color-studio';
export const VERSION = 1;
const MANIFEST = 'laqpkits.json';
const MAX_NODES = 50000;

export class ProjectFileError extends Error {}

/** getBlob/getThumb: (clave) → Promise<Blob|undefined>. */
export async function exportProject(project, { getBlob, getThumb, onProgress } = {}) {
  const files = [];
  const nodes = Object.values(project.nodes);
  let i = 0;
  for (const n of nodes) {
    if (n.type !== 'file') continue;
    const blob = await getBlob(n.blob);
    if (!blob) throw new ProjectFileError(`Falta el archivo original de «${n.name}» en este navegador.`);
    files.push({ name: `files/${n.blob}`, data: blob });
    const thumb = await getThumb?.(n.blob);
    if (thumb) files.push({ name: `thumbs/${n.blob}`, data: thumb });
    onProgress?.(++i, nodes.length);
  }
  const manifest = { format: FORMAT, version: VERSION, exported: new Date().toISOString(), project };
  files.unshift({ name: MANIFEST, data: new TextEncoder().encode(JSON.stringify(manifest)) });
  return createZipBlob(files);
}

const str = (v, max = 255) => typeof v === 'string' && v.length > 0 && v.length <= max;
const hexOk = v => v === null || v === undefined || /^[0-9A-F]{6}$/.test(v);

/** Valida la estructura del proyecto; lanza ProjectFileError con un mensaje claro. */
export function validateProject(p) {
  if (!p || typeof p !== 'object' || !str(p.id, 80) || !str(p.name, 200) || typeof p.nodes !== 'object' || !p.nodes) throw new ProjectFileError('El archivo de proyecto no tiene un formato válido.');
  const nodes = Object.entries(p.nodes);
  if (nodes.length > MAX_NODES) throw new ProjectFileError('El proyecto tiene demasiados elementos.');
  for (const [id, n] of nodes) {
    if (!n || n.id !== id || !['file', 'folder'].includes(n.type) || !str(n.name)) throw new ProjectFileError('El proyecto contiene elementos dañados.');
    if (n.parentId !== null && (!p.nodes[n.parentId] || p.nodes[n.parentId].type !== 'folder')) throw new ProjectFileError('La estructura de carpetas del proyecto está dañada.');
    if (n.type === 'file') {
      if (!str(n.blob, 80) || !/^[\w-]+$/.test(n.blob)) throw new ProjectFileError('El proyecto contiene referencias de archivo inválidas.');
      for (const v of Object.values(n.colors || {})) if (!hexOk(v)) throw new ProjectFileError('El proyecto contiene colores inválidos.');
      if (n.custom && (!Array.isArray(n.custom) || n.custom.some(c => !str(c.name, 120) || !hexOk(c.hex)))) throw new ProjectFileError('El proyecto contiene colores personalizados inválidos.');
    }
  }
  for (const [id] of nodes) {   // sin ciclos
    const seen = new Set();
    for (let n = p.nodes[id]; n; n = p.nodes[n.parentId]) { if (seen.has(n.id)) throw new ProjectFileError('La estructura de carpetas del proyecto está dañada.'); seen.add(n.id); }
  }
}

/** Lee un .laqpkits → { project, files: Map(clave → entrada ZIP), thumbs: Map }. */
export async function readProjectFile(blob) {
  let entries;
  try { entries = await openZip(blob); } catch { throw new ProjectFileError('El archivo no es un proyecto de Kit Color Studio (.laqpkits) o está dañado.'); }
  const manifest = entries.find(e => e.name === MANIFEST);
  if (!manifest) throw new ProjectFileError('El archivo no es un proyecto de Kit Color Studio (.laqpkits).');
  let data;
  try { data = JSON.parse(new TextDecoder().decode(await manifest.read(64 * 1024 * 1024))); } catch { throw new ProjectFileError('El proyecto está dañado (no se pudo leer su contenido).'); }
  if (data?.format !== FORMAT) throw new ProjectFileError('El archivo no es un proyecto de Kit Color Studio.');
  if (!Number.isInteger(data.version) || data.version > VERSION) throw new ProjectFileError('El proyecto se creó con una versión más nueva de Kit Color Studio. Recargá la página para actualizarla.');
  validateProject(data.project);
  const files = new Map(), thumbs = new Map();
  for (const e of entries) {
    if (e.name.startsWith('files/')) files.set(e.name.slice(6), e);
    else if (e.name.startsWith('thumbs/')) thumbs.set(e.name.slice(7), e);
  }
  for (const n of Object.values(data.project.nodes)) if (n.type === 'file' && !files.has(n.blob)) throw new ProjectFileError(`Al proyecto le falta el archivo de «${n.name}».`);
  return { project: data.project, files, thumbs };
}
