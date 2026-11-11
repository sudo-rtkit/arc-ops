# Zdroje herních dat

Stav: 10. 11. 2026. Rešerše proběhla při vývoji; hotová aplikace nic nestahuje.

## Původ údajů

| Původ | Co | Jak je označeno v aplikaci |
|---|---|---|
| Deník | skilly, plány, buildy, stanice a recepty, původ materiálů, mapy, podmínky, trasy, ceník, ARC taktiky a dropy, tier list a anti-ARC, zbraně podle fáze, změny 2.0, další kroky, checklist | badge `Deník` |
| Rešerše | u ARC typ, kategorie a slabiny; u zbraní kategorie a munice | badge `Rešerše · neověřeno`, odkaz na zdroj |
| Vlastní | cokoli, co zadá nebo upraví uživatel | badge `Vlastní` / `Upraveno` |

Údaje z deníku se rešerší nemění (hlídá `tests/golden/data.test.ts`). Rešerše jen doplňuje prázdná pole v `src/core/data/arcMeta.ts` a `src/core/data/weaponMeta.ts`.

## Použité zdroje

| Zdroj | Použito pro | Datum čtení |
|---|---|---|
| [arcraiders.wiki – ARC](https://arcraiders.wiki/wiki/ARC) | typ (velikostní skupina), kategorie a slabiny 18 ARC jednotek z deníku | 10. 11. 2026 |
| [allthings.how – How to defeat every ARC enemy](https://allthings.how/how-to-defeat-every-arc-enemy-in-arc-raiders-weak-points-and-loot/) | potvrzení slabin Bastionu a Bombardieru | 10. 11. 2026 |
| [arcraiders.wiki – Weapons](https://arcraiders.wiki/wiki/Weapons) | třída a typ munice všech 26 zbraní z deníku | 10. 11. 2026 |

Další prohledané stránky (bez převzatých údajů, protože si odporovaly nebo údaje neměly): prima­games.com, beebom.com, techwiser.com, metaforge.app.

## Co se nepodařilo doložit

- **Nebezpečnost a obtížnost ARC:** žádný zdroj je neuvádí jednotně (wiki má jen XP za zničení). Pole zůstávají prázdná a UI ukazuje „Neuvedeno“; uživatel je může vyplnit sám.
- **Doporučená výbava a vlastnosti ARC:** mimo taktiky z deníku nedoloženo, prázdné.
- **Skulker:** wiki neuvádí slabiny.
- **Popis zbraní:** prázdný.

Pozor: wiki odráží stav hry v době čtení. Po patchi se údaje mohou lišit; proto zůstávají označené jako neověřené.
