#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import tkinter as tk
from tkinter import ttk, messagebox
import unicodedata
from typing import Dict, Tuple, List, Optional

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
    return normalize_shirt_name_ascii(parts[-1] if parts else "")

def normalize_shirt_name_ascii(text: Optional[str]) -> str:
    if text is None:
        return ""
    s = str(text).strip()
    repl = {
        "ß": "ss", "ẞ": "ss",
        "æ": "ae", "Æ": "ae",
        "œ": "oe", "Œ": "oe",
        "ø": "o", "Ø": "o",
        "ð": "d", "Ð": "d",
        "þ": "th", "Þ": "th",
        "ł": "l", "Ł": "l",
        "ñ": "n", "Ñ": "n",
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^A-Za-z]", "", s)
    return s.upper()

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

# (max_profile, target_skills, max_skills, soft_threshold)
SKILL_TIERS = [
    (58, 1, 2, 66),
    (66, 2, 3, 69),
    (74, 3, 4, 72),
    (82, 4, 5, 74),
    (89, 5, 6, 76),
]
# (target_skills, max_skills, soft_threshold) used when profile exceeds SKILL_TIERS.
SKILL_TOP_TIER = (6, 7, 78)
# (max_profile, target_com, max_com, com_threshold)
COM_TIERS = [
    (62, 0, 1, 72),
    (76, 1, 2, 74),
    (88, 2, 3, 76),
]
# (target_com, max_com, com_threshold) used when profile exceeds COM_TIERS.
COM_TOP_TIER = (3, 3, 78)
MIDFIELDER_OR_WINGER_POS = ("WF", "LMF", "RMF", "AMF", "CMF", "DMF")
WIDE_OR_ATTACKING_MID_POS = ("WF", "LMF", "RMF", "AMF")
MIDFIELDER_COM_PROFILE_MIN = 60
WIDE_PLAYMAKER_BOOST_PROFILE_MIN = 74
MIDFIELDER_OR_WINGER_COM_THRESHOLD_BOOST = 2
PROFILE_WEIGHT_DRIB = 0.12
PROFILE_WEIGHT_AGI = 0.10
PROFILE_WEIGHT_FT = 0.10
PROFILE_WEIGHT_PAS = 0.10
PROFILE_WEIGHT_VIS = 0.10
PROFILE_WEIGHT_TECH = 0.10
PROFILE_WEIGHT_ACC = 0.08
PROFILE_WEIGHT_OTB = 0.08
PROFILE_WEIGHT_DEC = 0.07
PROFILE_WEIGHT_FLAIR = 0.06
PROFILE_WEIGHT_CROSS = 0.05
PROFILE_WEIGHT_LSHOT = 0.04

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
    return max(40, min(99, int(round(40.0 + (v * 59.0 / 99.0)))))

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
        return "-"
    return "Creative Playmaker"

# ============== Combos y atributos (CAMPO) ==============
def combos_field(attrs: Dict[str, int]) -> Dict[str, float]:
    g = lambda k: attrs.get(k, 0)
    return {
        "Attacking Prowess": 0.35*g("Off the Ball") + 0.20*g("Anticipation") + 0.20*g("Decisions") + 0.15*g("Finishing") + 0.10*g("Composure"),
        "Ball Control": 0.45*g("First Touch") + 0.30*g("Technique") + 0.25*g("Dribbling"),
        "Dribbling": 0.55*g("Dribbling") + 0.20*g("Agility") + 0.15*g("Balance") + 0.10*g("Flair"),
        "Low Pass": 0.50*g("Passing") + 0.25*g("Vision") + 0.15*g("Decisions") + 0.10*g("Teamwork"),
        "Lofted Pass": 0.40*g("Passing") + 0.30*g("Crossing") + 0.15*g("Technique") + 0.10*g("Vision") + 0.05*g("Corners"),
        "Finishing": 0.55*g("Finishing") + 0.20*g("Composure") + 0.15*g("Off the Ball") + 0.10*g("Technique"),
        "Place Kicking": 0.45*g("Free Kick Taking") + 0.35*g("Penalty Taking") + 0.20*g("Technique"),
        "Swerve": 0.35*g("Free Kick Taking") + 0.25*g("Corners") + 0.25*g("Technique") + 0.15*g("Flair"),
        "Header": 0.55*g("Heading") + 0.25*g("Jumping Reach") + 0.10*g("Bravery") + 0.10*g("Strength"),
        "Defence Prowess": 0.30*g("Positioning") + 0.25*g("Marking") + 0.20*g("Anticipation") + 0.15*g("Concentration") + 0.10*g("Decisions"),
        "Ball Winning": 0.40*g("Tackling") + 0.25*g("Marking") + 0.15*g("Aggression") + 0.10*g("Work Rate") + 0.10*g("Bravery"),
        "Kicking Power": 0.45*g("Long Shots") + 0.25*g("Strength") + 0.20*g("Technique") + 0.10*g("Determination"),
        "Speed": g("Pace"),
        "Explosive Power": 0.80*g("Acceleration") + 0.20*g("Agility"),
        "Body Control": 0.35*g("Balance") + 0.25*g("Agility") + 0.20*g("Strength") + 0.10*g("Natural Fitness") + 0.10*g("Composure"),
        "Physical Contact": 0.55*g("Strength") + 0.20*g("Bravery") + 0.15*g("Aggression") + 0.10*g("Balance"),
        "Jump": 0.60*g("Jumping Reach") + 0.20*g("Strength") + 0.20*g("Balance"),
        "Stamina": 0.65*g("Stamina") + 0.20*g("Natural Fitness") + 0.15*g("Work Rate"),
    }

# ============== Conversión ESPECÍFICA PARA ARQUEROS (no 40s planos) ==============
def combos_gk(attrs: Dict[str, int]) -> Dict[str, float]:
    g = lambda k: attrs.get(k, 0)
    out = {
        # GK abilities (PES)
        "Goalkeeping": 0.30*g("Handling") + 0.25*g("Reflexes") + 0.20*g("One on Ones") + 0.15*g("Positioning") + 0.10*g("Concentration"),
        "Catching":    0.55*g("Handling") + 0.25*g("Aerial Reach") + 0.10*g("Communication") + 0.10*g("Command of Area"),
        "Clearing":    0.35*g("Punching (Tendency)") + 0.30*g("Command of Area") + 0.25*g("Rushing Out (Tendency)") + 0.10*g("Communication"),
        "Reflexes":    0.65*g("Reflexes") + 0.20*g("One on Ones") + 0.15*g("Agility"),
        "Coverage":    0.35*g("Positioning") + 0.20*g("Anticipation") + 0.20*g("Decisions") + 0.15*g("Communication") + 0.10*g("Concentration"),
        # Físicas
        "Kicking Power": 0.60*g("Kicking") + 0.25*g("Strength") + 0.15*g("Technique"),
        "Speed":           g("Pace"),
        "Explosive Power": 0.85*g("Acceleration") + 0.15*g("Agility"),
        "Body Control":    0.40*g("Balance") + 0.30*g("Agility") + 0.20*g("Strength") + 0.10*g("Composure"),
        "Physical Contact":0.55*g("Strength") + 0.25*g("Bravery") + 0.20*g("Aggression"),
        "Jump":            0.65*g("Jumping Reach") + 0.20*g("Balance") + 0.15*g("Strength"),
        "Stamina":         0.65*g("Stamina") + 0.25*g("Natural Fitness") + 0.10*g("Work Rate"),
    }
    # Derivaciones de habilidades de campo desde atributos de GK (evitar relleno 40 plano)
    # Estas fórmulas dan valores razonables para GK sin requerir Long Shots, etc.
    out["Attacking Prowess"] = 0.30*g("Off the Ball") + 0.25*g("Anticipation") + 0.25*g("Decisions") + 0.20*g("Composure")
    out["Ball Control"]      = 0.45*g("First Touch") + 0.30*g("Technique") + 0.25*g("Agility")
    out["Dribbling"]         = 0.40*g("Agility") + 0.30*g("First Touch") + 0.20*g("Technique") + 0.10*g("Balance")
    out["Low Pass"]          = 0.55*g("Passing") + 0.25*g("Vision") + 0.20*g("Decisions")
    out["Lofted Pass"]       = 0.45*g("Kicking") + 0.35*g("Passing") + 0.20*g("Technique")
    out["Finishing"]         = 0.40*g("Composure") + 0.30*g("Decisions") + 0.30*g("Anticipation")
    out["Place Kicking"]     = 0.45*g("Kicking") + 0.35*g("Technique") + 0.20*g("Passing")
    out["Swerve"]            = 0.45*g("Technique") + 0.30*g("Passing") + 0.25*g("Kicking")
    out["Header"]            = 0.60*g("Jumping Reach") + 0.20*g("Bravery") + 0.20*g("Strength")
    out["Defence Prowess"]   = 0.45*g("Positioning") + 0.25*g("Anticipation") + 0.20*g("Concentration") + 0.10*g("Decisions")
    out["Ball Winning"]      = 0.35*g("Aggression") + 0.30*g("Bravery") + 0.20*g("Decisions") + 0.15*g("Work Rate")
    return out

# ============== Skills y COM ==============
def infer_skills_and_com(attrs: Dict[str, int], is_gk: bool, combos: Dict[str, float], regpos: str = "") -> Tuple[List[str], List[str]]:
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
        # Historical base logic (restored)
        long_punt_score = 0.55*attrs.get("Kicking", 0) + 0.25*attrs.get("Decisions", 0) + 0.20*attrs.get("Vision", 0)
        long_throw_score = 0.55*attrs.get("Throwing", 0) + 0.25*attrs.get("Strength", 0) + 0.20*attrs.get("Technique", 0)
        if attrs.get("Kicking", 0) >= 68 and attrs.get("Decisions", 0) >= 58:
            skills.append("Low Punt Trajectory")
        if attrs.get("Throwing", 0) >= 68:
            skills.append("GK Long Throw")
        # Guarantee at least 1 skill for any GK
        if not skills:
            skills.append("Low Punt Trajectory" if long_punt_score >= long_throw_score else "GK Long Throw")
        return order_skills(skills), []

    # Outfield player: base rules
    drib = attrs.get("Dribbling", 0); agi = attrs.get("Agility", 0); flair = attrs.get("Flair", 0)
    ft = attrs.get("First Touch", 0); pas = attrs.get("Passing", 0); vis = attrs.get("Vision", 0)
    tech = attrs.get("Technique", 0); cross = attrs.get("Crossing", 0)
    lshot = attrs.get("Long Shots", 0); kpow = combos.get("Kicking Power", 0)

    # Historical base logic (restored)
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

    # Balanced skill distribution (without losing base rules)
    # Global profile to scale skill/COM quantity without relying only on elite level:
    # technique/creation (0.10-0.12) weighs more for completeness; mobility/awareness
    # (0.07-0.08) and role extras (0.04-0.06) adjust without over-rewarding specialists.
    # Expected profile is roughly in the FM attribute band (~40-99), then tiered by
    # SKILL_TIERS/COM_TIERS cutoffs to produce low/mid/top assignment density.
    overall_profile = (
        PROFILE_WEIGHT_DRIB*drib + PROFILE_WEIGHT_AGI*agi + PROFILE_WEIGHT_FT*ft +
        PROFILE_WEIGHT_PAS*pas + PROFILE_WEIGHT_VIS*vis + PROFILE_WEIGHT_TECH*tech +
        PROFILE_WEIGHT_ACC*attrs.get("Acceleration", 0) + PROFILE_WEIGHT_OTB*attrs.get("Off the Ball", 0) +
        PROFILE_WEIGHT_DEC*attrs.get("Decisions", 0) + PROFILE_WEIGHT_FLAIR*flair +
        PROFILE_WEIGHT_CROSS*cross + PROFILE_WEIGHT_LSHOT*lshot
    )
    target_skills, max_skills, soft_threshold = SKILL_TOP_TIER
    for max_profile, t_sk, m_sk, thr in SKILL_TIERS:
        if overall_profile < max_profile:
            target_skills, max_skills, soft_threshold = t_sk, m_sk, thr
            break

    skill_scores = {
        "Scissors Feint": (0.45*drib + 0.30*agi + 0.25*flair),
        "Flip Flap": (0.40*drib + 0.35*flair + 0.25*tech),
        "Marseille Turn": (0.40*ft + 0.30*agi + 0.30*tech),
        "Sombrero": (0.45*flair + 0.30*tech + 0.25*drib),
        "Scotch Move": (0.40*agi + 0.35*tech + 0.25*drib),
        "Heel Trick": (0.45*flair + 0.35*tech + 0.20*ft),
        "One-touch Pass": (0.45*ft + 0.35*pas + 0.20*tech),
        "Weighted Pass": (0.40*vis + 0.35*pas + 0.25*tech),
        "Pinpoint Crossing": (0.45*cross + 0.30*vis + 0.25*tech),
        "Outside Curler": (0.55*tech + 0.45*swerve_combo),
        "Long Range Drive": (0.55*lshot + 0.45*kpow),
        "Heading": (0.55*attrs.get("Heading", 0) + 0.45*attrs.get("Jumping Reach", 0)),
        "Rabona": (0.50*flair + 0.30*tech + 0.20*drib),
    }
    for sk, score in sorted(skill_scores.items(), key=lambda x: x[1], reverse=True):
        if len(skills) >= target_skills:
            break
        if sk not in skills and score >= soft_threshold:
            skills.append(sk)
    if not skills:
        best_skill = max(skill_scores.items(), key=lambda x: x[1])[0]
        skills.append(best_skill)
    if len(skills) > max_skills:
        skills = sorted(skills, key=lambda x: skill_scores.get(x, 0), reverse=True)[:max_skills]

    # COM styles (restored base + profile/position balancing)
    acc = attrs.get("Acceleration", 0)
    otb = attrs.get("Off the Ball", 0)
    dec = attrs.get("Decisions", 0)
    wr = attrs.get("Work Rate", 0)
    pace_metric = max(attrs.get("Pace", 0), attrs.get("Acceleration", 0))
    if flair >= 85 and drib >= 80: coms.append("Trickster")
    if drib >= 85 and acc >= 80 and agi >= 80: coms.append("Mazing Run")
    if acc >= 86 and pace_metric >= 84 and drib >= 78: coms.append("Speeding Bullet")
    if otb >= 80 and dec >= 75 and acc >= 75: coms.append("Incisive Run")
    if vis >= 85 and pas >= 80 and cross >= 80: coms.append("Long Ball Expert")
    if cross >= 85 and vis >= 80: coms.append("Early Cross")
    if attrs.get("Long Shots", 0) >= 85 and kpow >= 70: coms.append("Long Ranger")

    com_scores = {
        "Trickster": (0.45*flair + 0.35*drib + 0.20*agi),
        "Mazing Run": (0.40*drib + 0.35*acc + 0.25*agi),
        "Speeding Bullet": (0.45*acc + 0.35*pace_metric + 0.20*drib),
        "Incisive Run": (0.40*otb + 0.30*dec + 0.30*acc),
        "Long Ball Expert": (0.40*vis + 0.35*pas + 0.25*cross),
        "Early Cross": (0.55*cross + 0.25*vis + 0.20*wr),
        "Long Ranger": (0.55*attrs.get("Long Shots", 0) + 0.45*kpow),
    }
    is_midfielder_or_winger = regpos in MIDFIELDER_OR_WINGER_POS
    target_com, max_com, com_threshold = COM_TOP_TIER
    for max_profile, t_com, m_com, thr in COM_TIERS:
        if overall_profile < max_profile:
            target_com, max_com, com_threshold = t_com, m_com, thr
            break
    if is_midfielder_or_winger and overall_profile >= MIDFIELDER_COM_PROFILE_MIN:
        target_com = max(target_com, 1)
        com_threshold -= MIDFIELDER_OR_WINGER_COM_THRESHOLD_BOOST
    if regpos in WIDE_OR_ATTACKING_MID_POS and overall_profile >= WIDE_PLAYMAKER_BOOST_PROFILE_MIN:
        target_com = max(target_com, 2)

    for cm, score in sorted(com_scores.items(), key=lambda x: x[1], reverse=True):
        if len(coms) >= target_com:
            break
        if cm not in coms and score >= com_threshold:
            coms.append(cm)
    if len(coms) > max_com:
        coms = sorted(coms, key=lambda x: com_scores.get(x, 0), reverse=True)[:max_com]

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
    skills, coms = infer_skills_and_com(attrs, is_gk, combos, registered)
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
    shirt_name = normalize_shirt_name_ascii(shirt_override) if shirt_override.strip() else make_shirt_name(name)
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
    if data.get("registered_pos", "") == "CB" and player_style == "Anchor Man":
        player_style = "-"

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
