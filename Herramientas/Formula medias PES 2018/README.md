# Fórmula de medias PES 2018

Entorno aislado de auditoría, validación y mantenimiento de la fórmula real de
Overall reconstruida desde `PES2018.exe`.

## Producción

- JavaScript: `js/pes2018-overall.js`.
- Python para generación estática: `Herramientas/Generadores/pes2018_overall.py`.

Nada dentro de esta carpeta es necesario para ejecutar el sitio publicado. Se
puede excluir o eliminar del despliegue sin romper la web.

## Contenido

- `comparar_base.py`: recalcula todos los jugadores del CSV activo y genera los
  reportes ordenados por diferencia absoluta.
- `validar_html_generado.py`: verifica fichas estáticas y el índice del Builder.
- `tests/test_pes2018_overall.py`: regresiones conocidas, posiciones, extremos,
  secundarias y paridad JS/Python.
- `tests/js_parity_runner.js`: puente de pruebas para ejecutar la fuente JS.
- `reportes/`: auditoría técnica y resultados generados.
- `fuentes/`: procedencia y hashes de los archivos entregados como referencia.

## Ejecutar

Desde la raíz del repositorio:

```powershell
python "Herramientas/Formula medias PES 2018/tests/test_pes2018_overall.py"
python "Herramientas/Formula medias PES 2018/comparar_base.py"
python "Herramientas/Formula medias PES 2018/validar_html_generado.py"
```

La fórmula ignora `TightPossession` deliberadamente porque no participa en las
20 filas recuperadas del algoritmo de PES 2018.
