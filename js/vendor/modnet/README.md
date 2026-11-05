# MODNet (recorte de fondo de Miniface Studio)

- `modnet-portrait-fp16.onnx`: MODNet *photographic portrait matting* (pesos oficiales de ZHKKKe/MODNet),
  exportado a ONNX (opset 17) y convertido a fp16 con E/S en float32.
  Entrada `input` [1,3,H,W] normalizada a [-1, 1] (H y W múltiplos de 32); salida `output` [1,1,H,W] con alfa 0–1.
  Su salida coincide con la de `Xenova/modnet` (diferencia máxima 0,0007).
- SHA-256: `07c0f6b60a5ff2b75f8595f1ea6a428b825243640954957308cc36c05e2bb122`
- Licencia: Apache License 2.0 (ver `LICENSE`).

## Por qué este modelo
Banco de pruebas: 240 imágenes de 362 minifaces de LAqP reservadas (no usadas para entrenar), compuestas sobre
fotos del sitio, fondos de estudio, texturas y césped; la transparencia original es la respuesta correcta.

| Modelo | Error medio | IoU | Error en bordes |
|---|---|---|---|
| MediaPipe Selfie Multiclass | 0,082 | 0,960 | 0,093 |
| **MODNet fp16 (este)** | **0,017** | **0,965** | **0,074** |
| MODNet cuantizado (uint8) | 0,055 | 0,844 | 0,124 — descartado |

## Ajuste fino con minifaces (no publicado)
Se ajustó MODNet con 6.939 minifaces compuestas sobre fondos (4.000 iteraciones, RTX 3050). En el banco
sintético mejoró mucho (error 0,0023, IoU 0,994), pero en **fotos reales** abría huecos en caras y camisetas:
aprendió pistas propias de las composiciones. Por eso el sitio usa los pesos oficiales.

Para una próxima versión: fotos reales de un jugador para medir, armonización de color y desenfoque del
recorte al componer, y conservar el comportamiento del modelo original en fotos reales (destilación).

## Refinado del recorte (en `js/miniface-studio/bg-remove.js`)
Sobre la máscara de MODNet: filtro guiado con la foto en color como guía (variante rápida, coeficientes a ≤ 1 MP
aplicados a resolución completa), curva de contraste del borde (0,25–0,85), descarte de islas sueltas y estimación
del color del primer plano (blur fusion) con el alfa suave, para quitar el tono del fondo en pelo y bordes.
En el banco: error medio 0,0142 → 0,0131 e IoU 0,9726 → 0,9741 (100 imágenes); la mejora principal es visual
en fotos reales de baja calidad (sin halos claros ni pelo teñido de cielo).

## Zona cercana y guía semántica (en `js/miniface-studio/bg-remove.js`)
MODNet es un modelo de retratos: si el jugador ocupa poco de la foto, rinde peor. Por eso, cuando se detecta la cara,
corre también sobre una zona de cabeza y hombros (5 anchos de cara) y esa máscara se funde sobre la de la foto entera.

Además, MODNet recorta bien los bordes pero no distingue a la persona de lo que tiene pegado: dejaba sillas gamer, carteles
y compañeros. Selfie Multiclass (`js/vendor/mediapipe/`) rinde peor como recorte (ver la tabla), pero sí distingue a la
persona, así que se usa como guía: limita el alfa de MODNet a la persona principal, rellena agujeros dentro de ella y
deja solo la parte conectada con el rostro. También descarta brazos ajenos junto a la cabeza (caras de frente) y separa a
otros jugadores detectados, sin cortar la cabeza ni los hombros del elegido. Si hay varios, la app pregunta cuál recortar.

Descartado: limitar el cuerpo a un cono desde el cuello (cortaba hombros reales) y exigir confianza alta cerca de las
orejas (se las comía). PoseLandmarker 1.2.0 con máscaras por persona aborta el WASM en algunas fotos.
Revisada a ojo con 12 fotos reales difíciles y sin cambios visibles en 23 fotos de Colón. Si el modelo no carga, queda
el recorte de MODNet. Límites conocidos: restos de silla o de público pegados a los hombros si el segmentador también
los toma por persona.

## Pelo confundido con el fondo (`completeHair` en `js/miniface-studio/bg-remove.js`)
Con pelo negro sobre fondo negro ningún modelo ve el borde. Se recorre la cabeza con rayos desde el centro que da la malla
facial y solo se agrega a tramos sin contraste sobre un fondo liso: primero hasta los rastros (brillos sueltos que se apartan
del fondo) y, si hay una mella sin rastros, hasta una elipse ajustada a los tramos fiables. Nunca quita nada del recorte.
Sin Face Landmarker no actúa. Límite conocido: en fondos con textura no se activa.
