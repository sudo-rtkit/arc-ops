# Milník 2 – nové funkce: plán

Datum: 11. 11. 2026 · Podklad: spec `2026-11-10-arc-raiders-companion-design.md` (kap. 4, 8, 9, 13), analýza `01-analyza-puvodniho-deniku.md` (kap. 8, 9).
Vizuál: stávající komponenty jen jako funkční přechodné UI, žádný nový vizuální návrh (`docs/visual-design.md` se nepoužívá).

## Datový model (schéma zůstává 2, `normalize` doplní výchozí hodnoty)

| Pole | Obsah |
|---|---|
| `raids[]` + | `loadout` (id), `gear[]`, `loot[]`, `lost[]` (položka + počet, duplicitní názvy se sečtou), `goals[]` (id splněných cílů), `lootApplied[]` (co už bylo převedeno do Inventory) |
| `goals[]` | `id, title, note, priority 1–3, due, createdAt, doneAt, doneRaid, link` – vazba `manual / level / station / skill / coins / material / trials` |
| `planner` | `stations {stanice: cílová úroveň}`, `items[]` (crafting × počet, vlastní cíl), `includeGoals` |
| `loadouts[]` | `id, name, purpose, primary, secondary, augment, shield, items[], note` |
| `checklists.templates` | víc vlastních šablon; výchozí „Před raidem“ zůstává a jde vrátit |
| `gameData` + | `routes / routesCustom / routesHidden`, `sell / sellCustom / sellHidden` (stejné skládání jako ARC a zbraně) |
| `dashboard.order` + | karty `goals`, `recs` (starší stav je dostane na konec) |

## Pravidla bez duplicit

- Raid se zapisuje jednou: úprava nemění kola, mince ani zásobu.
- Loot → Inventory jen tlačítkem. Převede se rozdíl `loot − lootApplied`, takže druhé stisknutí nic nepřičte; vrácení odečte přesně převedené. Smazání raidu zásobu nemění, pokud uživatel výslovně nezvolí vrácení převodu.
- Cíl splněný raidem: množinově podle id; odebrání z raidu cíl znovu otevře jen tehdy, když ho splnil právě ten raid.
- Material Planner: stanice se počítají přes jednu cílovou úroveň = max(plán, otevřené cíle stanic), každá úroveň jednou; každý požadavek nese klíč zdroje a agregace podle klíče vylučuje dvojí započtení. Souběh = materiál, kterého je dost pro každý zdroj zvlášť, ale ne pro všechny dohromady.
- Planner jen plánuje, materiál neodečítá (odečet zůstává u upgradu ve Workshopu).

## Jádro (`src/core`)
`goals.ts` (progres, synchronizace splnění), `planner.ts`, `loadouts.ts` (statistiky podle loadoutu, ztráty), `recommend.ts` (vysvětlitelná doporučení jen z lokálních dat), `raidItems.ts` (položky, rozdíl převodu), rozšíření `state.ts`, `gamedata.ts` (trasy, ceník), `runs.ts`.

## UI (14 položek navigace beze změny)
Dashboard: záložky Přehled / Cíle / Doporučení, karty aktivních cílů a doporučení. Inventory: záložka Material Planner. Weapons: záložka Loadouty. Raid Journal: detail raidu, převod lootu, filtr loadoutu. Formulář raidu: loadout, výbava, loot, ztráty, cíle. Raid Checklist: šablony (přidat, přejmenovat, položky, pořadí, smazat). Money Runs: úprava tras a ceníku. Statistics: dokončené cíle, loadouty, ztráty, loot. Settings: reset nových modulů s potvrzením.

## Testy
Vitest: normalizace a zpětné načtení schema 2 (milník 1) i deníku v1, záloha všech nových polí, idempotentní převod lootu, úprava raidu bez dvojího započtení, cíle, planner bez duplicit, doporučení, trasy a ceník. Zlaté testy beze změny. Playwright: cíl, raid s lootem a převodem, šablona checklistu, planner, loadout, úprava trasy a ceníku.

## Závěr
`pnpm test`, `cargo test`, `pnpm build`, `pnpm e2e`, `pnpm tauri build`; verze 0.2.0.
