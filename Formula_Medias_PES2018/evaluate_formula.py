from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

from config import (
    DATASET_PATH,
    EVALUATION_ALL_PLAYERS_PATH,
    EVALUATION_BY_POSITION_PATH,
    EVALUATION_BY_RATING_BAND_PATH,
    EVALUATION_REPORT_PATH,
    EVALUATION_SUMMARY_PATH,
    EVALUATION_WORST_PLAYERS_PATH,
    OUTPUTS_DIR,
    ensure_directories,
    save_csv_excel,
    setup_logging,
)
from parser import clean_dataset, read_csv_flexible
from predict import predict_dataframe, round_media
from train_model import repair_dataset_for_training


logger = logging.getLogger(__name__)


def load_reference_dataset(dataset_path: Path = DATASET_PATH) -> pd.DataFrame:
    dataset = clean_dataset(read_csv_flexible(dataset_path))
    return repair_dataset_for_training(dataset)


def rating_band(value: object) -> str:
    numeric = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    if pd.isna(numeric):
        return "sin_media"
    if numeric < 60:
        return "00-59"
    if numeric < 70:
        return "60-69"
    if numeric < 80:
        return "70-79"
    if numeric < 90:
        return "80-89"
    return "90+"


def metric_row(frame: pd.DataFrame, label: str) -> dict[str, object]:
    if frame.empty:
        return {
            "grupo": label,
            "jugadores": 0,
            "mae_decimal": np.nan,
            "rmse_decimal": np.nan,
            "mae_media": np.nan,
            "rmse_media": np.nan,
            "exactas_pct": np.nan,
            "error_<=1_pct": np.nan,
            "error_<=2_pct": np.nan,
            "error_max": np.nan,
            "sesgo_promedio": np.nan,
            "predice_de_mas": 0,
            "predice_de_menos": 0,
        }

    decimal_error = frame["media_decimal"] - frame["media_real"]
    media_error = frame["media"] - frame["media_real"]
    abs_decimal = decimal_error.abs()
    abs_media = media_error.abs()
    return {
        "grupo": label,
        "jugadores": int(len(frame)),
        "mae_decimal": float(abs_decimal.mean()),
        "rmse_decimal": float(np.sqrt(np.mean(decimal_error**2))),
        "mae_media": float(abs_media.mean()),
        "rmse_media": float(np.sqrt(np.mean(media_error**2))),
        "exactas_pct": float((abs_media == 0).mean() * 100),
        "error_<=1_pct": float((abs_media <= 1).mean() * 100),
        "error_<=2_pct": float((abs_media <= 2).mean() * 100),
        "error_max": float(abs_media.max()),
        "sesgo_promedio": float(media_error.mean()),
        "predice_de_mas": int((media_error > 0).sum()),
        "predice_de_menos": int((media_error < 0).sum()),
    }


def build_evaluation_frame(dataset: pd.DataFrame, predictions: pd.DataFrame) -> pd.DataFrame:
    frame = predictions.copy()
    frame["media_real"] = pd.to_numeric(dataset["overall_rating"], errors="coerce")
    frame["media_decimal"] = pd.to_numeric(frame["overall_final"], errors="coerce")
    frame["media"] = round_media(frame["media_decimal"])
    frame["error"] = frame["media"] - frame["media_real"]
    frame["error_abs"] = frame["error"].abs()
    frame["error_decimal"] = frame["media_decimal"] - frame["media_real"]
    frame["error_decimal_abs"] = frame["error_decimal"].abs()
    frame["rango_media_real"] = frame["media_real"].map(rating_band)

    columns = [
        "player_id",
        "name",
        "team",
        "league",
        "nationality",
        "prediction_position",
        "media_real",
        "media_decimal",
        "media",
        "error",
        "error_abs",
        "error_decimal",
        "error_decimal_abs",
        "rango_media_real",
        "prediction_status",
    ]
    return frame[[column for column in columns if column in frame.columns]].rename(
        columns={
            "player_id": "ID",
            "name": "Nombre",
            "team": "Equipo",
            "league": "Liga",
            "nationality": "Nacionalidad",
            "prediction_position": "Posición",
        }
    )


def write_text_report(
    summary: pd.DataFrame,
    by_position: pd.DataFrame,
    by_band: pd.DataFrame,
    worst: pd.DataFrame,
    path: Path,
) -> None:
    overall = summary.iloc[0].to_dict()
    lines = [
        "INFORME DETALLADO DE FORMULA PES 2018",
        "",
        "Este informe evalua la formula sin usar el exact-match por player_id.",
        "Es decir: compara la media real del dataset original contra la media calculada por la formula.",
        "",
        "Resumen general",
        f"- Jugadores evaluados: {int(overall['jugadores'])}",
        f"- MAE decimal: {overall['mae_decimal']:.3f}",
        f"- MAE media redondeada: {overall['mae_media']:.3f}",
        f"- RMSE media redondeada: {overall['rmse_media']:.3f}",
        f"- Exactas: {overall['exactas_pct']:.2f}%",
        f"- Error <= 1: {overall['error_<=1_pct']:.2f}%",
        f"- Error <= 2: {overall['error_<=2_pct']:.2f}%",
        f"- Error maximo: {overall['error_max']:.0f}",
        f"- Sesgo promedio: {overall['sesgo_promedio']:.3f}",
        f"- Predice de mas: {int(overall['predice_de_mas'])}",
        f"- Predice de menos: {int(overall['predice_de_menos'])}",
        "",
        "Por posicion",
    ]

    for _, row in by_position.iterrows():
        lines.append(
            f"- {row['grupo']}: jugadores={int(row['jugadores'])}, "
            f"MAE={row['mae_media']:.3f}, <=1={row['error_<=1_pct']:.2f}%, "
            f"<=2={row['error_<=2_pct']:.2f}%, sesgo={row['sesgo_promedio']:.3f}"
        )

    lines.extend(["", "Por rango de media real"])
    for _, row in by_band.iterrows():
        lines.append(
            f"- {row['grupo']}: jugadores={int(row['jugadores'])}, "
            f"MAE={row['mae_media']:.3f}, <=1={row['error_<=1_pct']:.2f}%, "
            f"<=2={row['error_<=2_pct']:.2f}%"
        )

    lines.extend(["", "Peores errores"])
    for _, row in worst.head(30).iterrows():
        lines.append(
            f"- ID {row['ID']} | {row['Nombre']} | {row['Posición']} | "
            f"real={row['media_real']} pred={row['media']} error={row['error']}"
        )

    lines.extend(
        [
            "",
            "Archivos generados",
            f"- {EVALUATION_ALL_PLAYERS_PATH}",
            f"- {EVALUATION_SUMMARY_PATH}",
            f"- {EVALUATION_BY_POSITION_PATH}",
            f"- {EVALUATION_BY_RATING_BAND_PATH}",
            f"- {EVALUATION_WORST_PLAYERS_PATH}",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def evaluate_formula(dataset_path: Path = DATASET_PATH) -> dict[str, Path]:
    ensure_directories()
    dataset = load_reference_dataset(dataset_path)
    predictions = predict_dataframe(
        dataset,
        use_profile_adjustments=True,
        use_post_calibration=True,
        use_original_reference=False,
        use_equal_stats_anchors=True,
    )
    evaluation = build_evaluation_frame(dataset, predictions).dropna(subset=["media_real", "media"])

    summary = pd.DataFrame([metric_row(evaluation, "TOTAL")])
    by_position = pd.DataFrame(
        metric_row(group, str(position))
        for position, group in evaluation.groupby("Posición", dropna=False)
    ).sort_values("grupo")
    by_band = pd.DataFrame(
        metric_row(group, str(band))
        for band, group in evaluation.groupby("rango_media_real", dropna=False)
    ).sort_values("grupo")
    worst = evaluation.sort_values(["error_abs", "error_decimal_abs"], ascending=False).head(250)

    save_csv_excel(evaluation, EVALUATION_ALL_PLAYERS_PATH)
    save_csv_excel(summary, EVALUATION_SUMMARY_PATH)
    save_csv_excel(by_position, EVALUATION_BY_POSITION_PATH)
    save_csv_excel(by_band, EVALUATION_BY_RATING_BAND_PATH)
    save_csv_excel(worst, EVALUATION_WORST_PLAYERS_PATH)
    write_text_report(summary, by_position, by_band, worst, EVALUATION_REPORT_PATH)

    logger.info("Informe de formula guardado en %s", EVALUATION_REPORT_PATH)
    return {
        "all_players": EVALUATION_ALL_PLAYERS_PATH,
        "summary": EVALUATION_SUMMARY_PATH,
        "by_position": EVALUATION_BY_POSITION_PATH,
        "by_rating_band": EVALUATION_BY_RATING_BAND_PATH,
        "worst_players": EVALUATION_WORST_PLAYERS_PATH,
        "report": EVALUATION_REPORT_PATH,
    }


def main() -> None:
    setup_logging(OUTPUTS_DIR / "evaluate_formula.log")
    evaluate_formula()


if __name__ == "__main__":
    main()
