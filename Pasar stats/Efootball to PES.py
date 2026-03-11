#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import tkinter as tk
from tkinter import ttk, messagebox
import unicodedata

# ============== Normalización básica ==============
def norm(s: str) -> str:
    if s is None:
        return ""
    s = str(s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    s = re.sub(r"\s+", " ", s).strip()
    return s

def strip_parens(text: str) -> str:
    return re.sub(r"\([^)]*\)", "", text or "").strip()

# ============== Normalización específica para nombre de camiseta ==============
def normalize_shirt_name(s: str) -> str:
    """
    Convierte acentos y caracteres con diacríticos a su forma "plana",
    elimina caracteres no alfabéticos (apostrofes, guiones, etc.) y devuelve en mayúsculas.
    Ej: "Castaño" -> "CASTANO", "Rodríguez" -> "RODRIGUEZ", "O'Neil" -> "ONEIL"
    """
    if not s:
        return ""
    s = str(s)
    # Descomponer y quitar marcas diacríticas
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    # Pasar a mayúsculas
    s = s.upper()
    # Mantener sólo letras y espacios (eliminar guiones, apóstrofes, puntos, acentos remanentes, etc.)
    s = re.sub(r"[^A-Z\s]", "", s)
    # Colapsar espacios
    s = re.sub(r"\s+", " ", s).strip()
    return s

# ============== Reglas confirmadas ==============
def make_shirt_name(full_name: str) -> str:
    parts = [p for p in re.split(r"\s+", (full_name or "").strip()) if p]
    if not parts:
        return ""
    last = parts[-1]
    return normalize_shirt_name(last)

SHIRT_NUMBER_DEFAULT = "1"

# PES 2017 compat: mapear "Build Up" a "-" (sin estilo)
MAP_BUILD_UP_TO_NONE = True

# Usar WF para extremos y para mediocampistas por banda cuando son posición principal
USE_WF_FOR_WINGERS = True
TREAT_SIDE_MIDS_AS_WINGERS = True  # RMF/LMF (MD/MI) -> WF si es posición principal

# Foot (incluye abreviaturas)
FOOT_MAP = {
    norm("Derecha"): "R", norm("Der"): "R", norm("Der."): "R", norm("Dcha"): "R",
    norm("Right"): "R", norm("R"): "R",
    norm("Izquierda"): "L", norm("Izq"): "L", norm("Izq."): "L",
    norm("Left"): "L", norm("L"): "L",
}

# Posiciones (input -> PES 2018)
# Nota: ED/II y RWF/LWF se normalizan a WF; añadimos MI/MD para casos en español.
POS_MAP = {
    "pt": "GK",
    "ct": "CB",
    "ld": "RB",
    "li": "LB",
    "mcd": "DMF",
    "mc": "CMF",
    "mp": "AMF",
    "id": "RMF",    # Interior Derecho (equivalente a RMF en varios sets)
    "mi": "WF",     # Mediocampista Izquierdo -> WF (por regla requerida)
    "md": "WF",     # Mediocampista Derecho -> WF (por regla requerida)
    "ed": "WF",     # Extremo Derecho -> WF
    "ii": "WF",     # Extremo Izquierdo -> WF
    "rwf": "WF",    # por si viene ya en inglés
    "lwf": "WF",
    "rmf": "RMF",
    "lmf": "LMF",
    "sd": "SS",
    "dc": "CF",
}

# Listado válido de códigos PES (para validar overrides)
VALID_POS_CODES = {"GK","CB","RB","LB","DMF","CMF","AMF","RMF","LMF","RWF","LWF","WF","SS","CF","SB"}

# Weak foot usage (1–4)
WF_USAGE_MAP = {
    norm("Almost Never"): 1, norm("Rarely"): 2, norm("Occasionally"): 3, norm("Regularly"): 4,
    norm("Casi nunca"): 1, norm("Ocasionalmente"): 3, norm("Regularmente"): 4,
}

# Weak foot accuracy (1–4)
WF_ACC_MAP = {
    norm("Algo bajo"): 1, norm("Mediano"): 2, norm("Alto"): 3, norm("Muy alto"): 4,
    norm("Very Low"): 1, norm("Low"): 2, norm("High"): 3, norm("Very High"): 4,
}

# Regularidad (Form) rango 4–6 (tu regla)
FORM_MAP = { norm("Inconsistente"): 4, norm("Normal"): 5, norm("Constante"): 6 }
FORM_DEFAULT = 5

# Injury Tolerance (1–3)
INJ_MAP = { norm("Baja"): 1, norm("Mediano"): 2, norm("Alto"): 3 }
INJ_DEFAULT = 2

# Country -> demonym (English) (ampliado)
DEMONYM_MAP = {
    norm("Argentina"): "Argentinian",
    norm("Brazil"): "Brazilian", norm("Brasil"): "Brazilian",
    norm("Uruguay"): "Uruguayan",
    norm("Chile"): "Chilean",
    norm("Spain"): "Spanish", norm("España"): "Spanish",
    norm("France"): "French",
    norm("Germany"): "German",
    norm("England"): "English",
    norm("Italy"): "Italian",
    norm("Portugal"): "Portuguese", norm("Portugués"): "Portuguese", norm("Portugues"): "Portuguese",
    norm("Wales"): "Welsh", norm("Gales"): "Welsh",
    norm("Morocco"): "Moroccan", norm("Marruecos"): "Moroccan", norm("Marroqui"): "Moroccan", norm("Marroquí"): "Moroccan",
    norm("Algeria"): "Algerian", norm("Argelia"): "Algerian",
    norm("Tunisia"): "Tunisian", norm("Tunez"): "Tunisian", norm("Túnez"): "Tunisian",
    norm("Senegal"): "Senegalese",
    norm("Japan"): "Japanese", norm("Japon"): "Japanese", norm("Japón"): "Japanese",
}
def to_demonym(country: str) -> str:
    return DEMONYM_MAP.get(norm(country), country)

# Abilities ES -> EN (Tabla 2)
ABIL_ES_TO_EN = {
    norm("Actitud ofensiva"): "Attacking Prowess",
    norm("Control de balón"): "Ball Control",
    norm("Regate"): "Dribbling",
    norm("Pase raso"): "Low Pass",
    norm("Pase bombeado"): "Lofted Pass",
    norm("Finalización"): "Finishing",
    norm("Balón parado"): "Place Kicking",
    norm("Efecto"): "Swerve",
    norm("Cabeceo"): "Header",
    norm("Actitud defensiva"): "Defence Prowess",
    norm("Entrada"): "Ball Winning",
    norm("Potencia de tiro"): "Kicking Power",
    norm("Velocidad"): "Speed",
    norm("Aceleración"): "Explosive Power",
    norm("Equilibrio"): "Body Control",
    norm("Contacto físico"): "Physical Contact",
    norm("Salto"): "Jump",
    norm("Actitud de portero"): "Goalkeeping",
    norm("Atajar"): "Catching",
    norm("Desviar"): "Clearing",
    norm("Reflejos"): "Reflexes",
    norm("Cobertura"): "Coverage",
    norm("Resistencia"): "Stamina",
}

# Player Skills ES -> EN (con sinónimos)
def skill_map_pairs():
    pairs = {
        "Scissors Feint": ["Bicicleta"],
        "Flip Flap": ["Elastica", "Elástica"],
        "Marseille Turn": ["Marsellesa"],
        "Sombrero": ["Sombrero"],
        "Cut Behind & Turn": ["Amago por detras y giro", "Amago por detrás y giro"],
        "Scotch Move": ["Rebote interior"],
        "Heading": ["Cabeceo"],
        "Long Range Drive": ["Tiro de larga distancia", "Disparo lejano con rosca"],
        "Knuckle Shot": ["Disparo sin rotacion de balon", "Disparo sin rotación de balón"],
        "Acrobatic Finishing": ["Finalizacion acrobatica", "Finalización acrobática"],
        "Heel Trick": ["Espuela"],
        "First-time Shot": ["Remate al primer toque"],
        "One-touch Pass": ["Pase al primer toque"],
        "Weighted Pass": ["Pase al hueco", "Pase en profundidad"],
        "Pinpoint Crossing": ["Pase cruzado"],
        "Outside Curler": ["Centro con rosca"],
        "Rabona": ["Rabona"],
        "Low Lofted Pass": ["Pase bombeado bajo"],
        "Low Punt Trajectory": ["Patadon en largo (PT)", "Patadon por bajo (PT)", "Patadón en largo (PT)", "Patadón por bajo (PT)"],
        "Long Throw": ["Saque de banda largo"],
        "GK Long Throw": ["Saque largo (PT)"],
        "Malicia": ["Picardia", "Picardía"],
        "Man Marking": ["Marcaje"],
        "Track Back": ["Delantero atrasado"],
        "Acrobatic Clear": ["Despeje acrobatico", "Despeje acrobático"],
        "Captaincy": ["Capitania", "Capitanía"],
        "Super-sub": ["As en la manga"],
        "Fighting Spirit": ["Espiritu de lucha", "Espíritu de lucha"],
    }
    out = {}
    for en, es_list in pairs.items():
        for es in es_list:
            out[norm(es)] = en
    return out
SKILL_ES_TO_EN = skill_map_pairs()

# Playing Style ES -> EN (con capitalización exacta)
def pstyle_map_pairs():
    pairs = {
        "Goal Poacher": ["Cazagoles"],
        "Dummy Runner": ["Señuelo", "Senuelo"],
        "Fox in the Box": ["Hombre de area", "Hombre de área"],
        "Target Man": ["Referencia en punta"],
        "Creative Playmaker": ["Enganche", "Creador de juego", "Ala movil", "Ala móvil"],
        "Prolific Winger": ["Extremo prolífico", "Extremo prolifico"],
        "Classic No. 10": ["Diez clasico", "Diez clásico"],
        "Hole Player": ["Jugador de huecos", "Especialista en centros"],
        "Box-to-Box": ["De area a area", "De área a área"],
        "The Destroyer": ["El destructor"],
        "Anchor Man": ["El protector"],
        "Build Up": ["Creacion", "Creación", "Organizador"],  # se mapeará a "-" si MAP_BUILD_UP_TO_NONE=True
        "Offensive Full-Back": ["Lateral ofensivo", "Lateral finalizador"],
        "Defensive Full-Back": ["Lateral defensivo"],
        "Extra Frontman": ["Atacante extra"],
        "Offensive Goalkeeper": ["Portero ofensivo"],
        "Defensive Goalkeeper": ["Portero defensivo"],
    }
    out = {}
    for en, es_list in pairs.items():
        for es in es_list:
            out[norm(es)] = en
    return out
PSTYLE_ES_TO_EN = pstyle_map_pairs()

# COM Playing Styles ES -> EN
def com_map_pairs():
    pairs = {
        "Trickster": ["Mago del balon", "Mago del balón"],
        "Mazing Run": ["Desborde en zigzag"],
        "Speeding Bullet": ["Misil con el balon", "Misil con el balón"],
        "Incisive Run": ["Llegador"],
        "Long Ball Expert": ["Experto pases largos"],
        "Early Cross": ["Centro largo"],
        "Long Ranger": ["Cañonero", "Canonero"],
    }
    out = {}
    for en, es_list in pairs.items():
        for es in es_list:
            out[norm(es)] = en
    return out
COM_ES_TO_EN = com_map_pairs()

# IDs para “NN - Name”
SKILL_ID = {
    "Scissors Feint": 1, "Flip Flap": 2, "Marseille Turn": 3, "Sombrero": 4,
    "Cut Behind & Turn": 5, "Scotch Move": 6, "Heading": 7, "Long Range Drive": 8,
    "Knuckle Shot": 9, "Acrobatic Finishing": 10, "Heel Trick": 11, "First-time Shot": 12,
    "One-touch Pass": 13, "Weighted Pass": 14, "Pinpoint Crossing": 15, "Outside Curler": 16,
    "Rabona": 17, "Low Lofted Pass": 18, "Low Punt Trajectory": 19, "Long Throw": 20,
    "GK Long Throw": 21, "Malicia": 22, "Man Marking": 23, "Track Back": 24,
    "Acrobatic Clear": 25, "Captaincy": 26, "Super-sub": 27, "Fighting Spirit": 28
}
COM_ID = { "Trickster": 1, "Mazing Run": 2, "Speeding Bullet": 3, "Incisive Run": 4, "Long Ball Expert": 5, "Early Cross": 6, "Long Ranger": 7 }

ABILITY_ORDER = [
    "Attacking Prowess", "Ball Control", "Dribbling", "Low Pass", "Lofted Pass",
    "Finishing", "Place Kicking", "Swerve", "Header", "Defence Prowess", "Ball Winning",
    "Kicking Power", "Speed", "Explosive Power", "Body Control", "Physical Contact",
    "Jump", "Goalkeeping", "Catching", "Clearing", "Reflexes", "Coverage", "Stamina",
    "Weak Foot Usage", "Weak Foot Accuracy", "Form", "Injury Tolerance",
]

# ============== Utilidades posiciones (override) ==============
def normalize_pos_token(tok: str) -> str:
    t = tok.strip().upper()
    if not t:
        return ""
    if t in VALID_POS_CODES:
        return t
    t_es = t.lower()
    if t_es in POS_MAP:
        return POS_MAP[t_es]
    return ""

def build_playable_override(text: str) -> str:
    if not text or not text.strip():
        return ""
    tokens = re.split(r"[,\s]+", text.strip())
    out = []
    seen = set()
    for tok in tokens:
        code = normalize_pos_token(tok)
        if code and code not in seen:
            seen.add(code)
            out.append(code)
    return ", ".join(out)

# ============== Parsing del texto de entrada (PES MASTER ES) ==============
def find_first(regex, text, flags=re.IGNORECASE | re.UNICODE):
    m = re.search(regex, text, flags)
    return m.group(1).strip() if m else ""

def parse_input_es(raw: str) -> dict:
    t = raw.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    data = {}

    # Nombre
    name = find_first(r"(?i)Nombre Completo\s*[:\t]\s*(.+)", t)
    if not name:
        for line in t.splitlines():
            s = line.strip()
            if len(s.split()) >= 2 and any(c.isalpha() for c in s):
                name = s
                break
    data["name"] = name

    # Nacionalidad -> demonym en inglés
    nationality = find_first(r"(?i)Nacionalidad\s*[:\t]\s*([^\n]+)", t)
    data["nationality"] = to_demonym(nationality) if nationality else ""

    # Estilo de juego (acepta "Estilo de juego: -" -> "-")
    pstyle_raw = find_first(r"(?i)Estilo de juego\s*:?\s*([^\n]+)", t)
    if pstyle_raw.strip() == "-":
        pstyle_en = "-"
    else:
        pstyle_en = PSTYLE_ES_TO_EN.get(norm(pstyle_raw), "")
        if not pstyle_en:
            for es_norm, en_val in PSTYLE_ES_TO_EN.items():
                if es_norm in norm(t):
                    pstyle_en = en_val
                    break
        if MAP_BUILD_UP_TO_NONE and pstyle_en == "Build Up":
            pstyle_en = "-"
        if not pstyle_en and pstyle_raw.strip() == "":
            pstyle_en = "-"
    data["player_style"] = pstyle_en

    # Altura/Peso
    height = find_first(r"(?i)Altura\s*\(cm\)\s*[:\t]\s*(\d+)", t)
    weight = find_first(r"(?i)Peso\s*[:\t]\s*(\d+)", t)
    data["height"] = f"{height} cm" if height else ""
    data["weight"] = f"{weight} kg" if weight else ""

    # Pie
    foot_es = find_first(r"(?i)Pierna buena\s*[:\t]\s*([A-Za-zÁÉÍÓÚáéíóú\.]+)", t)
    data["foot"] = FOOT_MAP.get(norm(foot_es), data.get("foot", ""))  # puede quedar vacío

    # Edad
    age = find_first(r"(?i)Edad\s*[:\t]\s*(\d+)", t)
    data["age"] = age

    # Posición registrada (natural)
    regpos_raw = find_first(r"(?i)Posici[oó]n[^\n]*?\b([A-Z]{1,3})\b", t)
    data["registered_pos_raw"] = (regpos_raw or "").upper()
    regpos = POS_MAP.get((regpos_raw or "").lower(), "") if regpos_raw else ""

    # Normalizaciones específicas pedidas:
    # - Extremos siempre WF
    if USE_WF_FOR_WINGERS and regpos in ("RWF", "LWF", "WF"):
        regpos = "WF"
    # - Mediocampistas por banda como extremos (si es posición principal)
    if TREAT_SIDE_MIDS_AS_WINGERS and regpos in ("RMF", "LMF"):
        regpos = "WF"
    # - Fallback si no se detectó posición pero hay pistas de banda en el texto
    if not regpos:
        if re.search(r"\b(RWF|LWF|WF|ED|II|RMF|LMF|MI|MD)\b", t, flags=re.I):
            regpos = "WF"

    data["registered_pos"] = regpos

    # Por defecto, Playable vacío (tu regla)
    data["playable_positions"] = ""

    # Weak foot / regularidad / lesiones
    wf_use = find_first(r"(?i)Uso pierna mala\s*[:\t]\s*([^\n]+)", t)
    wf_acc = find_first(r"(?i)Prec\.?\s*pierna mala\s*[:\t]\s*([^\n]+)", t)
    regularidad = find_first(r"(?i)Regularidad\s*[:\t]\s*([^\n]+)", t)
    injury = find_first(r"(?i)Resist\.?\s*?a lesiones\s*[:\t]\s*([^\n]+)", t)
    data["wf_usage"] = WF_USAGE_MAP.get(norm(wf_use), 2)
    data["wf_accuracy"] = WF_ACC_MAP.get(norm(wf_acc), 2)
    data["form"] = FORM_MAP.get(norm(regularidad), FORM_DEFAULT)
    data["injury_tol"] = INJ_MAP.get(norm(injury), INJ_DEFAULT)

    # Abilities
    abilities = {}
    for lab, val in re.findall(r"([A-Za-zÁÉÍÓÚáéíóúñ(). /\-]+?)\s*:\s*(\d{1,3})", t):
        lab_clean = strip_parens(lab)
        key = ABIL_ES_TO_EN.get(norm(lab_clean))
        if key:
            abilities[key] = val
    for val, lab in re.findall(r"\b(\d{1,3})\s*([A-Za-zÁÉÍÓÚáéíóúñ(). /\-]{3,})", t):
        lab_clean = strip_parens(lab)
        key = ABIL_ES_TO_EN.get(norm(lab_clean))
        if key:
            abilities[key] = val  # último gana
    data["abilities"] = abilities

    # Player Skills
    skills_section = ""
    m = re.search(r"(?is)Habilidades\s*(.+?)(?:Estilos de juego IA|$)", t)
    if m:
        skills_section = m.group(1)
    skills_en = []
    for line in skills_section.splitlines():
        s = line.strip().strip("-•·*")
        if not s:
            continue
        en = SKILL_ES_TO_EN.get(norm(s))
        if en:
            skills_en.append(en)
    seen = set()
    skills_en_ordered = []
    for en in sorted(skills_en, key=lambda x: SKILL_ID.get(x, 999)):
        if en not in seen:
            seen.add(en)
            skills_en_ordered.append(en)
    data["player_skills"] = [f"{SKILL_ID[en]:02d} - {en}" for en in skills_en_ordered]

    # COM Playing Styles
    com_section = ""
    m = re.search(r"(?is)Estilos de juego IA\s*(.+)$", t)
    if m:
        com_section = m.group(1)
    com_en = []
    for line in com_section.splitlines():
        s = line.strip().strip("-•·*")
        if not s:
            continue
        en = COM_ES_TO_EN.get(norm(s))
        if en:
            com_en.append(en)
    seen = set()
    com_en_ordered = []
    for en in sorted(com_en, key=lambda x: COM_ID.get(x, 999)):
        if en not in seen:
            seen.add(en)
            com_en_ordered.append(en)
    data["com_styles"] = [f"{COM_ID[en]:02d} - {en}" for en in com_en_ordered]

    return data

# ============== Emisión EXACTA del formato PES 2018 ==============
def canonicalize_player_style(ps: str) -> str:
    if ps.lower() == "offensive full-back".lower():
        ps = "Offensive Full-Back"
    elif ps.lower() == "defensive full-back".lower():
        ps = "Defensive Full-Back"
    if MAP_BUILD_UP_TO_NONE and ps == "Build Up":
        return "-"
    return ps or "-"

def display_registered_pos(regpos: str, regpos_raw: str, use_sb_for_side_backs: bool, use_wf_for_wingers: bool, treat_side_mids_as_wingers: bool) -> str:
    if use_sb_for_side_backs and regpos in ("LB", "RB"):
        return "SB"
    raw = (regpos_raw or "").upper()
    if use_wf_for_wingers and (raw in ("RWF", "LWF") or regpos in ("RWF", "LWF", "WF")):
        return "WF"
    if treat_side_mids_as_wingers and (raw in ("RMF", "LMF", "MD", "MI") or regpos in ("RMF", "LMF")):
        return "WF"
    return regpos

def emit_exact(data: dict, use_sb_for_side_backs: bool, shirt_override: str, playable_override_text: str = "") -> str:
    name = data.get("name", "")
    if shirt_override.strip():
        shirt_name = normalize_shirt_name(shirt_override.strip())
    else:
        shirt_name = make_shirt_name(name)
    shirt_number = SHIRT_NUMBER_DEFAULT
    nationality = data.get("nationality", "")
    player_style = canonicalize_player_style(data.get("player_style", ""))
    height = data.get("height", "")
    weight = data.get("weight", "")
    foot = data.get("foot", "") or "R"  # fallback si faltara
    age = data.get("age", "")
    reg_pos = display_registered_pos(
        data.get("registered_pos", ""),
        data.get("registered_pos_raw", ""),
        use_sb_for_side_backs=use_sb_for_side_backs,
        use_wf_for_wingers=USE_WF_FOR_WINGERS,
        treat_side_mids_as_wingers=TREAT_SIDE_MIDS_AS_WINGERS,
    )

    playable = build_playable_override(playable_override_text) if playable_override_text else ""

    # Abilities + los 4 campos finales
    abilities = dict(data.get("abilities", {}))
    if data.get("wf_usage") is not None:
        abilities["Weak Foot Usage"] = str(data.get("wf_usage"))
    if data.get("wf_accuracy") is not None:
        abilities["Weak Foot Accuracy"] = str(data.get("wf_accuracy"))
    if data.get("form") is not None:
        abilities["Form"] = str(data.get("form"))
    if data.get("injury_tol") is not None:
        abilities["Injury Tolerance"] = str(data.get("injury_tol"))

    player_skills = data.get("player_skills", [])
    com_styles = data.get("com_styles", [])

    indent = " " * 20
    nbsp = "\xa0"  # NBSP como en el ejemplo de referencia
    header = (
        f"{indent}"
        f"Name: {name}"
        f"Shirt Name: {shirt_name}"
        f"Shirt Number {shirt_number}"
        f"Nationality: {nationality}{nbsp}"
        f"Player Styles: {player_style}"
        f"Height: {height}"
        f"Weight: {weight}"
        f"Foot: {foot}"
        f"Age: {age}"
        f"Registered Position: {reg_pos}*"
        f"Playable Positions: {playable}"
        f"Ability Settings"
    )
    for key in ABILITY_ORDER:
        if key in abilities:
            header += f"{key}: {abilities[key]}"

    out = "\n\n" + header + "\n\t\t\t\t\n\t\t\t\t\n\n<Player Skills>\n"
    for line in player_skills:
        out += f"{line}\n"
    out += "\n\n\n<COM Playing Styles>\n\n"
    for line in com_styles:
        out += f"{line}\n"
    out += "\n\n\n"
    return out

# ============== GUI (Tkinter) ==============
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PES MASTER -> PES 2018 (Exact Format)")
        self.geometry("1250x820")
        try:
            self.call("tk", "scaling", 1.2)
        except tk.TclError:
            pass

        self.grid_columnconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(3, weight=1)

        # Overrides
        top = ttk.Frame(self)
        top.grid(row=0, column=0, columnspan=2, sticky="ew", padx=8, pady=(8, 4))
        for i in range(6):
            top.grid_columnconfigure(i, weight=1)

        ttk.Label(top, text="Shirt Name override (optional):").grid(row=0, column=0, sticky="w", padx=(0, 8))
        self.entry_shirt = ttk.Entry(top)
        self.entry_shirt.grid(row=0, column=1, sticky="ew")

        self.var_use_sb = tk.BooleanVar(value=True)
        ttk.Checkbutton(top, text="Use SB for side backs (LB/RB → SB)", variable=self.var_use_sb).grid(row=0, column=2, padx=12, sticky="w")

        ttk.Label(top, text="Playable positions override (e.g., AMF, SS or MP, SD):").grid(row=0, column=3, sticky="e", padx=(12, 8))
        self.entry_playable = ttk.Entry(top)
        self.entry_playable.grid(row=0, column=4, sticky="ew", padx=(0, 8))

        # Labels
        ttk.Label(self, text="Input (PES MASTER - español):").grid(row=1, column=0, sticky="w", padx=8, pady=(8, 4))
        ttk.Label(self, text="Output (PES 2018 - formato exacto):").grid(row=1, column=1, sticky="w", padx=8, pady=(8, 4))

        # Text areas
        self.txt_in = tk.Text(self, wrap="word", undo=True)
        self.txt_in.grid(row=3, column=0, sticky="nsew", padx=8, pady=4)

        self.txt_out = tk.Text(self, wrap="none", undo=False)
        self.txt_out.grid(row=3, column=1, sticky="nsew", padx=8, pady=4)

        # Buttons
        btns = ttk.Frame(self)
        btns.grid(row=4, column=0, columnspan=2, sticky="ew", padx=8, pady=8)
        for i in range(4):
            btns.grid_columnconfigure(i, weight=1)

        ttk.Button(btns, text="Generate (Ctrl+Enter)", command=self.on_generate).grid(row=0, column=0, padx=4)
        ttk.Button(btns, text="Copy output", command=self.on_copy).grid(row=0, column=1, padx=4)
        ttk.Button(btns, text="Clear input", command=lambda: self.txt_in.delete("1.0", "end")).grid(row=0, column=2, padx=4)
        ttk.Button(btns, text="Clear output", command=lambda: self.txt_out.delete("1.0", "end")).grid(row=0, column=3, padx=4)

        # Keybinding
        self.bind("<Control-Return>", lambda e: self.on_generate())

    def on_generate(self):
        raw = self.txt_in.get("1.0", "end")
        if not raw.strip():
            messagebox.showinfo("Info", "Pegá o escribí el texto de PES MASTER en el panel izquierdo.")
            return
        try:
            data = parse_input_es(raw)
            out = emit_exact(
                data,
                use_sb_for_side_backs=self.var_use_sb.get(),
                shirt_override=self.entry_shirt.get(),
                playable_override_text=self.entry_playable.get(),
            )
            self.txt_out.delete("1.0", "end")
            self.txt_out.insert("1.0", out)
        except Exception as ex:
            messagebox.showerror("Error", f"Ocurrió un error al convertir:\n{ex}")

    def on_copy(self):
        out = self.txt_out.get("1.0", "end")
        if not out.strip():
            messagebox.showinfo("Info", "No hay salida para copiar. Generá primero.")
            return
    # clipboard
        self.clipboard_clear()
        self.clipboard_append(out)
        self.update()
        messagebox.showinfo("Copiado", "Salida copiada al portapapeles.")

if __name__ == "__main__":
    App().mainloop()



