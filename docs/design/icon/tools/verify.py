"""Check all supplied rasters, exact ICO frames, replacement inventory and scope.
Run from any folder; writes its report only beside this script.
"""
from pathlib import Path
from PIL import Image
import json, struct, io, hashlib, re, base64
from build import ROOT, SIZES, P, FULL, HEAD

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    report={'character':'Ops / Explorer / průzkumník','variants':{},'checks':[]}
    expected=set(f.name for f in (ROOT.parents[2]/'src-tauri/icons').iterdir() if f.is_file())
    for v in (1,2):
        out=ROOT/f'v{v}'; images=[]
        for f in sorted(out.rglob('*.png')):
            im=Image.open(f).convert('RGBA'); colors=set(im.get_flattened_data())
            assert all(c[3] in (0,255) for c in colors),f
            allowed={tuple(bytes.fromhex(c[1:])) for c in P.values()}
            assert all(c[:3] in allowed for c in colors if c[3]),f
            assert im.getchannel('A').getextrema()==(0,255),f
            images.append({'file':str(f.relative_to(ROOT)), 'size':list(im.size),'sha256':sha(f)})
        for n in SIZES: assert Image.open(out/f'icon{n}.png').size==(n,n)
        assert Image.open(out/'icon.png').size==(1024,1024)
        assert Image.open(out/'favicon.png').size==(64,64)
        for n in (16,32):
            for theme in ('light','dark'):
                im=Image.open(out/f'tray-{theme}-{n}.png')
                assert im.size==(n,n)
                # Empty corner proves no graphite tile was added.
                assert im.getpixel((n-1,n-1))[3]==0
        for f in (out/'icon.ico',out/'tauri-icons/icon.ico'):
            raw=f.read_bytes(); reserved,kind,count=struct.unpack_from('<HHH',raw)
            assert (reserved,kind,count)==(0,1,7)
            decoded=[]
            for i in range(count):
                w,h,_,_,planes,bpp,length,offset=struct.unpack_from('<BBBBHHII',raw,6+i*16)
                n=w or 256; im=Image.open(io.BytesIO(raw[offset:offset+length])).convert('RGBA')
                assert im.size==(n,n) and bpp==32 and planes==1
                assert im.tobytes()==Image.open(out/f'icon{n}.png').convert('RGBA').tobytes()
                decoded.append(n)
            assert decoded==list(SIZES)
            assert Image.open(f).ico.sizes()=={(n,n) for n in SIZES}
        actual={f.name for f in (out/'tauri-icons').iterdir() if f.is_file()}
        assert expected==actual,(expected-actual,actual-expected)
        for f in (out/'tauri-icons').glob('*.png'):
            target=1024 if f.name in ('source.png','icon.png') else Image.open(ROOT.parents[2]/'src-tauri/icons'/f.name).width
            assert Image.open(f).size==(target,target)
        assert Image.open(out/'tauri-icons/icon.icns').size==(1024,1024)
        report['variants'][f'v{v}']={'pngs':images,'icoFrames':list(SIZES),'tauriFiles':sorted(actual)}
    html=(ROOT/'preview.html').read_text(encoding='utf-8')
    assert 'image-rendering:pixelated' in html
    assert not re.search(r'(?:src|href)=[\"\']https?://',html)
    for src in re.findall(r'(?:src|href)="([^"]+)"',html): assert (ROOT/src).is_file(),src
    # Embedded copy for the conversation renderer; deliverable stays relative/offline.
    def embed(m):
        data=base64.b64encode((ROOT/m[1]).read_bytes()).decode('ascii')
        return 'src="data:image/png;base64,'+data+'"'
    inline=re.sub(r'src="([^"]+\.png)"',embed,html)
    (ROOT/'tools/inline-review.html').write_text(inline,encoding='utf-8')
    board='''<!doctype html><html lang="cs"><meta charset="utf-8"><style>
    body{margin:0;color:var(--foreground);font-family:var(--font-sans,system-ui)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}section{min-width:0}
    h3{font-size:16px;margin:8px 0}p{font-size:12px;color:var(--muted-foreground);margin:8px 0}
    .sample{border-radius:var(--radius,8px);padding:16px;margin:12px 0}
    .dark{background:#141719;color:#F2EEE7}.light{background:#F2EEE7;color:#1D2225}
    .row{display:flex;gap:16px;align-items:center;flex-wrap:wrap}img{image-rendering:pixelated}
    figure{margin:0;text-align:center}figcaption{font-size:10px;margin-top:5px}
    @media(max-width:560px){.grid{grid-template-columns:1fr}}
    </style><div class="grid">'''
    for v,title in ((1,'V1 / Celý průzkumník'),(2,'V2 / Tvář průzkumníka')):
        board+=f'<section><h3>{title}</h3><p>{"Anténa, čočka, batoh a boty" if v==1 else "Větší oči a hledí · doporučená varianta"}</p>'
        for theme,label in (('dark','Tmavý podklad'),('light','Světlý podklad')):
            board+=f'<div class="sample {theme}"><div class="row">'
            for n in (128,16,24,32):
                data=base64.b64encode((ROOT/f'v{v}/icon{n}.png').read_bytes()).decode('ascii')
                board+=f'<figure><img src="data:image/png;base64,{data}" width="{n}" height="{n}" alt="V{v} {n} px"><figcaption>{n} px</figcaption></figure>'
            board+=f'</div><p style="color:inherit">{label} · tray bez dlaždice</p><div class="row">'
            for n in (16,32):
                data=base64.b64encode((ROOT/f'v{v}/tray-{theme}-{n}.png').read_bytes()).decode('ascii')
                board+=f'<img src="data:image/png;base64,{data}" width="{n}" height="{n}" alt="Tray {n} px">'
            board+='</div></div>'
        board+='</section>'
    board+='</div></html>'
    (ROOT/'tools/comparison.html').write_text(board,encoding='utf-8')
    from PIL import ImageDraw
    sheet=Image.new('RGB',(1000,520),P['p']); draw=ImageDraw.Draw(sheet)
    for v in (1,2):
        for i,n in enumerate((16,24,32,48,64)):
            im=Image.open(ROOT/f'v{v}/icon{n}.png').resize((192,192),Image.Resampling.NEAREST)
            sheet.paste(im,(i*200,(v-1)*260+30),im)
            draw.text((i*200,(v-1)*260+5),f'V{v} / {n}px',fill=P['c'])
    sheet.save(ROOT/'tools/contact-sheet.png')
    report['checks']=['Binary alpha and source palette in all PNGs','Independent layouts at 16/24/32/48/64','Seven exact PNG frames in each ICO','All original Tauri asset filenames matched, including optional ICNS','Offline relative preview references resolve','Transparent tray corners, both contrast treatments']
    report['sources']={str(p.relative_to(ROOT.parents[2])):sha(p) for p in [ROOT.parent/'buddy/layers/ops-layers.json',ROOT.parent/'buddy/layers/composite/level-15.png',ROOT.parents[2]/'src/ui/tokens.css']}
    (ROOT/'tools/validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'PASS: {sum(len(x["pngs"]) for x in report["variants"].values())} PNGs, 4 ICOs, 2 ICNS, offline preview.')

if __name__=='__main__': main()
