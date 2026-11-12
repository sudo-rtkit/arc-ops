# Příprava na raid (návrh, schváleno 12. 11. 2026)

Stav 0.14.0 (12. 11. 2026): **implementováno** v rozsahu „Před raidem: plán“, „Během raidu: overlay“ a „Interaktivní mapa“.
Kód: `src/core/raidPrep.ts`, `src/core/lootAreas.ts`, `src/modules/RaidPrep.tsx`, `src/modules/MapViewer.tsx`,
`src/ops/OverlayRaid.tsx`, `src/storage/mapImages.ts`; testy `tests/core/raid-prep.test.ts` a `tests/e2e/raid-prep.spec.ts`.
Odchylky a rozhodnutí: snímky map jsou v IndexedDB webview (ne ve stavu ani v localStorage), do zálohy jen na volbu
v Nastavení; „použít poslední snímek zkratkou“ není, protože snímek zkratkou zůstává jen v paměti a hned se zahodí
(bezpečnostní pravidlo); seznam k hledání obsahuje u úkolu i předměty nalezené během úkolu; shluky bodů a vysouvací
legenda nejsou (legenda se v užším okně přeskládá nad mapu). Vyhodnocení po raidu a historie raidů zůstávají na později.

Stav 0.15.0 (12. 11. 2026): **implementováno** i „Po raidu“ a „Historie raidů“ z části Později (viz níže).

Inspirace: asistenti typu Blitz (League of Legends), kteří ve správnou chvíli ukážou, co hráč potřebuje.
Rozdíl: ARC Raiders nemá veřejné živé rozhraní a napojení na účet zakazují podmínky hry, takže aplikace
pracuje jen s ručními údaji a snímky. Nic se neslibuje jako plná automatika.

Cílová verze: **0.14.0**. První verze obsahuje **Před raidem: plán** a **Během raidu: overlay**.
Vyhodnocení po raidu a historie raidů jsou další krok (níže).

## Umístění (varianta A)

- Nový modul **Příprava na raid / Raid prep** ve skupině navigace Raidy.
- Nová záložka **Raid** v overlayi.
- Výpočty se nepíšou znovu: požadavky z Material Planneru (`src/core/planner.ts`, `goals.ts`, `quests.ts`,
  `workshop.ts`) a rozhodnutí nechat/prodat/recyklovat z Úklidu (`src/core/advice.ts`, modul Cleanup).

## Průběh

1. **Výběr cílů.** Jeden nebo víc: úkoly, další úroveň stanice, projekt, „vydělat peníze“. Výchozí výběr:
   připnuté a rozpracované úkoly a další vylepšení z kompaktního okna.
2. **Sečtený seznam.** Chybějící množství = požadavek − zásoba (stejná logika jako Planner, nic se nepočítá
   dvakrát). U každého předmětu počet, důvod („2× Gear Bench 2, 1× úkol X“) a **typ místa** (Electrical,
   Residential, ARC, Exodus …) z pole `loot_area` katalogu MetaForge. Data se doplní při vývoji skriptem
   `scripts/gen-catalog.mjs` z mezipaměti (`scripts/.cache/items-*.json`), za běhu žádná síť. Pokrytí je asi
   239 předmětů. Kde typ místa chybí, ukáže se „neznámé“ a nic se nedomýšlí.
3. **Doporučená mapa.** Bodování: otevřené úkoly z výběru s danou mapou (`maps` u úkolů z ARC Tracker),
   u cíle „peníze“ trasy (`src/core/data/routes.ts`) a fáze/úroveň hráče. Každé doporučení má důvod
   („2 úkoly na Dam, trasa Old Battleground“). Uživatel může mapu vždy změnit.
   Typy míst se k mapám nepřiřazují, protože data o tom, které mapy mají které zóny, nemáme.
4. **Loadout.** Nabídka z uložených loadoutů. U peněžní trasy je to doporučený loadout trasy, jen jako text.
5. **Spustit plán.** Uloží aktivní plán (cíle, mapa, loadout, seznam a čas). Ops řekne krátkou hlášku podle
   povahy (CS/EN, ≥ 2 varianty). Při hře v popředí nic nevyskakuje (stejné pravidlo jako u zvuků a bublin).

## Overlay: záložka Raid

- Seznam k hledání s počty a typem místa. Zaškrtnutí „mám“ je jen orientační a **nemění inventář**.
  Inventář dál mění jen snímek FINDINGS nebo STASH s potvrzením.
- Vyhledávání předmětu → **nechat / prodat / recyklovat** a krátký důvod (z Úklidu a požadavků plánu).
- Bez aktivního plánu: výzva „Připrav raid v aplikaci“ a odkaz do modulu.
- Overlay si zachová vzhled i chování bez převzetí fokusu.

## Interaktivní mapa (schváleno 12. 11. 2026)

- **Podklad = vlastní snímek mapy ze hry**, který si uživatel vloží do modulu Mapy (soubor, vložení, přetažení
  nebo snímek zkratkou). Ukládá se jen lokálně a do zálohy jde volitelně, protože obrázky jsou velké. Aplikace
  **nepřibaluje** žádné mapy ze hry ani z komunitních webů a nekreslí jejich kopie (autorské právo Embarku
  a autorů komunitních map, nepřesnost kreslení zpaměti).
- **Vzhled vrstvy navrhuje Sol** (`docs/design/maps/`): taktický styl ladící s overlayem (grafit + meruňka, XCOM 2
  a ARC Raiders vibe), mřížka, ikony bodů (bedna, extrakce, Raider Hatch, úkol, nebezpečí, poznámka …), barvy
  13 typů míst MetaForge, popisky, legenda a volitelné barevné sladění snímku. Pro maketu se použije
  abstraktní vymyšlený terén, nikdy skutečná mapa.
- **Ovládání:** přiblížení, posun, klik = nový bod (typ, typ místa, poznámka), přesun a smazání bodu.
  Body jsou v relativních souřadnicích snímku, takže přežijí výměnu snímku ve stejném rozlišení. Rozšiřují se
  stávající body map (`maps[*].pois`) a jdou do zálohy.
- **Napojení na přípravu:** na zvolené mapě se zvýrazní body s typem místa, který potřebují předměty ze seznamu,
  a body úkolů z výběru. V overlayi (záložka Raid) je malý náhled mapy se zvýrazněním.
- U každé mapy zůstává tlačítko „Otevřít podrobnou mapu na webu“ (stávající odkazy `live` v `maps.ts`),
  které otevře výchozí prohlížeč.
- Bez snímku: prázdný stav s návodem, jak mapu ve hře vyfotit. Seznam a doporučení fungují i bez mapy.

## Stav a data

- Nové schéma (aktuální + 1): `raidPlan` (aktivní plán, zaškrtnutí v overlayi). Je to herní postup, takže patří
  do záloh. Starší stavy a zálohy se načtou s prázdným plánem.
- Plán zastará, když se změní zásoba nebo cíle. Seznam se vždy přepočítá z aktuálního stavu a uložené
  jsou jen volby (cíle, mapa, loadout, zaškrtnutí).

## Testy

- Jednotkové: sečtení seznamu (bez dvojího počítání, odečet zásoby), bodování map s důvody, chybějící
  typ místa, migrace schématu, záloha a obnova.
- E2E (CS i EN): výběr cílů → seznam → spuštění → záložka Raid v overlayi → vyhledání předmětu.

## Později (není v 0.14.0)

- ~~**Po raidu:** porovnání snímku FINDINGS s plánem, co chybí, další doporučený raid, shrnutí od Opse.~~
  **Implementováno v 0.15.0.**
- ~~**Historie raidů:** plán a výsledek, statistika, které mapy pomáhají s cíli.~~ **Implementováno v 0.15.0.**
- Přiřazení typů míst k mapám, pokud se najde veřejný a legálně použitelný zdroj. (Stále otevřené.)

### Stav 0.15.0: vyhodnocení po raidu a historie raidů

Kód: `src/core/raidEval.ts` (vyhodnocení, další raid, záznam plánu), `planMapStats` v `src/core/runs.ts`,
krok „5 · Po raidu“ v `src/modules/RaidPrep.tsx`, `OvRaidEval` v `src/ops/OverlayRaid.tsx` (výsledek revize FINDINGS),
detail „Plán“ v `src/modules/Journal.tsx`, sekce ve `src/modules/Statistics.tsx`, volba v `src/ui/RaidForm.tsx`;
testy `tests/core/raid-eval.test.ts` a `tests/e2e/raid-eval.spec.ts`.

- **Snímek zásoby při spuštění plánu** (schéma 14, `raidPlan.snap` a `raidPlan.open`): zásoba a chybějící počet
  každého předmětu ze seznamu a cíle, kterým něco chybělo. Plán ze 0.14.0 snímek nemá (`null`).
- **Vyhodnocení jen čte.** Nalezeno = vyšší z čísel přírůstek zásoby od spuštění a loot zapsaný u raidu (snímek
  FINDINGS nebo ruční loot), nikdy součet, takže loot převedený do Inventory se nezapočítá dvakrát. Potřeba = co při
  spuštění chybělo. Nově hotové požadavky se počítají stejným seznamem jako příprava, cíl po cíli (stanice „Gear
  Bench 2: všechny materiály připravené“, úkol „předměty k odevzdání kompletní“, projekt). Úkol, který hráč mezitím
  odškrtl jako splněný, se za hotový požadavek nevydává. Inventář dál mění jen stávající potvrzené zápisy.
- **Kde se ukáže:** v Přípravě na raid samo, když je od spuštění plánu záznam raidu s lootem (snímek FINDINGS);
  jinak tlačítkem „Vyhodnotit raid“ podle změny zásoby (bez snímku zásoby u starého plánu jen výzva plán spustit
  znovu; u snímku FINDINGS se zásoba před raidem odvodí z lootu převedeného do Inventory). V overlayi ve výsledku
  revize lootu hned po potvrzeném zápisu.
- **Další raid:** stejné platné cíle nad zásobou po raidu, stejné `raidList` a `scoreMaps` s důvody; jedním
  klikem nový plán s novým snímkem.
- **Ops:** hlášky `raid.eval.all | partial | none | upgrade` (CS/EN, 3 povahy × 2 varianty). „upgrade“ má přednost,
  když raid dokončil stanici nebo projekt; hotový úkol spadá pod „vše nalezeno“. V hlavním okně po kliknutí,
  v overlayi jako stavová hláška po potvrzení lootu (stávající pravidlo: při hře v popředí žádné bubliny ani zvuky).
- **Historie v Raid Journalu, žádný paralelní deník:** volitelné `raids[].plan` (čas spuštění plánu, názvy cílů,
  peníze, mapa, loadout, předměty `need/found`, hotové požadavky, odhad hodnoty nalezeného z katalogu nebo `null`).
  „Uložit do deníku“ připojí plán k záznamu raidu od spuštění plánu, jinak otevře stávající zápis raidu s volbou
  „Uložit se záznamem aktivní plán“ (výchozí zapnuto; volba je u každého nového zápisu během aktivního plánu).
  Jeden plán je v deníku jen u jednoho záznamu. Úprava záznamu plán zachová. Starší záznamy zůstávají platné.
- **Statistika „Které mapy ti pomáhají s cíli“:** jen raidy s plánem a jen mapy s daty; počet raidů s plánem,
  průměr nalezených kusů z plánu na raid a podíl splněných plánů (vše nalezeno nebo dokončený požadavek). Méně než
  3 raidy = štítek „málo dat“.
- **Bodování map:** historie jako další čitelný důvod („v průměru 3 ks z plánu na raid (5 raidů s plánem)“), +1 bod
  při průměru aspoň 1 kus, a to až od 3 raidů s plánem na mapě.
- Odchylky: vyhodnocení ve výsledku snímku STASH není (pokryje ho vyhodnocení podle zásoby); „úspěch“ plánu je
  definovaný výše, nesouvisí s extrakcí.
