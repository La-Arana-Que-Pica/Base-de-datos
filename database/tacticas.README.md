# Tácticas históricas

La página `tactics.html` se genera desde `database/tacticas.csv`. Cada fila representa una táctica y debe tener un `id` único.

Todos los CSV de esta sección se guardan como **UTF-8 con BOM** y usan punto y coma (`;`) como separador. Así los nombres con acentos y `ñ` se conservan correctamente al abrirlos en Excel.

## Estructura

```text
database/
  tacticas.csv
  tacticas/
    teams/
      ac-milan-1988-90/
        players.csv
        88001.webp
        88002.webp
```

La carpeta de cada plantel debe llamarse exactamente igual que el `id` de la táctica.

## Campos de `tacticas.csv`

- `id`: identificador único usado en la URL y en el nombre de la carpeta del plantel.
- `equipo`, `apodo`, `temporada`, `epoca`, `region`, `estilo`: información visible y filtros.
- `formacion`: formación inicial. Es siempre la que aparece en la vista previa del catálogo.
- `dinamica`: usar `Si` para habilitar las tres fases o `No` para mostrar solamente la inicial.
- `formacion_con_balon`, `formacion_sin_balon`: nombres de las formaciones alternativas de una táctica dinámica.
- `portada`: ruta de la imagen de portada.
- `escudo`: ruta del escudo.
- `descripcion`: resumen de la táctica.
- `estilo_ataque`: Posesión o Contraataque.
- `construccion`: Pase corto o Pase largo.
- `zona_ataque`: Centro o Banda.
- `posicionamiento`: Mantener formación o Flexible.
- `rango_apoyo`: valor recomendado del 1 al 10.
- `estilo_defensivo`: Presión en primera línea o Defensa total.
- `zona_contencion`: Centro o Banda.
- `presion`: Agresiva o Conservadora.
- `linea_defensiva`, `compacidad`: valores recomendados del 1 al 10.
- `ataque_avanzada_1`, `ataque_avanzada_2`: instrucciones avanzadas ofensivas.
- `defensa_avanzada_1`, `defensa_avanzada_2`: instrucciones avanzadas defensivas.
- `claves`: etiquetas breves separadas por `|`.

La vista completa de una táctica estará disponible en:

```text
tactics.html?id=ac-milan-1988-90
```

## Campos de `players.csv`

Cada táctica carga su plantel desde:

```text
database/tacticas/teams/{id-de-la-tactica}/players.csv
```

El archivo debe contener exactamente once jugadores. Una táctica normal puede mantener el formato simple:

```csv
id;base_id;nombre;posicion;x;y
88001;;Giovanni Galli;PT;50;91
88002;963;Paolo Maldini;LI;17;73
```

- `id`: identificador único del jugador. También se usa como nombre de la imagen.
- `base_id`: campo opcional. Permite usar explícitamente una minifoto existente de `img/players/{base_id}.webp` cuando no haya foto local.
- `nombre`: nombre mostrado en el campo.
- `posicion`: posición mostrada debajo de la foto.
- `x`: posición horizontal en porcentaje.
- `y`: posición vertical en porcentaje.

## Tácticas dinámicas

Una táctica dinámica permite alternar entre:

- `Inicial`: formación usada al comenzar el partido.
- `Con balón`: ubicación del equipo durante la posesión.
- `Sin balón`: ubicación defensiva.

Para cada jugador se pueden agregar posición y coordenadas específicas por fase:

```csv
id;base_id;nombre;posicion;x;y;posicion_inicial;x_inicial;y_inicial;posicion_con_balon;x_con_balon;y_con_balon;posicion_sin_balon;x_sin_balon;y_sin_balon
73010;2397;Johan Cruyff;DC;50;18;DC;50;18;DC;50;18;DC;50;23
```

Las columnas simples `posicion`, `x` e `y` siguen funcionando como respaldo. Si una coordenada de una fase está vacía, se utiliza automáticamente la ubicación inicial.

La foto se busca primero en la carpeta de la táctica:

```text
database/tacticas/teams/ac-milan-1988-90/88001.webp
```

Si se indicó un `base_id`, se intenta usar `img/players/{base_id}.webp`. Como último respaldo se muestra la imagen predeterminada.
