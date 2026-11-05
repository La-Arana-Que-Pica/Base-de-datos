// Codificador CRI HCA en JavaScript (sin dependencias; navegador, Web Worker o Node).
// Port fiel del codificador de VGAudio (CriHcaEncoder, CriHcaPacking, Mdct, BitWriter, HcaWriter): mismo orden de
// operaciones en coma flotante, mismo redondeo y misma escritura de bits. Se omiten el bucle (loop) y el cifrado,
// que el soundtrack de PES 2018 no usa: la salida es HCA 2.0 sin cifrar (ciph 0), como los HCA de BGM_P2P.awb.
// VGAudio (https://github.com/Thealexbarney/VGAudio) — The MIT License (MIT) — Copyright (c) 2016
// Se permite usar, copiar y modificar con este aviso; el software se entrega «tal cual», sin garantías.

import {
  quantizeSpectrumBits, quantizeSpectrumValue, quantizedSpectrumMaxBits, scaleToResolutionCurve,
  mdctWindow, defaultChannelMapping, validChannelMappings,
} from './hca-tables.js';

const SUBFRAMES_PER_FRAME = 8;
const SUBFRAME_SAMPLES_BITS = 7;
const SAMPLES_PER_SUBFRAME = 1 << SUBFRAME_SAMPLES_BITS;
const SAMPLES_PER_FRAME = SUBFRAMES_PER_FRAME * SAMPLES_PER_SUBFRAME;
const HCA_VERSION = 0x0200;

/** Calidades de VGAudio (relación de compresión respecto de PCM 16 bits). */
export const HCA_QUALITY = { highest: 4, high: 6, middle: 8, low: 12, lowest: 16 };

export const CHANNEL = { discrete: 0, stereoPrimary: 1, stereoSecondary: 2 };

// ---------- utilidades (Helpers / Bit de VGAudio) ----------
const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const divideByRoundUp = (value, divisor) => Math.ceil(value / divisor);
const getNextMultiple = (value, multiple) => (multiple <= 0 || value % multiple === 0 ? value : value + multiple - value % multiple);
/** Math.Round de .NET: redondeo al par más cercano. */
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
function bitReverse(value, bitCount) {
  let v = value >>> 0;
  v = ((v & 0xaaaaaaaa) >>> 1) | ((v & 0x55555555) << 1);
  v = ((v & 0xcccccccc) >>> 2) | ((v & 0x33333333) << 2);
  v = ((v & 0xf0f0f0f0) >>> 4) | ((v & 0x0f0f0f0f) << 4);
  v = ((v & 0xff00ff00) >>> 8) | ((v & 0x00ff00ff) << 8);
  v = ((v >>> 16) | (v << 16)) >>> 0;
  return v >>> (32 - bitCount);
}

// ---------- tablas calculadas (CriHcaTables) ----------
const resolutionMaxValue = x => (x < 8 ? x : (1 << (x - 4)) - 1);
const quantizerInverseStepSizeFn = x => resolutionMaxValue(x) + 0.5;
const quantizerStepSizeFn = x => (x === 0 ? 0 : 1 / quantizerInverseStepSizeFn(x));
const dequantizerScalingFn = x => Math.sqrt(128) * Math.pow(Math.pow(2, 53.0 / 128), x - 63);
const generate = (n, fn) => Float64Array.from({ length: n }, (_, i) => fn(i));

const DEQUANTIZER_SCALING = generate(64, dequantizerScalingFn);
const QUANTIZER_SCALING = generate(64, i => 1 / dequantizerScalingFn(i));
const QUANTIZER_INVERSE_STEP = generate(16, quantizerInverseStepSizeFn);
const INTENSITY_RATIO_BOUNDS = generate(14, x => (27 - x * 2) / 14.0);
const QUANTIZER_DEAD_ZONE = (() => {
  // Igual que VGAudio: el límite se corre `steps` ulps hacia abajo (compensa el piso calculado por desplazamiento).
  const view = new DataView(new ArrayBuffer(8));
  return generate(16, i => {
    view.setFloat64(0, quantizerStepSizeFn(i) / 2);
    view.setBigInt64(0, view.getBigInt64(0) - BigInt(resolutionMaxValue(i) + 1));
    return view.getFloat64(0);
  });
})();

// ---------- MDCT (Utilities/Mdct.cs, solo la directa) ----------
const TRIG = [];
const SHUFFLE = [];
for (let bits = 0; bits <= SUBFRAME_SAMPLES_BITS; bits++) {
  const size = 1 << bits;
  const sin = new Float64Array(size), cos = new Float64Array(size), shuffle = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    const value = Math.PI * (4 * i + 1) / (4 * size);
    sin[i] = Math.sin(value);
    cos[i] = Math.cos(value);
    shuffle[i] = bitReverse(i ^ Math.floor(i / 2), bits);
  }
  TRIG.push({ sin, cos });
  SHUFFLE.push(shuffle);
}

export class Mdct {
  constructor(bits, window, scale) {
    this.bits = bits;
    this.size = 1 << bits;
    this.scale = scale;
    this.window = window;
    this.previous = new Float64Array(this.size);
    this.imdctPrevious = new Float64Array(this.size);
    this.scratchMdct = new Float64Array(this.size);
    this.scratchDct = new Float64Array(this.size);
  }

  run(input, output) {
    const { size, window: w, previous: prev } = this;
    const half = size / 2;
    const dctIn = this.scratchMdct;
    for (let i = 0; i < half; i++) {
      const a = w[half - i - 1] * -input[half + i];
      const b = w[half + i] * input[half - i - 1];
      const c = w[i] * prev[i];
      const d = w[size - i - 1] * prev[size - i - 1];
      dctIn[i] = a - b;
      dctIn[half + i] = c - d;
    }
    this.dct4(dctIn, output);
    prev.set(input);
  }

  /** IMDCT (la usa el decodificador). */
  runInverse(input, output) {
    const { size, window: w, imdctPrevious: prev } = this;
    const half = size / 2;
    const dctOut = this.scratchMdct;
    this.dct4(input, dctOut);
    for (let i = 0; i < half; i++) {
      output[i] = w[i] * dctOut[i + half] + prev[i];
      output[i + half] = w[i + half] * -dctOut[size - 1 - i] - prev[i + half];
      prev[i] = w[size - 1 - i] * -dctOut[half - i - 1];
      prev[i + half] = w[half - i - 1] * dctOut[i];
    }
  }

  dct4(input, output) {
    const shuffle = SHUFFLE[this.bits];
    let { sin, cos } = TRIG[this.bits];
    const temp = this.scratchDct;
    const size = this.size, last = size - 1, halfSize = size / 2;
    for (let i = 0; i < halfSize; i++) {
      const i2 = i * 2;
      const a = input[i2], b = input[last - i2];
      temp[i2] = a * cos[i] + b * sin[i];
      temp[i2 + 1] = a * sin[i] - b * cos[i];
    }
    const stageCount = this.bits - 1;
    for (let stage = 0; stage < stageCount; stage++) {
      const blockCount = 1 << stage;
      const blockSizeBits = stageCount - stage;
      const blockHalfSizeBits = blockSizeBits - 1;
      const blockSize = 1 << blockSizeBits;
      const blockHalfSize = 1 << blockHalfSizeBits;
      ({ sin, cos } = TRIG[blockHalfSizeBits]);
      for (let block = 0; block < blockCount; block++) {
        for (let i = 0; i < blockHalfSize; i++) {
          const front = (block * blockSize + i) * 2;
          const back = front + blockSize;
          const a = temp[front] - temp[back];
          const b = temp[front + 1] - temp[back + 1];
          temp[front] += temp[back];
          temp[front + 1] += temp[back + 1];
          temp[back] = a * cos[i] + b * sin[i];
          temp[back + 1] = a * sin[i] - b * cos[i];
        }
      }
    }
    for (let i = 0; i < size; i++) output[i] = temp[shuffle[i]] * this.scale;
  }
}

// ---------- escritura de bits (Utilities/BitWriter.cs) ----------
class BitWriter {
  constructor(buffer) {
    this.buffer = buffer;
    this.lengthBits = buffer.length * 8;
    this.position = 0;
  }

  get remaining() { return this.lengthBits - this.position; }

  alignPosition(multiple) { this.write(0, getNextMultiple(this.position, multiple) - this.position); }

  write(value, bitCount) {
    if (bitCount > this.remaining) throw new Error('No quedan bits en el cuadro HCA');
    const buf = this.buffer;
    const byteIndex = this.position >> 3, bitIndex = this.position & 7;
    if (bitCount <= 9 && this.remaining >= 16) {
      const out = ((value << (16 - bitCount)) & 0xffff) >> bitIndex;
      buf[byteIndex] |= out >> 8;
      buf[byteIndex + 1] = out;
    } else if (bitCount <= 17 && this.remaining >= 24) {
      const out = ((value << (24 - bitCount)) & 0xffffff) >> bitIndex;
      buf[byteIndex] |= out >> 16;
      buf[byteIndex + 1] = out >> 8;
      buf[byteIndex + 2] = out;
    } else if (bitCount <= 25 && this.remaining >= 32) {
      const out = ((value << (32 - bitCount)) >>> 0) >>> bitIndex;
      buf[byteIndex] |= out >>> 24;
      buf[byteIndex + 1] = out >>> 16;
      buf[byteIndex + 2] = out >>> 8;
      buf[byteIndex + 3] = out;
    } else {
      this.writeFallback(value, bitCount);
    }
    this.position += bitCount;
  }

  writeFallback(value, bitCount) {
    let byteIndex = this.position >> 3, bitIndex = this.position & 7;
    while (bitCount > 0) {
      if (bitIndex >= 8) { bitIndex = 0; byteIndex++; }
      const toShift = 8 - bitIndex - bitCount;
      const shifted = toShift < 0 ? value >> -toShift : value << toShift;
      const bitsToWrite = Math.min(bitCount, 8 - bitIndex);
      const mask = ((1 << bitsToWrite) - 1) << (8 - bitIndex - bitsToWrite);
      this.buffer[byteIndex] = (this.buffer[byteIndex] & ~mask) | (shifted & mask);
      bitIndex += bitsToWrite;
      bitCount -= bitsToWrite;
    }
  }
}

// ---------- CRC-16 de HCA (polinomio 0x8005) ----------
const CRC_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let cur = i << 8;
    for (let j = 0; j < 8; j++) cur = cur & 0x8000 ? ((cur << 1) ^ 0x8005) & 0xffff : (cur << 1) & 0xffff;
    table[i] = cur;
  }
  return table;
})();

export function crc16(data, size = data.length) {
  let crc = 0;
  for (let i = 0; i < size; i++) crc = ((crc << 8) ^ CRC_TABLE[(crc >> 8) ^ data[i]]) & 0xffff;
  return crc;
}

// ---------- canal y cuadro ----------
const matrix = (rows, cols, Type = Float64Array) => Array.from({ length: rows }, () => new Type(cols));

function createChannel(type, codedScaleFactorCount) {
  return {
    type,
    codedScaleFactorCount,
    pcmFloat: matrix(SUBFRAMES_PER_FRAME, SAMPLES_PER_SUBFRAME),
    spectra: matrix(SUBFRAMES_PER_FRAME, SAMPLES_PER_SUBFRAME),
    scaledSpectra: matrix(SAMPLES_PER_SUBFRAME, SUBFRAMES_PER_FRAME),
    quantizedSpectra: matrix(SUBFRAMES_PER_FRAME, SAMPLES_PER_SUBFRAME, Int32Array),
    intensity: new Int32Array(SUBFRAMES_PER_FRAME),
    hfrScales: new Int32Array(8),
    hfrGroupAverageSpectra: new Float64Array(8),
    mdct: new Mdct(SUBFRAME_SAMPLES_BITS, mdctWindow, Math.sqrt(2.0 / SAMPLES_PER_SUBFRAME)),
    scaleFactors: new Int32Array(SAMPLES_PER_SUBFRAME),
    resolution: new Int32Array(SAMPLES_PER_SUBFRAME),
    headerLengthBits: 0,
    scaleFactorDeltaBits: 0,
  };
}

export function channelTypes(hca) {
  const perTrack = hca.channelCount / hca.trackCount;
  const { stereoPrimary: P, stereoSecondary: S, discrete: D } = CHANNEL;
  if (hca.stereoBandCount === 0 || perTrack === 1) return new Array(8).fill(D);
  switch (perTrack) {
    case 2: return [P, S];
    case 3: return [P, S, D];
    case 4: return hca.channelConfig !== 0 ? [P, S, D, D] : [P, S, P, S];
    case 5: return hca.channelConfig > 2 ? [P, S, D, D, D] : [P, S, D, P, S];
    case 6: return [P, S, D, D, P, S];
    case 7: return [P, S, D, D, P, S, D];
    case 8: return [P, S, D, D, P, S, P, S];
    default: return new Array(perTrack).fill(D);
  }
}

function calculateResolution(scaleFactor, noiseLevel) {
  if (scaleFactor === 0) return 0;
  const curvePosition = clamp(noiseLevel - Math.trunc(5 * scaleFactor / 2) + 2, 0, 58);
  return scaleToResolutionCurve[curvePosition];
}

function findScaleFactor(value) {
  let low = 0, high = 63;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (DEQUANTIZER_SCALING[mid] <= value) low = mid + 1;
    else high = mid;
  }
  return low;
}

// ---------- pasos de codificación de un cuadro (CriHcaEncoder.EncodeFrame) ----------
function pcmToFloat(pcm, channels) {
  for (let c = 0; c < channels.length; c++) {
    let idx = 0;
    const src = pcm[c];
    for (let sf = 0; sf < SUBFRAMES_PER_FRAME; sf++) {
      const dst = channels[c].pcmFloat[sf];
      for (let i = 0; i < SAMPLES_PER_SUBFRAME; i++) dst[i] = src[idx++] * (1.0 / 32768.0);
    }
  }
}

function runMdct(channels) {
  for (const ch of channels) {
    for (let sf = 0; sf < SUBFRAMES_PER_FRAME; sf++) ch.mdct.run(ch.pcmFloat[sf], ch.spectra[sf]);
  }
}

function encodeIntensityStereo(frame) {
  const { hca, channels } = frame;
  if (hca.stereoBandCount <= 0) return;
  for (let c = 0; c < channels.length; c++) {
    if (channels[c].type !== CHANNEL.stereoPrimary) continue;
    for (let sf = 0; sf < SUBFRAMES_PER_FRAME; sf++) {
      const l = channels[c].spectra[sf], r = channels[c + 1].spectra[sf];
      let energyL = 0, energyR = 0, energyTotal = 0;
      for (let b = hca.baseBandCount; b < hca.totalBandCount; b++) {
        energyL += Math.abs(l[b]);
        energyR += Math.abs(r[b]);
        energyTotal += Math.abs(l[b] + r[b]);
      }
      energyTotal *= 2;
      const energyLR = energyR + energyL;
      const storedValue = 2 * energyL / energyLR;
      let energyRatio = clamp(energyLR / energyTotal, 0.5, Math.sqrt(2) / 2);
      let quantized = 1;
      if (energyR > 0 || energyL > 0) {
        while (quantized < 13 && INTENSITY_RATIO_BOUNDS[quantized] >= storedValue) quantized++;
      } else {
        quantized = 0;
        energyRatio = 1;
      }
      channels[c + 1].intensity[sf] = quantized;
      for (let b = hca.baseBandCount; b < hca.totalBandCount; b++) {
        l[b] = (l[b] + r[b]) * energyRatio;
        r[b] = 0;
      }
    }
  }
}

function calculateScaleFactors(channels) {
  for (const ch of channels) {
    for (let b = 0; b < ch.codedScaleFactorCount; b++) {
      let max = 0;
      for (let sf = 0; sf < SUBFRAMES_PER_FRAME; sf++) max = Math.max(Math.abs(ch.spectra[sf][b]), max);
      ch.scaleFactors[b] = findScaleFactor(max);
    }
    ch.scaleFactors.fill(0, ch.codedScaleFactorCount);
  }
}

function scaleSpectra(channels) {
  for (const ch of channels) {
    for (let b = 0; b < ch.codedScaleFactorCount; b++) {
      const scaled = ch.scaledSpectra[b];
      const scaleFactor = ch.scaleFactors[b];
      for (let sf = 0; sf < scaled.length; sf++) {
        scaled[sf] = scaleFactor === 0 ? 0
          : clamp(ch.spectra[sf][b] * QUANTIZER_SCALING[scaleFactor], -0.999999999999, 0.999999999999);
      }
    }
  }
}

function calculateHfrGroupAverages(frame) {
  const { hca } = frame;
  if (hca.hfrGroupCount === 0) return;
  const hfrStartBand = hca.stereoBandCount + hca.baseBandCount;
  for (const ch of frame.channels) {
    if (ch.type === CHANNEL.stereoSecondary) continue;
    for (let group = 0, band = hfrStartBand; group < hca.hfrGroupCount; group++) {
      let sum = 0.0, count = 0;
      for (let i = 0; i < hca.bandsPerHfrGroup && band < SAMPLES_PER_SUBFRAME; band++, i++) {
        for (let sf = 0; sf < SUBFRAMES_PER_FRAME; sf++) sum += Math.abs(ch.spectra[sf][band]);
        count += SUBFRAMES_PER_FRAME;
      }
      ch.hfrGroupAverageSpectra[group] = sum / count;
    }
  }
}

function calculateHfrScale(frame) {
  const { hca } = frame;
  if (hca.hfrGroupCount === 0) return;
  const hfrStartBand = hca.stereoBandCount + hca.baseBandCount;
  const hfrBandCount = Math.min(hca.hfrBandCount, hca.totalBandCount - hca.hfrBandCount);
  for (const ch of frame.channels) {
    if (ch.type === CHANNEL.stereoSecondary) continue;
    const groupSpectra = ch.hfrGroupAverageSpectra;
    for (let group = 0, band = 0; group < hca.hfrGroupCount; group++) {
      let sum = 0.0, count = 0;
      for (let i = 0; i < hca.bandsPerHfrGroup && band < hfrBandCount; band++, i++) {
        for (let sf = 0; sf < SUBFRAMES_PER_FRAME; sf++) sum += Math.abs(ch.scaledSpectra[hfrStartBand - band - 1][sf]);
        count += SUBFRAMES_PER_FRAME;
      }
      const averageSpectra = sum / count;
      if (averageSpectra > 0.0) groupSpectra[group] *= Math.min(1.0 / averageSpectra, Math.sqrt(2));
      ch.hfrScales[group] = findScaleFactor(groupSpectra[group]);
    }
  }
}

function calculateOptimalDeltaLength(ch) {
  let empty = true;
  for (let i = 0; i < ch.codedScaleFactorCount; i++) {
    if (ch.scaleFactors[i] !== 0) { empty = false; break; }
  }
  if (empty) {
    ch.headerLengthBits = 3;
    ch.scaleFactorDeltaBits = 0;
    return;
  }
  let minDeltaBits = 6;
  let minLength = 3 + 6 * ch.codedScaleFactorCount;
  for (let deltaBits = 1; deltaBits < 6; deltaBits++) {
    const maxDelta = (1 << (deltaBits - 1)) - 1;
    let length = 3 + 6;
    for (let band = 1; band < ch.codedScaleFactorCount; band++) {
      const delta = ch.scaleFactors[band] - ch.scaleFactors[band - 1];
      length += Math.abs(delta) > maxDelta ? deltaBits + 6 : deltaBits;
    }
    if (length < minLength) {
      minLength = length;
      minDeltaBits = deltaBits;
    }
  }
  ch.headerLengthBits = minLength;
  ch.scaleFactorDeltaBits = minDeltaBits;
}

function calculateFrameHeaderLength(frame) {
  for (const ch of frame.channels) {
    calculateOptimalDeltaLength(ch);
    if (ch.type === CHANNEL.stereoSecondary) ch.headerLengthBits += 32;
    else if (frame.hca.hfrGroupCount > 0) ch.headerLengthBits += 6 * frame.hca.hfrGroupCount;
  }
}

function calculateUsedBits(channels, noiseLevel, evalBoundary) {
  let length = 16 + 16 + 16; // sincronismo, nivel de ruido y CRC
  for (const ch of channels) {
    length += ch.headerLengthBits;
    for (let i = 0; i < ch.codedScaleFactorCount; i++) {
      const noise = i < evalBoundary ? noiseLevel - 1 : noiseLevel;
      const resolution = calculateResolution(ch.scaleFactors[i], noise);
      const scaledRow = ch.scaledSpectra[i];
      if (resolution >= 8) {
        const bits = quantizedSpectrumMaxBits[resolution] - 1;
        const deadZone = QUANTIZER_DEAD_ZONE[resolution];
        for (let k = 0; k < scaledRow.length; k++) {
          length += bits;
          if (Math.abs(scaledRow[k]) >= deadZone) length++;
        }
      } else {
        const stepSizeInv = QUANTIZER_INVERSE_STEP[resolution];
        const shiftUp = stepSizeInv + 1;
        const shiftDown = Math.trunc(stepSizeInv + 0.5 - 8);
        const bitsRow = quantizeSpectrumBits[resolution];
        for (let k = 0; k < scaledRow.length; k++) {
          length += bitsRow[Math.trunc(scaledRow[k] * stepSizeInv + shiftUp) - shiftDown];
        }
      }
    }
  }
  return length;
}

function binarySearchLevel(channels, availableBits, low, high) {
  const max = high;
  let midValue = 0;
  while (low !== high) {
    const mid = (low + high) >> 1;
    midValue = calculateUsedBits(channels, mid, 0);
    if (midValue > availableBits) low = mid + 1;
    else high = mid;
  }
  return low === max && midValue > availableBits ? -1 : low;
}

function binarySearchBoundary(channels, availableBits, noiseLevel, low, high) {
  const max = high;
  while (Math.abs(high - low) > 1) {
    const mid = (low + high) >> 1;
    const midValue = calculateUsedBits(channels, noiseLevel, mid);
    if (availableBits < midValue) high = mid - 1;
    else low = mid;
  }
  if (low === high) return low < max ? low : -1;
  return calculateUsedBits(channels, noiseLevel, high) > availableBits ? low : high;
}

function calculateNoiseLevel(frame) {
  let highestBand = frame.hca.baseBandCount + frame.hca.stereoBandCount - 1;
  const availableBits = frame.hca.frameSize * 8;
  let level = binarySearchLevel(frame.channels, availableBits, 0, 255);
  // Si no alcanzan los bits, se quitan bandas hasta que alcancen.
  while (level < 0) {
    highestBand -= 2;
    if (highestBand < 0) throw new Error('Tasa de bits demasiado baja para HCA.');
    for (const ch of frame.channels) {
      ch.scaleFactors[highestBand + 1] = 0;
      ch.scaleFactors[highestBand + 2] = 0;
    }
    calculateFrameHeaderLength(frame);
    level = binarySearchLevel(frame.channels, availableBits, 0, 255);
  }
  frame.acceptableNoiseLevel = level;
}

function calculateEvaluationBoundary(frame) {
  if (frame.acceptableNoiseLevel === 0) {
    frame.evaluationBoundary = 0;
    return;
  }
  const level = binarySearchBoundary(frame.channels, frame.hca.frameSize * 8, frame.acceptableNoiseLevel, 0, 127);
  if (level < 0) throw new Error('Límite de evaluación HCA no encontrado.');
  frame.evaluationBoundary = level;
}

function calculateFrameResolutions(frame) {
  for (const ch of frame.channels) {
    for (let i = 0; i < frame.evaluationBoundary; i++) {
      ch.resolution[i] = calculateResolution(ch.scaleFactors[i], frame.acceptableNoiseLevel - 1);
    }
    for (let i = frame.evaluationBoundary; i < ch.codedScaleFactorCount; i++) {
      ch.resolution[i] = calculateResolution(ch.scaleFactors[i], frame.acceptableNoiseLevel);
    }
    ch.resolution.fill(0, ch.codedScaleFactorCount);
  }
}

function quantizeSpectra(channels) {
  for (const ch of channels) {
    for (let i = 0; i < ch.codedScaleFactorCount; i++) {
      const scaled = ch.scaledSpectra[i];
      const stepSizeInv = QUANTIZER_INVERSE_STEP[ch.resolution[i]];
      const shiftUp = stepSizeInv + 1;
      const shiftDown = Math.trunc(stepSizeInv + 0.5);
      for (let sf = 0; sf < scaled.length; sf++) {
        ch.quantizedSpectra[sf][i] = Math.trunc(scaled[sf] * stepSizeInv + shiftUp) - shiftDown;
      }
    }
  }
}

function writeScaleFactors(writer, ch) {
  const deltaBits = ch.scaleFactorDeltaBits;
  const scales = ch.scaleFactors;
  writer.write(deltaBits, 3);
  if (deltaBits === 0) return;
  if (deltaBits === 6) {
    for (let i = 0; i < ch.codedScaleFactorCount; i++) writer.write(scales[i], 6);
    return;
  }
  writer.write(scales[0], 6);
  const maxDelta = (1 << (deltaBits - 1)) - 1;
  const escapeValue = (1 << deltaBits) - 1;
  for (let i = 1; i < ch.codedScaleFactorCount; i++) {
    const delta = scales[i] - scales[i - 1];
    if (Math.abs(delta) > maxDelta) {
      writer.write(escapeValue, deltaBits);
      writer.write(scales[i], 6);
    } else {
      writer.write(maxDelta + delta, deltaBits);
    }
  }
}

function writeSpectra(writer, ch, subFrame) {
  for (let i = 0; i < ch.codedScaleFactorCount; i++) {
    const resolution = ch.resolution[i];
    const q = ch.quantizedSpectra[subFrame][i];
    if (resolution === 0) continue;
    if (resolution < 8) {
      writer.write(quantizeSpectrumValue[resolution][q + 8], quantizeSpectrumBits[resolution][q + 8]);
    } else if (resolution < 16) {
      writer.write(Math.abs(q), quantizedSpectrumMaxBits[resolution] - 1);
      if (q !== 0) writer.write(q > 0 ? 0 : 1, 1);
    }
  }
}

function packFrame(frame, out) {
  const writer = new BitWriter(out);
  writer.write(0xffff, 16);
  writer.write(frame.acceptableNoiseLevel, 9);
  writer.write(frame.evaluationBoundary, 7);
  for (const ch of frame.channels) {
    writeScaleFactors(writer, ch);
    if (ch.type === CHANNEL.stereoSecondary) {
      for (let i = 0; i < SUBFRAMES_PER_FRAME; i++) writer.write(ch.intensity[i], 4);
    } else if (frame.hca.hfrGroupCount > 0) {
      for (let i = 0; i < frame.hca.hfrGroupCount; i++) writer.write(ch.hfrScales[i], 6);
    }
  }
  for (let sf = 0; sf < SUBFRAMES_PER_FRAME; sf++) {
    for (const ch of frame.channels) writeSpectra(writer, ch, sf);
  }
  writer.alignPosition(8);
  out.fill(0, writer.position / 8, frame.hca.frameSize - 2);
  writer.position = writer.lengthBits - 16;
  writer.write(crc16(out, out.length - 2), 16);
}

// ---------- parámetros del archivo (CriHcaEncoder.Initialize) ----------
function calculateBitrate(hca, compressionRatio, bitrate, limitBitrate) {
  const pcmBitrate = hca.sampleRate * hca.channelCount * 16;
  const maxBitrate = Math.trunc(pcmBitrate / 4);
  const ratio = compressionRatio === HCA_QUALITY.low && hca.channelCount === 1 ? 10
    : compressionRatio === HCA_QUALITY.lowest && hca.channelCount === 1 ? 12 : compressionRatio;
  bitrate = bitrate !== 0 ? bitrate : Math.trunc(pcmBitrate / ratio);
  const minBitrate = limitBitrate ? Math.min(hca.channelCount === 1 ? 42666 : 32000 * hca.channelCount, Math.trunc(pcmBitrate / 6)) : 0;
  return clamp(bitrate, minBitrate, maxBitrate);
}

function calculateBandCounts(hca, bitrate, cutoffFreq) {
  hca.frameSize = Math.trunc(Math.trunc(Math.trunc(bitrate * 1024 / hca.sampleRate)) / 8);
  const pcmBitrate = hca.sampleRate * hca.channelCount * 16;
  let hfrRatio, cutoffRatio;
  if (hca.channelCount <= 1 || Math.trunc(pcmBitrate / bitrate) <= 6) {
    hfrRatio = 6;
    cutoffRatio = 12;
  } else {
    hfrRatio = 8;
    cutoffRatio = 16;
  }
  if (bitrate < Math.trunc(pcmBitrate / cutoffRatio)) {
    cutoffFreq = Math.min(cutoffFreq, Math.trunc(cutoffRatio * bitrate / (32 * hca.channelCount)));
  }
  const totalBandCount = roundHalfEven(cutoffFreq * 256.0 / hca.sampleRate);
  const hfrStartBand = Math.min(totalBandCount, roundHalfEven((hfrRatio * bitrate * 128.0) / pcmBitrate));
  const stereoStartBand = hfrRatio === 6 ? hfrStartBand : Math.trunc((hfrStartBand + 1) / 2);
  const hfrBandCount = totalBandCount - hfrStartBand;
  const bandsPerGroup = divideByRoundUp(hfrBandCount, 8);
  hca.totalBandCount = totalBandCount;
  hca.baseBandCount = stereoStartBand;
  hca.stereoBandCount = hfrStartBand - stereoStartBand;
  hca.hfrGroupCount = bandsPerGroup > 0 ? divideByRoundUp(hfrBandCount, bandsPerGroup) : 0;
  hca.bandsPerHfrGroup = bandsPerGroup;
}

function writeHeader(hca) {
  const out = new Uint8Array(hca.headerSize);
  const view = new DataView(out.buffer);
  let p = 0;
  const id = s => { for (const ch of s) out[p++] = ch.charCodeAt(0); };
  const u8 = v => { out[p++] = v; };
  const u16 = v => { view.setUint16(p, v); p += 2; };
  const u32 = v => { view.setUint32(p, v); p += 4; };
  id('HCA\0'); u16(HCA_VERSION); u16(hca.headerSize);
  id('fmt\0'); u8(hca.channelCount); u8(hca.sampleRate >> 16); u16(hca.sampleRate & 0xffff);
  u32(hca.frameCount); u16(hca.insertedSamples); u16(hca.appendedSamples);
  id('comp'); u16(hca.frameSize); u8(hca.minResolution); u8(hca.maxResolution); u8(hca.trackCount);
  u8(hca.channelConfig); u8(hca.totalBandCount); u8(hca.baseBandCount); u8(hca.stereoBandCount);
  u8(hca.bandsPerHfrGroup); u16(0);
  id('ciph'); u16(0);
  id('pad');
  view.setUint16(hca.headerSize - 2, crc16(out, hca.headerSize - 2));
  return out;
}

/**
 * Codificador HCA por cuadros. Uso: `new HcaEncoder({channelCount, sampleRate, sampleCount})`, después
 * `encode(pcm)` con cuadros de 1024 muestras por canal (Int16Array; el último puede venir incompleto) hasta que
 * `done` sea true. Cada llamada devuelve los cuadros HCA terminados (Uint8Array de `frameSize` bytes).
 */
export class HcaEncoder {
  constructor({ channelCount, sampleRate, sampleCount, quality = HCA_QUALITY.highest, bitrate = 0, limitBitrate = false }) {
    if (!(channelCount >= 1 && channelCount <= 8)) throw new RangeError('HCA admite de 1 a 8 canales.');
    if (!(sampleCount > 0)) throw new RangeError('El audio no tiene muestras.');
    const hca = {
      channelCount, trackCount: 1, sampleCount, sampleRate, minResolution: 1, maxResolution: 15,
      insertedSamples: SAMPLES_PER_SUBFRAME,
    };
    this.bitrate = calculateBitrate(hca, quality, bitrate, limitBitrate);
    calculateBandCounts(hca, this.bitrate, Math.trunc(sampleRate / 2));
    if (hca.bandsPerHfrGroup > 0) {
      hca.hfrBandCount = hca.totalBandCount - hca.baseBandCount - hca.stereoBandCount;
      hca.hfrGroupCount = divideByRoundUp(hca.hfrBandCount, hca.bandsPerHfrGroup);
    } else {
      hca.hfrBandCount = 0;
    }
    const perTrack = channelCount / hca.trackCount;
    hca.channelConfig = defaultChannelMapping[perTrack];
    if (validChannelMappings[perTrack - 1][hca.channelConfig] !== 1) throw new RangeError('Mapeo de canales HCA inválido.');
    hca.headerSize = getNextMultiple(96, 32);
    hca.frameCount = divideByRoundUp(sampleCount + hca.insertedSamples, SAMPLES_PER_FRAME);
    hca.appendedSamples = hca.frameCount * SAMPLES_PER_FRAME - hca.insertedSamples - sampleCount;
    this.hca = hca;

    const types = channelTypes(hca);
    this.frame = {
      hca,
      channels: Array.from({ length: channelCount }, (_, i) => createChannel(types[i],
        types[i] === CHANNEL.stereoSecondary ? hca.baseBandCount : hca.baseBandCount + hca.stereoBandCount)),
      acceptableNoiseLevel: 0,
      evaluationBoundary: 0,
    };
    this.pcmBuffer = matrix(channelCount, SAMPLES_PER_FRAME, Int16Array);
    this.bufferPosition = 0;
    this.samplesProcessed = 0;
    this.framesProcessed = 0;
    this.postSamples = 128; // sin bucle: 128 muestras de silencio para vaciar la MDCT
  }

  get frameSize() { return this.hca.frameSize; }
  get frameCount() { return this.hca.frameCount; }
  get done() { return this.framesProcessed >= this.hca.frameCount; }

  /** Cabecera HCA (96 bytes, con CRC). Depende solo de los parámetros: se puede pedir antes de codificar. */
  header() { return writeHeader(this.hca); }

  /** Tamaño total del archivo HCA resultante, en bytes. */
  get byteLength() { return this.hca.headerSize + this.hca.frameSize * this.hca.frameCount; }

  encode(pcm) {
    if (this.done) throw new Error('El codificador ya entregó todos los cuadros.');
    const out = [];
    const remaining = () => SAMPLES_PER_FRAME - this.bufferPosition;
    let pcmPosition = 0;
    while (SAMPLES_PER_FRAME - pcmPosition > 0 && this.hca.sampleCount > this.samplesProcessed) {
      const toCopy = Math.min(remaining(), SAMPLES_PER_FRAME - pcmPosition, this.hca.sampleCount - this.samplesProcessed);
      for (let c = 0; c < this.pcmBuffer.length; c++) {
        this.pcmBuffer[c].set(pcm[c].subarray(pcmPosition, pcmPosition + toCopy), this.bufferPosition);
      }
      this.bufferPosition += toCopy;
      this.samplesProcessed += toCopy;
      pcmPosition += toCopy;
      this.outputFrame(out);
    }
    if (this.hca.sampleCount === this.samplesProcessed) {
      let postPos = 0;
      while (postPos < this.postSamples) {
        const toCopy = Math.min(remaining(), this.postSamples - postPos);
        for (const buf of this.pcmBuffer) buf.fill(0, this.bufferPosition, this.bufferPosition + toCopy);
        this.bufferPosition += toCopy;
        postPos += toCopy;
        this.outputFrame(out);
      }
      while (this.framesProcessed < this.hca.frameCount) {
        for (const buf of this.pcmBuffer) buf.fill(0, this.bufferPosition);
        this.bufferPosition = SAMPLES_PER_FRAME;
        this.outputFrame(out);
      }
    }
    return out;
  }

  outputFrame(out) {
    if (this.bufferPosition !== SAMPLES_PER_FRAME) return;
    const frame = this.frame;
    const hcaOut = new Uint8Array(this.hca.frameSize);
    pcmToFloat(this.pcmBuffer, frame.channels);
    runMdct(frame.channels);
    encodeIntensityStereo(frame);
    calculateScaleFactors(frame.channels);
    scaleSpectra(frame.channels);
    calculateHfrGroupAverages(frame);
    calculateHfrScale(frame);
    calculateFrameHeaderLength(frame);
    calculateNoiseLevel(frame);
    calculateEvaluationBoundary(frame);
    calculateFrameResolutions(frame);
    quantizeSpectra(frame.channels);
    packFrame(frame, hcaOut);
    out.push(hcaOut);
    this.bufferPosition = 0;
    this.framesProcessed++;
  }
}

/**
 * Codifica un audio completo. `channels`: Int16Array por canal, todos del mismo largo.
 * `onProgress(fracción)` es opcional. Devuelve el HCA completo (cabecera + cuadros).
 */
export function encodeHca(channels, sampleRate, options = {}) {
  const sampleCount = channels[0].length;
  const enc = new HcaEncoder({ ...options, channelCount: channels.length, sampleRate, sampleCount });
  const out = new Uint8Array(enc.byteLength);
  out.set(enc.header(), 0);
  let pos = enc.hca.headerSize;
  for (let i = 0; !enc.done; i++) {
    const start = i * SAMPLES_PER_FRAME;
    const frames = enc.encode(channels.map(ch => ch.subarray(Math.min(start, sampleCount), Math.min(start + SAMPLES_PER_FRAME, sampleCount))));
    for (const f of frames) { out.set(f, pos); pos += f.length; }
    if (options.onProgress && i % 256 === 0) options.onProgress(enc.framesProcessed / enc.frameCount);
  }
  if (pos !== out.length) throw new Error(`HCA incompleto: ${pos} de ${out.length} bytes`);
  return out;
}
