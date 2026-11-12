# Příprava na raid (návrh, schváleno 12. 11. 2026)

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

- **Po raidu:** porovnání snímku FINDINGS s plánem, co chybí, další doporučený raid, shrnutí od Opse.
- **Historie raidů:** plán a výsledek, statistika, které mapy pomáhají s cíli.
- Přiřazení typů míst k mapám, pokud se najde veřejný a legálně použitelný zdroj.
