/* Hlášky Opse podle povahy (0.10.0): Věcný (plain) / Kamarádský (friendly, výchozí) / Drzý (cheeky).
   Každá situace má v obou jazycích pro každou povahu několik variant; střídají se bez okamžitého opakování
   (src/core/opsVoice.ts). Drzost je jen hravá: nikdy urážlivá ani vulgární, žádné narážky na skutečné hráče.
   Parametry jako ve slovníku: {count} číslo, {name:raw} text beze změny. Plurály { one, few, other }.
   Tón inspirovaný ukecanými roboty, ale vlastní texty (žádné hlášky cizích postav). Hlídá tests/i18n/ops-lines.test.ts. */
import type { Lang, Msg } from './index';
import type { OpsPersonality } from '../core/types';

export type LineVariants = Record<OpsPersonality, Msg[]>;

const cs = {
  /* ----- snímek a zápis ----- */
  'scan.nothing': {
    plain: ['Na snímku není inventář.', 'Inventář na snímku nevidím.'],
    friendly: ['Tady žádný inventář nevidím. Zkusíme to v INVENTORY?', 'Hm, prázdno. Otevři inventář a cvakni znova.'],
    cheeky: ['Krásný snímek. Jen na něm chybí inventář.', 'Tohle je výhled, ne inventář. Ale hezký.'],
  },
  'scan.otherScreen': {
    plain: ['Tahle obrazovka se nečte.', 'Tuto obrazovku nečtu. Podporuji STASH a FINDINGS.'],
    friendly: ['Tuhle obrazovku číst neumím. Zkus STASH nebo FINDINGS po raidu.', 'Tady radši nic nečtu. STASH nebo FINDINGS a jedem.'],
    cheeky: ['Tohle čtu jen při úplňku. Dej mi STASH nebo FINDINGS.', 'Pěkná obrazovka. Špatná, ale pěkná.'],
  },
  'scan.check': {
    plain: [
      { one: 'Ke kontrole {count} řádek · stránek {pages}.', few: 'Ke kontrole {count} řádky · stránek {pages}.', other: 'Ke kontrole {count} řádků · stránek {pages}.' },
      { one: 'Zkontroluj {count} řádek, pak potvrď zápis.', few: 'Zkontroluj {count} řádky, pak potvrď zápis.', other: 'Zkontroluj {count} řádků, pak potvrď zápis.' },
    ],
    friendly: [
      { one: 'Skoro hotovo. Mrkni mi na {count} řádek, ať nic nespletu.', few: 'Skoro hotovo. Mrkni mi na {count} řádky, ať nic nespletu.', other: 'Skoro hotovo. Mrkni mi na {count} řádků, ať nic nespletu.' },
      { one: 'Přečteno. U {count} řádku si nejsem jistý, juknem na to spolu?', few: 'Přečteno. U {count} řádků si nejsem jistý, juknem na to spolu?', other: 'Přečteno. U {count} řádků si nejsem jistý, juknem na to spolu?' },
    ],
    cheeky: [
      { one: '{count} řádek je rozmazaný. Já to nebyl, to tvoje ruka.', few: '{count} řádky jsou rozmazané. Já to nebyl.', other: '{count} řádků je rozmazaných. Já to nebyl.' },
      { one: 'Přečetl jsem skoro všechno. {count} řádek nechám na tobě, šéfe.', few: 'Přečetl jsem skoro všechno. {count} řádky nechám na tobě, šéfe.', other: 'Přečetl jsem skoro všechno. {count} řádků nechám na tobě, šéfe.' },
    ],
  },
  'scan.read': {
    plain: [
      { one: 'Přečten {count} řádek · stránek {pages}.', few: 'Přečteny {count} řádky · stránek {pages}.', other: 'Přečteno {count} řádků · stránek {pages}.' },
      { one: 'Hotovo: {count} řádek. Čeká na potvrzení.', few: 'Hotovo: {count} řádky. Čekají na potvrzení.', other: 'Hotovo: {count} řádků. Čekají na potvrzení.' },
    ],
    friendly: [
      { one: 'Mám to! {count} řádek, stačí potvrdit.', few: 'Mám to! {count} řádky, stačí potvrdit.', other: 'Mám to! {count} řádků, stačí potvrdit.' },
      { one: 'Čisté čtení, {count} řádek. Zapíšeme?', few: 'Čisté čtení, {count} řádky. Zapíšeme?', other: 'Čisté čtení, {count} řádků. Zapíšeme?' },
    ],
    cheeky: [
      { one: '{count} řádek bez jediné chyby. Klidně mi zatleskej.', few: '{count} řádky bez jediné chyby. Klidně mi zatleskej.', other: '{count} řádků bez jediné chyby. Klidně mi zatleskej.' },
      { one: 'Přečteno: {count} řádek. Zase jsem byl rychlejší než ty.', few: 'Přečteno: {count} řádky. Zase jsem byl rychlejší než ty.', other: 'Přečteno: {count} řádků. Zase jsem byl rychlejší než ty.' },
    ],
  },
  'scan.failed': {
    plain: ['Snímek se nepovedl.', 'Snímek selhal. Zkus to znovu.'],
    friendly: ['Jejda, snímek se nepovedl. Zkusíme to znovu?', 'Něco zaskřípalo, snímek nevyšel. Ještě jednou?'],
    cheeky: ['Snímek utekl. Rychlejší než raider s plným batohem.', 'Cvak a nic. Tohle si nepamatuj, prosím.'],
  },
  'scan.written': {
    plain: ['Zapsáno: {count}.', 'Uloženo položek: {count}.'],
    friendly: ['Zapsáno, {count} položek je v bedně.', 'Hotovo, uložil jsem {count} položek. Dobrá práce!'],
    cheeky: ['{count} položek v bedně. Ani jsem se nezapotil.', 'Zapsáno: {count}. Já vím, jsem úžasný.'],
  },
  'loot.found': {
    plain: [
      { one: 'Loot po raidu: {count} řádek ke kontrole.', few: 'Loot po raidu: {count} řádky ke kontrole.', other: 'Loot po raidu: {count} řádků ke kontrole.' },
      { one: 'Kořist přečtena, {count} řádek. Zkontroluj a potvrď.', few: 'Kořist přečtena, {count} řádky. Zkontroluj a potvrď.', other: 'Kořist přečtena, {count} řádků. Zkontroluj a potvrď.' },
    ],
    friendly: [
      { one: 'Ukaž, co neseš! {count} řádek čeká na tvoje kývnutí.', few: 'Ukaž, co neseš! {count} řádky čekají na tvoje kývnutí.', other: 'Ukaž, co neseš! {count} řádků čeká na tvoje kývnutí.' },
      { one: 'Pěkný úlovek, {count} řádek. Projdeme ho spolu?', few: 'Pěkný úlovek, {count} řádky. Projdeme je spolu?', other: 'Pěkný úlovek, {count} řádků. Projdeme je spolu?' },
    ],
    cheeky: [
      { one: '{count} řádek kořisti. Doufám, že to není zase šroub.', few: '{count} řádky kořisti. Doufám, že to nejsou zase šrouby.', other: '{count} řádků kořisti. Doufám, že to nejsou zase šrouby.' },
      { one: 'Kořist! {count} řádek. Potvrď, než si to rozmyslím.', few: 'Kořist! {count} řádky. Potvrď, než si to rozmyslím.', other: 'Kořist! {count} řádků. Potvrď, než si to rozmyslím.' },
    ],
  },
  'loot.empty': {
    plain: ['Batoh po raidu je prázdný.', 'V batohu po raidu nic není.'],
    friendly: ['Batoh je prázdný. Hlavně že ses vrátil celý.', 'Tentokrát bez kořisti. Příště to vyjde!'],
    cheeky: ['Prázdný batoh. Turistika je taky sport.', 'Nic? Ani jeden šroubek? Respekt k úklidu.'],
  },
  'loot.dup': {
    plain: ['Tenhle snímek už je zapsaný.', 'Tato kořist už je v deníku.'],
    friendly: ['Tohle už máme zapsané, nebudu to počítat dvakrát.', 'Ten snímek znám, už je v deníku.'],
    cheeky: ['Stejný snímek podruhé? Kořist se tím nezdvojnásobí.', 'Déjà vu. Tohle už jsem zapsal.'],
  },
  'loot.written': {
    plain: [
      { one: 'Loot zapsán: {count} položka.', few: 'Loot zapsán: {count} položky.', other: 'Loot zapsán: {count} položek.' },
      { one: 'Kořist uložena, {count} položka.', few: 'Kořist uložena, {count} položky.', other: 'Kořist uložena, {count} položek.' },
    ],
    friendly: [
      { one: 'Kořist je v deníku, {count} položka. Pěkný raid!', few: 'Kořist je v deníku, {count} položky. Pěkný raid!', other: 'Kořist je v deníku, {count} položek. Pěkný raid!' },
      { one: 'Zapsáno, {count} položka. Jdu ji uklidit do bedny.', few: 'Zapsáno, {count} položky. Jdu je uklidit do bedny.', other: 'Zapsáno, {count} položek. Jdu je uklidit do bedny.' },
    ],
    cheeky: [
      { one: '{count} položka zapsaná. Zbytek kořisti si asi nechali ARC.', few: '{count} položky zapsané. Zbytek si asi nechali ARC.', other: '{count} položek zapsaných. Zbytek si asi nechali ARC.' },
      { one: 'Zapsáno: {count} položka. Nesu ji sám, nemusíš děkovat.', few: 'Zapsáno: {count} položky. Nesu je sám, nemusíš děkovat.', other: 'Zapsáno: {count} položek. Nesu je sám, nemusíš děkovat.' },
    ],
  },

  /* ----- vývoj ----- */
  'level.part': {
    plain: ['Level {level:raw}: {name:raw}.', 'Level {level:raw}, nový díl: {name:raw}.'],
    friendly: ['Level {level:raw}! Mám nový díl: {name:raw}.', 'Juchů, level {level:raw}. {name:raw} mi sedne.'],
    cheeky: ['Level {level:raw}. {name:raw}, konečně něco pro moji krásu.', 'Level {level:raw}! {name:raw}. Teď vypadám důležitě.'],
  },
  'level.parts': {
    plain: [
      { one: 'Level {level:raw}: {count} nový díl.', few: 'Level {level:raw}: {count} nové díly.', other: 'Level {level:raw}: {count} nových dílů.' },
      { one: 'Level {level:raw}, odemčen {count} díl.', few: 'Level {level:raw}, odemčeny {count} díly.', other: 'Level {level:raw}, odemčeno {count} dílů.' },
    ],
    friendly: [
      { one: 'Level {level:raw}! Mám {count} nový díl do šatníku.', few: 'Level {level:raw}! Mám {count} nové díly do šatníku.', other: 'Level {level:raw}! Mám {count} nových dílů do šatníku.' },
      { one: 'Skok na level {level:raw}, {count} díl navíc. Paráda.', few: 'Skok na level {level:raw}, {count} díly navíc. Paráda.', other: 'Skok na level {level:raw}, {count} dílů navíc. Paráda.' },
    ],
    cheeky: [
      { one: 'Level {level:raw} a {count} díl. Vánoce v dílně.', few: 'Level {level:raw} a {count} díly. Vánoce v dílně.', other: 'Level {level:raw} a {count} dílů. Vánoce v dílně.' },
      { one: 'Level {level:raw}? {count} díl? Kdo to tady makal?', few: 'Level {level:raw}? {count} díly? Kdo to tady makal?', other: 'Level {level:raw}? {count} dílů? Kdo to tady makal?' },
    ],
  },
  'level.form': {
    plain: ['Level {level:raw}: nová podoba {name:raw}.', 'Level {level:raw}, podoba {name:raw}.'],
    friendly: ['Level {level:raw}! Jsem teď {name:raw}. Jak mi to sluší?', 'Koukej, level {level:raw}. Nová podoba: {name:raw}!'],
    cheeky: ['Level {level:raw}. {name:raw}. Prosím, žádné autogramy.', 'Proměna dokončena: {name:raw}. Zrcadlo, prosím.'],
  },

  /* ----- rady a krátké hlášky ----- */
  'hint.missing': {
    plain: ['Chybí ti {mats:raw} na {station:raw} {level:raw}.', 'Na {station:raw} {level:raw} chybí: {mats:raw}.', 'Pro {station:raw} {level:raw} potřebuješ ještě {mats:raw}.'],
    friendly: ['Ještě {mats:raw} a {station:raw} {level:raw} je tvůj, raidere.', 'Už jen {mats:raw} a můžeme vylepšit {station:raw} na {level:raw}.', 'Kousek chybí: {mats:raw} pro {station:raw} {level:raw}. To dáme!'],
    cheeky: ['{mats:raw}. Jen tohle. Viděl jsem tě kolem toho projít.', '{station:raw} {level:raw} čeká na {mats:raw}. A čeká. A čeká.', 'Nákupní seznam pro {station:raw} {level:raw}: {mats:raw}. Bez výmluv.'],
  },
  'hint.ready': {
    plain: ['{station:raw} {level:raw} jde vylepšit.', 'Na {station:raw} {level:raw} máš vše.'],
    friendly: ['Máš všechno na {station:raw} {level:raw}! Hurá do dílny.', '{station:raw} {level:raw} je připravený, stačí zajít do dílny.'],
    cheeky: ['{station:raw} {level:raw} je připravený. Na co čekáš, na pozvánku?', 'Všechno máš na {station:raw} {level:raw}. Já bych už dávno byl v dílně.'],
  },
  'hint.idle': {
    plain: ['Žádné chybějící materiály.', 'Nic nechybí.'],
    friendly: ['Všechno sedí. Klidně si dej pauzu, raidere.', 'Nic nechybí. Jsem na tebe pyšný.'],
    cheeky: ['Nic nechybí. Podezřelé. Zkontroluju to ještě jednou.', 'Všechno hotovo. Konečně můžu nic nedělat.'],
  },
  'hint.fresh': {
    plain: ['Vyplň profil a inventář.', 'Bez profilu nemám co radit.'],
    friendly: ['Pověz mi něco o sobě. Vyplníme profil?', 'Jsem připravený, jen ještě nevím, s kým vyrážím.'],
    cheeky: ['Prázdný profil. Tajný agent, nebo jen lenost?', 'Neznám tvůj level. Tipnu si 99, ať máš radost.'],
  },
  'greet': {
    plain: ['Ops připraven.', 'Připraven ke snímku.'],
    friendly: ['Čau, raidere! Jsem tady.', 'Zdravím! Kdyžtak klikni a ukážu přehled.'],
    cheeky: ['Zase ty? Výborně, nudil jsem se.', 'Bedňák hlásí příchod. Potlesk není nutný.'],
  },
  'wake': {
    plain: ['Jsem vzhůru.', 'Pokračuji.'],
    friendly: ['Hm? Jo, jsem tady!', 'Promiň, zdřímnul jsem si. Co potřebuješ?'],
    cheeky: ['Nespal jsem. Jen jsem šetřil baterku.', 'Kdo mě vzbudil? Aha, ty. Dobře.'],
  },
  'poke': {
    plain: ['Pro přehled klikni jednou.', 'Stačí jedno kliknutí.'],
    friendly: ['Hihi, to lechtá! Jedno kliknutí stačí.', 'Klidně, jsem tu. Stačí jednou kliknout.'],
    cheeky: ['Ťukáš na mě jak na výtah. Rychleji to nepojede.', 'Ještě jednou a začnu účtovat.'],
  },

  /* ----- průvodce prvním spuštěním ----- */
  'tut.welcome': {
    plain: ['Jsem Ops. Ukážu ti základy aplikace. Chceš krátkou prohlídku?', 'Ops, tvůj pomocník. Projdeme základy? Zabere to minutu.'],
    friendly: ['Čau, raidere. Jsem Ops. Ty nosíš kořist, já hlídám, co ti chybí. Dáme rychlou prohlídku?', 'Ahoj! Jsem Ops, bedna s dobrým srdcem. Ukážu ti, co umím?'],
    cheeky: ['Jsem Ops. Nejchytřejší bedna v okolí. Dáme prohlídku, ať víš, s kým máš tu čest?', 'Ops hlásí službu. Prohlídka je zdarma, obdiv dobrovolný.'],
  },
  'tut.profile': {
    plain: ['Nejdřív profil: level a mince. Vyplň je ručně, nebo obnov zálohu.', 'Začneme profilem. Zadej level ručně, nebo načti zálohu.'],
    friendly: ['Nejdřív ať vím, s kým vyrážím. Napiš mi svůj level, nebo obnov zálohu.', 'Tak, a teď ty. Jaký máš level? Můžeš ho napsat, nebo načíst zálohu.'],
    cheeky: ['Kdo vlastně jsi? Level stačí, otisky prstů nechci.', 'Profil, prosím. Level, mince. Žádné lhaní, poznám to.'],
  },
  'tut.profileManual': {
    plain: ['Vyplň level a mince v profilu vlevo. Pak klikni Hotovo.', 'Údaje zapiš v profilu. Hotovo, až budeš mít.'],
    friendly: ['Otevřel jsem ti profil. Vyplň level a mince, já počkám.', 'Tady je profil. Zapiš, co víš, a dej mi vědět.'],
    cheeky: ['Profil je otevřený. Piš, já se nekoukám. Teda trochu.', 'Tak šup, level a mince. Já zatím počítám šrouby.'],
  },
  'tut.capture': {
    plain: ['Snímek: ve hře stiskni {key:raw}. Výsledek zkontroluješ a zápis potvrdíš. Bez potvrzení nic nezapíšu.', 'Zkratka {key:raw} vyfotí obrazovku. Pak kontrola a potvrzení. Nic se nezapíše samo.'],
    friendly: ['Ve hře otevři STASH a stiskni {key:raw}. Já to přečtu, ty zkontroluješ, a bez tvého souhlasu nic nepřepíšu.', 'Zkratka {key:raw} a mám tvůj inventář. Ukážu výsledek a zapíšu, až kývneš.'],
    cheeky: ['{key:raw} a cvak. Já čtu, ty kontroluješ, nic nezapíšu bez tvého podpisu. Byrokracie, já vím.', 'Stiskni {key:raw} ve STASH. Čtu rychle, zapisuju jen na povel. Jsem slušně vychovaná bedna.'],
  },
  'tut.captureNoKey': {
    plain: ['Snímek: zapni v Nastavení „Buddy a zkratka“ a nastav klávesu. Výsledek vždy zkontroluješ a potvrdíš.', 'Pro snímek nastav zkratku v Nastavení. Zápis vždy potvrzuješ ty.'],
    friendly: ['Abych mohl číst inventář, zapni mě v Nastavení a vyber zkratku. Bez tvého souhlasu nic nezapíšu.', 'Nastav mi zkratku a pak stačí ve STASH zmáčknout. Výsledek ti vždycky ukážu ke schválení.'],
    cheeky: ['Zatím nemám zkratku. Jsem bedna bez tlačítka. Nastav mi ji v Nastavení.', 'Bez zkratky jsem jen hezká dekorace. Nastavení, prosím. Zapisuju stejně jen na povel.'],
  },
  'tut.inventory': {
    plain: ['Inventář: materiály, předměty a rady k úklidu stashe.', 'V Inventáři máš zásobu a úklid.'],
    friendly: ['Tady je Inventář. Co máš, co prodat a co recyklovat.', 'Inventář! Sem padá všechno, co mi ukážeš.'],
    cheeky: ['Inventář. Tvoje sbírka šroubů a jiných pokladů.', 'Tady bydlí tvoje kořist. Některé kusy tu bydlí až moc dlouho.'],
  },
  'tut.workshop': {
    plain: ['Workshop: úrovně stanic a požadavky na další vylepšení.', 'Ve Workshopu sleduješ stanice a co jim chybí.'],
    friendly: ['Workshop, moje oblíbené místo. Tady uvidíš, co chybí na další úroveň.', 'Ve Workshopu plánujeme vylepšení. Já hlídám materiály.'],
    cheeky: ['Workshop. Místo, kde sny narazí na nedostatek kabelů.', 'Tady se vylepšuje. Teda pokud nosíš materiály, ne jen pohledy.'],
  },
  'tut.quests': {
    plain: ['Quests: úkoly obchodníků a předměty k odevzdání.', 'V Úkolech odškrtáváš splněné a vidíš, co odevzdat.'],
    friendly: ['Úkoly od obchodníků. Připni si ty důležité, ukážu je v kompaktu.', 'Tady jsou úkoly. Odškrtni hotové a já pohlídám předměty.'],
    cheeky: ['Úkoly. Lidi chtějí věci a ty jim je nosíš. Klasika.', 'Seznam přání obchodníků. Nekonečný, jako vždycky.'],
  },
  'tut.builds': {
    plain: ['Buildy: v Skill Tree je katalog buildů a porovnání s tvým stromem.', 'Skill Tree obsahuje buildy a plán bodů.'],
    friendly: ['V Skill Tree najdeš buildy. Porovnej je se svým stromem.', 'Buildy! Vyber si plán a já ukážu další bod.'],
    cheeky: ['Buildy. Konečně důvod přestat klikat body náhodně.', 'Skill Tree. Tady se rozhoduje, jestli budeš rychlý, nebo jen hlasitý.'],
  },
  'tut.compact': {
    plain: ['Kompaktní režim: malé okno s levelem, úkoly a nákupy. Ctrl+Shift+M.', 'Ctrl+Shift+M přepne do kompaktu, menšího okna vedle hry.'],
    friendly: ['Tip: Ctrl+Shift+M zmenší aplikaci do kompaktu. Úkoly a nákupy máš pořád po ruce.', 'Kompaktní režim je malé okno vedle hry. Zkus Ctrl+Shift+M.'],
    cheeky: ['Ctrl+Shift+M a aplikace se scvrkne. Já zůstanu stejně skvělý.', 'Málo místa? Kompakt přes Ctrl+Shift+M. Velikost není všechno.'],
  },
  'tut.buddy': {
    plain: ['Buddy nad hrou: v Nastavení zapni „Buddy a zkratka“, vyber velikost a zkratku. Polohu změníš tažením.', 'Mě nad hrou zapneš v Nastavení. Tam je velikost, zkratka a spouštění s hrou.'],
    friendly: ['Chceš mě mít nad hrou v rohu? Zapni mě v Nastavení, vyber velikost a zkratku. Přetáhnout mě můžeš kamkoli.', 'Nad hrou umím sedět v rohu. Nastavení, velikost, zkratka, a pak mě přesuň, kam chceš.'],
    cheeky: ['Můžu sedět v rohu nad hrou. Jako gargoyle, jen hezčí. Stačí zapnout v Nastavení.', 'Pusť mě nad hru. Slibuju, že nebudu kibicovat. Moc.'],
  },
  'tut.end': {
    plain: ['Základ je hotový. Průvodce znovu spustíš v Nastavení.', 'Hotovo. Průvodce najdeš v Nastavení.'],
    friendly: ['Máme základ. Kliknutím na mě otevřeš výbavu a plány. Budu tady, až se vrátíš.', 'Hotovo! Kdykoli budeš chtít prohlídku znovu, najdeš ji v Nastavení.'],
    cheeky: ['Prohlídka skončila. Spropitné nepřijímám, pochvaly ano.', 'A je to. Teď už víš všechno. Skoro všechno. Ten zbytek vím já.'],
  },
  'tut.resume': {
    plain: ['Průvodce byl přerušen. Pokračovat?', 'Pokračovat v průvodci od posledního kroku?'],
    friendly: ['Minule jsme nedokončili prohlídku. Pokračujeme, kde jsme skončili?', 'Jsem zpátky! Dokončíme tu prohlídku?'],
    cheeky: ['Utekl jsi mi uprostřed prohlídky. Dáme zbytek?', 'Prohlídka čeká. Já taky. Pokračujem?'],
  },
} satisfies Record<string, LineVariants>;

export type LineKey = keyof typeof cs;

const en: Record<LineKey, LineVariants> = {
  'scan.nothing': {
    plain: ['No inventory on the screenshot.', 'I cannot see an inventory on this screenshot.'],
    friendly: ['No inventory here. Shall we try the INVENTORY screen?', 'Hm, nothing. Open your inventory and snap again.'],
    cheeky: ['Lovely screenshot. It just lacks an inventory.', 'That is a view, not an inventory. A nice one, though.'],
  },
  'scan.otherScreen': {
    plain: ['This screen is not read.', 'I do not read this screen. STASH and FINDINGS are supported.'],
    friendly: ['I cannot read this screen. Try STASH or FINDINGS after a raid.', 'Better not read this one. STASH or FINDINGS and we are good.'],
    cheeky: ['I only read this one at full moon. Give me STASH or FINDINGS.', 'Nice screen. Wrong, but nice.'],
  },
  'scan.check': {
    plain: [
      { one: '{count} row to check · pages {pages}.', other: '{count} rows to check · pages {pages}.' },
      { one: 'Check {count} row, then confirm the write.', other: 'Check {count} rows, then confirm the write.' },
    ],
    friendly: [
      { one: 'Almost done. Have a look at {count} row so I get it right.', other: 'Almost done. Have a look at {count} rows so I get them right.' },
      { one: 'Read it. Not sure about {count} row, check it with me?', other: 'Read it. Not sure about {count} rows, check them with me?' },
    ],
    cheeky: [
      { one: '{count} row is blurry. Not my fault, your hand shook.', other: '{count} rows are blurry. Not my fault.' },
      { one: 'Read almost everything. {count} row is all yours, boss.', other: 'Read almost everything. {count} rows are all yours, boss.' },
    ],
  },
  'scan.read': {
    plain: [
      { one: '{count} row read · pages {pages}.', other: '{count} rows read · pages {pages}.' },
      { one: 'Done: {count} row. Waiting for confirmation.', other: 'Done: {count} rows. Waiting for confirmation.' },
    ],
    friendly: [
      { one: 'Got it! {count} row, just confirm.', other: 'Got it! {count} rows, just confirm.' },
      { one: 'Clean read, {count} row. Shall we write it?', other: 'Clean read, {count} rows. Shall we write them?' },
    ],
    cheeky: [
      { one: '{count} row without a single mistake. Feel free to applaud.', other: '{count} rows without a single mistake. Feel free to applaud.' },
      { one: 'Read: {count} row. Faster than you again.', other: 'Read: {count} rows. Faster than you again.' },
    ],
  },
  'scan.failed': {
    plain: ['The screenshot failed.', 'Capture failed. Try again.'],
    friendly: ['Oops, the screenshot failed. Try again?', 'Something creaked, no screenshot. One more time?'],
    cheeky: ['The screenshot ran away. Faster than a raider with a full backpack.', 'Click and nothing. Please forget you saw that.'],
  },
  'scan.written': {
    plain: ['Written: {count}.', 'Items saved: {count}.'],
    friendly: ['Written, {count} items are in the crate.', 'Done, I saved {count} items. Good job!'],
    cheeky: ['{count} items in the crate. Did not even break a sweat.', 'Written: {count}. I know, I am amazing.'],
  },
  'loot.found': {
    plain: [
      { one: 'Raid loot: {count} row to check.', other: 'Raid loot: {count} rows to check.' },
      { one: 'Loot read, {count} row. Check and confirm.', other: 'Loot read, {count} rows. Check and confirm.' },
    ],
    friendly: [
      { one: 'Show me what you carry! {count} row waits for your nod.', other: 'Show me what you carry! {count} rows wait for your nod.' },
      { one: 'Nice haul, {count} row. Go through it together?', other: 'Nice haul, {count} rows. Go through them together?' },
    ],
    cheeky: [
      { one: '{count} row of loot. Hope it is not another screw.', other: '{count} rows of loot. Hope they are not screws again.' },
      { one: 'Loot! {count} row. Confirm before I change my mind.', other: 'Loot! {count} rows. Confirm before I change my mind.' },
    ],
  },
  'loot.empty': {
    plain: ['The backpack is empty after the raid.', 'Nothing in the backpack after the raid.'],
    friendly: ['Empty backpack. At least you made it back in one piece.', 'No loot this time. Next one will be better!'],
    cheeky: ['Empty backpack. Hiking is a sport too.', 'Nothing? Not a single screw? Respect for tidiness.'],
  },
  'loot.dup': {
    plain: ['This screenshot is already written.', 'This loot is already in the journal.'],
    friendly: ['We already have this one, I will not count it twice.', 'I know this screenshot, it is already in the journal.'],
    cheeky: ['Same screenshot twice? The loot does not double that way.', 'Déjà vu. I already wrote this.'],
  },
  'loot.written': {
    plain: [
      { one: 'Loot written: {count} item.', other: 'Loot written: {count} items.' },
      { one: 'Loot saved, {count} item.', other: 'Loot saved, {count} items.' },
    ],
    friendly: [
      { one: 'Loot is in the journal, {count} item. Nice raid!', other: 'Loot is in the journal, {count} items. Nice raid!' },
      { one: 'Written, {count} item. Off to the crate with it.', other: 'Written, {count} items. Off to the crate with them.' },
    ],
    cheeky: [
      { one: '{count} item written. The ARC kept the rest, I guess.', other: '{count} items written. The ARC kept the rest, I guess.' },
      { one: 'Written: {count} item. I carry it myself, no thanks needed.', other: 'Written: {count} items. I carry them myself, no thanks needed.' },
    ],
  },
  'level.part': {
    plain: ['Level {level:raw}: {name:raw}.', 'Level {level:raw}, new part: {name:raw}.'],
    friendly: ['Level {level:raw}! New part: {name:raw}.', 'Woohoo, level {level:raw}. {name:raw} suits me.'],
    cheeky: ['Level {level:raw}. {name:raw}, finally something for my good looks.', 'Level {level:raw}! {name:raw}. Now I look important.'],
  },
  'level.parts': {
    plain: [
      { one: 'Level {level:raw}: {count} new part.', other: 'Level {level:raw}: {count} new parts.' },
      { one: 'Level {level:raw}, {count} part unlocked.', other: 'Level {level:raw}, {count} parts unlocked.' },
    ],
    friendly: [
      { one: 'Level {level:raw}! {count} new part for my wardrobe.', other: 'Level {level:raw}! {count} new parts for my wardrobe.' },
      { one: 'Up to level {level:raw}, {count} extra part. Lovely.', other: 'Up to level {level:raw}, {count} extra parts. Lovely.' },
    ],
    cheeky: [
      { one: 'Level {level:raw} and {count} part. Christmas in the workshop.', other: 'Level {level:raw} and {count} parts. Christmas in the workshop.' },
      { one: 'Level {level:raw}? {count} part? Who has been grinding here?', other: 'Level {level:raw}? {count} parts? Who has been grinding here?' },
    ],
  },
  'level.form': {
    plain: ['Level {level:raw}: new form {name:raw}.', 'Level {level:raw}, form {name:raw}.'],
    friendly: ['Level {level:raw}! I am a {name:raw} now. How do I look?', 'Look, level {level:raw}. New form: {name:raw}!'],
    cheeky: ['Level {level:raw}. {name:raw}. No autographs, please.', 'Transformation complete: {name:raw}. Mirror, please.'],
  },
  'hint.missing': {
    plain: ['You need {mats:raw} for {station:raw} {level:raw}.', '{station:raw} {level:raw} is missing: {mats:raw}.', 'For {station:raw} {level:raw} you still need {mats:raw}.'],
    friendly: ['Just {mats:raw} more and {station:raw} {level:raw} is yours, raider.', 'Only {mats:raw} and we can upgrade {station:raw} to {level:raw}.', 'A little missing: {mats:raw} for {station:raw} {level:raw}. We can do it!'],
    cheeky: ['{mats:raw}. That is all. I saw you walk right past it.', '{station:raw} {level:raw} is waiting for {mats:raw}. And waiting. And waiting.', 'Shopping list for {station:raw} {level:raw}: {mats:raw}. No excuses.'],
  },
  'hint.ready': {
    plain: ['{station:raw} {level:raw} can be upgraded.', 'You have everything for {station:raw} {level:raw}.'],
    friendly: ['You have everything for {station:raw} {level:raw}! Off to the workshop.', '{station:raw} {level:raw} is ready, just visit the workshop.'],
    cheeky: ['{station:raw} {level:raw} is ready. Waiting for an invitation?', 'You have it all for {station:raw} {level:raw}. I would be in the workshop already.'],
  },
  'hint.idle': {
    plain: ['No missing materials.', 'Nothing is missing.'],
    friendly: ['All good. Take a break, raider.', 'Nothing missing. I am proud of you.'],
    cheeky: ['Nothing missing. Suspicious. I will check again.', 'All done. Finally I can do nothing.'],
  },
  'hint.fresh': {
    plain: ['Fill in your profile and inventory.', 'Without a profile I have no advice.'],
    friendly: ['Tell me about yourself. Shall we fill in the profile?', 'I am ready, I just do not know who I am heading out with.'],
    cheeky: ['Empty profile. Secret agent, or just lazy?', 'I do not know your level. I will guess 99 to make you happy.'],
  },
  'greet': {
    plain: ['Ops ready.', 'Ready to capture.'],
    friendly: ['Hi, raider! I am here.', 'Hello! Click me and I will show the overview.'],
    cheeky: ['You again? Great, I was bored.', 'The crate has arrived. Applause optional.'],
  },
  'wake': {
    plain: ['I am awake.', 'Resuming.'],
    friendly: ['Hm? Yes, I am here!', 'Sorry, I dozed off. What do you need?'],
    cheeky: ['I was not asleep. Just saving battery.', 'Who woke me? Oh, you. Fine.'],
  },
  'poke': {
    plain: ['Click once for the overview.', 'One click is enough.'],
    friendly: ['Hehe, that tickles! One click is enough.', 'Sure, I am here. Just click once.'],
    cheeky: ['You tap me like a lift button. It will not go faster.', 'One more and I start charging.'],
  },
  'tut.welcome': {
    plain: ['I am Ops. I will show you the basics of the app. A short tour?', 'Ops, your assistant. Shall we go through the basics? It takes a minute.'],
    friendly: ['Hi, raider. I am Ops. You carry the loot, I keep track of what you are missing. Quick tour?', 'Hello! I am Ops, a crate with a good heart. Shall I show you what I can do?'],
    cheeky: ['I am Ops. The smartest crate around. A tour, so you know who you are dealing with?', 'Ops reporting for duty. The tour is free, admiration voluntary.'],
  },
  'tut.profile': {
    plain: ['Profile first: level and coins. Fill them in manually or restore a backup.', 'We start with the profile. Enter your level manually or load a backup.'],
    friendly: ['First let me know who I am heading out with. Tell me your level, or restore a backup.', 'Now you. What is your level? Type it in, or load a backup.'],
    cheeky: ['Who are you, actually? The level will do, I do not need fingerprints.', 'Profile, please. Level, coins. No lying, I can tell.'],
  },
  'tut.profileManual': {
    plain: ['Fill in level and coins in the profile on the left. Then click Done.', 'Enter the values in the profile. Click Done when ready.'],
    friendly: ['I opened your profile. Fill in level and coins, I will wait.', 'Here is the profile. Enter what you know and let me know.'],
    cheeky: ['The profile is open. Type, I am not looking. Well, a little.', 'Come on, level and coins. I will count screws meanwhile.'],
  },
  'tut.capture': {
    plain: ['Capture: press {key:raw} in the game. You review the result and confirm the write. Nothing is written without confirmation.', 'The {key:raw} shortcut takes a screenshot. Then review and confirm. Nothing is written by itself.'],
    friendly: ['Open STASH in the game and press {key:raw}. I read it, you check it, and nothing is overwritten without your OK.', '{key:raw} and I have your inventory. I show the result and write it when you nod.'],
    cheeky: ['{key:raw} and click. I read, you check, I write nothing without your signature. Bureaucracy, I know.', 'Press {key:raw} in STASH. I read fast and write only on command. I am a well-mannered crate.'],
  },
  'tut.captureNoKey': {
    plain: ['Capture: enable "Buddy and shortcut" in Settings and set a key. You always review and confirm the result.', 'Set a shortcut in Settings to capture. You always confirm the write.'],
    friendly: ['To read your inventory, enable me in Settings and pick a shortcut. Nothing is written without your OK.', 'Set my shortcut, then just press it in STASH. I always show the result for approval.'],
    cheeky: ['No shortcut yet. I am a crate without a button. Set one in Settings.', 'Without a shortcut I am just nice decoration. Settings, please. I still write only on command.'],
  },
  'tut.inventory': {
    plain: ['Inventory: materials, items and stash cleanup advice.', 'Inventory holds your stock and the cleanup.'],
    friendly: ['This is the Inventory. What you have, what to sell and what to recycle.', 'Inventory! Everything you show me lands here.'],
    cheeky: ['Inventory. Your collection of screws and other treasures.', 'Your loot lives here. Some of it has lived here far too long.'],
  },
  'tut.workshop': {
    plain: ['Workshop: station levels and requirements for the next upgrade.', 'The Workshop tracks stations and what they need.'],
    friendly: ['The Workshop, my favourite place. See what is missing for the next level.', 'In the Workshop we plan upgrades. I watch the materials.'],
    cheeky: ['The Workshop. Where dreams meet a shortage of cables.', 'Upgrades happen here. If you bring materials, not just looks.'],
  },
  'tut.quests': {
    plain: ['Quests: trader quests and items to deliver.', 'In Quests you tick off finished ones and see what to deliver.'],
    friendly: ['Trader quests. Pin the important ones, I show them in compact mode.', 'Here are the quests. Tick off finished ones and I will watch the items.'],
    cheeky: ['Quests. People want things and you bring them. Classic.', 'The traders wish list. Endless, as always.'],
  },
  'tut.builds': {
    plain: ['Builds: Skill Tree has a build catalog and a comparison with your tree.', 'Skill Tree holds builds and the point plan.'],
    friendly: ['In Skill Tree you will find builds. Compare them with your tree.', 'Builds! Pick a plan and I will show the next point.'],
    cheeky: ['Builds. Finally a reason to stop clicking points at random.', 'Skill Tree. Where you decide whether to be fast or just loud.'],
  },
  'tut.compact': {
    plain: ['Compact mode: a small window with level, quests and shopping. Ctrl+Shift+M.', 'Ctrl+Shift+M switches to compact, a smaller window next to the game.'],
    friendly: ['Tip: Ctrl+Shift+M shrinks the app into compact mode. Quests and shopping stay at hand.', 'Compact mode is a small window next to the game. Try Ctrl+Shift+M.'],
    cheeky: ['Ctrl+Shift+M and the app shrinks. I stay just as great.', 'Short on space? Compact via Ctrl+Shift+M. Size is not everything.'],
  },
  'tut.buddy': {
    plain: ['Buddy over the game: enable "Buddy and shortcut" in Settings, choose size and shortcut. Drag to move.', 'Enable me over the game in Settings. Size, shortcut and opening with the game are there.'],
    friendly: ['Want me in a corner over the game? Enable me in Settings, pick size and shortcut. Drag me anywhere.', 'I can sit in a corner over the game. Settings, size, shortcut, then move me where you like.'],
    cheeky: ['I can sit in a corner over the game. Like a gargoyle, only cuter. Just enable me in Settings.', 'Let me over the game. I promise not to backseat. Much.'],
  },
  'tut.end': {
    plain: ['The basics are done. Restart the guide in Settings.', 'Done. The guide is in Settings.'],
    friendly: ['We have the basics. Click me to open gear and plans. I will be here when you are back.', 'Done! Whenever you want the tour again, it is in Settings.'],
    cheeky: ['Tour over. I do not accept tips, compliments yes.', 'There. Now you know everything. Almost everything. I know the rest.'],
  },
  'tut.resume': {
    plain: ['The guide was interrupted. Continue?', 'Continue the guide from the last step?'],
    friendly: ['We did not finish the tour last time. Continue where we left off?', 'I am back! Shall we finish the tour?'],
    cheeky: ['You ran off in the middle of the tour. The rest?', 'The tour is waiting. So am I. Continue?'],
  },
};

export const OPS_LINES: Record<Lang, Record<LineKey, LineVariants>> = { cs, en };
export const LINE_KEYS = Object.keys(cs) as LineKey[];
