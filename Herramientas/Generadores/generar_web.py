"""Entrada principal de un clic para generar LAqP.website.

Abrir este archivo con Python muestra la interfaz grafica. Para automatizacion:

    python Herramientas/Generadores/generar_web.py --cli
    python Herramientas/Generadores/generar_web.py --cli --managers-only
"""

from generador_database import main


if __name__ == "__main__":
    raise SystemExit(main())

