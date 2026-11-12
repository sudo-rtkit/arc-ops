# ARC OPS — kompaktní režim

Grafický návrh hlavního okna, nikoli implementace Tauri ani další herní overlay. Všechny změny jsou pouze v této složce. Žádný commit ani push.

## Výstupy

| Soubor | Obsah |
|---|---|
| [compact.html](compact.html) | Samostatná interaktivní maketa; otevřít přímo ze souboru, bez serveru a sítě. Fonty, CSS, ikony a JS jsou vložené. |
| [compact-cs.png](compact-cs.png) | České okno, 420 × 720 px. |
| [compact-en.png](compact-en.png) | Anglické okno, 420 × 720 px, včetně formátování čísel. |
| [compact-empty.png](compact-empty.png) | Nový uživatel, 420 × 720 px, jediná hlavní akce „Nastavit profil“. |
| [compact-short.png](compact-short.png) | Nízká varianta 420 × 520 px. |
| [compact-to-full.png](compact-to-full.png) | Skica přechodu, 1480 × 894 px. Obě okna zmenšena na 80 %. |
| [review.html](review.html) | Přenosný obrazový přehled standardní a nízké varianty. |
| [validation.json](validation.json) | Rozměry exportů a výsledky kontrol makety. |

Ovladače **pod oknem** jsou pouze pro kontrolu návrhu: prázdný stav, English, výška 520 a připnutí. Do aplikace nepatří. Kombinace stavů fungují společně. Parametry pro přímé otevření: `?lang=en`, `?empty`, `?short`, `?pin`, `?full`; přidáním `&export` se skryjí návrhářské ovladače. `?transition` zobrazí skicu přechodu. Plná aplikace je zde záměrně zjednodušený náčrt přechodu, nikoli návrh nového dashboardu. Její navigace a formuláře nejsou implementované.

## Kompozice a výběr dat

Zvolen je jeden sloupec se třemi sbalitelnými sekcemi. Záložky by ukryly souvislost mezi úkolem, potřebným materiálem a upgradem. Trvale zobrazený celý inventář by vyžadoval příliš mnoho posouvání. Stávající grafitové podklady a typografie zachovávají příslušnost k aplikaci; žádné sklo, šum, opotřebení ani výrazné rohové HUD značky z overlaye.

- **Horní lišta:** značka, připnutí, rozbalení, minimalizace a zavření. Ovládání 32 × 32 px, souvislé názvy v nápovědě a pro čtečku. Volná plocha hlavičky je při implementaci oblast pro tažení; tlačítka z ní vyloučit.
- **Profil:** úroveň 20, 2 977 / 29 000 XP (10,27 %), 58 313 mincí. Stav „Ops připraven“ znamená připravenost místního pomocníka, nikoli online připojení. Ops je zde pouze tichá stavová tečka s textem, bez animovaného maskota.
- **Aktivní úkoly:** přednostně připnuté, pak rozpracované; nejvýše 5, výchozí 3. Hotové do tohoto výběru nepatří. Počítadlo v nadpisu značí počet zobrazených úkolů. Ukázka obsahuje Shoring Up Defenses 3/4, Battening Down 0/3 a Taking Stock 1/5. Tenký meruňkový ukazatel doplňuje číselný postup. Detail úkolu patří do plného okna; maketa neumožňuje měnit skutečný postup.
- **Nákupní seznam:** výchozí výřez pro nejbližší zvolený cíl, zde Gear Bench 2; nejvýše 5 chybějících položek. Není to součet požadavků všech cílů bez rozlišení. Mám / potřebuji: Power Cable 1/3, Electrical Components 3/5, Hornet Driver 1/5. Rarita má barevný proužek i slovní označení. Nízká varianta slovní raritu vynechá; lze ji při implementaci doplnit nápovědou a přístupným názvem.
- **Další vylepšení:** Gear Bench → 2 a chybějící počty −2, −2, −4; celkem 8 ks. Zásoba je 5 / 13 ks. Upgrade není připraven a návrh nenabízí falešné tlačítko dokončení. Při více cílech použít uživatelem zvolený další upgrade, jinak nejbližší dosažitelný.
- **Spodní lišta:** hlavní akce Snímek, vedle ní Zápis raidu a pod nimi méně výrazný Úklid stashe. Pevná oblast hlášení nad akcemi nepřekrývá obsah a při zavření zprávy se geometrie nemění. Např. „Zapsáno: 14 materiálů“ je ukázka výsledku, nikoli výsledek skutečného snímání.

Herní názvy zůstávají podle lokálního katalogu, zbytek české makety je česky. Rarity a nároky Gear Bench 2 jsou převzaté z `src/core/data/itemdata.ts` a `stations.ts`; názvy úkolů a počty cílů z `arctracker.ts`. Stav profilu, zásoby a splnění cílů je ilustrační. Není potřeba online API.

Nový profil ukazuje pomlčky místo smyšlených nul. Jediná výzva „Nastavit profil“ otevírá náčrt profilu v plném okně. Rychlé akce jsou v tomto stavu skryté. U dílčích prázdných sekcí při implementaci použít vlastní krátký text a jednu kontextovou akci: „Vybrat úkol“, „Vybrat cíl“ nebo „Vybrat stanici“; ne tři konkurenční onboardingové karty zároveň.

## Interakce

**Kompakt ↔ plná aplikace:** tlačítko s diagonálními šipkami mění režim jedním kliknutím. V plném náčrtu je navíc pojmenované tlačítko „Kompaktní režim“. Maketa při návratu zachová sbalení sekcí a jejich posun. Skutečná aplikace má obnovit poslední rozměr a polohu každého režimu i poslední otevřený modul. Jde o stejné hlavní okno a stejné lokální úložiště. Nedělat nové okno s oddělenou kopií dat. Přechod nejvýše 120 ms, při omezení pohybu okamžitě; žádné zvětšování textu animovaným zoomem.

**Připnutí:** přepínací tlačítko s `aria-pressed`, meruňkovou výplní a obrysem. Návrh počítá s připnutím pouze kompaktu, přednostně vypnutým. Při rozbalení nativní připnutí vypnout, při návratu obnovit poslední volbu kompaktu. HTML pouze přepíná vizuální stav; systémové always-on-top nenastavuje. Minimalizace v HTML zkrátí okno na lištu (stejné tlačítko je vrátí), zavření zobrazí ukázkové obnovení. Není to skutečné chování správce oken.

**Sekce:** klik nebo Enter/mezerník na nadpisu sbalí obsah, bez automatického zavírání ostatních sekcí. Zachovat volbu uživatele pro další otevření. Pokud skutečná data přesáhnou výšku, posouvá se pouze střed; profil a rychlé akce zůstávají na místě.

**Klávesnice:** Tab / Shift+Tab pro průchod, Enter/mezerník pro akce a sekce. Viditelný fokus je 2px meruňkový obrys s odstupem 3 px. V maketě `Ctrl+Shift+M` mění režim, `Ctrl+Shift+P` přepíná připnutí a Escape vrací plný náčrt do kompaktu. Jde o místní návrhové zkratky, nikoli registraci globálních hotkeys. Snímek má používat stávající uživatelsky nastavenou zkratku buddy capture; konkrétní kombinace zde není vymyšlená. Maketa žádné snímky nepořizuje, neukládá data a nevolá Tauri.

Snímek ukáže ukázkové potvrzení. Skutečný capture má nejdřív vést přes stávající kontrolu rozpoznaných položek a potvrzení zápisu; toast až po zápisu. Zápis raidu a Úklid stashe rozbalí náčrt příslušného modulu. Samotné formuláře a recyklační logika jsou mimo rozsah tohoto návrhu. Potvrzení používá `role=status` / `aria-live=polite` a lze je zavřít křížkem.

## Velikosti

- Preferovaná velikost **420 × 720 CSS px**, minimální návrhová výška **520 px**. PNG mají DPR 1. Nativní DPI nesmí vést k pouhému zmenšování písma.
- Pro implementaci doporučena mírná změna šířky **380–480 px**, výšky **520–900 px**; preferenci a polohu uchovat mezi relacemi a při změně monitoru okno vrátit do pracovní plochy. Tento rozsah je návrhářská volba, nikoli nastavení Tauri v tomto balíčku.
- Standard: hlavička 43 px, profil 76 px, střed 484 px, akční oblast 115 px; vnější rámeček 1 px. Vodorovné odsazení 20 px.
- Nízká varianta: hlavička 36 px, profil 65 px; tři úkoly s číselným postupem bez pruhů, materiály po 30 px bez druhého řádku rarity a upgrade jen jako název + 8 chybějících kusů. Nepotřebuje posouvání ukázkových dat. Žádný zásadní ovladač se neschovává.
- Maketa nabízí dvě pevné výšky a reaguje na užší viewport. Nativní tažení za okraj a přepínání breakpointu podle skutečné výšky musí doplnit implementace; ovladač „Výška 520“ to zde simuluje.

## Tokeny a písma

Barvy jsou kopie tématu „Teplý grafit“ ze `src/ui/tokens.css`: `--bg-app`, `--bg-panel`, `--bg-raised`, `--bg-hover`, `--border-subtle`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--accent-hover`, `--on-accent`, `--success`, `--amber`. Fonty zachovávají rodiny tématu; v maketě mají krátké interní aliasy Chakra / Inter / Jet. Nezavádí se nová barva značky. Velké meruňkové plochy jsou omezené na hlavní akci.

| Lokální token | Hodnota | Účel |
|---|---|---|
| `--compact-w` | `420px` | Výchozí šířka |
| `--compact-h` | `720px` / `520px` | Výška podle varianty |
| `--compact-pad` | `20px` | Specifikace vodorovného odsazení |
| `--compact-row` | `42px` | Výchozí základ řádku; výsledné varianty jej CSS upravují na 38 / 30 px |
| `--radius` | `8px` | Rohy okna / karet |
| `--rarity-common` | `#BEB7AF` | Běžné |
| `--rarity-uncommon` | `#20B850` | Neobvyklé |
| `--rarity-rare` | `#00A8F0` | Vzácné |
| `--rarity-epic` | `#C83098` | Epické |
| `--rarity-legendary` | `#F8C000` | Legendární |
| `--rarity` | dle položky | Lokální alias pro indikátor |

Fonty jsou beze změny vloženy z již existujícího `../overlay/assets/fonts/`: Chakra Petch SemiBold, variabilní Inter a JetBrains Mono. Přiloženy úplné licence SIL OFL: `chakrapetch-OFL.txt`, `inter-OFL.txt`, `jetbrainsmono-OFL.txt`. Žádné externí fonty nebo síťové zdroje. Finální HTML lze zkopírovat samostatně; při distribuci fontů zachovat také licence.

## Reprodukce a ověření

Z kořene repozitáře: `python docs/design/compact/build.py`, pak `node docs/design/compact/render.mjs`. První krok složí přenosné HTML ze šablony a existujících fontů, druhý použije již instalovaný Playwright a headless Edge přes `file://`, bez serveru. Exporty se zapisují pouze sem. Pro přehled PNG následně spustit `python docs/design/compact/build_review.py`.

Kontrola zahrnuje přesné rozměry, načtení všech fontů, přetečení ve všech osmi kombinacích jazyka / výšky / prázdného stavu, sbalování, návrat z plného okna se zachováním sekcí, připnutí, klávesnici, potvrzení a jeho zavření, přechod do deníku / zásoby / profilu, minimalizaci a obnovení. V exportech nejsou JS chyby ani síťové požadavky. Vizuálně zkontrolovány české, prázdné a nízké PNG a skica přechodu. Nejde o ověření nativního Tauri okna.

## K rozhodnutí před implementací

Pro posouzení makety není potřeba další vstup. Před implementací potvrdit dvě produktové volby: zda křížek celou aplikaci ukončuje, nebo skrývá do tray podle stávajícího nastavení; a zda připnutí platí jen v kompaktu (zde doporučeno). Zkratky změny režimu / připnutí zkontrolovat proti stávajícím a uživatelským kombinacím. Samotnou logiku dat, capture a jejich revize převzít z aplikace.
