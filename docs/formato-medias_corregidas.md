# medias_corregidas.csv — Especificación del formato

## Descripción

Este archivo permite corregir manualmente la valoración general (OVR) de jugadores
específicos, sobrescribiendo el valor original exportado desde el juego.

La aplicación lee este archivo al cargar los datos y aplica las correcciones antes
de mostrar las estadísticas en la interfaz.

## Ubicación

```
database/medias_corregidas.csv
```

## Formato

- Delimitador: punto y coma (`;`)
- Codificación: UTF-8
- Primera fila: cabecera con los nombres de columna exactamente como se indica abajo
- Las filas siguientes: una corrección por jugador y equipo

## Columnas

| Columna        | Tipo   | Obligatorio | Descripción                                       |
|----------------|--------|-------------|---------------------------------------------------|
| `TeamId`       | número | sí          | ID del equipo (campo `Id` en `_team.csv`)         |
| `PlayerId`     | número | sí          | ID del jugador (campo `Id` en `_players.csv`)     |
| `OverallStats` | número | sí          | Valoración general corregida, rango 1–99          |

## Ejemplo

Ver `docs/medias_corregidas_ejemplo.csv`:

```csv
TeamId;PlayerId;OverallStats
4071;36768;72
4071;38891;62
4071;43026;76
1002;100001;85
```

## Notas

- Si un jugador no aparece en este archivo, se usa su valor OVR original del CSV exportado.
- Si el mismo `PlayerId` aparece en varias filas con diferente `TeamId`, se aplica la
  corrección específica para cada combinación equipo-jugador.
- Las líneas en blanco y los valores vacíos son ignorados.
