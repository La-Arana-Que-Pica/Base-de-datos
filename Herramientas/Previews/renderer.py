"""Prepara texturas intermedias para el modelo 3D fijo de camiseta."""
from pathlib import Path
from PIL import Image, ImageDraw
from uv_mapping import UvCalibration

ATLAS_SIZE = 1024
ATLAS = {"front": (300, 148, 724, 792), "sleeve_viewer_left": (70, 180, 270, 455), "sleeve_viewer_right": (754, 180, 954, 455), "collar": (337, 828, 687, 885)}

class ShirtRenderer:
    """Compone un atlas plano; Blender aporta geometría, tela y luces."""
    def __init__(self, calibration_path: Path): self.calibration = UvCalibration.load(calibration_path)

    def compose_texture(self, input_path: Path, output_path: Path) -> None:
        source = Image.open(input_path).convert("RGBA")
        atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
        for name, destination in ATLAS.items():
            crop = source.crop(self.calibration.source_box(name, source.size))
            width, height = destination[2] - destination[0], destination[3] - destination[1]
            atlas.alpha_composite(crop.resize((width, height), Image.Resampling.LANCZOS), destination[:2])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(output_path, "PNG")

    def debug_uv(self, input_path: Path) -> Image.Image:
        texture = Image.open(input_path).convert("RGBA")
        draw = ImageDraw.Draw(texture)
        colors = {"front": "#00ff7f", "sleeve_viewer_left": "#00bfff", "sleeve_viewer_right": "#ffb000", "collar": "#ff3cac"}
        for name, color in colors.items():
            box = self.calibration.source_box(name, texture.size)
            draw.rectangle(box, outline=color, width=max(2, texture.width // 256))
            draw.text((box[0] + 8, box[1] + 8), name, fill=color, stroke_width=1, stroke_fill="black")
        return texture
