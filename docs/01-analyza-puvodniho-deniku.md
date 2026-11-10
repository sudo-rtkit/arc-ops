# ARC Raiders Companion – Etapa 1: analýza původního deníku a návrh migrace

Stav: 10. 11. 2026. Tento dokument je inventura původního HTML deníku. Slouží jako kontrolní seznam: co v deníku je, musí být i v nové aplikaci, nebo tu musí být napsáno, proč ne a čím se to nahrazuje.

## 1. Zdrojové soubory

| Soubor | Uloženo | Řádků | Poznámka |
|---|---|---|---|
| `Downloads\ARC Raiders deník.html` | 8. 11. 2026 03:29 | 1 568 | starší verze |
| `Downloads\ARC Raiders deník (1).html` | 8. 11. 2026 17:07 | 1 624 | novější verze, **navrhuji jako referenci** |

Novější verze obsahuje vše ze starší a navíc: druhý plán buildu (Stamina Runner), výběr plánu, tlačítko „Rozdat volné body podle plánu“, „Vyprázdnit strom (reset)“ a upravené pravidlo pro koncové skilly (do 30/40 bodů se počítají i koncové skilly).

Jediná věc, která je ve starší verzi a v novější chybí: sloupec **„Bez resetu?“** v tabulce buildů (ukazoval, jestli se k buildu dostaneš z aktuálního stromu bez resetu). V nové aplikaci ho vracím jako součást porovnání buildů.

**Důležité:** v souborech nejsou tvoje data. Deník ukládá postup do databáze Claude artefaktu (`tracker/state`) a do mezipaměti prohlížeče (`arc-denik-cache-v1`). Data se přenesou přes zálohu, viz kapitola 7.

## 2. Inventura funkcí

Deník má hlavičku a 10 záložek. Sloupec „Nový modul“ říká, kam funkce v nové aplikaci patří.

### Hlavička (vždy viditelná)
| Funkce | Nový modul |
|---|---|
| Kruh s levelem (level / 75) | Dashboard, Player Profile |
| Editace: Level, Coiny, Odehraná kola | Player Profile (+ rychlá úprava v horní liště) |
| Skill body použité / dostupné (červeně při překročení) | Dashboard, Skill Tree |
| Fáze roadmapy 1–4 nebo „Endgame“ | Dashboard |
| Stav ukládání | Settings & Backup (+ indikátor v liště) |

### Přehled
| Funkce | Nový modul |
|---|---|
| 4 fáze roadmapy s podmínkami, které se vyhodnocují samy | Dashboard |
| Dlaždice: další skill bod podle plánu, nejbližší upgrade (% materiálu), mapy (n / 7), money runy (coiny / h), Trials (★ / 15) | Dashboard |
| „Dalších 10 kroků“ – odškrtávací seznam s progresem | Dashboard → Cíle (seznam bude upravitelný) |
| Odkaz na roadmapu (claude.ai) | Settings → Odkazy (volitelné, vyžaduje internet) |

### Skill tree
| Funkce | Nový modul |
|---|---|
| 3 větve × 16 skillů (48), 5 pater, přidávání a ubírání bodů | Skill Tree |
| Pravidla stromu: důvod, proč bod nejde přidat; označení neplatných uzlů | Skill Tree |
| Rozpočet bodů = level + 1 + body z Expedic (0–15) | Skill Tree, Player Profile |
| Cena resetu = body × 2 000 | Skill Tree |
| 2 plány (Stamina Runner 26 kroků, Solo Looter 23 kroků), cíle u uzlů, „další bod“, „rozdat volné body“, „jen 1 bod“ | Skill Tree |
| Přepínač „Ukazovat cíle plánu“ | Skill Tree |
| Plán krok za krokem (hotovo / teď / čeká) | Skill Tree |
| Tabulka 4 hotových buildů na 76 bodů, „Použít“ plán | Skill Tree → Buildy |
| Vyprázdnit strom s potvrzením | Skill Tree |

### Workshop
| Funkce | Nový modul |
|---|---|
| 9 stanic: Gunsmith, Gear Bench, Medical Lab, Refiner, Utility Station, Explosives Station, Scrappy, Outpost, Research Station | Workshop |
| 31 receptů (úroveň → materiály), 71 různých materiálů | Workshop, Inventory |
| Podmínky upgradu (Outpost 1 = level 18; Gunsmith 4 a Research 1–4 = úroveň Outpostu) | Workshop |
| Poznámky ke stanicím (quest Sheltered Retreat, nejistý recept Research I) | Workshop |
| Zásoba materiálu +/− a ručně; původ materiálu u každé položky | Workshop, Inventory |
| „Upgradovat a odečíst materiál“, „Mám ve hře, jen zvýšit level“, „Snížit level (oprava)“ | Workshop |
| Celkový progres (n / 32 úrovní), doporučené pořadí stanic | Workshop, Dashboard |
| Počítadlo Amplified zbraní | Workshop, Player Profile |

### Nákupy
| Funkce | Nový modul |
|---|---|
| Součet materiálu na další úroveň všech stanic, jeden řádek na materiál | Inventory → Nákupní seznam |
| Mám / Potřebuju / Chybí / Odkud / Na co | Inventory |
| „Lov ARC“ – chybějící díly seskupené podle stroje, ARC díly nahoře | Inventory, ARC Database |

### Mapy
| Funkce | Nový modul |
|---|---|
| 7 map, odemykání podle odehraných kol (0, 0, 12, 18, 20, 24, 25) | Maps |
| Graf odemykání, počítadlo kol +/− | Maps |
| Karta mapy: obtížnost 1–5, na co je nejlepší, klíčová místa, trasy | Maps |
| Odkaz „Živá mapa“ (externí web) | Maps (volitelné, vyžaduje internet) |
| 7 podmínek map + poznámka k Pendola Pass | Maps |

### Money runy
| Funkce | Nový modul |
|---|---|
| Raid hodiny: start / pauza / vynulovat, varování v 8. a 10. minutě, přenos času do zápisu | Money Runs |
| Zápis runu: mapa, trasa, výsledek, coiny, délka; zápis přičte odehrané kolo | Raid Journal (jeden formulář pro oba moduly) |
| Ukazatele: coiny / h, úspěšnost extrakce, průměr na úspěšný run, celkem | Money Runs, Statistics |
| Graf posledních 24 runů (extrakce / smrt) | Money Runs, Statistics |
| Tabulka podle tras, historie se smazáním | Money Runs, Raid Journal |
| 6 tras s fakty a kroky k odškrtnutí | Money Runs, Raid Checklist |
| „Co prodávat“ – 8 položek + pravidla | Money Runs |

### ARC
| Funkce | Nový modul |
|---|---|
| 15 záznamů: název, taktika, dropy | ARC Database |
| Hledání ve jménu, taktice i dropech | ARC Database |
| Filtr „Jen co potřebuju na upgrady“, zvýraznění potřebných dropů | ARC Database |

### Zbraně
| Funkce | Nový modul |
|---|---|
| Tier list S/A/B/C (26 zbraní), značka anti-ARC (5) | Weapons |
| Zbraně podle fáze, zvýraznění aktuální fáze | Weapons |
| 5 poznámek ke změnám ve 2.0 | Weapons |

### Týden
| Funkce | Nový modul |
|---|---|
| 5 výzev: název + 0–3 hvězdy, součet / 15 | Weekly Trials |
| Automatické vynulování hvězd s novým ISO týdnem (názvy zůstávají) | Weekly Trials (+ nově se týden uloží do historie) |
| Reward Pass 0–60 | Player Profile |
| Checklist před raidem (8 bodů) + „Nový raid“ | Raid Checklist (výchozí šablona) |

### Data
| Funkce | Nový modul |
|---|---|
| Zobrazit a zkopírovat zálohu (JSON) | Settings & Backup (export do souboru) |
| Obnovit ze zálohy s kontrolou a ořezem hodnot | Settings & Backup |
| Smazat všechna data s dvojím potvrzením | Settings & Backup |
| Datum poslední změny | Settings & Backup |

## 3. Vestavěná herní data

Deník je označuje jako „ověřená fakta z roadmapy, stav hry 2.0 Frozen Trail, listopad 2026“.

| Sada | Počet | Obsah |
|---|---|---|
| Větve | 3 | Conditioning, Mobility, Survival |
| Skilly | 48 | id, větev, patro 0–4, max bodů, název, popis |
| Plány | 2 | kroky „skill na n“ a „doplnit větev na n bodů podle pořadí“ |
| Buildy | 4 | součty větví, klíčové skilly, pro koho |
| Stanice | 9 | min/max úroveň, role, recepty, podmínky, poznámky |
| Původ materiálu | 30 | materiál → stroj nebo místo |
| Mapy | 7 | kola k odemčení, obtížnost, zaměření, místa, odkaz |
| Podmínky map | 7 | název, k čemu se hodí |
| Trasy | 6 | mapa, riziko, loadout, výnos, fáze, kroky |
| Prodej | 8 | položka, cena, poznámka |
| ARC | 15 | název, taktika, dropy |
| Zbraně | 26 | tier, anti-ARC |
| Zbraně podle fáze | 4 | level, na hráče, na ARC |
| Další kroky | 10 | osobní seznam |
| Checklist před raidem | 8 | |

Materiály, které potřebuje víc receptů najednou: ARC Alloy (4×), Advanced Electrical Components (3×), Planks (3×), Sheet Metal (3×), Metal Parts, Plastic Parts, Fabric, Electrical Components, Apricot (2×).

## 4. Uživatelský stav (formát zálohy v1)

```
v: 1
profile   level 0–75 · coins 0–10 mld. · rounds 0–100 000 · expBonus 0–15 · rewardPass 0–60
skills    cur { idSkillu: body }  ·  showPlan ano/ne  ·  plan 'runner' | 'looter'
stations  gunsmith 0–4 · gear, medical, refiner, utility, explosives 0–3 · scrappy 1–5 · outpost, research 0–4
inv       { názevMateriálu: množství 1–99 999 }
steps     { 0–9: true }                 odškrtnuté „Další kroky“
runs      [{ id, ts, map, route, ok, coins, min }]   nejvýš 400 záznamů
trials    week 'RRRR-Wtt' · stars [0–3]×5 · names [text]×5
raid      { 0–7: true }                 checklist před raidem
amplified 0–99
updated   čas poslední změny
```

Neukládá se: odškrtnuté kroky trasy, hledání a filtr v ARC, vybraná trasa, stav hodin.

## 5. Výpočty, které musí zůstat stejné

**Skill tree**
- Rozpočet = level + 1 + body z Expedic. Cena resetu = rozdané body × 2 000.
- Bod nejde přidat, když: skill je na maximu; není volný bod; chybí startovní skill větve; volba (patro 2) už je vybraná nebo má větev méně než 10 bodů; střední patro bez volby; koncový skill bez 30 bodů ve větvi, druhý bez 40, třetí nikdy.
- Neplatné uzly po ubrání bodů: chybí start; volba s méně než 10 ostatními body; střední patro bez volby; víc než 2 koncové skilly; 1 koncový při méně než 30 bodech; 2 koncové při méně než 40; dvě volby najednou.
- Plán: první nesplněný krok určuje „další bod“; krok „doplnit větev“ bere první nenaplněný skill ze seznamu preferencí.

**Workshop a nákupy**
- Připravenost upgradu = Σ min(mám, potřebuju) / Σ potřebuju.
- Nákupní seznam = součet jen **další** úrovně každé stanice (včetně zablokovaných). Řazení: ARC díly, pak nejvíc chybí, pak abecedně.
- Upgrade odečte materiál; „jen zvýšit level“ neodečte; snížení levelu materiál nevrací.
- Progres workshopu = součet úrovní / 32 (Scrappy začíná na 1).

**Fáze roadmapy** – 4 fáze, každá má 3–5 podmínek z profilu, stanic, skill tree a počtu Amplified zbraní. Aktuální je první nesplněná, po čtvrté „Endgame“.

**Money runy**
- Coiny se počítají jen z úspěšných runů; při smrti je hodnota 0.
- Coiny / h = coiny z úspěšných runů / minuty **všech** runů × 60.
- Průměr = coiny / počet úspěšných runů. Úspěšnost = úspěšné / všechny.
- Totéž po trasách, řazeno podle coinů / h.

**Týden** – číslo týdne podle ISO 8601; při změně týdne se hvězdy vynulují.

## 6. Závislosti

```
level ──────────► rozpočet skill bodů, podmínka Outpostu, fáze
odehraná kola ──► odemčení map ──► dlaždice, fáze
        ▲
zápis runu ─────► statistiky runů ──► dlaždice
stanice + zásoba ► další upgrady ──► připravenost ──► dlaždice
                          └────────► nákupní seznam ──► filtr a zvýraznění v ARC
skill tree ─────► podmínka „první capstone“ ve fázi 3
Amplified ──────► podmínka fáze 4
fáze ───────────► zvýraznění řádku ve „Zbraně podle fáze“
trasa ◄────────► mapa (karta mapy odkazuje na trasu; výběr trasy předvyplní zápis)
```

## 7. Návrh migrace dat

1. **Reference.** Oba HTML soubory zkopíruji beze změny do `reference/` v projektu. Originály v `Downloads` nechávám být.
2. **Získání dat.** V deníku tam, kde ho používáš: Data → „Zobrazit zálohu (JSON)“ → „Kopírovat zálohu“. V nové aplikaci: Settings & Backup → „Import ze starého deníku“ (vložit text nebo vybrat soubor).
3. **Převod.** Import použije stejnou kontrolu a stejné meze jako deník a pak data rozdělí:
   - profil, stanice, zásoba, Amplified, Reward Pass → beze změny;
   - skill tree → uloží se jako build „Aktuální strom“, aktivní plán zůstane;
   - runy → záznamy v Raid Journalu typu „money run“ (id, čas, mapa, trasa, výsledek, coiny, délka zůstanou);
   - Trials → aktuální týden; „Další kroky“ a checklist → odškrtnutí ve výchozích seznamech.
4. **Záloha ze starší verze.** Nemá pole `plan`. Deník by v tom případě tiše přepnul na Stamina Runner; import nastaví Solo Looter, protože to byl ve starší verzi jediný plán.
5. **Pojistka.** Původní text zálohy se uloží vedle dat. Před importem se vytvoří snímek stavu, takže import jde vrátit.
6. **Kontrola.** Po importu aplikace ukáže protokol: kolik skill bodů, materiálů, runů a hvězd bylo ve zdroji a kolik je po převodu.
7. **Ověření výpočtů.** Logika deníku je psaná tak, aby šla spustit bez prohlížeče. Automatické testy pustí původní funkce a nové funkce na stejných datech (pevných i náhodných) a výsledky se musí shodovat.

## 8. Co nejde převést 1 : 1 a čím to nahrazuji

| # | V deníku | V nové aplikaci |
|---|---|---|
| 1 | Ukládání do cloudové databáze Claude artefaktu | Lokální soubor v `%APPDATA%`, automatické ukládání a snímky |
| 2 | Písma z Google Fonts (potřebují internet) | Písma přibalená v aplikaci |
| 3 | Odkazy na živé mapy a roadmapu | Zůstávají jako volitelné odkazy do prohlížeče, označené „vyžaduje internet“ |
| 4 | Nejvýš 400 runů, historie ukáže 60, graf 24 | Bez limitu, s filtrem období |
| 5 | Nový týden hvězdy smaže | Týden se nejdřív uloží do historie |
| 6 | Kroky trasy se po zavření ztratí | Ukládají se jako rozpracovaný checklist |
| 7 | „Dalších 10 kroků“ je pevný osobní seznam | Výchozí obsah upravitelného seznamu cílů |
| 8 | Připravenost každé stanice počítá s celou zásobou (6× ARC Alloy „stačí“ třem stanicím naráz) | Pohled po stanicích zůstává; Material Planner navíc ukáže souběh požadavků a skutečný nedostatek |
| 9 | Nákupní seznam řeší jen další úroveň | Výchozí pohled stejný; v plánovači lze zvolit cílovou úroveň |
| 10 | Zápis runu a deník raidů jsou jedna věc | Jeden záznam raidu, který čtou Money Runs, Raid Journal i Statistics |

## 9. Co vize chce a deník to nemá

Nové údaje a funkce, které nevznikají převodem: XP a vývoj profilu v čase, více uložených buildů a jejich porovnání, kategorie materiálů, plánovač materiálů, poznámky a vlastní body na mapách, u ARC typ / kategorie / obtížnost / nebezpečnost / slabiny / doporučená výbava, u zbraní kategorie / vlastní hodnocení / porovnání, loadouty, Raid Journal, šablony checklistů, cíle, doporučení, statistiky s filtry, historie Trials.

Herní fakta, která v deníku nejsou, si nebudu vymýšlet. Každý záznam ponese označení původu („z deníku“ / „vlastní“) a nová pole zůstanou prázdná, dokud je nevyplníš, pokud se nedohodneme jinak.

## 10. Rozhodnutí ke schválení

| Téma | Návrh | Alternativa |
|---|---|---|
| Technologie | Electron + React + TypeScript | Tauri 2 (menší a úspornější, ale je nutné doinstalovat Rust a MSVC Build Tools) |
| Úložiště | JSON v `%APPDATA%`, atomický zápis, automatické snímky | SQLite |
| Herní data | Základ z deníku + tvoje úpravy nad ním | Doplnit chybějící údaje rešerší z veřejných zdrojů |
| Navigace | 14 položek podle vize; Cíle a Doporučení v Dashboardu, Material Planner v Inventory, Loadouty ve Weapons | Samostatné položky navíc |
| Postup | Milník 1: základ + všechny původní moduly + import. Milník 2: nové funkce. Milník 3: propojení, testy, instalátor, návod | Vše najednou |
