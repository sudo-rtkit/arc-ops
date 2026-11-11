"""Original Bedňák B layered art. Python 3 + Pillow; writes only layers/.
All geometry is integer pixel geometry, with no resampling except proof sheets.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
import json, hashlib

ROOT = Path(__file__).resolve().parents[1]
P = dict(outline='#101214', graphite='#141719', panel='#1D2225', dark='#272D31', steel='#596267', tin='#A2A8AA', cream='#F2EEE7', apricot='#F4AD82', light='#FFC69F', copper='#DE966F', rust='#B78060', green='#A8CB9A', amber='#E8C879', danger='#F09B9E')
O,D,M,T,C,A,H,R = [P[k] for k in ['outline','dark','steel','tin','cream','apricot','light','rust']]
FORMS = [('rookie','Začátečník','Rookie',0,14,20,43,24),('explorer','Průzkumník','Explorer',15,29,17,46,22),('scavenger','Mrchožrout','Scavenger',30,44,13,50,21),('veteran','Veterán','Veteran',45,59,11,52,20),('legend','Legenda','Legend',60,75,10,53,18)]
SLOTS = {'antenna':'Anténa','visor':'Hledí','armour':'Pancíř','backpack':'Batoh','tool':'Nářadí','badges':'Nášivky','paint':'Barva / záplaty','tag':'Štítek levelu'}
NAMES = {
'antenna':[('Drát s páskou','Taped wire'),('Ladicí vidlička','Tuning fork'),('Cívka ze šrotu','Scrap coil'),('Keramický snímač','Ceramic probe'),('Skládaný přijímač','Folded receiver')],
'visor':[('Holý rámeček','Bare rim'),('Páskovaný lem','Taped rim'),('Nýtované obočí','Riveted brow'),('Dvojitý kryt','Double guard'),('Keramický oblouk','Ceramic arch')],
'armour':[('Plechový lem','Tin edging'),('Přišitý plát','Stitched plate'),('Nýtované rohy','Riveted corners'),('Překryvné pláty','Overlapping plates'),('Keramické segmenty','Ceramic segments')],
'backpack':[('Látková kapsa','Cloth pocket'),('Srolovaná plachta','Rolled tarp'),('Přepravní klec','Salvage cage'),('Pouzdro na články','Cell case'),('Polní archiv','Field archive')],
'tool':[('Ohnutý klíč','Bent wrench'),('Měřicí hrot','Measuring probe'),('Kleště na šrot','Scrap pincers'),('Ruční cívka','Hand reel'),('Skládací měřidlo','Folding gauge')],
'badges':[('První steh','First stitch'),('Cesta domů','Way home'),('Tři nýty','Three rivets'),('Polní zápis','Field record'),('Archivář','Archivist')],
'paint':[('Kousek pásky','Tape scrap'),('Křížový steh','Cross stitch'),('Měděná oprava','Copper repair'),('Šablona skladu','Depot stencil'),('Krémová záplata','Cream patch')],
'tag':[('Kartónový štítek','Cardboard tag'),('Plechová cedulka','Tin tag'),('Nýtovaný štítek','Riveted tag'),('Smaltovaná tabulka','Enamel tag'),('Archivní štítek','Archive tag')]}
EXTRA = {
'shoulders':('Ramenní pláty',[('Plechová ramena','Tin shoulders'),('Páskové výztuhy','Taped braces'),('Svařované rohy','Welded corners'),('Těžké nárameníky','Heavy pauldrons'),('Keramická ramena','Ceramic shoulders')]),
'lamp':('Boční lampa',[('Kapesní žárovka','Pocket bulb'),('Krytá lucerna','Guarded lantern'),('Dvojitá kontrolka','Twin indicator'),('Polní svítilna','Field lamp'),('Meruňkový maják','Apricot beacon')]),
'cables':('Kabelový svazek',[('Volný vodič','Loose wire'),('Svázaný pár','Bound pair'),('Izolovaná smyčka','Insulated loop'),('Opletený svazek','Braided bundle'),('Kabelový hřeben','Cable comb')]),
'charm':('Přívěsek',[('Podložka','Washer'),('Starý klíček','Old key'),('Keramický střep','Ceramic shard'),('Svazek památek','Keepsake cluster'),('Polní trofeje','Field trophies')]),
'cape':('Plachta',[('Ustřižená látka','Cloth scrap'),('Malá plachta','Small tarp'),('Sešívaný závěs','Stitched drape'),('Záplatovaný přehoz','Patched cover'),('Archivářův plášť','Archivist mantle')]),
'fin':('Senzorová ploutev',[('Plechová lopatka','Tin vane'),('Děrovaný snímač','Perforated sensor'),('Dvojitá ploutev','Twin fin'),('Skládaný senzor','Folded sensor'),('Keramická korunka','Ceramic crest')]),
'belt':('Opasek',[('Látkový řemen','Cloth strap'),('Poutka na nástroje','Tool loops'),('Nýtovaný pás','Riveted belt'),('Kazetový opasek','Cassette belt'),('Polní zásobník','Field carrier')]),
'radio':('Vysílačka',[('Krystalový přijímač','Crystal receiver'),('Ladicí skříňka','Tuning box'),('Šrotové rádio','Scrap radio'),('Polní stanice','Field station'),('Archivní vysílač','Archive transmitter')])}
for slot,(label,names) in EXTRA.items(): SLOTS[slot]=label;NAMES[slot]=names
CURRENT=json.loads((ROOT.parent/'final/sprites.json').read_text(encoding='utf-8'))
STATES={s:{k:v for k,v in x.items() if k in ['label','frameCount','durationsMs','loop','returnTo']} for s,x in CURRENT['states'].items()}
Z={'backpack':12,'body':10,'paint':20,'armour':30,'visor':40,'badges':50,'tag':60,'tool':70,'antenna':80}
Z.update(cape=1,shoulders=32,lamp=85,cables=35,charm=86,fin=81,belt=45,radio=36)
DIGITS=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111']

def blank(w=64,h=64): return Image.new('RGBA',(w,h))
def save(im,path):
    p=ROOT/path; p.parent.mkdir(parents=True,exist_ok=True); im.save(p)
def plate(d,box,fill,outline=O):
    d.rectangle(box,fill=outline)
    x,y,r,b=box
    if r-x>1 and b-y>1:d.rectangle((x+1,y+1,r-1,b-1),fill=fill)
def line(d,xy,fill):d.line(xy,fill=fill,width=1)
def pose(state,i):
    dx=([-1,0,1,1,0,-1,-1,0][i] if state=='scanning' else ([0,-1,0,1,0][i] if state=='unsure' else 0))
    dy=({'idle':[0,-1,-1,0,0,0,0,0],'done':[0,-2,-3,-1,0],'sleeping':[0,0,1,1,0,0],'alert':[0,-2,-1,0],'drag':[-3,-2]}.get(state,[0]*8))[i]
    return dx,dy

def body(form,state,i):
    fid,cs,en,lo,hi,l,r,top=form; tier=lo//15
    im=blank();d=ImageDraw.Draw(im); dx,dy=pose(state,i)
    # Independently articulated side mounts, feet and box; one logical pixel contour.
    handlift=(-5 if state=='done' and i in [1,2] else -2 if state=='alert' else 2 if state=='drag' else 0)
    # Permanent silhouette architecture, independent of wardrobe layers.
    if tier==1:
        plate(d,(9,31,19,46),R);plate(d,(18,9,20,25),M);plate(d,(16,8,22,12),D)
    if tier==2:
        d.polygon([(8,30),(11,22),(20,24),(19,43),(7,48)],fill=O)
        d.polygon([(9,30),(12,24),(18,25),(17,42),(9,46)],fill=R)
        plate(d,(45,20,54,29),M);line(d,(47,21,52,21),T)
    if tier==3:
        for x in [5,45]:
            d.polygon([(x,24),(x+4,18),(x+13,20),(x+14,31),(x,31)],fill=O)
            d.polygon([(x+1,24),(x+5,20),(x+12,21),(x+13,29),(x+1,29)],fill=D)
            line(d,(x+3,23,x+10,23),T)
    if tier==4:
        d.polygon([(12,21),(49,21),(56,31),(60,54),(52,52),(47,57),(14,56),(4,54),(8,33)],fill=O)
        d.polygon([(13,22),(48,22),(54,32),(58,52),(51,50),(46,55),(15,54),(6,52),(10,34)],fill=R)
        for x in [9,53]:line(d,(x,35,x-2 if x<32 else x+2,49),M)
    for x in [l+5,r-11]:
        plate(d,(x,48,x+7,57+(1 if state=='drag' else 0)),D)
        line(d,(x+1,54,x+5,54),T)
        if tier>=3:line(d,(x+1,56,x+6,56),P['copper'])
    plate(d,(l-6,31,l,45),M);plate(d,(r,31+handlift,r+6,45+handlift),M)
    d.rectangle((l-4,34,l-2,39),fill=R);d.rectangle((r+2,34+handlift,r+4,39+handlift),fill=R)
    d.polygon([(l+4,top),(r-4,top),(r,top+4),(r,47),(r-4,51),(l+4,51),(l,47),(l,top+4)],fill=O)
    d.polygon([(l+4,top+1),(r-4,top+1),(r-1,top+4),(r-1,47),(r-4,50),(l+4,50),(l+1,47),(l+1,top+4)],fill=M)
    d.rectangle((l+2,top+6,r-2,43),fill=T)
    line(d,(l+4,top+1,r-4,top+1),C)
    d.rectangle((l+3,41,r-3,47),fill=R)
    line(d,(l+4,41,r-4,41),P['copper'])
    d.rectangle((29,42,34,44),fill=D); d.point((34,42),fill=A)
    # Signature visor and paired eyes stay on the body; equipment is an open rim.
    d.rectangle((l+3,25,r-3,39),fill=O);d.rectangle((l+4,26,r-4,38),fill=D)
    eye=P['amber'] if state=='scanning' else P['green'] if state=='done' else P['danger'] if state=='alert' and i<3 else H
    for x in [23,37]:
        if state=='sleeping' or state=='idle' and i==5:line(d,(x-1,35,x+3,35),M if state=='sleeping' else eye)
        elif state=='done':line(d,[(x-1,33),(x,31),(x+2,31),(x+3,33)],eye)
        elif state=='unsure' and i in [1,2,3]:line(d,(x-1,32,x+3,32),eye)
        else:d.rectangle((x,32 if state=='idle' and i in [4,6] else 29,x+2,35),fill=eye)
    if state=='scanning':
        x=l+5+[0,3,6,10,15,20,15,6][i];line(d,(x,27,x,37),P['amber']);d.point((x,27),fill=C)
    # Structural evolution changes the actual shell and undercarriage, even naked.
    for n in range(tier):
        x=l+3+n*3; line(d,(x,top+3,x+1,top+3),D)
    if tier>=1:plate(d,(l,44,l+4,49),D)
    if tier>=2:plate(d,(r-4,43,r,49),D);line(d,(r-3,44,r-1,44),P['copper'])
    if tier>=3:
        for x in [l+1,r-4]:plate(d,(x,top+3,x+3,25),D)
    if tier==4:
        line(d,(l+5,top+3,r-5,top+3),P['copper']);d.point((r-3,47),fill=C)
        for x in [l+2,r-2]:line(d,(x,28,x,39),A);d.point((x,28),fill=H)
        for x,y in [(8,47),(54,49)]:plate(d,(x,y,x+3,y+4),T);d.point((x+1,y+2),fill=A)
    if tier==1:plate(d,(43,28,47,34),D);d.point((45,30),fill=A)
    if tier>=3:line(d,[(l+4,26),(l+6,28),(l+5,30)],R);line(d,(l+4,27,l+7,27),T)
    if tier==0:
        # Small naked crate: trim the lower shell and shorten side handles.
        d.rectangle((0,49,63,63),fill=(0,0,0,0))
        for x in [23,35]:plate(d,(x,48,x+5,54),D);line(d,(x+1,52,x+4,52),T)
    out=blank();out.paste(im,(dx,dy))
    anchors={'antenna':[23+dx,top+1+dy],'visor':[32+dx,32+dy],'backpack':[15+dx,33+dy],'tool':[r+4+dx,38+handlift+dy],'armour':[32+dx,43+dy],'badges':[l+8+dx,44+dy],'paint':[r-8+dx,43+dy],'tag':[32+dx,48+dy]}
    anchors.update({slot:[x+dx,y+dy] for slot,(x,y) in {'shoulders':(32,23),'lamp':(l-4,36),'cables':(r-1,43),'charm':(r+4,48),'cape':(32,30),'fin':(40,22),'belt':(32,52),'radio':(l-5,44)}.items()})
    # Tiny state marks stay in a reserved upper-right area, clear of equipment.
    dd=ImageDraw.Draw(out)
    marks={'done':['001','001','101','110'],'unsure':['110','001','010','000','010'],'sleeping':['111','001','010','100','111'],'alert':['1','1','1','0','1']}
    if state in marks and (i or state=='alert'):
        color=P['green'] if state=='done' else P['danger'] if state=='alert' else T if state=='sleeping' else P['amber']
        for yy,row in enumerate(marks[state]):
            for xx,c in enumerate(row):
                if c=='1':dd.rectangle((53+xx,5+yy,55+xx,7+yy),fill=O)
        for yy,row in enumerate(marks[state]):
            for xx,c in enumerate(row):
                if c=='1':dd.point((54+xx,6+yy),fill=color)
    return out,{'anchors':anchors,'zOrder':dict(Z)}

def part(slot,v,form):
    _,_,_,lo,_,l,r,top=form; w=r-l-4
    im=blank(48,32);d=ImageDraw.Draw(im); offset=[-24,-16]
    # Use anchor origin (24,16); each slot has its own compact logical canvas.
    if slot=='antenna':
        plate(d,(22,13,27,18),D)
        if v==0:line(d,[(24,13),(24,6),(21,3)],O);line(d,(24,7,25,7),A)
        elif v==1:
            plate(d,(23,3,25,13),M);line(d,[(19,3),(19,0),(29,0),(29,3)],O);line(d,(20,1,28,1),R)
        elif v==2:
            plate(d,(23,2,25,13),R)
            for y in [3,6,9]:plate(d,(20,y,28,y+2),M)
        elif v==3:
            plate(d,(23,0,26,13),M);plate(d,(20,0,29,6),C);d.rectangle((22,2,27,3),fill=P['amber'])
        else:
            plate(d,(23,1,26,13),R);plate(d,(18,0,30,6),D);line(d,(19,1,29,1),C);plate(d,(20,7,28,10),M)
    elif slot=='visor':
        left=24-w//2-2;right=24+(w+1)//2+1
        # Never cover the eye aperture (relative y -5..+5).
        plate(d,(left,8,right,10),[M,R,D,M,C][v]);line(d,(left,9,right,9),[T,A,T,R,C][v])
        for x in [left,right]:line(d,(x,10,x,23),O)
        if v>=1:line(d,(left+1,10,left+3,12),A)
        if v>=2:
            for x in range(left+5,right-2,6):d.point((x,9),fill=C)
        if v>=3:line(d,(left,23,right,23),M)
        if v==4:
            for x in [left+2,right-3]:plate(d,(x,11,x+2,12),C)
    elif slot=='armour':
        left=24-w//2-1;right=left+w+1
        for x in [left,right-4]:
            plate(d,(x,13,x+4,21),[M,R,D,D,C][v]);line(d,(x+1,14,x+3,14),[T,A,M,T,A][v])
            if v>=2:d.point((x+2,19),fill=T)
        if v>=1:line(d,(left+4,21,right-4,21),D)
        if v>=3:line(d,(left+5,22,right-5,22),M)
        if v==4:
            for x in range(left+5,right-4,5):line(d,(x,21,x+2,21),C)
    elif slot=='backpack':
        plate(d,(12,10,24,29),[R,M,D,D,M][v]);line(d,(14,11,21,11),T)
        plate(d,(14,15,22,25),D if v>1 else R)
        line(d,(16,12,16,27),A if v<2 else M)
        if v==1:plate(d,(10,6,23,12),M);line(d,(12,8,21,8),T)
        if v==2:
            for y in [15,19,23]:line(d,(13,y,22,y),T)
        if v==3:
            for x in [14,19]:plate(d,(x,14,x+3,25),R);d.point((x+1,15),fill=P['green'])
        if v==4:plate(d,(12,5,22,13),C);line(d,(14,8,20,8),D);line(d,(14,10,18,10),R)
    elif slot=='tool':
        plate(d,(23,13,25,28),R);line(d,(24,16,24,25),A)
        if v==0:
            line(d,[(21,8),(21,12),(27,12),(27,8)],O);line(d,(22,11,26,11),T);plate(d,(23,11,25,17),M)
        elif v==1:plate(d,(23,2,25,16),M);d.point((24,3),fill=P['amber'])
        elif v==2:
            line(d,[(20,6),(22,13),(26,13),(28,6)],O);line(d,(21,8,23,14),T);line(d,(27,8,25,14),T)
        elif v==3:plate(d,(20,7,29,17),M);plate(d,(22,9,27,15),R);line(d,(24,10,24,14),O)
        else:
            plate(d,(20,5,23,17),C);plate(d,(24,7,27,17),M)
            for y in [7,10,13]:d.point((21,y),fill=D)
    elif slot=='badges':
        plate(d,(21,14,27,19),[R,M,D,R,C][v])
        patterns=[[(23,16),(25,17)],[(23,17),(24,16),(25,15)],[(22,16),(24,16),(26,16)],[(23,15),(23,17),(25,17)],[(23,15),(25,15),(24,17)]]
        for pt in patterns[v]:d.point(pt,fill=D if v==4 else C)
    elif slot=='paint':
        if v==0:plate(d,(22,14,28,17),R);line(d,(23,15,27,15),A)
        elif v==1:
            line(d,(21,13,27,19),O);line(d,(21,19,27,13),O);line(d,(22,14,26,18),C);line(d,(22,18,26,14),R)
        elif v==2:plate(d,(20,13,28,19),R);line(d,(21,14,27,14),P['copper']);d.point((21,18),fill=T);d.point((27,18),fill=T)
        elif v==3:
            for x,y in [(21,14),(23,14),(25,14),(21,16),(25,16),(23,18)]:line(d,(x,y,x+1,y),C)
        else:
            plate(d,(21,13,28,19),C);line(d,(23,14,23,18),R);d.point((27,18),fill=D)
    elif slot=='shoulders':
        reach=min(23,(r-l)//2+3)
        for x in [24-reach,24+reach-7]:
            plate(d,(x,12-v//2,x+7,19),[R,M,D,M,C][v]);line(d,(x+1,13-v//2,x+6,13-v//2),[A,T,R,C,A][v])
            for n in range(v):d.point((x+1+n,18),fill=T)
    elif slot=='lamp':
        plate(d,(21,11,27,20),[R,D,M,D,C][v]);plate(d,(22,12,26,17),A if v%2==0 else P['amber'])
        if v==1:line(d,(23,12,23,17),D)
        if v==2:line(d,(22,15,26,15),D)
        if v>=3:line(d,(24,12,24,16),H);plate(d,(20,19,28,21),M)
        d.point((22+v,19),fill=C)
    elif slot=='cables':
        for n in range(1+v//2):
            x=22+n;line(d,[(x,12),(x+3,14),(x+3,21),(x,23)],O);line(d,[(x,13),(x+2,15),(x+2,20),(x,22)],[R,A,T][n])
        line(d,(21,16+v%3,28,16+v%3),M)
    elif slot=='charm':
        line(d,(24,12,24,18),O);line(d,(25,12,25,18),R)
        plate(d,(23,18,27,22+v%2),[T,R,C,M,A][v]);d.point((25,20),fill=O)
        if v>=2:plate(d,(21,21,24,25),R);d.point((22,22),fill=C)
        if v>=3:plate(d,(26,24,29,28),C);d.point((27,25),fill=A)
        if v==4:line(d,(21,26,27,26),M)
    elif slot=='cape':
        # Local art needs a 64x64 canvas; origin remains (24,16).
        im=blank(64,48);d=ImageDraw.Draw(im)
        half=(r-l)//2+5+v//2;left=max(0,24-half);right=min(47,24+half)
        d.polygon([(left+4,10),(right-4,10),(right,39+v),(right-5,37+v),(right-8,42+v),(left+3,40+v),(left,37)],fill=O)
        d.polygon([(left+5,11),(right-5,11),(right-1,37+v),(right-5,35+v),(right-9,40+v),(left+4,38+v),(left+1,36)],fill=[R,M,R,D,M][v])
        for x in [left+2,right-3]:line(d,(x,22,x+1,34+v),T if v%2 else P['copper'])
        for n in range(v+1):d.point((left+3+n*2,37+v),fill=C)
    elif slot=='fin':
        d.polygon([(22,17),(22,6-v),(27+v,4),(28,17)],fill=O)
        d.polygon([(23,16),(23,7-v),(26+v,6),(27,16)],fill=[R,T,M,D,C][v])
        for y in range(8,15,2):d.point((24+v%2,y),fill=A if v>1 else D)
    elif slot=='belt':
        half=(r-l)//2-3
        plate(d,(24-half,13,24+half,17),[R,M,D,R,C][v])
        for x in range(25-half,24+half,5):
            plate(d,(x,15,x+3,20),[D,R,M,D,R][v]);d.point((x+1,16),fill=T if v%2 else A)
        plate(d,(23,13,26,17),T if v<3 else A)
        d.point((24+v%2,14+v%3),fill=O)
    elif slot=='radio':
        plate(d,(21,10,27,22),[R,M,D,M,C][v]);line(d,(22,12,26,12),A)
        for y in [15,17,19]:line(d,(22,y,24+v%3,y),D if v==4 else T)
        d.point((26,20-v),fill=P['green']);line(d,(22,6-v,22,10),O)
    elif slot=='tag':
        # Numbered 13×9 tiles, 76 frames, one style per catalogue variant.
        sheet=blank(13*76,9)
        for level in range(76):
            tile=blank(13,9);td=ImageDraw.Draw(tile);plate(td,(0,0,12,8),[R,T,M,C,A][v]);td.point((1,1),fill=C)
            for digit,char in enumerate(f'{level:02}'):
                for index,bit in enumerate(DIGITS[int(char)]):
                    if bit=='1':td.point((3+digit*4+index%3,2+index//3),fill=O)
            sheet.paste(tile,(level*13,0))
        return sheet,[-6,-3]
    bbox=im.getbbox();im=im.crop(bbox);offset=[bbox[0]-24,bbox[1]-16]
    return im,offset

def sheet(frames):
    out=blank(64*len(frames),64)
    for i,im in enumerate(frames):out.paste(im,(64*i,0))
    return out

def resolve(p,fid):return p.get('forms',{}).get(fid,{'file':p['file'],'offset':p['offset']})
def render(data,fid,state,index,outfit,level):
    form=next(f for f in data['forms'] if f['id']==fid);st=form['states'][state];meta=st['frames'][index]
    out=blank()
    for slot in sorted(Z,key=Z.get):
        if slot=='body':
            im=Image.open(ROOT/st['file']);out.alpha_composite(im.crop((64*index,0,64*(index+1),64)))
        elif outfit.get(slot):
            p=next(p for p in data['parts'] if p['id']==outfit[slot]); asset=resolve(p,fid);im=Image.open(ROOT/asset['file'])
            if slot=='tag':im=im.crop((13*level,0,13*(level+1),9))
            x,y=meta['anchors'][slot];ox,oy=asset['offset'];out.alpha_composite(im,(x+ox,y+oy))
    return out

def build():
    data={'version':1,'character':'Ops / Bedňák B','frameSize':{'width':64,'height':64},'layout':'horizontal','palette':P,'slots':SLOTS,'drawOrder':list(sorted(Z,key=Z.get)),'states':STATES,'forms':[],'parts':[],'unlocks':[],'transforms':[]}
    for form in FORMS:
        fid,cs,en,lo,hi,*_=form;item={'id':fid,'name':{'cs':cs,'en':en},'levels':[lo,hi],'states':{}}
        for state,spec in STATES.items():
            frames=[];metadata=[]
            for i in range(spec['frameCount']):
                im,meta=body(form,state,i);frames.append(im);metadata.append(meta)
            file=f'bodies/{fid}/{state}.png';save(sheet(frames),file)
            item['states'][state]={**spec,'file':file,'frames':metadata}
        data['forms'].append(item)
    for slot in SLOTS:
        for v,names in enumerate(NAMES[slot]):
            im,offset=part(slot,v,FORMS[0]);file=f'parts/{slot}/{slot}-{v+1}.png';save(im,file)
            entry={'id':f'{slot}-{v+1}','slot':slot,'variant':v+1,'name':dict(zip(['cs','en'],names)),'file':file,'offset':offset}
            if slot=='tag':entry.update(frameSize={'width':13,'height':9},frameCount=76,frameSource='playerLevel',levelRange=[0,75])
            if slot in ['visor','armour','paint','shoulders','cape','belt']:
                entry['forms']={}
                for f in FORMS[1:]:
                    im,off=part(slot,v,f);fp=f'parts/{slot}/{slot}-{v+1}-{f[0]}.png';save(im,fp);entry['forms'][f[0]]={'file':fp,'offset':off}
            data['parts'].append(entry)
    # Exactly one previously locked NON-TAG part at every level 1..75.
    progression=[s for s in SLOTS if s!='tag']
    schedule={1+j:(slot,v) for j,(v,slot) in enumerate((v,s) for v in range(1,6) for s in progression)}
    outfit={slot:None for slot in SLOTS}
    for level in range(76):
        unlocked=[]
        if level in schedule:
            slot,v=schedule[level];outfit[slot]=f'{slot}-{v}';unlocked.append(outfit[slot])
        if level in [15,30,45,60,75]:
            outfit['tag']=f'tag-{[15,30,45,60,75].index(level)+1}';unlocked.append(outfit['tag'])
        fid=next(f[0] for f in FORMS if f[3]<=level<=f[4])
        event={'level':level,'form':fid,'unlockedParts':unlocked,'swaps':[{'slot':'tag','part':outfit['tag'],'number':level}] if outfit['tag'] else [],'defaultOutfit':dict(outfit),'label':f'Level {level}: '+(' / '.join(next(p['name']['cs'] for p in data['parts'] if p['id']==u) for u in unlocked) if unlocked else 'holá základní bedýnka')}
        if level in [15,30,45,60]:event['transformation']=f'{FORMS[level//15-1][0]}-to-{fid}'
        data['unlocks'].append(event)
        save(render(data,fid,'idle',0,outfit,level),f'composite/level-{level:02}.png')
    for a,b in zip(FORMS,FORMS[1:]):
        ims=[]
        old,_=body(a,'idle',0);new,_=body(b,'idle',0)
        for i in range(10):
            cut=64-round(i*64/9);im=old.copy();im.paste(new.crop((0,cut,64,64)),(0,cut))
            if 0<i<9:
                d=ImageDraw.Draw(im);line(d,(10,cut,53,cut),A)
                for x in [8,55]:line(d,(x,cut-1,x,cut+1),C)
            ims.append(im)
        file=f'transform/{a[0]}-to-{b[0]}.png';save(sheet(ims),file)
        data['transforms'].append({'id':f'{a[0]}-to-{b[0]}','from':a[0],'to':b[0],'file':file,'frameCount':10,'durationsMs':[100]*10,'loop':False,'returnTo':'idle','equipment':'hidden during transformation; restore target outfit on completion'})
    sparks=[]
    for i in range(6):
        im=blank();d=ImageDraw.Draw(im)
        if i<5:
            for x,y in [(9-i,23-i),(52+i,18-i),(50+i,48+i)]:
                rad=[1,2,3,2,1][i];line(d,(x-rad,y,x+rad,y),O);line(d,(x,y-rad,x,y+rad),O)
                if rad>1:line(d,(x-rad+1,y,x+rad-1,y),C);line(d,(x,y-rad+1,x,y+rad-1),A)
                else:d.point((x,y),fill=A)
        sparks.append(im)
    save(sheet(sparks),'fx/sparkle.png');data['fx']={'sparkle':{'file':'fx/sparkle.png','frameCount':6,'durationsMs':[90,90,90,100,100,130],'loop':False,'returnTo':None,'z':100}}
    (ROOT/'ops-layers.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Offline preview uses an exact embedded copy, avoiding file:// fetch restrictions.
    template=(ROOT/'tools/preview.template.html').read_text(encoding='utf-8')
    (ROOT/'preview.html').write_text(template.replace('__MANIFEST__',json.dumps(data,ensure_ascii=False)),encoding='utf-8')
    contact=Image.new('RGB',(8*144,10*166),P['graphite']);d=ImageDraw.Draw(contact)
    for level,e in enumerate(data['unlocks']):
        x=level%8*144;y=level//8*166;im=render(data,e['form'],'idle',0,e['defaultOutfit'],level).resize((128,128),Image.Resampling.NEAREST);contact.paste(im,(x+8,y+5),im);d.text((x+15,y+138),f'{level:02} / {e["form"]}',fill=C)
    save(contact,'composite/all-levels.png')
    # Naked bodies, then boundary default outfits: actual black alpha masks.
    silhouettes=Image.new('RGB',(5*192,2*218),C);sd=ImageDraw.Draw(silhouettes)
    silhouette_stats=[]
    for fi,f in enumerate(data['forms']):
        for row in range(2):
            e=data['unlocks'][f['levels'][0]]
            im=render(data,f['id'],'idle',0,e['defaultOutfit'] if row else {},e['level'])
            mask=im.getchannel('A');black=Image.new('RGBA',(64,64),'#000000');black.putalpha(mask)
            silhouettes.paste(black.resize((192,192),Image.Resampling.NEAREST),(fi*192,row*218),black.resize((192,192),Image.Resampling.NEAREST))
            sd.text((fi*192+6,row*218+196),f'{f["id"]} / '+('outfit' if row else 'body'),fill=O)
            if not row:silhouette_stats.append({'form':f['id'],'bbox':mask.getbbox(),'opaquePixels':sum(v>0 for v in mask.get_flattened_data()),'sha256':hashlib.sha256(mask.tobytes()).hexdigest()})
    save(silhouettes,'composite/silhouettes.png')
    data['silhouetteValidation']=silhouette_stats
    (ROOT/'ops-layers.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'preview.html').write_text(template.replace('__MANIFEST__',json.dumps(data,ensure_ascii=False)),encoding='utf-8')
    # All forms × states, and every wardrobe variant × form: human review assets.
    proof=Image.new('RGB',(8*128,5*7*144),P['panel']);pd=ImageDraw.Draw(proof)
    for fi,f in enumerate(data['forms']):
        e=data['unlocks'][f['levels'][0]]
        for si,(state,st) in enumerate(f['states'].items()):
            row=(fi*7+si)*144
            for i in range(st['frameCount']):
                im=render(data,f['id'],state,i,e['defaultOutfit'],e['level']).resize((128,128),Image.Resampling.NEAREST);proof.paste(im,(i*128,row),im)
            pd.text((4,row+128),f'{f["id"]} / {state}',fill=C)
    save(proof,'composite/animation-proof.png')
    overview=Image.new('RGB',(640,7*154),P['panel']);od=ImageDraw.Draw(overview)
    for fi,f in enumerate(data['forms']):
        for si,(state,st) in enumerate(f['states'].items()):
            index=min(2,st['frameCount']-1);im=proof.crop((index*128,(fi*7+si)*144,(index+1)*128,(fi*7+si)*144+128))
            overview.paste(im,(fi*128,si*154));od.text((fi*128+3,si*154+129),f'{f["id"]} / {state}',fill=C)
    save(overview,'composite/states-overview.png')
    wardrobe=Image.new('RGB',(5*128,len(data['parts'])*144),P['panel']);wd=ImageDraw.Draw(wardrobe)
    for pi,p in enumerate(data['parts']):
        for fi,f in enumerate(data['forms']):
            outfit={s:None for s in SLOTS};outfit[p['slot']]=p['id'];im=render(data,f['id'],'idle',0,outfit,75).resize((128,128),Image.Resampling.NEAREST);wardrobe.paste(im,(fi*128,pi*144),im)
        wd.text((4,pi*144+128),p['id'],fill=C)
    save(wardrobe,'composite/wardrobe-proof.png')
    validate(data)

def validate(data):
    colors=set();files=0
    for path in list((ROOT/'bodies').rglob('*.png'))+list((ROOT/'parts').rglob('*.png'))+list((ROOT/'transform').glob('*.png'))+list((ROOT/'fx').glob('*.png')):
        im=Image.open(path).convert('RGBA');pixels=list(im.get_flattened_data());assert {p[3] for p in pixels}<={0,255},path
        colors.update(p[:3] for p in pixels if p[3]);files+=1
    palette={tuple(bytes.fromhex(c[1:])) for c in P.values()};assert colors<=palette
    checks=0
    for f in data['forms']:
        for state,st in f['states'].items():
            assert Image.open(ROOT/st['file']).size==(64*st['frameCount'],64)
            assert len(st['frames'])==len(st['durationsMs'])==st['frameCount']
            for frame in st['frames']:
                assert set(frame['anchors'])==set(SLOTS)
                for p in data['parts']:
                    asset=resolve(p,f['id']);im=Image.open(ROOT/asset['file']);w,h=(13,9) if p['slot']=='tag' else im.size
                    x,y=frame['anchors'][p['slot']];ox,oy=asset['offset'];assert 0<=x+ox and 0<=y+oy and x+ox+w<=64 and y+oy+h<=64,(f['id'],state,p['id'],x,y,asset)
                    checks+=1
    hashes=[]
    for e in data['unlocks']:
        assert e['level']==0 or any(not p.startswith('tag-') for p in e['unlockedParts']);assert set(e['defaultOutfit'])==set(SLOTS)
        im=Image.open(ROOT/f'composite/level-{e["level"]:02}.png');hashes.append(hashlib.sha256(im.tobytes()).hexdigest())
    assert len(set(hashes))==76
    unlocked=set()
    for e in data['unlocks']:
        unlocked.update(e['unlockedParts']);assert {p for p in e['defaultOutfit'].values() if p}<=unlocked
    assert unlocked=={p['id'] for p in data['parts']}
    assert all(v is None for v in data['unlocks'][0]['defaultOutfit'].values())
    visible=[]
    for e in data['unlocks'][1:]:
        previous=dict(data['unlocks'][e['level']-1]['defaultOutfit']);previous['tag']=e['defaultOutfit']['tag']
        before=render(data,e['form'],'idle',0,previous,e['level'])
        after=render(data,e['form'],'idle',0,e['defaultOutfit'],e['level'])
        changed=sum(a!=b for a,b in zip(before.get_flattened_data(),after.get_flattened_data()))
        assert changed>=3,('invisible unlock',e['level'],e['unlockedParts'],changed)
        visible.append({'level':e['level'],'parts':[p for p in e['unlockedParts'] if not p.startswith('tag-')],'changedPixelsExcludingTagAndForm':changed})
    report={'forms':5,'bodyFrames':190,'bodySheets':35,'slots':len(SLOTS),'parts':len(data['parts']),'partFiles':len(list((ROOT/'parts').rglob('*.png'))),'numberedTagTiles':380,'unlockEvents':76,'newPartUnlocks':80,'nonTagUnlockLevels':75,'level0Plain':True,'visibleUnlocks':visible,'silhouettes':data['silhouetteValidation'],'transformFrames':40,'sparkleFrames':6,'paletteColorsUsed':len(colors),'paletteColorsAllowed':len(P),'alpha':[0,255],'partAnchorBoundsChecks':checks,'uniqueDefaultComposites':len(set(hashes)),'pngAssetsChecked':files,'result':'PASS'}
    assert len({x['sha256'] for x in data['silhouetteValidation']})==5
    assert all(a['opaquePixels']<b['opaquePixels'] for a,b in zip(data['silhouetteValidation'],data['silhouetteValidation'][1:]))
    (ROOT/'tools/validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ['visibleUnlocks','silhouettes']}))

if __name__=='__main__':build()



