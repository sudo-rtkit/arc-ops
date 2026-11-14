<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/github/hero-light.png">
  <img src="docs/assets/github/hero-dark.png" alt="ARC Raiders Companion s maskotem Bedňákem" width="1280">
</picture>

# ARC Raiders Companion

[English](README.md) · [Instalace](#instalace) · [Historie verzí](CHANGELOG.md) · [Vývoj](DEVELOPMENT.md)

**0.25.0 · Windows · Offline · MIT · Česky a anglicky**

[![CI](https://github.com/sudo-rtkit/arc-ops/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sudo-rtkit/arc-ops/actions/workflows/ci.yml)

Osobní operační centrum pro hráče ARC Raiders. Zásoba, vylepšení dílny, cíle úkolů a plány skillů na jednom místě. To nejdůležitější si nech v kompaktním okně nebo ve volitelné polní konzoli Opse. Údaje ze snímků se čtou lokálně a před zápisem je vždy zkontroluješ. Mezi raidy si odpočiň u miniher s Bedňákem. Bez přihlášení, předplatného a cloudové synchronizace.

**Neoficiální fanouškovský projekt. Není spojen s Embark Studios ani jím schválen.**

## Co umí

Všechny obrázky ukazují demo data z prohlížečového sestavení, bez herních snímků. Nativní okna, zkratky a efekty Windows se v prohlížeči liší.

| Plánování a postup | Po ruce |
|---|---|
| **Přehled:** profil, další kroky, dílna a nákupní seznam. | **Kompakt:** připnuté úkoly, mám/potřebuji, rychlé akce. |
| ![Demo přehledu](docs/assets/github/dashboard.png) | ![Demo kompaktu](docs/assets/github/compact.png) |
| **Úkoly:** ruční cíle a projekty; všechny cíle hotové neznamená automaticky splněný úkol. | **Buildy:** 12 plánů, vlastní buildy a porovnání se stromem; teorie je označená. |
| ![Demo cílů úkolu](docs/assets/github/quests.png) | ![Demo katalogu buildů](docs/assets/github/builds.png) |
| **Revize snímků:** jistota údajů, výslovné potvrzení, snímek stavu před zápisem. | **Minihry:** Stash Tetris, recyklační kvíz, Opsův hack, rozehraná kola a kosmetické nátěry. |
| ![Demo revize importu](docs/assets/github/import-review.png) | ![Demo Opsova hacku](docs/assets/github/minigames.png) |

**Příprava na raid a vlastní mapa.** Vybereš cíle (úkoly, další úroveň stanice, projekt, peníze) a dostaneš jeden seznam toho, co chybí, s typem místa z katalogu předmětů, doporučenou mapu s důvody a plán v záložce Raid v konzoli včetně rady nechat / prodat / recyklovat. Interaktivní mapa stojí na snímku herní mapy, který si vložíš sám; aplikace žádné herní mapy nepřibaluje. Nad ním jsou tvoje body a zvýraznění podle plánu. Po raidu se plán porovná s nálezem (z potvrzeného snímku FINDINGS nebo ze změny zásoby): co ještě chybí, která vylepšení jsou připravená, doporučení dalšího raidu a uložení do deníku raidů; statistika pak ukáže, které mapy ti s cíli pomáhají.

| Aktivní plán: cíle, materiály a důvody výběru mapy | Interaktivní mapa: vlastní body a zvýraznění plánu |
|---|---|
| [![Aktivní plán: cíle, materiály a důvody výběru mapy](docs/assets/github/raid-prep.png)](docs/assets/github/raid-prep@2x.png) | [![Interaktivní mapa: vlastní body a zvýraznění plánu](docs/assets/github/interactive-map.png)](docs/assets/github/interactive-map@2x.png) |

Podklad na obrázku je smyšlená grafika projektu zastupující hráčův vlastní snímek. Nejde o herní ani komunitní mapu. Mapu a loadout si vybíráš sám.

| Záložka Raid: nálezy a rady k předmětům | Po raidu: nalezeno, chybí a připravené vylepšení |
|---|---|
| [![Záložka Raid: nálezy a rady k předmětům](docs/assets/github/overlay-raid.png)](docs/assets/github/overlay-raid@2x.png) | [![Po raidu: nalezeno, chybí a připravené vylepšení](docs/assets/github/post-raid.png)](docs/assets/github/post-raid@2x.png) |

Historie plánů patří k záznamům v deníku raidů. Statistika ukazuje, které mapy pomáhají s cíli; méně než tři plánované raidy označí jako „málo dat“.

### Co dál?

Karta **Co dál?** na Dashboardu seřadí další nejlepší kroky z tvých dat: vylepšení, které jde postavit, raid k vyhodnocení, připnutý úkol připravený k odevzdání, volné skill body, nedokončené Weekly Trials, plnou bednu, starou zálohu nebo cíl s blížícím se termínem. Každý tip říká proč, jedním klikem otevře správný modul a jde skrýt, dokud se jeho podmínka nezmění, nebo odložit o den. Nejdůležitější tip je i v kompaktním okně a v polní konzoli a Ops ho řekne ve zvolené povaze, když s nimi pracuješ, nikdy nad hrou.

### Hledat všude a „Proč to potřebuju?“

**Ctrl+K** (nebo pole v postranním panelu) najde předmět, úkol, stanici, skill, build, mapu, modul, sekci nastavení nebo tip, česky i anglicky, bez ohledu na diakritiku a drobné překlepy. Předmět otevře svou kartu: vzácnost, hodnotu, hmotnost a stack, tvoji zásobu, kde je potřeba (úkoly, stanice, projekty, tvoje cíle, aktivní plán raidu) a kolik ještě chybí, co z něj recyklací vznikne a z čeho vzniká on, kde ho hledat a které tvoje body na mapě sedí, a radu nechat / recyklovat / prodat i s důvodem. Stejnou kartu otevřou názvy předmětů v celé aplikaci, v hlavním okně i v polní konzoli.

| Ctrl+K: výsledky ve skupinách | Karta předmětu: proč ho potřebuješ |
|---|---|
| [![Ctrl+K: výsledky ve skupinách](docs/assets/github/search.png)](docs/assets/github/search@2x.png) | [![Karta předmětu: proč ho potřebuješ](docs/assets/github/item-card.png)](docs/assets/github/item-card@2x.png) |

Ctrl+K funguje při fokusu aplikace nebo konzole; je to zkratka daného okna. Karta ukazuje i odpovídající vlastní body na mapě. Chybějící údaje katalogu zůstávají neznámé.

### Bedňák / Ops

Volitelný pixelový buddy s podobami podle levelu, animacemi, nátěry a třemi povahami. Kliknutím otevřeš konzoli s profilem, úkoly, zásobou, dílnou, skilly, nákupy a revizí snímku a aktivním plánem raidu. Tlačítko **Aplikace** otevře nad hrou ve větším panelu kterýkoli plný modul (skill tree, recepty, databázi předmětů, mapy, deník, statistiky, minihry…); nastavení a zálohy zůstávají v hlavním okně. Výchozí stav buddyho je **vypnuto**.

**Ops během hraní propouští kliky.** Když je hra v popředí, Ops propouští každý klik do hry a nikdy jí nevezme fokus (Nastavení → Buddy a zkratka → „Buddy propouští kliky do hry (doporučeno)“, výchozí zapnuto). Během hry používáš zkratky: zkratku snímku a zkratku Úprav widgetů. Na ploše nebo s oknem aplikace v popředí jde na Opse kliknout a přetáhnout ho jako dřív.

### Sestav a porovnej loadouty

Ve **Weapons → Loadouty** vyber augment, štít a dvě zbraně s tierem a naplň batoh, quick use, augmented slots a bezpečnou kapsu. Počty míst a mez váhy vycházejí z herních obrazovek a můžeš je upravit. Uvidíš prodejní hodnotu z katalogu, váhu proti mezi, dostupnost ve skrýši i hodnotu v riziku mimo bezpečnou kapsu. Neznámé ceny zůstávají označené. Porovnej dvě sestavy vedle sebe, pošli chybějící věci do nákupního seznamu nebo loadout předvyplň po kontrole snímku MANAGE LOADOUT / FINDINGS. Uloženou sestavu používá i Příprava na raid a vyhodnocení.

[![Editor loadoutu s místy a živým souhrnem, smyšlená demo data](docs/assets/github/loadout-builder.png)](docs/assets/github/loadout-builder@2x.png)

[![Porovnání dvou demo loadoutů podle hodnoty, rizika, váhy a dostupnosti](docs/assets/github/loadout-compare.png)](docs/assets/github/loadout-compare@2x.png)

### Snímání, kontrola a deník raidů

**Automatické snímání je volitelné, výchozí vypnuté a čeká na ověření u Embarku.** Po zapnutí v Nastavení kontroluje přibližně každé 2 sekundy malý pruh s nadpisem, jen když je hra v popředí. Rozpoznaná a vybraná obrazovka menu mimo raid spustí plný snímek; obrázky zůstávají v paměti a po přečtení se zahodí. Loadout → výsledek → návrh zápisu propojí výbavu, výsledek a loot. Jisté údaje se zapíší automaticky po snímku stavu, s tlačítkem **Zpět**; nejisté čekají ve frontě **Ke kontrole**. Pozastavit jde v Nastavení, kompaktu i oznamovací oblasti. Volitelná gesta při snímání jsou tichá, bez zvuku, bubliny i změny fokusu. Doporučené je okno bez okraje; zapínáš na vlastní uvážení.

Podporované snímky loadoutu a FINDINGS umí rozpoznat zbraně, tier a augment. O jistotě názvu rozhoduje tvar a u některých zbraní s doplňky i velikost zásobníku; nejistá výbava zůstává neznámá nebo se nabídne jako návrh. Výbava z FINDINGS pořízeného zkratkou čeká po zápisu lootu **Ke kontrole**: jisté řádky jsou zaškrtnuté, návrhy vybereš sám a **Uložit vše** zapíše zkontrolované řádky. Rozpoznávání má omezení; každý návrh ověř.

[![Ke kontrole: rozpoznané Ferro II a augment, nezaškrtnutý návrh Stitcher I s jistotou 79 procent](docs/assets/github/review-queue.png)](docs/assets/github/review-queue@2x.png)

### Widgety nad hrou

**Widgety jsou volitelné, výchozí vypnuté a čekají na ověření u Embarku.** Deset malých karet ukazuje vlastní data: Seznam k nalezení, Připnuté úkoly, Nákupy, Co dál?, Nechat / prodat / recyklovat, Obsazenost skrýše, Týdenní výzvy, Ops, Ke kontrole a Automatické snímání. Žádná mapa, živá poloha ani minimapa. Režim **Hra** jen zobrazuje a propouští kliky. Zvolenou zkratkou otevřeš během hry **Úpravy**: přesun a změna velikosti s přichycením, krytí, hustota a zámek, přidání z katalogu, Zpět a přepnutí rozložení **Lobby**, **Raid** nebo vlastního. Hotovo / Esc vrátí Hru; návrat do hry také ukončí Úpravy. K dispozici je vysoký kontrast i Skrýt/zobrazit. Rozložení patří tomuto PC a nejsou v zálohách. Vyžaduje hru v okně nebo bez okraje; exkluzivní celá obrazovka není podporovaná.

| Hra · rozložení Raid | Úpravy · katalog widgetů |
|---|---|
| [![Widgety Raid nad původní smyšlenou scénou](docs/assets/github/widgets-raid.png)](docs/assets/github/widgets-raid@2x.png) | [![Úpravy s lištou, úchyty a katalogem widgetů](docs/assets/github/widgets-edit.png)](docs/assets/github/widgets-edit@2x.png) |

*Skutečné rozhraní widgetů v prohlížeči nad smyšlenou scénou projektu; žádný snímek ani grafika hry. Obrázky neověřují nativní propouštění kliků ani chování fokusu.*

### Původ dat a zátěž aplikace

Tečky původu ukazují zdroj hodnoty, čas, jistotu rozpoznání, pokud je známá, a stav potvrzení. **Potvrdit** označí neověřenou hodnotu jako zkontrolovanou; **Nastavení → Původ dat** shrnuje oblasti a nabízí **Potvrdit vše v oblasti**. Tečky jsou i u materiálů v receptech dílny a počtů v nákupním seznamu.

[![Původ dat s nepotvrzenými demo hodnotami a potvrzením oblasti](docs/assets/github/data-origin.png)](docs/assets/github/data-origin@2x.png)

**Nastavení → Zátěž aplikace** ve Windows ukazuje CPU a paměť vlastního procesu, časování automatického snímání a obnovování widgetů. Procesy WebView2 nejsou započítané; paměť JavaScriptu okna se ukazuje zvlášť. Hru neměří a netvrdí konkrétní vliv na FPS: panel popisuje ruční porovnání. Volitelný **režim nízké zátěže** při hře v popředí zpomalí obnovování widgetů i přepočet poradce a pozastaví animace Opse i gesta snímání.

[![Zátěž aplikace v prohlížeči: nativní metriky nedostupné, režim nízké zátěže zapnutý](docs/assets/github/app-load.png)](docs/assets/github/app-load@2x.png)

*Ukázka v prohlížeči: nativní metriky procesu nejsou dostupné. Žádná čísla CPU/RAM ani výsledky výkonu hry nejsou smyšlené.*

![Demo polní konzole s Opsem](docs/assets/github/overlay.png)

[![Plný modul úkolů otevřený v konzoli](docs/assets/github/overlay-app.png)](docs/assets/github/overlay-app@2x.png)

Navíc: rady pro úklid stashe, recyklace, blueprinty, porovnání zbraní, vlastní tier list, deník raidů, statistiky, checklisty a export/obnova JSON záloh. Herní data mohou za aktualizacemi zaostávat.

## Instalace

1. Použij **NSIS instalátor pro Windows** (`.exe`) dodaný správcem projektu. Vydané instalátory hledej v [Releases](https://github.com/sudo-rtkit/arc-ops/releases). Pokud tam zatím nejsou, můžeš aplikaci [sestavit ze zdrojů](DEVELOPMENT.md#run-and-check); místní sestavení uloží instalátor do `src-tauri/target/release/bundle/nsis/`.
2. Instaluj se zavřenou hrou nebo s hrou v **okně bez okraje (borderless)**. Další okno nad exkluzivní celou obrazovkou může hře vzít fokus.
3. Spusť aplikaci a nastav profil. Výchozí jazyk je čeština; angličtinu přepneš v Settings & Backup.
4. Buddyho a zkratku zapni v Nastavení jen podle potřeby.

Novou verzi instaluj přes stávající instalaci; data zůstanou. Před aktualizací exportuj JSON zálohu. Instalátor aplikaci sám nespouští; při spuštění za běžící hry se aplikace otevře minimalizovaná bez fokusu.

## Soukromí a bezpečnost

Vše funguje offline, bez přihlášení, telemetrie a odesílání na server. Externí odkazy se otevírají na přání. Snímky zásoby, lootu a postupu se zpracují lokálně a neukládají se jako obrázky; nativní snímek zkratkou zůstává jen v paměti. Výjimkou jsou snímky map, které si vložíš sám: zůstávají jen v tomto zařízení a do zálohy jdou jen na tvou volbu. Uložit se mohou potvrzené údaje a číselné otisky ikon.

Aplikace nečte paměť hry, nevkládá do ní kód, neupravuje herní soubory a neposílá vstup. Volitelné otevření s hrou sleduje název procesu a stav okna včetně popředí. Změny ze souboru a zkratky potvrzuje hráč. Volitelné automatické snímání může jisté údaje zapsat po snímku stavu s možností Zpět; nejisté čekají na kontrolu. Rady nikdy samy nic neprodávají ani nemažou ve hře.

Verze 0.16.1 zpřísnila oprávnění jednotlivých oken, ověřování zpráv mezi okny a limity velikosti obrázků. Podrobnosti jsou v [historii verzí](CHANGELOG.md#0161--security-hardening).

## Časté otázky

**Synchronizuje se postup s účtem?** Ne. Údaje zadáváš ručně nebo kontroluješ import snímku. Aplikace nezná živý stav raidu.

**Musí být hra anglicky?** Pro rozpoznávání snímků ano. Samotnou aplikaci můžeš používat česky i anglicky.

**Přečte každý snímek?** Ne. Podporované obrazovky mají omezení a nejisté údaje je nutné ověřit. Z přehledu skillů se neodvozují jednotlivé ranky.

**Je použití schválené Embarkem?** Ne. Netvrdíme schválení ani záruku vůči anti-cheatu. Řiď se vlastním úsudkem a aktuálními pravidly hry.

**Kam s chybou?** Do [Issues](https://github.com/sudo-rtkit/arc-ops/issues), s verzí a postupem reprodukce. Přílohy zbav osobních údajů.

## Neoficiální projekt

Nezávislý fanouškovský nástroj, bez spojení, sponzorství nebo schválení Embark Studios. ARC Raiders a související názvy patří příslušným vlastníkům; název pouze určuje hru, pro kterou je nástroj určen.

## Vývoj a licence

Tauri 2, React 19, TypeScript a čisté CSS. [Vývoj a překlady](DEVELOPMENT.md), [historie verzí](CHANGELOG.md), [technické návrhy](docs/superpowers/specs/).

[MIT](LICENSE). Písma mají vlastní OFL oznámení. Bedňák je původní grafika projektu.
