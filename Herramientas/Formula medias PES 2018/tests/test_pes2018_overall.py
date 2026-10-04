"""Validación automatizada del algoritmo PES 2018 y su paridad JS/Python."""

from __future__ import annotations

import csv
import json
import random
import subprocess
import sys
import unittest
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[3]
GENERATOR_ROOT = PROJECT_ROOT / "Herramientas" / "Generadores"
sys.path.insert(0, str(GENERATOR_ROOT))

from pes2018_overall import (  # noqa: E402
    LAQP_STAT_ALIASES,
    POSITIONS,
    overall_from_laqp_row,
    pes2018_overall,
    stats_from_laqp_row,
)


REFERENCE_PLAYERS = {
    "4522": ("Cristiano Ronaldo", 94),
    "7511": ("Lionel Messi", 94),
    "34098": ("Luka Modrić", 89),
    "7329": ("Sergio Ramos", 88),
    "33185": ("Manuel Neuer", 91),
    "44104": ("Jan Oblak", 88),
}


def flat_stats(value: int) -> dict[str, int]:
    stats = {key: value for key in LAQP_STAT_ALIASES}
    stats["non_dom_leg_precision"] = 3
    return stats


def original_reference_rows() -> dict[str, dict[str, str]]:
    path = PROJECT_ROOT / "database" / "players_original.csv"
    found: dict[str, dict[str, str]] = {}
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream, delimiter=";"):
            player_id = row.get("Id", "")
            if player_id in REFERENCE_PLAYERS and player_id not in found:
                found[player_id] = row
            if len(found) == len(REFERENCE_PLAYERS):
                break
    return found


class Pes2018OverallTests(unittest.TestCase):
    def test_known_original_pes2018_players(self) -> None:
        rows = original_reference_rows()
        self.assertEqual(set(rows), set(REFERENCE_PLAYERS))
        for player_id, (name, expected) in REFERENCE_PLAYERS.items():
            with self.subTest(player=name):
                self.assertEqual(overall_from_laqp_row(rows[player_id]), expected)

    def test_representative_positions(self) -> None:
        expected = {
            "CF": 87,
            "LWF": 87,
            "AMF": 87,
            "CMF": 86,
            "DMF": 89,
            "CB": 87,
            "LB": 89,
            "GK": 74,
        }
        stats = flat_stats(80)
        for position, overall in expected.items():
            with self.subTest(position=position):
                self.assertEqual(pes2018_overall(stats, position, position), overall)

    def test_extreme_profiles_and_clamp(self) -> None:
        for position in POSITIONS:
            with self.subTest(position=position, attributes=40):
                self.assertEqual(pes2018_overall(flat_stats(40), position, position), 40)
        self.assertEqual(pes2018_overall(flat_stats(99), "CF", "CF"), 109)
        self.assertEqual(pes2018_overall(flat_stats(99), "GK", "GK"), 97)
        self.assertGreater(pes2018_overall(flat_stats(99), "AMF", "AMF"), 99)

    def test_secondary_position_familiarity(self) -> None:
        stats = flat_stats(80)
        self.assertEqual(pes2018_overall(stats, "LWF", "CF", 0), 72)
        self.assertEqual(pes2018_overall(stats, "LWF", "CF", 1), 74)
        self.assertEqual(pes2018_overall(stats, "LWF", "CF", 2), 76)

    def test_tight_possession_is_not_used(self) -> None:
        row = original_reference_rows()["7511"]
        changed = dict(row)
        changed["TightPossession"] = "40"
        first = overall_from_laqp_row(changed)
        changed["TightPossession"] = "99"
        self.assertEqual(overall_from_laqp_row(changed), first)

    def test_javascript_python_parity(self) -> None:
        rng = random.Random(2018)
        cases: list[dict[str, object]] = []
        expected: list[int] = []

        for _ in range(250):
            stats = {key: rng.randint(40, 99) for key in LAQP_STAT_ALIASES}
            stats["non_dom_leg_precision"] = rng.randint(1, 4)
            natural = rng.choice(POSITIONS)
            for target in POSITIONS:
                familiarity = 0 if target == natural else rng.randint(0, 2)
                cases.append({
                    "stats": stats,
                    "target": target,
                    "natural": natural,
                    "familiarity": familiarity,
                })
                expected.append(pes2018_overall(stats, target, natural, familiarity))

        for row in original_reference_rows().values():
            cases.append({"row": row})
            expected.append(overall_from_laqp_row(row))

        runner = Path(__file__).with_name("js_parity_runner.js")
        completed = subprocess.run(
            ["node", str(runner)],
            input=json.dumps(cases, ensure_ascii=False),
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
        )
        self.assertEqual(json.loads(completed.stdout), expected)

    def test_current_and_legacy_column_adapters_match(self) -> None:
        current = {
            "OffensiveAwareness": 80, "BallControl": 81, "Dribbling": 82,
            "LowPass": 83, "LoftedPass": 84, "Finishing": 85,
            "PlaceKicking": 86, "Curl": 87, "Heading": 88,
            "DefensiveAwareness": 79, "BallWinning": 78, "KickingPower": 77,
            "Speed": 76, "Acceleration": 75, "Balance": 74,
            "PhysicalContact": 73, "Jump": 72, "GKAwareness": 40,
            "GKCatching": 40, "GKClearing": 40, "GKReflexes": 40,
            "GKReach": 40, "Stamina": 71, "WeakFootAcc": 3,
        }
        legacy = {
            "Attacking Prowess": 80, "Ball Control": 81, "Dribbling": 82,
            "Low Pass": 83, "Lofted Pass": 84, "Finishing": 85,
            "Place Kicking": 86, "Controlled Spin": 87, "Header": 88,
            "Defensive Prowess": 79, "Ball Winning": 78, "Kicking Power": 77,
            "Speed": 76, "Explosive Power": 75, "Body Control": 74,
            "Physical Contact": 73, "Jump": 72, "Goalkeeping": 40,
            "Catching": 40, "Clearing": 40, "Reflexes": 40,
            "Coverage": 40, "Stamina": 71, "Weak Foot Acc.": 3,
        }
        self.assertEqual(stats_from_laqp_row(current), stats_from_laqp_row(legacy))


if __name__ == "__main__":
    unittest.main(verbosity=2)
