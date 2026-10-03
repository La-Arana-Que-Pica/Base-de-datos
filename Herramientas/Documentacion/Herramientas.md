# Herramientas

Esta carpeta no forma parte del sitio publicado.

- `Generadores/`: generador principal en Python y plantillas HTML.
- `Mantenimiento/`: generadores auxiliares de Node, wrappers de PowerShell y validación estática.
- `Pruebas/`: pruebas Python y Node del contenido generado y del runtime público.
- `Recursos/Base-de-datos/`: fuentes internas que no descarga el navegador, como uniformes y configuración de DTs.
- `Salidas/`: logs y copias de verificación regenerables.

El flujo recomendado para generar la web completa es:

```powershell
python Herramientas/Generadores/generar_web.py --cli
```

Los wrappers `generar-html-database.ps1`, `generar-index-dts.ps1` y
`crear-html-nuevos.ps1` aceptan `-ProjectRoot` para probar o generar sobre otra
copia del sitio. Los procesos de Node aceptan la variable
`LAQP_PROJECT_ROOT`. Sin esos valores, todos calculan la raíz desde la ubicación
real del script y no dependen del directorio desde el que se ejecuten.

`build-site.js` y `create-missing-database-html.js` son el flujo histórico de
compatibilidad. El generador Python es la fuente principal para jugadores,
equipos, ligas, DTs, tácticas y las secciones prerenderizadas.
