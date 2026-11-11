"""Offline graphic mockup builder. Writes only docs/design/overlay/."""
from pathlib import Path
import json
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
FONTS = ROOT/'assets/fonts'
FONTS.mkdir(parents=True, exist_ok=True)
for family, filename in [('chakrapetch','ChakraPetch-SemiBold.ttf'),('inter','Inter[opsz,wght].ttf'),('jetbrainsmono','JetBrainsMono[wght].ttf')]:
    for remote, local in [(filename,filename.replace('[opsz,wght]','').replace('[wght]','')),('OFL.txt',family+'-OFL.txt')]:
        dest = FONTS/local
        if not dest.exists():
            url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'+family+'/'+urllib.request.quote(remote)
            dest.write_bytes(urllib.request.urlopen(url,timeout=40).read())
tokens = (REPO/'src/ui/tokens.css').read_text(encoding='utf-8')
sprites = (ROOT.parent/'buddy/final/sprites.json').read_text(encoding='utf-8')
html = (ROOT/'tools/overlay.template.html').read_text(encoding='utf-8')
(ROOT/'overlay.html').write_text(html.replace('/*APP_TOKENS*/',tokens).replace('/*SPRITES*/',sprites),encoding='utf-8')

# Original synthetic environment: vector construction, no screenshots or game art.
svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs>
<linearGradient id="sky" x2="0" y2="1"><stop stop-color="#8b938b"/><stop offset=".65" stop-color="#b5ac94"/><stop offset="1" stop-color="#706d5d"/></linearGradient>
<linearGradient id="floor" x2=".3" y2="1"><stop stop-color="#767463"/><stop offset="1" stop-color="#343d3c"/></linearGradient>
<filter id="soft"><feGaussianBlur stdDeviation="2.4"/></filter>
<radialGradient id="vignette"><stop offset=".2" stop-color="#10191b" stop-opacity="0"/><stop offset="1" stop-color="#0b1417" stop-opacity=".65"/></radialGradient>
</defs><g filter="url(#soft)"><path fill="url(#sky)" d="M0 0h1920v1080H0z"/>
<circle cx="1330" cy="275" r="155" fill="#d9ccaa" opacity=".24"/>
<path fill="#777d71" d="M0 530l170-90 150 50 110-95 110 20 120-50 200 90 100-75 130 50 130-50 160 25 100-60 160 90 180-40v350H0z"/>
<path fill="#575f59" d="M0 650l180-100 210 25 180-75 160 50 200-35 100 70 240-30 170 50 150-40 330 40v485H0z"/>
<path fill="url(#floor)" d="M0 760l1050-180 870 160v340H0z"/>
<path fill="#3a4544" d="M-40 70l440 60 75 636-475 110z"/><path fill="#59625a" d="M35 145l270 36 45 500-290 62z"/>
<path fill="#232f31" d="M80 240l190 15 12 140-190-2zM99 441l190-4 10 168-183 27z"/>
<path stroke="#8e8975" stroke-width="18" fill="none" d="M-30 530l395-40 6 126M344 170l37 545"/>
<path stroke="#394342" stroke-width="33" fill="none" d="M-50 950l500-140 60-430"/><path stroke="#8c7861" stroke-width="12" fill="none" d="M-50 946l500-140 60-430"/>
<path fill="#485653" d="M1540 245l380-80v670l-345-109z"/><path fill="#344441" d="M1620 305l300-52v110l-290 58zM1635 470l285-36v125l-275 17z"/>
<path fill="#a89879" d="M1520 231l400-82v37l-393 81z"/><path fill="#7b6c55" d="M1460 746l300 38 100 180-362-61z"/>
<path stroke="#a89d80" stroke-width="5" opacity=".4" d="M1500 786l285 40M1520 831l285 40"/>
<path stroke="#3c4840" stroke-width="16" fill="none" d="M1700 800l-42-227m31 150l90-98m-98 44l-88-72M160 929l30-170m-20 123l-80-67"/>
<path stroke="#929579" stroke-width="8" fill="none" d="M1722 795l-13-86m-5 38l42-24M90 931l16-88"/>
'''
for i in range(52):
    x=(i*173+89)%1920; y=785+(i*47)%295; w=12+(i*13)%65
    svg += f'<path d="M{x} {y}l{w} -7 19 14 -{w} 9z" fill="{["#626757","#4c574f","#8b816a"][i%3]}"/>'
svg += '</g><path fill="url(#vignette)" d="M0 0h1920v1080H0z"/></svg>'
(ROOT/'assets/scene.svg').write_text(svg,encoding='utf-8')
print('Built overlay.html, original scene, local fonts + SIL licences.')
