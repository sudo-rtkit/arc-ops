"""Verify default browser canvas pixels and eye clearance of every part/frame."""
from pathlib import Path
from PIL import Image, ImageChops
import json, sys
from build import ROOT, P, render, validate

data=json.loads((ROOT/'ops-layers.json').read_text(encoding='utf-8'))
validate(data)
for level in range(0 if '--eyes-only' in sys.argv else 76):
    expected=Image.new('RGBA',(64,64),P['graphite']);expected.alpha_composite(Image.open(ROOT/f'composite/level-{level:02}.png'))
    expected=expected.convert('RGB').resize((128,128),Image.Resampling.NEAREST)
    actual=Image.open(ROOT/f'tools/browser-proof/level-{level:02}.png').convert('RGB')
    assert actual.size==expected.size
    assert ImageChops.difference(expected,actual).getbbox() is None,level
checks=0
eye_colors={tuple(bytes.fromhex(P[k][1:])) for k in ['light','green','amber','danger']}
for f in data['forms']:
    for state,st in f['states'].items():
        body_sheet=Image.open(ROOT/st['file'])
        for index,meta in enumerate(st['frames']):
            body=body_sheet.crop((index*64,0,(index+1)*64,64))
            dx=meta['anchors']['visor'][0]-32;dy=meta['anchors']['visor'][1]-32
            eyes=[(x,y) for y in range(29+dy,36+dy) for x in range(21+dx,43+dx) if body.getpixel((x,y))[:3] in eye_colors]
            for part in data['parts']:
                outfit={part['slot']:part['id']};composite=render(data,f['id'],state,index,outfit,75)
                assert all(composite.getpixel(p)==body.getpixel(p) for p in eyes),(f['id'],state,index,part['id'])
                checks+=1
report={'result':'PASS','exactBrowserPixelComparisons':0 if '--eyes-only' in sys.argv else 76,'eyeClearanceComposites':checks,'method':'Default Edge file:// canvas screenshots versus Pillow reference, RGB on #141719; every part rendered on every body frame, eye pixels preserved.'}
(ROOT/'tools/pixel-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
