#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Format player names in the `name` column of a CSV file.

Behavior:
- Ask for the path to `All players exported.csv` (manual input or file picker).
- Modify only `name` values that contain at least one lowercase letter.
- Keep resulting names at 15 characters max.
- Save output as a new file: `<original_name>_formatted.csv`.
"""

from __future__ import annotations

import csv
from pathlib import Path
import tkinter as tk
from tkinter import filedialog


MAX_NAME_LENGTH = 15
TARGET_FILENAME = "All players exported.csv"


def ask_csv_path() -> Path:
    """Prompt user for CSV path or let them pick the file."""
    while True:
        entered = input(
            f"Enter full path to '{TARGET_FILENAME}' (leave empty to browse): "
        ).strip().strip('"')
        if entered:
            path = Path(entered).expanduser().resolve()
        else:
            root = tk.Tk()
            root.withdraw()
            selected = filedialog.askopenfilename(
                title=f"Select {TARGET_FILENAME}",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            )
            root.destroy()
            if not selected:
                print("No file selected. Try again.")
                continue
            path = Path(selected).resolve()

        if not path.exists():
            print("File does not exist. Try again.")
            continue
        if not path.is_file():
            print("Path is not a file. Try again.")
            continue
        if path.suffix.lower() != ".csv":
            print("Selected file is not a CSV. Try again.")
            continue
        return path


def has_lowercase(value: str) -> bool:
    """Return True if value contains at least one lowercase letter."""
    return any(ch.islower() for ch in value)


def ask_manual_name(original_name: str, reason: str) -> str:
    """Prompt user for a valid manual replacement (<= 15 chars)."""
    print(f"\nManual input required for: '{original_name}'")
    print(f"Reason: {reason}")
    while True:
        replacement = input("Enter replacement name (max 15 characters): ").strip()
        if not replacement:
            print("Replacement cannot be empty.")
            continue
        if len(replacement) > MAX_NAME_LENGTH:
            print("Replacement is too long.")
            continue
        return replacement


def format_name(name: str) -> tuple[str, bool]:
    """
    Return (new_name, changed).
    Only names with at least one lowercase letter are eligible for modification.
    """
    raw_name = name or ""
    if not has_lowercase(raw_name):
        return raw_name, False

    words = [part for part in raw_name.split() if part]
    if not words:
        return raw_name, False

    if len(words) >= 3:
        manual = ask_manual_name(raw_name, "Name has 3 or more words.")
        return manual, manual != raw_name

    if len(words) == 1:
        if len(words[0]) <= MAX_NAME_LENGTH:
            return words[0], words[0] != raw_name
        manual = ask_manual_name(raw_name, "Single-word name exceeds 15 characters.")
        return manual, manual != raw_name

    first_name, last_name = words[0], words[-1]
    formatted = f"{first_name[0]}. {last_name}"

    if len(formatted) <= MAX_NAME_LENGTH:
        return formatted, formatted != raw_name

    if len(last_name) <= MAX_NAME_LENGTH:
        return last_name, last_name != raw_name

    manual = ask_manual_name(
        raw_name,
        "Formatted name exceeds 15 characters and last name also exceeds 15 characters.",
    )
    return manual, manual != raw_name


def detect_dialect(csv_path: Path) -> csv.Dialect:
    """Detect CSV dialect from file sample, with safe fallback."""
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        sample = fh.read(8192)
    try:
        return csv.Sniffer().sniff(sample)
    except csv.Error:
        return csv.excel


def process_csv(csv_path: Path) -> Path:
    """Read CSV, modify only `name` column, and write output CSV."""
    dialect = detect_dialect(csv_path)

    with csv_path.open("r", encoding="utf-8-sig", newline="") as in_file:
        reader = csv.DictReader(in_file, dialect=dialect)
        fieldnames = list(reader.fieldnames or [])
        if "name" not in fieldnames:
            raise ValueError("The CSV does not contain a 'name' column.")

        rows = []
        changed_count = 0
        for row in reader:
            updated_row = dict(row)
            original = updated_row.get("name", "")
            new_name, changed = format_name(original)
            if changed:
                changed_count += 1
            updated_row["name"] = new_name
            rows.append(updated_row)

    output_path = csv_path.with_name(f"{csv_path.stem}_formatted.csv")
    with output_path.open("w", encoding="utf-8-sig", newline="") as out_file:
        writer = csv.DictWriter(out_file, fieldnames=fieldnames, dialect=dialect)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nDone. Updated {changed_count} row(s).")
    print(f"Output file: {output_path}")
    return output_path


def main() -> None:
    """Program entry point."""
    try:
        csv_path = ask_csv_path()
        process_csv(csv_path)
    except KeyboardInterrupt:
        print("\nOperation canceled by user.")
    except Exception as exc:
        print(f"\nError: {exc}")


if __name__ == "__main__":
    main()
