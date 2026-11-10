// Archivo de proyecto de Soundtrack Maker (.laqpst): guarda la lista a medio hacer para seguir otro día.
// Formato: «LAQPST01» · u32 (little-endian) largo del JSON · JSON (UTF-8) · audio de cada canción, uno tras otro.
// El audio se guarda tal cual (MP3 original o HCA tomado de un CPK), sin copiarlo a memoria: se arma un Blob por partes.

export const PROJECT_EXTENSION = '.laqpst';
const MAGIC = 'LAQPST01';
const FORMAT = 'laqp-soundtrack-project';
const utf8 = new TextEncoder();

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ProjectError extends Error {}

const KEPT_FIELDS = ['title', 'artist', 'name', 'type', 'hash', 'duration', 'origin', 'numSamples', 'sampleRate', 'channels',
  'playlistId', 'offset', 'remainTime', 'fadeoutTime', 'fadeoutWaitTime', 'error'];

/**
 * @param {{songs: {file: Blob, hca: boolean}[], cpkName?: string}} project
 * @returns {Blob}
 */
export function saveProject({ songs, cpkName = '' }, { date = new Date() } = {}) {
  let dataOffset = 0;
  const entries = songs.map(song => {
    const entry = { kind: song.hca ? 'hca' : 'mp3', dataOffset, dataSize: song.file.size };
    for (const key of KEPT_FIELDS) if (song[key] !== undefined && song[key] !== null && song[key] !== '') entry[key] = song[key];
    if (!song.hca && song.file.type) entry.type = song.file.type;
    dataOffset += song.file.size;
    return entry;
  });
  const json = utf8.encode(JSON.stringify({ format: FORMAT, version: 1, created: date.toISOString(), cpkName, songs: entries }));
  const head = new Uint8Array(12);
  head.set(utf8.encode(MAGIC), 0);
  new DataView(head.buffer).setUint32(8, json.length, true);
  return new Blob([head, json, ...songs.map(s => s.file)], { type: 'application/octet-stream' });
}

/**
 * @param {Blob} blob
 * @returns {Promise<{cpkName: string, created: string, songs: object[]}>} canciones con `file` (File para MP3, Blob para HCA)
 */
export async function openProject(blob) {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (head.length < 12 || new TextDecoder().decode(head.subarray(0, 8)) !== MAGIC) {
    throw new ProjectError('El archivo no es un proyecto de Soundtrack Maker (.laqpst).');
  }
  const jsonLength = new DataView(head.buffer).getUint32(8, true);
  if (12 + jsonLength > blob.size) throw new ProjectError('El proyecto está incompleto o dañado.');
  let meta;
  try {
    meta = JSON.parse(new TextDecoder().decode(await blob.slice(12, 12 + jsonLength).arrayBuffer()));
  } catch {
    throw new ProjectError('El proyecto está dañado: no se pudo leer su contenido.');
  }
  if (meta?.format !== FORMAT || !Array.isArray(meta.songs)) throw new ProjectError('El archivo no es un proyecto de Soundtrack Maker (.laqpst).');
  if (meta.version > 1) throw new ProjectError('El proyecto se guardó con una versión más nueva de Soundtrack Maker: recargá la página.');
  const base = 12 + jsonLength;
  const songs = meta.songs.map(entry => {
    const { kind, dataOffset, dataSize, ...fields } = entry;
    if (!Number.isInteger(dataOffset) || !Number.isInteger(dataSize) || dataOffset < 0 || base + dataOffset + dataSize > blob.size) {
      throw new ProjectError('El proyecto está incompleto: falta el audio de alguna canción.');
    }
    const data = blob.slice(base + dataOffset, base + dataOffset + dataSize);
    const file = kind === 'hca' ? data : new File([data], fields.name || 'cancion.mp3', { type: fields.type || 'audio/mpeg' });
    return { ...fields, title: fields.title ?? '', artist: fields.artist ?? '', file, hca: kind === 'hca' };
  });
  return { cpkName: typeof meta.cpkName === 'string' ? meta.cpkName : '', created: meta.created || '', songs };
}

/** Orden alfabético en español (sin distinguir mayúsculas ni tildes; «2» antes que «10»). */
export function sortSongs(songs, by = 'title') {
  const other = by === 'title' ? 'artist' : 'title';
  const compare = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true, ignorePunctuation: true });
  return [...songs].sort((a, b) => compare((a[by] || '').trim(), (b[by] || '').trim()) || compare((a[other] || '').trim(), (b[other] || '').trim()));
}
