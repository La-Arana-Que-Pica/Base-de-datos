// Abre un CPK con soundtrack (BGM_P2P.acb/.awb y Playlist.xml) y devuelve sus canciones para seguir editándolas.
// El audio no se recodifica: cada canción queda como un rango del archivo original y se copia tal cual al generar.

import { readUtf } from './utf.js';
import { readCpkIndex, entryBlob, rowsOf } from './cpk-reader.js';
import { readHcaInfo } from './hca-decoder.js';

const SKIPPED_CUES = new Set(['BGM0_LIC_CREDIT', 'req_playgo_link']);
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());

/** Error con un mensaje pensado para mostrarle al usuario. */
export class SoundtrackLoadError extends Error {}

function decodeText(b) {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  return new TextDecoder('utf-8').decode(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b);
}

const unescapeXml = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, e) => {
  const k = e.toLowerCase();
  if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k] ?? whole;
});

function attributes(tag) {
  const out = {};
  for (const m of tag.matchAll(/([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = unescapeXml(m[2] ?? m[3] ?? '');
  return out;
}

/** Lista de canciones de un Playlist.xml, en el orden de la CueList; null si no se entiende el archivo. */
export function parsePlaylistXml(bytes) {
  const text = decodeText(bytes).replace(/<!--[\s\S]*?-->/g, '');
  const block = /<CueList\b[^>]*>([\s\S]*?)<\/CueList>/.exec(text);
  if (!/<Playlist\b/.test(text) || !block) return null;
  const labels = [];
  for (const m of block[1].matchAll(/<Label\b[^>]*>/g)) {
    const a = attributes(m[0]);
    if (!a.CueName || a.Target === 'PS3') continue; // el juego ignora las entradas de PS3
    const int = (v, fallback) => (v !== undefined && /^-?\d+$/.test(v.trim()) ? Number(v) : fallback);
    labels.push({
      cueName: a.CueName, title: a.Title ?? '', artist: a.Artist ?? '', playlistId: int(a.Id), offset: int(a.Offset),
      remainTime: int(a.RemainTimeForFadeoutStart), fadeoutTime: int(a.FadeoutTime), fadeoutWaitTime: int(a.FadeoutWaitTime),
    });
  }
  return labels;
}

const u16List = b => Array.from({ length: (b?.length || 0) >> 1 }, (_, i) => (b[2 * i] << 8) | b[2 * i + 1]);

/** Por cada cue del ACB, las ondas que reproduce: cue → sequence → track → noteOn → synth → waveform. */
export function cueWaves(acbBytes) {
  const root = rowsOf(readUtf(acbBytes))[0];
  const T = name => (root[name]?.table ? rowsOf(root[name].table) : []);
  const cues = T('CueTable'), seqs = T('SequenceTable'), tracks = T('TrackTable'), synths = T('SynthTable');
  const waves = T('WaveformTable');
  const events = T('TrackEventTable').length ? T('TrackEventTable') : T('CommandTable');
  const names = T('CueNameTable');

  const synthWaves = (index, depth = 0) => {
    const items = u16List(synths[index]?.ReferenceItems);
    const found = [];
    for (let k = 0; k + 1 < items.length; k += 2) {
      if (items[k] === 1) found.push(items[k + 1]);
      else if (items[k] === 2 && depth < 4) found.push(...synthWaves(items[k + 1], depth + 1));
    }
    return found;
  };
  const trackWaves = index => {
    const command = events[tracks[index]?.EventIndex]?.Command;
    const found = [];
    for (let p = 0; command && p + 3 <= command.length;) {
      const code = (command[p] << 8) | command[p + 1], size = command[p + 2];
      if (code === 0x07d0 && size >= 4) {
        const kind = (command[p + 3] << 8) | command[p + 4], target = (command[p + 5] << 8) | command[p + 6];
        if (kind === 2) found.push(...synthWaves(target));
        else if (kind === 1) found.push(target);
      }
      p += 3 + size;
    }
    return found;
  };
  const wavesOfCue = cue => {
    if (cue.ReferenceType === 3) return u16List(seqs[cue.ReferenceIndex]?.TrackIndex).flatMap(trackWaves);
    if (cue.ReferenceType === 2) return synthWaves(cue.ReferenceIndex);
    if (cue.ReferenceType === 1) return [cue.ReferenceIndex];
    return [];
  };
  return names.map(n => ({
    name: n.CueName,
    waves: wavesOfCue(cues[n.CueIndex] || {}).map(w => waves[w]).filter(Boolean)
      .map(w => ({ streaming: Boolean(w.Streaming), awbId: w.StreamAwbId ?? w.Id })),
  }));
}

/** Pistas del AWB: Map(id → { start, size }). */
async function readAfs2(awb) {
  const head = await bytesOf(awb.slice(0, 16));
  if (String.fromCharCode(...head.subarray(0, 4)) !== 'AFS2') throw new SoundtrackLoadError('BGM_P2P.awb no tiene un formato conocido.');
  const view = new DataView(head.buffer, head.byteOffset, 16);
  const offsetSize = head[5], idSize = view.getUint16(6, true), count = view.getUint32(8, true), align = view.getUint16(12, true) || 1;
  const table = await bytesOf(awb.slice(16, 16 + count * idSize + (count + 1) * offsetSize));
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const offset = i => {
    const p = count * idSize + i * offsetSize;
    return offsetSize === 2 ? tv.getUint16(p, true) : tv.getUint32(p, true);
  };
  const tracks = new Map();
  for (let i = 0; i < count; i++) {
    const id = idSize === 2 ? tv.getUint16(i * 2, true) : tv.getUint32(i * 4, true);
    const start = Math.ceil(offset(i) / align) * align;
    tracks.set(id, { start, size: offset(i + 1) - start });
  }
  return tracks;
}

const findEntry = (index, suffix, fileName) => {
  const lower = index.map(e => [e.path.toLowerCase(), e]);
  return (lower.find(([p]) => p.endsWith(suffix)) ?? lower.find(([p]) => p === fileName || p.endsWith('/' + fileName)))?.[1];
};

async function makeSong(awb, track, fields) {
  const song = { ...fields, hca: null, numSamples: 0, sampleRate: 0, channels: 0, duration: 0, error: '' };
  if (!track) return { ...song, error: 'Su audio no está en BGM_P2P.awb.' };
  song.hca = awb.slice(track.start, track.start + track.size);
  try {
    const info = readHcaInfo(await bytesOf(song.hca.slice(0, 512)));
    Object.assign(song, { numSamples: info.sampleCount, sampleRate: info.sampleRate, channels: info.channelCount, duration: info.sampleCount / info.sampleRate });
    if (info.encryptionType !== 0 && info.encryptionType !== 1) song.error = 'Su audio está cifrado con una clave: reemplazala.';
  } catch {
    song.error = 'Su audio no es un HCA válido: reemplazala.';
  }
  return song;
}

/**
 * @param {Blob} blob el CPK
 * @returns {Promise<{songs: object[], xml: 'ok'|'missing'|'invalid'|'unused', acb: boolean, otherFiles: number, warnings: string[], overLimit: number}>}
 */
export async function loadSoundtrack(blob, { maxSongs = 32 } = {}) {
  const index = await readCpkIndex(blob);
  const entries = {
    acb: findEntry(index, 'sound/menu/acb/bgm_p2p.acb', 'bgm_p2p.acb'),
    awb: findEntry(index, 'sound/menu/awb/bgm_p2p.awb', 'bgm_p2p.awb'),
    xml: findEntry(index, 'sound/menu/playlist/playlist.xml', 'playlist.xml'),
  };
  const otherFiles = index.length - [entries.acb, entries.awb, entries.xml].filter(Boolean).length;
  if (!entries.awb) {
    throw new SoundtrackLoadError(`Este CPK no trae el audio del soundtrack (BGM_P2P.awb). ${entries.acb || entries.xml ? 'Tiene solo una parte de los archivos' : `Tiene ${index.length} archivo(s), pero ninguno de música del menú`}.`);
  }
  const awb = await entryBlob(blob, entries.awb);
  const tracks = await readAfs2(awb);
  const warnings = [];
  const generic = i => `Pista ${String(i + 1).padStart(2, '0')}`;

  let labels = null;
  let xml = 'missing';
  if (entries.xml) {
    labels = parsePlaylistXml(await bytesOf(await entryBlob(blob, entries.xml)));
    xml = labels && labels.length ? 'ok' : 'invalid';
    if (xml === 'invalid') labels = null;
  }

  let songs = [];
  if (!entries.acb) {
    // Sin ACB no se sabe qué título corresponde a cada pista: se cargan en orden y los nombres se completan a mano.
    if (entries.xml) xml = 'unused';
    let i = 0;
    for (const [id, track] of [...tracks].sort((a, b) => a[0] - b[0])) {
      songs.push(await makeSong(awb, track, { cueName: `pista_${id}`, title: generic(i++), artist: '' }));
    }
  } else {
    const cues = new Map(cueWaves(await bytesOf(await entryBlob(blob, entries.acb))).map(c => [c.name, c]));
    const used = new Set();
    const songFrom = (fields, cue) => {
      const wave = cue.waves[0];
      if (!wave.streaming) warnings.push(`«${fields.title || cue.name}» no está en BGM_P2P.awb: se omitió.`);
      return wave.streaming ? makeSong(awb, tracks.get(wave.awbId), fields) : null;
    };
    for (const label of labels ?? []) {
      const cue = cues.get(label.cueName);
      if (!cue || !cue.waves.length) {
        warnings.push(`«${label.title || label.cueName}» figura en Playlist.xml, pero su audio no está en el banco: se omitió.`);
        continue;
      }
      used.add(label.cueName);
      const song = await songFrom(label, cue);
      if (song) songs.push(song);
    }
    // Cues con audio que la lista no nombra (o todas, si no hay lista).
    const rest = [...cues.values()].filter(c => !used.has(c.name) && !SKIPPED_CUES.has(c.name) && c.waves.length === 1)
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const cue of rest) {
      const song = await songFrom({ cueName: cue.name, title: generic(songs.length), artist: '' }, cue);
      if (song) songs.push(song);
    }
    if (labels && rest.length) warnings.push(`${rest.length} canción(es) del banco no figuraban en Playlist.xml: se agregaron al final con un nombre provisorio.`);
  }
  const overLimit = Math.max(0, songs.length - maxSongs);
  if (overLimit) {
    warnings.push(`El CPK trae ${songs.length} canciones y el juego admite ${maxSongs}: se cargaron las primeras ${maxSongs}.`);
    songs = songs.slice(0, maxSongs);
  }
  if (!songs.length) throw new SoundtrackLoadError('No se encontró ninguna canción en el banco de este CPK.');
  return { songs, xml, acb: Boolean(entries.acb), otherFiles, warnings, overLimit };
}
