"""Checks for the centralized manager configuration."""
import csv
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Herramientas" / "Generadores"))

from generador_secciones import (
    Manager,
    attach_manager_tactics,
    face_section_available,
    load_managers,
    load_tactic_summaries,
    render_manager_main,
)


class Issues:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def info(self, _message):
        pass

    def warning(self, message):
        self.warnings.append(message)

    def error(self, message, **_kwargs):
        self.errors.append(message)


class ManagerConfigTests(unittest.TestCase):
    def test_real_managers_use_one_master_csv(self):
        issues = Issues()
        managers = load_managers(ROOT, issues)

        self.assertEqual(issues.errors, [])
        self.assertEqual(len(managers), 11)
        self.assertEqual(len({item.config["id"] for item in managers}), 11)
        self.assertEqual(len({item.directory for item in managers}), 11)
        self.assertEqual(len({item.config["transfermarkt_id"] for item in managers}), 11)
        source_root = ROOT / "Herramientas" / "Recursos" / "Base-de-datos" / "DTs"
        self.assertFalse(list((ROOT / "database" / "DTs").glob("*.csv")))
        for manager in managers:
            with self.subTest(manager=manager.config["id"]):
                self.assertEqual(manager.directory, manager.config["carpeta"])
                self.assertTrue((source_root / manager.directory / "face.csv").is_file())

    def test_tactics_use_stable_manager_ids(self):
        issues = Issues()
        managers = load_managers(ROOT, issues)
        attach_manager_tactics(managers, load_tactic_summaries(ROOT, issues), issues)
        counts = {manager.config["id"]: len(manager.tactics) for manager in managers}
        self.assertEqual(counts["mourinho-2026"], 3)
        self.assertEqual(counts["guardiola-2026"], 2)
        self.assertEqual(counts["xabi alonso-2026"], 1)
        self.assertEqual(counts["scaloni-2026"], 0)

    def test_historical_context_overrides_current_external_club(self):
        manager = Manager("xabi", {
            "id": "xabi", "nombre": "Xabi Alonso", "equipo": "Bayer Leverkusen",
            "anio": "2023/24", "nacionalidad": "España", "continente": "Europa",
            "trayectoria": "2022 - 2025:Bayer Leverkusen", "palmares": "1:Bundesliga",
            "real_img": "real.png", "ingame_img": "ingame.png", "transfermarkt_id": "63052",
        }, {}, 0, {"current_club": "Chelsea", "birth_date": "1981-11-25"})
        source = render_manager_main(manager, [manager], {"236": "España"})
        self.assertIn("Bayer Leverkusen · 2023/24", source)
        self.assertIn("Chelsea", source)
        self.assertIn("data-dts-panel=\"tacticas\"", source)

    def test_face_and_hair_availability_are_independent(self):
        self.assertFalse(face_section_available({}, 0))
        self.assertFalse(face_section_available({}, 1))
        self.assertTrue(face_section_available({"Head Length": "1"}, 0))
        self.assertTrue(face_section_available({"Overall - Style": "2"}, 1))

    def test_duplicate_ids_and_folders_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            dts = root / "database" / "DTs"
            sources = root / "Herramientas" / "Recursos" / "Base-de-datos" / "DTs"
            for folder in ("uno", "dos"):
                (dts / folder).mkdir(parents=True)
                target = sources / folder
                target.mkdir(parents=True)
                (target / "face.csv").write_text("campo;valor\nA;1\n", encoding="utf-8")
            with (sources / "config.csv").open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=("id", "carpeta", "nombre", "face_csv"), delimiter=";")
                writer.writeheader()
                writer.writerows((
                    {"id": "estable", "carpeta": "uno", "nombre": "Uno", "face_csv": "face.csv"},
                    {"id": "estable", "carpeta": "dos", "nombre": "Dos", "face_csv": "face.csv"},
                    {"id": "otro", "carpeta": "uno", "nombre": "Otro", "face_csv": "face.csv"},
                ))

            issues = Issues()
            managers = load_managers(root, issues)

            self.assertEqual([item.config["id"] for item in managers], ["estable"])
            self.assertTrue(any("duplicado por id" in error for error in issues.errors))
            self.assertTrue(any("duplicado por carpeta" in error for error in issues.errors))


if __name__ == "__main__":
    unittest.main()
