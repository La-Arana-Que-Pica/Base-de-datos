from __future__ import annotations

import logging
import re
import unicodedata
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
CACHE_DIR = RAW_DIR / "html_cache"
PROCESSED_DIR = DATA_DIR / "processed"
MODELS_DIR = BASE_DIR / "models"
OUTPUTS_DIR = BASE_DIR / "outputs"

DATASET_PATH = PROCESSED_DIR / "pes2018_players_dataset.csv"
MANUAL_CORRECTIONS_PATH = PROCESSED_DIR / "mis_medias_corregidas.csv"
PARSE_ERRORS_PATH = OUTPUTS_DIR / "parse_errors.csv"
MODEL_SCORES_PATH = OUTPUTS_DIR / "model_scores.csv"
FORMULA_WEIGHTS_PATH = OUTPUTS_DIR / "formula_weights_by_position.csv"
READABLE_FORMULAS_PATH = OUTPUTS_DIR / "formulas_readable.txt"
PREDICTIONS_PATH = OUTPUTS_DIR / "predicciones.csv"
CALIBRATION_SCORES_PATH = OUTPUTS_DIR / "calibration_scores.csv"
CALIBRATION_REPORT_PATH = OUTPUTS_DIR / "calibration_report.txt"
EVALUATION_ALL_PLAYERS_PATH = OUTPUTS_DIR / "formula_evaluation_all_players.csv"
EVALUATION_SUMMARY_PATH = OUTPUTS_DIR / "formula_evaluation_summary.csv"
EVALUATION_BY_POSITION_PATH = OUTPUTS_DIR / "formula_evaluation_by_position.csv"
EVALUATION_BY_RATING_BAND_PATH = OUTPUTS_DIR / "formula_evaluation_by_rating_band.csv"
EVALUATION_WORST_PLAYERS_PATH = OUTPUTS_DIR / "formula_evaluation_worst_players.csv"
EVALUATION_REPORT_PATH = OUTPUTS_DIR / "formula_evaluation_report.txt"
TARGET_GAME_YEAR = "2018"
EXCEL_CSV_SEPARATOR = ";"
EXCEL_CSV_ENCODING = "utf-8-sig"
EXCEL_CSV_DECIMAL = ","

POSITIONS = [
    "GK",
    "CB",
    "LB",
    "RB",
    "DMF",
    "CMF",
    "LMF",
    "RMF",
    "AMF",
    "LWF",
    "RWF",
    "SS",
    "CF",
]

POSITION_CODE_MAP = {
    "0": "GK",
    "1": "CB",
    "2": "LB",
    "3": "RB",
    "4": "DMF",
    "5": "CMF",
    "6": "LMF",
    "7": "RMF",
    "8": "AMF",
    "9": "LWF",
    "10": "RWF",
    "11": "SS",
    "12": "CF",
}

META_COLUMNS = [
    "source",
    "source_url",
    "player_id",
    "name",
    "team",
    "league",
    "nationality",
    "age",
    "height",
    "weight",
    "main_position",
    "overall_rating",
]

RATING_COLUMNS = [f"rating_as_{position}" for position in POSITIONS]

STAT_COLUMNS = [
    "attacking_prowess",
    "ball_control",
    "dribbling",
    "low_pass",
    "lofted_pass",
    "finishing",
    "place_kicking",
    "swerve",
    "header",
    "defensive_prowess",
    "ball_winning",
    "kicking_power",
    "speed",
    "explosive_power",
    "body_control",
    "physical_contact",
    "jump",
    "stamina",
    "goalkeeping",
    "catching",
    "clearing",
    "reflexes",
    "coverage",
    "weak_foot_usage",
    "weak_foot_accuracy",
    "form",
    "injury_resistance",
]

FORMULA_EXCLUDED_FEATURES = {
    "place_kicking",
    "swerve",
}
MIN_REFERENCE_MATCH_STATS = 12
MIN_EQUAL_STATS_ANCHOR_STATS = 4
EQUAL_STATS_TOLERANCE = 0.001
GOALKEEPING_STATS = {
    "goalkeeping",
    "catching",
    "clearing",
    "reflexes",
    "coverage",
}
AUXILIARY_STATS = {
    "weak_foot_usage",
    "weak_foot_accuracy",
    "form",
    "injury_resistance",
}
EQUAL_STATS_ANCHORS = {
    "GK": {60: 50, 70: 62, 80: 74, 90: 86},
    "CB": {60: 53, 70: 72, 80: 87, 90: 99},
    "LB": {60: 55, 70: 74, 80: 89, 90: 102},
    "RB": {60: 55, 70: 74, 80: 89, 90: 102},
    "DMF": {60: 55, 70: 74, 80: 89, 90: 102},
    "CMF": {60: 53, 70: 72, 80: 86, 90: 99},
    "LMF": {60: 53, 70: 71, 80: 86, 90: 97},
    "RMF": {60: 53, 70: 71, 80: 86, 90: 97},
    "AMF": {60: 54, 70: 72, 80: 87, 90: 99},
    "LWF": {60: 54, 70: 72, 80: 87, 90: 99},
    "RWF": {60: 54, 70: 72, 80: 87, 90: 99},
    "SS": {60: 54, 70: 72, 80: 87, 90: 99},
    "CF": {60: 53, 70: 72, 80: 87, 90: 99},
}

ALL_COLUMNS = META_COLUMNS + RATING_COLUMNS + STAT_COLUMNS
NUMERIC_COLUMNS = [
    "player_id",
    "age",
    "height",
    "weight",
    "overall_rating",
    *RATING_COLUMNS,
    *STAT_COLUMNS,
]

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
}


def ensure_directories() -> None:
    for path in (RAW_DIR, CACHE_DIR, PROCESSED_DIR, MODELS_DIR, OUTPUTS_DIR):
        path.mkdir(parents=True, exist_ok=True)


def save_csv_excel(df, path: Path, index: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(
        path,
        index=index,
        sep=EXCEL_CSV_SEPARATOR,
        encoding=EXCEL_CSV_ENCODING,
        decimal=EXCEL_CSV_DECIMAL,
    )


def normalize_key(value: str | None) -> str:
    if value is None:
        return ""
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.lower().strip()
    value = value.replace("%", " percent ")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return re.sub(r"_+", "_", value).strip("_")


def normalize_position(value: str | None) -> str | None:
    if value is None:
        return None
    raw_text = str(value).strip()
    if not raw_text or raw_text.lower() in {"nan", "<na>", "none"}:
        return None
    if raw_text.endswith(".0"):
        raw_text = raw_text[:-2]
    mapped = POSITION_CODE_MAP.get(raw_text)
    if mapped:
        return mapped
    raw = raw_text.upper()
    raw = re.sub(r"[^A-Z]", "", raw)
    return raw if raw in POSITIONS else None


def extract_pes_version_from_url(source: str | None, url: str | None) -> str | None:
    if url is None:
        return None
    url_text = str(url).strip()
    if not url_text or url_text.lower() in {"nan", "<na>", "none"}:
        return None
    source_key = normalize_key(source)
    if source_key == "pesmaster":
        match = re.search(r"/(?:pes|efootball)-(\d{1,4})(?:[^0-9]|$)", url_text, flags=re.IGNORECASE)
        return match.group(1) if match else None
    if source_key == "pesdb":
        match = re.search(r"/pes(\d{1,4})(?:/|$)", url_text, flags=re.IGNORECASE)
        return match.group(1) if match else None
    return None


def is_explicit_pes2018_url(source: str | None, url: str | None) -> bool:
    return extract_pes_version_from_url(source, url) == TARGET_GAME_YEAR


def is_explicit_non_pes2018_url(source: str | None, url: str | None) -> bool:
    version = extract_pes_version_from_url(source, url)
    return version is not None and version != TARGET_GAME_YEAR


def setup_logging(log_file: Path | None = None, verbose: bool = True) -> None:
    ensure_directories()
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if log_file is not None:
        try:
            handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
        except OSError:
            # The app can still run if Windows or the sandbox blocks log-file writes.
            pass

    logging.basicConfig(
        level=logging.INFO if verbose else logging.WARNING,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=handlers,
        force=True,
    )
