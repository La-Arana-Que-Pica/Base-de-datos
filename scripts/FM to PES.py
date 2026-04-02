#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import tkinter as tk
from tkinter import ttk, messagebox
import unicodedata
from typing import Dict, Tuple, List

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

# ============== Reglas confirmadas ==============
def make_shirt_name(full_name: str) -> str:
    parts = [p for p in re.split(r"\s+", full_name.strip()) if p]
    return parts[-1].upper() if parts else ""

SHIRT_NUMBER_DEFAULT = "1"
MAP_BUILD_UP_TO_NONE = True
USE_WF_FOR_WINGERS = True
TREAT_SIDE_MIDS_AS_WINGERS = True  # RMF/LMF -> WF si es posición principal

FOOT_MAP = {
    norm("Derecha"): "R", norm("Der"): "R", norm("Der."): "R", norm("Dcha"): "R",
    norm("Right"): "R", norm("R"): "R",
    norm("Izquierda"): "L", norm("Izq"): "L", norm("Izq."): "L",
    norm("Left"): "L", norm("L"): "L",
}

# Posiciones FM → PES
POS_MAP = {
    "pt": "GK", "gk": "GK",
    "dc": "CB",
    "dl": "LB", "wbl": "LB",
    "dr": "RB", "wbr": "RB",
    "dm": "DMF",
    "mc": "CMF",
    "amc": "AMF",
    "ml": "LMF",
    "mr": "RMF",
    "aml": "WF",
    "amr": "WF",
    "st": "CF",
    "rwf": "WF", "lwf": "WF",
}
VALID_POS_CODES = {"GK","CB","RB","LB","DMF","CMF","AMF","RMF","LMF","RWF","LWF","WF","SS","CF","SB"}

FORM_DEFAULT = 5
INJ_DEFAULT = 2

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
    norm("Slovenia"): "Slovenian",
    norm("Bolivia"): "Bolivian",
}
def to_demonym(country: str) -> str:
    return DEMONYM_MAP.get(norm(country), country)

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

# ============== Utilidades posiciones ==============
def normalize_pos_token(tok: str) -> str:
    t = tok.strip().lower()
    return t if t in POS_MAP else ""

def build_playable_override(text: str) -> str:
    if not text or not text.strip():
        return ""
    tokens = re.split(r"[,\s]+", text.strip())
    out = []
    seen = set()
    for tok in tokens:
        code = POS_MAP.get(tok.lower(), "").upper()
        if tok.upper() in VALID_POS_CODES:
            code = tok.upper()
        if code and code not in seen:
            seen.add(code)
            out.append(code)
    return ", ".join(out)

# ============== Escalado FM 0–99 -> PES 40–99 ==============
def fm_to_pes(v: float) -> int:
    return int(round(40.0 + (v * 59.0 / 99.0)))

# ============== Parsing FM básico ==============
def find_first_multi(regex, text, flags=re.IGNORECASE | re.UNICODE | re.MULTILINE):
    m = re.search(regex, text, flags)
    return m.group(1).strip() if m else ""

def parse_positions_line(raw: str) -> List[str]:
    line = find_first_multi(r"(?i)Position\(s\)\s*\n([^\n]+)", raw)
    tokens = [t.strip().lower() for t in re.split(r"[,\s]+", line) if t.strip()]
    cleaned = [t for t in tokens if t in POS_MAP]
    return cleaned

def choose_registered_position(tokens: List[str], attrs: Dict[str, int]) -> str:
    set_tokens = set(tokens)
    if 'aml' in set_tokens or 'amr' in set_tokens:
        return "WF"
    if 'st' in set_tokens:
        if 'amc' in set_tokens and not ('aml' in set_tokens or 'amr' in set_tokens):
            fin = attrs.get("Finishing", 0) + attrs.get("Off the Ball", 0)
            cre = attrs.get("Vision", 0) + attrs.get("Passing", 0) + attrs.get("Technique", 0)
            if cre > fin + 20:
                return "AMF"
        return "CF"
    if 'amc' in set_tokens:
        if ('ml' in set_tokens or 'mr' in set_tokens) and not ('aml' in set_tokens or 'amr' in set_tokens):
            return "WF" if TREAT_SIDE_MIDS_AS_WINGERS else "AMF"
        return "AMF"
    if 'ml' in set_tokens or 'mr' in set_tokens:
        return "WF" if (USE_WF_FOR_WINGERS or TREAT_SIDE_MIDS_AS_WINGERS) else ("LMF" if 'ml' in set_tokens else "RMF")
    if 'mc' in set_tokens and 'dm' in set_tokens:
        return "CMF"
    if 'mc' in set_tokens:
        return "CMF"
    if 'dm' in set_tokens:
        return "DMF"
    if 'dc' in set_tokens:
        return "CB"
    if 'dl' in set_tokens or 'wbl' in set_tokens:
        return "LB"
    if 'dr' in set_tokens or 'wbr' in set_tokens:
        return "RB"
    if 'gk' in set_tokens or 'pt' in set_tokens:
        return "GK"
    return "CMF"

def build_auto_playable(tokens: List[str], registered: str, is_gk: bool) -> str:
    if is_gk:
        return ""
    set_tokens = set(tokens)
    playable_codes = set()
    for t in set_tokens:
        code = POS_MAP.get(t, "")
        if code:
            if USE_WF_FOR_WINGERS and code in ("RWF","LWF","WF"):
                code = "WF"
            if TREAT_SIDE_MIDS_AS_WINGERS and code in ("RMF","LMF") and registered == "WF":
                code = "WF"
            playable_codes.add(code)
    if registered == "WF":
        if 'amc' in set_tokens:
            playable_codes.add("AMF")
        if 'st' in set_tokens:
            playable_codes.add("CF")
        if 'ml' in set_tokens:
            playable_codes.add("LMF")
        if 'mr' in set_tokens:
            playable_codes.add("RMF")
    elif registered == "AMF":
        if 'st' in set_tokens:
            playable_codes.add("CF")
            playable_codes.add("SS")
        if 'aml' in set_tokens or 'amr' in set_tokens or 'ml' in set_tokens or 'mr' in set_tokens:
            playable_codes.add("WF")
    elif registered == "CF":
        if 'amc' in set_tokens:
            playable_codes.add("AMF")
            playable_codes.add("SS")
        if 'aml' in set_tokens or 'amr' in set_tokens:
            playable_codes.add("WF")
    elif registered == "CMF":
        if 'dm' in set_tokens:
            playable_codes.add("DMF")
        if 'amc' in set_tokens:
            playable_codes.add("AMF")
    elif registered == "DMF":
        if 'dc' in set_tokens:
            playable_codes.add("CB")
        if 'mc' in set_tokens:
            playable_codes.add("CMF")
    elif registered == "CB":
        if 'dl' in set_tokens or 'wbl' in set_tokens:
            playable_codes.add("LB")
        if 'dr' in set_tokens or 'wbr' in set_tokens:
            playable_codes.add("RB")
        if 'dm' in set_tokens:
            playable_codes.add("DMF")
    elif registered in ("LB","RB"):
        if 'ml' in set_tokens or 'mr' in set_tokens or 'aml' in set_tokens or 'amr' in set_tokens:
            playable_codes.add("WF")
        if 'mc' in set_tokens:
            playable_codes.add("CMF")
        if 'dm' in set_tokens:
            playable_codes.add("DMF")
    if registered:
        playable_codes.add(registered)
    order = ["GK","CB","RB","LB","SB","DMF","CMF","AMF","RMF","LMF","WF","SS","CF"]
    ordered = [c for c in order if c in playable_codes]
    return ", ".join(ordered)

# ============== Weak Foot y campos finales ==============
def wf_usage_from_bad_foot(bad_foot_val: int) -> int:
    if bad_foot_val >= 80: return 4
    if bad_foot_val >= 60: return 3
    if bad_foot_val >= 40: return 2
    return 1

def wf_accuracy_from_bad_foot(bad_foot_val: int, technique: int, first_touch: int, passing: int, crossing: int, finishing: int) -> int:
    base = (technique + first_touch + passing + crossing + finishing) / 5.0
    factor = 0.7 + 0.3 * (bad_foot_val / 99.0)
    score = base * factor
    if score >= 80: return 4
    if score >= 60: return 3
    if score >= 40: return 2
    return 1

# ============== Player Style inferido ==============
def infer_player_style(attrs: Dict[str, int], regpos: str, is_gk: bool) -> str:
    if is_gk:
        rushing = attrs.get("Rushing Out (Tendency)", 0)
        kicking = attrs.get("Kicking", 0)
        throwing = attrs.get("Throwing", 0)
        if rushing >= 75 and (kicking >= 75 or throwing >= 75):
            return "Offensive Goalkeeper"
        return "Defensive Goalkeeper"
    drib = attrs.get("Dribbling", 0)
    pace = attrs.get("Pace", 0)
    accel = attrs.get("Acceleration", 0)
    flair = attrs.get("Flair", 0)
    fin = attrs.get("Finishing", 0)
    strg = attrs.get("Strength", 0)
    vision = attrs.get("Vision", 0)
    passing = attrs.get("Passing", 0)
    heading = attrs.get("Heading", 0)
    positioning = attrs.get("Positioning", 0)
    tackling = attrs.get("Tackling", 0)
    stamina = attrs.get("Stamina", 0)
    if regpos == "WF":
        if drib >= 85 and flair >= 80 and (vision >= 80 or passing >= 80):
            return "Creative Playmaker"
        if pace >= 85 and accel >= 85:
            return "Prolific Winger"
        if fin >= 80 and positioning >= 70:
            return "Goal Poacher"
        return "Creative Playmaker"
    if regpos == "CF":
        if heading >= 80 and strg >= 80:
            return "Target Man"
        if fin >= 85:
            return "Fox in the Box"
        return "Target Man"
    if regpos == "AMF":
        if vision >= 85 and passing >= 85:
            return "Classic No. 10"
        return "Creative Playmaker"
    if regpos == "CMF":
        if stamina >= 80 and tackling >= 70 and positioning >= 70:
            return "Box-to-Box"
        return "Creative Playmaker" if vision >= 80 or passing >= 80 else "Box-to-Box"
    if regpos == "DMF":
        if tackling >= 80 and positioning >= 75:
            return "The Destroyer"
        return "Anchor Man"
    if regpos in ("LB","RB","SB"):
        if pace >= 80 and drib >= 70:
            return "Offensive Full-Back"
        return "Defensive Full-Back"
    if regpos == "CB":
        if tackling >= 80 and positioning >= 80:
            return "The Destroyer"
        return "Anchor Man"
    return "Creative Playmaker"

# ============== Combos y atributos (CAMPO) ==============
def combos_field(attrs: Dict[str, int]) -> Dict[str, float]:
    g = lambda k: attrs.get(k, 0)
    return {
        "Attacking Prowess": 0.4*g("Off the Ball") + 0.2*g("Anticipation") + 0.2*g("Decisions") + 0.2*g("Finishing"),
        "Ball Control": 0.5*g("First Touch") + 0.3*g("Technique") + 0.2*g("Balance"),
        "Dribbling": 0.7*g("Dribbling") + 0.2*g("Agility") + 0.1*g("Flair"),
        "Low Pass": 0.6*g("Passing") + 0.3*g("Vision") + 0.1*g("Decisions"),
        "Lofted Pass": 0.6*g("Crossing") + 0.3*g("Passing") + 0.1*g("Technique"),
        "Finishing": 0.7*g("Finishing") + 0.3*g("Composure"),
        "Place Kicking": 0.7*g("Free Kick Taking") + 0.3*g("Technique"),
        "Swerve": 0.4*g("Free Kick Taking") + 0.4*g("Technique") + 0.2*g("Flair"),
        "Header": 0.7*g("Heading") + 0.3*g("Jumping Reach"),
        "Defence Prowess": 0.4*g("Positioning") + 0.3*g("Anticipation") + 0.2*g("Decisions") + 0.1*g("Tackling"),
        "Ball Winning": 0.5*g("Tackling") + 0.25*g("Aggression") + 0.25*g("Work Rate"),
        "Kicking Power": 0.6*g("Long Shots") + 0.2*g("Strength") + 0.2*g("Technique"),
        "Speed": g("Pace"),
        "Explosive Power": 0.6*g("Acceleration") + 0.4*g("Agility"),
        "Body Control": 0.5*g("Balance") + 0.3*g("Agility") + 0.2*g("Strength"),
        "Physical Contact": 0.6*g("Strength") + 0.4*g("Bravery"),
        "Jump": 0.7*g("Jumping Reach") + 0.3*g("Balance"),
        "Stamina": 0.7*g("Stamina") + 0.3*g("Natural Fitness"),
    }

# ============== Conversión ESPECÍFICA PARA ARQUEROS (no 40s planos) ==============
def combos_gk(attrs: Dict[str, int]) -> Dict[str, float]:
    g = lambda k: attrs.get(k, 0)
    out = {
        # GK abilities (PES)
        "Goalkeeping": 0.35*g("Handling") + 0.30*g("Reflexes") + 0.15*g("One on Ones") + 0.10*g("Communication") + 0.10*g("Positioning"),
        "Catching":    0.60*g("Handling") + 0.25*g("Aerial Reach") + 0.15*g("Communication"),
        "Clearing":    0.35*g("Punching (Tendency)") + 0.30*g("Rushing Out (Tendency)") + 0.25*g("Command of Area") + 0.10*g("Communication"),
        "Reflexes":    0.70*g("Reflexes") + 0.20*g("One on Ones") + 0.10*g("Agility"),
        "Coverage":    0.40*g("Positioning") + 0.20*g("Anticipation") + 0.20*g("Decisions") + 0.20*g("Communication"),
        # Físicas
        "Kicking Power": 0.60*g("Kicking") + 0.20*g("Strength") + 0.20*g("Technique"),
        "Speed":           g("Pace"),
        "Explosive Power": 0.60*g("Acceleration") + 0.40*g("Agility"),
        "Body Control":    0.50*g("Balance") + 0.30*g("Agility") + 0.20*g("Strength"),
        "Physical Contact":0.60*g("Strength") + 0.40*g("Bravery"),
        "Jump":            0.70*g("Jumping Reach") + 0.30*g("Balance"),
        "Stamina":         0.70*g("Stamina") + 0.30*g("Natural Fitness"),
    }
    # Derivaciones de habilidades de campo desde atributos de GK (evitar relleno 40 plano)
    # Estas fórmulas dan valores razonables para GK sin requerir Long Shots, etc.
    out["Attacking Prowess"] = 0.30*g("Off the Ball") + 0.25*g("Anticipation") + 0.25*g("Decisions") + 0.20*g("Composure")
    out["Ball Control"]      = 0.50*g("First Touch") + 0.30*g("Technique") + 0.20*g("Balance")
    out["Dribbling"]         = 0.40*g("Agility") + 0.35*g("Technique") + 0.25*g("First Touch")
    out["Low Pass"]          = 0.55*g("Passing") + 0.25*g("Vision") + 0.20*g("Decisions")
    out["Lofted Pass"]       = 0.55*g("Passing") + 0.25*g("Technique") + 0.20*g("Kicking")
    out["Finishing"]         = 0.50*g("Composure") + 0.30*g("Decisions") + 0.20*g("Anticipation")
    out["Place Kicking"]     = 0.60*g("Technique") + 0.40*g("Free Kick Taking")
    out["Swerve"]            = 0.50*g("Technique") + 0.30*g("Free Kick Taking") + 0.20*g("Vision")
    out["Header"]            = 0.60*g("Heading") + 0.40*g("Jumping Reach")
    out["Defence Prowess"]   = 0.50*g("Positioning") + 0.25*g("Anticipation") + 0.25*g("Decisions")
    out["Ball Winning"]      = 0.45*g("Tackling") + 0.30*g("Aggression") + 0.25*g("Work Rate")
    return out

# ============== Skills y COM ==============
def infer_skills_and_com(attrs: Dict[str, int], is_gk: bool, combos: Dict[str, float]) -> Tuple[List[str], List[str]]:
    skills = []
    coms = []

    def order_skills(skills_list: List[str]) -> List[str]:
        seen = set(); out = []
        for en in sorted(skills_list, key=lambda x: SKILL_ID.get(x, 999)):
            if en not in seen and en in SKILL_ID:
                seen.add(en); out.append(f"{SKILL_ID[en]:02d} - {en}")
        return out

    def order_com(com_list: List[str]) -> List[str]:
        seen = set(); out = []
        for en in sorted(com_list, key=lambda x: COM_ID.get(x, 999)):
            if en not in seen and en in COM_ID:
                seen.add(en); out.append(f"{COM_ID[en]:02d} - {en}")
        return out

    if is_gk:
        # GK skills según atributos
        if attrs.get("Kicking", 0) >= 68 and attrs.get("Decisions", 0) >= 58:
            skills.append("Low Punt Trajectory")
        if attrs.get("Throwing", 0) >= 68:
            skills.append("GK Long Throw")
        # COM: ninguno para GK
        return order_skills(skills), []

    # Jugador de campo: reglas básicas
    drib = attrs.get("Dribbling", 0); agi = attrs.get("Agility", 0); flair = attrs.get("Flair", 0)
    ft = attrs.get("First Touch", 0); pas = attrs.get("Passing", 0); vis = attrs.get("Vision", 0)
    tech = attrs.get("Technique", 0); cross = attrs.get("Crossing", 0)
    lshot = attrs.get("Long Shots", 0); kpow = combos.get("Kicking Power", 0)

    if drib >= 85 and agi >= 80: skills.append("Scissors Feint")
    if drib >= 85 and flair >= 75: skills.append("Flip Flap")
    if ft >= 80 and agi >= 80 and tech >= 80: skills.append("Marseille Turn")
    if flair >= 85 and tech >= 80: skills.append("Sombrero")
    if agi >= 85 and tech >= 80: skills.append("Scotch Move")
    if flair >= 90 and tech >= 85: skills.append("Heel Trick")
    if ft >= 85 and pas >= 80: skills.append("One-touch Pass")
    if vis >= 85 and pas >= 80 and tech >= 80: skills.append("Weighted Pass")
    if cross >= 85 and vis >= 80 and tech >= 80: skills.append("Pinpoint Crossing")
    swerve_combo = combos.get("Swerve", 0)
    if tech >= 85 and swerve_combo >= 70: skills.append("Outside Curler")
    if lshot >= 85 and kpow >= 70: skills.append("Long Range Drive")
    if attrs.get("Heading", 0) >= 85 and attrs.get("Jumping Reach", 0) >= 80: skills.append("Heading")
    if flair >= 95 and tech >= 90: skills.append("Rabona")

    # COM styles
    if flair >= 85 and drib >= 80: coms.append("Trickster")
    if drib >= 85 and attrs.get("Acceleration", 0) >= 80 and agi >= 80: coms.append("Mazing Run")
    if attrs.get("Off the Ball", 0) >= 80 and attrs.get("Decisions", 0) >= 75 and attrs.get("Acceleration", 0) >= 75: coms.append("Incisive Run")
    if vis >= 85 and pas >= 80 and cross >= 80: coms.append("Long Ball Expert")
    if cross >= 85 and vis >= 80: coms.append("Early Cross")
    if attrs.get("Long Shots", 0) >= 85 and kpow >= 70: coms.append("Long Ranger")

    return order_skills(skills), order_com(coms)

# ============== Parsing FM completo ==============
def parse_age_name_fm(raw: str) -> Tuple[str, str]:
    name = find_first_multi(r"(?i)Name\s*\n([^\n]+)", raw)
    if not name:
        for ln in raw.splitlines():
            s = ln.strip()
            if s and re.match(r"^[A-Za-z][A-Za-z '.\-]+$", s):
                name = s
                break
    age = find_first_multi(r"(?i)Age\s*\n\s*(\d{1,3})", raw)
    return (name, age)

def parse_nationality_fm(raw: str) -> str:
    lines = raw.splitlines()
    pos_idx = None
    for i, ln in enumerate(lines):
        if re.search(r"(?i)Position\(s\)", ln):
            pos_idx = i
            break
    country = ""
    if pos_idx is not None:
        for j in range(pos_idx-6, pos_idx):
            if j < 0: continue
            s = lines[j].strip()
            if not s or s.startswith("€") or re.search(r"(?i)Club|Wages|Contract|Sell value|Rel\. clause|Image|Caps|Goals", s):
                continue
            if norm(s) in DEMONYM_MAP:
                country = s
                break
    if not country:
        for ln in lines:
            s = ln.strip()
            if norm(s) in DEMONYM_MAP:
                country = s
                break
    return to_demonym(country) if country else ""

def parse_feet_fm(raw: str) -> Tuple[str, int, int]:
    left = find_first_multi(r"(?i)Left foot\s*\n\s*(\d{1,3})", raw)
    right = find_first_multi(r"(?i)Right foot\s*\n\s*(\d{1,3})", raw)
    lv = int(left) if left else 0
    rv = int(right) if right else 0
    foot = "R" if rv >= lv else "L"
    return (foot, lv, rv)

def parse_height_weight_fm(raw: str) -> Tuple[str, str]:
    h = find_first_multi(r"(?i)Height\s*\n\s*(\d{2,3})\s*cm", raw)
    height = f"{h} cm" if h else ""
    weights = re.findall(r"(\d{2,3})\s*kg", raw, flags=re.I)
    weight = f"{weights[-1]} kg" if weights else ""
    return (height, weight)

def parse_attributes_fm(raw: str) -> Dict[str, int]:
    attrs = {}
    for lab, val in re.findall(r"([A-Za-z \-()]+)\s*\t\s*(\d{1,3})", raw):
        attrs[lab.strip()] = int(val)
    for m in re.finditer(r"([A-Za-z \-()]+)\s*\n\s*(\d{1,3})", raw):
        attrs[m.group(1).strip()] = int(m.group(2))
    return attrs

def parse_input_fm(raw: str) -> dict:
    t = raw.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    name, age = parse_age_name_fm(t)
    nationality = parse_nationality_fm(t)
    height, weight = parse_height_weight_fm(t)
    foot, left_foot, right_foot = parse_feet_fm(t)
    tokens = parse_positions_line(t)
    attrs = parse_attributes_fm(t)

    registered = choose_registered_position(tokens, attrs)
    is_gk = (registered == "GK")

    combos = combos_gk(attrs) if is_gk else combos_field(attrs)

    # No forzar 40 plano: las derivaciones de GK ya llenan las habilidades de campo.
    # Si NO es GK: asegurar las 5 de GK con mínimo 40
    if not is_gk:
        for gk_key in ("Goalkeeping","Catching","Clearing","Reflexes","Coverage"):
            combos.setdefault(gk_key, 0)

    abilities_pes = {}
    for k, v in combos.items():
        abilities_pes[k] = fm_to_pes(v) if v > 0 else 40

    bad_foot = left_foot if foot == "R" else right_foot
    wf_usage = wf_usage_from_bad_foot(bad_foot)
    wf_acc = wf_accuracy_from_bad_foot(
        bad_foot,
        technique=attrs.get("Technique", 0),
        first_touch=attrs.get("First Touch", 0),
        passing=attrs.get("Passing", 0),
        crossing=attrs.get("Crossing", 0),
        finishing=attrs.get("Finishing", 0),
    )

    pstyle = infer_player_style(attrs, registered, is_gk)
    skills, coms = infer_skills_and_com(attrs, is_gk, combos)
    auto_playable = "" if is_gk else build_auto_playable(tokens, registered, is_gk)

    data = {
        "name": name,
        "nationality": nationality,
        "player_style": pstyle,
        "height": height,
        "weight": weight,
        "foot": foot or "R",
        "age": age,
        "registered_pos_raw": (tokens[0].upper() if tokens else registered),
        "registered_pos": registered,
        "auto_playable_positions": auto_playable,
        "abilities": abilities_pes,
        "wf_usage": wf_usage,
        "wf_accuracy": wf_acc,
        "form": FORM_DEFAULT,
        "injury_tol": INJ_DEFAULT,
        "player_skills": skills,
        "com_styles": coms,
    }
    return data

# ============== Emisión EXACTA ==============
def canonicalize_player_style(ps: str) -> str:
    if ps.lower() == "offensive full-back".lower():
        ps = "Offensive Full-Back"
    elif ps.lower() == "defensive full-back".lower():
        ps = "Defensive Full-Back"
    if MAP_BUILD_UP_TO_NONE and ps == "Build Up":
        return "-"
    return ps or "-"

def display_registered_pos(regpos: str, regpos_raw: str, use_sb_for_side_backs: bool,
                           use_wf_for_wingers: bool, treat_side_mids_as_wingers: bool) -> str:
    if use_sb_for_side_backs and regpos in ("LB","RB"):
        return "SB"
    raw = (regpos_raw or "").upper()
    if use_wf_for_wingers and regpos in ("RWF","LWF","WF") or (raw in ("RWF","LWF")):
        return "WF"
    if treat_side_mids_as_wingers and regpos in ("RMF","LMF") or raw in ("RMF","LMF","MR","ML"):
        return "WF" if regpos == "WF" or regpos in ("RMF","LMF") else regpos
    return regpos

def emit_exact(data: dict, use_sb_for_side_backs: bool, shirt_override: str,
               playable_override_text: str = "") -> str:
    name = data.get("name", "")
    shirt_name = shirt_override.strip().upper() if shirt_override.strip() else make_shirt_name(name)
    shirt_number = SHIRT_NUMBER_DEFAULT
    nationality = data.get("nationality", "")
    player_style = canonicalize_player_style(data.get("player_style", ""))
    height = data.get("height", "")
    weight = data.get("weight", "")
    foot = data.get("foot", "") or "R"
    age = data.get("age", "")
    reg_pos = display_registered_pos(
        data.get("registered_pos", ""),
        data.get("registered_pos_raw", ""),
        use_sb_for_side_backs=use_sb_for_side_backs,
        use_wf_for_wingers=USE_WF_FOR_WINGERS,
        treat_side_mids_as_wingers=TREAT_SIDE_MIDS_AS_WINGERS,
    )

    playable = build_playable_override(playable_override_text) if playable_override_text.strip() else data.get("auto_playable_positions","")

    abilities = dict(data.get("abilities", {}))
    # Asegurar presencia de TODAS las llaves en ABILITY_ORDER
    for key in ABILITY_ORDER:
        if key not in abilities:
            abilities[key] = 40 if key not in ("Weak Foot Usage","Weak Foot Accuracy","Form","Injury Tolerance") else abilities.get(key, 2 if "Weak Foot" in key else (FORM_DEFAULT if key=="Form" else INJ_DEFAULT))

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
    nbsp = "\xa0"
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
        self.title("FM -> PES 2018 (Exact Format)")
        self.geometry("1250x860")
        try:
            self.call("tk", "scaling", 1.2)
        except tk.TclError:
            pass

        self.grid_columnconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(3, weight=1)

        top = ttk.Frame(self)
        top.grid(row=0, column=0, columnspan=2, sticky="ew", padx=8, pady=(8, 4))
        for i in range(5):
            top.grid_columnconfigure(i, weight=1)

        ttk.Label(top, text="Shirt Name override:").grid(row=0, column=0, sticky="w", padx=(0, 8))
        self.entry_shirt = ttk.Entry(top)
        self.entry_shirt.grid(row=0, column=1, sticky="ew")

        self.var_use_sb = tk.BooleanVar(value=True)
        ttk.Checkbutton(top, text="Use SB for side backs (LB/RB → SB)", variable=self.var_use_sb).grid(row=0, column=2, padx=12, sticky="w")

        ttk.Label(top, text="Playable positions override:").grid(row=0, column=3, sticky="e", padx=(12, 8))
        self.entry_playable = ttk.Entry(top)
        self.entry_playable.grid(row=0, column=4, sticky="ew", padx=(0, 8))

        ttk.Label(self, text="Input (FM con peso final Ej: '72kg')").grid(row=2, column=0, sticky="w", padx=8, pady=(8, 4))
        ttk.Label(self, text="Output (PES 2018 - formato exacto)").grid(row=2, column=1, sticky="w", padx=8, pady=(8, 4))

        self.txt_in = tk.Text(self, wrap="word", undo=True)
        self.txt_in.grid(row=3, column=0, sticky="nsew", padx=8, pady=4)

        self.txt_out = tk.Text(self, wrap="none", undo=False)
        self.txt_out.grid(row=3, column=1, sticky="nsew", padx=8, pady=4)

        btns = ttk.Frame(self)
        btns.grid(row=4, column=0, columnspan=2, sticky="ew", padx=8, pady=8)
        for i in range(4):
            btns.grid_columnconfigure(i, weight=1)

        ttk.Button(btns, text="Generate (Ctrl+Enter)", command=self.on_generate).grid(row=0, column=0, padx=4)
        ttk.Button(btns, text="Copy output", command=self.on_copy).grid(row=0, column=1, padx=4)
        ttk.Button(btns, text="Clear input", command=lambda: self.txt_in.delete("1.0", "end")).grid(row=0, column=2, padx=4)
        ttk.Button(btns, text="Clear output", command=lambda: self.txt_out.delete("1.0", "end")).grid(row=0, column=3, padx=4)

        self.bind("<Control-Return>", lambda e: self.on_generate())

    def on_generate(self):
        raw = self.txt_in.get("1.0", "end")
        if not raw.strip():
            messagebox.showinfo("Info", "Pegá el texto FM (terminando con 'NNkg').")
            return
        try:
            data = parse_input_fm(raw)
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
            messagebox.showinfo("Info", "No hay salida para copiar.")
            return
        self.clipboard_clear()
        self.clipboard_append(out)
        self.update()
        messagebox.showinfo("Copiado", "Salida copiada al portapapeles.")

if __name__ == "__main__":
    App().mainloop()