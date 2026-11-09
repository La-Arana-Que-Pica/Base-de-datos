"""Variantes WebP de guías. Conserva los originales; requiere Pillow."""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
guides = json.loads((ROOT / 'database/guias.json').read_text(encoding='utf-8-sig'))
sources = {g['image'] for g in guides}
sources.update(s['figure']['image'] for g in guides for s in g['sections'] if s.get('figure', {}).get('image'))
output = ROOT / 'assets/images/guias/optimized'
output.mkdir(parents=True, exist_ok=True)
manifest = {}
for source in sorted(sources):
    with Image.open(ROOT / source) as image:
        original_size = list(image.size)
        image.thumbnail((960, 960), Image.Resampling.LANCZOS)
        destination = output / (Path(source).stem + '.webp')
        image.save(destination, 'WEBP', quality=88, method=6)
        manifest[source] = {'original': original_size, 'width': image.width, 'height': image.height, 'src': '/' + destination.relative_to(ROOT).as_posix()}
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(manifest)} variantes; originales conservados.')
