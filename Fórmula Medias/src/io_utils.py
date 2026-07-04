from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import pandas as pd

from .config import project_path
from .formula import save_formulas
from .metrics import prediction_frame

if TYPE_CHECKING:
    from .models import TrainedPositionModel


def prepare_output_dir(config: dict) -> Path:
    output_dir = project_path(config, config.get("output_dir", "output"))
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "models").mkdir(parents=True, exist_ok=True)
    return output_dir


def save_excel_csv(df: pd.DataFrame, path: Path, config: dict) -> None:
    """Guarda CSV en un formato que Excel en español abre en columnas."""
    df.to_csv(
        path,
        index=False,
        encoding="utf-8-sig",
        sep=config.get("output_csv_separator", ";"),
        decimal=config.get("output_csv_decimal", ","),
    )


def save_training_outputs(
    config: dict,
    trained_models: list["TrainedPositionModel"],
    players_by_position: dict[str, pd.DataFrame],
) -> None:
    output_dir = prepare_output_dir(config)

    predictions = []
    summary_rows = []
    model_comparison_rows = []

    for trained in trained_models:
        df_position = players_by_position[trained.position]
        decimal_predictions = trained.model.predict(df_position[trained.feature_columns])
        predictions.append(prediction_frame(df_position, decimal_predictions))

        summary_rows.append(
            {
                "position": trained.position,
                "players": len(df_position),
                "selected_model": trained.model_name,
                "train_size_for_model_selection": trained.train_size,
                "validation_size_for_model_selection": trained.validation_size,
                "validation_mae": trained.metrics["mae"],
                "validation_mae_decimal": trained.metrics["mae_decimal"],
                "validation_max_error": trained.metrics["max_error"],
                "validation_pct_error_le_1": trained.metrics["pct_error_le_1"],
                "validation_pct_error_le_2": trained.metrics["pct_error_le_2"],
                "all_data_mae": trained.all_data_metrics["mae"],
                "all_data_mae_decimal": trained.all_data_metrics["mae_decimal"],
                "all_data_max_error": trained.all_data_metrics["max_error"],
                "all_data_pct_error_le_1": trained.all_data_metrics["pct_error_le_1"],
                "all_data_pct_error_le_2": trained.all_data_metrics["pct_error_le_2"],
                "warning": trained.warning,
            }
        )
        model_comparison_rows.extend(trained.all_model_metrics)

        model_path = output_dir / "models" / f"{trained.position}.joblib"
        import joblib

        joblib.dump(
            {
                "position": trained.position,
                "model_name": trained.model_name,
                "feature_columns": trained.feature_columns,
                "model": trained.model,
            },
            model_path,
        )

    save_excel_csv(
        pd.concat(predictions, ignore_index=True),
        output_dir / "predicciones_jugadores.csv",
        config,
    )
    save_excel_csv(
        pd.DataFrame(summary_rows).sort_values("position"),
        output_dir / "resumen_por_posicion.csv",
        config,
    )
    save_excel_csv(
        pd.DataFrame(model_comparison_rows).sort_values(["position", "mae", "mae_decimal"]),
        output_dir / "comparacion_modelos.csv",
        config,
    )

    save_formulas(trained_models, output_dir)


def load_model_bundle(config: dict, position: str) -> dict:
    import joblib

    output_dir = project_path(config, config.get("output_dir", "output"))
    model_path = output_dir / "models" / f"{position.upper()}.joblib"
    if not model_path.exists():
        raise FileNotFoundError(
            f"No hay modelo entrenado para la posicion {position!r}: {model_path}"
        )
    return joblib.load(model_path)
