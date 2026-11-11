# Ops // vrstvená evoluce Bedňáka B

Grafický podklad pro milník 5, originální programatická pixelová kresba. Zachovává nízkou bednu, párové meruňkové oči, tmavé hledí, měděné čelo, boční úchyty a krátké boty. Starší imagegen evoluce slouží jen jako kontext; její pixely se nepoužívají. Bez herních assetů, log, převzatých strojů nebo grafiky XCOM.

## Otevření a soubory

- `preview.html`: offline náhled přímo přes file:// v Edge/Chrome. Česká obsluha, level 0–75, sedm stavů, 1×/2×, šatník, přepínače slotů, dva podklady, pauza, proměna a jiskra. Respektuje reduced-motion.
- `ops-layers.json`: autoritativní manifest. HTML má přesnou vloženou kopii kvůli omezením file:// fetch; build.py ji aktualizuje.
- `bodies/<form>/<state>.png`: 35 horizontálních pásů, 190 tělových snímků 64 × 64.
- `parts/<slot>/`: 80 logických variant v 16 slotech, 200 PNG včetně 120 přizpůsobení tělu. Hledí, pancíř, ramena, plachta a opasek se přizpůsobují šířce. Záplaty mají explicitní varianty pro všechna těla se stejnými lokálními pixely.
- `transform/`: čtyři přechody, každý 10 × 100 ms = 1 sekunda.
- `fx/sparkle.png`: šest snímků, 600 ms, poslední prázdný.
- `composite/level-00.png` až `level-75.png`: průhledné výchozí outfity, idle snímek 0, 64 × 64.
- `composite/all-levels.png`: kontaktní list všech levelů ve 2×.
- `composite/states-overview.png`, `animation-proof.png`, `wardrobe-proof.png`: mimika, všech 190 oblečených snímků a 400 kombinací dílu s podobou.
- `composite/silhouettes.png`: pět černých siluet bez výbavy nahoře, stejné podoby ve výchozím outfitu na vstupním levelu dole, vše 3× na krémovém pozadí.
- `composite/preview.png`: kontrolní export náhledu z Edge.

## Podoby a animace

| ID | Podoba | Level | Vlastní konstrukce těla |
|---|---|---|---|
| rookie | Začátečník | 0–14 | Úzká provizorní bedna, jednoduché boty |
| explorer | Průzkumník | 15–29 | Vysoký skautský stožárek, malý batoh a boční čočka |
| scavenger | Mrchožrout | 30–44 | Výrazné asymetrické svařované plechy, širší bedna, zachráněné nástroje ve výbavě |
| veteran | Veterán | 45–59 | Těžká široká ramena, opravené zjizvené hledí, zesílené boty |
| legend | Legenda | 60–75 | Největší bedna, rozevlátá plachta, zářivé meruňkové linky a zavěšené trofeje |

Charakteristická konstrukce každé podoby je součást tělové vrstvy a zůstává čitelná i bez výbavy. Vyměnitelné sloty na ni přidávají další opravy a nástroje; například vypnutí slotu antény neodstraní konstrukční stožárek průzkumníka. Plochy holých siluet jsou postupně 830 / 1248 / 1519 / 1751 / 1981 neprůhledných pixelů. Legenda má přibližně 2,39× plochu začátečníka. Každá má odlišný profil, nejen jinou barvu.

Podoby mění siluetu i bez výbavy. Každá má idle 8, scanning 8, done 5, unsure 5, sleeping 6, alert 4 a drag 2 snímky. Časování, loop a returnTo vycházejí z ../final/sprites.json a jsou explicitně v manifestu. Oči mění výraz; skenovací linka běží uvnitř hledí. Pravý úchyt se zvedá při radosti a upozornění; při tažení boty visí níže.

## Sloty a varianty

Přesné české i anglické názvy, soubory a offsety všech 80 dílů obsahuje katalog parts v JSON. ID má tvar slot-1 až slot-5. Varianty lze míchat na všech tělech. Hodnota null v defaultOutfit znamená prázdný slot, ve šatníku „Bez dílu“.

| Slot | Varianty 1 → 5 |
|---|---|
| antenna / Anténa | Drát s páskou; Ladicí vidlička; Cívka ze šrotu; Keramický snímač; Skládaný přijímač |
| visor / Hledí | Holý rámeček; Páskovaný lem; Nýtované obočí; Dvojitý kryt; Keramický oblouk |
| armour / Pancíř | Plechový lem; Přišitý plát; Nýtované rohy; Překryvné pláty; Keramické segmenty |
| backpack / Batoh | Látková kapsa; Srolovaná plachta; Přepravní klec; Pouzdro na články; Polní archiv |
| tool / Nářadí | Ohnutý klíč; Měřicí hrot; Kleště na šrot; Ruční cívka; Skládací měřidlo |
| badges / Nášivky | První steh; Cesta domů; Tři nýty; Polní zápis; Archivář |
| paint / Barva a záplaty | Kousek pásky; Křížový steh; Měděná oprava; Šablona skladu; Krémová záplata |
| tag / Štítek | Kartónový štítek; Plechová cedulka; Nýtovaný štítek; Smaltovaná tabulka; Archivní štítek |
| shoulders / Ramenní pláty | Plechová ramena; Páskové výztuhy; Svařované rohy; Těžké nárameníky; Keramická ramena |
| lamp / Boční lampa | Kapesní žárovka; Krytá lucerna; Dvojitá kontrolka; Polní svítilna; Meruňkový maják |
| cables / Kabelový svazek | Volný vodič; Svázaný pár; Izolovaná smyčka; Opletený svazek; Kabelový hřeben |
| charm / Přívěsek | Podložka; Starý klíček; Keramický střep; Svazek památek; Polní trofeje |
| cape / Plachta | Ustřižená látka; Malá plachta; Sešívaný závěs; Záplatovaný přehoz; Archivářův plášť |
| fin / Senzorová ploutev | Plechová lopatka; Děrovaný snímač; Dvojitá ploutev; Skládaný senzor; Keramická korunka |
| belt / Opasek | Látkový řemen; Poutka na nástroje; Nýtovaný pás; Kazetový opasek; Polní zásobník |
| radio / Vysílačka | Krystalový přijímač; Ladicí skříňka; Šrotové rádio; Polní stanice; Archivní vysílač |

## Odemykání a štítky

**Level 0 je holé tělo bez jakéhokoli dílu. Každý level 1–75 odemyká právě jeden nový viditelný díl mimo štítek.** Celkem 75 takových dílů plus pět stylů číselného štítku = 80 modelů. Nový díl se současně nasadí do automatického outfitu. Žádný level není založen pouze na změně čísla.

Každý z pěti štítků obsahuje 76 dlaždic 00–75, celkem 380. Jeho PNG je horizontální atlas **988 × 9 px**, dlaždice **13 × 9 px**, index = playerLevel. Manifest má frameSource: playerLevel, frameCount: 76 a frameSize. Není to animace. Číslice jsou vlastní definice 3 × 5 pixely, bez systémového fontu.

Každý řádek unlocks má level, form, unlockedParts, swaps, kompletní defaultOutfit a českou hlášku; na hranici podoby také transformation. Prázdné unlockedParts má pouze level 0. Štítky se navíc odemknou na levelech 15/30/45/60/75; jejich číslo se od prvního odemčení mění s levelem. Úplné outfity všech 76 levelů jsou v JSON.

| Slot | Varianta 1 | 2 | 3 | 4 | 5 |
|---|---:|---:|---:|---:|---:|
| Anténa | 1 | 16 | 31 | 46 | 61 |
| Hledí | 2 | 17 | 32 | 47 | 62 |
| Pancíř | 3 | 18 | 33 | 48 | 63 |
| Batoh | 4 | 19 | 34 | 49 | 64 |
| Nářadí | 5 | 20 | 35 | 50 | 65 |
| Nášivka | 6 | 21 | 36 | 51 | 66 |
| Záplata | 7 | 22 | 37 | 52 | 67 |
| Ramena | 8 | 23 | 38 | 53 | 68 |
| Lampa | 9 | 24 | 39 | 54 | 69 |
| Kabely | 10 | 25 | 40 | 55 | 70 |
| Přívěsek | 11 | 26 | 41 | 56 | 71 |
| Plachta | 12 | 27 | 42 | 57 | 72 |
| Ploutev | 13 | 28 | 43 | 58 | 73 |
| Opasek | 14 | 29 | 44 | 59 | 74 |
| Vysílačka | 15 | 30 | 45 | 60 | 75 |
| Štítek navíc | 15 | 30 | 45 | 60 | 75 |

Na levelech 15/30/45/60 se mění i tělo. Sbírka je sjednocení historicky získaných ID. Při poklesu levelu se mění podoba a automatický outfit, ale získané díly zůstávají. Trvalou sbírku a zálohu zajistí aplikace. Náhled drží nejvyšší navštívený level pouze během otevření stránky; ruční outfit platí do změny slideru. To nepředepisuje persistenci aplikace.

## Kotvy a skládání

Celé pixely uvnitř snímku 64 × 64; počátek vlevo nahoře, x doprava a y dolů. forms[].states[state].frames[i] obsahuje 16 slotových anchors a zOrder včetně těla. Díl má offset [dx,dy] od kotvy k levému hornímu rohu PNG. parts[].forms[formId] může přepsat file i offset; jinak použít hlavní file a offset.

Příklad: kotva [23,23] a offset [-3,-13] znamená kreslit na [20,10]. Offset přičíst jednou. Kotvy už zahrnují pohyb těla i pravého úchytu, další automatický posun není potřeba.

Pořadí odzadu: **plachta (1) → tělo (10) → batoh (12) → záplaty (20) → pancíř (30) → ramena (32) → kabely (35) → vysílačka (36) → hledí (40) → opasek (45) → nášivky (50) → štítek (60) → nářadí (70) → anténa (80) → ploutev (81) → lampa (85) → přívěsek (86) → jiskra (100)**. Batoh je kreslen přes boční úchyt, aby šly jeho varianty přečíst i na nejširším těle. Tělový pás oříznout [i*64,0,64,64]; díly kreslit celé, pouze štítek oříznout podle levelu. Hledí je otevřený rámeček; oči i skenovací linka zůstávají na těle.

Source-over, binární alfa, vypnuté imageSmoothing. Nejprve skládat na 64 × 64 a pak zobrazit 1× nad hrou nebo 2× v overlayi. Žádné frakční škálování ani interpolace kotev.

Proměna je hotový tělový pás. Po dobu jedné sekundy skrýt běžné tělo i výbavu, přehrát pás jednou a pak složit cílové tělo a outfit v idle. Výbava tak nemá chybné rozměry mezi dvěma těly. Při přeskočení více podob může aplikace přejít rovnou do cíle. Jiskra se kreslí v souřadnicích plátna nad běžný outfit. Při reduced-motion náhled promění okamžitě a jiskru vynechá.

## Paleta

14 deklarovaných barev, **12 použitých v PNG assetech**. Dva grafitové podklady jsou rezervované pro okolí postavy. Bez gradientů, antialiasingu nebo částečné alfy. Obrys je 1 logický pixel; tmavé plochy hledí a bot jsou vlastní materiál.

| Účel | Hex |
|---|---|
| Obrys | #101214 |
| Grafit / panel | #141719 / #1D2225 |
| Tmavý materiál | #272D31 |
| Ocel / cín | #596267 / #A2A8AA |
| Krémová | #F2EEE7 |
| Meruňka / světlo | #F4AD82 / #FFC69F |
| Měď / rez | #DE966F / #B78060 |
| Stavová zelená / jantar | #A8CB9A / #E8C879 |
| Upozornění | #F09B9E |

## Reprodukce a ověření

Z kořene repozitáře, Python 3 + Pillow a existující @playwright/test s Edge:

```powershell
python docs/design/buddy/layers/tools/build.py
node docs/design/buddy/layers/tools/verify.mjs
python docs/design/buddy/layers/tools/verify_pixels.py
```

Skripty zapisují pouze do layers/. Build čte časování z final/. Žádná změna aplikace, commit ani push.

- tools/validation.json: rozměry, časování, alfa 0/255, paleta, dosažitelnost všech 80 dílů, 76 unikátních kompozic a 15 200 kontrol dílu ve snímku bez přesahu. Každý level 1–75 má nový non-tag díl a skutečnou viditelnou změnu alespoň tří pixelů při stejném těle a stejném čísle štítku. Pole visibleUnlocks obsahuje počty změněných pixelů pro všech 75 kroků. Kontroluje se holý level 0, pět unikátních masek siluet a jejich přísně rostoucí plocha.
- tools/browser-validation.json: skutečný offline Edge, shoda manifestu, 76 levelů, 400 výběrů dílů, 35 kombinací podoby a stavu, přepínače, automatický outfit, měřítko, čtyři proměny, návraty jednorázových stavů, jiskra a reduced-motion. Bez chyb JS a vzdálených požadavků.
- tools/pixel-validation.json: všech 76 screenshotů živého canvasu odpovídá referenčním pixelům na grafitu ve 2×. Skutečné složení 15 200 jednotlivých dílů s tělovými snímky ověřuje, že nezakrývají oči. Screenshoty: tools/browser-proof/.
- Vizuální kontrola kontaktního listu a sedmi stavů: identita B, oči, silueta, mimika a výbava. Nejde o ověření nativního overlaye nad hrou.

## Co zbývá rozhodnout

Pro převzetí grafiky nic. Každý level 1–75 přidává nový viditelný díl, štítek je bonus. Proměna dočasně skrývá výbavu. Implementace musí respektovat prázdné sloty null, 16 slotů, atlas štítků, kotvy a uchování sbírky při poklesu levelu. Nativní DPI a ukládání šatníku patří další implementaci.
