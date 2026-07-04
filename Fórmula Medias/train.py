from __future__ import annotations

import argparse

from src.config import load_config
from src.data import load_players, load_players_from_option_file, split_by_position
from src.io_utils import save_training_outputs
from src.models import train_for_position


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Entrena formulas de media general por posicion.")
    parser.add_argument("--csv", help="CSV unico ya preparado, con estadisticas y media real.")
    parser.add_argument("--players-csv", help="Ruta a All players exported.csv.")
    parser.add_argument("--corrections-csv", help="Ruta a medias_corregidas.csv.")
    parser.add_argument("--config", default="config.json", help="Ruta al archivo de configuracion JSON.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    main_with_args(args)


def main_with_args(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    if args.csv:
        players, feature_columns = load_players(config, args.csv)
    else:
        players, feature_columns = load_players_from_option_file(
            config,
            getattr(args, "players_csv", None),
            getattr(args, "corrections_csv", None),
        )
    players_by_position = split_by_position(players)

    trained_models = []
    for position, df_position in players_by_position.items():
        print(f"Entrenando posicion {position}: {len(df_position)} jugadores")
        trained = train_for_position(position, df_position, feature_columns, config)
        trained_models.append(trained)

    save_training_outputs(config, trained_models, players_by_position)
    print("Listo. Resultados guardados en la carpeta output.")


if __name__ == "__main__":
    main()
