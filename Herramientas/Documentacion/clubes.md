# Fichas de clubes: datos y regeneración

## Fuentes y alcance

`Herramientas/Generadores/generador_database.py` carga los exports y construye índices; `Herramientas/Generadores/generador_clubes.py` genera el contenido de `Herramientas/Generadores/templates/team.html`. La CLI, la ventana de generación completa y los builds históricos de Node comparten esta fuente. `css/club.css` está limitado a las fichas nuevas; `js/club.js` sólo filtra, busca, ordena y mueve los jugadores. No se modificaron los CSV ni se descargaron imágenes.

Cada regeneración escribe también los aliases ya detectados, manteniendo su canonical. Se conservan los enlaces de ligas, jugadores, DTs y navegación. El modo `--teams-only` no regenera esas otras familias.

## Relaciones comprobadas

| Información | Resolución |
| --- | --- |
| Equipo | `teams.Id` = `squads.Id` = `formations.Id`; URL existente basada en nombre normalizado e ID |
| Plantilla | `squads.Player 1..32` → `players.Id`; dorsal `Shirt number 1..32` |
| Media | Mismo cálculo del sitio: corrección por `PlayerId` si existe, luego `OverallStats` |
| DT | `teams.Coach` → `coachs.Id`; país desde `coachs.Country` |
| Ficha/foto del DT | Nombre completo normalizado contra el CSV maestro `Herramientas/Recursos/Base-de-datos/DTs/config.csv`; abreviaturas sólo con inicial y apellido coincidentes y resultado único; recursos resueltos mediante `carpeta` y foto existente `ingame_img`/`real_img` |
| Rivales | `Rival1/2/3` → `teams.Id`; se omiten sentinelas, desconocidos, el propio equipo y repetidos |
| Uniformes | `uniforms.Id_Team` → `teams.Id`, distinguiendo `Goalkeeper`, `Num_Kit` y `Competition` |

## Colores y legibilidad

Los canales reales de `Team Color 1/2 R/G/B` utilizan 0–63. La conversión es `floor(canal * 255 / 63 + 0.5)`. Se emiten `--team-primary` y `--team-secondary` sin alterar la identidad original. `--team-accent` se aclara cuando hace falta hasta alcanzar contraste 4,5:1 sobre la superficie oscura de los controles; los colores originales sólo colorean líneas, halo y un degradado tenue. Nunca se usa el color de un uniforme como tema de la interfaz.

En uniformes, la misma conversión se aplica exclusivamente a `Shirt_Base_R/G/B`, `Pant_R/G/B` y `Socks_R/G/B`. `Num_Kit` es base cero: 0 local, 1 visitante, 2 tercero, 3 cuarto. Si el export contiene sólo el cuarto kit, se muestra como cuarto kit; no se inventan los otros. La sección desaparece cuando no hay datos.

## Formación y roles

Los once titulares se obtienen de `Indice Jugador 1..11`: cada valor es un índice **base cero de los 32 slots originales del squad**. No se compacta la plantilla antes de resolver estos índices. Las asignaciones `Capitan`, `Penalti`, `TiroCorto`, `TiroLargo`, `EsquinaIzquierdo` y `EsquinaDerecho` usan esos mismos slots directamente, no la posición en el once. Los valores no resolubles (por ejemplo 255 o un jugador ausente) se omiten.

`Ubicacion Xn` es profundidad 0–52 y `Ubicacion Yn` es anchura 0–104. El campo ataca hacia arriba: `left = 10 + Y/104*80`, `top = 8 + (1-X/52)*84`. El margen visual evita cortar etiquetas. No se infieren coordenadas a partir de nombres de posiciones.

Se usa F1 para el estado normal; sólo con `Fluida F1=1` se habilitan `F1 Con Balon` y `F1 Sin Balon`, siempre que tengan coordenadas válidas para los jugadores renderizados. Hay un solo campo y una sola imagen por jugador; JavaScript cambia sus coordenadas y etiqueta de posición, sin recargar la página. El listado muestra la posición natural del jugador; el campo muestra su posición táctica, por eso pueden diferir.

Las posiciones 0–12 se traducen a POR, CT, LI, LD, MCD, MC, MI, MD, MP, EI, ED, SD y DC. Las instrucciones F1 usan catálogos explícitos; valores desconocidos de instrucciones avanzadas se omiten. `NumAtaq` y `NumDef` son campos heredados que PES 2018 no utiliza, no instrucciones activas. Esquema contrastado con el lector del proyecto y la [documentación del formato TED](https://implyingrigged.info/wiki/Pro_Evolution_Soccer_2018/Texport_(TED)).

Una táctica editorial se enlaza sólo mediante ID explícito o el escudo asociado al ID, y si existe su página. Las tácticas históricas muestran la temporada en el enlace para no confundirlas con la configuración actual exportada.

## Minifaces

El selector compartido guarda `minifaceMode` en localStorage. Las fichas nuevas no ponen `src` en las imágenes de jugador hasta conocer esa preferencia, evitando la descarga especulativa de ambas versiones. El generador verifica qué archivos existen. En modo PES 2018 se utiliza original → genérica; en modo Actuales, actual → genérica. Nunca se muestra la miniface moderna como fallback de PES 2018. Sin JavaScript se muestra la actual mediante `noscript`. Si localStorage no está disponible, el selector sigue funcionando durante la visita.

## Verificación

`Herramientas/Pruebas/test_clubs.py`: exports reales, rango de colores y contraste, plantilla, DT, roles, índices con huecos y distinto orden del once, coordenadas de las tres variantes, estados incompletos, uniformes, rivales, assets existentes, HTML generado y clasificación de errores de fuente.

`Herramientas/Pruebas/minifaces.test.js`: carga inicial única, fallback independiente por modo, original ausente, persistencia, compatibilidad con HTML anterior y almacenamiento bloqueado. `Herramientas/Pruebas/club-sort.test.js`: cinco claves de orden, dorsal numérico y valores ausentes al final.

Casos revisados en esta segunda pasada: Arsenal FC (rojo), River (blanco), Boca (azul), Corinthians (negro), Dortmund (amarillo), Auxerre y Real Madrid (estadios), West Ham (rivales públicos y externos) y Real Sociedad (miniface actual sin original). Se probaron los cinco órdenes de plantilla, filtros sin resultados y cambios de miniface. Navegador local al 100% en 1920×1080, 1366×768, 1024 px, 768 px, 390 px y 320 px; inspección visual, ancho de tabla/campo, imágenes y consola. También se recorrió Database → liga → equipo → jugador, además de DT y táctica. La generación completa publicó 235 clubes y retiró 272 HTML antiguos de clubes sin liga; comprobó 98.553 enlaces internos. El borrado se limita a HTML identificados como generados. Las fichas pueden regenerarse si el club vuelve a tener liga; una versión anterior sólo puede recuperarse desde Git si estaba versionada.

La liga pública se obtiene de `All leagues exported.csv:team_ids`. Equipos sin asignación siguen disponibles internamente para resolver rivales, pero no se generan ni aparecen en listados, buscador o cantidades públicos. El generador retira únicamente HTML anteriores que él mismo produjo para esos equipos. En rivales, el nombre es un enlace sólo si el ID figura entre los clubes públicos; los demás nombres resueltos se muestran como texto.

`Stadium` contiene un ID numérico PES sin catálogo de nombres en este proyecto. Se muestra `StadiumName` cuando es un nombre válido; cuando está vacío, no se inventa el nombre. En Arsenal FC está vacío; en Auxerre y Real Madrid se conserva el nombre editado exportado.

La plantilla usa la escala `stat-range-1..6` ya presente en las fichas de jugador. El dorsal se compara como número, con valores ausentes al final en ambos sentidos. La posición usa el orden futbolístico POR, LD, CT, LI, MCD, MC, MD, MI, MP, ED, EI, SD, DC; las demás columnas alternan orden. `css/database-system.css` comparte jerarquía, líneas, fondos y bordes rectos entre Database, ligas, clubes, jugadores, DTs y tácticas. En desktop el campo tiene un máximo de 380 px y se ubica entre táctica y roles.

La fuente actual contiene 5.944 referencias a jugadores ausentes de `players`; la validación las sigue reportando. Son errores de datos, no jugadores que se puedan completar automáticamente. Las fichas omiten referencias inválidas; la CLI y Node mantienen el código de error para que este problema no pase inadvertido.
