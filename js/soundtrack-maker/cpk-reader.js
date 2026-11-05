// Lector de CPK en el navegador o en Node. Lee por rangos: un CPK de varios GB no se carga en memoria.
// Tablas @UTF opcionalmente cifradas (XOR de CRI) y archivos opcionalmente comprimidos (CRILAYLA).

import { readUtf } from './utf.js';

const bytesAt = async (blob, start, size) => new Uint8Array(await blob.slice(start, start + size).arrayBuffer());
const num = v => (typeof v === 'bigint' ? Number(v) : v);
const ascii = b => String.fromCharCode(...b);

function decipher(b) {
  const out = new Uint8Array(b.length);
  let m = 0x655f;
  for (let i = 0; i < b.length; i++) {
    out[i] = b[i] ^ (m & 0xff);
    m = Math.imul(m, 0x4115) >>> 0;
  }
  return out;
}
const isUtf = b => b[0] === 0x40 && b[1] === 0x55 && b[2] === 0x54 && b[3] === 0x46;
const parseTable = b => readUtf(isUtf(b) ? b : decipher(b));

/** Filas de una tabla con los valores constantes incluidos. */
export function rowsOf(table) {
  const constants = table.columns.filter(c => c.storage === 0x30);
  return table.rows.map(row => {
    const full = { ...row };
    for (const c of constants) full[c.name] = c.value;
    return full;
  });
}

async function packetTable(blob, offset, magic) {
  const head = await bytesAt(blob, offset, 16);
  if (ascii(head.subarray(0, 4)) !== magic) throw new Error(`Falta el bloque ${magic.trim()} del CPK.`);
  const size = num(new DataView(head.buffer, head.byteOffset, 16).getBigUint64(8, true));
  return parseTable(await bytesAt(blob, offset + 16, size));
}

/** Índice de archivos: [{ path, size, extractSize, offset }]. */
export async function readCpkIndex(blob) {
  if (blob.size < 0x800 || ascii(await bytesAt(blob, 0, 4)) !== 'CPK ') throw new Error('El archivo no es un CPK.');
  const header = rowsOf(await packetTable(blob, 0, 'CPK '))[0];
  const tocOffset = num(header.TocOffset ?? 0);
  if (!tocOffset) throw new Error('Este CPK no tiene índice por nombre de archivo (TOC).');
  const contentOffset = header.ContentOffset === undefined ? tocOffset : num(header.ContentOffset);
  const base = Math.min(tocOffset, contentOffset);
  return rowsOf(await packetTable(blob, tocOffset, 'TOC ')).map(r => {
    const dir = (r.DirName && r.DirName !== '<NULL>' ? r.DirName : '').replace(/\\/g, '/');
    const size = num(r.FileSize);
    return { path: (dir ? dir + '/' : '') + r.FileName, size, extractSize: num(r.ExtractSize ?? size), offset: base + num(r.FileOffset) };
  });
}

/** Descompresor CRILAYLA: flujo de bits leído hacia atrás; los primeros 0x100 bytes del archivo van al final, sin comprimir. */
export function decompressCrilayla(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (ascii(data.subarray(0, 8)) !== 'CRILAYLA') throw new Error('No es CRILAYLA.');
  const usize = view.getUint32(8, true), hoff = view.getUint32(12, true);
  const out = new Uint8Array(usize + 0x100);
  out.set(data.subarray(hoff + 0x10, hoff + 0x110), 0);
  let pos = data.length - 0x100 - 1, left = 0, reserve = 0;
  const read = n => {
    let v = 0;
    while (n) {
      if (left === 0) { reserve = data[pos--]; left = 8; }
      const t = Math.min(n, left);
      v = (v << t) | ((reserve >> (left - t)) & ((1 << t) - 1));
      left -= t;
      n -= t;
    }
    return v;
  };
  const LEVELS = [2, 3, 5, 8];
  let w = 0x100 + usize - 1, written = 0;
  while (written < usize) {
    if (read(1)) {
      const off = read(13) + 3;
      let len = 3;
      for (let k = 0; ; k++) {
        const nb = LEVELS[Math.min(k, 3)];
        const v = read(nb);
        len += v;
        if (v !== (1 << nb) - 1) break;
      }
      for (let i = 0; i < len; i++) { out[w] = out[w + off]; w--; written++; }
    } else {
      out[w--] = read(8);
      written++;
    }
  }
  return out;
}

/** Contenido de una entrada como Blob (un rango del original, o los datos descomprimidos). */
export async function entryBlob(blob, entry) {
  if (entry.extractSize === entry.size) return blob.slice(entry.offset, entry.offset + entry.size);
  const plain = decompressCrilayla(await bytesAt(blob, entry.offset, entry.size));
  if (plain.length !== entry.extractSize) throw new Error(`Descompresión inesperada en ${entry.path}.`);
  return new Blob([plain]);
}
