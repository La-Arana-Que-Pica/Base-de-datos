# Herramientas de LAqP.website

El sitio estático se publica con GitHub Pages desde la raíz del repositorio. Esta
carpeta reúne todo lo que sirve para desarrollar, generar, probar o mantener la
web, pero que el navegador no necesita. `_config.yml` excluye `Herramientas/`
completa de la publicación; quitar esta carpeta no altera el runtime público.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `Generadores/` | Generador Python principal y plantillas de jugadores, equipos y ligas. |
| `Mantenimiento/` | Builds auxiliares, normalizadores, validador y migraciones. |
| `Previews/` | Conversión y render 3D de kits. |
| `Empaquetado/` | Creación opcional del ejecutable del generador. |
| `Pruebas/` | Pruebas automáticas Python y Node. |
| `Recursos/` | Fuentes de generación, backups históricos y material legacy no publicado. |
| `Salidas/` | Logs, backups y artefactos locales regenerables. |
| `Documentacion/` | Guías técnicas y reportes de validación. |
| `Legacy/` | Material conservado por seguridad, sin uso en producción. |

Fuera de `Herramientas/` permanecen los HTML públicos, `css/`, `js/`, `img/`,
`assets/`, `database/`, las páginas prerenderizadas y los archivos de GitHub
Pages. No mover un CSV/JSON de `database/` sin revisar sus consumidores: varios
son descargados directamente por JavaScript.

Las fuentes que sólo usa el generador, como la configuración y las caras de DTs
o `All uniforms exported.csv`, están en `Recursos/Base-de-datos/`; no se publican.

## Generar toda la web

Con Python 3 instalado, abrir:

```text
Herramientas/Generadores/generar_web.py
```

La interfaz tiene un botón **GENERAR TODA LA WEB**. El generador localiza la raíz del repositorio desde su propio archivo: funciona aunque Python se inicie desde otro directorio. Lee los CSV/JSON de `database/` y actualiza:

- jugadores, equipos y ligas bajo las URLs `v2` actuales;
- DTs en `database/DTs/`;
- tácticas en `tactics/` y `tactics.html`;
- directorios de la base de datos;
- portada, rankings, tutoriales, descargas, guías y novedades;
- `database/builder-player-index.json` para el creador de alineaciones.

La configuración de todos los DTs vive en
`Herramientas/Recursos/Base-de-datos/DTs/config.csv`. Cada fila usa un `id`
estable, `transfermarkt_id`, `equipo_id` y la columna `carpeta` para vincular las
imágenes públicas de `database/DTs/` con su `face.csv` interno. El detalle del
modelo, cache y prioridades está en
`Herramientas/Documentacion/entrenadores.md`.

Para automatización:

```powershell
python Herramientas/Generadores/generar_web.py --cli
```

El detalle de cada ejecución queda en `Herramientas/Salidas/logs/generacion.log`.
Un código de salida 1 puede indicar errores de integridad en los datos aunque se
hayan escrito los HTML; revisar siempre el resumen.

## Comandos frecuentes

```powershell
# Solo fichas de clubes
python Herramientas/Generadores/generar_web.py --cli --teams-only

# Solo fichas e índice de DTs, sin consultar internet
python Herramientas/Generadores/generar_web.py --cli --managers-only

# Actualizar únicamente DTs nuevos/vencidos y regenerar sus fichas
python Herramientas/Generadores/generar_web.py --cli --managers-only --refresh-coaches

# Forzar un DT por ID LAQP o ID Transfermarkt
python Herramientas/Generadores/generar_web.py --cli --managers-only --refresh-coach 63052

# Solo tácticas (útil al cambiar relaciones Táctica ↔ DT)
python Herramientas/Generadores/generar_web.py --cli --tactics-only

# Solo el índice del creador de alineaciones
python Herramientas/Generadores/generar_web.py --cli --builder-index-only

# Build histórico compatible (desde la raíz)
npm --prefix Herramientas run build

# Todas las pruebas
npm --prefix Herramientas test

# Auditoría estática; actualiza Documentacion/reports/VALIDATION_REPORT.md
npm --prefix Herramientas run validate-site
```

Los builds históricos de Node están en `Herramientas/Mantenimiento/`. Todos
calculan la raíz desde la ubicación del script, no desde el directorio de trabajo
actual. También se puede entrar en `Herramientas/` y usar `npm run ...` sin
`--prefix`.

## Publicación en GitHub Pages

1. Actualizar las fuentes vigentes de `database/`.
2. Ejecutar el generador principal.
3. Revisar el resumen, `Herramientas/Salidas/logs/generacion.log` y las pruebas.
4. Ejecutar `npm --prefix Herramientas run validate-site`.
5. Hacer commit y push.

No mover fuera de `database/` un CSV/JSON sin verificar sus consumidores: la web carga directamente jugadores, equipos, planteles, apariencias, ligas, medias, scouting, descargas, guías, tutoriales, tácticas y el índice del creador.

## Archivos generados

No editar manualmente `player/v2/`, `team/v2/`, `league/v2/`, `database/v2/`, las fichas de `tactics/`, `option-files/`, `download/` o `guia/`, ni `database/builder-player-index.json`. Los cambios se perderían en la siguiente generación. Los Option Files se configuran en `database/option-files.json`.

Las plantillas fuente están en `Herramientas/Generadores/templates/`. Los estilos
y comportamientos compartidos continúan en los `css/` y `js/` públicos.

## EXE opcional

Instalar PyInstaller (`py -m pip install pyinstaller`) y ejecutar:

```text
Herramientas/Empaquetado/build_exe.bat
```

El ejecutable y los temporales quedan en `Herramientas/Salidas/dist/` y
`Herramientas/Salidas/build/`.

## Previews de kits

Las instrucciones están en `Herramientas/Documentacion/previews.md`. Las texturas
fuente viven localmente en `Herramientas/Recursos/Previews/WEPES/`, las
herramientas en `Herramientas/Previews/` y las salidas en
`Herramientas/Salidas/output/`.

Más detalles: `Herramientas/Documentacion/clubes.md`,
`Herramientas/Documentacion/alineaciones.md` y
`Herramientas/Documentacion/Herramientas.md`.
