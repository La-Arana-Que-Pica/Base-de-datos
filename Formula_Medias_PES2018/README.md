# Formula Medias PES 2018

Herramienta con menu para scrapear jugadores de PES 2018 desde PES Master y PESDB, construir un dataset CSV y entrenar formulas aproximadas de Overall Rating por posicion.

La idea no es reconstruir al 100% la formula oficial de Konami. El objetivo es tener un modelo PES-like interpretable usando solo los jugadores descargados desde PES Master/PESDB.

## Estructura

```text
Formula_Medias_PES2018/
  main.py
  scraper_pesmaster.py
  scraper_pesdb.py
  parser.py
  train_model.py
  predict.py
  config.py
  requirements.txt
  data/
    raw/
      html_cache/
    processed/
  models/
  outputs/
```

## Instalacion

Desde esta carpeta:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Si ya esta instalado con la `.venv`, en Windows puedes abrir el menu con:

```bat
run.bat
```

Tambien puedes hacer doble click en `Abrir_Menu.bat`.

El menu principal tiene estas opciones:

```text
1. Scrapear jugadores desde PES Master
2. Scrapear jugadores desde PESDB
3. Crear dataset limpio con los CSVs descargados
4. Entrenar formula por posicion
5. Predecir medias de jugadores nuevos/modificados
6. Flujo rapido: dataset + entrenamiento
7. Mejorar formula existente (calibracion incremental)
8. Informe detallado contra PES 2018 original
9. Ver estado y rutas
0. Salir
```

En Linux/macOS, si alguna vez se usa fuera de Windows, la activacion seria:

```bash
source .venv/bin/activate
```

## Uso recomendado con menu

1. Ejecuta:

```bat
run.bat
```

2. Elige `1` para PES Master o `2` para PESDB.
3. Elige si quieres pegar URLs, usar un archivo de URLs, usar una pagina de listado/busqueda o buscar todos los equipos de PES Master.
4. Cuando termine el scraping, vuelve al menu y elige `3` para crear el dataset.
5. Elige `4` para entrenar la formula por posicion.
6. Opcionalmente elige `7` para mejorar la formula existente sin empezar desde cero.
7. Elige `8` para generar un informe detallado contra el PES 2018 original.
8. Las formulas quedan en:

```text
outputs/formulas_readable.txt
```

## Scraping por comandos avanzados

El scraper usa `requests` y `BeautifulSoup`. Tiene pausa entre requests, guarda cache local de cada HTML y no corta todo el proceso si una pagina falla.

El programa solo acepta URLs explicitas de PES 2018. Por ejemplo:

```text
https://www.pesmaster.com/l-messi/pes-2018/player/7511/
https://www.pesmaster.com/atletico-de-madrid/pes-2018/team/172/
https://www.pesmaster.com/brazilian-league/pes-2018/league/21/
https://pesdb.net/pes2018/?id=7511
```

URLs de otros juegos como `pes-5`, `pes-2015`, `pes-2021-mobile` o `efootball-2022` se saltan y quedan registradas como error para no contaminar la formula.

Ejemplo con URLs directas de PES Master:

```bash
python main.py scrape-pesmaster --url "https://www.pesmaster.com/..."
```

Ejemplo con un archivo de URLs:

```bash
python main.py scrape-pesmaster --urls-file data/raw/pesmaster_urls.txt
python main.py scrape-pesdb --urls-file data/raw/pesdb_urls.txt
```

El archivo de PES Master puede tener URLs de jugadores, equipos o ligas. Si tiene equipos, el programa entra al equipo y obtiene sus jugadores. Ya queda creado un ejemplo en:

```text
data/raw/pesmaster_team_urls.txt
```

Tambien puedes pedirle que busque todos los equipos desde la pagina de ligas de PES Master:

```bash
python main.py scrape-pesmaster --discover-all-teams
```

Ejemplo intentando descubrir jugadores desde un listado:

```bash
python main.py scrape-pesmaster --listing-url "https://www.pesmaster.com/pes-2018/search/" --max-pages 1
python main.py scrape-pesdb --listing-url "https://pesdb.net/pes2018/" --max-pages 1
```

Opciones utiles:

```bash
--delay 2.5          # pausa entre requests
--refresh-cache      # vuelve a descargar aunque exista HTML cacheado
--output ruta.csv    # cambia el CSV raw de salida
```

Los HTML se guardan en:

```text
data/raw/html_cache/
```

## Crear dataset limpio por comando

Despues de scrapear, genera el CSV procesado:

```bash
python main.py build-dataset
```

Salida:

```text
data/processed/pes2018_players_dataset.csv
```

El proceso normaliza columnas, convierte stats numericos a enteros, elimina duplicados por `player_id` y deja valores faltantes como vacios/NaN.

Si quieres unir CSVs especificos:

```bash
python main.py build-dataset --inputs data/raw/pesmaster_players_raw.csv data/raw/pesdb_players_raw.csv
```

## Entrenar modelos PES-like por comando

```bash
python main.py train
```

Entrena un modelo por posicion:

```text
GK, CB, LB, RB, DMF, CMF, LMF, RMF, AMF, LWF, RWF, SS, CF
```

Modelos/formulas probados:

```text
AnchorCurve
AnchorLinearRegression
AnchorRidge
AnchorLasso
AnchorElasticNet
AnchorExtraTrees
AnchorRandomForest
AnchorHistGradient
AnchorGradientBoosting
```

Todos parten de una curva anclada que satisface las equivalencias 60/70/80/90 por posicion. Luego entrenan un residuo sobre las diferencias entre stats para capturar perfiles reales de PES Master. El entrenamiento elige por posicion priorizando el porcentaje de error entero <= 1.

Archivos generados:

```text
models/pes_like_CF.joblib
models/pes_like_GK.joblib
outputs/model_scores.csv
outputs/formula_weights_by_position.csv
outputs/formulas_readable.txt
```

Los CSV se guardan en formato amigable para Excel en español: separador `;`, codificacion `utf-8-sig` y decimales con coma.

Las formulas lineales se entrenan con pesos no negativos para las stats. Los modelos no lineales tambien se prueban, pero solo se eligen si mejoran el error entero sin romper los anclajes.

La formula base ya no es una recta libre: es una curva por posicion anclada a los valores que pasaste para 60/70/80/90. Despues, el programa aprende un ajuste de perfil usando solamente PES Master/PESDB. No usa medias manuales.

Si algunas columnas opcionales estan vacias, el entrenamiento las ignora y sigue con las stats disponibles. En ese caso aparece una advertencia, pero no es un error.

Si el CSV fue creado con una version vieja del parser y las stats parecen corridas de columna, el entrenamiento intenta usar la cache local de PES Master en memoria para no generar modelos malos. No sobrescribe el CSV automaticamente.

En prediccion, si un jugador coincide por `player_id`, posicion y stats con el dataset original de PES Master, el programa usa directamente la media original como referencia exacta. Si los stats fueron editados, usa la formula y la calibracion.

Tambien se aplican anclajes para jugadores sinteticos con todas las stats relevantes iguales. Por ejemplo, si las stats relevantes estan en 80, las medias usadas como referencia son: GK 74, CB 87, LB/RB 89, DMF 89, CMF 86, LMF/RMF 86, AMF 87, LWF/RWF 87, SS 87 y CF 87. Para posiciones de campo no se usan las stats de arquero en este chequeo, y tampoco cuentan forma, pierna mala o resistencia a lesiones.

Ademas hay un ajuste suave de perfil para jugadores modificados: delanteros centrales/segundos delanteros muy completos reciben un bono chico, y CMF muy fisicos/box-to-box tienen una correccion a la baja para que no queden inflados. Los jugadores originales de PES Master y los anclajes exactos siguen teniendo prioridad sobre este ajuste.

Metricas:

```text
MAE
RMSE
% con error <= 1
% con error <= 2
% entero exacto
% entero con error <= 1
% entero con error <= 2
```

## Mejorar una formula existente

La opcion `7` del menu no empieza desde cero. Carga los modelos ya entrenados en `models/` y agrega una calibracion residual chica por posicion solamente cuando mejora la validacion contra el dataset original de PES 2018.

Por comando:

```bash
python main.py refine --dataset data/processed/pes2018_players_dataset.csv
```

Archivos generados:

```text
outputs/calibration_scores.csv
outputs/calibration_report.txt
```

La calibracion usa solo el dataset descargado desde PES Master/PESDB. No usa `mis_medias_corregidas.csv` ni medias manuales.

## Informe detallado

La opcion `8` evalua la formula contra los jugadores originales de PES 2018 sin usar el exact-match por `player_id`. Esto sirve para medir la formula real y no una copia directa de la media original.

Por comando:

```bash
python main.py evaluate --dataset data/processed/pes2018_players_dataset.csv
```

Archivos generados:

```text
outputs/formula_evaluation_report.txt
outputs/formula_evaluation_summary.csv
outputs/formula_evaluation_by_position.csv
outputs/formula_evaluation_by_rating_band.csv
outputs/formula_evaluation_worst_players.csv
outputs/formula_evaluation_all_players.csv
```

## Formulas legibles

El archivo:

```text
outputs/formulas_readable.txt
```

queda con formulas de este estilo:

```text
CF = 12.340
  + 0.2041 * finishing
  + 0.1732 * attacking_prowess
  + 0.1190 * ball_control
```

Los pesos salen cuando el modelo elegido es lineal. Si el mejor modelo por posicion es no lineal, se guarda el modelo entrenado y las metricas, pero la formula legible puede no mostrar pesos para esa posicion.

## Predecir nuevas medias por comando

Para un CSV de jugadores nuevos/modificados:

```bash
python main.py predict --csv data/processed/jugadores_nuevos.csv
```

Salida:

```text
outputs/predicciones.csv
```

Columnas de salida:

```text
ID
Nombre
Posicion
media
```

Logica final:

```text
media = curva_anclada_por_posicion + ajuste_de_perfil_aprendido
```

Para jugadores originales intactos:

```text
media = media original del dataset PES Master
```

Si el CSV de entrada trae una columna `overall_manual`, se conserva como dato de entrada pero no se usa para calcular la media.

## Limitaciones

- PES Master y PESDB pueden cambiar HTML. El parser usa heuristicas para tablas, listas y textos cercanos, pero puede requerir ajustes finos si una pagina cambia mucho.
- Si faltan muchos stats, el modelo rellena con medianas aprendidas. Eso permite predecir, pero baja la confianza.
- Con pocas muestras por posicion, las metricas no son muy confiables.
- Algunos modelos no lineales pueden mejorar una posicion concreta, pero son menos interpretables que los lineales.
- La formula resultante es una aproximacion practica para tu Option File, no una formula oficial.

## Flujo recomendado

```bash
python main.py scrape-pesmaster --urls-file data/raw/pesmaster_urls.txt
python main.py scrape-pesdb --urls-file data/raw/pesdb_urls.txt
python main.py build-dataset
python main.py train
python main.py predict --csv data/processed/jugadores_nuevos.csv
```
