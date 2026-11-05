// Audio en el navegador: MP3 → PCM 16 bits estéreo a 48 kHz (Web Audio) y codificación HCA en un Web Worker.

import { encodeHca } from './hca-encoder.js';

export const SAMPLE_RATE = 48000;

/** Decodifica con el decodificador del navegador; decodeAudioData remuestrea a la frecuencia del contexto (48 kHz). */
export async function decodeToPcm(file) {
  const data = await file.arrayBuffer();
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(2, 1, SAMPLE_RATE);
  const audio = await new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
  if (audio.sampleRate !== SAMPLE_RATE) throw new Error(`El navegador decodificó a ${audio.sampleRate} Hz`);
  const n = audio.length;
  const src = [audio.getChannelData(0), audio.getChannelData(audio.numberOfChannels > 1 ? 1 : 0)];
  const channels = src.map(ch => {
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const v = ch[i] * 32768;
      out[i] = v >= 32767 ? 32767 : v <= -32768 ? -32768 : Math.round(v);
    }
    return out;
  });
  return { channels, sampleRate: SAMPLE_RATE };
}

/** Codificador HCA en un Worker de módulo; si el navegador no lo admite, codifica en el hilo principal. */
export function createEncoder() {
  let worker = null;
  try { worker = new Worker(new URL('./hca-worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; }
  let nextId = 1;
  const pending = new Map();
  if (worker) {
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      if (data.progress !== undefined) { job.onProgress(data.progress); return; }
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.hca);
    };
    worker.onerror = event => {
      for (const job of pending.values()) job.reject(new Error(event.message || 'Falló el codificador'));
      pending.clear();
    };
  }
  return {
    encode({ channels, sampleRate }, onProgress = () => {}) {
      if (!worker) return Promise.resolve(encodeHca(channels, sampleRate, { onProgress }));
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject, onProgress });
        worker.postMessage({ id, channels, sampleRate }, channels.map(ch => ch.buffer));
      });
    },
    dispose() { worker?.terminate(); worker = null; },
  };
}

/** Escucha de un HCA: lo convierte a WAV en un Worker (o en el hilo principal si el navegador no lo admite). */
export function createPreviewer() {
  let worker = null;
  try { worker = new Worker(new URL('./hca-preview-worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; }
  let nextId = 1;
  const pending = new Map();
  if (worker) {
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(new Blob([data.wav], { type: 'audio/wav' }));
    };
    worker.onerror = event => {
      for (const job of pending.values()) job.reject(new Error(event.message || 'Falló el decodificador'));
      pending.clear();
    };
  }
  return async blob => {
    if (worker) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, blob });
      });
    }
    const { hcaToWav } = await import('./hca-decoder.js');
    return new Blob([hcaToWav(new Uint8Array(await blob.arrayBuffer()))], { type: 'audio/wav' });
  };
}

/** Duración (s) sin decodificar todo el archivo; rechaza si el navegador no puede leerlo. */
export function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const done = fn => value => { URL.revokeObjectURL(url); el.removeAttribute('src'); fn(value); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(resolve)(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => done(reject)(new Error('El navegador no puede leer este archivo de audio.'));
    el.src = url;
  });
}

/** SHA-256 en hexadecimal (detecta archivos repetidos). */
export async function fileHash(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
