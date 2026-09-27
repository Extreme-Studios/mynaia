"""Generate small MyNaiA PWA icons from simple shapes (Pillow required)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'app' / 'frontend' / 'icons'
root.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    scale = size / 512
    image = Image.new('RGB', (size, size), '#0e1726')
    draw = ImageDraw.Draw(image)
    def box(points):
        return tuple(round(v * scale) for v in points)
    draw.rounded_rectangle(box((42, 42, 470, 470)), radius=round(118 * scale), fill='#d7e5d6')
    draw.polygon([box((131, 348))[:2], box((131, 163))[:2], box((189, 163))[:2],
                  box((256, 261))[:2], box((323, 163))[:2], box((381, 163))[:2],
                  box((381, 348))[:2], box((328, 348))[:2], box((328, 251))[:2],
                  box((270, 330))[:2], box((242, 330))[:2], box((184, 251))[:2],
                  box((184, 348))[:2]], fill='#172734')
    image.save(root / f'icon-{size}.png', optimize=True)
