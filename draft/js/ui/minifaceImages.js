// Minifaces con el nombre de archivo de PES 2018: player_<ID>.webp (en el juego, .dds). Los IDs «inflados»
// de datapacks o jugadores creados (por ejemplo 1073857291) usan el ID real: ID - 0x40000000 = 115467.
// Se resuelve solo en la interfaz: catálogos, snapshots, progreso guardado y la autoridad del servidor
// no cambian. Mientras queden archivos con el nombre anterior (<ID>.webp), se prueban como respaldo; si
// ninguno existe, sigue el onerror habitual (default.webp).
// Debe coincidir con js/minifaces.js y Herramientas/Generadores/miniface_paths.py.
export const INFLATED_ID_OFFSET = 0x40000000;
const LEGACY_FALLBACK = true;
const PLAYER_IMAGE_RE = /^(|.*\/)img\/(players|pes_original_minifaces)\/(player_)?(\d+)\.webp([?#].*)?$/i;

export function gameId(playerId) {
  const value = String(playerId ?? '').trim();
  if (!/^\d+$/.test(value)) return value;
  const number = Number(value);
  return number >= INFLATED_ID_OFFSET && number < INFLATED_ID_OFFSET * 2 ? String(number - INFLATED_ID_OFFSET) : String(number);
}

/** Rutas a probar en orden para una miniface, o null si la ruta no es de una miniface. */
export function minifaceCandidates(source) {
  const match = String(source || '').match(PLAYER_IMAGE_RE);
  if (!match) return null;
  const [, root, folder, prefixed, digits, suffix = ''] = match;
  const game = prefixed ? String(Number(digits)) : gameId(digits);
  const dir = `${root}img/${folder}/`;
  const list = [`${dir}player_${game}.webp${suffix}`];
  if (LEGACY_FALLBACK) {
    if (!prefixed) list.push(`${dir}${digits}.webp${suffix}`);
    else {
      list.push(`${dir}${game}.webp${suffix}`);
      if (Number(game) < INFLATED_ID_OFFSET) list.push(`${dir}${Number(game) + INFLATED_ID_OFFSET}.webp${suffix}`);
    }
  }
  return [...new Set(list)];
}

function resolve(image) {
  const source = image.getAttribute('src');
  if (!source || image.dataset.minifaceSrc === source) return;
  const list = minifaceCandidates(source);
  if (!list) return;
  image.dataset.minifaceFallbacks = JSON.stringify(list.slice(1));
  image.dataset.minifaceSrc = list[0];
  if (source !== list[0]) image.setAttribute('src', list[0]);
}

let installed = false;

export function installMinifaceImages(doc = globalThis.document) {
  if (installed || !doc?.documentElement || typeof MutationObserver !== 'function') return;
  installed = true;
  const scan = node => {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'IMG') resolve(node);
    node.querySelectorAll?.('img[src]').forEach(resolve);
  };
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') { if (mutation.target.tagName === 'IMG') resolve(mutation.target); }
      else mutation.addedNodes.forEach(scan);
    }
  }).observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  // Antes del onerror propio de cada imagen: si queda un respaldo, se prueba; si no, sigue el onerror.
  doc.addEventListener('error', event => {
    const image = event.target;
    if (image?.tagName !== 'IMG' || !image.dataset.minifaceFallbacks) return;
    let pending = [];
    try { pending = JSON.parse(image.dataset.minifaceFallbacks); } catch { pending = []; }
    if (!pending.length) return;
    const next = pending.shift();
    image.dataset.minifaceFallbacks = JSON.stringify(pending);
    image.dataset.minifaceSrc = next;
    event.stopImmediatePropagation();
    image.setAttribute('src', next);
  }, true);
  scan(doc.documentElement);
}
