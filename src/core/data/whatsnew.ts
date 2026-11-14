/* „Co je nového“ (0.19.0): krátké body vydání 0.10.0–0.25.0 v obou jazycích. Není to výpis CHANGELOG.md (ten se
   za běhu nečte), jen pár vět na verzi pro hráče. Nejnovější verze je první; její číslo je verze aplikace
   (test hlídá shodu s package.json, tauri.conf.json a Cargo.toml).
   link = kam bod vede (jen moduly aplikace, nic mimo ni): přehled cílů je WhatsNewLink v core/whatsnew.ts. */
import type { WhatsNewLink } from '../whatsnew';

export interface WhatsNewText { cs: string; en: string }
export interface WhatsNewItem { text: WhatsNewText; link?: WhatsNewLink }
export interface WhatsNewRelease { version: string; title: WhatsNewText; items: WhatsNewItem[] }

export const RELEASES: readonly WhatsNewRelease[] = [
  {
    version: '0.25.0',
    title: { cs: 'Zbraně s doplňky, výbava ze zkratky, rychlejší okna', en: 'Weapons with attachments, gear from the hotkey, lighter windows' },
    items: [
      { text: { cs: 'Zbraň s tlumičem, jinou pažbou nebo větším zásobníkem se teď pozná podle zásobníku z řádku munice. Když nesedí jediné zbrani, zůstane neznámá.', en: 'A weapon with a silencer, another stock or a bigger magazine is now recognised by the magazine on its ammo line. If that is not unique, it stays unknown.' }, link: 'loadouts' },
      { text: { cs: 'Snímek FINDINGS ze zkratky čte i zbraně, augment a štít. Po zápisu lootu je potvrdíš ve frontě Ke kontrole, jisté jsou předem zaškrtnuté.', en: 'A FINDINGS hotkey capture now also reads weapons, augment and shield. After the loot is saved, confirm them in the review queue.' }, link: 'raid' },
      { text: { cs: 'Okna načítají jen slovník zvoleného jazyka a čtení snímků až při prvním snímku, takže se spouštějí s menším objemem kódu.', en: 'Windows load only the dictionary of your language, and screenshot reading only with the first capture, so they start with less code.' } },
    ],
  },
  {
    version: '0.24.0',
    title: { cs: 'Zbraně a augment ze snímku, potvrzení hodnot', en: 'Weapons and augment from screenshots, confirming values' },
    items: [
      { text: { cs: 'Snímek loadoutu nebo FINDINGS pozná zbraň, její tier a augment, u každého s jistotou. Co si není jisté, zůstane neznámé a jde ke kontrole, nic se nehádá.', en: 'Loadout and FINDINGS screenshots now recognise weapons, their tier and the augment, with a confidence. Anything unsure goes to review; nothing is guessed.' }, link: 'loadouts' },
      { text: { cs: 'Rozpoznaná výbava jde do předvyplnění loadoutu, do automatického záznamu raidu i do vyhodnocení po raidu.', en: 'Recognised gear feeds the loadout prefill, the automatic raid entry and the post-raid evaluation.' }, link: 'raid' },
      { text: { cs: 'Nepotvrzenou hodnotu potvrdíš tlačítkem vedle tečky původu, celou oblast v Nastavení → Původ dat. Tečky jsou nově i u materiálů v dílně a v nákupním seznamu.', en: 'Confirm a value next to its origin dot, or a whole area in Settings → Data origin. Dots now also show on workshop and shopping list materials.' } },
    ],
  },
  {
    version: '0.23.0',
    title: { cs: 'Loadout builder a zátěž aplikace', en: 'Loadout builder and app load' },
    items: [
      { text: { cs: 'Loadout podle míst ve hře s hodnotou, váhou proti mezi, dostupností ve skrýši a částkou, kterou riskuješ při vyřazení.', en: 'Build loadouts by in-game slots with value, weight against the limit, stash availability and what you risk if knocked out.' }, link: 'loadouts' },
      { text: { cs: 'Porovnání dvou loadoutů, chybějící předměty do nákupního seznamu a předvyplnění ze snímku. Počítá s nimi i Příprava na raid.', en: 'Compare two loadouts, send missing items to the shopping list and prefill from a screenshot. Raid prep uses them too.' }, link: 'raid' },
      { text: { cs: 'Nastavení → Zátěž aplikace: CPU a paměť aplikace a režim nízké zátěže. Nově i zkratka konzole a vysoký kontrast widgetů.', en: 'Settings → App load: the app’s CPU and memory and a low-impact mode. Also new: a console shortcut and high-contrast widgets.' }, link: 'appLoad' },
    ],
  },
  {
    version: '0.22.1',
    title: { cs: 'Buddy už hře nebere fokus', en: 'The buddy no longer steals focus from the game' },
    items: [
      { text: { cs: 'Oprava: náhodný klik na Opse v rohu obrazovky už hru nepřepne ani neotevře overlay. Když je hra v popředí, buddy propouští kliky do hry.', en: 'Fix: a stray click on Ops in the screen corner no longer takes you out of the game. While the game is in front, the buddy lets clicks through.' }, link: 'opsSettings' },
      { text: { cs: 'Během hry ovládáš Opse zkratkou (snímek, Úpravy widgetů). Mimo hru jde na buddyho kliknout jako dřív; volba je v Nastavení → Buddy a zkratka.', en: 'During play you control Ops with the hotkey (capture, widget Edit). Outside the game you can click the buddy as before; see Settings → Buddy and hotkey.' } },
      { text: { cs: 'Úpravy widgetů se samy ukončí, když se vrátíš do hry, a automatické snímání pozná inventář v raidu (jen pro spárování loadoutu s výsledkem, nic nesnímá).', en: 'Widget Edit ends when you return to the game, and automatic capture recognises the in-raid inventory (only to pair loadout and result, no capture).' } },
    ],
  },
  {
    version: '0.22.0',
    title: { cs: 'Widgety nad hrou', en: 'Widgets over the game' },
    items: [
      { text: { cs: 'Volitelné karty s tvými daty přímo nad hrou: seznam k nalezení, úkoly, nákupy, Co dál?, skrýš, výzvy a další. Ve Hře jen ukazují a propouštějí myš.', en: 'Optional cards with your own data over the game: to find, quests, shopping, What next?, stash, challenges and more. In Play they only display.' }, link: 'opsSettings' },
      { text: { cs: 'Klikni na Opse nebo použij zkratku: v Úpravách widgety přesuneš, zvětšíš, nastavíš jim krytí a uložíš rozložení Lobby, Raid i vlastní.', en: 'Click Ops or use the shortcut to open Edit: move and resize widgets, set their opacity and save Lobby, Raid or your own layouts.' } },
      { text: { cs: 'Plné moduly dál otevře tlačítko Aplikace v Úpravách. Rozložení patří jen tomuto počítači a nejsou v zálohách.', en: 'The App button in Edit still opens every full module. Layouts belong to this PC only and are not in backups.' }, link: 'overlayApp' },
    ],
  },
  {
    version: '0.21.0',
    title: { cs: 'Původ dat u každé hodnoty', en: 'The origin of every value' },
    items: [
      { text: { cs: 'Tečka u počtu, levelu, stanice, skillu či cíle úkolu ukáže původ hodnoty: ručně, ze snímku nebo ze zálohy, kdy, s jakou jistotou a zda je potvrzená.', en: 'A dot next to a count, level, station, skill or objective shows where the value came from (manual, screenshot or backup), when, how sure, and if confirmed.' }, link: 'profile' },
      { text: { cs: 'Přehled původu dat a poslední zápisy najdeš v Nastavení; karta předmětu má řádek „Původ“.', en: 'Settings show an overview of data origin and recent writes; the item card has an “Origin” line.' }, link: 'itemCard' },
      { text: { cs: 'Rádce „Co dál?“ připomene snímek STASH, když se zásoba přes týden nezměnila a máš otevřené cíle.', en: 'The “What next?” advisor suggests a STASH screenshot when your stock has not changed for over a week and you have open goals.' }, link: 'advisor' },
    ],
  },
  {
    version: '0.20.1',
    title: { cs: 'Ops tiše mrkne při automatickém snímku', en: 'Ops blinks quietly on automatic capture' },
    items: [
      { text: { cs: 'Při automatickém snímku Ops jen mrkne LED v hledí: sken, pak úsměv (zapsáno) nebo otazník (ke kontrole).', en: 'On an automatic capture Ops only blinks its visor LEDs: a scan, then a smile (recorded) or a question mark (to review).' } },
      { text: { cs: 'Bez zvuku, bubliny a změny fokusu. Spícího Opse nebudí a při pozastaveném snímání nedělá nic.', en: 'No sound, no bubble and no focus change. A sleeping Ops stays asleep, and nothing plays while capture is paused.' }, link: 'opsSettings' },
    ],
  },
  {
    version: '0.20.0',
    title: { cs: 'Automatické snímání mimo raid', en: 'Automatic capture outside raids' },
    items: [
      { text: { cs: 'Volitelné (výchozí vypnuto, čeká na ověření u Embarku): Ops pozná loadout a výsledek raidu a připraví zápis do Deníku.', en: 'Optional (off by default, pending Embark review): Ops recognises the loadout and raid result and drafts a Raid Journal entry.' }, link: 'opsSettings' },
      { text: { cs: 'Jisté údaje se zapíší hned a jdou vrátit tlačítkem Zpět, nejisté čekají ve frontě „Ke kontrole“.', en: 'Certain fields are written right away and can be undone; uncertain ones wait in the “To review” queue.' } },
      { text: { cs: 'Vypínač „Vypnout všechna napojení na hru“ vypne buddyho nad hrou, zkratku i snímání najednou.', en: 'The “Turn off all game connections” switch turns off the buddy over the game, the hotkey and capture at once.' }, link: 'opsSettings' },
    ],
  },
  {
    version: '0.19.0',
    title: { cs: 'Doladění a rychlejší start', en: 'Polish and a faster start' },
    items: [
      { text: { cs: 'Tahle karta: po aktualizaci ukáže, co přibylo. Znovu ji otevřeš v Nastavení → O aplikaci.', en: 'This card: after an update it shows what is new. Reopen it in Settings → About.' } },
      { text: { cs: 'Průvodce prvním spuštěním představí i přípravu na raid, mapu, „Co dál?“ a hledání.', en: 'The first-run guide now also introduces raid prep, the map, “What next?” and search.' } },
      { text: { cs: 'Moduly se načítají až při otevření, takže aplikace startuje rychleji.', en: 'Modules load when you open them, so the app starts faster.' } },
    ],
  },
  {
    version: '0.18.0',
    title: { cs: 'Hledání všude a karta předmětu', en: 'Search everywhere and the item card' },
    items: [
      { text: { cs: 'Ctrl+K hledá předměty, úkoly, stanice, skilly, buildy i sekce Nastavení.', en: 'Ctrl+K searches items, quests, stations, skills, builds and Settings sections.' }, link: 'search' },
      { text: { cs: 'Karta předmětu „Proč to potřebuju?“: kde je potřeba, kolik máš a jestli nechat, recyklovat nebo prodat.', en: 'The item card “Why do I need this?”: where it is needed, how many you have and whether to keep, recycle or sell.' }, link: 'itemCard' },
    ],
  },
  {
    version: '0.17.0',
    title: { cs: 'Ops radí „Co dál?“', en: 'Ops advises “What next?”' },
    items: [
      { text: { cs: 'Karta „Co dál?“ na Dashboardu seřadí další kroky i s důvodem. Tip jde skrýt nebo odložit.', en: 'The “What next?” card on the Dashboard ranks your next steps with a reason. Tips can be hidden or snoozed.' }, link: 'advisor' },
      { text: { cs: 'Nejdůležitější tip je i v kompaktním okně a v overlayi.', en: 'The top tip also shows in the compact window and the overlay.' } },
    ],
  },
  {
    version: '0.16.1',
    title: { cs: 'Bezpečnost', en: 'Security' },
    items: [
      { text: { cs: 'Každé okno smí jen to, co potřebuje; zprávy mezi okny ověřuje aplikace.', en: 'Each window may only do what it needs; messages between windows are checked by the app.' } },
    ],
  },
  {
    version: '0.16.0',
    title: { cs: 'Celá aplikace z overlaye', en: 'The whole app from the overlay' },
    items: [
      { text: { cs: 'Tlačítko Aplikace v overlayi otevře kterýkoli modul přímo nad hrou ve velkém panelu.', en: 'The App button in the overlay opens any module right over the game in a large panel.' }, link: 'overlayApp' },
    ],
  },
  {
    version: '0.15.0',
    title: { cs: 'Vyhodnocení po raidu', en: 'Post-raid evaluation' },
    items: [
      { text: { cs: 'Příprava na raid porovná nalezené s plánem a hned navrhne další raid.', en: 'Raid prep compares what you found with the plan and suggests the next raid right away.' }, link: 'raid' },
      { text: { cs: 'Statistiky ukážou, které mapy ti s cíli pomáhají nejvíc.', en: 'Statistics show which maps help most with your goals.' } },
    ],
  },
  {
    version: '0.14.0',
    title: { cs: 'Příprava na raid a vlastní mapa', en: 'Raid prep and your own map' },
    items: [
      { text: { cs: 'Příprava na raid: co hledat, kam jít a co si vzít. Seznam je i v záložce Raid v overlayi.', en: 'Raid prep: what to look for, where to go and what to bring. The list is also in the overlay Raid tab.' }, link: 'raid' },
      { text: { cs: 'Interaktivní mapa z tvého vlastního snímku herní mapy, s body a mřížkou.', en: 'An interactive map from your own screenshot of the in-game map, with points and a grid.' }, link: 'maps' },
    ],
  },
  {
    version: '0.13.1',
    title: { cs: 'Buddy a předměty úkolů', en: 'Buddy and quest items' },
    items: [
      { text: { cs: 'Ops nad hrou je vidět jen tehdy, když je hra v popředí.', en: 'Ops over the game shows only while the game is in the foreground.' } },
    ],
  },
  {
    version: '0.13.0',
    title: { cs: 'Rozehrané minihry', en: 'Resume minigames' },
    items: [
      { text: { cs: 'Minihry si pamatují rozehrané kolo; po restartu pokračuješ, kde jsi skončil.', en: 'Minigames remember a round in progress; after a restart you continue where you left off.' }, link: 'games' },
    ],
  },
  {
    version: '0.12.0',
    title: { cs: 'Opsův hack', en: 'Ops’s Hack' },
    items: [
      { text: { cs: 'Nová minihra: otáčej spoje obvodu, dokud proud nedojde ke všem výstupům.', en: 'A new minigame: rotate circuit pieces until the power reaches every output.' }, link: 'games' },
    ],
  },
  {
    version: '0.11.0',
    title: { cs: 'Minihry a nátěry', en: 'Minigames and paints' },
    items: [
      { text: { cs: 'Stash Tetris a kvíz o recyklaci mimo raid; za výsledky nátěry pro Opse.', en: 'Stash Tetris and a recycling quiz for outside raids; results unlock paints for Ops.' }, link: 'games' },
    ],
  },
  {
    version: '0.10.2',
    title: { cs: 'Cíle úkolů', en: 'Quest objectives' },
    items: [
      { text: { cs: 'U úkolů odškrtáváš jednotlivé cíle a vidíš postup n/m.', en: 'Tick off individual quest objectives and see n/m progress.' }, link: 'quests' },
    ],
  },
  {
    version: '0.10.1',
    title: { cs: 'Profil ze snímku', en: 'Profile from a screenshot' },
    items: [
      { text: { cs: 'Profil, dílna, úkoly a skilly jdou načíst ze snímku obrazovky; vždy to potvrzuješ ty.', en: 'Profile, workshop, quests and skills can be read from a screenshot; you always confirm.' }, link: 'profile' },
    ],
  },
  {
    version: '0.10.0',
    title: { cs: 'Bedňák 2.0 a průvodce', en: 'Bedňák 2.0 and the guide' },
    items: [
      { text: { cs: 'Nový Ops se třemi povahami a zvuky; průvodce prvním spuštěním.', en: 'A new Ops with three personalities and sounds; a first-run guide.' }, link: 'opsSettings' },
    ],
  },
];
