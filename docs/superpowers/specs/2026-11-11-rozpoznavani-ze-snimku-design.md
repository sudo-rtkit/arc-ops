# Rozpoznávání inventory ze snímků obrazovky – návrh

Stav: 11. 11. 2026, schváleno v konverzaci. Navazuje na verzi 0.3.1.

## Cíl

Hráč nemusí přepisovat stash a loot ručně. Vloží do aplikace snímky obrazovky, které sám pořídil. Aplikace z nich přečte předměty, počty a mince, ukáže výsledek ke kontrole a teprve po potvrzení ho zapíše.

## Mantinely (nemění se)

- **Žádná interakce se hrou.** Aplikace nečte paměť, soubory ani síť hry. Nesnímá obrazovku sama, nemá overlay ani globální klávesové zkratky a nesleduje složky. Pracuje jen s obrázkem, který jí hráč předá (vložení Ctrl+V, přetažení, výběr souboru). `tests/safety.test.ts` platí beze změny.
- **Offline.** Aplikace nic nestahuje. Herní grafika se do aplikace nepřibaluje.
- **Snímky se neukládají.** Po zpracování se zahodí. Uloží se jen naučené otisky ikon (čísla, ne obrázky).
- **Nic bez potvrzení.** Každý zápis jde přes potvrzovací tabulku. Před zápisem se vytvoří snímek stavu (`snapshot`, druh `import`).
- **Obě jazykové verze.** Všechny nové texty jdou přes slovník `cs` / `en`.

## Rozdělení

| Milník | Obsah |
|---|---|
| **3a** | rozpoznávací jádro, stash → materiály, mince → profil, učení neznámých ikon, kontrolní součet, spojení více snímků |
| **3b** | katalog s otisky z MetaForge, evidence všech předmětů (záložka Vybavení), loot z batohu v zápisu raidu |

Každý milník má vlastní testy, instalátor a commit. Verze: 3a = 0.4.0, 3b = 0.5.0.

## 1. Data

### Stav aplikace (schéma 3, migrace ze schématu 2)
- `inventory: Record<string, number>` **zůstává** pro materiály (Workshop, Planner, nákupní seznam).
- **Nové `items: Record<string, ItemStock>`** (3b) pro ostatní předměty: `{ key, name, category, tier?: 'I'|'II'|'III'|'IV', count }`. Klíč je `name` + `tier`. Kategorie: `weapon`, `shield`, `augment`, `ammo`, `quickUse`, `key`, `other`.
- **Nové `vision`**:
  - `learned: { id, itemKey, kind: 'material'|'item', fp: number[], at }[]`: naučené otisky (max. 2000, nejstarší se odmažou),
  - `profile?: { cellPx, ui }`: poslední změřená velikost políčka,
  - `lastImportAt`.
- Migrace 2 → 3 doplní prázdné `items` a `vision`. Starší stav, zálohy a deník v1 se načtou beze ztrát (test).
- Záloha (`makeBackup`) obsahuje `items` i `vision`.

### Katalog předmětů (3b, generuje se při vývoji)
- Skript `scripts/gen-catalog.mjs` jednorázově načte `https://metaforge.app/api/arc-raiders/items` (s cache v `scripts/.cache/`, která je v `.gitignore`). Skript je mimo `src/`, takže bezpečnostní test na `fetch(` v aplikaci dál platí.
- Výstup `src/core/data/catalog.ts`: `{ id, name, category, rarity, fp?: number[] }[]`. **Žádné obrázky ani popisy.**
- Ikony skript stáhne jen do cache, spočítá z nich otisk stejnou funkcí, jakou používá aplikace (`src/core/vision/fingerprint.ts`), a obrázky do repozitáře necommituje.
- Pokud API ikony nemá nebo je blokuje (Cloudflare 403), katalog obsahuje jen názvy a kategorie a rozpoznávání stojí na učení. Skript to vypíše.
- Názvy z katalogu se mapují na materiály z deníku (stejný anglický název). Neshody vypíše skript do `docs/superpowers/plans/catalog-mismatch.md` k ruční kontrole.
- Uvedení zdroje: v Settings sekce „Zdroje dat“ s textem „Data o předmětech: MetaForge (metaforge.app/arc-raiders), neoficiální, nejsou od Embarku.“ Odkaz se otevře jen na kliknutí, jako ostatní externí odkazy.
- Před použitím zkontrolovat aktuální podmínky MetaForge. Placené nebo zpeněžené použití vyžaduje jejich souhlas, ale aplikace je zdarma.

## 2. Rozpoznávací jádro (`src/core/vision/`)

Čisté funkce nad `{ width, height, data: Uint8ClampedArray }` (RGBA), bez DOM, testovatelné v Node. Žádná nová knihovna. V testech se PNG dekóduje vývojovou závislostí (`pngjs`).

| Modul | Úkol |
|---|---|
| `layout.ts` | Najde panely STASH, BACKPACK a QUICK USE a hlavičku s mincemi. Změří velikost a rozteč políček (ve vzorcích asi 96 px při 1919×1079). Pracuje s měřítkem, ne s pevnými souřadnicemi. **Snímky nemají přesně 1920×1080** (vzorky jsou 1919×1079). |
| `cells.ts` | Rozdělí panel na políčka. Pozná prázdné políčko a **ignoruje částečně viditelný spodní řádek**. Pro každé políčko vrátí výřezy: ikona (střed bez rohů), roh vzácnosti, ikona kategorie (vlevo dole), počet a tier (vpravo dole). |
| `rarity.ts` | Barva rohu → `common` (šedá), `uncommon` (zelená), `rare` (modrá), `epic` (růžová), `legendary` (žlutá/oranžová). Barva mimo tyto skupiny → `unknown`; vzácnost je jen pomocný signál a `unknown` rozpoznávání neblokuje. |
| `digits.ts` | Čtení „×19“, „×100“, tieru „I–IV“, „200/268“, „7“ a „51,060“. Porovnání se vzory číslic jednoho herního písma. Vzory se vytvoří z testovacích snímků a uloží jako binární masky malých rozměrů v `src/core/vision/glyphs.ts` (tvary číslic, ne herní grafika). |
| `fingerprint.ts` | Otisk ikony: výřez se zmenší na 16×16, potlačí se pozadí (barva vzácnosti) a spočítá se vektor (jas + barevný histogram, normalizovaný). Porovnání kosinovou podobností. |
| `match.ts` | Porovná otisk s naučenými otisky (přednost) a s katalogem. Vrátí nejlepší shodu a jistotu. Pod prahem vrátí výsledek „neznámé“. Pomocným signálem je kategorie z ikony vlevo dole. |
| `merge.ts` | Spojení více snímků stejného panelu: řádky se porovnají podle podpisu (otisky + počty). Překryv mezi po sobě jdoucími snímky se započítá jen jednou. Pořadí snímků je pořadí vložení. |
| `read.ts` | Vstupní bod `readScreenshot(img, ctx)` → `{ panel, headerSlots, headerSlotsMax, stashValue, coins, cells[], warnings[] }`. |

**Kontrolní součet:** pro stash musí platit, že počet obsazených políček ze všech snímků po spojení = `headerSlots`. Když nesedí, zobrazí se varování a volba „nastavit chybějící na 0“ není dostupná.

**Tooltip** (volitelný v 3a, povinný v 3b): když je na snímku tooltip, přečte se název předmětu z velkého písma. Tím se rovnou pojmenuje vybrané políčko (zvýrazněné rámečkem), takže se ho není potřeba učit ručně.

## 3. Uživatelské rozhraní

### Inventory → nová záložka „Ze snímku“ (3a)
1. Hráč vloží jeden nebo víc snímků (Ctrl+V, přetažení, výběr souborů).
2. Náhled snímku s vyznačenými políčky (zelená = rozpoznáno, oranžová = nejisté, červená = neznámé). Pod tím kontrolní součet „Nalezeno 26 z 26“ nebo varování.
3. Tabulka: předmět, rozpoznaný počet, uložený počet, změna, jistota. Každý řádek jde opravit (výběr předmětu ze seznamu, úprava počtu, vyřazení).
4. Neznámé políčko: výběr předmětu ze seznamu, nebo „nový vlastní materiál“. V 3a seznam obsahuje materiály z aplikace (včetně vlastních) a položku „jiný předmět (nezapisovat)“; v 3b k nim přibude katalog. Po potvrzení se otisk uloží do `vision.learned`.
5. Volby:
   - „Aktualizovat mince v profilu (51 060)“, výchozí zapnuto, když se mince přečetly,
   - „Nafotil(a) jsem celý stash, chybějící nastavit na 0“, dostupné jen při sedícím kontrolním součtu, výchozí vypnuto.
6. „Zapsat“ vytvoří snímek stavu a pak zapíše:
   - materiály dostanou přesný počet (přepis),
   - neznámý materiál se přidá do `materialsCustom`,
   - mince jdou do profilu,
   - ostatní předměty se v 3a jen ukážou v souhrnu, v 3b se zapíšou do `items`.
7. Potvrzení „Zapsáno: 14 materiálů, mince 51 060“ a odkaz zpět do Zásoby.

### Inventory → nová záložka „Vybavení“ (3b)
Seznam `items` po kategoriích s ručními úpravami (přidat, upravit počet, smazat) ve stejném stylu jako Zásoba.

### Zápis raidu → „Loot ze snímku“ (3b)
Snímek po raidu → rozpozná BACKPACK (a QUICK USE). Od výsledku se odečte výbava zadaná pro raid, zbytek se předvyplní do „Získané materiály (loot)“ ke kontrole. Převod do Inventory dál funguje jen tlačítkem jako dnes.

### Settings
- „Naučené ikony: 37 · Smazat naučené“ (s potvrzením).
- „Zdroje dat“ s MetaForge (3b).

## 4. Chybové stavy

| Situace | Chování |
|---|---|
| Na snímku není inventory | „Na snímku jsem nenašel inventory. Vlož snímek obrazovky INVENTORY (Tab).“ Nic se nezapisuje. |
| Jiné rozlišení nebo měřítko UI | Měřítko se změří podle políček. Když měření selže, zobrazí se hláška s doporučením 16:9 a výchozího měřítka UI. |
| Nesedí kontrolní součet | Varování s počty a nabídka vložit další snímek. Volba „chybějící na 0“ je nedostupná. |
| Nečitelný počet | Řádek je nejistý a počet se musí potvrdit ručně. |
| Snímky z různých dnů / jiný stash | Rozdílná hodnota stashe v hlavičce → varování „snímky nejsou ze stejného stavu“. |

## 5. Testy

- **Testovací snímky** v `tests/fixtures/vision/`: tři ukázky od uživatele (cizí inventář, 1919×1079) a ručně odečtené výsledky v `expected.json`. Později přibudou snímky z hráčovy hry. Hodnoty označené `verify: true` se před použitím jako pevné asserty ověří.
- **Jádro:**
  - **municí (filtr):** 7 políček s počty 6, 100, 56, 80, 68, 31, 3, hlavička 7, mince 51 060, prémiová měna 3 950,
  - **celý stash:** 24 celých políček s počty podle `expected.json`, ignorovaný 7. řádek, hlavička 200/268, hodnota stashe 752 983, tooltip „MAGNETIC ACCELERATOR“ pro políčko `row 2, col 3` (počítáno od 0, tedy 3. řádek, 4. sloupec),
  - **zbraně:** tiery podle `expected.json`, políčka bez počtu nemají počet,
  - batoh 2/14 s počty 64 a 8, quick use 2 a 1,
  - **otisky:** stejný předmět ve dvou políčkách má podobnost nad prahem, různé předměty pod prahem (vzorky ze snímků),
  - **spojení:** z jednoho snímku se uměle vyříznou dva překrývající se pohledy a spojení nesmí zdvojit řádky,
  - **robustnost:** snímek zmenšený na 1600×900 a zvětšený na 2560×1440 dá stejné počty.
- **Store:**
  - přepis materiálů, nulování jen při sedícím součtu a zapnuté volbě,
  - nový vlastní materiál, mince do profilu, snímek stavu před zápisem,
  - učení otisku, limit naučených otisků,
  - migrace schématu 2 → 3, záloha s novými poli.
- **E2E:** vložení testovacího snímku do záložky „Ze snímku“, kontrola tabulky, pojmenování neznámého, zápis a kontrola Zásoby a profilu, v obou jazycích.
- **Bezpečnost:** `tests/safety.test.ts` beze změny prochází. Nový test hlídá, že `src/` neobsahuje URL `metaforge` kromě textu odkazu v Settings.

## 6. Mimo rozsah

- Overlay nad hrou, automatické snímání, sledování složek.
- Buddy maskot a ikona v oznamovací oblasti (samostatný budoucí milník, grafika GPT-6.1 Sol).
- Čtení popisů předmětů, receptů a cen z MetaForge (případně samostatný návrh „datový balíček“).
