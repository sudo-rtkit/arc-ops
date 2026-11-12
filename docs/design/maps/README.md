# ARC Raiders Companion — mapová vrstva

Grafický návrh a původní assety; žádný produktový kód ani commit. Otevřít [review.html](review.html) přímo ze souboru. Vše je offline, bez serveru, bez vložených base64 obrázků. Fonty jsou lokální kopie Chakra Petch, Inter a JetBrains Mono včetně původních OFL licencí v `assets/fonts/`.

## Výstupy

- `viewer.html` / `viewer.png`: celý modul 1280 × 800, aktivní plán, legenda a detail. `viewer.html?add` / `viewer-add.png`: formulář po kliku. Samostatné 2× výřezy formuláře a detailu.
- `raid.html` / `raid.png`: panel přesně 1100 × 760, hlavička 91, záložky 56, obsah 546, patička 67 px podle overlay návrhu. `raid-empty.html` / PNG: bez plánu. `raid-context.png`: panel v 1920 × 1080 na smyšleném terénu, centrovaný na 410,160.
- `empty.html` / PNG: celý modul bez snímku. `palette.html` / PNG: všech 13 značek nad třemi tóny. `terrain-before.png`, `terrain-after.png`: příklad harmonizace. `lookup-sell.png`, `lookup-recycle.png`: detail dalších rozhodnutí.
- `assets/icons/`: 11 původních geometrických ikon typu bodu; `assets/glyphs/`: 13 glyfů míst. `assets/sprite.svg`: SVG symboly. `assets/sprites/`: průhledné PNG řádky pro každou sadu, 16/20/24 px při 1× a 2×. Pořadí a indexy v `assets/manifest.json`; žádné mezery, buňka = velikost, CSS background-position = −index × velikost. 2× background-size = počet × velikost (CSS px). SVG currentColor, PNG světlá barva #F2EEE7; pro barevné body preferovat SVG. Každá ikona je ruční geometrie s 1.7/24 šířkou tahu; velikost přepočítávat jako celek. PNG jsou přímo rasterizované v cílové velikosti, 2× slouží pro DPI.

## Rozhodnutí a tokeny

Grafit #141719 / #1D2225, text #F2EEE7 / #C8C7C2 / #A2A8AA, meruňka #F4AD82. Nadpisy Chakra 28/21/16 px, text Inter 13 px, drobná metadata JetBrains Mono 10–11 px (v produktu důležité texty nejméně 12 px). Měřítko rozestupů 4/8/12/16/24 px, radius 4/6/8 px. Ovládací prvky 36 px, hit area ikon a bodů nejméně 36 × 36, ideálně 44 při dotyku. Legendový sloupec 180 px, detail 240 px, gap 12 px. Legenda scrolluje samostatně; detail nesmí skrýt akce. Při menším okně sbalit legendu do vysouvacího panelu a detail pod mapu; nezmenšovat celou aplikaci.

`tokens.css` je integrační podklad pro dark i `[data-theme="light"]`. Aktuální `src/ui/tokens.css` poskytuje tmavé hodnoty; světlá varianta zde je návrh mapového modulu. Barvy nejsou bezpečně rozlišitelné samy o sobě při všech poruchách barvocitu. Proto **každý typ má jedinečný glyf, kód a název**. Na plátně nikdy nekreslit barevnou ikonu přímo na snímek: vždy neprůhledná kapsle #171D20, vnější světlá a vnitřní tmavá kontura. Barvy legendy používají téma; mapové kapsle mají pevnou tmavou paletu i ve světlém tématu. Barva znamená typ místa, geometrická ikona znamená typ bodu, číslo znamená identitu bodu. Kód místa oddělený tečkou pomáhá i v náhledu. Neznámý typ: neutrální #C4BEAB + otazník + „Neznámé“, bez shody s plánem.

| Typ místa | Kód | Tmavé | Světlé |
|---|---|---|---|
| ARC | A | #F4AD82 | #8B451C |
| Electrical | E | #E6D16F | #695700 |
| Mechanical | M | #9CBFE0 | #275C87 |
| Nature | N | #94CBA0 | #316A3D |
| Residential | R | #E9B2C9 | #8F3F61 |
| Medical | + | #78D2C6 | #12685F |
| Commercial | C | #ECC396 | #81541F |
| Old World | O | #C4BEAB | #635C40 |
| Technological | T | #BAABF2 | #60409A |
| Security | S | #ACCAD5 | #315D70 |
| Exodus | X | #E9A4F0 | #873C8E |
| Industrial | I | #F2AA88 | #8E4628 |
| Raider | / | #D7DDE2 | #4D5965 |

## Stavy a z-order

1. Screenshot / harmonizace: z0. Změna filtru nesmí ovlivnit další vrstvy.
2. Mřížka a orientační osy: z1, dekorace `aria-hidden`, nesnímají pointer.
3. Záře plánu: z2 (jen kolem odpovídajících bodů).
4. Body a štítky: z3. Nezvýrazněné jsou desaturované, jejich neprůhlednost se nesnižuje.
5. Vybraný bod: z4, bílý 3px obrys s odstupem 5 px; tooltip nepřekrývá ikonu.
6. Zoom a legenda plátna: z5; tažený bod: z6; formulář: z8; toast/undo: z100.

- Hover: světlejší grafit #323A3F, popisek typu + místa; žádné poskakování.
- Focus: 2px meruňka, offset 3px; selected je nezávislý bílý obrys.
- Highlighted: dvě kontury, statická záře a přerušovaný obrys. V detailu důvod + konkrétní potřebné položky. Úkol může svítit i bez známého loot_area.
- Dimmed: desaturace .2, zachovat text a pevnou kapsli; filtrované body skrýt úplně.
- Dragging: kurzor grabbing, přerušovaný meruňkový okraj, viditelná původní pozice, Esc vrací původní bod. Zápis až při drop.
- Nový bod: malý formulář u kliku, přizpůsobit hranám; Enter uložit, Esc zrušit; fokus vrátit na novou značku / spouštěč. Poznámka nemusí být vyplněná.

## Chování pro implementátora

HTML je vizuální demonstrace: klik na volné plátno otevře formulář; myš posouvá podklad, tlačítka přibližují 100–300 %, filtry, mřížka a harmonizace se přepínají. Klik na bod mění výběr a text panelu. Uložení vytvoří pouze vzorovou značku v paměti, edit sdílí formulář nového bodu; není to CRUD implementace. Drag jednotlivých bodů, registrace obrázku, skutečný import a externí odkaz jsou popsané návrhové chování, nikoli hotová funkce HTML. Příklady obsahu, loot přiřazení i doporučení jsou ilustrační, nikoli ověřená herní data. Ukázkový díl je záměrný placeholder.

- Relativní pozice = x / původní šířka, y / původní výška. Opačná transformace pan/zoom pro vstup, normalizované souřadnice omezit na 0–1. Při tažení mapy >5px nevytvářet bod. Při zoomu ukotvit bod pod kurzorem. Zabraňovat odsunutí snímku zcela mimo plátno.
- Stejné rozlišení samo nezaručuje registraci: při výměně požadovat stejný výřez, orientaci a přiblížení. Pro jiný výřez nabídnout potvrzení vyrovnání nebo reset bodů; nikdy tiše nepřesouvat. Uchovat originál snímku, filtr pouze při zobrazení; uložit přepínač po mapách. Obrázky jen lokálně, záloha opt-in; body a plán v záloze vždy podle schématu aplikace.
- Změna mapy načte její vlastní snímek a body, nepřenáší body z předchozí mapy. Repo nyní obsahuje 7 id: dam, buried, spaceport, bluegate, riven, stella, pendola. Návrh netvrdí, že na nich existují určité loot zóny. Externí tlačítko použije stávající `live` příslušné mapy a otevře výchozí prohlížeč. Žádný externí mapový web nebyl navštíven ani použit jako reference.
- Highlight je průnik typů míst chybějících položek a **uživatelem zadaných** míst. Není to detektor lootu, navigace ani doporučení reálné lokality. Udržet všechny zbývající typy ve filtrech; při skrytí shody ukázat počet skrytých shod a reset filtru. Odškrtnutí plánu vypne jen zvýraznění.
- Shluky seskupovat s počtem a na zoom rozbalit. Poskytnout seznam bodů s filtrem jako klávesnicovou alternativu plátna. Velký snímek omezit při importu podle paměti, předem zobrazit případné zmenšení. Neztratit originální poměr stran.
- Overlay zachová stávající neaktivující otevření a zkratku zavření; HTML focus není důkaz chování nativního okna. Pro psaní vyhledávání je nutný vědomý vstup do ovládání (klik / existující přepnutí), po zavření vrátit fokus hře; žádný automatický fokus při zobrazení. Mini mapa je pasivní náhled, bez přidávání a tažení. Zaškrtnutí „Mám“ nikdy nemění inventář. Počet na řádku je zbývající potřeba, ne automaticky odečítané nalezené kusy. Přepočet potřeb přes stávající Planner; rozhodnutí přes Cleanup. Vzorky `sell` / `recycle` jsou jen přepínače návrhových stavů.
- Bez snímku dál funguje seznam, bez plánu výzva do přípravy; bez loot_area zobrazit Neznámé bez umělého přiřazení. Při zastaralém plánu přepočíst z aktuálních zásob a ukázat informaci. Import: drop / clipboard / file / nakonfigurovaná capture zkratka, žádná nová pevná globální zkratka. Chyba importu zachová původní snímek i body. Mazání bodu nabídne Zpět; náhrada snímku nabídne náhled před potvrzením.

## Harmonizace

`filter: var(--map-filter)` pouze na obrázku: `saturate(.38) sepia(.22) hue-rotate(345deg) brightness(.72) contrast(.92)`. Sníží sytost, přidá teplý grafit a utlumí pozadí. Vypnutím obnovit originál bez přepočítání. Ve světlém screenshotu ověřit zachování drobných popisů, u tmavého raději nechat vypnuté; filtr není univerzální zlepšení všech snímků. Příklady jsou stejný původní procedurální SVG před a po. Žádné herní logo, ikony, UI ani skutečná či komunitní geografie.

## Přístupnost a ověření

Povinné textové alternativy všech ikon, pojmenování ikonových tlačítek, klávesnicový seznam bodů, vyhledávání a formulář, tlačítka zoom místo samotného kolečka, pan přes šipky při fokusu mapy a možnost editovat souřadnice přes panel. Nativní implementace musí doplnit tyto alternativy; HTML předvádí pouze hlavní vizuální stavy. Fokus nesmí přeskočit do hry při Tab uvnitř aktivního formuláře. Klávesa Esc postupně ruší drag/form, pak zavře overlay. Výběr a plán nejsou odlišeny jen barvou, žádné blikání, `prefers-reduced-motion` respektovat. Čtečka má dostat typ, jméno, oblast, souřadnice a důvod zvýraznění; toast `role=status`.

`validation.json` obsahuje vypočtený WCAG relativní jas pro text ≥4.5:1 a grafické glyfy ≥3:1. Výsledky platí pro pevné kapsle/legendy, nikoli syrové obrázky; mapa má dvojitou konturu, protože jedna barva nemůže mít 3:1 na každém podkladu. Třináct barev není tvrzení o vzájemném kontrastu nebo klinickém ověření barvocitu. Nejde o WCAG certifikaci celé aplikace. Vizuální vlastní revize je i v review.html.

Reprodukce: `python docs/design/maps/build.py`, potom `node docs/design/maps/render.mjs` (existující Playwright + headless Edge). Generátory píší pouze do této složky. Součástí kontroly jsou rozměry, offline síť, fonty, chybové hlášky JS a návrhové interakce.

## České a anglické UI řetězce

Stejný slovník také v `labels.json`; názvy map a předmětů převzít z katalogu, bez automatického překladu. Názvy 13 míst jsou stabilní katalogové hodnoty v obou jazycích. Review je návrhářský komentář v češtině, ne produktové UI.

| Čeština (výchozí) | English |
|---|---|
| Mapy | Maps |
| RAIDY | RAIDS |
| Příprava na raid | Raid prep |
| Deník | Journal |
| VÝBAVA | GEAR |
| Zásoba | Inventory |
| Úkoly | Quests |
| Pouze lokálně | Local only |
| Mapa | Map |
| Změnit snímek | Change screenshot |
| Sladit barvy | Harmonise colours |
| Otevřít podrobnou mapu na webu ↗ | Open detailed map on the web ↗ |
| Plán aktivní | Plan active |
| 3 zvýrazněné body | 3 highlighted points |
| Zvýraznit shody | Highlight matches |
| TERÉNNÍ ARCHIV | FIELD ARCHIVE |
| Vlastní snímky · vlastní body | Your screenshots · your points |
| Neoficiální offline pomocník | Unofficial offline companion |
| Vrstvy a filtry | Layers & filters |
| Taktická mřížka | Tactical grid |
| TYP BODU | POINT TYPE |
| Kontejner | Container |
| Zbraňová bedna | Weapon crate |
| Extrakce | Extraction |
| Raider Hatch | Raider Hatch |
| Zamčené dveře | Locked door |
| Cíl úkolu | Quest objective |
| Nebezpečí ARC | ARC danger |
| PvP hotspot | PvP hotspot |
| Loot místnost | Loot room |
| Poznámka | Note |
| Moje značka | Player marker |
| TYP MÍSTA | LOOT AREA |
| Smyšlený terén — návrhová ukázka | Fictional terrain — design sample |
| SMYŠLENÝ TERÉN / UKÁZKA | FICTIONAL TERRAIN / SAMPLE |
| + | Zoom in |
| − | Zoom out |
| 100 % | 100% |
| Klik: bod · tažení: posun | Click: point · drag: pan |
| NOVÝ BOD | NEW POINT |
| Označit místo | Mark a location |
| Typ bodu | Point type |
| Typ místa | Loot area |
| Neznámé | Unknown |
| Co tu hledat… | What to look for… |
| Zrušit | Cancel |
| Uložit bod | Save point |
| VYBRANÝ BOD | SELECTED POINT |
| Rozvodna | Substation |
| POZNÁMKA | NOTE |
| Dvě bedny za severní zdí. Přístup z cesty. | Two crates behind the north wall. Access from the road. |
| Upravit | Edit |
| Smazat | Delete |
| PRO AKTIVNÍ PLÁN | FOR ACTIVE PLAN |
| Tady hledej | Look here |
| Shoda podle typu místa. Výskyt není zaručen. | Matched by loot area. Spawns are not guaranteed. |
| Body zadáváš ručně. Značka hráče není živá poloha. | Points are entered manually. Player marker is not a live location. |
| Vlastní snímek • uložený jen v tomto zařízení | Your screenshot • stored on this device only |
| + Přidat bod | + Add point |
| VLASTNÍ MAPOVÝ PODKLAD | YOUR MAP BACKGROUND |
| Tvoje mapa začíná snímkem | Your map starts with a screenshot |
| Vlož vlastní snímek mapy ze hry. Body a plán zůstanou jen u tebe. | Add your own in-game map screenshot. Points and plan stay with you. |
| Ve hře otevři mapu a zvol celý přehled. | Open the map in game and choose the full view. |
| Pořiď snímek systémovým nástrojem nebo nastavenou zkratkou. | Capture it with your system tool or configured shortcut. |
| Vlož sem obrázek bez okrajů, pokaždé se stejným výřezem. | Insert the image without borders, using the same crop each time. |
| Přetáhni sem snímek | Drop a screenshot here |
| Vložit ze schránky | Paste from clipboard |
| Vybrat soubor | Choose file |
| Žádné herní mapy nejsou přibalené. Seznam k hledání funguje i bez snímku. | No game maps are bundled. Your search list works without a screenshot. |
| Snímky se do zálohy přidávají volitelně. | Screenshots are included in backups only if you choose. |
| Ukázkový díl | Sample part |
| POLNÍ KONZOLE | FIELD CONSOLE |
| Připraven na výpravu | Ready for deployment |
| × | Close |
| Přehled | Overview |
| Nákupy | Shopping |
| Revize snímku | Screenshot review |
| K hledání | To find |
| 5 ks • 3 položky | 5 units • 3 items |
| Mám | Found |
| „Mám“ je jen orientační. Inventář se nemění. | “Found” is a reminder only. Inventory is unchanged. |
| Nechat, prodat, nebo recyklovat? | Keep, sell or recycle? |
| Najít předmět | Find an item |
| NECHAT | KEEP |
| 2 ks chybí pro Gear Bench 2. | 2 needed for Gear Bench 2. |
| Doporučení podle plánu a Úklidu. | Advice from the plan and Cleanup. |
| 01 → Power Cable, Electrical Components | 01 → Power Cable, Electrical Components |
| 02 → ukázkový díl · 03 → cíl úkolu | 02 → sample part · 03 → quest objective |
| Vlastní body · žádná živá poloha | Your points · no live location |
| Plán z aplikace • zaškrtnutí se ukládá lokálně | Plan from the app • checks saved locally |
| Krytí | Opacity |
| Připrav raid v aplikaci | Prepare a raid in the app |
| Vyber cíle a spusť plán. Pak se tu objeví seznam a tvoje mapa. | Choose goals and start a plan. Your list and map will appear here. |
| Otevřít přípravu na raid | Open raid prep |
| Přiblížit | Zoom in |
| Oddálit | Zoom out |
| Obnovit zobrazení | Reset view |
| Zavřít | Close |
| Ukázka: bod uložen pouze do náhledu. | Demo: point saved only in the preview. |
| Ukázkový vlastní bod. | Sample personal point. |
| Ukázka: bod smazán. V aplikaci nabídnout Zpět. | Demo: point deleted. Offer Undo in the app. |
| Návrhová ukázka — bez načítání souboru a bez otevření webu. | Design demo — no file loading or web navigation. |
| PRODAT | SELL |
| RECYKLOVAT | RECYCLE |
| Ukázkový předmět | Sample item |
| Není potřeba pro zvolené cíle. Ukázka rozhodnutí. | Not needed for selected goals. Sample decision. |
| Materiál pro zvolený cíl. Ukázka rozhodnutí. | Material for a selected goal. Sample decision. |
| Bez výsledku | No results |
| Zkus jiný název předmětu. | Try another item name. |
| Hover / fokus | Hover / focus |
| Výchozí | Default |
| Vybraný | Selected |
| Pro plán | For plan |
| Ostatní | Other |
| Tažení | Dragging |
