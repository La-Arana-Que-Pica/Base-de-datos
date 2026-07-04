from __future__ import annotations

import numpy as np
import pandas as pd


def pes_round(values) -> np.ndarray:
    """Redondeo entero para media PES: 0.5 sube."""
    values = np.asarray(values, dtype=float)
    return np.floor(values + 0.5).astype(int)


def prediction_frame(df: pd.DataFrame, decimal_predictions) -> pd.DataFrame:
    decimal = np.asarray(decimal_predictions, dtype=float)
    rounded = pes_round(decimal)
    real = df["overall_real"].to_numpy(dtype=float)
    has_real = ~np.isnan(real)

    result = pd.DataFrame(
        {
            "player_id": df["player_id"].values,
            "jugador": df["name"].values,
            "posicion": df["position"].values,
            "media_real": real,
            "media_predicha_decimal": decimal,
            "media_predicha": rounded,
            "error": np.where(has_real, np.abs(rounded - real), np.nan),
            "error_decimal": np.where(has_real, np.abs(decimal - real), np.nan),
        }
    )
    return result


def calculate_metrics(real, decimal_predictions) -> dict[str, float]:
    real_values = np.asarray(real, dtype=float)
    rounded = pes_round(decimal_predictions)
    rounded_error = np.abs(rounded - real_values)
    decimal_error = np.abs(np.asarray(decimal_predictions, dtype=float) - real_values)

    return {
        "mae": float(np.mean(rounded_error)),
        "mae_decimal": float(np.mean(decimal_error)),
        "max_error": float(np.max(rounded_error)),
        "pct_error_le_1": float(np.mean(rounded_error <= 1) * 100),
        "pct_error_le_2": float(np.mean(rounded_error <= 2) * 100),
    }
