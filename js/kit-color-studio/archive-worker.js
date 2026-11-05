// Worker de archivos comprimidos: lista y extrae solo las imágenes compatibles de un ZIP o un RAR, con límites de tamaño.
// Las rutas se devuelven tal cual (la limpieza de segmentos inseguros la hace la importación).
import { openZip, ZipError } from './zip.js';
import { IMAGE_EXT, ARCHIVE_EXT, extension } from './library.js';

const post = (id, type, extra = {}, transfer = []) => self.postMessage({ id, type, ...extra }, transfer);

function isImage(name) { return IMAGE_EXT.includes(extension(name)); }
function unsafe(name) { const raw = name.replace(/\\/g, '/'); return raw.startsWith('/') || /^[a-z]:/i.test(raw) || raw.split('/').some(s => s === '..'); }

async function extractZip(id, file, limits) {
  const entries = await openZip(file);
  post(id, 'list', { paths: entries.filter(e => !e.directory && isImage(e.name)).map(e => e.name) });
  let total = 0, images = 0;
  for (const e of entries) {
    if (e.directory) continue;
    if (!isImage(e.name)) { if (ARCHIVE_EXT.includes(extension(e.name))) post(id, 'skip', { path: e.name, reason: 'es un archivo comprimido dentro de otro (extraelo e importalo aparte)' }); continue; }
    if (e.encrypted) { post(id, 'skip', { path: e.name, reason: 'está protegido con contraseña' }); continue; }
    if (e.size > limits.maxEntry) { post(id, 'skip', { path: e.name, reason: 'supera el tamaño máximo por imagen' }); continue; }
    if (total + e.size > limits.maxTotal) { post(id, 'limit', { reason: 'Se alcanzó el límite de datos descomprimidos de una importación.' }); break; }
    try {
      const data = await e.read(limits.maxEntry);
      total += data.length; images++;
      post(id, 'entry', { path: e.name, unsafe: unsafe(e.name), data: new Blob([data]) });
    } catch (err) {
      post(id, 'skip', { path: e.name, reason: err instanceof ZipError ? err.message : 'no se pudo extraer' });
    }
  }
  return images;
}

const RAR_ERRORS = {
  ERAR_MISSING_PASSWORD: 'El RAR está protegido con contraseña. Extraelo con WinRAR o 7-Zip e importá las imágenes.',
  ERAR_BAD_PASSWORD: 'El RAR está protegido con contraseña.',
  ERAR_BAD_DATA: 'El RAR está dañado o incompleto.',
  ERAR_BAD_ARCHIVE: 'El archivo no es un RAR válido.',
  ERAR_UNKNOWN_FORMAT: 'Formato de RAR desconocido.',
  ERAR_NO_MEMORY: 'No hay memoria suficiente para abrir este RAR.',
  ERAR_EOPEN: 'El RAR es parte de un archivo dividido en volúmenes: uní las partes o extraelo con WinRAR.',
};

async function extractRar(id, file, limits) {
  const base = new URL('../vendor/node-unrar-js/', import.meta.url);
  const [{ createExtractorFromData }, wasm] = await Promise.all([
    import(new URL('index.js', base).href),
    fetch(new URL('js/unrar.wasm', base)).then(r => { if (!r.ok) throw new Error('No se pudo cargar el lector de RAR.'); return r.arrayBuffer(); }),
  ]);
  const data = await file.arrayBuffer();
  let total = 0, images = 0;
  try {
    const extractor = await createExtractorFromData({ wasmBinary: wasm, data });
    const headers = [...extractor.getFileList().fileHeaders];
    const wanted = new Set();
    for (const h of headers) {
      if (h.flags.directory) continue;
      if (!isImage(h.name)) { if (ARCHIVE_EXT.includes(extension(h.name))) post(id, 'skip', { path: h.name, reason: 'es un archivo comprimido dentro de otro (extraelo e importalo aparte)' }); continue; }
      if (h.flags.encrypted) { post(id, 'skip', { path: h.name, reason: 'está protegido con contraseña' }); continue; }
      if (h.unpSize > limits.maxEntry) { post(id, 'skip', { path: h.name, reason: 'supera el tamaño máximo por imagen' }); continue; }
      if (total + h.unpSize > limits.maxTotal) { post(id, 'limit', { reason: 'Se alcanzó el límite de datos descomprimidos de una importación.' }); break; }
      total += h.unpSize; wanted.add(h.name);
    }
    post(id, 'list', { paths: [...wanted] });
    if (!wanted.size) return 0;
    const { files } = extractor.extract({ files: h => wanted.has(h.name) });
    for (const f of files) {
      const bytes = f.extraction;
      if (!bytes) continue;
      images++;
      post(id, 'entry', { path: f.fileHeader.name, unsafe: unsafe(f.fileHeader.name), data: new Blob([bytes]) });
    }
  } catch (e) {
    const msg = RAR_ERRORS[e?.reason] || (e?.message ? 'No se pudo leer el RAR: ' + e.message : 'No se pudo leer el RAR.');
    if (images) post(id, 'limit', { reason: msg + ' Se importó lo que se pudo leer antes del error.' });
    else throw new Error(msg);
  }
  return images;
}

self.onmessage = async ({ data: msg }) => {
  try {
    const images = msg.kind === 'rar' ? await extractRar(msg.id, msg.file, msg.limits) : await extractZip(msg.id, msg.file, msg.limits);
    post(msg.id, 'done', { images });
  } catch (e) {
    post(msg.id, 'error', { error: e instanceof ZipError ? e.message : e?.message || String(e) });
  }
};
