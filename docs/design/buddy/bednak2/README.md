# Ops / Bedňák II

Grafická dodávka, návrat k původnímu konceptu B. Bedna, zapuštěné hledí se dvěma segmentovanými LED a krátké nohy zůstávají. Nová kresba má zkosené plechy, osvětlené víko, tmavou bočnici, měděný servisní panel, střídmé nýty, pásku a oděrky. Žádné herní assety, převzaté stroje ani logo pruhy. Aplikace nebyla upravena; žádný commit ani push.

[Otevřít offline náhled](preview.html). Manifesty a PNG jsou vložené přímo do HTML, takže funguje přes `file://`, bez serveru a připojení. Odkazy na listy jsou relativní. Obsahuje variantu, level 0–75, animace, osm výrazů, šatník, celé násobky měřítka, rychlost, pauzu, proměnu, jiskru, pozadí a bublinu s povahou Věcný / Kamarádský / Drzý. Tlačítko „Ukázat řeč“ spustí animované LED. Jde o ukázkové české dialogy, ne finální CS/EN dialogový katalog. Sbírka v náhledu drží nejvyšší navštívený level pouze do zavření stránky.

## Soubory

| Cesta | Obsah |
|---|---|
| `ops-layers.json` | CORNER, 96 × 96, 16 původních slotů |
| `ops-layers-detail.json` | DETAIL, 128 × 128, stejná struktura |
| `corner/bodies/`, `detail/bodies/` | 5 podob × 26 klipů + atlas 8 výrazů pro každou podobu |
| `corner/parts/`, `detail/parts/` | 80 dílů v každé variantě; 75 nečíselných a 5 atlasů štítků 00–75 |
| `corner/levels/`, `detail/levels/` | 76 průhledných výchozích outfitů každé varianty |
| `detail/levels-256/` | 76 přesných 2× kopií kompozic |
| `detail-256/` | Přesné 2× nearest-neighbour kopie **všech** 281 PNG pod `detail/`, včetně pásů, dílů, efektů a kompozic |
| `corner/transform/`, `detail/transform/` | 4 přechody mezi sousedními podobami, 10 snímků po 100 ms |
| `corner/fx/`, `detail/fx/` | Jiskra, 8 snímků, poslední prázdný |
| `boards/all-levels-*.png` | Kontaktní listy 76 outfitů |
| `boards/silhouettes.png` | Holé siluety obou variant bez šatníku |
| `boards/expressions.png` | 8 výrazů × 5 podob × 2 varianty |
| `boards/animation-poses.png` | 8 klíčových póz každého klipu, detailní legenda |
| `boards/corner-readability.png`, `detail-readability.png` | Všech 5 podob v nativní velikosti na tmavém, šedém a světlém rušném pozadí |
| `concept/concept-sheet.png` | Výtvarný list pro 3D: předek, bok, záda, ¾, měřítko, konstrukce, materiály, 3 barevnosti, role a zvuk |
| `icon/tauri-icons/` | Všech 18 názvů původní Tauri sady včetně ICO, ICNS a Windows log |
| `icon/favicon.ico`, `favicon.png` | ICO 16/32/48/64 a PNG 32 |
| `icon/tray-{light,dark}-{16,32}.png` | Ručně zjednodušená monochromatická bedna s negativním hledím |
| `icon/windows-contexts.png` | Ilustrované Windows kontexty, světlá/tmavá lišta; nejde o snímek instalované aplikace |
| `tools/` | Generátor grafiky, šablona HTML, offline kontrola a její JSON výsledky |

## Růst a čitelnost

| Level | Podoba | Vlastní konstrukce, viditelná i bez dílů |
|---|---|---|
| 0–14 | Začátečník | Obyčejná úzká bedna, lehké boty |
| 15–29 | Průzkumník | Stožárek, boční světlo, malý zadní nosič |
| 30–44 | Mrchožrout | Širší bedna, asymetrický svařovaný boční plát, plnější nosič |
| 45–59 | Veterán | Široké nosné ramenní kryty, výztuhy nohou, oprava rámečku hledí |
| 60–75 | Legenda | Největší trup, plachta za tělem, teplé servisní světlo, drobná trofej ve výbavě |

Plochy holých siluet rostou: CORNER **2660 / 3155 / 3480 / 3871 / 4398**, DETAIL **4130 / 4934 / 5479 / 6141 / 7086** pixelů. Růst není založen jen na barevných nálepkách. Pět siluet má různé masky a odlišné profily nosiče, plátů, ramen a plachty. Finální legenda má přibližně 1,72× plochu základního detailního těla.

Každý level 1–75 přidá právě jeden nový nečíselný díl a rovnou jej nasadí. ID, sloty i pořadí odemykání zůstávají původní; štítky jsou bonus v levelech 15/30/45/60/75. Díly jsou malé servisní komponenty: výměna čelního plátu, krytů, ramenní vložky, lampy, rámečku či nosiče. Nejsou přidané velké dekorativní hlavy nebo nové postavy. Staré položky zůstávají v nasbíraném šatníku i při poklesu levelu.

**V rohu se zobrazují všechny sloty a všechny stupně dílů.** Nevynechává se žádný level. CORNER má nativní 96px kresbu, meruňkový vnější lem 1 px s tmavým oddělením uvnitř, méně šroubů a oděrek. DETAIL je nově rasterizovaný v 128 px s jemnějšími švy a materiály, ne zvětšený 96px obrázek. Paleta má 20 definovaných barev, 18 skutečně použitých v assetech; pouze alfa 0/255. Bez interpolace a částečné průhlednosti. Dithering je omezený na několik záměrných pixelů opotřebení, ne plošný šum.

## Animace a výrazy

Počty platí **pro každou podobu v každé variantě**, tedy obě varianty mají totožnou časovou osu. `durationsMs` v JSON je autorita; idle má nepravidelné výdrže a krátké mrknutí. Gesta mají nástup, výdrž a návrat. Level-up má vyšší odlehčení těla, více impulzů a vlastní jiskry než success. Řeč střídá šest kombinací výšek LED; žádné kreslené zorničky nebo lidská ústa.

| ID | Snímků | Běžná výdrž ms | Opakování / konec |
|---|---:|---:|---|
| idle | 16 | individuálně | smyčka |
| talk | 24 | 85 | smyčka po dobu dialogu |
| greet | 24 | 80 | idle |
| point-left | 20 | 90 | idle |
| point-right | 20 | 90 | idle |
| point-up | 20 | 90 | idle |
| point-down | 20 | 90 | idle |
| scanning | 24 | 90 | smyčka |
| thinking | 20 | 110 | smyčka |
| success | 24 | 80 | idle |
| level-up | 32 | 85 | idle |
| error | 16 | 95 | idle |
| sleep | 16 | 280 | smyčka |
| wake-up | 24 | 90 | idle |
| appear | 24 | 70 | idle |
| dismiss | 24 | 70 | zůstane skrytý |
| inspect | 32 | 125 | idle |
| carry | 24 | 110 | smyčka |
| drag | 16 | 110 | smyčka |
| walk | 24 | 70 | smyčka |
| annoyed | 24 | 110 | idle |
| laugh | 24 | 90 | idle |
| shrug | 24 | 100 | idle |

Původní sada před přidáním scan emotes: jedna podoba = **516 časovaných tělových snímků**. Jedna varianta = 2580 tělových + 40 výrazových + 40 proměnových + 8 efektových = **2668 dlaždic**. Obě dohromady **5336**, bez počítání štítků a odvozených 256px kopií. Výdrže a opakované pózy nejsou vydávány za unikátní kresby: unikátních tělových bitmap v rámci jednotlivých klipů je 1388 CORNER a 1392 DETAIL, viz `tools/export-validation.json`.

Výrazy: `neutral, happy, focused, worried, annoyed, sleepy, smug, surprised`. Atlas má samostatné statické pózy, vlastní kotvy a postoj; nekombinovat jej jako obličejovou vrstvu s jinou animační pózou.

## Kompatibilita a převzetí do aplikace

Základ zůstává `version:1`, `layout:horizontal`, stejné ID podob, slotů a dílů, `parts[].offset`, per-frame `anchors` a `zOrder`, `unlocks[].defaultOutfit`, proměny a jiskra. Díly jsou obdélníkové průhledné PNG, těla horizontální pásy. Všechny cesty jsou relativní k **bednak2/**, nikoli k adresáři manifestu či konkrétního těla. Offset se přičítá právě jednou. Z-order je konstantní a shodný s pořadím `drawOrder`; plachta je za tělem, oči jsou v tělové kresbě.

Přesné rozdíly proti `layers/ops-layers.json` a současnému runtime:

1. Mřížka 64 → 96 / 128. Ořez těla a efektů vždy podle `frameSize`; zachovat celočíselné souřadnice, source-over a `imageSmoothingEnabled=false`. 256 px ideálně vzniká složením ve 128 a následným přesným 2× zvětšením. `detail-256/` nemá vlastní manifest: při přímém použití těchto pásů je nutné zdvojnásobit **všechny** rozměry, kotvy, offsety i rozměr dlaždice štítku. `detail/levels-256/` obsahuje již složené kompozice.
2. Nová ID klipů. `compatibilityAliases`: `done → success`, `unsure → thinking`, `sleeping → sleep`, `alert → error`. Idle, scanning a drag zůstávají. `OpsAnim` a spouštěcí události se musí rozšířit; aliasy jsou metadata, současná aplikace je sama nečte.
3. `forms[].states[].frames[]` přidává `index`, `durationMs`, **`visible`** a `opticClearance:[x1,y1,x2,y2]` s krajními pixely včetně. `visible:false` znamená přeskočit **tělo i šatník**, aby na začátku příchodu a konci odchodu nezůstaly plovoucí díly. Během částečného příchodu/odchodu jsou kotvy mimo plátno záměrně; kreslit s ořezem.
4. `forms[].expressions` má `file`, `frameCount:8`, `frames` se stejným formátem kotev a viditelnosti. Je statický a nemá časování. Globální `expressions` určuje pořadí. Základní runtime ho zatím nepoužívá.
5. Jiskra má 8 místo 6 snímků. Číst skutečný počet a individuální výdrže. Proměna má nadále 10 snímků / 1 s; po dobu proměny skrýt běžné tělo i šatník, na konci nasadit cílový outfit. U přeskočení více podob lze přejít rovnou na cílovou.
6. `dismiss` má `loop:false,returnTo:null`: zůstává na posledním prázdném snímku do nového příkazu. Současný `Animator` v `src/ops/animator.ts` převádí každý null na idle, což je nutné pro tento stav změnit. Talk, carry, walk, drag, sleep a thinking ukončuje příslušná interakce. Při reduced-motion přejít rovnou na finální viditelnost / cílový level a efekty vynechat.

Současný importér `scripts/gen-ops-assets.mjs` čte pevně `layers/`, zplošťuje `frames` na `anchors[]` a zahazuje viditelnost. Při pozdější implementaci vybrat nový kořen a manifest, přenášet viditelnost i výrazové atlasy a načítat všechny nové PNG. Pro roh a detail nelze sdílet kotvy jednoho manifestu. Stávající `src/ops/sprite.ts` již čte velikost `FRAME` z manifestu, ale je nutné doplnit viditelnost a volbu varianty; rozměry nativního okna a hit-test musí navázat na novou mřížku. **Pouhá výměna PNG nestačí.** Toto je dokumentovaný integrační postup, žádný z těchto zásahů zde nebyl proveden.

## Koncept pro 3D a zvukový směr

Koncept je vytvořen vestavěným imagegen podle původní identity a nových pixelových kompozic, pak očištěn od dekorativních pruhů. [Přesné prompty a reference](concept/imagegen-prompts.md). Je to výtvarný podklad, ne rozměrový CAD ani hotový mesh. Pro 2D jsou autoritou PNG a kotvy; drobné konstrukční rozdíly 3D studie (např. výška majáčku) nepřepisují sprite. Výška návrhu 0,48 m vůči člověku 1,75 m. První schéma grafit + meruňka; oxid + krémová a oliva + kost jsou pouze materiálové alternativy pro 3D, ne další exportované palety spritů.

Role: zachráněný civilní nosič, který třídí součástky, prohlíží nálezy a pomáhá s plánem výbavy. Zvuk: suchá západka při otevření, měkké servo při gestu, krátký teplý reléový puls při úspěchu, dvojitý při levelu, tiché rádiové prasknutí při chybě. Řeč tvoří krátké nepravidelné tóny, ne hlas. Zvukový brief není dodávka WAV: úkol je pouze grafický. V aplikaci nízká výchozí hlasitost, možnost vypnutí; během hraní bez otevřeného overlaye ticho. Bubliny jen při vyžádané interakci. Povaha mění text a případně volbu gesta, nikoli identitu robota.

## Reprodukce a ověření

Z kořene repozitáře, Python 3 + Pillow a existující Node závislosti `@playwright/test`, `pngjs`, nainstalovaný Edge:

```powershell
python docs/design/buddy/bednak2/tools/build.py
node docs/design/buddy/bednak2/tools/verify.mjs
```

Generátor zapisuje pouze sem. Čte starý manifest `layers/ops-layers.json` kvůli ID a pořadí unlocků; žádné bitmapy ani geometrii odmítnutých robotů nepoužívá. Infrastruktura exportu a testů je adaptována ze Sběrače. Koncept pro 3D je samostatný schválení určený obraz, build jej neregeneruje.

- `tools/validation.json`: mřížky pásů, počty a časování, 16 kotev a z-order v každém snímku, průhlednost 0/255, paleta, 76 unikátních outfitů pro obě varianty, 75 viditelných nečíselných odemčení. Minimální rozdíl při stejné podobě a stejném čísle štítku je **12 px CORNER / 22 px DETAIL**. Každý díl proti každé póze i výrazu: **416 320 kontrol**, nula překrytých pixelů chráněné optiky a nula přesahů mimo záměrný příchod/odchod.
- `tools/export-validation.json`: 281 přesných 2× PNG kopií, otevření všech 25 ikonových souborů včetně ICO/ICNS, shoda 18 názvů Tauri sady s v1, pět různých a přísně rostoucích holých siluet, poctivé počty unikátních póz.
- `tools/browser-validation.json`: skutečný offline Edge, pixelová shoda všech 152 canvas kompozic s referenčními PNG, výběry 46 animací, 16 výrazů a 160 dílů, osm okamžitých proměn s omezením pohybu, velikost 2×, zachování sbírky, tři povahy, spuštění řeči a pozadí. Bez JS chyb a vzdálených požadavků. Screenshoty v `tools/preview-corner.png` a `preview-detail.png`.

Vizuální listy používají syntetická rušná pozadí, ne screenshoty ARC Raiders. Kontrola chrání hledí a okraje plátna; není to kolizní kontrola mechanických paží ani ověření nativního Windows overlaye, reálného herního kontrastu či DPI. Překryv drobných servisních dílů při některých gestech zůstává výtvarnou kompozicí, ne 3D riggem.

## Rozhodnutí pro převzetí

Zbývá výtvarné přijetí nového Bedňáka a rozhodnutí, zda nahradit ikonu aplikace i tray. CORNER 96 / DETAIL 128 a přesné 256px zobrazení jsou připravené. Nativní okna, ukládání šatníku, finální CS/EN hlášky a syntéza zvuků patří následné implementaci.


## Automatic capture scan emotes (2026-11-13)

These are **direct additive entries in both main manifests**, not a separate overlay
schema: `ops-layers.json` (CORNER 96) and `ops-layers-detail.json` (DETAIL 128).
Each of the five forms has the same three new states and timing. Existing `scanning`
is unchanged: 24 x 90 ms = 2160 ms, looping, focused eyes, body sway and a green
vertical sweep. Keep that version for explicit/manual hotkey captures.

| Animation | Frames | `durationsMs` in frame order | Total | Behaviour / app event |
|---|---:|---|---:|---|
| `scan` | 9 | 100, 100, 120, 120, 120, 120, 120, 100, 100 | 1000 ms | One-shot; auto-capture started |
| `scan-ok` | 5 | 60, 70, 140, 70, 60 | 400 ms | One-shot; recognised **and applied** |
| `scan-unsure` | 5 | 70, 90, 180, 90, 70 | 500 ms | One-shot; sent to review queue |

All have `loop:false, returnTo:"idle"`. Timings are authoritative in both global
`states` and each form's state. `scan` contracts the LEDs into 3x3 dots at 96 px
(4x4 at 128 px), briefly closes one dot at a time, and sends a **one native-pixel
horizontal copper/apricot row downward inside the visor**. No beam outside the
face, glow, alpha fade, body bob, equipment movement, or full-sprite flash.
`scan-ok` lifts the dots into two small happy LED arches; `scan-unsure` briefly
replaces the right dot with a native 5x7 question mark. No sound or bubble is
needed. These are deliberately quieter than `success`, `thinking`, and `scanning`.

### Layers, level forms and paint

Sheets are horizontal, transparent RGBA, exactly as existing body states:
`{corner,detail}/bodies/{rookie,explorer,scavenger,veteran,legend}/{scan,scan-ok,scan-unsure}.png`.
There are **30 new native sheets / 190 timed tiles**, plus 15 exact nearest-neighbour
2x detail sheets under `detail-256/bodies/`. No new standalone FX layer is needed;
the eyes and line are body pixels. Every frame supplies the existing complete
16-slot `anchors`, `zOrder`, `visible:true`, `index`, `durationMs`, and
`opticClearance`. Slot visibility follows the selected outfit as before.
All anchors and equipment positions equal `idle[0]`; the first and last body tiles
are byte-identical to `idle[0]`, so return to idle has no positional jump.

Forms cover levels 0-14 / 15-29 / 30-44 / 45-59 / 60-75. Keep the currently equipped
parts and palette when changing clips; do not reset the outfit. Only existing
`panel`, `apricot`, and `copper` colours are used for new marks. The grey plating,
brown parts, alpha silhouette and apricot CORNER rim are unchanged from idle.
Paint swaps must continue matching the existing material colour table exactly;
do not tint the entire sprite or include apricot/copper LED pixels in the plating
swap. No new material colours, palette entries, partial alpha, or antialiasing.
Use each size's own manifest and integer coordinates; do not scale 96px anchors
for DETAIL. New total: 535 timed body tiles per form, 2675 per variant; 5526 tiles
across both variants including the original expression, transform and sparkle tiles.
Earlier validation/counts in this README describe the original 23-clip baseline.

### Playback policy for the implementer

- When visible and awake, auto-capture started plays `scan` once. If reading takes
  longer than 1 s, return to idle while waiting; do not loop or restart the sweep.
- An applied result replaces any still-playing `scan` with `scan-ok`; a review
  result replaces it with `scan-unsure`. Play only the final disposition once per
  capture ID. Do not show OK merely because a capture was saved or OCR finished.
- Coalesce overlapping automatic captures. Ignore stale completion events and do
  not build an animation queue. A duplicate event must not repeatedly blink Ops.
- Idle resumes at frame 0 when the one-shot ends. These low-priority emotes must
  not interrupt manual gestures, dragging, transformation, dismissal or a manual
  `scanning` session. Drop their visual notifications during those interactions.
- **Do not wake a sleeping or hidden buddy for automatic captures or results.**
  Suppress these emotes in sleep/hidden mode; if sleep starts mid-emote, cancel it
  and let sleep win. Do not replay suppressed results upon waking.
- With reduced motion, omit `scan` and its sweep. Optionally hold the happy-eye
  confirmation tile (frame index 2) or question tile (index 2) for 140-180 ms,
  then idle, without pulsing. In sleep, keep sleep instead.

### Review and regeneration

`preview.html` embeds the updated manifests and all new PNGs and works offline.
Select Auto scan / Scan OK / Scan unsure in the animation selector, choose either
variant and any level, and use Replay (one-shots return to idle). Set expression
back to "Podle animace" to see the animation's eyes; an explicit expression atlas
replaces the whole body, as before. The preview now also offers exact 4x scaling.

- [Scan sequence, 1x and 4x](boards/scan-frames.png)
- [OK sequence, 1x and 4x](boards/scan-ok-frames.png)
- [Unsure sequence, 1x and 4x](boards/scan-unsure-frames.png)
- [Every frame of all five forms with equipped parts at 1x](boards/scan-forms.png)

Each sequence board includes **every frame**, both native variants, dark,
mid-grey and light backgrounds, with individual frame timing labels. The forms
board uses each form's maximum-level default outfit on the same three backgrounds.

Run `python docs/design/buddy/bednak2/tools/build_scan.py` from the repository root
to regenerate just these additions and the embedded preview. The full `tools/build.py`
now includes the same native rig definitions and calls this additive exporter last.
The exporter preserves all existing manifest content and original asset files.
`tools/scan-validation.json` records palette/alpha checks, fixed anchors, identical
idle endpoints, visor-only pixel differences, and 2888 successful compositions
covering all 76 levels x 19 frames x both variants. Older validation JSON files
are historical baseline checks; they have not been relabelled as new test results.
No app source, runtime generator, tests or external artwork was changed here.

Offline playback verification: `node docs/design/buddy/bednak2/tools/verify-scan.mjs`.
`tools/scan-browser-validation.json`: 190 frame compositions pixel-matched against
an independent PNG compositor, 30 one-shot returns to idle, both 4x display sizes,
zero JavaScript errors and zero remote requests in headless Edge.
