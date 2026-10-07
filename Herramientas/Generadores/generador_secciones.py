"""Prerender de las secciones dinamicas adicionales de LAqP.website.

Este modulo usa unicamente la biblioteca estandar. Las paginas publicadas que ya
existen se usan como cascaron para conservar cabecera, scripts y estructura de
URLs; Python sustituye solamente el contenido construido desde datos.
"""

from __future__ import annotations

import csv
import html
import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Callable, Iterable
from urllib.parse import quote, unquote, urlsplit

from manager_external import load_manager_cache, transfermarkt_url


SITE_URL = "https://laqp.website"
PES_POSITIONS = ("GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF")
POSITION_LABELS = {
    "GK": "PT", "CB": "DEC", "LB": "LI", "RB": "LD", "DMF": "MCD",
    "CMF": "MC", "LMF": "MDI", "RMF": "MDD", "AMF": "MO", "LWF": "EXI",
    "RWF": "EXD", "SS": "SD", "CF": "CD",
}


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True).replace("&#x27;", "&#39;")


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in text if not unicodedata.combining(char)).lower().strip()


def slugify(value: object, fallback: str = "item") -> str:
    value = normalize(value).replace("&", " and ")
    value = value.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-") or fallback


def position_label(value: object) -> str:
    raw = str(value or "").strip().upper()
    if raw.isdigit():
        index = int(raw)
        if 0 <= index < len(PES_POSITIONS):
            raw = PES_POSITIONS[index]
    return POSITION_LABELS.get(raw, raw or "-")


def format_count(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def read_csv(path: Path, issues, *, optional: bool = False) -> list[dict[str, str]]:
    if not path.is_file():
        if optional:
            issues.info(f"Fuente opcional ausente: {path.relative_to(path.parents[1]) if len(path.parents) > 1 else path.name}.")
            return []
        issues.error(f"Fuente inexistente: {path}.")
        return []
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            sample = handle.read(8192)
            handle.seek(0)
            first = sample.splitlines()[0] if sample.splitlines() else ""
            delimiter = ";" if first.count(";") >= first.count(",") else ","
            reader = csv.DictReader(handle, delimiter=delimiter)
            if not reader.fieldnames:
                issues.warning(f"CSV sin cabecera: {path}.")
                return []
            reader.fieldnames = [str(key or "").strip() for key in reader.fieldnames]
            rows = []
            for line, raw in enumerate(reader, 2):
                if None in raw:
                    issues.warning(f"{path.name}:{line}: sobran valores; se conservaron las columnas conocidas.")
                row = {str(key or "").strip(): str(value or "").strip() for key, value in raw.items() if key is not None}
                if any(row.values()):
                    rows.append(row)
            issues.info(f"Fuente cargada: {path} ({len(rows)} filas).")
            return rows
    except (OSError, UnicodeError, csv.Error) as error:
        issues.error(f"No se pudo leer {path}: {error}.")
        return []


def read_json(path: Path, issues) -> list[dict]:
    if not path.is_file():
        issues.info(f"Fuente opcional ausente: {path.name}.")
        return []
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(value, list):
            issues.error(f"{path.name}: se esperaba una lista JSON.")
            return []
        return [item for item in value if isinstance(item, dict)]
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        issues.error(f"No se pudo leer {path}: {error}.")
        return []


def replace_between(source: str, start_needle: str, end_needle: str, replacement: str) -> str:
    start = source.find(start_needle)
    end = source.find(end_needle, start + len(start_needle)) if start >= 0 else -1
    if start < 0 or end < 0:
        raise ValueError(f"No se encontro el bloque {start_needle!r} ... {end_needle!r}")
    return source[:start] + replacement + source[end:]


def replace_main(source: str, replacement: str) -> str:
    match = re.search(r"<main\b[^>]*>", source, re.IGNORECASE)
    if not match:
        raise ValueError("No se encontro <main> en la plantilla.")
    close = source.find("</main>", match.end())
    if close < 0:
        raise ValueError("No se encontro </main> en la plantilla.")
    return source[: match.start()] + replacement + source[close + len("</main>") :]


def set_meta(source: str, *, title: str, description: str, canonical: str, image: str | None = None) -> str:
    source = re.sub(r"<title>[\s\S]*?</title>", f"<title>{esc(title)}</title>", source, count=1)
    replacements = {
        r'<meta name="description" content="[^"]*"\s*/?>': f'<meta name="description" content="{esc(description)}">',
        r'<link rel="canonical" href="[^"]*"\s*/?>': f'<link rel="canonical" href="{esc(canonical)}">',
        r'<meta property="og:title" content="[^"]*"\s*/?>': f'<meta property="og:title" content="{esc(title)}">',
        r'<meta property="og:description" content="[^"]*"\s*/?>': f'<meta property="og:description" content="{esc(description)}">',
        r'<meta property="og:url" content="[^"]*"\s*/?>': f'<meta property="og:url" content="{esc(canonical)}">',
        r'<meta name="twitter:title" content="[^"]*"\s*/?>': f'<meta name="twitter:title" content="{esc(title)}">',
        r'<meta name="twitter:description" content="[^"]*"\s*/?>': f'<meta name="twitter:description" content="{esc(description)}">',
    }
    if image:
        replacements[r'<meta property="og:image" content="[^"]*"\s*/?>'] = f'<meta property="og:image" content="{esc(image)}">'
        replacements[r'<meta name="twitter:image" content="[^"]*"\s*/?>'] = f'<meta name="twitter:image" content="{esc(image)}">'
    for pattern, replacement in replacements.items():
        source = re.sub(pattern, replacement, source, count=1, flags=re.IGNORECASE)
    return source


def safe_target(root: Path, relative: Path) -> Path:
    target = (root / relative).resolve()
    target.relative_to(root.resolve())
    return target


@dataclass
class Manager:
    directory: str
    config: dict[str, str]
    face: dict[str, str]
    modified: float
    external: dict = field(default_factory=dict)
    tactics: list[dict[str, str]] = field(default_factory=list)

    @property
    def url(self) -> str:
        return f"/database/DTs/{quote(self.directory, safe='')}/"


@dataclass
class ExtraResult:
    managers: int = 0
    tactics: int = 0
    other_html: int = 0
    generated_files: list[Path] = field(default_factory=list)


FACE_SECTIONS = (
    ("Cara", (
        ("Color de piel / Proporción de cabeza", (
            ("Skin Colour", "Color de piel", "skin_colour", None, True),
            ("Head Length", "Altura de la cabeza", None, None, False),
            ("Head Width", "Anchura de la cabeza", None, None, False),
            ("Head Depth", "Profundidad de la cabeza", None, None, False),
            ("Face Height", "Largo de la cara", None, None, False),
            ("Face Size", "Tamaño de la cara", None, None, False),
        )),
        ("Ojos", (
            ("Upper Eyelid Type", "Tipo de párpado superior", "upper_eyelid", None, True),
            ("Bottom Eyelid Type", "Tipo de párpado inferior", "bottom_eyelid", None, True),
            ("Eye Height", "Altura de los ojos", None, None, False),
            ("Horizontal Eye Position", "Posición horizontal ojos", None, None, False),
            ("Iris Colour", "Color del iris", "iris_colour", None, True),
            ("Pupil Size", "Tamaño del iris", None, None, False),
            ("Upper Eyelid Ht. (Inner)", "Alt. párpado sup. (I.)", None, None, False),
            ("Upper Eyelid Wd. (Inner)", "Ancho párpado sup. (I.)", None, None, False),
            ("Upper Eyelid Ht. (Outer)", "Alt. párpado sup. (E.)", None, None, False),
            ("Upper Eyelid Wd. (Outer)", "Ancho párpado sup. (E.)", None, None, False),
            ("Inner Eye Height", "Altura interior ojos", None, None, False),
            ("Inner Eye Position", "Posición interior de ojos", None, None, False),
            ("Eye Corner Height", "Altura exterior ojos", None, None, False),
            ("Outer Eye Position", "Posición exterior ojos", None, None, False),
            ("Bottom Eyelid Height", "Altura párpado inferior", None, None, False),
            ("Eye Depth", "Prof. de los ojos", None, None, False),
        )),
        ("Frente / Cejas", (
            ("Forehead", "Frente", "forehead", None, True),
            ("Eyebrow Type", "Estilo de cejas", "eyebrow_type", None, True),
            ("Eyebrow Thickness", "Espesor de cejas", None, None, False),
            ("Eyebrow Style", "Tipo de cejas", None, {"0": "Fina", "1": "Normal", "2": "Gruesa"}, True),
            ("Eyebrow Density", "Densidad de cejas", None, None, False),
            ("Eyebrow Colour R", "Color de cejas R", None, None, True),
            ("Eyebrow Colour G", "Color de cejas V", None, None, True),
            ("Eyebrow Colour B", "Color de cejas A", None, None, True),
            ("Inner Eyebrow Height", "Altura interior cejas", None, None, False),
            ("Brow Width", "Ancho del entrecejo", None, None, False),
            ("Outer Edyebrow Height", "Altura exterior cejas", None, None, False),
            ("Temple Width", "Ancho de la sien", None, None, False),
            ("Eyebrow Depth", "Profundidad de las cejas", None, None, False),
        )),
        ("Nariz", (
            ("Nose Type", "Tipo de nariz", "nose_type", None, True),
            ("Laughter Lines", "Arrugas", "laughter_lines", None, True),
            ("Nose Height", "Altura de la nariz", None, None, False),
            ("Nostril Width", "Tamaño fosas nasales", None, None, False),
            ("Nose Width", "Grosor de la nariz", None, None, False),
            ("Nose Tip Depth", "Profundidad punta nariz", None, None, False),
            ("Nose Depth", "Profundidad nariz", None, None, False),
        )),
        ("Boca", (
            ("Upper Lip Type", "Tipo labio sup.", "upper_lip", None, True),
            ("Lower Lip Type", "Tipo labio inf.", "lower_lip", None, True),
            ("Mouth Position", "Posición de la boca", None, None, False),
            ("Lip Size", "Tamaño labios", None, None, False),
            ("Lip Width", "Ancho de labio", None, None, False),
            ("Mouth Corner Height", "Alt. comisuras lab.", None, None, False),
            ("Mouth Depth", "Profundidad de boca", None, None, False),
        )),
        ("Vello facial", (
            ("Facial Hair Type", "Tipo vello fac.", "facial_hair", None, True),
            ("Facial Hair Colour R", "Color del vello facial R", None, None, True),
            ("Facial Hair Colour G", "Color del vello facial V", None, None, True),
            ("Facial Hair Colour B", "Color del vello facial A", None, None, True),
            ("Thickness", "Espesura", None, None, False),
        )),
        ("Mejillas / Maxilar / Mentón", (
            ("Cheek Type", "Tipo mejillas", "cheek_type", None, True),
            ("Neck Line Type", "Tipo de línea del cuello", "neck_line", None, True),
            ("Cheekbones", "Pómulos", None, None, False),
            ("Chin Height", "Altura del mentón", None, None, False),
            ("Chin Width", "Ancho del mentón", None, None, False),
            ("Jaw Height", "Altura del maxilar", None, None, False),
            ("Jawline", "Línea del maxilar", None, None, False),
            ("Chin Depth", "Profundidad del mentón", None, None, False),
        )),
        ("Orejas", (
            ("Ear Length", "Largo de orejas", None, None, False),
            ("Ear Width", "Ancho de orejas", None, None, False),
            ("Ear Angle", "Ángulo de la oreja", None, None, False),
        )),
    )),
    ("Peinado", (
        ("General", (
            ("Overall - Style", "Estilo", None, {"0": "-", "1": "Normal", "2": "Seco", "3": "Mohicano", "4": "Afro", "5": "Rastas", "6": "Trenzado", "7": "Especial"}, True),
            ("Overall - Length", "Longitud", None, {"0": "-", "1": "Afeitado", "2": "Muy corto", "3": "Corto", "4": "Mediano", "5": "Largo"}, True),
            ("Overall - Wave Level", "Ondulado", None, None, False),
            ("Overall - Hair Variation", "Variación del pelo", "hair_variation", None, True),
        )),
        ("Delante", (
            ("Font - Style", "Estilo", None, {"0": "-", "1": "Arriba", "2": "Abajo", "3": "Hacia atrás"}, True),
            ("Font - Parted", "Con raya", None, {"0": "-", "1": "No", "2": "Izquierda 2", "3": "Izquierda 1", "4": "Centro", "5": "Derecha 1", "6": "Derecha 2"}, True),
            ("Font - Hairline", "A raíz", None, {"0": "-", "1": "Tipo 1", "2": "Tipo 2", "3": "Tipo 3"}, True),
            ("Font - Forehead Width", "Ancho de frente", None, {"0": "-", "1": "Estrecha", "2": "Normal", "3": "Amplia"}, True),
        )),
        ("Lateral / Atrás", (
            ("Side/Back - Style", "Estilo", None, {"0": "-", "1": "Normal", "2": "Menos volumen", "3": "Menos lateral", "4": "Recortado"}, True),
            ("Side/Back - Cropped", "Recortado", "hair_cropped", None, True),
        )),
        ("Color de pelo / Accesorios", (
            ("Hair Colour", "Color de pelo", "hair_colour", None, True),
            ("Hair Colour R", "Color de pelo R", None, None, True),
            ("Hair Colour G", "Color de pelo V", None, None, True),
            ("Hair Colour B", "Color de pelo A", None, None, True),
            ("Accessories", "Accesorios", None, {"False": "No", "True": "Sí", "0": "No", "1": "Sí"}, True),
            ("Accessory Colour", "Color de accesorio", None, None, True),
        )),
    )),
)


def _face_value(raw: str, enum: dict[str, str] | None, no_plus: bool) -> str:
    if enum:
        return enum.get(raw, raw or "-")
    if not raw:
        return "-"
    if not no_plus and re.fullmatch(r"-?\d+", raw):
        return f"+{raw}" if int(raw) >= 0 else raw
    return raw


def render_face_editor(face: dict[str, str], only_section: int | None = None) -> str:
    tabs = "".join(
        f'<button type="button" class="dts-face-tab{" is-active" if index == 0 else ""}" data-dts-face-tab="{index}">{esc(title)}</button>'
        for index, (title, _subsections) in enumerate(FACE_SECTIONS)
    )
    panels = []
    for section_index, (_title, subsections) in enumerate(FACE_SECTIONS):
        if only_section is not None and section_index != only_section:
            continue
        subsection_html = []
        for heading, fields in subsections:
            rows = []
            for column, label, image_key, enum, no_plus in fields:
                raw = face.get(column, face.get(column.strip(), "")).strip()
                value = _face_value(raw, enum, no_plus)
                if image_key and raw and raw != "0":
                    value_html = (
                        '<span class="dts-editor-value dts-editor-value-image">'
                        f'<img src="img/appearance/{esc(image_key)}/{quote(raw, safe="")}.webp" alt="{esc(image_key)}" loading="lazy" '
                        "onerror=\"this.onerror=null;this.src='img/appearance/placeholder.webp'\">"
                        f"<strong>{esc(value)}</strong></span>"
                    )
                else:
                    value_html = f'<span class="dts-editor-value">{esc(value)}</span>'
                rows.append(f'<div class="dts-editor-row"><span class="dts-editor-label">{esc(label)}</span>{value_html}</div>')
            subsection_html.append(
                f'<article class="dts-face-subsection"><h3>{esc(heading)}</h3>'
                f'<div class="dts-editor-grid">{"".join(rows)}</div></article>'
            )
        panels.append(
            f'<section class="dts-face-panel is-active" data-dts-face-panel="{section_index}">'
            f'{"".join(subsection_html)}</section>'
        )
    if only_section is not None:
        return f'<div class="dts-face-editor dts-face-editor-single">{"".join(panels)}</div>'
    return (
        '<div class="dts-face-editor"><div class="dts-face-tabs">'
        f'{tabs}</div><div class="dts-face-panels">{"".join(panels)}</div></div>'
    )


def manager_crest(team: str) -> str:
    """Devuelve el escudo editorial de una etapa sin inventar un club PES."""
    label = (team or "Sin equipo").strip()
    # El agente libre es un recurso editorial existente y debe conservarse en
    # todas las fichas, listados y etapas de carrera.
    if normalize(label).startswith("sin equipo"):
        label = "Sin equipo"
    return f"/database/DTs/escudos/{quote(label, safe='')}.png"


def manager_team_crest(manager: Manager) -> str:
    """Prioriza el escudo real PES del contexto actual del DT."""
    team_id = manager.config.get("equipo_id", "").strip()
    if team_id:
        return f"img/teams/{quote(team_id)}.webp"
    return manager_crest(manager.config.get("equipo", ""))


def manager_url(manager: Manager) -> str:
    return f"database/DTs/{quote(manager.directory, safe='')}/"


def manager_image(manager: Manager, kind: str = "portrait") -> str:
    cfg = manager.config
    if kind == "ingame":
        image = cfg.get("ingame_img") or "ingame.png"
    else:
        image = (
            cfg.get("foto_override")
            or cfg.get("real_img")
            or manager.external.get("cached_image")
            or cfg.get("ingame_img")
            or "ingame.png"
        )
    return manager_url(manager) + quote(str(image), safe="")


def face_section_available(face: dict[str, str], section_index: int) -> bool:
    return any(
        str(face.get(column, "")).strip()
        for _heading, fields in FACE_SECTIONS[section_index][1]
        for column, _label, _image_key, _enum, _no_plus in fields
    )


def manager_age(manager: Manager, today: date | None = None) -> int | None:
    raw = str(manager.external.get("birth_date") or "")
    try:
        born = date.fromisoformat(raw)
    except ValueError:
        return None
    current = today or date.today()
    return current.year - born.year - ((current.month, current.day) < (born.month, born.day))


def manager_career(manager: Manager) -> list[tuple[str, str, str]]:
    manual = parse_career(manager.config.get("trayectoria", ""))
    if manual:
        return manual
    result = []
    for item in manager.external.get("career", []):
        if not isinstance(item, dict) or not item.get("club"):
            continue
        period = item.get("period") or " - ".join(filter(None, (item.get("start_date"), item.get("end_date"))))
        result.append((str(period or "-"), str(item.get("club")), str(item.get("role") or "")))
    return result


def load_tactic_summaries(project_root: Path, issues) -> list[dict[str, str]]:
    tactics = read_csv(project_root / "database" / "tacticas.csv", issues, optional=True)
    metadata = read_csv(project_root / "database" / "tacticas-metadata.csv", issues, optional=True)
    metadata_by_id = {item.get("id", ""): item for item in metadata if item.get("id")}
    return [{**item, **metadata_by_id.get(item.get("id", ""), {})} for item in tactics if item.get("id")]


def attach_manager_tactics(managers: list[Manager], tactics: list[dict[str, str]], issues) -> None:
    by_id = {item.config.get("id", ""): item for item in managers}
    by_name: dict[str, list[Manager]] = {}
    for manager in managers:
        by_name.setdefault(normalize(manager.config.get("nombre")), []).append(manager)
        manager.tactics = []
    for tactic in tactics:
        manager_id = tactic.get("entrenador_id", "").strip()
        manager = by_id.get(manager_id)
        if manager_id and not manager:
            issues.warning(f"Tactica {tactic.get('id')}: entrenador_id inexistente {manager_id}.")
            continue
        if not manager and tactic.get("entrenador"):
            matches = by_name.get(normalize(tactic.get("entrenador")), [])
            if len(matches) == 1:
                manager = matches[0]
                issues.warning(
                    f"Tactica {tactic.get('id')}: vinculada por nombre; agrega entrenador_id={manager.config.get('id')}."
                )
        if manager:
            manager.tactics.append(tactic)


def parse_pairs(value: str) -> list[tuple[str, str]]:
    result = []
    for item in str(value or "").split("|"):
        if ":" not in item:
            continue
        first, second = item.split(":", 1)
        if first.strip() or second.strip():
            result.append((first.strip(), second.strip()))
    return result


def parse_career(value: str) -> list[tuple[str, str, str]]:
    result = []
    for item in str(value or "").split("|"):
        parts = [part.strip() for part in item.split(":", 2)]
        if len(parts) >= 2:
            result.append((parts[0], parts[1], parts[2] if len(parts) == 3 else ""))
    return result


def flag_id(nationality: str, country_names: dict[str, str]) -> str:
    wanted = normalize(nationality)
    return next((identifier for identifier, name in country_names.items() if normalize(name) == wanted), "default")


def manager_origin(manager: Manager, country_names: dict[str, str]) -> str:
    nationality = manager.config.get("nacionalidad") or "-"
    continent = manager.config.get("continente") or "-"
    return (
        f'<span><img class="dts-flag" src="img/flags/{esc(flag_id(nationality, country_names))}.webp" alt="" aria-hidden="true" '
        "loading=\"lazy\" onerror=\"this.onerror=null;this.src='img/flags/default.webp'\">"
        f'{esc(nationality)}</span><span class="dts-continent-mark" aria-hidden="true">◎</span><span>{esc(continent)}</span>'
    )


def related_managers(manager: Manager, managers: list[Manager]) -> list[tuple[Manager, str]]:
    cfg = manager.config
    own_teams = {normalize(item.get("equipo")) for item in manager.tactics if item.get("equipo")}
    own_styles = {normalize(item.get("estilo")) for item in manager.tactics if item.get("estilo")}
    ranked = []
    for candidate in managers:
        if candidate is manager:
            continue
        candidate_teams = {normalize(item.get("equipo")) for item in candidate.tactics if item.get("equipo")}
        candidate_styles = {normalize(item.get("estilo")) for item in candidate.tactics if item.get("estilo")}
        score = 0
        reason = ""
        if normalize(cfg.get("equipo")) not in {"", "sin equipo"} and normalize(cfg.get("equipo")) == normalize(candidate.config.get("equipo")):
            score, reason = 8, f"Mismo club: {cfg.get('equipo')}"
        elif own_teams & candidate_teams:
            team = next(iter(own_teams & candidate_teams))
            score, reason = 6, f"Contexto tactico compartido: {team.title()}"
        elif own_styles & candidate_styles:
            style = next(iter(own_styles & candidate_styles))
            score, reason = 4, f"Estilo relacionado: {style.title()}"
        elif normalize(cfg.get("nacionalidad")) == normalize(candidate.config.get("nacionalidad")):
            score, reason = 2, f"Misma nacionalidad: {cfg.get('nacionalidad')}"
        if score:
            ranked.append((score, normalize(candidate.config.get("nombre")), candidate, reason))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [(item[2], item[3]) for item in ranked[:3]]


def render_manager_related(manager: Manager, reason: str, country_names: dict[str, str]) -> str:
    cfg = manager.config
    name = cfg.get("nombre") or manager.directory
    team = cfg.get("equipo") or "Sin equipo"
    url = manager_url(manager)
    return f'''<article class="dts-related-card">
      <div class="dts-related-body"><span class="dts-related-reason">{esc(reason)}</span><a class="dts-related-title" href="{esc(url)}">{esc(name)}</a>
        <div class="dts-related-team"><img src="{esc(manager_team_crest(manager))}" alt="" aria-hidden="true" onerror="this.remove()"><span>{esc(team)}</span></div>
        <div class="dts-related-origin">{manager_origin(manager, country_names)}</div>
        <span class="dts-related-count">{len(manager.tactics)} tactica(s)</span>
        <a class="dts-related-button" href="{esc(url)}" data-i18n="dts.viewCoach">Ver DT</a></div>
    </article>'''


def _manager_team_entry(team: str, team_catalog: dict[str, dict[str, str]]) -> dict[str, str]:
    return team_catalog.get(normalize(team), {})


def render_manager_tactic_card(tactic: dict[str, str]) -> str:
    team = tactic.get("equipo") or "Equipo"
    badge = tactic.get("escudo") or "img/teams/default.webp"
    tags = [value for value in (tactic.get("estilo"), tactic.get("estilo_ataque"), tactic.get("presion")) if value]
    return f'''<article class="dts-tactic-card">
      <img src="{esc(badge)}" alt="{esc(team)}" loading="lazy" onerror="this.onerror=null;this.src='img/teams/default.webp'">
      <div><span>{esc(tactic.get('temporada') or '-')}</span><h3>{esc(team)}</h3><strong>{esc(tactic_formation(tactic) or '-')}</strong>
      <div class="dts-tactic-tags">{"".join(f'<small>{esc(tag)}</small>' for tag in tags[:3])}</div></div>
      <a href="{esc(tactic_url(tactic))}" data-i18n="dts.viewTactic">Ver tactica</a>
    </article>'''


def render_manager_main(
    manager: Manager,
    managers: list[Manager],
    country_names: dict[str, str],
    current_team_url: str | None = None,
    team_catalog: dict[str, dict[str, str]] | None = None,
) -> str:
    cfg = manager.config
    team_catalog = team_catalog or {}
    name = cfg.get("nombre") or manager.directory
    team = cfg.get("equipo") or "Sin equipo"
    nationality = cfg.get("nacionalidad") or "-"
    country = flag_id(nationality, country_names)
    career = manager_career(manager)
    honors = parse_pairs(cfg.get("palmares", ""))
    age = manager_age(manager)
    birth_date = manager.external.get("birth_date") or ""
    has_face = face_section_available(manager.face, 0)
    has_hair = face_section_available(manager.face, 1)
    transfermarkt_id = cfg.get("transfermarkt_id", "").strip()
    transfer_url = str(manager.external.get("source_url") or transfermarkt_url(transfermarkt_id)) if transfermarkt_id else ""
    recent_career = career[-3:][::-1]
    career_rows = []
    for years, club, role in career:
        team_entry = _manager_team_entry(club, team_catalog)
        club_html = f'<a href="{esc(team_entry["url"])}">{esc(club)}</a>' if team_entry.get("url") else esc(club)
        career_rows.append(
            f'<li><time>{esc(years)}</time><span class="dts-timeline-club">'
            f'<span class="dts-timeline-crest"><img src="{esc(team_entry.get("crest") or manager_crest(club))}" alt="{esc(club)}" loading="lazy" onerror="this.remove()"></span>'
            f'<span><strong>{club_html}</strong>{f"<small>{esc(role)}</small>" if role else ""}</span></span></li>'
        )
    career_html = "".join(career_rows) or '<li><span class="dts-timeline-years">-</span><span class="dts-timeline-club"><strong>Sin datos</strong></span></li>'
    honors_html = "".join(f'<li><span>{esc(title)}</span><strong>{esc(number)}</strong></li>' for number, title in honors)
    related_html = "".join(render_manager_related(item, reason, country_names) for item, reason in related_managers(manager, managers))
    team_label = f'<a href="{esc(current_team_url)}">{esc(team)}</a>' if current_team_url else esc(team)
    recent_html = "".join(f'<li><time>{esc(years)}</time><strong>{esc(club)}</strong></li>' for years, club, _role in recent_career)
    tactics_html = "".join(render_manager_tactic_card(item) for item in manager.tactics)
    birth_label = f'{esc(birth_date)}{f" · {age} años" if age is not None else ""}' if birth_date else "-"
    external_club = str(manager.external.get("current_club") or "")
    return f'''<main id="dts-page" class="dts-shell dts-detail-shell" data-laqp-manager-id="{esc(cfg.get('id') or manager.directory)}">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="database.html">Base de datos</a><a href="database/DTs/">Directores Técnicos</a><span>{esc(name)}</span></nav>
    <section class="dts-manager-hero">
      <figure class="dts-manager-photo"><img src="{esc(manager_image(manager))}" alt="{esc(name)}" onerror="this.onerror=null;this.src='img/logo.webp'"></figure>
      <div class="dts-manager-copy"><span class="dts-kicker" data-i18n="dts.coach">Director Tecnico</span><h1>{esc(name)}</h1>
        <div class="dts-manager-teamline"><img src="{esc(_manager_team_entry(team, team_catalog).get('crest') or manager_crest(team))}" alt="{esc(team)}" onerror="this.remove()"><strong>{team_label}</strong><span>{esc(cfg.get('anio') or '-')}</span></div>
        <div class="dts-manager-identity"><span><img class="dts-flag" src="img/flags/{esc(country)}.webp" alt="" aria-hidden="true" onerror="this.src='img/flags/default.webp'">{esc(nationality)}</span>{f'<span>{age} <span data-i18n="dts.years">años</span></span>' if age is not None else ''}<span>{len(manager.tactics)} <span data-i18n="dts.tacticsCount">tácticas</span></span></div>
        <div class="dts-manager-actions"><a href="#tacticas" data-dts-open="tacticas" data-i18n="dts.viewTactics">Ver tacticas</a><a href="#cara" data-dts-open="cara" data-i18n="dts.face">Cara PES</a><a href="#peinado" data-dts-open="peinado" data-i18n="dts.hair">Peinado</a>{f'<a href="{esc(transfer_url)}" target="_blank" rel="noopener noreferrer">Transfermarkt <span aria-hidden="true">↗</span></a>' if transfer_url else ''}</div>
      </div>
    </section>
    <nav class="dts-profile-nav" aria-label="Secciones del DT" data-dts-tabs><a href="#resumen" data-dts-tab="resumen" aria-selected="true" data-i18n="dts.summary">Resumen</a><a href="#tacticas" data-dts-tab="tacticas" data-i18n="dts.tactics">Tacticas</a><a href="#cara" data-dts-tab="cara" data-i18n="dts.face">Cara</a><a href="#peinado" data-dts-tab="peinado" data-i18n="dts.hair">Peinado</a><a href="#carrera" data-dts-tab="carrera" data-i18n="dts.career">Carrera</a></nav>
    <div class="dts-profile-panels">
      <section id="resumen" class="dts-profile-panel" data-dts-panel="resumen"><div class="dts-summary-grid">
        <article class="dts-summary-lead"><span class="dts-section-kicker" data-i18n="dts.context">Contexto LAQP</span><h2>{esc(team)} · {esc(cfg.get('anio') or '-')}</h2><p>{esc(cfg.get('descripcion') or f'{name}, director tecnico para PES 2018.')}</p></article>
        <dl class="dts-summary-facts"><div><dt data-i18n="common.nationality">Nacionalidad</dt><dd>{esc(nationality)}</dd></div><div><dt data-i18n="dts.birth">Nacimiento</dt><dd>{birth_label}</dd></div><div><dt data-i18n="dts.realStatus">Situacion actual</dt><dd>{esc(external_club or ('Sin equipo' if manager.external.get('status') == 'without_club' else '-'))}</dd></div><div><dt data-i18n="dts.preferredFormation">Formacion habitual</dt><dd>{esc(manager.external.get('preferred_formation') or '-')}</dd></div><div><dt data-i18n="dts.faceAvailable">Cara PES</dt><dd data-i18n="{'dts.available' if has_face else 'dts.noData'}">{'Disponible' if has_face else 'Sin datos'}</dd></div><div><dt data-i18n="dts.hairAvailable">Peinado</dt><dd data-i18n="{'dts.available' if has_hair else 'dts.noData'}">{'Disponible' if has_hair else 'Sin datos'}</dd></div></dl>
        <article class="dts-summary-recent"><h2 data-i18n="dts.recentCareer">Trayectoria reciente</h2><ol>{recent_html or '<li>Sin datos</li>'}</ol><a href="#carrera" data-dts-open="carrera" data-i18n="dts.fullCareer">Ver carrera completa</a></article>
        <article class="dts-manager-honors"><h2 data-i18n="dts.honors">Palmares</h2><ul>{honors_html or '<li><span>Sin datos</span></li>'}</ul></article>
      </div>{f'<section class="dts-related"><header><h2 data-i18n="dts.related">DTs relacionados</h2></header><div class="dts-related-grid">{related_html}</div></section>' if related_html else ''}</section>
      <section id="tacticas" class="dts-profile-panel" data-dts-panel="tacticas"><header class="dts-panel-head"><span>{len(manager.tactics)}</span><div><h2 data-i18n="dts.tactics">Tacticas</h2><p data-i18n="dts.tacticsIntro">Contextos historicos y actuales creados por LAQP.</p></div></header><div class="dts-tactics-grid">{tactics_html or '<p class="dts-empty-panel">No hay tacticas asociadas a este DT.</p>'}</div></section>
      <section id="cara" class="dts-profile-panel" data-dts-panel="cara"><header class="dts-panel-head"><div><h2 data-i18n="dts.facePes">Cara PES 2018</h2><p data-i18n="dts.faceIntro">Preview y valores agrupados para copiar al editor.</p></div></header>{f'<div class="dts-editor-layout"><figure><img src="{esc(manager_image(manager, "ingame"))}" alt="{esc(name)} en PES 2018"></figure>{render_face_editor(manager.face, 0)}</div>' if has_face else '<p class="dts-empty-panel">Este DT no tiene valores de cara cargados.</p>'}</section>
      <section id="peinado" class="dts-profile-panel" data-dts-panel="peinado"><header class="dts-panel-head"><div><h2 data-i18n="dts.hairPes">Peinado PES 2018</h2><p data-i18n="dts.hairIntro">Solo los valores correspondientes al pelo y accesorios.</p></div></header>{render_face_editor(manager.face, 1) if has_hair else '<p class="dts-empty-panel">Este DT no tiene valores de peinado cargados.</p>'}</section>
      <section id="carrera" class="dts-profile-panel" data-dts-panel="carrera"><header class="dts-panel-head"><span>{len(career)}</span><div><h2 data-i18n="dts.career">Carrera</h2><p data-i18n="dts.careerIntro">Etapas como entrenador y otros cargos registrados.</p></div></header><ol class="dts-career-list">{career_html}</ol></section>
    </div>
  </main>'''


def render_manager_card(manager: Manager, country_names: dict[str, str], card_type: str = "grid") -> str:
    cfg = manager.config
    name = cfg.get("nombre") or manager.directory
    team = cfg.get("equipo") or "Sin equipo"
    url = manager_url(manager)
    crest = manager_team_crest(manager)
    career = " ".join(club for _years, club, _role in parse_career(cfg.get("trayectoria", "")))
    origin = manager_origin(manager, country_names)
    if card_type == "popular":
        return f'''<article class="dts-popular-card"><a class="dts-popular-media" href="{esc(url)}" aria-label="Ver cara de {esc(name)}"><img src="{esc(url + (cfg.get('real_img') or 'real.png'))}" alt="{esc(name)}" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'"></a><div class="dts-popular-summary"><h2>{esc(name)}</h2><span class="dts-popular-team"><img src="{esc(crest)}" alt="" aria-hidden="true" onerror="this.remove()">{esc(team)}</span><strong>{esc(cfg.get('anio') or '-')}</strong><div class="dts-popular-meta">{origin}</div><a class="history-primary-button" href="{esc(url)}">Ver cara</a></div></article>'''
    search = normalize(" ".join((name, team, cfg.get("nacionalidad", ""), cfg.get("continente", ""), cfg.get("anio", ""), career)))
    return f'''<article class="dts-card" data-search="{esc(search)}" data-career="{esc(normalize(career))}" data-equipo="{esc(team)}" data-nacionalidad="{esc(cfg.get('nacionalidad') or '-')}" data-continente="{esc(cfg.get('continente') or '-')}" data-anio="{esc(cfg.get('anio') or '-')}" data-nombre="{esc(name)}" data-recent="{int(manager.modified * 1000)}" data-popularity="{esc(cfg.get('visitas') or '0')}">
      <a class="dts-card-media" href="{esc(url)}" aria-label="Ver cara de {esc(name)}"><img class="dts-card-portrait" src="{esc(url + (cfg.get('real_img') or 'real.png'))}" alt="{esc(name)} - cara PES 2018" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'"><img class="dts-team-crest" src="{esc(crest)}" alt="{esc(team)}" loading="lazy" onerror="this.remove()"></a>
      <div class="dts-card-body"><a class="dts-card-title" href="{esc(url)}">{esc(name)}</a><div class="dts-card-meta dts-card-team"><img src="{esc(crest)}" alt="" aria-hidden="true" onerror="this.remove()"><span>{esc(team)}</span></div><div class="dts-card-meta dts-card-year">{esc(cfg.get('anio') or '-')}</div><div class="dts-card-meta dts-card-origin">{origin}</div><div class="dts-card-actions"><a class="dts-link-button" href="{esc(url)}">Ver cara</a></div></div>
    </article>'''


def _options(values: Iterable[str], all_label: str) -> str:
    return f'<option value="">{esc(all_label)}</option>' + "".join(f'<option value="{esc(value)}">{esc(value)}</option>' for value in sorted(set(values), key=normalize) if value)


def render_managers_main(managers: list[Manager], country_names: dict[str, str]) -> str:
    popular = managers[:3]
    nationalities = [item.config.get("nacionalidad", "") for item in managers]
    continents = [item.config.get("continente", "") for item in managers]
    teams = [item.config.get("equipo", "") or "Sin equipo" for item in managers]
    years = [item.config.get("anio", "") for item in managers]
    career = [club for item in managers for _dates, club, _role in parse_career(item.config.get("trayectoria", ""))]
    script = r'''<script>(function(){const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();const grid=document.getElementById('dts-grid');const cards=Array.from(grid.querySelectorAll('.dts-card'));const search=document.getElementById('dts-search');const team=document.getElementById('dts-team-filter');const career=document.getElementById('dts-career-filter');const nationality=document.getElementById('dts-nationality-filter');const continent=document.getElementById('dts-continent-filter');const year=document.getElementById('dts-year-filter');const sort=document.getElementById('dts-sort');const count=document.getElementById('dts-count');const empty=document.getElementById('dts-empty');function matches(card){const query=normalize(search.value);return(!query||card.dataset.search.includes(query))&&(!team.value||card.dataset.equipo===team.value)&&(!career.value||card.dataset.career.includes(normalize(career.value)))&&(!nationality.value||card.dataset.nacionalidad===nationality.value)&&(!continent.value||card.dataset.continente===continent.value)&&(!year.value||card.dataset.anio===year.value)}function applyFilters(){const sorted=cards.slice().sort((a,b)=>sort.value==='az'?a.dataset.nombre.localeCompare(b.dataset.nombre,'es'):sort.value==='year'?(Number(b.dataset.anio)||0)-(Number(a.dataset.anio)||0):(Number(b.dataset.recent)||0)-(Number(a.dataset.recent)||0));let visible=0;sorted.forEach(card=>{const show=matches(card);card.hidden=!show;if(show)visible+=1;grid.appendChild(card)});count.textContent=visible+' resultado(s)';empty.hidden=visible>0}[search,team,career,nationality,continent,year,sort].forEach(control=>control.addEventListener(control===search?'input':'change',applyFilters));document.getElementById('dts-clear').addEventListener('click',()=>{search.value='';team.value='';career.value='';nationality.value='';continent.value='';year.value='';sort.value='recent';applyFilters()});applyFilters()})();</script>'''
    return f'''<main id="dts-page" class="dts-shell" data-laqp-manager-index="true">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="database.html">Base de datos</a><span>Directores Técnicos</span></nav>
    <section class="dts-hero"><div class="dts-hero-copy"><span class="dts-kicker">Tácticas históricas</span><h1><span>Directores</span><span>Técnicos</span></h1><p>Explorá directores técnicos recreados para PES 2018 con una ficha pensada para preparar tu trayectoria o llevar su cara al editor de Liga Máster.</p><div class="dts-hero-stats" aria-label="Resumen de directores técnicos"><article><span aria-hidden="true">♙</span><strong>{len(managers)}</strong><small>Directores técnicos</small></article><article><span aria-hidden="true">▦</span><strong>{len(set(teams))}</strong><small>Equipos principales</small></article><article><span aria-hidden="true">◎</span><strong>{len(set(continents))}</strong><small>Continentes</small></article></div></div><figure class="dts-hero-visual" aria-hidden="true"><div class="dts-hero-board"><span></span><span></span><span></span><span></span><span></span></div></figure></section>
    <section class="dts-filters" aria-label="Filtros de directores tecnicos"><label class="dts-filter-search"><span><i aria-hidden="true">⌕</i><b>Buscar entrenador</b></span><input id="dts-search" type="search" placeholder="Buscar entrenador..." autocomplete="off"></label><label><span><i aria-hidden="true">⚑</i><b>Nacionalidad</b></span><select id="dts-nationality-filter">{_options(nationalities, 'Todas')}</select></label><label><span><i aria-hidden="true">◎</i><b>Continente</b></span><select id="dts-continent-filter">{_options(continents, 'Todos')}</select></label><label><span><i aria-hidden="true">▰</i><b>Equipo</b></span><select id="dts-team-filter">{_options(teams, 'Todos')}</select></label><label><span><i aria-hidden="true">↳</i><b>Estuvo en</b></span><select id="dts-career-filter">{_options(career, 'Todos')}</select></label><label><span><i aria-hidden="true">▣</i><b>Año</b></span><select id="dts-year-filter">{_options(years, 'Todos')}</select></label><button type="button" id="dts-clear"><span aria-hidden="true">↻</span> Limpiar filtros</button></section>
    <div class="history-list-heading dts-popular-heading"><div><span class="history-kicker">☆ Destacados</span><h2>Destacados</h2><p>Algunos de los entrenadores más buscados por la comunidad.</p></div></div><section class="dts-popular-list" aria-label="DTs populares">{"".join(render_manager_card(item, country_names, 'popular') for item in popular)}</section>
    <section class="dts-list-head"><div><span class="history-kicker">▣ Todos los entrenadores</span><h2>Todos los entrenadores</h2><p>Explorá toda la colección de directores técnicos disponibles.</p></div><div class="dts-list-controls"><span id="dts-count">{len(managers)} resultado(s)</span><label><span>Ordenar por</span><select id="dts-sort"><option value="recent">Más recientes</option><option value="az">Nombre (A - Z)</option><option value="year">Año</option></select></label></div></section>
    <section class="dts-grid" id="dts-grid">{"".join(render_manager_card(item, country_names) for item in managers)}</section><p class="dts-empty" id="dts-empty" hidden>No hay DTs que coincidan con esos filtros.</p>{script}
  </main>'''


def load_managers(project_root: Path, issues) -> list[Manager]:
    public_root = project_root / "database" / "DTs"
    source_root = project_root / "Herramientas" / "Recursos" / "Base-de-datos" / "DTs"
    if not public_root.is_dir():
        issues.warning("No existe database/DTs; se omite la seccion de entrenadores.")
        return []

    config_path = source_root / "config.csv"
    configs = read_csv(config_path, issues)
    if not configs:
        issues.error("No hay entrenadores en el CSV maestro Herramientas/Recursos/Base-de-datos/DTs/config.csv.")
        return []

    managers = []
    seen_ids: set[str] = set()
    seen_directories: set[str] = set()
    seen_transfermarkt_ids: set[str] = set()
    external_cache = load_manager_cache(project_root, issues).get("coaches", {})
    config_modified = config_path.stat().st_mtime
    for row_number, config in enumerate(configs, 2):
        config_id = config.get("id", "").strip()
        directory_name = config.get("carpeta", "").strip()
        if not config_id:
            issues.error(f"DT fila {row_number}: falta el id estable.")
            continue
        if not directory_name:
            issues.error(f"DT {config_id}: falta la carpeta de recursos.")
            continue
        id_key = normalize(config_id)
        directory_key = normalize(directory_name)
        if id_key in seen_ids:
            issues.error(f"DT duplicado por id: {config_id}.")
            continue
        if directory_key in seen_directories:
            issues.error(f"DT duplicado por carpeta/URL: {directory_name}.")
            continue
        seen_ids.add(id_key)
        seen_directories.add(directory_key)
        transfermarkt_id = config.get("transfermarkt_id", "").strip()
        if transfermarkt_id:
            if transfermarkt_id in seen_transfermarkt_ids:
                issues.error(f"DT {config_id}: transfermarkt_id duplicado {transfermarkt_id}.")
                continue
            if not transfermarkt_id.isdigit():
                issues.warning(f"DT {config_id}: transfermarkt_id no numerico {transfermarkt_id}.")
            seen_transfermarkt_ids.add(transfermarkt_id)

        directory = public_root / directory_name
        source_directory = source_root / directory_name
        try:
            directory.resolve().relative_to(public_root.resolve())
            source_directory.resolve().relative_to(source_root.resolve())
        except ValueError:
            issues.error(f"DT {config_id}: carpeta fuera de las raíces permitidas: {directory_name}.")
            continue
        if not directory.is_dir():
            issues.error(f"DT {config_id}: carpeta de recursos inexistente {directory_name}.")
            continue
        face_name = config.get("face_csv") or "face.csv"
        faces = read_csv(source_directory / face_name, issues)
        face = {str(key).strip(): value for key, value in (faces[0] if faces else {}).items()}
        for image_key in ("real_img", "ingame_img"):
            image_name = config.get(image_key) or ("real.png" if image_key == "real_img" else "ingame.png")
            if not (directory / image_name).is_file():
                issues.warning(f"DT {config_id}: imagen inexistente {image_name}.")
        # El CSV esta ordenado del mas reciente al mas antiguo. El pequeno
        # desplazamiento conserva ese orden en data-recent sin otra columna.
        external = external_cache.get(transfermarkt_id, {}) if transfermarkt_id else {}
        if external and str(external.get("transfermarkt_id") or transfermarkt_id) != transfermarkt_id:
            issues.warning(f"DT {config_id}: ID de cache inconsistente; se ignora el registro externo.")
            external = {}
        for stage in external.get("career", []) if isinstance(external, dict) else []:
            if not isinstance(stage, dict):
                continue
            start_date, end_date = stage.get("start_date", ""), stage.get("end_date", "")
            if start_date and end_date and end_date < start_date:
                issues.warning(f"DT {config_id}: etapa con fechas incoherentes {start_date} - {end_date}.")
        cached_image = external.get("cached_image", "") if isinstance(external, dict) else ""
        if cached_image and not (directory / cached_image).is_file():
            issues.warning(f"DT {config_id}: imagen cacheada inexistente {cached_image}.")
        managers.append(Manager(directory_name, config, face, config_modified - row_number, external))
    return managers


def database_design(source: str) -> str:
    # El <base> debe aparecer antes de cualquier URL relativa; los navegadores
    # resuelven los elementos anteriores contra la URL profunda del documento.
    source = re.sub(
        r'(<head>\s*)(<script\s+src="js/consent-mode\.js"></script>\s*)(<base\s+href="/")',
        r'\1\3>\n  \2',
        source,
        count=1,
    )
    # El <base> debe aparecer antes de cualquier URL relativa; los navegadores
    # resuelven los elementos anteriores contra la URL profunda del documento.
    source = re.sub(
        r'(<head>\s*)(<script\s+src="js/consent-mode\.js"></script>\s*)(<base\s+href="/")',
        r'\1\3>\n  \2',
        source,
        count=1,
    )
    """Attach the shared Database design to generated pages without replacing data."""
    source = source.replace('css/database-system.css?v=20260924d', 'css/database-system.css?v=20260925g')
    source = source.replace('href="css/database-system.css"', 'href="css/database-system.css?v=20260925g"')
    if 'css/database-system.css' not in source:
        source = source.replace('</head>', '<link rel="stylesheet" href="css/database-system.css?v=20260925g">\n</head>', 1)
    if any(f'js/{script}.js' in source for script in ('app', 'player', 'league')) and 'js/database-rating.js' not in source:
        source = source.replace('</head>', '<script src="js/database-rating.js?v=20260924d"></script>\n</head>', 1)
    source = source.replace('src="js/app.js"', 'src="js/app.js?v=20260925g"')
    return re.sub(r'<body\b[^>]*>', lambda match: match.group() if 'database-product' in match.group() else re.sub(
        r'class="([^"]*)"', lambda cls: f'class="{cls.group(1)} database-product"', match.group())
        if 'class="' in match.group() else match.group()[:-1] + ' class="database-product">', source, count=1)


def generate_managers(
    project_root: Path,
    output_root: Path,
    country_names: dict[str, str],
    issues,
    notify,
    write,
    managers: list[Manager] | None = None,
    manager_team_paths: dict[str, str] | None = None,
    tactics: list[dict[str, str]] | None = None,
    team_catalog: dict[str, dict[str, str]] | None = None,
) -> ExtraResult:
    result = ExtraResult()
    managers = managers if managers is not None else load_managers(project_root, issues)
    if not managers:
        return result
    tactics = tactics if tactics is not None else load_tactic_summaries(project_root, issues)
    attach_manager_tactics(managers, tactics, issues)
    index_source = (project_root / "database" / "DTs" / "index.html").read_text(encoding="utf-8-sig")
    detail_source_path = next((project_root / "database" / "DTs" / item.directory / "index.html" for item in managers if (project_root / "database" / "DTs" / item.directory / "index.html").is_file()), None)
    if detail_source_path is None:
        issues.error("No existe una pagina de DT actual que pueda usarse como template.")
        return result
    detail_source = detail_source_path.read_text(encoding="utf-8-sig")
    for index, manager in enumerate(managers, 1):
        notify("managers", index, len(managers), f"Generando DTs... {index} / {len(managers)}")
        cfg = manager.config
        name = cfg.get("nombre") or manager.directory
        title = f"{name} {cfg.get('anio') or ''} - DT PES 2018 Liga Master | LAqP".replace("  ", " ")
        description = f"{name} para PES 2018 Liga Master: cara recreada, preview in-game, equipo {cfg.get('equipo') or 'Sin equipo'}, nacionalidad {cfg.get('nacionalidad') or '-'}."
        canonical = f"{SITE_URL}{manager.url}"
        image = f"{SITE_URL}/{manager_image(manager, 'ingame').lstrip('/')}"
        page = database_design(replace_main(detail_source, render_manager_main(
            manager, managers, country_names, (manager_team_paths or {}).get(manager.url), team_catalog,
        )))
        page = set_meta(page, title=title, description=description, canonical=canonical, image=image)
        # Las fichas de DT cambian de CSS/JS en bloque. Versionar estos recursos
        # evita que una visita conserve en cache el layout o las traducciones viejas.
        page = re.sub(r'css/style\.css(?:\?[^"\s]*)?"', 'css/style.css?v=20261001dt3"', page)
        page = re.sub(r'js/i18n\.js(?:\?[^"\s]*)?"', 'js/i18n.js?v=20261001dt3"', page)
        page = re.sub(r'js/manager\.js(?:\?[^"\s]*)?"', 'js/manager.js?v=20261001dt3"', page)
        if "js/manager.js" not in page:
            page = page.replace("</body>", '<script src="js/manager.js?v=20261001dt2"></script>\n</body>')
        target = safe_target(output_root, Path("database") / "DTs" / manager.directory / "index.html")
        if write(target, page.rstrip() + "\n"):
            result.managers += 1
            result.generated_files.append(target)
    index_page = database_design(replace_main(index_source, render_managers_main(managers, country_names)))
    index_page = re.sub(r'css/style\.css(?:\?[^"\s]*)?"', 'css/style.css?v=20261001dt3"', index_page)
    index_page = re.sub(r'js/i18n\.js(?:\?[^"\s]*)?"', 'js/i18n.js?v=20261001dt3"', index_page)
    index_target = safe_target(output_root, Path("database") / "DTs" / "index.html")
    if write(index_target, index_page.rstrip() + "\n"):
        result.other_html += 1
        result.generated_files.append(index_target)
    return result


def tactic_url(tactic: dict[str, str]) -> str:
    return f"/tactics/{quote(tactic.get('id', ''), safe='')}/"


def tactic_formation(tactic: dict[str, str], key: str = "formacion") -> str:
    label = (tactic.get(key) or tactic.get("formacion") or "").strip()
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/20(\d{2})", label)
    return f"{int(match.group(1))}-{int(match.group(2))}-{int(match.group(3))}" if match else label


def tactic_season(tactic: dict[str, str]) -> int:
    match = re.search(r"\d{4}", tactic.get("temporada", ""))
    return int(match.group()) if match else 0


def render_tactic_settings(tactic: dict[str, str], compact: bool = False) -> str:
    fields = (("Ataque", "estilo_ataque"), ("Construcción", "construccion"), ("Zona de ataque", "zona_ataque"), ("Posicionamiento", "posicionamiento"), ("Apoyo", "rango_apoyo"), ("Defensa", "estilo_defensivo"), ("Contención", "zona_contencion"), ("Presión", "presion"), ("Línea defensiva", "linea_defensiva"), ("Compacidad", "compacidad"))
    rows = [(label, tactic.get(key, "")) for label, key in fields if tactic.get(key)]
    if compact:
        rows = rows[:6]
    return f'<dl class="history-tactic-settings{" is-compact" if compact else ""}">' + "".join(f'<div><dt>{esc(label)}</dt><dd>{esc(value)}</dd></div>' for label, value in rows) + "</dl>"


def render_tactic_advanced(tactic: dict[str, str]) -> str:
    groups = (
        ("Ataque", (tactic.get("ataque_avanzada_1", ""), tactic.get("ataque_avanzada_2", ""))),
        ("Defensa", (tactic.get("defensa_avanzada_1", ""), tactic.get("defensa_avanzada_2", ""))),
    )
    content = []
    for label, values in groups:
        values = tuple(value for value in values if value)
        if values:
            content.append(f'<div class="history-advanced-group"><strong>{esc(label)}</strong>{"".join(f"<span>{esc(value)}</span>" for value in values)}</div>')
    if not content:
        return ""
    return f'<section class="history-advanced-instructions"><span class="history-tactic-section-label">Instrucciones avanzadas</span><div class="history-advanced-grid">{"".join(content)}</div></section>'


def render_tactics_search_placeholder() -> str:
    return '''<section class="history-search-panel history-search-placeholder" aria-label="Buscador y filtros de tácticas" aria-busy="true"><div class="history-search-row"><label class="history-main-search"><span class="sr-only">Buscar táctica</span><input type="search" placeholder="Buscar táctica, equipo, entrenador..." disabled><i aria-hidden="true">⌕</i></label><label class="history-sort"><span>Ordenar por</span><select disabled><option>Más recientes</option></select></label></div><div class="history-filter-bar"><span class="history-filter-loading">Preparando filtros…</span></div></section>'''


def render_tactic_pitch(tactic: dict[str, str], compact: bool = False) -> str:
    markers = []
    for player in tactic.get("_players", []):  # type: ignore[union-attr]
        name = player.get("nombre") or "Jugador"
        position = player.get("posicion_inicial") or player.get("posicion") or "-"
        try:
            x = float(player.get("x_inicial") or player.get("x") or 50)
            y = float(player.get("y_inicial") or player.get("y") or 50)
        except ValueError:
            x = y = 50
        markers.append(f'''<span class="history-tactic-player" style="left:{x:g}%;top:{y:g}%" title="{esc(name)} - {esc(position)}"><span class="history-player-photo-wrap"><img src="database/tacticas/teams/{quote(tactic.get('id',''), safe='')}/{quote(player.get('id',''), safe='')}.webp" alt="{esc(name)}" loading="lazy" onerror="this.onerror=null;this.src='img/players/default.webp'"></span><span class="history-player-position">{esc(position)}</span><span class="history-player-name{' is-long' if len(name) > 11 else ''}"><span>{esc(name)}</span></span></span>''')
    return f'<div class="history-tactic-pitch{" is-compact" if compact else ""}" aria-label="Formación {esc(tactic_formation(tactic))}"><span class="history-pitch-half"></span><span class="history-pitch-circle"></span><span class="history-pitch-area history-pitch-area-top"></span><span class="history-pitch-area history-pitch-area-bottom"></span>{"".join(markers)}</div>'


def tactic_image(value: str, fallback: str) -> str:
    return value or fallback


def render_tactic_card(tactic: dict[str, str], popular: bool = False) -> str:
    team = tactic.get("equipo") or "Equipo"
    cover = tactic_image(tactic.get("portada", ""), "assets/images/home-banner-main-2.png")
    badge = tactic_image(tactic.get("escudo", ""), "img/teams/default.webp")
    summary = f'''<div class="history-tactic-summary"><span class="history-tactic-season">{esc(tactic.get('temporada'))}</span><h2>{esc(team)}</h2><strong>{esc(tactic.get('apodo'))}</strong><p>{esc(tactic.get('descripcion'))}</p><a class="{'history-primary-button' if popular else 'history-secondary-button'}" href="{esc(tactic_url(tactic))}">{'Ver táctica' if popular else 'Leer más'}</a></div>'''
    cover_html = f'''<div class="history-tactic-cover"><img class="history-tactic-cover-image" src="{esc(cover)}" alt="{esc(team)} {esc(tactic.get('temporada'))}" loading="lazy" onerror="this.onerror=null;this.src='assets/images/home-banner-main-2.png'"><div class="history-tactic-cover-shade"></div><img class="history-tactic-badge" src="{esc(badge)}" alt="{esc(team)}" loading="lazy" onerror="this.onerror=null;this.src='img/teams/default.webp'"></div>'''
    if popular:
        return f'<article class="history-popular-card">{cover_html}{summary}</article>'
    return f'''<article class="history-tactic-card">{cover_html}{summary}<div class="history-tactic-formation"><span>{esc(tactic_formation(tactic))}</span>{render_tactic_pitch(tactic, True)}</div><div class="history-tactic-actions"><span class="history-tactic-section-label">Ajustes clave en PES 2018</span>{render_tactic_settings(tactic, True)}<a class="history-primary-button" href="{esc(tactic_url(tactic))}">Ver táctica completa</a></div></article>'''


def render_tactics_index(tactics: list[dict[str, str]]) -> str:
    popular = tactics[:4]
    return f'''<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><span>Tácticas</span></nav><section class="history-tactics-hero"><div class="history-tactics-hero-copy"><span class="history-kicker">Fútbol histórico en PES 2018</span><h1>Tácticas</h1><p>Reviví equipos que marcaron una época con esquemas y ajustes listos para recrear.</p></div></section>{render_tactics_search_placeholder()}<div class="history-list-heading"><div><span class="history-kicker">Más vistas</span><h2>Tácticas populares</h2></div></div><section id="history-popular-tactics-list" class="history-tactics-list history-popular-tactics-list" aria-label="Tácticas populares">{"".join(render_tactic_card(item, True) for item in popular)}</section><div class="history-list-heading"><div><span class="history-kicker">Catálogo completo</span><h2>Todas las tácticas</h2></div><strong>{len(tactics)} tácticas</strong></div><section id="history-tactics-list" class="history-tactics-list" aria-label="Listado de tácticas">{"".join(render_tactic_card(item) for item in tactics)}</section>'''


def render_tactic_detail(tactic: dict[str, str], tactics: list[dict[str, str]]) -> str:
    team = tactic.get("equipo") or "Equipo"
    cover = tactic_image(tactic.get("portada", ""), "assets/images/home-banner-main-2.png")
    badge = tactic_image(tactic.get("escudo", ""), "img/teams/default.webp")
    keys = [item.strip() for item in tactic.get("claves", "").split("|") if item.strip()]
    related = [item for item in tactics if item.get("id") != tactic.get("id")][:3]
    related_html = "".join(f'''<a href="{esc(tactic_url(item))}"><img class="history-related-badge" src="{esc(tactic_image(item.get('escudo',''), 'img/teams/default.webp'))}" alt="{esc(item.get('equipo'))}" loading="lazy" onerror="this.onerror=null;this.src='img/teams/default.webp'"><span><strong>{esc(item.get('equipo'))}</strong><small>{esc(item.get('temporada'))} - {esc(tactic_formation(item))}</small></span></a>''' for item in related)
    if tactic.get("_manager_url"):
        manager = f' · <a class="history-manager-link" href="{esc(tactic.get("_manager_url"))}">{esc(tactic.get("entrenador"))}</a>'
    else:
        manager = f" · {esc(tactic.get('entrenador'))}" if tactic.get("entrenador") else ""
    return f'''<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="tactics.html">Tácticas</a><span>{esc(team)}</span></nav><section class="history-detail-hero"><img class="history-detail-cover" src="{esc(cover)}" alt="{esc(team)} {esc(tactic.get('temporada'))}" loading="eager" onerror="this.onerror=null;this.src='assets/images/home-banner-main-2.png'"><div class="history-detail-shade"></div><div class="history-detail-copy"><img class="history-detail-badge" src="{esc(badge)}" alt="{esc(team)}" loading="eager" onerror="this.onerror=null;this.src='img/teams/default.webp'"><div><span class="history-kicker">{esc(tactic.get('temporada'))} · {esc(tactic.get('pais') or tactic.get('region'))}{manager}</span><h1>{esc(team)}</h1><strong>{esc(tactic.get('apodo'))}</strong><p>{esc(tactic.get('descripcion'))}</p></div></div></section><section class="history-detail-grid"><article class="history-detail-panel history-detail-formation"><div class="history-detail-panel-head"><span class="history-kicker">Formación</span><h2>{esc(tactic_formation(tactic))}</h2></div>{render_tactic_pitch(tactic)}</article><div class="history-detail-side"><article class="history-detail-panel"><div class="history-detail-panel-head"><span class="history-kicker">Configuración</span><h2>Ajustes en PES 2018</h2></div>{render_tactic_settings(tactic)}{f'<div class="history-key-list">{"".join(f"<span>{esc(key)}</span>" for key in keys)}</div>' if keys else ''}{render_tactic_advanced(tactic)}</article><section class="history-related"><div class="history-list-heading"><div><span class="history-kicker">Seguí explorando</span><h2>Otras tácticas</h2></div><a href="tactics.html">Ver todas</a></div><div class="history-related-grid">{related_html}</div></section></div></section><section data-laqp-comments data-page-type="tactic" data-page-id="{esc(tactic.get('id'))}"></section>'''


def generate_tactics(project_root: Path, output_root: Path, issues, notify, write, managers: list[Manager] | None = None) -> tuple[ExtraResult, list[dict[str, str]]]:
    result = ExtraResult()
    tactics = read_csv(project_root / "database" / "tacticas.csv", issues, optional=True)
    tactics = [item for item in tactics if item.get("id")]
    metadata = read_csv(project_root / "database" / "tacticas-metadata.csv", issues, optional=True)
    metadata_by_id = {item.get("id", ""): item for item in metadata if item.get("id")}
    tactics = [{**item, **metadata_by_id.get(item.get("id", ""), {})} for item in tactics]
    manager_by_id = {item.config.get("id", ""): item for item in (managers or [])}
    seen: set[str] = set()
    valid = []
    for tactic in tactics:
        identifier = tactic.get("id", "")
        if identifier in seen:
            issues.error(f"Táctica con ID duplicado: {identifier}; se conserva la primera.")
            continue
        seen.add(identifier)
        if identifier not in metadata_by_id:
            issues.warning(f"Táctica {identifier}: faltan metadatos de país y entrenador para los filtros.")
        manager_id = tactic.get("entrenador_id", "").strip()
        if manager_id:
            manager = manager_by_id.get(manager_id)
            if manager:
                tactic["_manager_url"] = manager.url
            else:
                issues.warning(f"Táctica {identifier}: entrenador_id inexistente {manager_id}.")
        tactic["_players"] = read_csv(project_root / "database" / "tacticas" / "teams" / identifier / "players.csv", issues)  # type: ignore[assignment]
        if len(tactic["_players"]) != 11:  # type: ignore[arg-type]
            issues.warning(f"Táctica {identifier}: se detectaron {len(tactic['_players'])} jugadores; se esperaban 11.")
        for field in ("portada", "escudo"):
            asset = tactic.get(field, "").strip()
            parsed = urlsplit(asset)
            if asset and not parsed.scheme and not (project_root / unquote(parsed.path.lstrip("/"))).is_file():
                issues.warning(f"Táctica {identifier}: imagen {field} inexistente: {asset}.")
        for player in tactic["_players"]:  # type: ignore[union-attr]
            player_id = player.get("id", "").strip()
            image_path = project_root / "database" / "tacticas" / "teams" / identifier / f"{player_id}.webp"
            if player_id and not image_path.is_file():
                issues.warning(f"Táctica {identifier}: imagen de jugador inexistente: {image_path.relative_to(project_root)}.")
        valid.append(tactic)
    tactics = sorted(valid, key=lambda item: (-tactic_season(item), normalize(item.get("equipo"))))
    if not tactics:
        return result, tactics
    shell_path = project_root / "tactics.html"
    if not shell_path.is_file():
        issues.error("No existe tactics.html para usar como template.")
        return result, tactics
    shell = database_design(shell_path.read_text(encoding="utf-8-sig"))
    index = re.sub(r'<div id="tactics-loading"[^>]*>', '<div id="tactics-loading" class="tactics-loading" style="display:none">', shell, count=1)
    index = replace_between(index, '<div id="tactics-content"', "\n  </main>", f'<div id="tactics-content" class="js-prerender-fallback">{render_tactics_index(tactics)}</div>')
    index = re.sub(r'js/tactics\.js(?:\?[^"\s]*)?"', 'js/tactics.js?v=20261001dt"', index)
    target = safe_target(output_root, Path("tactics.html"))
    if write(target, index.rstrip() + "\n"):
        result.other_html += 1
        result.generated_files.append(target)
    for number, tactic in enumerate(tactics, 1):
        notify("tactics", number, len(tactics), f"Generando tácticas... {number} / {len(tactics)}")
        page = index
        if '<base href="/">' not in page:
            page = page.replace("<head>", '<head>\n  <base href="/">', 1)
        title = f"{tactic.get('equipo')} {tactic.get('temporada')} - Táctica PES 2018 | LAqP"
        description = f"{tactic.get('equipo')} {tactic.get('temporada')} en PES 2018: formación {tactic_formation(tactic)}, ajustes, instrucciones y claves para recrear la táctica."
        page = set_meta(page, title=title, description=description, canonical=f"{SITE_URL}{tactic_url(tactic)}")
        manager_data = (
            f' data-laqp-manager-url="{esc(tactic.get("_manager_url"))}"'
            if tactic.get("_manager_url") else ""
        )
        page = replace_between(page, '<div id="tactics-content"', "\n  </main>", f'<div id="tactics-content" class="js-prerender-fallback" data-laqp-tactic-id="{esc(tactic.get("id"))}"{manager_data}>{render_tactic_detail(tactic, tactics)}</div>')
        page = re.sub(r'js/tactics\.js(?:\?[^"\s]*)?"', 'js/tactics.js?v=20261001dt"', page)
        target = safe_target(output_root, Path("tactics") / tactic["id"] / "index.html")
        if write(target, page.rstrip() + "\n"):
            result.tactics += 1
            result.generated_files.append(target)
    return result, tactics


def stat_color(value: object) -> str:
    try:
        number = int(str(value))
    except ValueError:
        return "#d33d35"
    return "#00ff87" if number >= 95 else "#62ff51" if number >= 90 else "#a8ff00" if number >= 80 else "#e5dc00" if number >= 70 else "#e59f01" if number >= 60 else "#d33d35"


def _hydration_gate() -> str:
    return "<script data-laqp-hydration-gate>document.documentElement.classList.add('laqp-js');window.setTimeout(function(){document.documentElement.classList.add('laqp-js-timeout');},6000);</script>"


def _directory_shell(view: str, title: str, description: str, body: str) -> str:
    active = "teams-grid-view" if view == "teams" else f"{view}-view"
    canonical = f"database/v2/{view}/"
    views = []
    for identifier in ("home-view", "league-teams-view", "players-view", "player-view", "search-view", "leagues-view", "teams-grid-view", "favorites-view"):
        views.append(f'<div id="{identifier}"{" class=\"active\"" if identifier == active else ""}>{f"<div class=\"js-prerender-fallback\">{body}</div>" if identifier == active else ""}</div>')
    return f'''<!DOCTYPE html><html lang="es"><head><base href="/">{_hydration_gate()}<script src="js/consent-mode.js"></script><script src="js/minifaces.js"></script><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="laqp-database-view" content="{esc(view)}"><title>{esc(title)}</title><meta name="description" content="{esc(description)}"><link rel="canonical" href="{SITE_URL}/{canonical}"><link rel="stylesheet" href="css/style.css"><link rel="icon" href="img/logo.webp" type="image/webp"></head><body><header id="header"><a href="/index.html" class="header-logo-link"><img class="logo" src="img/logo.webp" alt="Logo LAqP"></a><div class="header-title">PES 2018 Actualizado <span>Base de datos</span></div><nav class="header-nav" aria-label="Menu principal"></nav><div id="search-container"><span class="search-icon" aria-hidden="true">&#128269;</span><input type="text" id="search-input" placeholder="Buscar jugadores..." data-i18n-placeholder="search.players" autocomplete="off"></div></header><div id="layout"><nav id="sidebar"></nav><main id="main"><div id="loading-overlay" class="js-hydration-loader" style="display:none"><div class="spinner"></div><span class="loading-message">Cargando base de datos...</span></div>{''.join(views)}</main></div><script src="js/pes2018-translations.js?v=20261003a"></script><script src="js/i18n.js?v=20261003a"></script><script src="js/site.js"></script><script src="js/favorites.js"></script><script src="js/country-filter.js?v=20260925g"></script><script src="js/pes2018-overall.js?v=20261003a"></script><script src="js/app.js?v=20261003a"></script></body></html>\n'''


def generate_directories(project_root: Path, output_root: Path, data, player_paths, team_paths, league_paths, issues, notify, write) -> ExtraResult:
    result = ExtraResult()
    notify("other", 1, 4, "Generando directorios generales... 1 / 4")
    published_teams = [data.team_by_id[team_id] for team_id in data.rosters if team_id in team_paths]
    club_ids = {entry.player.get("Id", "") for team_id in team_paths if data.team_by_id.get(team_id, {}).get("Type") != "2" for entry in data.rosters.get(team_id, [])}
    players = []
    seen = set()
    for team_id in data.rosters:
        team = data.team_by_id.get(team_id)
        if not team or team_id not in team_paths:
            continue
        for entry in data.rosters.get(team_id, []):
            pid = entry.player.get("Id", "")
            if not pid or pid in seen or (team.get("Type") == "2" and pid in club_ids):
                continue
            seen.add(pid)
            players.append((entry.player, team))
    players.sort(key=lambda item: -int(item[0].get("OverallStats") or 0))
    player_rows = "".join(f'''<tr><td><img class="player-row-photo" src="img/players/{esc(player.get('Id'))}.webp" alt="{esc(player.get('Name'))}" loading="lazy" onerror="this.onerror=null;this.src='img/players/default.webp'"></td><td><a href="{esc(player_paths.get((team.get('Id',''), player.get('Id','')), '#'))}"><strong>{esc(player.get('Name'))}</strong></a></td><td><a href="{esc(team_paths.get(team.get('Id',''), '#'))}">{esc(team.get('Name'))}</a></td><td><span class="position-badge">{esc(position_label(player.get('POS')))}</span></td><td><span class="overall-badge" style="background:{stat_color(player.get('OverallStats'))}">{esc(player.get('OverallStats') or '-')}</span></td><td>{esc(player.get('Age') or '-')}</td></tr>''' for player, team in players)
    player_body = f'<div class="breadcrumb-row"><nav class="breadcrumbs"><a href="index.html" data-i18n="common.home">Inicio</a><a href="database.html" data-i18n="common.database">Base de datos</a><span data-i18n="common.players">Jugadores</span></nav></div><div class="view-header"><div><h1 class="view-title" data-i18n="common.players">Jugadores</h1><div class="view-subtitle" data-i18n="db.updatedPlayers" data-i18n-params=\'{{"count":{len(players)}}}\'>{len(players)} jugadores actualizados con stats, medias, equipos y referencias de edición</div></div></div><div class="table-responsive"><table class="players-table players-table--directory"><thead><tr><th></th><th data-i18n="common.player">Jugador</th><th data-i18n="common.team">Equipo</th><th data-i18n="common.positionShort">Pos</th><th data-i18n="common.overall">Media</th><th data-i18n="common.age">Edad</th></tr></thead><tbody>{player_rows}</tbody></table></div>'
    pages = [("players", "Jugadores PES 2018 Actualizado - Stats, Caras y Medias", "Listado de jugadores para PES 2018 actualizado con stats, medias, equipos, posiciones y edad.", player_body)]
    team_cards = "".join(f'''<a class="grid-card db-index-card db-team-card" href="{esc(team_paths.get(team.get('Id',''), '#'))}"><img class="grid-card-img" src="img/teams/{esc(team.get('Id'))}.webp" alt="{esc(team.get('Name'))}" loading="lazy" onerror="this.onerror=null;this.src='img/teams/default.webp'"><span class="grid-card-kicker" data-i18n="db.teamKicker">Equipo</span><span class="grid-card-name">{esc(team.get('Name'))}</span><span class="grid-card-sub" data-i18n="db.playerCount" data-i18n-params='{{"count":{len(data.rosters.get(team.get('Id',''), []))}}}'>{len(data.rosters.get(team.get('Id',''), []))} jugadores</span><span class="grid-card-action" data-i18n="db.viewSquad">Ver plantel</span></a>''' for team in published_teams)
    team_body = f'<div class="breadcrumb-row"><nav class="breadcrumbs"><a href="index.html" data-i18n="common.home">Inicio</a><a href="database.html" data-i18n="common.database">Base de datos</a><span data-i18n="common.teams">Equipos</span></nav></div><div class="view-header"><div><h1 class="view-title" data-i18n="common.teams">Equipos</h1><div class="view-subtitle" data-i18n="db.modernSquads" data-i18n-params=\'{{"count":{len(published_teams)}}}\'>{len(published_teams)} equipos con plantillas modernas</div></div></div><div class="grid-cards" id="teams-grid-cards">{team_cards}</div>'
    pages.append(("teams", "Equipos PES 2018 Actualizado - Plantillas y Stats", "Equipos y plantillas actualizadas para PES 2018 con enlaces a jugadores y datos de edición.", team_body))
    league_cards = "".join(f'''<a class="grid-card db-index-card db-league-card" href="{esc(league_paths.get((league.get('league_id',''), league.get('league_name','')), '#'))}"><img class="grid-card-img" src="img/leagues/{esc(league.get('league_id'))}.webp" alt="{esc(league.get('league_name'))}" loading="lazy" onerror="this.onerror=null;this.src='img/leagues/default.webp'"><span class="grid-card-kicker" data-i18n="db.leagueKicker">Liga</span><span class="grid-card-name">{esc(league.get('league_name'))}</span><span class="grid-card-sub" data-i18n="db.teamCount" data-i18n-params='{{"count":{len([x for x in league.get('team_ids','').split(',') if x.strip()])}}}'>{len([x for x in league.get('team_ids','').split(',') if x.strip()])} equipos</span><span class="grid-card-action" data-i18n="db.viewTeams">Ver equipos</span></a>''' for league in data.leagues)
    league_body = f'<div class="breadcrumb-row"><nav class="breadcrumbs"><a href="index.html" data-i18n="common.home">Inicio</a><a href="database.html" data-i18n="common.database">Base de datos</a><span data-i18n="common.leagues">Ligas</span></nav></div><div class="view-header"><div><h1 class="view-title" data-i18n="common.leagues">Ligas</h1><div class="view-subtitle" data-i18n="db.leaguesCompetitions" data-i18n-params=\'{{"count":{len(data.leagues)}}}\'>{len(data.leagues)} ligas y competiciones</div></div></div><div class="grid-cards" id="leagues-grid-cards">{league_cards}</div>'
    pages.append(("leagues", "Ligas PES 2018 Actualizado - Equipos y Plantillas", "Ligas y competiciones actualizadas para PES 2018 con equipos y plantillas.", league_body))
    for number, (view, title, description, body) in enumerate(pages, 1):
        target = safe_target(output_root, Path("database") / "v2" / view / "index.html")
        if write(target, database_design(_directory_shell(view, title, description, body))):
            result.other_html += 1
            result.generated_files.append(target)
        notify("other", number + 1, 4, f"Generando directorios generales... {number + 1} / 4")
    return result


def replace_marked(source: str, marker: str, content: str) -> str:
    start = f"<!-- LAQP_STATIC_{marker}_START -->"
    end = f"<!-- LAQP_STATIC_{marker}_END -->"
    pattern = re.compile(re.escape(start) + r"[\s\S]*?" + re.escape(end))
    if not pattern.search(source):
        raise ValueError(f"No se encontro el marcador {marker}.")
    return pattern.sub(start + "\n" + content + "\n                  " + end, source, count=1)


def set_text_by_id(source: str, identifier: str, value: object) -> str:
    pattern = re.compile(
        rf'(<(?P<tag>[a-z][a-z0-9:-]*)\b[^>]*\bid=["\']{re.escape(identifier)}["\'][^>]*>)[\s\S]*?(</(?P=tag)>)',
        re.IGNORECASE,
    )
    return pattern.sub(lambda match: f"{match.group(1)}{esc(value)}{match.group(3)}", source, count=1)


def format_date(value: object) -> str:
    raw = str(value or "").strip()
    for pattern in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, pattern).strftime("%d/%m/%Y")
        except ValueError:
            pass
    return raw


def iso_date(value: object) -> str:
    raw = str(value or "").strip()
    for pattern in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, pattern).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return ""


def option_value(item: dict, *keys: str, default=""):
    for key in keys:
        value = item.get(key)
        if value not in (None, "", []):
            return value
    return default


def option_title(item: dict) -> str:
    return str(option_value(item, "title", "titulo", "nombre", default="Option File"))


def option_slug(item: dict) -> str:
    explicit = str(option_value(item, "slug", default="")).strip()
    if explicit:
        return explicit
    # Las filas nuevas del CSV pueden compartir título (por ejemplo PC y
    # PS4/PS5). Incluir la plataforma evita que una página sobrescriba a la
    # otra al generarse.
    platform = option_platform_label(item)
    base = f"{option_title(item)} {platform}".strip()
    return slugify(base)


def option_platforms(item: dict) -> list[str]:
    platforms = item.get("platforms")
    if isinstance(platforms, list):
        return [str(value).strip() for value in platforms if str(value).strip()]
    raw = str(option_value(item, "plataforma", "platform", default=""))
    return [part.strip() for part in re.split(r"\s*/\s*|\s*\|\s*", raw) if part.strip()]


def option_platform_label(item: dict) -> str:
    return " / ".join(option_platforms(item))


def option_image(item: dict) -> str:
    return str(option_value(item, "cover", "miniatura", "thumbnail", "image", default="img/logo.webp")).lstrip("/")


def option_file_url(item: dict) -> str:
    return f"/option-files/{quote(option_slug(item), safe='')}/"


def legacy_download_url(item: dict) -> str:
    return f"/download/{quote(str(option_value(item, 'id', 'ID')), safe='')}/"


def option_download_url(item: dict) -> str:
    return f"{option_file_url(item)}descargar/"


def prepare_download_shell(shell: str) -> str:
    source = shell if '<base href="/">' in shell else shell.replace("<head>", '<head>\n  <base href="/">', 1)
    return re.sub(
        r'\s*<!-- Loading overlay -->\s*<div id="loading-overlay"[^>]*>\s*<div class="spinner"></div>\s*<span[^>]*>[\s\S]*?</span>\s*</div>',
        "",
        source,
        count=1,
    )


def download_parts(item: dict) -> list[dict[str, str]]:
    structured = item.get("download_parts")
    if isinstance(structured, list):
        parts = []
        for number, part in enumerate(structured, 1):
            if not isinstance(part, dict):
                continue
            href = str(part.get("url") or part.get("href") or "").strip()
            if not href or href == "#":
                continue
            parts.append({
                "name": str(part.get("name") or part.get("label") or f"Parte {number}").strip(),
                "url": href,
                "size": str(part.get("size") or "").strip(),
            })
        if parts:
            return parts

    parts = []
    for number, entry in enumerate(str(item.get("links") or "").split("|"), 1):
        entry = entry.strip()
        if not entry:
            continue
        label, href = entry.split("::", 1) if "::" in entry else (f"Parte {number}", entry)
        if href.strip() and href.strip() != "#":
            parts.append({"name": label.strip(), "url": href.strip(), "size": ""})
    if not parts:
        href = str(option_value(item, "link", "url", default="")).strip()
        if href and href != "#":
            parts.append({"name": "Archivo completo", "url": href, "size": ""})
    return parts


def render_download_cta(item: dict, css: str = "download-btn") -> str:
    parts = download_parts(item)
    if not parts:
        return f'<span class="{css} download-btn-unavailable">Próximamente</span>'
    if len(parts) == 1:
        return f'<a class="{css}" href="{esc(parts[0]["url"])}" target="_blank" rel="noopener noreferrer">Descargar</a>'
    return f'<a class="{css}" href="{esc(option_download_url(item))}">Ver descargas</a>'


def render_home_download(item: dict) -> str:
    title = option_title(item)
    platform = option_platform_label(item)
    description = option_value(item, "description", "descripcion", default="Descarga para mantener PES 2018 actualizado.")
    return f'''<article class="featured-of-card"><div class="featured-of-media"><img src="{esc(option_image(item))}" alt="{esc(title)}" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'"></div><div class="featured-of-card-header"><span class="featured-of-game">{esc(title)}</span>{f'<span class="download-version-badge">{esc(item.get("version"))}</span>' if item.get('version') else ''}</div>{f'<div class="featured-of-game-sub">{esc(option_value(item, "game", "juego"))}</div>' if option_value(item, 'game', 'juego') else ''}{f'<div class="featured-of-platform"><span class="download-platform-badge">{esc(platform)}</span></div>' if platform else ''}<p class="featured-of-desc">{esc(description)}</p><div class="featured-of-actions"><a class="featured-of-btn featured-of-btn-details" href="{esc(option_file_url(item))}">Ver detalles</a>{render_download_cta(item, "featured-of-btn featured-of-btn-download")}</div></article>'''


def render_download_card(item: dict) -> str:
    title = option_title(item)
    platform = option_platform_label(item)
    description = option_value(item, "description", "descripcion")
    date_value = option_value(item, "date", "fecha")
    category = option_value(item, "category", "categoria")
    return f'''<article class="download-card" id="{esc(option_value(item, 'id', 'ID'))}"><a class="download-card-media" href="{esc(option_file_url(item))}"><img src="{esc(option_image(item))}" alt="{esc(title)} para {esc(platform or 'PES 2018')}" loading="lazy" width="640" height="360" onerror="this.onerror=null;this.src='img/logo.webp'"></a><div class="download-card-header">{f'<span class="download-platform-badge">{esc(platform)}</span>' if platform else ''}{f'<span class="download-version-badge">{esc(item.get("version"))}</span>' if item.get('version') else ''}</div><div class="download-card-body"><div class="download-card-meta">{f'<time datetime="{esc(iso_date(date_value))}">{format_date(date_value)}</time>' if date_value else ''}{f'<span>{esc(category)}</span>' if category else ''}</div><h3 class="download-card-title"><a href="{esc(option_file_url(item))}">{esc(title)}</a></h3><p class="download-card-platform">{esc(platform)}</p><p class="download-description">{esc(description)}</p></div><div class="download-card-footer"><a class="download-btn download-btn-secondary" href="{esc(option_file_url(item))}">Ver detalles</a>{render_download_cta(item)}</div></article>'''


def render_downloads_content(downloads: list[dict[str, str]]) -> str:
    groups: dict[str, list[dict[str, str]]] = {}
    for item in downloads:
        groups.setdefault(str(option_value(item, "game", "juego", default="Option Files")), []).append(item)
    sections = "".join(f'<section class="download-group"><h2 class="download-group-title">{esc(game)}</h2><div class="download-cards-grid">{"".join(render_download_card(item) for item in items)}</div></section>' for game, items in groups.items())
    return f'''<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><span>Option Files</span></nav><section class="content-hub-hero of-hero"><div class="guides-hero-icon" aria-hidden="true">OF</div><div class="guides-hero-copy"><div class="content-hub-kicker">PES 2018</div><h1>Option Files</h1><p>Descargas para mantener PES 2018 actualizado en PS4, PS5 y PC: plantillas, ligas, kits y contenido editable.</p></div></section><section class="guides-library-panel of-library-panel"><div class="guides-panel-head"><div><span class="guides-panel-kicker">Descargas</span><h2>Option Files publicados</h2></div><span class="guides-count-pill">{len(downloads)} archivos</span></div><div class="downloads-how-to"><strong>Antes de instalar</strong><span>Revisá el tutorial correspondiente, descargá la plataforma correcta y conservá una copia de seguridad.</span></div>{sections}</section><noscript><section class="guides-library-panel"><h2>Descargas sin JavaScript</h2><p>Las tarjetas y enlaces principales están disponibles directamente desde esta página.</p></section></noscript>'''


def render_list_section(identifier: str, title: str, values: object, css: str = "of-check-list") -> str:
    if not isinstance(values, list) or not values:
        return ""
    items = "".join(f"<li>{esc(value)}</li>" for value in values)
    return f'<section class="of-article-section" id="{identifier}"><h2>{esc(title)}</h2><ul class="{css}">{items}</ul></section>'


def render_download_section(item: dict) -> str:
    parts = download_parts(item)
    count = len(parts)
    total_size = str(item.get("total_size") or "").strip()
    if not count:
        summary = "Esta descarga todavía no está disponible."
    elif count == 1:
        summary = total_size or parts[0].get("size") or "Un archivo"
    else:
        summary = f"{count} partes" + (f" · {total_size}" if total_size else "")
    return f'''<section class="of-article-section of-download-section" id="descarga"><span class="of-section-kicker">Descarga oficial</span><h2>Descargar Option File</h2><p class="of-download-summary">{esc(summary)}</p>{render_download_cta(item, "download-btn of-download-primary")}<p class="of-external-note">El botón abre la descarga configurada por LAqP.</p></section>'''


def render_related(item: dict, downloads: list[dict]) -> str:
    ids = item.get("related_downloads")
    if not isinstance(ids, list) or not ids:
        return ""
    by_id = {str(option_value(candidate, "id", "ID")): candidate for candidate in downloads}
    related = [by_id.get(str(identifier)) for identifier in ids]
    cards = "".join(
        f'''<a class="of-related-card" href="{esc(option_file_url(candidate))}"><img src="{esc(option_image(candidate))}" alt="Portada de {esc(option_title(candidate))} para {esc(option_platform_label(candidate))}" loading="lazy"><span><small>{esc(option_value(candidate, "game", "juego", default="PES 2018"))} · {esc(option_platform_label(candidate))}</small><strong>{esc(option_title(candidate))}</strong><em>Ver versión</em></span></a>'''
        for candidate in related if candidate
    )
    return f'<section class="of-related" aria-labelledby="related-title"><div class="of-section-heading"><span>Seguir explorando</span><h2 id="related-title">Otras versiones y descargas relacionadas</h2></div><div class="of-related-grid">{cards}</div></section>' if cards else ""


def render_download_detail(shell: str, item: dict, downloads: list[dict]) -> str:
    title = option_title(item)
    platform = option_platform_label(item)
    page_title = f"{title} — {platform}" if platform else title
    description = str(option_value(item, "description", "descripcion", default=f"Descargá {page_title} y revisá sus novedades, compatibilidad e instalación."))
    subtitle = str(option_value(item, "subtitle", default=description))
    game = str(option_value(item, "game", "juego", default="PES 2018"))
    date_value = option_value(item, "date", "fecha")
    tutorial = str(item.get("tutorial") or "/tutorials.html")
    parts = download_parts(item)
    source = prepare_download_shell(shell)
    meta_description = f"{description} Disponible para {platform}." if platform else description
    source = set_meta(source, title=f"{page_title} | LAqP", description=meta_description, canonical=f"{SITE_URL}{option_file_url(item)}", image=f"{SITE_URL}/{quote(option_image(item), safe='/')}")

    available_sections: list[tuple[str, str]] = []
    intro = str(option_value(item, "intro", default=description))
    if intro:
        available_sections.append(("introduccion", "Introducción"))
    if item.get("features"):
        available_sections.append(("contenido", "Contenido"))
    if item.get("changes"):
        available_sections.append(("novedades", "Novedades"))
    if item.get("leagues") or item.get("teams"):
        available_sections.append(("ligas", "Ligas y equipos"))
    if item.get("gallery"):
        available_sections.append(("galeria", "Galería"))
    if item.get("compatibility"):
        available_sections.append(("compatibilidad", "Compatibilidad"))
    if item.get("installation_notes"):
        available_sections.append(("instalacion", "Instalación"))
    available_sections.append(("descarga", "Descarga"))
    if item.get("common_issues"):
        available_sections.append(("problemas", "Problemas comunes"))
    if item.get("faq"):
        available_sections.append(("faq", "Preguntas frecuentes"))
    toc = "".join(f'<a href="#{identifier}">{esc(label)}</a>' for identifier, label in available_sections)

    highlights = item.get("highlights") if isinstance(item.get("highlights"), list) else []
    highlights_html = ""
    if highlights:
        stats = "".join(f'<div><strong>{esc(stat.get("value"))}</strong><span>{esc(stat.get("label"))}</span></div>' for stat in highlights if isinstance(stat, dict))
        highlights_html = f'<section class="of-highlights" aria-label="Datos destacados">{stats}</section>'

    league_team_html = ""
    if item.get("leagues") or item.get("teams"):
        leagues = "".join(f"<li>{esc(value)}</li>" for value in item.get("leagues", []))
        teams = "".join(f"<li>{esc(value)}</li>" for value in item.get("teams", []))
        league_team_html = f'''<section class="of-article-section" id="ligas"><h2>Ligas y equipos incluidos</h2><div class="of-chip-columns">{f'<div><h3>Ligas</h3><ul class="of-chip-list">{leagues}</ul></div>' if leagues else ''}{f'<div><h3>Equipos</h3><ul class="of-chip-list">{teams}</ul></div>' if teams else ''}</div></section>'''

    gallery_html = ""
    gallery = item.get("gallery") if isinstance(item.get("gallery"), list) else []
    if gallery:
        images = []
        for number, entry in enumerate(gallery, 1):
            data = entry if isinstance(entry, dict) else {"src": entry}
            src = str(data.get("src") or data.get("url") or "").lstrip("/")
            if src:
                alt = str(data.get("alt") or f"Captura {number} de {title}")
                images.append(f'<button class="of-gallery-item" type="button" data-gallery-src="{esc(src)}" data-gallery-alt="{esc(alt)}"><img src="{esc(src)}" alt="{esc(alt)}" loading="lazy"></button>')
        gallery_html = f'<section class="of-article-section" id="galeria"><h2>Galería</h2><div class="of-gallery of-gallery-{min(len(images), 3)}">{"".join(images)}</div></section>' if images else ""

    issues_html = ""
    issues = item.get("common_issues") if isinstance(item.get("common_issues"), list) else []
    if issues:
        rows = "".join(f'<article><h3>{esc(issue.get("title"))}</h3><p>{esc(issue.get("text"))}</p></article>' for issue in issues if isinstance(issue, dict))
        issues_html = f'<section class="of-article-section" id="problemas"><h2>Problemas comunes</h2><div class="of-issue-list">{rows}</div></section>'

    faq_html = ""
    faq = item.get("faq") if isinstance(item.get("faq"), list) else []
    if faq:
        questions = "".join(f'<details><summary>{esc(entry.get("question"))}</summary><p>{esc(entry.get("answer"))}</p></details>' for entry in faq if isinstance(entry, dict))
        faq_html = f'<section class="of-article-section" id="faq"><h2>Preguntas frecuentes</h2><div class="of-faq-list">{questions}</div></section>'

    meta = " · ".join(value for value in (format_date(date_value), str(item.get("version") or ""), platform) if value)
    size = str(item.get("total_size") or (parts[0].get("size") if len(parts) == 1 else "") or "")
    size_row = f'<div><dt>Tamaño</dt><dd>{esc(size)}</dd></div>' if size else ""
    sidebar_cta = render_download_cta(item, "download-btn of-sidebar-download")
    content = f'''<nav class="breadcrumbs of-breadcrumbs" aria-label="Breadcrumb"><a href="/index.html">Inicio</a><a href="/downloads.html">Option Files</a><span>{esc(title)}</span></nav><article class="of-article"><header class="of-article-header"><p class="of-article-kicker">Option File <span>/</span> {esc(game)}</p><h1>{esc(title)}</h1><p class="of-article-deck">{esc(subtitle)}</p><div class="of-article-meta">{esc(meta)}</div><div class="of-article-actions">{render_download_cta(item, "download-btn of-primary-cta")}<a class="download-btn download-btn-secondary" href="{esc(tutorial)}">Tutorial de instalación</a></div></header><figure class="of-cover"><img src="{esc(option_image(item))}" alt="Portada de {esc(page_title)}" width="1440" height="810" loading="eager" onerror="this.onerror=null;this.src='img/logo.webp'"></figure><div class="of-article-layout"><div class="of-article-body"><nav class="of-toc" aria-label="Índice del artículo"><strong>En este artículo</strong><div>{toc}</div></nav>{f'<section class="of-article-section of-intro" id="introduccion"><p>{esc(intro)}</p></section>' if intro else ''}{highlights_html}{render_list_section('contenido', 'Qué incluye esta versión', item.get('features'))}{render_list_section('novedades', 'Novedades de la versión', item.get('changes'))}{league_team_html}{gallery_html}{f'<section class="of-article-section" id="compatibilidad"><span class="of-section-kicker">Antes de instalar</span><h2>Compatibilidad</h2><p>{esc(item.get("compatibility"))}</p></section>' if item.get('compatibility') else ''}{render_list_section('instalacion', 'Instalación', item.get('installation_notes'), 'of-number-list')}{render_download_section(item)}{issues_html}{faq_html}</div><aside class="of-info-card"><span class="of-section-kicker">Información</span><dl><div><dt>Versión</dt><dd>{esc(item.get('version') or '—')}</dd></div><div><dt>Fecha</dt><dd>{esc(format_date(date_value) or '—')}</dd></div><div><dt>Plataformas</dt><dd>{esc(platform or '—')}</dd></div><div><dt>Temporada</dt><dd>{esc(item.get('season') or '—')}</dd></div>{size_row}<div><dt>Partes</dt><dd>{len(parts) if parts else '—'}</dd></div></dl>{sidebar_cta}<a class="of-sidebar-link" href="{esc(tutorial)}">Ver tutorial de instalación</a></aside></div></article>{render_related(item, downloads)}<section data-laqp-comments data-page-type="download" data-page-id="{esc(option_slug(item))}"></section><dialog class="of-lightbox" id="of-lightbox"><button type="button" aria-label="Cerrar galería">×</button><img src="" alt="Vista ampliada de la galería del Option File"></dialog>'''
    return replace_marked(source, "DOWNLOADS", content)


def render_download_parts_page(shell: str, item: dict) -> str:
    title = option_title(item)
    platform = option_platform_label(item)
    parts = download_parts(item)
    total_size = str(item.get("total_size") or "").strip()
    summary = f"{platform} · {len(parts)} partes" + (f" · {total_size}" if total_size else "")
    rows = "".join(f'''<li><div><span>Archivo {number:02d}</span><strong>{esc(part.get('name') or f'Parte {number}')}</strong>{f'<small>{esc(part.get("size"))}</small>' if part.get('size') else ''}</div><a class="download-btn" href="{esc(part.get('url'))}" target="_blank" rel="noopener noreferrer">Descargar</a></li>''' for number, part in enumerate(parts, 1))
    tutorial = str(item.get("tutorial") or "/tutorials.html")
    source = prepare_download_shell(shell)
    source = set_meta(source, title=f"Descargar {title} — {platform} | LAqP", description=f"Descargá las {len(parts)} partes de {title} para {platform}. Todos los archivos son necesarios.", canonical=f"{SITE_URL}{option_download_url(item)}", image=f"{SITE_URL}/{quote(option_image(item), safe='/')}")
    content = f'''<nav class="breadcrumbs of-breadcrumbs" aria-label="Breadcrumb"><a href="/index.html">Inicio</a><a href="/downloads.html">Option Files</a><a href="{esc(option_file_url(item))}">{esc(title)}</a><span>Descargar</span></nav><section class="of-parts-page"><header><span class="of-section-kicker">Descargar</span><h1>{esc(title)}</h1><p>{esc(summary)}</p></header><div class="of-parts-layout"><section class="of-parts-panel" aria-labelledby="parts-title"><div class="of-parts-warning"><strong>Descargá todas las partes</strong><p>Guardalas juntas y no cambies sus nombres. Cuando estén completas, iniciá la extracción desde la Parte 1.</p></div><div class="of-parts-heading"><div><span>Archivos</span><h2 id="parts-title">{len(parts)} partes de descarga</h2></div>{f'<strong>{esc(total_size)} en total</strong>' if total_size else ''}</div><ol class="of-parts-list">{rows}</ol></section><aside class="of-parts-help"><span class="of-section-kicker">¿Primera vez?</span><h2>Instalación paso a paso</h2><p>Revisá el tutorial antes de reemplazar archivos o datos editados.</p><a class="download-btn" href="{esc(tutorial)}">Abrir tutorial</a><a class="download-btn download-btn-secondary" href="{esc(option_file_url(item))}">Volver al artículo</a></aside></div></section>'''
    return replace_marked(source, "DOWNLOADS", content)


def render_legacy_download_redirect(shell: str, item: dict) -> str:
    target = option_file_url(item)
    source = prepare_download_shell(shell)
    platform = option_platform_label(item)
    source = set_meta(source, title=f"Redirección: {option_title(item)} — {platform} | LAqP", description=f"La dirección anterior de {option_title(item)} para {platform} ahora lleva a su artículo actualizado.", canonical=f"{SITE_URL}{target}")
    source = source.replace("</head>", f'<meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="0; url={esc(target)}"><script>location.replace({json.dumps(target)});</script></head>', 1)
    content = f'<section class="of-legacy-redirect"><h1>{esc(option_title(item))}</h1><p>Esta página cambió de dirección.</p><a class="download-btn" href="{esc(target)}">Abrir el artículo actualizado</a></section>'
    return replace_marked(source, "DOWNLOADS", content)


def tutorial_thumb(item: dict[str, str]) -> str:
    return item.get("thumbnail") or item.get("image") or (f"https://img.youtube.com/vi/{quote(item.get('video_id',''), safe='')}/hqdefault.jpg" if item.get("video_id") else "img/logo.webp")


def render_tutorials_content(tutorials: list[dict[str, str]], guides: list[dict]) -> str:
    cards = "".join(f'''<article class="tutorial-card"><a class="tutorial-card-thumb-wrap" href="https://www.youtube.com/watch?v={esc(item.get('video_id'))}" target="_blank" rel="noopener noreferrer"><img class="tutorial-card-thumb" src="{esc(tutorial_thumb(item))}" alt="{esc(item.get('titulo'))} - tutorial PES 2018" loading="lazy" width="480" height="270" onerror="this.onerror=null;this.src='img/logo.webp'"><span class="tutorial-play-btn" aria-hidden="true">&#9658;</span></a><div class="tutorial-card-body"><div class="tutorial-card-meta"><span>Video</span>{f'<time datetime="{iso_date(item.get("fecha"))}">{format_date(item.get("fecha"))}</time>' if item.get('fecha') else ''}</div><h3 class="tutorial-card-title">{esc(item.get('titulo'))}</h3><p class="tutorial-card-desc">{esc(item.get('descripcion'))}</p><a class="tutorial-watch-btn" href="https://www.youtube.com/watch?v={esc(item.get('video_id'))}" target="_blank" rel="noopener noreferrer">Ver tutorial</a></div></article>''' for item in tutorials)
    guide_links = "".join(f'<a href="/guia/{quote(str(guide.get("id") or ""), safe="")}/"><strong>{esc(guide.get("title"))}</strong><span>{esc(guide.get("category") or "Guía")}</span></a>' for guide in guides[:6])
    return f'''<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><span>Tutoriales</span></nav><section class="content-hub-hero tutorials-hero"><div class="guides-hero-icon" aria-hidden="true">YT</div><div class="guides-hero-copy"><div class="content-hub-kicker">Videos PES 2018</div><h1>Tutoriales</h1><p>Guías en video para instalar, configurar y editar PES 2018 actualizado: Option Files, caras, kits, herramientas y soluciones.</p></div></section><section class="guides-library-panel tutorials-library-panel"><div class="guides-panel-head"><div><span class="guides-panel-kicker">Biblioteca</span><h2>Tutoriales publicados</h2></div><span class="guides-count-pill">{len(tutorials)} tutoriales</span></div><div class="tutorial-cards-grid">{cards}</div></section><section class="guides-quick-strip"><div class="guides-brand-tile"><img src="img/logo.webp" alt="LAqP" loading="lazy"><div><strong>PES 2018 Actualizado</strong><span>Guías, videos, stats y recursos de edición.</span></div></div>{guide_links}</section>'''


def article_url(guide: dict) -> str:
    return f"/guia/{quote(str(guide.get('id') or ''), safe='')}/"


def article_image(guide: dict) -> str:
    return str(guide.get("image") or "img/logo.webp").lstrip("/")


def render_guide_card(guide: dict) -> str:
    category = guide.get("category") or "Guía"
    return f'''<article class="editorial-card guide-card" data-category="{esc(normalize(category))}"><a class="editorial-card-media" href="{esc(article_url(guide))}"><img src="{esc(article_image(guide))}" alt="{esc(guide.get('title'))}" loading="lazy" width="640" height="360" onerror="this.onerror=null;this.src='img/logo.webp'"></a><div class="editorial-card-body"><div class="editorial-meta guide-card-meta"><span>{esc(guide.get('readTime') or 'Lectura')}</span><span>{esc(category)}</span>{f'<time datetime="{esc(guide.get("date"))}">{format_date(guide.get("date"))}</time>' if guide.get('date') else ''}</div><h2><a href="{esc(article_url(guide))}">{esc(guide.get('title'))}</a></h2><p>{esc(guide.get('description'))}</p><a class="text-link guide-card-link" href="{esc(article_url(guide))}">Ver guía <span aria-hidden="true">&rsaquo;</span></a></div></article>'''


def render_article(guide: dict, guides: list[dict]) -> str:
    title = guide.get("title") or "Guía PES 2018"
    description = guide.get("description") or "Guía de PES 2018 actualizado."
    sections = guide.get("sections") if isinstance(guide.get("sections"), list) else []
    related = [item for item in guides if item.get("id") in (guide.get("related") or [])]
    body = []
    for number, section in enumerate(sections, 1):
        if not isinstance(section, dict):
            continue
        paragraphs = "".join(f"<p>{esc(text)}</p>" for text in (section.get("body") or []))
        list_html = f'<ul>{"".join(f"<li>{esc(item)}</li>" for item in section.get("list", []))}</ul>' if section.get("list") else ""
        figure = section.get("figure") if isinstance(section.get("figure"), dict) else None
        figure_html = ""
        if figure and figure.get("image"):
            figure_html = f'<figure class="article-figure{" article-figure-small" if figure.get("size") == "small" else ""}"><img src="{esc(str(figure.get("image")).lstrip("/"))}" alt="{esc(figure.get("alt") or section.get("heading"))}" loading="lazy" width="960" height="540" onerror="this.onerror=null;this.src=\'img/logo.webp\'">{f"<figcaption>{esc(figure.get("caption"))}</figcaption>" if figure.get("caption") else ""}</figure>'
        body.append(f'<section id="section-{number}"><h2>{esc(section.get("heading"))}</h2>{paragraphs}{list_html}{figure_html}</section>')
    faq = guide.get("faq") if isinstance(guide.get("faq"), list) else []
    faq_html = f'<section id="faq"><h2>Preguntas frecuentes</h2><div class="article-faq">{"".join(f"<details><summary>{esc(item[0])}</summary><p>{esc(item[1])}</p></details>" for item in faq if isinstance(item, list) and len(item) >= 2)}</div></section>' if faq else ""
    schema = {"@context": "https://schema.org", "@type": "Article", "headline": title, "description": description, "image": f"{SITE_URL}/{article_image(guide)}", "datePublished": guide.get("date"), "dateModified": guide.get("date"), "inLanguage": "es", "author": {"@type": "Person", "name": "Agustin Segade", "alternateName": "La Araña Que Pica"}, "publisher": {"@type": "Organization", "name": "LAqP", "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/img/logo.webp"}}, "mainEntityOfPage": f"{SITE_URL}{article_url(guide)}"}
    related_html = "".join(render_guide_card(item) for item in related)
    toc = "".join(f'<a href="#section-{number}">{esc(section.get("heading"))}</a>' for number, section in enumerate(sections, 1) if isinstance(section, dict))
    return f'''<!DOCTYPE html><html lang="es"><head><base href="/">{_hydration_gate()}<script src="js/consent-mode.js"></script><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{esc(title)} | PES 2018 Actualizado</title><meta name="description" content="{esc(description)}"><link rel="canonical" href="{SITE_URL}{esc(article_url(guide))}"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:image" content="{SITE_URL}/{esc(article_image(guide))}"><meta property="og:url" content="{SITE_URL}{esc(article_url(guide))}"><meta property="og:type" content="article"><link rel="stylesheet" href="css/style.css"><link rel="icon" href="img/logo.webp" type="image/webp"><script type="application/ld+json">{json.dumps(schema, ensure_ascii=False, separators=(',', ':'))}</script></head><body><header id="header"><a href="/index.html" class="header-logo-link"><img class="logo" src="img/logo.webp" alt="Logo LAqP"></a><div class="header-title"><span>Academia PES</span> <span>LAqP.website</span></div><nav class="header-nav" aria-label="Menu principal"></nav></header><main class="article-page"><nav class="breadcrumbs"><a href="index.html">Inicio</a><a href="guias.html">Guías</a><span>{esc(guide.get('category') or 'Guía')}</span></nav><article class="long-article"><header class="long-article-header"><div class="editorial-meta"><span>{esc(guide.get('category') or 'Guía')}</span>{f'<time datetime="{esc(guide.get("date"))}">{format_date(guide.get("date"))}</time>' if guide.get('date') else ''}<span>{esc(guide.get('readTime') or 'Lectura')}</span><span>Por Agustin Segade</span></div><h1>{esc(title)}</h1><p>{esc(description)}</p><img src="{esc(article_image(guide))}" alt="{esc(title)}" loading="eager" width="960" height="540" onerror="this.onerror=null;this.src='img/logo.webp'"></header><div class="article-layout"><aside class="article-toc" aria-label="Índice del artículo"><strong>En esta guía</strong>{toc}{'<a href="#faq">FAQ</a>' if faq else ''}</aside><div class="article-body">{''.join(body)}{faq_html}<section><h2>Seguir explorando</h2><div class="seo-link-row"><a href="tutorials.html">Tutoriales</a><a href="downloads.html">Option Files</a><a href="database.html">Base de datos</a><a href="tactics.html">Tácticas</a></div></section></div></div></article>{f'<section class="landing-section article-related"><div class="landing-section-header"><h2 class="landing-section-title">Guías relacionadas</h2><a class="landing-section-link" href="guias.html">Ver todas</a></div><div class="editorial-grid editorial-grid-compact">{related_html}</div></section>' if related_html else ''}</main><script src="js/i18n.js"></script><script src="js/site.js"></script></body></html>\n'''


def render_news_content(downloads: list[dict[str, str]], tutorials: list[dict[str, str]], news: list[dict[str, str]]) -> str:
    items = []
    for row in sorted(news, key=lambda item: item.get("date") or item.get("fecha") or "", reverse=True):
        items.append((row.get("category") or row.get("categoria") or "Canal", row.get("title") or row.get("titulo") or "Novedad", row.get("description") or row.get("descripcion") or "", row.get("date") or row.get("fecha") or "", row.get("link") or row.get("url") or "", "Ver relacionado"))
    for row in [item for item in downloads if item.get("featured") is True or str(item.get("destacado") or "").strip() == "1"][:3]:
        items.append(("Option File", option_title(row), option_value(row, "description", "descripcion", default="Descarga destacada disponible."), option_platform_label(row), option_file_url(row), "Ver descarga"))
    for row in sorted(tutorials, key=lambda item: item.get("fecha", ""), reverse=True)[:2]:
        items.append(("Tutorial", row.get("titulo") or "Nuevo tutorial", row.get("descripcion") or "Contenido nuevo.", row.get("fecha") or "", "tutorials.html", "Ver tutorial"))
    cards = "".join(f'<article class="news-card"><div class="news-card-kicker">{esc(kind)}</div><h2 class="news-card-title">{esc(title)}</h2><p class="news-card-desc">{esc(description)}</p>{f"<div class=\"news-card-meta\">{esc(meta)}</div>" if meta else ""}{f"<a class=\"news-card-link\" href=\"{esc(href)}\">{esc(cta)}</a>" if href else ""}</article>' for kind, title, description, meta, href, cta in items)
    return f'<div id="news-content"><nav class="breadcrumbs"><a href="index.html">Inicio</a><span>Novedades</span></nav><div class="page-section-header"><h1 class="page-section-title">Novedades</h1><p class="page-section-subtitle">Actualizaciones de PES 2018: descargas, tutoriales, plantillas, stats y cambios importantes.</p></div><div class="news-grid">{cards}</div></div>'


def _write_other(result: ExtraResult, output_root: Path, relative: Path, content: str, write) -> None:
    target = safe_target(output_root, relative)
    if write(target, content.rstrip() + "\n"):
        result.other_html += 1
        result.generated_files.append(target)


def render_option_file_sitemap(source: str, downloads: list[dict]) -> str:
    source = re.sub(
        r"\s*<url><loc>https://laqp\.website/option-files/[^<]+</loc><lastmod>[^<]+</lastmod></url>",
        "",
        source,
    )
    today = date.today().isoformat()
    urls = []
    for item in downloads:
        urls.append(option_file_url(item))
        if len(download_parts(item)) > 1:
            urls.append(option_download_url(item))
    entries = "\n".join(f"  <url><loc>{SITE_URL}{esc(url)}</loc><lastmod>{today}</lastmod></url>" for url in urls)
    return source.replace("</urlset>", f"{entries}\n</urlset>", 1)


def generate_content_hubs(project_root: Path, output_root: Path, data, player_paths, team_paths, league_paths, issues, notify, write) -> ExtraResult:
    """Genera las paginas generales que hoy se hidratan con CSV/JSON."""
    result = ExtraResult()
    database_dir = project_root / "database"
    # ``descargas.csv`` es la fuente que se actualiza al publicar nuevos Option
    # Files.  Conservamos los metadatos enriquecidos de option-files.json, pero
    # incorporamos/actualizamos sus filas desde el CSV para no dejar fuera las
    # entradas nuevas cuando el JSON existente todavía no fue regenerado.
    json_downloads = read_json(database_dir / "option-files.json", issues)
    csv_downloads = read_csv(database_dir / "descargas.csv", issues, optional=True)
    json_by_id = {
        str(option_value(item, "id", "ID")).strip(): item
        for item in json_downloads
        if str(option_value(item, "id", "ID")).strip()
    }
    if csv_downloads:
        # El CSV define también el orden: cada fila se conserva en su posición
        # y sólo se enriquecen sus datos con metadatos del JSON existente.
        downloads = []
        for row in csv_downloads:
            row_id = str(option_value(row, "id", "ID")).strip()
            if not row_id:
                continue
            merged = dict(json_by_id.get(row_id, {}))
            merged.update({key: value for key, value in row.items() if value not in (None, "")})
            if "destacado" in row:
                merged["featured"] = normalize(row.get("destacado")) in {"1", "true", "si", "sí", "yes"}
            downloads.append(merged)
    else:
        downloads = list(json_downloads)
    if not json_downloads and not csv_downloads:
        issues.warning("No se encontraron fuentes de Option Files (option-files.json/descargas.csv).")
    downloads = [row for row in downloads if normalize(option_value(row, "status", "estado")) != "oculto"]
    tutorials = read_csv(database_dir / "tutoriales.csv", issues, optional=True)
    guides = read_json(database_dir / "guias.json", issues)
    news = read_csv(database_dir / "novedades.csv", issues, optional=True)
    multipart_count = sum(1 for item in downloads if len(download_parts(item)) > 1)
    stages = 8 + (len(downloads) * 2) + multipart_count + len(guides)
    current = 0

    def status(label: str) -> None:
        nonlocal current
        current += 1
        notify("other", current, stages, f"Generando secciones generales... {current} / {stages} ({label})")

    # Portada
    status("portada")
    source = (project_root / "index.html").read_text(encoding="utf-8-sig")
    featured = [item for item in downloads if item.get("featured") is True or str(item.get("destacado") or "").strip() == "1"]
    _write_other(result, output_root, Path("index.html"), replace_marked(source, "HOME_FEATURED", "".join(render_home_download(item) for item in featured)), write)

    # Portada de base de datos
    status("base de datos")
    source = (project_root / "database.html").read_text(encoding="utf-8-sig")
    memberships = [(team_id, entry) for team_id in data.rosters for entry in data.rosters.get(team_id, []) if team_id in team_paths]
    unique_player_count = len({entry.player.get("Id", "") for _team_id, entry in memberships if entry.player.get("Id", "")})
    top_players = sorted(memberships, key=lambda item: -int(data.corrected_by_player_id.get(item[1].player.get("Id", "")) or item[1].player.get("OverallStats") or 0))[:8]
    players_html = "".join(f'<a class="db-feature-row" href="{esc(player_paths.get((team_id, entry.player.get("Id","")), "#"))}"><img src="img/players/{esc(entry.player.get("Id"))}.webp" alt="Miniface de {esc(entry.player.get("Name"))}" loading="lazy" width="42" height="42" onerror="this.onerror=null;this.src=\'img/players/default.webp\'"><span><strong>{esc(entry.player.get("Name"))}</strong><small>{esc(data.team_by_id[team_id].get("Name"))} · {esc(position_label(entry.player.get("POS")))} · {esc(entry.player.get("Age") or "-")} años</small></span><b>{esc(data.corrected_by_player_id.get(entry.player.get("Id","")) or entry.player.get("OverallStats") or "-")}</b></a>' for team_id, entry in top_players)
    teams = [data.team_by_id[team_id] for team_id in data.rosters if team_id in team_paths]
    teams_html = "".join(f'<a class="team-mini-card" href="{esc(team_paths[team.get("Id")])}"><img src="img/teams/{esc(team.get("Id"))}.webp" alt="Escudo de {esc(team.get("Name"))}" loading="lazy" width="44" height="44" onerror="this.onerror=null;this.src=\'img/teams/default.webp\'"><span>{esc(team.get("Name"))}</span></a>' for team in teams[:8])
    leagues_html = "".join(f'<a class="league-mini-row" href="{esc(league_paths[(league.get("league_id",""), league.get("league_name",""))])}"><span>{esc(league.get("league_name"))}</span><small>{len([x for x in league.get("team_ids","").split(",") if x.strip()])} equipos</small></a>' for league in data.leagues[:8])
    source = replace_marked(source, "PLAYERS", players_html)
    source = replace_marked(source, "TEAMS", teams_html)
    source = replace_marked(source, "LEAGUES", leagues_html)
    source = replace_marked(source, "DATABASE_INTRO", f'<p data-i18n="db.heroDesc">Jugadores, equipos, ligas, stats, medias, plantillas, caras/minifaces y referencias de edición para mantener PES 2018 actualizado con datos modernos.</p><p class="db-static-note" data-i18n="db.staticCount" data-i18n-params=\'{{"memberships":{len(memberships)},"teams":{len(teams)},"leagues":{len(data.leagues)}}}\'>Incluye {len(memberships)} relaciones jugador-equipo, {len(teams)} equipos y {len(data.leagues)} ligas.</p>')
    source = replace_marked(source, "NOSCRIPT_LINKS", '<noscript><p>JavaScript está desactivado. Podés entrar a los listados:</p><ul><li><a href="database/v2/players/">Jugadores</a></li><li><a href="database/v2/teams/">Equipos</a></li><li><a href="database/v2/leagues/">Ligas</a></li></ul></noscript>')
    source = set_text_by_id(source, "stat-players", format_count(unique_player_count))
    source = set_text_by_id(source, "stat-teams", format_count(len(teams)))
    source = set_text_by_id(source, "stat-leagues", format_count(len(data.leagues)))
    source = re.sub(r'<div id="loading-overlay"[^>]*>', '<div id="loading-overlay" style="display:none">', source, count=1)
    _write_other(result, output_root, Path("database.html"), source, write)

    status("tutoriales")
    source = (project_root / "tutorials.html").read_text(encoding="utf-8-sig")
    _write_other(result, output_root, Path("tutorials.html"), replace_marked(source, "TUTORIALS", render_tutorials_content(tutorials, guides)), write)

    status("descargas")
    source = (project_root / "downloads.html").read_text(encoding="utf-8-sig")
    downloads_page = replace_marked(source, "DOWNLOADS", render_downloads_content(downloads))
    _write_other(result, output_root, Path("downloads.html"), downloads_page, write)
    for item in downloads:
        status(f"artículo {option_slug(item)}")
        _write_other(result, output_root, Path("option-files") / option_slug(item) / "index.html", render_download_detail(downloads_page, item, downloads), write)
        if len(download_parts(item)) > 1:
            status(f"partes {option_slug(item)}")
            _write_other(result, output_root, Path("option-files") / option_slug(item) / "descargar" / "index.html", render_download_parts_page(downloads_page, item), write)
        status(f"compatibilidad {option_value(item, 'id', 'ID')}")
        _write_other(result, output_root, Path("download") / str(option_value(item, "id", "ID", default="sin-id")) / "index.html", render_legacy_download_redirect(downloads_page, item), write)

    status("guías")
    source = (project_root / "guias.html").read_text(encoding="utf-8-sig")
    cards = "".join(render_guide_card(guide) for guide in guides)
    source = re.sub(r'(<span class="guides-count-pill" id="guides-count">)[\s\S]*?(</span>)', rf'\g<1>{len(guides)} guías publicadas\g<2>', source, count=1)
    source = re.sub(r'<section class="editorial-grid guides-grid" id="guides-grid" aria-label="Listado de guias">[\s\S]*?</section>', f'<section class="editorial-grid guides-grid" id="guides-grid" aria-label="Listado de guias">{cards}</section>', source, count=1)
    _write_other(result, output_root, Path("guias.html"), source, write)
    for guide in guides:
        if not guide.get("id"):
            continue
        status(f"guía {guide.get('id')}")
        _write_other(result, output_root, Path("guia") / str(guide["id"]) / "index.html", render_article(guide, guides), write)

    status("novedades")
    source = (project_root / "news.html").read_text(encoding="utf-8-sig")
    source = re.sub(r'<div id="loading-overlay"[^>]*>', '<div id="loading-overlay" style="display:none">', source, count=1)
    source = replace_between(source, '<div id="news-content"', "\n  </main>", render_news_content(downloads, tutorials, news))
    _write_other(result, output_root, Path("news.html"), source, write)

    status("rankings")
    source = (project_root / "rankings.html").read_text(encoding="utf-8-sig")
    ranked = []
    seen = set()
    for team_id, entry in memberships:
        pid = entry.player.get("Id", "")
        if pid in seen:
            continue
        seen.add(pid)
        ranked.append((entry.player, data.team_by_id[team_id], team_id))
    ranked.sort(key=lambda item: -int(data.corrected_by_player_id.get(item[0].get("Id", "")) or item[0].get("OverallStats") or 0))
    ranking_rows = "".join(f'<tr><td>{number}</td><td><a href="{esc(player_paths.get((team_id, player.get("Id","")), "#"))}">{esc(player.get("Name"))}</a></td><td><a href="{esc(team_paths.get(team_id, "#"))}">{esc(team.get("Name"))}</a></td><td>{esc(position_label(player.get("POS")))}</td><td>{esc(data.corrected_by_player_id.get(player.get("Id","")) or player.get("OverallStats") or "-")}</td></tr>' for number, (player, team, team_id) in enumerate(ranked[:100], 1))
    fallback = f'<div id="rankings-content"><div class="js-prerender-fallback"><section class="guides-library-panel"><h2>Top 100 jugadores por media</h2><p>Vista inicial pre-renderizada. Los filtros y rankings avanzados se activan con JavaScript.</p><div class="table-responsive"><table class="static-stats-table"><thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>Pos</th><th>Media</th></tr></thead><tbody>{ranking_rows}</tbody></table></div></section></div></div>'
    source = re.sub(r'<div id="rankings-loading"[^>]*>', '<div id="rankings-loading" class="loading-inline" style="display:none">', source, count=1)
    source = re.sub(r'<div id="rankings-content"[^>]*>[\s\S]*?</div>\s*(?=<div class="rankings-bottom-actions")', fallback + "\n", source, count=1)
    if '<div id="rankings-content"></div>' in source:
        source = source.replace('<div id="rankings-content"></div>', fallback, 1)
    _write_other(result, output_root, Path("rankings.html"), source, write)

    status("sitemap de Option Files")
    sitemap_source = (project_root / "sitemap.xml").read_text(encoding="utf-8-sig")
    _write_other(result, output_root, Path("sitemap.xml"), render_option_file_sitemap(sitemap_source, downloads), write)
    return result


def validate_internal_links(project_root: Path, output_root: Path, files: list[Path], issues, notify, link_records: list[tuple[Path, str]] | None = None) -> None:
    href_re = re.compile(r'''href=["']([^"']+)["']''', re.IGNORECASE)
    broken: set[tuple[Path, str]] = set()
    # El inventario de HTML generados evita miles de llamadas is_file(). Los
    # pocos destinos externos al lote (CSS, paginas fijas) se cachean aparte.
    output_inventory = {
        path.relative_to(output_root).as_posix().casefold()
        for path in files
    }
    source_exists_cache: dict[str, bool] = {}
    link_verdict_cache: dict[tuple[str, str], bool] = {}

    def path_exists(path: str, is_directory_url: bool, base: Path) -> bool:
        candidate = (base / path.lstrip("/")).resolve()
        inventory_root = output_root if base == output_root or output_root in candidate.parents else project_root
        try:
            relative = candidate.relative_to(inventory_root).as_posix().casefold().rstrip("/")
        except ValueError:
            return False
        if inventory_root == output_root:
            exists = (f"{relative}/index.html" in output_inventory) if is_directory_url else (relative in output_inventory or f"{relative}/index.html" in output_inventory)
            if exists:
                return True
        source_relative = path.lstrip("/").replace("\\", "/").casefold().rstrip("/")
        cache_key = source_relative + ("/" if is_directory_url else "")
        if cache_key not in source_exists_cache:
            source_candidate = (project_root / source_relative).resolve()
            checks = [source_candidate / "index.html"] if is_directory_url else [source_candidate, source_candidate / "index.html"]
            source_exists_cache[cache_key] = any(item.is_file() for item in checks)
        return source_exists_cache[cache_key]

    records: list[tuple[Path, str, bool]] = []
    if link_records is not None:
        base_cache: dict[Path, bool] = {}
        for file_path, url in link_records:
            if file_path not in base_cache:
                # Las plantillas publicadas de entidades usan base=/; las paginas
                # de raiz se comportan igual. Solo los casos heredados requieren
                # releer una muestra minima para resolver la base.
                base_cache[file_path] = True
            records.append((file_path, url, base_cache[file_path]))
    else:
        for file_path in files:
            try:
                content = file_path.read_text(encoding="utf-8-sig")
            except OSError as error:
                issues.error(f"No se pudo leer {file_path} durante la validación: {error}.")
                continue
            if re.search(r"\{\{[A-Z0-9_]+\}\}", content):
                issues.error(f"Placeholder sin reemplazar en {file_path}.")
            records.extend((file_path, html.unescape(raw).strip(), '<base href="/">' in content) for raw in href_re.findall(content))

    total = len(records)
    for number, (file_path, url, has_root_base) in enumerate(records, 1):
        if number == 1 or number == total or number % 2500 == 0:
            notify("links", number, total, f"Validando enlaces... {number} / {total}")
        try:
            if not url or url.startswith(("#", "http:", "https:", "mailto:", "tel:", "data:", "javascript:")):
                continue
            split = urlsplit(url)
            path = unquote(split.path)
            if not path or any(token in path for token in ("${", "{{")):
                continue
            base = output_root if path.startswith("/") or has_root_base else file_path.parent
            verdict_key = (str(base), path)
            if verdict_key in link_verdict_cache:
                if not link_verdict_cache[verdict_key]:
                    broken.add((file_path, url))
                continue
            candidate = (base / path.lstrip("/")).resolve()
            try:
                candidate.relative_to(output_root.resolve())
            except ValueError:
                continue
            if not path_exists(path, path.endswith("/"), base):
                # Solo se auditan recursos locales que pertenecen al proyecto. Las
                # rutas generadas siempre apuntan a output_root; assets en pruebas
                # temporales se resuelven contra la fuente real.
                if not path_exists(path, path.endswith("/"), project_root):
                    broken.add((file_path, url))
                    link_verdict_cache[verdict_key] = False
                    continue
            link_verdict_cache[verdict_key] = True
        except (OSError, ValueError) as error:
            issues.error(f"No se pudo validar el enlace {file_path} -> {url}: {error}.")
    for file_path, url in sorted(broken, key=lambda item: (str(item[0]), item[1])):
        issues.error(f"Enlace interno roto: {file_path} -> {url}.")
