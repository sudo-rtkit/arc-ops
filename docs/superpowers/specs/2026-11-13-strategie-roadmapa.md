# Strategie a roadmapa ARC OPS (13. 11. 2026)

Vychází z dokumentu uživatele „ARC OPS — konkurenční analýza, cílový produkt a roadmapa“ (13. 11. 2026),
srovnání s MetaForge, RaiderBuddy a Arc Companion) a z rozhodnutí uživatele ze stejného dne.

## Vize

Osobní, local-first asistent pro ARC Raiders: deník, inventář, postup, příprava raidů, mapy, analytika
a vysvětlitelná doporučení. Nehraje za hráče a nezpřístupňuje skryté informace. Cílem je „pomocník,
ne zátěž na PC“.

## Zásady (závazné)

1. Fair play: žádné čtení paměti hry, zachytávání síťové komunikace, zásahy do procesu, ESP,
   automatické ovládání ani taktická výhoda z informací, které hráč nemá.
2. Embark FAQ (aktualizováno 29. 10. 2025): overlaye a asistenti „only if they do not interfere with gameplay
   or offer an unfair advantage“; u nejistoty kontaktovat podporu. Kontakt s podporou řeší uživatel sám.
   Funkce ve „žluté zóně“ jsou ve výchozím stavu vypnuté a označené „čeká na ověření u Embarku“.
3. Local-first a offline: data jen v počítači, export/import, zálohy. Cloud jen volitelně a se souhlasem.
4. Deterministické výpočty pro čísla a doporučení. Jazykový model smí jen vysvětlovat a odpovídat
   nad daty aplikace, nikdy nevymýšlí fakta.
5. Žádné kopírování assetů a dat konkurence ani her bez licence.

## Zóny

| Zóna | Příklady | Postup |
|---|---|---|
| Zelená | deník, kalkulačky, statistiky, ruční data, buildy, plánování | vyvíjet běžně |
| Žlutá | snímání obrazovky, rozpoznávání, overlay během hraní | opt-in, výchozí vypnuto, označit „čeká na ověření u Embarku“ |
| Červená | paměť, pakety, ESP, skrytý loot, minimapa s živou polohou, automatizace ovládání | nevyvíjet |

## Stav vůči milníkům dokumentu (0.19.0)

- **M0 Základ:** zálohy, migrace (schéma 16), ~790 unit a ~136 E2E testů. Chybí CI a záznam pádů.
- **M1 Znalosti a postup:** katalog, „Co potřebuji?“ bez dvojího počítání, Ctrl+K, karta předmětu. Původ dat jen při importu.
- **M2 Plánování a analytika:** skill tree a buildy, zbraně, historie raidů, statistiky, týdenní výzvy, Příprava na raid,
  úklid skrýše. Loadout builder jen jednoduchý. Časovače událostí ne (vyžadují síť).
- **M3 Mapy:** interaktivní mapa z vlastního snímku. Výškové úrovně a 3D ne (chybí povolená data).
- **M4 Vision a overlay:** rozpoznávání s jistotou a kontrolou, overlay a buddy. Automatické snímání viz 0.20.0.
- **M5 Inteligence:** deterministický rádce „Co dál?“ (0.17.0). Jazykový model zatím ne.
- **M6 Komunita:** ne (vyžaduje server, moderaci a náklady; jde proti local-first).

Neplánujeme: SQLite a účet/cloud sync (zatím netřeba), marketplace a LFG, minimapu a Map Sync během raidu.

## Roadmapa

1. **0.20.0 Automatické snímání mimo raid** (žlutá zóna, výchozí vypnuto): jen při hře v popředí, malý proužek
   s nadpisem obrazovky asi každé 2 s, plný snímek jen u známé obrazovky, snímky jen v paměti. Zachycení raidu
   z loadoutu a výsledku do Deníku. Jisté údaje zapíše se snímkem stavu a tlačítkem Zpět, nejisté do fronty
   „Ke kontrole“. Přepínač „vypnout všechna napojení na hru“.
2. **0.21.0 CI a původ dat:** testy na GitHubu při každém pushi; u každé získané hodnoty zdroj, čas, jistota
   a stav ověření hráčem.
3. **Poté:** lepší loadout builder (cena, váha, dostupnost ve skrýši), měření zátěže PC (CPU, RAM, FPS při snímání).
4. **AI asistent Ops (až to zapadne do vývoje, bez spěchu):** dotazy přirozenou řečí nad vlastními daty
   (nástroje jen pro čtení), odpovědi s uvedením, z čeho vychází; akce jen po potvrzení; při hře v popředí neběží.
   Začátek jako volitelná cloudová varianta (vypnuto, vlastní klíč, jasně řečeno, co se posílá), lokální model
   později. Navazuje na rádce „Co dál?“ a na původ dat z 0.21.0.
   Tři části z dokumentu uživatele, každá nad už existujícím deterministickým základem:
   - **Intelligent Inventory** (P2): nad kartou předmětu, radami nechat/prodat/recyklovat a Úklidem;
     AI vysvětlí a odpoví („proč si mám nechat Wires?“, „co prodat, když potřebuju místo?“).
   - **AI Raid Planner** (P2): nad Přípravou na raid a vyhodnocením; AI navrhne varianty a vysvětlí rizika
     a náklady loadoutu, čísla počítá Příprava na raid.
   - **Personal AI Analyst** (P3): nad Statistikami, historií raidů a mapami; trendy a vysvětlení
     („proč se mi na Dam nedaří?“), vždy s uvedením dat a velikosti vzorku.

## Architektura (cílová)

```
ARC Raiders (obrazovky mimo raid)      Herní data (MetaForge, ARC Tracker; při vývoji)
        │                                         │
Vision Engine (rozpoznání + jistota)              │        Ruční zadání, import zálohy
        │                                         │                 │
Kontrola: jisté se zapíše se snímkem stavu, nejisté do fronty „Ke kontrole“, vše jde vrátit
        │
ARC OPS data (stav hráče + původ každé hodnoty: zdroj, čas, jistota, ověřeno hráčem)
        │
Deterministický engine (Planner, Příprava na raid, rady ke skrýši, rádce „Co dál?“, statistiky)
        │                                   │
Moduly: Inventář · Plánování · Statistiky   AI Agent (volitelný): jen čte přes nástroje enginu,
(fungují bez AI)                            vysvětluje a odpovídá; akce jen po potvrzení hráče
```
