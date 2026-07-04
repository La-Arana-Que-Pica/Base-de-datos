from __future__ import annotations

import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config.json"


def load_config(config_path: str | Path | None = None) -> dict[str, Any]:
    """Carga la configuracion JSON y resuelve rutas relativas al proyecto."""
    path = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
    if not path.is_absolute():
        path = PROJECT_ROOT / path

    with path.open("r", encoding="utf-8") as fh:
        config = json.load(fh)

    config["_config_path"] = str(path)
    config["_project_root"] = str(PROJECT_ROOT)
    return config


def project_path(config: dict[str, Any], value: str | Path) -> Path:
    """Devuelve una ruta absoluta, tomando el proyecto como base si es relativa."""
    path = Path(value)
    if path.is_absolute():
        return path
    return Path(config["_project_root"]) / path
