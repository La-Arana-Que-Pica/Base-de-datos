// Banco de música del menú de PES 2018 (PC): BGM_P2P.acb + BGM_P2P.awb + Playlist.xml, generados desde cero.
// Reglas (Soundtrack_Manager/HALLAZGOS.md): máx. 32 canciones (límite del EXE); CueTable ordenada por CueId ascendente
// (búsqueda binaria del EXE); el ACB guarda el MD5 del AWB y su cabecera AFS2; Title/Artist ≤ 63 bytes UTF-8;
// volumen con las categorías ACF del original (SeqCommand 1: 207/60/351/63).

import { readUtf, writeUtf } from './utf.js';
import { ACB_TEMPLATE } from './acb-template.js';

export const MIN_SONGS = 12; // decisión de producto: las del soundtrack original (el EXE no exige mínimo)
export const MAX_SONGS = 32;
export const TEXT_MAX_BYTES = 63;
export const SAMPLE_RATE = 48000;
const AWB_ALIGN = 32;
const FIRST_SONG_CUE_ID = 107; // como el original (107…); CREDIT = 79, req_playgo_link = 0
const FIRST_PLAYLIST_ID = 18000;
const utf8 = new TextEncoder();

const hex = s => Uint8Array.from(s.match(/../g) || [], h => parseInt(h, 16));
const u16s = (...values) => {
  const out = new Uint8Array(values.length * 2);
  values.forEach((v, i) => { out[i * 2] = v >> 8; out[i * 2 + 1] = v & 0xff; });
  return out;
};
export const songCueName = i => `BGM0_LIC_MENU_${String(i + 1).padStart(2, '0')}`;

function revive(value) {
  if (value && typeof value === 'object') {
    if ('hex' in value) return Object.assign(hex(value.hex), value.positioned ? { positioned: true } : {});
    if ('big' in value) return BigInt(value.big);
    if ('table' in value) return { table: reviveTable(value.table) };
  }
  return value;
}
function reviveTable(t) {
  return {
    name: t.name, version: t.version,
    columns: t.columns.map(c => (c.storage === 0x30 ? { ...c, value: revive(c.value) } : { ...c })),
    rows: t.rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, revive(v)]))),
  };
}
/** Tabla raíz de la plantilla (copia nueva en cada llamada). */
export const templateTable = () => reviveTable(ACB_TEMPLATE);

/** Cabecera AFS2 (v1, offsets u32, ids u16, alineación 32) para pistas de los tamaños dados, ids 0…n−1. */
export function buildAfs2Header(sizes) {
  const n = sizes.length;
  const headerSize = 0x10 + 2 * n + 4 * (n + 1);
  const header = new Uint8Array(headerSize);
  const view = new DataView(header.buffer);
  header.set([0x41, 0x46, 0x53, 0x32, 1, 4], 0);
  view.setUint16(6, 2, true);
  view.setUint32(8, n, true);
  view.setUint16(12, AWB_ALIGN, true);
  view.setUint16(14, 0, true);
  const starts = [];
  let pos = headerSize;
  sizes.forEach((size, i) => {
    view.setUint16(0x10 + 2 * i, i, true);
    view.setUint32(0x10 + 2 * n + 4 * i, pos, true); // offset = fin del anterior, sin alinear
    pos = Math.ceil(pos / AWB_ALIGN) * AWB_ALIGN;
    starts.push(pos);
    pos += size;
  });
  view.setUint32(0x10 + 2 * n + 4 * n, pos, true);
  if (pos >= 2 ** 32) throw new RangeError('El AWB superaría 4 GB.');
  return { header, starts, totalSize: pos };
}

/** Partes del AWB en orden (cabecera, relleno, HCA…) para escribirlo o hashearlo sin juntarlo en memoria. */
export function awbParts(afs2, hcas) {
  const parts = [afs2.header];
  let pos = afs2.header.length;
  hcas.forEach((hca, i) => {
    if (afs2.starts[i] > pos) parts.push(new Uint8Array(afs2.starts[i] - pos));
    parts.push(hca);
    pos = afs2.starts[i] + hca.length;
  });
  return parts;
}

const findColumn = (root, name) => root.rows[0][name].table;

/**
 * Construye BGM_P2P.acb. songs: [{ numSamples, sampleRate?, channels? }] en el orden de la lista (por defecto 48 kHz
 * estéreo; un CPK cargado puede traer otras); awbHeader: cabecera AFS2 del AWB;
 * awbMd5: MD5 (16 bytes) del AWB completo. La cue de créditos reproduce la primera canción.
 */
export function buildAcb({ songs, awbHeader, awbMd5 }) {
  const n = songs.length;
  if (n < 1 || n > MAX_SONGS) throw new RangeError(`Cantidad de canciones fuera de rango: ${n}`);
  if (!(awbMd5 instanceof Uint8Array) || awbMd5.length !== 16) throw new TypeError('awbMd5 debe tener 16 bytes');
  const root = templateTable();
  const T = name => findColumn(root, name);
  const cues = T('CueTable'), names = T('CueNameTable'), waves = T('WaveformTable'), aisacs = T('GlobalAisacReferenceTable');
  const synths = T('SynthTable'), tracks = T('TrackTable'), seqs = T('SequenceTable'), events = T('TrackEventTable');

  // req_playgo_link (residuo de PlayGo de PS4) se conserva igual que en el original y en V4: sequence 0, tracks/
  // events 0–11 y synths con referencias de tipo 7. En el original esos synths son las filas pares 0–22.
  const playgo = seqs.rows[0];
  const playgoTracks = Array.from({ length: playgo.NumTracks }, (_, k) => tracks.rows[(playgo.TrackIndex[2 * k] << 8) | playgo.TrackIndex[2 * k + 1]]);
  const playgoSynthRefs = playgoTracks.map(tr => {
    const cmd = events.rows[tr.EventIndex].Command; // 07d0 04 0002 <synth>
    return synths.rows[(cmd[5] << 8) | cmd[6]].ReferenceItems;
  });
  const P = playgoTracks.length;
  const songSynth = i => P + i, creditSynth = P + n;
  const noteOnSynth = s => Uint8Array.from([0x07, 0xd0, 0x04, 0x00, 0x02, s >> 8, s & 0xff, 0, 0, 0]);
  const synthRow = (refs, k) => ({ ReferenceItems: refs, ControlWorkArea1: k, ControlWorkArea2: k });

  synths.rows = [...playgoSynthRefs.map((refs, k) => synthRow(refs, k)),
    ...songs.map((_, i) => synthRow(u16s(1, i), songSynth(i))),
    synthRow(u16s(1, 0), creditSynth)];
  events.rows = synths.rows.map((_, k) => ({ Command: noteOnSynth(k) }));
  tracks.rows = synths.rows.map((_, k) => ({ EventIndex: k, CommandIndex: 0xffff }));

  const songSeq = i => 1 + i, creditSeq = 1 + n;
  const songSeqTemplate = seqs.rows[1];
  const creditSeqTemplate = seqs.rows.find(r => r.CommandIndex === 2);
  seqs.rows = [
    { ...playgo, TrackIndex: u16s(...Array.from({ length: P }, (_, k) => k)), ControlWorkArea1: 0, ControlWorkArea2: 0 },
    ...songs.map((_, i) => ({ ...songSeqTemplate, NumTracks: 1, TrackIndex: u16s(songSynth(i)), CommandIndex: 1,
      GlobalAisacStartIndex: i, GlobalAisacNumRefs: 1, ControlWorkArea1: songSeq(i), ControlWorkArea2: songSeq(i) })),
    { ...creditSeqTemplate, NumTracks: 1, TrackIndex: u16s(creditSynth), CommandIndex: 2, GlobalAisacStartIndex: 0xffff,
      GlobalAisacNumRefs: 0, ControlWorkArea1: creditSeq, ControlWorkArea2: creditSeq },
  ];
  aisacs.rows = songs.map(() => ({}));
  waves.rows = songs.map((s, i) => ({ NumSamples: s.numSamples, StreamAwbId: i }));
  // La plantilla fija 48 kHz estéreo como constantes; si alguna canción difiere, esas columnas pasan a ser por fila.
  for (const [column, field, standard] of [['SamplingRate', 'sampleRate', SAMPLE_RATE], ['NumChannels', 'channels', 2]]) {
    if (songs.every(s => (s[field] ?? standard) === standard)) continue;
    const definition = waves.columns.find(c => c.name === column);
    definition.storage = 0x50;
    delete definition.value;
    songs.forEach((s, i) => { waves.rows[i][column] = s[field] ?? standard; });
  }

  const lengthMs = s => Math.floor(s.numSamples * 1000 / (s.sampleRate ?? SAMPLE_RATE));
  const cueRows = [
    { CueId: 0, ReferenceIndex: 0, Length: 0xffffffff, name: 'req_playgo_link' },
    { CueId: 79, ReferenceIndex: creditSeq, Length: lengthMs(songs[0]), name: 'BGM0_LIC_CREDIT' },
    ...songs.map((s, i) => ({ CueId: FIRST_SONG_CUE_ID + i, ReferenceIndex: songSeq(i), Length: lengthMs(s), name: songCueName(i) })),
  ];
  cues.rows = cueRows.map(({ CueId, ReferenceIndex, Length }) => ({ CueId, ReferenceIndex, Length }));
  const byteOrder = (a, b) => { const x = utf8.encode(a), y = utf8.encode(b); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; };
  names.rows = cueRows.map((c, i) => ({ CueName: c.name, CueIndex: i })).sort((a, b) => byteOrder(a.CueName, b.CueName));

  findColumn(root, 'StreamAwbHash').rows[0].Hash = awbMd5;
  const headerBlob = new Uint8Array(awbHeader.length + 2); // CRI guarda la cabecera AFS2 + 2 bytes en cero
  headerBlob.set(awbHeader);
  findColumn(root, 'StreamAwbAfs2Header').rows[0].Header = headerBlob;
  return writeUtf(root, { root: true });
}

/** Recorta un texto a `maxBytes` en UTF-8 sin partir caracteres. */
export function truncateUtf8(text, maxBytes = TEXT_MAX_BYTES) {
  let out = '';
  let size = 0;
  for (const ch of String(text)) {
    const n = utf8.encode(ch).length;
    if (size + n > maxBytes) break;
    out += ch;
    size += n;
  }
  return out;
}

const xmlAttr = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Playlist.xml con el formato del original (BOM UTF-8, CRLF, tabulaciones). songs: [{ title, artist, numSamples }]
 * en el orden de la lista. La CueList y las listas Menu/Highlight siguen ese orden.
 * Offset: punto de arranque (ms) para la lista Highlight [HIPÓTESIS]; se usa el 30 % de la duración.
 * Las canciones de un CPK cargado conservan su Id, Offset y fundidos (playlistId, offset, remainTime, fadeoutTime, fadeoutWaitTime).
 */
export function buildPlaylistXml(songs, { created = new Date() } = {}) {
  const pad = v => String(v).padStart(2, '0');
  const stamp = `${created.getFullYear()}/${pad(created.getMonth() + 1)}/${pad(created.getDate())} ${pad(created.getHours())}:${pad(created.getMinutes())}:${pad(created.getSeconds())}`;
  const taken = new Set();
  const keptIds = songs.map(s => {
    const id = s.playlistId;
    if (!Number.isInteger(id) || id < 0 || id >= 32768 || taken.has(id)) return null;
    taken.add(id);
    return id;
  });
  let nextId = FIRST_PLAYLIST_ID;
  const ids = keptIds.map((id, i) => {
    if (id !== null) return id;
    nextId = Math.max(nextId, FIRST_PLAYLIST_ID + i);
    while (taken.has(nextId)) nextId++;
    taken.add(nextId);
    return nextId;
  });
  const u16Attr = v => (Number.isInteger(v) && v >= 0 && v <= 65535 ? v : 0);
  const offsetOf = s => (Number.isInteger(s.offset) && s.offset >= 0 ? s.offset : Math.round(s.numSamples / (s.sampleRate ?? SAMPLE_RATE) * 300));
  const lines = [
    '<?xml version="1.0" standalone="yes"?>',
    `<Playlist converter_version="20160002" wepes="18" target="CS" version="0" create="${stamp}">`,
    `\t<CueList Num="${songs.length}">`,
    ...songs.map((s, i) => `\t\t<Label CueName="${songCueName(i)}" Id="${ids[i]}" Title="${xmlAttr(truncateUtf8(s.title))}" Artist="${xmlAttr(truncateUtf8(s.artist))}" Offset="${offsetOf(s)}" RemainTimeForFadeoutStart="${u16Attr(s.remainTime)}" FadeoutTime="${u16Attr(s.fadeoutTime)}" FadeoutWaitTime="${u16Attr(s.fadeoutWaitTime)}"/>`),
    '\t</CueList>',
    '\t<DefaultPlayList Num="2">',
    `\t\t<List ListName="Menu" NumContents="${songs.length}">`,
    ...ids.map(id => `\t\t\t<Label Id="${id}"/>`),
    '\t\t</List>',
    `\t\t<List ListName="Highlight" OffsetStart="1" NumContents="${songs.length}">`,
    ...ids.map(id => `\t\t\t<Label Id="${id}"/>`),
    '\t\t</List>',
    '\t</DefaultPlayList>',
    '\t<RegionTopBgm Num="1">',
    '\t\t<Label Region="def" Id="-1"/>',
    '\t</RegionTopBgm>',
    '</Playlist>',
    '',
  ];
  const body = utf8.encode(lines.join('\r\n'));
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

/** Comprobación estructural de un ACB generado (para pruebas y para validar antes de entregar). */
export function inspectAcb(bytes) {
  const root = readUtf(bytes);
  const T = name => root.rows[0][name].table;
  const cueIds = T('CueTable').rows.map(r => r.CueId);
  return {
    cueIds,
    cueIdsAscending: cueIds.every((v, i) => i === 0 || v > cueIds[i - 1]),
    cueNames: T('CueNameTable').rows.map(r => r.CueName),
    waveCount: T('WaveformTable').rows.length,
    md5: T('StreamAwbHash').rows[0].Hash,
    afs2Header: T('StreamAwbAfs2Header').rows[0].Header,
  };
}
