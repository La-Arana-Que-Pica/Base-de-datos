from __future__ import annotations

import argparse
import logging
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup

from config import OUTPUTS_DIR, RAW_DIR, save_csv_excel, setup_logging
from scraper_pesmaster import CachedScraper, read_urls_file


logger = logging.getLogger(__name__)


class PESDBScraper(CachedScraper):
    source = "pesdb"
    allowed_domains = ("pesdb.net", "www.pesdb.net")
    player_url_markers = ("?id=",)

    def is_player_detail_url(self, url: str) -> bool:
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        return "id" in query and any(value.isdigit() for value in query["id"])

    def extract_player_links(self, listing_url: str, html: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        urls: set[str] = set()
        for anchor in soup.select("a[href]"):
            href = anchor.get("href")
            if not href:
                continue
            absolute = urljoin(listing_url, href)
            parsed = urlparse(absolute)
            query = parse_qs(parsed.query)
            normalized = parsed._replace(fragment="").geturl()
            if "id" in query and not self.unsupported_url_reason(normalized):
                urls.add(normalized)
        return sorted(urls)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scraper PESDB con cache local.")
    parser.add_argument("--url", action="append", default=[], help="URL directa de jugador.")
    parser.add_argument("--urls-file", type=Path, help="TXT/CSV con una URL por linea.")
    parser.add_argument("--listing-url", action="append", default=[], help="URL de listado/busqueda.")
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--output", type=Path, default=RAW_DIR / "pesdb_players_raw.csv")
    parser.add_argument("--errors-output", type=Path, default=OUTPUTS_DIR / "pesdb_scrape_errors.csv")
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--refresh-cache", action="store_true")
    return parser.parse_args()


def main() -> None:
    setup_logging(OUTPUTS_DIR / "scraper_pesdb.log")
    args = parse_args()
    urls = list(args.url)
    if args.urls_file:
        urls.extend(read_urls_file(args.urls_file))

    scraper = PESDBScraper(delay_seconds=args.delay, refresh_cache=args.refresh_cache)
    if args.listing_url:
        urls.extend(scraper.discover_player_urls(args.listing_url, max_pages=args.max_pages))
    urls = list(dict.fromkeys(urls))

    if not urls:
        raise SystemExit("No se pasaron URLs. Usa --url, --urls-file o --listing-url.")

    players, errors = scraper.scrape_player_urls(urls)
    save_csv_excel(players, args.output)
    if not errors.empty:
        args.errors_output.parent.mkdir(parents=True, exist_ok=True)
        save_csv_excel(errors, args.errors_output)
    logger.info("Scraping terminado: %s jugadores -> %s", len(players), args.output)


if __name__ == "__main__":
    main()
