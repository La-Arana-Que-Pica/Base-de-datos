// Renderizado compartido por la vista previa y la exportación: la misma transformación
// se aplica en ambos casos para que el archivo coincida con lo que se ve en pantalla.

import { TEMPLATE } from './template.js';

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

/** Dibuja solo la imagen del jugador. unit = píxeles de salida por unidad de plantilla. */
export function drawPlayer(ctx, state, unit, originX = 0, originY = 0) {
  if (!state.source) return;
  const { image, width, height } = state.source;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(unit * state.scale, 0, 0, unit * state.scale, originX + state.x * unit, originY + state.y * unit);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

/**
 * Composición final (sin referencias) a un tamaño cuadrado dado.
 * Para tamaños menores que la plantilla se renderiza con sobremuestreo y se reduce
 * promediando áreas en alfa premultiplicado: buena calidad y resultado determinista.
 * @returns {ImageData}
 */
export function renderComposite(state, size, supersample = 1) {
  const renderSize = size * supersample;
  const canvas = createCanvas(renderSize, renderSize);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  drawPlayer(ctx, state, renderSize / TEMPLATE.size);
  const full = ctx.getImageData(0, 0, renderSize, renderSize);
  return supersample > 1 ? downsampleArea(full, supersample) : full;
}

export function downsampleArea(imageData, factor) {
  const { width, height, data } = imageData;
  const outW = width / factor, outH = height / factor;
  const out = new ImageData(outW, outH);
  const area = factor * factor;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        let i = ((y * factor + sy) * width + x * factor) * 4;
        for (let sx = 0; sx < factor; sx++, i += 4) {
          const alpha = data[i + 3];
          r += data[i] * alpha; g += data[i + 1] * alpha; b += data[i + 2] * alpha; a += alpha;
        }
      }
      const o = (y * outW + x) * 4;
      if (a) {
        out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = Math.round(a / area);
    }
  }
  return out;
}

export async function imageDataToPngBlob(imageData) {
  const canvas = createCanvas(imageData.width, imageData.height);
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo generar el PNG.'))), 'image/png'));
}

/**
 * Vista del área de trabajo: el lienzo es exactamente el área exportable.
 * Tablero de transparencia de fondo y la imagen recortada a ese cuadrado.
 * @param {{checker: CanvasPattern|null}} view
 */
export function renderStage(canvas, state, view) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (view.checker) {
    ctx.fillStyle = view.checker;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawPlayer(ctx, state, canvas.width / TEMPLATE.size);
}

export function createCheckerPattern(ctx, cell) {
  const tile = createCanvas(cell * 2, cell * 2);
  const t = tile.getContext('2d');
  t.fillStyle = '#c9d1d4'; t.fillRect(0, 0, cell * 2, cell * 2);
  t.fillStyle = '#eef2f3'; t.fillRect(0, 0, cell, cell); t.fillRect(cell, cell, cell, cell);
  return ctx.createPattern(tile, 'repeat');
}

/**
 * Codifica ImageData en un formato de imagen del navegador. Los formatos sin transparencia
 * (JPEG) se componen sobre `background`.
 */
export async function imageDataToBlob(imageData, mime, { quality = 0.92, background = '#ffffff' } = {}) {
  const source = createCanvas(imageData.width, imageData.height);
  source.getContext('2d').putImageData(imageData, 0, 0);
  let canvas = source;
  if (mime === 'image/jpeg') {
    canvas = createCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, imageData.width, imageData.height);
    ctx.drawImage(source, 0, 0);
  }
  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: mime, quality })
    : await new Promise(resolve => canvas.toBlob(resolve, mime, quality));
  if (!blob || blob.type !== mime) throw new Error(`Este navegador no puede generar ${mime.replace('image/', '').toUpperCase()}.`);
  return blob;
}
