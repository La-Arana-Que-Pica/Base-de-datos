# Formato de minifacetas de jugadores

Las minifacetas son las imágenes que representan la cara del jugador en la interfaz.

## Ubicación

```text
img/players/
  default.png      ← imagen de reserva (se muestra si no existe la del jugador)
  110667.png       ← imagen del jugador con Id = 110667
  101958.png       ← imagen del jugador con Id = 101958
```

## Nomenclatura

El nombre del archivo debe ser **exactamente** el valor numérico del campo `Id` del jugador, seguido de la extensión `.png`.

```
{Id}.png
```

Ejemplos:
- Jugador con `Id = 110667` → archivo `110667.png`
- Jugador con `Id = 5000` → archivo `5000.png`

## Especificación técnica

| Propiedad       | Valor recomendado                     |
|-----------------|---------------------------------------|
| Formato         | PNG                                   |
| Modo de color   | RGBA (32 bits, canal alfa incluido)   |
| Dimensiones     | 128 × 128 píxeles                     |
| Fondo           | Transparente o color sólido           |

## Alternativa DDS

La interfaz también busca el archivo `player_{Id}.dds` si el `.png` no existe:

```
player_110667.dds
```

El orden de búsqueda es:
1. `img/players/{Id}.png`
2. `img/players/player_{Id}.dds`
3. `img/players/default.png` (reserva final)

## Añadir una nueva minifaceta

1. Localiza el `Id` numérico del jugador en la columna `Id` del CSV `_players.csv` de su equipo.
2. Prepara la imagen en formato PNG, 128 × 128 px, con canal alfa.
3. Guarda el archivo como `{Id}.png` dentro de `img/players/`.

No es necesario regenerar ningún índice; la interfaz carga las imágenes bajo demanda.

## Verificar imágenes faltantes

```bash
node scripts/check-player-images.js
```
