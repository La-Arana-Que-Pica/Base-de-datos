# Auditoría e integración del Overall PES 2018

## Sistema anterior

Había dos caminos activos:

1. La calculadora (`js/media-calculator.js`) cargaba
   `assets/data/formulas_por_posicion.json`, con regresiones lineales ancladas,
   curvas y pesos aproximados por posición.
2. Scouting (`js/rankings.js`) reutilizaba ese JSON para proyectar la media en
   otra posición, con un fallback heurístico adicional.

El resto de la web no recalculaba la media: leía `OverallStats` desde
`database/All players exported.csv` y lo reemplazaba, cuando correspondía, con
`database/medias_corregidas.csv`. Esto ocurría en `js/app.js`, `js/player.js`,
`js/team.js`, `js/league.js` y en el generador Python.

## Sistema nuevo

- Fuente de verdad JS: `js/pes2018-overall.js`.
- Equivalente de generación: `Herramientas/Generadores/pes2018_overall.py`.
- El JSON de regresiones anterior fue eliminado.
- `medias_corregidas.csv` ya no se carga ni se aplica en la web o el generador.
  Se conserva como dato histórico y para medir el comportamiento anterior en el
  reporte comparativo.
- Calculadora, base, fichas, equipos, ligas, Scouting, Builder y HTML estático
  consumen el resultado exacto o un derivado generado por la misma fórmula.

## Posiciones

Los tres órdenes se mantienen separados:

- Columnas recuperadas de la matriz y CSV activo LAQP:
  `0=GK, 1=CB, 2=LB, 3=RB, 4=DMF, 5=CMF, 6=LMF, 7=RMF, 8=AMF,
  9=LWF, 10=RWF, 11=SS, 12=CF`.
- IDs internos documentados de PES 2018:
  `0=CF, 1=SS, 2=RWF, 3=LWF, 4=AMF, 5=DMF, 6=CMF, 7=RMF, 8=LMF,
  9=CB, 10=RB, 11=LB, 12=GK`.
- La matriz nunca se indexa directamente con un ID externo. Las funciones
  `positionFromLaqp` / `position_from_laqp` y
  `positionFromPes2018Id` / `position_from_pes2018_id` convierten primero a un
  código de posición.

Las columnas `GK..CF` del CSV proporcionan el dominio secundario: 0 sin bonus,
1 parcial y 2 completo.

## Atributos

El adaptador acepta tanto nombres modernos (`OffensiveAwareness`, `BallControl`,
`Curl`, `Acceleration`, `Balance`, `GKAwareness`, etc.) como los encabezados del
CSV publicado (`Attacking Prowess`, `Ball Control`, `Controlled Spin`,
`Explosive Power`, `Body Control`, `Goalkeeping`, etc.).

`TightPossession` no se usa: no forma parte de las 20 filas reconstruidas de
PES 2018. La precisión del pie no dominante se toma de `WeakFootAcc` o
`Weak Foot Acc.` y conserva la normalización original.

## Validación

- 7 pruebas automatizadas aprobadas.
- Referencias del PES 2018 original: Cristiano Ronaldo 94, Lionel Messi 94,
  Luka Modrić 89, Sergio Ramos 88, Manuel Neuer 91 y Jan Oblak 88.
- Cobertura de CF, extremo, AMF, CMF, DMF, CB, lateral y GK.
- Atributos 40 y 99, clamp 40..109, resultado mayor de 99 y posiciones
  secundarias parcial/completa.
- Paridad exacta JS/Python en 3.250 combinaciones pseudoaleatorias, además de
  los seis casos de referencia: cero diferencias.
- Los 16.392 jugadores del CSV activo se procesaron sin errores.
- Se verificaron 6.528 fichas HTML vigentes y los 5.821 jugadores del índice
  del Builder: cero diferencias frente al módulo Python.

## Casos extraños encontrados

- Algunos registros actuales contienen atributos 40 aunque su nombre coincide
  con una estrella histórica. Por ejemplo, el registro activo de Sergio Ramos
  (ID 7329) tiene todos los atributos principales en 40 y por ello la fórmula
  real devuelve 40. El registro original de PES 2018 con el mismo ID, usado por
  la regresión de referencia, devuelve 88. No se alteraron stats ni se forzó el
  resultado esperado por nombre.
- `players_original.csv` contiene bloques de exportación de distintas versiones
  con columnas y duplicados por ID. La web continúa usando como fuente activa
  `All players exported.csv`; el archivo original solo se usa en los tests para
  recuperar la primera ficha original conocida.
- La regeneración completa encontró 2 errores ajenos a esta tarea: falta
  `Herramientas/Recursos/Base-de-datos/DTs/config.csv` y, en consecuencia, no hay
  entrenadores cargados. Los 6.447 HTML de jugadores, 235 de equipos y 21 de
  ligas sí fueron generados.
- El repositorio conserva rutas HTML históricas huérfanas que el generador no
  elimina. No están enlazadas por los directorios actuales. `js/site.js` carga
  la fuente de verdad bajo demanda para que una ruta antigua que todavía pueda
  hidratarse tampoco ejecute el JavaScript sin el nuevo algoritmo.

## Independencia del despliegue

La carpeta `Herramientas/Formula medias PES 2018/` contiene solamente pruebas,
comparadores, reportes y documentación. El sitio publicado depende de
`js/pes2018-overall.js`; el generador depende de su módulo hermano dentro de
`Herramientas/Generadores`. Eliminar esta carpeta nueva no rompe la web ni la
generación estática.
