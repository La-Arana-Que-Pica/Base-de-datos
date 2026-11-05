// Decodificador PNG exacto. El canvas del navegador premultiplica el alfa: en los kits el alfa es una máscara de brillo
// (casi siempre 0), así que con canvas el RGB se perdería. Acá se leen los bytes tal cual, sin gestión de color.
import { inflate } from './inflate.js';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

export function isPng(bytes) {
  return bytes.length > 8 && SIGNATURE.every((v, i) => bytes[i] === v);
}

function u32(b, p) { return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; }

export function readPngHeader(bytes) {
  if (!isPng(bytes)) throw new Error('No es un PNG válido.');
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw new Error('PNG dañado: falta la cabecera IHDR.');
  return { width: u32(bytes, 16), height: u32(bytes, 20), bitDepth: bytes[24], colorType: bytes[25], interlace: bytes[28] };
}

/**
 * @returns {Promise<{width:number,height:number,data:Uint8Array,hasAlpha:boolean}>} RGBA de 8 bits.
 * 16 bits → byte alto (igual que Pillow).
 */
export async function decodePng(bytes, { maxPixels = Infinity } = {}) {
  const head = readPngHeader(bytes);
  const { width, height, bitDepth, colorType, interlace } = head;
  if (!width || !height) throw new Error('PNG con tamaño 0.');
  if (width * height > maxPixels) throw new RangeError(`La imagen es demasiado grande (${width} × ${height}).`);
  if (!(colorType in CHANNELS) || ![1, 2, 4, 8, 16].includes(bitDepth)) throw new Error('Variante de PNG no compatible.');
  let palette = null, trns = null;
  const idat = [];
  let p = 8, idatSize = 0;
  while (p + 8 <= bytes.length) {
    const len = u32(bytes, p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const data = bytes.subarray(p + 8, p + 8 + len);
    if (data.length < len) throw new Error('PNG incompleto o dañado.');
    if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') { idat.push(data); idatSize += len; }
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!idat.length) throw new Error('PNG sin datos de imagen.');
  if (colorType === 3 && !palette) throw new Error('PNG con paleta dañada.');
  const joined = new Uint8Array(idatSize);
  let q = 0;
  for (const c of idat) { joined.set(c, q); q += c.length; }

  const channels = CHANNELS[colorType];
  const bitsPP = channels * bitDepth;
  const bpp = Math.max(1, bitsPP >> 3);
  const passes = interlace ? ADAM7.map(([x0, y0, dx, dy]) => ({ x0, y0, dx, dy, w: Math.ceil((width - x0) / dx), h: Math.ceil((height - y0) / dy) }))
    .filter(s => s.w > 0 && s.h > 0) : [{ x0: 0, y0: 0, dx: 1, dy: 1, w: width, h: height }];
  const expected = passes.reduce((n, s) => n + s.h * (1 + Math.ceil(s.w * bitsPP / 8)), 0);
  const raw = await inflate(joined, 'deflate', expected + 65536);
  if (raw.length < expected) throw new Error('PNG incompleto: faltan datos de imagen.');

  const out = new Uint8Array(width * height * 4);
  const hasAlpha = colorType === 4 || colorType === 6 || !!trns;
  let off = 0;
  for (const s of passes) {
    const stride = Math.ceil(s.w * bitsPP / 8);
    let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
    for (let y = 0; y < s.h; y++) {
      const filter = raw[off];
      const line = raw.subarray(off + 1, off + 1 + stride);
      off += 1 + stride;
      unfilter(filter, line, prev, cur, bpp);
      writeRow(cur, s, y, width, out, colorType, bitDepth, palette, trns);
      const t = prev; prev = cur; cur = t;
    }
  }
  return { width, height, data: out, hasAlpha };
}

function unfilter(filter, line, prev, cur, bpp) {
  const n = line.length;
  switch (filter) {
    case 0: cur.set(line); break;
    case 1: for (let i = 0; i < n; i++) cur[i] = (line[i] + (i >= bpp ? cur[i - bpp] : 0)) & 255; break;
    case 2: for (let i = 0; i < n; i++) cur[i] = (line[i] + prev[i]) & 255; break;
    case 3: for (let i = 0; i < n; i++) cur[i] = (line[i] + (((i >= bpp ? cur[i - bpp] : 0) + prev[i]) >> 1)) & 255; break;
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        cur[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      break;
    default: throw new Error('PNG dañado: filtro desconocido.');
  }
}

function writeRow(row, s, y, width, out, colorType, depth, palette, trns) {
  const oy = s.y0 + y * s.dy;
  const sample = depth < 8 ? (i => (row[(i * depth) >> 3] >> (8 - depth - ((i * depth) & 7))) & ((1 << depth) - 1)) : null;
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  const step = depth === 16 ? 2 : 1;
  for (let x = 0; x < s.w; x++) {
    const o = ((oy * width) + s.x0 + x * s.dx) * 4;
    let r, g, b, a = 255;
    if (colorType === 3) {
      const idx = depth < 8 ? sample(x) : row[x];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    } else if (colorType === 0) {
      let v, raw;
      if (depth < 8) { raw = sample(x); v = Math.round(raw * scale); } else { raw = depth === 16 ? (row[x * 2] << 8) | row[x * 2 + 1] : row[x]; v = row[x * step]; }
      r = g = b = v;
      if (trns && raw === ((trns[0] << 8) | trns[1])) a = 0;
    } else {
      const ch = colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
      const base = x * ch * step;
      if (colorType === 4) { r = g = b = row[base]; a = row[base + step]; }
      else {
        r = row[base]; g = row[base + step]; b = row[base + 2 * step];
        if (colorType === 6) a = row[base + 3 * step];
        else if (trns && trns.length >= 6) {
          const full = depth === 16
            ? [(row[base] << 8) | row[base + 1], (row[base + 2] << 8) | row[base + 3], (row[base + 4] << 8) | row[base + 5]]
            : [row[base], row[base + 1], row[base + 2]];
          if (full[0] === ((trns[0] << 8) | trns[1]) && full[1] === ((trns[2] << 8) | trns[3]) && full[2] === ((trns[4] << 8) | trns[5])) a = 0;
        }
      }
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }
}
