from __future__ import annotations

import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from config import (
    AUXILIARY_STATS,
    CALIBRATION_REPORT_PATH,
    CALIBRATION_SCORES_PATH,
    DATASET_PATH,
    MODELS_DIR,
    OUTPUTS_DIR,
    POSITIONS,
    STAT_COLUMNS,
    ensure_directories,
    normalize_position,
    save_csv_excel,
    setup_logging,
)
from evaluate_formula import load_reference_dataset
from predict import calibration_feature_frame, predict_dataframe


logger = logging.getLogger(__name__)

CALIBRATION_LIMIT = 2.0
MIN_POSITION_SAMPLES = 30
MIN_VALIDATION_IMPROVEMENT = 0.001


def make_calibrator() -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "model",
                GradientBoostingRegressor(
                    n_estimators=220,
                    learning_rate=0.035,
                    max_depth=2,
                    min_samples_leaf=10,
                    random_state=42,
                ),
            ),
        ]
    )


def metric_values(y_true: pd.Series, predictions: np.ndarray) -> dict[str, float]:
    y_true_values = y_true.to_numpy(dtype=float)
    predictions = np.asarray(predictions, dtype=float)
    rounded = np.floor(predictions + 0.5)
    integer_errors = np.abs(y_true_values - rounded)
    decimal_errors = np.abs(y_true_values - predictions)
    return {
        "mae_decimal": float(mean_absolute_error(y_true_values, predictions)),
        "rmse_decimal": float(np.sqrt(mean_squared_error(y_true_values, predictions))),
        "mae_media": float(np.mean(integer_errors)),
        "exactas_pct": float(np.mean(integer_errors == 0) * 100),
        "error_<=1_pct": float(np.mean(integer_errors <= 1) * 100),
        "error_<=2_pct": float(np.mean(integer_errors <= 2) * 100),
        "error_max": float(np.max(integer_errors)),
        "mae_decimal_abs": float(np.mean(decimal_errors)),
    }


def calibration_columns(bundle: dict[str, object], dataset: pd.DataFrame) -> list[str]:
    columns = ["__overall_final__", "__overall_pes_like__"]
    bundle_columns = [column for column in bundle.get("feature_columns", []) if column in dataset.columns]
    auxiliary = [column for column in AUXILIARY_STATS if column in dataset.columns]
    stats = [column for column in STAT_COLUMNS if column in dataset.columns and column in set(bundle_columns + auxiliary)]
    for column in [*bundle_columns, *auxiliary, *stats]:
        if column not in columns:
            columns.append(column)
    return columns


def apply_adjustment(base_predictions: pd.Series, adjustments: np.ndarray, limit: float = CALIBRATION_LIMIT) -> np.ndarray:
    return base_predictions.to_numpy(dtype=float) + np.clip(np.asarray(adjustments, dtype=float), -limit, limit)


def write_calibration_report(scores: pd.DataFrame, path: Path) -> None:
    enabled = scores[scores["calibracion_activada"] == True]  # noqa: E712 - clearer in tabular code.
    lines = [
        "CALIBRACION INCREMENTAL DE FORMULA PES 2018",
        "",
        "Esta mejora no reemplaza la formula base.",
        "Agrega un corrector residual chico encima de cada modelo existente cuando mejora la validacion.",
        "",
        f"Posiciones con calibracion activada: {len(enabled)} / {len(scores)}",
        "",
        "Detalle por posicion",
    ]
    for _, row in scores.iterrows():
        status = "activada" if row["calibracion_activada"] else "sin cambios"
        lines.append(
            f"- {row['position']}: {status}, muestras={int(row['n_samples'])}, "
            f"MAE antes={row['mae_media_before']:.3f}, MAE despues={row['mae_media_after']:.3f}, "
            f"<=1 antes={row['pct_error_le_1_before']:.2f}%, <=1 despues={row['pct_error_le_1_after']:.2f}%"
        )
    lines.append("")
    lines.append(f"CSV de metricas: {CALIBRATION_SCORES_PATH}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def refine_existing_formula(dataset_path: Path = DATASET_PATH) -> pd.DataFrame:
    ensure_directories()
    dataset = load_reference_dataset(dataset_path)
    base_predictions = predict_dataframe(
        dataset,
        use_profile_adjustments=True,
        use_post_calibration=False,
        use_original_reference=False,
        use_equal_stats_anchors=False,
    )
    dataset = dataset.loc[base_predictions.index].copy()
    base_predictions["target"] = pd.to_numeric(dataset["overall_rating"], errors="coerce")
    base_predictions["position"] = dataset["main_position"].map(normalize_position)

    score_rows: list[dict[str, object]] = []

    for position in POSITIONS:
        mask = (base_predictions["position"] == position) & base_predictions["target"].notna()
        frame = base_predictions.loc[mask].copy()
        frame = frame.dropna(subset=["overall_final", "target"])
        if len(frame) < MIN_POSITION_SAMPLES:
            logger.warning("No hay suficientes jugadores para calibrar %s", position)
            continue

        bundle_path = MODELS_DIR / f"pes_like_{position}.joblib"
        if not bundle_path.exists():
            logger.warning("No existe modelo base para %s", position)
            continue
        bundle = joblib.load(bundle_path)
        feature_columns = calibration_columns(bundle, dataset)
        features = calibration_feature_frame(frame, feature_columns)
        target = frame["target"].astype(float)
        residual = target - pd.to_numeric(frame["overall_final"], errors="coerce")

        if len(frame) >= 60:
            x_train, x_test, residual_train, _residual_test, _target_train, target_test, _base_train, base_test = train_test_split(
                features,
                residual,
                target,
                pd.to_numeric(frame["overall_final"], errors="coerce"),
                test_size=0.2,
                random_state=42,
            )
        else:
            x_train, x_test = features, features
            residual_train = residual
            target_test = target
            base_test = pd.to_numeric(frame["overall_final"], errors="coerce")

        calibrator = make_calibrator()
        calibrator.fit(x_train, residual_train)
        before = metric_values(target_test, base_test.to_numpy(dtype=float))
        adjusted_test = apply_adjustment(base_test, calibrator.predict(x_test))
        after = metric_values(target_test, adjusted_test)

        improvement = before["mae_media"] - after["mae_media"]
        pct_improvement = after["error_<=1_pct"] - before["error_<=1_pct"]
        enabled = improvement >= MIN_VALIDATION_IMPROVEMENT or pct_improvement > 0

        final_calibrator = make_calibrator()
        final_calibrator.fit(features, residual)
        adjusted_full = apply_adjustment(
            pd.to_numeric(frame["overall_final"], errors="coerce"),
            final_calibrator.predict(features),
        )
        full_metrics = metric_values(target, adjusted_full)

        bundle["post_calibrator_enabled"] = bool(enabled)
        bundle["post_calibrator"] = final_calibrator if enabled else None
        bundle["post_calibrator_feature_columns"] = feature_columns if enabled else []
        bundle["post_calibrator_limit"] = CALIBRATION_LIMIT
        bundle["post_calibration_mae"] = full_metrics["mae_media"] if enabled else before["mae_media"]
        bundle["post_calibration_note"] = (
            "Calibracion residual incremental sobre la formula base; no usa medias manuales."
        )
        joblib.dump(bundle, bundle_path)

        score_rows.append(
            {
                "position": position,
                "n_samples": int(len(frame)),
                "calibracion_activada": bool(enabled),
                "mae_media_before": before["mae_media"],
                "mae_media_after": after["mae_media"],
                "pct_error_le_1_before": before["error_<=1_pct"],
                "pct_error_le_1_after": after["error_<=1_pct"],
                "pct_error_le_2_before": before["error_<=2_pct"],
                "pct_error_le_2_after": after["error_<=2_pct"],
                "mae_decimal_before": before["mae_decimal"],
                "mae_decimal_after": after["mae_decimal"],
                "full_mae_media_after": full_metrics["mae_media"],
                "full_pct_error_le_1_after": full_metrics["error_<=1_pct"],
                "ajuste_maximo": CALIBRATION_LIMIT,
            }
        )
        logger.info(
            "%s calibracion %s | MAE media %.3f -> %.3f | <=1 %.2f%% -> %.2f%%",
            position,
            "activada" if enabled else "sin cambios",
            before["mae_media"],
            after["mae_media"],
            before["error_<=1_pct"],
            after["error_<=1_pct"],
        )

    scores = pd.DataFrame(score_rows)
    save_csv_excel(scores, CALIBRATION_SCORES_PATH)
    write_calibration_report(scores, CALIBRATION_REPORT_PATH)
    return scores


def main() -> None:
    setup_logging(OUTPUTS_DIR / "calibrate_formula.log")
    refine_existing_formula()


if __name__ == "__main__":
    main()
