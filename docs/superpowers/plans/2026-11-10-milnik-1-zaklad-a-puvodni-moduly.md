# ARC Raiders Companion – milník 1: základ a původní moduly – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spustitelná desktopová aplikace (Tauri 2) se všemi 14 obrazovkami v rozsahu milníku 1, lokálním ukládáním, zálohami a importem dat z původního deníku.

**Architecture:** Čisté jádro v TypeScriptu (`src/core`) nese herní data a všechny výpočty deníku; jeho shodu s originálem hlídají zlaté testy. Jeden Zustand store drží stav a ukládá ho přes rozhraní úložiště (Tauri v produkci, localStorage pro vývoj a testy). Rust obstarává jen soubory, snímky a dialogy.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript strict, Vite, Zustand, lucide-react, @fontsource, Vitest, Playwright.

**Poznámka k rozsahu plánu:** Plán provádím sám v této relaci. Proto obsahuje přesné soubory, rozhraní, testy a kritéria přijetí, ale neopisuje kód obrazovek řádek po řádku; ten vzniká přímo ve zdrojových souborech. Co má která obrazovka umět, určuje `docs/01-analyza-puvodniho-deniku.md` (kapitola 2) a spec (kapitola 8, sloupec M = 1).

## Global Constraints

- Platforma: Windows, Tauri 2, WebView2. Minimální okno 1024 × 640.
- Rozhraní česky; názvy modulů a herní pojmy anglicky.
- Žádný síťový požadavek za běhu. Žádné spouštění procesů, žádný přístup k paměti ani souborům hry.
- Složka dat: `%APPDATA%\cz.arcops.companion\` (`state.json`, `state.json.bak`, `snapshots\`, `imports\`).
- Schéma stavu: `schema: 2`. Meze hodnot stejné jako v deníku (level 0–75, expBonus 0–15, rewardPass 0–60, zásoba 0–99 999, délka raidu 0–120 min, coiny raidu 0–100 mil.).
- Výpočty převzaté z deníku se nesmí lišit od originálu; rozdíl = selhání zlatého testu.
- Herní údaj, který není v deníku, má původ `rešerše` a odkaz na zdroj, nebo zůstane prázdný.
- `src/core` neimportuje React, store ani úložiště.
- Správce balíčků: pnpm. Commit po každé úloze.

---

## Struktura souborů

```
index.html, package.json, tsconfig.json, vite.config.ts, .gitattributes
src/main.tsx, src/App.tsx
src/core/types.ts          typy stavu a datových sad
src/core/util.ts           clampInt, uid, isoWeek, dayKey
src/core/data/*.ts         skills, stations, maps, routes, arc, weapons, checklists
src/core/skills.ts         pravidla stromu, plány, buildy
src/core/workshop.ts       upgrady, připravenost, nákupní seznam
src/core/phases.ts         fáze roadmapy
src/core/maps.ts           odemykání map
src/core/runs.ts           statistiky raidů
src/core/week.ts           týdenní reset Trials
src/core/gamedata.ts       základ + uživatelské úpravy
src/core/state.ts          defaultState, normalize
src/core/importV1.ts       převod zálohy deníku
src/core/backup.ts         export a rozpoznání importu
src/storage/*.ts           adapter (rozhraní), tauri, browser, index
src/store/app.ts           store, akce, automatické ukládání
src/ui/*.css, *.tsx        tokeny, komponenty, grafy, formátování
src/shell/*.tsx            Sidebar, TopBar, seznam modulů
src/modules/*.tsx          14 obrazovek
src-tauri/                 Cargo.toml, tauri.conf.json, capabilities, src/lib.rs, src/storage.rs
tests/golden/              načtení originálu + zlaté testy
tests/core/                testy nové logiky
tests/safety.test.ts       kontrola zakázaných API
tests/e2e/smoke.spec.ts    kouřový test UI
```

## Sdílená rozhraní

```ts
// src/core/types.ts
type Points = Record<string, number>;
type BranchId = 'c' | 'm' | 's';
type RaidType = 'money' | 'quest' | 'trials' | 'arc' | 'pvp' | 'other';
interface Profile { level; coins; xp; xpNext; rounds; expBonus; rewardPass; amplified }   // vše number
interface Raid { id: string; ts: number; map: string; type: RaidType; route: string; ok: boolean; coins: number; min: number; notes: string }
interface SavedBuild { id: string; name: string; note: string; points: Points }
interface AppState { schema: 2; meta; profile; profileLog; skills: { current: Points; showPlan: boolean; activePlan: string; builds: SavedBuild[] };
  stations: Record<string, number>; inventory: Record<string, number>; steps; raids: Raid[]; trials; checklists; maps; arcNotes; weaponNotes; dashboard; gameData; settings }

// src/core/skills.ts
pointsIn(cur, b, opts?) · totalPoints(cur) · budget(profile) · choiceTaken(cur, b) · endTaken(cur, b)
addBlock(cur, id, profile): string | null · invalidNodes(cur): Record<string, string> · resetCost(cur)
planSteps(key, builds?): PlanStep[] · planTarget(cur, steps): Points · nextPlanPoint(cur, steps) · planProgress(cur, steps)
stepsFromBuild(points): PlanStep[] · reachableWithoutReset(cur, target): boolean

// src/core/workshop.ts
reqBlock(view, station, level): string | null · nextNeeds(view, stations?) · readiness(inventory, mats)
shopping(view, stations?, sources?) · workshopProgress(levels, stations?) · applyUpgrade(view, stationId, stations?)

// ostatní jádro
phases(state) · mapStatus(rounds) · runStats(raids) · groupStats(raids, keyFn) · filterRaids(raids, filter) · rollWeek(trials, now)
defaultState(now?) · normalize(raw) · isDiaryV1(raw) · normalizeV1(raw) · importV1(raw) → { state, report }
makeBackup(state): string · parseBackup(text) → { kind, state, report } | { error }
getStations(gd) · getSources(gd) · getMaterials(state) · getArc(gd) · getWeapons(gd)

// src/storage/adapter.ts
interface StorageAdapter {
  kind: 'tauri' | 'browser';
  load(): Promise<{ content: string | null; source: 'state' | 'bak' | 'snapshot' | 'none'; warning: string | null }>;
  save(content: string): Promise<void>;
  createSnapshot(kind, label, content): Promise<void>;  listSnapshots(): Promise<SnapshotInfo[]>;
  readSnapshot(name): Promise<string>;  deleteSnapshot(name): Promise<void>;
  saveImportRaw(content): Promise<void>;
  exportBackup(suggestedName, content): Promise<boolean>;  importBackup(): Promise<string | null>;
  dataDir(): Promise<string>;  openDataDir(): Promise<void>;  openExternal(url): Promise<void>;
}
```

Rust příkazy se stejnými názvy v snake_case: `storage_load`, `storage_save`, `snapshot_create`, `snapshot_list`, `snapshot_read`, `snapshot_delete`, `import_save_raw`, `export_backup`, `import_backup`, `data_dir`, `open_data_dir`, `open_external`. Dialog pro výběr souboru otevírá Rust, takže UI nikdy nepředává libovolnou cestu.

---

### Task 1: Kostra projektu

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitattributes`, `src/main.tsx`, `src/App.tsx`, `tests/core/sanity.test.ts`

- [ ] `pnpm init`, nainstalovat react, react-dom, zustand, lucide-react, @fontsource/chakra-petch, @fontsource/inter, @fontsource/jetbrains-mono; dev: typescript, vite, @vitejs/plugin-react, vitest, @types/react, @types/react-dom, @types/node, @tauri-apps/cli, @tauri-apps/api
- [ ] Skripty: `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `tauri`
- [ ] `.gitattributes`: `reference/* -text`, aby git referenční soubory neměnil
- [ ] Ověřit: `pnpm test` projde, `pnpm build` projde
- [ ] Commit

### Task 2: Herní data a typy

**Files:** Create `src/core/types.ts`, `src/core/data/{skills,stations,maps,routes,arc,weapons,checklists}.ts`, `tests/golden/original.ts`, `tests/golden/data.test.ts`

- [ ] `tests/golden/original.ts`: načte `<script>` z `reference/denik-v2-2026-11-08-1707.html`, spustí ho v `node:vm` (bez `document`) a vrátí konstanty a funkce originálu
- [ ] Test: `SKILLS`, `PLANS`, `BUILDS`, `STATIONS`, `SOURCES`, `MAPS`, `CONDITIONS`, `ROUTES`, `SELL`, `TIERS`, `ANTI_ARC`, `WEAPON_PHASES`, `NEXT_STEPS`, `RAID_CHECK` se shodují s originálem (`toEqual`); ARC po rozdělení kombinovaných záznamů obsahuje všechny původní dropy a texty taktik
- [ ] Přepsat data do TypeScriptu; test projde
- [ ] Commit

### Task 3: Skill tree v jádru

**Files:** Create `src/core/util.ts`, `src/core/skills.ts`, `tests/golden/skills.test.ts`, `tests/core/builds.test.ts`

- [ ] Zlatý test: 300 náhodných stromů (náhodné body 0–max, náhodný level a expBonus) + stromy vzniklé postupným rozdáváním podle obou plánů; pro každý porovnat s originálem `totalPoints`, `pointsIn` pro každou větev, `budget`, `addBlock` pro každý skill, `invalidNodes`, `planTarget`, `nextPlanPoint`, `planProgress`, `resetCost`
- [ ] Implementace; test projde
- [ ] Testy nové logiky: `stepsFromBuild` dá pro platný build pořadí, které lze rozdat bez porušení pravidel; `reachableWithoutReset` odpovídá pravidlu ze starší verze deníku (body ve větvi ≤ cíl)
- [ ] Commit

### Task 4: Workshop, fáze, mapy, runy, týden v jádru

**Files:** Create `src/core/{workshop,phases,maps,runs,week}.ts`, `tests/golden/{workshop,phases,runs}.test.ts`, `tests/core/week.test.ts`

- [ ] Zlatý test na 300 náhodných stavech: `nextNeeds`, `reqBlock`, `readiness`, `shopping`, `workshopProgress`, `phases`, `mapStatus`, `runStats`, `isoWeek` (všechny dny let 2024–2028)
- [ ] Implementace; test projde
- [ ] `rollWeek`: nový týden vynuluje hvězdy, nechá názvy a uloží předchozí týden do historie, pokud měl aspoň jednu hvězdu nebo název
- [ ] Commit

### Task 5: Stav, normalize, import z deníku, záloha

**Files:** Create `src/core/{state,importV1,backup,gamedata}.ts`, `tests/golden/normalize.test.ts`, `tests/core/{importV1,backup,gamedata}.test.ts`

- [ ] Zlatý test: `normalizeV1` vrací totéž co `normalize` originálu pro náhodné, neúplné i poškozené vstupy
- [ ] `importV1`: přenese profil, strom, stanice, zásobu, kroky, runy (→ raidy typu money), Trials, checklist, Amplified; záloha bez `plan` → `looter`; `report` nese počty ze zdroje i po převodu a ty se rovnají
- [ ] `normalize` (schéma 2): doplní výchozí hodnoty, ořízne meze, je idempotentní (`normalize(normalize(x))` = `normalize(x)`)
- [ ] `parseBackup`: rozpozná zálohu aplikace a zálohu deníku; odmítne vyšší schéma a neplatný JSON se srozumitelnou hláškou
- [ ] `gamedata`: úprava přepíše jen dané pole, skrytý záznam zmizí, vlastní se přidá, smazání úpravy vrátí výchozí hodnotu
- [ ] Commit

### Task 6: Úložiště a store

**Files:** Create `src/storage/{adapter,browser,tauri,index}.ts`, `src/store/app.ts`, `tests/core/store.test.ts`

- [ ] `browser.ts`: stejné chování nad localStorage (včetně snímků a rotace 30 + 30)
- [ ] `store`: `init()` načte, normalizuje, provede `rollWeek`, založí automatický snímek starší než 24 h; každá akce změní stav, zapíše `profileLog` pro dnešek a naplánuje uložení za 500 ms; stav uložení `idle | saving | saved | error`
- [ ] Test se zástupným úložištěm: změna se uloží jednou, chyba zápisu nastaví `error` a zápis se zopakuje, `init` po poškozeném obsahu vrátí výchozí stav s varováním
- [ ] Commit

### Task 7: Designový systém a kostra aplikace

**Files:** Create `src/ui/{tokens,base,components}.css`, `src/ui/{components,charts,format}.tsx`, `src/shell/{Sidebar,TopBar,modules}.tsx`, upravit `src/App.tsx`

- [ ] Tokeny: grafit, tyrkysová, jantarová, oranžová, červená, zelená, barvy větví; písma přibalená
- [ ] Komponenty: Card, Stat, Bar, Pill, Button, ConfirmButton, Check, Qty, Field, Modal, Tabs, Empty, Table; grafy: BarChart, LineChart, Ring
- [ ] Sidebar se 14 položkami (ikony při šířce pod 1180 px), TopBar se stavem hráče a stavem uložení, přepínání modulů přes `location.hash`
- [ ] Ověřit v prohlížeči (`pnpm dev`) při 1024, 1280 a 1920 px
- [ ] Commit

### Task 8: Moduly převzaté z deníku

**Files:** Create `src/modules/{Dashboard,Profile,SkillTree,Workshop,Inventory,Maps,ArcDb,Weapons,MoneyRuns,Trials,Journal,Checklist,Statistics,Settings}.tsx`

Každý modul: obsah podle analýzy (kapitola 2) a specu (kapitola 8, M = 1). Po každém modulu `pnpm build` a kontrola v prohlížeči, commit po dvou až třech modulech.

- [ ] Skill Tree, Workshop, Inventory
- [ ] Money Runs, Raid Journal, Raid Checklist, Weekly Trials
- [ ] Maps, ARC Database, Weapons
- [ ] Dashboard, Player Profile, Statistics
- [ ] Settings & Backup (export, import, import z deníku se souhrnem, snímky a obnova, reset modulů, úplný reset s opsáním slova)

### Task 9: Rešerše herních dat

**Files:** Modify `src/core/data/{arc,weapons}.ts`, Create `docs/02-zdroje-hernich-dat.md`

- [ ] Dohledat u ARC jednotek typ, kategorii, nebezpečnost a slabiny, u zbraní kategorii a munici; každý údaj se zdrojem
- [ ] Zapsat s původem `rešerše` a `verified: false`; co se nepodaří doložit, zůstane prázdné
- [ ] Sepsat zdroje a datum do `docs/02-zdroje-hernich-dat.md`
- [ ] Zlatý test dat stále projde (údaje z deníku se nemění)
- [ ] Commit

### Task 10: Rust backend

**Files:** Create `src-tauri/{Cargo.toml,build.rs,tauri.conf.json}`, `src-tauri/capabilities/default.json`, `src-tauri/src/{main,lib,storage}.rs`, ikony

- [ ] `storage.rs`: atomický zápis (dočasný soubor → `state.json`, předchozí → `.bak`), načtení s návratem na zálohu a snímek, snímky s rotací, odložení poškozeného souboru jako `state.corrupt-<čas>.json`
- [ ] `cargo test`: zápis a čtení, obnova z `.bak` po poškození, rotace snímků, odmítnutí názvu snímku s cestou
- [ ] Příkazy, dialogy (tauri-plugin-dialog), otevření odkazu a složky (tauri-plugin-opener), jediná instance (tauri-plugin-single-instance)
- [ ] CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src ipc: http://ipc.localhost`
- [ ] Ověřit: `pnpm tauri dev` otevře okno, změna se zapíše do `%APPDATA%\cz.arcops.companion\state.json`
- [ ] Commit

### Task 11: Kontrola bezpečnosti, kouřový test, sestavení

**Files:** Create `tests/safety.test.ts`, `tests/e2e/smoke.spec.ts`, `playwright.config.ts`

- [ ] `safety.test.ts`: projde `src/` a `src-tauri/src/`; selže na `std::process::Command`, `OpenProcess`, `ReadProcessMemory`, `WriteProcessMemory`, `CreateRemoteThread`, `reqwest`, `ureq`, `XMLHttpRequest`, `WebSocket`, `fetch(`, `child_process`
- [ ] `smoke.spec.ts` (prohlížeč Edge, úložiště localStorage): otevře všech 14 modulů bez chyby v konzoli; změna levelu přežije znovunačtení; import ukázkové zálohy deníku nastaví level, zásobu a počet raidů; export a import vrátí stejný stav
- [ ] `pnpm test`, `cargo test`, `pnpm tauri build` projdou
- [ ] Commit

---

## Kontrola proti specu

| Požadavek specu | Úloha |
|---|---|
| Kap. 2–3 technologie a architektura | 1, 6, 7, 10 |
| Kap. 4 datový model, herní data s úpravami | 2, 5 |
| Kap. 5 úložiště a zálohy | 6, 8 (Settings), 10 |
| Kap. 6 migrace a zlaté testy | 2–5 |
| Kap. 7 vzhled | 7 |
| Kap. 8 moduly, M = 1 | 8, 9 |
| Kap. 9 propojení | 3–6, 8 |
| Kap. 10 bezpečnost | 10, 11 |
| Kap. 11 chybové stavy | 5, 6, 10 |
| Kap. 12 testování | 2–6, 10, 11 |
