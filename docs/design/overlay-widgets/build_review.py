from pathlib import Path
import json,html
P=Path(__file__).resolve().parent
fixtures=json.loads((P/'manifest.json').read_text())
copy={'raid-1080':'Hra · Raid / Play · Raid','lobby-1080':'Hra · Lobby / Play · Lobby','edit':'Úpravy + katalog / Edit + catalog','drag':'Tažení + vodítka / Drag + guides','settings':'Nastavení widgetu / Widget settings','presets':'Rozložení / Layouts','hidden':'Skryto + volitelný vstup / Hidden + optional entry','hidden-clean':'Vše skryto / All hidden','catalog':'Všech 10 widgetů × dvě hustoty / All 10 widgets × two densities','opacity-default':'Výchozí krytí 85 % / Default opacity 85%','opacity-30':'Krytí 30 % / Opacity 30%','application':'Výslovně otevřená aplikace / Explicitly opened app','search':'Hledání v Úpravách / Search in Edit','edit-en':'English labels'}
css='*{box-sizing:border-box}body{font:14px/1.5 system-ui;color:var(--foreground,#eee);margin:0}h1{font-size:24px;margin:0}p{color:var(--muted-foreground,#aaa)}a{color:var(--primary,#f4ad82)}.intro{padding:16px;background:var(--card,#1d2225);border-radius:var(--radius,6px);margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0;min-width:0;padding:12px;background:var(--card,#1d2225);border-radius:var(--radius,6px)}img{display:block;width:100%;height:auto}figcaption{margin-top:8px}small{color:var(--muted-foreground,#aaa)}.wide{grid-column:1/-1}@media(max-width:600px){.grid{grid-template-columns:1fr}}'
head='<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARC OPS · Widgets review</title><style>'+css+'</style><body>'
intro='<div class="intro"><h1>ARC OPS / Samostatné widgety</h1><p>Hra zůstává viditelná. Jen to, co si připneš. / Keep the game visible. Only what you pin.</p><p>85% podklad · 90% minimum pod textem · 20% ztmavení pouze v Úpravách.<br>85% fill · 90% text-surface floor · 20% dimming only in Edit.</p><a href="README.md">Design + behaviour + CZ/EN copy</a> · <a href="validation.json">Contrast: minimum 4.914 : 1</a> · <a href="labels.md">CZ / EN labels</a></div>'
figs=[]
for f in fixtures:
    n=f['name'];caption=copy.get(n,n.replace('-',' · '))
    figs.append('<figure'+(' class="wide"' if n=='catalog' else '')+'><a href="'+n+'.html"><img loading="lazy" src="'+n+'.png" alt="'+html.escape(caption)+'"></a><figcaption><a href="'+n+'.html">'+html.escape(caption)+'</a><br><small>'+str(f['width'])+' × '+str(f['height'])+' · DPR 1 · <a href="'+n+'.png">PNG</a></small></figcaption></figure>')
for n in ['settings@2x','widget@2x']:
    figs.append('<figure><a href="'+n+'.png"><img loading="lazy" src="'+n+'.png" alt="'+n+'"></a><figcaption>'+n+' · DPR 2</figcaption></figure>')
(P/'review.html').write_text(head+intro+'<div class="grid">'+''.join(figs)+'</div></body></html>',encoding='utf-8')
main=['raid-1080','lobby-1080','edit','settings']
thumbs=''.join('<figure><img src="'+str(P/(n+'.png'))+'" alt="'+copy[n]+'"><figcaption>'+copy[n]+'</figcaption></figure>' for n in main)
(P/'presentation.html').write_text(head+'<div class="grid">'+thumbs+'</div></body></html>',encoding='utf-8')
print('Review and inline presentation generated, UTF-8.')
