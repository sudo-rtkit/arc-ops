"""Assemble the state sheet from exact browser exports. No app files changed."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT/'assets/fonts'
ui = ImageFont.truetype(str(FONT/'Inter.ttf'),16)
small = ImageFont.truetype(str(FONT/'Inter.ttf'),13)
head = ImageFont.truetype(str(FONT/'ChakraPetch-SemiBold.ttf'),30)
label = ImageFont.truetype(str(FONT/'JetBrainsMono.ttf'),16)
im = Image.new('RGB',(1800,1548),'#141719')
d = ImageDraw.Draw(im)
d.text((30,22),'OPS // OVERLAY — LIST STAVŮ',font=head,fill='#F2EEE7')
d.text((30,68),'Panel 1100 × 760 · exporty 1920 × 1080 · výřezy 1:2, detaily ovládání 1:1 · syntetická scéna',font=ui,fill='#A2A8AA')
states = [
    ('opacity-70','KRYTÍ 70 %','Nejvíc kontextu; text zůstává neprůhledný.'),
    ('opacity-90','KRYTÍ 90 % / VÝCHOZÍ','Rovnováha čitelnosti a matného skla.'),
    ('opacity-100','KRYTÍ 100 %','Plný grafit; pozadí se pod panelem neukazuje.'),
    ('focus','FOKUS / KLÁVESNICE','2px meruňkový obrys, odsazení 3 px.'),
    ('hover','HOVER / POTVRZENÍ','Světlejší meruňka, tmavý text akce.'),
    ('empty','PRÁZDNÝ STAV / ZE SNÍMKU','Jeden jasný krok: pořídit první snímek.'),
    ('error','CHYBA / BEZ INVENTÁŘE','Snímek zahozen, zásoba beze změny.'),
]
for i,(name,title,desc) in enumerate(states):
    x=30+(i%3)*590; y=112+(i//3)*460
    d.text((x,y),title,font=label,fill='#F4AD82')
    screenshot=Image.open(ROOT/f'states/{name}.png').convert('RGB')
    # Half-sized full panel plus 16px of surrounding context. Exact integer ratio.
    crop=screenshot.crop((394,144,1526,936)).resize((566,396),Image.Resampling.NEAREST)
    im.paste(crop,(x,y+28))
    d.text((x,y+432),desc,font=small,fill='#C8C7C2')

x,y=620,1032
d.text((x,y),'DETAIL FOKUSU / 1:1',font=label,fill='#F4AD82')
d.rectangle((x,y+28,x+566,y+424),fill='#1D2225')
focus=Image.open(ROOT/'states/focus.png').crop((558,238,690,318))
im.paste(focus,(x+30,y+75))
d.text((x+30,y+166),'Úkoly: aktivní záložka + klávesový fokus.',font=ui,fill='#F2EEE7')
d.text((x+30,y+210),'Fokus a aktivní podtržení jsou dva různé signály.',font=small,fill='#C8C7C2')
d.text((x+30,y+255),'Šipky ← → mění záložku. Esc zavírá konzoli.',font=small,fill='#A2A8AA')
d.text((x+30,y+290),'Měřítko 1:1; nejde o zvětšené písmo ani sprite.',font=small,fill='#A2A8AA')
d.text((x,y+432),'Stejný obrys také pro tlačítka, vstupy a posuvník.',font=small,fill='#C8C7C2')
x=1210
d.text((x,y),'DETAIL HOVERU / 1:1',font=label,fill='#F4AD82')
d.rectangle((x,y+28,x+566,y+424),fill='#1D2225')
normal=Image.open(ROOT/'capture.png').crop((979,765,1198,825))
hover=Image.open(ROOT/'states/hover.png').crop((979,765,1198,825))
d.text((x+30,y+65),'Běžný stav',font=small,fill='#A2A8AA'); im.paste(normal,(x+30,y+92))
d.text((x+30,y+180),'Ukazatel nad akcí',font=small,fill='#A2A8AA');im.paste(hover,(x+30,y+207))
d.text((x+30,y+316),'#F4AD82 → #FFC69F · text #241810',font=ui,fill='#F2EEE7')
d.text((x,y+432),'Rarity se při hoveru nepřebarvují na akční meruňku.',font=small,fill='#C8C7C2')
d.text((30,1510),'Samostatné stavy v plném rozlišení: states/*.png · Všechny položky, cíle a odměny jsou ilustrační data.',font=ui,fill='#A2A8AA')
im.save(ROOT/'states.png')
print('states.png: 1800 × 1548, seven states + two 1:1 details')
