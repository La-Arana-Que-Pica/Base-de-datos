from __future__ import annotations

import argparse
import html as html_lib
import logging
import re
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

import pandas as pd
from bs4 import BeautifulSoup

from config import (
    ALL_COLUMNS,
    DATASET_PATH,
    META_COLUMNS,
    NUMERIC_COLUMNS,
    OUTPUTS_DIR,
    PARSE_ERRORS_PATH,
    POSITIONS,
    PROCESSED_DIR,
    RAW_DIR,
    RATING_COLUMNS,
    STAT_COLUMNS,
    ensure_directories,
    is_explicit_non_pes2018_url,
    normalize_key,
    normalize_position,
    save_csv_excel,
    setup_logging,
)


logger = logging.getLogger(__name__)


FIELD_ALIASES = {
    "id": "player_id",
    "player_id": "player_id",
    "pes_id": "player_id",
    "name": "name",
    "player": "name",
    "nombre": "name",
    "team": "team",
    "club": "team",
    "equipo": "team",
    "league": "league",
    "liga": "league",
    "nationality": "nationality",
    "country": "nationality",
    "nacionalidad": "nationality",
    "age": "age",
    "edad": "age",
    "height": "height",
    "altura": "height",
    "weight": "weight",
    "peso": "weight",
    "position": "main_position",
    "pos": "main_position",
    "registered_position": "main_position",
    "main_position": "main_position",
    "posicion": "main_position",
    "overall": "overall_rating",
    "overall_rating": "overall_rating",
    "rating": "overall_rating",
    "ovr": "overall_rating",
    "overallstats": "overall_manual",
    "overall_manual": "overall_manual",
    "attacking_prowess": "attacking_prowess",
    "attack": "attacking_prowess",
    "attacking": "attacking_prowess",
    "ball_control": "ball_control",
    "control_del_balon": "ball_control",
    "dribbling": "dribbling",
    "dribble": "dribbling",
    "low_pass": "low_pass",
    "ground_pass": "low_pass",
    "lofted_pass": "lofted_pass",
    "loft_pass": "lofted_pass",
    "finishing": "finishing",
    "place_kicking": "place_kicking",
    "set_piece_taking": "place_kicking",
    "free_kick": "place_kicking",
    "swerve": "swerve",
    "curl": "swerve",
    "curve": "swerve",
    "controlled_spin": "swerve",
    "header": "header",
    "heading": "header",
    "defensive_prowess": "defensive_prowess",
    "defence": "defensive_prowess",
    "defense": "defensive_prowess",
    "ball_winning": "ball_winning",
    "kicking_power": "kicking_power",
    "shot_power": "kicking_power",
    "speed": "speed",
    "explosive_power": "explosive_power",
    "acceleration": "explosive_power",
    "body_control": "body_control",
    "physical_contact": "physical_contact",
    "physical": "physical_contact",
    "jump": "jump",
    "jumping": "jump",
    "stamina": "stamina",
    "goalkeeping": "goalkeeping",
    "gk": "rating_as_GK",
    "catching": "catching",
    "clearing": "clearing",
    "reflexes": "reflexes",
    "coverage": "coverage",
    "weak_foot_usage": "weak_foot_usage",
    "weak_foot_use": "weak_foot_usage",
    "nondom_leg_usage": "weak_foot_usage",
    "non_dom_leg_usage": "weak_foot_usage",
    "weak_foot_accuracy": "weak_foot_accuracy",
    "weak_foot_acc": "weak_foot_accuracy",
    "nondom_leg_prec": "weak_foot_accuracy",
    "non_dom_leg_prec": "weak_foot_accuracy",
    "nondom_leg_precision": "weak_foot_accuracy",
    "form": "form",
    "condition": "form",
    "injury_resistance": "injury_resistance",
    "injury": "injury_resistance",
}

for position in POSITIONS:
    FIELD_ALIASES[f"rating_as_{position.lower()}"] = f"rating_as_{position}"
    FIELD_ALIASES[f"{position.lower()}_rating"] = f"rating_as_{position}"
    FIELD_ALIASES[position.lower()] = f"rating_as_{position}"


def canonical_column(label: str | None) -> str | None:
    key = normalize_key(label)
    return FIELD_ALIASES.get(key)


def parse_number(value: object) -> int | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    match = re.search(r"-?\d+", text)
    if not match:
        return None
    return int(match.group(0))


def clean_text(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def strip_tags(value: str) -> str:
    return clean_text(html_lib.unescape(re.sub(r"<[^>]+>", " ", value))) or ""


def empty_record(source: str | None = None, source_url: str | None = None) -> dict[str, object]:
    record = {column: None for column in ALL_COLUMNS}
    record["source"] = source
    record["source_url"] = source_url
    return record


def visible_lines(soup: BeautifulSoup) -> list[str]:
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return [line.strip() for line in soup.get_text("\n").splitlines() if line.strip()]


def extract_title_name(soup: BeautifulSoup) -> str | None:
    selectors = [
        "h1",
        ".player-name",
        ".name",
        "[itemprop='name']",
        "title",
    ]
    for selector in selectors:
        node = soup.select_one(selector)
        if not node:
            continue
        text = clean_text(node.get_text(" "))
        if not text:
            continue
        text = re.split(r"\s+-\s+|\s+\|\s+", text)[0].strip()
        text = re.sub(r"\s+PES\s*20\d{2}.*$", "", text, flags=re.I).strip()
        if text:
            return text
    return None


def extract_player_id(url: str | None, soup: BeautifulSoup) -> int | None:
    candidates: list[str] = []
    if url:
        candidates.append(url)
    canonical = soup.select_one("link[rel='canonical']")
    if canonical and canonical.get("href"):
        candidates.append(canonical["href"])
    for attr in ("data-player-id", "data-id"):
        node = soup.select_one(f"[{attr}]")
        if node and node.get(attr):
            candidates.append(str(node[attr]))
    for candidate in candidates:
        matches = re.findall(r"\d{2,}", candidate)
        if matches:
            return int(matches[-1])
    return None


def collect_label_value_pairs(soup: BeautifulSoup) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []

    for row in soup.select("tr"):
        cells = [clean_text(cell.get_text(" ")) for cell in row.find_all(["th", "td"])]
        cells = [cell for cell in cells if cell]
        if len(cells) >= 2:
            if parse_number(cells[0]) is not None and canonical_column(cells[-1]):
                pairs.append((cells[-1], cells[0]))
            else:
                pairs.append((cells[0], cells[-1]))

    for dt in soup.select("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            label = clean_text(dt.get_text(" "))
            value = clean_text(dd.get_text(" "))
            if label and value:
                pairs.append((label, value))

    for node in soup.select("li, p"):
        text = clean_text(node.get_text(" "))
        if not text or len(text) > 80:
            continue
        match = re.match(r"^(.{2,45}?):\s*(.{1,30})$", text)
        if match:
            pairs.append((match.group(1), match.group(2)))

    return pairs


def apply_value(record: dict[str, object], label: str, value: object) -> None:
    column = canonical_column(label)
    if column is None:
        return
    if column in NUMERIC_COLUMNS or column in RATING_COLUMNS or column in STAT_COLUMNS:
        record[column] = parse_number(value)
        return
    if column == "main_position":
        record[column] = normalize_position(str(value)) or clean_text(value)
        return
    record[column] = clean_text(value)


def parse_line_patterns(record: dict[str, object], lines: Iterable[str]) -> None:
    lines = list(lines)
    for index, line in enumerate(lines):
        label_column = canonical_column(line)
        if label_column and index + 1 < len(lines):
            apply_value(record, line, lines[index + 1])
            continue

        match = re.match(r"^([A-Za-z][A-Za-z /_-]{1,35})\s+(-?\d{1,3})$", line)
        if match:
            apply_value(record, match.group(1), match.group(2))
            continue

        position = normalize_position(line)
        if position and index + 1 < len(lines) and re.fullmatch(r"\d{1,3}", lines[index + 1]):
            record[f"rating_as_{position}"] = parse_number(lines[index + 1])


def parse_player_html(html: str, source: str, source_url: str | None = None) -> dict[str, object]:
    if normalize_key(source) == "pesmaster":
        fast_record = parse_pesmaster_html_fast(html, source, source_url)
        useful_values = sum(
            1
            for column in [*STAT_COLUMNS, "main_position", "overall_rating", "name"]
            if fast_record.get(column) is not None
        )
        if useful_values >= 12:
            return fast_record

    soup = BeautifulSoup(html, "lxml")
    record = empty_record(source, source_url)
    record["player_id"] = extract_player_id(source_url, soup)
    record["name"] = extract_title_name(soup)

    pairs = collect_label_value_pairs(soup)
    for label, value in pairs:
        apply_value(record, label, value)

    useful_values = sum(1 for column in [*STAT_COLUMNS, "main_position", "overall_rating"] if record.get(column) is not None)
    if useful_values < 8:
        parse_line_patterns(record, visible_lines(soup))

    if record.get("main_position"):
        record["main_position"] = normalize_position(str(record["main_position"])) or record["main_position"]
    return record


def parse_pesmaster_html_fast(html: str, source: str, source_url: str | None = None) -> dict[str, object]:
    record = empty_record(source, source_url)
    record["player_id"] = extract_player_id(source_url, BeautifulSoup("", "lxml"))

    name_match = re.search(
        r"<h3>\s*([^<]+?)\s*<span[^>]+id=[\"']shortlist[\"']",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if name_match:
        record["name"] = strip_tags(name_match.group(1))

    description_match = re.search(
        r"<p[^>]+class=[\"'][^\"']*description[^\"']*[\"'][^>]*>(.*?)</p>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if description_match:
        description = strip_tags(description_match.group(1))
        rating_match = re.search(r"\b(\d{2,3})-rated\b", description, flags=re.IGNORECASE)
        if rating_match:
            record["overall_rating"] = parse_number(rating_match.group(1))

    for match in re.finditer(
        r"<tr>\s*<td>\s*(Nationality|Team|League|Position|Age|Height|Weight)\s*</td>\s*<td>(.*?)</td>\s*</tr>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        apply_value(record, strip_tags(match.group(1)), strip_tags(match.group(2)))

    for match in re.finditer(
        r"<tr>\s*<td>\s*<span[^>]*class=[\"'][^\"']*\bstat\b[^\"']*[\"'][^>]*>\s*(-?\d{1,3})\s*</span>\s*</td>\s*</td>\s*<td>(.*?)</tr>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        value = match.group(1)
        label = strip_tags(match.group(2))
        apply_value(record, label, value)

    for match in re.finditer(
        r"<span[^>]*title=[\"']\s*(\d{1,3})\s+rating\s*[\"'][^>]*class=[\"'][^\"']*\bpos\b[^\"']*[\"'][^>]*>\s*([A-Z]{2,3})\s*</span>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        rating = parse_number(match.group(1))
        position = normalize_position(match.group(2))
        if rating is not None and position:
            record[f"rating_as_{position}"] = rating

    main_position = normalize_position(record.get("main_position"))
    if main_position and record.get("overall_rating") is not None:
        record[f"rating_as_{main_position}"] = record["overall_rating"]

    if record.get("main_position"):
        record["main_position"] = normalize_position(str(record["main_position"])) or record["main_position"]
    return record


def normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map: dict[str, str] = {}
    used: set[str] = set()
    for column in df.columns:
        canonical = canonical_column(str(column)) or normalize_key(str(column))
        if canonical in used:
            canonical = normalize_key(str(column))
        rename_map[column] = canonical
        used.add(canonical)
    return df.rename(columns=rename_map)


def clean_dataset(df: pd.DataFrame) -> pd.DataFrame:
    df = normalize_dataframe_columns(df.copy())
    for column in ALL_COLUMNS:
        if column not in df.columns:
            df[column] = pd.NA

    for column in NUMERIC_COLUMNS:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column].map(parse_number), errors="coerce").astype("Int64")

    for column in ("name", "team", "league", "nationality", "main_position", "source", "source_url"):
        if column in df.columns:
            df[column] = df[column].map(clean_text)

    if "name" in df.columns and "overall_rating" in df.columns:
        extracted = df["name"].astype("string").str.extract(r"^\s*(\d{2,3})\s+(.+?)\s*$")
        extracted_rating = pd.to_numeric(extracted[0], errors="coerce")
        can_fill_rating = df["overall_rating"].isna() & extracted_rating.between(1, 109)
        if can_fill_rating.any():
            df.loc[can_fill_rating, "overall_rating"] = extracted_rating.loc[can_fill_rating].astype("Int64")
            df.loc[can_fill_rating, "name"] = extracted.loc[can_fill_rating, 1].map(clean_text)

    if "source_url" in df.columns:
        non_pes2018_mask = df.apply(
            lambda row: is_explicit_non_pes2018_url(
                row.get("source") or source_from_url(str(row.get("source_url") or "")),
                row.get("source_url"),
            ),
            axis=1,
        )
        dropped = int(non_pes2018_mask.sum())
        if dropped:
            logger.warning("Se descartaron %s filas porque no son de PES 2018.", dropped)
            df = df.loc[~non_pes2018_mask].copy()

    if "main_position" in df.columns:
        if "pos" in df.columns:
            pos_as_position = df["pos"].map(normalize_position)
            missing_position = df["main_position"].map(normalize_position).isna()
            df.loc[missing_position & pos_as_position.notna(), "main_position"] = pos_as_position
        df["main_position"] = df["main_position"].map(lambda value: normalize_position(value) or value)

    if "player_id" in df.columns:
        has_id = df["player_id"].notna()
        with_id = df.loc[has_id].sort_values(["player_id", "source"], na_position="last").drop_duplicates(
            subset=["player_id"], keep="first"
        )
        without_id = df.loc[~has_id].drop_duplicates()
        df = pd.concat([with_id, without_id], ignore_index=True, sort=False)
    else:
        df = df.drop_duplicates()

    ordered = [column for column in ALL_COLUMNS if column in df.columns]
    extras = [column for column in df.columns if column not in ordered]
    return df[ordered + extras].reset_index(drop=True)


def read_csv_flexible(path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(path, sep=None, engine="python", encoding="utf-8-sig")
    except UnicodeDecodeError:
        return pd.read_csv(path, sep=None, engine="python", encoding="latin-1")


def build_dataset(input_paths: list[Path], output_path: Path = DATASET_PATH) -> pd.DataFrame:
    ensure_directories()
    frames = []
    for path in input_paths:
        if not path.exists():
            logger.warning("No existe el CSV: %s", path)
            continue
        frames.append(read_csv_flexible(path))

    if not frames:
        raise FileNotFoundError("No se encontro ningun CSV de entrada para construir el dataset.")

    dataset = clean_dataset(pd.concat(frames, ignore_index=True, sort=False))
    save_csv_excel(dataset, output_path)
    logger.info("Dataset guardado en %s (%s jugadores)", output_path, len(dataset))
    return dataset


def parse_html_cache(cache_dir: Path, source: str, output_path: Path) -> pd.DataFrame:
    ensure_directories()
    records: list[dict[str, object]] = []
    errors: list[dict[str, str]] = []

    for html_path in sorted(cache_dir.glob("*.html")):
        try:
            html = html_path.read_text(encoding="utf-8", errors="ignore")
            url_sidecar = html_path.with_suffix(".url.txt")
            source_url = url_sidecar.read_text(encoding="utf-8").strip() if url_sidecar.exists() else None
            record = parse_player_html(html, source=source, source_url=source_url)
            if not record.get("name") and not record.get("player_id"):
                raise ValueError("No se pudo extraer name ni player_id")
            records.append(record)
        except Exception as exc:  # noqa: BLE001 - logging keeps the batch alive.
            errors.append({"file": str(html_path), "source": source, "error": str(exc)})
            logger.exception("Error parseando %s", html_path)

    df = clean_dataset(pd.DataFrame(records)) if records else pd.DataFrame(columns=ALL_COLUMNS)
    save_csv_excel(df, output_path)

    if errors:
        PARSE_ERRORS_PATH.parent.mkdir(parents=True, exist_ok=True)
        save_csv_excel(pd.DataFrame(errors), PARSE_ERRORS_PATH)
        logger.warning("Se guardaron errores de parseo en %s", PARSE_ERRORS_PATH)

    logger.info("HTML cache parseado: %s registros -> %s", len(df), output_path)
    return df


def source_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if "pesmaster" in host:
        return "pesmaster"
    if "pesdb" in host:
        return "pesdb"
    return host or "unknown"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Parsea HTML cacheado o arma el dataset limpio.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    cache_parser = subparsers.add_parser("cache", help="Parsea una carpeta de HTML cacheado.")
    cache_parser.add_argument("--cache-dir", type=Path, required=True)
    cache_parser.add_argument("--source", required=True)
    cache_parser.add_argument("--output", type=Path, required=True)

    dataset_parser = subparsers.add_parser("dataset", help="Une CSVs raw y genera el dataset limpio.")
    dataset_parser.add_argument("--inputs", nargs="+", type=Path, default=list(RAW_DIR.glob("*.csv")))
    dataset_parser.add_argument("--output", type=Path, default=DATASET_PATH)

    return parser.parse_args()


def main() -> None:
    setup_logging(OUTPUTS_DIR / "parser.log")
    args = parse_args()
    if args.command == "cache":
        parse_html_cache(args.cache_dir, args.source, args.output)
    elif args.command == "dataset":
        build_dataset(args.inputs, args.output)


if __name__ == "__main__":
    main()
