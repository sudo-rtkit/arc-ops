"""Ops Explorer icon study. Python 3 + Pillow. Writes ONLY docs/design/icon/.

Original integer-pixel construction based on the local Ops layer system.
Small sizes are independently authored layouts, never reductions of the master.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import struct, json, hashlib, io

ROOT = Path(__file__).resolve().parents[1]
P = dict(o='#101214', g='#141719', p='#1D2225', d='#272D31', s='#596267',
         t='#A2A8AA', c='#F2EEE7', a='#F4AD82', h='#FFC69F', r='#B78060', u='#DE966F')
SIZES = (16,24,32,48,64,128,256)
# body box / mast x, top / eye x positions, y, width, height / lens x,y
# Separate optical layouts: eye area, mast, lens and clearances are designed at 1x.
FULL = {
16: ((5,5,10,12),(5,2),(6,9,8,1,2),(12,7)),
24: ((7,9,16,18),(8,3),(9,13,12,2,3),(18,11)),
32: ((9,12,22,24),(10,4),(12,18,16,2,4),(24,15)),
48: ((14,17,33,36),(16,5),(18,27,23,3,6),(35,21)),
64: ((19,23,44,48),(21,7),(25,36,30,3,8),(46,28)),
}
HEAD = {
16: ((3,6,12,13),(4,1),(5,9,8,2,3),(13,7)),
24: ((4,9,18,20),(6,2),(7,13,12,3,5),(20,11)),
32: ((5,11,25,27),(8,2),(9,18,16,4,6),(27,14)),
48: ((8,16,37,40),(12,3),(14,27,23,5,9),(40,20)),
64: ((10,22,50,54),(16,4),(18,36,31,7,12),(54,27)),
}

def blank(n): return Image.new('RGBA',(n,n))
def rect(d,box,color): d.rectangle(box, fill=P.get(color,color))
def tile(n):
    im=blank(n); d=ImageDraw.Draw(im)
    # Stepped rounded square; tactical top-right chamfer, entirely binary alpha.
    m=max(1,n//32); r=max(2,n//8); e=n-1-m
    poly=[(m+r,m),(e-r,m),(e,m+r),(e,e-r),(e-1,e-1),(e-r,e),
          (m+r,e),(m+1,e-1),(m,e-r),(m,m+r),(m+1,m+1)]
    d.polygon(poly,fill=P['s'])
    d.polygon([(x+(m if x<n/2 else -m),y+(m if y<n/2 else -m)) for x,y in poly],fill=P['p'])
    # Restrained warm rim: one logical pixel at native drawing size.
    d.line([(m+r,m),(e-r,m),(e,m+r)],fill=P['r'],width=m)
    d.line([(e-r+1,m+1),(e-1,m+r-1)],fill=P['a'],width=m)
    return im

def character(n,version,tray=None):
    im=blank(n); d=ImageDraw.Draw(im)
    (l,t,r,b),(ax,at),(ex1,ex2,ey,ew,eh),(lx,ly)=(FULL if version==1 else HEAD)[n]
    q=max(1,n//24)
    def box(x,y,x2,y2,c): rect(d,(x,y,x2,y2),c)
    # Explorer's permanent tall scout mast, with squared receiver cap.
    box(ax,at+q,ax+q,t,'o'); box(ax,at+q,ax,t-1,'t')
    box(ax-q,at,ax+2*q,at+2*q,'o')
    box(ax,at+q,ax+q,at+q,'s')
    if version==1:
        # Small backpack to the left, two short boots below the crate.
        box(l-3*q,t+2*q,l-1,b-q,'o'); box(l-2*q,t+3*q,l-1,b-q,'r')
        if n>=24: box(l-2*q,t+3*q,l-2*q,b-2*q,'u')
        if n==16:
            for x in (l,r-1):
                box(x,b,x+1,b+1,'o'); box(x,b+1,x,b+1,'t')
        else:
            for x in (l+q,r-2*q):
                box(x,b,x+2*q,b+3*q,'o'); box(x+q,b+q,x+2*q-1,b+2*q,'s')
                box(x+q,b+2*q,x+2*q-1,b+2*q,'t')
    # Main crate. The lower copper panel and steel forehead are Ops signatures.
    box(l,t,r,b,'o'); box(l+q,t+q,r-q,b-q,'s')
    box(l+2*q,t+q,r-2*q,t+q,'c')
    box(l+q,b-3*q,r-q,b-q,'r')
    if n>=24: box(l+q,b-3*q,r-2*q,b-3*q,'u')
    # Dark visor keeps distinct rectangular warm eyes, even at sixteen pixels.
    box(l+q,ey-q,r-q,ey+eh,'o')
    box(l+2*q,ey-q+1,r-2*q,ey+eh-1,'d')
    for x in (ex1,ex2):
        box(x,ey,x+ew-1,ey+eh-1,'h')
        if n>=32: box(x,ey+eh-1,x+ew-1,ey+eh-1,'a')
    # Offset scout lens on the right edge, with an apricot optical center.
    box(lx-q,ly-q,lx+q,ly+2*q,'o')
    box(lx,ly,lx,ly+q,'a')
    if n>=32: box(lx,ly,lx,ly,'h')
    if n>=24:
        mid=(l+r)//2
        box(mid-q,b-2*q,mid+q,b-q,'d')
    # High-contrast tray: one-pixel halo around all opaque pixels, no tile.
    if tray:
        from PIL import ImageFilter, ImageChops
        mask=im.getchannel('A'); dil=mask.filter(ImageFilter.MaxFilter(3))
        halo=Image.new('RGBA',im.size,P['c'] if tray=='dark' else P['o'])
        halo.putalpha(dil); halo.alpha_composite(im); im=halo
    return im

def icon(n,v):
    if n in FULL:
        im=tile(n); im.alpha_composite(character(n,v)); return im
    if n in (128,256,512,1024):
        return icon(64,v).resize((n,n),Image.Resampling.NEAREST)
    # Odd Windows Store sizes: integer-expanded character, native-size tile.
    base=16 if n<32 else 32 if n<64 else 64
    k=max(1,(n-2)//base)
    ch=character(base,v).resize((base*k,base*k),Image.Resampling.NEAREST)
    im=tile(n); im.alpha_composite(ch,((n-ch.width)//2,(n-ch.height)//2)); return im

def write_ico(path,images):
    # ICO PNG payloads preserve each independently drawn small raster exactly.
    payload=[]
    for im in images:
        b=io.BytesIO(); im.save(b,format='PNG'); payload.append(b.getvalue())
    offset=6+16*len(images); data=struct.pack('<HHH',0,1,len(images))
    for im,p in zip(images,payload):
        n=im.width; data+=struct.pack('<BBBBHHII',n if n<256 else 0,n if n<256 else 0,0,0,1,32,len(p),offset); offset+=len(p)
    path.write_bytes(data+b''.join(payload))

def main():
    source=ROOT.parents[2]/'src-tauri/icons'
    # Read-only inventory of the existing replacement folder (not its artwork).
    expected={f.name:Image.open(f).size[0] for f in source.glob('*.png')}
    for v in (1,2):
        out=ROOT/f'v{v}'; out.mkdir(exist_ok=True)
        for n in SIZES: icon(n,v).save(out/f'icon{n}.png')
        icon(1024,v).save(out/'icon.png')
        icon(64,v).save(out/'favicon.png')
        write_ico(out/'icon.ico',[icon(n,v) for n in SIZES])
        for n in (16,32):
            # Both proposals share the same Explorer head identity in the tray.
            for theme in ('dark','light'):
                character(n,2,theme).save(out/f'tray-{theme}-{n}.png')
            character(n,2,'dark').save(out/f'tray{n}.png')
        tauri=out/'tauri-icons'; tauri.mkdir(exist_ok=True)
        for name,n in expected.items():
            if name in ('icon.png','source.png'): n=1024
            icon(n,v).save(tauri/name)
        write_ico(tauri/'icon.ico',[icon(n,v) for n in SIZES])
        # Optional ICNS makes the replacement asset inventory complete, too.
        icon(1024,v).save(tauri/'icon.icns',format='ICNS',append_images=[icon(n,v) for n in (16,32,64,128,256,512)])
    preview()
    print('Built V1 / V2 Explorer assets and preview.')

def preview():
    def img(v,n,kind=None):
        src=f'v{v}/'+(kind or f'icon{n}.png')
        return f'<img src="{src}" width="{n}" height="{n}" alt="Ops průzkumník V{v}, {n} px">'
    html='''<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ops — ikona průzkumníka</title><style>
    *{box-sizing:border-box} body{font:14px/1.6 system-ui,sans-serif;color:#F2EEE7;margin:0}main{max-width:1140px;margin:auto}h1{font-size:36px;line-height:1.15;margin:6px 0 14px}h2{font-size:22px}h3{font-size:14px;margin:0 0 16px}p{max-width:75ch}small,.muted{color:#A2A8AA}header,section{padding:24px;margin:12px 0;background:#1D2225;border-radius:12px}header{background:#272D31}.eyebrow{color:#F4AD82;letter-spacing:.14em;font-size:11px}.hero{display:flex;gap:32px;align-items:center;flex-wrap:wrap}.hero img{width:192px;height:192px}img{image-rendering:pixelated;vertical-align:middle;flex-shrink:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.sample{padding:20px;border-radius:8px;overflow:auto}.dark{background:#141719;color:#F2EEE7}.light{background:#F2EEE7;color:#1D2225}.sizes{display:flex;gap:20px;align-items:end;flex-wrap:wrap}.sizes figure{margin:0;text-align:center}.sizes figcaption{font-size:11px;margin-top:9px;opacity:.7}.large{margin-top:24px;display:flex;gap:24px;align-items:end;flex-wrap:wrap}.bar{display:flex;align-items:center;gap:16px;padding:12px;border:1px solid #84909555;border-radius:6px;margin:12px 0}.bar .space{flex:1}.task{border-radius:5px;padding:6px 12px;border-bottom:3px solid #F4AD82;background:#84909522}.start{display:flex;gap:24px;align-items:center;padding:20px;background:#84909518;border-radius:8px}.pin{text-align:center;max-width:150px}.pin p{font-size:12px;margin:8px 0}.tag{color:#F4AD82}.trayline{display:flex;gap:20px;align-items:center;margin-top:12px}a{color:inherit}.note{border-left:2px solid #F4AD82;padding-left:14px}@media(max-width:700px){.grid{grid-template-columns:1fr}h1{font-size:28px}section,header{padding:16px}.hero img{width:128px;height:128px}}
    </style><main><header><div class="eyebrow">ARC RAIDERS COMPANION / GRAFICKÁ STUDIE</div><h1>Ops. Průzkumník na ploše.</h1><p>Dvě varianty vlastní postavy Bedňák B. Vysoká anténa, boční průzkumná čočka, meruňkové oči a teplý grafit. Bez převzaté herní grafiky.</p><p class="muted">Skutečné velikosti · bez vyhlazování · návrhy zatím nejsou nasazené v aplikaci</p></header>'''
    for v,title,desc in [(1,'Celý průzkumník','Anténa, malý batoh a krátké boty. Věrnější postavě; vhodný na plochu a do nabídky Start.'),(2,'Tvář průzkumníka','Větší hledí a oči, anténa i samostatná čočka. Doporučená hlavní ikona pro lepší čitelnost v malých velikostech.')]:
        html+=f'<section><div class="hero">{img(v,256)}<div><div class="eyebrow">VARIANTA 0{v}</div><h2>{title}</h2><p>{desc}</p><p><a href="v{v}/icon.png">Originál 1024 × 1024</a> · <a href="v{v}/icon.ico">Windows ICO</a></p></div></div></section>'
        for theme,label in [('dark','Tmavý podklad'),('light','Světlý podklad')]:
            html+=f'<section class="{theme}"><h3>V{v} · {label} / velikosti 1 : 1</h3><div class="sizes">'
            for n in SIZES: html+=f'<figure>{img(v,n)}<figcaption>{n} × {n}</figcaption></figure>'
            html+='</div><h3 style="margin-top:28px">Windows / kontextové makety</h3>'
            html+=f'<div class="bar">{img(v,16)}<span>ARC Raiders Companion</span><span class="space"></span><span>—　□　×</span></div>'
            html+=f'<div class="start"><div class="pin">{img(v,64)}<p>ARC Raiders<br>Companion</p></div><div><b>Připnuto ve Startu</b><br><span>Grafitová dlaždice, průhledné rohy</span></div></div>'
            html+=f'<div class="bar"><span>⊞</span><span>Hledat</span><span class="space"></span><span class="task">{img(v,32)}</span><span class="space"></span><span>⌃</span>{img(v,16,f"tray-{theme}-16.png")}<span>14:35</span></div>'
            html+=f'<div class="trayline"><span>Tray bez dlaždice / {"světlá kontura" if theme=="dark" else "tmavá kontura"}</span>{img(v,16,f"tray-{theme}-16.png")}{img(v,32,f"tray-{theme}-32.png")}</div></section>'
    html+='<section><h2>Doporučení: V2</h2><p class="note">V2 má větší plochu očí a hledí při 16–32 px. V1 lépe vypráví, kdo je Ops: malý průzkumník s batohem. Tray používá v obou sadách stejnou čitelnou hlavu průzkumníka.</p><p>16, 24, 32, 48 a 64 px mají vlastní celočíselnou konstrukci. Exporty 128, 256 a 1024 px zvětšují kresbu 64 px metodou nejbližšího souseda. Makety nejsou screenshoty nativního Windows.</p></section></main></html>'
    (ROOT/'preview.html').write_text(html,encoding='utf-8')

if __name__=='__main__': main()
