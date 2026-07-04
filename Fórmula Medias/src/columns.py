from __future__ import annotations

import re
import unicodedata
from typing import Iterable

import pandas as pd


def normalize_name(value: str) -> str:
    """Normaliza nombres de columnas para tolerar espacios, acentos y guiones."""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def build_column_lookup(columns: Iterable[str]) -> dict[str, str]:
    return {normalize_name(column): column for column in columns}


def resolve_alias(lookup: dict[str, str], aliases: Iterable[str]) -> str | None:
    for alias in aliases:
        found = lookup.get(normalize_name(alias))
        if found:
            return found
    return None


def resolve_required_columns(
    df: pd.DataFrame,
    config: dict,
    require_target: bool = True,
    ignore_target: bool = False,
) -> dict[str, str]:
    lookup = build_column_lookup(df.columns)
    resolved: dict[str, str] = {}
    missing: list[str] = []

    for canonical, aliases in config["required_columns"].items():
        if canonical == "overall_real" and ignore_target:
            continue
        actual = resolve_alias(lookup, [canonical, *aliases])
        if actual is None:
            if canonical == "position" or (canonical == "overall_real" and require_target):
                missing.append(canonical)
        else:
            resolved[canonical] = actual

    if missing:
        raise ValueError(
            "Faltan columnas obligatorias: "
            + ", ".join(missing)
            + ". Edita config.json para agregar alias si tu CSV usa otros nombres."
        )

    return resolved


def resolve_feature_columns(df: pd.DataFrame, config: dict, required: dict[str, str]) -> dict[str, str]:
    lookup = build_column_lookup(df.columns)
    resolved: dict[str, str] = {}

    for canonical, aliases in config.get("feature_columns", {}).items():
        actual = resolve_alias(lookup, [canonical, *aliases])
        if actual is not None:
            resolved[canonical] = actual

    if config.get("auto_detect_extra_numeric_features", False):
        ignored = {normalize_name(item) for item in config.get("ignored_columns", [])}
        ignored.update(normalize_name(column) for column in required.values())
        ignored.update(normalize_name(column) for column in resolved.values())

        numeric_columns = df.select_dtypes(include="number").columns
        for column in numeric_columns:
            normalized = normalize_name(column)
            if normalized not in ignored:
                resolved[normalized] = column

    if not resolved:
        raise ValueError(
            "No se encontro ninguna columna de estadistica. "
            "Revisa feature_columns en config.json."
        )

    return resolved
