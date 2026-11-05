// ZIP: lectura por partes de un Blob/File (no carga el archivo entero en memoria) con STORE y DEFLATE nativo,
// y escritura STORE como lista de partes de Blob (el proyecto se arma sin copiar las imágenes en memoria).
import { crc32 } from '../miniface-studio/zip.js';
import { inflate } from './inflate.js';

export { crc32 };
export class ZipError extends Error {}

// CP437 (nombres de ZIP sin la marca UTF-8, típico de Windows)
const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
function decodeName(bytes, utf8) {
  if (utf8) return new TextDecoder().decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* no es UTF-8 */ }
  let s = '';
  for (const b of bytes) s += b < 128 ? String.fromCharCode(b) : CP437[b - 128];
  return s;
}

async function readRange(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** Lista las entradas de un ZIP. Cada entrada tiene read() → Uint8Array (verificado con CRC). */
export async function openZip(blob, { maxEntries = 100000 } = {}) {
  const size = blob.size;
  if (size < 22) throw new ZipError('El archivo no es un ZIP válido.');
  const tailStart = Math.max(0, size - 65557);
  const tail = await readRange(blob, tailStart, size);
  const tv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ZipError('El archivo no es un ZIP válido o está incompleto.');
  let count = tv.getUint16(eocd + 10, true), cdSize = tv.getUint32(eocd + 12, true), cdOffset = tv.getUint32(eocd + 16, true);
  if (eocd >= 20 && tv.getUint32(eocd - 20, true) === 0x07064b50) {           // ZIP64
    const z64 = Number(tv.getBigUint64(eocd - 12, true));
    const rec = await readRange(blob, z64, z64 + 56), rv = new DataView(rec.buffer);
    if (rv.getUint32(0, true) !== 0x06064b50) throw new ZipError('ZIP64 dañado.');
    count = Number(rv.getBigUint64(32, true)); cdSize = Number(rv.getBigUint64(40, true)); cdOffset = Number(rv.getBigUint64(48, true));
  }
  if (count > maxEntries) throw new ZipError(`El ZIP tiene demasiados archivos (${count}).`);
  if (cdOffset + cdSize > size || cdSize > 256 * 1024 * 1024) throw new ZipError('El directorio del ZIP está dañado.');
  const cd = await readRange(blob, cdOffset, cdOffset + cdSize), v = new DataView(cd.buffer);
  const entries = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== 0x02014b50) throw new ZipError('El directorio del ZIP está dañado.');
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
    let csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
    let local = v.getUint32(p + 42, true);
    let name = decodeName(cd.subarray(p + 46, p + 46 + nl), flags & 0x800);
    for (let e = p + 46 + nl; e + 4 <= p + 46 + nl + el;) {
      const id = v.getUint16(e, true), len = v.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (usize === 0xffffffff) { usize = Number(v.getBigUint64(q, true)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(v.getBigUint64(q, true)); q += 8; }
        if (local === 0xffffffff) { local = Number(v.getBigUint64(q, true)); }
      } else if (id === 0x7075 && len > 5) name = new TextDecoder().decode(cd.subarray(e + 9, e + 4 + len));
      e += 4 + len;
    }
    p += 46 + nl + el + cl;
    const directory = name.endsWith('/') || name.endsWith('\\');
    entries.push({
      name, size: usize, compressedSize: csize, directory, encrypted: !!(flags & 1), method,
      read: limit => readEntry(blob, { name, flags, method, crc, csize, usize, local }, limit),
    });
  }
  return entries;
}

async function readEntry(blob, e, limit = Infinity) {
  if (e.flags & 1) throw new ZipError('está protegido con contraseña');
  if (e.method !== 0 && e.method !== 8) throw new ZipError(`usa una compresión no compatible (método ${e.method})`);
  if (e.usize > limit) throw new ZipError('es demasiado grande');
  const head = await readRange(blob, e.local, e.local + 30), hv = new DataView(head.buffer);
  if (head.length < 30 || hv.getUint32(0, true) !== 0x04034b50) throw new ZipError('está dañado');
  const start = e.local + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  const raw = await readRange(blob, start, start + e.csize);
  if (raw.length < e.csize) throw new ZipError('está incompleto');
  let data;
  try { data = e.method === 0 ? raw : await inflate(raw, 'deflate-raw', e.usize); }
  catch { throw new ZipError('está dañado (no se pudo descomprimir)'); }
  if (data.length !== e.usize || crc32(data) !== e.crc) throw new ZipError('está dañado (CRC incorrecto)');
  return data;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return [time, day];
}

/** files: [{ name, data: Blob|Uint8Array, crc?: number }]. Devuelve un Blob ZIP (STORE, nombres UTF-8). */
export async function createZipBlob(files, date = new Date()) {
  const enc = new TextEncoder(), [time, day] = dosDateTime(date);
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const bytes = f.data instanceof Blob ? null : f.data;
    const size = bytes ? bytes.length : f.data.size;
    const crc = f.crc ?? crc32(bytes || new Uint8Array(await f.data.arrayBuffer()));
    if (size >= 0xffffffff || offset >= 0xffffffff) throw new ZipError('El proyecto supera 4 GB.');
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint16(10, time, true); lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
    cv.setUint16(12, time, true); cv.setUint16(14, day, true); cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); c.set(name, 46);
    parts.push(local, f.data); central.push(c);
    offset += local.length + size;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
