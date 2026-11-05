// Decodificadores BCn (BC1, BC2, BC3, BC4, BC5, BC7) a RGBA de 8 bits.
// BC1–BC5 replican la aritmética entera de Pillow (BcnDecode.c) para que los colores coincidan con el conversor Python.

export const BLOCK_BYTES = { bc1: 8, bc2: 16, bc3: 16, bc4: 8, bc5: 16, bc7: 16 };

export function blockDataSize(format, width, height) {
  return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * BLOCK_BYTES[format];
}

export function decodeBlocks(format, src, width, height) {
  const need = blockDataSize(format, width, height);
  if (src.length < need) throw new Error(`Datos de textura incompletos (${src.length} de ${need} bytes).`);
  const out = new Uint8Array(width * height * 4);
  const block = new Uint8Array(64);
  const bw = Math.ceil(width / 4), bh = Math.ceil(height / 4), size = BLOCK_BYTES[format];
  const fn = { bc1: bc1Block, bc2: bc2Block, bc3: bc3Block, bc4: bc4Block, bc5: bc5Block, bc7: bc7Block }[format];
  let p = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++, p += size) {
      fn(src, p, block);
      for (let y = 0; y < 4; y++) {
        const py = by * 4 + y;
        if (py >= height) break;
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          if (px >= width) break;
          const o = (py * width + px) * 4, i = (y * 4 + x) * 4;
          out[o] = block[i]; out[o + 1] = block[i + 1]; out[o + 2] = block[i + 2]; out[o + 3] = block[i + 3];
        }
      }
    }
  }
  return out;
}

function expand565(c, pal, i) {
  let r = (c & 0xf800) >> 8; r |= r >> 5;
  let g = (c & 0x7e0) >> 3; g |= g >> 6;
  let b = (c & 0x1f) << 3; b |= b >> 5;
  pal[i] = r; pal[i + 1] = g; pal[i + 2] = b; pal[i + 3] = 255;
}

const pal = new Uint8Array(16);
function colorBlock(src, p, out, separateAlpha) {
  const c0 = src[p] | (src[p + 1] << 8), c1 = src[p + 2] | (src[p + 3] << 8);
  expand565(c0, pal, 0); expand565(c1, pal, 4);
  if (c0 > c1 || separateAlpha) {
    for (let k = 0; k < 3; k++) {
      pal[8 + k] = ((2 * pal[k] + pal[4 + k]) / 3) | 0;
      pal[12 + k] = ((pal[k] + 2 * pal[4 + k]) / 3) | 0;
    }
    pal[11] = 255; pal[15] = 255;
  } else {
    for (let k = 0; k < 3; k++) { pal[8 + k] = ((pal[k] + pal[4 + k]) / 2) | 0; pal[12 + k] = 0; }
    pal[11] = 255; pal[15] = 0;
  }
  const bits = (src[p + 4] | (src[p + 5] << 8) | (src[p + 6] << 16) | (src[p + 7] << 24)) >>> 0;
  for (let i = 0; i < 16; i++) {
    const idx = ((bits >>> (2 * i)) & 3) * 4;
    out[i * 4] = pal[idx]; out[i * 4 + 1] = pal[idx + 1]; out[i * 4 + 2] = pal[idx + 2]; out[i * 4 + 3] = pal[idx + 3];
  }
}

const apal = new Uint8Array(8);
function alphaBlock(src, p, out, channel) {
  const a0 = src[p], a1 = src[p + 1];
  apal[0] = a0; apal[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) apal[i + 1] = (((7 - i) * a0 + i * a1) / 7) | 0;
  } else {
    for (let i = 1; i <= 4; i++) apal[i + 1] = (((5 - i) * a0 + i * a1) / 5) | 0;
    apal[6] = 0; apal[7] = 255;
  }
  // 48 bits de índices (3 por píxel), en dos mitades de 24 bits
  const lo = src[p + 2] | (src[p + 3] << 8) | (src[p + 4] << 16);
  const hi = src[p + 5] | (src[p + 6] << 8) | (src[p + 7] << 16);
  for (let i = 0; i < 16; i++) {
    const idx = i < 8 ? (lo >> (3 * i)) & 7 : (hi >> (3 * (i - 8))) & 7;
    out[i * 4 + channel] = apal[idx];
  }
}

function bc1Block(src, p, out) { colorBlock(src, p, out, false); }
function bc2Block(src, p, out) {
  colorBlock(src, p + 8, out, true);
  for (let i = 0; i < 16; i++) {
    const a = (src[p + (i >> 1)] >> ((i & 1) * 4)) & 0xf;
    out[i * 4 + 3] = a | (a << 4);
  }
}
function bc3Block(src, p, out) { colorBlock(src, p + 8, out, true); alphaBlock(src, p, out, 3); }
function bc4Block(src, p, out) {
  alphaBlock(src, p, out, 0);
  for (let i = 0; i < 16; i++) { out[i * 4 + 1] = out[i * 4 + 2] = out[i * 4]; out[i * 4 + 3] = 255; }
}
function bc5Block(src, p, out) {
  alphaBlock(src, p, out, 0); alphaBlock(src, p + 8, out, 1);
  for (let i = 0; i < 16; i++) { out[i * 4 + 2] = 0; out[i * 4 + 3] = 255; }
}

// ---------------- BC7 ----------------
// [subsets, bits de partición, bits de rotación, bit de selección, bits color, bits alfa, P-bit por extremo, P-bit compartido, bits índice, bits índice 2]
const BC7_MODES = [
  [3, 4, 0, 0, 4, 0, 1, 0, 3, 0], [2, 6, 0, 0, 6, 0, 0, 1, 3, 0], [3, 6, 0, 0, 5, 0, 0, 0, 2, 0], [2, 6, 0, 0, 7, 0, 1, 0, 2, 0],
  [1, 0, 2, 1, 5, 6, 0, 0, 2, 3], [1, 0, 2, 0, 7, 8, 0, 0, 2, 2], [1, 0, 0, 0, 7, 7, 1, 0, 4, 0], [2, 6, 0, 0, 5, 5, 1, 0, 2, 0],
];
const P2_MASKS = [
  0xCCCC, 0x8888, 0xEEEE, 0xECC8, 0xC880, 0xFEEC, 0xFEC8, 0xEC80, 0xC800, 0xFFEC, 0xFE80, 0xE800, 0xFFE8, 0xFF00, 0xFFF0, 0xF000,
  0xF710, 0x008E, 0x7100, 0x08CE, 0x008C, 0x7310, 0x3100, 0x8CCE, 0x088C, 0x3110, 0x6666, 0x366C, 0x17E8, 0x0FF0, 0x718E, 0x399C,
  0xAAAA, 0xF0F0, 0x5A5A, 0x33CC, 0x3C3C, 0x55AA, 0x9696, 0xA55A, 0x73CE, 0x13C8, 0x324C, 0x3BDC, 0x6996, 0xC33C, 0x9966, 0x0660,
  0x0272, 0x04E4, 0x4E40, 0x2720, 0xC936, 0x936C, 0x39C6, 0x639C, 0x9336, 0x9CC6, 0x817E, 0xE718, 0xCCF0, 0x0FCC, 0x7744, 0xEE22,
];
const P3 = [
  '0011001102212222', '0001001122112221', '0000200122112211', '0222002200110111', '0000000011221122', '0011001100220022', '0022002211111111', '0011001122112211',
  '0000000011112222', '0000111111112222', '0000111122222222', '0012001200120012', '0112011201120112', '0122012201220122', '0011011211221222', '0011200122002220',
  '0001001101121122', '0111001120012200', '0000112211221122', '0022002200221111', '0111011102220222', '0001000122212221', '0000001101220122', '0000110022102210',
  '0122012200110000', '0012001211222222', '0110122112210110', '0000011012211221', '0022110211020022', '0110011020022222', '0011012201220011', '0000200022112221',
  '0000000211221222', '0222002200120011', '0011001200220222', '0120012001200120', '0000111122220000', '0120120120120120', '0120201212010120', '0011220011220011',
  '0011112222000011', '0101010122222222', '0000000021212121', '0022112200221122', '0022001100220011', '0220122102201221', '0101222222220101', '0000212121212121',
  '0101010101012222', '0222011102220111', '0002111200021112', '0000211221122112', '0222011101110222', '0002111211120002', '0110011001102222', '0000000021122112',
  '0110011022222222', '0022001100110022', '0022112211220022', '0000000000002112', '0002000100020001', '0222122202221222', '0101222222222222', '0111201122012220',
].map(s => Uint8Array.from(s, Number));
const P2 = P2_MASKS.map(m => Uint8Array.from({ length: 16 }, (_, i) => (m >> i) & 1));
const ANCHOR2 = [
  15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2,
  15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15,
];
const ANCHOR3A = [
  3, 3, 15, 15, 8, 3, 15, 15, 8, 8, 6, 6, 6, 5, 3, 3, 3, 3, 8, 15, 3, 3, 6, 10, 5, 8, 8, 6, 8, 5, 15, 15,
  8, 15, 3, 5, 6, 10, 8, 15, 15, 3, 15, 5, 15, 15, 15, 15, 3, 15, 5, 5, 5, 8, 5, 10, 5, 10, 8, 13, 15, 12, 3, 3,
];
const ANCHOR3B = [
  15, 8, 8, 3, 15, 15, 3, 8, 15, 15, 15, 15, 15, 15, 15, 8, 15, 8, 15, 3, 15, 8, 15, 8, 3, 15, 6, 10, 15, 15, 10, 8,
  15, 3, 15, 10, 10, 8, 9, 10, 6, 15, 8, 15, 3, 6, 6, 8, 15, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 3, 15, 15, 8,
];
const WEIGHTS = { 2: [0, 21, 43, 64], 3: [0, 9, 18, 27, 37, 46, 55, 64], 4: [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64] };
export const BC7_TABLES = { P2, P3, ANCHOR2, ANCHOR3A, ANCHOR3B };

let bsrc, bbase, bpos;
function bits(n) {
  let v = 0;
  for (let i = 0; i < n; i++, bpos++) v |= ((bsrc[bbase + (bpos >> 3)] >> (bpos & 7)) & 1) << i;
  return v;
}
function unq(v, n) { return n >= 8 ? v : (v << (8 - n)) | (v >> (2 * n - 8)); }
function interp(e0, e1, w) { return ((64 - w) * e0 + w * e1 + 32) >> 6; }

const ep = new Uint8Array(6 * 4); // [subset*2+extremo][rgba]
const idx1 = new Uint8Array(16), idx2 = new Uint8Array(16);
function bc7Block(src, p, out) {
  let mode = 0;
  while (mode < 8 && !(src[p] & (1 << mode))) mode++;
  if (mode === 8) { out.fill(0); return; }
  bsrc = src; bbase = p; bpos = mode + 1;
  const [ns, pb, rb, isb, cb, ab, epb, spb, ib, ib2] = BC7_MODES[mode];
  const partition = bits(pb), rotation = bits(rb), indexSel = bits(isb);
  for (let c = 0; c < 3; c++) for (let e = 0; e < ns * 2; e++) ep[e * 4 + c] = bits(cb);
  for (let e = 0; e < ns * 2; e++) ep[e * 4 + 3] = ab ? bits(ab) : 255;
  let cbits = cb, abits = ab;
  if (epb) {
    for (let e = 0; e < ns * 2; e++) {
      const pbit = bits(1);
      for (let c = 0; c < 3; c++) ep[e * 4 + c] = (ep[e * 4 + c] << 1) | pbit;
      if (ab) ep[e * 4 + 3] = (ep[e * 4 + 3] << 1) | pbit;
    }
    cbits++; if (ab) abits++;
  } else if (spb) {
    for (let s = 0; s < ns; s++) {
      const pbit = bits(1);
      for (let e = s * 2; e < s * 2 + 2; e++) for (let c = 0; c < 3; c++) ep[e * 4 + c] = (ep[e * 4 + c] << 1) | pbit;
    }
    cbits++;
  }
  for (let e = 0; e < ns * 2; e++) {
    for (let c = 0; c < 3; c++) ep[e * 4 + c] = unq(ep[e * 4 + c], cbits);
    if (ab) ep[e * 4 + 3] = unq(ep[e * 4 + 3], abits);
  }
  const part = ns === 2 ? P2[partition] : ns === 3 ? P3[partition] : null;
  const isAnchor = i => i === 0 || (ns === 2 && i === ANCHOR2[partition]) || (ns === 3 && (i === ANCHOR3A[partition] || i === ANCHOR3B[partition]));
  for (let i = 0; i < 16; i++) idx1[i] = bits(isAnchor(i) ? ib - 1 : ib);
  if (ib2) for (let i = 0; i < 16; i++) idx2[i] = bits(i === 0 ? ib2 - 1 : ib2);
  const cw = WEIGHTS[ib2 && indexSel ? ib2 : ib], aw = WEIGHTS[ib2 ? (indexSel ? ib : ib2) : ib];
  for (let i = 0; i < 16; i++) {
    const s = part ? part[i] : 0, e0 = s * 8, e1 = s * 8 + 4;
    const ci = ib2 && indexSel ? idx2[i] : idx1[i];
    const ai = ib2 ? (indexSel ? idx1[i] : idx2[i]) : idx1[i];
    let r = interp(ep[e0], ep[e1], cw[ci]), g = interp(ep[e0 + 1], ep[e1 + 1], cw[ci]), b = interp(ep[e0 + 2], ep[e1 + 2], cw[ci]);
    let a = interp(ep[e0 + 3], ep[e1 + 3], aw[ai]);
    if (rotation === 1) [a, r] = [r, a]; else if (rotation === 2) [a, g] = [g, a]; else if (rotation === 3) [a, b] = [b, a];
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
}
