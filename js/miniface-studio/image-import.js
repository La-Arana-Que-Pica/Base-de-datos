// Importación y decodificación de imágenes (archivo, arrastrar y soltar, portapapeles).
// Se decodifica con las APIs del navegador; en GIF animados se usa el primer fotograma.

export const ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/jpeg', 'image/gif', 'image/avif', 'image/bmp'];
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(',') + ',.png,.webp,.jpg,.jpeg,.gif,.avif,.bmp';
const EXTENSIONS = /\.(png|webp|jpe?g|gif|avif|bmp)$/i;
const MAX_SIDE = 8192;

export class ImportError extends Error {}

export function isSupportedImage(file) {
  if (!file) return false;
  if (file.type) return ACCEPTED_TYPES.includes(file.type.toLowerCase());
  return EXTENSIONS.test(file.name || '');
}

/** Decodifica un Blob y devuelve la fuente que usa el editor. */
export async function decodeImage(blob, name = '') {
  if (!blob || !blob.size) throw new ImportError('La imagen está vacía.');
  if (blob.type && !blob.type.startsWith('image/')) throw new ImportError('El archivo no es una imagen.');
  if (blob.type && !ACCEPTED_TYPES.includes(blob.type.toLowerCase())) {
    throw new ImportError(`Formato no compatible (${blob.type}). Usá PNG, WebP, JPG o GIF.`);
  }
  let image;
  try {
    image = await createImageBitmap(blob);
  } catch {
    image = await decodeWithElement(blob);
  }
  const width = image.width, height = image.height;
  if (!width || !height) throw new ImportError('No se pudo leer el tamaño de la imagen.');
  if (width > MAX_SIDE || height > MAX_SIDE) {
    image.close?.();
    throw new ImportError(`La imagen es demasiado grande (máximo ${MAX_SIDE} px por lado).`);
  }
  return {
    image, width, height,
    name: name || blob.name || 'imagen del portapapeles',
    type: blob.type || '',
    release() { image.close?.(); },
  };
}

function decodeWithElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ImportError('No se pudo decodificar la imagen. Puede estar dañada o en un formato no compatible.')); };
    img.src = url;
  });
}

/** Extrae una imagen de un evento paste o drop (DataTransfer). */
export function imageFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return null;
  for (const item of dataTransfer.items || []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of dataTransfer.files || []) if (file.type.startsWith('image/') || EXTENSIONS.test(file.name)) return file;
  return null;
}

/** Busca la URL de una imagen en HTML o texto copiado (alternativa cuando no hay bits de imagen). */
export function imageUrlFromDataTransfer(dataTransfer) {
  const html = dataTransfer?.getData?.('text/html');
  if (html) {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match) return match[1].replace(/&amp;/g, '&');
  }
  const text = (dataTransfer?.getData?.('text/uri-list') || dataTransfer?.getData?.('text/plain') || '').trim();
  return /^https?:\/\/\S+$/i.test(text) ? text : null;
}

export async function fetchImageUrl(url) {
  let response;
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  } catch {
    throw new ImportError('Se copió un enlace a la imagen, pero el sitio de origen no permite leerla. Usá «Copiar imagen» en lugar de «Copiar dirección de la imagen».');
  }
  if (!response.ok) throw new ImportError(`No se pudo descargar la imagen copiada (HTTP ${response.status}).`);
  return response.blob();
}

/** Lee una imagen con la API asíncrona del portapapeles (botón «Pegar»). */
export async function readClipboardImage() {
  if (!navigator.clipboard?.read) {
    throw new ImportError('Tu navegador no permite leer imágenes con este botón. Presioná Ctrl + V (o ⌘ + V) dentro de la página.');
  }
  let items;
  try {
    items = await navigator.clipboard.read();
  } catch (error) {
    if (error?.name === 'NotAllowedError') throw new ImportError('El navegador bloqueó el acceso al portapapeles. Permitilo o presioná Ctrl + V (⌘ + V).');
    throw new ImportError('No se pudo leer el portapapeles. Probá con Ctrl + V (⌘ + V).');
  }
  for (const item of items) {
    const type = item.types.find(t => ACCEPTED_TYPES.includes(t)) || item.types.find(t => t.startsWith('image/'));
    if (type) return item.getType(type);
  }
  for (const item of items) {
    if (item.types.includes('text/html')) {
      const html = await (await item.getType('text/html')).text();
      const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match) return fetchImageUrl(match[1].replace(/&amp;/g, '&'));
    }
  }
  throw new ImportError('El portapapeles no contiene una imagen. Copiá la miniface con clic derecho → «Copiar imagen».');
}
