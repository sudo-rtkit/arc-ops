# Milník 3a: rozpoznávání inventory ze snímků – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Hráč vloží snímek (nebo několik posunutých snímků) obrazovky INVENTORY. Aplikace z něj přečte políčka STASH, počty, hlavičku a mince, ukáže výsledek v potvrzovací tabulce a po potvrzení přepíše materiály v Zásobě a mince v profilu. Neznámé ikony se naučí jako otisky.

**Architecture:** Čisté funkce nad RGBA bufferem v `src/core/vision/` (rozvržení → políčka → vzácnost, počty, tiery, otisky → párování → spojení snímků). Převod výsledku na změny stavu je čistá funkce v `src/core/visionImport.ts`. Store k ní přidá snímek stavu (`import`) a uložení. UI (`src/modules/ScreenImport.tsx`) jen dekóduje obrázek přes canvas, zobrazí náhled a tabulku a zavolá store. Stav přejde na schéma 3 (`items` pro 3b, `vision`).

**Tech Stack:** TypeScript, React 19, zustand, čisté CSS (tokeny v2), Vitest, Playwright, pngjs (jen dev, dekódování PNG v testech).

## Global Constraints

- Žádná interakce se hrou: nečíst paměť, soubory ani síť hry; aplikace nesnímá obrazovku, nemá overlay ani globální zkratky a nesleduje složky. `tests/safety.test.ts` beze změny prochází.
- Offline, nic se nestahuje, herní grafika se nepřibaluje. Grafické assety se negenerují.
- Snímky se neukládají; ukládají se jen otisky (čísla).
- Nic se nezapíše bez potvrzení; před zápisem snímek stavu `import`.
- Každý nový text UI je v `src/i18n/cs.ts` (zdroj pravdy) i `en.ts`; hlídá `tests/i18n/guard.test.ts`.
- Bez nových runtime knihoven; `pngjs` jen jako devDependency.
- Verze 0.4.0 v `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
- Na konci jeden commit na `main` (autor podle git konfigurace, bez Co-Authored-By), bez push. Nesahat na `%APPDATA%\cz.arcops.companion`.
- 3b (katalog MetaForge, záložka Vybavení, loot z batohu) se nedělá; datový model a moduly s ním musí počítat.

## Mapa souborů

| Soubor | Odpovědnost |
|---|---|
| `src/core/vision/image.ts` | `RgbaImage`, jas, HSV, `crop`, `resize` |
| `src/core/vision/layout.ts` | rámečky políček → mřížky → panely STASH / BACKPACK / QUICK USE, `cellPx`, `ui` |
| `src/core/vision/cells.ts` | místa mřížky a výřezy políčka (ikona, roh vzácnosti, kategorie, počet, tier) |
| `src/core/vision/regions.ts` | hlavička STASH, popisek panelu („2/14“), mince vpravo nahoře |
| `src/core/vision/rarity.ts` | barva rohu / rámečku → vzácnost |
| `src/core/vision/digits.ts` | segmentace znaků, porovnání se vzory, „×19“, „200/268“, „51,060“, tier I–IV |
| `src/core/vision/glyphs.ts` | vygenerované binární masky číslic (2 písma × 3 měřítka) |
| `src/core/vision/fingerprint.ts` | otisk ikony 16×16 + histogram, `similarity` |
| `src/core/vision/match.ts` | párování s naučenými otisky (a katalogem v 3b), shlukování neznámých |
| `src/core/vision/merge.ts` | spojení více snímků stejného panelu podle podpisu řádků |
| `src/core/vision/read.ts` | `readScreenshot(img, ctx)` |
| `src/core/visionImport.ts` | řádky potvrzovací tabulky z výsledku, `applyVisionImport` (čistá změna stavu), limit naučených |
| `src/core/types.ts`, `state.ts`, `backup.ts` | schéma 3: `items`, `vision`, normalizace, migrace 2 → 3 |
| `src/store/app.ts` | `importFromScreens`, `clearLearned` |
| `src/ui/imageFile.ts` | dekódování `Blob` → `RgbaImage` přes canvas (jen v prohlížeči) |
| `src/modules/ScreenImport.tsx` | záložka „Ze snímku“ |
| `src/modules/Inventory.tsx`, `Settings.tsx` | nová záložka, naučené ikony |
| `src/ui/modules.css` | styly náhledu a tabulky |
| `tests/vision/*` | testy jádra, generátor vzorů (`GEN_GLYPHS=1`) |
| `tests/core/vision-import.test.ts` | testy převodu a store |
| `tests/e2e/screen-import.spec.ts` | e2e v obou jazycích |

---

### Task 1: Obrazové pomůcky a rozvržení (HOTOVO jako ověřovací průzkum)

**Files:** `src/core/vision/image.ts`, `layout.ts`, `cells.ts`, `regions.ts`; test `tests/vision/read.test.ts`, `tests/vision/load.ts`

Naměřeno na vzorcích: políčko 96 px, rozteč 104 px, rámeček 1 px (84,89,105), mezera tmavá (10,13,26), STASH začíná na (152,272), BACKPACK (1044,272), QUICK USE (1504,272).

Algoritmus: svislé úseky, kde je pixel o víc než 18 jasnější než tmavá mezera 3 px vedle (vlevo pro levý rámeček, vpravo pro pravý). Dvojice levý/pravý úsek se stejným rozsahem y a šířkou ≈ délce úseku a s vodorovnými rámečky nahoře i dole tvoří čtvercové políčko. Políčka stejné velikosti ve vzdálenosti jedné rozteče tvoří mřížku. Useknutý spodní řádek nemá spodní rámeček, takže se nepočítá. Zvýrazněné políčko bez běžného rámečku zůstane v mřížce jako místo `framed: false` a čte se podle obsahu.

- [x] Test: `detectLayout` na všech vzorcích najde 3 panely se správným počátkem a velikostí; na 1600×900 i 2560×1440 také.
- [x] Implementace a průchod testem.

### Task 2: Vzácnost, počty, tiery, hlavička a mince (HOTOVO jako ověřovací průzkum)

**Files:** `rarity.ts`, `digits.ts`, `glyphs.ts`, `read.ts`; generátor `tests/vision/glyphs.gen.test.ts`

- Text se prahuje podle barvy (krémová, zlatá, šedá), rozdělí na souvislé oblasti, slepené číslice se rozdělí v nejslabším sloupci, čárky se zahodí a trojice číslic se připojí zpět.
- Znak se porovná se vzory: měkká maska 7×11, poměr stran, výška a poloha v řádku, počet uzavřených otvorů (8 proti 6).
- „×“ se pozná i podle polohy (malý znak uprostřed výšky řádku).
- Tier: posun pravého ramene (V) a počet svislých tahů.
- Vzory: `GEN_GLYPHS=1 pnpm vitest run tests/vision/glyphs.gen.test.ts` ze vzorků v měřítku 1919, 1366 a 3200 px.

- [x] Testy podle specifikace (munice, celý stash, zbraně, batoh a quick use, „bez inventory“).
- [x] Robustnost 1600×900 a 2560×1440 (`tests/vision/robust.test.ts`).

### Task 3: Otisky ikon (HOTOVO jako ověřovací průzkum)

**Files:** `fingerprint.ts`; test `tests/vision/match.test.ts`

Otisk = 256 hodnot jasu 16×16 (pozadí a barva vzácnosti potlačeny) + 16 binů barevného histogramu, celá čísla 0–255. Podobnost = 0,8 × korelace rozmazaných jasových mřížek + 0,2 × průnik histogramů. Naměřeno: stejné předměty ≥ 0,985 (i napříč měřítky), různé ≤ 0,907.

- [x] **Krok 1: test** – `expected.json` → `sameItemGroups` (ručně odečtené skupiny): každá dvojice ze stejné skupiny > `MATCH_SURE`, každá dvojice z různých < `MATCH_MAYBE`.

```ts
for (const a of r.cells) for (const b of r.cells) if (key(a) < key(b)) {
  const s = similarity(a.fp, b.fp);
  if (gid(a) === gid(b)) expect(s).toBeGreaterThan(MATCH_SURE); else expect(s).toBeLessThan(MATCH_MAYBE);
}
```
- [x] **Krok 2:** spustit `pnpm vitest run tests/vision/match.test.ts`; očekáváno FAIL (chybí `match.ts` s konstantami).

### Task 4: Párování a shlukování (`match.ts`)

**Interfaces:**
- Produces:
```ts
export const MATCH_SURE = 0.95, MATCH_MAYBE = 0.93;
export type FpKind = 'material' | 'item';
export interface LearnedFp { id: string; itemKey: string; kind: FpKind; fp: number[]; rarity?: Rarity; at: number }
export interface CatalogFp { key: string; kind: FpKind; fp?: number[]; rarity?: Rarity }   // 3b
export interface Match { status: 'known' | 'uncertain' | 'unknown'; itemKey: string | null; kind: FpKind | null; score: number; source: 'learned' | 'catalog' | null }
export function matchFp(fp: number[], rarity: Rarity, learned: LearnedFp[], catalog?: CatalogFp[]): Match
export function clusterFps<T extends { fp: number[]; rarity: Rarity }>(xs: T[], thr?: number): T[][]
```
- Pravidla: naučené otisky mají přednost před katalogem; různá známá vzácnost = shoda se nepočítá (stejná ikona, jiná vzácnost je jiný předmět); `score ≥ SURE` → known, `≥ MAYBE` → uncertain, jinak unknown.

- [x] Test (`tests/vision/match.test.ts`): naučený otisk políčka (2,3) ze snímku s tooltipem → políčka (2,1), (2,2) jsou `known` se stejným `itemKey`; (2,0) je `unknown`; jiná vzácnost → `unknown`; shlukování skupin ze `sameItemGroups` = přesně ty skupiny (měřená přesnost párování).
- [x] Implementace, průchod.

### Task 5: Spojení snímků (`merge.ts`)

**Interfaces:**
```ts
export type Slot = CellRead | null;          // null = prázdné políčko
export interface MergedPanel { panel: PanelId; cols: number; rows: Slot[][]; source: { shot: number; row: number }[]; overlaps: number[]; warnings: ('noOverlap')[] }
export function panelRows(p: PanelRead): Slot[][]
export function rowsEqual(a: Slot[], b: Slot[]): boolean
export function mergePanels(panels: PanelRead[]): MergedPanel
export const occupied = (m: MergedPanel): number
```
Překryv = největší k, kdy posledních k řádků dosavadního výsledku = prvních k řádků dalšího snímku (otisk ≥ SURE, stejný počet a tier, prázdné = prázdné).

- [x] Test (`tests/vision/merge.test.ts`): z tooltip snímku pohled A (řádky 4+ zatřeny pozadím) a pohled B (obsah mřížky posunutý o 2 rozteče nahoru) → spojení má 6 řádků, 24 políček, počty = `countsByRow`, překryv 2; stejný snímek dvakrát → beze změny; snímky bez překryvu → varování `noOverlap`.
- [x] Implementace, průchod.

### Task 6: Schéma 3 a migrace

**Files:** `src/core/types.ts`, `state.ts`, `backup.ts`; test `tests/core/schema3.test.ts`

```ts
export type ItemCategory = 'weapon' | 'shield' | 'augment' | 'ammo' | 'quickUse' | 'key' | 'other';
export type ItemTier = 'I' | 'II' | 'III' | 'IV';
export interface ItemStock { key: string; name: string; category: ItemCategory; tier?: ItemTier; count: number }  // 3b
export interface VisionState { learned: LearnedFp[]; profile: { cellPx: number; ui: number } | null; lastImportAt: number }
// AppState: schema: 3; items: Record<string, ItemStock>; vision: VisionState
export const itemKey = (name: string, tier?: ItemTier) => tier ? `${name} ${tier}` : name;
export const LEARNED_MAX = 2000;
```
- [x] Test: stav schématu 2 (`SAMPLE` z testů) → `normalize` → `schema 3`, `items {}`, `vision.learned []`, ostatní beze změny; záloha schématu 2 i deník v1 se načtou; `makeBackup` obsahuje `items` i `vision`; záloha schématu 4 → „novější verze“; naučené otisky se ořežou na 2000 nejnovějších a vadné (špatná délka) se zahodí.
- [x] Implementace (`normalizeVision`, `normalizeItemStock`), `parseBackup` přijme schéma 2 i 3, průchod; úprava starších testů, které čekají `schema: 2`.

### Task 7: Převod výsledku na změny (`src/core/visionImport.ts`)

**Interfaces:**
```ts
export interface ImportShot { read: ScreenRead }
export interface ImportGroup { id: string; cells: { shot: number; row: number; col: number }[]; fp: number[]; rarity: Rarity; count: number | null; countSure: boolean; match: Match; tier: Tier | null }
export interface ImportAnalysis { groups: ImportGroup[]; merged: MergedPanel | null; headerSlots: number | null; headerSlotsMax: number | null; found: number; checksumOk: boolean; coins: number | null; stashValue: number | null; warnings: ImportWarning[] }
export type ImportWarning = VisionWarning | 'noOverlap' | 'differentState' | 'checksum';
export function analyzeShots(reads: ScreenRead[], learned: LearnedFp[]): ImportAnalysis
export type Target = { kind: 'material'; name: string } | { kind: 'newMaterial'; name: string } | { kind: 'skip' };
export interface VisionApply { rows: { group: ImportGroup; target: Target; count: number }[]; coins: number | null; zeroMissing: boolean; checksumOk: boolean; profile: { cellPx: number; ui: number } | null }
export interface VisionSummary { materials: number; zeroed: number; newMaterials: number; coins: number | null; learned: number; other: number }
export function applyVisionImport(s: AppState, input: VisionApply, now: number): VisionSummary
export function addLearned(list: LearnedFp[], entry: Omit<LearnedFp, 'id' | 'at'>, now: number): LearnedFp[]
```
Pravidla: skupiny = shoda s naučeným (stejný `itemKey`) nebo shluk neznámých; počet = součet (políčko bez počtu = 1); kontrolní součet `found === headerSlots`; nulování jen `zeroMissing && checksumOk && headerSlotsMax !== null` (filtrovaný pohled nemá maximum, nulování by smazalo vše mimo filtr); stejný materiál z více řádků se sečte; naučí se každá skupina, jejíž cíl se liší od shody nebo nebyla `known`; přeskočená skupina se naučí jako `kind: 'item', itemKey: ''`.

- [x] Testy (`tests/core/vision-import.test.ts`): přepis materiálů; nulování jen při sedícím součtu a zapnuté volbě; nový vlastní materiál; mince; učení a limit 2000; skupiny z tooltip snímku (13 skupin); kontrolní součet 7 z 7 u munice a 24 z 200 u celého stashe; rozdílná hodnota stashe → `differentState`.
- [x] Implementace, průchod.

### Task 8: Store

**Files:** `src/store/app.ts`; test v `tests/core/vision-import.test.ts`

```ts
async importFromScreens(input: VisionApply): Promise<VisionSummary | null>  // snímek 'import' → change(apply) → flush
clearLearned(): void
```
- [x] Test se zástupným úložištěm (jako `tests/core/store.test.ts`): po zápisu existuje snímek druhu `import` s původním stavem; materiály a mince jsou změněné; selhání snímku = nic se nezapíše; `clearLearned` vyprázdní `vision.learned`.
- [x] Implementace, průchod.

### Task 9: UI záložky „Ze snímku“ a Settings

**Files:** `src/ui/imageFile.ts`, `src/modules/ScreenImport.tsx`, `src/modules/Inventory.tsx`, `src/modules/Settings.tsx`, `src/ui/modules.css`, `src/i18n/cs.ts`, `en.ts`

- Vstup: `onPaste` (Ctrl+V, `clipboardData.files`), `onDrop`, `<input type="file" accept="image/*" multiple>`. Dekódování `createImageBitmap` → canvas → `getImageData`. Obrázky jen v paměti komponenty; po zápisu a při odchodu se zahodí.
- Náhled: canvas zmenšeného snímku, rámečky políček zelená / oranžová / červená (tokeny `--success`, `--warning`, `--danger`).
- Kontrolní součet „Nalezeno 24 z 200“ / „Nalezeno 7 z 7“.
- Tabulka: náhled ikony z vlastního snímku (canvas), poloha, předmět (výběr: materiály, „nový vlastní materiál…“, „jiný předmět (nezapisovat)“), rozpoznaný počet (editovatelný), uložený počet, změna, jistota.
- Volby mincí a nulování, tlačítko „Zapsat“, souhrn s odkazem do Zásoby.
- Settings → sekce Data: „Naučené ikony: N“ a „Smazat naučené“ s `Confirm`.

- [x] Texty do `cs.ts` a `en.ts`, `pnpm vitest run tests/i18n` projde.
- [x] `pnpm build` projde.

### Task 10: E2E

**Files:** `tests/e2e/screen-import.spec.ts`

- [x] cs: `#inventory/import`, nahrát `sample-stash-all-tooltip-1080p.png` přes file input, tabulka má 13 řádků, „Nalezeno 24 z 200“, nulování nedostupné; skupina s políčkem 2,3 → „Magnetic Accelerator“, jiná skupina → nový vlastní materiál; Zapsat; souhrn; Zásoba: Magnetic Accelerator = 8; profil: mince 51 060; druhé vložení (událost paste) → skupina rozpoznaná jako Magnetic Accelerator.
- [x] en: totéž s anglickými texty, munice (7 z 7, nulování dostupné).
- [x] `pnpm build && pnpm e2e` projde.

### Task 11: Verze, ověření, commit

- [x] Verze 0.4.0 (3 soubory), README (krátký odstavec o rozpoznávání).
- [x] `pnpm test`, `pnpm build`, `pnpm e2e`, `cd src-tauri && cargo test`, `pnpm tauri build`.
- [x] Jeden commit na `main` bez Co-Authored-By, bez push.

## Self-review

- Spec 1 (data): Task 6, 7. Spec 2 (jádro): Task 1–5. Kontrolní součet: Task 7. Tooltip: volitelný v 3a, nedělá se (odchylka do zprávy). Spec 3 (UI 3a): Task 9. Settings: Task 9. Spec 4 (chyby): `noInventory`, `scaleOdd`, `checksum`, `countUnreadable`, `differentState` v Task 2, 7, 9. Spec 5 (testy): Task 1–8, 10. Bezpečnostní test na `metaforge` patří ke katalogu (3b); přidá se už teď jako hlídání, že `src/` URL MetaForge neobsahuje.
- Typy: `LearnedFp` se definuje v `match.ts` a `types.ts` ho re-exportuje; `VisionApply`/`VisionSummary` jen v `visionImport.ts`.
