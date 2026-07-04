from __future__ import annotations

import argparse
import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from config import (
    DATASET_PATH,
    AUXILIARY_STATS,
    EQUAL_STATS_ANCHORS,
    EQUAL_STATS_TOLERANCE,
    GOALKEEPING_STATS,
    MIN_EQUAL_STATS_ANCHOR_STATS,
    MIN_REFERENCE_MATCH_STATS,
    MODELS_DIR,
    OUTPUTS_DIR,
    PREDICTIONS_PATH,
    POSITIONS,
    STAT_COLUMNS,
    ensure_directories,
    normalize_position,
    save_csv_excel,
    setup_logging,
)
from parser import clean_dataset, read_csv_flexible


logger = logging.getLogger(__name__)


def load_bundle(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    return joblib.load(path)


def confidence_label(estimated_error: float | None, n_samples: int | None) -> str:
    if estimated_error is None or np.isnan(estimated_error):
        return "unknown"
    if n_samples is not None and n_samples < 10:
        return "low"
    if estimated_error <= 0.9:
        return "high"
    if estimated_error <= 1.8:
        return "medium"
    return "low"


def ensure_features(df: pd.DataFrame, feature_columns: list[str]) -> pd.DataFrame:
    for column in feature_columns:
        if column not in df.columns:
            df[column] = pd.NA
        df[column] = pd.to_numeric(df[column], errors="coerce")
    return df


def round_media(values: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce")
    rounded = pd.Series(pd.NA, index=values.index, dtype="Int64")
    valid = numeric.notna()
    rounded.loc[valid] = np.floor(numeric.loc[valid] + 0.5).astype(int)
    return rounded


def to_int_or_none(value: object) -> int | None:
    if value is None or pd.isna(value):
        return None
    try:
        return int(float(str(value).replace(",", ".")))
    except ValueError:
        return None


def to_float_or_none(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None


def mean_available(row: pd.Series, columns: list[str]) -> float | None:
    values = [to_float_or_none(row.get(column)) for column in columns]
    values = [value for value in values if value is not None]
    if not values:
        return None
    return float(np.mean(values))


def apply_profile_adjustments(df: pd.DataFrame) -> pd.DataFrame:
    forward_complete_cols = [
        "attacking_prowess",
        "ball_control",
        "dribbling",
        "finishing",
        "kicking_power",
        "speed",
        "explosive_power",
        "body_control",
        "stamina",
    ]
    field_cols = [
        column
        for column in STAT_COLUMNS
        if column not in AUXILIARY_STATS and column not in GOALKEEPING_STATS
    ]
    cmf_engine_cols = [
        "ball_control",
        "dribbling",
        "low_pass",
        "lofted_pass",
        "defensive_prowess",
        "ball_winning",
        "kicking_power",
        "speed",
        "explosive_power",
        "physical_contact",
        "stamina",
    ]

    for index, row in df.iterrows():
        current = to_float_or_none(row.get("overall_final"))
        position = normalize_position(row.get("prediction_position"))
        if current is None or not position:
            continue

        if position in {"CF", "SS"}:
            attack_mean = mean_available(row, forward_complete_cols)
            field_mean = mean_available(row, field_cols)
            if attack_mean is not None and field_mean is not None and attack_mean >= 84 and field_mean >= 76:
                bonus = (attack_mean - 84) * 0.45 + (field_mean - 76) * 0.12
                bonus = float(np.clip(bonus, 0.0, 1.35))
                if bonus:
                    df.at[index, "overall_final"] = current + bonus
                    df.at[index, "overall_pes_like"] = current + bonus
                    df.at[index, "prediction_status"] = "ok_profile_forward_complete"

        if position == "CMF":
            current = to_float_or_none(df.at[index, "overall_final"])
            engine_mean = mean_available(row, cmf_engine_cols)
            body_control = to_float_or_none(row.get("body_control"))
            header = to_float_or_none(row.get("header"))
            if current is not None and engine_mean is not None and current < 89 and engine_mean >= 84:
                bonus = (engine_mean - 84) * 0.45
                bonus = float(np.clip(bonus, 0.0, 1.25))
                if bonus:
                    df.at[index, "overall_final"] = current + bonus
                    df.at[index, "overall_pes_like"] = current + bonus
                    df.at[index, "prediction_status"] = "ok_profile_cmf_engine_bonus"
                continue

            if current is not None and engine_mean is not None and current >= 90 and engine_mean >= 84:
                penalty = (engine_mean - 84) * 0.55
                if body_control is not None:
                    penalty += max(0.0, 72.0 - body_control) * 0.10
                if header is not None:
                    penalty += max(0.0, 60.0 - header) * 0.05
                penalty = float(np.clip(penalty, 0.0, 2.2))
                if penalty:
                    df.at[index, "overall_final"] = current - penalty
                    df.at[index, "overall_pes_like"] = current - penalty
                    df.at[index, "prediction_status"] = "ok_profile_cmf_engine_balance"

    return df


def apply_original_reference(df: pd.DataFrame, reference_path: Path = DATASET_PATH) -> pd.DataFrame:
    if not reference_path.exists() or "player_id" not in df.columns:
        return df

    try:
        reference = clean_dataset(read_csv_flexible(reference_path))
    except Exception as exc:  # noqa: BLE001 - prediction should still work without the reference file.
        logger.warning("No se pudo leer la referencia PES Master: %s", exc)
        return df

    required = {"player_id", "main_position", "overall_rating"}
    if not required.issubset(reference.columns):
        return df

    reference = reference.dropna(subset=["player_id", "overall_rating"]).copy()
    reference["reference_position"] = reference["main_position"].map(normalize_position)
    reference = reference.dropna(subset=["reference_position"])
    reference = reference.drop_duplicates(subset=["player_id"], keep="first")
    reference_by_id = reference.set_index("player_id", drop=False)

    comparable_stats = [
        column
        for column in STAT_COLUMNS
        if column in df.columns
        and column in reference.columns
        and pd.to_numeric(reference[column], errors="coerce").notna().any()
    ]
    if len(comparable_stats) < MIN_REFERENCE_MATCH_STATS:
        logger.warning(
            "La referencia PES Master tiene pocas stats comparables (%s). No se usara exact match.",
            len(comparable_stats),
        )
        return df

    for index, row in df.iterrows():
        player_id = row.get("player_id")
        if pd.isna(player_id) or player_id not in reference_by_id.index:
            continue

        ref = reference_by_id.loc[player_id]
        if normalize_position(row.get("prediction_position")) != ref["reference_position"]:
            continue

        checked = 0
        matches = True
        for column in comparable_stats:
            current_value = to_int_or_none(row.get(column))
            reference_value = to_int_or_none(ref.get(column))
            if current_value is None or reference_value is None:
                continue
            checked += 1
            if current_value != reference_value:
                matches = False
                break

        if matches and checked >= MIN_REFERENCE_MATCH_STATS:
            df.at[index, "overall_final"] = float(ref["overall_rating"])
            df.at[index, "overall_pes_like"] = float(ref["overall_rating"])
            df.at[index, "estimated_error_mae"] = 0.0
            df.at[index, "confidence"] = "reference"
            df.at[index, "prediction_status"] = "reference_exact"

    return df


def anchor_value_for_equal_stats(position: str, level: float) -> float | None:
    anchors = EQUAL_STATS_ANCHORS.get(position)
    if not anchors:
        return None
    levels = np.array(sorted(anchors), dtype=float)
    ratings = np.array([anchors[int(item)] for item in levels], dtype=float)
    return float(np.interp(level, levels, ratings))


def anchor_curve_value(position: str, level: float) -> float | None:
    anchors = EQUAL_STATS_ANCHORS.get(position)
    if not anchors:
        return None
    x_points = np.array(sorted(anchors), dtype=float)
    y_points = np.array([anchors[int(item)] for item in x_points], dtype=float)
    value = float(level)
    if value < x_points[0]:
        slope = (y_points[1] - y_points[0]) / (x_points[1] - x_points[0])
        return float(y_points[0] + (value - x_points[0]) * slope)
    if value > x_points[-1]:
        slope = (y_points[-1] - y_points[-2]) / (x_points[-1] - x_points[-2])
        return float(y_points[-1] + (value - x_points[-1]) * slope)
    return float(np.interp(value, x_points, y_points))


def anchored_prediction(bundle: dict[str, object], frame: pd.DataFrame, position: str) -> np.ndarray:
    feature_columns = list(bundle["feature_columns"])
    values = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    levels = values.mean(axis=1).fillna(70.0)
    base = np.array([anchor_curve_value(position, level) for level in levels], dtype=float)
    centered = values.sub(levels, axis=0).fillna(0.0)

    residual_features: dict[str, pd.Series] = {}
    for column in feature_columns:
        series = centered[column].astype(float)
        residual_features[f"{column}__diff"] = series
        residual_features[f"{column}__pos"] = series.clip(lower=0.0)
        residual_features[f"{column}__neg"] = (-series).clip(lower=0.0)
        residual_features[f"{column}__abs"] = series.abs()
        residual_features[f"{column}__sq"] = np.sign(series) * (series.abs() ** 2) / 10.0

    residual_frame = pd.DataFrame(residual_features, index=frame.index)
    residual_columns = list(bundle.get("residual_feature_columns", residual_frame.columns))
    residual_frame = residual_frame.reindex(columns=residual_columns, fill_value=0.0)
    zero_frame = pd.DataFrame([[0.0] * len(residual_columns)], columns=residual_columns)
    zero_prediction = float(bundle["model"].predict(zero_frame)[0])
    return base + bundle["model"].predict(residual_frame) - zero_prediction


def anchored_direct_prediction(bundle: dict[str, object], frame: pd.DataFrame, position: str) -> np.ndarray:
    feature_columns = list(bundle["feature_columns"])
    values = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    levels = values.mean(axis=1).fillna(70.0)
    base = np.array([anchor_curve_value(position, level) for level in levels], dtype=float)
    equal_frame = pd.DataFrame(
        {column: levels.astype(float) for column in feature_columns},
        index=frame.index,
    )
    return bundle["model"].predict(values) + base - bundle["model"].predict(equal_frame)


def calibration_feature_frame(df: pd.DataFrame, feature_columns: list[str]) -> pd.DataFrame:
    features = pd.DataFrame(index=df.index)
    for column in feature_columns:
        if column == "__overall_pes_like__":
            features[column] = pd.to_numeric(df.get("overall_pes_like"), errors="coerce")
        elif column == "__overall_final__":
            features[column] = pd.to_numeric(df.get("overall_final"), errors="coerce")
        else:
            features[column] = pd.to_numeric(df[column], errors="coerce") if column in df.columns else np.nan
    return features


def apply_post_calibration(df: pd.DataFrame) -> pd.DataFrame:
    if "prediction_position" not in df.columns:
        return df

    for position in POSITIONS:
        mask = df["prediction_position"] == position
        if not mask.any():
            continue

        bundle = load_bundle(MODELS_DIR / f"pes_like_{position}.joblib")
        if bundle is None or not bundle.get("post_calibrator_enabled"):
            continue

        calibrator = bundle.get("post_calibrator")
        feature_columns = list(bundle.get("post_calibrator_feature_columns", []))
        if calibrator is None or not feature_columns:
            continue

        features = calibration_feature_frame(df.loc[mask], feature_columns)
        adjustment = np.asarray(calibrator.predict(features), dtype=float)
        limit = float(bundle.get("post_calibrator_limit", 2.0))
        adjustment = np.clip(adjustment, -limit, limit)

        df.loc[mask, "overall_final"] = pd.to_numeric(df.loc[mask, "overall_final"], errors="coerce") + adjustment
        df.loc[mask, "overall_pes_like"] = df.loc[mask, "overall_final"]
        if "post_calibration_mae" in bundle:
            df.loc[mask, "estimated_error_mae"] = float(bundle["post_calibration_mae"])
        df.loc[mask, "prediction_status"] = df.loc[mask, "prediction_status"].astype(str) + "_calibrated"

    return df


def apply_final_profile_adjustments(df: pd.DataFrame) -> pd.DataFrame:
    winger_technical_cols = [
        "attacking_prowess",
        "ball_control",
        "dribbling",
        "finishing",
        "body_control",
    ]

    for index, row in df.iterrows():
        position = normalize_position(row.get("prediction_position"))
        if position not in {"LWF", "RWF"}:
            continue

        current = to_float_or_none(row.get("overall_final"))
        technical_mean = mean_available(row, winger_technical_cols)
        speed = to_float_or_none(row.get("speed"))
        physical_contact = to_float_or_none(row.get("physical_contact"))
        if current is None or technical_mean is None or speed is None or physical_contact is None:
            continue

        if technical_mean >= 85 and speed < 72 and physical_contact < 65:
            penalty = (72 - speed) * 0.14 + (65 - physical_contact) * 0.10
            penalty += max(0.0, technical_mean - 85) * 0.03
            penalty = float(np.clip(penalty, 0.0, 1.4))
            if penalty:
                df.at[index, "overall_final"] = current - penalty
                df.at[index, "overall_pes_like"] = current - penalty
                df.at[index, "prediction_status"] = (
                    str(df.at[index, "prediction_status"]) + "_profile_winger_technical_pace"
                )

    return df


def equal_stats_columns_for_position(position: str, columns: list[str]) -> list[str]:
    primary_stats = [column for column in columns if column not in AUXILIARY_STATS]
    if position == "GK":
        return [column for column in primary_stats if column in GOALKEEPING_STATS]
    return [column for column in primary_stats if column not in GOALKEEPING_STATS]


def apply_equal_stats_anchors(df: pd.DataFrame) -> pd.DataFrame:
    comparable_stats = [
        column
        for column in STAT_COLUMNS
        if column in df.columns and pd.to_numeric(df[column], errors="coerce").notna().any()
    ]
    if len(comparable_stats) < MIN_EQUAL_STATS_ANCHOR_STATS:
        return df

    for index, row in df.iterrows():
        position = normalize_position(row.get("prediction_position"))
        if not position:
            continue

        position_stats = equal_stats_columns_for_position(position, comparable_stats)
        values = [
            to_int_or_none(row.get(column))
            for column in position_stats
        ]
        values = [value for value in values if value is not None]
        if len(values) < MIN_EQUAL_STATS_ANCHOR_STATS:
            continue

        if max(values) - min(values) > EQUAL_STATS_TOLERANCE:
            continue

        anchor_value = anchor_value_for_equal_stats(position, float(values[0]))
        if anchor_value is None:
            continue

        df.at[index, "overall_final"] = anchor_value
        df.at[index, "overall_pes_like"] = anchor_value
        df.at[index, "estimated_error_mae"] = 0.0
        df.at[index, "confidence"] = "anchor"
        df.at[index, "prediction_status"] = "equal_stats_anchor"

    return df


def predict_dataframe(
    input_df: pd.DataFrame,
    *,
    use_profile_adjustments: bool = True,
    use_post_calibration: bool = True,
    use_original_reference: bool = True,
    use_equal_stats_anchors: bool = True,
) -> pd.DataFrame:
    df = clean_dataset(input_df.copy())
    if "main_position" not in df.columns:
        raise ValueError("El CSV de entrada debe tener main_position o position.")
    df["prediction_position"] = df["main_position"].map(normalize_position)

    df["overall_pes_like"] = np.nan
    df["overall_final"] = np.nan
    df["estimated_error_mae"] = np.nan
    df["confidence"] = "unknown"
    df["prediction_status"] = "missing_model"

    for position in POSITIONS:
        mask = df["prediction_position"] == position
        if not mask.any():
            continue

        pes_bundle = load_bundle(MODELS_DIR / f"pes_like_{position}.joblib")
        if pes_bundle is None:
            logger.warning("No hay modelo PES-like para %s", position)
            continue

        pes_features = list(pes_bundle["feature_columns"])
        df = ensure_features(df, pes_features)
        if pes_bundle.get("formula_mode") == "anchored_residual":
            pes_predictions = anchored_prediction(pes_bundle, df.loc[mask, pes_features], position)
        elif pes_bundle.get("formula_mode") == "anchored_direct":
            pes_predictions = anchored_direct_prediction(pes_bundle, df.loc[mask, pes_features], position)
        elif pes_bundle.get("formula_mode") == "direct":
            raise RuntimeError(
                "Los modelos actuales fueron entrenados con una estrategia descartada "
                "(direct/rating_as). Volve a entrenar la formula para regenerar modelos confiables."
            )
        else:
            pes_predictions = pes_bundle["model"].predict(df.loc[mask, pes_features])
            residual_model = pes_bundle.get("residual_model")
            if pes_bundle.get("residual_enabled") and residual_model is not None:
                limit = float(pes_bundle.get("residual_adjustment_limit", 1.25))
                adjustments = residual_model.predict(df.loc[mask, pes_features])
                pes_predictions = pes_predictions + np.clip(adjustments, -limit, limit)
        df.loc[mask, "overall_pes_like"] = pes_predictions

        estimated_error = float(pes_bundle.get("training_mae", np.nan))

        df.loc[mask, "overall_final"] = df.loc[mask, "overall_pes_like"]
        df.loc[mask, "estimated_error_mae"] = estimated_error
        df.loc[mask, "confidence"] = confidence_label(
            estimated_error,
            int(pes_bundle.get("n_samples", 0)),
        )
        df.loc[mask, "prediction_status"] = "ok"

    if use_profile_adjustments:
        df = apply_profile_adjustments(df)
    if use_post_calibration:
        df = apply_post_calibration(df)
    if use_profile_adjustments:
        df = apply_final_profile_adjustments(df)
    if use_original_reference:
        df = apply_original_reference(df)
    if use_equal_stats_anchors:
        df = apply_equal_stats_anchors(df)

    return df



def prediction_output_frame(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "ID": df["player_id"],
            "Nombre": df["name"],
            "Posición": df["prediction_position"],
            "media": round_media(df["overall_final"]),
        }
    )


def predict_details(
    input_csv: Path,
    *,
    use_profile_adjustments: bool = True,
    use_post_calibration: bool = True,
    use_original_reference: bool = True,
    use_equal_stats_anchors: bool = True,
) -> pd.DataFrame:
    ensure_directories()
    return predict_dataframe(
        read_csv_flexible(input_csv),
        use_profile_adjustments=use_profile_adjustments,
        use_post_calibration=use_post_calibration,
        use_original_reference=use_original_reference,
        use_equal_stats_anchors=use_equal_stats_anchors,
    )


def predict(input_csv: Path, output_csv: Path = PREDICTIONS_PATH) -> pd.DataFrame:
    ensure_directories()
    df = predict_details(input_csv)
    output = prediction_output_frame(df)
    save_csv_excel(output, output_csv)
    logger.info("Predicciones guardadas en %s", output_csv)
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Predice medias de jugadores nuevos/modificados.")
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=PREDICTIONS_PATH)
    return parser.parse_args()


def main() -> None:
    setup_logging(OUTPUTS_DIR / "predict.log")
    args = parse_args()
    predict(args.csv, args.output)


if __name__ == "__main__":
    main()
