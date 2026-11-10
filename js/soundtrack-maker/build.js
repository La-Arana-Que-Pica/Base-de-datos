// Generación del soundtrack, sin interfaz: canciones → HCA → BGM_P2P.awb + .acb + Playlist.xml → CPK por partes.
// El decodificador y el codificador se inyectan (navegador: Web Audio + Web Worker; pruebas: Node).

import { buildAfs2Header, buildAcb, buildPlaylistXml, MIN_SONGS, MAX_SONGS, SAMPLE_RATE } from './bank.js';
import { createCpkParts } from './cpk-parts.js';
import { Md5 } from './md5.js';

export const CPK_PATHS = {
  acb: 'common/sound/menu/acb/BGM_P2P.acb',
  awb: 'common/sound/menu/awb/BGM_P2P.awb',
  xml: 'common/sound/menu/playlist/Playlist.xml',
};

const size = part => (part instanceof Uint8Array ? part.length : part.size);
const bytesOf = async part => (part instanceof Uint8Array ? part : new Uint8Array(await part.arrayBuffer()));

/**
 * @param {{file?: Blob, hca?: Blob, numSamples?: number, sampleRate?: number, channels?: number, title: string, artist: string}[]} songs
 *   en el orden de la lista. Con `hca` (canción de un CPK cargado) el audio se copia tal cual, sin decodificar ni recodificar.
 * @param {{decode: (file: Blob) => Promise<{channels: Int16Array[], sampleRate: number}>,
 *          encode: (pcm: {channels: Int16Array[], sampleRate: number}, onProgress: (f: number) => void) => Promise<Uint8Array>,
 *          onProgress?: (p: {stage: string, index?: number, fraction: number}) => void, signal?: AbortSignal,
 *          keepHcaAs?: (hca: Uint8Array) => Uint8Array|Blob, date?: Date}} io
 * @returns {Promise<{parts: (Uint8Array|Blob)[], cpkSize: number, acb: Uint8Array, xml: Uint8Array, songs: object[]}>}
 */
export async function buildSoundtrack(songs, { decode, encode, onProgress = () => {}, signal, keepHcaAs = h => h, date = new Date() }) {
  if (songs.length < MIN_SONGS || songs.length > MAX_SONGS) throw new RangeError(`El soundtrack necesita entre ${MIN_SONGS} y ${MAX_SONGS} canciones.`);
  const check = () => { if (signal?.aborted) throw new DOMException('Generación cancelada', 'AbortError'); };
  const total = songs.length;
  const hcas = [];
  const info = [];
  for (let i = 0; i < total; i++) {
    check();
    const { hca: kept, file: _file, ...fields } = songs[i];
    if (kept) {
      onProgress({ stage: 'copy', index: i, fraction: (i + 1) / total });
      hcas.push(kept);
      info.push(fields);
      continue;
    }
    onProgress({ stage: 'decode', index: i, fraction: i / total });
    const pcm = await decode(songs[i].file);
    if (pcm.sampleRate !== SAMPLE_RATE) throw new Error(`Frecuencia inesperada: ${pcm.sampleRate} Hz`);
    const numSamples = pcm.channels[0].length;
    if (numSamples < SAMPLE_RATE) throw new Error(`«${songs[i].title}» dura menos de un segundo.`);
    check();
    onProgress({ stage: 'encode', index: i, fraction: (i + 0.1) / total });
    const hca = await encode(pcm, f => onProgress({ stage: 'encode', index: i, fraction: (i + 0.1 + 0.9 * f) / total }));
    hcas.push(keepHcaAs(hca));
    info.push({ ...fields, numSamples, sampleRate: SAMPLE_RATE, channels: 2 });
  }
  check();
  onProgress({ stage: 'package', fraction: 1 });
  const afs2 = buildAfs2Header(hcas.map(size));
  const awb = [afs2.header];
  const md5 = new Md5().update(afs2.header);
  let pos = afs2.header.length;
  for (let i = 0; i < hcas.length; i++) {
    if (afs2.starts[i] > pos) {
      const pad = new Uint8Array(afs2.starts[i] - pos);
      awb.push(pad);
      md5.update(pad);
    }
    md5.update(await bytesOf(hcas[i]));
    awb.push(hcas[i]);
    pos = afs2.starts[i] + size(hcas[i]);
  }
  const acb = buildAcb({ songs: info, awbHeader: afs2.header, awbMd5: md5.digest() });
  const xml = buildPlaylistXml(info, { created: date });
  const parts = createCpkParts([
    { path: CPK_PATHS.acb, parts: [acb] },
    { path: CPK_PATHS.awb, parts: awb },
    { path: CPK_PATHS.xml, parts: [xml] },
  ], { date });
  return { parts, cpkSize: parts.reduce((s, p) => s + size(p), 0), acb, xml, songs: info, awbSize: afs2.totalSize, afs2Header: afs2.header };
}

// DpFileList.bin guarda cada CPK en una entrada de 48 bytes: el nombre ocupa 36 bytes (+0x08) y en +0x2c va el orden.
// Un nombre de 36 caracteres pisa el orden con su fin de cadena, y uno más largo con letras: con
// «Rock_Nacional_Spider_Patch_Soundtrack.cpk» (41) el juego no arrancó (SND-08, 2026-11-09). EXE: tabla en 0x142efb318,
// paso 0x30, máximo 0x40 CPK, nombre devuelto por 0x14125e520. Máximo seguro: 35 caracteres contando «.cpk».
export const CPK_NAME_MAX = 35;

/** Nombre de archivo CPK seguro (DpFileList y PES usan nombres simples). */
export function sanitizeCpkName(raw) {
  const base = String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\.cpk$/i, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, CPK_NAME_MAX - 4).replace(/_+$/, '');
  return (base || 'LAqP_Soundtrack') + '.cpk';
}

/** Tamaño aproximado del CPK (HCA 384 kbps ≈ 48 000 bytes por segundo de audio). */
export const estimateCpkBytes = seconds => Math.round(seconds * 48000 * 1.0003 + 4096);
