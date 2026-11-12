# ARC Raiders Companion

Neoficiální offline desktopová aplikace pro hráče ARC Raiders (Tauri 2, React 19, TypeScript, Vite, pnpm).
UI je česky (výchozí) a anglicky; jazyk se přepíná v Settings & Backup.

**Instalace:** instaluj se zavřenou hrou, nebo s hrou v režimu okna bez okraje (borderless). Okno aplikace nad hrou
v exkluzivní celé obrazovce jí může vzít fokus. Od 0.8.0 instalátor aplikaci po dokončení sám nespouští (volba
„Spustit“ je vypnutá) a když při startu aplikace běží ARC Raiders (`PioneerGame*.exe`), otevře se okno minimalizované
bez fokusu s upozorněním v aplikaci.

## Vývoj

- `pnpm dev` (prohlížeč, localStorage), `pnpm tauri dev` (desktop)
- `pnpm test` (Vitest), `pnpm build`, `pnpm e2e` (Playwright nad sestavenou aplikací), `cd src-tauri && cargo test`
- `pnpm tauri build` (NSIS instalátor s volbou češtiny a angličtiny)

## Texty a jazyky (i18n)

**Každý nový text UI musí jít přes slovník v obou jazycích.** Natvrdo psaný text v `src/modules`, `src/shell` ani
`src/ui` neprojde testem `tests/i18n/guard.test.ts`.

- Klíč přidej do `src/i18n/cs.ts` (zdroj pravdy) i do `src/i18n/en.ts`. Chybějící klíč v angličtině je chyba `tsc`,
  parita a prázdné hodnoty hlídá `tests/i18n/dict.test.ts`.
- V komponentě: `const t = useT();` a `t('klic', { name, count })`. Plurál: `{ one, few, other }` podle `count`
  (cs 1 / 2–4 / 5+, en 1 / jinak). Čísla v parametrech se formátují podle jazyka, `{x:pct}` jsou procenta, `{x:raw}` bez formátu.
- Čísla, data a časy jen přes `src/ui/format.ts` (`fmt`, `fmtDate`, `pct`, …), ty berou jazyk z UI.
- Popisné texty herních dat: česky v `src/core/data/*`, anglicky v `src/core/data/en.ts`, výběr podle jazyka v
  `src/core/gametext.ts`. Herní názvy (předměty, mapy, ARC, skilly, stanice, zbraně) se nepřekládají.
- Uživatelský text a už uložený obsah se nikdy nepřepisuje; výchozí obsah vzniká v jazyce stavu (`settings.lang`).

Podrobnosti: `docs/superpowers/plans/2026-11-12-i18n-en.md`.

## Rozpoznávání ze snímků (0.4.0)

Inventory → **Ze snímku**: hráč vloží vlastní snímek obrazovky INVENTORY (Ctrl+V, přetažení, výběr souborů).
Aplikace přečte políčka STASH, počty, hlavičku (kontrolní součet) a mince, ukáže potvrzovací tabulku a po potvrzení
přepíše materiály v Zásobě a mince v profilu (před zápisem snímek stavu `import`). Snímky se neukládají, uloží se jen
otisky ikon (`vision.learned`, čísla). Aplikace sama nic nesnímá a se hrou nijak nekomunikuje.

- Jádro: `src/core/vision/` (čisté funkce nad RGBA bufferem), převod na změny stavu: `src/core/visionImport.ts`.
- Vzory číslic: `GEN_GLYPHS=1 pnpm vitest run tests/vision/glyphs.gen.test.ts` (ze snímků v `tests/fixtures/vision/`).
- Návrh: `docs/superpowers/specs/2026-11-11-rozpoznavani-ze-snimku-design.md`, plán: `docs/superpowers/plans/2026-11-11-milnik-3a-rozpoznavani.md`.

## Katalog, Vybavení a loot ze snímku (0.5.0)

- **Katalog předmětů** `src/core/data/catalog.ts` (názvy, kategorie, vzácnost, otisky ikon; žádné obrázky ani popisy).
  Zdroj: MetaForge, neoficiální, ne od Embarku (uvedeno v Settings → Zdroje dat). Generuje se jen při vývoji:
  `node scripts/gen-catalog.mjs` (cache v `scripts/.cache/`, mimo git; `--offline` jen z cache).
- **Tooltip**: název, štítky a stoh z tooltipu pojmenují zvýrazněné políčko. Vzory písmen:
  `GEN_LETTERS=1 pnpm vitest run tests/vision/letters.gen.test.ts` (potřebuje lokální vlastní snímky).
- **Inventory → Vybavení**: evidence předmětů mimo materiály po kategoriích; import ze snímku do ní zapisuje přesné počty.
- **Zápis raidu → Loot ze snímku**: batoh a quick use ze snímku po raidu, minus zadaná výbava, předvyplní loot ke kontrole.
- Vlastní snímky hráče v `tests/fixtures/vision/own/` jsou jen lokálně (v .gitignore); testy nad nimi se bez nich přeskočí.
- **Quests**: úkoly obchodníků s ručním zaškrtnutím, předměty k donesení v nákupním seznamu a Planneru, projekty sezóny.
  Data z veřejných endpointů ARC Tracker (bez přihlášení a bez propojení účtu), generuje `node scripts/gen-arctracker.mjs`
  (cache v `scripts/.cache/arctracker/`; `--offline` jen z cache) do `src/core/data/arctracker.ts`.
- Plán: `docs/superpowers/plans/2026-11-11-milnik-3b.md`.

## Doplňky (0.6.0)

- **Rada nech / recykluj / prodej** u každého předmětu v Zásobě a Vybavení a záložka **Inventory → Úklid stashe**
  (přebytky seřazené podle hodnoty na políčko, uvolněná místa, prodejní hodnota). Pravidla: `src/core/advice.ts`;
  „vždy nechat“ je volba hráče (`advice.keep`). Nic se samo nemaže ani neprodává.
- **Item Database**: recyklace tam i zpět (vlastněné předměty zvýrazněné), blueprinty s ručním odškrtnutím a filtrem
  chybějících, nabídka obchodníků (cena, kusy, denní limit, úroveň; vždy s datem dat) a **vlastní tier list** S–D
  pro zbraně i předměty (přetahování myší i klávesnicí).
- **Weapons**: porovnání 2–4 zbraní se statistikami (tier I), lepší hodnota zvýrazněná.
- **Maps → Rozpis událostí**: odkaz na oficiální přehled podmínek map od Embarku (`arcraiders.com/map-conditions`), otevře se na kliknutí.
- **Quests → Projekty**: počet hotových fází; předměty další fáze běžícího projektu se počítají do rady „nech“.
- Data: `src/core/data/itemdata.ts` (hodnota, hmotnost, stack, recyklace, blueprinty, obchodníci) z veřejného
  `/api/items` ARC Tracker (`node scripts/gen-arctracker.mjs`) a `src/core/data/weaponStats.ts` ze statistik MetaForge
  (`node scripts/gen-catalog.mjs`). Obojí z cache, bez obrázků a popisů. Stav: schéma 5 (migrace ze 4, nová pole i v záloze).
- Plán: `docs/superpowers/plans/2026-11-11-milnik-4.md`.

## Buddy, overlay a zkratka (0.7.0)

- **Nastavení → Buddy a zkratka**, výchozí stav **vypnuto**. Dokud je vypnuto, neběží žádné okno, zkratka ani hlídání hry.
- **Ops**: malé okno vždy navrchu, průhledné kolem postavičky, přetahovatelné (poloha pro každý monitor), velikost 1× / 2×.
  Skládá se z vrstev (`src/assets/ops/`, manifest `src/core/data/opsLayers.json`, generuje `node scripts/gen-ops-assets.mjs`
  z `docs/design/buddy/layers/`). Roste s levelem v profilu: 5 podob, každý level nový díl; **Šatník Opse** v Nastavení.
- **Overlay „Polní konzole“** (klik na Opse; zavře Ops, Esc nebo zkratka): Přehled, Úkoly, Nákupy, Ze snímku.
  Acrylic ve Windows 11, krytí 70–100 %. Jen data aplikace; zápis jde přes hlavní okno se snímkem stavu.
- **Snímek na zkratku** (RegisterHotKey): kopie monitoru s oknem v popředí, jen v paměti, po přečtení se zahodí;
  bez inventáře se zahodí bez čtení. Ops a overlay se do snímku nedostanou. Do hry se nic neposílá.
- **Otevřít s hrou** (volitelné): jen podle názvu procesu `PioneerGame.exe`, kontrola jednou za 10 s.
- Rust: vše v `src-tauri/src/ops.rs` (hlídá `tests/safety-m5.test.ts`). Stav: schéma 6. Fonty overlaye: OFL v `public/licenses/`.
- Plán: `docs/superpowers/plans/2026-11-11-milnik-5.md`.

## Katalog buildů skill tree (0.8.0)

- **Skill Tree → Buildy a porovnání**: 12 buildů s přesnými body po skillech (`src/core/data/builds.ts`), včetně variant
  na 91 bodů a dvou vlastních „broken“ buildů Buldozer a Přízrak (označené jako teorie). Karty s filtrem štítků a řazením, mini strom,
  součty větví, 3 klíčové skilly; detail s velkým stromem jen pro čtení, popisem (CS i EN), zdrojem a verzí hry 2.0–2.3.
- Akce: **Načíst jako plán** (`activePlan` = `catalog:<id>` nebo `catalog:<id>:91`), **Porovnat s mým stromem**
  (co přidat, co je navíc, cena resetu 2 000 za bod), **Uložit jako můj build**. Vestavěné plány `runner` a `looter` zůstávají.
- Pravidla stromu hlídá `tests/core/build-catalog.test.ts`; odkazy na zdroje jen na kliknutí (`tests/safety-m6.test.ts`).
  Stav: schéma 6 beze změny.
- Spec: `docs/superpowers/specs/2026-11-11-skill-buildy-design.md`, plán: `docs/superpowers/plans/2026-11-11-buildy.md`.

## Loot po raidu přes buddyho (0.8.1)

- **Snímek na zkratku rozliší obrazovku** (`src/core/opsCapture.ts`): INVENTORY se STASH → dávka stashe (čte se jen STASH,
  zapíšou se jen viditelné počty); **FINDINGS po raidu** (bez STASH, krémové tlačítko CONTINUE vpravo dole) → samostatný
  loot (jen BACKPACK a QUICK USE); cokoli jiného (profil, skill tree, úkoly, dílna, příprava loadoutu) se zahodí bez čtení.
  Dávka stashe a loot se nikdy nemíchají.
- **Overlay → Ze snímku → Loot po raidu**: revize řádků (název, počet), volba raidu (nejnovější čerstvý, nebo nový záznam).
  Od nalezeného se odečte **výbava raidu** (zadaná u raidu, jinak položky jeho loadoutu); bez známé výbavy je zápis
  možný jen po **ručním potvrzení kontroly**. EQUIPMENT se nečte; **hodnota loadoutu se nikdy nepřičte do mincí ani výdělku**.
- Zápis jen po potvrzení a **se snímkem stavu**; loot jde do raidu (`raid.loot`, volitelně i do Inventory přes stávající
  převod rozdílu). **Stejný snímek se zapíše jen jednou** (podpis `raid.lootScan.sig`); nový snímek téhož raidu
  předchozí loot ze snímku nahradí (s výslovným souhlasem), nepřičte se. Schéma 6 beze změny (`lootScan` je volitelné pole).
- Testy: `tests/core/loot-findings.test.ts` (veřejné, umělá obrazovka `tests/vision/findings.ts`),
  `tests/vision/own-return.test.ts` (jen lokálně s vlastními snímky), E2E `tests/e2e/loot-findings.spec.ts`.
- Navazující práce (zatím jen evidované snímky v `own/return-and-progression/`, žádný import): profil, skill tree,
  úkoly a dílna ze snímku.

## Kompaktní režim hlavního okna (0.9.0)

- **Kompakt** (návrh `docs/design/compact/`): hlavní okno se přepne do malého okna 420 × 720 (šířka 380–480, výška 520–900;
  pod 620 px nízká varianta). Level a XP, mince, stav Opse, aktivní úkoly (nejdřív připnuté, pak rozpracované; 1–5, výchozí 3),
  nákupní seznam pro další vylepšení (mám / potřebuji, rarita barvou i slovem), další vylepšení (zvolený cíl z Planneru,
  jinak nejbližší dosažitelný) a pevná oblast hlášení. Akce **Snímek** (stávající cesta buddyho: revize v overlayi a potvrzení
  zápisu; bez zapnutého buddyho nebo zkratky jen nápověda), **Zápis raidu** a **Úklid stashe** rozbalí plnou aplikaci na místo.
  Nový hráč vidí jedinou výzvu „Nastavit profil“. Úkoly jde připnout v modulu Quests.
- Přepnutí tlačítkem v liště (zpět „Kompaktní režim“ v horní liště plné aplikace), z nabídky oznamovací oblasti nebo místní
  zkratkou **Ctrl+Shift+M** (žádná globální zkratka). Každý režim si pamatuje polohu a velikost; okno mimo pracovní plochu
  se vrátí na monitor. **Vždy navrchu** (Ctrl+Shift+P) jen v kompaktu, výchozí vypnuto; plný režim ho nativně vypne,
  návrat obnoví poslední volbu. Kompaktní okno se nezobrazí na snímcích (nezakryje inventář).
- **Křížek**: poprvé dialog „Skrýt do oznamovací oblasti“ / „Ukončit aplikaci“ se „Zapamatovat volbu“; zapamatovaná volba
  pak platí potichu, změna v Nastavení → Okno aplikace. **Ikona v oznamovací oblasti** (podle motivu hlavního panelu):
  Otevřít, Kompaktní režim, Buddy Ops (jen se zapnutým buddym), Ukončit; levé kliknutí obnoví okno v posledním režimu,
  druhé spuštění aplikace ho obnoví i ze skrytí. Start při běžící hře zůstává na pozadí i v kompaktu; změny dat okno neaktivují.
- Stav: **schéma 7** (`mainWindow`, `quests.pinned`); starší stav a zálohy se načtou s výchozími hodnotami. Záloha nese i okno,
  ale import, obnova snímku ani reset **nemění nastavení okna tohoto počítače**. Rust: `src-tauri/src/mainwin.rs`.
- Testy: `tests/core/compact-mode.test.ts`, E2E `tests/e2e/compact.spec.ts` (nativní okno nahrazené zástupcem), Rust `mainwin::tests`.

## Bedňák 2.0, zvuky, povahy a průvodce (0.10.0)

- **Bedňák 2.0** (grafika `docs/design/buddy/bednak2/`): varianta **CORNER 96 px** v okně buddyho, **DETAIL 128 px** v hlavičce
  a kartě overlaye, v kompaktním okně, v průvodci a v šatníku (256 px = přesné 2× zvětšení kompozice ve 128). Runtime data
  generuje `node scripts/gen-ops-assets.mjs` (`src/core/data/ops2*.json` s tabulkou kotev, `src/assets/ops2/`, jen potřebné PNG).
  Všech 23 animací je napojeno na události: příchod a pozdrav při otevření, odchod před zavřením, sken, přemýšlení při čtení,
  prohlížení lootu, nesení při zápisu, úspěch, chyba, level-up s proměnou a jiskrou, spánek (dřív, když hra neběží),
  probuzení, tažení a krok po přesunu, řeč během bubliny, ukazování v průvodci, krčení/naštvání/smích podle povahy.
  Vývoj 0–75 i ID dílů beze změny; ruční volba neznámého dílu se při načtení vrátí na automatiku, sbírka zůstává.
- **Ikona aplikace a tray** z `docs/design/buddy/bednak2/icon/` (celá sada Tauri 1:1, tray světlá/tmavá 16/32, favicon).
- **Zvuky** syntetizované ve Web Audio (žádné soubory, nic ze hry): sken, hotovo, nejistota, chyba, level, panel, pípavá řeč.
  Hraje jen okno, které hráč právě používá (hlavní okno s fokusem, otevřený overlay, kliknutí na buddyho); hra v popředí
  bez otevřeného overlaye = ticho (`src/core/opsSound.ts`). Výchozí zapnuto s hlasitostí 25 %, Nastavení → Ops: povaha, zvuky a průvodce.
- **Povahy** Věcný / Kamarádský (výchozí) / Drzý: každá hláška Opse má v CS i EN pro každou povahu několik variant, střídají se
  bez okamžitého opakování (`src/i18n/opsLines.ts`, `src/core/opsVoice.ts`). Nevyžádané bubliny jen při práci s Opsem.
- **Průvodce prvním spuštěním** (`src/core/tutorial.ts`, `src/shell/Tutorial.tsx`): přivítání, profil (ručně nebo záloha;
  snímek profilu od 0.10.1), první snímek, prohlídka Inventáře, Workshopu, Úkolů, Buildů a kompaktu, nastavení buddyho, konec.
  Nemodální karta, jde přeskočit v každém kroku, schovat do příštího spuštění (pak se zeptá a pokračuje), znovu spustit v Nastavení
  a vypnout přepínačem „Dialogy a průvodce“. Nebere fokus.
- Stav: **schéma 8** (`opsPrefs`: povaha, zvuky, dialogy, postup průvodce); starší stav a zálohy se načtou s výchozími hodnotami.
  Import zálohy, obnova ani reset tato nastavení tohoto počítače nemění.
- Testy: `tests/core/ops2.test.ts`, E2E `tests/e2e/ops2.spec.ts` (oba jazyky).

## Postup ze snímku, moduly v overlayi (0.10.1)

- **Další obrazovky hry ze snímku** (`src/core/vision/progress.ts`, `src/core/vision/text.ts`): stejná cesta jako loot
  (zkratka → Rust snímek jen do paměti → revize v overlayi → výslovné potvrzení), nově i v Profilu → **Načíst ze snímku**
  (vložený soubor, Ctrl+V nebo přetažení). Čte se jen čtení pixelů: druh obrazovky podle hlavičky (šipka zpět, nadpis,
  zvýrazněná záložka), text podle vzorů písmen aplikace (`letterGlyphs.ts`, nově `headGlyphs.ts` z generátoru
  `tests/vision/head.gen.test.ts`), polohy v jednotkách výšky obrazu (1366 až 3840 px). Hra musí být anglicky.
  - **PROFIL (RAIDER)**: level, XP / XP na další level, mince → zapisuje profil.
  - **DÍLNA**: přehled (úrovně ze 7 dlaždic stanic podle pořadí; jisté jen Gear Bench a Gunsmith ověřené detailem, ostatní
    k potvrzení, Scrappy číslo nemá) a detail stanice (úroveň z hlavičky i panelu, materiály na další úroveň porovnané s daty)
    → zapisuje úrovně stanic; materiály jsou jen informace.
  - **ÚKOL obchodníka**: obchodník, název úkolu a zaškrtnutí cílů. Aplikace jednotlivé cíle nesleduje, takže se jen ukážou;
    úkol se nikdy neoznačí jako splněný. Jisté je jen „nesplněno“ (nezaškrtnutý cíl): nabídne zrušení chybného „splněno“
    a připnutí na přání.
  - **SKILL TREE**: součty větví jen pro kontrolu (jednotlivé ranky se z přehledu neodvozují); rank skillu jen z tooltipu
    (samotná číslice = aktuální rank, „III ▶ IV“ = aktuální III, IV je jen návrh, max = poslední rank bez šipky).
  - Každé pole má jistotu (`src/core/progressImport.ts`): jisté je předvybrané, nejisté (nízká shoda znaků nebo dvě skoro
    stejně blízké číslice) se musí potvrdit, nečitelné je „?“ a nikdy se nezapíše. Před zápisem snímek stavu.
- **Průvodce**: krok profilu nabízí „Načíst snímek“ (dřív „připravujeme“) s odbočkou na ruční vyplnění.
- **Overlay = přístup k hlavním modulům** (milník 6, podmnožina, `src/ops/OverlayModules.tsx`): záložky Profil, Inventář,
  Dílna a Skilly vedle Přehledu, Úkolů, Nákupů a Ze snímku. Kompaktní přehledy s rychlými úpravami (pole profilu, počty
  materiálů, úroveň stanic ±, ranky ±); úpravy jdou do hlavního okna jako akce `edit`, hub je ověří a provede stejnou akcí store.
  Podrobnosti (grafy, recepty, buildy, celý strom) otevře „Otevřít v aplikaci“.
- Drobnosti: řádek s Opsem v kompaktu používá menší variantu (96 px), karta průvodce v plném okně už nezakrývá konec obsahu.
- Stav zůstává **schéma 8** (nic nového se neukládá). Testy: `tests/vision/progress.test.ts` (umělé obrazovky, bez vlastních
  snímků), `tests/vision/own-return.test.ts` (vlastní snímky, jen lokálně), `tests/core/progress-flow.test.ts`,
  E2E `tests/e2e/progress.spec.ts` a `tests/e2e/overlay-modules.spec.ts` (oba jazyky).

## Postup cílů úkolů, aktualizace přes instalátor (0.10.2)

- **Cíle úkolů**: v Quests má každý cíl v detailu úkolu zaškrtávací políčko; u úkolu je „Cíle n/m“. Zaškrtnutí všech cílů
  úkol samo nesplní a splnění úkolu cíle nemění. Cíl se pozná podle id úkolu a pořadí v datech ARC Tracker.
- **Kompakt a overlay**: postup aktivního úkolu je podle cílů, jakmile je zaškrtnutý aspoň jeden; jinak dál podle předmětů
  k odevzdání. Záložka Úkoly v overlayi ukazuje „Cíle n/m“ a zaškrtnuté cíle (✓).
- **Snímek úkolu obchodníka**: zaškrtnuté cíle se navrhnou k zaškrtnutí v aplikaci (jen když počet cílů sedí s daty; jistý
  úkol předvybraný, nejistý po potvrzení, nečitelné políčko nic). Cíl na snímku nezaškrtnutý, ale v aplikaci zaškrtnutý,
  se nabídne k odškrtnutí, nikdy předvybraný. „Označit splněný“ se nenabízí vůbec: obrazovka úkolu splnění neukazuje.
  Před zápisem snímek stavu.
- **Instalátor**: nová verze přes starší instalaci má předvybráno „Nainstalovat přes stávající instalaci“ (dřív Tauri
  předvybíralo „Před instalací odinstalovat“, což spustilo průvodce odinstalace). Stejná složka, soubory se nahradí, zástupce
  se aktualizuje, data v `%APPDATA%\cz.arcops.companion` zůstanou. Stejná verze znovu = přeinstalace na místě. Běžící
  aplikace (i schovaná v tray) se zjistí přes Restart Manager podle cesty k exe v instalační složce; instalátor se zeptá
  a pak ji ukončí, hry se to netýká. Hook: `src-tauri/nsis/hooks.nsh` a funkce na konci `src-tauri/nsis/English.nsh`.
- Stav **schéma 9** (`quests.objectives`: id úkolu → zaškrtnuté indexy); starší stav a zálohy se načtou s prázdnými cíli,
  záloha je obsahuje (herní postup). Testy: `tests/core/quest-objectives.test.ts`, `tests/vision/own-return.test.ts`
  (vlastní snímky, jen lokálně), E2E `tests/e2e/quest-objectives.spec.ts` a `tests/e2e/progress.spec.ts` (oba jazyky).

## Minihry a nátěry Opse (0.11.0)

- **Modul Minihry** (skupina „Mimo raid“ v postranním panelu): jen na chvíle mimo raid. Aplikace stav raidu nezná, proto
  minihry nikdy nenabízí sama a nad hrou nic nevyskočí; modul se otevírá jen na přání hráče. Kolo má číslo v adrese
  (`#games/tetris-123456`, `#games/quiz-123456`), takže jde zopakovat.
- **Stash Tetris**: naskládat loot do batohu 5 × 4 s co nejvyšší hodnotou. Skutečné názvy, prodejní hodnoty a rarita
  z `src/core/data/itemdata.ts`. Data velikost v mřížce nemají, tvary jsou proto zjednodušené podle typu (drobnosti
  a materiály 1×1, recyklovatelné věci, pistole, SMG, augmenty a štíty 1×2, dlouhé zbraně 2×2; UI to říká). Po kole
  srovnání s Opsovým hladovým balením (podle hodnoty na políčko), procenta a krátké rady. Myš (klik, pravé tlačítko otočí)
  i klávesnice (Enter, šipky, R, Delete, Esc). Logika: `src/core/stashTetris.ts`.
- **Recyklační kvíz**: 10 otázek z dat aplikace jen tam, kde je odpověď jistá: na co se předmět recykluje, která úroveň
  stanice potřebuje materiál (jen materiál právě jedné úrovně, vestavěné recepty), který úkol chce předmět odevzdat (jen
  předmět právě jednoho úkolu) a co má vyšší prodejní hodnotu (rozdíl aspoň 20 %). Ke každé odpovědi vysvětlení, klávesy 1–4.
  Logika: `src/core/recycleQuiz.ts`.
- **Nátěry Opse** (`src/core/paints.ts`): přebarvení existujících spritů v kódu přesnou shodou barev palety, alfa beze změny
  (pixely zůstanou ostré). Mění se jen plechy a hnědé díly; meruňkový lem, oči a tmavé oddělení zůstávají kvůli čitelnosti
  96px Opse v rohu. Šest nátěrů (Polní oliva, Rezavá bedna, Arktická, Noční hlídka, Pouštní, Zlacená) se odemyká milníky:
  první kolo, Tetris na 90 % a 100 % Opsova balení, kvíz 8 z 10, série 10 správných odpovědí, 10 kol. Výběr v šatníku
  (Settings), výchozí je původní vzhled. Nátěr platí ve všech oknech Opse (buddy, overlay, kompakt, průvodce).
- **Odměny jsou jen kosmetické**: výsledek kola mění jen `games` (rekordy, série, nátěry), nikdy profil, inventář,
  dílnu ani úkoly.
- **Ops**: hlášky pro výhru, rekord, odemčení a konec kola (Věcný / Kamarádský / Drzý, CS i EN) a zvuky `win`, `record`,
  `unlock` (hrají jen v aktivním okně, stejně jako ostatní zvuky). Když nic nechybí, smí Ops nabídnout minihru, ale jen
  v kompaktním okně s fokusem nebo v otevřeném overlayi a se zapnutými dialogy.
- Stav **schéma 10** (`games`: rekordy, série, odemčené a vybraný nátěr); starší stav a zálohy se načtou s prázdnými
  minihrami a původním vzhledem, záloha je obsahuje (herní postup). Import zálohy nátěry sjednotí a rekordy nesníží;
  reset modulu „Minihry a nátěry“ v Settings. Testy: `tests/core/minigames.test.ts`, E2E `tests/e2e/minigames.spec.ts`
  (oba jazyky).

## Opsův hack, série kvízu a názvy materiálů ze snímku (0.12.0)

- **Opsův hack** (třetí minihra v modulu Minihry, `#games/hack-123456`): „hackni terminál“. Mřížka obvodových dlaždic;
  otáčením se zdroj napětí propojí se všemi výstupy tak, aby každá dlaždice byla pod napětím a žádný vodič nevedl
  do prázdna. Kolo má tři uzly s rostoucí obtížností (4 × 4, 5 × 5, 6 × 6). Každý uzel vzniká ze seedovaného náhodného
  stromu přes všechna políčka a jen se zamíchá otočením, takže je řešitelný z konstrukce; test to pro 400 čísel kol
  ověřuje i nezávislým řešičem, který vidí jen zamíchané dlaždice. Platí každé správné řešení, ne jen to původní.
  Po kole srovnání s Opsovou normou (nejmenší počet otočení k původnímu řešení). Myš (klik po směru hodin, pravé
  tlačítko proti směru) i klávesnice (šipky, Enter nebo mezerník po směru, Q proti směru). Logika: `src/core/opsHack.ts`.
- **Ops v hacku**: hlášky na začátek kola a prolomený uzel (Věcný / Kamarádský / Drzý, CS i EN, dvě varianty) a stávající
  zvuky (`beep` za uzel, `win` / `record` / `unlock` za kolo; jen v aktivním okně).
- **Dva nové nátěry** (stejný systém, jen záměna palety, meruňkový lem a oči zůstávají): **Obvodová deska** za 3 dohraná
  kola hacku a **Uplink** za kolo hacku na Opsovu normu (nebo líp). Kola hacku se počítají i do „dohraných kol“ (Polní
  oliva, Pouštní).
- **Kvíz: série se ukládá po každé odpovědi.** Dřív nedohrané kolo neuložilo nic, ani sérii. Teď odchod uprostřed kola
  sérii zachová (i po zavření aplikace); rekord kola a počet kol se dál počítají jen z dohraných kol. Série 10 odemkne
  Noční hlídku hned při desáté odpovědi.
- **Názvy materiálů z detailu stanice dílny.** Kromě úrovně stanice se teď čtou i názvy materiálů na další úroveň
  (malá písmena, `src/core/vision/mixed.ts`; vzory písmen `src/core/vision/bodyGlyphs.ts` vygenerované z vlastních snímků
  testem `tests/vision/body.gen.test.ts`) a počty „mám/potřeba“ s jistotou každého pole zvlášť. Název se přiřadí jen ke
  známému názvu z dat aplikace (přibližná shoda s materiály a katalogem; nečitelný zůstane „?“, nikdy se nevymyslí).
  Revize ukazuje jistotu názvu, „mám“ a „potřeba“. Jistý materiál s jistým počtem „mám“ jde volitelně zapsat do Zásoby
  (nikdy předvybraný, přes stejnou revizi a snímek stavu před zápisem).
  Přesnost na vlastních snímcích (Gear Bench a Gunsmith, 2 × 3 materiály, 5 velikostí 1366–3840 px): název jen ze
  čtení 27/30, s daty úrovně 30/30, „mám“ 30/30, „potřeba“ 30/30, žádná jistá hodnota špatně; ve 1920 × 1080 všech 6 názvů
  přesně. Křížově (vzory z jednoho snímku, čtení druhého) název jen ze čtení 27/30. Při 1366 px se písmena slévají a
  část názvů zůstane nepřečtená (pak jen z dat úrovně a nejistá).
- Stav **schéma 11** (`games.hack`: dohraná kola, nejlepší procento normy, kola na normu); stav a zálohy schématu 10
  i starší se načtou beze ztrát, hack začne od nuly. Testy: `tests/core/minigames.test.ts`, `tests/vision/station-materials.test.ts`
  (umělé obrazovky), `tests/vision/own-return.test.ts` (vlastní snímky, jen lokálně), E2E `tests/e2e/minigames.spec.ts` (oba jazyky).
