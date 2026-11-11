# Ops // Polní konzole — grafický návrh overlaye

Finální návrhový podklad, ne implementace okna aplikace. Navazuje na „Milník 5“ ve specifikaci `docs/superpowers/specs/2026-11-11-milniky-4-5-doplnky-buddy-design.md`, téma `src/ui/tokens.css` a schváleného maskota B — Bedňák. Původní soubory ani aplikace se tímto návrhem nemění.

## Soubory

- [overlay.html](overlay.html): offline interaktivní mockup; CSS a JS jsou vložené, fonty, scéna a sprite sheety mají relativní cesty. Otevřít přímo ze souboru, není potřeba server ani síť. Záložky lze měnit myší i šipkami, krytí posuvníkem, stavy výběrem pod panelem. Ops, × a Esc ukazují zavření. „Zápis“ i „Nový snímek“ pouze předvádějí reakci, nic neukládají a obrazovku nesnímají.
- [review.html](review.html): rychlá galerie všech čtyř PNG a listu stavů, vhodná pro porovnání návrhů bez ovládání makety.
- [overview.png](overview.png), [quests.png](quests.png), [shopping.png](shopping.png), [capture.png](capture.png): čtyři celé obrazovky **1920 × 1080**, výchozí krytí 90 %. Obsah všech čtyř se vejde bez posouvání.
- [states.png](states.png): list **1800 × 1548**, krytí 70 / 90 / 100 %, klávesový fokus, hover, prázdná revize a chyba bez inventáře. Obsahuje i detaily ovládání 1:1. Celé panely jsou v listu zmenšené přesně na polovinu metodou nearest-neighbour.
- [states/](states/): stejných sedm stavů samostatně v **1920 × 1080**: `opacity-70.png`, `opacity-90.png`, `opacity-100.png`, `focus.png`, `hover.png`, `empty.png`, `error.png`.
- `assets/scene.svg`: původní procedurální vektorová studie opuštěného průmyslového dvora; jen architektura, trubky, materiály a úlomky. Žádný herní screenshot, mapa, jednotka, herní HUD ani logo.
- `assets/fonts/`: lokální fonty a jejich tři úplné licence OFL.
- `tools/`: zdrojová HTML šablona, sestavení mockupu, export PNG, sestavení listu stavů a ověřovací výstupy.

## Umístění a kompozice

**Panel 1100 × 760 uprostřed obrazovky 1920 × 1080**, tedy levý horní roh **410, 160**. Zůstává 410 px kontextu po stranách a 160 px nahoře a dole. Zvolil jsem střed, protože konzole přijímá kliknutí a je určena ke krátké vědomé práci s daty. Stabilní střed snižuje hledání ovládání při přepínání záložek; pravé dokování by vytvářelo dojem trvale otevřeného bočního HUDu. Umístění je návrhářská volba v rozsahu zadání, nikoli nové produktové omezení.

Hlavička 91 px, záložky 56 px, obsah 546 px, patička 67 px. Obsah má vnější odsazení 26 px vodorovně, pravý poznámkový sloupec 260 px, mezisloupcovou mezeru 20 px. U dlouhých skutečných seznamů má scrollovat pouze obsah, hlavička, záložky a ovládání krytí zůstávají. Potvrzení zápisu má při implementaci zůstat viditelné i s dlouhou tabulkou, například v pevné akční liště pod jejím scrollovacím tělem.

Celý HTML model se v menším okně proporcionálně zmenší, aby šel zkontrolovat jako grafický list. **Není to návrh mobilní aplikace ani doporučení zmenšovat skutečné písmo.** Pro implementaci se panel přizpůsobí dostupné pracovní ploše / DPI při zachování čitelné typografie; Ops vždy v celém násobku 32 px. Nativní okno má být frameless, always-on-top, bez proklikávání. Kliknutí mimo panel v tomto HTML nic nespouští a nezavírá jej; hit-test mimo panel musí nativní řešení stanovit podle skutečné velikosti okna.

## Vzhled a důvody

„Teplý taktický HUD“ stojí na grafitu, krémovém textu a meruňkových akcích ze stávajících tokenů. Zkosený roh, dvojice rohových značek, oddělené pásy hlášení `OPS // STASH`, `OPERACE`, `MATERIÁL`, `REVIZE` a číslované karty dávají strukturu pracovního hlášení. Geometrie i sazba jsou vlastní, bez převzatých rozhraní, ikon nebo log XCOM či ARC Raiders.

Postapokalyptický detail je omezen na pásku na hraně, jeden šroub, krátkou odřeninu, drobné zrno, pootočené razítko a poznámku jako z pracovního zápisníku. Opotřebení nepřekrývá čtený obsah. Žádné duhové pruhy z loga ARC. Abstraktní značky položek jsou jen české textové zkratky, nikoli herní ikony.

Nákupy obsahují **přesné hodnoty rarit** ze zadání. Barva se používá na úzkém indikátoru a tečce; celý název zůstává krémový a rarita je zároveň napsaná slovem. Zelená rarita není totéž co stav „rozpoznáno“: ten má vlastní stavový token, značku ✓ a text. Meruňka znamená akci a výběr, nikoli raritu.

Ukázková zásoba je 97 / 232 (135 volných míst, zaokrouhleně 42 %). Pět nákupních řádků má nedostatky 4 + 6 + 4 + 3 + 1 = 18 ks. Úkoly ukazují cíl, evidovaný postup, odměnu či výsledek a stav. Názvy, přiřazení rarit, cíle a odměny jsou **ilustrační**, nejsou tvrzením o aktuálních herních katalozích. Jejich finální podobu dodá aplikace ze svých lokálních dat. Poznámky jsou také ukázková vlastní data.

## Sklo, krytí a stavy

Krytí 70–100 % (výchozí 90 %) mění pouze grafitový podklad. **Nepoužívat `opacity` na celý panel**: text, rámečky, fokus, Ops a tlačítka zůstávají neprůhledné. 70 % nejvíc propouští kontext, 90 % je výchozí kompromis, 100 % tvoří plný grafit. V HTML napodobuje acrylic `backdrop-filter: blur(24px) saturate(.65)`; samotná syntetická scéna je také jemně rozostřená. Jde o výtvarnou simulaci, ne ověření Windows 11 Acrylic ani chování nad konkrétní hrou. Při vypnuté průhlednosti systému použít plný grafit, bez změny barev textu a ovládání.

Hover akce: `#F4AD82 → #FFC69F`, text `#241810`. Sekundární ovládání používá `--bg-hover`. Klávesový fokus: stávající meruňkový obrys 2 px s odstupem 3 px, nezávislý na podtržení aktivní záložky. Záložky mají role tab/tablist/tabpanel a šipkovou navigaci. Při omezení pohybu je Ops statický. Nativní implementace musí po zavření vracet fokus do předchozího kontextu; maketa pouze ukazuje znovuotevření.

Prázdná revize nabízí jednu hlavní akci. Chyba vysvětluje, že na snímku není inventář, že se snímek zahodil a zásoba zůstala beze změny; nabízí nový pokus a návrat. Výběr stavu pod panelem je pouze návrhářský ovladač, do aplikace nepatří. Volba „Chyba“ přepíná na záložku Ze snímku.

Ve výsledku jsou tři rozpoznané řádky (8 + 6 + 2 = 16 ks) předvybrané, nejistý řádek čeká na kontrolu názvu a počtu a neznámý se přeskočí. Změna opraveného počtu znovu ruší jeho schválení. Tlačítko explicitně říká, kolik řádků se zapíše; nevybrané řádky se nepoužijí. Mockup zápis pouze simuluje zprávou, nepoužívá localStorage ani herní integrace. U skutečného zápisu zachovat identitu položek, odlišit nahrazení evidovaného množství od přičtení a před zápisem to jasně označit — viz rozhodnutí níže.

## Nové CSS custom properties

Tokeny `Teplý grafit` jsou do mockupu převzaté beze změn. Tyto nové proměnné jsou **jen v mockupu**, nejsou přidané do `src/ui/tokens.css`:

| Token | Hodnota | Účel |
|---|---|---|
| `--overlay-w` | `1100px` | Šířka konzole |
| `--overlay-h` | `760px` | Výška konzole |
| `--overlay-opacity` | `.9` | Alfa podkladu; rozsah `.7` až `1` |
| `--overlay-glass-rgb` | `20 23 25` | RGB z `--bg-app` pro řízenou alfu |
| `--overlay-blur` | `24px` | Simulace matného skla |
| `--overlay-cut` | `16px` | Zkosení vnějšího panelu |
| `--overlay-bracket` | `24px` | Délka rohových značek |
| `--overlay-line` | `#65716F` | Vnější hrana na rušném pozadí |
| `--overlay-surface` | `rgb(29 34 37 / .75)` | Vnitřní vrstva z `--bg-panel` |
| `--overlay-noise` | `.035` | Alfa nenápadného zrna |
| `--overlay-tape` | `#B7A17A` | Dekorativní páska |
| `--overlay-tape-opacity` | `.62` | Průsvitnost pásky |
| `--overlay-edge-wear` | `#C8C7C2` | Barva drobné odřeniny |
| `--overlay-row` | `52px` | Základní výška datového řádku; revize používá kompaktních 46 px |
| `--overlay-rail` | `260px` | Pravý kontextový sloupec |
| `--overlay-shadow` | `0 28px 90px #060B0DB3` | Stín konzole |
| `--rarity-common` | `#BEB7AF` | Běžné |
| `--rarity-uncommon` | `#20B850` | Neobvyklé |
| `--rarity-rare` | `#00A8F0` | Vzácné |
| `--rarity-epic` | `#C83098` | Epické |
| `--rarity-legendary` | `#F8C000` | Legendární |
| `--rarity` | podle řádku `var(--rarity-…)` | Lokální sémantický alias pro indikátor položky |

## Fonty a licence

Stejné rodiny jako v tématu aplikace, všechny lokálně, bez Google Fonts CDN a bez systémových závislostí na jejich instalaci:

| Rodina a lokální soubor | Použití | Licence a původ |
|---|---|---|
| Chakra Petch — `ChakraPetch-SemiBold.ttf` | Nadpisy, technická struktura | SIL Open Font License 1.1; [zdroj](https://github.com/google/fonts/tree/main/ofl/chakrapetch); úplné znění `assets/fonts/chakrapetch-OFL.txt` |
| Inter — `Inter.ttf` (variabilní) | Český text a ovládání | SIL OFL 1.1; [zdroj](https://github.com/google/fonts/tree/main/ofl/inter); `assets/fonts/inter-OFL.txt` |
| JetBrains Mono — `JetBrainsMono.ttf` (variabilní) | Čísla, štítky, hlášení | SIL OFL 1.1; [zdroj](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono); `assets/fonts/jetbrainsmono-OFL.txt` |

Písma jsou převzatá bez modifikace; Inter a JetBrains Mono mají pouze jednodušší lokální název souboru. Fonty lze přibalit k aplikaci se zachováním autorských údajů a OFL. Nejsou převzatá z XCOM ani z ARC Raiders. Česká diakritika je v exportech vykreslená skutečnými přibalenými fonty.

## Ops v hlavičce

Existující sprite sheety se používají přímo z `../buddy/final/`, nezměněné. Základ 32 px je vykreslený na 64 px (2×), bez interpolace. Časy a počty snímků jsou vložené z již hotového `sprites.json`, takže otevření ze souboru nevyžaduje `fetch`.

| Stav | Snímků | Délka | Přehrávání |
|---|---:|---:|---|
| idle | 8 | 4370 ms | Smyčka |
| scanning | 8 | 880 ms | Smyčka během skenu |
| done | 5 | 1090 ms | Jednou → idle |
| unsure | 5 | 1550 ms | Jednou → idle |
| sleeping | 6 | 5000 ms | Pomalá smyčka |
| alert | 4 | 680 ms | Jednou → idle |
| drag | 2 | 750 ms | Smyčka během tažení |

V overlayi se předvádí idle v přehledu a úkolech, done při otevření nákupů / potvrzení, unsure u revize / chyby a scanning při „Nový snímek“. PNG mají animaci zmrazenou na reprezentativním snímku, aby šly porovnávat. Sleeping, alert a drag nadále patří zejména samostatnému buddymu.

## Reprodukce a ověření

1. `python docs/design/overlay/tools/build_mockup.py` — Python 3, šablona + tokeny + manifest Ops. Již přítomné fonty se nestahují znovu; při jejich chybění je skript stáhne z výše uvedeného oficiálního repozitáře včetně OFL. Hotový mockup je plně offline.
2. `node docs/design/overlay/tools/render_mockup.mjs` — existující `@playwright/test` v repozitáři, headless Microsoft Edge, viewport 1920 × 1080, DPR 1. Bez serveru, přes `file://`, čeká na lokální fonty i obrázky. Exportuje čtyři záložky a sedm stavů.
3. `python docs/design/overlay/tools/build_states.py` — Python 3 + Pillow, složí `states.png`.
4. `python docs/design/overlay/tools/build_review.py` — sestaví galerii a její vloženou variantu pro zobrazení v konverzaci.
5. `python docs/design/overlay/tools/validate_exports.py` — ověří rozměry všech exportů, lokální assety, přibalené OFL a dokončenou renderovací kontrolu; uloží `tools/export-validation.json`.

`tools/render-validation.json` zaznamenává rozměry, scroll, načtení fontů, přesné rarity a výsledek průchodu ovládáním. Ověřeny záložky, klávesové šipky, přezkoumání nejistého řádku, opětovné zneplatnění po změně počtu, výslovné potvrzení, Esc, Ops a znovuotevření. V exportu nejsou chyby JavaScriptu ani síťové požadavky. Vizuálně se kontrolují také PNG; nejde o prohlášení shody s WCAG ani ověření nativního Tauri okna nad hrou.

## Co ještě rozhodnout před implementací

Pro převzetí tohoto grafického návrhu není potřeba další rozhodnutí. Pro skutečný zápis ze snímku je ale nutné potvrdit **význam množství**: nahrazuje rozpoznaný počet evidovaný počet položky, nebo představuje přírůstek? Tuto produktovou volbu návrh nevymýšlí; finální akce má podle ní znít například „Nahradit počty 3 položek“ či „Přičíst 16 ks do zásoby“ a ukazovat rozdíl před / po. Stejný obrázek se nesmí omylem přičíst dvakrát.

Konkrétní globální zkratku zadá uživatel v nastavení; návrh žádnou napevno neurčuje. Nativní Acrylic, hit-test okna, DPI a návrat fokusu po zavření zbývají ověřit při implementaci. Tento balíček obsahuje pouze grafiku a návrhové HTML; žádná změna aplikace, commit ani push.
