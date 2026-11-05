// Recorte automático de fondo (beta), orientado a jugadores: MODNet (recorte de retratos, Apache 2.0),
// ejecutado en el navegador con ONNX Runtime Web (MIT). Elegido frente a MediaPipe Selfie Multiclass por
// medir 5 veces menos error sobre minifaces de LAqP; el ajuste fino con composiciones se descartó porque
// empeoraba en fotos reales (ver js/vendor/modnet/README.md). MODNet recorta bordes finos pero no sabe qué es
// una persona: deja sillas y otros jugadores. Por eso Selfie Multiclass se suma como guía (ver personGuide).
// Todo está alojado en el sitio; las imágenes no se envían a ningún servidor.

import { detectFaces, loadVision, measureHead, otherPlayers } from './auto-frame.js';

const ORT_VERSION = '1.31.1';
const ORT_BASE = `/js/vendor/onnxruntime-web-${ORT_VERSION}/`;
const MODEL_URL = '/js/vendor/modnet/modnet-portrait-fp16.onnx';
const SEGMENTER_URL = '/js/vendor/mediapipe/selfie_multiclass_256x256.tflite';
const SHORT_SIDE = 512;   // MODNet trabaja con el lado corto en 512 px
const MAX_LONG_SIDE = 1024;
const STRIDE = 32;        // las dimensiones de entrada deben ser múltiplos de 32

export class BackgroundError extends Error {
  constructor(message, reason) { super(message); this.reason = reason; }
}

let sessionPromise = null;

export function loadBackgroundModel() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import(/* webpackIgnore: true */ `${ORT_BASE}ort.wasm.bundle.min.mjs`);
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return { ort, session };
    })().catch(error => {
      sessionPromise = null;
      console.warn('[Miniface Studio] recorte', error);
      throw new BackgroundError('No se pudo cargar el modelo de recorte. La imagen no se modificó.', 'load');
    });
  }
  return sessionPromise;
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

/** ¿La imagen ya tiene fondo transparente? (más del 2 % de píxeles no opacos). */
export function hasTransparency({ image, width, height }) {
  const k = Math.min(1, 256 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
  const ctx = canvasOf(w, h).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  return transparent > w * h * 0.02;
}

function inferenceSize(width, height) {
  let k = SHORT_SIDE / Math.min(width, height);
  if (Math.max(width, height) * k > MAX_LONG_SIDE) k = MAX_LONG_SIDE / Math.max(width, height);
  const round = v => Math.max(STRIDE, Math.round(v * k / STRIDE) * STRIDE);
  return { w: round(width), h: round(height) };
}

// ---------------------------------------------------------------------------------------------
// Refinado del recorte (v2). MODNet da una máscara suave pensada para retratos: en fotos de poca
// calidad el borde queda difuminado y el color del fondo se mete en el pelo (halos claros o
// teñidos). Tres pasos, medidos sobre 240 minifaces de LAqP compuestas sobre fondos y revisados en
// fotos reales:
//   1. Filtro guiado con la foto en color como guía (He et al.; variante rápida de He y Sun): pega
//      el borde de la máscara a los bordes reales de la imagen, a resolución completa.
//   2. Curva de contraste del borde: transición más corta y lisa, y un leve encogido contra halos.
//   3. Estimación del color del primer plano (blur fusion, Forte 2021) en los píxeles
//      semitransparentes: quita el color del fondo que quedaba en el pelo y en los bordes.
// Además se descartan islas sueltas (restos de fondo separados del jugador).
const WORK_PIXELS = 1_000_000;           // coeficientes del filtro y colores se calculan a ≤ 1 MP
const EDGE_LOW = 0.25, EDGE_HIGH = 0.85; // curva de contraste del borde
const GUIDED_EPS = 1e-3;
const ISLAND_FRACTION = 0.02;            // islas menores al 2 % del área mayor se descartan

/** Media en ventana (2r+1)² con bordes recortados; separable con sumas acumuladas. */
function boxMean(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const acc = new Float64Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) acc[x + 1] = acc[x] + src[o + x];
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - r), b = Math.min(w - 1, x + r);
      tmp[o + x] = (acc[b + 1] - acc[a]) / (b - a + 1);
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) acc[y + 1] = acc[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const a = Math.max(0, y - r), b = Math.min(h - 1, y + r);
      out[y * w + x] = (acc[b + 1] - acc[a]) / (b - a + 1);
    }
  }
  return out;
}

function product(a, b) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * b[i];
  return out;
}

/** Remuestreo bilineal (centros de píxel alineados). */
function resample(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sh / dh - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * sw / dw - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      out[y * dw + x] = (src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx) * (1 - ty)
        + (src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx) * ty;
    }
  }
  return out;
}

function edgeCurve(q) {
  const t = Math.min(1, Math.max(0, (q - EDGE_LOW) / (EDGE_HIGH - EDGE_LOW)));
  return t * t * (3 - 2 * t);
}

/** Coeficientes (suavizados) del filtro guiado con guía RGB: alfa ≈ aR·R + aG·G + aB·B + b. */
function guidedCoefficients([R, G, B], p, w, h, r) {
  const n = w * h, box = x => boxMean(x, w, h, r);
  const mR = box(R), mG = box(G), mB = box(B), mP = box(p);
  const pR = box(product(R, p)), pG = box(product(G, p)), pB = box(product(B, p));
  const RR = box(product(R, R)), RG = box(product(R, G)), RB = box(product(R, B));
  const GG = box(product(G, G)), GB = box(product(G, B)), BB = box(product(B, B));
  const aR = new Float32Array(n), aG = new Float32Array(n), aB = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cR = pR[i] - mR[i] * mP[i], cG = pG[i] - mG[i] * mP[i], cB = pB[i] - mB[i] * mP[i];
    const s00 = RR[i] - mR[i] * mR[i] + GUIDED_EPS, s01 = RG[i] - mR[i] * mG[i], s02 = RB[i] - mR[i] * mB[i];
    const s11 = GG[i] - mG[i] * mG[i] + GUIDED_EPS, s12 = GB[i] - mG[i] * mB[i], s22 = BB[i] - mB[i] * mB[i] + GUIDED_EPS;
    const i00 = s11 * s22 - s12 * s12, i01 = s02 * s12 - s01 * s22, i02 = s01 * s12 - s02 * s11;
    const i11 = s00 * s22 - s02 * s02, i12 = s01 * s02 - s00 * s12, i22 = s00 * s11 - s01 * s01;
    const det = s00 * i00 + s01 * i01 + s02 * i02;
    aR[i] = (i00 * cR + i01 * cG + i02 * cB) / det;
    aG[i] = (i01 * cR + i11 * cG + i12 * cB) / det;
    aB[i] = (i02 * cR + i12 * cG + i22 * cB) / det;
    b[i] = mP[i] - aR[i] * mR[i] - aG[i] * mG[i] - aB[i] * mB[i];
  }
  return [box(aR), box(aG), box(aB), box(b)];
}

/** Fondo y primer plano suavizados para estimar el color sin contaminación (blur fusion). */
function foregroundFields(I, alpha, w, h, r1, r2) {
  const n = w * h, eps = 1e-5;
  const inv = new Float32Array(n);
  for (let i = 0; i < n; i++) inv[i] = 1 - alpha[i];
  const step = (F, B, r) => {
    const ba = boxMean(alpha, w, h, r);
    const bF = [], bB = [];
    for (let c = 0; c < 3; c++) {
      const fa = boxMean(product(F[c], alpha), w, h, r), b1a = boxMean(product(B[c], inv), w, h, r);
      for (let i = 0; i < n; i++) { fa[i] /= ba[i] + eps; b1a[i] /= (1 - ba[i]) + eps; }
      bF.push(fa); bB.push(b1a);
    }
    return { bF, bB };
  };
  const first = step(I, I, r1);
  const F = first.bF.map((bf, c) => {
    const out = new Float32Array(n), bb = first.bB[c], Ic = I[c];
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      out[i] = Math.min(1, Math.max(0, bf[i] + a * (Ic[i] - a * bf[i] - (1 - a) * bb[i])));
    }
    return out;
  });
  return step(F, first.bB, r2);
}

/** Etiqueta las regiones de píxeles que cumplen `inside(i)`. areas[id] = píxeles de la región id (1…). */
function labelRegions(inside, w, h, diagonal) {
  const n = w * h, label = new Int32Array(n), stack = new Int32Array(n), areas = [0];
  for (let s = 0; s < n; s++) {
    if (label[s] || !inside(s)) continue;
    const id = areas.length;
    let top = 0, area = 0;
    stack[top++] = s; label[s] = id;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      area++;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
          if (!diagonal && xx !== x && yy !== y) continue;
          const j = yy * w + xx;
          if (!label[j] && inside(j)) { label[j] = id; stack[top++] = j; }
        }
      }
    }
    areas.push(area);
  }
  return { label, areas };
}

/** Descarta islas opacas pequeñas separadas del jugador y lo semitransparente lejos de él. */
function dropIslands(alpha, w, h) {
  const { label, areas } = labelRegions(i => alpha[i] > 128, w, h, true);
  if (areas.length <= 2) return;
  let largest = 0;
  for (const a of areas) largest = Math.max(largest, a);
  const keep = areas.map(a => a >= largest * ISLAND_FRACTION);
  keep[0] = false;
  clearFarFrom(alpha, i => keep[label[i]], w, h);
}

/** Borra lo que esté lejos de la zona conservada, dilatada 2 px (incluye su borde semitransparente). */
function clearFarFrom(alpha, kept, w, h) {
  const n = w * h;
  const near = new Uint8Array(n), tmp = new Uint8Array(n);
  for (let i = 0; i < n; i++) near[i] = kept(i) ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2) && !v; xx++) v = near[y * w + xx];
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2) && !v; yy++) v = tmp[yy * w + x];
    if (!v) alpha[y * w + x] = 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Guía semántica. Selfie Multiclass tiene poca resolución pero distingue a la persona de una silla
// o de un cartel, justo lo que MODNet confunde. Solo limita y completa: el borde sigue siendo el de
// MODNet. Revisada con fotos reales de presentación (silla gamer detrás, compañeros al lado, marcas
// de agua) y sin cambios visibles en las que ya salían bien. Si algo falla, queda el recorte de MODNet.
const GUIDE_THRESHOLD = 0.7;  // confianza mínima de «persona»
const GUIDE_MARGIN = 150;     // margen alrededor de la persona: lado corto / esto
const GUIDE_HAIR_MARGIN = 70; // margen mayor alrededor del pelo, para no perder mechones finos
const GUIDE_MIN_KEPT = 0.4;   // si la guía quitara más que esto de lo recortado, no se le hace caso
const CHIN_FACTOR = 1.2;      // altura del mentón, en altos del recuadro facial
const KEEP_HEAD = 0.75;       // al separar jugadores no se corta a menos de esto del centro de la cara (cabeza)
const KEEP_SHOULDERS = 1.35;  // ni a menos de esto debajo del mentón (hombros), en anchos de cara
const EAR_SIDE = 0.72;        // franja de cara y orejas: medio ancho, en anchos de cara
const EAR_THRESHOLD = 0.25;   // ahí alcanza con menos confianza: las orejas quedan en el borde borroso del segmentador
const HEAD_SIDE = 0.55;       // medio ancho de cabeza y cuello, en anchos de cara
const GUIDE_SKIN = 0.5;       // confianza mínima de «piel del cuerpo»
const FRONTAL_NOSE = 0.3;     // de frente: la nariz se aparta del medio de los ojos menos que esto (en distancias entre ojos)
const CLOSE_UP_SIDE = 5;      // zona ampliada alrededor de la cabeza, en anchos de cara

let segmenterPromise = null;

function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { vision, fileset } = await loadVision();
      return vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENTER_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })().catch(error => {
      console.warn('[Miniface Studio] guía del recorte', error);
      return null;
    });
  }
  return segmenterPromise;
}

/** Zona cercana a la cabeza (cabeza y hombros), en las coordenadas de la cara. Null si ya es casi toda la imagen. */
function closeUpRegion(face, width, height) {
  const side = face.w * CLOSE_UP_SIDE;
  const x = Math.max(0, Math.round(face.x + face.w / 2 - side / 2)), y = Math.max(0, Math.round(face.y + face.h * 1.3 - side / 2));
  const w = Math.min(width - x, Math.round(side)), h = Math.min(height - y, Math.round(side));
  return w > 8 && h > 8 && Math.max(width, height) > side * 1.15 ? { x, y, w, h } : null;
}

/** Filtro guiado en gris: pega la guía a los bordes reales de la foto. */
function guidedGray(I, p, w, h, r) {
  const n = w * h, box = x => boxMean(x, w, h, r);
  const mI = box(I), mP = box(p), cov = box(product(I, p)), vari = box(product(I, I));
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (cov[i] - mI[i] * mP[i]) / (vari[i] - mI[i] * mI[i] + GUIDED_EPS);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = box(a), mB = box(b), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, mA[i] * I[i] + mB[i]));
  return out;
}

/** De perfil o girada, la cara queda corrida respecto del cuerpo y el cuello cae fuera del ancho de la cara. */
function isFrontal(face) {
  const nose = face.keypoints?.[2];
  if (!nose || !face.rightEye || !face.leftEye) return false;
  const eyes = Math.abs(face.rightEye.x - face.leftEye.x);
  return eyes > 0 && Math.abs(nose.x - (face.rightEye.x + face.leftEye.x) / 2) / eyes < FRONTAL_NOSE;
}

/** Máscara de la persona principal, a partir de la confianza del segmentador. */
function personMask(person, skin, w, h, face, others = []) {
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < solid.length; i++) solid[i] = person[i] > GUIDE_THRESHOLD ? 1 : 0;
  if (!face) return solid;
  const chin = Math.max(1, Math.min(h, Math.round(face.y + face.h * CHIN_FACTOR)));
  // Arriba del mentón: solo la mancha conectada con la cara principal (fuera, cabezas de otros jugadores).
  const { label } = labelRegions(i => solid[i] === 1, w, chin, false);
  const main = new Set();
  const x0 = Math.max(0, Math.floor(face.x)), x1 = Math.min(w, Math.ceil(face.x + face.w));
  const y0 = Math.max(0, Math.floor(face.y)), y1 = Math.min(chin, Math.ceil(face.y + face.h));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (label[y * w + x]) main.add(label[y * w + x]);
  if (main.size) for (let i = 0; i < w * chin; i++) if (!main.has(label[i])) solid[i] = 0;
  // De frente, a la altura de la cara no puede haber un brazo a los costados de la cabeza: es de otro jugador.
  const centerX = face.x + face.w / 2;
  for (let y = Math.max(0, Math.ceil(face.y)); face.frontal && y < chin; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.abs(x + 0.5 - centerX) > face.w * HEAD_SIDE && skin[y * w + x] > GUIDE_SKIN) solid[y * w + x] = 0;
    }
  }
  // Con otros jugadores a la vista, lo que está más cerca de la cara de otro es de ese jugador,
  // sin entrar nunca en la cabeza ni en los hombros del jugador elegido.
  for (const other of others) {
    const otherX = other.x + other.w / 2, side = Math.sign(otherX - centerX) || 1;
    const middle = Math.abs(otherX - centerX) * face.w / (face.w + other.w);
    for (let y = 0; y < h; y++) {
      const limit = Math.max(middle, face.w * (y < chin ? KEEP_HEAD : KEEP_SHOULDERS));
      for (let x = 0; x < w; x++) if ((x + 0.5 - centerX) * side > limit) solid[y * w + x] = 0;
    }
  }
  // Cara y orejas: el segmentador tiene poca resolución y se las come por el borde.
  const earEnd = Math.min(h, Math.round(face.y + face.h * 0.85));
  for (let y = Math.max(0, Math.round(face.y + face.h * 0.15)); y < earEnd; y++) {
    for (let x = Math.max(0, Math.round(centerX - face.w * EAR_SIDE)); x < Math.min(w, Math.round(centerX + face.w * EAR_SIDE)); x++) {
      if (person[y * w + x] > EAR_THRESHOLD) solid[y * w + x] = 1;
    }
  }
  // Abajo: cada fila se rellena entre sus extremos (las camisetas a rayas confunden al segmentador).
  for (let y = chin; y < h; y++) {
    let first = -1, last = -1;
    for (let x = 0; x < w; x++) if (solid[y * w + x]) { if (first < 0) first = x; last = x; }
    for (let x = first; first >= 0 && x <= last; x++) solid[y * w + x] = 1;
  }
  return solid;
}

/** Calcula la guía: persona principal y compuerta suave. Devuelve null si no hay una persona clara. */
async function personGuide(source, main, others = []) {
  const segmenter = await loadSegmenter();
  if (!segmenter) return null;
  const { image, width, height } = source;
  const k = Math.min(1, Math.sqrt(WORK_PIXELS / (width * height)));
  const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
  const canvas = canvasOf(w, h), ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  const person = new Float32Array(w * h), hair = new Float32Array(w * h), skin = new Float32Array(w * h);
  // Clases del modelo: 0 fondo, 1 pelo, 2 piel del cuerpo, 3 piel de la cara, 4 ropa, 5 otros.
  const segment = (target, x0, y0, cw, ch) => {
    const result = segmenter.segment(target);
    try {
      const plane = mask => resample(mask.getAsFloat32Array(), mask.width, mask.height, cw, ch);
      const background = plane(result.confidenceMasks[0]), hairs = plane(result.confidenceMasks[1]), skins = plane(result.confidenceMasks[2]);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const i = (y0 + y) * w + x0 + x, j = y * cw + x;
        person[i] = 1 - background[j]; hair[i] = hairs[j]; skin[i] = skins[j];
      }
    } finally {
      result.confidenceMasks.forEach(mask => mask.close());
    }
  };
  segment(canvas, 0, 0, w, h);
  const face = main && { x: main.x * k, y: main.y * k, w: main.w * k, h: main.h * k, frontal: isFrontal(main) };
  // El segmentador trabaja a 256 px: se repite de cerca para que la cabeza tenga más detalle.
  const near = face && closeUpRegion(face, w, h);
  if (near) {
    const crop = canvasOf(near.w, near.h), cctx = crop.getContext('2d');
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(canvas, near.x, near.y, near.w, near.h, 0, 0, near.w, near.h);
    segment(crop, near.x, near.y, near.w, near.h);
  }
  const solid = personMask(person, skin, w, h, face, others.map(o => ({ x: o.x * k, w: o.w * k })));
  let area = 0;
  for (let i = 0; i < solid.length; i++) area += solid[i];
  if (area < w * h * 0.01) return null;
  // Compuerta: la persona con un margen, suavizada y pegada a los bordes de la foto.
  const px = ctx.getImageData(0, 0, w, h).data, gray = new Float32Array(w * h), mask = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
    mask[i] = solid[i];
  }
  const short = Math.min(w, h), margin = Math.max(2, Math.round(short / GUIDE_MARGIN));
  const hairMask = new Float32Array(w * h);
  for (let i = 0; i < hairMask.length; i++) hairMask[i] = solid[i] && hair[i] > GUIDE_THRESHOLD ? 1 : 0;
  const reach = boxMean(mask, w, h, margin), hairReach = boxMean(hairMask, w, h, Math.max(2, Math.round(short / GUIDE_HAIR_MARGIN)));
  for (let i = 0; i < reach.length; i++) reach[i] = reach[i] > 1e-4 || hairReach[i] > 1e-4 ? 1 : 0;
  const soft = boxMean(boxMean(reach, w, h, Math.max(1, margin >> 1)), w, h, Math.max(1, margin >> 1));
  const gate = guidedGray(gray, soft, w, h, Math.max(2, Math.round(short / 80)));
  for (let i = 0; i < gate.length; i++) {
    const t = Math.min(1, Math.max(0, (gate[i] - 0.3) / 0.4));
    gate[i] = t * t * (3 - 2 * t);
  }
  return { gate, solid, w, h, face: main };
}

/** Aplica la guía al alfa a resolución completa, en el lugar. */
function applyPersonGuide(alpha, W, H, guide) {
  const { w, h, face } = guide, n = W * H;
  const gate = w === W && h === H ? guide.gate : resample(guide.gate, w, h, W, H);
  const insidePerson = i => {
    const x = i % W, y = (i - x) / W;
    return guide.solid[Math.min(h - 1, Math.floor(y * h / H)) * w + Math.min(w - 1, Math.floor(x * w / W))] === 1;
  };
  const next = new Uint8Array(n);
  let before = 0, after = 0;
  for (let i = 0; i < n; i++) { before += alpha[i]; next[i] = Math.round(Math.min(alpha[i], gate[i] * 255)); }
  // Agujeros del recorte dentro de la persona; el borde inferior cuenta como cerrado (el cuerpo sigue más abajo).
  const { label } = labelRegions(i => next[i] <= 128, W, H, false);
  const open = new Set();
  for (let x = 0; x < W; x++) open.add(label[x]);
  for (let y = 0; y < H; y++) { open.add(label[y * W]); open.add(label[y * W + W - 1]); }
  for (let i = 0; i < n; i++) if (label[i] && !open.has(label[i]) && insidePerson(i)) next[i] = 255;
  // Si quedan partes sueltas, sigue solo la del rostro principal (o la mayor).
  const parts = labelRegions(i => next[i] > 128, W, H, true);
  if (parts.areas.length > 2) {
    let keep = 0;
    if (face) {
      const x0 = Math.max(0, Math.floor(face.x)), x1 = Math.min(W, Math.ceil(face.x + face.w));
      const y0 = Math.max(0, Math.floor(face.y)), y1 = Math.min(H, Math.ceil(face.y + face.h));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const id = parts.label[y * W + x];
        if (id && parts.areas[id] > parts.areas[keep]) keep = id;
      }
    }
    if (!keep) for (let id = 1; id < parts.areas.length; id++) if (parts.areas[id] > parts.areas[keep]) keep = id;
    clearFarFrom(next, i => parts.label[i] === keep, W, H);
  }
  for (let i = 0; i < n; i++) after += next[i];
  if (after >= before * GUIDE_MIN_KEPT) alpha.set(next);
}

// ---------------------------------------------------------------------------------------------
// Pelo confundido con el fondo (pelo negro sobre fondo negro). Ningún modelo ve ese borde, así que
// se recorre la cabeza con rayos desde su centro. Donde el recorte tiene contraste real, se le cree.
// Donde no lo tiene y el fondo es liso: primero se buscan rastros (brillos sueltos del pelo que se
// apartan del fondo) y, si no hay, se completa con la forma de la cabeza, ajustada a los tramos fiables.
const HAIR_SECTOR = 105 * Math.PI / 180; // rayos a cada lado de «arriba»
const HAIR_RAYS = 141;
const HAIR_CONTRAST = 30;     // adentro y afuera se parecen si difieren menos que esto (0–255)
const HAIR_FLAT = 10;         // el fondo es liso si varía menos que esto a lo largo del rayo
const HAIR_TRACE = 8;         // un píxel es rastro si se aparta del fondo al menos esto
const HAIR_REACH = 0.45;      // lo máximo que se agrega, en anchos de cabeza (semieje)
const HAIR_MIN_RUN = 4;       // tramos sin contraste más cortos que esto se ignoran
const HAIR_SHAPE = 0.98;      // la forma imaginada queda apenas adentro de la elipse ajustada
const HAIR_DENT = 0.93;       // hay una mella si el recorte queda por debajo de esto respecto de la forma esperada
const HAIR_TRACE_MARGIN = 0.06; // un rastro cuenta si sale del borde al menos esto, en anchos de cabeza
const HAIR_SLOPE = 0.025;    // cuánto puede crecer el contorno de un rayo al siguiente, en anchos de cabeza

function median(values) {
  const sorted = Float32Array.from(values).sort();
  return sorted.length ? sorted[sorted.length >> 1] : 0;
}

/** Agrega al alfa, en el lugar, el pelo que se confunde con el fondo. `data` son los píxeles RGBA de la foto. */
function completeHair(data, alpha, W, H, head) {
  const { cx, cy, ux, uy, a, b } = head;
  const sideX = -uy, sideY = ux, step = Math.max(1, a / 150);
  const angleOf = i => -HAIR_SECTOR + 2 * HAIR_SECTOR * i / (HAIR_RAYS - 1);
  const ellipse = t => 1 / Math.hypot(Math.sin(t) / a, Math.cos(t) / b);
  const indexAt = (r, t) => {
    const dx = Math.cos(t) * ux + Math.sin(t) * sideX, dy = Math.cos(t) * uy + Math.sin(t) * sideY;
    const x = Math.round(cx + r * dx), y = Math.round(cy + r * dy);
    return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1;
  };
  const edge = new Float32Array(HAIR_RAYS), trace = new Float32Array(HAIR_RAYS), blended = new Uint8Array(HAIR_RAYS);
  for (let ray = 0; ray < HAIR_RAYS; ray++) {
    const t = angleOf(ray), far = ellipse(t) * 1.75, gap = a * 0.03;
    // Borde actual del recorte a lo largo del rayo.
    let rm = ellipse(t) * 0.45;
    for (let r = rm; r < far && r - rm < gap; r += step) {
      const i = indexAt(r, t);
      if (i >= 0 && alpha[i] > 128) rm = r;
    }
    edge[ray] = rm;
    const channels = (from, to, wanted) => {
      const out = [[], [], []];
      for (let r = from; r < to; r += step) {
        const i = indexAt(r, t);
        if (i >= 0 && wanted(alpha[i])) for (let c = 0; c < 3; c++) out[c].push(data[i * 4 + c]);
      }
      return out;
    };
    const outside = channels(rm + a * 0.2, far, v => v < 30);
    const inside = channels(rm - a * 0.1, rm - a * 0.015, v => v > 128);
    if (outside[0].length < 5 || !inside[0].length) continue;
    const back = outside.map(median);
    const spread = Math.max(...outside.map((values, c) => Math.sqrt(values.reduce((sum, v) => sum + (v - back[c]) ** 2, 0) / values.length)));
    const contrast = Math.max(...inside.map((values, c) => Math.abs(median(values) - back[c])));
    if (contrast >= HAIR_CONTRAST || spread >= HAIR_FLAT) continue;
    blended[ray] = 1;
    const threshold = Math.max(HAIR_TRACE, spread * 3);
    for (let r = rm; r < rm + a * HAIR_REACH; r += step) {
      const i = indexAt(r, t);
      if (i >= 0 && Math.max(...back.map((v, c) => Math.abs(data[i * 4 + c] - v))) > threshold) trace[ray] = r;
    }
  }
  // Tramos muy cortos, con o sin contraste, son ruido. Primero los dudosos; después los fiables entre dudosos.
  const dropShort = value => {
    for (let i = 0; i < HAIR_RAYS;) {
      let j = i;
      while (j < HAIR_RAYS && blended[j] === blended[i]) j++;
      if (blended[i] === value && j - i < HAIR_MIN_RUN && (value === 1 || (i > 0 && j < HAIR_RAYS))) blended.fill(1 - value, i, j);
      i = j;
    }
  };
  dropShort(1);
  dropShort(0);
  if (!blended.includes(1)) return false;
  // Escala de la elipse: la de los tramos fiables, interpolada a través de los dudosos.
  const scale = new Float32Array(HAIR_RAYS).fill(1);
  const anchors = [];
  for (let i = 0; i < HAIR_RAYS; i++) if (!blended[i]) anchors.push(i);
  const scaleNear = (list, i) => median(list.slice(Math.max(0, i - 2), i + 3).map(k => edge[k] / ellipse(angleOf(k))));
  for (let i = 0; i < HAIR_RAYS && anchors.length; i++) {
    let hi = anchors.findIndex(k => k >= i);
    if (hi < 0) { scale[i] = scaleNear(anchors, anchors.length - 1); continue; }
    if (hi === 0) { scale[i] = scaleNear(anchors, 0); continue; }
    const k0 = anchors[hi - 1], k1 = anchors[hi], m = k1 === k0 ? 0 : (i - k0) / (k1 - k0);
    scale[i] = scaleNear(anchors, hi - 1) * (1 - m) + scaleNear(anchors, hi) * m;
  }
  // Rastros: se descarta el rayo aislado (el segundo mayor de una ventana de 5).
  const robust = new Float32Array(HAIR_RAYS);
  for (let i = 0; i < HAIR_RAYS; i++) {
    const near = Array.from(trace.subarray(Math.max(0, i - 2), i + 3)).sort((p, q) => q - p);
    robust[i] = near[1] || 0;
  }
  const target = new Float32Array(HAIR_RAYS);
  for (let i = 0; i < HAIR_RAYS; i++) {
    if (!blended[i]) { target[i] = edge[i]; continue; }
    // Se imagina solo si el recorte tiene una mella real; un rastro cuenta si sale claramente del borde.
    const shape = ellipse(angleOf(i)) * scale[i] * HAIR_SHAPE;
    target[i] = Math.max(edge[i], edge[i] < shape * HAIR_DENT ? shape : 0, robust[i] > edge[i] + a * HAIR_TRACE_MARGIN ? robust[i] : 0);
  }
  // El contorno de una cabeza no salta: lo agregado crece de a poco desde los tramos fiables.
  const slope = a * HAIR_SLOPE;
  for (let i = 1; i < HAIR_RAYS; i++) target[i] = Math.max(edge[i], Math.min(target[i], target[i - 1] + slope));
  for (let i = HAIR_RAYS - 2; i >= 0; i--) target[i] = Math.max(edge[i], Math.min(target[i], target[i + 1] + slope));
  // Curva suave: una cabeza no tiene escalones.
  const reach = new Float32Array(HAIR_RAYS);
  for (let i = 0; i < HAIR_RAYS; i++) {
    let sum = 0, weight = 0;
    for (let d = -6; d <= 6; d++) {
      const j = i + d;
      if (j < 0 || j >= HAIR_RAYS) continue;
      const w = Math.exp(-d * d / 18);
      sum += target[j] * w; weight += w;
    }
    reach[i] = blended[i] ? Math.min(edge[i] + a * HAIR_REACH, Math.max(edge[i], sum / weight)) : edge[i];
  }
  // Se rellena lo que queda dentro de la curva, con el borde apenas suavizado.
  const limit = Math.ceil(Math.max(a, b) * 2.2), soft = Math.max(1, a * 0.012);
  const x0 = Math.max(0, Math.floor(cx - limit)), x1 = Math.min(W - 1, Math.ceil(cx + limit));
  const y0 = Math.max(0, Math.floor(cy - limit)), y1 = Math.min(H - 1, Math.ceil(cy + limit));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const t = Math.atan2(dx * sideX + dy * sideY, dx * ux + dy * uy);
      if (Math.abs(t) > HAIR_SECTOR) continue;
      const f = (t + HAIR_SECTOR) / (2 * HAIR_SECTOR) * (HAIR_RAYS - 1), r0 = Math.floor(f), r1 = Math.min(HAIR_RAYS - 1, r0 + 1);
      if (!blended[r0] && !blended[r1]) continue;
      const limitR = reach[r0] * (1 - (f - r0)) + reach[r1] * (f - r0);
      const v = Math.min(1, Math.max(0, (limitR - Math.hypot(dx, dy)) / soft + 0.5)) * 255;
      const i = y * W + x;
      if (v > alpha[i]) alpha[i] = Math.round(v);
    }
  }
  return true;
}

/**
 * Máscara del modelo → alfa refinado y colores sin contaminación, a resolución completa.
 * `out` (ImageData de la imagen original) se modifica en el lugar.
 */
function refineCutout(out, matte, mw, mh, image) {
  const { width: W, height: H, data } = out;
  const k = Math.min(1, Math.sqrt(WORK_PIXELS / (W * H)));
  const ww = Math.max(1, Math.round(W * k)), wh = Math.max(1, Math.round(H * k));
  // Guía a resolución de trabajo: la foto sobre blanco, igual que la vio el modelo.
  const ctx = canvasOf(ww, wh).getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ww, wh);
  ctx.drawImage(image, 0, 0, ww, wh);
  const px = ctx.getImageData(0, 0, ww, wh).data, n = ww * wh;
  const I = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) I[c][i] = px[i * 4 + c] / 255;
  const p = resample(matte, mw, mh, ww, wh);
  const short = Math.min(ww, wh), fullShort = Math.min(W, H);
  const [aR, aG, aB, b] = guidedCoefficients(I, p, ww, wh, Math.max(1, Math.round(short / 200)));
  // El color se estima con el alfa suave (la mezcla real jugador/fondo); la curva solo endurece la
  // transparencia final. Así un mechón mezclado con cielo queda opaco pero sin el tono del cielo.
  const soft = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    soft[i] = Math.min(1, Math.max(0, aR[i] * I[0][i] + aG[i] * I[1][i] + aB[i] * I[2][i] + b[i]));
  }
  const { bF, bB } = foregroundFields(I, soft, ww, wh,
    Math.max(8, Math.round(short / 6)), Math.max(1, Math.round(3 * short / fullShort)));
  const fields = [aR, aG, aB, b, ...bF, ...bB];
  // Interpolación bilineal de los campos (suaves) a cada píxel de la imagen original.
  const col = new Int32Array(W * 2), colT = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const fx = Math.min(ww - 1, Math.max(0, (x + 0.5) * ww / W - 0.5)), x0 = Math.floor(fx);
    col[x * 2] = x0; col[x * 2 + 1] = Math.min(ww - 1, x0 + 1); colT[x] = fx - x0;
  }
  const alpha = new Uint8Array(W * H), f = new Float32Array(10);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(wh - 1, Math.max(0, (y + 0.5) * wh / H - 0.5)), y0 = Math.floor(fy);
    const r0 = y0 * ww, r1 = Math.min(wh - 1, y0 + 1) * ww, ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const x0 = col[x * 2], x1 = col[x * 2 + 1], tx = colT[x];
      const w00 = (1 - tx) * (1 - ty), w01 = tx * (1 - ty), w10 = (1 - tx) * ty, w11 = tx * ty;
      for (let c = 0; c < 10; c++) {
        const F = fields[c];
        f[c] = F[r0 + x0] * w00 + F[r0 + x1] * w01 + F[r1 + x0] * w10 + F[r1 + x1] * w11;
      }
      const i = y * W + x, o = i * 4, oa = data[o + 3] / 255;
      const R = data[o] / 255, G = data[o + 1] / 255, B = data[o + 2] / 255;
      // La guía usa lo ya transparente como blanco, igual que el modelo.
      const gR = R * oa + 1 - oa, gG = G * oa + 1 - oa, gB = B * oa + 1 - oa;
      const a = Math.min(1, Math.max(0, f[0] * gR + f[1] * gG + f[2] * gB + f[3]));
      alpha[i] = Math.round(Math.min(oa, edgeCurve(a)) * 255);
      if (oa === 1 && alpha[i] > 0 && a < 0.995) {
        data[o] = Math.round(255 * Math.min(1, Math.max(0, f[4] + a * (R - a * f[4] - (1 - a) * f[7]))));
        data[o + 1] = Math.round(255 * Math.min(1, Math.max(0, f[5] + a * (G - a * f[5] - (1 - a) * f[8]))));
        data[o + 2] = Math.round(255 * Math.min(1, Math.max(0, f[6] + a * (B - a * f[6] - (1 - a) * f[9]))));
      }
    }
  }
  dropIslands(alpha, W, H);
  return alpha;
}

/** Pega la máscara de la zona cercana sobre la de la foto entera, con los bordes interiores fundidos. */
function blendCloseUp(matte, mw, mh, close, area, region, width, height) {
  const cw = Math.max(1, Math.round(area.w)), ch = Math.max(1, Math.round(area.h));
  const x0 = Math.round(area.x), y0 = Math.round(area.y);
  const values = resample(close.data, close.w, close.h, cw, ch);
  const feather = Math.max(2, Math.round(Math.min(cw, ch) * 0.06));
  const open = { left: region.x > 0, top: region.y > 0, right: region.x + region.w < width, bottom: region.y + region.h < height };
  for (let y = 0; y < ch && y0 + y < mh; y++) {
    for (let x = 0; x < cw && x0 + x < mw; x++) {
      let t = 1;
      if (open.left) t = Math.min(t, (x + 1) / feather);
      if (open.right) t = Math.min(t, (cw - x) / feather);
      if (open.top) t = Math.min(t, (y + 1) / feather);
      if (open.bottom) t = Math.min(t, (ch - y) / feather);
      const i = (y0 + y) * mw + x0 + x;
      matte[i] = matte[i] * (1 - t) + values[y * cw + x] * t;
    }
  }
}

/**
 * Quita el fondo y devuelve un PNG con transparencia del MISMO tamaño que el original.
 * Se calcula el canal alfa (máscara del jugador) y se corrige el color de los píxeles del borde,
 * donde antes se mezclaba el fondo. Si la imagen ya tenía transparencia (por ejemplo, un recorte
 * circular con fondo blanco), se conserva y se suma.
 * Si la foto tiene varios jugadores, `face` indica cuál recortar (por defecto, el de cara más grande).
 * @returns {Promise<{blob: Blob, removed: number}>} removed = parte de lo visible que se quitó (0–1)
 */
export async function removeBackground(source, { face = null } = {}) {
  const { ort, session } = await loadBackgroundModel();
  const { image, width, height } = source;
  // MODNet es un modelo de retratos: ve mejor si cabeza y hombros ocupan el cuadro. Primero la foto entera
  // (para el resto del cuerpo) y, si se encontró al jugador, otra vez solo con su entorno cercano.
  const runModel = async (sx, sy, sw, sh) => {
    const { w, h } = inferenceSize(sw, sh);
    const small = canvasOf(w, h).getContext('2d', { willReadFrequently: true });
    small.imageSmoothingQuality = 'high';
    // Lo ya transparente se muestra como blanco: un fondo uniforme en vez de un borde negro artificial.
    small.fillStyle = '#ffffff';
    small.fillRect(0, 0, w, h);
    small.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
    const px = small.getImageData(0, 0, w, h).data;
    const plane = w * h, input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      input[i] = px[i * 4] / 127.5 - 1;
      input[plane + i] = px[i * 4 + 1] / 127.5 - 1;
      input[2 * plane + i] = px[i * 4 + 2] / 127.5 - 1;
    }
    const result = await session.run({ input: new ort.Tensor('float32', input, [1, 3, h, w]) });
    return { data: result.output.data, w, h };
  };
  let main = face, others = [];
  try {
    const { faces } = await detectFaces(source);
    main ||= faces[0] || null;
    // Sin el propio jugador: el rostro elegido puede venir de otra pasada del detector.
    const elsewhere = faces.filter(f => main && Math.abs(f.x + f.w / 2 - (main.x + main.w / 2)) > main.w * 0.5);
    if (main) others = otherPlayers(elsewhere, main);
  } catch (error) {
    console.warn('[Miniface Studio] recorte', error);
  }
  const whole = await runModel(0, 0, width, height);
  const k = Math.min(1, Math.sqrt(WORK_PIXELS / (width * height)));
  const mw = Math.max(1, Math.round(width * k)), mh = Math.max(1, Math.round(height * k));
  const matte = resample(whole.data, whole.w, whole.h, mw, mh);
  const near = main && closeUpRegion(main, width, height);
  if (near) {
    const close = await runModel(near.x, near.y, near.w, near.h);
    blendCloseUp(matte, mw, mh, close, { x: near.x * k, y: near.y * k, w: near.w * k, h: near.h * k }, near, width, height);
  }
  const full = canvasOf(width, height), fctx = full.getContext('2d', { willReadFrequently: true });
  fctx.drawImage(image, 0, 0, width, height);
  const out = fctx.getImageData(0, 0, width, height);
  const before = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) before[i] = out.data[i * 4 + 3];
  const alpha = refineCutout(out, matte, mw, mh, image);
  try {
    const guide = await personGuide(source, main, others);
    if (guide) applyPersonGuide(alpha, width, height, guide);
  } catch (error) {
    console.warn('[Miniface Studio] guía del recorte', error);
  }
  try {
    const head = main && await measureHead(source, main);
    if (head) completeHair(out.data, alpha, width, height, head);
  } catch (error) {
    console.warn('[Miniface Studio] pelo', error);
  }
  let kept = 0, visible = 0, removed = 0;
  for (let i = 0; i < width * height; i++) {
    const a = alpha[i];
    out.data[i * 4 + 3] = a;
    if (a > 128) kept++;
    if (before[i] > 128) { visible++; if (a <= 128) removed++; }
  }
  if (kept < width * height * 0.01) throw new BackgroundError('No se encontró un jugador en la imagen. Se conservó el fondo original.', 'empty');
  fctx.putImageData(out, 0, 0);
  const blob = await new Promise((resolve, reject) => full.toBlob(b => (b ? resolve(b) : reject(new BackgroundError('No se pudo generar la imagen recortada.', 'encode'))), 'image/png'));
  return { blob, removed: visible ? removed / visible : 0 };
}
