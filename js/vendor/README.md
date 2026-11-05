# MiniSearch

MiniSearch 7.2.0, distribución ES original, alojada localmente para el buscador
de Guías LAqP. Sin solicitudes al CDN desde el buscador en producción.

Fuente: https://cdn.jsdelivr.net/npm/minisearch@7.2.0/dist/es/index.js

SHA-256: `0393b3ba253b809d5e55707c7b0875ef9b518a296a006c6739b28876e154edb3`

Licencia MIT incluida en `MiniSearch-LICENSE.txt`.

# node-unrar-js

node-unrar-js 2.0.2 (build WASM del unrar oficial de RARLab), solo la distribución ESM necesaria para leer RAR
en el navegador desde Kit Color Studio. Se carga únicamente al importar un RAR.

Fuente: paquete npm `node-unrar-js@2.0.2` (`esm/index.esm.js` → `node-unrar-js/index.js`, `esm/js/*` → `node-unrar-js/js/`).
Único cambio: a los `import` relativos se les agregó la extensión `.js` (el navegador no resuelve rutas sin extensión)
y se quitaron los comentarios `sourceMappingURL`.

SHA-256 de `js/unrar.wasm`: `c7d79f869196e3c79c053ba74a8f629116de8293a94f60cc851bbcd7977d0c2b`

Licencia MIT del envoltorio en `node-unrar-js/LICENSE.md`. El código de descompresión es el de unRAR (licencia freeware de
RARLab: uso libre para descomprimir; no permite crear un compresor RAR).
