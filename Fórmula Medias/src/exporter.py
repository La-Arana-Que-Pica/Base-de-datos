from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import shutil

import numpy as np
import pandas as pd

from .columns import build_column_lookup, resolve_alias
from .config import project_path
from .data import load_players, read_csv_auto
from .io_utils import load_model_bundle, prepare_output_dir, save_excel_csv
from .metrics import pes_round, prediction_frame


@dataclass
class ExportResult:
    predictions_path: Path
    medias_corregidas_path: Path | None
    all_players_path: Path
    overwritten_all_players_path: Path | None
    backup_path: Path | None
    formulas_path: Path | None
    total_players: int
    predicted_players: int
    skipped_players: int


def _option_aliases(config: dict, key: str, fallback: list[str]) -> list[str]:
    return config.get("option_file_columns", {}).get(key, fallback)


def _resolve_column(df: pd.DataFrame, aliases: list[str], label: str) -> str:
    found = resolve_alias(build_column_lookup(df.columns), aliases)
    if found is None:
        raise ValueError(f"No se encontro la columna {label}. Alias probados: {', '.join(aliases)}")
    return found


def _fallbacks(use_ss_like_cf: bool) -> dict[str, str]:
    if use_ss_like_cf:
        return {"SS": "CF"}
    return {}


def _load_formulas(config: dict, formulas_json: str | Path | None = None) -> tuple[dict, Path]:
    formulas_path = project_path(config, formulas_json or config.get("formulas_json", "output/formulas_por_posicion.json"))
    if not formulas_path.exists():
        raise FileNotFoundError(
            f"No existe {formulas_path}. Entrena una vez para generar formulas_por_posicion.json."
        )
    with formulas_path.open("r", encoding="utf-8") as fh:
        formulas = json.load(fh)
    return formulas, formulas_path


def _predict_with_saved_formulas(
    players: pd.DataFrame,
    config: dict,
    formulas_json: str | Path | None = None,
    use_ss_like_cf: bool = False,
) -> tuple[pd.DataFrame, Path]:
    formulas, formulas_path = _load_formulas(config, formulas_json)
    fallback_map = _fallbacks(use_ss_like_cf)
    outputs = []

    for position, df_position in players.groupby("position", sort=True):
        formula_position = fallback_map.get(position, position)
        formula = formulas.get(formula_position)
        if formula is None:
            raise ValueError(f"No hay formula guardada para la posicion {formula_position}.")
        if not formula.get("interpretable_formula", False):
            raise ValueError(
                f"La formula guardada para {formula_position} no es interpretable. "
                "Volve a entrenar priorizando modelos lineales."
            )

        weights = formula.get("weights", {})
        missing_features = [feature for feature in weights if feature not in df_position.columns]
        if missing_features:
            raise ValueError(
                f"Faltan estadisticas para aplicar la formula de {formula_position}: "
                + ", ".join(missing_features)
            )

        decimal_predictions = np.full(len(df_position), float(formula.get("base", 0.0)), dtype=float)
        for feature, weight in weights.items():
            decimal_predictions += pd.to_numeric(df_position[feature], errors="coerce").fillna(0).to_numpy() * float(weight)

        frame = prediction_frame(df_position, decimal_predictions)
        frame["formula_posicion"] = formula_position
        frame["posicion_original"] = position
        frame["origen_calculo"] = formulas_path.name
        outputs.append(frame)

    if not outputs:
        raise ValueError("No se pudieron generar predicciones con formulas guardadas.")

    predictions = pd.concat(outputs, ignore_index=True)
    predictions["media_predicha"] = pes_round(predictions["media_predicha_decimal"])
    return predictions, formulas_path


def predict_option_file_players(
    config: dict,
    players_csv: str | Path | None = None,
    use_ss_like_cf: bool = False,
    formulas_json: str | Path | None = None,
    use_saved_formulas: bool = True,
) -> pd.DataFrame:
    players, _ = load_players(
        config,
        players_csv or config["input_csv"],
        require_target=False,
        ignore_target=True,
    )
    if use_saved_formulas:
        predictions, _ = _predict_with_saved_formulas(
            players,
            config,
            formulas_json=formulas_json,
            use_ss_like_cf=use_ss_like_cf,
        )
        return predictions

    fallback_map = _fallbacks(use_ss_like_cf)
    outputs = []

    for position, df_position in players.groupby("position", sort=True):
        model_position = fallback_map.get(position, position)
        bundle = load_model_bundle(config, model_position)
        decimal_predictions = bundle["model"].predict(df_position[bundle["feature_columns"]])
        frame = prediction_frame(df_position, decimal_predictions)
        frame["modelo_posicion"] = model_position
        frame["posicion_original"] = position
        outputs.append(frame)

    if not outputs:
        raise ValueError("No se pudieron generar predicciones.")

    predictions = pd.concat(outputs, ignore_index=True)
    predictions["media_predicha"] = pes_round(predictions["media_predicha_decimal"])
    return predictions


def export_corrected_files(
    config: dict,
    players_csv: str | Path | None = None,
    corrections_csv: str | Path | None = None,
    use_ss_like_cf: bool = False,
    overwrite_all_players: bool = False,
    formulas_json: str | Path | None = None,
    use_saved_formulas: bool = True,
) -> ExportResult:
    output_dir = prepare_output_dir(config)
    players_path = project_path(config, players_csv or config["input_csv"])
    corrections_path = project_path(config, corrections_csv or config["corrections_csv"])

    raw_players = read_csv_auto(players_path)
    predictions = predict_option_file_players(
        config,
        players_path,
        use_ss_like_cf=use_ss_like_cf,
        formulas_json=formulas_json,
        use_saved_formulas=use_saved_formulas,
    )
    formulas_path = project_path(config, formulas_json or config.get("formulas_json", "output/formulas_por_posicion.json")) if use_saved_formulas else None
    prediction_by_id = predictions.set_index("player_id")["media_predicha"].to_dict()

    players_id_column = _resolve_column(
        raw_players,
        _option_aliases(config, "players_id", ["Id", "player_id", "PlayerId"]),
        "Id del archivo de jugadores",
    )
    players_overall_column = _resolve_column(
        raw_players,
        _option_aliases(config, "corrected_overall", ["OverallStats", "overall_real", "media_real"]),
        "OverallStats del archivo de jugadores",
    )

    updated_players = raw_players.copy()
    raw_ids = pd.to_numeric(updated_players[players_id_column], errors="coerce")
    updated_players[players_overall_column] = [
        prediction_by_id.get(player_id, original)
        for player_id, original in zip(raw_ids, updated_players[players_overall_column])
    ]

    predictions_path = output_dir / "predicciones_all_players.csv"
    all_players_path = output_dir / "All players exported_con_medias_predichas.csv"
    save_excel_csv(predictions.sort_values(["posicion", "jugador"]), predictions_path, config)
    save_excel_csv(updated_players, all_players_path, config)

    overwritten_path: Path | None = None
    backup_path: Path | None = None
    if overwrite_all_players:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = players_path.with_name(f"{players_path.stem}.formula_medias_backup_{timestamp}{players_path.suffix}")
        shutil.copy2(players_path, backup_path)
        save_excel_csv(updated_players, players_path, config)
        overwritten_path = players_path

    medias_path: Path | None = None
    if corrections_path.exists():
        corrections = read_csv_auto(corrections_path)
        corrections_id_column = _resolve_column(
            corrections,
            _option_aliases(config, "corrections_id", ["PlayerId", "player_id", "Id"]),
            "PlayerId del archivo de medias corregidas",
        )
        corrections_overall_column = _resolve_column(
            corrections,
            _option_aliases(config, "corrected_overall", ["OverallStats", "overall_real", "media_real"]),
            "OverallStats del archivo de medias corregidas",
        )
        updated_corrections = corrections.copy()
        correction_ids = pd.to_numeric(updated_corrections[corrections_id_column], errors="coerce")
        updated_corrections[corrections_overall_column] = [
            prediction_by_id.get(player_id, original)
            for player_id, original in zip(correction_ids, updated_corrections[corrections_overall_column])
        ]
        medias_path = output_dir / "medias_corregidas_predichas.csv"
        save_excel_csv(updated_corrections, medias_path, config)

    predicted_players = len(prediction_by_id)
    return ExportResult(
        predictions_path=predictions_path,
        medias_corregidas_path=medias_path,
        all_players_path=all_players_path,
        overwritten_all_players_path=overwritten_path,
        backup_path=backup_path,
        formulas_path=formulas_path,
        total_players=len(raw_players),
        predicted_players=predicted_players,
        skipped_players=max(len(raw_players) - predicted_players, 0),
    )
