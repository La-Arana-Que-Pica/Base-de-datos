from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.base import RegressorMixin
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNet, Lasso, LinearRegression, Ridge
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .metrics import calculate_metrics


INTERPRETABLE_MODELS = {"linear_regression", "ridge", "lasso", "elastic_net"}


@dataclass
class TrainedPositionModel:
    position: str
    model_name: str
    model: Pipeline
    feature_columns: list[str]
    metrics: dict[str, float]
    all_data_metrics: dict[str, float]
    all_model_metrics: list[dict[str, float | str | int]]
    validation_size: int
    train_size: int
    warning: str = ""


def _positive_params(name: str, params: dict, enforce_non_negative: bool) -> dict:
    updated = dict(params or {})
    if not enforce_non_negative or name not in INTERPRETABLE_MODELS:
        return updated

    updated["positive"] = True
    if name == "ridge":
        # Ridge solo acepta coeficientes positivos con el solver lbfgs.
        updated.setdefault("solver", "lbfgs")
    return updated


def build_model(name: str, params: dict, enforce_non_negative: bool = True) -> Pipeline:
    params = _positive_params(name, params, enforce_non_negative)

    if name == "linear_regression":
        estimator: RegressorMixin = LinearRegression(**params)
        return Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                ("model", estimator),
            ]
        )
    if name == "ridge":
        estimator = Ridge(**params)
        return Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                ("model", estimator),
            ]
        )
    if name == "lasso":
        estimator = Lasso(**params)
        return Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                ("model", estimator),
            ]
        )
    if name == "elastic_net":
        estimator = ElasticNet(**params)
        return Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                ("model", estimator),
            ]
        )
    if name == "random_forest":
        estimator = RandomForestRegressor(**params)
        return Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                ("model", estimator),
            ]
        )

    raise ValueError(f"Modelo no soportado: {name}")


def _validation_split(X: pd.DataFrame, y: pd.Series, config: dict):
    min_players = int(config.get("minimum_players_per_position", 8))
    if len(X) >= max(min_players, 10):
        return train_test_split(
            X,
            y,
            test_size=float(config.get("test_size", 0.2)),
            random_state=int(config.get("random_state", 42)),
        ), ""

    warning = (
        "Muestra pequena: se entreno y evaluo con los mismos jugadores. "
        "Agrega mas datos para validar mejor esta posicion."
    )
    return (X, X, y, y), warning


def choose_model(results: list[dict], config: dict) -> dict:
    sorted_results = sorted(results, key=lambda item: (item["metrics"]["mae"], item["metrics"]["mae_decimal"]))
    best_overall = sorted_results[0]

    if not config.get("select_interpretable_model_when_close", True):
        return best_overall

    interpretable = [item for item in sorted_results if item["name"] in INTERPRETABLE_MODELS]
    if not interpretable:
        return best_overall

    best_interpretable = interpretable[0]
    tolerance = float(config.get("interpretable_mae_tolerance", 0.25))
    if best_interpretable["metrics"]["mae"] <= best_overall["metrics"]["mae"] + tolerance:
        return best_interpretable

    return best_overall


def train_for_position(position: str, df_position: pd.DataFrame, feature_columns: list[str], config: dict) -> TrainedPositionModel:
    X = df_position[feature_columns]
    y = df_position["overall_real"]
    (X_train, X_valid, y_train, y_valid), warning = _validation_split(X, y, config)
    enforce_non_negative = bool(config.get("enforce_non_negative_weights", True))

    results = []
    for name, params in config.get("models", {}).items():
        model = build_model(name, params or {}, enforce_non_negative=enforce_non_negative)
        model.fit(X_train, y_train)
        predictions = model.predict(X_valid)
        metrics = calculate_metrics(y_valid, predictions)
        results.append(
            {
                "name": name,
                "model": model,
                "metrics": metrics,
                "train_size": len(X_train),
                "validation_size": len(X_valid),
            }
        )

    chosen = choose_model(results, config)

    # Reentrena el modelo elegido con todos los jugadores de la posicion.
    final_model = build_model(
        chosen["name"],
        config["models"].get(chosen["name"], {}) or {},
        enforce_non_negative=enforce_non_negative,
    )
    final_model.fit(X, y)
    all_predictions = final_model.predict(X)
    final_metrics = calculate_metrics(y, all_predictions)

    all_model_metrics: list[dict[str, float | str | int]] = []
    for item in results:
        row = {
            "position": position,
            "model": item["name"],
            "train_size": item["train_size"],
            "validation_size": item["validation_size"],
            **item["metrics"],
        }
        all_model_metrics.append(row)

    return TrainedPositionModel(
        position=position,
        model_name=chosen["name"],
        model=final_model,
        feature_columns=feature_columns,
        metrics=chosen["metrics"],
        all_data_metrics=final_metrics,
        all_model_metrics=all_model_metrics,
        validation_size=len(X_valid),
        train_size=len(X_train),
        warning=warning,
    )


def predict_with_model(model: Pipeline, df: pd.DataFrame, feature_columns: list[str]) -> np.ndarray:
    return model.predict(df[feature_columns])
