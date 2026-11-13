/* „Co je nového“ (0.19.0): krátké body vydání 0.10.0–0.19.0 v obou jazycích. Není to výpis CHANGELOG.md (ten se
   za běhu nečte), jen pár vět na verzi pro hráče. Nejnovější verze je první; její číslo je verze aplikace
   (test hlídá shodu s package.json, tauri.conf.json a Cargo.toml).
   link = kam bod vede (jen moduly aplikace, nic mimo ni): přehled cílů je WhatsNewLink v core/whatsnew.ts. */
import type { WhatsNewLink } from '../whatsnew';

export interface WhatsNewText { cs: string; en: string }
export interface WhatsNewItem { text: WhatsNewText; link?: WhatsNewLink }
export interface WhatsNewRelease { version: string; title: WhatsNewText; items: WhatsNewItem[] }

export const RELEASES: readonly WhatsNewRelease[] = [
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
