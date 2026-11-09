"""Entrada principal de un clic para generar LAqP.website.

Abrir este archivo con Python muestra la interfaz grafica. Para automatizacion:

    python Herramientas/Generadores/generar_web.py --cli
    python Herramientas/Generadores/generar_web.py --cli --managers-only
"""

from generador_database import main
import sys


if __name__ == "__main__":
    if '--spider-patch-only' in sys.argv:
        from spider_patch import main as spider_main
        spider_main([arg for arg in sys.argv[1:] if arg != '--spider-patch-only'])
    elif '--guides-only' in sys.argv:
        from biblioteca_guias import main as guides_main
        guides_main([arg for arg in sys.argv[1:] if arg not in ('--guides-only','--cli')])
    else:
        raise SystemExit(main())

