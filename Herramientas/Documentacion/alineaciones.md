# Creador de alineaciones

## Fuente y contrato de datos

`database/builder-player-index.json` es un artefacto generado, no una segunda base mantenida a mano. `Herramientas/Generadores/generador_database.py` lo reconstruye desde:

- `All players exported.csv`: identidad PES, nombre, edad y posiciones;
- `medias_corregidas.csv`: media pública cuando existe;
- `All squads exported.csv`: membresías jugador–equipo;
- `All teams exported.csv`: identidad del equipo y `Type` (`2` = selección);
- `All leagues exported.csv`: equipos publicados.

La clave de persona es siempre `players.Id`. Una aparición en club y selección produce un solo objeto de jugador con varios `teamIds`, `clubIds` y `nationalTeamIds`. La plantilla de cada equipo mantiene una lista de esos IDs.

`POS` se normaliza con el orden canónico de PES 2018 (`GK`, `CB`, `LB`, `RB`, `DMF`, `CMF`, `LMF`, `RMF`, `AMF`, `LWF`, `RWF`, `SS`, `CF`). Las demás columnas posicionales con valor `1` o `2` alimentan `secondaryPositions` sin alterar los CSV.

## Módulos

- `js/builder-formations.js`: formaciones y coordenadas porcentuales.
- `js/builder-transfer-value.js`: fórmula y redondeo del Precio estimado LAQP.
- `js/squad-builder.js`: estado, interacción, guardados, URL compartida y exportación PNG.
- `css/squad-builder.css`: layout desktop/mobile aislado de los estilos globales.

El estado persistido guarda IDs, slot base, coordenadas relativas `x`/`y`, equipo de origen y snapshot del precio. Los datos visuales se resuelven siempre contra el índice actual. La URL compartida usa `#s=` con un esquema mínimo versionado.

Desde el esquema 2, la formación funciona como disposición inicial: cada integrante del XI conserva coordenadas porcentuales independientes. El cambio de esquema reasigna el XI al nuevo dibujo y `Restablecer esquema` repone esas coordenadas sin tocar suplentes. El cargador acepta guardados y enlaces del esquema 1 e infiere sus coordenadas desde el slot original.

## Actualización

La generación completa actualiza el índice automáticamente. Para hacerlo de forma aislada:

```powershell
python Herramientas/Generadores/generar_web.py --cli --builder-index-only
```
