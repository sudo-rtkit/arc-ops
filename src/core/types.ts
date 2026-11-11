/* Typy herních dat a uživatelského stavu. Jádro nezná React ani úložiště. */
import type { Lang } from '../i18n';
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
}

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
}

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
  augment: string; shield: string; items: ItemQty[]; note: string;
}

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

export interface Poi { id: string; name: string; note: string }
export interface MapNotes { notes: string; visited: Record<string, true>; pois: Poi[]; todo: StepItem[] }

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
export interface QuestsState { done: Record<string, number> }

/* Schéma 4: 3 → 4 doplnilo quests a planner.includeQuests. */
export interface AppState {
  schema: 4;
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
  /* lang: jazyk UI (od verze 0.3.0; ve starším stavu chybí a doplní ho normalize). */
  settings: { autoSnapshot: boolean; lang: Lang };
}

export interface ReportRow { label: string; source?: string; value: string }
