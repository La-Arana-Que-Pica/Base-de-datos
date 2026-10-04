"""External manager data with an offline-first Transfermarkt cache.

The static renderer only reads normalized JSON. Network access lives here and
is only triggered by explicit refresh options in ``generar_web.py``.
"""

from __future__ import annotations

import csv
import html
import io
import json
import re
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


TRANSFERMARKT_CACHE_DAYS = 14
TRANSFERMARKT_TIMEOUT_SECONDS = 12
TRANSFERMARKT_RETRIES = 2
TRANSFERMARKT_REQUEST_DELAY_SECONDS = 1.25
TRANSFERMARKT_USER_AGENT = (
    "Mozilla/5.0 (compatible; LAqPWebsite/1.0; +https://laqp.website/contact.html)"
)
MANAGER_SOURCE_RELATIVE_PATH = Path("Herramientas") / "Recursos" / "Base-de-datos" / "DTs"
CACHE_RELATIVE_PATH = Path("Herramientas") / "Recursos" / "Base-de-datos" / "cache" / "entrenadores_transfermarkt.json"


def transfermarkt_url(identifier: str) -> str:
    return f"https://www.transfermarkt.com/-/profil/trainer/{identifier}"


def _iso_date(value: str) -> str:
    value = str(value or "").strip()
    for pattern in ("%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, pattern).date().isoformat()
        except ValueError:
            continue
    return ""


def _text(value: str) -> str:
    value = re.sub(r"<script\b[\s\S]*?</script>|<style\b[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def _first(patterns: tuple[str, ...], source: str) -> str:
    for pattern in patterns:
        match = re.search(pattern, source, flags=re.I | re.S)
        if match:
            return _text(match.group(1))
    return ""


def parse_transfermarkt_profile(source: str, identifier: str, url: str | None = None) -> dict:
    """Extract conservative, normalized fields from a manager profile.

    Transfermarkt markup changes regularly. Missing fields remain empty and do
    not invalidate the rest of the record. ``data-laqp-*`` hooks make fixtures
    and future import adapters deterministic without coupling the renderer.
    """

    source_url = url or transfermarkt_url(identifier)
    name = _first((
        r'data-laqp-name=["\']([^"\']+)',
        r"<h1\b[^>]*>([\s\S]*?)</h1>",
        r'<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)',
    ), source)
    full_name = _first((
        r'data-laqp-full-name=["\']([^"\']+)',
        r"(?:Full Name|Name in Home Country)[\s\S]{0,500}?class=[\"'][^\"']*info-table__content[^\"']*[\"'][^>]*>([\s\S]*?)</",
    ), source)
    birth_raw = _first((
        r'data-laqp-birth-date=["\']([^"\']+)',
        r"Date of birth/Age:[\s\S]{0,220}?(\d{2}[./]\d{2}[./]\d{4})",
    ), source)
    nationality = _first((
        r'data-laqp-nationality=["\']([^"\']+)',
        r"Citizenship:[\s\S]{0,350}?(?:title|alt)=[\"']([^\"']+)[\"']",
    ), source)
    current_club = _first((
        r'data-laqp-current-club=["\']([^"\']*)',
        r"Current club[\s\S]{0,300}?<a\b[^>]*>([\s\S]*?)</a>",
        r"(Without Club)",
    ), source)
    appointed_raw = _first((
        r'data-laqp-appointed-date=["\']([^"\']*)',
        r"Appointed:[\s\S]{0,150}?(\d{2}[./]\d{2}[./]\d{4})",
    ), source)
    preferred_formation = _first((
        r'data-laqp-preferred-formation=["\']([^"\']*)',
        r"Preferred formation:[\s\S]{0,220}?<a\b[^>]*>([\s\S]*?)</a>",
    ), source)
    image_url = _first((
        r'data-laqp-image=["\']([^"\']*)',
        r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)',
    ), source)

    career = []
    for match in re.finditer(
        r'<tr\b[^>]*data-laqp-career[^>]*data-club=["\']([^"\']+)["\'][^>]*'
        r'data-start=["\']([^"\']*)["\'][^>]*data-end=["\']([^"\']*)["\'][^>]*'
        r'(?:data-role=["\']([^"\']*)["\'])?',
        source,
        flags=re.I,
    ):
        career.append({
            "club": html.unescape(match.group(1)).strip(),
            "start_date": _iso_date(match.group(2)),
            "end_date": _iso_date(match.group(3)),
            "role": html.unescape(match.group(4) or "Manager").strip(),
        })

    status = "without_club" if re.search(r"Without Club", source, flags=re.I) else (
        "active" if current_club else "unknown"
    )
    return {
        "transfermarkt_id": str(identifier),
        "source_url": source_url,
        "name": name.replace(" - Manager profile", "").strip(),
        "full_name": full_name,
        "nationality": nationality,
        "birth_date": _iso_date(birth_raw),
        "current_club": "" if normalize_external(current_club) == "without club" else current_club,
        "appointed_date": _iso_date(appointed_raw),
        "status": status,
        "preferred_formation": preferred_formation,
        "career": career,
        "image_url": image_url,
        "fetched_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }


def normalize_external(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


class TransfermarktClient:
    def __init__(
        self,
        *,
        timeout: int = TRANSFERMARKT_TIMEOUT_SECONDS,
        retries: int = TRANSFERMARKT_RETRIES,
        opener: Callable = urlopen,
    ) -> None:
        self.timeout = timeout
        self.retries = max(1, retries)
        self.opener = opener

    def fetch(self, identifier: str) -> dict:
        url = transfermarkt_url(identifier)
        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                request = Request(url, headers={
                    "User-Agent": TRANSFERMARKT_USER_AGENT,
                    "Accept-Language": "en-US,en;q=0.8",
                    "Accept": "text/html,application/xhtml+xml",
                })
                with self.opener(request, timeout=self.timeout) as response:
                    source = response.read().decode("utf-8", errors="replace")
                record = parse_transfermarkt_profile(source, identifier, url)
                if not record.get("name"):
                    raise ValueError("el perfil no contiene un nombre reconocible")
                return record
            except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
                last_error = error
                if attempt + 1 < self.retries:
                    time.sleep(0.75 * (attempt + 1))
        raise RuntimeError(str(last_error or "error externo desconocido"))


def empty_cache() -> dict:
    return {"schema_version": 1, "provider": "transfermarkt", "coaches": {}}


def load_manager_cache(project_root: Path, issues=None) -> dict:
    path = project_root / CACHE_RELATIVE_PATH
    if not path.is_file():
        return empty_cache()
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(value, dict) or not isinstance(value.get("coaches"), dict):
            raise ValueError("estructura invalida")
        return value
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        if issues:
            issues.warning(f"[CACHE] No se pudo leer {CACHE_RELATIVE_PATH}: {error}.")
        return empty_cache()


def save_manager_cache(project_root: Path, cache: dict) -> None:
    path = project_root / CACHE_RELATIVE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    cache["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def cache_is_fresh(record: dict, *, today: date | None = None, max_days: int = TRANSFERMARKT_CACHE_DAYS) -> bool:
    raw = str(record.get("fetched_at") or "")
    if not raw:
        return False
    try:
        fetched = datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        return False
    return ((today or date.today()) - fetched).days <= max_days


def _read_manager_rows(project_root: Path) -> list[dict[str, str]]:
    path = project_root / MANAGER_SOURCE_RELATIVE_PATH / "config.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle, delimiter=";")]


def _cache_external_image(project_root: Path, row: dict[str, str], record: dict, issues) -> None:
    if row.get("foto_override") or row.get("real_img"):
        return
    image_url = str(record.get("image_url") or "")
    parsed = urlparse(image_url)
    allowed_hosts = ("transfermarkt.com", "transfermarkt.de", "transfermarkt.technology", "tmssl.akamaized.net")
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(allowed_hosts):
        return
    try:
        from PIL import Image
        request = Request(image_url, headers={"User-Agent": TRANSFERMARKT_USER_AGENT})
        with urlopen(request, timeout=TRANSFERMARKT_TIMEOUT_SECONDS) as response:
            payload = response.read(8 * 1024 * 1024)
        image = Image.open(io.BytesIO(payload)).convert("RGB")
        image.thumbnail((720, 960))
        target = project_root / "database" / "DTs" / row["carpeta"] / "external.webp"
        image.save(target, "WEBP", quality=82, method=6)
        record["cached_image"] = "external.webp"
    except Exception as error:  # Image caching must never abort HTML generation.
        issues.warning(f"[WARNING] No se pudo guardar la foto externa de {row.get('nombre')}: {error}.")


def refresh_manager_cache(
    project_root: Path,
    issues,
    *,
    refresh_stale: bool = False,
    force_ids: tuple[str, ...] = (),
    client: TransfermarktClient | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict:
    """Refresh stale/new coaches or force selected LAQP/Transfermarkt IDs."""

    rows = _read_manager_rows(project_root)
    cache = load_manager_cache(project_root, issues)
    coaches = cache.setdefault("coaches", {})
    selected = {str(value).strip() for value in force_ids if str(value).strip()}
    known_selectors = {
        value
        for row in rows
        for value in (row.get("id", ""), row.get("transfermarkt_id", ""))
        if value
    }
    for unknown in sorted(selected - known_selectors):
        issues.warning(f"[WARNING] No existe un DT con identificador {unknown}.")

    update_rows = []
    for row in rows:
        coach_id = str(row.get("transfermarkt_id") or "").strip()
        laqp_id = str(row.get("id") or "").strip()
        forced = bool(selected.intersection({coach_id, laqp_id}))
        if not coach_id:
            if forced or refresh_stale:
                issues.warning(f"[DT] {row.get('nombre') or laqp_id}: sin transfermarkt_id; se conserva LAQP.")
            continue
        record = coaches.get(coach_id, {})
        stale = not cache_is_fresh(record)
        if forced or (refresh_stale and stale):
            update_rows.append((row, coach_id, forced))
        elif refresh_stale:
            issues.info(f"[DT] {row.get('nombre')} | [CACHE] Datos validos.")

    external = client or TransfermarktClient()
    changed = False
    for index, (row, coach_id, _forced) in enumerate(update_rows):
        name = row.get("nombre") or row.get("id") or coach_id
        issues.info(f"[DT] {name} | [UPDATE] Consultando Transfermarkt.")
        previous = coaches.get(coach_id)
        try:
            record = external.fetch(coach_id)
            _cache_external_image(project_root, row, record, issues)
            coaches[coach_id] = record
            changed = True
            issues.info(f"[DT] {name} | [CACHE] Actualizado.")
        except Exception as error:
            if previous:
                cached_at = previous.get("fetched_at") or "fecha desconocida"
                issues.warning(f"[WARNING] No se pudo actualizar {name}: {error}. [FALLBACK] Cache {cached_at}.")
            else:
                issues.warning(f"[WARNING] No se pudo obtener {name}: {error}. [FALLBACK] Datos LAQP.")
        if index + 1 < len(update_rows):
            sleep(TRANSFERMARKT_REQUEST_DELAY_SECONDS)

    if changed or not (project_root / CACHE_RELATIVE_PATH).is_file():
        save_manager_cache(project_root, cache)
    return cache
