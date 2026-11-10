# ARC Raiders Companion – návrh řešení

Datum: 10. 11. 2026 · Stav: schváleno uživatelem (technologie Tauri 2, herní data doplnit rešerší, stavět milník 1)

Podklady: produktová vize od uživatele, `docs/01-analyza-puvodniho-deniku.md`, referenční deník `reference/denik-v2-2026-11-08-1707.html`.

## 1. Cíl

Desktopová aplikace pro Windows, která nahradí původní HTML deník a rozšíří ho na osobní operační centrum hráče ARC Raiders. Běží offline, data drží jen lokálně, do hry nijak nezasahuje. Žádná funkce původního deníku se neztratí.

Neoficiální fanouškovský nástroj; není spojen s Embark Studios ani jím schválen.

## 2. Technologie

| Vrstva | Volba | Důvod |
|---|---|---|
| Desktop | Tauri 2 (Rust, WebView2) | malý instalátor, nízká spotřeba paměti vedle hry |
| UI | React 19 + TypeScript (strict) + Vite | logika deníku je JavaScript, převod je přímý |
| Stav | Zustand, jeden store | jeden zdroj pravdy pro všechny moduly |
| Styl | čisté CSS s proměnnými (design tokeny) | plná kontrola nad HUD vzhledem, žádná závislost |
| Ikony | lucide-react | přibalené, offline |
| Písma | Chakra Petch (nadpisy), Inter (text), JetBrains Mono (čísla) přes `@fontsource` | přibalená, česká diakritika |
| Grafy | vlastní SVG komponenty | jednotný vzhled, žádná knihovna |
| Testy | Vitest (jádro, zlaté testy proti originálu), Playwright (kouřový test UI), `cargo test` (úložiště) | |

Zamítnuto: Electron (větší a paměťově náročnější), nativní .NET (přepis výpočtů do C# zvyšuje riziko chyb), SQLite (data jsou malá, JSON je čitelný a snadno zálohovatelný).

## 3. Architektura

```
src/core/        čistá logika a herní data, bez Reactu a bez přístupu k disku
src/storage/     rozhraní úložiště + dvě implementace (Tauri, prohlížeč)
src/store/       stav aplikace, akce, automatické ukládání
src/ui/          designový systém: tokeny, komponenty, grafy
src/modules/     14 obrazovek
src-tauri/       Rust: soubory, snímky, export a import, jediná instance
tests/           zlaté testy, testy jádra, kouřový test UI
reference/       původní deník, jen ke čtení
```

Pravidla závislostí: `core` nezná nic jiného. `store` zná `core` a `storage`. `modules` čtou stav a volají akce ze `store`, výpočty berou z `core`. Žádný modul nepočítá sám nic, co už umí `core`, a nesahá na úložiště přímo.

Implementace úložiště pro prohlížeč (localStorage) slouží vývoji a kouřovým testům; produkční aplikace používá jen Tauri.

## 4. Datový model (schéma 2)

Jeden objekt stavu. Funkce `normalize` doplní výchozí hodnoty a ořízne rozsahy, takže starší i neúplná záloha se načte vždy.

```
schema: 2
meta        createdAt, updatedAt, importedFrom?
profile     level 0–75, coins, xp, xpNext, rounds, expBonus 0–15, rewardPass 0–60, amplified
profileLog  [{ day, level, coins, xp, rounds, rewardPass }]      jeden záznam na den
skills      current {skill: body}, showPlan, activePlan, builds [{ id, name, note, points }]
stations    {stanice: úroveň}
inventory   {materiál: množství}
steps       [{ id, text, done }]                                 „Další kroky“
raids       [{ id, ts, map, type, route, ok, coins, min, notes, … }]
trials      week, stars[5], names[5], notes[5], history [{ week, stars, names, notes }]
checklists  templates [{ id, name, items }], checked {id: true}, routeChecks {klíč: true}
maps        {mapa: { notes, visited {místo: true}, pois [{ id, name, note }], todo [{ id, text, done }] }}
arcNotes    {jednotka: text}
weaponNotes {zbraň: { tier?, note? }}
dashboard   hidden {karta: true}, order [karta]
gameData    overrides {sada: {id: změny | null}}, custom {sada: [záznamy]}
settings    autoSnapshot, links
```

Milník 2 přidá `goals`, `loadouts` a rozšíří `raids` o výbavu, materiály, ztráty a splněné cíle. Přidání pole nevyžaduje migraci, `normalize` doplní výchozí hodnotu.

### Jeden záznam raidu
Money Runs, Raid Journal i Statistics čtou stejné pole `raids`. Run z deníku je raid typu „money run“. Zápis raidu zvýší `profile.rounds`, stejně jako v deníku. Stav mincí v profilu se zápisem nemění.

### Herní data a jejich úpravy
Vestavěná data žijí v `src/core/data`. Uživatelské úpravy se ukládají odděleně do `gameData` a při čtení se skládají přes základ. Každý záznam jde upravit, skrýt, vrátit na výchozí; vlastní záznamy jde přidat. Platí pro ARC, zbraně, materiály (kategorie, původ) a recepty stanic; v milníku 2 pro trasy, prodejní ceník a šablony checklistů.

Každý záznam má původ: `deník` (převzato z původního deníku), `rešerše` (doplněno z veřejných zdrojů, s odkazem, označeno „neověřeno“), `vlastní` (zadal uživatel). UI původ ukazuje, takže ověřené informace a vlastní hodnocení nejde zaměnit.

## 5. Úložiště a zálohy

Složka dat: `%APPDATA%\cz.arcops.companion\`

| Soubor | Obsah |
|---|---|
| `state.json` | aktuální stav |
| `state.json.bak` | předchozí úspěšně uložený stav |
| `snapshots\` | automatické a ruční snímky |
| `imports\` | původní text importovaných záloh |

- **Automatické ukládání:** 0,5 s po poslední změně. Zápis do dočasného souboru, pak přejmenování, takže přerušený zápis nepoškodí data.
- **Načtení:** `state.json` → při chybě `state.json.bak` → nejnovější snímek → prázdný stav s varováním. Poškozený soubor se nikdy nepřepíše bez kopie.
- **Snímky:** automaticky při startu, pokud je poslední starší než 24 h; vždy před importem, obnovou a resetem. Drží se 30 automatických a 30 ostatních.
- **Export:** jeden soubor `.json` s hlavičkou (aplikace, schéma, datum) přes systémový dialog.
- **Import:** rozpozná zálohu aplikace i zálohu starého deníku (v1). Nejdřív ukáže souhrn, teprve po potvrzení zapíše.
- **Reset:** jednotlivé moduly s potvrzením; úplný reset vyžaduje opsat slovo. Před obojím vzniká snímek.
- **Jediná instance:** druhé spuštění jen přepne na běžící okno, aby si dvě okna nepřepisovala data.

## 6. Migrace ze starého deníku

Podle kapitoly 7 analýzy. `importV1` je věrný převod funkce `normalize` z deníku, po něm následuje rozdělení do schématu 2. Záloha bez pole `plan` (starší verze deníku) dostane plán Solo Looter. Kombinované ARC záznamy („Tick, Pop“) se v databázi rozdělí na jednotlivé stroje; text taktiky a dropy zůstávají.

Shodu výpočtů hlídají zlaté testy: původní skript z `reference/` se načte v Node a jeho funkce (`normalize`, `addBlock`, `invalidNodes`, `planTarget`, `nextPlanPoint`, `planProgress`, `nextNeeds`, `reqBlock`, `readiness`, `shopping`, `workshopProgress`, `phases`, `mapStatus`, `runStats`, `isoWeek`, `resetCost`) musí na pevných i náhodných stavech vracet totéž co nové jádro.

## 7. Vzhled

Taktický HUD: grafitové pozadí, tyrkysová jako hlavní akcent, jantarová a oranžová pro důležité hodnoty, červená pro varování, zelená pro splněno. Barvy větví skill tree zůstávají ze hry (zelená, žlutá, červená).

Rozvržení: levý navigační panel (14 položek, při úzkém okně jen ikony), horní lišta se stavem hráče (level, mince, kola, skill body, fáze, stav uložení), obsah v kartách. Důležité hodnoty jsou vidět hned, detaily po rozkliknutí. Minimální okno 1024 × 640; kontroluje se 1024, 1280 a 1920 px. Animace jen krátké přechody, respektují systémové „omezit pohyb“.

Rozhraní je česky. Názvy modulů a herní pojmy (skilly, předměty, mapy) zůstávají anglicky, jak je zná hráč ze hry.

## 8. Moduly

Sloupec M říká, ve kterém milníku funkce vzniká.

| Modul | Obsah | M |
|---|---|---|
| Dashboard | level, mince, XP, raidy, extrakce, výdělek, coiny/h, workshop, skill tree, Trials, poslední raidy, chybějící materiály, fáze roadmapy, další kroky; skrývání a řazení karet | 1 |
| | aktivní cíle, doporučení | 2 |
| Player Profile | level, mince, XP, kola, body z Expedic, Reward Pass, Amplified; graf vývoje v čase | 1 |
| Skill Tree | strom s pravidly, rozpočet, cena resetu, plány krok za krokem, rozdání bodů; uložené buildy, porovnání, „bez resetu?“ | 1 |
| Workshop | 9 stanic, recepty, podmínky, zásoba, upgrade s odečtem, progres, Amplified | 1 |
| Inventory | všechny materiály, kategorie, hledání a filtry, potřeba napříč stanicemi, nákupní seznam, lov ARC, přebytky | 1 |
| | Material Planner: cílové úrovně, crafting, vlastní cíle, souběh požadavků | 2 |
| Maps | odemykání podle kol, graf, karty map, podmínky, poznámky, navštívená místa, vlastní body, úkoly | 1 |
| ARC Database | jednotky s typem, kategorií, obtížností, nebezpečností, slabinami, taktikou, výbavou, dropy, poznámkami; hledání, filtry, „jen co potřebuju“ | 1 |
| Weapons | tier list, anti-ARC, kategorie, zbraně podle fáze, změny 2.0, vlastní tier a poznámky, porovnání | 1 |
| | loadouty | 2 |
| Money Runs | hodiny, zápis, ukazatele, graf, statistiky podle tras, map a typů, porovnání tras, průvodci trasami, ceník | 1 |
| Weekly Trials | 5 výzev, hvězdy, poznámky, týdenní reset, historie | 1 |
| Raid Journal | seznam raidů s úpravou a filtrem | 1 |
| | výbava, materiály, ztráty, splněné cíle | 2 |
| Raid Checklist | výchozí checklist z deníku, kroky tras | 1 |
| | vlastní šablony | 2 |
| Statistics | raidy, extrakce, výdělek, coiny/h, nejlepší a nejhorší run, nejlepší mapa, vývoj v čase, workshop, skill tree; filtr období a typu | 1 |
| | dokončené cíle | 2 |
| Settings & Backup | umístění dat, export, import, import z deníku, snímky a obnova, reset modulů, úplný reset, odkazy | 1 |

Cíle a doporučení jsou záložky Dashboardu, Material Planner záložka Inventory, loadouty záložka Weapons. Navigace tak zůstává u 14 položek z vize.

## 9. Propojení

- Zásoba materiálu je jedna. Workshop, Inventory i ARC Database ji čtou a mění přes stejné akce.
- Potřeba materiálu se počítá na jednom místě v jádru; každý požadavek nese svůj zdroj, takže se sčítá bez duplicit a jde rozepsat „na co“.
- Úroveň hráče, kola, stanice, skill tree a Amplified určují fázi roadmapy; fáze zvýrazňuje zbraně.
- Raid se zapisuje jednou a projeví se v Money Runs, Journalu, Statistics, Dashboardu a v odemykání map.
- Trials plní dashboard a při změně týdne se uloží do historie.

## 10. Bezpečnost a pravidla Embark

Aplikace nemá žádný kód, který by četl paměť nebo soubory hry, spouštěl procesy, ovládal vstup nebo komunikoval po síti. Technicky to zajišťuje:

- Tauri oprávnění jen pro vlastní příkazy úložiště, souborový dialog a otevření odkazu v prohlížeči.
- CSP povoluje jen vlastní obsah aplikace; žádné vzdálené skripty, písma ani požadavky.
- Žádný automatický updater, žádná telemetrie.
- Test, který projde zdrojový kód a selže, pokud se objeví spouštění procesů, práce s cizí pamětí nebo síťový klient.

Herní data pocházejí z deníku, z veřejných webových zdrojů a od uživatele. Rešerše probíhá při vývoji; hotová aplikace nic nestahuje. Externí odkazy (živé mapy) se otevírají v prohlížeči jen na kliknutí a jsou označené „vyžaduje internet“.

## 11. Chybové stavy

| Situace | Chování |
|---|---|
| Poškozený `state.json` | načte se záloha nebo snímek, uživatel dostane hlášení, poškozený soubor se odloží stranou |
| Uložení selže (plný disk, zámek) | stav zůstává v paměti, lišta ukazuje chybu, zápis se opakuje |
| Neplatný soubor při importu | srozumitelná hláška, stav se nemění |
| Záloha z novější verze aplikace | import se odmítne s vysvětlením |
| Neplatná hodnota ve formuláři | ořízne se na povolený rozsah, jako v deníku |

## 12. Testování

1. Zlaté testy jádra proti původnímu skriptu.
2. Testy nové logiky: import v1, `normalize`, statistiky, potřeba materiálu, skládání herních dat.
3. Testy úložiště v Rustu: atomický zápis, obnova ze zálohy, rotace snímků.
4. Kouřový test UI: všech 14 obrazovek se otevře bez chyby, změna přežije znovunačtení, export a import vrátí stejný stav.
5. Ruční kontrola v běžící aplikaci při 1024, 1280 a 1920 px a bez připojení k internetu.

## 13. Milníky

1. **Základ a původní moduly.** Tauri projekt, designový systém, úložiště, zálohy, jádro se zlatými testy, všech 14 obrazovek v rozsahu sloupce M = 1, import zálohy z deníku, rešerše dat pro ARC a zbraně.
2. **Nové funkce.** Raid Journal v plném rozsahu, šablony checklistů, Goal Tracker, Material Planner, Loadout Planner, Smart Recommendations.
3. **Dokončení.** Propojení a kontrola konzistence, testy ukládání a obnovy, offline kontrola, doladění vzhledu a ovládání, instalátor pro Windows, stručný návod.

Každý milník končí spustitelnou a otestovanou aplikací. Milníky 2 a 3 dostanou vlastní plán, až na ně přijde řada.
