from __future__ import annotations

import argparse
import hashlib
import logging
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup

from config import (
    CACHE_DIR,
    DEFAULT_HEADERS,
    OUTPUTS_DIR,
    RAW_DIR,
    TARGET_GAME_YEAR,
    ensure_directories,
    is_explicit_pes2018_url,
    save_csv_excel,
    setup_logging,
)
from parser import clean_dataset, parse_player_html


logger = logging.getLogger(__name__)


class CachedScraper:
    source = "pesmaster"
    allowed_domains = ("pesmaster.com", "www.pesmaster.com")
    player_url_markers = ("/player/", "/pes-2018/player/")
    team_url_markers = ("/team/",)
    league_url_markers = ("/league/",)
    require_explicit_pes2018_url = True

    def __init__(
        self,
        delay_seconds: float = 1.5,
        cache_dir: Path | None = None,
        refresh_cache: bool = False,
        timeout: int = 25,
    ) -> None:
        ensure_directories()
        self.delay_seconds = delay_seconds
        self.cache_dir = cache_dir or CACHE_DIR / self.source
        self.refresh_cache = refresh_cache
        self.timeout = timeout
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def cache_path_for_url(self, url: str) -> Path:
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{digest}.html"

    def is_allowed_url(self, url: str) -> bool:
        host = urlparse(url).netloc.lower()
        return not self.allowed_domains or any(host.endswith(domain) for domain in self.allowed_domains)

    def unsupported_url_reason(self, url: str) -> str | None:
        if not self.is_allowed_url(url):
            return "outside_allowed_domain"
        if self.require_explicit_pes2018_url and not is_explicit_pes2018_url(self.source, url):
            return f"not_pes_{TARGET_GAME_YEAR}_url"
        return None

    def is_player_detail_url(self, url: str) -> bool:
        return True

    def is_team_detail_url(self, url: str) -> bool:
        return False

    def is_league_detail_url(self, url: str) -> bool:
        return False

    def is_leagues_index_url(self, url: str) -> bool:
        return False

    def fetch(self, url: str) -> str | None:
        reason = self.unsupported_url_reason(url)
        if reason:
            logger.warning("URL rechazada (%s): %s", reason, url)
            return None

        cache_path = self.cache_path_for_url(url)
        sidecar = cache_path.with_suffix(".url.txt")
        if cache_path.exists() and not self.refresh_cache:
            logger.info("Cache hit: %s", url)
            return cache_path.read_text(encoding="utf-8", errors="ignore")

        logger.info("Descargando: %s", url)
        time.sleep(max(0.0, self.delay_seconds))
        try:
            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("Fallo descargando %s: %s", url, exc)
            return None

        html = response.text
        cache_path.write_text(html, encoding="utf-8")
        sidecar.write_text(url, encoding="utf-8")
        return html

    def extract_player_links(self, listing_url: str, html: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        urls: set[str] = set()
        for anchor in soup.select("a[href]"):
            href = anchor.get("href")
            if not href:
                continue
            absolute = urljoin(listing_url, href)
            parsed = urlparse(absolute)
            normalized = parsed._replace(fragment="", query=parsed.query).geturl()
            if (
                any(marker in parsed.path.lower() for marker in self.player_url_markers)
                and not self.unsupported_url_reason(normalized)
                and self.is_player_detail_url(normalized)
            ):
                urls.add(normalized)
        return sorted(urls)

    def extract_team_links(self, listing_url: str, html: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        urls: set[str] = set()
        for anchor in soup.select("a[href]"):
            href = anchor.get("href")
            if not href:
                continue
            absolute = urljoin(listing_url, href)
            parsed = urlparse(absolute)
            normalized = parsed._replace(fragment="", query=parsed.query).geturl()
            if (
                any(marker in parsed.path.lower() for marker in self.team_url_markers)
                and not self.unsupported_url_reason(normalized)
                and self.is_team_detail_url(normalized)
            ):
                urls.add(normalized)
        return sorted(urls)

    def extract_league_links(self, listing_url: str, html: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        urls: set[str] = set()
        for anchor in soup.select("a[href]"):
            href = anchor.get("href")
            if not href:
                continue
            absolute = urljoin(listing_url, href)
            parsed = urlparse(absolute)
            normalized = parsed._replace(fragment="", query=parsed.query).geturl()
            if (
                any(marker in parsed.path.lower() for marker in self.league_url_markers)
                and not self.unsupported_url_reason(normalized)
                and self.is_league_detail_url(normalized)
            ):
                urls.add(normalized)
        return sorted(urls)

    def extract_next_listing_links(self, listing_url: str, html: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        urls: set[str] = set()
        selectors = [
            "a[rel='next']",
            "a.next",
            ".pagination a",
            "nav a",
        ]
        for selector in selectors:
            for anchor in soup.select(selector):
                href = anchor.get("href")
                if not href:
                    continue
                text = (anchor.get_text(" ") or "").strip().lower()
                rel = " ".join(anchor.get("rel", [])).lower() if anchor.get("rel") else ""
                if "next" in rel or text in {"next", ">", "»", "siguiente"} or text.isdigit():
                    absolute = urljoin(listing_url, href)
                    parsed = urlparse(absolute)
                    normalized = parsed._replace(fragment="").geturl()
                    if not self.unsupported_url_reason(normalized):
                        urls.add(normalized)
        return sorted(urls)

    def discover_player_urls(self, listing_urls: list[str], max_pages: int = 1) -> list[str]:
        discovered: list[str] = []
        seen: set[str] = set()
        queue = list(listing_urls[:max_pages])

        while queue and len(seen) < max_pages:
            url = queue.pop(0)
            if url in seen:
                continue
            seen.add(url)
            html = self.fetch(url)
            if not html:
                continue
            for player_url in self.extract_player_links(url, html):
                if player_url not in discovered:
                    discovered.append(player_url)
            for next_url in self.extract_next_listing_links(url, html):
                if next_url not in seen and next_url not in queue and len(seen) + len(queue) < max_pages:
                    queue.append(next_url)

        logger.info("URLs de jugadores descubiertas: %s", len(discovered))
        return discovered

    def discover_players_from_team_urls(self, team_urls: list[str]) -> list[str]:
        discovered: list[str] = []
        for team_url in team_urls:
            if not self.is_team_detail_url(team_url):
                logger.warning("Se salta URL que no parece de equipo: %s", team_url)
                continue
            html = self.fetch(team_url)
            if not html:
                continue
            for player_url in self.extract_player_links(team_url, html):
                if player_url not in discovered:
                    discovered.append(player_url)
        logger.info("Jugadores descubiertos desde equipos: %s", len(discovered))
        return discovered

    def discover_team_urls_from_league_urls(self, league_urls: list[str]) -> list[str]:
        discovered: list[str] = []
        for league_url in league_urls:
            if not (self.is_league_detail_url(league_url) or self.is_leagues_index_url(league_url)):
                logger.warning("Se salta URL que no parece de liga/listado de ligas: %s", league_url)
                continue
            html = self.fetch(league_url)
            if not html:
                continue
            for team_url in self.extract_team_links(league_url, html):
                if team_url not in discovered:
                    discovered.append(team_url)
        logger.info("Equipos descubiertos desde ligas: %s", len(discovered))
        return discovered

    def discover_all_team_urls(self, leagues_index_url: str) -> list[str]:
        html = self.fetch(leagues_index_url)
        if not html:
            return []
        league_urls = self.extract_league_links(leagues_index_url, html)
        if self.is_league_detail_url(leagues_index_url):
            league_urls.insert(0, leagues_index_url)
        league_urls = list(dict.fromkeys(league_urls))
        logger.info("Ligas descubiertas: %s", len(league_urls))
        return self.discover_team_urls_from_league_urls(league_urls)

    def expand_urls_to_player_urls(self, urls: list[str], max_pages: int = 1) -> tuple[list[str], pd.DataFrame]:
        player_urls: list[str] = []
        team_urls: list[str] = []
        league_urls: list[str] = []
        listing_urls: list[str] = []
        errors: list[dict[str, str]] = []

        for url in urls:
            reason = self.unsupported_url_reason(url)
            if reason:
                errors.append({"url": url, "source": self.source, "error": reason})
                continue
            if self.is_player_detail_url(url):
                player_urls.append(url)
            elif self.is_team_detail_url(url):
                team_urls.append(url)
            elif self.is_league_detail_url(url):
                league_urls.append(url)
            elif self.is_leagues_index_url(url):
                team_urls.extend(self.discover_all_team_urls(url))
            else:
                listing_urls.append(url)

        if league_urls:
            team_urls.extend(self.discover_team_urls_from_league_urls(list(dict.fromkeys(league_urls))))
        if team_urls:
            player_urls.extend(self.discover_players_from_team_urls(list(dict.fromkeys(team_urls))))
        if listing_urls:
            player_urls.extend(self.discover_player_urls(list(dict.fromkeys(listing_urls)), max_pages=max_pages))

        return list(dict.fromkeys(player_urls)), pd.DataFrame(errors)

    def scrape_player_urls(self, urls: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
        records: list[dict[str, object]] = []
        errors: list[dict[str, str]] = []

        for url in urls:
            try:
                reason = self.unsupported_url_reason(url)
                if reason:
                    errors.append({"url": url, "source": self.source, "error": reason})
                    logger.warning("Se salta URL que no es PES %s: %s", TARGET_GAME_YEAR, url)
                    continue
                if not self.is_player_detail_url(url):
                    errors.append({"url": url, "source": self.source, "error": "not_player_detail_url"})
                    logger.warning("Se salta URL que no parece una ficha de jugador: %s", url)
                    continue
                html = self.fetch(url)
                if not html:
                    errors.append({"url": url, "source": self.source, "error": "download_failed"})
                    continue
                record = parse_player_html(html, source=self.source, source_url=url)
                records.append(record)
            except Exception as exc:  # noqa: BLE001 - one bad page must not stop the batch.
                logger.exception("Error procesando %s", url)
                errors.append({"url": url, "source": self.source, "error": str(exc)})

        players = clean_dataset(pd.DataFrame(records)) if records else pd.DataFrame()
        error_frame = pd.DataFrame(errors)
        return players, error_frame


class PESMasterScraper(CachedScraper):
    source = "pesmaster"
    allowed_domains = ("pesmaster.com", "www.pesmaster.com")
    player_url_markers = ("/player/",)
    team_url_markers = ("/team/",)
    league_url_markers = ("/league/",)

    def is_player_detail_url(self, url: str) -> bool:
        path = urlparse(url).path.lower()
        return bool(
            path.endswith("/")
            and any(part == "player" for part in path.split("/"))
            and path.rstrip("/").split("/")[-1].isdigit()
        )

    def is_team_detail_url(self, url: str) -> bool:
        path = urlparse(url).path.lower()
        return bool(
            path.endswith("/")
            and any(part == "team" for part in path.split("/"))
            and path.rstrip("/").split("/")[-1].isdigit()
        )

    def is_league_detail_url(self, url: str) -> bool:
        path = urlparse(url).path.lower()
        return bool(
            path.endswith("/")
            and any(part == "league" for part in path.split("/"))
            and path.rstrip("/").split("/")[-1].isdigit()
        )

    def is_leagues_index_url(self, url: str) -> bool:
        parsed = urlparse(url)
        return parsed.path.lower().rstrip("/") == "/pes-2018" and parsed.fragment.lower() == "leagues"


def read_urls_file(path: Path) -> list[str]:
    urls: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        urls.append(line.split(",")[0].strip())
    return urls


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scraper PES Master con cache local.")
    parser.add_argument("--url", action="append", default=[], help="URL directa de jugador/equipo/liga.")
    parser.add_argument("--urls-file", type=Path, help="TXT/CSV con una URL por linea.")
    parser.add_argument("--listing-url", action="append", default=[], help="URL de listado/busqueda/equipo/liga.")
    parser.add_argument(
        "--discover-all-teams",
        action="store_true",
        help="Busca equipos desde https://www.pesmaster.com/pes-2018/#leagues y scrapea sus jugadores.",
    )
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--output", type=Path, default=RAW_DIR / "pesmaster_players_raw.csv")
    parser.add_argument("--errors-output", type=Path, default=OUTPUTS_DIR / "pesmaster_scrape_errors.csv")
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--refresh-cache", action="store_true")
    return parser.parse_args()


def main() -> None:
    setup_logging(OUTPUTS_DIR / "scraper_pesmaster.log")
    args = parse_args()
    urls = list(args.url)
    if args.urls_file:
        urls.extend(read_urls_file(args.urls_file))
    if args.listing_url:
        urls.extend(args.listing_url)
    if args.discover_all_teams:
        urls.append("https://www.pesmaster.com/pes-2018/#leagues")
    scraper = PESMasterScraper(delay_seconds=args.delay, refresh_cache=args.refresh_cache)
    urls = list(dict.fromkeys(urls))

    if not urls:
        raise SystemExit("No se pasaron URLs. Usa --url, --urls-file o --listing-url.")

    urls, expansion_errors = scraper.expand_urls_to_player_urls(urls, max_pages=args.max_pages)
    players, errors = scraper.scrape_player_urls(urls)
    if not expansion_errors.empty:
        errors = pd.concat([expansion_errors, errors], ignore_index=True, sort=False)
    save_csv_excel(players, args.output)
    if not errors.empty:
        args.errors_output.parent.mkdir(parents=True, exist_ok=True)
        save_csv_excel(errors, args.errors_output)
    logger.info("Scraping terminado: %s jugadores -> %s", len(players), args.output)


if __name__ == "__main__":
    main()
