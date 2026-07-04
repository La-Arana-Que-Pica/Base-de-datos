from __future__ import annotations

import argparse
import logging
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNet, Lasso, LinearRegression, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import Pipeline

from config import (
    AUXILIARY_STATS,
    CACHE_DIR,
    DATASET_PATH,
    EQUAL_STATS_ANCHORS,
    FORMULA_EXCLUDED_FEATURES,
    FORMULA_WEIGHTS_PATH,
    GOALKEEPING_STATS,
    MODEL_SCORES_PATH,
    MODELS_DIR,
    OUTPUTS_DIR,
    POSITIONS,
    READABLE_FORMULAS_PATH,
    STAT_COLUMNS,
    ensure_directories,
    normalize_position,
    save_csv_excel,
    setup_logging,
)
from parser import clean_dataset, parse_player_html, read_csv_flexible


logger = logging.getLogger(__name__)

warnings.filterwarnings(
    "ignore",
    message="`sklearn.utils.parallel.delayed` should be used.*",
    category=UserWarning,
)


LINEAR_MODELS = {
    "LinearRegression": LinearRegression(positive=True),
    "Ridge": Ridge(alpha=1.0, positive=True),
    "Lasso": Lasso(alpha=0.03, max_iter=20000, positive=True),
    "ElasticNet": ElasticNet(alpha=0.03, l1_ratio=0.35, max_iter=20000, positive=True),
}
ANCHOR_RESIDUAL_MODELS = {
    "AnchorLinearRegression": LinearRegression(fit_intercept=False, positive=True),
    "AnchorRidge": Ridge(alpha=1.0, fit_intercept=False, positive=True),
    "AnchorLasso": Lasso(alpha=0.01, fit_intercept=False, max_iter=20000, positive=True),
    "AnchorElasticNet": ElasticNet(
        alpha=0.01,
        l1_ratio=0.35,
        fit_intercept=False,
        max_iter=20000,
        positive=True,
    ),
    "AnchorExtraTrees": ExtraTreesRegressor(
        n_estimators=500,
        random_state=42,
        min_samples_leaf=1,
        max_features=1.0,
        n_jobs=-1,
    ),
    "AnchorRandomForest": RandomForestRegressor(
        n_estimators=450,
        random_state=42,
        min_samples_leaf=1,
        max_features=1.0,
        n_jobs=-1,
    ),
    "AnchorHistGradient": HistGradientBoostingRegressor(
        max_iter=350,
        learning_rate=0.045,
        l2_regularization=0.03,
        random_state=42,
    ),
    "AnchorGradientBoosting": GradientBoostingRegressor(
        n_estimators=350,
        learning_rate=0.045,
        max_depth=3,
        random_state=42,
    ),
}
ANCHOR_DIRECT_MODELS: dict[str, object] = {}
DIRECT_MODELS: dict[str, object] = {}
MODEL_SELECTION_MAE_TOLERANCE = 0.01
MODEL_SELECTION_PRIORITY = {
    "AnchorRidge": 0,
    "AnchorLinearRegression": 1,
    "AnchorElasticNet": 2,
    "AnchorLasso": 3,
    "AnchorHistGradient": 4,
    "AnchorGradientBoosting": 5,
    "AnchorRandomForest": 6,
    "AnchorExtraTrees": 7,
    "AnchorDirectKNN": 8,
    "AnchorDirectHistGradient": 9,
    "AnchorDirectGradientBoosting": 10,
    "AnchorDirectRandomForest": 11,
    "AnchorDirectExtraTrees": 12,
    "DirectKNN": 13,
    "DirectHistGradient": 14,
    "DirectGradientBoosting": 15,
    "DirectRandomForest": 16,
    "DirectExtraTrees": 17,
    "Ridge": 0,
    "LinearRegression": 1,
    "ElasticNet": 2,
    "Lasso": 3,
}
RESIDUAL_IMPROVEMENT_MIN_MAE = 0.01
RESIDUAL_ADJUSTMENT_LIMIT = 1.25
MIN_CACHE_REPAIR_RECORDS = 1000


def metric_row(
    *,
    position: str,
    model_name: str,
    model_type: str,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    n_train: int,
    n_test: int,
) -> dict[str, object]:
    errors = np.abs(y_true - y_pred)
    rounded_predictions = np.floor(y_pred + 0.5)
    integer_errors = np.abs(y_true - rounded_predictions)
    return {
        "position": position,
        "model_type": model_type,
        "model_name": model_name,
        "n_train": n_train,
        "n_test": n_test,
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "pct_error_le_1": float(np.mean(errors <= 1) * 100),
        "pct_error_le_2": float(np.mean(errors <= 2) * 100),
        "pct_integer_exact": float(np.mean(integer_errors == 0) * 100),
        "pct_integer_error_le_1": float(np.mean(integer_errors <= 1) * 100),
        "pct_integer_error_le_2": float(np.mean(integer_errors <= 2) * 100),
    }


def make_pipeline(model: object) -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("model", clone(model)),
        ]
    )


def make_zero_impute_pipeline(model: object) -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value=0.0)),
            ("model", clone(model)),
        ]
    )


def make_residual_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "model",
                RandomForestRegressor(
                    n_estimators=140,
                    max_depth=7,
                    min_samples_leaf=6,
                    random_state=42,
                    n_jobs=1,
                ),
            ),
        ]
    )


def clipped_adjustment(values: np.ndarray) -> np.ndarray:
    return np.clip(values, -RESIDUAL_ADJUSTMENT_LIMIT, RESIDUAL_ADJUSTMENT_LIMIT)


def target_for_position(df: pd.DataFrame, position: str) -> pd.Series:
    if "overall_rating" not in df.columns or "main_position" not in df.columns:
        return pd.Series(np.nan, index=df.index)

    main_position = df["main_position"].map(normalize_position)
    target = df["overall_rating"].where(main_position == position)
    return pd.to_numeric(target, errors="coerce")


def anchor_columns_for_position(position: str, feature_columns: list[str]) -> list[str]:
    columns = [column for column in feature_columns if column not in AUXILIARY_STATS]
    if position == "GK":
        return [column for column in columns if column in GOALKEEPING_STATS]
    return [column for column in columns if column not in GOALKEEPING_STATS]


def anchor_curve(position: str, levels: pd.Series | np.ndarray) -> np.ndarray:
    anchors = EQUAL_STATS_ANCHORS[position]
    x_points = np.array(sorted(anchors), dtype=float)
    y_points = np.array([anchors[int(level)] for level in x_points], dtype=float)
    values = np.asarray(levels, dtype=float)
    result = np.interp(values, x_points, y_points)

    left = values < x_points[0]
    if left.any():
        slope = (y_points[1] - y_points[0]) / (x_points[1] - x_points[0])
        result[left] = y_points[0] + (values[left] - x_points[0]) * slope

    right = values > x_points[-1]
    if right.any():
        slope = (y_points[-1] - y_points[-2]) / (x_points[-1] - x_points[-2])
        result[right] = y_points[-1] + (values[right] - x_points[-1]) * slope

    return result


def anchor_levels(frame: pd.DataFrame, anchor_columns: list[str]) -> pd.Series:
    values = frame[anchor_columns].apply(pd.to_numeric, errors="coerce")
    return values.mean(axis=1).fillna(70.0)


def anchor_base_prediction(position: str, frame: pd.DataFrame, anchor_columns: list[str]) -> np.ndarray:
    return anchor_curve(position, anchor_levels(frame, anchor_columns))


def centered_anchor_frame(frame: pd.DataFrame, anchor_columns: list[str]) -> pd.DataFrame:
    values = frame[anchor_columns].apply(pd.to_numeric, errors="coerce")
    levels = values.mean(axis=1).fillna(70.0)
    return values.sub(levels, axis=0).fillna(0.0)


def residual_feature_frame(frame: pd.DataFrame, anchor_columns: list[str]) -> pd.DataFrame:
    centered = centered_anchor_frame(frame, anchor_columns)
    features: dict[str, pd.Series] = {}
    for column in anchor_columns:
        series = centered[column].astype(float)
        features[f"{column}__diff"] = series
        features[f"{column}__pos"] = series.clip(lower=0.0)
        features[f"{column}__neg"] = (-series).clip(lower=0.0)
        features[f"{column}__abs"] = series.abs()
        features[f"{column}__sq"] = np.sign(series) * (series.abs() ** 2) / 10.0
    return pd.DataFrame(features, index=frame.index)


def zero_residual_frame(anchor_columns: list[str]) -> pd.DataFrame:
    columns = []
    for column in anchor_columns:
        columns.extend(
            [
                f"{column}__diff",
                f"{column}__pos",
                f"{column}__neg",
                f"{column}__abs",
                f"{column}__sq",
            ]
        )
    return pd.DataFrame([[0.0] * len(columns)], columns=columns)


def equal_level_frame(frame: pd.DataFrame, anchor_columns: list[str]) -> pd.DataFrame:
    levels = anchor_levels(frame, anchor_columns)
    return pd.DataFrame(
        {column: levels.astype(float) for column in anchor_columns},
        index=frame.index,
    )


def residual_model_prediction(
    pipeline: Pipeline,
    residual_features: pd.DataFrame,
    zero_features: pd.DataFrame,
) -> np.ndarray:
    zero_prediction = float(pipeline.predict(zero_features)[0])
    return pipeline.predict(residual_features) - zero_prediction


def direct_anchor_prediction(
    position: str,
    pipeline: Pipeline,
    frame: pd.DataFrame,
    anchor_columns: list[str],
) -> np.ndarray:
    base = anchor_base_prediction(position, frame, anchor_columns)
    equal_frame = equal_level_frame(frame, anchor_columns)
    return pipeline.predict(frame[anchor_columns]) + base - pipeline.predict(equal_frame)


def dataset_looks_misaligned(df: pd.DataFrame) -> bool:
    if "stamina" not in df.columns:
        return False
    stamina = pd.to_numeric(df["stamina"], errors="coerce").dropna()
    return len(stamina) >= MIN_CACHE_REPAIR_RECORDS and float(stamina.median()) < 30


def dataset_from_html_cache(cache_dir: Path = CACHE_DIR / "pesmaster") -> pd.DataFrame | None:
    if not cache_dir.exists():
        return None

    records: list[dict[str, object]] = []
    for html_path in sorted(cache_dir.glob("*.html")):
        url_path = html_path.with_suffix(".url.txt")
        source_url = url_path.read_text(encoding="utf-8").strip() if url_path.exists() else None
        try:
            records.append(
                parse_player_html(
                    html_path.read_text(encoding="utf-8", errors="ignore"),
                    source="pesmaster",
                    source_url=source_url,
                )
            )
        except Exception as exc:  # noqa: BLE001 - a single bad cache file should not stop training.
            logger.debug("No se pudo parsear %s desde cache: %s", html_path, exc)

    if len(records) < MIN_CACHE_REPAIR_RECORDS:
        return None
    return clean_dataset(pd.DataFrame(records))


def repair_dataset_for_training(df: pd.DataFrame) -> pd.DataFrame:
    if not dataset_looks_misaligned(df):
        return df

    logger.warning(
        "El dataset parece tener stats corridas de una version vieja del parser "
        "(stamina demasiado baja). Se usara la cache local de PES Master solo en memoria."
    )
    repaired = dataset_from_html_cache()
    if repaired is None:
        logger.warning("No se pudo reparar desde cache. Se entrenara con el CSV actual.")
        return df
    return repaired


def position_frame(df: pd.DataFrame, position: str, feature_columns: list[str]) -> pd.DataFrame:
    target = target_for_position(df, position)
    frame = df.loc[target.notna(), feature_columns].copy()
    frame["target"] = target.loc[target.notna()].astype(float)
    return frame.dropna(axis=0, how="all", subset=feature_columns)


def split_data(frame: pd.DataFrame, feature_columns: list[str]) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    x = frame[feature_columns]
    y = frame["target"]
    if len(frame) >= 12:
        return train_test_split(x, y, test_size=0.2, random_state=42)
    return x, x, y, y


def train_position_models(
    df: pd.DataFrame,
    position: str,
    feature_columns: list[str],
    include_random_forest: bool = False,
) -> tuple[dict[str, object] | None, list[dict[str, object]], list[dict[str, object]]]:
    frame = position_frame(df, position, feature_columns)
    if len(frame) < 3:
        logger.warning("No hay suficientes datos para %s (%s filas)", position, len(frame))
        return None, [], []

    anchor_feature_columns = anchor_columns_for_position(position, feature_columns)
    if len(anchor_feature_columns) < 2:
        logger.warning("No hay suficientes stats anclables para %s", position)
        return None, [], []

    x_train, x_test, y_train, y_test = split_data(frame, anchor_feature_columns)
    direct_x_train = frame.loc[x_train.index, feature_columns]
    direct_x_test = frame.loc[x_test.index, feature_columns]
    score_rows: list[dict[str, object]] = []
    trained: dict[str, Pipeline] = {}

    base_train = anchor_base_prediction(position, x_train, anchor_feature_columns)
    base_test = anchor_base_prediction(position, x_test, anchor_feature_columns)
    residual_train = residual_feature_frame(x_train, anchor_feature_columns)
    residual_test = residual_feature_frame(x_test, anchor_feature_columns)
    zero_features = zero_residual_frame(anchor_feature_columns)

    score_rows.append(
        metric_row(
            position=position,
            model_name="AnchorCurve",
            model_type="anchored_formula",
            y_true=y_test.to_numpy(dtype=float),
            y_pred=base_test,
            n_train=len(x_train),
            n_test=len(x_test),
        )
    )

    for model_name, model in ANCHOR_RESIDUAL_MODELS.items():
        pipeline = make_zero_impute_pipeline(model)
        pipeline.fit(residual_train, y_train.to_numpy(dtype=float) - base_train)
        predictions = base_test + residual_model_prediction(pipeline, residual_test, zero_features)
        score_rows.append(
            metric_row(
                position=position,
                model_name=model_name,
                model_type="anchored_formula",
                y_true=y_test.to_numpy(dtype=float),
                y_pred=predictions,
                n_train=len(x_train),
                n_test=len(x_test),
            )
        )
        trained[model_name] = pipeline

    for model_name, model in ANCHOR_DIRECT_MODELS.items():
        pipeline = make_pipeline(model)
        pipeline.fit(x_train, y_train.to_numpy(dtype=float))
        predictions = direct_anchor_prediction(position, pipeline, x_test, anchor_feature_columns)
        score_rows.append(
            metric_row(
                position=position,
                model_name=model_name,
                model_type="anchored_direct_formula",
                y_true=y_test.to_numpy(dtype=float),
                y_pred=predictions,
                n_train=len(x_train),
                n_test=len(x_test),
            )
        )
        trained[model_name] = pipeline

    for model_name, model in DIRECT_MODELS.items():
        pipeline = make_pipeline(model)
        pipeline.fit(direct_x_train, y_train.to_numpy(dtype=float))
        predictions = pipeline.predict(direct_x_test)
        score_rows.append(
            metric_row(
                position=position,
                model_name=model_name,
                model_type="direct_formula",
                y_true=y_test.to_numpy(dtype=float),
                y_pred=predictions,
                n_train=len(direct_x_train),
                n_test=len(direct_x_test),
            )
        )
        trained[model_name] = pipeline

    candidate_scores = [
        row
        for row in score_rows
        if row["model_name"] in ANCHOR_RESIDUAL_MODELS
        or row["model_name"] in ANCHOR_DIRECT_MODELS
        or row["model_name"] in DIRECT_MODELS
    ]
    best_integer_pct = max(float(row["pct_integer_error_le_1"]) for row in candidate_scores)
    comparable_scores = [
        row
        for row in candidate_scores
        if float(row["pct_integer_error_le_1"]) >= best_integer_pct - 0.001
    ]
    best_score = min(
        comparable_scores,
        key=lambda row: (
            -float(row["pct_integer_exact"]),
            float(row["mae"]),
            MODEL_SELECTION_PRIORITY.get(str(row["model_name"]), 99),
        ),
    )
    for row in score_rows:
        row["selected_for_prediction"] = row["model_name"] == best_score["model_name"]

    best_model_name = str(best_score["model_name"])
    if best_model_name in DIRECT_MODELS:
        full_model = make_pipeline(DIRECT_MODELS[best_model_name])
        full_model.fit(frame[feature_columns], frame["target"].to_numpy(dtype=float))
        full_predictions = full_model.predict(frame[feature_columns])
        formula_mode = "direct"
        residual_feature_columns = []
        bundle_feature_columns = feature_columns
    elif best_model_name in ANCHOR_DIRECT_MODELS:
        full_model = make_pipeline(ANCHOR_DIRECT_MODELS[best_model_name])
        full_model.fit(frame[anchor_feature_columns], frame["target"].to_numpy(dtype=float))
        full_predictions = direct_anchor_prediction(position, full_model, frame, anchor_feature_columns)
        formula_mode = "anchored_direct"
        residual_feature_columns: list[str] = []
        bundle_feature_columns = anchor_feature_columns
    else:
        full_residual_features = residual_feature_frame(frame, anchor_feature_columns)
        full_base = anchor_base_prediction(position, frame, anchor_feature_columns)
        full_model = make_zero_impute_pipeline(ANCHOR_RESIDUAL_MODELS[best_model_name])
        full_model.fit(full_residual_features, frame["target"].to_numpy(dtype=float) - full_base)
        full_predictions = full_base + residual_model_prediction(
            full_model,
            full_residual_features,
            zero_features,
        )
        formula_mode = "anchored_residual"
        residual_feature_columns = list(full_residual_features.columns)
        bundle_feature_columns = anchor_feature_columns
    training_mae = float(mean_absolute_error(frame["target"], full_predictions))

    bundle = {
        "position": position,
        "model_type": "anchored_formula",
        "model_name": best_model_name,
        "model": full_model,
        "formula_mode": formula_mode,
        "anchor_feature_columns": anchor_feature_columns,
        "residual_feature_columns": residual_feature_columns,
        "residual_model": None,
        "residual_enabled": False,
        "residual_adjustment_limit": 0.0,
        "base_training_mae": training_mae,
        "feature_columns": bundle_feature_columns,
        "training_mae": training_mae,
        "residual_validation_base_mae": float(score_rows[0]["mae"]),
        "residual_validation_adjusted_mae": float(best_score["mae"]),
        "n_samples": len(frame),
    }
    weights = formula_weights(position, best_model_name, full_model, anchor_feature_columns)
    return bundle, score_rows, weights


def formula_weights(
    position: str,
    model_name: str,
    pipeline: Pipeline,
    feature_columns: list[str],
) -> list[dict[str, object]]:
    model = pipeline.named_steps["model"]
    if not hasattr(model, "coef_"):
        return []
    coefficients = np.asarray(model.coef_, dtype=float)
    coefficients = np.where(coefficients < 0, 0.0, coefficients)
    intercept = float(getattr(model, "intercept_", 0.0))
    rows = [
        {
            "position": position,
            "model_name": model_name,
            "feature": "__intercept__",
            "weight": intercept,
        }
    ]
    rows.extend(
        {
            "position": position,
            "model_name": model_name,
            "feature": feature,
            "weight": float(weight),
        }
        for feature, weight in zip(feature_columns, coefficients)
    )
    return rows


def predict_pes_like(df: pd.DataFrame, model_bundles: dict[str, dict[str, object]]) -> pd.Series:
    predictions = pd.Series(np.nan, index=df.index, dtype=float)
    for position, bundle in model_bundles.items():
        position_values = df.get("main_position", pd.Series(index=df.index, dtype=object)).map(normalize_position)
        mask = position_values == position
        if not mask.any():
            continue
        feature_columns = bundle["feature_columns"]
        predictions.loc[mask] = bundle["model"].predict(df.loc[mask, feature_columns])
    return predictions


def write_readable_formulas(weights: pd.DataFrame, path: Path) -> None:
    lines: list[str] = []
    for position in POSITIONS:
        frame = weights[(weights["position"] == position) & (weights["feature"] != "__intercept__")].copy()
        if frame.empty:
            continue
        intercept = weights[
            (weights["position"] == position) & (weights["feature"] == "__intercept__")
        ]["weight"]
        intercept_value = float(intercept.iloc[0]) if not intercept.empty else 0.0
        frame["abs_weight"] = frame["weight"].abs()
        frame = frame.sort_values("abs_weight", ascending=False)
        lines.append(f"{position} = {intercept_value:.3f}")
        for _, row in frame.iterrows():
            sign = "+" if row["weight"] >= 0 else "-"
            lines.append(f"  {sign} {abs(float(row['weight'])):.4f} * {row['feature']}")
        lines.append("")
    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def train_all(
    dataset_path: Path = DATASET_PATH,
    include_random_forest: bool = False,
) -> None:
    ensure_directories()
    dataset = repair_dataset_for_training(clean_dataset(read_csv_flexible(dataset_path)))
    feature_columns = [
        column
        for column in STAT_COLUMNS
        if column not in FORMULA_EXCLUDED_FEATURES
        and column in dataset.columns
        and pd.to_numeric(dataset[column], errors="coerce").notna().any()
    ]
    skipped_features = [column for column in STAT_COLUMNS if column in dataset.columns and column not in feature_columns]
    if skipped_features:
        logger.warning(
            "Se ignoran stats sin valor numerico o excluidas de la formula base: %s",
            ", ".join(skipped_features),
        )

    scores: list[dict[str, object]] = []
    all_weights: list[dict[str, object]] = []
    model_bundles: dict[str, dict[str, object]] = {}

    for position in POSITIONS:
        bundle, score_rows, weights = train_position_models(
            dataset,
            position,
            feature_columns,
            include_random_forest=include_random_forest,
        )
        scores.extend(score_rows)
        all_weights.extend(weights)
        if bundle is None:
            continue
        model_bundles[position] = bundle
        joblib.dump(bundle, MODELS_DIR / f"pes_like_{position}.joblib")
        logger.info(
            "Modelo PES-like %s guardado (%s, MAE train %.3f)",
            position,
            bundle["model_name"],
            bundle["training_mae"],
        )

    save_csv_excel(pd.DataFrame(scores), MODEL_SCORES_PATH)
    weights_frame = pd.DataFrame(all_weights)
    save_csv_excel(weights_frame, FORMULA_WEIGHTS_PATH)
    if not weights_frame.empty:
        write_readable_formulas(weights_frame, READABLE_FORMULAS_PATH)
    logger.info("Resultados guardados en %s", OUTPUTS_DIR)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Entrena formulas PES-like por posicion.")
    parser.add_argument("--dataset", type=Path, default=DATASET_PATH)
    parser.add_argument("--include-random-forest", action="store_true")
    return parser.parse_args()


def main() -> None:
    setup_logging(OUTPUTS_DIR / "train_model.log")
    args = parse_args()
    train_all(args.dataset, args.include_random_forest)


if __name__ == "__main__":
    main()
