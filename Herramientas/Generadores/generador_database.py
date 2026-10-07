"""Generador estatico completo de LAqP.website.

La interfaz grafica es la forma de uso principal. Tambien existe un modo CLI para
automatizacion y pruebas:

    python Herramientas/Generadores/generar_web.py --cli

El generador crea o actualiza HTML de jugadores, equipos, ligas, DTs, tacticas y
directorios derivados de datos. No elimina paginas anteriores ni modifica assets.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import logging
import os
import queue
import re
import sys
import threading
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable
from urllib.parse import quote

from pes2018_overall import assign_overall


APP_NAME = "LAqP Website Generator"
DEFAULT_VERSION = "v2"
SITE_URL = "https://laqp.website"

CSV_FILES = {
    "players": "All players exported.csv",
    "teams": "All teams exported.csv",
    "squads": "All squads exported.csv",
    "leagues": "All leagues exported.csv",
    "appearances": "All appeaarances exported.csv",
    "formations": "All formations exported.csv",
    "coaches": "All coachs exported.csv",
    "uniforms": "All uniforms exported.csv",
}

REQUIRED_COLUMNS = {
    "players": {"Id", "Name", "Country", "Height", "Weight", "Age", "Foot", "POS", "OverallStats"},
    "teams": {"Id", "Name", "Country", "Coach", "Stadium", "StadiumName"},
    "squads": {"Id", "Player 1", "Shirt number 1"},
    "leagues": {"league_id", "league_name", "team_ids"},
    "appearances": {"Id"},
    "formations": {"Id"},
    "coaches": {"Id", "Name"},
    "uniforms": {"Id", "Id_Team", "Num_Kit", "Goalkeeper", "Shirt_Base_R", "Pant_R", "Socks_R"},
}

PES_POSITIONS = ("GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF")
POSITION_LABELS = {
    "GK": "PT", "CB": "DEC", "LB": "LI", "RB": "LD", "DMF": "MCD",
    "CMF": "MC", "LMF": "MDI", "RMF": "MDD", "AMF": "MO", "LWF": "EXI",
    "RWF": "EXD", "SS": "SD", "CF": "CD",
}

PLAYER_STATS = (
    ("Attacking Prowess", "Ataque"),
    ("Ball Control", "Control de balón"),
    ("Dribbling", "Drible"),
    ("Low Pass", "Pase al ras"),
    ("Lofted Pass", "Pase bombeado"),
    ("Finishing", "Finalización"),
    ("Place Kicking", "Balón parado"),
    ("Controlled Spin", "Efecto"),
    ("Header", "Cabeza"),
    ("Defensive Prowess", "Defensa"),
    ("Ball Winning", "Recuperación de balón"),
    ("Kicking Power", "Potencia de tiro"),
    ("Speed", "Velocidad"),
    ("Explosive Power", "Fuerza explosiva"),
    ("Body Control", "Control corporal"),
    ("Physical Contact", "Contacto físico"),
    ("Jump", "Salto"),
    ("Goalkeeping", "Capacidad de portero"),
    ("Catching", "Atajar"),
    ("Clearing", "Despejar"),
    ("Reflexes", "Reflejos"),
    ("Coverage", "Alcance"),
    ("Stamina", "Resistencia"),
    ("Weak Foot Usage", "Uso de pie malo"),
    ("Weak Foot Acc.", "Precisión de pie malo"),
    ("Form", "Estabilidad"),
    ("Injury Resistance", "Resistencia a lesiones"),
)

# Es el mismo catalogo de respaldo usado por js/player.js. Los CSV almacenan IDs.
COUNTRY_NAMES = {
    "7": "China", "8": "Hong Kong", "9": "India", "10": "Indonesia", "11": "Irán",
    "12": "Irak", "13": "Japón", "14": "Jordania", "15": "Corea del Norte",
    "16": "Corea del Sur", "17": "Kuwait", "19": "Líbano", "21": "Malasia",
    "26": "Omán", "30": "Qatar", "31": "Arabia Saudita", "32": "Singapur",
    "34": "Siria", "36": "Tailandia", "37": "Emiratos Árabes Unidos", "38": "Vietnam",
    "44": "Argelia", "45": "Angola", "46": "Benín", "48": "Burkina Faso",
    "49": "Burundi", "50": "Camerún", "51": "Cabo Verde",
    "52": "República Centroafricana", "55": "Congo DR", "56": "Costa de Marfil",
    "58": "Egipto", "59": "Guinea Ecuatorial", "62": "Gabón", "63": "Gambia",
    "64": "Ghana", "65": "Guinea", "66": "Guinea-Bisáu", "70": "Libia",
    "71": "Madagascar", "73": "Malí", "74": "Mauritania", "76": "Marruecos",
    "77": "Mozambique", "79": "Níger", "80": "Nigeria", "83": "Senegal",
    "85": "Sierra Leona", "87": "Sudáfrica", "90": "Tanzania", "91": "Togo",
    "92": "Túnez", "94": "Zambia", "95": "Zimbabue", "110": "Canadá",
    "112": "Costa Rica", "115": "República Dominicana", "120": "Haití",
    "121": "Honduras", "122": "Jamaica", "124": "México", "128": "Panamá",
    "129": "Puerto Rico", "133": "Trinidad y Tobago", "135": "Estados Unidos",
    "139": "Surinam", "144": "Argentina", "145": "Bolivia", "146": "Brasil",
    "147": "Chile", "148": "Colombia", "149": "Ecuador", "150": "Paraguay",
    "151": "Perú", "152": "Uruguay", "153": "Venezuela", "162": "Australia",
    "166": "Nueva Zelanda", "189": "Israel", "190": "Turquía", "191": "Albania",
    "193": "Armenia", "194": "Austria", "196": "Bielorrusia", "197": "Bélgica",
    "198": "Bosnia y Herzegovina", "199": "Bulgaria", "200": "Croacia",
    "201": "Chipre", "202": "República Checa", "203": "Dinamarca",
    "204": "Inglaterra", "206": "Islas Feroe", "207": "Finlandia",
    "208": "Francia", "209": "Georgia", "210": "Alemania", "211": "Grecia",
    "212": "Hungría", "213": "Islandia", "214": "Irlanda", "215": "Italia",
    "217": "Letonia", "219": "Lituania", "221": "Macedonia del Norte",
    "223": "Moldavia", "224": "Países Bajos", "225": "Irlanda del Norte",
    "226": "Noruega", "227": "Polonia", "228": "Portugal", "229": "Rumanía",
    "230": "Rusia", "232": "Escocia", "234": "Eslovaquia", "235": "Eslovenia",
    "236": "España", "237": "Suecia", "238": "Suiza", "239": "Ucrania",
    "240": "Uzbekistan", "241": "Gales", "303": "Serbia", "304": "Montenegro",
    "311": "Kosovo",
}

ProgressCallback = Callable[[str, int, int, str], None]


class GenerationFatalError(RuntimeError):
    """Error que impide iniciar o continuar la generacion completa."""


@dataclass
class GenerationResult:
    leagues: int = 0
    teams: int = 0
    players: int = 0
    managers: int = 0
    tactics: int = 0
    other_html: int = 0
    warnings: int = 0
    errors: int = 0
    files_written: int = 0
    files_unchanged: int = 0
    aliases_updated: int = 0
    elapsed_seconds: float = 0.0
    log_path: Path | None = None

    def summary(self) -> str:
        return (
            "Generacion completada\n\n"
            f"Ligas generadas: {self.leagues}\n"
            f"Equipos generados: {self.teams}\n"
            f"Jugadores generados: {self.players}\n"
            f"DTs generados: {self.managers}\n"
            f"Tacticas generadas: {self.tactics}\n"
            f"Otros HTML: {self.other_html}\n"
            f"Advertencias: {self.warnings}\n"
            f"Errores: {self.errors}\n\n"
            f"HTML escritos: {self.files_written}\n"
            f"HTML sin cambios: {self.files_unchanged}\n"
            f"Tiempo: {self.elapsed_seconds:.1f} s"
        )


class IssueLogger:
    def __init__(self, log_path: Path) -> None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        self.path = log_path
        self.warnings = 0
        self.errors = 0
        self._logger = logging.getLogger(f"laqp_generator_{id(self)}")
        self._logger.setLevel(logging.INFO)
        self._logger.propagate = False
        handler = logging.FileHandler(log_path, mode="w", encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", "%Y-%m-%d %H:%M:%S"))
        self._logger.addHandler(handler)
        self._handler = handler

    def info(self, message: str) -> None:
        self._logger.info(message)

    def warning(self, message: str) -> None:
        self.warnings += 1
        self._logger.warning(message)

    def error(self, message: str, *, exc_info: bool = False) -> None:
        self.errors += 1
        self._logger.error(message, exc_info=exc_info)

    def close(self) -> None:
        self._handler.flush()
        self._handler.close()
        self._logger.removeHandler(self._handler)


class SilentIssues:
    """Ignore unrelated export problems during the focused DT build."""

    def info(self, _message: str) -> None:
        pass

    def warning(self, _message: str) -> None:
        pass

    def error(self, _message: str, **_kwargs) -> None:
        pass


class TemplateEngine:
    TOKEN_RE = re.compile(r"\{\{([A-Z0-9_]+)\}\}")

    def __init__(self, template_dir: Path) -> None:
        self.templates: dict[str, str] = {}
        for name in ("player", "team", "league"):
            template_path = template_dir / f"{name}.html"
            if not template_path.is_file():
                raise GenerationFatalError(f"No se encontro la plantilla: {template_path}")
            self.templates[name] = template_path.read_text(encoding="utf-8-sig")

    def render(self, name: str, values: dict[str, object]) -> str:
        template = self.templates[name]

        def replace(match: re.Match[str]) -> str:
            key = match.group(1)
            if key not in values:
                raise GenerationFatalError(f"Falta el valor {key} para la plantilla {name}.html")
            return str(values[key])

        rendered = self.TOKEN_RE.sub(replace, template)
        leftovers = self.TOKEN_RE.findall(rendered)
        if leftovers:
            raise GenerationFatalError(f"Quedaron variables sin resolver en {name}.html: {', '.join(leftovers)}")
        return rendered.rstrip() + "\n"


@dataclass(frozen=True)
class RosterEntry:
    player: dict[str, str]
    shirt_number: str
    slot: int


@dataclass
class GeneratorData:
    players: list[dict[str, str]]
    teams: list[dict[str, str]]
    squads: list[dict[str, str]]
    leagues: list[dict[str, str]]
    appearances: list[dict[str, str]]
    formations: list[dict[str, str]]
    coaches: list[dict[str, str]]
    uniforms: list[dict[str, str]] = field(default_factory=list)
    player_by_id: dict[str, dict[str, str]] = field(default_factory=dict)
    team_by_id: dict[str, dict[str, str]] = field(default_factory=dict)
    squad_by_team_id: dict[str, dict[str, str]] = field(default_factory=dict)
    coach_by_id: dict[str, dict[str, str]] = field(default_factory=dict)
    corrected_by_player_id: dict[str, str] = field(default_factory=dict)
    rosters: dict[str, list[RosterEntry]] = field(default_factory=dict)
    team_leagues: dict[str, list[dict[str, str]]] = field(default_factory=dict)


def escape(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True).replace("&#x27;", "&#39;")


def slugify(value: object, fallback: str = "item") -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.lower().replace("&", " and ")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def validate_version(value: str) -> str:
    version = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", version):
        raise GenerationFatalError(f"Version invalida: {value!r}. Usa nombres como v2, v3 o 2026.")
    return version


def position_label(raw_value: str) -> str:
    key = position_key(raw_value)
    return POSITION_LABELS.get(key, key or "-")


def position_key(raw_value: str) -> str:
    raw = str(raw_value or "").strip()
    if raw.isdigit():
        index = int(raw)
        if 0 <= index < len(PES_POSITIONS):
            return PES_POSITIONS[index]
    return raw


def foot_label(raw_value: str) -> str:
    raw = str(raw_value or "").strip()
    if raw.lower() == "true":
        return "Izquierdo"
    if raw.lower() == "false":
        return "Derecho"
    return raw or "-"


def resource_template_dir(project_root: Path) -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        bundled = Path(getattr(sys, "_MEIPASS")) / "templates"
        if bundled.is_dir():
            return bundled
    return Path(__file__).resolve().parent / "templates"


def looks_like_project(path: Path) -> bool:
    return (path / "database" / CSV_FILES["players"]).is_file() and (path / "css" / "style.css").is_file()


def find_project_root(explicit: str | Path | None = None) -> Path:
    if explicit:
        root = Path(explicit).expanduser().resolve()
        if not looks_like_project(root):
            raise GenerationFatalError(f"La carpeta indicada no parece ser LAqP.website: {root}")
        return root

    starts = [Path.cwd()]
    if getattr(sys, "frozen", False):
        starts.append(Path(sys.executable).resolve().parent)
    else:
        starts.append(Path(__file__).resolve().parent)

    checked: set[Path] = set()
    for start in starts:
        for candidate in (start, *start.parents):
            candidate = candidate.resolve()
            if candidate in checked:
                continue
            checked.add(candidate)
            if looks_like_project(candidate):
                return candidate
    raise GenerationFatalError(
        "No se encontro la raiz de LAqP.website. Ejecuta el programa desde el repositorio o coloca el EXE dentro de el."
    )


def _detect_delimiter(sample: str) -> str:
    first_line = sample.splitlines()[0] if sample.splitlines() else ""
    if first_line.count(";") >= first_line.count(","):
        return ";"
    return ","


def read_csv_file(
    path: Path,
    required_columns: set[str],
    issues: IssueLogger,
    *,
    optional: bool = False,
) -> list[dict[str, str]]:
    if not path.is_file():
        message = f"CSV {'opcional ' if optional else ''}inexistente: {path.name}"
        if optional:
            issues.warning(message)
            return []
        raise GenerationFatalError(message)

    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            sample = handle.read(8192)
            handle.seek(0)
            reader = csv.DictReader(handle, delimiter=_detect_delimiter(sample))
            headers = [str(header or "").strip() for header in (reader.fieldnames or [])]
            missing = sorted(required_columns.difference(headers))
            if missing:
                raise GenerationFatalError(
                    f"{path.name} no contiene las columnas requeridas: {', '.join(missing)}"
                )

            rows: list[dict[str, str]] = []
            for line_number, raw in enumerate(reader, start=2):
                if None in raw:
                    issues.error(f"{path.name}:{line_number}: hay mas valores que columnas; se conservaron los campos conocidos.")
                row = {
                    str(key or "").strip(): str(value or "").strip()
                    for key, value in raw.items()
                    if key is not None
                }
                if any(row.values()):
                    rows.append(row)
            issues.info(f"CSV cargado: {path.name} ({len(rows)} filas, {len(headers)} columnas).")
            return rows
    except UnicodeDecodeError as error:
        raise GenerationFatalError(f"{path.name} no esta codificado como UTF-8: {error}") from error
    except csv.Error as error:
        raise GenerationFatalError(f"No se pudo leer {path.name}: {error}") from error


def unique_index(
    rows: Iterable[dict[str, str]],
    key: str,
    label: str,
    issues: IssueLogger,
) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for row_number, row in enumerate(rows, start=2):
        item_id = str(row.get(key, "")).strip()
        if not item_id:
            issues.error(f"{label}: fila {row_number} sin {key}; se omitio.")
            continue
        if item_id in result:
            issues.error(f"{label}: ID duplicado {item_id}; se conserva la primera fila.")
            continue
        result[item_id] = row
    return result


def load_data(database_dir: Path, issues: IssueLogger) -> GeneratorData:
    rows: dict[str, list[dict[str, str]]] = {}
    optional_names = {"appearances", "formations", "coaches", "uniforms"}
    for key, filename in CSV_FILES.items():
        source_path = database_dir / filename
        if key == "uniforms":
            source_path = (
                database_dir.parent
                / "Herramientas"
                / "Recursos"
                / "Base-de-datos"
                / filename
            )
        rows[key] = read_csv_file(
            source_path,
            REQUIRED_COLUMNS[key],
            issues,
            optional=key in optional_names,
        )

    data = GeneratorData(**rows)
    for player in data.players:
        try:
            overall = assign_overall(player)
        except (KeyError, TypeError, ValueError) as error:
            player_id = player.get("Id", "?")
            issues.error(f"No se pudo calcular el OVR PES 2018 del jugador {player_id}: {error}.")
            continue
        data.corrected_by_player_id[player.get("Id", "")] = str(overall)
    data.player_by_id = unique_index(data.players, "Id", CSV_FILES["players"], issues)
    data.team_by_id = unique_index(data.teams, "Id", CSV_FILES["teams"], issues)
    data.squad_by_team_id = unique_index(data.squads, "Id", CSV_FILES["squads"], issues)
    data.coach_by_id = unique_index(data.coaches, "Id", CSV_FILES["coaches"], issues) if data.coaches else {}

    league_ids: dict[str, list[str]] = {}
    for league in data.leagues:
        league_id = league.get("league_id", "").strip()
        league_name = league.get("league_name", "").strip()
        league_ids.setdefault(league_id, []).append(league_name)
        seen_team_ids: set[str] = set()
        for raw_team_id in league.get("team_ids", "").split(","):
            team_id = raw_team_id.strip()
            if not team_id:
                continue
            if team_id in seen_team_ids:
                issues.warning(f"Liga {league_name} ({league_id}): equipo {team_id} repetido en team_ids.")
                continue
            seen_team_ids.add(team_id)
            data.team_leagues.setdefault(team_id, []).append(league)

    for league_id, names in league_ids.items():
        if len(names) > 1:
            issues.warning(
                f"ID de liga duplicado {league_id}: {', '.join(names)}. Se distinguen las paginas por nombre y slug."
            )

    # Primero se validan las referencias declaradas por las ligas. Despues se
    # construyen planteles para TODOS los equipos validos del CSV, incluidos los
    # que aun no fueron agregados a una competicion publicada.
    for team_id, leagues in data.team_leagues.items():
        team = data.team_by_id.get(team_id)
        if not team:
            issues.error(
                f"Equipo inexistente {team_id}, referenciado por: {', '.join(l.get('league_name', '') for l in leagues)}."
            )
            continue
        if not team.get("Name", "").strip() or team.get("Name", "").strip() == "-":
            issues.error(f"Equipo {team_id} sin nombre valido; no se generara su pagina.")
            continue

    referenced_player_ids: set[str] = set()
    for team_id, team in data.team_by_id.items():
        if not team.get("Name", "").strip() or team.get("Name", "").strip() == "-":
            continue
        squad = data.squad_by_team_id.get(team_id)
        roster: list[RosterEntry] = []
        if not squad:
            issues.warning(f"Equipo {team_id} ({team['Name']}) sin plantel en {CSV_FILES['squads']}.")
        else:
            seen_players: set[str] = set()
            for slot in range(1, 33):
                player_id = squad.get(f"Player {slot}", "").strip()
                if not player_id or player_id == "0":
                    continue
                if player_id in seen_players:
                    issues.warning(f"Equipo {team_id}: jugador {player_id} repetido en el plantel.")
                    continue
                seen_players.add(player_id)
                player = data.player_by_id.get(player_id)
                if not player:
                    issues.error(f"Equipo {team_id}: jugador inexistente {player_id} en el slot {slot}.")
                    continue
                if not player.get("Name", "").strip():
                    issues.warning(f"Jugador {player_id} sin nombre; se usara 'Jugador {player_id}'.")
                roster.append(RosterEntry(player, squad.get(f"Shirt number {slot}", "").strip(), slot))
                referenced_player_ids.add(player_id)

            reported_total = squad.get("Total Players", "").strip()
            if reported_total.isdigit() and int(reported_total) != len(roster):
                issues.warning(
                    f"Equipo {team_id}: Total Players={reported_total}, pero se detectaron {len(roster)} referencias validas."
                )
        data.rosters[team_id] = roster

    unassigned_count = len(set(data.player_by_id).difference(referenced_player_ids))
    if unassigned_count:
        issues.warning(
            f"Hay {unassigned_count} jugadores que no pertenecen a ningun plantel exportado; no existe una URL de equipo fiable y no se generan paginas para ellos."
        )

    return data


def corrected_overall(data: GeneratorData, player: dict[str, str]) -> str:
    """Compatibilidad interna: devuelve siempre el OVR calculado, no overrides."""
    return data.corrected_by_player_id.get(player.get("Id", ""), "") or player.get("OverallStats", "") or "-"


def builder_database_version(project_root: Path) -> str:
    """Version corta y estable derivada de las fuentes reales del Builder."""
    digest = hashlib.sha256()
    for key in ("players", "teams", "squads", "formations", "leagues"):
        path = project_root / "database" / CSV_FILES[key]
        if not path.is_file():
            continue
        digest.update(path.name.encode("utf-8"))
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    formula_path = Path(__file__).resolve().with_name("pes2018_overall.py")
    if formula_path.is_file():
        digest.update(formula_path.name.encode("utf-8"))
        digest.update(formula_path.read_bytes())
    return digest.hexdigest()[:12]


def build_builder_index(project_root: Path, data: GeneratorData) -> dict[str, object]:
    """Crea el indice liviano, deduplicado por Player.Id, desde los CSV maestros."""
    public_team_ids = set(data.team_leagues)
    team_memberships: dict[str, list[str]] = {}
    team_player_ids: dict[str, list[str]] = {}

    for team_id, roster in data.rosters.items():
        if team_id not in public_team_ids:
            continue
        for entry in roster:
            player_id = entry.player.get("Id", "").strip()
            if not player_id:
                continue
            memberships = team_memberships.setdefault(player_id, [])
            if team_id not in memberships:
                memberships.append(team_id)
            team_player_ids.setdefault(team_id, []).append(player_id)

    # The formation export is the canonical source of a club's actual XI.  Its
    # player indices are zero-based references to the 32 positions in the squad
    # export; keeping this relation here avoids guessing starters from ratings.
    formations_by_team = {row.get("Id", "").strip(): row for row in data.formations}

    def default_lineup(team_id: str) -> dict[str, object] | None:
        formation = formations_by_team.get(team_id)
        squad = data.squad_by_team_id.get(team_id)
        if not formation or not squad:
            return None
        starters: list[dict[str, object]] = []
        starter_ids: set[str] = set()
        for number in range(1, 12):
            try:
                squad_index = int(formation.get(f"Indice Jugador {number}", ""))
            except (TypeError, ValueError):
                return None
            if not 0 <= squad_index < 32:
                return None
            player_id = squad.get(f"Player {squad_index + 1}", "").strip()
            if not player_id or player_id == "0" or player_id in starter_ids or player_id not in data.player_by_id:
                return None
            try:
                depth = float(formation.get(f"Ubicacion X{number} F1", ""))
                width = float(formation.get(f"Ubicacion Y{number} F1", ""))
            except (TypeError, ValueError):
                return None
            raw_position = formation.get(f"Posicion {number} F1", "").strip()
            position = PES_POSITIONS[int(raw_position)] if raw_position.isdigit() and int(raw_position) < len(PES_POSITIONS) else ""
            # Same conversion used by team.js: source X is depth from own goal;
            # source Y is width.  The Builder stores responsive percentages.
            starters.append({
                "playerId": player_id,
                "position": position,
                "x": round(max(5, min(95, 5 + width / 104 * 90)), 1),
                "y": round(max(5, min(95, 7 + (1 - depth / 52) * 86)), 1),
                "sourceSlot": squad_index,
            })
            starter_ids.add(player_id)
        bench: list[str] = []
        for slot in range(1, 33):
            player_id = squad.get(f"Player {slot}", "").strip()
            if player_id and player_id != "0" and player_id not in starter_ids and player_id not in bench:
                bench.append(player_id)
            if len(bench) == 12:
                break
        return {"xi": starters, "benchPlayerIds": bench}

    teams: list[dict[str, object]] = []
    for team_id in public_team_ids:
        team = data.team_by_id.get(team_id)
        if not team or team.get("Name", "").strip() in {"", "-"}:
            continue
        league_ids = [league.get("league_id", "") for league in data.team_leagues.get(team_id, [])]
        item = {
            "id": team_id,
            "name": team.get("Name", "").strip(),
            "type": int(team.get("Type", "0")) if team.get("Type", "0").isdigit() else 0,
            "leagueIds": [value for value in league_ids if value],
            "crest": f"img/teams/{team_id}.webp" if asset_exists(project_root, "teams", team_id) else "img/teams/default.webp",
            "playerIds": team_player_ids.get(team_id, []),
        }
        lineup = default_lineup(team_id)
        if lineup:
            item["defaultLineup"] = lineup
        teams.append(item)
    teams.sort(key=lambda item: (str(item["name"]).casefold(), str(item["id"])))

    players: list[dict[str, object]] = []
    for player_id, memberships in team_memberships.items():
        player = data.player_by_id.get(player_id)
        if not player:
            continue
        raw_position = player.get("POS", "").strip()
        primary = PES_POSITIONS[int(raw_position)] if raw_position.isdigit() and int(raw_position) < len(PES_POSITIONS) else raw_position
        secondary = [
            position for position in PES_POSITIONS
            if position != primary and str(player.get(position, "0")).strip() in {"1", "2"}
        ]
        club_ids = [team_id for team_id in memberships if data.team_by_id.get(team_id, {}).get("Type") != "2"]
        national_team_ids = [team_id for team_id in memberships if data.team_by_id.get(team_id, {}).get("Type") == "2"]
        players.append({
            "id": player_id,
            "name": player.get("Name", "").strip() or f"Jugador {player_id}",
            "teamIds": memberships,
            "clubIds": club_ids,
            "nationalTeamIds": national_team_ids,
            "clubId": club_ids[0] if club_ids else "",
            "position": primary or "",
            "secondaryPositions": secondary,
            "overall": int(corrected_overall(data, player)) if corrected_overall(data, player).isdigit() else None,
            "age": int(player["Age"]) if player.get("Age", "").isdigit() else None,
            "countryId": player.get("Country", "").strip(),
            "miniface": f"img/players/{player_id}.webp" if asset_exists(project_root, "players", player_id) else "img/players/default.webp",
            "pes2018Miniface": (
                f"img/pes_original_minifaces/{player_id}.webp"
                if (project_root / "img" / "pes_original_minifaces" / f"{player_id}.webp").is_file()
                else ""
            ),
        })
    players.sort(key=lambda item: (str(item["name"]).casefold(), str(item["id"])))

    leagues = [
        {"id": row.get("league_id", "").strip(), "name": row.get("league_name", "").strip()}
        for row in data.leagues
        if row.get("league_id", "").strip() and row.get("league_name", "").strip()
    ]
    leagues.sort(key=lambda item: (str(item["name"]).casefold(), str(item["id"])))

    return {
        "schemaVersion": 1,
        "databaseVersion": builder_database_version(project_root),
        "positions": list(PES_POSITIONS),
        "leagues": leagues,
        "teams": teams,
        "players": players,
    }


def build_content_index(project_root: Path, data: GeneratorData, version: str = DEFAULT_VERSION) -> dict[str, object]:
    """Relaciona IDs usados por comentarios/guardados con títulos y URLs reales."""
    # Reutilizar exactamente la misma resolución que genera las páginas de
    # Option Files evita que el índice y la URL publicada puedan divergir.
    from generador_secciones import option_slug, option_title

    items: dict[str, dict[str, str]] = {}
    public_team_ids = set(data.team_leagues)
    team_paths = {
        team_id: f"/team/{version}/{slugify(team.get('Name'), 'equipo')}-{quote(team_id)}/"
        for team_id, team in data.team_by_id.items()
        if team_id in public_team_ids and team.get("Name", "").strip() not in {"", "-"}
    }
    for team_id, url in team_paths.items():
        items[f"team:{team_id}"] = {
            "title": data.team_by_id[team_id].get("Name", "").strip() or f"Equipo {team_id}",
            "url": url,
        }

    player_candidates: dict[str, list[tuple[int, str, str]]] = {}
    for team_id, roster in data.rosters.items():
        if team_id not in team_paths:
            continue
        team_type = data.team_by_id.get(team_id, {}).get("Type", "0")
        priority = 1 if team_type == "2" else 0
        for entry in roster:
            player_id = entry.player.get("Id", "").strip()
            if not player_id:
                continue
            name = entry.player.get("Name", "").strip() or f"Jugador {player_id}"
            url = f"/player/{version}/{quote(team_id)}/{slugify(name, 'jugador')}-{quote(player_id)}/"
            player_candidates.setdefault(player_id, []).append((priority, team_id, url))
    for player_id, candidates in player_candidates.items():
        _priority, _team_id, url = sorted(candidates, key=lambda row: (row[0], row[1]))[0]
        player = data.player_by_id.get(player_id, {})
        items[f"player:{player_id}"] = {
            "title": player.get("Name", "").strip() or f"Jugador {player_id}",
            "url": url,
        }

    issues = SilentIssues()
    tactics = read_csv_file(project_root / "database" / "tacticas.csv", set(), issues, optional=True)
    for tactic in tactics:
        tactic_id = tactic.get("id", "").strip()
        if not tactic_id:
            continue
        title = " ".join(part for part in (tactic.get("equipo", "").strip(), tactic.get("temporada", "").strip()) if part)
        items[f"tactic:{tactic_id}"] = {
            "title": title or f"Táctica {tactic_id}",
            "url": f"/tactics/{quote(tactic_id, safe='')}/",
        }

    json_path = project_root / "database" / "option-files.json"
    json_downloads = json.loads(json_path.read_text(encoding="utf-8-sig")) if json_path.is_file() else []
    json_by_id = {str(row.get("id", "")).strip(): row for row in json_downloads if str(row.get("id", "")).strip()}
    csv_downloads = read_csv_file(project_root / "database" / "descargas.csv", set(), issues, optional=True)
    downloads: list[dict[str, object]] = []
    if csv_downloads:
        for row in csv_downloads:
            row_id = str(row.get("id") or row.get("ID") or "").strip()
            if not row_id:
                continue
            merged = dict(json_by_id.get(row_id, {}))
            merged.update({key: value for key, value in row.items() if value not in (None, "")})
            downloads.append(merged)
    else:
        downloads = list(json_downloads)
    for download in downloads:
        status = str(download.get("status") or download.get("estado") or "").strip().casefold()
        if status == "oculto":
            continue
        slug = option_slug(download)
        title = option_title(download).strip()
        items[f"download:{slug}"] = {"title": title, "url": f"/option-files/{quote(slug, safe='')}/"}

    return {"schemaVersion": 1, "items": dict(sorted(items.items()))}


def player_squad_context(data: GeneratorData, team_id: str, entry: RosterEntry,
                         formation: dict[str, str] | None,
                         player_paths: dict[tuple[str, str], str]) -> dict[str, object]:
    """Use the exported squad slots and F1 starter indices, never roster order."""
    roster = data.rosters.get(team_id, [])
    ranked = sorted(roster, key=lambda item: (-int(corrected_overall(data, item.player))
                    if corrected_overall(data, item.player).isdigit() else 0, item.slot))
    player_id = entry.player.get("Id", "")
    pos = entry.player.get("POS", "")
    same_pos = [item for item in ranked if item.player.get("POS", "") == pos]
    starters: set[int] = set()
    if formation:
        for number in range(1, 12):
            try:
                slot_index = int(formation.get(f"Indice Jugador {number}", ""))
            except (TypeError, ValueError):
                continue
            if 0 <= slot_index < 32:
                starters.add(slot_index + 1)
    competition = []
    for peer in same_pos:
        peer_id = peer.player.get("Id", "")
        if peer_id == player_id:
            continue
        competition.append({"name": peer.player.get("Name", ""), "position": position_key(pos),
                            "overall": corrected_overall(data, peer.player),
                            "url": player_paths.get((team_id, peer_id), "")})
        if len(competition) == 3:
            break
    return {"rank": next((index for index, item in enumerate(ranked, 1)
                          if item.player.get("Id") == player_id), None),
            "positionRank": next((index for index, item in enumerate(same_pos, 1)
                                 if item.player.get("Id") == player_id), None),
            "position": position_key(pos),
            "starter": entry.slot in starters if len(starters) >= 7 else None,
            "competition": competition}


def team_average(data: GeneratorData, team_id: str) -> str:
    values: list[int] = []
    for entry in data.rosters.get(team_id, []):
        raw = corrected_overall(data, entry.player)
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            values.append(value)
    values.sort(reverse=True)
    top = values[:16]
    return str(round(sum(top) / len(top))) if top else "-"


def asset_exists(project_root: Path, kind: str, item_id: str) -> bool:
    return (project_root / "img" / kind / f"{item_id}.webp").is_file()


def scan_existing_aliases(project_root: Path, version: str) -> tuple[
    dict[str, set[str]], dict[str, set[str]], dict[tuple[str, str], set[str]]
]:
    league_aliases: dict[str, set[str]] = {}
    team_aliases: dict[str, set[str]] = {}
    player_aliases: dict[tuple[str, str], set[str]] = {}
    suffix_re = re.compile(r"-(\d+)$")

    league_root = project_root / "league" / version
    if league_root.is_dir():
        for directory in league_root.iterdir():
            match = suffix_re.search(directory.name) if directory.is_dir() else None
            if match:
                league_aliases.setdefault(match.group(1), set()).add(directory.name)

    team_root = project_root / "team" / version
    if team_root.is_dir():
        for directory in team_root.iterdir():
            match = suffix_re.search(directory.name) if directory.is_dir() else None
            if match:
                team_aliases.setdefault(match.group(1), set()).add(directory.name)

    player_root = project_root / "player" / version
    if player_root.is_dir():
        for team_dir in player_root.iterdir():
            if not team_dir.is_dir():
                continue
            team_id = team_dir.name
            for directory in team_dir.iterdir():
                match = suffix_re.search(directory.name) if directory.is_dir() else None
                if match:
                    player_aliases.setdefault((team_id, match.group(1)), set()).add(directory.name)

    return league_aliases, team_aliases, player_aliases


def safe_output_file(output_root: Path, relative_dir: Path) -> Path:
    root = output_root.resolve()
    target = (root / relative_dir / "index.html").resolve()
    try:
        target.relative_to(root)
    except ValueError as error:
        raise GenerationFatalError(f"Ruta de salida insegura: {target}") from error
    return target


def write_html(file_path: Path, content: str) -> bool:
    """Escribe atomicamente. Devuelve True si el contenido cambio."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if file_path.is_file():
        try:
            if file_path.read_text(encoding="utf-8-sig") == content:
                return False
        except (OSError, UnicodeError):
            pass

    temporary = file_path.with_name(f".{file_path.name}.{os.getpid()}.tmp")
    last_error: OSError | None = None
    for attempt in range(8):
        try:
            with temporary.open("w", encoding="utf-8", newline="\n") as handle:
                handle.write(content)
            os.replace(temporary, file_path)
            return True
        except OSError as error:
            last_error = error
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
            if attempt < 7:
                time.sleep(0.08 * (attempt + 1))
    assert last_error is not None
    raise last_error


def league_key(league: dict[str, str]) -> tuple[str, str]:
    return league.get("league_id", ""), league.get("league_name", "")


class DatabaseGenerator:
    def __init__(
        self,
        project_root: Path,
        *,
        output_root: Path | None = None,
        version: str = DEFAULT_VERSION,
        progress: ProgressCallback | None = None,
    ) -> None:
        self.project_root = project_root.resolve()
        self.output_root = (output_root or project_root).resolve()
        self.version = validate_version(version)
        self.progress = progress or (lambda _stage, _current, _total, _message: None)
        self.issues = IssueLogger(
            self.project_root / "Herramientas" / "Salidas" / "logs" / "generacion.log"
        )
        self.templates = TemplateEngine(resource_template_dir(self.project_root))
        self.result = GenerationResult(log_path=self.issues.path)
        self.canonical_files: list[tuple[Path, str]] = []
        self.generated_html_files: list[Path] = []
        self.generated_links: list[tuple[Path, str]] = []

    def _notify(self, stage: str, current: int, total: int, message: str) -> None:
        self.progress(stage, current, total, message)

    def _record_write(self, file_path: Path, content: str, *, alias: bool = False) -> bool:
        try:
            changed = write_html(file_path, content)
            if changed:
                self.result.files_written += 1
            else:
                self.result.files_unchanged += 1
            if alias:
                self.result.aliases_updated += 1
            if file_path.suffix.lower() == ".html" and file_path not in self.generated_html_files:
                self.generated_html_files.append(file_path)
                self.generated_links.extend(
                    (file_path, html.unescape(url).strip())
                    for url in re.findall(r'''href=["']([^"']+)["']''', content, flags=re.IGNORECASE)
                )
                if re.search(r"\{\{[A-Z0-9_]+\}\}", content):
                    self.issues.error(f"Placeholder sin reemplazar en {file_path}.")
            return True
        except Exception as error:  # cada pagina falla de forma independiente
            self.issues.error(f"Error generando {file_path}: {error}", exc_info=True)
            return False

    def _validate_assets(self, data: GeneratorData) -> None:
        valid_team_ids = {
            team_id for team_id in data.rosters
            if team_id in data.team_by_id and data.team_by_id[team_id].get("Name", "").strip() not in {"", "-"}
        }
        referenced_player_ids = {
            entry.player.get("Id", "") for team_id in valid_team_ids for entry in data.rosters.get(team_id, [])
        }
        for team_id in sorted(valid_team_ids, key=lambda value: (len(value), value)):
            if not asset_exists(self.project_root, "teams", team_id):
                self.issues.warning(f"Imagen inexistente: img/teams/{team_id}.webp (se usara default.webp).")
        for player_id in sorted(referenced_player_ids, key=lambda value: (len(value), value)):
            if player_id and not asset_exists(self.project_root, "players", player_id):
                self.issues.warning(f"Imagen inexistente: img/players/{player_id}.webp (se usara default.webp).")
        seen_league_images: set[str] = set()
        for league in data.leagues:
            league_id = league.get("league_id", "")
            if league_id and league_id not in seen_league_images:
                seen_league_images.add(league_id)
                if not asset_exists(self.project_root, "leagues", league_id):
                    self.issues.warning(f"Imagen inexistente: img/leagues/{league_id}.webp (se usara default.webp).")

    def _generate_builder_index(self, data: GeneratorData) -> None:
        target = self.output_root / "database" / "builder-player-index.json"
        content = json.dumps(
            build_builder_index(self.project_root, data),
            ensure_ascii=False,
            separators=(",", ":"),
        ) + "\n"
        changed = write_html(target, content)
        if changed:
            self.result.files_written += 1
        else:
            self.result.files_unchanged += 1
        self.issues.info(f"Indice del Builder {'actualizado' if changed else 'sin cambios'}: {target}.")

    def _generate_content_index(self, data: GeneratorData) -> None:
        target = self.output_root / "database" / "content-index.json"
        content = json.dumps(
            build_content_index(self.project_root, data, self.version),
            ensure_ascii=False,
            separators=(",", ":"),
        ) + "\n"
        changed = write_html(target, content)
        if changed:
            self.result.files_written += 1
        else:
            self.result.files_unchanged += 1
        self.issues.info(f"Indice de contenido {'actualizado' if changed else 'sin cambios'}: {target}.")

    def run(self, *, teams_only: bool = False, missing_only: bool = False,
            builder_index_only: bool = False, managers_only: bool = False,
            tactics_only: bool = False, content_index_only: bool = False,
            refresh_coaches: bool = False, refresh_coach_ids: tuple[str, ...] = ()) -> GenerationResult:
        started = time.perf_counter()
        try:
            self.issues.info(f"Inicio de generacion. Proyecto={self.project_root}; salida={self.output_root}; version={self.version}.")
            try:
                from generar_traducciones_pes import generate_pes2018_translations
                translation_target = generate_pes2018_translations(self.project_root)
                self.issues.info(f"Traducciones oficiales PES 2018 actualizadas: {translation_target}.")
            except FileNotFoundError as error:
                if not (self.project_root / "js" / "pes2018-translations.js").is_file():
                    raise GenerationFatalError(str(error)) from error
                self.issues.warning(f"No se regeneraron las traducciones PES 2018: {error}")
            self._notify("loading", 0, 1, "Leyendo CSV...")
            data = load_data(
                self.project_root / "database",
                SilentIssues() if (managers_only or tactics_only) else self.issues,
            )
            if not managers_only:
                self._generate_content_index(data)
            if content_index_only:
                self.result.warnings = self.issues.warnings
                self.result.errors = self.issues.errors
                self.result.elapsed_seconds = time.perf_counter() - started
                return self.result
            if not managers_only and not tactics_only:
                self._generate_builder_index(data)
            if builder_index_only:
                self.result.warnings = self.issues.warnings
                self.result.errors = self.issues.errors
                self.result.elapsed_seconds = time.perf_counter() - started
                return self.result
            if not teams_only and not managers_only and not tactics_only:
                self._validate_assets(data)

            # Las fichas de DT carecen de un ID numerico que las vincule con el
            # CSV de entrenadores. Se cargan una vez y solo se usa el nombre ya
            # resuelto por team.Coach -> coaches.Id como enlace de respaldo.
            from generador_secciones import (
                generate_directories,
                generate_content_hubs,
                generate_managers,
                generate_tactics,
                load_managers,
                load_tactic_summaries,
                normalize as normalize_extra,
                validate_internal_links,
            )
            if refresh_coaches or refresh_coach_ids:
                from manager_external import refresh_manager_cache
                refresh_manager_cache(
                    self.project_root,
                    self.issues,
                    refresh_stale=refresh_coaches,
                    force_ids=refresh_coach_ids,
                )
            managers = load_managers(self.project_root, self.issues)
            manager_tactics = load_tactic_summaries(self.project_root, self.issues)
            manager_paths_by_name: dict[str, str] = {}
            manager_surnames: dict[str, list[object]] = {}
            for manager in managers:
                normalized_name = normalize_extra(manager.config.get("nombre"))
                if not normalized_name:
                    continue
                manager_paths_by_name[normalized_name] = manager.url
                surname = normalized_name.split()[-1]
                manager_surnames.setdefault(surname, []).append(manager)
            for surname, matches in manager_surnames.items():
                if len(matches) != 1:
                    continue
                manager = matches[0]
                normalized_name = normalize_extra(manager.config.get("nombre"))
                manager_paths_by_name[surname] = manager.url
                manager_paths_by_name[f"{normalized_name[0]}. {surname}"] = manager.url

            league_aliases, team_aliases, player_aliases = scan_existing_aliases(self.project_root, self.version)
            league_id_counts: dict[str, int] = {}
            for league in data.leagues:
                league_id_counts[league.get("league_id", "")] = league_id_counts.get(league.get("league_id", ""), 0) + 1

            league_paths = {
                league_key(league): f"/league/{self.version}/{slugify(league['league_name'], 'liga')}-{quote(league['league_id'])}/"
                for league in data.leagues
            }
            team_paths = {
                team_id: f"/team/{self.version}/{slugify(team['Name'], 'equipo')}-{quote(team_id)}/"
                for team_id, team in data.team_by_id.items()
                if team_id in data.team_leagues and team.get("Name", "").strip() not in {"", "-"}
            }
            player_paths = {
                (team_id, entry.player.get("Id", "")):
                    f"/player/{self.version}/{quote(team_id)}/{slugify(entry.player.get('Name') or f'Jugador {entry.player.get("Id", "")}', 'jugador')}-{quote(entry.player.get('Id', ''))}/"
                for team_id in data.rosters if team_id in team_paths
                for entry in data.rosters.get(team_id, [])
                if entry.player.get("Id", "")
            }

            def manager_path_for_coach(coach_name: str) -> str | None:
                normalized_coach = normalize_extra(coach_name)
                if not normalized_coach:
                    return None
                return (
                    manager_paths_by_name.get(normalized_coach)
                    or manager_paths_by_name.get(normalized_coach.split()[-1])
                )

            manager_team_paths: dict[str, str] = {}
            manager_team_catalog: dict[str, dict[str, str]] = {}
            for team_id, team_path in team_paths.items():
                team = data.team_by_id.get(team_id, {})
                team_name = normalize_extra(team.get("Name", ""))
                if team_name:
                    manager_team_catalog[team_name] = {
                        "url": team_path,
                        "crest": f"img/teams/{quote(team_id)}.webp",
                    }
            for manager in managers:
                context_team_id = manager.config.get("equipo_id", "").strip()
                if context_team_id:
                    if context_team_id not in team_paths:
                        self.issues.warning(
                            f"DT {manager.config.get('id')}: equipo_id inexistente o no publicado {context_team_id}."
                        )
                    else:
                        entry = {
                            "url": team_paths[context_team_id],
                            "crest": f"img/teams/{quote(context_team_id)}.webp",
                        }
                        manager_team_paths[manager.url] = entry["url"]
                        manager_team_catalog[normalize_extra(manager.config.get("equipo", ""))] = entry
            for team_id in data.rosters:
                team = data.team_by_id.get(team_id, {})
                coach = data.coach_by_id.get(team.get("Coach", ""), {})
                manager_path = manager_path_for_coach(coach.get("Name", ""))
                if manager_path and team_id in team_paths:
                    manager_team_paths.setdefault(manager_path, team_paths[team_id])

            if managers_only:
                manager_result = generate_managers(
                    self.project_root, self.output_root, COUNTRY_NAMES, self.issues,
                    self._notify, self._record_write, managers, manager_team_paths,
                    manager_tactics, manager_team_catalog,
                )
                self.result.managers += manager_result.managers
                self.result.other_html += manager_result.other_html
                self.result.warnings = self.issues.warnings
                self.result.errors = self.issues.errors
                self.result.elapsed_seconds = time.perf_counter() - started
                return self.result

            if tactics_only:
                tactic_result, _tactics = generate_tactics(
                    self.project_root, self.output_root, self.issues,
                    self._notify, self._record_write, managers,
                )
                self.result.tactics += tactic_result.tactics
                self.result.other_html += tactic_result.other_html
                self.result.warnings = self.issues.warnings
                self.result.errors = self.issues.errors
                self.result.elapsed_seconds = time.perf_counter() - started
                return self.result

            if not teams_only:
                self._generate_leagues(data, league_paths, team_paths, league_aliases, league_id_counts)
            self._generate_teams(
                data, league_paths, team_paths, player_paths, team_aliases,
                managers=managers, missing_only=missing_only,
            )
            self._remove_unpublished_club_pages(team_paths)
            if teams_only:
                self._validate_output()
                validate_internal_links(self.project_root, self.output_root, self.generated_html_files,
                                        self.issues, self._notify, self.generated_links)
                self.result.warnings = self.issues.warnings
                self.result.errors = self.issues.errors
                self.result.elapsed_seconds = time.perf_counter() - started
                return self.result
            self._generate_players(data, league_paths, team_paths, player_paths, player_aliases)

            manager_result = generate_managers(
                self.project_root, self.output_root, COUNTRY_NAMES, self.issues,
                self._notify, self._record_write, managers, manager_team_paths,
                manager_tactics, manager_team_catalog,
            )
            self.result.managers += manager_result.managers
            self.result.other_html += manager_result.other_html

            tactic_result, _tactics = generate_tactics(
                self.project_root, self.output_root, self.issues,
                self._notify, self._record_write, managers,
            )
            self.result.tactics += tactic_result.tactics
            self.result.other_html += tactic_result.other_html

            directory_result = generate_directories(
                self.project_root, self.output_root, data, player_paths, team_paths,
                league_paths, self.issues, self._notify, self._record_write,
            )
            self.result.other_html += directory_result.other_html

            content_result = generate_content_hubs(
                self.project_root, self.output_root, data, player_paths, team_paths,
                league_paths, self.issues, self._notify, self._record_write,
            )
            self.result.other_html += content_result.other_html
            self._validate_output()
            validate_internal_links(
                self.project_root, self.output_root, self.generated_html_files,
                self.issues, self._notify, self.generated_links,
            )

            self.result.warnings = self.issues.warnings
            self.result.errors = self.issues.errors
            self.result.elapsed_seconds = time.perf_counter() - started
            self.issues.info(
                f"Fin. ligas={self.result.leagues}; equipos={self.result.teams}; jugadores={self.result.players}; "
                f"dts={self.result.managers}; tacticas={self.result.tactics}; otros={self.result.other_html}; "
                f"advertencias={self.result.warnings}; errores={self.result.errors}; escritos={self.result.files_written}; "
                f"sin_cambios={self.result.files_unchanged}; aliases={self.result.aliases_updated}; "
                f"segundos={self.result.elapsed_seconds:.2f}."
            )
            return self.result
        finally:
            self.issues.close()

    def _generate_leagues(
        self,
        data: GeneratorData,
        league_paths: dict[tuple[str, str], str],
        team_paths: dict[str, str],
        aliases: dict[str, set[str]],
        id_counts: dict[str, int],
    ) -> None:
        from generador_clubes import rating_class
        total = len(data.leagues)
        for index, league in enumerate(data.leagues, start=1):
            league_id = league.get("league_id", "").strip()
            league_name = league.get("league_name", "").strip()
            self._notify("leagues", index, total, f"Generando ligas... {index} / {total}")
            if not league_id or not league_name:
                self.issues.error(f"Liga sin ID o nombre en la fila {index + 1}; se omitio.")
                continue

            teams: list[dict[str, str]] = []
            for raw_team_id in league.get("team_ids", "").split(","):
                team_id = raw_team_id.strip()
                team = data.team_by_id.get(team_id)
                if team and team.get("Name", "").strip() not in {"", "-"}:
                    teams.append(team)

            cards = []
            league_scores: list[int] = []
            for team in teams:
                team_id = team["Id"]
                roster = data.rosters.get(team_id, [])
                for entry in roster:
                    try:
                        score = int(corrected_overall(data, entry.player))
                    except (TypeError, ValueError):
                        continue
                    if 0 < score <= 99:
                        league_scores.append(score)
                avg = team_average(data, team_id)
                badge = f'<span class="db-rating {rating_class(avg)}">{escape(avg)}</span>' if avg != '-' else ''
                cards.append(
                    f'<a class="db-club-row" href="{escape(team_paths[team_id])}">'
                    f'<img src="img/teams/{escape(team_id)}.webp" alt="" width="46" height="46" loading="lazy" '
                    f'onerror="this.onerror=null;this.src=\'img/teams/default.webp\'">'
                    f'<span class="db-club-row-copy"><strong>{escape(team.get("Name") or team_id)}</strong>'
                    f'<small>{len(roster)} jugadores</small></span>{badge}</a>'
                )

            league_average = str(round(sum(league_scores) / len(league_scores))) if league_scores else '-'
            league_summary = f'<span>{len(teams)} equipos</span><span>{sum(len(data.rosters.get(team["Id"], [])) for team in teams)} jugadores</span>'
            if league_scores:
                league_summary += f'<span>Media {league_average}</span>'

            canonical_path = league_paths[league_key(league)]
            description = (
                f"{league_name} para PES 2018 actualizado: {len(teams)} equipos, plantillas modernas, "
                "escudos, stats y enlaces a jugadores editables."
            )
            league_image_exists = asset_exists(self.project_root, "leagues", league_id)
            content = self.templates.render("league", {
                "LEAGUE_ID": escape(league_id),
                "LEAGUE_NAME": escape(league_name),
                "TITLE": escape(f"{league_name} PES 2018 Actualizado - Equipos y Plantillas"),
                "DESCRIPTION": escape(description),
                "CANONICAL_URL": escape(f"{SITE_URL}{canonical_path}"),
                "OG_IMAGE_URL": escape(f"{SITE_URL}/img/leagues/{quote(league_id)}.webp" if league_image_exists else f"{SITE_URL}/img/logo.webp"),
                "LEAGUE_IMAGE_PATH": escape(f"img/leagues/{league_id}.webp"),
                "TEAM_COUNT": len(teams),
                "LEAGUE_SUMMARY": league_summary,
                "TEAM_CARDS": "\n".join(cards),
            })

            canonical_segment = canonical_path.strip("/").split("/")[-1]
            target_segments = {canonical_segment}
            if id_counts.get(league_id, 0) == 1:
                target_segments.update(aliases.get(league_id, set()))
            canonical_ok = False
            for segment in sorted(target_segments):
                file_path = safe_output_file(self.output_root, Path("league") / self.version / segment)
                ok = self._record_write(file_path, content, alias=segment != canonical_segment)
                if segment == canonical_segment:
                    canonical_ok = ok
                    self.canonical_files.append((file_path, f'name="laqp-league-id" content="{escape(league_id)}"'))
            if canonical_ok:
                self.result.leagues += 1

    def _generate_teams(
        self,
        data: GeneratorData,
        league_paths: dict[tuple[str, str], str],
        team_paths: dict[str, str],
        player_paths: dict[tuple[str, str], str],
        aliases: dict[str, set[str]],
        *,
        managers: list | None = None,
        missing_only: bool = False,
    ) -> None:
        from generador_clubes import ClubRenderer
        renderer = ClubRenderer(self.project_root, data, team_paths, player_paths,
                                COUNTRY_NAMES, corrected_overall, managers or [])
        team_ids = [
            team_id for team_id in data.rosters
            if team_id in team_paths
        ]
        total = len(team_ids)
        for index, team_id in enumerate(team_ids, start=1):
            self._notify("teams", index, total, f"Generando equipos... {index} / {total}")
            team = data.team_by_id[team_id]
            team_name = team.get("Name", "").strip()
            league_links = []
            for league in data.team_leagues.get(team_id, []):
                path = league_paths.get(league_key(league), "database.html")
                league_links.append(f'<a href="{escape(path)}">{escape(league.get("league_name") or league.get("league_id"))}</a>')
            league_html = ", ".join(league_links) or "-"

            canonical_path = team_paths[team_id]
            description = (
                f"{team_name} para PES 2018 actualizado: plantilla moderna, jugadores, medias, "
                "posiciones, dorsales y enlaces a fichas de stats y caras."
            )
            _, club_body = renderer.render(team, league_html)
            content = self.templates.render("team", {
                "CLUB_BODY": club_body,
                "TEAM_ID": escape(team_id),
                "TEAM_NAME": escape(team_name),
                "TITLE": escape(f"{team_name} PES 2018 Actualizado - Plantilla y Stats"),
                "DESCRIPTION": escape(description),
                "CANONICAL_URL": escape(f"{SITE_URL}{canonical_path}"),
                "OG_IMAGE_URL": escape(f"{SITE_URL}/img/teams/{quote(team_id)}.webp"),
            })

            canonical_segment = canonical_path.strip("/").split("/")[-1]
            target_segments = {canonical_segment, *aliases.get(team_id, set())}
            canonical_ok = False
            for segment in sorted(target_segments):
                file_path = safe_output_file(self.output_root, Path("team") / self.version / segment)
                if missing_only and file_path.is_file():
                    continue
                ok = self._record_write(file_path, content, alias=segment != canonical_segment)
                if segment == canonical_segment:
                    canonical_ok = ok
                    self.canonical_files.append((file_path, f'name="laqp-team-id" content="{escape(team_id)}"'))
            if canonical_ok:
                self.result.teams += 1

    def _remove_unpublished_club_pages(self, team_paths: dict[str, str]) -> None:
        """Retire only pages made by this renderer for teams absent from leagues."""
        version_root = (self.output_root / 'team' / self.version).resolve()
        if not version_root.is_dir() or not version_root.is_relative_to(self.output_root):
            return
        for directory in version_root.iterdir():
            if not directory.is_dir() or not directory.resolve().is_relative_to(version_root):
                continue
            page = directory / 'index.html'
            if not page.is_file():
                continue
            source = page.read_text(encoding='utf-8')
            match = re.search(r'<meta name="laqp-team-id" content="(\d+)">', source)
            if not match or match.group(1) in team_paths or 'data-club-prerendered' not in source:
                continue
            page.unlink()
            try:
                directory.rmdir()
            except OSError:
                pass  # Keep any unrelated files that happen to share this folder.
            self.issues.info(f'Ficha retirada por equipo sin liga: {page}.')

    def _generate_players(
        self,
        data: GeneratorData,
        league_paths: dict[tuple[str, str], str],
        team_paths: dict[str, str],
        player_paths: dict[tuple[str, str], str],
        aliases: dict[tuple[str, str], set[str]],
    ) -> None:
        from generador_clubes import context_style
        memberships = [
            (team_id, entry)
            for team_id in data.rosters
            if team_id in team_paths
            for entry in data.rosters.get(team_id, [])
        ]
        formation_by_team = {row.get('Id', ''): row for row in data.formations}
        appearance_by_player = {row.get('Id', ''): row for row in data.appearances}
        total = len(memberships)
        for index, (team_id, entry) in enumerate(memberships, start=1):
            if index == 1 or index == total or index % 25 == 0:
                self._notify("players", index, total, f"Generando jugadores... {index} / {total}")
            player = entry.player
            player_id = player.get("Id", "").strip()
            player_name = player.get("Name", "").strip() or f"Jugador {player_id}"
            team = data.team_by_id[team_id]
            team_name = team.get("Name", "").strip()
            canonical_path = player_paths[(team_id, player_id)]
            overall = corrected_overall(data, player)
            pos = position_label(player.get("POS", ""))
            context = (player_squad_context(data, team_id, entry, formation_by_team.get(team_id), player_paths)
                       if team.get('Type') != '2' else {})
            appearance = appearance_by_player.get(player_id, {})
            technical_fields = [
                ('Player ID', player_id), ('Face ID', appearance.get('Id_Face')),
                ('Commentary ID', player.get('Commentary')), ('Boots ID', appearance.get('Boots')),
                ('Gloves ID', appearance.get('Gloves')),
                ('Celebración 1', player.get('Celebration 1')), ('Celebración 2', player.get('Celebration 2')),
                ('Animación de regate (cuerpo)', player.get('Drib. Hunching')),
                ('Animación de regate (brazos)', player.get('Drib. Arm Move.')),
                ('Animación de carrera (cuerpo)', player.get('Run. Hunching')),
                ('Animación de carrera (brazos)', player.get('Run. Arm Move.')),
                ('Córner', player.get('Corner Kicks')), ('Tiro libre', player.get('Free Kicks')),
                ('Penal', player.get('Penalty Kick')),
            ]
            technical_html = ''.join(f'<div><dt>{escape(label)}</dt><dd>{escape(value)}</dd></div>'
                                     for label, value in technical_fields if value is not None and str(value).strip())

            league_links = []
            for league in data.team_leagues.get(team_id, []):
                path = league_paths.get(league_key(league), "database.html")
                league_links.append(f'<a href="{escape(path)}">{escape(league.get("league_name") or league.get("league_id"))}</a>')
            league_html = ", ".join(league_links) or "-"
            stat_rows = []
            for column, label in PLAYER_STATS:
                value = player.get(column, "").strip()
                if value:
                    stat_rows.append(f"<tr><th>{escape(label)}</th><td>{escape(value)}</td></tr>")

            country_id = player.get("Country", "").strip()
            country_name = COUNTRY_NAMES.get(country_id, country_id or "-")
            description = (
                f"{player_name} para PES 2018 actualizado: stats, media {overall}, equipo {team_name}, "
                "posicion, dorsal, datos de apariencia y referencias para editar su cara/miniface."
            )
            image_exists = asset_exists(self.project_root, "players", player_id)
            content = self.templates.render("player", {
                "PLAYER_ID": escape(player_id),
                "TEAM_ID": escape(team_id),
                "PLAYER_NAME": escape(player_name),
                "TEAM_NAME": escape(team_name),
                "TEAM_URL": escape(team_paths[team_id]),
                "CONTEXT_STYLE": escape(context_style(team) if team.get('Type') != '2' else ''),
                "PLAYER_CONTEXT": escape(json.dumps(context, ensure_ascii=False, separators=(',', ':'))),
                "FACE_ID": escape(appearance.get('Id_Face') or '-'),
                "BOOTS_ID": escape(appearance.get('Boots') or '-'),
                "GLOVES_ID": escape(appearance.get('Gloves') or '-'),
                "PES_TECH_ROWS": technical_html,
                "LEAGUE_LINKS": league_html,
                "TITLE": escape(f"{player_name} PES 2018 Actualizado - Stats, Cara y Media"),
                "DESCRIPTION": escape(description),
                "CANONICAL_URL": escape(f"{SITE_URL}{canonical_path}"),
                "OG_TITLE": escape(f"{player_name} #{player_id} - {team_name} | PES 2018"),
                "OG_IMAGE_URL": escape(f"{SITE_URL}/img/players/{quote(player_id)}.webp" if image_exists else f"{SITE_URL}/img/players/default.webp"),
                "PLAYER_IMAGE_PATH": escape(f"img/players/{player_id}.webp"),
                "OVERALL": escape(overall),
                "POSITION": escape(pos),
                "AGE": escape(player.get("Age") or "-"),
                "SHIRT_NAME": escape(player.get("Shirt") or "-"),
                "NATIONALITY": escape(country_name),
                "COUNTRY_ID": escape(country_id or "-"),
                "HEIGHT": escape(player.get("Height") or "-"),
                "WEIGHT": escape(player.get("Weight") or "-"),
                "FOOT": escape(foot_label(player.get("Foot", ""))),
                "DORSAL": escape(entry.shirt_number or "-"),
                "STATS_ROWS": "".join(stat_rows),
            })

            canonical_segment = canonical_path.strip("/").split("/")[-1]
            target_segments = {canonical_segment, *aliases.get((team_id, player_id), set())}
            canonical_ok = False
            for segment in sorted(target_segments):
                file_path = safe_output_file(self.output_root, Path("player") / self.version / team_id / segment)
                ok = self._record_write(file_path, content, alias=segment != canonical_segment)
                if segment == canonical_segment:
                    canonical_ok = ok
                    self.canonical_files.append((file_path, f'name="laqp-player-id" content="{escape(player_id)}"'))
            if canonical_ok:
                self.result.players += 1

    def _validate_output(self) -> None:
        total = len(self.canonical_files)
        readable_samples: set[int] = set()
        if total:
            # La existencia se comprueba para toda la salida. El contenido ya fue
            # validado por las plantillas antes de escribir; releer unos pocos
            # ejemplos detecta ademas problemas reales de disco sin duplicar miles
            # de operaciones de E/S en cada click.
            sample_count = min(36, total)
            readable_samples = {
                round(offset * (total - 1) / max(sample_count - 1, 1))
                for offset in range(sample_count)
            }
        for index, (file_path, marker) in enumerate(self.canonical_files, start=1):
            if index == 1 or index == total or index % 250 == 0:
                self._notify("validation", index, total, f"Validando HTML... {index} / {total}")
            if not file_path.is_file():
                self.issues.error(f"HTML faltante despues de generar: {file_path}.")
                continue
            if index - 1 not in readable_samples:
                continue
            try:
                content = file_path.read_text(encoding="utf-8-sig")
            except OSError as error:
                self.issues.error(f"No se pudo validar {file_path}: {error}")
                continue
            if marker not in content:
                self.issues.error(f"HTML invalido {file_path}: falta el identificador esperado {marker}.")
            if not re.search(r'<link\s+rel="stylesheet"\s+href="css/style\.css(?:\?[^"\s]*)?"', content):
                self.issues.error(f"HTML invalido {file_path}: falta css/style.css.")
            if "js/site.js" not in content:
                self.issues.error(f"HTML invalido {file_path}: falta js/site.js.")


def cli_progress(stage: str, current: int, total: int, message: str) -> None:
    steps = {"leagues": 5, "teams": 25, "players": 250, "managers": 1, "tactics": 5, "other": 1, "validation": 500, "links": 500}
    step = steps.get(stage, 1)
    if current in {0, 1, total} or current % step == 0:
        print(message, flush=True)


def run_cli(args: argparse.Namespace) -> int:
    try:
        project_root = find_project_root(args.project_root)
        output_root = Path(args.output_root).expanduser().resolve() if args.output_root else project_root
        generator = DatabaseGenerator(
            project_root,
            output_root=output_root,
            version=args.version,
            progress=cli_progress,
        )
        result = generator.run(
            teams_only=args.teams_only,
            missing_only=args.missing_only,
            builder_index_only=args.builder_index_only,
            content_index_only=args.content_index_only,
            managers_only=args.managers_only,
            tactics_only=args.tactics_only,
            refresh_coaches=args.refresh_coaches,
            refresh_coach_ids=tuple(args.refresh_coach or ()),
        )
    except GenerationFatalError as error:
        print(f"Error fatal: {error}", file=sys.stderr)
        return 2
    except Exception as error:
        print(f"Error inesperado: {error}", file=sys.stderr)
        return 3

    print("\n" + result.summary())
    print(f"Log: {result.log_path}")
    # El indice liviano omite referencias rotas de planteles y puede generarse
    # correctamente aun cuando la auditoria global de los CSV registre errores.
    return 0 if (args.builder_index_only or args.content_index_only) else (1 if result.errors else 0)


class GeneratorGUI:
    def __init__(self, project_root: Path) -> None:
        import tkinter as tk
        from tkinter import ttk

        self.tk = tk
        self.ttk = ttk
        self.project_root = project_root
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()

        self.window = tk.Tk()
        self.window.title(APP_NAME)
        self.window.geometry("620x500")
        self.window.minsize(560, 460)
        self.window.configure(bg="#111319")

        style = ttk.Style(self.window)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("Generate.TButton", font=("Segoe UI", 12, "bold"), padding=(18, 12))
        style.configure("Horizontal.TProgressbar", troughcolor="#232733", background="#d6a84f")

        frame = tk.Frame(self.window, bg="#111319", padx=28, pady=24)
        frame.pack(fill="both", expand=True)
        tk.Label(
            frame, text=APP_NAME, bg="#111319", fg="#f5f5f5",
            font=("Segoe UI", 19, "bold"),
        ).pack(pady=(4, 4))
        tk.Label(
            frame, text="Genera toda la web pre-renderizada desde database.",
            bg="#111319", fg="#aeb4c0", font=("Segoe UI", 9),
        ).pack(pady=(0, 20))

        actions = tk.Frame(frame, bg="#111319")
        actions.pack(fill="x")
        self.buttons = []
        for label, mode in (
            ("GENERAR TODA LA WEB", "all"),
            ("ACTUALIZAR DATOS EXTERNOS Y GENERAR", "all-refresh"),
            ("GENERAR SOLO ENTRENADORES", "managers"),
            ("ACTUALIZAR Y GENERAR ENTRENADORES", "managers-refresh"),
        ):
            button = ttk.Button(actions, text=label, style="Generate.TButton", command=lambda value=mode: self.start(value))
            button.pack(fill="x", pady=4)
            self.buttons.append(button)

        self.progress = ttk.Progressbar(frame, mode="determinate", maximum=100)
        self.progress.pack(fill="x", pady=(24, 10))
        self.status = tk.StringVar(value="Esperando...")
        tk.Label(
            frame, textvariable=self.status, bg="#111319", fg="#f0cf88",
            font=("Segoe UI", 10), anchor="w",
        ).pack(fill="x")
        self.details = tk.StringVar(value=f"Proyecto: {project_root}")
        tk.Label(
            frame, textvariable=self.details, bg="#111319", fg="#7f8795",
            font=("Segoe UI", 8), anchor="w", justify="left", wraplength=475,
        ).pack(fill="x", pady=(8, 0))

        self.window.after(100, self.poll_events)

    def progress_callback(self, stage: str, current: int, total: int, message: str) -> None:
        self.events.put(("progress", (stage, current, total, message)))

    def start(self, mode: str = "all") -> None:
        for button in self.buttons:
            button.configure(state="disabled")
        self.progress.configure(value=0)
        self.status.set("Leyendo CSV...")
        self.details.set("La generacion puede tardar unos segundos.")
        threading.Thread(target=self.worker, args=(mode,), daemon=True).start()

    def worker(self, mode: str) -> None:
        try:
            result = DatabaseGenerator(self.project_root, progress=self.progress_callback).run(
                managers_only=mode.startswith("managers"),
                refresh_coaches=mode.endswith("refresh"),
            )
            self.events.put(("done", result))
        except Exception as error:
            self.events.put(("fatal", error))

    def poll_events(self) -> None:
        from tkinter import messagebox

        try:
            while True:
                event, payload = self.events.get_nowait()
                if event == "progress":
                    _stage, current, total, message = payload  # type: ignore[misc]
                    percent = (current / total * 100) if total else 0
                    self.progress.configure(value=percent)
                    self.status.set(str(message))
                elif event == "done":
                    result = payload
                    assert isinstance(result, GenerationResult)
                    self.progress.configure(value=100)
                    self.status.set("Generacion completada")
                    self.details.set(f"Log: {result.log_path}")
                    for button in self.buttons:
                        button.configure(state="normal")
                    messagebox.showinfo(APP_NAME, result.summary())
                elif event == "fatal":
                    self.status.set("La generacion no pudo completarse")
                    self.details.set(str(payload))
                    for button in self.buttons:
                        button.configure(state="normal")
                    messagebox.showerror(APP_NAME, f"Error fatal:\n\n{payload}")
        except queue.Empty:
            pass
        self.window.after(100, self.poll_events)

    def run(self) -> None:
        self.window.mainloop()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Genera los HTML estaticos de LAqP.website.")
    parser.add_argument("--cli", action="store_true", help="Ejecuta sin interfaz grafica.")
    parser.add_argument("--teams-only", action="store_true", help="Regenera solamente las fichas de equipos y sus aliases.")
    parser.add_argument("--missing-only", action="store_true", help="Con --teams-only, conserva los HTML existentes.")
    parser.add_argument("--builder-index-only", action="store_true", help="Regenera solo el indice liviano del Creador de alineaciones.")
    parser.add_argument("--content-index-only", action="store_true", help="Regenera solo el indice de nombres y URLs para cuentas/comentarios.")
    parser.add_argument("--managers-only", action="store_true", help="Regenera solamente las paginas y el indice de DTs.")
    parser.add_argument("--tactics-only", action="store_true", help="Regenera solamente las paginas y el indice de tacticas.")
    parser.add_argument("--refresh-coaches", action="store_true", help="Actualiza DTs nuevos o con cache vencida antes de generar.")
    parser.add_argument("--refresh-coach", action="append", metavar="ID", help="Fuerza la actualizacion de un ID LAQP o Transfermarkt; se puede repetir.")
    parser.add_argument("--project-root", help="Raiz del repositorio LAqP.website.")
    parser.add_argument("--output-root", help="Raiz de salida alternativa, util para pruebas.")
    parser.add_argument("--version", default=DEFAULT_VERSION, help="Version de URL (por defecto: v2).")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.cli:
        return run_cli(args)
    try:
        project_root = find_project_root(args.project_root)
        GeneratorGUI(project_root).run()
        return 0
    except Exception as error:
        try:
            from tkinter import messagebox
            messagebox.showerror(APP_NAME, str(error))
        except Exception:
            print(f"Error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
