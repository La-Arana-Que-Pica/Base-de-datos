// Convierte un HCA del CPK cargado a WAV, para escucharlo sin congelar la página.
import { hcaToWav } from './hca-decoder.js';

self.onmessage = async ({ data: { id, blob } }) => {
  try {
    const wav = hcaToWav(new Uint8Array(await blob.arrayBuffer()));
    self.postMessage({ id, wav }, [wav.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
