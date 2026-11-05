// Detección de colores del kit: port de Conversor_Kits/herramientas/conversor_kits/colores_menu.py (colores_kit, versión
// 2026-10-26, calibrada con 500 kits oficiales: principal 95 %, pantalón 99,8 %, medias 98 %).
// Piezas = siluetas UV exactas del juego (máscaras de herramientas/mascaras_piezas.py); tonos parecidos agrupados.

export const PIECES = ['camiseta_completa', 'pantalon', 'medias'];
export const SECUNDARIO_MIN = 0.08;   // superficie mínima de la camiseta completa para que un 2.º color cuente
const AGRUPAR_UMBRAL = 45;
const SECUNDARIO_DIST = 80;           // 80: no una sombra
const ALTERNATIVES = 6;

export const ROLES = [
  { key: 'principal', label: 'Camiseta: principal' },
  { key: 'secundario', label: 'Camiseta: secundario' },
  { key: 'pantalon', label: 'Pantalón' },
  { key: 'medias', label: 'Medias' },
];

export function hex(c) { return c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(); }
export function parseHex(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function dist(a, b) { return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2); }

/** Canal de 8 bits → valor del editor de PES 2018 (0–63). El juego guarda 6 bits y los multiplica por 4: el más cercano. */
export function to63(v) { return Math.min(63, Math.round(v / 4)); }
export function from63(v) { return Math.max(0, Math.min(63, v | 0)) * 4; }
export function editorValues(hexColor) { const c = parseHex(hexColor); return c ? c.map(to63) : null; }
/** Color que se ve en el juego con los valores 0–63 (valor × 4). */
export function gameHex(hexColor) { const v = editorValues(hexColor); return v ? hex(v.map(from63)) : null; }

/** round() de Python/NumPy (mitad al par) de sum/cnt, exacto con enteros. */
function roundDiv(sum, cnt) {
  const q = Math.floor(sum / cnt), rem = sum - q * cnt;
  if (2 * rem > cnt) return q + 1;
  if (2 * rem === cnt) return q % 2 ? q + 1 : q;
  return q;
}

/** _grupos: colores de la pieza cuantizados a 32 niveles por canal, de mayor a menor superficie → [[fracción, [r,g,b]], …]. */
export function groups(rgba, mask, alphaMin = -1) {
  const cnt = new Float64Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
  const n = rgba.length >> 2;
  for (let i = 0; i < n; i++) {
    if (mask && !mask[i]) continue;
    const o = i * 4;
    if (rgba[o + 3] <= alphaMin) continue;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    cnt[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
  }
  const keys = [];
  let tot = 0;
  for (let k = 0; k < 32768; k++) if (cnt[k]) { keys.push(k); tot += cnt[k]; }
  keys.sort((a, b) => cnt[b] - cnt[a] || a - b);
  return keys.map(k => [cnt[k] / tot, [roundDiv(sr[k], cnt[k]), roundDiv(sg[k], cnt[k]), roundDiv(sb[k], cnt[k])]]);
}

/** _agrupar: une tonos a menos de `umbral` en un solo color (el del tono más abundante). */
export function cluster(g, umbral = AGRUPAR_UMBRAL) {
  const cl = [];
  for (const [f, c] of g) {
    const x = cl.find(x => dist(c, x[1]) < umbral);
    if (x) x[0] += f; else cl.push([f, c]);
    if (cl.length > 40) break;
  }
  // sorted(reverse=True) sobre tuplas (fracción, (r, g, b))
  return cl.sort((a, b) => b[0] - a[0] || b[1][0] - a[1][0] || b[1][1] - a[1][1] || b[1][2] - a[1][2]);
}

function rgbToHsv(r, g, b) {
  const maxc = Math.max(r, g, b), minc = Math.min(r, g, b), v = maxc;
  if (minc === maxc) return [0, 0, v];
  const rangec = maxc - minc, s = rangec / maxc;
  const rc = (maxc - r) / rangec, gc = (maxc - g) / rangec, bc = (maxc - b) / rangec;
  let h = r === maxc ? bc - gc : g === maxc ? 2 + rc - bc : 4 + gc - rc;
  h /= 6; h -= Math.floor(h);
  return [h, s, v];
}

/** mismo_color: dos tonos del mismo color (verde y verde claro, negro y gris oscuro) no son «dos colores». */
export function sameColor(a, b) {
  const [ha, sa, va] = rgbToHsv(a[0] / 255, a[1] / 255, a[2] / 255), [hb, sb, vb] = rgbToHsv(b[0] / 255, b[1] / 255, b[2] / 255);
  const ca = sa > 0.15 && va > 0.2, cb = sb > 0.15 && vb > 0.2;
  if (ca && cb) return Math.min(Math.abs(ha - hb), 1 - Math.abs(ha - hb)) * 360 < 40;
  if (!ca && !cb) return Math.abs(va - vb) < 0.35;
  return false;
}

function secondary(cam, c1) {
  const s = cam.find(([f, c]) => f >= SECUNDARIO_MIN && dist(c, c1) >= SECUNDARIO_DIST && !sameColor(c, c1));
  return s ? s[1] : c1;
}

const alt = list => list.slice(0, ALTERNATIVES).map(([f, c]) => ({ hex: hex(c), share: Math.round(f * 1000) / 1000 }));

/** colores_kit para un atlas (textura de kit PES 2018/2021). masks: { pieza: Uint8Array del tamaño del atlas }. */
export function detectAtlas(rgba, masks) {
  const pz = {};
  for (const p of PIECES) pz[p] = cluster(groups(rgba, masks[p]));
  const cam = pz.camiseta_completa;
  if (!cam.length || !pz.pantalon.length || !pz.medias.length) throw new Error('La imagen no tiene las zonas de un kit.');
  const c1 = cam[0][1];
  return {
    mode: 'atlas',
    colors: { principal: hex(c1), secundario: hex(secondary(cam, c1)), pantalon: hex(pz.pantalon[0][1]), medias: hex(pz.medias[0][1]) },
    alternatives: { camiseta: alt(cam), pantalon: alt(pz.pantalon), medias: alt(pz.medias) },
  };
}

/** Imagen libre (render, captura): mismos grupos sobre toda la imagen; pantalón y medias quedan para elegir. */
export function detectFree(rgba, hasAlpha) {
  const all = cluster(groups(rgba, null, hasAlpha ? 0 : -1));
  if (!all.length) throw new Error('La imagen no tiene píxeles visibles.');
  const c1 = all[0][1];
  return { mode: 'free', colors: { principal: hex(c1), secundario: hex(secondary(all, c1)), pantalon: null, medias: null }, alternatives: { imagen: alt(all) } };
}

/** color_dominante (kit_editado.py): color más abundante en 6 bits por canal entre los píxeles opacos (dorsales). */
export function dominantOpaque(rgba) {
  const counts = new Map();
  let best = -1, bestN = 0;
  for (let o = 0; o < rgba.length; o += 4) {
    if (rgba[o + 3] <= 200) continue;
    const k = ((rgba[o] >> 2) << 12) | ((rgba[o + 1] >> 2) << 6) | (rgba[o + 2] >> 2);
    const n = (counts.get(k) || 0) + 1;
    counts.set(k, n);
    if (n > bestN) { bestN = n; best = k; }   // empate: gana el que llegó primero a ese número, como Counter.most_common
  }
  if (best < 0) return null;
  return hex([best >> 12, (best >> 6) & 63, best & 63].map(v => v * 4));
}

/** Máscara de 2048² → tamaño del atlas con el vecino más cercano de Pillow (centro del píxel). */
export function resizeMask(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return src;
  const out = new Uint8Array(dw * dh), sx = sw / dw, sy = sh / dh;
  const xs = new Int32Array(dw);
  for (let x = 0; x < dw; x++) xs[x] = Math.min(sw - 1, Math.floor((x + 0.5) * sx));
  for (let y = 0; y < dh; y++) {
    const row = Math.min(sh - 1, Math.floor((y + 0.5) * sy)) * sw, o = y * dw;
    for (let x = 0; x < dw; x++) out[o + x] = src[row + xs[x]];
  }
  return out;
}

/** ¿Se analiza como atlas? Cuadrada (los kits son 1024, 1080, 2048 o 4096) y de al menos 256 px. */
export function looksLikeAtlas(width, height) { return width === height && width >= 256; }
