// Worker de imágenes: decodifica (PNG exacto, DDS, FTEX, JPG/WebP), analiza los colores y arma la miniatura.
import { decodePng } from './png.js';
import { decodeDds, decodeFtex, UnsupportedTextureError } from './textures.js';
import { detectAtlas, detectFree, dominantOpaque, looksLikeAtlas, resizeMask, PIECES } from './colors.js';
import { sniff } from './library.js';

export const MAX_PIXELS = 4096 * 4096;
const THUMB = 384;
const masks2048 = {};
let masksReady = null;

function loadMasks() {
  masksReady ||= Promise.all(PIECES.map(async p => {
    const res = await fetch(new URL(`../../img/kit-color-studio/mascara_${p}.png`, import.meta.url));
    if (!res.ok) throw new Error('No se pudieron cargar las máscaras de las piezas del kit.');
    const m = await decodePng(new Uint8Array(await res.arrayBuffer()));
    const out = new Uint8Array(m.width * m.height);
    for (let i = 0; i < out.length; i++) out[i] = m.data[i * 4] > 0 ? 1 : 0;
    masks2048[p] = { data: out, w: m.width, h: m.height };
  })).catch(e => { masksReady = null; throw e; });
  return masksReady;
}

async function decodeNative(blob) {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    const e = new Error('main-decode'); e.code = 'NEEDS_MAIN'; throw e;
  }
  let bmp;
  try { bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); }
  catch { throw new Error('No se pudo decodificar la imagen: puede estar dañada.'); }
  const { width, height } = bmp;
  if (width * height > MAX_PIXELS) { bmp.close(); throw new RangeError(`La imagen es demasiado grande (${width} × ${height}).`); }
  const c = new OffscreenCanvas(width, height), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0); bmp.close();
  const data = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { hasAlpha = true; break; }
  return { width, height, data, hasAlpha };
}

export async function decodeAny(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = sniff(bytes, blob.name || '');
  const opts = { maxPixels: MAX_PIXELS };
  if (kind === 'png') return { ...(await decodePng(bytes, opts)), formatName: 'PNG' };
  if (kind === 'dds') return decodeDds(bytes, opts);
  if (kind === 'ftex') return decodeFtex(bytes, opts);
  if (kind === 'jpg' || kind === 'webp') return { ...(await decodeNative(blob)), formatName: kind === 'jpg' ? 'JPG' : 'WebP' };
  throw new UnsupportedTextureError('Formato de imagen no reconocido.');
}

/** Miniatura por promedio de área. opaque: ignora el alfa (en los kits es una máscara de brillo). */
function thumbnail(img, opaque) {
  const s = Math.min(1, THUMB / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const out = new Uint8ClampedArray(w * h * 4), src = img.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * img.height / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * img.height / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * img.width / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * img.width / w));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const sy = Math.max(1, (y1 - y0) >> 2), sx = Math.max(1, (x1 - x0) >> 2);   // submuestreo: rápido en 4096²
      for (let yy = y0; yy < y1; yy += sy) for (let xx = x0; xx < x1; xx += sx) {
        const o = (yy * img.width + xx) * 4; r += src[o]; g += src[o + 1]; b += src[o + 2]; a += src[o + 3]; n++;
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = opaque ? 255 : a / n;
    }
  }
  return { width: w, height: h, data: out };
}

async function analyzeImage(img, { role, aux, mode }) {
  const result = { width: img.width, height: img.height, formatName: img.formatName, hasAlpha: !!img.hasAlpha };
  if (role === 'aux') {
    if (aux === 'back') result.dorsal = dominantOpaque(img.data);
    result.thumb = thumbnail(img, aux === 'srm');
    return result;
  }
  const useAtlas = mode ? mode === 'atlas' : looksLikeAtlas(img.width, img.height);
  if (useAtlas) {
    await loadMasks();
    const masks = {};
    for (const p of PIECES) masks[p] = resizeMask(masks2048[p].data, masks2048[p].w, masks2048[p].h, img.width, img.height);
    result.analysis = detectAtlas(img.data, masks);
  } else {
    result.analysis = detectFree(img.data, img.hasAlpha);
  }
  result.thumb = thumbnail(img, useAtlas);
  return result;
}

async function handle(msg) {
  if (msg.type === 'analyze') {
    const img = msg.rgba ? { ...msg.rgba } : await decodeAny(msg.blob);
    const r = await analyzeImage(img, msg);
    return [r, [r.thumb.data.buffer]];
  }
  if (msg.type === 'decode') {
    const img = await decodeAny(msg.blob);
    return [{ width: img.width, height: img.height, data: img.data, formatName: img.formatName, hasAlpha: !!img.hasAlpha }, [img.data.buffer]];
  }
  if (msg.type === 'masks') {
    await loadMasks();
    const out = {};
    for (const p of PIECES) out[p] = { data: resizeMask(masks2048[p].data, 2048, 2048, 512, 512), w: 512, h: 512 };
    return [out, []];
  }
  throw new Error('Operación desconocida.');
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = async ({ data: msg }) => {
    try {
      const [result, transfer] = await handle(msg);
      self.postMessage({ id: msg.id, ok: true, result }, transfer);
    } catch (e) {
      self.postMessage({ id: msg.id, ok: false, error: e?.message || String(e), code: e?.code || (e instanceof RangeError ? 'TOO_LARGE' : e instanceof UnsupportedTextureError ? 'UNSUPPORTED' : '') });
    }
  };
}
