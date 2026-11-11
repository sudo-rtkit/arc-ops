# Buildy skill tree: katalog, náhled a popisy – návrh

Stav: 11. 11. 2026, požadavek uživatele. Verze 0.8.0. Herní stav: Frozen Trail 2.0 (8. 10. 2026); podle poznámek
k 2.1.0–2.3.0 se skilly od té doby neměnily (2.1.0 jen oprava Broad Shoulders po načtení do raidu).

## Cíl

Modul Skill Tree má jen 4 hotové buildy bez přesných bodů a bez popisu. Nově:
1. **Katalog buildů** s přesným rozdělením bodů po skillech (ne jen součty větví), ověřený pravidly stromu.
2. **Náhled** každého buildu: mini strom se zvýrazněnými uzly a ranky, součty větví, koncové uzly.
3. **Popis** pro hráče (CS i EN): pro koho, styl hry, silné a slabé stránky, klíčové synergie, doporučená výbava
   (obecně, bez konkrétních čísel zbraní), pořadí vylepšování po levelech, zdroj a verze hry.
4. **Akce:** načíst jako plán, porovnat s mým stromem (co přidat, co je navíc, cena resetu), uložit jako vlastní build.
5. **Jeden vlastní „totálně broken“ build** navržený pro uživatele, poctivě označený jako teorie.

## Pravidla stromu (už implementovaná v `src/core/skills.ts`, beze změny)

76 bodů na levelu 75 (`budget = level + 1 + expBonus`), expedice přidají až 15 (91). Start uzel větve je první.
Volba uprostřed (1 ze 2) od 10 bodů ve větvi. Pozdní skilly až po volbě. Koncové uzly: první od 30 bodů ve větvi,
druhý od 40 (počítá se i první koncový), nejvýš 2 ze 3. Reset 2 000 coinů za bod.

## Datový model

`BuildDef` rozšířit (nebo nový typ, staré 4 buildy převést):
`{ id, name: {cs,en}, tags: ('pvp'|'pve'|'solo'|'squad'|'loot'|'stealth'|'expedition'|'broken')[],
difficulty: 1-3, points: Points /* přesné ranky */, variant91?: Points /* volitelná varianta s expedicí */,
order?: PlanStep[] /* doporučené pořadí; když chybí, odvodí se stepsFromBuild */, desc: {cs,en}: { summary,
playstyle, strengths[], weaknesses[], synergies[], loadout, leveling, notes? }, source: { label, url?, date } | 'own',
gameVersion: '2.0–2.3' }`.

Popisy píše náš tým vlastními slovy (žádné kopírování textů ze zdrojových webů), zdroj se uvede jako odkaz,
který se otevře jen na kliknutí. Herní názvy skillů zůstávají anglicky jako ve hře.

**Test:** každý build (i varianta 91) projde `invalidNodes` bez chyb, součet = 76 (91), součty větví sedí,
volba uprostřed nejvýš jedna na větev, koncové uzly nejvýš 2 a jen při splněném prahu.

## Katalog (přesné ranky; zkratky = názvy skillů v `src/core/data/skills.ts`)

Ranky ověřené ručně proti pravidlům; implementace je musí potvrdit testem a případný rozpor nahlásit.

### 1. Agresivní PvP – 24 / 41 / 11 (Conditioning / Mobility / Survival)
- M: Youthful Lungs 1, Nimble Climber 5, Fight Or Flight 5, Sure-Footed Scrambler 5, Ready To Roll 1, **Vault Spring**,
  Effortless Roll 5, Slip and Slide 5, Marathon Runner 5, Swift Start 5, Right Back At It 1, **In The Flow**, **Sprinting On Fumes**.
- C: Used To The Weight 1, Stubborn Mule 5, Three Deep Breaths 4, Vigorous Vaulter 1, **Back On Your Feet**, Loaded Arms 1,
  Broad Shoulders 5, Downed But Determined 5, Crawl Before You Walk 1.
- S: In-Round Crafting 1, Agile Croucher 5, Sturdy Ankles 4, **Quick Roll**.
- Pro: souboje s hráči, honičky, odpoutání. Slabiny: pomalý loot, žádné Security Lockery. Zdroj: thearcraiders.com.

### 2. Vyvážený raid – 31 / 31 / 14
- M: Youthful Lungs 1, Nimble Climber 5, Sure-Footed Scrambler 5, Ready To Roll 1, **Vaults on Vaults on Vaults**,
  Marathon Runner 5, Swift Start 5, Fight Or Flight 5, Effortless Roll 1, Slip and Slide 1, **Sprinting On Fumes**.
- C: Used To The Weight 1, Stubborn Mule 5, Three Deep Breaths 3, Vigorous Vaulter 1, **Mule's Gallop**, Broad Shoulders 5,
  Speedy Mule 5, Loaded Arms 1, Proficient Pryer 5, Downed But Determined 2, Crawl Before You Walk 1, **Security Breach**.
- S: In-Round Crafting 1, Looter's Instincts 5, Silent Scavenger 4, **Quick Roll**, Traveling Tinkerer 1, Sturdy Ankles 1, Agile Croucher 1.
- Nejčastěji doporučovaný univerzál: lockery i útěk. Zdroje: thearcraiders.com, boostingmarket.com, arcraiders.uk, lfcarry.com.

### 3. Looter / Security Breach – 31 / 14 / 31 (nahrazuje „Solo Looter“, zachovat jeho plán)
- M: Youthful Lungs 1, Nimble Climber 5, Fight Or Flight 4, **Vaults on Vaults on Vaults**, Marathon Runner 3.
- C: Used To The Weight 1, Stubborn Mule 5, Three Deep Breaths 5, Vigorous Vaulter 1, Vault 'n' Carry 1, **Mule's Gallop**,
  Broad Shoulders 5, Loaded Arms 1, Proficient Pryer 5, Speedy Mule 5, **Security Breach**.
- S: In-Round Crafting 1, Looter's Instincts 5, Silent Scavenger 5, Sturdy Ankles 5, Agile Croucher 1, **Quick Roll**,
  Traveling Tinkerer 1, Looter's Luck 5, Gentle Pressure 5, A Little Extra 1, **Road Warrior**.
- Money runy, questy, PvE. Slabiny: málo pohybu pro PvP. Zdroje: thearcraiders.com, arcraiders.uk.

### 4. PvE loot – 31 / 26 / 19
- M: Youthful Lungs 1, Nimble Climber 5, Fight Or Flight 4, **Vault Spring**, Marathon Runner 5, Effortless Roll 5, Swift Start 5.
- C: Used To The Weight 1, Stubborn Mule 2, Three Deep Breaths 5, Vigorous Vaulter 1, Vault 'n' Carry 1, **Mule's Gallop**,
  Loaded Arms 1, Broad Shoulders 5, Crawl Before You Walk 5, Downed But Determined 5, Speedy Mule 3, **Security Breach**.
- S: In-Round Crafting 1, Looter's Instincts 5, Silent Scavenger 4, **Quick Roll**, Traveling Tinkerer 1, Looter's Luck 5,
  Gentle Pressure 1, A Little Extra 1.
- Lockery, nosnost, rychlé prohledávání; jeden koncový uzel. Zdroje: boostingmarket.com, lfcarry.com.

### 5. Sólo přežití – 14 / 31 / 31
- M: Youthful Lungs 1, Nimble Climber 5, Fight Or Flight 5, **Vaults on Vaults on Vaults**, Marathon Runner 5, Effortless Roll 5,
  Swift Start 5, Slip and Slide 3, **Sprinting On Fumes**.
- C: Used To The Weight 1, Stubborn Mule 5, Three Deep Breaths 3, Vigorous Vaulter 1, **Back On Your Feet**, Loaded Arms 1, Broad Shoulders 2.
- S: In-Round Crafting 1, Looter's Instincts 5, Silent Scavenger 5, Agile Croucher 5, Sturdy Ankles 5, **Quick Roll**,
  Traveling Tinkerer 1, Gentle Pressure 5, A Little Extra 1, Stylish Landing 1, **Field Repair**.
- Sólo hráč, který se vyhýbá boji a opravuje výbavu v raidu. Zdroj: thearcraiders.com.

### 6. Tichý zloděj – 14 / 31 / 31
- M: Youthful Lungs 1, Nimble Climber 5, Fight Or Flight 5, **Vault Spring**, Marathon Runner 5, Swift Start 5, Effortless Roll 5,
  Slip and Slide 3, **Sprinting On Fumes**.
- C: Used To The Weight 1, Stubborn Mule 5, Three Deep Breaths 5, Vigorous Vaulter 1, **Mule's Gallop**, Loaded Arms 1.
- S: In-Round Crafting 1, Looter's Instincts 5, Silent Scavenger 5, Sturdy Ankles 1, Agile Croucher 5, **Quick Roll**,
  Gentle Pressure 5, Traveling Tinkerer 1, Looter's Luck 5, A Little Extra 1, **Road Warrior**.
- Tiché prohledávání, breaching a recyklace; bez Security Breach. Zdroj: boostingmarket.com.

### 7. Stamina Runner – 19 / 41 / 16 (stávající, zachovat přesný plán `runner`)
### 8. Týmová podpora – 31 / 4 / 41 (stávající „Team Support“, doplnit přesné ranky)
- M: Youthful Lungs 1, Fight Or Flight 3.
- C: Used To The Weight 1, Stubborn Mule 5, Three Deep Breaths 5, Vigorous Vaulter 1, Vault 'n' Carry 1, **Back On Your Feet**,
  Downed But Determined 5, Crawl Before You Walk 5, Broad Shoulders 5, Loaded Arms 1, **Security Breach**.
- S: In-Round Crafting 1, Looter's Instincts 5, Silent Scavenger 5, Sturdy Ankles 4, Agile Croucher 5, **Minesweeper**,
  Gentle Pressure 5, Traveling Tinkerer 1, A Little Extra 1, Looter's Luck 5, Turtle Crawl 5, Stylish Landing 1,
  **Nomadic Crafting**, **Field Repair**.
- Squad: crafting a opravy pro tým, přežití na zemi. Zdroj: původní deník.

### 9. PvP Fighter – 31 / 31 / 14 (stávající, doplnit přesné ranky)
- C: Used To The Weight 1, Stubborn Mule 5, Three Deep Breaths 5, Vigorous Vaulter 1, **Back On Your Feet**, Broad Shoulders 5,
  Downed But Determined 5, Crawl Before You Walk 5, Loaded Arms 1, Proficient Pryer 1, **Weapon Bash**.
- M: Youthful Lungs 1, Nimble Climber 5, Fight Or Flight 5, **Vault Spring**, Effortless Roll 5, Marathon Runner 5,
  Slip and Slide 5, Swift Start 3, **In The Flow**.
- S: In-Round Crafting 1, Agile Croucher 5, Sturdy Ankles 4, **Quick Roll**, Turtle Crawl 3.
- Zdroj: původní deník.

### 10. Expediční PvP – 33 / 41 / 17 (jen 91 bodů)
- M: Youthful Lungs 1, Sure-Footed Scrambler 2, Nimble Climber 5, Fight Or Flight 5, **Vault Spring**, Effortless Roll 5,
  Marathon Runner 5, Slip and Slide 5, Off The Wall 5, Swift Start 5, **Sprinting On Fumes**, **Wall Run**.
- C: Used To The Weight 1, Three Deep Breaths 5, Stubborn Mule 3, Vigorous Vaulter 1, **Mule's Gallop**, Loaded Arms 1,
  Broad Shoulders 5, Downed But Determined 5, Crawl Before You Walk 5, Speedy Mule 3, Proficient Pryer 3.
- S: In-Round Crafting 1, Looter's Instincts 5, Sturdy Ankles 3, Silent Scavenger 1, **Quick Roll**, Looter's Luck 5.
- Pro hráče s 15 body z expedic. Zdroj: lfcarry.com.

### 11. ★ Buldozer (vlastní „broken“ build) – 41 / 31 / 4, varianta 91: 41 / 31 / 19
**Myšlenka:** nezastavitelný nákladák. Přetížený sprint skoro bez konce, přes překážky bez staminy, otevírá lockery
a nepřítele (hráče i ARC) při sprintu odhodí z cesty.
- C (41): Used To The Weight 1, Stubborn Mule 5, Three Deep Breaths 5, Vigorous Vaulter 1, Vault 'n' Carry 1,
  **Mule's Gallop**, Loaded Arms 1, Broad Shoulders 5, Speedy Mule 5, Proficient Pryer 5, Downed But Determined 5,
  Crawl Before You Walk 4, **Security Breach**, **Bull Rush**.
- M (31): Youthful Lungs 1, Nimble Climber 5, Fight Or Flight 5, **Vaults on Vaults on Vaults**, Marathon Runner 5,
  Swift Start 5, Effortless Roll 5, Slip and Slide 3, **Sprinting On Fumes**.
- S (4): In-Round Crafting 1, Looter's Instincts 3.
- Varianta 91 (S 19): In-Round Crafting 1, Looter's Instincts 5, Silent Scavenger 4, **Quick Roll**, Looter's Luck 5,
  A Little Extra 1, Gentle Pressure 2.
- **Synergie:** Mule's Gallop (sprint přetížený) + Speedy Mule 5 (až +40 % rychlosti při přetížení) + Stubborn Mule 5
  (rezerva 30) + Broad Shoulders 5 (+10) + Loaded Arms (zbraň za polovinu váhy) = nosíš mnohem víc a pořád běžíš.
  Sprinting On Fumes + Marathon Runner 5 + Swift Start 5 + Fight Or Flight 5 (stamina zpět při zásahu) = sprint, který
  prakticky nedojde. Vaults on Vaults on Vaults + Vigorous Vaulter + Vault 'n' Carry = přes překážky zdarma, i vyčerpaný
  a i s nesenou věcí. Bull Rush = při sprintu se schovanou zbraní odhodíš hráče i ARC, takže tě v úzké chodbě nikdo
  nezastaví. Security Breach + Proficient Pryer 5 = rychlé lockery.
- **Slabiny (poctivě):** skoro žádné Survival perky (pomalejší a hlasitější loot, bez Quick Roll v základní verzi),
  Bull Rush jen se schovanou zbraní, proti soustředěné palbě nepomůže; kombinace přetíženého sprintu a Bull Rush
  **není ověřená ve hře**, čísla jsou z náhledových hodnot stromu. Označit štítkem „Teorie – vyzkoušej sám“.
- Zdroj: vlastní návrh ARC OPS.

## Náhled a UI (modul Skill Tree, záložka Buildy)

- Mřížka karet buildů s filtrem štítků (PvP, PvE, sólo, squad, loot, tichý, expedice, broken) a řazením.
  Karta: název, štítky, obtížnost, mini strom (3 sloupce po tierech, zvýrazněné uzly s rankem, koncové uzly výrazně),
  pruhy součtů větví, 3 klíčové skilly.
- Detail buildu (panel nebo dialog): velký náhled stromu (stejná komponenta jako hlavní strom, jen pro čtení),
  popis v sekcích (shrnutí, styl hry, silné/slabé stránky, synergie, výbava, pořadí po levelech), přepínač 76 / 91
  u buildů s variantou, zdroj s odkazem (na kliknutí) a verze hry, tlačítka **Načíst jako plán**, **Porovnat s mým
  stromem** (přidat / navíc / cena resetu 2 000 za bod), **Uložit jako můj build**.
- Broken build má odlišný štítek a upozornění „Teorie“.
- Stávající uložené buildy a plány uživatele zůstávají beze změny; staré vestavěné plány `runner` a `looter` fungují dál.
- Všechny texty CS + EN; názvy skillů anglicky.

## Testy

Validace všech buildů pravidly (viz výše), převod na plán (`stepsFromBuild` nebo `order`) dosáhne přesně `points`,
porovnání s aktuálním stromem, E2E: filtr, detail, načtení plánu, porovnání, oba jazyky. Žádné nové URL kromě
odkazů na zdroje (otevírají se jen na kliknutí; bezpečnostní testy dál platí).

## Mimo rozsah

Simulace čísel (DPS, stamina) a importy buildů z cizích webů.
