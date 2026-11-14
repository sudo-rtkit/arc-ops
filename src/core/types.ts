/* Typy herních dat a uživatelského stavu. Jádro nezná React ani úložiště. */
import type { Lang } from '../i18n';
import type { WhatsNewState } from './whatsnew';
import type { AutoCaptureState, AutoWrite, GameLinkState, ReviewItem } from './autoCapture';
import type { RaidAuto, RaidLife } from './raidLife';
import type { ProvenanceState } from './provenance';
export type { Lang };

export type BranchId = 'c' | 'm' | 's';
export type Points = Record<string, number>;

/* ----- herní data ----- */
export interface Branch { id: BranchId; key: string; name: string; color: string }
export interface Skill { id: string; b: BranchId; t: number; max: number; name: string; d: string }
export interface SkillStep { id: string; to: number }
export interface ReachStep { reach: BranchId; n: number; prefer: string[]; incl?: boolean }
export type PlanStep = SkillStep | ReachStep;
export interface PlanDef { name: string; totals: string; steps: PlanStep[] }
export interface BuildDef { name: string; c: number; m: number; s: number; keys: string; who: string; plan?: string }

/* Katalog buildů (milník 6): přesné ranky po skillech, popis v obou jazycích, zdroj. */
export type BuildTag = 'pvp' | 'pve' | 'solo' | 'squad' | 'loot' | 'stealth' | 'expedition' | 'broken';
export interface BuildText {
  summary: string; playstyle: string; strengths: string[]; weaknesses: string[]; synergies: string[];
  loadout: string; leveling: string; notes?: string;
}
export interface BuildSourceRef { label: string; url?: string }
/* kind: web = komunitní weby (odkaz jen na kliknutí), diary = původní deník, own = vlastní návrh ARC OPS (teorie). */
export interface BuildSource { kind: 'web' | 'diary' | 'own'; refs: BuildSourceRef[]; date: string }
export interface CatalogBuild {
  id: string;
  name: { cs: string; en: string };
  tags: BuildTag[];
  difficulty: 1 | 2 | 3;
  /* Přesné ranky. Součet 76, nebo 91 u buildu jen pro Expedice (only91). */
  points: Points;
  /* Volitelná varianta s 15 body z Expedic (91 bodů). */
  variant91?: Points;
  only91?: boolean;
  /* Doporučené pořadí; když chybí, odvodí se stepsFromBuild. */
  order?: PlanStep[];
  /* Vestavěný plán se stejným cílem (PLANS), který se má použít místo odvozeného. */
  plan?: string;
  /* 3 klíčové skilly (id). */
  keys: string[];
  theory?: boolean;
  desc: { cs: BuildText; en: BuildText };
  source: BuildSource;
  gameVersion: string;
}

export type Recipe = [string, number][];
export interface StationReq { outpost?: number; level?: number }
export interface Station {
  id: string; name: string; min: number; max: number; role: string;
  levels: Record<number, Recipe>;
  req?: Record<number, StationReq>;
  notes?: Record<number, string>;
}

export interface GameMap { id: string; name: string; rounds: number; diff: number; best: string; places: string; live: string }
export interface Route { id: string; name: string; map: string; risk: string; loadout: string; yield: string; phase: string; steps: string[]; origin?: Origin }
export interface ArcDiaryEntry { name: string; tac: string; drops: string[] }

/* Původ záznamu: z původního deníku, z rešerše veřejných zdrojů (neověřeno), nebo zadaný uživatelem. */
export type Origin = 'denik' | 'reserse' | 'vlastni';

export interface ArcUnit {
  id: string; name: string; origin: Origin; since: string;
  type: string; category: string; difficulty: number; danger: string;
  traits: string; weakness: string; weaknessVerified: boolean;
  tactic: string; gear: string; drops: string[];
  sources: string[];
}
export interface Weapon {
  id: string; name: string; origin: Origin;
  tier: string; antiArc: boolean;
  category: string; ammo: string; info: string;
  sources: string[];
}
export interface Material { name: string; category: string; source: string; custom: boolean }

/* ----- předměty mimo materiály (milník 3b: záložka Vybavení, loot z batohu) ----- */
export type ItemCategory = 'weapon' | 'shield' | 'augment' | 'ammo' | 'quickUse' | 'key' | 'other';
export const ITEM_CATEGORIES: ItemCategory[] = ['weapon', 'shield', 'augment', 'ammo', 'quickUse', 'key', 'other'];
export type ItemTier = 'I' | 'II' | 'III' | 'IV';
export const ITEM_TIERS: ItemTier[] = ['I', 'II', 'III', 'IV'];
/* Klíč předmětu je název + tier (zbraně různých tierů jsou různé položky). */
export interface ItemStock { key: string; name: string; category: ItemCategory; tier?: ItemTier; count: number }
export const itemKey = (name: string, tier?: ItemTier): string => (tier ? `${name} ${tier}` : name);

/* ----- rozpoznávání ze snímků (milník 3a) ----- */
export type { LearnedFp } from './vision/match';
/* Nejvýš tolik naučených otisků; při překročení se odmažou nejstarší. */
export const LEARNED_MAX = 2000;
export interface VisionState {
  learned: import('./vision/match').LearnedFp[];
  /* poslední změřená velikost políčka a měřítko UI */
  profile: { cellPx: number; ui: number } | null;
  lastImportAt: number;
  /* 0.17.0 (schéma 15): obsazenost bedny z hlavičky posledního snímku STASH (used/max), null = neznámá */
  stash: StashSlots | null;
}
export interface StashSlots { used: number; max: number; at: number }

/* ----- uživatelský stav (schéma 3; 2 → 3 doplnilo items a vision) ----- */
export interface Profile {
  level: number; coins: number; xp: number; xpNext: number;
  rounds: number; expBonus: number; rewardPass: number; amplified: number;
}
export interface ProfileLogEntry { day: string; level: number; coins: number; xp: number; rounds: number; rewardPass: number }

export interface SavedBuild { id: string; name: string; note: string; points: Points }
export interface SkillsState { current: Points; showPlan: boolean; activePlan: string; builds: SavedBuild[] }

export type RaidType = 'money' | 'quest' | 'trials' | 'arc' | 'pvp' | 'other';
/* Položka s počtem (výbava, loot, ztráty, materiál receptu). */
export interface ItemQty { name: string; qty: number }
export interface Raid {
  id: string; ts: number; map: string; type: RaidType; route: string;
  ok: boolean; coins: number; min: number; notes: string;
  /* milník 2 */
  loadout: string; gear: ItemQty[]; loot: ItemQty[]; lost: ItemQty[]; goals: string[];
  /* Co z lootu už bylo převedeno do Inventory. Převod přičte jen rozdíl, takže se nic nezapočítá dvakrát. */
  lootApplied: ItemQty[];
  /* 0.8.1: loot zapsaný ze snímku FINDINGS (podpis snímku proti opakovanému zápisu a položky, které přidal).
     Nový snímek téhož raidu tyto položky v lootu nahradí, nepřičte se k nim. */
  lootScan?: LootScan;
  /* 0.15.0 (schéma 14): plán raidu uložený se záznamem (cíle, mapa, loadout, nalezené z plánu, hodnota).
     Volitelné: starší záznamy plán nemají a zůstávají platné. */
  plan?: RaidPlanRecord;
  /* 0.20.0 (schéma 17): záznam z automatického snímání (výsledek, hodnota loadoutu, nejisté údaje). Volitelné. */
  auto?: RaidAuto;
}
/* Předmět plánu v záznamu raidu: kolik chybělo při spuštění plánu a kolik se z toho našlo (nejvýš need). */
export interface RaidPlanItem { mat: string; need: number; found: number }
/* Plán v záznamu raidu. at = čas spuštění plánu (pozná se podle něj, že vyhodnocení už je v deníku);
   goals = čitelné názvy cílů v době uložení (cíle později zmizí, záznam zůstane čitelný); done = požadavky,
   které raid dokončil (např. „Gear Bench 2“); value = odhad hodnoty nalezených předmětů z plánu (null = neznámá). */
export interface RaidPlanRecord {
  at: number; goals: string[]; money: boolean; map: string; loadout: string;
  items: RaidPlanItem[]; done: string[]; value: number | null;
  /* 0.23.0 (schéma 19): hodnota loadoutu v riziku při spuštění plánu (bez bezpečné kapsy; null = neznámá). Volitelné. */
  risk?: number | null;
}
export interface LootScan { sig: string; at: number; items: ItemQty[] }

/* ----- cíle ----- */
export type GoalLink =
  | { kind: 'manual'; target: number; progress: number }
  | { kind: 'level'; level: number }
  | { kind: 'station'; station: string; level: number }
  | { kind: 'skill'; skill: string; points: number }
  | { kind: 'coins'; amount: number }
  | { kind: 'material'; mat: string; qty: number }
  | { kind: 'trials'; stars: number };
export type GoalKind = GoalLink['kind'];
export interface Goal {
  id: string; title: string; note: string; priority: 1 | 2 | 3; due: string;
  createdAt: number; doneAt: number; doneRaid: string; link: GoalLink;
}

/* ----- Material Planner ----- */
export interface PlannerItem { id: string; kind: 'craft' | 'custom'; name: string; qty: number; mats: ItemQty[] }
export interface PlannerState { stations: Record<string, number>; items: PlannerItem[]; includeGoals: boolean; includeQuests: boolean }

/* ----- loadouty ----- */
export interface Loadout {
  id: string; name: string; purpose: string; primary: string; secondary: string;
  augment: string; shield: string;
  /* batoh (BACKPACK) */
  items: ItemQty[]; note: string;
  /* 0.23.0 (schéma 19): loadout builder. Druh (vlastní nebo volný loadout), tier zbraní ('' = neuvedený),
     další místa (QUICK USE, AUGMENTED SLOTS, SAFE POCKET), počty míst a mez váhy (null = neznámé) a zda chybějící
     předměty patří do nákupního seznamu. */
  kind: LoadoutKind;
  primaryTier: ItemTier | ''; secondaryTier: ItemTier | '';
  quickUse: ItemQty[]; augmented: ItemQty[]; safe: ItemQty[];
  slots: LoadoutSlots;
  shop: boolean;
}
export type LoadoutKind = 'custom' | 'free';
/* Počty míst a mez váhy (kg). null = neznámé (bez kontroly). */
export interface LoadoutSlots { backpack: number | null; quickUse: number | null; augmented: number | null; safe: number | null; weight: number | null }

/* ----- prodejní ceník ----- */
export interface SellItem { id: string; name: string; price: number; note: string; origin: Origin }

export interface TrialsWeek { week: string; stars: number[]; names: string[]; notes: string[] }
export interface TrialsState extends TrialsWeek { history: TrialsWeek[] }

export interface StepItem { id: string; text: string; done: boolean }
export interface ChecklistTemplate { id: string; name: string; items: { id: string; text: string }[] }
export interface ChecklistsState {
  templates: ChecklistTemplate[]; active: string;
  checked: Record<string, true>; routeChecks: Record<string, true>;
}

/* Vlastní bod mapy. 0.14.0 (schéma 13): typ bodu, typ místa ('' = neznámé) a poloha v relativních souřadnicích
   vlastního snímku (0–1, x / šířka, y / výška). Bod bez polohy (starší bod jen s názvem) je jen v seznamu. */
export interface Poi { id: string; name: string; note: string; type: import('./lootAreas').PoiType; area: string; x?: number; y?: number }
/* Vlastní snímek mapy: obrázek je jen v místním úložišti obrázků (src/storage/mapImages.ts), ve stavu jen rozměry
   a čas vložení (overlay podle něj pozná výměnu). */
export interface MapImageMeta { w: number; h: number; at: number }
export interface MapNotes {
  notes: string; visited: Record<string, true>; pois: Poi[]; todo: StepItem[];
  /* 0.14.0: barevné sladění snímku (jen při zobrazení, originál se nemění) a údaje o vlastním snímku */
  harmonise: boolean; img: MapImageMeta | null;
}

/* ----- 0.14.0 (schéma 13): příprava na raid ----- */
/* Cíle plánu: úkoly (id ARC Tracker), další úroveň stanic (id stanice), další fáze projektů (id projektu:fáze), peníze. */
export interface RaidGoals { quests: string[]; stations: string[]; projects: string[]; money: boolean }
/* Aktivní plán. Uložené jsou jen volby; seznam se vždy přepočítá z aktuálního stavu. sig = otisk seznamu při
   spuštění (změna = plán se přepočítal). found = zaškrtnutí „mám“ z overlaye (jen orientační, inventář nemění). */
export interface RaidPlan {
  goals: RaidGoals; map: string; loadout: string; route: string; startedAt: number; sig: string; found: string[];
  /* 0.15.0 (schéma 14): zásoba předmětů ze seznamu při spuštění (have) a kolik chybělo (missing); z nich se
     počítá vyhodnocení po raidu (rozdíl zásoby). null = plán spuštěný ve starší verzi (bez snímku zásoby).
     open = cíle, kterým při spuštění něco chybělo (klíče station:id, quest:id, project:id). */
  snap: RaidPlanSnap[] | null; open: string[];
}
export interface RaidPlanSnap { mat: string; have: number; missing: number }

export interface WeaponNote { tier: string; note: string }

export interface GameDataEdits {
  arc: Record<string, Partial<ArcUnit>>;
  arcCustom: ArcUnit[];
  arcHidden: Record<string, true>;
  weapons: Record<string, Partial<Weapon>>;
  weaponsCustom: Weapon[];
  weaponsHidden: Record<string, true>;
  materials: Record<string, { category?: string; source?: string }>;
  materialsCustom: { name: string; category: string; source: string }[];
  recipes: Record<string, Recipe>;
  routes: Record<string, Partial<Route>>;
  routesCustom: Route[];
  routesHidden: Record<string, true>;
  sell: Record<string, Partial<SellItem>>;
  sellCustom: SellItem[];
  sellHidden: Record<string, true>;
}

/* ----- úkoly (milník 3b): id úkolu → čas zaškrtnutí ----- */
/* pinned (0.9.0): připnuté úkoly v pořadí připnutí, nejvýš 5; v kompaktním režimu jdou první */
/* objectives (0.10.2, schéma 9): id úkolu → seřazené indexy zaškrtnutých cílů (pořadí cílů v datech ARC Tracker) */
export interface QuestsState { done: Record<string, number>; pinned: string[]; objectives: Record<string, number[]> }

/* ----- milník 4: rady k předmětům, blueprinty, vlastní tier list, fáze projektů ----- */
export const TIER_IDS = ['S', 'A', 'B', 'C', 'D'] as const;
export type TierId = typeof TIER_IDS[number];
/* Seřazené seznamy v každém tieru: u zbraní id zbraně, u předmětů anglický název. */
export type TierLists = Record<TierId, string[]>;
export interface TierListState { weapons: TierLists; items: TierLists }
/* keep: klíč předmětu (název materiálu, nebo název + tier) → hráč chce předmět vždy nechat */
export interface AdviceState { keep: Record<string, true> }

/* ----- milník 5: buddy Ops, overlay a zkratka (výchozí stav vypnuto) ----- */
export interface BuddyState {
  /* hlavní přepínač „Buddy a zkratka“; vypnuto = žádné okno, žádná zkratka */
  enabled: boolean;
  /* globální zkratka (Ctrl+Shift+KeyS …), prázdná = žádná */
  hotkey: string;
  /* celý násobek mřížky 64 px */
  scale: 1 | 2;
  /* krytí skla overlaye v procentech, 70–100 */
  opacity: number;
  /* otevřít buddyho, když běží ARC Raiders (jen podle seznamu procesů) */
  autoOpen: boolean;
  /* šatník: slot → díl ze sbírky, null = bez dílu; chybějící slot = automaticky podle levelu */
  outfit: Record<string, string | null>;
  /* sbírka odemčených dílů (pokles levelu nic neodebere) */
  unlocked: string[];
  /* poloha buddyho na každém monitoru (fyzické pixely od levého horního rohu monitoru) */
  positions: Record<string, { x: number; y: number }>;
  /* monitor, na kterém byl buddy naposledy */
  monitor: string;
}

/* ----- 0.9.0: hlavní okno (plný a kompaktní režim), patří jen tomuto počítači ----- */
export type WindowMode = 'full' | 'compact';
/* Křížek: zeptat se, skrýt do oznamovací oblasti, nebo ukončit aplikaci. */
export type CloseAction = 'ask' | 'tray' | 'quit';
/* Poloha a velikost okna ve fyzických pixelech (vnější poloha, vnitřní velikost). */
export interface WinRect { x: number; y: number; w: number; h: number }
export type CompactSection = 'quests' | 'shop' | 'upgrade';
export interface MainWindowPrefs {
  mode: WindowMode;
  /* připnutí „vždy navrchu“ platí jen v kompaktu; tady je poslední volba kompaktu */
  pin: boolean;
  full: WinRect | null;
  fullMax: boolean;
  compact: WinRect | null;
  close: CloseAction;
  /* počet aktivních úkolů v kompaktu (1–5) */
  quests: number;
  /* sbalené sekce kompaktu */
  collapsed: Partial<Record<CompactSection, true>>;
}

/* Schéma 7: 6 → 7 doplnilo mainWindow a quests.pinned. Schéma 6: 5 → 6 doplnilo buddy. Schéma 5: 4 → 5 doplnilo advice, blueprints, tierList a projects. Schéma 4: 3 → 4 doplnilo quests a planner.includeQuests. */
/* ----- 0.10.0: povaha, zvuky a průvodce Opse; patří tomuto počítači (import zálohy je nemění) ----- */
/* Věcný / Kamarádský / Drzý */
export type OpsPersonality = 'plain' | 'friendly' | 'cheeky';
export type TutorialStep = 'welcome' | 'profile' | 'profile-manual' | 'profile-shot' | 'capture' | 'tour-inventory' | 'tour-workshop' | 'tour-quests' | 'tour-builds' | 'tour-advisor' | 'tour-raid' | 'tour-map' | 'tour-search' | 'tour-compact' | 'buddy' | 'end';
/* new = ještě neběžel (spustí se sám), active = rozběhnutý (po přerušení pokračuje), done / skipped = konec */
export type TutorialStatus = 'new' | 'active' | 'done' | 'skipped';
export interface OpsPrefs {
  personality: OpsPersonality;
  /* zvuky zapnuté a hlasitost 0–100 (výchozí nízká) */
  sound: boolean;
  volume: number;
  /* průvodce a krátké nevyžádané bubliny; vypnuto = Ops mluví jen na vyžádání */
  dialogs: boolean;
  tutorial: { status: TutorialStatus; step: TutorialStep };
  /* 0.17.0: Ops nahlas radí „Co dál?“ (nejdůležitější tip) v kompaktu a overlayi */
  advisor: boolean;
  /* 0.22.0: widgety nad hrou (výchozí vypnuto) a jejich dvě volitelné globální zkratky (Úpravy, Skrýt / zobrazit).
     Mění je jen Nastavení hlavního okna (akce setWidgets, ne setOpsPrefs), overlay je přes relay nezmění. */
  widgets: WidgetsSwitch;
  /* 0.22.1: buddy propouští kliky do hry, dokud je hra v popředí (výchozí zapnuto). Mění ho jen Nastavení hlavního
     okna (akce setPassClicks, ne setOpsPrefs), overlay ho přes relay nezmění. */
  passClicks: boolean;
  /* 0.23.0: režim nízké zátěže (výchozí vypnuto) a volitelná zkratka polní konzole (výchozí žádná). Mění je jen
     Nastavení hlavního okna (setLowImpact, zkratku hub po přijetí systémem), overlay je přes relay nezmění. */
  lowImpact: boolean;
  consoleKey: string;
}
/* 0.23.0: contrast = vysoký kontrast widgetů (neprůhledné grafitové plochy, bez průhlednosti) */
export interface WidgetsSwitch { on: boolean; editKey: string; hideKey: string; contrast: boolean }

/* ----- 0.11.0 (schéma 10): minihry a nátěry Opse; herní postup aplikace, patří do zálohy ----- */
export interface GamesState {
  /* Stash Tetris: dohraná kola, nejvyšší hodnota batohu a nejlepší výsledek v procentech Opsova balení */
  tetris: { played: number; best: number; bestPct: number };
  /* recyklační kvíz: dohraná kola, nejvíc správných v kole, aktuální a nejdelší série správných odpovědí */
  quiz: { played: number; best: number; streak: number; bestStreak: number };
  /* 0.12.0 (schéma 11): Opsův hack: dohraná kola, nejlepší procento Opsovy normy, kola přesně na normu (nebo líp) */
  hack: { played: number; bestPct: number; perfect: number };
  /* odemčené nátěry (bez výchozího) a vybraný nátěr ('original' = původní vzhled) */
  paints: string[];
  paint: string;
}

/* 0.13.0 (schéma 12): rozehraná kola miniher. Každá hra má nejvýš jedno uložené kolo: 'active' = rozehrané (jde
   pokračovat), 'done' = dohrané (výsledek se už jen zobrazí, odměny se znovu nepřipíšou). sig = otisk vygenerovaného
   kola; když se data aplikace změní a kolo by vyšlo jinak, uložené kolo se zahodí. */
export type RoundStatus = 'active' | 'done';
export interface SavedTetris {
  seed: number; status: RoundStatus; sig: string;
  placements: { id: string; x: number; y: number; rot: boolean }[];
  /* předmět v ruce (vybraný ze stolu nebo vyndaný z batohu) a jeho otočení */
  held: { id: string; rot: boolean } | null;
}
export interface SavedQuiz {
  seed: number; status: RoundStatus; sig: string;
  /* jazyk, ve kterém kolo vzniklo (otázky na úkoly mají přeložené názvy) */
  lang: Lang;
  /* aktuální otázka (od 0), zvolená odpověď na ni (null = ještě neodpovězeno) a počet správných včetně ní */
  index: number; picked: string | null; correct: number;
}
export interface SavedHack {
  seed: number; status: RoundStatus; sig: string;
  /* aktuální uzel (od 0), otočení jeho dlaždic (0–3) a tahy za celé kolo */
  node: number; rot: number[]; moves: number;
}
export interface GameRounds { tetris: SavedTetris | null; quiz: SavedQuiz | null; hack: SavedHack | null }

/* ----- 0.17.0 (schéma 15): rádce „Co dál?“; herní postup aplikace, patří do zálohy ----- */
export interface AdvisorState {
  /* id tipu → klíč podmínky při skrytí; tip se vrátí, až se klíč změní */
  dismissed: Record<string, string>;
  /* id tipu → čas, do kdy je tip odložený */
  snoozed: Record<string, number>;
  /* poslední úspěšně uložená záloha (0 = aplikace o žádné neví) */
  backupAt: number;
}

export interface AppState {
  schema: 19;
  meta: { createdAt: number; updatedAt: number; importedFrom: { source: string; at: number } | null };
  profile: Profile;
  profileLog: ProfileLogEntry[];
  skills: SkillsState;
  stations: Record<string, number>;
  inventory: Record<string, number>;
  steps: StepItem[];
  raids: Raid[];
  trials: TrialsState;
  checklists: ChecklistsState;
  maps: Record<string, MapNotes>;
  arcNotes: Record<string, string>;
  weaponNotes: Record<string, WeaponNote>;
  dashboard: { hidden: Record<string, true>; order: string[] };
  gameData: GameDataEdits;
  goals: Goal[];
  planner: PlannerState;
  loadouts: Loadout[];
  /* milník 3b: ostatní předměty (zbraně, štíty, augmenty, munice, …); materiály zůstávají v inventory */
  items: Record<string, ItemStock>;
  vision: VisionState;
  /* milník 3b: zaškrtnuté úkoly (data ARC Tracker) */
  quests: QuestsState;
  /* milník 4 */
  advice: AdviceState;
  /* naučené blueprinty: název blueprintu → čas odškrtnutí */
  blueprints: Record<string, number>;
  tierList: TierListState;
  /* projekty: id → počet hotových fází */
  projects: Record<string, number>;
  /* milník 5 */
  buddy: BuddyState;
  /* 0.9.0: hlavní okno; import zálohy ani obnova je nemění (nastavení tohoto počítače) */
  mainWindow: MainWindowPrefs;
  /* 0.10.0 (schéma 8): povaha, zvuky a průvodce; import zálohy ani obnova je nemění */
  opsPrefs: OpsPrefs;
  /* 0.11.0 (schéma 10): minihry a nátěry Opse; jsou v záloze */
  games: GamesState;
  /* 0.13.0 (schéma 12): rozehraná a naposledy dohraná kola miniher; ve starším stavu chybí a začnou prázdná */
  gameRounds: GameRounds;
  /* 0.14.0 (schéma 13): aktivní plán raidu; ve starším stavu chybí a začne prázdný (null) */
  raidPlan: RaidPlan | null;
  /* 0.17.0 (schéma 15): skryté a odložené tipy rádce, čas poslední zálohy */
  advisor: AdvisorState;
  /* 0.19.0 (schéma 16): poslední verze aplikace, kterou tento počítač viděl („Co je nového“); patří tomuto počítači */
  whatsNew: WhatsNewState;
  /* 0.20.0 (schéma 17): automatické snímání mimo raid, hlavní vypínač napojení na hru, průběh raidu, fronta
     „Ke kontrole“ a automatické zápisy. Patří tomuto počítači: import zálohy je nemění a snímání nikdy nezapne. */
  autoCapture: AutoCaptureState;
  gameLink: GameLinkState;
  raidLife: RaidLife;
  review: ReviewItem[];
  autoLog: AutoWrite[];
  /* 0.21.0 (schéma 18): původ hodnot (zdroj, čas, jistota, ověření); ve starším stavu chybí a doplní se „migration“ */
  provenance: ProvenanceState;
  /* lang: jazyk UI (od verze 0.3.0; ve starším stavu chybí a doplní ho normalize). */
  settings: { autoSnapshot: boolean; lang: Lang };
}

export interface ReportRow { label: string; source?: string; value: string }
