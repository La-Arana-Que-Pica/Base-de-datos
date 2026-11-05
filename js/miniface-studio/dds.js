// Codificador DDS BC3 (DXT5) sin dependencias. Funciona en navegador y en Node.
// Formato replicado de las minifaces originales de PES 2018 (81 archivos analizados):
// cabecera de 128 bytes, flags 0x1007, pitchOrLinearSize = tamaño de datos,
// mipMapCount = 1, pixel format FOURCC 'DXT5', caps 0x1000, alfa recta, sin mipmaps.

const DDS_MAGIC = 0x20534444; // 'DDS '
const DDSD_CAPS = 0x1, DDSD_HEIGHT = 0x2, DDSD_WIDTH = 0x4, DDSD_PIXELFORMAT = 0x1000;
const DDPF_FOURCC = 0x4;
const DDSCAPS_TEXTURE = 0x1000;
const FOURCC_DXT5 = 0x35545844; // 'DXT5'

export function bc3DataSize(width, height) {
  return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * 16;
}

export function writeDdsHeader(width, height) {
  const header = new DataView(new ArrayBuffer(128));
  const u32 = (offset, value) => header.setUint32(offset, value >>> 0, true);
  u32(0, DDS_MAGIC);
  u32(4, 124);
  u32(8, DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT);
  u32(12, height);
  u32(16, width);
  u32(20, bc3DataSize(width, height));
  u32(28, 1); // mipMapCount: solo el nivel principal, igual que los originales
  u32(76, 32);
  u32(80, DDPF_FOURCC);
  u32(84, FOURCC_DXT5);
  u32(108, DDSCAPS_TEXTURE);
  return new Uint8Array(header.buffer);
}

/**
 * Codifica RGBA (alfa recta, no premultiplicada) como archivo DDS DXT5 completo.
 * @param {Uint8ClampedArray|Uint8Array} rgba width*height*4 bytes
 */
export function encodeDdsBc3(rgba, width, height) {
  if (width % 4 || height % 4) throw new Error('Las dimensiones deben ser múltiplos de 4.');
  const prepared = bleedTransparentColors(rgba, width, height);
  const out = new Uint8Array(128 + bc3DataSize(width, height));
  out.set(writeDdsHeader(width, height), 0);
  const block = new Uint8Array(64);
  let offset = 128;
  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      for (let y = 0; y < 4; y++) {
        const src = ((by + y) * width + bx) * 4;
        block.set(prepared.subarray(src, src + 16), y * 16);
      }
      encodeAlphaBlock(block, out, offset);
      encodeColorBlock(block, out, offset + 8);
      offset += 16;
    }
  }
  return out;
}

// Los píxeles totalmente transparentes heredan el color del vecino visible más cercano.
// Así el filtrado bilineal del juego no genera halos oscuros alrededor del jugador.
function bleedTransparentColors(rgba, width, height) {
  const data = new Uint8Array(rgba);
  const known = new Uint8Array(width * height);
  let pending = 0;
  for (let i = 0; i < known.length; i++) {
    if (data[i * 4 + 3] > 0) known[i] = 1; else pending++;
  }
  if (!pending || pending === known.length) return data;
  const next = new Uint8Array(known);
  for (let pass = 0; pass < 16 && pending; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (known[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width || !known[yy * width + xx]) continue;
            const j = (yy * width + xx) * 4;
            r += data[j]; g += data[j + 1]; b += data[j + 2]; n++;
          }
        }
        if (n) {
          data[i * 4] = Math.round(r / n); data[i * 4 + 1] = Math.round(g / n); data[i * 4 + 2] = Math.round(b / n);
          next[i] = 1; pending--;
        }
      }
    }
    known.set(next);
  }
  return data;
}

// ---------- Alfa (BC4 dentro de BC3) ----------

function alphaPalette(a0, a1) {
  const p = new Array(8);
  p[0] = a0; p[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) p[i + 1] = Math.floor(((7 - i) * a0 + i * a1 + 3) / 7);
  } else {
    for (let i = 1; i < 5; i++) p[i + 1] = Math.floor(((5 - i) * a0 + i * a1 + 2) / 5);
    p[6] = 0; p[7] = 255;
  }
  return p;
}

function fitAlpha(values, a0, a1, indices) {
  const palette = alphaPalette(a0, a1);
  let error = 0;
  for (let i = 0; i < 16; i++) {
    let best = 0, bestErr = Infinity;
    for (let k = 0; k < 8; k++) {
      const d = values[i] - palette[k];
      const e = d * d;
      if (e < bestErr) { bestErr = e; best = k; }
    }
    indices[i] = best; error += bestErr;
  }
  return error;
}

function encodeAlphaBlock(block, out, offset) {
  const values = new Array(16);
  let min = 255, max = 0, innerMin = 255, innerMax = 0;
  for (let i = 0; i < 16; i++) {
    const a = block[i * 4 + 3];
    values[i] = a;
    if (a < min) min = a;
    if (a > max) max = a;
    if (a !== 0 && a !== 255) {
      if (a < innerMin) innerMin = a;
      if (a > innerMax) innerMax = a;
    }
  }
  const candidates = [];
  // Modo de 6 interpolaciones con 0 y 255 explícitos: el más usado en los originales.
  if (innerMin > innerMax) candidates.push([min === max ? min : 0, min === max ? min : 255]);
  else candidates.push([innerMin, innerMax]);
  // Modo de 8 interpolaciones.
  if (max > min) candidates.push([max, min]);
  let best = null;
  const indices = new Array(16);
  for (const [a0, a1] of candidates) {
    const error = fitAlpha(values, a0, a1, indices);
    if (!best || error < best.error) best = { a0, a1, error, indices: indices.slice() };
  }
  out[offset] = best.a0; out[offset + 1] = best.a1;
  let bits = 0n;
  for (let i = 15; i >= 0; i--) bits = (bits << 3n) | BigInt(best.indices[i]);
  for (let i = 0; i < 6; i++) out[offset + 2 + i] = Number((bits >> BigInt(i * 8)) & 0xffn);
}

// ---------- Color (BC1 en modo de 4 colores) ----------

const to565 = (r, g, b) => ((clamp8(r) * 31 + 127) / 255 << 11) | ((clamp8(g) * 63 + 127) / 255 << 5) | ((clamp8(b) * 31 + 127) / 255);
function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function expand565(c) {
  const r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}
function colorPalette(c0, c1) {
  const a = expand565(c0), b = expand565(c1);
  return [a, b,
    [(2 * a[0] + b[0]) / 3 | 0, (2 * a[1] + b[1]) / 3 | 0, (2 * a[2] + b[2]) / 3 | 0],
    [(a[0] + 2 * b[0]) / 3 | 0, (a[1] + 2 * b[1]) / 3 | 0, (a[2] + 2 * b[2]) / 3 | 0]];
}

function evaluateColors(pixels, weights, c0, c1, indices) {
  const palette = colorPalette(c0, c1);
  let error = 0;
  for (let i = 0; i < 16; i++) {
    const p = pixels[i];
    let best = 0, bestErr = Infinity;
    for (let k = 0; k < 4; k++) {
      const q = palette[k];
      const dr = p[0] - q[0], dg = p[1] - q[1], db = p[2] - q[2];
      const e = dr * dr + dg * dg + db * db;
      if (e < bestErr) { bestErr = e; best = k; }
    }
    if (indices) indices[i] = best;
    error += bestErr * weights[i];
  }
  return error;
}

function principalEndpoints(pixels, weights) {
  let sw = 0, mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < 16; i++) {
    const w = weights[i]; sw += w;
    mr += pixels[i][0] * w; mg += pixels[i][1] * w; mb += pixels[i][2] * w;
  }
  mr /= sw; mg /= sw; mb /= sw;
  let crr = 0, crg = 0, crb = 0, cgg = 0, cgb = 0, cbb = 0;
  for (let i = 0; i < 16; i++) {
    const w = weights[i];
    const r = pixels[i][0] - mr, g = pixels[i][1] - mg, b = pixels[i][2] - mb;
    crr += r * r * w; crg += r * g * w; crb += r * b * w; cgg += g * g * w; cgb += g * b * w; cbb += b * b * w;
  }
  let vr = 1, vg = 1, vb = 1;
  for (let k = 0; k < 8; k++) {
    const nr = crr * vr + crg * vg + crb * vb;
    const ng = crg * vr + cgg * vg + cgb * vb;
    const nb = crb * vr + cgb * vg + cbb * vb;
    const len = Math.hypot(nr, ng, nb);
    if (len < 1e-9) break;
    vr = nr / len; vg = ng / len; vb = nb / len;
  }
  let minT = Infinity, maxT = -Infinity;
  for (let i = 0; i < 16; i++) {
    if (!weights[i]) continue;
    const t = (pixels[i][0] - mr) * vr + (pixels[i][1] - mg) * vg + (pixels[i][2] - mb) * vb;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  return [
    [mr + vr * maxT, mg + vg * maxT, mb + vb * maxT],
    [mr + vr * minT, mg + vg * minT, mb + vb * minT],
  ];
}

// Ajuste por mínimos cuadrados de los extremos dada una asignación de índices.
function leastSquaresEndpoints(pixels, weights, indices) {
  const T = [0, 1, 1 / 3, 2 / 3];
  let aa = 0, bb = 0, ab = 0;
  const ax = [0, 0, 0], bx = [0, 0, 0];
  for (let i = 0; i < 16; i++) {
    const w = weights[i]; if (!w) continue;
    const t = T[indices[i]], s = 1 - t;
    aa += s * s * w; bb += t * t * w; ab += s * t * w;
    for (let c = 0; c < 3; c++) { ax[c] += s * pixels[i][c] * w; bx[c] += t * pixels[i][c] * w; }
  }
  const det = aa * bb - ab * ab;
  if (Math.abs(det) < 1e-9) return null;
  const A = [0, 0, 0], B = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    A[c] = (ax[c] * bb - bx[c] * ab) / det;
    B[c] = (bx[c] * aa - ax[c] * ab) / det;
  }
  return [A, B];
}

function encodeColorBlock(block, out, offset) {
  const pixels = [], weights = [];
  for (let i = 0; i < 16; i++) {
    const a = block[i * 4 + 3];
    pixels.push([block[i * 4], block[i * 4 + 1], block[i * 4 + 2]]);
    // Los transparentes casi no pesan, pero siguen contando para que su color sea coherente.
    const w = a ? 0.05 + a / 255 : 0.02;
    weights.push(w);
  }
  const indices = new Array(16);
  let best = { c0: 0, c1: 0, error: Infinity };
  const consider = (c0, c1) => {
    if (c0 === c1) return;
    const error = evaluateColors(pixels, weights, c0, c1, null);
    if (error < best.error) best = { c0, c1, error };
  };
  const pca = principalEndpoints(pixels, weights);
  consider(to565(...pca[0]), to565(...pca[1]));
  // Bloque de color único: probar extremos vecinos para aproximarlo por interpolación.
  const mean = pca[0];
  const flat = to565(...mean);
  if (best.error === Infinity) {
    const [r, g, b] = [(flat >> 11) & 31, (flat >> 5) & 63, flat & 31];
    for (const [dr, dg, db] of [[1, 1, 1], [1, 2, 1], [0, 1, 0], [1, 0, 1]]) {
      const hi = (Math.min(31, r + dr) << 11) | (Math.min(63, g + dg) << 5) | Math.min(31, b + db);
      const lo = (Math.max(0, r - dr) << 11) | (Math.max(0, g - dg) << 5) | Math.max(0, b - db);
      consider(hi, lo); consider(hi, flat); consider(flat, lo);
    }
  }
  if (best.error === Infinity) {
    writeColor(out, offset, flat, flat, new Array(16).fill(0));
    return;
  }
  for (let iter = 0; iter < 2; iter++) {
    evaluateColors(pixels, weights, best.c0, best.c1, indices);
    const ls = leastSquaresEndpoints(pixels, weights, indices);
    if (!ls) break;
    consider(to565(...ls[0]), to565(...ls[1]));
  }
  // Búsqueda local sobre los componentes 5:6:5.
  const fields = [[11, 31], [5, 63], [0, 31]];
  let improved = true;
  for (let guard = 0; improved && guard < 12; guard++) {
    improved = false;
    for (let e = 0; e < 2; e++) {
      for (const [shift, maxv] of fields) {
        for (const delta of [-1, 1]) {
          const c = e === 0 ? best.c0 : best.c1;
          const v = ((c >> shift) & maxv) + delta;
          if (v < 0 || v > maxv) continue;
          const nc = (c & ~(maxv << shift)) | (v << shift);
          const before = best.error;
          if (e === 0) consider(nc, best.c1); else consider(best.c0, nc);
          if (best.error < before) improved = true;
        }
      }
    }
  }
  evaluateColors(pixels, weights, best.c0, best.c1, indices);
  let { c0, c1 } = best;
  // Garantizar c0 > c1 (modo de 4 colores, el único válido en BC3 para todos los decodificadores).
  if (c0 < c1) {
    [c0, c1] = [c1, c0];
    for (let i = 0; i < 16; i++) indices[i] = [1, 0, 3, 2][indices[i]];
  }
  writeColor(out, offset, c0, c1, indices);
}

function writeColor(out, offset, c0, c1, indices) {
  out[offset] = c0 & 0xff; out[offset + 1] = c0 >> 8;
  out[offset + 2] = c1 & 0xff; out[offset + 3] = c1 >> 8;
  let bits = 0;
  for (let i = 15; i >= 0; i--) bits = (bits << 2) | indices[i];
  bits >>>= 0;
  out[offset + 4] = bits & 0xff; out[offset + 5] = (bits >>> 8) & 0xff;
  out[offset + 6] = (bits >>> 16) & 0xff; out[offset + 7] = (bits >>> 24) & 0xff;
}

/** Lee la cabecera de un DDS (usado por pruebas y validaciones). */
export function readDdsHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== DDS_MAGIC) throw new Error('No es un archivo DDS.');
  return {
    flags: view.getUint32(8, true), height: view.getUint32(12, true), width: view.getUint32(16, true),
    linearSize: view.getUint32(20, true), mipMapCount: view.getUint32(28, true),
    pfFlags: view.getUint32(80, true), fourCC: String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]),
    caps: view.getUint32(108, true),
  };
}
