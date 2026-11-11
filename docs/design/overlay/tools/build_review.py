"""Small portable review gallery plus embedded transport for the chat renderer."""
from pathlib import Path
import base64
ROOT=Path(__file__).resolve().parents[1]
views=[('overview','Přehled'),('quests','Úkoly'),('shopping','Nákupy'),('capture','Ze snímku'),('states','List stavů')]
html='''<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;font:14px/1.5 var(--font-sans,system-ui);color:var(--foreground,#F2EEE7)}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}button{font:inherit;padding:7px 12px;border:1px solid var(--border,#65716F);border-radius:4px;background:var(--secondary,#272D31);color:inherit;cursor:pointer}button[aria-pressed=true]{color:#241810;background:#F4AD82}button:focus-visible{outline:2px solid #F4AD82;outline-offset:3px}figure{margin:0}img{display:block;width:100%;height:auto}figure[hidden]{display:none}p{font-size:12px;color:var(--muted-foreground,#A2A8AA);margin:8px 0 0}
</style><nav aria-label="Grafické návrhy">'''
for i,(key,label) in enumerate(views):
    html+=f'<button type="button" aria-pressed="{str(i==0).lower()}" data-view="{key}">{label}</button>'
html+='</nav>'
for i,(key,label) in enumerate(views):
    html+=f'<figure id="{key}"{ " hidden" if i else ""}><img src="{key}.png" alt="{label} — grafický návrh overlaye"></figure>'
html+='''<p>PNG záložek: 1920 × 1080 · panel 1100 × 760 · původní syntetické pozadí · list stavů obsahuje krytí, fokus, hover, prázdný a chybový stav.</p><script>
for(const b of document.querySelectorAll('button'))b.onclick=()=>{for(const f of document.querySelectorAll('figure'))f.hidden=f.id!==b.dataset.view;for(const x of document.querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));};
</script></html>'''
(ROOT/'review.html').write_text(html,encoding='utf-8')
for key,_ in views:
    uri='data:image/png;base64,'+base64.b64encode((ROOT/f'{key}.png').read_bytes()).decode()
    html=html.replace(f'src="{key}.png"',f'src="{uri}"')
(ROOT/'tools/review-inline.html').write_text(html,encoding='utf-8')
print('review.html + tools/review-inline.html')
