# Auditoria AdSense LAqP.website

Fecha de auditoria: 2026-07-30

## Problemas encontrados

| Prioridad | Problema | Archivos afectados | Solucion aplicada |
| --- | --- | --- | --- |
| Alta | El HTML inicial de tutoriales y descargas contenia solo cargadores y contenedores vacios. | tutorials.html, downloads.html | Se agrego prerender desde CSV con tarjetas reales en el codigo fuente. |
| Alta | La portada de base de datos mostraba contadores en cero y listados vacios hasta ejecutar JavaScript. | database.html | El build inserta cantidades reales, introduccion, destacados y enlaces noscript desde los CSV. |
| Alta | Las paginas de detalle de descarga dependian de parametros y se armaban solo por JavaScript. | downloads.html, download/* | Se generan paginas HTML estaticas para cada descarga completa. |
| Media | El sitemap no se generaba desde las fuentes de datos actuales. | sitemap.xml | El build genera sitemap con secciones principales, guias, descargas y fichas con datos. |
| Media | robots.txt debia dejar claro que CSS, JS, CSV, JSON e imagenes son rastreables. | robots.txt | Se actualizo robots.txt para permitir contenido publico y Mediapartners-Google. |
| Media | No habia comando unico documentado para generar la version publicable. | package.json, README.md | Se agregaron npm run build y npm run validate-site con documentacion. |
| Media | Faltaba validacion automatica de H1, metadatos, enlaces e imagenes sin alt. | scripts/validate-site.js | Se agrego validador que produce VALIDATION_REPORT.md. |
| Media | Las paginas shell heredadas de jugador, equipo, liga y novedades pueden quedar vacias si se indexan directamente. | player.html, team.html, league.html, news.html | Se mantienen como rutas de soporte, pero deben quedar con noindex, follow; las URLs indexables son las paginas estaticas canonicas. |
| Baja | Algunas herramientas siguen siendo principalmente interactivas y tienen margen para mas contenido estatico. | rankings.html, tactics.html, calculadora-medias.html, database/DTs/ | Documentado como mejora futura; no se desactivo ninguna herramienta. |

## Fuentes de datos detectadas

- Jugadores: `database/All players exported.csv`
- Equipos: `database/All teams exported.csv`
- Planteles: `database/All squads exported.csv`
- Ligas: `database/All leagues exported.csv`
- Descargas: `database/descargas.csv`
- Tutoriales: `database/tutoriales.csv`
- Guias escritas: `database/guias.json`

## Cambios finalmente realizados

- Se creo `scripts/build-site.js` para prerenderizar contenido principal desde CSV/JSON.
- Se creo `scripts/validate-site.js` para auditoria automatica local.
- Se agrego `package.json` con `npm run build` y `npm run validate-site`.
- Se agrego `README.md` con el flujo de generacion para GitHub Pages.
- `database.html` ahora incluye contenido real en el HTML inicial: introduccion, conteos, destacados y enlaces sin JavaScript.
- `tutorials.html` ahora incluye tutoriales reales en el HTML inicial.
- `downloads.html` ahora incluye descargas reales en el HTML inicial.
- Se generan paginas individuales en `download/<id>/index.html` para descargas completas.
- Se regeneran `robots.txt` y `sitemap.xml` desde el build.

## Pendientes recomendados

- Publicar la version generada: la web publicada debe coincidir con el HTML prerenderizado del repositorio para que Google vea el contenido inicial.
- Ampliar prerender editorial de herramientas si se detecta otro rechazo despues de esta correccion principal.
- Definir una configuracion central explicita de fecha de base de datos si se prefiere no calcularla desde descargas/tutoriales.

## Resumen de datos generados

- Jugadores publicados detectados: 5681
- Equipos publicados detectados: 208
- Ligas detectadas: 18
- Descargas detectadas: 7
- Tutoriales detectados: 7
- Guias escritas detectadas: 6
