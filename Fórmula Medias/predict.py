from __future__ import annotations

import argparse

import pandas as pd

from src.config import load_config, project_path
from src.data import load_players
from src.io_utils import load_model_bundle, prepare_output_dir, save_excel_csv
from src.metrics import prediction_frame


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera predicciones con modelos ya entrenados.")
    parser.add_argument("--csv", required=True, help="CSV con jugadores a predecir.")
    parser.add_argument("--config", default="config.json", help="Ruta al archivo de configuracion JSON.")
    parser.add_argument(
        "--output",
        default="predicciones_nuevos_jugadores.csv",
        help="Nombre del CSV de salida dentro de output/.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    main_with_args(args)


def main_with_args(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    players, _ = load_players(config, args.csv, require_target=False)

    outputs = []
    for position, df_position in players.groupby("position", sort=True):
        bundle = load_model_bundle(config, position)
        feature_columns = bundle["feature_columns"]
        missing_features = [column for column in feature_columns if column not in df_position.columns]
        if missing_features:
            raise ValueError(
                f"Faltan estadisticas para {position}: {', '.join(missing_features)}"
            )

        decimal_predictions = bundle["model"].predict(df_position[feature_columns])
        outputs.append(prediction_frame(df_position, decimal_predictions))

    output_dir = prepare_output_dir(config)
    output_path = output_dir / args.output
    save_excel_csv(pd.concat(outputs, ignore_index=True), output_path, config)
    print(f"Predicciones guardadas en {project_path(config, output_path)}")


if __name__ == "__main__":
    main()
