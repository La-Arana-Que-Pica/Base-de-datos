// Encuadre automático (beta): detecta el rostro con MediaPipe Face Detector en el navegador, lo mide
// con Face Landmarker (478 puntos en 3D) y propone posición y escala dentro del editor. Nunca recorta ni modifica la imagen original.
// Las imágenes no se envían a ningún servidor. El motor de MediaPipe y el modelo están alojados en
// el propio sitio (js/vendor/mediapipe), así que no depende de servicios externos.

import { TEMPLATE } from './template.js';

const MEDIAPIPE_VERSION = '1.2.0';
const LOCAL_BASE = `/js/vendor/mediapipe/tasks-vision-${MEDIAPIPE_VERSION}`;
// Solo para navegadores muy antiguos sin WebAssembly SIMD: la variante «nosimd» se pide al CDN.
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const MODEL_URL = '/js/vendor/mediapipe/blaze_face_short_range.tflite';
const LANDMARKER_URL = '/js/vendor/mediapipe/face_landmarker.task';
const LANDMARK_SIDE = 512;   // lado del recorte alrededor del rostro que analiza Face Landmarker

const ANALYSIS_SIDE = 640;   // lado máximo de cada pasada de detección
const MIN_SCORE = 0.55;      // confianza mínima de un rostro
const OTHER_FACE_RATIO = 0.45; // un segundo rostro cuenta si mide al menos esto respecto del principal
const OTHER_FACE_SCORE = 0.65; // y con esta confianza: por debajo aparecen caras falsas en el fondo
const HEAD_TOP = 0.2;        // la coronilla queda esto por encima del punto alto de la malla, en altos de cara
const HEAD_CENTER = 0.35;    // centro de la elipse de la cabeza, en fracción de la altura hasta la coronilla

/**
 * Objetivos en coordenadas de la plantilla (360 × 360), coherentes con las guías del PSD (pelo cerca
 * de Y = 28, hombros hacia Y = 312) y calibrados con 108 minifaces de LAqP encuadradas a mano.
 *
 * El tamaño y el centro salen de la geometría 3D del rostro, así no cambian cuando el jugador gira o
 * inclina la cabeza: el tamaño es la dispersión 3D de la malla facial y el centro horizontal es el de
 * la cabeza (detrás de la cara), no el del recuadro facial, que se corre hacia el lado al que mira.
 * Si Face Landmarker no está disponible se usan los 6 puntos de BlazeFace con las mismas reglas.
 */
export const FRAMING_TARGET = Object.freeze({
  centerX: 180,      // centro horizontal de la cabeza
  eyeY: 169,         // altura de la línea de los ojos (puntos de la malla)
  headSize: 62,      // dispersión 3D de la malla facial (RMS de los 468 puntos a su centro)
  headDepth: 1.5,    // centro de la cabeza: detrás del centro de la malla, en unidades de headSize
  fallbackEyeY: 170, // ojos de BlazeFace
  fallbackSize: 138, // media geométrica del ancho facial y de la distancia ojos/boca de BlazeFace
  hairMinY: 16,      // el punto más alto del pelo no debería quedar por encima de esto
  maxEyeY: 184,      // si el pelo no entra, primero se baja la cabeza hasta acá…
  minScaleRatio: 0.8, // …y recién después se achica, como máximo hasta esta proporción
});

export class AutoFrameError extends Error {
  constructor(message, reason, faces) { super(message); this.reason = reason; this.faces = faces; }
}

/**
 * Otros jugadores respecto de `main`: rostros bastante claros, de tamaño comparable y fuera de su cabeza
 * (las detecciones dentro del pelo o del cuello del mismo jugador son falsos positivos).
 */
export function otherPlayers(faces, main) {
  const head = { x: main.x - main.w * 0.6, y: main.y - main.h * 0.9, w: main.w * 2.2, h: main.h * 2.6 };
  const insideHead = face => {
    const cx = face.x + face.w / 2, cy = face.y + face.h / 2;
    return cx > head.x && cx < head.x + head.w && cy > head.y && cy < head.y + head.h;
  };
  return faces.filter(face => face !== main && face.w >= main.w * OTHER_FACE_RATIO && face.score >= OTHER_FACE_SCORE && !insideHead(face));
}

let detectorPromise = null;
let landmarkerPromise = null;

export async function loadVision() {
  const vision = await import(/* webpackIgnore: true */ `${LOCAL_BASE}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.isSimdSupported()
    ? { wasmLoaderPath: `${LOCAL_BASE}/wasm/vision_wasm_internal.js`, wasmBinaryPath: `${LOCAL_BASE}/wasm/vision_wasm_internal.wasm` }
    : await vision.FilesetResolver.forVisionTasks(`${CDN_BASE}/wasm`);
  return { vision, fileset };
}

/** Carga MediaPipe y el modelo una sola vez (perezoso). */
export function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { vision, fileset } = await loadVision();
      return vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.4,
      });
    })().catch(error => {
      detectorPromise = null;
      console.warn('[Miniface Studio] detector', error);
      throw new AutoFrameError('No se pudo cargar el detector de rostros. El control manual sigue disponible.', 'load');
    });
  }
  return detectorPromise;
}

/** Carga Face Landmarker una sola vez. Si falla, el encuadre sigue con los puntos de BlazeFace. */
export function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { vision, fileset } = await loadVision();
      return vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: LANDMARKER_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.3,
      });
    })().catch(error => {
      console.warn('[Miniface Studio] landmarker', error);
      return null;
    });
  }
  return landmarkerPromise;
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Máscara alfa reducida: caja de la silueta y si la imagen tiene transparencia real. */
function alphaInfo(image, width, height) {
  const k = Math.min(1, 512 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
  const canvas = canvasOf(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1, transparent = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a < 250) transparent++;
      if (a > 32) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  const hasAlpha = transparent > w * h * 0.02;
  const box = maxX < 0 ? { x: 0, y: 0, w: width, h: height }
    : { x: minX / k, y: minY / k, w: (maxX - minX + 1) / k, h: (maxY - minY + 1) / k };
  // Punto más alto opaco dentro de un rango de columnas (para no cortar el pelo).
  const topIn = (x0, x1) => {
    const a0 = Math.max(0, Math.floor(x0 * k)), a1 = Math.min(w - 1, Math.ceil(x1 * k));
    for (let y = 0; y < h; y++) for (let x = a0; x <= a1; x++) if (data[(y * w + x) * 4 + 3] > 32) return y / k;
    return null;
  };
  // La figura llega al borde inferior de la imagen (hombros cortados por el marco): entonces la imagen
  // tiene que cubrir la plantilla hasta abajo, sin dejar un hueco.
  const reachesBottom = maxY >= h - 2;
  return { hasAlpha, box, topIn, reachesBottom };
}

/** Ejecuta el detector sobre una región de la imagen y devuelve rostros en coordenadas de origen. */
function detectRegion(detector, image, region) {
  const scale = Math.min(ANALYSIS_SIDE / Math.max(region.w, region.h), 4);
  const canvas = canvasOf(region.w * scale, region.h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);
  const result = detector.detect(canvas);
  return (result.detections || []).map(det => {
    const b = det.boundingBox;
    const kp = (det.keypoints || []).map(p => ({ x: region.x + p.x * canvas.width / scale, y: region.y + p.y * canvas.height / scale }));
    return {
      score: det.categories?.[0]?.score ?? 0,
      x: region.x + b.originX / scale, y: region.y + b.originY / scale, w: b.width / scale, h: b.height / scale,
      rightEye: kp[0] || null, leftEye: kp[1] || null, keypoints: kp,
    };
  });
}

const iou = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

/**
 * Detecta rostros. Para siluetas de cuerpo completo también busca en la parte superior de la figura
 * ampliada, donde la cabeza ocupa poco espacio en la imagen completa.
 * @returns {Promise<{faces: object[], alpha: object}>}
 */
export async function detectFaces(source) {
  const detector = await loadDetector();
  const { image, width, height } = source;
  const alpha = alphaInfo(image, width, height);
  const box = alpha.box;
  const regions = [{ x: 0, y: 0, w: width, h: height }];
  for (const fraction of [0.5, 0.3]) {
    const h = box.h * fraction;
    const side = Math.max(h, Math.min(box.w, h * 1.6));
    const cx = box.x + box.w / 2;
    regions.push({ x: Math.max(0, cx - side / 2), y: box.y, w: Math.min(width, side), h: Math.min(height - box.y, h) });
  }
  const faces = [];
  for (const region of regions) {
    if (region.w < 8 || region.h < 8) continue;
    for (const face of detectRegion(detector, image, region)) {
      if (face.score < MIN_SCORE) continue;
      const same = faces.find(other => iou(other, face) > 0.25);
      if (!same) faces.push(face);
      else if (face.score > same.score) Object.assign(same, face);
    }
  }
  faces.sort((a, b) => b.w * b.h - a.w * a.h);
  return { faces, alpha };
}

const LEFT_EYE = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153, 154, 155];
const RIGHT_EYE = [263, 362, 387, 386, 385, 384, 398, 373, 374, 380, 381, 382];

/** Malla facial sobre un recorte ampliado alrededor del rostro, en píxeles de la imagen; z usa la misma escala que x. */
function meshPoints(landmarker, image, face) {
  const side = Math.max(face.w, face.h) * 2.2;
  const left = face.x + face.w / 2 - side / 2, top = face.y + face.h / 2 - side / 2;
  const canvas = canvasOf(LANDMARK_SIDE, LANDMARK_SIDE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, left, top, side, side, 0, 0, LANDMARK_SIDE, LANDMARK_SIDE);
  const marks = landmarker.detect(canvas).faceLandmarks?.[0];
  if (!marks || marks.length < 468) return null;
  return marks.slice(0, 468).map(p => [left + p.x * side, top + p.y * side, p.z * side]);
}

/** Centro de la malla, tamaño y normal de la cara, orientada hacia la punta de la nariz. */
function meshPose(P) {
  const c = [0, 1, 2].map(k => P.reduce((sum, p) => sum + p[k], 0) / P.length);
  const size = Math.sqrt(P.reduce((sum, p) => sum + (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2, 0) / P.length);
  // Normal de la cara: ojo a ojo × frente a mentón.
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const a = sub(P[263], P[33]), b = sub(P[152], P[10]);
  let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const length = Math.hypot(...n) || 1;
  n = n.map(v => v / length);
  const nose = sub(P[1], c);
  if (nose[0] * n[0] + nose[1] * n[1] + nose[2] * n[2] < 0) n = n.map(v => -v);
  return { c, size, n };
}

/**
 * Mide el rostro con Face Landmarker sobre un recorte ampliado a su alrededor.
 * @returns {{anchorX: number, anchorY: number, size: number} | null} en píxeles de la imagen
 */
function measureLandmarks(landmarker, image, face, target = FRAMING_TARGET) {
  const P = meshPoints(landmarker, image, face);
  if (!P) return null;
  const { c, size, n } = meshPose(P);
  const eyeY = ids => ids.reduce((sum, i) => sum + P[i][1], 0) / ids.length;
  return { anchorX: c[0] - n[0] * target.headDepth * size, anchorY: (eyeY(LEFT_EYE) + eyeY(RIGHT_EYE)) / 2, size };
}

/**
 * Forma esperada de la cabeza a partir de la malla: una elipse centrada detrás de la cara.
 * @returns {{cx, cy, ux, uy, a, b} | null} centro, eje «arriba» (unitario) y semiejes de la elipse (a de ancho, b de alto)
 */
export async function measureHead(source, face) {
  const landmarker = await loadLandmarker();
  if (!landmarker) return null;
  const P = meshPoints(landmarker, source.image, face);
  if (!P) return null;
  const { c, size, n } = meshPose(P);
  const forehead = P[10], chin = P[152];
  const faceHeight = Math.hypot(forehead[0] - chin[0], forehead[1] - chin[1]) || 1;
  const ux = (forehead[0] - chin[0]) / faceHeight, uy = (forehead[1] - chin[1]) / faceHeight;
  // El centro del cráneo queda detrás de la malla y a la altura de la frente.
  const back = FRAMING_TARGET.headDepth * size;
  const midX = c[0] - n[0] * back, midY = c[1] - n[1] * back;
  const along = (p, ax, ay) => (p[0] - midX) * ax + (p[1] - midY) * ay;
  const height = along(forehead, ux, uy) + faceHeight * HEAD_TOP;
  const cx = midX + ux * height * HEAD_CENTER, cy = midY + uy * height * HEAD_CENTER;
  const sideX = -uy, sideY = ux;
  const a = Math.max(Math.abs(along(P[234], sideX, sideY)), Math.abs(along(P[454], sideX, sideY)));
  return { cx, cy, ux, uy, a, b: height * (1 - HEAD_CENTER) };
}

/** Medida con los 6 puntos de BlazeFace, si Face Landmarker no está disponible. */
function measureKeypoints(face) {
  const kp = face.keypoints || [];
  const eyes = face.rightEye && face.leftEye ? { x: (face.rightEye.x + face.leftEye.x) / 2, y: (face.rightEye.y + face.leftEye.y) / 2 } : null;
  let anchorX = face.x + face.w / 2, size = face.w * 0.79;
  if (eyes && kp.length >= 6) {
    // Recuadro y orejas promediados: se corre menos hacia el lado al que mira el jugador.
    anchorX = (anchorX + (kp[4].x + kp[5].x) / 2) / 2;
    const eyeToEye = Math.hypot(face.rightEye.x - face.leftEye.x, face.rightEye.y - face.leftEye.y);
    const eyeToMouth = Math.hypot(eyes.x - kp[3].x, eyes.y - kp[3].y);
    size = Math.sqrt(face.w * Math.hypot(eyeToEye, eyeToMouth));
  }
  return { anchorX, anchorY: eyes ? eyes.y : face.y + face.h * 0.38, size, fallback: true };
}

/**
 * Calcula el encuadre a partir de la medida del rostro, con dos reglas:
 * - pelo: si quedaría cortado arriba, primero baja la cabeza (hasta maxEyeY) y después la achica;
 * - borde inferior: si la figura llega al borde de la imagen, la imagen cubre la plantilla hasta abajo.
 * @returns {{x: number, y: number, scale: number, hairLimited: boolean, bottomFilled: boolean}}
 */
export function computeFraming(measure, face, alpha, target = FRAMING_TARGET) {
  const { width, height } = alpha.size;
  const { anchorX, anchorY } = measure;
  let scale = (measure.fallback ? target.fallbackSize : target.headSize) / measure.size;
  let eyeY = measure.fallback ? target.fallbackEyeY : target.eyeY;
  let hairLimited = false, bottomFilled = false;
  if (alpha.hasAlpha) {
    const hairTop = alpha.topIn(face.x - face.w * 0.6, face.x + face.w * 1.6);
    if (hairTop != null && hairTop < anchorY) {
      const hair = eyeY - (anchorY - hairTop) * scale;
      if (hair < target.hairMinY) {
        hairLimited = true;
        eyeY = Math.max(eyeY, Math.min(target.maxEyeY, eyeY + target.hairMinY - hair));
        const fit = (eyeY - target.hairMinY) / (anchorY - hairTop);
        if (fit < scale) scale = Math.max(fit, scale * target.minScaleRatio);
      }
    }
  }
  if (alpha.reachesBottom && height > anchorY) {
    let bottom = eyeY + (height - anchorY) * scale;
    if (bottom < TEMPLATE.size) {
      bottomFilled = true;
      const shift = Math.max(0, Math.min(target.maxEyeY - eyeY, TEMPLATE.size - bottom));
      eyeY += shift; bottom += shift;
      if (bottom < TEMPLATE.size) scale = (TEMPLATE.size - eyeY) / (height - anchorY);
    }
  }
  // Centro de la imagen (lo que guarda el editor) para que el ancla caiga en el objetivo.
  const x = target.centerX - (anchorX - width / 2) * scale;
  const y = eyeY - (anchorY - height / 2) * scale;
  return { x, y, scale, hairLimited, bottomFilled };
}

/**
 * Analiza una fuente del editor y devuelve el encuadre propuesto o un error explicativo.
 * No aplica nada: quien llama decide.
 */
export async function autoFrame(source, { face = null } = {}) {
  const { faces, alpha } = await detectFaces(source);
  alpha.size = { width: source.width, height: source.height };
  if (!faces.length) throw new AutoFrameError('No se detectó ningún rostro. Ajustá la imagen manualmente.', 'none');
  const main = face || faces[0];
  if (!face) {
    const others = otherPlayers(faces, main);
    if (others.length) throw new AutoFrameError(`Se detectaron ${others.length + 1} rostros. Encuadrá manualmente o usá una imagen con un solo jugador.`, 'multiple', [main, ...others]);
  }
  const landmarker = await loadLandmarker();
  let measure = null;
  if (landmarker) {
    try { measure = measureLandmarks(landmarker, source.image, main); }
    catch (error) { console.warn('[Miniface Studio] landmarks', error); }
  }
  measure ||= measureKeypoints(main);
  return { ...computeFraming(measure, main, alpha), face: main, landmarks: !measure.fallback, hasAlpha: alpha.hasAlpha, faces: faces.length };
}

export { TEMPLATE };
