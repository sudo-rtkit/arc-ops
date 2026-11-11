# ARC Raiders Companion

Neoficiální offline desktopová aplikace pro hráče ARC Raiders (Tauri 2, React 19, TypeScript, Vite, pnpm).
UI je česky (výchozí) a anglicky; jazyk se přepíná v Settings & Backup.

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
