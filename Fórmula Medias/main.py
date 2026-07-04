from __future__ import annotations

import argparse

import exportar_medias
import predict
import train


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Programa para deducir medias PES 2018 por posicion.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    train_parser = subparsers.add_parser("train", help="Entrena modelos por posicion.")
    train_parser.add_argument("--csv", help="CSV unico ya preparado, con estadisticas y media real.")
    train_parser.add_argument("--players-csv", help="Ruta a All players exported.csv.")
    train_parser.add_argument("--corrections-csv", help="Ruta a medias_corregidas.csv.")
    train_parser.add_argument("--config", default="config.json", help="Ruta al archivo de configuracion JSON.")

    predict_parser = subparsers.add_parser("predict", help="Predice medias con modelos entrenados.")
    predict_parser.add_argument("--csv", required=True, help="CSV con jugadores a predecir.")
    predict_parser.add_argument("--config", default="config.json", help="Ruta al archivo de configuracion JSON.")
    predict_parser.add_argument("--output", default="predicciones_nuevos_jugadores.csv")

    export_parser = subparsers.add_parser("export", help="Crea CSV nuevos con medias predichas.")
    export_parser.add_argument("--players-csv", help="Ruta a All players exported.csv.")
    export_parser.add_argument("--corrections-csv", help="Ruta a medias_corregidas.csv.")
    export_parser.add_argument("--formulas-json", help="Ruta a formulas_por_posicion.json.")
    export_parser.add_argument("--config", default="config.json", help="Ruta al archivo de configuracion JSON.")
    export_parser.add_argument(
        "--ss-like-cf",
        action="store_true",
        help="Usa el modelo de CF/DC para predecir SS.",
    )
    export_parser.add_argument(
        "--overwrite-all-players",
        action="store_true",
        help="Sobrescribe All players exported.csv con backup automatico.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "train":
        train.main_with_args(
            argparse.Namespace(
                csv=args.csv,
                players_csv=args.players_csv,
                corrections_csv=args.corrections_csv,
                config=args.config,
            )
        )
    elif args.command == "predict":
        predict.main_with_args(
            argparse.Namespace(csv=args.csv, config=args.config, output=args.output)
        )
    elif args.command == "export":
        exportar_medias.main_with_args(
            argparse.Namespace(
                players_csv=args.players_csv,
                corrections_csv=args.corrections_csv,
                formulas_json=args.formulas_json,
                config=args.config,
                ss_like_cf=args.ss_like_cf,
                overwrite_all_players=args.overwrite_all_players,
            )
        )


if __name__ == "__main__":
    main()
