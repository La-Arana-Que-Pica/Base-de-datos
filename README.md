# LAqP.website

Sitio estatico de La Arana Que Pica para Option Files, base de datos, guias y herramientas de PES 2018.

## Generar la web

Antes de publicar en GitHub Pages, ejecutar:

```powershell
npm run build
```

El build lee los CSV y JSON de `database/` y actualiza el HTML estatico principal:

- `database.html`
- `tutorials.html`
- `downloads.html`
- paginas individuales en `download/<id>/index.html`
- `sitemap.xml`
- `robots.txt`
- `ADSENSE_AUDIT.md`

La interactividad existente sigue funcionando con JavaScript, pero el contenido principal queda visible en el codigo fuente inicial.

## Validar antes de publicar

```powershell
npm run validate-site
```

El validador genera `VALIDATION_REPORT.md` y revisa cargadores vacios, H1, titles, meta descriptions, canonicals, enlaces internos, imagenes sin `alt`, contadores en cero y sitemap.

## Flujo recomendado para GitHub Pages

1. Actualizar los datos fuente en `database/`.
2. Ejecutar `npm run build`.
3. Ejecutar `npm run validate-site`.
4. Revisar `ADSENSE_AUDIT.md` y `VALIDATION_REPORT.md`.
5. Publicar el repo en GitHub Pages.

No se deben duplicar datos manualmente en varias paginas: el contenido visible se regenera desde las fuentes originales.
