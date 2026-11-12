"""Additional contact sheets and export checks, only under bednak2/."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,random,hashlib
R=Path(__file__).resolve().parents[1]
def font(n):return ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',n)
def put(im,path):
 p=R/path;p.parent.mkdir(parents=True,exist_ok=True);im.save(p)
def finish():
 manifests={v:json.loads((R/f).read_text(encoding='utf-8')) for v,f in [('corner','ops-layers.json'),('detail','ops-layers-detail.json')]}
 expr=Image.new('RGB',(8*156,10*165),'#141719');ed=ImageDraw.Draw(expr)
 for row,(v,m) in enumerate(manifests.items()):
  n=m['frameSize']['width']
  for fi,f in enumerate(m['forms']):
   sh=Image.open(R/f['expressions']['file'])
   for j,e in enumerate(m['expressions']):
    im=sh.crop((j*n,0,(j+1)*n,n));x=j*156;y=(row*5+fi)*165;expr.paste(im,(x+10,y+24),im);ed.text((x+5,y+3),f'{f["name"]["cs"]} / {e}',fill='#F4AD82',font=font(10))
  # Native-size sprites across three equally busy synthetic backgrounds.
  b=Image.new('RGB',(1050,690),'#141719');d=ImageDraw.Draw(b);rng=random.Random(314)
  for rr,(label,bg,marks) in enumerate([('Tmavé rušné','#181D21',['#363E43','#596267','#B78060']),('Šedé rušné','#696B68',['#849095','#363E43','#A2A8AA']),('Světlé rušné','#D9DDD6',['#A2A8AA','#B78060','#C8C7C2'])]):
   yy=30+rr*220;d.rectangle((0,yy,1050,yy+185),fill=bg)
   for _ in range(140):
    x=rng.randrange(1050);y=yy+rng.randrange(185);d.line((x,y,x+80,y-18),fill=rng.choice(marks),width=rng.choice([1,2,4]))
   d.text((8,yy-24),f'{label} / {v} / nativní {n} px',fill='#F2EEE7',font=font(15))
   for k,lv in enumerate([0,15,30,45,75]):
    im=Image.open(R/f'{v}/levels/{lv:02}.png');x=k*208+30;b.paste(im,(x,yy+20),im);d.text((x,yy+160),f'Level {lv}',fill='#101214' if rr==2 else '#F2EEE7',font=font(14))
  put(b,f'boards/{v}-readability.png')
 put(expr,'boards/expressions.png')
 report={'nearestNeighbourFiles':0,'iconFiles':0,'silhouettes':{},'bodyTiles':{},'result':'PASS'}
 for p in (R/'detail').rglob('*.png'):
  if 'levels-256' in p.parts:continue
  a=Image.open(p).convert('RGBA');b=Image.open(R/'detail-256'/p.relative_to(R/'detail')).convert('RGBA');assert a.resize((a.width*2,a.height*2),Image.Resampling.NEAREST).tobytes()==b.tobytes();report['nearestNeighbourFiles']+=1
 for v,m in manifests.items():
  for f in m['forms']:
   for st in list(f['states'].values())+[f['expressions']]:
    for fr in st['frames']:
     assert all(len(a)==2 and all(type(c) is int for c in a) for a in fr['anchors'].values())
     assert sorted(fr['zOrder'],key=fr['zOrder'].get)==m['drawOrder']
    if 'durationsMs' in st:assert all(type(ms) is int and ms>0 for ms in st['durationsMs'])
  areas=[r['opaquePixels'] for r in m['silhouetteValidation']];assert all(a<b for a,b in zip(areas,areas[1:]));report['silhouettes'][v]=areas
  # Distinguish authored timed tiles from unique bitmap poses honestly.
  total=0;unique=0
  for f in m['forms']:
   for k,st in f['states'].items():
    sh=Image.open(R/st['file']);n=m['frameSize']['width'];tiles=[sh.crop((j*n,0,(j+1)*n,n)).tobytes() for j in range(st['frameCount'])];total+=len(tiles);unique+=len(set(tiles))
  report['bodyTiles'][v]={'timed':total,'uniqueWithinClips':unique}
 original=R.parent.parent/'icon/v1/tauri-icons'
 assert {p.name for p in original.iterdir()}=={p.name for p in (R/'icon/tauri-icons').iterdir()}
 for p in (R/'icon').rglob('*'):
  if p.suffix.lower() in ['.png','.ico','.icns']:
   im=Image.open(p);im.load();report['iconFiles']+=1
 (R/'tools/export-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 # Standalone presentation for inline viewing; production preview remains separate.
 html='''<!doctype html><html lang="cs"><meta charset="utf-8"><style>body{font:15px system-ui;color:var(--foreground);margin:0}h2{font-size:20px}img{width:100%;height:auto;image-rendering:pixelated}figure{margin:16px 0}figcaption{padding:8px 0;color:var(--muted-foreground)}</style><h2>Ops / Bedňák II</h2>'''
 for name,label in [('concept/concept-sheet.png','Výtvarný koncept pro 3D'),('boards/silhouettes.png','Pět podob • CORNER 96 / DETAIL 128'),('boards/corner-readability.png','Čitelnost rohové varianty na třech rušných pozadích'),('icon/windows-contexts.png','Návrh ikon v kontextech Windows')]:
  html+=f'<figure><img src="{name}" alt="{label}"><figcaption>{label}</figcaption></figure>'
 (R/'review.html').write_text(html,encoding='utf-8')
 print(json.dumps(report,ensure_ascii=True))
if __name__=='__main__':finish()
