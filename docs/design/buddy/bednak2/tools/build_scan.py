"""Add quiet scan clips to the existing native manifests; writes only bednak2/.
Run after build.py (which calls this automatically), or independently to preserve
all existing exports. Uses build.render, the same native pixel rig as other clips.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops
import base64, copy, json
from build import ROOT, STATES, render, strip

NAMES=('scan','scan-ok','scan-unsure')

def write_json(path,data):
 (ROOT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')

def compose(m,form,state,index,level):
 n=m['frameSize']['width'];s=form['states'][state];fr=s['frames'][index]
 out=Image.new('RGBA',(n,n));outfit=m['unlocks'][level]['defaultOutfit']
 for slot in sorted(fr['zOrder'],key=fr['zOrder'].get):
  if slot=='body':
   with Image.open(ROOT/s['file']) as sheet:out.alpha_composite(sheet.crop((index*n,0,(index+1)*n,n)))
  elif outfit.get(slot):
   part=next(p for p in m['parts'] if p['id']==outfit[slot])
   with Image.open(ROOT/part['file']) as sheet:
    tile=sheet.convert('RGBA')
    if part.get('frameSource')=='playerLevel':
     w,h=part['frameSize'].values();tile=tile.crop((level*w,0,(level+1)*w,h))
    a=fr['anchors'][slot];off=part['offset'];out.alpha_composite(tile,(a[0]+off[0],a[1]+off[1]))
 return out

def font(size):
 for path in ['C:/Windows/Fonts/consola.ttf','C:/Windows/Fonts/arial.ttf']:
  if Path(path).exists():return ImageFont.truetype(path,size)
 return ImageFont.load_default()

def boards(manifests):
 # One full sequence board per emote: both variants, all frames, all backgrounds.
 # Every frame is shown once at native size and once at exactly 4x NN.
 for state in NAMES:
  cols=STATES[state]['frameCount'];cell=536;width=40+cols*cell
  height=90+sum(3*(n*5+100) for n in (96,128))
  board=Image.new('RGB',(width,height),'#141719');d=ImageDraw.Draw(board)
  d.text((20,15),f'{state} | one-shot | {sum(STATES[state]["durationsMs"])} ms | 1x + 4x nearest neighbour',font=font(24),fill='#FFC69F')
  y=70
  for variant,m in manifests.items():
   n=m['frameSize']['width'];f=m['forms'][0]
   for bg,label,fg in [('#141719','dark','#F2EEE7'),('#747872','mid-grey','#101214'),('#E7E8DC','light','#101214')]:
    rh=n*5+100;d.rectangle((10,y,width-10,y+rh-8),fill=bg)
    d.text((20,y+8),f'{variant.upper()} {n}px | Rookie lv 0 | {label} | upper 1x, lower 4x',font=font(18),fill=fg)
    for i,ms in enumerate(STATES[state]['durationsMs']):
     x=24+i*cell;im=compose(m,f,state,i,0)
     board.paste(im,(x,y+40),im);large=im.resize((n*4,n*4),Image.Resampling.NEAREST);board.paste(large,(x,y+48+n),large)
     d.text((x,y+rh-35),f'{i+1}: {ms} ms',font=font(17),fill=fg)
    y+=rh
  board.save(ROOT/f'boards/{state}-frames.png')
 # All five forms and all three backgrounds, every frame at native resolution.
 width=1450;rows=[]
 for variant,m in manifests.items():
  for f in m['forms']:
   for state in NAMES:rows.append((variant,m,f,state))
 height=60+sum(3*(m['frameSize']['width']+40) for _,m,_,_ in rows)
 board=Image.new('RGB',(width,height),'#141719');d=ImageDraw.Draw(board)
 d.text((20,14),'SCAN EMOTES | all 5 forms | all frames | native size | default outfit at form maximum level',font=font(19),fill='#FFC69F');y=55
 for variant,m,f,state in rows:
  n=m['frameSize']['width'];lv=f['levels'][1]
  for bg,fg in [('#141719','#F2EEE7'),('#747872','#101214'),('#E7E8DC','#101214')]:
   d.rectangle((10,y,width-10,y+n+34),fill=bg)
   d.text((20,y+4),f'{variant} | {f["id"]} lv {lv} | {state}',font=font(16),fill=fg)
   for i in range(STATES[state]['frameCount']):
    im=compose(m,f,state,i,lv);board.paste(im,(20+i*(n+20),y+30),im)
   y+=n+40
 board.save(ROOT/'boards/scan-forms.png')

def main():
 manifests={};report={'result':'PASS','variants':{},'scope':'Native asset/manifest checks; no app integration or game overlay tested.'}
 for variant,manifest_path in [('corner','ops-layers.json'),('detail','ops-layers-detail.json')]:
  m=json.loads((ROOT/manifest_path).read_text(encoding='utf-8'));n=m['frameSize']['width'];count=0;changed=[]
  palette={tuple(bytes.fromhex(c[1:])) for c in m['palette'].values()}
  for tier,f in enumerate(m['forms']):
   ref=f['states']['idle']['frames'][0]
   with Image.open(ROOT/f['states']['idle']['file']) as sheet:base=sheet.crop((0,0,n,n)).convert('RGBA')
   for state in NAMES:
    meta=copy.deepcopy(STATES[state]);poses=[];tiles=[]
    for i,ms in enumerate(meta['durationsMs']):
     im,a,vis,optic=render(variant,tier,state,i,meta['frameCount'])
     fr={'index':i,'durationMs':ms,'anchors':a,'zOrder':copy.deepcopy(ref['zOrder']),'visible':vis,'opticClearance':optic}
     assert a==ref['anchors'] and optic==ref['opticClearance'] and vis
     assert im.getchannel('A').tobytes()==base.getchannel('A').tobytes()
     assert set(im.getchannel('A').getdata())<={0,255}
     assert {c[:3] for c in im.getdata() if c[3]}<=palette
     diff=ImageChops.difference(im.convert('RGB'),base.convert('RGB'));box=diff.getbbox()
     if i in [0,meta['frameCount']-1]:assert im.tobytes()==base.tobytes()
     if box:
      x1,y1,x2,y2=optic;assert x1<=box[0]<=box[2]-1<=x2 and y1<=box[1]<=box[3]-1<=y2
     # Thus plating/brown pixels outside the optics, alpha rim and all anchors
     # are unchanged; exact-match paint swaps see identical material colours.
     tiles.append(im);poses.append(fr);count+=1
    assert len({im.tobytes() for im in tiles})>=3
    file=f'{variant}/bodies/{f["id"]}/{state}.png';strip(tiles).save(ROOT/file)
    if variant=='detail':
     dest=ROOT/'detail-256'/Path(file).relative_to('detail');dest.parent.mkdir(parents=True,exist_ok=True)
     sh=strip(tiles);sh.resize((sh.width*2,sh.height*2),Image.Resampling.NEAREST).save(dest)
    f['states'][state]={**meta,'file':file,'frames':poses};m['states'][state]=meta
  write_json(manifest_path,m);manifests[variant]=m
  # All 76 levels inherit their form's static, unchanged equipment anchors.
  composites=0
  for lv in range(76):
   f=next(f for f in m['forms'] if f['id']==m['unlocks'][lv]['form'])
   for state in NAMES:
    for i in range(STATES[state]['frameCount']):compose(m,f,state,i,lv);composites+=1
  report['variants'][variant]={'forms':5,'newClips':15,'timedFrames':count,'allLevelFrameComposites':composites,'alpha':[0,255],'palette':'existing only','movement':'none; unchanged idle[0] anchors','endpoints':'byte-identical idle[0]','changes':'inside opticClearance only'}
 boards(manifests)
 assets={}
 for m in manifests.values():
  paths=[s['file'] for f in m['forms'] for s in f['states'].values()]+[f['expressions']['file'] for f in m['forms']]+[p['file'] for p in m['parts']]+[t['file'] for t in m['transforms']]+[m['fx']['sparkle']['file']]
  for path in paths:assets[path]='data:image/png;base64,'+base64.b64encode((ROOT/path).read_bytes()).decode()
 template=(ROOT/'tools/preview.template.html').read_text(encoding='utf-8')
 (ROOT/'preview.html').write_text(template.replace('__MANIFESTS__',json.dumps(manifests,ensure_ascii=False)).replace('__ASSETS__',json.dumps(assets)),encoding='utf-8')
 write_json('tools/scan-validation.json',report);print(json.dumps(report))

if __name__=='__main__':main()
