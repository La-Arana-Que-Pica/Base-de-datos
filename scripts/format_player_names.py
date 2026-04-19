#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GUI tool to format player names in the `name` column of a CSV file."""

from __future__ import annotations

import csv
from pathlib import Path
import tkinter as tk
from typing import Callable
from tkinter import filedialog, messagebox, simpledialog


MAX_NAME_LENGTH = 15
TARGET_FILENAME = "All players exported.csv"
class UserCancelledInput(Exception):
    """Raised when the user cancels required manual name input."""


def has_lowercase(value: str) -> bool:
    """Return True if value contains at least one lowercase letter."""
    return any(ch.islower() for ch in value)


def format_name(
    name: str, manual_name_provider: Callable[[str, str], str]
) -> tuple[str, bool]:
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
        manual = manual_name_provider(raw_name, "Name has 3 or more words.")
        return manual, manual != raw_name

    if len(words) == 1:
        if len(words[0]) <= MAX_NAME_LENGTH:
            return words[0], words[0] != raw_name
        manual = manual_name_provider(raw_name, "Single-word name exceeds 15 characters.")
        return manual, manual != raw_name

    first_name, last_name = words[0], words[-1]
    formatted = f"{first_name[0]}. {last_name}"

    if len(formatted) <= MAX_NAME_LENGTH:
        return formatted, formatted != raw_name

    if len(last_name) <= MAX_NAME_LENGTH:
        return last_name, last_name != raw_name

    manual = manual_name_provider(
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


def process_csv(
    csv_path: Path, manual_name_provider: Callable[[str, str], str]
) -> tuple[Path, int]:
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
            new_name, changed = format_name(original, manual_name_provider)
            if changed:
                changed_count += 1
            updated_row["name"] = new_name
            rows.append(updated_row)

    output_path = csv_path.with_name(f"{csv_path.stem}_formatted.csv")
    with output_path.open("w", encoding="utf-8-sig", newline="") as out_file:
        writer = csv.DictWriter(out_file, fieldnames=fieldnames, dialect=dialect)
        writer.writeheader()
        writer.writerows(rows)

    return output_path, changed_count


class NameFormatterApp:
    """Simple Tkinter interface for CSV name formatting."""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Player Name Formatter")
        self.root.resizable(False, False)

        self.selected_csv: Path | None = None
        self.manual_replacement_cache: dict[str, str] = {}
        self.status_var = tk.StringVar(
            value=f"Select '{TARGET_FILENAME}' to begin."
        )

        self._build_ui()

    def _build_ui(self) -> None:
        container = tk.Frame(self.root, padx=14, pady=14)
        container.pack(fill="both", expand=True)

        select_button = tk.Button(
            container,
            text="Select CSV file",
            width=24,
            command=self.select_csv_file,
        )
        select_button.pack(anchor="w", pady=(0, 8))

        self.process_button = tk.Button(
            container,
            text="Process file",
            width=24,
            state="disabled",
            command=self.process_selected_file,
        )
        self.process_button.pack(anchor="w", pady=(0, 10))

        status_label = tk.Label(
            container,
            textvariable=self.status_var,
            justify="left",
            anchor="w",
            wraplength=520,
        )
        status_label.pack(fill="x")

    def set_status(self, message: str) -> None:
        """Update status text shown in the main window."""
        self.status_var.set(message)

    def select_csv_file(self) -> None:
        """Open file picker and validate selected CSV."""
        selected = filedialog.askopenfilename(
            title=f"Select {TARGET_FILENAME}",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        )
        if not selected:
            self.set_status("No file selected.")
            return

        path = Path(selected).resolve()
        if not path.is_file():
            messagebox.showerror("Invalid file", "The selected path is not a valid file.")
            self.set_status("Invalid file selected.")
            return
        if path.suffix.lower() != ".csv":
            messagebox.showerror("Invalid file", "The selected file is not a CSV.")
            self.set_status("Invalid file selected (not CSV).")
            return
        if path.name != TARGET_FILENAME:
            messagebox.showerror(
                "Invalid file",
                f"Please select the exact file named '{TARGET_FILENAME}'.",
            )
            self.set_status(f"Invalid file selected (must be '{TARGET_FILENAME}').")
            return

        self.selected_csv = path
        self.process_button.config(state="normal")
        self.set_status(f"File loaded: {path}")

    def prompt_manual_name(self, original_name: str, reason: str) -> str:
        """Ask user for a valid manual replacement name via popup dialog."""
        cached = self.manual_replacement_cache.get(original_name)
        if cached is not None:
            return cached

        prompt = (
            f"Original name: {original_name}\n"
            f"Reason: {reason}\n\n"
            f"Enter replacement name (max {MAX_NAME_LENGTH} characters):"
        )
        while True:
            replacement = simpledialog.askstring(
                "Manual replacement required",
                prompt,
                parent=self.root,
            )
            if replacement is None:
                raise UserCancelledInput(
                    "Processing canceled by user during manual input."
                )

            replacement = replacement.strip()
            if not replacement:
                messagebox.showwarning(
                    "Invalid name",
                    "Replacement cannot be empty.",
                    parent=self.root,
                )
                continue
            if len(replacement) > MAX_NAME_LENGTH:
                messagebox.showwarning(
                    "Invalid name",
                    f"Replacement must be {MAX_NAME_LENGTH} characters or fewer.",
                    parent=self.root,
                )
                continue

            self.manual_replacement_cache[original_name] = replacement
            return replacement

    def process_selected_file(self) -> None:
        """Run CSV processing for the selected file and show result messages."""
        if self.selected_csv is None:
            messagebox.showwarning(
                "No file selected",
                "Please select a CSV file before processing.",
                parent=self.root,
            )
            self.set_status("No file selected.")
            return

        csv_path = self.selected_csv
        try:
            output_path, changed_count = process_csv(
                csv_path,
                self.prompt_manual_name,
            )
            messagebox.showinfo(
                "Processing complete",
                f"Updated rows: {changed_count}\nSaved file: {output_path}",
                parent=self.root,
            )
            self.set_status(
                f"Processing complete. Updated {changed_count} row(s). Output: {output_path}"
            )
        except UserCancelledInput as exc:
            messagebox.showwarning("Processing canceled", str(exc), parent=self.root)
            self.set_status("Processing canceled by user.")
        except Exception as exc:
            messagebox.showerror("Processing error", str(exc), parent=self.root)
            self.set_status(f"Processing failed: {exc}")


def main() -> None:
    """Program entry point."""
    root = tk.Tk()
    NameFormatterApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
