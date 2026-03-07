# Base-de-datos

Base de datos para Option File PES, usando únicamente archivos CSV locales.

## Estructura recomendada

La fuente de datos canónica está en `database/teams`, con una carpeta por equipo:

```text
database/
	teams/
		index.json
		manchester-united/
			MANCHESTER UNITED_team.csv
			MANCHESTER UNITED_players.csv
			MANCHESTER UNITED_appearence.csv
			MANCHESTER UNITED_formation.csv
			MANCHESTER UNITED_squad.csv
```

Cada equipo debe tener exactamente esos 5 tipos de CSV:

- `_team.csv`
- `_players.csv`
- `_appearence.csv`
- `_formation.csv`
- `_squad.csv`

## Descubrimiento automático de equipos

El frontend carga `database/teams/index.json`, donde cada equipo declara:

- Carpeta del equipo (`folder`)
- Nombre para UI (`displayName`)
- Mapa de archivos CSV (`files`)

Se incluye un generador para construir ese índice automáticamente a partir de carpetas y CSVs:

```bash
node scripts/build-teams-index.js
```

En Windows (sin Node.js), puedes usar:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-teams-index.ps1
```

> Si agregas un nuevo equipo, crea su carpeta dentro de `database/teams`, copia sus 5 CSV y vuelve a generar `index.json`.

## Imágenes de jugadores

Las fotos de los jugadores se almacenan en `img/players/` con el ID numérico del jugador como nombre de archivo:

```text
img/
  players/
    default.png        ← foto de reserva (usada cuando no existe la imagen del jugador)
    110667.png         ← foto del jugador con Id = 110667
    101958.png         ← foto del jugador con Id = 101958
    ...
  teams/
    default.png
    manchester-united.png
    ...
  leagues/
    default.png
    ...
  flags/
    default.png
    ...
```

**Convención de nomenclatura:**

- El nombre del archivo es el valor del campo `Id` del CSV `_players.csv`, seguido de `.png`.
- Si el archivo no existe, la interfaz muestra automáticamente `img/players/default.png` como reserva.
- Tamaño recomendado: **100 × 120 px**, formato PNG.

**Para agregar imágenes de jugadores:**

1. Obtén el ID numérico del jugador desde la columna `Id` del archivo `_players.csv` del equipo correspondiente.
2. Renombra o copia la imagen como `{Id}.png` (por ejemplo, `110667.png`).
3. Coloca el archivo en `img/players/`.

No se requiere regenerar ningún índice; la interfaz detecta las imágenes automáticamente mediante el atributo `onerror` en los elementos `<img>`.

**Verificar imágenes faltantes:**

```bash
node scripts/check-player-images.js
```

Este script lista todos los jugadores registrados en los CSV cargados e indica cuáles tienen imagen disponible en `img/players/` y cuáles utilizarán la imagen de reserva.

## Indexación y búsqueda

Al iniciar, `js/app.js`:

1. Carga ligas desde `database/leagues/leagues.csv`
2. Descubre equipos desde `database/teams/index.json`
3. Carga los 5 CSV por equipo
4. Construye un índice invertido en memoria para búsqueda rápida de jugadores por nombre/posición/id

No se usa API externa ni base de datos externa.
