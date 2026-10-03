"""Transformaciones 2D configurables desde un UV de PES a una camiseta plana."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
from typing import Iterable

from PIL import Image, ImageDraw


Point = tuple[float, float]


@dataclass(frozen=True)
class UvCalibration:
    reference_size: int
    canvas: int
    uv: dict[str, list[Point]]
    geometry: dict

    @classmethod
    def load(cls, path: Path) -> "UvCalibration":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            reference_size=data["reference_size"],
            canvas=data["canvas"],
            uv={key: [tuple(point) for point in value] for key, value in data["uv"].items()},
            geometry=data["geometry"],
        )

    def source_box(self, name: str, image_size: tuple[int, int]) -> tuple[int, int, int, int]:
        """Caja de una región UV normalizada; admite distintas resoluciones cuadradas."""
        points = self.uv[name]
        width, height = image_size
        xs = [round(x * width) for x, _ in points]
        ys = [round(y * height) for _, y in points]
        return min(xs), min(ys), max(xs), max(ys)


def polygon_mask(size: tuple[int, int], points: Iterable[Point]) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(list(points), fill=255)
    return mask


def paste_region(
    destination: Image.Image,
    texture: Image.Image,
    source_box: tuple[int, int, int, int],
    destination_quad: list[list[int]] | list[Point],
    shape: list[list[int]] | list[Point],
) -> None:
    """Escala una región UV y la recorta con la silueta final de esa pieza.

    La caja UV y el cuadrilátero de destino se mantienen independientes de la
    máscara: así los bordes curvos de hombros y mangas no aparecen como recortes
    rectangulares en el resultado.
    """
    quad = [tuple(point) for point in destination_quad]
    min_x = int(min(x for x, _ in quad))
    max_x = int(max(x for x, _ in quad))
    min_y = int(min(y for _, y in quad))
    max_y = int(max(y for _, y in quad))
    if max_x <= min_x or max_y <= min_y:
        return
    crop = texture.crop(source_box).resize((max_x - min_x, max_y - min_y), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", destination.size, (0, 0, 0, 0))
    layer.alpha_composite(crop, (min_x, min_y))
    destination.alpha_composite(Image.composite(layer, Image.new("RGBA", destination.size), polygon_mask(destination.size, shape)))

