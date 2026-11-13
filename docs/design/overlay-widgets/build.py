"""Disposable visual fixtures. Writes only beside this script; no product dependencies."""
from pathlib import Path
import json, html, random
P=Path(__file__).resolve().parent
labels={}
lang='cs'
def t(cs,en):
    labels[cs]=en
    return html.escape(en if lang=='en' else cs)
def btn(cs,en,cls='',href=None):
    text=t(cs,en)
    return f'<button class="{cls}"'+(f' data-go="{href}"' if href else '')+f'>{text}</button>'
def row(a,b): return f'<div class="row"><span>{a}</span><span class="count">{b}</span></div>'
names=[('Seznam k nalezení','To find'),('Připnuté úkoly','Pinned quests'),('Nákupy','Shopping'),('Co dál?','What next?'),('Nechat / prodat / recyklovat','Keep / sell / recycle'),('Obsazenost skrýše','Stash capacity'),('Týdenní výzvy','Weekly challenges'),('Ops','Ops'),('Ke kontrole','To review'),('Automatické snímání','Automatic capture')]
def chip(area,code,color):
    glyph=(P.parent/'maps'/'assets'/'glyphs'/(area.lower()+'.svg')).read_text(encoding='utf-8')
    return f'<span class="chip" style="--chip:{color}"><span aria-hidden="true" class="glyph">{glyph}</span>{code} · {area}</span>'
def content(i,compact):
    if i==0:
        items=[('Power Cable','0 / 2','Electrical','E','#E6D16F'),('Battery','1 / 2','Technological','T','#BAABF2'),('Wires','2 / 4','Industrial','I','#F2AA88')]
        return ''.join(row(f'<span class="item">{a}</span><br>'+chip(c,d,e),b) for a,b,c,d,e in items)+('' if compact else f'<p class="details">{t("Vlastní plán · výskyt není zaručen.","Your plan · spawns are not guaranteed.")}</p>')
    if i==1:
        return row(t('Najít Power Cable','Find Power Cable'),'0 / 2')+row(t('Navštívit vybrané místo','Visit selected location'),'<span class="tick">✓</span>')+('' if compact else f'<p class="details">{t("Ruční postup · zaškrtnutí v Úpravách.","Manual progress · tick in Edit.")}</p>')
    if i==2:
        return f'<div class="tag">Gear Bench 2</div>'+row('Power Cable','0 / 2')+('' if compact else row('Battery','1 / 2')+f'<p class="details">{t("Chybí 3 kusy pro vybraný upgrade.","3 units needed for selected upgrade.")}</p>')
    if i==3:
        return f'<div class="item">{t("Doplň Power Cable","Collect Power Cable")}</div>'+f'<p class="secondary">{t("2 kusy pro Gear Bench 2.","2 units for Gear Bench 2.")}</p>'+('' if compact else f'<p class="details">{t("Podle tvého plánu. Další krok zvolíš v aplikaci.","Based on your plan. Choose the next step in the app.")}</p>')
    if i==4:
        return f'<input type="search" aria-label="{t("Najít předmět","Find an item")}" placeholder="{t("Najít předmět…","Find an item…")}" value="Power Cable"><p class="tag">{t("NECHAT","KEEP")}</p><p>{t("2 kusy pro Gear Bench 2.","2 units for Gear Bench 2.")}</p>'+('' if compact else f'<p class="details">{t("Důvod: vlastní plán. Bez vybraného cíle se doporučení může změnit.","Reason: your plan. Advice can change without a selected goal.")}</p>')+f'<p class="details">{t("Hledání pouze v Úpravách.","Search only in Edit.")}</p>'
    if i==5:
        return '<div class="count" style="font-size:22px">187 <span class="muted">/ 240</span></div><div class="progress"><i></i></div>'+('' if compact else f'<p class="secondary">{t("53 volných míst","53 free slots")}</p><p class="details">{t("Poslední potvrzený stav · ručně","Last confirmed state · manual")}</p>')
    if i==6:
        return row(t('Odehrát raidy','Complete raids'),'2 / 5')+('' if compact else row(t('Sbírat materiál','Collect materials'),'6 / 10')+f'<p class="details">{t("Vlastní zapsaný postup","Your recorded progress")}</p>')
    if i==7:
        return '<div class="opsline"><img class="ops-sprite" alt="" src="../buddy/bednak2/corner/levels/00.png"><span>'+t('Připraven.','Ready.')+'</span></div>'+('' if compact else f'<p class="details">{t("Úpravy otevři zkratkou nebo vstupem Ops.","Open Edit with the shortcut or Ops entry.")}</p>')
    if i==8:
        return f'<div class="count" style="font-size:22px">3 <span class="secondary" style="font:14px Inter">{t("záznamy","records")}</span></div>'+('' if compact else f'<p class="details">{t("Nejisté údaje čekají na tvoje potvrzení.","Uncertain data awaits your confirmation.")}</p>')
    return f'<div class="secondary">○ {t("Vypnuto","Off")}</div>'+('' if compact else f'<p class="details">{t("Volitelné · pouze mimo raid","Optional · outside raids only")}</p><p class="details">{t("Čeká na ověření u Embarku","Awaiting verification with Embark")}</p>')
def widget(i,x=24,y=24,w=344,compact=True,edit=False,style='',board=False):
    title=t(*names[i]); title=title if i!=4 else t('Rozhodnutí o předmětu','Item decision')
    controls=''
    if edit:
        controls=f'<div class="editbar"><span>⠿ {t("Přesunout","Move")}</span><span>{btn("Nastavit","Settings",href="settings.html")}{btn("Odebrat","Remove")}</span></div>'+''.join(f'<i class="handle {c}"></i>' for c in ['tl','tr','bl','br'])
    return f'<section aria-label="{title}" class="widget {"compact" if compact else "expanded"} {"edit-widget" if edit else ""}" style="left:{x}px;top:{y}px;width:{w}px;{style}">{controls}<div class="surface"><div class="head"><h2>{title}</h2><span class="tag">{("05" if i==0 else "02" if i==1 else "")}</span></div>{content(i,compact)}</div></section>'
def ops(hidden=False):
    return '<div class="ops-entry"><button class="sprite-button" data-go="'+('raid-1080.html' if hidden else 'hidden.html')+'" aria-label="'+t('Ops: zobrazit widgety' if hidden else 'Ops: skrýt widgety','Ops: show widgets' if hidden else 'Ops: hide widgets')+'"><img alt="" src="../buddy/bednak2/corner/levels/00.png"></button><button class="edit-button" data-go="edit.html">'+t('Úpravy','Edit')+'</button></div>'
def toolbar():
    return '<div class="toolbar"><span class="mode">'+t('ÚPRAVY','EDIT')+'</span>'+btn('+ Widget','+ Widget',href='edit.html')+btn('Rozložení ▾','Layouts ▾',href='presets.html')+btn('Zpět','Undo')+btn('Obnovit','Reset')+btn('Aplikace ↗','App ↗',href='application.html')+btn('Hledat · Ctrl+K','Search · Ctrl+K',href='search.html')+btn('Skrýt vše','Hide all',href='hidden.html')+btn('Hotovo · Esc','Done · Esc','primary','raid-1080.html')+'</div>'
def catalog():
    return '<aside class="popover catalog"><h2>'+t('Vyber si widgety','Choose your widgets')+'</h2><p class="secondary">'+t('Jen tvoje data. Přidej, co potřebuješ.','Only your data. Add what you need.')+'</p>'+''.join(row(f'<span>{t(*n)}</span>',btn('Přidat','Add') if i not in [0,1] else btn('Přidáno','Added','quiet')) for i,n in enumerate(names))+'<p class="notice">'+t('Mapy ani živá poloha do overlaye nepatří.','No maps or live position in this overlay.')+'</p></aside>'
def settings():
    return '<aside class="popover settings"><h2>'+t('Seznam k nalezení','To find')+'</h2><p class="secondary">'+t('Nastavení widgetu','Widget settings')+'</p><label for="alpha">'+t('Krytí','Opacity')+' <b style="float:right">85 %</b></label><input id="alpha" type="range" min="30" max="100" value="85"><p class="notice">'+t('30–100 % pro podklad. Textová plocha má nejméně 90 % pro čitelnost.','30–100% for the fill. Text surfaces retain at least 90% for readability.')+'</p><label>'+t('Hustota','Density')+'</label><div class="seg">'+btn('Kompaktní','Compact','primary')+btn('Rozšířená','Expanded')+'</div><label>'+t('Velikost','Size')+'</label><div class="mono">344 × 244 px</div><p class="details">'+t('Minimum 280 × 200 · maximum 480 × 560','Minimum 280 × 200 · maximum 480 × 560')+'</p><label>'+t('Kotva','Anchor')+'</label><div class="mono">'+t('Vlevo nahoře · 24 / 128 px','Top left · 24 / 128 px')+'</div><p><label><input type="checkbox"> '+t('Zamknout widget','Lock widget')+'</label></p><div class="row">'+btn('Odebrat','Remove')+btn('Hotovo','Done','primary','edit.html')+'</div></aside>'
def presets():
    return '<aside class="popover presets"><h2>'+t('Rozložení','Layouts')+'</h2>'+''.join('<button class="preset" data-go="'+url+'"><strong>'+name+'</strong><small>'+desc+'</small></button>' for name,desc,url in [('Raid',t('Seznam + úkoly · minimum v rohu','List + quests · minimal corner layout'),'raid-1080.html'),('Lobby',t('Co dál? + nákupy + úkoly + skrýš','What next? + shopping + quests + stash'),'lobby-1080.html')])+'<div class="row">'+btn('Uložit jako…','Save as…')+btn('Přejmenovat','Rename')+'</div><label><input type="checkbox"> '+t('Automaticky podle stavu hry','Follow game state automatically')+'</label><p class="notice">'+t('Volitelné, vypnuto. Vyžaduje zapnuté snímání; změnu odlož do konce Úprav.','Optional, off. Requires capture; defer switching until Edit ends.')+'</p><p class="details">'+t('Jen tento počítač · mimo zálohy','This PC only · excluded from backups')+'</p></aside>'
fixtures=[]
def write(name,body,w=1920,h=1080,edit=False,cls=''):
    doc=f'<!doctype html><html lang="{lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARC OPS · {name}</title><link rel="stylesheet" href="mockup.css"><body class="{cls}"><div class="scene" aria-hidden="true"></div>'+('<div class="veil" aria-hidden="true"></div>' if edit else '')+f'<main class="canvas">{body}</main><script src="mockup.js"></script></body></html>'
    (P/(name+'.html')).write_text(doc,encoding='utf-8');fixtures.append(dict(name=name,width=w,height=h,lang=lang))
def raid(): return widget(0,compact=True)+widget(1,y=300,compact=True)+ops()
def lobby(): return widget(3,compact=False)+widget(2,y=260,compact=False)+widget(1,w=344,compact=False,style='left:auto;right:24px')+widget(5,y=268,w=280,compact=False,style='left:auto;right:24px')+ops()
for label,w,h in [('1080',1920,1080),('1440',2560,1440),('ultrawide',3440,1440)]:
    write('raid-'+label,raid(),w,h);write('lobby-'+label,lobby(),w,h)
for name in ['edit','drag','settings','presets','application','search']:
    b=toolbar()+widget(0,y=128,edit=True)+widget(1,y=430,edit=True)+ops()
    if name=='edit': b+=catalog()
    if name=='settings': b+=settings()
    if name=='presets': b+=presets()
    if name=='drag': b=toolbar()+'<div class="ghost"></div><div class="guide v"></div><div class="guide h"></div>'+widget(0,y=312,edit=True)+'<div class="snaplabel">'+t('Přichyceno: vlevo 24 px · mřížka 8 px','Snapped: left 24 px · grid 8 px')+'</div><div class="cursor">↖</div>'+ops()
    if name=='application': b+='<section class="app-panel"><span class="close">'+btn('Zpět k widgetům','Back to widgets',href='edit.html')+'</span><p class="tag">ARC RAIDERS COMPANION</p><h1>'+t('Příprava na raid','Raid preparation')+'</h1><div class="app-grid"><nav class="app-nav">'+t('Přehled','Overview')+'<br>'+t('Úkoly','Quests')+'<br>'+t('Nákupy','Shopping')+'</nav><div class="app-content"><h2>'+t('Vlastní plán','Your plan')+'</h2>'+content(0,False)+'<p class="notice">'+t('Schéma stávajícího modulu; plná aplikace pouze na výslovné otevření.','Existing module schematic; full app only opens explicitly.')+'</p></div></div></section>'
    if name=='search': b+='<aside class="popover presets"><h2>'+t('Hledat','Search')+'</h2><input type="search" autofocus aria-label="'+t('Hledat widget nebo modul','Search widgets or modules')+'" value="Power"><p>'+t('Předměty','Items')+'</p>'+btn('Power Cable','Power Cable',href='settings.html')+'<p class="details">'+t('Esc zavře hledání','Esc closes search')+'</p></aside>'
    write(name,b,edit=True)
write('hidden',ops(True))
write('hidden-clean','')
b='<div class="catalog-board"><header class="board-title"><h1>'+t('Katalog widgetů','Widget catalog')+'</h1><p>'+t('Kompaktní a rozšířená podoba · ukázková vlastní data','Compact and expanded forms · illustrative personal data')+'</p></header><div class="board-grid">'
for i,n in enumerate(names):
    b+='<section class="sample"><h3>'+t(*n)+'</h3><div class="pair">'+''.join('<div><div class="density-label">'+t('Kompaktní' if c else 'Rozšířená','Compact' if c else 'Expanded')+'</div>'+widget(i,x=0,y=0,w=344,compact=c,board=True)+'</div>' for c in [True,False])+'</div></section>'
b+='</div></div>'
write('catalog',b,1920,2060)
write('opacity-30', '<div class="opacity-caption"><h1>'+t('Minimum: 30 %','Minimum: 30%')+'</h1><p>'+t('Textový podklad zůstává na 90 %. Písmo a ovladače jsou vždy neprůhledné.','Text surface stays at 90%. Type and controls are always opaque.')+'</p></div>'+widget(0,x=420,y=130,compact=False,style='--alpha:.30')+widget(1,x=800,y=130,compact=False,style='--alpha:.30'),cls='lightcase')
write('opacity-default', '<div class="opacity-caption"><h1>'+t('Výchozí: 85 %','Default: 85%')+'</h1><p>'+t('Čitelnost i přes světlé rušné pozadí.','Readable over a bright busy background.')+'</p></div>'+widget(0,x=420,y=130,compact=False)+widget(1,x=800,y=130,compact=False),cls='lightcase')
lang='en';write('edit-en',toolbar()+widget(0,y=128,edit=True)+widget(1,y=430,edit=True)+catalog()+ops(),edit=True);lang='cs'
# Original abstract industrial scene: seeded geometry, no reference or game imagery.
r=random.Random(81)
s=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#a3b6b8"/><stop offset="1" stop-color="#ead3ad"/></linearGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="#8d8d78"/><stop offset="1" stop-color="#354347"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1920v1080H0z"/><circle cx="1340" cy="210" r="100" fill="#ffe8bf"/><path d="M0 530L180 410 450 500 720 400 960 520 1250 350 1550 440 1800 330 1920 400V1080H0" fill="#81908a"/><path d="M0 650L1920 530V1080H0" fill="url(#floor)"/>']
for k in range(32):
    x=r.randrange(-100,1920);y=r.randrange(180,500);w=r.randrange(35,180);h=r.randrange(160,480)
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{r.choice(["#58676a","#747a6c","#9c947c","#63665e"])}" stroke="#b6b5a0" stroke-width="3"/>')
    for a in range(y+15,y+h-8,28):s.append(f'<path d="M{x+8} {a}h{w-16}" stroke="#d1c9a6" stroke-width="5" opacity=".45"/>')
s+=['<path d="M0 100L700 330 1250 275 1920 70M120 0V800M1740 0V780" fill="none" stroke="#39494c" stroke-width="28"/><path d="M0 110L700 340 1250 285 1920 80" fill="none" stroke="#b3a183" stroke-width="5"/><path d="M760 1080L1040 600 1250 1080" fill="#cac2a0" opacity=".28"/>']
for i in range(180):
    x=r.randrange(1920);y=r.randrange(730,1080);w=r.randrange(4,70)
    s.append(f'<path d="M{x} {y}l{w} -{w//3} {w//2} {w//2} -{w} 5z" fill="{r.choice(["#b7ab87","#4c5b5a","#7c8072","#d2bf96"])}"/>')
s.append('</svg>');(P/'scene.svg').write_text(''.join(s))
(P/'manifest.json').write_text(json.dumps(fixtures,indent=2))
(P/'labels.json').write_text(json.dumps(labels,ensure_ascii=False,indent=2),encoding='utf-8')
(P/'labels.md').write_text('# UI strings / Řetězce UI\n\nCzech default; English game names, loot areas, Ops, Lobby, Raid and Gear Bench 2 stay unchanged. Numbers are locale-formatted. Fixtures contain fictional progress. Symbols have accessible action names.\n\n| Čeština | English |\n|---|---|\n'+''.join(f'| {a} | {b} |\n' for a,b in labels.items()),encoding='utf-8')
print(f'{len(fixtures)} fixtures, {len(labels)} bilingual strings')
