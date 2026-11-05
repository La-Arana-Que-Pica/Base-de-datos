// Decodificador CRI HCA en JavaScript, para escuchar las canciones de un CPK ya armado. Sin dependencias.
// Port del decodificador de VGAudio (CriHcaDecoder, CriHcaPacking, HcaReader). Admite HCA sin cifrar (ciph 0) y con
// la tabla fija (ciph 1); los que requieren una clave (ciph 56) no se pueden decodificar sin ella.
// VGAudio (https://github.com/Thealexbarney/VGAudio) — The MIT License (MIT) — Copyright (c) 2016
// Se permite usar, copiar y modificar con este aviso; el software se entrega «tal cual», sin garantías.

import {
  quantizedSpectrumBits, quantizedSpectrumMaxBits, quantizedSpectrumValue, scaleToResolutionCurve, athCurve, mdctWindow,
} from './hca-tables.js';
import { Mdct, channelTypes, CHANNEL } from './hca-encoder.js';

const SUBFRAMES = 8;
const SUBFRAME_SAMPLES = 128;
const FRAME_SAMPLES = 1024;

const maxValue = x => (x < 8 ? x : (1 << (x - 4)) - 1);
const dequant = x => Math.sqrt(128) * Math.pow(Math.pow(2, 53.0 / 128), x - 63);
const table = (n, fn) => Float64Array.from({ length: n }, (_, i) => fn(i));
const DEQUANTIZER_SCALING = table(64, dequant);
const QUANTIZER_STEP = table(16, x => (x === 0 ? 0 : 1 / (maxValue(x) + 0.5)));
const INTENSITY_RATIO = table(15, x => (28 - x * 2) / 14.0);
const SCALE_CONVERSION = table(128, x => (x > 1 && x < 127 ? Math.pow(Math.pow(2, 53.0 / 128), x - 64) : 0));

/** Cabecera HCA (alcanza con sus primeros bytes; el campo 6–7 dice cuántos hacen falta). */
export function readHcaInfo(b) {
  const tag = p => String.fromCharCode(b[p] & 0x7f, b[p + 1] & 0x7f, b[p + 2] & 0x7f, b[p + 3] & 0x7f);
  if (b.length < 8 || tag(0) !== 'HCA\0') throw new Error('No es un HCA.');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const version = view.getUint16(4), headerSize = view.getUint16(6);
  if (b.length < Math.min(headerSize, 96)) throw new Error('Cabecera HCA incompleta.');
  const hca = {
    version, headerSize, trackCount: 1, channelConfig: 0, stereoBandCount: 0, bandsPerHfrGroup: 0, hfrBandCount: 0,
    hfrGroupCount: 0, encryptionType: 0, useAth: version < 0x200, vbr: false,
  };
  let p = 8;
  for (let guard = 0; p + 4 <= headerSize - 2 && guard < 16; guard++) {
    const id = tag(p);
    if (id === 'fmt\0') {
      hca.channelCount = b[p + 4];
      hca.sampleRate = (b[p + 5] << 16) | view.getUint16(p + 6);
      hca.frameCount = view.getUint32(p + 8);
      hca.insertedSamples = view.getUint16(p + 12);
      hca.appendedSamples = view.getUint16(p + 14);
      p += 16;
    } else if (id === 'comp') {
      hca.frameSize = view.getUint16(p + 4);
      hca.minResolution = b[p + 6];
      hca.maxResolution = b[p + 7];
      hca.trackCount = b[p + 8] || 1;
      hca.channelConfig = b[p + 9];
      hca.totalBandCount = b[p + 10];
      hca.baseBandCount = b[p + 11];
      hca.stereoBandCount = b[p + 12];
      hca.bandsPerHfrGroup = b[p + 13];
      p += 16;
    } else if (id === 'dec\0') {
      hca.frameSize = view.getUint16(p + 4);
      hca.minResolution = b[p + 6];
      hca.maxResolution = b[p + 7];
      hca.totalBandCount = b[p + 8] + 1;
      hca.baseBandCount = b[p + 9] + 1;
      hca.trackCount = (b[p + 10] >> 4) || 1;
      hca.channelConfig = b[p + 10] & 0x0f;
      if (b[p + 11] === 0) hca.baseBandCount = hca.totalBandCount;
      else hca.stereoBandCount = hca.totalBandCount - hca.baseBandCount;
      p += 12;
    } else if (id === 'vbr\0') {
      hca.vbr = view.getUint16(p + 4) !== 0;
      p += 8;
    } else if (id === 'ath\0') {
      hca.useAth = view.getUint16(p + 4) === 1;
      p += 6;
    } else if (id === 'loop') {
      p += 16;
    } else if (id === 'ciph') {
      hca.encryptionType = view.getUint16(p + 4);
      p += 6;
    } else if (id === 'rva\0') {
      p += 8;
    } else {
      break; // comm, pad: lo que sigue es relleno hasta el CRC
    }
  }
  if (!hca.frameCount || !hca.channelCount || !hca.frameSize) throw new Error('Cabecera HCA inválida.');
  hca.sampleCount = hca.frameCount * FRAME_SAMPLES - hca.insertedSamples - hca.appendedSamples;
  hca.byteLength = headerSize + hca.frameSize * hca.frameCount;
  if (hca.bandsPerHfrGroup > 0) {
    hca.hfrBandCount = hca.totalBandCount - hca.baseBandCount - hca.stereoBandCount;
    hca.hfrGroupCount = Math.ceil(hca.hfrBandCount / hca.bandsPerHfrGroup);
  }
  return hca;
}

const TYPE1_TABLE = (() => {
  const t = new Uint8Array(256);
  let v = 0;
  for (let i = 1; i < 255; i++) {
    v = (v * 13 + 11) & 0xff;
    if (v === 0 || v === 0xff) v = (v * 13 + 11) & 0xff;
    t[i] = v;
  }
  t[255] = 255;
  return t;
})();

function scaledAthCurve(frequency) {
  const ath = new Uint8Array(SUBFRAME_SAMPLES).fill(0xff);
  let acc = 0;
  for (let i = 0; i < SUBFRAME_SAMPLES; i++) {
    acc += frequency;
    const index = acc >> 13;
    if (index >= athCurve.length) break;
    ath[i] = athCurve[index];
  }
  return ath;
}

function resolutionFor(scaleFactor, noise) {
  if (scaleFactor === 0) return 0;
  const pos = noise - Math.trunc(5 * scaleFactor / 2) + 2;
  return scaleToResolutionCurve[pos < 0 ? 0 : pos > 58 ? 58 : pos];
}

function decodeFrame(buf, start, hca, channels, ath) {
  let pos = start * 8;
  const peek = n => {
    const i = pos >> 3;
    return (((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2]) >> (24 - (pos & 7) - n)) & ((1 << n) - 1);
  };
  const read = n => { const v = peek(n); pos += n; return v; };

  if (read(16) !== 0xffff) throw new Error('Cuadro HCA inválido.');
  const noise = read(9);
  const boundary = read(7);
  for (const ch of channels) {
    const deltaBits = read(3);
    const scales = ch.scaleFactors;
    if (deltaBits === 0) scales.fill(0);
    else if (deltaBits >= 6) for (let i = 0; i < ch.count; i++) scales[i] = read(6);
    else {
      scales[0] = read(6);
      const maxDelta = 1 << (deltaBits - 1);
      for (let i = 1; i < ch.count; i++) {
        const delta = read(deltaBits) - (maxDelta - 1);
        scales[i] = delta < maxDelta ? scales[i - 1] + delta : read(6);
      }
    }
    for (let i = 0; i < ch.count; i++) ch.resolution[i] = resolutionFor(scales[i], ath[i] + noise - (i < boundary ? 1 : 0));
    if (ch.type === CHANNEL.stereoSecondary) for (let i = 0; i < SUBFRAMES; i++) ch.intensity[i] = read(4);
    else if (hca.hfrGroupCount > 0) for (let i = 0; i < hca.hfrGroupCount; i++) ch.hfrScales[i] = read(6);
    for (let i = 0; i < ch.count; i++) ch.gain[i] = DEQUANTIZER_SCALING[scales[i] & 63] * QUANTIZER_STEP[ch.resolution[i]];
  }
  // Coeficientes, ya multiplicados por la ganancia de su banda.
  for (let sf = 0; sf < SUBFRAMES; sf++) {
    for (const ch of channels) {
      const spectra = ch.spectra[sf];
      for (let s = 0; s < ch.count; s++) {
        const res = ch.resolution[s];
        let bits = quantizedSpectrumMaxBits[res];
        const code = bits ? peek(bits) : 0;
        let q;
        if (res < 8) {
          q = quantizedSpectrumValue[res][code];
          bits = quantizedSpectrumBits[res][code];
        } else {
          q = code >> 1;
          if (q === 0) bits--;
          else if (code & 1) q = -q;
        }
        pos += bits;
        spectra[s] = q * ch.gain[s];
      }
      spectra.fill(0, ch.count);
    }
  }
  // Agudos reconstruidos (HFR).
  if (hca.hfrGroupCount > 0) {
    const total = Math.min(hca.totalBandCount, 127);
    const startBand = hca.baseBandCount + hca.stereoBandCount;
    const hfrBands = Math.min(hca.hfrBandCount, total - hca.hfrBandCount);
    for (const ch of channels) {
      if (ch.type === CHANNEL.stereoSecondary) continue;
      for (let group = 0, band = 0; group < hca.hfrGroupCount; group++) {
        for (let i = 0; i < hca.bandsPerHfrGroup && band < hfrBands; band++, i++) {
          const high = startBand + band, low = startBand - band - 1;
          const factor = SCALE_CONVERSION[ch.hfrScales[group] - ch.scaleFactors[low] + 64];
          for (let sf = 0; sf < SUBFRAMES; sf++) ch.spectra[sf][high] = factor * ch.spectra[sf][low];
        }
      }
    }
  }
  // Estéreo de intensidad.
  if (hca.stereoBandCount > 0) {
    for (let c = 0; c < channels.length; c++) {
      if (channels[c].type !== CHANNEL.stereoPrimary) continue;
      for (let sf = 0; sf < SUBFRAMES; sf++) {
        const l = channels[c].spectra[sf], r = channels[c + 1].spectra[sf];
        const ratioL = INTENSITY_RATIO[channels[c + 1].intensity[sf]] ?? 0;
        const ratioR = ratioL - 2.0;
        for (let b = hca.baseBandCount; b < hca.totalBandCount; b++) {
          r[b] = l[b] * ratioR;
          l[b] *= ratioL;
        }
      }
    }
  }
  for (let sf = 0; sf < SUBFRAMES; sf++) for (const ch of channels) ch.mdct.runInverse(ch.spectra[sf], ch.pcm[sf]);
}

/** HCA completo → { channels: Int16Array[], sampleRate, sampleCount }. */
export function decodeHca(bytes, { onProgress } = {}) {
  const hca = readHcaInfo(bytes);
  if (hca.encryptionType !== 0 && hca.encryptionType !== 1) throw new Error('Este HCA está cifrado con una clave.');
  if (hca.vbr) throw new Error('HCA de tasa variable: no admitido.');
  if (bytes.length < hca.byteLength) throw new Error('HCA incompleto.');
  const types = channelTypes(hca);
  const channels = Array.from({ length: hca.channelCount }, (_, i) => ({
    type: types[i],
    count: types[i] === CHANNEL.stereoSecondary ? hca.baseBandCount : hca.baseBandCount + hca.stereoBandCount,
    scaleFactors: new Int32Array(SUBFRAME_SAMPLES),
    resolution: new Int32Array(SUBFRAME_SAMPLES),
    gain: new Float64Array(SUBFRAME_SAMPLES),
    intensity: new Int32Array(SUBFRAMES),
    hfrScales: new Int32Array(8),
    spectra: Array.from({ length: SUBFRAMES }, () => new Float64Array(SUBFRAME_SAMPLES)),
    pcm: Array.from({ length: SUBFRAMES }, () => new Float64Array(SUBFRAME_SAMPLES)),
    mdct: new Mdct(7, mdctWindow, Math.sqrt(2.0 / SUBFRAME_SAMPLES)),
  }));
  const ath = hca.useAth ? scaledAthCurve(hca.sampleRate) : new Uint8Array(SUBFRAME_SAMPLES);
  const out = channels.map(() => new Int16Array(hca.sampleCount));
  let data = bytes;
  if (hca.encryptionType === 1) {
    data = bytes.slice();
    for (let i = 0; i < hca.frameCount; i++) {
      const start = hca.headerSize + i * hca.frameSize;
      for (let k = start; k < start + hca.frameSize - 2; k++) data[k] = TYPE1_TABLE[data[k]];
    }
  }
  for (let f = 0; f < hca.frameCount; f++) {
    decodeFrame(data, hca.headerSize + f * hca.frameSize, hca, channels, ath);
    const first = f * FRAME_SAMPLES - hca.insertedSamples;
    for (let c = 0; c < channels.length; c++) {
      const target = out[c];
      for (let sf = 0; sf < SUBFRAMES; sf++) {
        const pcm = channels[c].pcm[sf];
        for (let s = 0; s < SUBFRAME_SAMPLES; s++) {
          const at = first + sf * SUBFRAME_SAMPLES + s;
          if (at < 0 || at >= hca.sampleCount) continue;
          const v = Math.trunc(pcm[s] * 32768);
          target[at] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
        }
      }
    }
    if (onProgress && f % 512 === 0) onProgress(f / hca.frameCount);
  }
  return { channels: out, sampleRate: hca.sampleRate, sampleCount: hca.sampleCount };
}

/** HCA → WAV PCM 16 bits (lo que puede reproducir un <audio>). */
export function hcaToWav(bytes, options) {
  const { channels, sampleRate, sampleCount } = decodeHca(bytes, options);
  const n = channels.length;
  const dataSize = sampleCount * n * 2;
  const wav = new Uint8Array(44 + dataSize);
  const view = new DataView(wav.buffer);
  const text = (p, s) => { for (let i = 0; i < s.length; i++) wav[p + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, n, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * n * 2, true);
  view.setUint16(32, n * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, dataSize, true);
  let p = 44;
  for (let i = 0; i < sampleCount; i++) {
    for (let c = 0; c < n; c++) { view.setInt16(p, channels[c][i], true); p += 2; }
  }
  return wav;
}
