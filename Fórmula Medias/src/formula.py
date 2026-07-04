from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

INTERPRETABLE_MODELS = {"linear_regression", "ridge", "lasso", "elastic_net"}

if TYPE_CHECKING:
    from .models import TrainedPositionModel


def linear_formula_coefficients(trained: "TrainedPositionModel") -> tuple[float, dict[str, float]] | None:
    """Convierte coeficientes escalados a la escala original de las estadisticas."""
    if trained.model_name not in INTERPRETABLE_MODELS:
        return None

    estimator = trained.model.named_steps["model"]
    scaler = trained.model.named_steps["scaler"]

    coef_scaled = np.asarray(estimator.coef_, dtype=float)
    scale = np.asarray(scaler.scale_, dtype=float)
    mean = np.asarray(scaler.mean_, dtype=float)

    coef_original = coef_scaled / scale
    coef_original = np.where(coef_original < 0, 0, coef_original)
    intercept_original = float(estimator.intercept_ - np.sum(coef_scaled * mean / scale))
    weights = {
        feature: float(weight)
        for feature, weight in zip(trained.feature_columns, coef_original)
    }
    return intercept_original, weights


def formula_text(position: str, trained: "TrainedPositionModel") -> str:
    coefficients = linear_formula_coefficients(trained)
    header = [
        f"POSICION: {position}",
        f"MODELO ELEGIDO: {trained.model_name}",
        f"MAE redondeado: {trained.metrics['mae']:.4f}",
        f"MAE decimal: {trained.metrics['mae_decimal']:.4f}",
        "",
    ]

    if coefficients is None:
        importances = trained.model.named_steps["model"].feature_importances_
        ranked = sorted(zip(trained.feature_columns, importances), key=lambda item: abs(item[1]), reverse=True)
        lines = [
            *header,
            "El modelo elegido no es lineal, por lo que no tiene formula exacta interpretable.",
            "Importancia aproximada de estadisticas:",
        ]
        lines.extend(f"- {feature}: {importance:.6f}" for feature, importance in ranked)
        return "\n".join(lines)

    intercept, weights = coefficients
    ranked = sorted(weights.items(), key=lambda item: abs(item[1]), reverse=True)
    terms = [f"{intercept:.6f}"]
    terms.extend(f"({weight:.6f} * {feature})" for feature, weight in ranked if abs(weight) > 1e-10)

    lines = [
        *header,
        "Formula aproximada:",
        "media_decimal = " + " + ".join(terms),
        "media_pes = redondear(media_decimal)",
        "",
        "Pesos por estadistica:",
    ]
    lines.extend(f"- {feature}: {weight:.8f}" for feature, weight in ranked)
    return "\n".join(lines)


def formula_json_payload(trained_models: list["TrainedPositionModel"]) -> dict:
    payload = {}
    for trained in trained_models:
        coefficients = linear_formula_coefficients(trained)
        if coefficients is None:
            importances = trained.model.named_steps["model"].feature_importances_
            payload[trained.position] = {
                "model": trained.model_name,
                "interpretable_formula": False,
                "feature_importances": {
                    feature: float(value)
                    for feature, value in zip(trained.feature_columns, importances)
                },
                "metrics": trained.metrics,
            }
        else:
            intercept, weights = coefficients
            payload[trained.position] = {
                "model": trained.model_name,
                "interpretable_formula": True,
                "base": intercept,
                "weights": weights,
                "metrics": trained.metrics,
            }
    return payload


def save_formulas(trained_models: list["TrainedPositionModel"], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    text_blocks = [formula_text(model.position, model) for model in trained_models]
    separator = "\n\n" + ("-" * 80) + "\n\n"
    (output_dir / "formulas_por_posicion.txt").write_text(
        separator.join(text_blocks),
        encoding="utf-8",
    )

    payload = formula_json_payload(trained_models)
    (output_dir / "formulas_por_posicion.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
