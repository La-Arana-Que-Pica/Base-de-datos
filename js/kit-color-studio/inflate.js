// Descompresión con las APIs nativas (DecompressionStream). Sin dependencias.
// `limit` corta la lectura si la salida supera el tamaño esperado (protección contra bombas de compresión).

export class SizeLimitError extends Error {}

export async function inflate(bytes, format = 'deflate', limit = Infinity) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir datos (falta DecompressionStream). Actualizalo para usar Kit Color Studio.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return readLimited(stream, limit);
}

export async function readLimited(stream, limit = Infinity) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        reader.cancel().catch(() => {});
        throw new SizeLimitError('Los datos descomprimidos superan el tamaño declarado.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
