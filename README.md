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

## Indexación y búsqueda

Al iniciar, `js/app.js`:

1. Carga ligas desde `database/leagues/leagues.csv`
2. Descubre equipos desde `database/teams/index.json`
3. Carga los 5 CSV por equipo
4. Construye un índice invertido en memoria para búsqueda rápida de jugadores por nombre/posición/id

No se usa API externa ni base de datos externa.
