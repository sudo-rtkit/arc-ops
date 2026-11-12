"""Bedňák II native pixel rig. Writes only bednak2/."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter
import json, math, types, hashlib, random, base64

ROOT=Path(__file__).resolve().parents[1]
BUDDY=ROOT.parent
OLD=json.loads((BUDDY/'layers/ops-layers.json').read_text(encoding='utf-8'))
P={'ink':'#101214','graphite':'#141719','panel':'#1D2225','dark':'#272D31','seam':'#363E43','steel':'#596267','slate':'#738084','tin':'#A2A8AA','cream':'#F2EEE7','bone':'#D8D0BC','apricot':'#F4AD82','light':'#FFC69F','copper':'#DE966F','rust':'#B78060','umber':'#795842','cloth':'#585D50','clothLight':'#81856B','green':'#91CFAB','amber':'#E6C66D','danger':'#F09B9E'}
SLOTS=OLD['slots'];Z={s:i*5 for i,s in enumerate(OLD['drawOrder'])}
FORMS=[('rookie','Začátečník','Rookie',0,14),('explorer','Průzkumník','Explorer',15,29),('scavenger','Mrchožrout','Scavenger',30,44),('veteran','Veterán','Veteran',45,59),('legend','Legenda','Legend',60,75)]
EXPRESSIONS=['neutral','happy','focused','worried','annoyed','sleepy','smug','surprised']
STATES={}
for key,label,count,ms,loop in [
 ('idle','Klid',16,160,True),('talk','Řeč',24,85,True),('greet','Pozdrav',24,80,False),
 ('point-left','Ukázat vlevo',20,90,False),('point-right','Ukázat vpravo',20,90,False),('point-up','Ukázat nahoru',20,90,False),('point-down','Ukázat dolů',20,90,False),
 ('scanning','Skenování',24,90,True),('thinking','Přemýšlení',20,110,True),('success','Úspěch',24,80,False),('level-up','Nový level',32,85,False),('error','Porucha',16,95,False),
 ('sleep','Spánek',16,280,True),('wake-up','Probuzení',24,90,False),('appear','Příchod',24,70,False),('dismiss','Odchod',24,70,False),('inspect','Prohlížení nálezu',32,125,False),('carry','Nesení kořisti',24,110,True),('drag','Držení myší',16,110,True),('walk','Kroky na místě',24,70,True),('annoyed','Netrpělivost',24,110,False),('laugh','Smích',24,90,False),('shrug','Pokrčení ramen',24,100,False)]:
 STATES[key]={'label':label,'frameCount':count,'durationsMs':[ms]*count,'loop':loop,'returnTo':None if loop or key=='dismiss' else 'idle'}
STATES['idle']['durationsMs']=[1500,200,180,200,180,200,180,160,80,70,80,250,150,180,180,600]
DIGITS=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111']
def save(im,path):
 p=ROOT/path;p.parent.mkdir(parents=True,exist_ok=True);im.save(p)
def dump(x,path):
 p=ROOT/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf-8')
def ease(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def pulse(t):return ease(t/.25)*(1-ease((t-.75)/.25))

class Pen:
 scale=1;corner=False
 def __init__(self,im,dx=0,dy=0):self.d=ImageDraw.Draw(im);self.dx=dx;self.dy=dy
 def pts(self,ps):return [(round((x+self.dx)*self.scale),round((y+self.dy)*self.scale)) for x,y in ps]
 def poly(self,ps,c,outline=None):self.d.polygon(self.pts(ps),fill=P.get(c,c),outline=P.get(outline,outline))
 def line(self,ps,c,w=1):self.d.line(self.pts(ps),fill=P.get(c,c),width=max(1,round(w*self.scale)))
 def rect(self,box,c):
  x,y,a,b=box;self.d.rectangle([*self.pts([(x,y)])[0],*self.pts([(a,b)])[0]],fill=P.get(c,c))
 def ellipse(self,box,c):
  x,y,a,b=box;self.d.ellipse([*self.pts([(x,y)])[0],*self.pts([(a,b)])[0]],fill=P.get(c,c))
 def bolt(self,x,y):
  if not self.corner:self.rect((x-1,y-1,x+1,y+1),'ink');self.rect((x-1,y-1,x,y),'tin')

# Native Bedňák rig: all coordinates authored in a 128px drafting space.
def render(variant,tier,state,i,count,expression='neutral'):
 n=96 if variant=='corner' else 128;sc=n/128;Pen.scale=sc;Pen.corner=variant=='corner'
 im=Image.new('RGBA',(n,n));t=i/max(1,count-1);wave=math.sin(t*math.pi*2);hold=math.sin(t*math.pi)**2
 dx=0;dy=round(wave);e=expression;left=(25,74);right=(101,74);foot=0
 if expression!='neutral':
  if e=='happy':dy=-2;right=(104,68)
  if e=='focused':dy=1;right=(98,70)
  if e=='worried':dy=2;left=(24,78)
  if e=='annoyed':right=(103,82)
  if e=='sleepy':dy=4;left=(27,81);right=(100,81)
  if e=='smug':dy=-1;right=(99,71)
  if e=='surprised':dy=-3;left=(24,68);right=(106,67)
 if expression=='neutral' and state=='idle' and i in [8,9,10]:e='sleepy'
 if state=='talk':dy=round(wave*1.5);right=(102,73+round(wave*3))
 if state=='greet':right=(107,47-round(abs(math.sin(t*math.pi*5))*9));e='happy'
 if state.startswith('point-'):
  e='focused';direction=state[6:]
  if direction=='left':left=(9,65)
  elif direction=='right':right=(117,65)
  elif direction=='up':right=(105,24)
  else:right=(110,103)
 if state=='scanning':e='focused';dx=round(wave*2)
 if state=='thinking':e='worried';right=(100,53-round(wave*2))
 if state in ['success','level-up']:
  dy=-round(abs(math.sin(t*math.pi*(2 if state=='success' else 3)))*(5 if state=='success' else 12));e='happy';left=(20,54);right=(108,49)
 if state=='error':e='worried';dx=([0,-2,2,0][i%4] if i<10 else 0)
 if state=='sleep':e='sleepy';dy=3+round(wave);right=(100,81);left=(27,81)
 if state=='wake-up':e='sleepy' if t<.35 else 'surprised' if t<.65 else 'neutral';dy=round(4*(1-t));right=(106,58)
 if state in ['appear','dismiss']:
  progress=t if state=='appear' else 1-t;dy=round((1-ease(progress))*105)
 if state=='inspect':e='focused';dy=round(hold*3);right=(104-round(hold*8),83-round(hold*21))
 if state=='carry':left=(38,99);right=(89,99);dy=round(wave*2);foot=round(wave*2)
 if state=='drag':dy=-7;dx=round(wave*2);foot=5;e='surprised';left=(23,84);right=(105,85)
 if state=='walk':dy=-round(abs(math.sin(t*math.pi*4))*3);foot=round(math.sin(t*math.pi*4)*3)
 if state=='annoyed':e='annoyed';right=(102,84);foot=round(max(0,wave)*3)
 if state=='laugh':e='happy';dy=-round(abs(math.sin(t*math.pi*6))*3);left=(29,75);right=(97,76)
 if state=='shrug':e='worried';left=(21,64-round(hold*5));right=(108,64-round(hold*5));dy=-round(hold*2)
 if state in ['greet','point-left','point-right','point-up','point-down','success','level-up','shrug','wake-up','annoyed','laugh']:
  blend=ease(min(t/.18,(1-t)/.18,1));left=tuple(round(a+(b-a)*blend) for a,b in zip((25,74),left));right=tuple(round(a+(b-a)*blend) for a,b in zip((101,74),right))
 w=[0,2,4,6,7][tier];x=33-w;r=91+w;top=35-tier;bottom=91+tier
 p=Pen(im,dx,dy)
 # Back architecture differs before any wardrobe layer.
 if tier==4:
  p.poly([(x-5,45),(r+5,43),(r+11,98),(r,104),(78,99),(60,105),(x-7,100)],'ink');p.poly([(x-3,48),(r+2,46),(r+7,96),(r-2,99),(77,95),(60,101),(x-3,97)],'cloth');p.line([(x-2,53),(x+2,87),(60,98)],'clothLight',2)
 if tier>=1:
  p.poly([(r-1,48),(r+10+tier,51),(r+12+tier,86),(r+3,91)],'ink');p.poly([(r+2,52),(r+7+tier,54),(r+9+tier,83),(r+3,87)],'umber');p.line([(r+3,57),(r+9,58)],'apricot',2)
  p.line([(x+10,top+2),(x+9,22-tier*2),(x+15,19-tier*2)],'ink',4);p.line([(x+10,top+2),(x+9,22-tier*2),(x+15,19-tier*2)],'tin',2);p.rect((x+13,17-tier*2,x+17,20-tier*2),'apricot')
 if tier>=1:
  p.rect((x-7,54,x-1,64),'ink');p.rect((x-6,55,x-2,61),'apricot');p.rect((x-5,56,x-3,58),'light')
 if tier==2:
  p.poly([(x-10,72),(x+2,69),(x+5,88),(x-6,94),(x-10,88)],'ink');p.poly([(x-8,74),(x,72),(x+2,86),(x-5,90),(x-8,86)],'steel');p.line([(x-8,74),(x-1,72)],'bone',2)
 if tier>=3:
  for sx in [x-9,r-6]:
   p.poly([(sx,36),(sx+7,30),(sx+18,33),(sx+21,42),(sx+17,48),(sx,46)],'ink');p.poly([(sx+2,37),(sx+8,33),(sx+16,36),(sx+18,41),(sx+15,45),(sx+2,43)],'steel');p.line([(sx+3,36),(sx+8,32),(sx+16,35)],'apricot',2)
 # Short articulated boots, wide rather than toddler proportions.
 for fx,fy in [(44-w,foot),(77+w,-foot)]:
  p.rect((fx,86,fx+9,101+fy),'ink');p.rect((fx+2,89,fx+6,100+fy),'steel')
  p.poly([(fx-3,99+fy),(fx+12,99+fy),(fx+15,105+fy),(fx+14,110+fy),(fx-6,110+fy),(fx-6,104+fy)],'ink');p.rect((fx-3,102+fy,fx+11,106+fy),'dark');p.line([(fx-3,102+fy),(fx+9,102+fy)],'tin',2)
  if tier>=3:p.rect((fx-2,94,fx+11,100),'steel');p.line([(fx-1,95),(fx+9,95)],'apricot')
 # Chamfered crate: lit lid, dark side, inset frontal plate.
 p.poly([(x+7,top),(r-7,top),(r,top+7),(r,bottom-6),(r-6,bottom),(x+6,bottom),(x,bottom-6),(x,top+7)],'ink')
 p.poly([(x+7,top+2),(r-8,top+2),(r-2,top+8),(x+3,top+8)],'tin')
 p.poly([(r-10,top+9),(r-2,top+8),(r-2,bottom-7),(r-8,bottom-2),(r-10,bottom-4)],'dark')
 p.poly([(x+2,top+10),(r-12,top+10),(r-12,bottom-3),(x+7,bottom-3),(x+2,bottom-8)],'steel')
 p.line([(x+3,top+10),(x+3,bottom-10)],'bone');p.line([(x+7,top+2),(r-9,top+2)],'cream')
 p.rect((x+7,69,r-15,bottom-8),'umber');p.rect((x+8,70,r-16,bottom-10),'rust');p.line([(x+9,70),(r-18,70)],'copper')
 # A continuous recessed visor with two segmented LEDs, never pupils.
 p.poly([(x+8,43),(r-17,43),(r-12,48),(r-12,65),(r-16,69),(x+8,69),(x+5,65),(x+5,47)],'ink')
 p.rect((x+8,47,r-16,64),'panel');p.line([(x+9,45),(r-18,45)],'slate')
 for j,ex in enumerate([46-w//2,68+w//2]):
  yy=52;hh=8;ww=8
  if e=='sleepy':yy=59;hh=1
  if e=='happy':yy=52;hh=3
  if e=='focused':yy=55;hh=3;ww=10
  if e=='worried':yy=52+j*3;hh=5
  if e=='annoyed':yy=55+j;hh=2
  if e=='smug':yy=53+j*4;hh=3
  if e=='surprised':yy=49;hh=13
  if state=='talk':hh=[3,8,5,10,2,6][(i+j*2)%6];yy=56-hh//2
  for col in range(0,ww,3):p.rect((ex+col,yy,ex+col+1,yy+hh),'light' if j==0 else 'apricot')
 if state=='scanning':p.line([(x+9+round(t*(r-x-28)),49),(x+9+round(t*(r-x-28)),63)],'green')
 if state=='error' and i%3==0:p.line([(x+12,61),(r-20,58)],'danger')
 if tier>=2:
  p.poly([(x-2,71),(x+12,68),(x+16,82),(x+6,90),(x-2,84)],'dark');p.line([(x,72),(x+10,70),(x+13,81)],'tin',2)
 if tier>=3:
  p.poly([(x-5,38),(x+9,32),(x+15,40),(x+11,46),(x-5,47)],'ink');p.poly([(x-3,39),(x+8,35),(x+11,40),(x+8,43),(x-3,44)],'steel');p.line([(x-2,38),(x+7,34)],'apricot',2)
  p.line([(77,45),(81,48),(79,52)],'copper',2)
 if tier==4:p.line([(x+8,86),(x+19,86)],'apricot',2);p.rect((r-8,74,r-5,78),'amber')
 # Sparing rivets and wear only in detail.
 if variant=='detail':
  for xx,yy in [(x+5,40),(r-7,42),(x+6,bottom-8),(r-7,bottom-8)]:p.bolt(xx,yy)
  p.line([(x+18,75),(x+24,74)],'bone');p.line([(r-9,79),(r-6,75)],'steel');p.rect((x+9,38,x+17,40),'bone')
  for xx,yy in [(x+17,82),(x+19,83),(x+21,82)]:p.rect((xx,yy,xx,yy),'copper')
 # Mechanical side handles become arms, same joints across forms.
 for root,end in [((x,63),left),((r,63),right)]:
  elbow=((root[0]+end[0])//2, max(root[1],end[1])+3)
  p.line([root,elbow,end],'ink',7);p.line([root,elbow,end],'steel',3);p.rect((end[0]-3,end[1]-2,end[0]+3,end[1]+3),'ink');p.line([(end[0]-2,end[1]-2),(end[0]+2,end[1]-2)],'apricot',2)
 if state=='inspect' and .12<t<.9:
  ex,ey=right;p.poly([(ex-4,ey-10),(ex+2,ey-13),(ex+6,ey-7),(ex,ey-4)],'bone');p.line([(ex-2,ey-10),(ex+2,ey-8)],'copper')
 if state=='carry':
  p.poly([(43,97),(79,97),(86,102),(86,117),(42,117),(37,112),(37,102)],'ink');p.rect((41,100,82,114),'umber');p.line([(43,101),(79,101)],'bone',2);p.rect((57,99,62,115),'rust')
 if state=='level-up':
  for j in range(3):
   xx=19+j*43;yy=23+round(wave*3);p.line([(xx-3,yy),(xx+3,yy)],'light');p.line([(xx,yy-3),(xx,yy+3)],'cream')
 if variant=='corner':
  alpha=im.getchannel('A');ring=ImageChops.subtract(alpha.filter(ImageFilter.MaxFilter(3)),alpha);rim=Image.new('RGBA',im.size,P['apricot']);rim.putalpha(ring);rim.alpha_composite(im);im=rim
 def at(xx,yy):return [round((xx+dx)*sc),round((yy+dy)*sc)]
 a={k:at(*xy) for k,xy in dict(antenna=(40,30),visor=(60,40),armour=(62,77),backpack=(99,61),tool=(right[0]+1,right[1]+8),badges=(73,85),paint=(34,42),tag=(59,87),shoulders=(92,39),lamp=(27,59),cables=(32,83),charm=(38,95),cape=(21,66),fin=(81,31),belt=(63,94),radio=(96,84)).items()}
 optic=[round((x+7+dx)*sc),round((47+dy)*sc),round((r-15+dx)*sc),round((65+dy)*sc)]
 visible=im.getbbox() is not None
 if state=='dismiss' and i==count-1 or state=='appear' and i==0:im=Image.new('RGBA',(n,n));visible=False
 return im,a,visible,optic

def part_image(slot,v,n):
 # Compact service components occupy disjoint mounting zones.
 Pen.scale=n/128;Pen.corner=n==96;im=Image.new('RGBA',(24,24));p=Pen(im)
 c=['rust','steel','copper','tin','bone'][v-1];g=v//2
 if slot=='antenna':
  p.line([(8,16),(8,6-v),(12,3)],'ink',4);p.line([(8,16),(8,6-v),(12,3)],c,2);p.rect((10,2,12+v,4),'apricot')
 elif slot=='visor':
  p.poly([(1,7),(19,7),(21,10),(1,10)],'ink');p.line([(2,7),(17+v,7)],c,2)
 elif slot=='armour':
  p.poly([(1,6),(16,6),(19,9),(17,13+g),(2,13+g)],'ink');p.poly([(3,7),(15,7),(17,9),(15,11+g),(3,11+g)],c);p.rect((5,8,5+v,9),'light')
 elif slot=='backpack':
  p.poly([(4,4),(10+v,4),(12+v,8),(12+v,16+g),(4,16+g)],'ink');p.rect((5,6,9+v,14+g),c);p.line([(6,8),(9+v,8)],'apricot')
 elif slot=='tool':
  p.line([(8,3),(8,15)],'ink',4);p.line([(8,3),(8,15)],c,2);p.line([(5,2),(5,5),(10+g,5),(10+g,2)],'bone',2)
 elif slot=='badges':
  p.rect((5,7,13,11+g),'ink');p.rect((6,8,12,10+g),c);p.rect((7,8,7+v,9),'amber')
 elif slot=='paint':
  p.poly([(5,4),(9+g,3),(12,11),(8,12)],c);p.line([(7,5),(9,9)],'bone')
 elif slot=='shoulders':
  p.poly([(2,7),(10,4),(17+g,8),(17,12),(2,12)],'ink');p.poly([(4,7),(10,6),(15+g,8),(15,10),(4,10)],c)
 elif slot=='lamp':
  p.rect((5,5,12,13+g),'ink');p.rect((6,6,11,12+g),c);p.rect((7,7,10,9+g),'light')
 elif slot=='cables':
  p.line([(5,4),(5,13),(10+g,16),(13,12)],'ink',4);p.line([(5,4),(5,13),(10+g,16),(13,12)],c,2)
 elif slot=='charm':
  p.line([(8,3),(8,8)],'tin');p.poly([(8,7),(12+g,11),(9,15),(5,12)],c);p.rect((8,10,8+g,11),'ink')
 elif slot=='cape':
  p.poly([(3,2),(9,2),(13+g,20),(5,18),(1,21)],'ink');p.poly([(4,3),(8,3),(11+g,18),(6,16),(3,18)],c)
 elif slot=='fin':
  p.poly([(4,14),(6,5-v//2),(11+v,3),(13,12),(10,14)],'ink');p.poly([(6,12),(8,6),(10+v,5),(11,11)],c)
 elif slot=='belt':
  p.rect((0,6,21,10),'ink');p.rect((1,7,20,9),c);p.rect((9,6,10+v,10),'steel')
 elif slot=='radio':
  p.rect((4,5,11+g,15),'ink');p.rect((5,6,10+g,14),c);p.line([(6,8),(9+g,8)],'dark');p.rect((6,10,6+v,11),'apricot')
 return im,[-round(10*n/128),-round(10*n/128)]

def strip(frames):
 n=frames[0].width;out=Image.new('RGBA',(n*len(frames),n))
 for i,f in enumerate(frames):out.paste(f,(n*i,0))
 return out

CACHE={};PARTS={};MAN={};REPORT={}
def compose(m,level,state='idle',idx=0,outfit=None):
 n=m['frameSize']['width'];u=m['unlocks'][level];form=next(f for f in m['forms'] if f['id']==u['form']);st=form['states'][state];fr=st['frames'][idx]
 out=Image.new('RGBA',(n,n));outfit=u['defaultOutfit'] if outfit is None else outfit
 if not fr.get('visible',True):return out
 for slot in sorted(Z,key=lambda s:fr['zOrder'][s]):
  if slot=='body':out.alpha_composite(CACHE[(m['variant'],form['id'],state)][idx]);continue
  pid=outfit.get(slot)
  if not pid:continue
  part=next(p for p in m['parts'] if p['id']==pid);im=PARTS[(m['variant'],pid)]
  if slot=='tag':w,h=part['frameSize'].values();im=im.crop((level*w,0,(level+1)*w,h))
  a=fr['anchors'][slot];off=part['offset'];out.alpha_composite(im,(a[0]+off[0],a[1]+off[1]))
 return out

def build_variant(variant,n):
 m={k:OLD[k] for k in ['version','layout','slots','drawOrder']};m.update(character='Ops / Bedňák II',variant=variant,frameSize={'width':n,'height':n},palette=P,states=STATES,forms=[],parts=[],unlocks=[],transforms=[],fx={},expressions=EXPRESSIONS,compatibilityAliases={'done':'success','unsure':'thinking','sleeping':'sleep','alert':'error'})
 silhouette=[]
 for tier,(fid,cs,en,lo,hi) in enumerate(FORMS):
  f={'id':fid,'name':{'cs':cs,'en':en},'levels':[lo,hi],'states':{}}
  for state,meta in STATES.items():
   frames=[];poses=[]
   for i in range(meta['frameCount']):
    im,a,vis,optic=render(variant,tier,state,i,meta['frameCount']);frames.append(im);poses.append({'index':i,'durationMs':meta['durationsMs'][i],'anchors':a,'zOrder':Z,'visible':vis,'opticClearance':optic})
   file=f'{variant}/bodies/{fid}/{state}.png';save(strip(frames),file);CACHE[(variant,fid,state)]=frames
   f['states'][state]={**meta,'file':file,'frames':poses}
  expr=[];ef=[]
  for i,e in enumerate(EXPRESSIONS):
   im,a,vis,optic=render(variant,tier,'idle',0,16,e);expr.append(im);ef.append({'index':i,'anchors':a,'zOrder':Z,'visible':vis,'opticClearance':optic})
  file=f'{variant}/bodies/{fid}/expressions.png';save(strip(expr),file);f['expressions']={'file':file,'frameCount':8,'frames':ef}
  m['forms'].append(f)
  base=CACHE[(variant,fid,'idle')][0];mask=base.getchannel('A');silhouette.append({'form':fid,'bbox':mask.getbbox(),'opaquePixels':sum(x>0 for x in mask.getdata()),'sha256':hashlib.sha256(mask.tobytes()).hexdigest()})
 # Preserve catalogue IDs and progression contract; new native Bednak components.
 for old in OLD['parts']:
  p={k:v for k,v in old.items() if k in ['id','slot','variant','name']};slot=p['slot'];v=p['variant'];p['name']={'cs':SLOTS[slot]+' / stupeň '+str(v),'en':slot+' / stage '+str(v)};p['file']=f'{variant}/parts/{slot}/{p["id"]}.png'
  if slot=='tag':
   s=n/96;w=round(13*s);h=round(9*s);im=Image.new('RGBA',(w*76,h));d=ImageDraw.Draw(im)
   for lv in range(76):
    x=lv*w;d.rectangle((x,0,x+w-1,h-1),fill=P['ink']);d.rectangle((x+1,1,x+w-2,h-2),fill=P[['rust','steel','copper','tin','cream'][v-1]])
    for j,ch in enumerate(f'{lv:02}'):
     for b,on in enumerate(DIGITS[int(ch)]):
      if on=='1':d.point((x+3+j*4+b%3,2+b//3),fill=P['ink'])
   p.update(offset=[-w//2,-h//2],frameSource='playerLevel',frameCount=76,frameSize={'width':w,'height':h})
  else:im,off=part_image(slot,v,n);p['offset']=off
  save(im,p['file']);PARTS[(variant,p['id'])]=im;m['parts'].append(p)
 for old in OLD['unlocks']:
  u=json.loads(json.dumps(old));u['label']='Level '+str(u['level'])+': '+('holá bedna' if not u['unlockedParts'] else ' / '.join(next(p['name']['cs'] for p in m['parts'] if p['id']==pid) for pid in u['unlockedParts']));m['unlocks'].append(u)
 for i in range(4):
  fid=FORMS[i][0];target=FORMS[i+1][0];frames=[]
  for j in range(10):
   a=CACHE[(variant,fid,'idle')][0];b=CACHE[(variant,target,'idle')][0];y=round(n*j/9);im=a.copy();im.paste(b.crop((0,0,n,y)),(0,0))
   if 0<j<9:ImageDraw.Draw(im).line((8,y,n-8,y),fill=P['light'],width=2)
   frames.append(im)
  t={**OLD['transforms'][i],'file':f'{variant}/transform/{fid}-to-{target}.png'};save(strip(frames),t['file']);m['transforms'].append(t)
 fx=[]
 for i in range(8):
  im=Image.new('RGBA',(n,n));d=ImageDraw.Draw(im)
  for j in range(5):
   x=round((16+j*15)*n/96);y=round((25+(j%2)*45-i*2)*n/96);r=[1,2,3,4,3,2,1,0][i]
   if r:d.line((x-r,y,x+r,y),fill=P['light']);d.line((x,y-r,x,y+r),fill=P['cream'])
  fx.append(im)
 file=f'{variant}/fx/sparkle.png';save(strip(fx),file);m['fx']['sparkle']={'file':file,'frameCount':8,'durationsMs':[80,80,90,110,100,100,90,150],'loop':False,'returnTo':None,'z':100}
 m['silhouetteValidation']=silhouette
 dump(m,'ops-layers.json' if variant=='corner' else 'ops-layers-detail.json');MAN[variant]=m
 return m

def font(size=14):
 try:return ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',size)
 except:return ImageFont.load_default()
def board():
 for v,m in MAN.items():
  n=m['frameSize']['width'];sheet=Image.new('RGB',(8*(n+16),10*(n+28)),P['graphite']);d=ImageDraw.Draw(sheet)
  for lv in range(76):
   im=compose(m,lv);save(im,f'{v}/levels/{lv:02}.png')
   if v=='detail':save(im.resize((256,256),Image.Resampling.NEAREST),f'detail/levels-256/{lv:02}.png')
   x=lv%8*(n+16);y=lv//8*(n+28);sheet.paste(im,(x+8,y+22),im);d.text((x+8,y+2),f'{lv:02} / {m["unlocks"][lv]["form"]}',font=font(11),fill=P['cream'])
  save(sheet,f'boards/all-levels-{v}.png')
 sil=Image.new('RGB',(1200,430),P['graphite']);d=ImageDraw.Draw(sil)
 for row,(v,m) in enumerate(MAN.items()):
  for i,(fid,cs,en,lo,hi) in enumerate(FORMS):
   im=CACHE[(v,fid,'idle')][0];mask=im.getchannel('A');flat=Image.new('RGBA',im.size,P['cream']);flat.putalpha(mask)
   flat=flat.resize((192,192),Image.Resampling.NEAREST);x=i*240; y=row*215;sil.paste(flat,(x+20,y+20),flat);d.text((x+12,y+2),f'{v} / {cs} / {lo}–{hi}',font=font(13),fill=P['apricot'])
 save(sil,'boards/silhouettes.png')
 # Deterministic synthetic busy scenes. Actual 96px cells, never enlarged.
 b=Image.new('RGB',(1100,650),P['graphite']);d=ImageDraw.Draw(b);rng=random.Random(46)
 for row,(label,bg) in enumerate([('Tmavé rušné pozadí','#181D21'),('Středně šedé rušné pozadí','#696B68'),('Světlé pozadí','#D9DDD6')]):
  y=45+row*195;d.rectangle((0,y,1100,y+170),fill=bg)
  for j in range(100):
   x=rng.randrange(1100);yy=y+rng.randrange(170);c=rng.choice(['#363E43','#849095','#B78060','#A2A8AA']);d.line((x,yy,x+70,yy-12),fill=c,width=rng.choice([1,2,5]))
  for col,lv in enumerate([0,14,15,30,45,60,75]):
   im=compose(MAN['corner'],lv);x=20+col*150;b.paste(im,(x,y+34),im);d.text((x,y+140),f'Level {lv} · 96 px',font=font(14),fill='#000000' if row==2 else '#FFFFFF')
  d.text((12,y-27),label,font=font(17),fill=P['cream'])
 save(b,'boards/corner-readability.png')
 poses=Image.new('RGB',(8*150,len(STATES)*160),P['graphite']);d=ImageDraw.Draw(poses)
 for r,(state,meta) in enumerate(STATES.items()):
  for j in range(8):
   idx=round(j*(meta['frameCount']-1)/7);im=compose(MAN['detail'],60,state,idx);poses.paste(im,(j*150,r*160+25),im)
  d.text((4,r*160+3),state,font=font(15),fill=P['apricot'])
 save(poses,'boards/animation-poses.png')

def icons():
 # Deliberately redrawn micro mark: wide basin / off-centre slit / three supports.
 def mark(n,tray=None):
  im=Image.new('RGBA',(n,n));d=ImageDraw.Draw(im);s=n/32
  def poly(ps,c):d.polygon([(round(x*s),round(y*s)) for x,y in ps],fill=c)
  ink=P['ink'];a=P['apricot'];light=P['light'];panel=P['panel']
  c=tray or a
  if not tray:d.rounded_rectangle((0,0,n-1,n-1),radius=round(6*s),fill=P['graphite'])
  poly([(7,25),(13,25),(13,29),(7,29)],c);poly([(20,25),(26,25),(26,29),(20,29)],c)
  poly([(6,5),(25,5),(28,8),(28,23),(25,26),(6,26),(3,23),(3,8)],c)
  poly([(7,11),(24,11),(24,20),(7,20)],(0,0,0,0) if tray else ink)
  for x in [11,19]:poly([(x,13),(x+2,13),(x+2,17),(x,17)],c if tray else light)
  if not tray:
   poly([(7,7),(24,7),(25,9),(6,9)],P['bone']);poly([(7,22),(23,22),(23,24),(7,24)],P['rust'])
  return im
 sizes={'32x32.png':32,'64x64.png':64,'128x128.png':128,'128x128@2x.png':256,'icon.png':512,'source.png':1024,'Square107x107Logo.png':107,'Square142x142Logo.png':142,'Square150x150Logo.png':150,'Square284x284Logo.png':284,'Square30x30Logo.png':30,'Square310x310Logo.png':310,'Square44x44Logo.png':44,'Square71x71Logo.png':71,'Square89x89Logo.png':89,'StoreLogo.png':50}
 for name,n in sizes.items():save(mark(n),'icon/tauri-icons/'+name)
 ico_sizes=[16,24,32,48,64,128,256]
 mark(256).save(ROOT/'icon/tauri-icons/icon.ico',sizes=[(n,n) for n in ico_sizes],append_images=[mark(n) for n in ico_sizes[:-1]])
 mark(1024).save(ROOT/'icon/tauri-icons/icon.icns')
 mark(64).save(ROOT/'icon/favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)],append_images=[mark(n) for n in [16,32,48]]);save(mark(32),'icon/favicon.png')
 for mode,c in [('light',P['cream']),('dark',P['ink'])]:
  for n in [16,32]:save(mark(n,c),f'icon/tray-{mode}-{n}.png')
 b=Image.new('RGB',(1080,520),P['graphite']);d=ImageDraw.Draw(b);d.text((28,20),'NÁVRH IKONY · Bedňák II / Windows kontexty',font=font(24),fill=P['cream'])
 for row,(bg,fg) in enumerate([('#202020','#F2EEE7'),('#F3F3F3','#101315')]):
  y=85+row*200;d.rectangle((20,y,1060,y+175),fill=bg);d.text((40,y+12),'Průzkumník · ARC Raiders Companion',font=font(18),fill=fg)
  for j,n in enumerate([16,32,48,64,128]):
   im=mark(n);b.paste(im,(45+j*145,y+48),im);d.text((45+j*145,y+145),f'{n} px',font=font(13),fill=fg)
  for j,n in enumerate([16,32]):
   im=mark(n,fg);b.paste(im,(820+j*80,y+70),im);d.text((800+j*80,y+120),f'Tray {n}',font=font(13),fill=fg)
 save(b,'icon/windows-contexts.png')

def validate():
 report={'variants':{},'scope':'Deterministic PNG/manifest tests; no native game overlay or browser execution claimed.'}
 for v,m in MAN.items():
  n=m['frameSize']['width'];changes=[];palette={tuple(bytes.fromhex(c[1:])) for c in P.values()};checked=0;clear=0;clipped=0
  for f in m['forms']:
   for st in list(f['states'].values())+[{**f['expressions'],'label':'Výrazy','durationsMs':[1]*8}]:
    assert len(st['frames'])==st['frameCount']==len(st['durationsMs'])
    im=Image.open(ROOT/st['file']);assert im.size==(n*st['frameCount'],n)
    for fr in st['frames']:
     assert set(fr['anchors'])==set(SLOTS);assert set(fr['zOrder'])==set(Z)
     # Check EVERY wearable variant against protected optic rectangle in each pose.
     if not fr['visible']:continue
     x1,y1,x2,y2=fr['opticClearance']
     for p in m['parts']:
      pi=PARTS[(v,p['id'])];pi=pi.crop((0,0,*p['frameSize'].values())) if p['slot']=='tag' else pi
      x,y=fr['anchors'][p['slot']];ox,oy=p['offset'];box=pi.getbbox()
      if box:
       if st['label'] not in ['Příchod','Odchod'] and (x+ox+box[0]<0 or y+oy+box[1]<0 or x+ox+box[2]>n or y+oy+box[3]>n):clipped+=1
       for xx in range(max(0,x1-x-ox),min(pi.width,x2-x-ox+1)):
        for yy in range(max(0,y1-y-oy),min(pi.height,y2-y-oy+1)):
         if pi.getpixel((xx,yy))[3]:clear+=1
      checked+=1
  for lv in range(1,76):
   u=m['unlocks'][lv];non=[p for p in u['unlockedParts'] if not p.startswith('tag-')];assert len(non)==1
   # Same target body, same tag number; remove newly equipped non-tag part.
   before=dict(u['defaultOutfit']);new=non[0];slot=next(p['slot'] for p in m['parts'] if p['id']==new);before[slot]=m['unlocks'][lv-1]['defaultOutfit'][slot]
   a=compose(m,lv,outfit=before);b=compose(m,lv);delta=sum(a.getpixel((x,y))!=b.getpixel((x,y)) for y in range(n) for x in range(n));assert delta>=3,(v,lv,delta);changes.append(delta)
  assert len({x['sha256'] for x in m['silhouetteValidation']})==5
  colors=set();alphas=set()
  for path in (ROOT/v).rglob('*.png'):
   im=Image.open(path).convert('RGBA');alphas.update(im.getchannel('A').getdata());colors.update(c[:3] for c in im.getdata() if c[3])
  assert alphas<={0,255};assert colors<=palette,(v,colors-palette)
  assert clear==0,(v,'optic overlaps',clear)
  assert clipped==0,(v,'clipped equipment',clipped)
  report['variants'][v]={'size':n,'forms':5,'parts':80,'nonTagUnlocks':75,'levelRows':76,'framesPerForm':sum(s['frameCount'] for s in STATES.values()),'expressionsPerForm':8,'transformFrames':40,'sparkleFrames':8,'paletteUsed':len(colors),'alphaValues':sorted(alphas),'partPoseChecks':checked,'opticOverlapPixels':clear,'clippedEquipmentOutsideEntryExit':clipped,'visibleUnlockPixels':changes,'uniqueLevelComposites':len({hashlib.sha256(compose(m,lv).tobytes()).hexdigest() for lv in range(76)})}
 dump(report,'tools/validation.json');print(json.dumps(report,ensure_ascii=True))

if __name__=='__main__':
 for v,n in [('corner',96),('detail',128)]:build_variant(v,n)
 board();icons();validate()
 for path in (ROOT/'detail').rglob('*.png'):
  if 'levels-256' in path.parts:continue
  im=Image.open(path);dest=Path('detail-256')/path.relative_to(ROOT/'detail');save(im.resize((im.width*2,im.height*2),Image.Resampling.NEAREST),dest)
 template=(ROOT/'tools/preview.template.html').read_text(encoding='utf-8')
 assets={}
 for m in MAN.values():
  paths=[s['file'] for f in m['forms'] for s in f['states'].values()]+[f['expressions']['file'] for f in m['forms']]+[p['file'] for p in m['parts']]+[t['file'] for t in m['transforms']]+[m['fx']['sparkle']['file']]
  for path in paths:assets[path]='data:image/png;base64,'+base64.b64encode((ROOT/path).read_bytes()).decode()
 (ROOT/'preview.html').write_text(template.replace('__MANIFESTS__',json.dumps(MAN,ensure_ascii=False)).replace('__ASSETS__',json.dumps(assets)),encoding='utf-8')


if __name__=="__main__":
 from finish import finish
 finish()
