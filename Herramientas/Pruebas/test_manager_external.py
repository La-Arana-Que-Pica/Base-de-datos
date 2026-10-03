"""Offline-first Transfermarkt integration tests."""
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Herramientas" / "Generadores"))

from manager_external import (
    cache_is_fresh,
    parse_transfermarkt_profile,
    refresh_manager_cache,
)


class Issues:
    def __init__(self):
        self.messages = []
        self.warnings = []

    def info(self, message):
        self.messages.append(message)

    def warning(self, message):
        self.warnings.append(message)


class FailingClient:
    def fetch(self, _identifier):
        raise RuntimeError("sin conexion")


class ManagerExternalTests(unittest.TestCase):
    def test_valid_profile_is_normalized_without_raw_html(self):
        source = '''<html><head><meta property="og:image" content="https://img.example/coach.jpg"></head>
        <body><h1 data-laqp-name="Xabi Alonso"></h1><i data-laqp-full-name="Xabier Alonso Olano"></i>
        <i data-laqp-birth-date="25/11/1981" data-laqp-nationality="Spain"
           data-laqp-current-club="Chelsea" data-laqp-appointed-date="01/07/2026"
           data-laqp-preferred-formation="3-4-2-1"></i>
        <table><tr data-laqp-career data-club="Chelsea" data-start="01/07/2026" data-end="" data-role="Manager"></tr></table>
        </body></html>'''
        record = parse_transfermarkt_profile(source, "63052")
        self.assertEqual(record["transfermarkt_id"], "63052")
        self.assertEqual(record["name"], "Xabi Alonso")
        self.assertEqual(record["birth_date"], "1981-11-25")
        self.assertEqual(record["current_club"], "Chelsea")
        self.assertEqual(record["career"][0]["start_date"], "2026-07-01")
        self.assertNotIn("html", record)

    def test_fresh_and_expired_cache(self):
        self.assertTrue(cache_is_fresh({"fetched_at": "2026-09-25T10:00:00+00:00"}, today=date(2026, 10, 1)))
        self.assertFalse(cache_is_fresh({"fetched_at": "2026-09-01T10:00:00+00:00"}, today=date(2026, 10, 1)))
        self.assertFalse(cache_is_fresh({"fetched_at": ""}, today=date(2026, 10, 1)))

    def test_connection_failure_reuses_previous_cache(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            dts = root / "Herramientas" / "Recursos" / "Base-de-datos" / "DTs"
            cache_dir = root / "Herramientas" / "Recursos" / "Base-de-datos" / "cache"
            dts.mkdir(parents=True)
            cache_dir.mkdir(parents=True)
            (dts / "config.csv").write_text(
                "id;transfermarkt_id;carpeta;nombre;real_img\ncoach;123;coach;Coach;real.png\n",
                encoding="utf-8",
            )
            previous = {"transfermarkt_id": "123", "name": "Coach", "fetched_at": "2026-01-01T00:00:00+00:00"}
            (cache_dir / "entrenadores_transfermarkt.json").write_text(json.dumps({
                "schema_version": 1, "provider": "transfermarkt", "coaches": {"123": previous}
            }), encoding="utf-8")
            issues = Issues()
            cache = refresh_manager_cache(
                root, issues, refresh_stale=True, client=FailingClient(), sleep=lambda _seconds: None,
            )
            self.assertEqual(cache["coaches"]["123"], previous)
            self.assertTrue(any("FALLBACK" in message for message in issues.warnings))

    def test_manager_without_transfermarkt_id_is_non_fatal(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            dts = root / "Herramientas" / "Recursos" / "Base-de-datos" / "DTs"
            dts.mkdir(parents=True)
            (dts / "config.csv").write_text(
                "id;transfermarkt_id;carpeta;nombre\nmanual;;manual;Manual\n", encoding="utf-8",
            )
            issues = Issues()
            cache = refresh_manager_cache(root, issues, refresh_stale=True, client=FailingClient())
            self.assertEqual(cache["coaches"], {})
            self.assertTrue(any("sin transfermarkt_id" in message for message in issues.warnings))


if __name__ == "__main__":
    unittest.main()
