# Katalog MetaForge × materiály aplikace

Vygenerováno `scripts/gen-catalog.mjs` 2026-11-12. Materiály aplikace (deník, recepty stanic), které v katalogu
MetaForge pod stejným anglickým názvem nejsou: 0 z 110. Ke kontrole ručně (překlep, přejmenování ve hře, nebo
předmět, který MetaForge nevede). Rozpoznávání je u nich jen přes naučené otisky.

| Materiál v aplikaci | Podobné názvy v katalogu |
|---|---|
| — | žádné |

## ARC Tracker

Vygenerováno `scripts/gen-arctracker.mjs` 2026-11-12 (138 úkolů, 10 modulů hideoutu, 5 projektů).
Stanice aplikace pocházejí z původního deníku (`src/core/data/stations.ts`, hlídá je zlatý test) a skript je nepřepisuje.

### Workshop: rozdíly proti stanicím aplikace (4)

| Stanice | Pole | Rozdíl |
|---|---|---|
| Stash (`stash`) | — | modul v aplikaci není (12 úrovní, jen za Coins, bez materiálu) |
| Workbench (`workbench`) | — | modul v aplikaci není (bez úrovní) |
| Outpost 1 | proti projektu Sheltered Retreat, fáze 2 | shodné (úrovně 2–4 Outpostu ARC Tracker nemá) |
| Outpost (`outpost`) | — | v hideoutu ARC Tracker není (Outpost je tam projekt, ne modul) |

### Názvy předmětů v požadavcích, které katalog MetaForge nezná (0)

- žádné

### Předměty z požadavků úkolů a projektů, které nejsou mezi materiály aplikace (2)

Od 0.13.1 je každý materiál a loot z požadavků materiálem aplikace (`src/core/data/materials.ts`, hlídá
`tests/core/requirement-items.test.ts`), takže ho jde spočítat v Zásobě a nákupní seznam, Planner i postup s ním
počítají. Vybavení (klíč, předmět k použití) se eviduje ve Vybavení a počítá se stejně.

Vybavení, evidence ve Vybavení (2):

- Emperor Gateway Conduit (key)
- Remote Raider Flare (quickUse)

Bez evidence, ke kontrole (0):

- žádné

### Id předmětů bez názvu v /api/items (2)

- `coins`
- `raider_tokens`
