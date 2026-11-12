from pathlib import Path
import base64

root = Path(__file__).resolve().parent
figures = []
for name, caption in [('compact-cs.png', '420 × 720 · standardní'), ('compact-short.png', '420 × 520 · nízká')]:
    data = base64.b64encode((root / name).read_bytes()).decode()
    figures.append(f'<figure><figcaption>{caption}</figcaption><img alt="{caption}" src="data:image/png;base64,{data}"></figure>')
(root / 'review.html').write_text('''<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kompaktní režim ARC OPS</title><style>
body{margin:0;font-family:system-ui,sans-serif;color:var(--foreground,#F2EEE7)}.views{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}figure{margin:0;min-width:0}figcaption{font-size:12px;margin:0 0 10px;color:var(--muted-foreground,#A2A8AA)}img{width:100%;max-width:420px;display:block;border-radius:8px}@media(max-width:460px){.views{grid-template-columns:1fr}}</style><div class="views">''' + ''.join(figures) + '</div></html>', encoding='utf-8')
