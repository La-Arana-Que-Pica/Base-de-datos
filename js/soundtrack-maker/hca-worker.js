// Codifica a HCA fuera del hilo principal para que la página no se congele.
import { encodeHca } from './hca-encoder.js';

self.onmessage = ({ data: { id, channels, sampleRate } }) => {
  try {
    let last = 0;
    const hca = encodeHca(channels, sampleRate, {
      onProgress: fraction => {
        if (fraction - last >= 0.05) { last = fraction; self.postMessage({ id, progress: fraction }); }
      },
    });
    self.postMessage({ id, hca }, [hca.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
