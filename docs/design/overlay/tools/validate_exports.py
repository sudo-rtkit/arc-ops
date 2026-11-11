"""Inspect final design files without touching the application."""
from pathlib import Path
from PIL import Image
import json
import re

root=Path(__file__).resolve().parents[1]
for p in [root/'overview.png',root/'quests.png',root/'shopping.png',root/'capture.png',*sorted((root/'states').glob('*.png'))]:
    assert Image.open(p).size==(1920,1080),p
assert Image.open(root/'states.png').size==(1800,1548)
html=(root/'overlay.html').read_text(encoding='utf-8')
# Restrict to local asset paths, not nested SVG url(%23n) inside a data URI.
for url in re.findall(r"url\(['\"]?((?:assets/|\.\./buddy/)[^)'\"]+)['\"]?\)",html):
    if '${' not in url:  # Dynamic sprite paths are checked against the manifest below.
        assert (root/url).exists(),url
licenses=list((root/'assets/fonts').glob('*-OFL.txt'))
assert len(licenses)==3
for p in licenses:
    assert 'SIL OPEN FONT LICENSE' in p.read_text(encoding='utf-8')
validation=json.loads((root/'tools/render-validation.json').read_text(encoding='utf-8'))
assert validation['status']=='OK'
assert not validation['errors'] and not validation['remoteRequests']
assert len(validation['exports'])==11
buddy=json.loads((root.parent/'buddy/final/sprites.json').read_text(encoding='utf-8'))
for state in buddy['states'].values():
    assert (root.parent/'buddy/final'/state['file']).is_file()
assert '--overlay-w' in (root/'README.md').read_text(encoding='utf-8')
result={'exports':11,'dimensions':'OK','statesSheet':'1800x1548','localAssets':'OK','fontLicenses':3,
        'renderChecks':'OK','opsFrames':{k:v['frameCount'] for k,v in buddy['states'].items()}}
(root/'tools/export-validation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
