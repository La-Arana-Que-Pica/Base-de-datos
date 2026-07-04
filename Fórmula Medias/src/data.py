from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .columns import build_column_lookup, resolve_alias
from .columns import resolve_feature_columns, resolve_required_columns
from .config import project_path


STANDARD_COLUMNS = ["player_id", "name", "position", "overall_real"]


def read_csv_auto(path: str | Path) -> pd.DataFrame:
    """Lee CSV con deteccion de separador, tolerando UTF-8 con BOM."""
    source = Path(path)
    try:
        return pd.read_csv(source, sep=None, engine="python", encoding="utf-8-sig")
    except UnicodeDecodeError:
        return pd.read_csv(source, sep=None, engine="python", encoding="latin1")


def _map_position(value, config: dict) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip().upper()
    if text.endswith(".0"):
        text = text[:-2]
    return config.get("position_code_map", {}).get(text, text)


def _standardize_players_dataframe(
    df_raw: pd.DataFrame,
    config: dict,
    require_target: bool,
    ignore_target: bool = False,
) -> tuple[pd.DataFrame, list[str]]:
    required = resolve_required_columns(
        df_raw,
        config,
        require_target=require_target,
        ignore_target=ignore_target,
    )
    features = resolve_feature_columns(df_raw, config, required)

    rename_map = {actual: canonical for canonical, actual in required.items()}
    rename_map.update({actual: canonical for canonical, actual in features.items()})

    selected_columns = list(dict.fromkeys([*required.values(), *features.values()]))
    df = df_raw[selected_columns].rename(columns=rename_map).copy()

    df["position"] = df["position"].map(lambda value: _map_position(value, config))
    if "name" in df.columns:
        df["name"] = df["name"].astype(str).str.strip()
    else:
        df["name"] = ""

    if "player_id" not in df.columns:
        df["player_id"] = range(1, len(df) + 1)

    if "overall_real" in df.columns:
        df["overall_real"] = pd.to_numeric(df["overall_real"], errors="coerce")
    else:
        df["overall_real"] = np.nan

    feature_columns = list(features.keys())
    for column in feature_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.replace([np.inf, -np.inf], np.nan)
    drop_required = ["position"]
    if require_target:
        drop_required.append("overall_real")
    df = df.dropna(subset=drop_required)
    df = df[df["position"] != ""]
    if require_target:
        df = df[df["overall_real"].between(1, 109)]

    # Mantiene jugadores que tienen al menos una estadistica utilizable.
    df = df.dropna(subset=feature_columns, how="all")

    if df.empty:
        raise ValueError("El CSV no tiene filas validas despues de limpiar los datos.")

    return df.reset_index(drop=True), feature_columns


def _resolve_option_file_columns(players: pd.DataFrame, corrections: pd.DataFrame, config: dict) -> tuple[str, str, str]:
    option_columns = config.get("option_file_columns", {})
    players_lookup = build_column_lookup(players.columns)
    corrections_lookup = build_column_lookup(corrections.columns)

    players_id = resolve_alias(players_lookup, option_columns.get("players_id", ["Id"]))
    corrections_id = resolve_alias(corrections_lookup, option_columns.get("corrections_id", ["PlayerId"]))
    corrected_overall = resolve_alias(
        corrections_lookup,
        option_columns.get("corrected_overall", ["OverallStats"]),
    )

    missing = []
    if players_id is None:
        missing.append("Id del CSV de jugadores")
    if corrections_id is None:
        missing.append("PlayerId del CSV de medias corregidas")
    if corrected_overall is None:
        missing.append("OverallStats del CSV de medias corregidas")
    if missing:
        raise ValueError("No se encontraron columnas necesarias: " + ", ".join(missing))

    return players_id, corrections_id, corrected_overall


def _deduplicate_corrections(corrections: pd.DataFrame, id_column: str, config: dict) -> pd.DataFrame:
    mode = str(config.get("duplicate_corrections", "last")).lower()
    if mode == "mean":
        numeric_columns = corrections.select_dtypes(include="number").columns
        return corrections.groupby(id_column, as_index=False)[list(numeric_columns)].mean()
    if mode == "first":
        return corrections.drop_duplicates(subset=[id_column], keep="first")
    return corrections.drop_duplicates(subset=[id_column], keep="last")


def load_players_from_option_file(
    config: dict,
    players_csv: str | Path | None = None,
    corrections_csv: str | Path | None = None,
) -> tuple[pd.DataFrame, list[str]]:
    """Carga All players exported.csv y aplica medias_corregidas.csv como media real."""
    players_path = project_path(config, players_csv or config["input_csv"])
    corrections_path = project_path(config, corrections_csv or config["corrections_csv"])

    if not players_path.exists():
        raise FileNotFoundError(f"No existe el CSV de jugadores: {players_path}")
    if not corrections_path.exists():
        raise FileNotFoundError(f"No existe el CSV de medias corregidas: {corrections_path}")

    players = read_csv_auto(players_path)
    corrections = read_csv_auto(corrections_path)
    players_id, corrections_id, corrected_overall = _resolve_option_file_columns(players, corrections, config)

    corrections = corrections[[corrections_id, corrected_overall]].copy()
    corrections[corrections_id] = pd.to_numeric(corrections[corrections_id], errors="coerce")
    corrections[corrected_overall] = pd.to_numeric(corrections[corrected_overall], errors="coerce")
    corrections = corrections.dropna(subset=[corrections_id, corrected_overall])
    corrections = _deduplicate_corrections(corrections, corrections_id, config)

    players = players.copy()
    players[players_id] = pd.to_numeric(players[players_id], errors="coerce")
    merged = players.merge(
        corrections,
        how="inner",
        left_on=players_id,
        right_on=corrections_id,
        suffixes=("", "_corrected"),
    )

    merged["overall_real"] = merged[corrected_overall]
    return _standardize_players_dataframe(merged, config, require_target=True)


def load_players(
    config: dict,
    csv_path: str | Path | None = None,
    require_target: bool = True,
    ignore_target: bool = False,
) -> tuple[pd.DataFrame, list[str]]:
    """Carga, normaliza y limpia el CSV de jugadores."""
    source = project_path(config, csv_path or config["input_csv"])
    if not source.exists():
        raise FileNotFoundError(
            f"No existe el CSV: {source}. Coloca el archivo en data/ o indica --csv."
        )

    df_raw = read_csv_auto(source)
    return _standardize_players_dataframe(
        df_raw,
        config,
        require_target=require_target,
        ignore_target=ignore_target,
    )


def split_by_position(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    return {
        position: group.reset_index(drop=True)
        for position, group in df.groupby("position", sort=True)
    }
