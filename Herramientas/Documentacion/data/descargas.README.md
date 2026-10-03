# Option Files y descargas

`database/option-files.json` es la fuente principal del catálogo, los destacados de la portada, los artículos y las páginas de descarga. El generador crea todo el HTML; no se editan manualmente las carpetas `option-files/` ni `download/`.

`database/descargas.csv` se conserva como compatibilidad: el generador lo usa solamente si el JSON no existe o no contiene registros.

## Estructura

Cada objeto admite estos campos:

- `id`: identificador estable usado por las URLs anteriores.
- `slug`: segmento de la URL editorial `/option-files/<slug>/`.
- `title`, `subtitle`, `version`, `game`, `season`, `date`.
- `platforms`: lista de plataformas.
- `cover`, `description`, `intro`.
- `download_parts`: lista sin límite de archivos. Cada parte usa `name`, `url` y `size` opcional.
- `total_size`: tamaño combinado opcional.
- `tutorial`: URL del tutorial de instalación.
- `features`, `changes`, `leagues`, `teams`, `installation_notes`: listas opcionales.
- `highlights`: objetos con `value` y `label`.
- `gallery`: rutas de imagen u objetos con `src` y `alt`.
- `compatibility`: texto de compatibilidad.
- `common_issues`: objetos con `title` y `text`.
- `faq`: objetos con `question` y `answer`.
- `related_downloads`: lista de `id` relacionados.
- `featured`, `status`, `category`.

Los bloques vacíos no se renderizan.

## Reglas de descarga

- Con una sola entrada en `download_parts`, los botones **Descargar** abren su URL directamente.
- Con dos o más entradas, los botones muestran **Ver descargas** y apuntan a `/option-files/<slug>/descargar/`.
- La página de partes se genera automáticamente y enumera todas las entradas; no existe un máximo de partes.
- `size` y `total_size` se muestran solamente cuando están informados.

Ejemplo:

```json
{
  "id": "of_pes2018_2027_v1_pc",
  "slug": "pes-2018-option-file-2027-v1-pc",
  "title": "PES 2018 Option File 2027 V1",
  "platforms": ["PC"],
  "download_parts": [
    {"name": "Parte 1", "url": "https://example.com/parte-1", "size": "3.2 GB"},
    {"name": "Parte 2", "url": "https://example.com/parte-2", "size": "3.2 GB"},
    {"name": "Parte 3", "url": "https://example.com/parte-3", "size": "2.7 GB"}
  ],
  "total_size": "9.1 GB"
}
```

Al ejecutar `python Herramientas/Generadores/generar_web.py --cli`, se regeneran el catálogo, la portada, cada artículo, las páginas multipartes y las páginas de compatibilidad de las URLs `/download/<id>/`.
