#!/usr/bin/env python3
"""
Reorganize Squad Orders
=======================
Reads the order in which players appear in the formation (via "Indice Jugador"
columns) and reorders the player IDs and shirt numbers in "All squads exported.csv"
to match that order.

After reordering:
  • Squad slots 1-11  → Starting XI  (formation slots 1-11)
  • Squad slots 12-18 → Substitutes   (formation slots 12-18)
  • Squad slots 19+   → Reserve players

The formation file is also updated so that visual positions remain identical:
  - "Indice Jugador 1-32" values become sequential [0, 1, 2, ..., 31]
  - Special assignment columns (Capitan, TiroCorto, TiroLargo, EsquinaDerecho,
    EsquinaIzquierdo, Penalti, Cabeceador1, Cabeceador2, Cabeceador3,
    SegundoCobrador) are remapped to the new squad slot indices.

Both CSV files are backed up (with a timestamp) before any modification.
"""

import csv
import os
import shutil
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import messagebox, ttk

# ---------------------------------------------------------------------------
# Paths (resolved relative to this script's location)
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent / "database"
SQUADS_FILE = DB_DIR / "All squads exported.csv"
FORMATIONS_FILE = DB_DIR / "All formations exported.csv"
BACKUP_DIR = DB_DIR / "backups"

CSV_DELIMITER = ";"
CSV_ENCODING = "utf-8-sig"   # handles BOM present in these files

# Formation slot groups
STARTER_SLOTS = range(1, 12)       # 1–11
SUB_SLOTS = range(12, 19)          # 12–18
RESERVE_SLOTS_START = 19           # 19+

# Value used in the formation file to indicate "not assigned"
NOT_ASSIGNED = 255

# Special assignment columns that store 0-based squad-slot indices
SPECIAL_ASSIGNMENT_COLS = [
    "Capitan",
    "TiroCorto",
    "TiroLargo",
    "EsquinaDerecho",
    "EsquinaIzquierdo",
    "Penalti",
    "Cabeceador1",
    "Cabeceador2",
    "Cabeceador3",
    "SegundoCobrador",
]


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------

def load_csv(path: Path) -> tuple[list[str], list[dict]]:
    """Return (headers, rows) where rows is a list of dict."""
    with open(path, "r", encoding=CSV_ENCODING, newline="") as fh:
        reader = csv.DictReader(fh, delimiter=CSV_DELIMITER)
        headers = list(reader.fieldnames or [])
        rows = [dict(row) for row in reader]
    return headers, rows


def save_csv(path: Path, headers: list[str], rows: list[dict]) -> None:
    """Write rows back to CSV preserving the original column order and BOM."""
    with open(path, "w", encoding=CSV_ENCODING, newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=headers,
            delimiter=CSV_DELIMITER,
            extrasaction="ignore",
            lineterminator="\r\n",
        )
        writer.writeheader()
        writer.writerows(rows)


def find_row_by_id(rows: list[dict], team_id: str) -> dict | None:
    """Return the first row whose first column equals team_id, or None."""
    for row in rows:
        first_val = next(iter(row.values()), None)
        if first_val == team_id:
            return row
    return None


# ---------------------------------------------------------------------------
# Backup helpers
# ---------------------------------------------------------------------------

def create_backups(team_id: str) -> tuple[Path, Path]:
    """Copy both CSV files into BACKUP_DIR with a timestamp suffix."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    squads_bak = BACKUP_DIR / f"All squads exported_{stamp}_team{team_id}.csv"
    formations_bak = BACKUP_DIR / f"All formations exported_{stamp}_team{team_id}.csv"
    shutil.copy2(SQUADS_FILE, squads_bak)
    shutil.copy2(FORMATIONS_FILE, formations_bak)
    return squads_bak, formations_bak


# ---------------------------------------------------------------------------
# Core reorder logic
# ---------------------------------------------------------------------------

def get_formation_indices(formation_row: dict) -> list[int]:
    """Extract Indice Jugador 1–32 as a 0-based list (length 32)."""
    indices = []
    for i in range(1, 33):
        raw = formation_row.get(f"Indice Jugador {i}")
        try:
            indices.append(int(raw))  # type: ignore[arg-type]
        except (ValueError, TypeError):
            indices.append(i - 1)
    return indices


def build_reorder_plan(
    squad_row: dict,
    formation_indices: list[int],
) -> tuple[list[int], list[int], list[int]]:
    """
    Build the reordered player-ID list, shirt-number list, and the new
    Indice Jugador list.

    Returns (new_players, new_shirts, new_indices) where each list has
    length 32.  Slots beyond Total Players remain 0.
    """
    total = int(squad_row.get("Total Players") or 0)

    old_players = [int(squad_row.get(f"Player {i}", 0)) for i in range(1, 33)]
    old_shirts = [int(squad_row.get(f"Shirt number {i}", 0)) for i in range(1, 33)]

    new_players: list[int] = [0] * 32
    new_shirts: list[int] = [0] * 32
    new_indices: list[int] = list(range(32))  # sequential after reorder

    for new_slot_idx, old_squad_idx in enumerate(formation_indices):
        if new_slot_idx >= total:
            break
        if 0 <= old_squad_idx < 32:
            new_players[new_slot_idx] = old_players[old_squad_idx]
            new_shirts[new_slot_idx] = old_shirts[old_squad_idx]

    return new_players, new_shirts, new_indices


def build_old_to_new_map(formation_indices: list[int]) -> dict[int, int]:
    """Map old 0-based squad-slot index → new 0-based squad-slot index."""
    old_to_new: dict[int, int] = {}
    for new_idx, old_idx in enumerate(formation_indices):
        if old_idx not in old_to_new:
            old_to_new[old_idx] = new_idx
    return old_to_new


def remap_special_assignments(
    formation_row: dict,
    old_to_new: dict[int, int],
) -> dict:
    """Return an updated formation_row with remapped special assignment values."""
    updated = dict(formation_row)
    for col in SPECIAL_ASSIGNMENT_COLS:
        raw = formation_row.get(col, str(NOT_ASSIGNED))
        try:
            val = int(raw)
        except (ValueError, TypeError):
            continue
        if val == NOT_ASSIGNED:
            continue
        new_val = old_to_new.get(val, val)
        updated[col] = str(new_val)
    return updated


def apply_reorder(team_id: str) -> tuple[str, str]:
    """
    Load both CSV files, reorder the squad for team_id, and save.
    Returns (squads_backup_path, formations_backup_path) as strings.
    Raises ValueError with a descriptive message on bad input.
    """
    sq_headers, sq_rows = load_csv(SQUADS_FILE)
    fm_headers, fm_rows = load_csv(FORMATIONS_FILE)

    squad_row = find_row_by_id(sq_rows, team_id)
    if squad_row is None:
        raise ValueError(f"Team ID {team_id!r} not found in squads file.")

    formation_row = find_row_by_id(fm_rows, team_id)
    if formation_row is None:
        raise ValueError(f"Team ID {team_id!r} not found in formations file.")

    # Create backups before touching anything
    sq_bak, fm_bak = create_backups(team_id)

    formation_indices = get_formation_indices(formation_row)
    new_players, new_shirts, new_indices = build_reorder_plan(squad_row, formation_indices)
    old_to_new = build_old_to_new_map(formation_indices)

    # Update squad row in-place
    for i in range(32):
        squad_row[f"Player {i + 1}"] = str(new_players[i])
        squad_row[f"Shirt number {i + 1}"] = str(new_shirts[i])

    # Update formation row: Indice Jugador → sequential, remap special cols
    updated_fm_row = remap_special_assignments(formation_row, old_to_new)
    for i, idx in enumerate(new_indices):
        updated_fm_row[f"Indice Jugador {i + 1}"] = str(idx)

    # Write squad rows
    for idx, row in enumerate(sq_rows):
        first_val = next(iter(row.values()), None)
        if first_val == team_id:
            sq_rows[idx] = squad_row
            break

    # Write formation rows
    for idx, row in enumerate(fm_rows):
        first_val = next(iter(row.values()), None)
        if first_val == team_id:
            fm_rows[idx] = updated_fm_row
            break

    save_csv(SQUADS_FILE, sq_headers, sq_rows)
    save_csv(FORMATIONS_FILE, fm_headers, fm_rows)

    return str(sq_bak), str(fm_bak)


# ---------------------------------------------------------------------------
# Preview builder
# ---------------------------------------------------------------------------

def build_preview_rows(team_id: str) -> list[dict]:
    """
    Return a list of dicts describing the formation-ordered squad for preview.
    Keys: slot, category, player_id, shirt_number.
    """
    _, sq_rows = load_csv(SQUADS_FILE)
    _, fm_rows = load_csv(FORMATIONS_FILE)

    squad_row = find_row_by_id(sq_rows, team_id)
    if squad_row is None:
        raise ValueError(f"Team ID {team_id!r} not found in squads file.")
    formation_row = find_row_by_id(fm_rows, team_id)
    if formation_row is None:
        raise ValueError(f"Team ID {team_id!r} not found in formations file.")

    total = int(squad_row.get("Total Players", 0))
    formation_indices = get_formation_indices(formation_row)

    old_players = [int(squad_row.get(f"Player {i}", 0)) for i in range(1, 33)]
    old_shirts = [int(squad_row.get(f"Shirt number {i}", 0)) for i in range(1, 33)]

    rows = []
    for form_slot in range(1, total + 1):
        old_idx = formation_indices[form_slot - 1]
        if old_idx < 0 or old_idx >= 32:
            continue

        pid = old_players[old_idx]
        shirt = old_shirts[old_idx]

        if form_slot <= 11:
            category = "Titular"
        elif form_slot <= 18:
            category = "Suplente"
        else:
            category = "Reserva"

        rows.append(
            {
                "slot": form_slot,
                "category": category,
                "player_id": pid,
                "shirt_number": shirt,
                "old_squad_slot": old_idx + 1,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------

class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Reorganizar Plantillas — Base de datos")
        self.geometry("920x640")
        self.resizable(True, True)
        self.configure(bg="#1e1e2e")

        self._build_menu()
        self._build_header()
        self._build_input_row()
        self._build_preview_area()
        self._build_status_bar()

    # ------------------------------------------------------------------
    # Layout builders
    # ------------------------------------------------------------------

    def _build_menu(self) -> None:
        menubar = tk.Menu(self)

        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="Restaurar copia de seguridad…", command=self._restore_backup)
        file_menu.add_separator()
        file_menu.add_command(label="Salir", command=self.destroy)
        menubar.add_cascade(label="Archivo", menu=file_menu)

        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="Acerca de…", command=self._show_about)
        menubar.add_cascade(label="Ayuda", menu=help_menu)

        self.config(menu=menubar)

    def _build_header(self) -> None:
        header = tk.Frame(self, bg="#313244", pady=12)
        header.pack(fill=tk.X)
        tk.Label(
            header,
            text="⚽  Reorganizar Plantillas",
            font=("Helvetica", 18, "bold"),
            fg="#cdd6f4",
            bg="#313244",
        ).pack()
        tk.Label(
            header,
            text="Reordena los jugadores de una plantilla según el orden de la formación",
            font=("Helvetica", 10),
            fg="#a6adc8",
            bg="#313244",
        ).pack(pady=(2, 0))

    def _build_input_row(self) -> None:
        frame = tk.Frame(self, bg="#1e1e2e", pady=14)
        frame.pack(fill=tk.X, padx=20)

        tk.Label(
            frame,
            text="ID del equipo:",
            font=("Helvetica", 11),
            fg="#cdd6f4",
            bg="#1e1e2e",
        ).grid(row=0, column=0, sticky="w", padx=(0, 8))

        self._team_id_var = tk.StringVar()
        entry = tk.Entry(
            frame,
            textvariable=self._team_id_var,
            font=("Helvetica", 12),
            width=12,
            bg="#313244",
            fg="#cdd6f4",
            insertbackground="#cdd6f4",
            relief="flat",
            bd=4,
        )
        entry.grid(row=0, column=1, sticky="w", padx=(0, 12))
        entry.bind("<Return>", lambda _: self._on_load())

        load_btn = tk.Button(
            frame,
            text="Cargar equipo",
            command=self._on_load,
            font=("Helvetica", 10, "bold"),
            bg="#89b4fa",
            fg="#1e1e2e",
            activebackground="#74c7ec",
            relief="flat",
            padx=14,
            pady=5,
            cursor="hand2",
        )
        load_btn.grid(row=0, column=2, padx=(0, 8))

        self._apply_btn = tk.Button(
            frame,
            text="✔  Aplicar cambios",
            command=self._on_apply,
            font=("Helvetica", 10, "bold"),
            bg="#a6e3a1",
            fg="#1e1e2e",
            activebackground="#94e2d5",
            relief="flat",
            padx=14,
            pady=5,
            cursor="hand2",
            state="disabled",
        )
        self._apply_btn.grid(row=0, column=3, padx=(0, 8))

        self._clear_btn = tk.Button(
            frame,
            text="Limpiar",
            command=self._on_clear,
            font=("Helvetica", 10),
            bg="#45475a",
            fg="#cdd6f4",
            activebackground="#585b70",
            relief="flat",
            padx=10,
            pady=5,
            cursor="hand2",
        )
        self._clear_btn.grid(row=0, column=4)

    def _build_preview_area(self) -> None:
        outer = tk.Frame(self, bg="#1e1e2e")
        outer.pack(fill=tk.BOTH, expand=True, padx=20, pady=(0, 8))

        # Column titles
        title_frame = tk.Frame(outer, bg="#1e1e2e")
        title_frame.pack(fill=tk.X)

        for col, text in enumerate(
            ["N.º\nFormación", "Categoría", "ID Jugador", "N.º Camiseta", "Ranura\nactual"]
        ):
            tk.Label(
                title_frame,
                text=text,
                font=("Helvetica", 9, "bold"),
                fg="#89b4fa",
                bg="#1e1e2e",
                width=14,
                anchor="center",
                pady=4,
            ).grid(row=0, column=col, sticky="ew", padx=2)

        # Treeview
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure(
            "Squad.Treeview",
            background="#313244",
            foreground="#cdd6f4",
            fieldbackground="#313244",
            rowheight=24,
            font=("Helvetica", 10),
        )
        style.configure("Squad.Treeview.Heading", background="#45475a", foreground="#cdd6f4")
        style.map("Squad.Treeview", background=[("selected", "#585b70")])

        columns = ("slot", "category", "player_id", "shirt_number", "old_slot")
        self._tree = ttk.Treeview(
            outer,
            columns=columns,
            show="headings",
            style="Squad.Treeview",
            selectmode="none",
        )

        col_widths = {"slot": 100, "category": 120, "player_id": 140, "shirt_number": 120, "old_slot": 120}
        col_labels = {
            "slot": "N.º Formación",
            "category": "Categoría",
            "player_id": "ID Jugador",
            "shirt_number": "N.º Camiseta",
            "old_slot": "Ranura actual",
        }
        for col in columns:
            self._tree.heading(col, text=col_labels[col])
            self._tree.column(col, width=col_widths[col], anchor="center")

        self._tree.tag_configure("starter", background="#1e3a5f", foreground="#89dceb")
        self._tree.tag_configure("sub", background="#2d3a1e", foreground="#a6e3a1")
        self._tree.tag_configure("reserve", background="#2e2a1a", foreground="#f9e2af")

        vsb = ttk.Scrollbar(outer, orient="vertical", command=self._tree.yview)
        self._tree.configure(yscrollcommand=vsb.set)

        self._tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, pady=4)
        vsb.pack(side=tk.RIGHT, fill=tk.Y, pady=4)

        # Summary label
        self._summary_var = tk.StringVar(value="Introduce un ID de equipo y pulsa «Cargar equipo».")
        tk.Label(
            self,
            textvariable=self._summary_var,
            font=("Helvetica", 10),
            fg="#a6adc8",
            bg="#1e1e2e",
            anchor="w",
            pady=4,
        ).pack(fill=tk.X, padx=20)

    def _build_status_bar(self) -> None:
        self._status_var = tk.StringVar(value="Listo.")
        bar = tk.Label(
            self,
            textvariable=self._status_var,
            relief="sunken",
            anchor="w",
            bg="#181825",
            fg="#6c7086",
            font=("Helvetica", 9),
            padx=8,
            pady=3,
        )
        bar.pack(fill=tk.X, side=tk.BOTTOM)

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    def _on_load(self) -> None:
        team_id = self._team_id_var.get().strip()
        if not team_id:
            messagebox.showwarning("Aviso", "Por favor introduce un ID de equipo.")
            return

        self._clear_tree()
        self._apply_btn.config(state="disabled")

        try:
            rows = build_preview_rows(team_id)
        except ValueError as exc:
            messagebox.showerror("Error", str(exc))
            self._set_status(f"Error: {exc}")
            return
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("Error inesperado", str(exc))
            self._set_status(f"Error inesperado: {exc}")
            return

        if not rows:
            messagebox.showinfo("Sin datos", f"No se encontraron jugadores para el equipo {team_id}.")
            return

        starters = subs = reserves = 0
        for r in rows:
            tag = "starter" if r["category"] == "Titular" else (
                "sub" if r["category"] == "Suplente" else "reserve"
            )
            self._tree.insert(
                "",
                "end",
                values=(
                    r["slot"],
                    r["category"],
                    r["player_id"],
                    r["shirt_number"],
                    r["old_squad_slot"],
                ),
                tags=(tag,),
            )
            if tag == "starter":
                starters += 1
            elif tag == "sub":
                subs += 1
            else:
                reserves += 1

        self._summary_var.set(
            f"Equipo {team_id}  —  {starters} titulares · {subs} suplentes · {reserves} reservas  "
            f"(total {len(rows)} jugadores)"
        )
        self._apply_btn.config(state="normal")
        self._set_status(f"Equipo {team_id} cargado. Revisa el orden y pulsa «Aplicar cambios».")

    def _on_apply(self) -> None:
        team_id = self._team_id_var.get().strip()
        if not team_id:
            return

        confirm = messagebox.askyesno(
            "Confirmar cambios",
            f"¿Aplicar el reordenamiento para el equipo {team_id}?\n\n"
            "Se creará una copia de seguridad automáticamente antes de modificar los archivos.",
        )
        if not confirm:
            return

        try:
            sq_bak, fm_bak = apply_reorder(team_id)
        except ValueError as exc:
            messagebox.showerror("Error", str(exc))
            self._set_status(f"Error: {exc}")
            return
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("Error inesperado", str(exc))
            self._set_status(f"Error inesperado: {exc}")
            return

        messagebox.showinfo(
            "Cambios aplicados",
            f"Reordenamiento aplicado correctamente para el equipo {team_id}.\n\n"
            f"Copias de seguridad guardadas en:\n  {sq_bak}\n  {fm_bak}",
        )
        self._set_status(f"✔ Equipo {team_id} reordenado. Copias de seguridad creadas.")
        self._apply_btn.config(state="disabled")

    def _on_clear(self) -> None:
        self._clear_tree()
        self._team_id_var.set("")
        self._apply_btn.config(state="disabled")
        self._summary_var.set("Introduce un ID de equipo y pulsa «Cargar equipo».")
        self._set_status("Listo.")

    def _restore_backup(self) -> None:
        """Let the user pick a backup pair to restore."""
        if not BACKUP_DIR.exists():
            messagebox.showinfo("Sin copias de seguridad", "Aún no se ha creado ninguna copia de seguridad.")
            return

        # List available squad backups sorted newest first
        bak_files = sorted(
            BACKUP_DIR.glob("All squads exported_*.csv"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not bak_files:
            messagebox.showinfo("Sin copias de seguridad", "No se encontraron archivos de respaldo de plantillas.")
            return

        win = tk.Toplevel(self)
        win.title("Restaurar copia de seguridad")
        win.geometry("700x360")
        win.configure(bg="#1e1e2e")
        win.grab_set()

        tk.Label(
            win,
            text="Selecciona la copia de seguridad a restaurar:",
            font=("Helvetica", 11),
            fg="#cdd6f4",
            bg="#1e1e2e",
            pady=10,
        ).pack(fill=tk.X, padx=16)

        listbox = tk.Listbox(
            win,
            font=("Helvetica", 10),
            bg="#313244",
            fg="#cdd6f4",
            selectbackground="#585b70",
            relief="flat",
            height=12,
        )
        for f in bak_files:
            listbox.insert(tk.END, f.name)
        listbox.pack(fill=tk.BOTH, expand=True, padx=16, pady=(0, 8))

        def do_restore() -> None:
            sel = listbox.curselection()
            if not sel:
                messagebox.showwarning("Selección requerida", "Selecciona un archivo de la lista.", parent=win)
                return
            sq_bak = bak_files[sel[0]]
            # Infer matching formation backup by same timestamp/team suffix
            suffix = sq_bak.name[len("All squads exported_"):]
            fm_bak = BACKUP_DIR / f"All formations exported_{suffix}"

            confirm = messagebox.askyesno(
                "Confirmar restauración",
                f"¿Restaurar la plantilla desde:\n  {sq_bak.name}?\n\n"
                + (f"También se restaurará:\n  {fm_bak.name}" if fm_bak.exists() else
                   "AVISO: No se encontró la copia de seguridad de formaciones correspondiente."),
                parent=win,
            )
            if not confirm:
                return
            shutil.copy2(sq_bak, SQUADS_FILE)
            if fm_bak.exists():
                shutil.copy2(fm_bak, FORMATIONS_FILE)
            messagebox.showinfo("Restauración completada", "Los archivos han sido restaurados correctamente.", parent=win)
            self._set_status(f"Archivos restaurados desde la copia de {sq_bak.name}.")
            win.destroy()

        btn_frame = tk.Frame(win, bg="#1e1e2e")
        btn_frame.pack(pady=8)
        tk.Button(
            btn_frame,
            text="Restaurar seleccionado",
            command=do_restore,
            font=("Helvetica", 10, "bold"),
            bg="#f38ba8",
            fg="#1e1e2e",
            activebackground="#eba0ac",
            relief="flat",
            padx=14,
            pady=5,
            cursor="hand2",
        ).pack(side=tk.LEFT, padx=8)
        tk.Button(
            btn_frame,
            text="Cancelar",
            command=win.destroy,
            font=("Helvetica", 10),
            bg="#45475a",
            fg="#cdd6f4",
            activebackground="#585b70",
            relief="flat",
            padx=14,
            pady=5,
            cursor="hand2",
        ).pack(side=tk.LEFT, padx=8)

    def _show_about(self) -> None:
        messagebox.showinfo(
            "Acerca de",
            "Reorganizar Plantillas v1.0\n\n"
            "Lee el orden de los jugadores en la formación y reordena\n"
            "la plantilla (All squads exported.csv) para que coincida.\n\n"
            "También actualiza el archivo de formaciones para que las\n"
            "posiciones en el campo permanezcan idénticas.\n\n"
            "Se crea una copia de seguridad automáticamente antes de\n"
            "cualquier modificación.",
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _clear_tree(self) -> None:
        for item in self._tree.get_children():
            self._tree.delete(item)

    def _set_status(self, msg: str) -> None:
        self._status_var.set(msg)
        self.update_idletasks()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
