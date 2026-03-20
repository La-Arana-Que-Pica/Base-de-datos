#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
actualizar_stats.py
-------------------
Editor gráfico para actualizar las stats de jugadores en all_players_full.csv.

Flujo:
  1. El usuario ingresa un Team ID y carga los jugadores del equipo.
  2. Selecciona un jugador de la lista.
  3. Pega texto copiado desde PES MASTER (español) o pesdb (inglés).
     → Aparece el mensaje "Pegado" y se prepara la conversión.
  4. Repite para otros jugadores.
  5. Al presionar OK se aplican todos los cambios al CSV.

Reglas:
  - La columna POS del jugador nunca se modifica.
  - Se crea un único backup antes de la primera escritura.
"""

import csv
import os
import re
import shutil
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import unicodedata

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "database"))

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------
MAX_SQUAD_SLOTS = 32            # máximo de jugadores por equipo en el CSV de plantillas
MIN_LABEL_LEN = 3               # mínimo de caracteres para reconocer una etiqueta de stat
PASTE_LABEL_DELAY_MS = 50       # ms de espera tras el evento <<Paste>> para leer el texto
PASTE_LABEL_DURATION_MS = 3000  # ms que se muestra el indicador "Pegado ✓"

PLAYERS_CSV_CANDIDATES = [
    os.path.join(SCRIPT_DIR, "all_players_full.csv"),
    os.path.join(DB_DIR, "all_players_full.csv"),
    os.path.join(DB_DIR, "All players exported.csv"),
]

SQUADS_CSV_CANDIDATES = [
    os.path.join(DB_DIR, "All squads exported.csv"),
    os.path.join(SCRIPT_DIR, "All squads exported.csv"),
]

TEAMS_CSV_CANDIDATES = [
    os.path.join(DB_DIR, "All teams exported.csv"),
    os.path.join(SCRIPT_DIR, "All teams exported.csv"),
]

# ---------------------------------------------------------------------------
# Utilidades de normalización de texto
# ---------------------------------------------------------------------------
def _norm(s: str) -> str:
    """Minúsculas, sin tildes, espacios colapsados."""
    if not s:
        return ""
    s = str(s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ---------------------------------------------------------------------------
# Mapeo: pesdb (inglés) → nombre de columna en el CSV
# ---------------------------------------------------------------------------
PESDB_TO_CSV = {
    "offensive awareness":  "Attacking Prowess",
    "ball control":         "Ball Control",
    "dribbling":            "Dribbling",
    "low pass":             "Low Pass",
    "lofted pass":          "Lofted Pass",
    "finishing":            "Finishing",
    "set piece taking":     "Place Kicking",
    "curl":                 "Controlled Spin",
    "heading":              "Header",
    "defensive awareness":  "Defensive Prowess",
    "tackling":             "Ball Winning",
    "kicking power":        "Kicking Power",
    "speed":                "Speed",
    "acceleration":         "Explosive Power",
    "balance":              "Body Control",
    "physical contact":     "Physical Contact",
    "jumping":              "Jump",
    "gk awareness":         "Goalkeeping",
    "gk catching":          "Catching",
    "gk parrying":          "Clearing",
    "gk reflexes":          "Reflexes",
    "gk reach":             "Coverage",
    "stamina":              "Stamina",
    # Tight Possession, Aggression, Defensive Engagement → no tienen equivalente en PES
}

# ---------------------------------------------------------------------------
# Mapeo: PES MASTER (español) → nombre de columna en el CSV
# ---------------------------------------------------------------------------
ES_TO_CSV = {
    _norm("Actitud ofensiva"):   "Attacking Prowess",
    _norm("Control de balon"):   "Ball Control",
    _norm("Regate"):             "Dribbling",
    _norm("Pase raso"):          "Low Pass",
    _norm("Pase bombeado"):      "Lofted Pass",
    _norm("Finalizacion"):       "Finishing",
    _norm("Balon parado"):       "Place Kicking",
    _norm("Efecto"):             "Controlled Spin",
    _norm("Cabeceo"):            "Header",
    _norm("Actitud defensiva"):  "Defensive Prowess",
    _norm("Entrada"):            "Ball Winning",
    _norm("Potencia de tiro"):   "Kicking Power",
    _norm("Velocidad"):          "Speed",
    _norm("Aceleracion"):        "Explosive Power",
    _norm("Equilibrio"):         "Body Control",
    _norm("Contacto fisico"):    "Physical Contact",
    _norm("Salto"):              "Jump",
    _norm("Actitud de portero"): "Goalkeeping",
    _norm("Atajar"):             "Catching",
    _norm("Desviar"):            "Clearing",
    _norm("Reflejos"):           "Reflexes",
    _norm("Cobertura"):          "Coverage",
    _norm("Resistencia"):        "Stamina",
    # Conservación del balón, Agresividad, Compromiso defensivo → no tienen equiv.
}

# ---------------------------------------------------------------------------
# Mapeo de campos no numéricos
# ---------------------------------------------------------------------------
WF_USAGE_EN = {
    "almost never": 1, "rarely": 2, "occasionally": 3, "regularly": 4,
}
WF_USAGE_ES = {
    _norm("Casi nunca"): 1, _norm("Raramente"): 2,
    _norm("Ocasionalmente"): 3, _norm("Regularmente"): 4,
}

WF_ACC_EN = {
    "very low": 1, "low": 2, "high": 3, "very high": 4,
}
WF_ACC_ES = {
    _norm("Algo bajo"): 1, _norm("Mediano"): 2,
    _norm("Alto"): 3, _norm("Muy alto"): 4,
}

FORM_EN = {
    "inconsistent": 4, "normal": 5, "unwavering": 6, "average": 5,
}
FORM_ES = {
    _norm("Inconsistente"): 4, _norm("Normal"): 5, _norm("Constante"): 6,
}

INJ_EN = {
    "low": 1, "medium": 2, "high": 3,
}
INJ_ES = {
    _norm("Baja"): 1, _norm("Mediano"): 2, _norm("Alto"): 3,
}


def _lookup_wf_usage(raw: str) -> int | None:
    k = _norm(raw)
    return WF_USAGE_ES.get(k) or WF_USAGE_EN.get(k.lower())


def _lookup_wf_acc(raw: str) -> int | None:
    k = _norm(raw)
    return WF_ACC_ES.get(k) or WF_ACC_EN.get(k.lower())


def _lookup_form(raw: str) -> int | None:
    k = _norm(raw)
    return FORM_ES.get(k) or FORM_EN.get(k.lower())


def _lookup_inj(raw: str) -> int | None:
    k = _norm(raw)
    return INJ_ES.get(k) or INJ_EN.get(k.lower())


# ---------------------------------------------------------------------------
# Detección y parseo del formato de entrada
# ---------------------------------------------------------------------------

# Columnas de edición que se deben marcar como True al actualizar stats
EDIT_FLAG_COLS = [
    "Edit_Name",
    "Edit_Basics",
    "Edit_Position",
    "Edit_Positions",
    "Edit_Abilities",
    "Edit_PlayerSkills",
    "Edit_PlayingStyle",
    "Edit_COMPlayingStyles",
    "Edit_Movements",
]

# Mapeo: eFootball (inglés) → nombre de columna en el CSV
# eFootball comparte los mismos nombres de stats que pesdb; se agregan
# los alias propios de eFootball para mayor robustez.
# Nota: Tight Possession, Aggression y Defensive Engagement no tienen equivalente en PES.
EFOOTBALL_TO_CSV = {
    "offensive awareness":  "Attacking Prowess",
    "ball control":         "Ball Control",
    "dribbling":            "Dribbling",
    "low pass":             "Low Pass",
    "lofted pass":          "Lofted Pass",
    "finishing":            "Finishing",
    "set piece taking":     "Place Kicking",
    "curl":                 "Controlled Spin",
    "heading":              "Header",
    "defensive awareness":  "Defensive Prowess",
    "tackling":             "Ball Winning",
    "kicking power":        "Kicking Power",
    "speed":                "Speed",
    "acceleration":         "Explosive Power",
    "balance":              "Body Control",
    "physical contact":     "Physical Contact",
    "jumping":              "Jump",
    "gk awareness":         "Goalkeeping",
    "gk catching":          "Catching",
    "gk parrying":          "Clearing",
    "gk reflexes":          "Reflexes",
    "gk reach":             "Coverage",
    "stamina":              "Stamina",
}

_RE_EFOOTBALL = re.compile(
    r"(?i)(efootball|Tight Possession|Defensive Engagement|Overall Rating)"
)
_RE_PESDB = re.compile(
    r"(?i)(Offensive Awareness|Ball Control|Dribbling|Defensive Awareness)"
)


def _is_efootball_format(text: str) -> bool:
    """Detecta si el texto proviene de eFootball."""
    return bool(_RE_EFOOTBALL.search(text))


def _is_pesdb_format(text: str) -> bool:
    """Detecta si el texto proviene de pesdb (formato clave: valor en inglés)."""
    return bool(_RE_PESDB.search(text))


def _parse_pesdb(text: str) -> dict:
    """
    Parsea texto de pesdb (inglés).
    Devuelve {csv_column: valor_str, ...}.
    """
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(.+?)\s*:\s*(.+)$", line)
        if not m:
            continue
        key_raw = m.group(1).strip()
        val_raw = m.group(2).strip()
        key_low = key_raw.lower()

        csv_col = PESDB_TO_CSV.get(key_low)
        if csv_col:
            result[csv_col] = val_raw
            continue

        # Campos no numéricos
        if key_low == "weak foot usage":
            v = _lookup_wf_usage(val_raw)
            if v is not None:
                result["Weak Foot Usage"] = str(v)
        elif key_low == "weak foot accuracy":
            v = _lookup_wf_acc(val_raw)
            if v is not None:
                result["Weak Foot Acc."] = str(v)
        elif key_low == "form":
            v = _lookup_form(val_raw)
            if v is not None:
                result["Form"] = str(v)
        elif key_low == "injury resistance":
            v = _lookup_inj(val_raw)
            if v is not None:
                result["Injury Resistance"] = str(v)

    return result


def _parse_pesmaster_es(text: str) -> dict:
    """
    Parsea texto de PES MASTER en español.
    Soporta dos formatos:
      a) "Label: valor"  (valor en la misma línea que la etiqueta)
      b) Intercalado: valor en una línea, etiqueta en la siguiente
         (e.g., "72\\t" -> "Actitud ofensiva")
    Devuelve {csv_column: valor_str, ...}.
    """
    result = {}
    t = text.replace("\xa0", " ")

    # --- Formato a) "Label: valor" en la misma línea ---
    for lab, val in re.findall(
        rf"([A-Za-zÁÉÍÓÚáéíóúñ()./ \-]{{{MIN_LABEL_LEN},}}?)\s*[:\t]\s*(\d{{1,3}})(?!\d)", t
    ):
        key = ES_TO_CSV.get(_norm(lab.strip()))
        if key:
            result[key] = val

    # --- Formato b) intercalado: número en línea N, etiqueta en línea N+1 ---
    lines = t.splitlines()
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Línea que es sólo un número (posiblemente con tab)
        m = re.match(r"^(\d{1,3})\s*$", stripped)
        if m and i + 1 < len(lines):
            next_stripped = lines[i + 1].strip()
            # Quitar sufijos como " (PT)"
            label_clean = re.sub(r"\s*\([^)]*\)", "", next_stripped).strip()
            key = ES_TO_CSV.get(_norm(label_clean))
            if key:
                result[key] = m.group(1)

    # --- Campos no numéricos (siempre en formato "Label\tValor") ---
    def _find(pattern):
        m = re.search(pattern, t, re.IGNORECASE)
        return m.group(1).strip() if m else ""

    wf_use = _find(r"Uso pierna mala\s*[:\t]\s*([^\n]+)")
    wf_acc = _find(r"Prec\.?\s*pierna mala\s*[:\t]\s*([^\n]+)")
    form   = _find(r"Regularidad\s*[:\t]\s*([^\n]+)")
    inj    = _find(r"Resist\.?\s*a lesiones\s*[:\t]\s*([^\n]+)")

    if wf_use:
        v = _lookup_wf_usage(wf_use)
        if v is not None:
            result["Weak Foot Usage"] = str(v)
    if wf_acc:
        v = _lookup_wf_acc(wf_acc)
        if v is not None:
            result["Weak Foot Acc."] = str(v)
    if form:
        v = _lookup_form(form)
        if v is not None:
            result["Form"] = str(v)
    if inj:
        v = _lookup_inj(inj)
        if v is not None:
            result["Injury Resistance"] = str(v)

    return result


def _parse_efootball(text: str) -> dict:
    """
    Parsea texto de eFootball (inglés).
    Usa el mapeo EFOOTBALL_TO_CSV (que incluye nombres propios de eFootball
    además de los de pesdb) y delega el resto al parser de pesdb.
    Devuelve {csv_column: valor_str, ...}.
    """
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(.+?)\s*:\s*(.+)$", line)
        if not m:
            continue
        key_raw = m.group(1).strip()
        val_raw = m.group(2).strip()
        key_low = key_raw.lower()

        # Primero intentar con el mapeo específico de eFootball
        if key_low in EFOOTBALL_TO_CSV:
            csv_col = EFOOTBALL_TO_CSV[key_low]
            if csv_col:
                result[csv_col] = val_raw
            continue

        # Caer en el mapeo de pesdb para stats compartidos
        csv_col = PESDB_TO_CSV.get(key_low)
        if csv_col:
            result[csv_col] = val_raw
            continue

        # Campos no numéricos (idénticos a pesdb)
        if key_low == "weak foot usage":
            v = _lookup_wf_usage(val_raw)
            if v is not None:
                result["Weak Foot Usage"] = str(v)
        elif key_low == "weak foot accuracy":
            v = _lookup_wf_acc(val_raw)
            if v is not None:
                result["Weak Foot Acc."] = str(v)
        elif key_low == "form":
            v = _lookup_form(val_raw)
            if v is not None:
                result["Form"] = str(v)
        elif key_low == "injury resistance":
            v = _lookup_inj(val_raw)
            if v is not None:
                result["Injury Resistance"] = str(v)

    return result


def parse_stat_text(text: str) -> dict:
    """Detecta el formato del texto y lo parsea."""
    if _is_efootball_format(text):
        return _parse_efootball(text)
    if _is_pesdb_format(text):
        return _parse_pesdb(text)
    return _parse_pesmaster_es(text)


# ---------------------------------------------------------------------------
# Manejo del CSV
# ---------------------------------------------------------------------------
def _find_file(candidates: list) -> str | None:
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def load_csv_raw(path: str) -> tuple:
    """
    Carga un CSV delimitado por ';'.
    Devuelve (headers: list[str], rows: list[dict]).
    """
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        headers = reader.fieldnames or []
        rows = list(reader)
    return list(headers), rows


def save_csv_raw(path: str, headers: list, rows: list):
    """Guarda un CSV delimitado por ';'."""
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, delimiter=";",
                                extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def ensure_backup(players_csv: str):
    """Crea un backup del CSV si todavía no existe."""
    backup_path = players_csv + ".bak"
    if not os.path.exists(backup_path):
        shutil.copy2(players_csv, backup_path)


def get_team_player_ids(squads_path: str, team_id: int) -> list:
    """Devuelve la lista de IDs de jugadores del equipo (sin ceros)."""
    _, rows = load_csv_raw(squads_path)
    for row in rows:
        tid = str(row.get("Id", "")).strip()
        if tid == str(team_id):
            ids = []
            for i in range(1, MAX_SQUAD_SLOTS + 1):
                val = str(row.get(f"Player {i}", "")).strip()
                if val and val != "0":
                    ids.append(int(val))
            return ids
    return []


def get_team_name(teams_path: str, team_id: int) -> str:
    """Devuelve el nombre del equipo o cadena vacía si no se encuentra."""
    _, rows = load_csv_raw(teams_path)
    for row in rows:
        tid = str(row.get("Id", "")).strip()
        if tid == str(team_id):
            return row.get("Name", "").strip()
    return ""


def apply_changes(players_csv: str, changes: list) -> int:
    """
    Aplica los cambios preparados al CSV.
    changes = [{"player_id": int, "stats": {col: val, ...}}, ...]
    Nunca modifica la columna POS.
    Establece Edit_Name → Edit_Movements = True para cada jugador actualizado.
    Devuelve el número de jugadores actualizados.
    """
    ensure_backup(players_csv)

    headers, rows = load_csv_raw(players_csv)
    changes_map = {str(ch["player_id"]): ch["stats"] for ch in changes}
    updated = 0

    for row in rows:
        pid = str(row.get("Id", "")).strip()
        if pid in changes_map:
            stats = changes_map[pid]
            for col, val in stats.items():
                if col == "POS":   # regla estricta: nunca cambiar posición
                    continue
                if col in row:
                    row[col] = val
            # Marcar flags de edición
            for flag in EDIT_FLAG_COLS:
                if flag in row:
                    row[flag] = "True"
            updated += 1

    save_csv_raw(players_csv, headers, rows)
    return updated


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Actualizar Stats de Jugadores")
        self.geometry("900x650")
        self.resizable(True, True)

        # Estado
        self.players_csv: str | None = None
        self.squads_csv: str | None = None
        self.teams_csv: str | None = None
        self.all_players: list = []       # [{Id, Name, ...}, ...]
        self.team_players: list = []      # jugadores del equipo cargado
        self.queue: list = []             # [{"player_id", "player_name", "stats"}, ...]

        self._init_paths()
        self._build_ui()

    # ------------------------------------------------------------------
    def _init_paths(self):
        self.players_csv = _find_file(PLAYERS_CSV_CANDIDATES)
        self.squads_csv  = _find_file(SQUADS_CSV_CANDIDATES)
        self.teams_csv   = _find_file(TEAMS_CSV_CANDIDATES)

        if self.players_csv:
            try:
                _, self.all_players = load_csv_raw(self.players_csv)
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo cargar el CSV de jugadores:\n{e}")

    # ------------------------------------------------------------------
    def _build_ui(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(2, weight=1)

        # ── Fila 0: ruta del CSV ──────────────────────────────────────
        frm_path = ttk.Frame(self, padding=6)
        frm_path.grid(row=0, column=0, sticky="ew")
        frm_path.columnconfigure(1, weight=1)

        ttk.Label(frm_path, text="CSV:").grid(row=0, column=0, sticky="w")
        self.lbl_csv = ttk.Label(
            frm_path,
            text=self.players_csv or "⚠ No encontrado",
            foreground="green" if self.players_csv else "red",
        )
        self.lbl_csv.grid(row=0, column=1, sticky="w", padx=4)
        ttk.Button(frm_path, text="Elegir…", command=self._choose_csv).grid(
            row=0, column=2, padx=(4, 0)
        )

        # ── Fila 1: Team ID ───────────────────────────────────────────
        frm_team = ttk.Frame(self, padding=6)
        frm_team.grid(row=1, column=0, sticky="ew")

        ttk.Label(frm_team, text="Team ID:").pack(side="left")
        self.entry_team = ttk.Entry(frm_team, width=10)
        self.entry_team.pack(side="left", padx=4)
        self.entry_team.bind("<Return>", lambda _: self._load_team())
        ttk.Button(frm_team, text="Cargar equipo", command=self._load_team).pack(
            side="left", padx=4
        )
        self.lbl_team_name = ttk.Label(frm_team, text="", foreground="blue")
        self.lbl_team_name.pack(side="left", padx=8)

        # ── Fila 2: panel principal (jugadores | pegado) ──────────────
        frm_main = ttk.Frame(self, padding=6)
        frm_main.grid(row=2, column=0, sticky="nsew")
        frm_main.columnconfigure(0, weight=1)
        frm_main.columnconfigure(1, weight=2)
        frm_main.rowconfigure(0, weight=1)

        # Panel izquierdo: lista de jugadores
        frm_left = ttk.LabelFrame(frm_main, text="Jugadores del equipo", padding=4)
        frm_left.grid(row=0, column=0, sticky="nsew", padx=(0, 4))
        frm_left.rowconfigure(0, weight=1)
        frm_left.columnconfigure(0, weight=1)

        self.lb_players = tk.Listbox(frm_left, selectmode="single", activestyle="dotbox")
        self.lb_players.grid(row=0, column=0, sticky="nsew")
        sb_players = ttk.Scrollbar(frm_left, orient="vertical",
                                   command=self.lb_players.yview)
        sb_players.grid(row=0, column=1, sticky="ns")
        self.lb_players.configure(yscrollcommand=sb_players.set)

        # Panel derecho: pegar texto + preparar
        frm_right = ttk.LabelFrame(frm_main, text="Pegar stats", padding=4)
        frm_right.grid(row=0, column=1, sticky="nsew")
        frm_right.rowconfigure(1, weight=1)
        frm_right.columnconfigure(0, weight=1)

        frm_paste_hdr = ttk.Frame(frm_right)
        frm_paste_hdr.grid(row=0, column=0, sticky="ew", pady=(0, 4))

        ttk.Label(frm_paste_hdr, text="Pegá el texto de eFootball, PES MASTER o pesdb:").pack(
            side="left"
        )
        self.lbl_pegado = ttk.Label(
            frm_paste_hdr, text="", foreground="green",
            font=("TkDefaultFont", 10, "bold"),
        )
        self.lbl_pegado.pack(side="left", padx=12)

        self.txt_paste = tk.Text(frm_right, wrap="word", undo=True, height=10)
        self.txt_paste.grid(row=1, column=0, sticky="nsew")
        sb_paste = ttk.Scrollbar(frm_right, orient="vertical",
                                 command=self.txt_paste.yview)
        sb_paste.grid(row=1, column=1, sticky="ns")
        self.txt_paste.configure(yscrollcommand=sb_paste.set)
        self.txt_paste.bind("<<Paste>>", self._on_paste_event)
        self.txt_paste.bind("<Control-v>", self._on_paste_event)
        self.txt_paste.bind("<Control-V>", self._on_paste_event)

        frm_btns_mid = ttk.Frame(frm_right)
        frm_btns_mid.grid(row=2, column=0, sticky="ew", pady=(6, 0))

        ttk.Button(frm_btns_mid, text="Preparar cambio",
                   command=self._prepare_change).pack(side="left", padx=4)
        ttk.Button(frm_btns_mid, text="Limpiar texto",
                   command=lambda: (self.txt_paste.delete("1.0", "end"),
                                    self._clear_pegado())).pack(side="left", padx=4)

        # ── Fila 3: cola de cambios preparados ───────────────────────
        frm_queue = ttk.LabelFrame(self, text="Cambios preparados (pendientes)", padding=4)
        frm_queue.grid(row=3, column=0, sticky="ew", padx=6, pady=(0, 2))
        frm_queue.columnconfigure(0, weight=1)

        self.lb_queue = tk.Listbox(frm_queue, height=5, selectmode="single",
                                   activestyle="dotbox")
        self.lb_queue.grid(row=0, column=0, sticky="ew")
        sb_queue = ttk.Scrollbar(frm_queue, orient="vertical",
                                 command=self.lb_queue.yview)
        sb_queue.grid(row=0, column=1, sticky="ns")
        self.lb_queue.configure(yscrollcommand=sb_queue.set)
        ttk.Button(frm_queue, text="Quitar seleccionado",
                   command=self._remove_queued).grid(row=1, column=0, sticky="w",
                                                     pady=(4, 0))

        # ── Fila 4: botones finales ───────────────────────────────────
        frm_footer = ttk.Frame(self, padding=6)
        frm_footer.grid(row=4, column=0, sticky="ew")

        self.lbl_status = ttk.Label(frm_footer, text="")
        self.lbl_status.pack(side="left", padx=4)

        ttk.Button(frm_footer, text="Cancelar",
                   command=self.destroy).pack(side="right", padx=4)
        self.btn_ok = ttk.Button(frm_footer, text="OK — Aplicar cambios",
                                 command=self._apply_all, state="disabled")
        self.btn_ok.pack(side="right", padx=4)

    # ------------------------------------------------------------------
    # Acciones
    # ------------------------------------------------------------------
    def _choose_csv(self):
        path = filedialog.askopenfilename(
            title="Seleccionar CSV de jugadores",
            filetypes=[("CSV", "*.csv"), ("Todos", "*.*")],
        )
        if not path:
            return
        self.players_csv = path
        self.lbl_csv.configure(text=path, foreground="green")
        try:
            _, self.all_players = load_csv_raw(path)
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo cargar el CSV:\n{e}")

    def _load_team(self):
        team_id_str = self.entry_team.get().strip()
        if not team_id_str:
            messagebox.showwarning("Atención", "Ingresá un Team ID.")
            return
        if not team_id_str.isdigit():
            messagebox.showwarning("Atención", "El Team ID debe ser un número.")
            return
        team_id = int(team_id_str)

        if not self.players_csv:
            messagebox.showerror(
                "Error", "No se encontró el CSV de jugadores.\n"
                "Usá el botón 'Elegir…' para seleccionarlo."
            )
            return

        if not self.squads_csv:
            messagebox.showerror(
                "Error",
                "No se encontró 'All squads exported.csv'.\n"
                "Verificá que esté en la carpeta database.",
            )
            return

        # Nombre del equipo (opcional)
        team_name = ""
        if self.teams_csv:
            try:
                team_name = get_team_name(self.teams_csv, team_id)
            except Exception:
                pass
        self.lbl_team_name.configure(
            text=f"— {team_name}" if team_name else f"— Equipo {team_id}"
        )

        # IDs de jugadores en el equipo
        try:
            player_ids = get_team_player_ids(self.squads_csv, team_id)
        except Exception as e:
            messagebox.showerror("Error", f"No se pudieron cargar los jugadores:\n{e}")
            return

        if not player_ids:
            messagebox.showinfo(
                "Sin jugadores",
                f"No se encontraron jugadores para el Team ID {team_id}.",
            )
            return

        # Filtrar jugadores del equipo
        id_set = {str(pid) for pid in player_ids}
        self.team_players = [
            p for p in self.all_players
            if str(p.get("Id", "")).strip() in id_set
        ]

        self.lb_players.delete(0, "end")
        for p in self.team_players:
            self.lb_players.insert(
                "end", f"{p.get('Id','?')}  {p.get('Name','?')}"
            )

        self.lbl_status.configure(
            text=f"{len(self.team_players)} jugadores cargados."
        )

    def _on_paste_event(self, event=None):
        """Se llama cuando el usuario pega texto (Ctrl+V o menú contextual)."""
        # Programamos la actualización del label después del pegado real
        self.after(PASTE_LABEL_DELAY_MS, self._show_pegado)

    def _show_pegado(self):
        self.lbl_pegado.configure(text="Pegado ✓")
        # Ocultar el label después de 3 segundos
        self.after(PASTE_LABEL_DURATION_MS, self._clear_pegado)

    def _clear_pegado(self):
        self.lbl_pegado.configure(text="")

    def _prepare_change(self):
        """Prepara el cambio para el jugador seleccionado (sin aplicarlo)."""
        sel = self.lb_players.curselection()
        if not sel:
            messagebox.showwarning("Atención", "Seleccioná un jugador de la lista.")
            return

        text = self.txt_paste.get("1.0", "end").strip()
        if not text:
            messagebox.showwarning(
                "Atención", "Pegá el texto de stats antes de preparar."
            )
            return

        player = self.team_players[sel[0]]
        player_id = int(player.get("Id", 0))
        player_name = player.get("Name", "?")

        stats = parse_stat_text(text)
        if not stats:
            messagebox.showwarning(
                "Sin datos",
                "No se encontraron stats reconocibles en el texto pegado.\n"
                "Verificá que sea texto de eFootball, PES MASTER (español) o pesdb (inglés).",
            )
            return

        # Si ya existe en la cola, reemplazar
        self.queue = [q for q in self.queue if q["player_id"] != player_id]
        self.queue.append({
            "player_id": player_id,
            "player_name": player_name,
            "stats": stats,
        })
        self._refresh_queue()
        self.txt_paste.delete("1.0", "end")
        self._clear_pegado()
        self.lbl_status.configure(
            text=f"Preparado: {player_name} ({len(stats)} stats)."
        )

    def _refresh_queue(self):
        self.lb_queue.delete(0, "end")
        for item in self.queue:
            n = len(item["stats"])
            self.lb_queue.insert(
                "end", f"ID {item['player_id']}  {item['player_name']}  — {n} stats"
            )
        state = "normal" if self.queue else "disabled"
        self.btn_ok.configure(state=state)

    def _remove_queued(self):
        sel = self.lb_queue.curselection()
        if not sel:
            return
        del self.queue[sel[0]]
        self._refresh_queue()

    def _apply_all(self):
        if not self.queue:
            return
        if not self.players_csv:
            messagebox.showerror("Error", "No hay CSV de jugadores configurado.")
            return

        confirm = messagebox.askyesno(
            "Confirmar",
            f"¿Aplicar cambios para {len(self.queue)} jugador(es) al CSV?\n"
            "Se creará un backup si no existe.",
        )
        if not confirm:
            return

        try:
            updated = apply_changes(self.players_csv, self.queue)
        except Exception as e:
            messagebox.showerror("Error al guardar", str(e))
            return

        self.queue.clear()
        self._refresh_queue()
        backup = self.players_csv + ".bak"
        messagebox.showinfo(
            "Listo",
            f"Se actualizaron {updated} jugador(es).\n"
            f"Backup en: {backup}",
        )
        self.lbl_status.configure(text=f"Guardado. {updated} jugador(es) actualizados.")


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app = App()
    app.mainloop()
