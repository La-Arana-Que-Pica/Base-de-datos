from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from config import (
    BASE_DIR,
    CALIBRATION_REPORT_PATH,
    CALIBRATION_SCORES_PATH,
    CACHE_DIR,
    DATASET_PATH,
    EVALUATION_REPORT_PATH,
    EVALUATION_SUMMARY_PATH,
    EVALUATION_WORST_PLAYERS_PATH,
    MODEL_SCORES_PATH,
    MODELS_DIR,
    OUTPUTS_DIR,
    PREDICTIONS_PATH,
    RAW_DIR,
    READABLE_FORMULAS_PATH,
    ensure_directories,
    save_csv_excel,
    setup_logging,
)
from calibrate_formula import refine_existing_formula
from evaluate_formula import evaluate_formula
from parser import build_dataset, parse_html_cache
from predict import predict
from scraper_pesdb import PESDBScraper
from scraper_pesmaster import PESMasterScraper, read_urls_file
from train_model import train_all


def project_path(path_text: str | Path) -> Path:
    path = Path(path_text).expanduser()
    return path if path.is_absolute() else BASE_DIR / path


PESMASTER_LEAGUES_URL = "https://www.pesmaster.com/pes-2018/#leagues"


def add_scraper_args(parser: argparse.ArgumentParser, default_output: Path, pesmaster: bool = False) -> None:
    parser.add_argument("--url", action="append", default=[], help="URL directa de jugador/equipo/liga.")
    parser.add_argument("--urls-file", type=Path, help="TXT/CSV con una URL por linea.")
    parser.add_argument("--listing-url", action="append", default=[], help="URL de listado/busqueda/equipo/liga.")
    if pesmaster:
        parser.add_argument(
            "--discover-all-teams",
            action="store_true",
            help="Busca todas las ligas/equipos desde PES Master PES 2018 y scrapea sus jugadores.",
        )
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--refresh-cache", action="store_true")


def collect_urls(args: argparse.Namespace, scraper: PESMasterScraper | PESDBScraper) -> tuple[list[str], pd.DataFrame]:
    urls = list(args.url)
    if args.urls_file:
        urls.extend(read_urls_file(args.urls_file))
    if args.listing_url:
        urls.extend(args.listing_url)
    if getattr(args, "discover_all_teams", False):
        urls.append(PESMASTER_LEAGUES_URL)
    return scraper.expand_urls_to_player_urls(list(dict.fromkeys(urls)), max_pages=args.max_pages)


def run_scraper(args: argparse.Namespace, scraper: PESMasterScraper | PESDBScraper) -> None:
    urls, expansion_errors = collect_urls(args, scraper)
    if not urls:
        raise SystemExit("No se pasaron URLs. Usa --url, --urls-file o --listing-url.")
    players, errors = scraper.scrape_player_urls(urls)
    if not expansion_errors.empty:
        errors = pd.concat([expansion_errors, errors], ignore_index=True, sort=False)
    save_csv_excel(players, args.output)
    if not errors.empty:
        errors_path = OUTPUTS_DIR / f"{scraper.source}_scrape_errors.csv"
        save_csv_excel(errors, errors_path)
    print(f"Scraping {scraper.source}: {len(players)} jugadores -> {args.output}")


def pause() -> None:
    input("\nPresiona ENTER para volver al menu...")


def ask_text(prompt: str, default: str | None = None, required: bool = False) -> str:
    while True:
        suffix = f" [{default}]" if default else ""
        value = input(f"{prompt}{suffix}: ").strip()
        if value:
            return value
        if default is not None:
            return default
        if not required:
            return ""
        print("Este dato es obligatorio.")


def ask_int(prompt: str, default: int) -> int:
    while True:
        value = ask_text(prompt, str(default))
        try:
            return int(value)
        except ValueError:
            print("Ingresa un numero entero.")


def ask_float(prompt: str, default: float) -> float:
    while True:
        value = ask_text(prompt, str(default))
        try:
            return float(value.replace(",", "."))
        except ValueError:
            print("Ingresa un numero valido.")


def ask_yes_no(prompt: str, default: bool = False) -> bool:
    hint = "S/n" if default else "s/N"
    value = input(f"{prompt} [{hint}]: ").strip().lower()
    if not value:
        return default
    return value in {"s", "si", "sí", "y", "yes"}


def print_header() -> None:
    print("\n" + "=" * 64)
    print(" FORMULA MEDIAS PES 2018")
    print(" Fuente de datos: PES Master y PESDB")
    print("=" * 64)


def print_status() -> None:
    paths = [
        ("Dataset procesado", DATASET_PATH),
        ("Modelos", MODELS_DIR),
        ("Resultados", OUTPUTS_DIR),
        ("Predicciones", PREDICTIONS_PATH),
        ("Calibracion", CALIBRATION_SCORES_PATH),
        ("Informe formula", EVALUATION_REPORT_PATH),
    ]
    print("\nEstado del proyecto:")
    for label, path in paths:
        exists = "OK" if path.exists() else "pendiente"
        print(f"- {label}: {path} ({exists})")

    raw_csvs = sorted(RAW_DIR.glob("*.csv"))
    if raw_csvs:
        print("\nCSVs raw disponibles:")
        for csv_path in raw_csvs:
            print(f"- {csv_path.name}")
    else:
        print("\nTodavia no hay CSVs raw en data/raw/.")


def choose_scrape_input(source: str) -> tuple[list[str], list[str], Path | None]:
    print("\nComo queres pasar las URLs?")
    print("1. Pegar URLs directas de jugadores/equipos/ligas")
    print("2. Usar un archivo TXT/CSV con URLs de equipos/jugadores/ligas")
    print("3. Usar una URL de listado/busqueda/equipo/liga")
    if source == "pesmaster":
        print("4. Buscar automaticamente todos los equipos desde PES Master")
    option = ask_text("Opcion", "1")

    direct_urls: list[str] = []
    listing_urls: list[str] = []
    urls_file: Path | None = None

    if option == "1":
        print("\nPega una URL por vez. Deja vacio y presiona ENTER para terminar.")
        while True:
            url = ask_text("URL")
            if not url:
                break
            direct_urls.append(url)
    elif option == "2":
        default = "data/raw/pesmaster_team_urls.txt" if source == "pesmaster" else f"data/raw/{source}_urls.txt"
        urls_file = project_path(ask_text("Ruta del archivo de URLs", default))
    elif option == "3":
        listing = ask_text("URL del listado/busqueda", required=True)
        listing_urls.append(listing)
    elif option == "4" and source == "pesmaster":
        listing_urls.append(PESMASTER_LEAGUES_URL)
    else:
        print("Opcion no reconocida. Vuelvo al menu.")

    return direct_urls, listing_urls, urls_file


def menu_scrape(source: str) -> None:
    title = "PES Master" if source == "pesmaster" else "PESDB"
    default_output = RAW_DIR / f"{source}_players_raw.csv"
    print(f"\nScraping desde {title}")
    direct_urls, listing_urls, urls_file = choose_scrape_input(source)
    if not direct_urls and not listing_urls and urls_file is None:
        print("No se cargaron URLs.")
        return

    delay = ask_float("Pausa entre requests en segundos", 1.5)
    refresh_cache = ask_yes_no("Volver a descargar aunque exista cache", False)
    output = project_path(ask_text("CSV de salida", str(default_output.relative_to(BASE_DIR))))
    max_pages = ask_int("Maximo de paginas de listado/busqueda a recorrer", 1) if listing_urls else 1

    scraper = (
        PESMasterScraper(delay_seconds=delay, refresh_cache=refresh_cache)
        if source == "pesmaster"
        else PESDBScraper(delay_seconds=delay, refresh_cache=refresh_cache)
    )

    args = argparse.Namespace(
        url=direct_urls,
        urls_file=urls_file,
        listing_url=listing_urls,
        max_pages=max_pages,
        output=output,
        delay=delay,
        refresh_cache=refresh_cache,
    )
    run_scraper(args, scraper)


def menu_build_dataset() -> None:
    raw_csvs = sorted(RAW_DIR.glob("*.csv"))
    if raw_csvs:
        print("\nSe van a unir estos CSVs de data/raw/:")
        for csv_path in raw_csvs:
            print(f"- {csv_path.name}")
    else:
        print("\nNo hay CSVs raw todavia. Primero scrapea PES Master o PESDB.")
        return

    output = project_path(ask_text("Dataset procesado de salida", str(DATASET_PATH.relative_to(BASE_DIR))))
    build_dataset(raw_csvs, output)
    print(f"\nDataset creado: {output}")


def menu_train() -> None:
    dataset = project_path(ask_text("Dataset para entrenar", str(DATASET_PATH.relative_to(BASE_DIR))))
    if not dataset.exists():
        print("No existe el dataset. Usa primero la opcion 3 para crearlo.")
        return

    print("\nEl entrenamiento usa solo el dataset descargado de PES Master/PESDB.")
    print("No se usan medias manuales ni ajustes externos.")
    print("Prueba varias formulas ancladas y elige por error entero <= 1.")
    print("Puede tardar mas, pero busca una formula mejor por posicion.")
    train_all(dataset, include_random_forest=False)
    print("\nEntrenamiento terminado.")
    print(f"- Metricas: {MODEL_SCORES_PATH}")
    print(f"- Formulas: {READABLE_FORMULAS_PATH}")
    print(f"- Modelos: {MODELS_DIR}")


def menu_refine_formula() -> None:
    dataset = project_path(ask_text("Dataset PES 2018 original para calibrar", str(DATASET_PATH.relative_to(BASE_DIR))))
    if not dataset.exists():
        print("No existe el dataset. Usa primero la opcion 3 para crearlo.")
        return

    print("\nMejora incremental de la formula existente.")
    print("No se entrena desde cero: se conserva la formula base y se agrega un corrector residual chico.")
    print("No usa medias manuales. Solo usa el dataset original de PES Master/PESDB.")
    print("La calibracion se activa por posicion solo si mejora la validacion.")
    scores = refine_existing_formula(dataset)
    print("\nCalibracion terminada.")
    print(f"- Metricas: {CALIBRATION_SCORES_PATH}")
    print(f"- Reporte: {CALIBRATION_REPORT_PATH}")
    if not scores.empty:
        enabled = int(scores["calibracion_activada"].sum())
        print(f"- Posiciones calibradas: {enabled} de {len(scores)}")


def menu_evaluate_formula() -> None:
    dataset = project_path(ask_text("Dataset PES 2018 original para evaluar", str(DATASET_PATH.relative_to(BASE_DIR))))
    if not dataset.exists():
        print("No existe el dataset. Usa primero la opcion 3 para crearlo.")
        return

    print("\nEvaluacion detallada de la formula.")
    print("Se apaga el exact-match por player_id para medir la formula real contra PES 2018 original.")
    paths = evaluate_formula(dataset)
    print("\nInforme generado.")
    print(f"- Resumen: {EVALUATION_SUMMARY_PATH}")
    print(f"- Peores errores: {EVALUATION_WORST_PLAYERS_PATH}")
    print(f"- Reporte TXT: {paths['report']}")


def menu_predict() -> None:
    default_input = "data/processed/jugadores_nuevos.csv"
    input_csv = project_path(ask_text("CSV de jugadores nuevos/modificados", default_input))
    if not input_csv.exists():
        print("No existe ese CSV. Crealo primero con los stats de los jugadores.")
        return
    output = project_path(ask_text("CSV de predicciones de salida", str(PREDICTIONS_PATH.relative_to(BASE_DIR))))
    predict(input_csv, output)
    print(f"\nPredicciones guardadas en: {output}")


def menu_full_flow() -> None:
    print("\nFlujo rapido: crear dataset + entrenar formula.")
    if not ask_yes_no("Continuar", True):
        return
    menu_build_dataset()
    if DATASET_PATH.exists():
        menu_train()


def interactive_menu() -> None:
    while True:
        print_header()
        print("1. Scrapear jugadores desde PES Master")
        print("2. Scrapear jugadores desde PESDB")
        print("3. Crear dataset limpio con los CSVs descargados")
        print("4. Entrenar formula por posicion")
        print("5. Predecir medias de jugadores nuevos/modificados")
        print("6. Flujo rapido: dataset + entrenamiento")
        print("7. Mejorar formula existente (calibracion incremental)")
        print("8. Informe detallado contra PES 2018 original")
        print("9. Ver estado y rutas")
        print("0. Salir")
        option = ask_text("Elegir opcion", "0")

        try:
            if option == "1":
                menu_scrape("pesmaster")
                pause()
            elif option == "2":
                menu_scrape("pesdb")
                pause()
            elif option == "3":
                menu_build_dataset()
                pause()
            elif option == "4":
                menu_train()
                pause()
            elif option == "5":
                menu_predict()
                pause()
            elif option == "6":
                menu_full_flow()
                pause()
            elif option == "7":
                menu_refine_formula()
                pause()
            elif option == "8":
                menu_evaluate_formula()
                pause()
            elif option == "9":
                print_status()
                pause()
            elif option == "0":
                print("Listo. Hasta la proxima.")
                return
            else:
                print("Opcion no reconocida.")
                pause()
        except KeyboardInterrupt:
            print("\nOperacion cancelada.")
            pause()
        except Exception as exc:  # noqa: BLE001 - menu should stay alive after a failed action.
            print(f"\nOcurrio un error: {exc}")
            print("El programa sigue abierto; podes revisar la opcion o intentar otra.")
            pause()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Formula Medias PES 2018")
    subparsers = parser.add_subparsers(dest="command", required=False)

    pesmaster = subparsers.add_parser("scrape-pesmaster", help="Scrapea jugadores desde PES Master.")
    add_scraper_args(pesmaster, RAW_DIR / "pesmaster_players_raw.csv", pesmaster=True)

    pesdb = subparsers.add_parser("scrape-pesdb", help="Scrapea jugadores desde PESDB.")
    add_scraper_args(pesdb, RAW_DIR / "pesdb_players_raw.csv")

    parse_cache = subparsers.add_parser("parse-cache", help="Parsea HTML guardado en cache.")
    parse_cache.add_argument("--cache-dir", type=Path, default=CACHE_DIR)
    parse_cache.add_argument("--source", required=True)
    parse_cache.add_argument("--output", type=Path, default=RAW_DIR / "parsed_cache_raw.csv")

    dataset = subparsers.add_parser("build-dataset", help="Une CSVs raw y genera el dataset procesado.")
    dataset.add_argument("--inputs", nargs="+", type=Path, default=None)
    dataset.add_argument("--output", type=Path, default=DATASET_PATH)

    train = subparsers.add_parser("train", help="Entrena modelos por posicion.")
    train.add_argument("--dataset", type=Path, default=DATASET_PATH)
    train.add_argument("--include-random-forest", action="store_true")

    refine = subparsers.add_parser("refine", help="Mejora la formula existente con calibracion residual.")
    refine.add_argument("--dataset", type=Path, default=DATASET_PATH)

    evaluate = subparsers.add_parser("evaluate", help="Genera un informe detallado contra PES 2018 original.")
    evaluate.add_argument("--dataset", type=Path, default=DATASET_PATH)

    pred = subparsers.add_parser("predict", help="Predice medias para un CSV.")
    pred.add_argument("--csv", type=Path, required=True)
    pred.add_argument("--output", type=Path, default=PREDICTIONS_PATH)

    return parser.parse_args()


def main() -> None:
    ensure_directories()
    setup_logging(OUTPUTS_DIR / "main.log")
    if len(sys.argv) == 1:
        interactive_menu()
        return

    args = parse_args()

    if args.command == "scrape-pesmaster":
        run_scraper(args, PESMasterScraper(delay_seconds=args.delay, refresh_cache=args.refresh_cache))
    elif args.command == "scrape-pesdb":
        run_scraper(args, PESDBScraper(delay_seconds=args.delay, refresh_cache=args.refresh_cache))
    elif args.command == "parse-cache":
        parse_html_cache(args.cache_dir, args.source, args.output)
    elif args.command == "build-dataset":
        inputs = args.inputs or sorted(RAW_DIR.glob("*.csv"))
        build_dataset(inputs, args.output)
    elif args.command == "train":
        train_all(args.dataset, args.include_random_forest)
    elif args.command == "refine":
        refine_existing_formula(args.dataset)
    elif args.command == "evaluate":
        evaluate_formula(args.dataset)
    elif args.command == "predict":
        predict(args.csv, args.output)
    else:
        interactive_menu()


if __name__ == "__main__":
    main()
