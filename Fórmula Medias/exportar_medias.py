from __future__ import annotations

import argparse

from src.config import load_config
from src.exporter import export_corrected_files


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Genera CSV nuevos con medias predichas a partir de los modelos entrenados."
    )
    parser.add_argument("--players-csv", help="Ruta a All players exported.csv.")
    parser.add_argument("--corrections-csv", help="Ruta a medias_corregidas.csv.")
    parser.add_argument("--formulas-json", help="Ruta a formulas_por_posicion.json.")
    parser.add_argument("--config", default="config.json", help="Ruta al archivo de configuracion JSON.")
    parser.add_argument(
        "--ss-like-cf",
        action="store_true",
        help="Usa el modelo de CF/DC para predecir jugadores SS. Es opcional y no afecta el entrenamiento.",
    )
    parser.add_argument(
        "--overwrite-all-players",
        action="store_true",
        help="Sobrescribe All players exported.csv con las medias predichas. Crea backup automatico.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    main_with_args(args)


def main_with_args(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    result = export_corrected_files(
        config,
        players_csv=args.players_csv,
        corrections_csv=args.corrections_csv,
        use_ss_like_cf=args.ss_like_cf,
        overwrite_all_players=args.overwrite_all_players,
        formulas_json=args.formulas_json,
        use_saved_formulas=True,
    )
    print(f"Predicciones: {result.predictions_path}")
    print(f"Formulas usadas: {result.formulas_path}")
    if result.medias_corregidas_path:
        print(f"medias_corregidas nuevo: {result.medias_corregidas_path}")
    print(f"All players nuevo: {result.all_players_path}")
    if result.overwritten_all_players_path:
        print(f"All players sobrescrito: {result.overwritten_all_players_path}")
        print(f"Backup: {result.backup_path}")
    print(f"Jugadores predichos: {result.predicted_players}/{result.total_players}")
    if result.skipped_players:
        print(f"Jugadores sin prediccion: {result.skipped_players}")


if __name__ == "__main__":
    main()
