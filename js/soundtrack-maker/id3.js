// Título y artista de un MP3: etiquetas ID3v2 (TIT2/TPE1, versiones 2.2–2.4), ID3v1 o, si no hay, el nombre del archivo.

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

function decodeText(bytes) {
  if (!bytes.length) return '';
  const enc = bytes[0];
  const body = bytes.subarray(1);
  let text;
  if (enc === 0) text = latin1.decode(body);
  else if (enc === 3) text = utf8.decode(body);
  else {
    let le = enc === 1; // UTF-16 con BOM (1) o UTF-16BE (2)
    let start = 0;
    if (enc === 1 && body.length >= 2) {
      if (body[0] === 0xfe && body[1] === 0xff) { le = false; start = 2; }
      else if (body[0] === 0xff && body[1] === 0xfe) { le = true; start = 2; }
    }
    text = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body.subarray(start, start + ((body.length - start) & ~1)));
  }
  return text.split('\0')[0].trim();
}

const synchsafe = (b, p) => ((b[p] & 0x7f) << 21) | ((b[p + 1] & 0x7f) << 14) | ((b[p + 2] & 0x7f) << 7) | (b[p + 3] & 0x7f);

/** Lee TIT2/TPE1 de una cabecera ID3v2. `bytes`: al menos el comienzo del archivo. */
export function readId3v2(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return {};
  const version = bytes[3];
  const flags = bytes[5];
  const end = Math.min(bytes.length, 10 + synchsafe(bytes, 6));
  let p = 10;
  if (flags & 0x40 && version >= 3) p += version === 4 ? synchsafe(bytes, p) : 4 + ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) ;
  const out = {};
  const ids = version === 2 ? { TT2: 'title', TP1: 'artist' } : { TIT2: 'title', TPE1: 'artist' };
  const idLen = version === 2 ? 3 : 4;
  const headLen = version === 2 ? 6 : 10;
  while (p + headLen <= end) {
    const id = String.fromCharCode(...bytes.subarray(p, p + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const size = version === 2 ? (bytes[p + 3] << 16) | (bytes[p + 4] << 8) | bytes[p + 5]
      : version === 4 ? synchsafe(bytes, p + 4) : ((bytes[p + 4] << 24) | (bytes[p + 5] << 16) | (bytes[p + 6] << 8) | bytes[p + 7]) >>> 0;
    const start = p + headLen;
    if (size <= 0 || start + size > end) break;
    if (ids[id] && !out[ids[id]]) out[ids[id]] = decodeText(bytes.subarray(start, start + size));
    p = start + size;
  }
  return out;
}

/** ID3v1 (últimos 128 bytes). */
export function readId3v1(tail) {
  if (tail.length < 128) return {};
  const t = tail.subarray(tail.length - 128);
  if (t[0] !== 0x54 || t[1] !== 0x41 || t[2] !== 0x47) return {};
  const field = (a, b) => latin1.decode(t.subarray(a, b)).split('\0')[0].trim();
  return { title: field(3, 33), artist: field(33, 63) };
}

/** «Artista - Título.mp3» → {artist, title}; descarta sufijos numéricos de descargas («Tema - 1792079237.mp3»). */
export function metaFromFileName(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const parts = base.split(/\s+[-–—]\s+/).filter(Boolean);
  if (parts.length >= 2 && /^\d{5,}$/.test(parts[parts.length - 1])) parts.pop();
  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' - ') };
  return { title: parts[0] || base, artist: '' };
}

/** Metadatos de un archivo (File/Blob con `name`). Lee solo el principio y el final. */
export async function readSongMeta(file) {
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  let meta = readId3v2(head);
  if (!meta.title || !meta.artist) {
    const v1 = readId3v1(new Uint8Array(await file.slice(Math.max(0, file.size - 128)).arrayBuffer()));
    meta = { title: meta.title || v1.title, artist: meta.artist || v1.artist };
  }
  const fromName = metaFromFileName(file.name || '');
  return { title: meta.title || fromName.title, artist: meta.artist || fromName.artist || '' };
}
