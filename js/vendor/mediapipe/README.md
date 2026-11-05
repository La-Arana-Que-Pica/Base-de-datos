# MediaPipe (encuadre automático de Miniface Studio)

Todo se aloja en el sitio para que el encuadre automático no dependa de servicios externos.
Las imágenes se procesan en el navegador y no se envían a ningún servidor.

## Modelo
- `blaze_face_short_range.tflite`: BlazeFace de rango corto (Google MediaPipe).
- Origen: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`
- SHA-256: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`
- `face_landmarker.task`: Face Landmarker (478 puntos 3D) para medir tamaño, centro de la cabeza y
  ojos sin que cambien con el giro. Si no carga, el encuadre usa los puntos de BlazeFace.
- Origen: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- `selfie_multiclass_256x256.tflite`: Selfie Multiclass (fondo, pelo, piel, ropa), guía semántica del recorte de fondo.
  Si no carga, queda solo el recorte de MODNet.
- Origen: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`
- SHA-256: `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0`

## Motor `tasks-vision-1.2.0/`
Archivos sin modificar del paquete npm `@mediapipe/tasks-vision@1.2.0`
(integridad `sha512-7+dr9GbGyTtcuLh11wE5TOn4dNFRncIT9oAWs72620WX99KW5FfzF6rFJ/ChTgXG9vJ6dCiE9FrEEY4CnwPWKQ==`):

| Archivo | SHA-256 |
|---|---|
| `vision_bundle.mjs` | `870da5cfc43bfcf2a8b0f14e8152dae8c7e701722e1191b0e592b94b81b4127a` |
| `wasm/vision_wasm_internal.js` | `85c1a342be70427987f900969a5f26e17557351111364e6585e97fb03e93e108` |
| `wasm/vision_wasm_internal.wasm` | `bcc13df22d3d69ec8cbe8e280989356d844ae00f4523eb82072d2484f44134dc` |

Solo se incluye la variante con WebAssembly SIMD (todos los navegadores actuales). Los navegadores
muy antiguos sin SIMD cargan la variante `nosimd` desde jsDelivr (ver `js/miniface-studio/auto-frame.js`).

Licencia: Apache License 2.0 (MediaPipe, Google LLC).

Para actualizar: `npm pack @mediapipe/tasks-vision@<versión>`, copiar los mismos tres archivos a una
carpeta `tasks-vision-<versión>/` y cambiar `MEDIAPIPE_VERSION` en `auto-frame.js`.
