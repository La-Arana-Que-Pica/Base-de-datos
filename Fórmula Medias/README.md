# Formula Medias

Programa para deducir formulas de media general de jugadores de PES 2018 usando un CSV real de tu Option File.

El sistema entrena un modelo distinto por posicion, compara varios algoritmos y exporta tanto predicciones como una formula interpretable del estilo:

```text
media_decimal = base + (peso_1 * stat_1) + (peso_2 * stat_2) + ...
media_pes = redondear(media_decimal)
```

## 1. Instalacion

Desde esta carpeta:

```bash
pip install -r requirements.txt
```

## 2. Archivos reales usados

Por defecto el programa usa estos dos archivos de tu proyecto:

```text
../database/All players exported.csv
../database/medias_corregidas.csv
```

El primer archivo trae los jugadores y sus estadisticas. El segundo trae la media corregida real:

```text
PlayerId;OverallStats
```

El programa cruza:

- `All players exported.csv`: columna `Id`
- `medias_corregidas.csv`: columna `PlayerId`

Y usa `OverallStats` de `medias_corregidas.csv` como `overall_real`.

Los jugadores que no aparezcan en `medias_corregidas.csv` no se usan para entrenar, validar ni calcular errores. El `OverallStats` original de `All players exported.csv` se ignora para esas metricas porque puede estar mal.

Tambien puedes entrenar con otros archivos:

```bash
python train.py --players-csv "../database/All players exported.csv" --corrections-csv "../database/medias_corregidas.csv"
```

Si algun dia ya tienes un CSV unico preparado, con estadisticas y media real en el mismo archivo, puedes usar:

```bash
python train.py --csv data/jugadores.csv
```

Columnas de estadisticas reconocidas en el export real:

```text
Attacking Prowess, Ball Control, Dribbling, Low Pass, Lofted Pass, Finishing,
Place Kicking, Controlled Spin, Header, Defensive Prowess, Ball Winning,
Kicking Power, Speed, Explosive Power, Body Control, Physical Contact, Jump,
Goalkeeping, Catching, Clearing, Reflexes, Coverage, Stamina
```

No hace falta que tus nombres sean exactamente esos. Puedes editar `config.json` para agregar alias.

## 3. Configuracion de columnas

El archivo `config.json` tiene dos secciones importantes:

- `required_columns`: alias para `player_id`, `name`, `position` y `overall_real`.
- `feature_columns`: estadisticas numericas que se usan para entrenar.

El programa no usa nombre, edad, nacionalidad, habilidades especiales, estilo de juego, forma fisica ni pierna mala para calcular la media.

Si tu CSV usa otro nombre, por ejemplo `Pase Raso` en lugar de `low_pass`, agrega ese alias:

```json
"low_pass": ["low_pass", "low pass", "pase_raso", "Pase Raso"]
```

## 4. Entrenar formulas

Opcion simple, usando los dos CSV reales de `database/`:

```bash
python train.py
```

O usando `main.py`:

```bash
python main.py train
```

Con un CSV especifico:

```bash
python main.py train --players-csv "../database/All players exported.csv" --corrections-csv "../database/medias_corregidas.csv"
```

El entrenamiento hace esto:

1. Carga el CSV.
2. Limpia valores vacios o invalidos.
3. Separa jugadores por posicion.
4. Entrena una formula distinta por posicion.
5. Compara `LinearRegression`, `Ridge`, `Lasso`, `ElasticNet` y `RandomForestRegressor`.
6. Prioriza modelos interpretables cuando su error esta cerca del mejor modelo.
7. Fuerza pesos no negativos en los modelos lineales interpretables.
8. Guarda resultados y modelos en `output/`.

## 5. Interfaz grafica

Tambien puedes usar una interfaz local:

```bash
python app.py
```

Desde la interfaz puedes:

- elegir `All players exported.csv`
- elegir `medias_corregidas.csv`
- entrenar formulas
- generar predicciones con modelos ya entrenados
- crear CSV nuevos con medias predichas
- abrir la carpeta `output`

## 6. Archivos generados en output

Despues de entrenar se generan:

- `output/predicciones_jugadores.csv`: jugador, posicion, media real, media predicha decimal, media predicha redondeada y errores.
- `output/resumen_por_posicion.csv`: resumen de error por posicion.
- `output/comparacion_modelos.csv`: comparacion de todos los modelos probados por posicion.
- `output/formulas_por_posicion.txt`: formulas legibles para revisar a mano.
- `output/formulas_por_posicion.json`: formulas y pesos en formato estructurado.
- `output/models/*.joblib`: modelos entrenados por posicion.

Los CSV de salida se guardan con separador `;` y decimal `,` para que Excel en español los abra directamente en columnas.

## 7. Crear archivos corregidos para usar

Despues de entrenar, puedes crear archivos nuevos con las medias predichas:

```bash
python exportar_medias.py
```

O con `main.py`:

```bash
python main.py export
```

Esta exportacion usa la formula ya guardada en:

```text
output/formulas_por_posicion.json
```

No vuelve a entrenar y no cambia la formula. El `.txt` queda como version legible para revisar, y el `.json` se usa para calcular porque contiene `base` y `weights`.

Esto genera en `output/`:

- `predicciones_all_players.csv`: prediccion completa para revisar.
- `medias_corregidas_predichas.csv`: copia nueva con estructura `PlayerId;OverallStats`, usando tus predicciones.
- `All players exported_con_medias_predichas.csv`: copia nueva del export de jugadores con `OverallStats` reemplazado.

El programa no pisa tus archivos originales de `database/` salvo que lo pidas explicitamente. En esta exportacion, los errores quedan vacios si el jugador no tiene media real corregida; no se comparan contra la media vieja del export original.

Para reemplazar directamente la columna `OverallStats` del archivo `All players exported.csv` elegido:

```bash
python exportar_medias.py --overwrite-all-players
```

Antes de sobrescribir, el programa crea un backup automatico junto al CSV original con un nombre parecido a:

```text
All players exported.formula_medias_backup_20260529_203000.csv
```

En la interfaz, activa `Sobrescribir All players exported.csv con backup` antes de usar `Crear CSV corregidos`.

Si queres aplicar otra version guardada de formulas:

```bash
python exportar_medias.py --formulas-json output/otra_formula.json
```

### SS parecido a CF/DC

Como SS tiene pocos jugadores en la muestra, hay una opcion manual para predecir SS usando el modelo de CF/DC:

```bash
python exportar_medias.py --ss-like-cf
```

Tambien esta disponible como checkbox en la interfaz. No afecta el entrenamiento ni cambia las formulas guardadas; solo cambia esa exportacion.

## 8. Como interpretar los errores

Metricas principales:

- `validation_mae`: error medio absoluto en jugadores separados para validar.
- `validation_mae_decimal`: error medio absoluto antes del redondeo en validacion.
- `validation_max_error`: peor error de validacion.
- `validation_pct_error_le_1`: porcentaje de validacion con error menor o igual a 1 punto.
- `validation_pct_error_le_2`: porcentaje de validacion con error menor o igual a 2 puntos.
- `all_data_mae`: error sobre todos los jugadores al reentrenar el modelo final.

Una posicion funciona bien si tiene `validation_mae` bajo y un porcentaje alto en `validation_pct_error_le_1`.

Si una posicion sale mal, normalmente conviene revisar:

- si tiene pocos jugadores
- si hay medias reales mal cargadas
- si faltan estadisticas importantes
- si esa posicion necesita reglas diferentes o mas datos

## 9. Generar predicciones para nuevos jugadores

Primero entrena los modelos:

```bash
python train.py
```

Luego crea un CSV nuevo con `position` y las mismas estadisticas numericas. `overall_real` es opcional para prediccion.

Ejecuta:

```bash
python predict.py --csv data/nuevos_jugadores.csv
```

O con `main.py`:

```bash
python main.py predict --csv data/nuevos_jugadores.csv
```

El resultado se guarda en:

```text
output/predicciones_nuevos_jugadores.csv
```

## 10. Redondeo PES

El programa guarda dos valores:

- `media_predicha_decimal`: valor crudo del modelo.
- `media_predicha`: valor redondeado a entero.

El redondeo usado es:

```text
floor(valor + 0.5)
```

Ejemplo: `74.49 -> 74`, `74.50 -> 75`.

## 11. Notas para modificar facil

- Para cambiar columnas, edita `config.json`.
- Para agregar o quitar estadisticas, cambia `feature_columns`.
- Para cambiar parametros de modelos, edita `models`.
- Para cambiar el formato de salida CSV, edita `output_csv_separator` y `output_csv_decimal`.
- `enforce_non_negative_weights` mantiene pesos lineales en cero o positivo. Conviene dejarlo en `true`.
- Para obligar a elegir siempre el menor error aunque sea RandomForest, pon `select_interpretable_model_when_close` en `false`.
- Si hay jugadores repetidos en `medias_corregidas.csv`, `duplicate_corrections` decide que hacer. Por defecto usa `last`.
- Si una posicion tiene muy pocos jugadores, el resumen lo marca con una advertencia.
