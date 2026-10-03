"""Idempotent migration for the centralized LAqP manager model.

It creates timestamped backups under ``Herramientas/Salidas/backups`` and writes both CSV
files atomically. Run from any directory with Python.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import unicodedata
from datetime import datetime
from pathlib import Path


TRANSFERMARKT_IDS = {
    "xabi alonso-2026": "63052",
    "scaloni-2026": "62271",
    "mourinho-2026": "781",
    "kompany-2026": "69681",
    "guardiola-2026": "5672",
    "gallardo-2018": "19885",
    "flick-2026": "67",
    "coudet-2026": "38808",
    "arteta-2026": "47620",
    "arruabarrena-2026": "17428",
    "anchelotti-2026": "523",
}

TEAM_IDS = {
    "xabi alonso-2026": "102",
    "scaloni-2026": "50",
    "mourinho-2026": "109",
    "kompany-2026": "2293",
    "guardiola-2026": "",
    "gallardo-2018": "",
    "flick-2026": "108",
    "coudet-2026": "138",
    "arteta-2026": "101",
    "arruabarrena-2026": "139",
    "anchelotti-2026": "45",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in text if not unicodedata.combining(char)).lower().strip()


def read_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        return list(reader.fieldnames or []), [dict(row) for row in reader]


def atomic_write(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(path)


def insert_after(fields: list[str], anchor: str, additions: list[str]) -> list[str]:
    result = [field for field in fields if field not in additions]
    index = result.index(anchor) + 1 if anchor in result else len(result)
    return result[:index] + additions + result[index:]


def migrate(root: Path, backup: bool = True) -> Path | None:
    manager_path = root / "Herramientas" / "Recursos" / "Base-de-datos" / "DTs" / "config.csv"
    tactics_path = root / "database" / "tacticas-metadata.csv"
    if not manager_path.is_file() or not tactics_path.is_file():
        raise FileNotFoundError("No se encontraron los CSV de DTs y tacticas.")

    backup_dir = None
    if backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_dir = root / "Herramientas" / "Salidas" / "backups" / f"dt-system-{stamp}"
        backup_dir.mkdir(parents=True, exist_ok=False)
        shutil.copy2(manager_path, backup_dir / "entrenadores.csv")
        shutil.copy2(tactics_path, backup_dir / "tacticas-metadata.csv")

    manager_fields, managers = read_rows(manager_path)
    manager_fields = insert_after(
        manager_fields,
        "id",
        ["transfermarkt_id", "equipo_id", "foto_override"],
    )
    for row in managers:
        identifier = row.get("id", "").strip()
        row["transfermarkt_id"] = row.get("transfermarkt_id") or TRANSFERMARKT_IDS.get(identifier, "")
        row["equipo_id"] = row.get("equipo_id") or TEAM_IDS.get(identifier, "")
    atomic_write(manager_path, manager_fields, managers)

    name_to_id = {normalize(row.get("nombre")): row.get("id", "") for row in managers if row.get("nombre")}
    tactic_fields, tactics = read_rows(tactics_path)
    tactic_fields = insert_after(tactic_fields, "entrenador", ["entrenador_id"])
    for row in tactics:
        if not row.get("entrenador_id"):
            row["entrenador_id"] = name_to_id.get(normalize(row.get("entrenador")), "")
    atomic_write(tactics_path, tactic_fields, tactics)

    cache_path = root / "Herramientas" / "Recursos" / "Base-de-datos" / "cache" / "entrenadores_transfermarkt.json"
    if not cache_path.is_file():
        coaches = {}
        for row in managers:
            transfermarkt_id = row.get("transfermarkt_id", "").strip()
            if not transfermarkt_id:
                continue
            career = []
            for item in row.get("trayectoria", "").split("|"):
                parts = [part.strip() for part in item.split(":", 2)]
                if len(parts) >= 2:
                    career.append({
                        "period": parts[0],
                        "club": parts[1],
                        "start_date": "",
                        "end_date": "",
                        "role": parts[2] if len(parts) == 3 else "Manager",
                    })
            coaches[transfermarkt_id] = {
                "transfermarkt_id": transfermarkt_id,
                "source_url": f"https://www.transfermarkt.com/-/profil/trainer/{transfermarkt_id}",
                "name": row.get("nombre", ""),
                "full_name": "",
                "nationality": row.get("nacionalidad", ""),
                "birth_date": "",
                "current_club": "",
                "appointed_date": "",
                "status": "unknown",
                "preferred_formation": "",
                "career": career,
                "cached_image": "",
                "fetched_at": "",
                "origin": "laqp_migration",
            }
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = cache_path.with_suffix(cache_path.suffix + ".tmp")
        temporary.write_text(json.dumps({
            "schema_version": 1,
            "provider": "transfermarkt",
            "coaches": coaches,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(cache_path)
    return backup_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Migra el modelo centralizado de DTs de LAqP.")
    parser.add_argument("--project-root", help="Raiz del repositorio.")
    parser.add_argument("--no-backup", action="store_true", help="No crear backup (solo para pruebas).")
    args = parser.parse_args()
    root = Path(args.project_root).resolve() if args.project_root else Path(__file__).resolve().parents[2]
    backup = migrate(root, backup=not args.no_backup)
    print("Migracion de DTs completada.")
    if backup:
        print(f"Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
