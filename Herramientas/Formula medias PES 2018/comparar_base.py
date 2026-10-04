"""Compara el OVR publicado anteriormente con el algoritmo real de PES 2018."""

from __future__ import annotations

import csv
import sys
from collections import Counter
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = TOOL_ROOT.parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "Herramientas" / "Generadores"))

from pes2018_overall import overall_from_laqp_row, position_from_laqp  # noqa: E402


PLAYERS_CSV = PROJECT_ROOT / "database" / "All players exported.csv"
CORRECTIONS_CSV = PROJECT_ROOT / "database" / "medias_corregidas.csv"
REPORT_DIR = TOOL_ROOT / "reportes"
DETAIL_REPORT = REPORT_DIR / "comparacion_base_completa.csv"
SUMMARY_REPORT = REPORT_DIR / "resumen_comparacion.md"


def correction_map() -> dict[str, int]:
    values: dict[str, int] = {}
    if not CORRECTIONS_CSV.is_file():
        return values
    with CORRECTIONS_CSV.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream, delimiter=";"):
            player_id = (row.get("PlayerId") or "").strip()
            raw = (row.get("OverallStats") or "").strip()
            if player_id and raw.lstrip("-").isdigit():
                values[player_id] = int(raw)
    return values


def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    corrections = correction_map()
    comparison: list[dict[str, object]] = []
    failures: list[str] = []

    with PLAYERS_CSV.open(encoding="utf-8-sig", newline="") as stream:
        for line_number, row in enumerate(csv.DictReader(stream, delimiter=";"), 2):
            player_id = (row.get("Id") or "").strip()
            try:
                old_raw = corrections.get(player_id, row.get("OverallStats", ""))
                old_overall = int(str(old_raw).strip())
                new_overall = overall_from_laqp_row(row)
                position = position_from_laqp(row.get("POS", ""))
            except (KeyError, TypeError, ValueError) as error:
                failures.append(f"línea {line_number}, ID {player_id or '?'}: {error}")
                continue
            difference = new_overall - old_overall
            comparison.append({
                "ID": player_id,
                "Jugador": (row.get("Name") or "").strip(),
                "Posicion": position,
                "Overall antiguo": old_overall,
                "Overall PES 2018 real": new_overall,
                "Diferencia": difference,
            })

    comparison.sort(key=lambda row: (-abs(int(row["Diferencia"])), -int(row["Diferencia"]), str(row["ID"])))
    with DETAIL_REPORT.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(comparison[0]) if comparison else [], delimiter=";")
        writer.writeheader()
        writer.writerows(comparison)

    differences = Counter(abs(int(row["Diferencia"])) for row in comparison)
    equal = differences[0]
    one = differences[1]
    two = differences[2]
    more = sum(count for difference, count in differences.items() if difference > 2)
    over_99 = sum(int(row["Overall PES 2018 real"]) > 99 for row in comparison)
    top = comparison[:20]
    lines = [
        "# Comparación masiva de Overall",
        "",
        f"- Jugadores procesados: **{len(comparison)}**",
        f"- Sin cambios: **{equal}**",
        f"- Cambian ±1: **{one}**",
        f"- Cambian ±2: **{two}**",
        f"- Cambian más de 2: **{more}**",
        f"- Overall real mayor de 99: **{over_99}**",
        f"- Filas no procesadas: **{len(failures)}**",
        "",
        "El Overall antiguo respeta el comportamiento previo de la web: usa",
        "`medias_corregidas.csv` cuando existe un override y, en caso contrario,",
        "el campo `OverallStats` del CSV activo. No se modificó ningún CSV.",
        "",
        "## 20 mayores cambios",
        "",
        "| ID | Jugador | Pos. | Antiguo | PES 2018 | Dif. |",
        "|---:|---|:---:|---:|---:|---:|",
    ]
    lines.extend(
        f"| {row['ID']} | {row['Jugador'] or '-'} | {row['Posicion']} | {row['Overall antiguo']} | {row['Overall PES 2018 real']} | {int(row['Diferencia']):+d} |"
        for row in top
    )
    if failures:
        lines.extend(["", "## Errores", "", *[f"- {failure}" for failure in failures[:100]]])
    SUMMARY_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Procesados: {len(comparison)}")
    print(f"Iguales: {equal}; ±1: {one}; ±2: {two}; >2: {more}; >99: {over_99}; errores: {len(failures)}")
    print(DETAIL_REPORT)
    print(SUMMARY_REPORT)
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
