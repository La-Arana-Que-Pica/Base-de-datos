"""Generador exclusivo de la Base de Datos de LAqP.

Regenera portada de la Base de Datos, jugadores, equipos, ligas, directorios,
DTs, tacticas, indices y sitemaps, y retira las fichas de jugadores que ya no se
publican. De Inicio solo actualiza los totales; no toca Spider Patch, guias ni editores.

Abrir este archivo con Python muestra la interfaz grafica. Para automatizacion:

    python Herramientas/Generadores/generar_base_de_datos.py --cli
"""

import argparse
import sys

from generador_database import GeneratorGUI, build_parser, find_project_root, run_cli


def main() -> int:
    # Solo opciones compatibles: cualquier otro modo pertenece a generar_web.py.
    parser = argparse.ArgumentParser(description="Genera solamente la Base de Datos de LAqP.")
    parser.add_argument("--cli", action="store_true", help="Ejecuta sin interfaz grafica.")
    parser.add_argument("--project-root", help="Raiz del repositorio LAqP.website.")
    parser.add_argument("--output-root", help="Raiz de salida alternativa, util para pruebas.")
    args = parser.parse_args()
    if not args.cli:
        GeneratorGUI(find_project_root(args.project_root), database_only=True).run()
        return 0
    forwarded = ["--cli", "--database-only"]
    if args.project_root:
        forwarded += ["--project-root", args.project_root]
    if args.output_root:
        forwarded += ["--output-root", args.output_root]
    return run_cli(build_parser().parse_args(forwarded))


if __name__ == "__main__":
    sys.exit(main())
