"""OVR exacto reconstruido del algoritmo original de PES 2018.

No modificar pesos ni redondeos sin validación contra el ejecutable original.
Es el equivalente Python de ``js/pes2018-overall.js`` para la generación
estática. TightPossession se omite deliberadamente: no forma parte de las 20
filas que usa este algoritmo de PES 2018.
"""

from __future__ import annotations

from typing import Mapping


POSITIONS = ("GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF")
POS_INDEX = {position: index for index, position in enumerate(POSITIONS)}
LAQP_CSV_POSITIONS = POSITIONS
PES2018_POSITION_IDS = ("CF", "SS", "RWF", "LWF", "AMF", "DMF", "CMF", "RMF", "LMF", "CB", "RB", "LB", "GK")

WEIGHTS = (
    (0,0,6,6,7,5,7,7,14,17,17,15,31),
    (0,0,10,10,18,24,15,15,24,19,19,19,24),
    (0,0,14,14,15,24,25,25,24,22,22,19,14),
    (0,0,0,0,18,24,7,7,22,5,5,9,0),
    (0,0,14,14,19,21,12,12,14,9,9,9,0),
    (0,0,0,0,0,0,0,0,17,11,11,14,36),
    (0,0,0,0,0,0,0,0,0,0,0,0,0),
    (0,0,0,0,12,0,4,4,0,0,0,0,0),
    (0,23,0,0,0,0,0,0,0,0,0,0,3),
    (0,26,14,14,8,3,0,0,0,0,0,0,0),
    (0,26,13,13,4,0,0,0,0,0,0,0,0,0),
    (0,0,0,0,0,0,0,0,0,5,5,6,3),
    (0,10,16,16,3,4,24,24,5,15,15,9,5),
    (0,0,14,14,3,6,22,22,7,15,15,22,5),
    (11,20,12,12,13,5,0,0,5,6,6,7,9),
    (11,20,12,12,5,0,0,0,0,0,0,0,3),
    (49,0,0,0,0,0,0,0,0,0,0,0,0),
    (49,0,0,0,0,0,0,0,0,0,0,0,0),
    (0,9,14,14,14,17,13,13,3,6,6,4,0),
    (0,24,58,58,24,24,56,56,38,47,47,38,38),
)

NATURAL_BONUS = (8,8,9,9,9,8,8,8,8,10,10,9,8)
FULL_BONUS = (5,5,4,4,4,5,5,5,5,4,4,5,5)
PARTIAL_BONUS = (3,3,2,2,2,3,3,3,3,2,2,3,3)
GLOBAL_LOOKUP = (
    31,32,33,34,35,36,37,38,39,40,
    41,42,43,44,45,46,47,48,49,50,
    51,52,56,59,62,65,67,70,73,75,
    77,79,82,83,85,87,89,90,92,93,
    94,95,96,97,98,99,100,101,102,103,
    104,105,106,107,108,109,110,111,112,113,
)

LAQP_STAT_ALIASES = {
    "attacking_prowess": ("OffensiveAwareness", "Attacking Prowess", "attacking_prowess"),
    "ball_control": ("BallControl", "Ball Control", "ball_control"),
    "dribbling": ("Dribbling", "dribbling"),
    "low_pass": ("LowPass", "Low Pass", "low_pass"),
    "lofted_pass": ("LoftedPass", "Lofted Pass", "lofted_pass"),
    "finishing": ("Finishing", "finishing"),
    "set_piece_taking": ("PlaceKicking", "Place Kicking", "set_piece_taking", "place_kicking"),
    "curve": ("Curl", "Controlled Spin", "curve", "swerve"),
    "header": ("Heading", "Header", "header"),
    "defensive_prowess": ("DefensiveAwareness", "Defensive Prowess", "defensive_prowess"),
    "ball_winning": ("BallWinning", "Ball Winning", "ball_winning"),
    "kicking_power": ("KickingPower", "Kicking Power", "kicking_power"),
    "speed": ("Speed", "speed"),
    "explosive_power": ("Acceleration", "Explosive Power", "explosive_power"),
    "body_control": ("Balance", "Body Control", "body_control"),
    "physical_contact": ("PhysicalContact", "Physical Contact", "physical_contact"),
    "jump": ("Jump", "jump"),
    "goalkeeping": ("GKAwareness", "Goalkeeping", "goalkeeping"),
    "catching": ("GKCatching", "Catching", "catching"),
    "clearing": ("GKClearing", "Clearing", "clearing"),
    "reflexes": ("GKReflexes", "Reflexes", "reflexes"),
    "coverage": ("GKReach", "Coverage", "coverage"),
    "stamina": ("Stamina", "stamina"),
    "non_dom_leg_precision": ("WeakFootAcc", "Weak Foot Acc.", "non_dom_leg_precision"),
}


def _row_number(row: Mapping[str, object], aliases: tuple[str, ...], fallback: int | None = None) -> int:
    for alias in aliases:
        raw = row.get(alias)
        if raw is not None and str(raw).strip() != "":
            try:
                return int(float(str(raw).strip()))
            except ValueError:
                pass
    if fallback is not None:
        return fallback
    raise KeyError(f"Missing PES stat: {aliases[0]}")


def stats_from_laqp_row(row: Mapping[str, object]) -> dict[str, int]:
    return {
        key: _row_number(row, aliases, 3 if key == "non_dom_leg_precision" else None)
        for key, aliases in LAQP_STAT_ALIASES.items()
    }


def _normalize(value: int) -> int:
    return value - 25 if value >= 25 else 1


def _position(position: object) -> str:
    code = str(position or "").strip().upper()
    if code not in POS_INDEX:
        raise ValueError(f"Unknown PES position: {position}")
    return code


def position_from_laqp(value: object) -> str:
    raw = str(value if value is not None else "").strip()
    if raw.isdigit() and int(raw) < len(LAQP_CSV_POSITIONS):
        return LAQP_CSV_POSITIONS[int(raw)]
    return _position(raw)


def position_from_pes2018_id(value: object) -> str:
    try:
        return PES2018_POSITION_IDS[int(value)]
    except (ValueError, IndexError) as error:
        raise ValueError(f"Unknown PES 2018 position id: {value}") from error


def _calculation_rows(stats: Mapping[str, int]) -> list[int]:
    return [
        int(stats["attacking_prowess"]), int(stats["ball_control"]), int(stats["dribbling"]),
        int(stats["low_pass"]), int(stats["lofted_pass"]), int(stats["finishing"]),
        int(stats["set_piece_taking"]), int(stats["curve"]), int(stats["header"]),
        int(stats["defensive_prowess"]), int(stats["ball_winning"]), int(stats["kicking_power"]),
        int(stats["speed"]), int(stats["explosive_power"]),
        (int(stats["body_control"]) + int(stats["physical_contact"])) // 2,
        int(stats["jump"]),
        (int(stats["goalkeeping"]) + int(stats["coverage"])) // 2,
        (int(stats["clearing"]) + int(stats["reflexes"]) + int(stats["catching"])) // 3,
        int(stats["stamina"]), int(stats.get("non_dom_leg_precision", 3)),
    ]


def pes2018_overall(
    stats: Mapping[str, int],
    target_position: str,
    natural_position: str | None = None,
    familiarity: int = 0,
) -> int:
    target = _position(target_position)
    natural = _position(natural_position or target)
    position_index = POS_INDEX[target]
    raw = _calculation_rows(stats)
    normalized = [_normalize(value) for value in raw]
    positional = (sum(WEIGHTS[index][position_index] * normalized[index] for index in range(20)) + 50) // 100

    if target == natural:
        positional += NATURAL_BONUS[position_index]
    elif int(familiarity) >= 2:
        positional += FULL_BONUS[position_index]
    elif int(familiarity) == 1:
        positional += PARTIAL_BONUS[position_index]

    overall = positional
    if target == natural and target != "GK":
        average_x100 = sum(raw[:19]) * 100 // 19
        average = (average_x100 + 50) // 100
        global_score = GLOBAL_LOOKUP[max(40, min(99, average)) - 40]
        overall = (60 * positional + 40 * global_score + 50) // 100
    return max(40, min(109, overall))


def familiarity_from_laqp_row(row: Mapping[str, object], target_position: str) -> int:
    target = _position(target_position)
    try:
        return max(0, min(2, int(row.get(target, 0) or 0)))
    except (TypeError, ValueError):
        return 0


def overall_from_laqp_row(row: Mapping[str, object], target_position: str | None = None) -> int:
    natural = position_from_laqp(row.get("POS", row.get("Position", row.get("position", ""))))
    target = _position(target_position) if target_position else natural
    familiarity = 0 if target == natural else familiarity_from_laqp_row(row, target)
    return pes2018_overall(stats_from_laqp_row(row), target, natural, familiarity)


def assign_overall(row: dict[str, object]) -> int:
    overall = overall_from_laqp_row(row)
    row["OverallStats"] = str(overall)
    if "Overall" in row:
        row["Overall"] = str(overall)
    return overall
