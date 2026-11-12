"""Build a portable offline mockup using only fonts already in this repo."""
from pathlib import Path
import base64

root = Path(__file__).resolve().parent
fonts = root.parent / 'overlay/assets/fonts'
html = (root / 'compact.template.html').read_text(encoding='utf-8')
for key, name in [('HEAD', 'ChakraPetch-SemiBold.ttf'), ('UI', 'Inter.ttf'), ('MONO', 'JetBrainsMono.ttf')]:
    html = html.replace('FONT_' + key, base64.b64encode((fonts / name).read_bytes()).decode())
(root / 'compact.html').write_text(html, encoding='utf-8')
for name in ['chakrapetch-OFL.txt', 'inter-OFL.txt', 'jetbrainsmono-OFL.txt']:
    (root / name).write_bytes((fonts / name).read_bytes())
