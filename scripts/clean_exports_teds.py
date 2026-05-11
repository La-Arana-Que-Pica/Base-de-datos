#!/usr/bin/env python3
"""
Limpieza segura de archivos .ted por Team ID.

Fuente por defecto:
  database/All leagues exported.csv

Uso con menu:
  python scripts/clean_exports_teds.py

Uso por comandos:
  python scripts/clean_exports_teds.py --dry-run
  python scripts/clean_exports_teds.py --apply
  python scripts/clean_exports_teds.py --csv "database/All leagues exported.csv" --exports exports --dry-run
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT_DIR / "database" / "All leagues exported.csv"
DEFAULT_EXPORTS = ROOT_DIR / "exports"
UNUSED_DIR_NAME = "_unused"


@dataclass
class Analysis:
    team_ids: set[str]
    ted_files: list[Path]
    keep: list[tuple[Path, str]]
    move: list[tuple[Path, str]]
    doubtful: list[tuple[Path, str]]


def normalize_id(value: str) -> str:
    """Normaliza ceros a la izquierda: 000101 -> 101."""
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        return str(int(text))
    except ValueError:
        return text.lstrip("0") or "0"


def read_text_with_fallback(path: Path) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"No se pudo leer {path} como UTF-8 ni latin-1.")


def sniff_dialect(text: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(text[:8192], delimiters=";,")
    except csv.Error:
        class FallbackDialect(csv.excel):
            delimiter = ";"
        return FallbackDialect


def read_csv_rows(csv_path: Path) -> tuple[list[str], list[list[str]], csv.Dialect]:
    if not csv_path.exists():
        raise FileNotFoundError(f"No existe el CSV: {csv_path}")
    if not csv_path.is_file():
        raise FileNotFoundError(f"La ruta no es un archivo CSV: {csv_path}")

    text = read_text_with_fallback(csv_path)
    dialect = sniff_dialect(text)
    rows = list(csv.reader(text.splitlines(), dialect=dialect))
    if not rows:
        raise RuntimeError(f"El CSV esta vacio: {csv_path}")
    headers = [cell.strip() for cell in rows[0]]
    return headers, rows[1:], dialect


def ids_from_cell(value: str) -> list[str]:
    """Extrae IDs numericos desde una celda que puede contener '101,102'."""
    return [normalize_id(match) for match in re.findall(r"\d+", str(value or ""))]


def load_team_ids(csv_path: Path) -> set[str]:
    headers, data_rows, _dialect = read_csv_rows(csv_path)
    normalized_headers = [header.strip().lower() for header in headers]
    team_ids: set[str] = set()

    # Formato esperado: league_id;league_name;team_ids
    team_ids_index = None
    for index, header in enumerate(normalized_headers):
        if header in {"team_ids", "team_id", "teams", "equipos", "equipo_ids"}:
            team_ids_index = index
            break

    if team_ids_index is not None:
        for row in data_rows:
            if team_ids_index < len(row):
                team_ids.update(ids_from_cell(row[team_ids_index]))
        return {team_id for team_id in team_ids if team_id}

    # Fallback: ignorar la primera columna (ID de liga) y extraer numeros del resto.
    for row in data_rows:
        for cell in row[1:]:
            team_ids.update(ids_from_cell(cell))

    return {team_id for team_id in team_ids if team_id}


def iter_ted_files(exports_dir: Path) -> list[Path]:
    if not exports_dir.exists():
        raise FileNotFoundError(f"No existe la carpeta exports: {exports_dir}")
    if not exports_dir.is_dir():
        raise FileNotFoundError(f"La ruta --exports no es una carpeta: {exports_dir}")

    backup_dir = (exports_dir / UNUSED_DIR_NAME).resolve()
    files: list[Path] = []
    for file_path in exports_dir.rglob("*.ted"):
        resolved = file_path.resolve()
        if resolved == backup_dir or backup_dir in resolved.parents:
            continue
        if file_path.is_file():
            files.append(file_path)
    return sorted(files, key=lambda item: str(item).lower())


def extract_ted_ids(file_path: Path) -> list[str]:
    """Extrae numeros candidatos desde el nombre del .ted."""
    numbers = re.findall(r"\d+", file_path.stem)
    return [normalize_id(number) for number in numbers if normalize_id(number)]


def classify_ted(file_path: Path, valid_team_ids: set[str]) -> tuple[str, str]:
    candidate_ids = extract_ted_ids(file_path)
    if not candidate_ids:
        return "doubtful", "no se encontro ningun numero en el nombre"

    matches = [candidate for candidate in candidate_ids if candidate in valid_team_ids]
    if matches:
        return "keep", f"Team ID coincidente: {', '.join(matches)}"

    if len(candidate_ids) > 1:
        return "move", f"IDs detectados no usados: {', '.join(candidate_ids)}"

    return "move", f"Team ID {candidate_ids[0]} no esta en el CSV"


def analyze(csv_path: Path, exports_dir: Path) -> Analysis:
    team_ids = load_team_ids(csv_path)
    if not team_ids:
        raise RuntimeError(f"No se detectaron Team IDs en el CSV: {csv_path}")

    ted_files = iter_ted_files(exports_dir)
    keep: list[tuple[Path, str]] = []
    move: list[tuple[Path, str]] = []
    doubtful: list[tuple[Path, str]] = []

    for file_path in ted_files:
        action, reason = classify_ted(file_path, team_ids)
        if action == "keep":
            keep.append((file_path, reason))
        elif action == "move":
            move.append((file_path, reason))
        else:
            doubtful.append((file_path, reason))

    return Analysis(
        team_ids=team_ids,
        ted_files=ted_files,
        keep=keep,
        move=move,
        doubtful=doubtful,
    )


def relative(path: Path, base: Path) -> str:
    try:
        return str(path.relative_to(base))
    except ValueError:
        return str(path)


def print_file_list(title: str, items: list[tuple[Path, str]], exports_dir: Path) -> None:
    print(f"\n{title} ({len(items)})")
    if not items:
        print("  - ninguno")
        return
    for file_path, reason in items:
        print(f"  - {relative(file_path, exports_dir)} :: {reason}")


def print_analysis_report(result: Analysis, csv_path: Path, exports_dir: Path) -> None:
    print("\n=== Analisis / dry-run ===\n")
    print(f"CSV usado: {relative(csv_path, ROOT_DIR)}")
    print(f"Carpeta exports: {relative(exports_dir, ROOT_DIR)}")
    print(f"Team IDs detectados en CSV: {len(result.team_ids)}")
    print(f"Total .ted encontrados: {len(result.ted_files)}")
    print(f"Se conservarian: {len(result.keep)}")
    print(f"Se moverian a {UNUSED_DIR_NAME}: {len(result.move)}")
    print(f"Dudosos: {len(result.doubtful)}")
    print_file_list("ARCHIVOS QUE SE CONSERVARIAN", result.keep, exports_dir)
    print_file_list("ARCHIVOS QUE SE MOVERIAN", result.move, exports_dir)
    print_file_list("DUDOSOS - NO SE MUEVEN", result.doubtful, exports_dir)


def unique_destination(backup_dir: Path, file_name: str) -> Path:
    destination = backup_dir / file_name
    if not destination.exists():
        return destination

    stem = destination.stem
    suffix = destination.suffix
    index = 2
    while True:
        candidate = backup_dir / f"{stem} ({index}){suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def apply_cleanup(result: Analysis, exports_dir: Path) -> None:
    backup_dir = exports_dir / UNUSED_DIR_NAME
    backup_dir.mkdir(parents=True, exist_ok=True)

    moved = 0
    for file_path, _reason in result.move:
        if not file_path.exists() or not file_path.is_file() or file_path.suffix.lower() != ".ted":
            continue
        destination = unique_destination(backup_dir, file_path.name)
        shutil.move(str(file_path), str(destination))
        print(f"MOVIDO: {relative(file_path, exports_dir)} -> {relative(destination, exports_dir)}")
        moved += 1

    print(f"\nListo. Movidos: {moved}. Dudosos sin tocar: {len(result.doubtful)}.")


def show_team_ids(csv_path: Path) -> None:
    team_ids = load_team_ids(csv_path)
    print("\n=== Team IDs detectados desde el CSV ===\n")
    print(f"CSV usado: {relative(csv_path, ROOT_DIR)}")
    print(f"Total Team IDs: {len(team_ids)}\n")
    for team_id in sorted(team_ids, key=lambda value: int(value) if value.isdigit() else value):
        print(f"- {team_id}")


def show_ted_files(exports_dir: Path) -> None:
    files = iter_ted_files(exports_dir)
    print("\n=== Archivos TED encontrados ===\n")
    print(f"Carpeta exports: {relative(exports_dir, ROOT_DIR)}")
    print(f"Total .ted: {len(files)}\n")
    for file_path in files:
        ids = extract_ted_ids(file_path)
        suffix = f" :: IDs detectados: {', '.join(ids)}" if ids else " :: sin ID detectado"
        print(f"- {relative(file_path, exports_dir)}{suffix}")


def interactive_menu(csv_path: Path, exports_dir: Path) -> int:
    while True:
        print("\n=== Limpieza de archivos TED por Team ID ===\n")
        print("CSV usado:")
        print(relative(csv_path, ROOT_DIR))
        print("\nCarpeta exports:")
        print(relative(exports_dir, ROOT_DIR))
        print("\n1) Hacer analisis / dry-run")
        print("2) Mover TEDs no usados a exports/_unused")
        print("3) Mostrar Team IDs detectados desde el CSV")
        print("4) Mostrar archivos TED encontrados")
        print("5) Salir")

        option = input("\nElegi una opcion: ").strip()

        try:
            if option == "1":
                result = analyze(csv_path, exports_dir)
                print_analysis_report(result, csv_path, exports_dir)
            elif option == "2":
                result = analyze(csv_path, exports_dir)
                print_analysis_report(result, csv_path, exports_dir)
                answer = input("\nSeguro que queres mover estos archivos? (s/n): ").strip().lower()
                if answer == "s":
                    apply_cleanup(result, exports_dir)
                else:
                    print("Cancelado. No se movio ningun archivo.")
            elif option == "3":
                show_team_ids(csv_path)
            elif option == "4":
                show_ted_files(exports_dir)
            elif option == "5":
                print("Saliendo.")
                return 0
            else:
                print("Opcion no valida.")
        except Exception as exc:
            print(f"\nERROR: {exc}", file=sys.stderr)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Limpia .ted no usados por Team ID.")
    parser.add_argument("--csv", default=str(DEFAULT_CSV), help="CSV con team IDs.")
    parser.add_argument("--exports", default=str(DEFAULT_EXPORTS), help="Carpeta exports.")
    parser.add_argument("--dry-run", action="store_true", help="Muestra que haria sin mover archivos.")
    parser.add_argument("--apply", action="store_true", help="Mueve archivos sobrantes a exports/_unused.")
    parser.add_argument("--show-team-ids", action="store_true", help="Muestra Team IDs detectados.")
    parser.add_argument("--show-teds", action="store_true", help="Muestra .ted encontrados.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    csv_path = Path(args.csv).resolve()
    exports_dir = Path(args.exports).resolve()

    command_mode = args.dry_run or args.apply or args.show_team_ids or args.show_teds
    if not command_mode:
        return interactive_menu(csv_path, exports_dir)

    try:
        if args.show_team_ids:
            show_team_ids(csv_path)
        if args.show_teds:
            show_ted_files(exports_dir)
        if args.dry_run:
            result = analyze(csv_path, exports_dir)
            print_analysis_report(result, csv_path, exports_dir)
        if args.apply:
            result = analyze(csv_path, exports_dir)
            print_analysis_report(result, csv_path, exports_dir)
            answer = input("\nSeguro que queres mover estos archivos? (s/n): ").strip().lower()
            if answer == "s":
                apply_cleanup(result, exports_dir)
            else:
                print("Cancelado. No se movio ningun archivo.")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
