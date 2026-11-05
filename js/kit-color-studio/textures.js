// Lectura de texturas DDS y FTEX (Fox Engine 2.03, PES 2018/2021). Solo el mip 0: es lo que analiza el conversor.
import { blockDataSize, decodeBlocks } from './bcn.js';
import { inflate } from './inflate.js';

export class UnsupportedTextureError extends Error {}

const FOURCC = { DXT1: 'bc1', DXT2: 'bc2', DXT3: 'bc2', DXT4: 'bc3', DXT5: 'bc3', ATI1: 'bc4', BC4U: 'bc4', ATI2: 'bc5', BC5U: 'bc5' };
const DXGI = { 71: 'bc1', 72: 'bc1', 74: 'bc2', 75: 'bc2', 77: 'bc3', 78: 'bc3', 80: 'bc4', 81: 'bc4', 83: 'bc5', 84: 'bc5', 98: 'bc7', 99: 'bc7',
  28: 'rgba8', 29: 'rgba8', 87: 'bgra8', 91: 'bgra8', 88: 'bgrx8', 92: 'bgrx8', 61: 'l8' };
const DXGI_NAMES = { 94: 'BC6H', 95: 'BC6H', 96: 'BC6H', 10: 'RGBA16F', 2: 'RGBA32F' };
// Formatos FTEX (lector de Conversor_Caras): 0 RGBA8, 1 L8, 2 BC1, 3 BC2, 4 BC3, 8 BC4, 9 BC5, 10 BC6H, 11 BC7
const FTEX_FORMATS = { 0: 'rgba8', 1: 'l8', 2: 'bc1', 3: 'bc2', 4: 'bc3', 8: 'bc4', 9: 'bc5', 11: 'bc7' };
const LABEL = { bc1: 'BC1 (DXT1)', bc2: 'BC2 (DXT3)', bc3: 'BC3 (DXT5)', bc4: 'BC4', bc5: 'BC5', bc7: 'BC7', rgba8: 'RGBA 8 bits', bgra8: 'BGRA 8 bits', bgrx8: 'BGRX 8 bits', l8: 'L8', rgb24: 'RGB 24 bits', mask32: 'RGBA 32 bits' };

export function formatLabel(f) { return LABEL[f] || f; }

function checkSize(width, height, maxPixels) {
  if (!width || !height) throw new Error('Textura con tamaño 0.');
  if (width * height > maxPixels) throw new RangeError(`La textura es demasiado grande (${width} × ${height}).`);
}

function rawToRgba(format, src, width, height, masks) {
  const n = width * height, out = new Uint8Array(n * 4);
  const bpp = { rgba8: 4, bgra8: 4, bgrx8: 4, l8: 1, rgb24: 3, mask32: 4 }[format];
  if (src.length < n * bpp) throw new Error('Datos de textura incompletos.');
  for (let i = 0; i < n; i++) {
    const s = i * bpp, o = i * 4;
    if (format === 'rgba8') { out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3]; }
    else if (format === 'bgra8' || format === 'bgrx8') { out[o] = src[s + 2]; out[o + 1] = src[s + 1]; out[o + 2] = src[s]; out[o + 3] = format === 'bgrx8' ? 255 : src[s + 3]; }
    else if (format === 'l8') { out[o] = out[o + 1] = out[o + 2] = src[s]; out[o + 3] = 255; }
    else {
      const v = format === 'rgb24' ? src[s] | (src[s + 1] << 8) | (src[s + 2] << 16) : (src[s] | (src[s + 1] << 8) | (src[s + 2] << 16) | (src[s + 3] << 24)) >>> 0;
      for (let c = 0; c < 4; c++) out[o + c] = masks[c] ? extract(v, masks[c]) : 255;
    }
  }
  return out;
}

function extract(v, mask) {
  let shift = 0;
  while (!((mask >>> shift) & 1)) shift++;
  const max = mask >>> shift, x = (v & mask) >>> shift;
  return max === 255 ? x : Math.round(x * 255 / max);
}

export function decodeTexture(format, data, width, height) {
  if (format.startsWith('bc')) return decodeBlocks(format, data, width, height);
  return rawToRgba(format, data, width, height);
}

export function isDds(b) { return b.length >= 128 && b[0] === 0x44 && b[1] === 0x44 && b[2] === 0x53 && b[3] === 0x20; }
export function isFtex(b) { return b.length >= 64 && b[0] === 0x46 && b[1] === 0x54 && b[2] === 0x45 && b[3] === 0x58; }

export function decodeDds(bytes, { maxPixels = Infinity } = {}) {
  if (!isDds(bytes)) throw new Error('No es un archivo DDS.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const height = v.getUint32(12, true), width = v.getUint32(16, true);
  const pfFlags = v.getUint32(80, true);
  const fourCC = String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]);
  let format, offset = 128, masks = null, name = fourCC;
  if (pfFlags & 0x4) {
    if (fourCC === 'DX10') {
      const dxgi = v.getUint32(128, true);
      offset = 148;
      format = DXGI[dxgi];
      if (!format) throw new UnsupportedTextureError(`DDS en formato ${DXGI_NAMES[dxgi] || 'DXGI ' + dxgi}, que no se puede analizar.`);
    } else {
      format = FOURCC[fourCC];
      if (!format) throw new UnsupportedTextureError(`DDS con compresión «${fourCC.replace(/\0/g, '')}», que no se puede analizar.`);
    }
  } else {
    const bitCount = v.getUint32(88, true);
    masks = [v.getUint32(92, true), v.getUint32(96, true), v.getUint32(100, true), (pfFlags & 0x1) ? v.getUint32(104, true) : 0];
    if (pfFlags & 0x20000 && bitCount === 8) format = 'l8';
    else if (pfFlags & 0x40 && bitCount === 32) format = 'mask32';
    else if (pfFlags & 0x40 && bitCount === 24) format = 'rgb24';
    else throw new UnsupportedTextureError(`DDS sin comprimir de ${bitCount} bits, que no se puede analizar.`);
    name = format;
  }
  checkSize(width, height, maxPixels);
  const data = bytes.subarray(offset);
  const rgba = format.startsWith('bc') ? decodeBlocks(format, data, width, height) : rawToRgba(format, data, width, height, masks);
  return { width, height, data: rgba, hasAlpha: true, format, formatName: formatLabel(format) || name };
}

export async function decodeFtex(bytes, { maxPixels = Infinity } = {}) {
  if (!isFtex(bytes)) throw new Error('No es un archivo FTEX.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fmt = v.getUint16(8, true), width = v.getUint16(10, true), height = v.getUint16(12, true), mips = bytes[16];
  const format = FTEX_FORMATS[fmt];
  if (!format) throw new UnsupportedTextureError(`FTEX en formato ${fmt === 10 ? 'BC6H' : 'n.º ' + fmt}, que no se puede analizar.`);
  if (!mips) throw new Error('FTEX sin datos de imagen (sin mips).');
  checkSize(width, height, maxPixels);
  const mipOffset = v.getUint32(0x40, true), mipSize = v.getUint32(0x44, true), chunks = v.getUint16(0x4E, true);
  const expected = format.startsWith('bc') ? blockDataSize(format, width, height) : width * height * (format === 'l8' ? 1 : 4);
  if (mipSize !== expected) throw new Error(`FTEX dañado: el mip principal mide ${mipSize} bytes y se esperaban ${expected}.`);
  if (mipOffset + chunks * 8 > bytes.length) throw new Error('FTEX incompleto.');
  const out = new Uint8Array(mipSize);
  let p = 0;
  for (let j = 0; j < chunks; j++) {
    const t = mipOffset + 8 * j;
    const comp = v.getUint16(t, true), unc = v.getUint16(t + 2, true) || 0x10000, rel = v.getUint32(t + 4, true);
    const raw = (rel & 0x80000000) !== 0, start = mipOffset + (rel & 0x7fffffff);
    const seg = bytes.subarray(start, start + comp);
    if (seg.length < comp) throw new Error('FTEX incompleto.');
    // Igual que el lector Python: sin comprimir si tiene el bit 31 o si el tamaño guardado coincide con el real.
    const dd = raw || comp === unc ? seg : await inflate(seg, 'deflate', unc);
    if (p + dd.length > out.length) throw new Error('FTEX dañado: el mip principal excede su tamaño.');
    out.set(dd, p); p += dd.length;
  }
  if (p !== mipSize) throw new Error('FTEX dañado: faltan datos del mip principal.');
  const rgba = decodeTexture(format, out, width, height);
  return { width, height, data: rgba, hasAlpha: true, format, formatName: formatLabel(format) };
}
