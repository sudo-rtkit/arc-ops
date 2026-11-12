# Noční plán 12.–13. 11. 2026

Uživatel šel spát (budík 9:30) a pověřil pokračovat, jako by navržené věci potvrdil. Cíl na ráno:
**2 nové verze k vyzkoušení** a, pokud vyjdou kredity, doplňky „co nám chybí“ jako **podverze posledního buildu**.
Nic se nepushuje bez výslovného pokynu uživatele (jen lokální commity a instalátory).

## Poznámky pro další úpravy

- **Aktualizace přes instalátor** (přání uživatele, 12. 11. 2026; zatím k realizaci a ověření):
  Pokud už je aplikace nainstalovaná, spuštění instalátoru nové verze má aktualizovat stávající instalaci
  bez nutnosti ruční odinstalace. Zachovat uživatelská data, postup a nastavení; nevytvářet druhou instalaci
  ani duplicitní zástupce. Ověřit také opětovné spuštění instalátoru stejné verze a aktualizaci, když aplikace
  běží nebo je schovaná v tray.
  **Stav (0.10.2):** hotovo. Hook předvybere u novější verze instalaci přes stávající (bez průvodce odinstalace).
  Ověřeno tichou instalací testovací identity (jiný název, identifikátor i vydavatel, aby se nedotkla skutečné instalace):
  0.10.1 → 0.10.2 na místě, stejná složka, jeden zástupce, data zachována, stejná verze znovu v pořádku, proces držící exe
  instalátor ukončil. Grafický průchod (předvolba na stránce) neověřen spuštěním, jen překladem; viz README 0.10.2.

## Verze

1. **0.9.0: kompaktní režim** (Opus, běží): malé okno podle `docs/design/compact/`, připnutí jen v kompaktu,
   dialog při prvním zavření (skrýt do tray / ukončit + „zapamatovat“), ikona v oznamovací oblasti s menu.
2. **0.10.0: Bedňák 2.0** (grafika Sol běží v `docs/design/buddy/bednak2/`, pak Opus): výměna Opse za nového
   Bedňáka (roh 96 px + detail 128/256 px, všechny animace, vývoj 0–75), nová ikona aplikace a tray ikona,
   **zvuky** (generované, tiché při hraní, hlasitost), **povahy Opse** (Věcný/Kamarádský/Drzý) a **průvodce prvním
   spuštěním** s bublinami podle `docs/superpowers/specs/2026-11-12-buddy-hlavni-aplikace-tutorial-poznamka.md`.
3. **Podverze posledního buildu (0.10.1, příp. 0.9.1 podle pořadí dokončení): doplňky „co nám chybí“**, pokud
   vyjdou kredity, v tomto pořadí:
   1. rozpoznávání dalších obrazovek ze snímku: **profil** (level, XP, mince), **dílna** (úroveň stanice
      a požadavky), **úkoly u obchodníka** (splněné cíle), **skill tree** (body u skillů); testovací podklady
      a očekávané hodnoty jsou v `tests/fixtures/vision/own/return-and-progression/` (jen lokálně), testy „todo“
      už existují; vždy jen návrh ke schválení, nic bez potvrzení,
   2. přístup k celé aplikaci z overlaye (dříve navržený milník 6),
   3. drobnosti nalezené při ověřování.

## Rozhodnutí přijatá za uživatele (dle jeho pověření)

- Bedňák 2.0 se bere tak, jak ho Sol dodá, pokud projde kontrolou (čitelnost v rohu, odlišné siluety podob,
  žádné přeplácání). Při zjevném problému se vrátí Sol s konkrétní zpětnou vazbou.
- Nová ikona aplikace = návrh z Bedňáka 2.0.
- Výchozí povaha Opse: Kamarádský. Zvuky ve výchozím stavu zapnuté na nízkou hlasitost, při hraní mlčí.
- Průvodce lze přeskočit a znovu spustit v nastavení.

## Stav (doplňuje se průběžně)

- **0.9.0: hotovo** (commit fbb079e, neodesláno). Ověřeno: 505 unit testů, 71 E2E, 16 Rust testů, typová kontrola,
  ruční zkouška v sestavené aplikaci (start na pozadí bez fokusu, přepínání režimů, připnutí, dialog zavření,
  skrytí do tray, druhé spuštění obnoví okno). **Ráno vyzkoušet:** klik na ikonu v tray a její menu (nešlo ověřit
  bez myši) a vzhled tray ikony. Instalátor: `src-tauri/target/release/bundle/nsis/ARC Raiders Companion_0.9.0_x64-setup.exe`.
  K zvážení: postup úkolů v kompaktu = dodané předměty (ne cíle), kompaktní okno se schovává i před vlastními
  snímky obrazovky, Snímek vyžaduje nastavenou zkratku.
- **0.10.0: hotovo** (commit 5f2ac2c, neodesláno). Bedňák 2.0 (roh 96 px, detail 128 px, 23 animací navázaných
  na události), nová ikona aplikace i tray, zvuky (Web Audio, výchozí 25 %, hrají jen v okně Opse, které právě
  používáš; při hře v popředí mlčí), povahy Věcný/Kamarádský/Drzý (34 situací, CS i EN), průvodce prvním spuštěním
  (nemodální, přeskočitelný, znovu v Nastavení), schéma 8 (`opsPrefs`). Ověřeno: 526 unit testů, 79 E2E, 16 Rust
  testů, typová kontrola, instalátor; ruční spuštění na kopii skutečného stavu bez převzetí fokusu.
  Instalátor: `src-tauri/target/release/bundle/nsis/ARC Raiders Companion_0.10.0_x64-setup.exe`.
  **Ráno vyzkoušet:** vzhled buddyho a overlaye (okno buddyho je vynechané ze snímků, nešlo ověřit), zvuky
  a hlasitost, tray ikona. Průvodce se jednou ukáže i při upgradu. K zvážení: řádek Opse v kompaktu má 128 px
  a ubírá místo; v plném okně karta průvodce vlevo dole překrývá obsah.
- **0.10.1: hotovo** (commit e079543, neodesláno). Rozpoznávání ze snímku (hra v angličtině), vždy jako návrh
  s jistotou u každého pole a potvrzením: **profil** (level, XP, mince → zápis), **dílna** přehled (úrovně stanic,
  Gear Bench a Gunsmith jisté, ostatní k potvrzení) a detail stanice (úroveň; materiály jen informačně),
  **úkoly** (název, obchodník, zaškrtnuté cíle jen zobrazené, úkol se nikdy sám nesplní), **skill tree** (součty
  větví jen kontrola; ranky jen z tooltipu skillu). Na vlastních snímcích vše správně ve 4 rozlišeních. Vstup:
  overlay po zkratce nebo Profil → „Načíst ze snímku“ (soubor, vložení, přetažení); krok průvodce je aktivní.
  Overlay má nové záložky Profil, Inventář, Dílna, Skilly (rychlé úpravy, „Otevřít v aplikaci“). Drobnosti: Ops
  v kompaktu 96 px, karta průvodce už nepřekrývá konec stránky. Ověřeno: 576 unit testů, 85 E2E, 16 Rust testů,
  typová kontrola, instalátor. Instalátor: `src-tauri/target/release/bundle/nsis/ARC Raiders Companion_0.10.1_x64-setup.exe`.
  **Ráno vyzkoušet:** snímek profilu, dílny, úkolu a tooltipu skillu ve hře; nové záložky overlaye.
  Nehotové: sledování postupu cílů úkolů (vyžaduje schéma 9), názvy materiálů se ze snímku nečtou, pořadí dlaždic
  Utility/Medical/Refiner/Explosives odvozené z ikon a neověřené, vyšší úrovně stanic jen v syntetických testech.
- **0.10.2: hotovo** (commit bdceafd, neodesláno). Cíle úkolů: zaškrtávátka v modulu Úkoly, postup „Cíle 2/4“
  v seznamu, kompaktu a overlayi; snímek úkolu navrhne zaškrtnuté cíle (jen když sedí počet cílů; úkol se sám
  nikdy nesplní). Schéma 9. Instalátor novější verze předvybere instalaci přes stávající, data zůstanou.
  Ověřeno: 596 unit testů, 87 E2E, 16 Rust testů, typová kontrola, tichá instalace přes starší verzi na zkušební kopii.
  Instalátor: `src-tauri/target/release/bundle/nsis/ARC Raiders Companion_0.10.2_x64-setup.exe`.
  **Vyzkoušet:** grafický instalátor přes nainstalovanou 0.10.1 (předvolba „Instalovat přes stávající“), zaškrtnutí
  cílů a snímek úkolu ve hře.
- Bedňák 2.0 grafika: **hotová a přijatá** (`docs/design/buddy/bednak2/`): 5 podob s odlišnou siluetou (legenda
  výrazně větší), roh 96 px čitelný na tmavém, šedém i světlém pozadí díky meruňkovému okraji, 27 animací
  v obou variantách, 8 výrazů, nová ikona (čistá hlava Bedňáka). Výhrada: na levelech 60+ je detail trochu hustší,
  ale čitelný; případné doladění až po zkoušce v aplikaci. Integrace (0.10.0) začne po dokončení 0.9.0.


## Buddy visibility fix 0.12.1

- Built on 0.12.0. Automatic buddy visibility follows a visible, non-minimized game window; checked every second. Manual hiding takes priority.
- Events arrive directly through bus.ts, not native.ts.
- Validation: type check, production build, 637 unit tests (4 skipped), 16 Rust tests; subsequently added visibility regression test passed (15 tests in its suite).
- NSIS installer built successfully in src-tauri/target/release/bundle/nsis/.
- Still needs an in-game minimize/restore check. Occlusion by another window does not count as hiding.

## 0.13.0: rozehraná kola miniher

- Postaveno na 0.12.1 (oprava viditelnosti buddyho přes bus.ts zachována). Všechny tři minihry ukládají rozehrané kolo
  po každém tahu (schéma 12, `gameRounds`) a pokračují v něm po odchodu i restartu aplikace: Tetris batoh s otočením
  a předmět v ruce, kvíz otázka, zvolená odpověď a skóre, hack uzel, otočení dlaždic a tahy. Rozcestník nabízí
  Pokračovat / Nové kolo (s potvrzením, zahodí jen tu hru); jiné číslo kola v adrese se zeptá. Dohrání i odpověď
  připíšou odměny v jedné změně se značkou kola, takže návrat do dohraného kola ani zodpovězené otázky nic
  nezapočítá podruhé. Vadné nebo nekompatibilní kolo (otisk kola, meze, pravidla hry) se zahodí jen pro tu hru.
  Import zálohy: přednost má kolo tohoto počítače. Stav a zálohy schématu 11 a starší se načtou s prázdnými koly.
- Ověřeno: typová kontrola, produkční build, 651 unit testů (4 přeskočené), 103 E2E (nově `minigames-resume.spec.ts`,
  8 testů), 16 Rust testů. Instalátor: `src-tauri/target/release/bundle/nsis/ARC Raiders Companion_0.13.0_x64-setup.exe`.
- Omezení: obnovený kvíz zůstává v jazyce, ve kterém začal; tvrdé ukončení procesu těsně po tahu může ztratit poslední
  tah (zpožděný zápis stavu).
- **Vyzkoušet ručně:** v nainstalované aplikaci rozehrát každou hru, zavřít aplikaci (i přes tray), znovu spustit
  a pokračovat; upgrade z 0.12.1 se skutečnými daty (rekordy a nátěry zůstanou).

## 0.13.1: buddy jen nad hrou, Cable Stripper, předměty z požadavků

- Automatický buddy je vidět, jen když je v popředí hra (viditelná, ne minimalizovaná) nebo okno aplikace. Jinak se
  po 400 ms schová. Stejná hlídací smyčka, krok 150 ms, seznam procesů dál jednou za sekundu. První zobrazení
  buddyho jde bez aktivace (`buddy_reveal`, `SW_SHOWNOACTIVATE`).
- „Cable Strippers“ → „Cable Stripper“ s migrací uloženého stavu (`src/core/materialRename.ts`). 39 předmětů
  z požadavků je teď materiálem aplikace. Dva předměty z Vybavení (klíč a Remote Raider Flare) nákupní seznam
  a Planner započítají. `catalog-mismatch.md` přegenerováno offline.
- Ověřeno: typová kontrola, produkční build, 661 unit testů (4 přeskočené), 103 E2E, 21 Rust testů.
  Instalátor: `src-tauri/target/release/bundle/nsis/ARC Raiders Companion_0.13.1_x64-setup.exe`.
- **Vyzkoušet ručně ve hře:** alt-tab do prohlížeče (buddy zmizí asi po 0,4 s a vrátí se s hrou), klik na buddyho
  a otevření overlaye (zůstane), hlavní okno v popředí nad hrou (zůstane a nevezme mu fokus), minimalizace hry.
