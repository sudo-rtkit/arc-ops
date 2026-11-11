# ARC Raiders Companion — vizuální specifikace

Datum: 10. 11. 2026. Předání pro implementaci Claude. Návrh vizuálu: ChatGPT.

Podklady: [inventura deníku](01-analyza-puvodniho-deniku.md) a [schválený návrh](superpowers/specs/2026-11-10-arc-raiders-companion-design.md). Tento dokument konkretizuje vzhled, nemění výpočty, datový model ani rozsah milníků. Při rozporu produktových funkcí platí schválený návrh. Hodnoty níže jsou návrhová rozhodnutí pro implementaci, nikoli herní fakta. Všechny rozměry jsou CSS px.

## 1. Směr a priority

Osobní operační konzole: grafit a antracit, ostré členění, tyrkysová navigace a akce, jantarová ekonomika a pozornost. Hustší dashboard musí umožnit během několika sekund přečíst stav hráče, další upgrade a poslední výsledky. HUD vytváří rastr, malé technické popisky a přesná čísla; nepoužívat neonové záře, skleněné panely, scanlines, blikání ani velké ilustrační hero sekce.

Zvolený přístup je plochý panelový HUD. Filmový HUD by snižoval čitelnost tabulek; běžný světlý administrativní dashboard by ztratil požadovaný charakter. Dekorace tvoří nejvýše malá rohová značka u značky aplikace a krátká akcentní linka v aktivním panelu. Obsah nesmí být zkosený ani oříznutý dekorativní maskou.

Milník 1 má všech 14 obrazovek a funkce M1 ze schváleného návrhu. Cíle, Doporučení, Material Planner a Loadouty z M2 zatím nezobrazovat jako prázdné nebo nefunkční záložky. Původní „Další kroky“ zůstávají funkční kartou Dashboardu.

## 2. Barevné tokeny

Názvy přenést do CSS custom properties. Žádné ad hoc barvy v modulech.

| Token | Hodnota | Použití |
|---|---|---|
| `--bg-app` | `#101419` | plocha aplikace |
| `--bg-sidebar` | `#13191F` | navigace |
| `--bg-panel` | `#192128` | karty a tabulky |
| `--bg-raised` | `#222D36` | dialog, input, menu |
| `--bg-hover` | `#2A3943` | hover řádku a sekundární akce |
| `--bg-selected` | `#183C40` | aktivní navigace a výběr |
| `--border-subtle` | `#35434E` | dělení dekorativních ploch |
| `--border-control` | `#718491` | hranice inputu, checkboxu a ovladače |
| `--text-primary` | `#EDF3F5` | hlavní text |
| `--text-secondary` | `#BBC8D0` | podpůrný text |
| `--text-muted` | `#94A7B4` | metadata a osy |
| `--accent` | `#52DDD0` | primární akce, focus, aktuální stav |
| `--accent-hover` | `#7BE9DE` | hover primární akce |
| `--accent-pressed` | `#32BCAE` | stisk primární akce |
| `--on-accent` | `#102322` | text na tyrkysové |
| `--amber` | `#F4BE62` | mince, hvězdy, upozornění |
| `--amber-bg` | `#382E1E` | plocha upozornění |
| `--orange` | `#F49B68` | zvýšená naléhavost, čas 8 minut |
| `--success` | `#85D7A0` | splněno, extrakce |
| `--success-bg` | `#21352B` | úspěšný stav |
| `--danger` | `#FF959A` | chyba, smrt, překročený rozpočet |
| `--danger-bg` | `#3B252C` | plocha chyby |
| `--branch-conditioning` | `#85D7A0` | zelená větev |
| `--branch-mobility` | `#F4D46A` | žlutá větev |
| `--branch-survival` | `#FF959A` | červená větev |

Barvy větví navázat na skutečné přiřazení v referenčním deníku; při odlišném přiřazení zachovat referenci a změnit pouze mapování tokenů. Barva vždy doprovází název, ikonu nebo tvar. Muted text není disabled. Disabled: plocha panelu, text `--text-muted`, přerušovaný nebo běžný okraj; bez snížení opacity celého ovladače. Tyrkysovou nebarvit všechny nadpisy. Jantar nepoužívat jako primární navigaci.

Text musí splnit kontrast alespoň 4,5 : 1, velký text a podstatné grafické ovladače 3 : 1. `--border-subtle` je pouze dekorativní; pro identifikaci ovladače použít `--border-control`. Ověřit skutečné kombinace při implementaci, zejména barevné badge.

## 3. Typografie, geometrie, vrstvy

Písma přibalit lokálně včetně latin-ext: Chakra Petch 600/700 pro nadpisy, Inter 400/500/600 pro UI, JetBrains Mono 400/500 pro hodnoty. Fallbacky: sans-serif, u čísel monospace. Text nevkládat do rastrových obrázků.

| Role | Písmo | Velikost / řádek | Váha |
|---|---|---|---|
| Název obrazovky | Chakra Petch | 26 / 32 | 600 |
| Název panelu | Chakra Petch | 17 / 24 | 600 |
| Hlavní KPI | JetBrains Mono | 28 / 36 | 500 |
| Vedlejší KPI | JetBrains Mono | 20 / 28 | 500 |
| Běžný text, tlačítko | Inter | 14 / 20 | 400 / 600 |
| Tabulka, navigace | Inter | 13 / 20 | 400 / 500 |
| Metadata, osy, badge | Inter | 12 / 18 | 500 |
| Technický popisek | Inter | 11 / 16 | 600 |

Technický popisek je jediná role verzálkami, tracking 0,08 em; používat pro sekce sidebaru nebo malé KPI labely. Běžné české texty a názvy herních předmětů mají přirozený zápis. Pod 12 px nepatří žádná podstatná informace. Čísla tabulární, zarovnaná vpravo; datum `10. 11. 2026`, čas `17:07`, délka `08:24`, číslo `125 400`, poměr `12 / 32`, procenta `75 %`. Nulu a neznámou hodnotu odlišovat: `0` versus `—` s vysvětlením „Údaj není vyplněn“.

- Spacing tokeny `--space-1` až `--space-8`: 4, 8, 12, 16, 20, 24, 32, 48.
- Rádiusy: `--radius-control` 4, `--radius-panel` 6, `--radius-dialog` 8; badge 4, nikoli široké pilulky.
- Okraj 1 px; focus 2 px tyrkysový s odsazením 2 px. Aktivní navíc levá linka 3 px.
- Panel padding 16, hlavička panelu min. 40; tabulka uvnitř může sahat k okrajům pod hlavičkou.
- Ikony Lucide, stroke 1,75, velikost 18 v navigaci a tlačítku, 16 v tabulce, 24 v prázdném stavu. Nepoužívat emoji jako systémové ikony.
- Běžné panely bez stínu. Dialog/menu: `0 16px 48px #00000066`; backdrop `#080C10B8`, bez blur.
- Vrstvy: obsah 0, sticky tabulka 10, shell 20, dropdown 40, backdrop 80, dialog 90, toast 100, tooltip 110.
- Přechody barvy/okraje 120 ms ease-out, otevření dialogu 160 ms; žádné animované přepočítávání KPI. Při reduced motion vypnout posun a přechody.

## 4. Shell a sidebar

Zachovat nativní titulkovou lištu Windows. Rozměry dále počítají klientskou oblast pod ní. Shell vyplňuje okno: vlevo sidebar, vpravo horní stavová lišta a samostatně svisle posuvný obsah. Sidebar ani lišta se neposouvají s obsahem. Nevytvářet vlastní ovladače zavírání okna.

Sidebar má šířku 224, kompaktní 64, oddělený pravým okrajem. Značka nahoře 64 vysoká: jednoduchý lokální znak se čtyřmi krátkými linkami a text `ARC OPS`, pod ním `RAIDERS COMPANION`. Nejde o oficiální logo. Navigace má padding 8, řádek 36, mezeru 2, ikonu 18, text odsazený 10. Sekční label 11/16 má horní mezeru 16. Při nedostatku výšky se posouvá navigační seznam, nikoli značka; Settings zůstává dostupné dole. Ve výšce 640 použít řádek 32 a sekční mezeru 8. Settings nesmí překrýt seznam.

| Skupina | Pořadí / modul | Lucide ikona |
|---|---|---|
| PŘEHLED | 1 Dashboard | LayoutDashboard |
| | 2 Player Profile | UserRound |
| ROZVOJ | 3 Skill Tree | GitBranch |
| | 4 Workshop | Hammer |
| | 5 Inventory | Package |
| PRŮZKUM | 6 Maps | Map |
| | 7 ARC Database | Bot |
| | 8 Weapons | Crosshair |
| RAIDY | 9 Money Runs | Coins |
| | 10 Weekly Trials | Trophy |
| | 11 Raid Journal | BookOpen |
| | 12 Raid Checklist | ListChecks |
| | 13 Statistics | ChartNoAxesCombined |
| SYSTÉM | 14 Settings & Backup | Settings |

Aktivní řádek: selected plocha, levá tyrkysová linka, primary text, tyrkysová ikona. Hover: hover plocha. Nepoužívat badge s fiktivními notifikacemi. V kompaktním sidebaru skrýt text i skupinové labely; řádky 44 × 36 se stejnými rozestupy a pořadím, tooltip na hover i focus, přístupný celý název. Tlačítko sbalení pouze při šířce alespoň 1280, dole nad Settings; při menší šířce automaticky kompaktní režim.

Horní lišta: výška 64, panelové pozadí, spodní okraj, padding 24 (na úzké šířce 16). Zleva level v kruhu 40, mince, kola, skill body, fáze; vpravo stav uložení. Labely 11/16, hodnoty 14/20 mono. Mince jantarové, volné body tyrkysové, překročení červené s textem. Kliknutí na level/mince/kola otevře rychlou úpravu profilu v popoveru širokém 320; skill body navigují do Skill Tree, fáze na kartu roadmapy. Čísla se nesmějí měnit pouhým kliknutím.

Uložení má ikonu a text: „Uloženo“, „Ukládám…“, „Neuloženo“. „Offline · lokální data“ je neutrální metadata v Settings nebo zápatí sidebaru, nikoli indikace síťového připojení. Nepředstírat zjišťování dostupnosti internetu.

## 5. Dashboard — přesné rozložení

Obsah: padding 24, max-width 1680, vodorovně uprostřed; mezery 16. Hlavička výšky minimálně 48: vlevo `Dashboard` a „Přehled postupu a příprava na další raid“, vpravo sekundární „Upravit přehled“ a primární „Zapsat raid“. Datum jen jako malé metadata, žádná velká uvítací plocha.

KPI pruh: šest stejných karet, výška min. 104, padding 16. Pořadí: Level + XP progress; Mince profilu; Raidy; Extrakce; Výdělek z raidů; Coiny / h. Každá má label, hlavní hodnotu, stručný kontext. Mince profilu a výdělek jsou odlišné veličiny a tak musí být označeny. Raidové KPI používají společné explicitní období „Celá historie“; nevymýšlet trendové šipky bez srovnávacích dat.

Pod KPI 12sloupcový grid. V základním pořadí:

| Řada | Karta | Span | Obsah |
|---|---|---|---|
| A | Další kroky | 5 | další skill bod, nejbližší upgrade, odemčení map n / 7; odkazy na konkrétní detail |
| A | Fáze roadmapy | 4 | fáze 1–4 / Endgame, segmenty, podmínky aktuální fáze |
| A | Weekly Trials | 3 | součet hvězd / 15, pět kompaktních řádků |
| B | Poslední raidy | 8 | posledních 5, mapa, výsledek, výdělek, délka; „Všechny raidy“ |
| B | Chybějící materiály | 4 | prvních 5, chybí jantarově, „Nákupní seznam“ |
| C | Rozvoj | 5 | Workshop n / 32, skill body použité / dostupné, dva progress bary |
| C | Dalších 10 kroků | 7 | původní odškrtávací seznam, součet hotovo / celkem |

Řada A min. výška 232; další karty mají přirozenou výšku. Žádné pevné ořezání textu kvůli dorovnání řady. Nahoře v kartě nejvýše jedna navigační akce, v obsahu max. jedna dominantní akce. Klikatelné řádky mají chevron a přístupný název cíle. Nedělat celou kartu tlačítkem, pokud obsahuje další tlačítka nebo checkboxy.

Při 1280 zobrazit KPI 3 × 2 a obsah ve dvou stejných sloupcích: Další kroky / Roadmapa; Trials / Materiály; Poslední raidy přes oba; Rozvoj / Dalších 10 kroků. Při 1024 stejné pořadí, rozestupy 12 a padding 16; tabulka raidů může mít vlastní horizontální scroll. Při šířce obsahu pod 760 přejít na jeden sloupec, KPI na dva. Není požadována telefonní aplikace, tento fallback chrání zvětšený text.

„Upravit přehled“ otevře panel široký 360: seznam karet s viditelností a tlačítky „Výš“ / „Níže“, „Obnovit výchozí“. Reorder není závislý na drag & drop. Pořadí se ukládá; grid skládá karty v tomto pořadí bez CSS přeuspořádání pro čtečku. Při skrytí všech karet zobrazit akci „Obnovit karty“; ovladač úprav zůstává v hlavičce. KPI tvoří samostatnou kartu/skupinu při ukládání pořadí, pokud je datový model nerozděluje.

## 6. Sdílené komponenty a interakce

| Komponenta | Rozměry / varianty | Stavy a pravidla |
|---|---|---|
| Button | sm 32, md 36, lg 44; padding X 12/16/20; gap 8 | primary accent/on-accent; secondary raised + control border; ghost bez výplně; danger danger-bg + danger text a border |
| IconButton | 32 nebo 36 čtverec | dostupný název, tooltip; samostatná akce nesmí být pouhá ikona bez focus |
| Input / Select | min. 36 vysoký, padding X 12, border-control | label nad polem, hint pod ním; error ikona + text + danger okraj; focus společný |
| NumberStepper | minus 32, input min. 64, plus 32 | hranice disabled; ruční zadání; commit Enter/blur, Escape vrátí editaci |
| Textarea | min. 96, padding 12 | zvětšení svisle, poznámky bez násilného limitu jednoho řádku |
| Badge | min. 22 vysoký, padding X 6, text 12 | původ, výsledek, dostupnost; barva + slovo, není tlačítkem |
| Tabs | lišta min. 40, podtržení aktivního 2 | šipky přepínají focus, Home/End, správné tab role; dlouhá lišta lokálně scrolluje |
| Checkbox row | min. 40, checkbox 18 | klikací i label; hotovo success ikona, text zůstává čitelný; poznámka pod názvem |
| Progress | výška 6, dráha raised | vždy viditelná hodnota n / celkem, bez falešného procenta při neznámém cíli |
| Table | hlavička 36, řádek min. 40, buňka 12 X / 8 Y | sticky hlavička uvnitř scroll kontejneru, text vlevo, čísla vpravo, hover, sort ikona |
| Search + filters | search 240–360, ostatní podle obsahu | label i při placeholderu, vyčistit hledání, viditelný počet výsledků a reset filtrů |
| Dialog | běžný 480, import 720; max. šířka viewport − 32 | max. výška viewport − 48, scroll těla, pevná hlavička/patička |
| Detail panel | šířka 400–440 | název, metadata, podrobnosti, akce; pod obsahem 1000 jako dialog |
| Toast | 320–400, vpravo dole, margin 20 | úspěch 4 s, informativní 6 s; kritická chyba trvale v banneru |

Všechny interaktivní prvky mají hover, pressed, focus-visible a disabled. Focus neodstraňovat. Tab order sleduje čtení. Ikonové ovladače alespoň 32 × 32 pro desktop, při coarse pointer zvětšit na 44 × 44. Tooltip po 400 ms, max-width 280, nezakrývá focus; důležitý důvod blokace musí být i v textu detailu. Popover zavře Escape nebo kliknutí mimo; dialog zachytí focus a po zavření ho vrátí spouštěči. Destruktivní dialog zaměří nejdřív bezpečnou akci.

Formulář raidu je stejný v Dashboardu, Money Runs i Journalu. Titulek „Zapsat raid“, mapa, typ/trasa, výsledek, mince, délka, poznámka. Přepínač „Extrakce / Smrt“ s ikonami; při smrti jasně „Do výdělku se započítá 0“. Pod potvrzením vysvětlení „Zápis přidá jedno odehrané kolo. Mince profilu se nezmění.“ Primární akce „Uložit raid“. Žádné tiché dvojité odeslání.

## 7. Specifika všech 14 obrazovek

| Modul | Rozvržení a vizuální pravidla M1 |
|---|---|
| Dashboard | podle kapitoly 5; žádné fiktivní ukázkové hodnoty v produkčním prázdném stavu |
| Player Profile | vlevo formulář (max. 560), vpravo souhrn levelu, XP, Reward Pass a Amplified; pod tím graf historie. Jasně rozlišit editovatelný profil a historické body |
| Skill Tree | nahoře sticky rozpočet, plán a cena resetu; tři větve vedle sebe s názvem/barvou a patry. Uzel min. 148 × 88: název, body n / max, minus/plus a cíl plánu. Spojnice za uzly, nikoli přes text. Aktuální krok accent okraj, dokončený check, blokovaný lock + důvod. Plán/buildy v záložkách; na úzké šířce lokální scroll plátna min. 960, nikdy zmenšení písma |
| Workshop | 9 karet v gridu 3 / 2 / 1 podle dostupné šířky, min. karta 280. Název, level, readiness, materiály a podmínky. „Připraveno“ vyžaduje i podmínky, ne jen 100 % zásob. „Upgradovat a odečíst“ primary; „Jen zvýšit level“ secondary; oprava v menu s vysvětlením bez vrácení materiálu |
| Inventory | záložky Zásoba / Nákupní seznam / Lov ARC. Tabulka Název, Kategorie, Mám, Potřebuju, Chybí, Odkud, Na co. Množství stepper, chybí amber a číslo; nula neutrální. Součet potřeb přes stanice oddělit od připravenosti jedné stanice |
| Maps | nahoře osa odemykání a kola, pod ní karty min. 280. Odemčeno check / Zamčeno lock + „Ještě n kol“. Detail obsahuje místa, navštíveno, poznámky, vlastní body, úkoly a trasy. Bez místních obrazových podkladů nabídnout strukturovaný seznam; nevytvářet falešnou geografickou mapu |
| ARC Database | filtr nahoře, seznam + detail na široké ploše; název, kategorie, nebezpečnost a potřebné dropy v přehledu. Taktika, slabiny a poznámky v detailu; nevyplněná fakta jako „Neuvedeno“. Potřebný drop badge „Chybí n“, bez výstražné červené |
| Weapons | tier skupiny S/A/B/C jako kompaktní řádky; tier vždy písmeno, ne pouze barva. Anti-ARC badge s ikonou Crosshair. Samostatné vlastní hodnocení proti původnímu tieru; porovnání nejvýš 3 vedle sebe, lokální scroll. Aktuální fáze accent linka |
| Money Runs | hodiny 32/40 mono v panelu, Start/Pauza/Reset; v 8. minutě orange „8 minut“, v 10. danger „10 minut“, bez blikání. Dále KPI, graf, trasy a ceník v záložkách. Zápis převezme čas po explicitní akci. Průvodce trasy má očíslované checkbox kroky |
| Weekly Trials | hlavička ISO týdne a hvězdy / 15, pět řádků min. 72 vysokých: název, tři hvězdy, poznámka. Hvězdy jako přístupná volba hodnoty 0–3 včetně „0 hvězd“; vyplněné amber, prázdné outline. Historie níže nebo záložka, přechod týdne oznámit „Minulý týden uložen do historie“ |
| Raid Journal | filter bar, počet záznamů, tabulka Datum, Mapa, Trasa/typ, Výsledek, Coiny, Minuty, Akce. Datum sestupně. Upravit/smazat dostupné i klávesnicí, smazání potvrdit. Mobilnější fallback může skrýt trasu z tabulky do detailu, nikoli výsledek |
| Raid Checklist | souhrn hotovo / celkem, skupiny Před raidem a Kroky trasy; jeden checkbox na řádek s velkým klikacím labelem. „Nový raid“ resetuje příslušný checklist po potvrzení, nezapisuje raid ani nepřidává kolo |
| Statistics | společný filtr období a typu, KPI, časová řada, srovnání tras/map horizontálními bary, rozvoj workshopu/skillů. Nejlepší/nejhorší výsledek jen při dostupných datech; nesrovnatelné metriky nemíchat na jedné ose |
| Settings & Backup | sekce Data, Export a import, Snímky, Odkazy, O aplikaci; v závěru oddělená danger zóna. Cesta dat monospace s kopírováním. U snímků datum, typ a akce Obnovit. Neoficiální status a offline fungování textem v O aplikaci |

## 8. Grafy a informační stavy

SVG grafy: primární řada accent, ekonomika amber, extrakce success kruh, smrt danger kříž. Mřížka border-subtle 1 px, osy muted 12/18, křivka 2 px, bod 4 px. Výška běžně 180–240, přehledová 140. Osa výdělku začíná nulou, datum a jednotka explicitně, žádné 3D, gradientové plochy nebo duální osy. Tooltip při hover i focus ukáže datum, hodnotu, jednotku a výsledek. Graf má textové shrnutí a dostupnou tabulku dat. Smrt s nulovým výdělkem se zobrazuje markerem na nule, nezmizí.

| Situace | Prezentace a text |
|---|---|
| První spuštění | horní neblokující panel „Začni profilem nebo importem deníku.“ Akce „Upravit profil“, secondary „Importovat deník“. Karty zůstávají viditelné |
| Žádné raidy | v kartě ikona BookOpen, „Zatím nemáš zapsaný raid.“ + „Zapsat raid“; odvozené poměry `—`, počty `0`, žádná demo data |
| Žádná historie profilu | „Vývoj se zobrazí po dalších uložených dnech.“ Jeden bod zobrazit jako bod s datem |
| Filtr nic nenajde | „Tomuto filtru nic neodpovídá.“ + „Vymazat filtry“; neopakovat onboarding |
| Všechny materiály stačí | success check, „Na další úrovně máš dost materiálu.“ Neznamená splněné levelové podmínky ani všechny budoucí cíle |
| Zamčený upgrade/skill | lock, text konkrétní podmínky z jádra; tlačítko disabled, důvod dostupný bez hoveru |
| Chybějící herní údaj | `Neuvedeno`, neutrální metadata; není to uživatelská chyba |
| Načítání lokálních dat | při delším načtení neutrální skeleton obrysů, bez shimmeru; „Načítám lokální data…“. Do dokončení nespouštět editaci |
| Selhání ukládání | persistentní danger banner pod horní lištou: „Změny zatím nejsou uložené. Data zůstávají v paměti.“ Akce „Zkusit znovu“, „Exportovat zálohu“; lišta „Neuloženo“ |
| Obnova po poškození | amber banner „Načtena záloha z [datum a čas].“ + „Zobrazit podrobnosti“; popsat zachování poškozeného souboru |
| Bez použitelné zálohy | „Data se nepodařilo načíst. Je otevřen prázdný stav.“ Akce import/obnova, jasně oddělit od běžného prvního spuštění |
| Chyba importu | inline danger v dialogu; „Soubor není platná záloha.“ nebo „Záloha pochází z novější verze aplikace.“ Data zůstávají beze změny |
| Ořez číselné hodnoty | po potvrzení pole ukázat skutečně uloženou hodnotu a hint „Upraveno na povolený rozsah 0–75.“; při psaní nepřeskakovat kurzor |

Původ dat zobrazovat badge `Deník`, `Rešerše · neověřeno`, `Vlastní`. V detailu rešerše zdroj a datum, odkaz s ExternalLink a textem „vyžaduje internet“. Uživatelské poznámky vizuálně oddělit od herních faktů nadpisem „Moje poznámky“. Offline režim není chybový stav.

Import: výběr/vložení → kontrolní souhrn → explicitní potvrzení → protokol. Souhrn má tabulku Profil / Skill body / Materiály / Raidy / Hvězdy a informaci o snímku před změnou. Protokol ukáže zdroj vs. převod; žádné automatické potvrzení importu. Reset modulů pojmenuje modul a dopad, úplný reset vyžádá opsání `SMAZAT`, jak požaduje produktový návrh opsáním slova. Primární destruktivní akce je danger, nikdy tyrkysová.

## 9. Responzivita a dostupnost

Breakpointy vycházejí ze šířky klientské oblasti. Minimální nativní okno je 1024 × 640 podle produktového návrhu; otestovat i menší skutečný obsah pod systémovou titulkovou lištou.

| Šířka | Sidebar | Padding / gap | Rozložení |
|---|---|---|---|
| 1600 a více | 224 | 24 / 16 | Dashboard 6 KPI + 12 sloupců; obsah max. 1680 |
| 1280–1599 | 224, ručně sbalitelný | 24 / 16 | 3 KPI v řadě, dvě obsahové kolony |
| 1024–1279 | 64 automaticky | 16 / 12 | 3 KPI v řadě, dvě obsahové kolony |
| pod 1024 při zoomu | 64 | 12 / 12 | podle dostupného obsahu pod 760 jeden sloupec, 2 KPI |

Při šířce 1024 horní lišta používá mezery 12, kratší label „Body“ a „Kola“, hodnoty stále celé. Fáze může být „Fáze 2“ s názvem v tooltipu; stav uložení vždy textem. Při další tísni lišta naroste do dvou řad (min. 88), neskrývá chybu ukládání. Dlouhé mince se nezkracují na nejednoznačné `1M`; úplná hodnota má prioritu.

Tabulky a skill plátno mají lokální horizontální posuv se zřetelným scrollbarem, shell nemá horizontální scroll. Poznámky a názvy smějí zalamovat; ellipsis jen v přehledovém sloupci s dostupným plným detailem. Sticky prvky nesmí zakrýt focus nebo validační chybu. Při 200% zoomu může obsah přejít na jeden sloupec, dialog vždy zůstává v aktuálním viewportu. Velikosti textu se nezmenšují podle šířky.

## 10. Předání a kritéria hotového vizuálu

Claude má převzít nejdřív tokeny, shell a sdílené komponenty, potom Dashboard a vzory tabulka/detail/formulář pro ostatní moduly. Nečekat na AI obrázky: v M1 nejsou nutné. Jakákoli budoucí grafika musí být lokálně přibalená, nesmí předstírat oficiální značku ani nahrazovat funkční UI.

- Všech 14 položek navigace je čitelných nebo dostupných tooltipem a klávesnicí; názvy a pořadí odpovídají tabulce.
- Na 1024 × 640 lze dosáhnout všech akcí, bez překryvů sidebaru, lišty a obsahu. Na 1280 a 1920 je zachována hierarchie Dashboardu.
- Reálná česká diakritika, dlouhý název materiálu, mince s 11 číslicemi a neznámé XP nerozbíjejí layout.
- Každá chyba a významný stav mají textovou informaci; ovládání funguje bez myši, focus je viditelný, graf má alternativu.
- Prázdná data neukazují smyšlené trendy, dělení nulou ani falešnou úspěšnost 0 %.
- Všechny fonty, ikony a případné obrázky fungují offline. Žádný síťový indikátor, avatar nebo vzdálené pozadí není nutný k vykreslení.
- Otestovat běžný, empty, filtrovaný, blokovaný, neuložený a obnovený stav; vizuální kontrola stačí, tento dokument nepřidává aplikační kód ani testovací implementaci.
