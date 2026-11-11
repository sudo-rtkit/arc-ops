# Milníky 4 a 5: doplňky z konkurence, buddy a zkratka – návrh

Stav: 11. 11. 2026, schváleno v konverzaci. Navazuje na 0.5.0 (milník 3b). Další jazyky zatím ne (jen CS a EN).

## Proč

Srovnání se sedmi aplikacemi pro ARC Raiders (MetaForge, ARC Tracker, Arc Companion, ARC Forge, Raider's Toolkit,
Arc Raiders Companion od Treestn, Ramskin) ukázalo funkce, které nám chybí a dají se udělat offline a bez rizika pro
herní účet. Milník 4 je doplní. Milník 5 přidá buddyho nad hrou a snímek na zkratku, který hráč zapne sám.

## Mantinely

Platí mantinely z `2026-11-11-rozpoznavani-ze-snimku-design.md` s jedinou změnou v milníku 5 (viz níže):

- Žádné napojení na herní účet, žádné tokeny ani uživatelská API (podmínky hry to zakazují).
- Aplikace je offline. Katalogy se stahují jen při vývoji skripty ve `scripts/` z veřejných endpointů.
- Herní grafika se nepřibaluje. Mapy s body lootu proto ne, jen odkaz ven (otevře se na kliknutí).
- Nic se nezapisuje bez potvrzení. Všechny texty CS a EN.

## Milník 4 – Doplňky (0.6.0)

1. **Rada „nech / prodej / recykluj“** u každého předmětu v Zásobě a Vybavení a v nové záložce „Úklid stashe“:
   - **Nech**: předmět je potřeba pro další úroveň stanice, dostupný úkol, fázi projektu nebo cíl. Ukáže se proč
     a kolik (např. „Úkol Trash into Treasure: 3 ze 6“).
   - **Recykluj**: není potřeba, ale recyklací vznikne potřebný materiál. Ukáže se, co vznikne.
   - **Prodej**: ani jedno. Ukáže se prodejní hodnota.
   - Záložka řadí podle hodnoty na políčko a ukazuje, kolik míst ve stashi se uvolní.
   - Pravidla jsou čistá funkce v `src/core/` s testy. Hráč může radu u předmětu přepsat („vždy nechat“).
2. **Přehled recyklace**: co z předmětu vznikne, a obráceně, ze kterých předmětů získám daný materiál
   (seřazeno podle výtěžku, vlastněné předměty zvýrazněné).
3. **Blueprinty**: seznam z katalogu, ruční odškrtnutí naučených, filtr chybějících.
4. **Obchodníci**: nabídka, ceny a denní limity, pokud je katalogy obsahují. Data jsou statická, proto se u nich vždy
   ukáže datum stažení. Když zdroj nabídku nemá, funkce se vynechá a uvede se to v reportu.
5. **Porovnání zbraní**: 2–4 zbraně vedle sebe ze stávajících dat (včetně ručních úprav), lepší hodnota zvýrazněná.
6. **Tier list**: vlastní žebříček S–D pro zbraně a předměty, přetahování, uložený ve stavu a v záloze.
7. **Rozpis událostí**: odkaz na oficiální přehled událostí od Embarku (ověřit adresu), otevře se na kliknutí.

**Data:** katalog z MetaForge (a případně ARC Tracker `/api/items`) se rozšíří o čísla potřebná výše: prodejní
hodnota, hmotnost, velikost stacku, výstupy recyklace, příznak blueprintu, nabídka obchodníků. Stále bez obrázků
a bez popisů. Případná migrace stavu (schéma 5) jako u předchozích milníků, včetně zálohy.

## Milník 5 – Buddy, overlay a zkratka (0.7.0)

**Změna mantinelu:** původně „žádný overlay ani globální zkratky, aplikace sama nesnímá obrazovku“. Nově je povolen
buddy, overlay a snímek na zkratku, ale **jen po zapnutí v nastavení (výchozí stav vypnuto)** a za těchto pravidel:

- **Snímek jen na stisk zkratky** (nebo tlačítka v overlayi), nikdy nepřetržitě. Snímá se obrazovka (Windows
  Graphics Capture nebo kopie plochy), jako Win+PrtScn. Do hry se nic nevkládá, z její paměti ani souborů se nic nečte.
  Hra musí běžet v okně bez rámečku (borderless).
- **Zkratka přes RegisterHotKey** (`tauri-plugin-global-shortcut`), žádné nízkoúrovňové háčky klávesnice.
- **Aplikace nikdy neposílá do hry vstup** (klávesy, myš, posouvání). Stash posouvá hráč.
- **Snímek se zpracuje v paměti a zahodí.** Když na něm není inventory, zahodí se bez čtení.
- **Do raidu žádná výhoda:** overlay ukazuje jen data aplikace (úkoly, nákupy, rady, výsledek snímku). Žádné mapy,
  pozice ani zvýraznění v herní mřížce.
- **Rozpoznání spuštěné hry** (volitelné, výchozí vypnuto) jen podle seznamu běžících procesů.

**Okna:**
- **Buddy „Ops“**: malé okno vždy navrchu, bez rámečku, průhledné jen kolem postavičky, přetahovatelné, poloha se
  pamatuje. Pixel art, vlastní postavička (žádná kopie ARC jednotek). Stavy: klid, skenuje, hotovo, nejistý, spí,
  upozornění. Zvětšuje se celým násobkem.
- **Overlay**: otevře se kliknutím na buddyho. Matné sklo (acrylic ve Windows 11) s neprůhledností nastavitelnou
  70–100 % (výchozí 90 %). Kliky přijímá normálně, není proklikávací. Zavření kliknutím na buddyho, Esc nebo zkratkou.
  Záložky: Přehled, Úkoly, Nákupy, Ze snímku (výsledek ke schválení a zápis).

**Vzhled overlaye:** „teplý taktický HUD“ s post-apokalyptickou atmosférou ARC Raiders:
- tvary ze stylu XCOM 2 (zkosené panely, rohové značky, hlavičky jako hlášení „OPS // STASH“, úkoly jako karty
  operací), ale žádné převzaté rozhraní, ikony, písmo ani logo,
- barvy aplikace „Teplý grafit“ (grafitové matné sklo, krémový text, meruňkové akce) a **rarity v přesných barvách
  hry** (common `#BEB7AF`, uncommon `#20B850`, rare `#00A8F0`, epic `#C83098`, legendary `#F8C000`),
- post-apo detaily střídmě, aby neutrpěla čitelnost: odřené hrany a šrouby, kus pásky na rohu, šablonové
  (stencil) popisky, jemný šum nebo prach, razítka a poznámky jako v polním zápisníku,
- bez pruhů z loga ARC a bez jakékoli herní grafiky.

**Grafika:** GPT-6.1 Sol. Vybraný buddy: návrh **B „Bedňák“** (`docs/design/buddy/concepts/b/`), animace
v `docs/design/buddy/final/`. Kód: Opus.

**Bezpečnostní testy (nové):** v `src-tauri/` ani `src/` se nesmí objevit `SendInput`, `keybd_event`, `mouse_event`,
`SetWindowsHookEx`, `ReadProcessMemory`, `WriteProcessMemory`, `CreateRemoteThread`, `OpenProcess` s právy ke čtení
paměti, ani síťový klient. Snímání a zkratka žijí v jednom vyhrazeném modulu, který test povoluje jmenovitě.
`tests/safety.test.ts` dál prochází.

### Schválené rozšíření: Ops roste s hráčem

Uživatel schválil postupný vizuální vývoj buddyho podle levelu hráče uloženého v profilu Companionu.
Ops zůstává rozpoznatelným Bedňákem B; s vyšším levelem získává výbavu, pancíř a propracovanější
post-apokalyptické detaily. Při přechodu do další vývojové podoby přehraje krátkou animaci proměny.
Vývoj neřídí výdělek, úspěšnost raidů ani jiné hodnocení výkonu. Není potřeba získávat stav přímo ze hry.

Vývojová podoba je nezávislá na momentálním animačním stavu (klid, skenování, hotovo, nejistota,
spánek, upozornění, tažení). Grafiku připravuje ChatGPT, implementaci Claude Code.
**Rozhodnuto (11. 11. 2026): Ops složený z vrstev, jiný na každém levelu 0–75.**
- **Mřížka 64 px** (místo 32 px), nad hrou 64 px, v overlayi 128 px, vždy celý násobek.
- **5 podob těla** po 15 levelech: 0–14 začátečník, 15–29 průzkumník, 30–44 mrchožrout, 45–59 veterán,
  60–75 legenda. Přechod mezi podobami = animace proměny.
- **Díly výbavy** ve slotech (anténa, hledí, pancíř, batoh, nářadí, nášivky, barva/záplaty, štítek s číslem
  levelu), 3–5 variant na slot, celkem zhruba 75 odemčení: **každý level odemkne nebo vymění aspoň jeden díl**.
  Běžný level = krátké bliknutí a hláška („Level 23: nová anténa“).
- **Kotvicí body** (hlava, záda, ruka…) pro každý snímek každé animace v `sprites.json`, takže díly se hýbou
  s Opsem ve všech stavech a nekreslí se zvlášť pro každou animaci. Skládání vrstev dělá aplikace na plátně.
- **Šatník:** odemčené díly lze libovolně kombinovat; výchozí „automaticky podle levelu“.
- **Pokles levelu** (import profilu, reset): odemčené díly zůstávají jako sbírka, mění se jen výchozí podoba.
  Odemčení se ukládá ve stavu a v záloze.
- Grafika: GPT-6.1 Sol (podoby, díly, kotvy, proměna, náhled s posuvníkem 0–75). Implementace: Opus v milníku 5.

## Testy

Jako u předchozích milníků: jednotkové testy pravidel (rada, recyklace, porovnání), migrace a zálohy, E2E v obou
jazycích. U milníku 5 navíc test, že výchozí stav je vypnuto a že zahozený snímek nic nezapíše.

## Mimo rozsah

Interaktivní mapy s herní grafikou, synchronizace s účtem, burza a chat mezi hráči, AI asistent, mobilní aplikace,
automatické posouvání stashe, další jazyky.
