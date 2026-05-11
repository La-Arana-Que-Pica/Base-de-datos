# Estructura de descargas.csv

`descargas.csv` es la fuente unica para la pagina Option Files y para los destacados de la home.

Importante para Excel en configuracion regional espanola/argentina:

- Usar `;` como separador de columnas.
- No usar `,` como separador principal, porque Excel puede abrir toda la fila en una sola celda.

Columnas obligatorias:

```csv
id;titulo;version;juego;plataforma;descripcion;link;miniatura;destacado
```

Columnas opcionales:

```csv
categoria;fecha;detalles;estado;tags
```

Regla de destacados:

- `destacado` debe ser exactamente `1` para aparecer en la home.
- `0`, vacio, `null`, `true`, `si` o cualquier otro valor no aparece como destacado.

Miniaturas:

- `miniatura` puede ser una ruta local como `/assets/images/option-files/of.png`.
- Si no hay miniatura, la web usa `img/logo.webp` como placeholder.
