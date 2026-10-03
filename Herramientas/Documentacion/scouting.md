# Datos de Scouting

Scouting consume estos CSV locales y nunca depende de scraping en tiempo real. Todos los archivos se relacionan con los IDs ya existentes en `All players exported.csv` y `All teams exported.csv`.

- `market_values.csv`: valor de mercado estimado, moneda, fecha, fuente y confianza.
- `player_wages.csv`: salario semanal estimado o verificado y su procedencia.
- `club_finances.csv`: rangos de gasto, estructura salarial, poder financiero y prestigio. Los clubes ausentes usan un fallback derivado del nivel de su plantilla y región.
- `club_rivalries.csv`: correcciones o ampliaciones a `Rival1`, `Rival2` y `Rival3` de la base principal. El motor interpreta esos campos como máximo, fuerte y regional.
- `player_history.csv`: excubles, formación, fechas y tipo de paso.
- `player_affinities.csv`: únicamente casos especiales y manuales. No sustituye al historial automático.
- `club_market_profiles.csv`: ajustes curados de identidad de mercado. Los clubes ausentes obtienen un perfil a partir de la plantilla actual y del patrón general de su liga.

`confidence` distingue datos curados, estimados y verificados. Si falta un valor o salario, el motor lo estima y la interfaz lo marca expresamente como estimado.

El algoritmo principal está en `js/scouting-realism.js`; la normalización, los índices y los fallbacks están en `js/scouting-data.js`.
