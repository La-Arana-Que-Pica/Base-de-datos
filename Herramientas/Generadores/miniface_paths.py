"""Nombres de archivo de las minifaces, igual que los reconoce PES 2018.

El juego busca la miniface de un jugador como ``player_<ID>.dds``; en la web se usa ``player_<ID>.webp``.
Los jugadores de datapacks o creados tienen un ID «inflado» (con 0x40000000 sumado, por ejemplo
1073857291); el juego usa el ID real (1073857291 - 0x40000000 = 115467), y la web también.

Mientras las carpetas de imágenes tengan archivos con el nombre anterior (``<ID>.webp``), se reconocen
como respaldo. Cuando ya no queden, se puede poner ``LEGACY_FALLBACK = False``.
Debe coincidir con js/minifaces.js y draft/js/data/minifacePaths.js.
"""

from __future__ import annotations

from pathlib import Path

INFLATED_ID_OFFSET = 0x40000000
LEGACY_FALLBACK = True
FOLDERS = ("players", "pes_original_minifaces")


def game_id(player_id) -> str:
    """ID que usa el juego para la miniface (sin el 0x40000000 de los IDs inflados)."""
    value = str(player_id or "").strip()
    if not value.isdigit():
        return value
    number = int(value)
    if INFLATED_ID_OFFSET <= number < INFLATED_ID_OFFSET * 2:
        number -= INFLATED_ID_OFFSET
    return str(number)


def miniface_name(player_id) -> str:
    return f"player_{game_id(player_id)}.webp"


class MinifaceIndex:
    """Índice de las minifaces disponibles, escaneado una sola vez por carpeta."""

    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        self._names: dict[str, set[str]] = {}

    def names(self, folder: str) -> set[str]:
        if folder not in self._names:
            directory = self.project_root / "img" / folder
            self._names[folder] = {p.name for p in directory.glob("*.webp")} if directory.is_dir() else set()
        return self._names[folder]

    def file_name(self, folder: str, player_id) -> str:
        """Nombre del archivo existente para el jugador ('' si no hay)."""
        value = str(player_id or "").strip()
        if not value:
            return ""
        names = self.names(folder)
        current = miniface_name(value)
        if current in names:
            return current
        if LEGACY_FALLBACK and f"{value}.webp" in names:
            return f"{value}.webp"
        return ""

    def exists(self, folder: str, player_id) -> bool:
        return bool(self.file_name(folder, player_id))

    def src(self, folder: str, player_id, default: str | None = "default") -> str:
        """Ruta relativa ``img/<carpeta>/<archivo>``; si no existe, la imagen por defecto o ''."""
        name = self.file_name(folder, player_id)
        if name:
            return f"img/{folder}/{name}"
        if default is None:
            return ""
        return f"img/players/{default}.webp"
