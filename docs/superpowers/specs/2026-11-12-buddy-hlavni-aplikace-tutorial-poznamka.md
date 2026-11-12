# Poznámka k příštímu buildu: Ops jako hlavní aplikace a dialogový tutoriál

Datum: 12. 11. 2026.
Stav: zaznamenané přání uživatele k pozdějšímu společnému projití, až bude Claude dostupný.
Nejde o hotovou funkci ani o pokyn začít implementovat. Číslo verze a pořadí vůči opravám snímání zatím neurčeno.

## Buddy jako hlavní vstup

- Uživatel chce, aby Ops byl hlavní aplikací, ne pouze doplňkem vedle velkého okna.
- Návrh: po spuštění se objeví buddy; kliknutí otevře panel s celou aplikací včetně profilu,
  inventáře, workshopu, úkolů, skill tree a statistik. Panel půjde zvětšit a po zavření zůstane Ops.
- Zachovat všechny moduly, stávající data a zálohy. Přístup k nastavení, skrytí a úplnému ukončení
  přes nabídku buddyho; možnost obnovit zobrazení ze systémové lišty.
- Snímání přes tlačítko nebo zkratku; před zápisem rozpoznaných změn vždy kontrola a potvrzení.

## Průvodce prvním spuštěním

Uživatel navrhl tutoriál a dialogy buddyho. K projití je následující průběh:

1. Přivítání a vysvětlení otevření/zavření panelu.
2. Profil: načtení podporovaného snímku, ruční vyplnění nebo obnova zálohy.
3. První snímek: zkratka, kontrola výsledku a výslovné potvrzení zápisu.
4. Orientace v inventáři, workshopu, úkolech a buildech.
5. Velikost a poloha buddyho, nastavení zkratky a volitelného spouštění s Windows.

Každý krok má jít přeskočit, tutoriál znovu otevřít v nastavení a dialogy vypnout.
Prázdný profil ani inventář nesmějí bránit spuštění buddyho. Tutoriál není povinná vstupní podmínka.
U snímání se nabídnou jen skutečně podporované obrazovky; nerozpoznané údaje se nebudou domýšlet.

## Dialogové bubliny a animace

Krátké předem připravené offline dialogy s volitelnými odpověďmi, navázané na gesta a animace Opse.
Nejde o generativní chat ani o hlasový doprovod. Bubliny nemají při hraní nevyžádaně rušit.

Ukázkové texty k doladění:

- Přivítání: „Čau, raidere. Jsem Ops. Ty nosíš kořist, já hlídám, co ti chybí. Dáme rychlou prohlídku?“
  Odpovědi: „Jdeme na to“ / „Už se vyznám“.
- Profil: „Nejdřív ať vím, s kým vyrážím. Otevři ve hře profil a pošli mi snímek. Nebo mi level napiš.“
  Odpovědi: „Načíst snímek“ / „Vyplnit ručně“ / „Později“.
- Kontrola: „Vidím level {level}. Sedí to? Bez tvého souhlasu nic nepřepíšu.“
  Odpovědi: „Sedí, uložit“ / „Opravit“. Hodnota musí pocházet ze skutečného výsledku rozpoznání.
- Závěr: „Máme základ. Kliknutím na mě otevřeš výbavu a plány. Budu tady, až se vrátíš.“

## Povaha Opse (schváleno 12. 11. 2026)

Uživatel chce volbu povahy Opse v dialozích. Inspirací je ukecanost a sebeironie Claptrapa z Borderlands,
ale přebírá se **jen tón textů**, nikdy vzhled ani hlášky té postavy (cizí IP).

- Volba v nastavení: **Věcný** / **Kamarádský** (výchozí) / **Drzý**. Každá hláška má varianty pro všechny tři povahy.
  - Věcný: „Chybí ti 2× Power Cable na Gear Bench 2.“
  - Kamarádský: „Ještě dva kabely a Gear Bench je tvůj, raidere.“
  - Drzý: „Dva kabely. DVA. Viděl jsem tě projít kolem tří a nechat je tam ležet.“
- Varianty se střídají (pro každou situaci víc hlášek), aby se neopakovaly pořád dokola.
- Drzost nikdy nesmí být urážlivá ani vulgární; žádné narážky na skutečné hráče.
- Při hraní Ops nevyrušuje (stejné pravidlo jako u zvuků): bubliny jen při práci s Opsem nebo overlayem.
- Připravené texty v CS i EN, offline, žádný AI chat.

## Kompaktní režim hlavního okna (schváleno 12. 11. 2026)

Uživatel zvolil **kompaktní režim** místo „Opse jako hlavní aplikace“: hlavní okno půjde přepnout do malého okna
(asi 420 × 720, volitelně vždy navrchu) s levelem a XP, mincemi, aktivními úkoly, nákupy, další úrovní stanice
a rychlými akcemi (snímek, zápis raidu, úklid stashe); jedním kliknutím zpět na celou aplikaci. Buddy zůstává
volitelný doplněk nad hrou. Návrh kreslí Sol v `docs/design/compact/`, implementace Opus.

## Při příštím projití s Claudem

- Upřesnit rozsah buildu, průběh dialogů a návaznost na připravované rozpoznávání profilu a dalších obrazovek.
- Stanovit ukládání postupu tutoriálu, návrat po přerušení a chování při importu existující zálohy.
- Prověřit první start bez dat, zobrazení bez přebírání fokusu hře a dostupnost aplikace při skrytém buddyovi.
- Zachovat rozdělení práce: Claude Code pro implementaci, ChatGPT pro vizuál a grafiku.

Související podklady: `2026-11-11-milniky-4-5-doplnky-buddy-design.md`
a `2026-11-11-rozpoznavani-ze-snimku-design.md` ve stejné složce.
