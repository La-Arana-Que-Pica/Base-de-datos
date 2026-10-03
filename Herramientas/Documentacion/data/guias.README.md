# Como editar las guias

El contenido de la seccion **Guias / Academia PES** se edita desde:

`database/guias.json`

No hace falta tocar `js/guides.js` ni `js/home.js` para cambiar textos, categorias, imagenes o preguntas frecuentes.

## Que se puede modificar

Cada guia tiene estos campos principales:

- `id`: identificador unico usado en la URL. Ejemplo: `instalar-option-file-pes-2018-2026`.
- `category`: categoria visible en cards y filtros.
- `title`: titulo principal del articulo.
- `description`: bajada SEO y texto de la card.
- `date`: fecha en formato `YYYY-MM-DD`.
- `readTime`: tiempo estimado de lectura.
- `image`: imagen de portada.
- `related`: ids de articulos relacionados.
- `sections`: bloques del articulo.
- `faq`: preguntas frecuentes.

## Estructura de una seccion

Una seccion puede tener parrafos:

```json
{
  "heading": "Antes de empezar",
  "body": [
    "Primer parrafo.",
    "Segundo parrafo."
  ]
}
```

O puede tener una lista:

```json
{
  "heading": "Pasos recomendados",
  "list": [
    "Primer paso.",
    "Segundo paso."
  ]
}
```

Tambien puede combinar `body` y `list`.

## Agregar una imagen chica dentro de una seccion

Para mostrar una imagen pequeña con texto al costado, agrega `figure` dentro de la seccion:

```json
{
  "heading": "Elegir una buena imagen de referencia",
  "body": ["Texto de la seccion."],
  "figure": {
    "image": "assets/images/guias/mi-imagen.webp",
    "alt": "Descripcion de la imagen",
    "caption": "Texto que aparece junto a la imagen.",
    "size": "small"
  }
}
```

Si cambias `image`, usa una ruta existente dentro del proyecto. Por ejemplo: `assets/images/guias/referencia.webp`.

## Agregar una guia nueva

1. Copia una guia existente dentro de `database/guias.json`.
2. Cambia el `id`, `category`, `title`, `description`, `date`, `readTime`, `image`, `sections` y `faq`.
3. Agrega su `id` en `related` de otras guias si queres conectarla internamente.
4. Si queres que aparezca en el sitemap, agrega una entrada en `sitemap.xml`.

Importante: `database/guias.json` debe seguir siendo JSON valido. Las comillas dobles y las comas son obligatorias.
