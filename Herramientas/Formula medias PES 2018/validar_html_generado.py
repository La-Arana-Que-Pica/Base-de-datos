"""Comprueba que HTML estático y Builder tengan el mismo OVR que la fórmula."""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = TOOL_ROOT.parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "Herramientas" / "Generadores"))

from pes2018_overall import overall_from_laqp_row  # noqa: E402


def main() -> int:
    expected: dict[str, int] = {}
    with (PROJECT_ROOT / "database" / "All players exported.csv").open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream, delimiter=";"):
            if row.get("Id"):
                expected[row["Id"]] = overall_from_laqp_row(row)

    player_id_re = re.compile(r'<meta name="laqp-player-id" content="([^"<>]+)">')
    overall_re = re.compile(r'<li>Media: (\d+)</li>')
    html_checked = 0
    problems: list[str] = []
    for path in (PROJECT_ROOT / "player" / "v2").glob("*/*/index.html"):
        content = path.read_text(encoding="utf-8-sig")
        # El generador no borra rutas históricas huérfanas. Solo se validan
        # las fichas vigentes regeneradas con la plantilla actual.
        if "js/pes2018-overall.js?v=20261003a" not in content:
            continue
        player_match = player_id_re.search(content)
        overall_match = overall_re.search(content)
        if not player_match or not overall_match:
            problems.append(f"{path.relative_to(PROJECT_ROOT)}: faltan ID u Overall")
            continue
        player_id = player_match.group(1)
        actual = int(overall_match.group(1))
        html_checked += 1
        if player_id not in expected or actual != expected[player_id]:
            problems.append(f"{path.relative_to(PROJECT_ROOT)}: HTML={actual}, esperado={expected.get(player_id)}")

    builder_path = PROJECT_ROOT / "database" / "builder-player-index.json"
    builder = json.loads(builder_path.read_text(encoding="utf-8-sig"))
    builder_checked = 0
    for player in builder.get("players", []):
        player_id = str(player.get("id", ""))
        actual = player.get("overall")
        builder_checked += 1
        if player_id not in expected or actual != expected[player_id]:
            problems.append(f"builder {player_id}: JSON={actual}, esperado={expected.get(player_id)}")

    report = TOOL_ROOT / "reportes" / "validacion_html_estatico.md"
    lines = [
        "# Validación de artefactos estáticos",
        "",
        f"- Fichas HTML verificadas: **{html_checked}**",
        f"- Jugadores del Builder verificados: **{builder_checked}**",
        f"- Diferencias encontradas: **{len(problems)}**",
    ]
    if problems:
        lines.extend(["", "## Diferencias", "", *[f"- {item}" for item in problems[:200]]])
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"HTML: {html_checked}; Builder: {builder_checked}; diferencias: {len(problems)}")
    print(report)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
