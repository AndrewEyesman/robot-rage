# The home-screen icon for phones (the web app manifest, apple-touch-icon): the login
# screen's "Rearmed" gear logo on a dark square, so Android doesn't put its transparent
# corners on a white disc. Made from the extracted assets, into them: game art, never
# committed. The logo stays inside the middle 70%, the part a "maskable" icon keeps
# under any mask shape.
#
#   python3 port/extract/app-icon.py port/assets
#
# Only Pillow, so it also runs on the server's own Python.

import os
import sys

from PIL import Image

BACKGROUND = (46, 68, 66, 255)  # the login screen's background, where the logo sits in the game
SIZES = (512, 192, 180)
LOGO_SHARE = 0.70


def main(assets: str) -> None:
    logo = Image.open(os.path.join(assets, 'login013_', 'bitmaps', '1-76.png')).convert('RGBA')
    for size in SIZES:
        icon = Image.new('RGBA', (size, size), BACKGROUND)
        scale = size * LOGO_SHARE / max(logo.size)
        w, h = round(logo.width * scale), round(logo.height * scale)
        icon.alpha_composite(logo.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
        icon.convert('RGB').save(os.path.join(assets, f'app-icon-{size}.png'), optimize=True)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'port/assets')
