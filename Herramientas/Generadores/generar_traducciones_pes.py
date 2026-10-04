"""Genera el diccionario oficial de PES 2018 usado por la Base de Datos.

Las traducciones se leen de los archivos de idioma del PES 2018 Editor V3.3.
El ingles se utiliza solamente como clave estable para alinear las entradas; el
texto visible siempre sale del archivo correspondiente a cada idioma.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path


FILES = {"es": "ESP.txt", "en": "ENG.txt", "pt": "POR.txt", "it": "ITA.txt"}
DEFAULT_SOURCE = Path(r"D:\Agustín\Herramientas PES 2018\PES 2018 Editor V3.3 by ejogc327\Languages")


def _read(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8-sig").splitlines()


def _sections(lines: list[str]) -> list[tuple[str, list[str]]]:
    result: list[tuple[str, list[str]]] = []
    title = ""
    values: list[str] = []
    for raw in lines:
        text = raw.strip()
        if re.fullmatch(r"\[.+\]", text):
            if title:
                result.append((title, values))
            title, values = text[1:-1].strip(), []
        elif title and text and not text.startswith("//"):
            values.append(text)
    if title:
        result.append((title, values))
    return result


def _code_pairs(values: list[str]) -> list[list[str]]:
    pairs: list[list[str]] = []
    for value in values:
        match = re.match(r"^([SP]\d{2})\s*-\s*(.+)$", value)
        if match:
            pairs.append([match.group(1), match.group(2).strip()])
    return pairs


def _source_dir(explicit: str | Path | None = None) -> Path:
    candidates = [
        Path(explicit).expanduser() if explicit else None,
        Path(os.environ["LAQP_PES2018_LANGUAGE_DIR"]).expanduser() if os.environ.get("LAQP_PES2018_LANGUAGE_DIR") else None,
        DEFAULT_SOURCE,
    ]
    for candidate in candidates:
        if candidate and all((candidate / filename).is_file() for filename in FILES.values()):
            return candidate.resolve()
    raise FileNotFoundError(
        "No se encontraron ESP.txt, ENG.txt, POR.txt e ITA.txt. "
        "Use --source-dir o LAQP_PES2018_LANGUAGE_DIR."
    )


def build_official_dictionary(source_dir: Path) -> dict:
    parsed = {lang: _sections(_read(source_dir / filename)) for lang, filename in FILES.items()}
    counts = {lang: len(sections) for lang, sections in parsed.items()}
    if len(set(counts.values())) != 1:
        raise ValueError(f"Los archivos oficiales no tienen la misma estructura: {counts}")

    english_indexes = {title: index for index, (title, _values) in enumerate(parsed["en"])}

    def values(lang: str, english_section: str) -> list[str]:
        index = english_indexes[english_section]
        return parsed[lang][index][1]

    def aligned_map(english_section: str) -> dict[str, dict[str, str]]:
        keys = values("en", english_section)
        output: dict[str, dict[str, str]] = {}
        for lang in FILES:
            translated = values(lang, english_section)
            if len(translated) != len(keys):
                raise ValueError(f"La seccion {english_section} no esta alineada para {lang}.")
            output[lang] = dict(zip(keys, translated))
        return output

    stats = aligned_map("Abilities")
    other_stats = aligned_map("Other Abilities")
    for lang in FILES:
        stats[lang].update(other_stats[lang])

    appearance: dict[str, dict[str, str]] = {lang: {} for lang in FILES}
    for section in ("Appearance", "Hairstyle", "Physique", "Strip Style", "Movements"):
        mapped = aligned_map(section)
        for lang in FILES:
            appearance[lang].update(mapped[lang])

    positions = aligned_map("Positions")
    playing_styles = {
        lang: {str(index): label for index, label in enumerate(values(lang, "Playing Style"))}
        for lang in FILES
    }
    player_skills = {lang: _code_pairs(values(lang, "Player skills")) for lang in FILES}
    com_styles = {lang: _code_pairs(values(lang, "COM Playing Styles")) for lang in FILES}

    tactics_options = {lang: values(lang, "Tactics") for lang in FILES}
    tactic_values: dict[str, dict[str, str]] = {lang: {} for lang in FILES}
    option_keys = (
        "attackStyle.0", "attackStyle.1", "buildUp.0", "buildUp.1",
        "sideCenter.0", "sideCenter.1", "positioning.0", "positioning.1",
        "numbersAttack.0", "numbersAttack.1", "numbersAttack.2",
        "defenseStyle.0", "defenseStyle.1", "centerSide.0", "centerSide.1",
        "pressuring.0", "pressuring.1", "numbersDefense.0", "numbersDefense.1",
        "numbersDefense.2",
    )
    for lang, labels in tactics_options.items():
        tactic_values[lang] = dict(zip(option_keys, labels[:len(option_keys)]))

    formation_titles = {lang: values(lang, "Edit Formations Titles") for lang in FILES}
    strategies = {lang: values(lang, "Strategy") for lang in FILES}
    message_indexes = {
        "tactics.attackStyle": 0, "tactics.buildUp": 1, "tactics.attackArea": 2,
        "tactics.positioning": 3, "tactics.supportRange": 4,
        "tactics.numbersAttack": 5, "tactics.defenseStyle": 6,
        "tactics.containmentArea": 7, "tactics.pressuring": 8,
        "tactics.defensiveLine": 9, "tactics.compactness": 10,
        "tactics.numbersDefense": 11, "assignments.longFreeKick": 12,
        "assignments.shortFreeKick": 13, "assignments.secondTaker": 14,
        "assignments.rightCorner": 15, "assignments.leftCorner": 16,
        "assignments.penalty": 17, "assignments.header1": 18,
        "assignments.header2": 19, "assignments.header3": 20,
        "assignments.captain": 21,
    }
    messages: dict[str, dict[str, str]] = {lang: {} for lang in FILES}
    for lang, labels in formation_titles.items():
        for key, index in message_indexes.items():
            if index < len(labels):
                messages[lang][key] = labels[index]
        strategy = strategies[lang]
        for key, index in (("team.general", 3), ("team.withBall", 4), ("team.withoutBall", 5)):
            if index < len(strategy):
                messages[lang][key] = strategy[index]

    return {
        "meta": {
            "source": "PES 2018 Editor V3.3 by ejogc327",
            "languages": list(FILES),
            "arabicAvailable": False,
        },
        "maps": {
            "stats": stats,
            "positions": positions,
            "playingStyles": playing_styles,
            "playerSkills": player_skills,
            "comStyles": com_styles,
            "appearanceFields": appearance,
            "tacticValues": tactic_values,
        },
        "messages": messages,
    }


def generate_pes2018_translations(project_root: Path, source_dir: str | Path | None = None) -> Path:
    source = _source_dir(source_dir)
    target = project_root / "js" / "pes2018-translations.js"
    payload = build_official_dictionary(source)
    content = (
        "'use strict';\n\n"
        "// Generado desde los archivos oficiales del PES 2018 Editor. No editar a mano.\n"
        "window.PES2018_OFFICIAL_I18N = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8", newline="\n")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera las traducciones oficiales de PES 2018 para LAqP.website.")
    parser.add_argument("--source-dir", help="Carpeta que contiene ESP.txt, ENG.txt, POR.txt e ITA.txt.")
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[2]))
    args = parser.parse_args()
    target = generate_pes2018_translations(Path(args.project_root).resolve(), args.source_dir)
    print(f"Traducciones PES 2018 actualizadas: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
