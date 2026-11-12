/* Výchozí stav a normalizace schématu 3 (schéma 2 se načte stejnou cestou a dostane prázdné items a vision).
   normalize doplní chybějící pole a ořízne hodnoty, takže se načte
   i neúplná nebo starší záloha. Meze odpovídají původnímu deníku. */
import type {
  AppState, ArcUnit, ChecklistTemplate, GameDataEdits, LootScan, MapNotes, Poi, ProfileLogEntry, Raid, RaidType, Recipe,
  Route, SavedBuild, SellItem, StepItem, TrialsWeek, Weapon, WeaponNote,
} from './types';
import { normalizeItems } from './raidItems';
import { normalizeGoals } from './goals';
import { emptyPlanner, normalizePlanner } from './planner';
import { normalizeLoadouts } from './loadouts';
import { normalizeItemStock, normalizeVision, emptyVision } from './visionState';
import { normalizePinned, normalizeProjects, normalizeQuestDone, normalizeQuestObjectives } from './quests';
import { emptyAdvice, normalizeAdvice } from './advice';
import { normalizeBlueprints } from './itemdb';
import { emptyTierList, normalizeTierList } from './tierlist';
import { emptyBuddy, normalizeBuddy } from './ops';
import { emptyMainWindow, normalizeMainWindow } from './mainWindow';
import { emptyOpsPrefs, normalizeOpsPrefs } from './opsPrefs';
import { emptyGames, normalizeGames } from './minigames';
import { clampInt, clampNum, isObj, text, uid } from './util';
import { cleanPoints, isPlanKey } from './skills';
import { STATIONS } from './data/stations';
import { MAPS } from './data/maps';
import { RAID_TYPE_IDS } from './runs';
import { nextStepsText, raidCheckText } from './gametext';
import { isLang, t, tl, type Lang } from '../i18n';

export const SCHEMA = 11 as const;

export const LIMITS = {
  level: [0, 75], coins: [0, 1e10], xp: [0, 1e9], xpNext: [0, 1e9], rounds: [0, 100000],
  expBonus: [0, 15], rewardPass: [0, 60], amplified: [0, 99],
  inventory: [0, 99999], raidCoins: [0, 1e8], raidMin: [0, 120],
} as const satisfies Record<string, readonly [number, number]>;

export const RAID_TEMPLATE_ID = 'raid';
export const stepId = (i: number): string => 'n' + i;
export const raidCheckId = (i: number): string => 'r' + i;

/* Výchozí obsah vzniká v jazyce stavu (bez jazyka česky, jako v deníku). Uložený text se pak už nepřekládá. */
export const defaultSteps = (lang: Lang = 'cs'): StepItem[] => nextStepsText(lang).map((x, i) => ({ id: stepId(i), text: x, done: false }));
export const defaultTemplates = (lang: Lang = 'cs'): ChecklistTemplate[] => [{
  id: RAID_TEMPLATE_ID, name: tl(lang, 'default.raidTemplate'), items: raidCheckText(lang).map((x, i) => ({ id: raidCheckId(i), text: x })),
}];
export const defaultStations = (): Record<string, number> => Object.fromEntries(STATIONS.map(s => [s.id, s.min]));
export const emptyMapNotes = (): MapNotes => ({ notes: '', visited: {}, pois: [], todo: [] });
export const emptyGameData = (): GameDataEdits => ({
  arc: {}, arcCustom: [], arcHidden: {}, weapons: {}, weaponsCustom: [], weaponsHidden: {},
  materials: {}, materialsCustom: [], recipes: {},
  routes: {}, routesCustom: [], routesHidden: {}, sell: {}, sellCustom: [], sellHidden: {},
});

export const DASHBOARD_CARDS = ['kpi', 'next', 'phases', 'trials', 'raids', 'missing', 'progress', 'steps', 'goals', 'recs'] as const;

export function defaultState(now: number = Date.now(), lang: Lang = 'cs'): AppState {
  return {
    schema: SCHEMA,
    meta: { createdAt: now, updatedAt: 0, importedFrom: null },
    profile: { level: 1, coins: 0, xp: 0, xpNext: 0, rounds: 0, expBonus: 0, rewardPass: 0, amplified: 0 },
    profileLog: [],
    skills: { current: {}, showPlan: true, activePlan: 'runner', builds: [] },
    stations: defaultStations(),
    inventory: {},
    steps: defaultSteps(lang),
    raids: [],
    trials: { week: '', stars: [0, 0, 0, 0, 0], names: ['', '', '', '', ''], notes: ['', '', '', '', ''], history: [] },
    checklists: { templates: defaultTemplates(lang), active: RAID_TEMPLATE_ID, checked: {}, routeChecks: {} },
    maps: {},
    arcNotes: {},
    weaponNotes: {},
    dashboard: { hidden: {}, order: [...DASHBOARD_CARDS] },
    gameData: emptyGameData(),
    goals: [],
    planner: emptyPlanner(),
    loadouts: [],
    items: {},
    vision: emptyVision(),
    quests: { done: {}, pinned: [], objectives: {} },
    advice: emptyAdvice(),
    blueprints: {},
    tierList: emptyTierList(),
    projects: {},
    buddy: emptyBuddy(),
    mainWindow: emptyMainWindow(),
    opsPrefs: emptyOpsPrefs(),
    games: emptyGames(),
    settings: { autoSnapshot: true, lang },
  };
}

const lim = (v: unknown, key: keyof typeof LIMITS, fallback = 0): number =>
  clampInt(v ?? fallback, LIMITS[key][0], LIMITS[key][1]);

const trueMap = (raw: unknown, ok: (k: string) => boolean = () => true, max = 5000): Record<string, true> => {
  const out: Record<string, true> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, max)) if (v === true && ok(k)) out[text(k, 120)] = true;
  return out;
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objOf = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});
const MAP_IDS = MAPS.map(m => m.id);

export const emptyRaidExtras = (): Pick<Raid, 'loadout' | 'gear' | 'loot' | 'lost' | 'goals' | 'lootApplied'> =>
  ({ loadout: '', gear: [], loot: [], lost: [], goals: [], lootApplied: [] });

export function normalizeRaid(x: Record<string, unknown>): Raid {
  const ok = x.ok !== false;
  return {
    id: text(x.id || uid(), 24),
    ts: clampInt(x.ts || 0, 0, 9e15),
    map: MAP_IDS.includes(String(x.map)) ? String(x.map) : 'dam',
    type: (RAID_TYPE_IDS.includes(x.type as RaidType) ? x.type : 'money') as RaidType,
    route: text(x.route, 40),
    ok,
    coins: lim(x.coins || 0, 'raidCoins'),
    min: clampNum(x.min, 0, 120),
    notes: text(x.notes, 4000),
    loadout: text(x.loadout, 24),
    gear: normalizeItems(x.gear),
    loot: normalizeItems(x.loot),
    lost: normalizeItems(x.lost),
    goals: [...new Set(arr(x.goals).map(g => text(g, 24)).filter(Boolean))].slice(0, 50),
    lootApplied: normalizeItems(x.lootApplied),
    ...normalizeLootScan(x.lootScan),
  };
}

/* Podpis snímku FINDINGS: jen krátký text z písmen a číslic (viz core/lootImport.ts). */
export const LOOT_SIG_RE = /^L[0-9a-f]{16}$/;
function normalizeLootScan(raw: unknown): { lootScan?: LootScan } {
  if (!isObj(raw) || typeof raw.sig !== 'string' || !LOOT_SIG_RE.test(raw.sig)) return {};
  return { lootScan: { sig: raw.sig, at: clampInt(raw.at || 0, 0, 9e15), items: normalizeItems(raw.items) } };
}

function normalizeSteps(raw: unknown, lang: Lang): StepItem[] {
  if (!Array.isArray(raw)) return defaultSteps(lang);
  const seen = new Set<string>();
  return raw.filter(isObj).slice(0, 200).map(x => {
    let id = text(x.id || uid(), 24);
    if (seen.has(id)) id = uid();
    seen.add(id);
    return { id, text: text(x.text, 300), done: x.done === true };
  });
}

function normalizeWeek(x: Record<string, unknown>): TrialsWeek {
  return {
    week: text(x.week, 10),
    stars: [0, 1, 2, 3, 4].map(i => clampInt(arr(x.stars)[i] || 0, 0, 3)),
    names: [0, 1, 2, 3, 4].map(i => text(arr(x.names)[i] || '', 80)),
    notes: [0, 1, 2, 3, 4].map(i => text(arr(x.notes)[i] || '', 500)),
  };
}

/* Odškrtnutí se ukládají podle id položky, proto musí být id položek jedinečná napříč všemi šablonami. */
function normalizeTemplates(raw: unknown, lang: Lang): ChecklistTemplate[] {
  const seenT = new Set<string>(), seenI = new Set<string>();
  const list = arr(raw).filter(isObj).slice(0, 50).map(t => {
    let id = text(t.id || uid(), 24);
    if (seenT.has(id)) id = uid() + seenT.size;
    seenT.add(id);
    return {
      id, name: text(t.name, 80),
      items: arr(t.items).filter(isObj).slice(0, 100).map(i => {
        let iid = text(i.id || uid(), 24);
        if (seenI.has(iid)) iid = uid() + seenI.size;
        seenI.add(iid);
        return { id: iid, text: text(i.text, 300) };
      }),
    };
  });
  if (!list.some(t => t.id === RAID_TEMPLATE_ID)) list.unshift(defaultTemplates(lang)[0]);
  return list;
}

function normalizeMapNotes(raw: unknown): Record<string, MapNotes> {
  const out: Record<string, MapNotes> = {};
  for (const [k, v] of Object.entries(objOf(raw))) {
    if (!MAP_IDS.includes(k) || !isObj(v)) continue;
    out[k] = {
      notes: text(v.notes, 8000),
      visited: trueMap(v.visited, () => true, 200),
      pois: arr(v.pois).filter(isObj).slice(0, 300).map((p): Poi => ({ id: text(p.id || uid(), 24), name: text(p.name, 120), note: text(p.note, 1000) })),
      todo: arr(v.todo).filter(isObj).slice(0, 300).map((t): StepItem => ({ id: text(t.id || uid(), 24), text: text(t.text, 300), done: t.done === true })),
    };
  }
  return out;
}

function normalizeBuilds(raw: unknown): SavedBuild[] {
  return arr(raw).filter(isObj).slice(0, 100).map(b => ({
    id: text(b.id || uid(), 24), name: text(b.name, 80) || t('skill.defaultBuild'), note: text(b.note, 1000), points: cleanPoints(b.points),
  }));
}

const strRecord = (raw: unknown, max: number): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(objOf(raw)).slice(0, 1000)) { const t = text(v, max); if (t) out[text(k, 80)] = t; }
  return out;
};

function normalizeArcUnit(x: Record<string, unknown>): ArcUnit {
  return {
    id: text(x.id || uid(), 40), name: text(x.name, 80) || t('default.newArc'), origin: 'vlastni', since: text(x.since, 10),
    type: text(x.type, 60), category: text(x.category, 60), difficulty: clampInt(x.difficulty || 0, 0, 5), danger: text(x.danger, 30),
    traits: text(x.traits, 1000), weakness: text(x.weakness, 1000), weaknessVerified: x.weaknessVerified === true,
    tactic: text(x.tactic, 2000), gear: text(x.gear, 1000), drops: arr(x.drops).slice(0, 30).map(d => text(d, 80)).filter(Boolean),
    sources: [],
  };
}
function normalizeWeapon(x: Record<string, unknown>): Weapon {
  return {
    id: text(x.id || uid(), 40), name: text(x.name, 80) || t('default.newWeapon'), origin: 'vlastni',
    tier: ['S', 'A', 'B', 'C', ''].includes(String(x.tier)) ? String(x.tier) : '', antiArc: x.antiArc === true,
    category: text(x.category, 60), ammo: text(x.ammo, 60), info: text(x.info, 2000), sources: [],
  };
}
/* Částečné úpravy vestavěného záznamu: necháme jen textová a známá pole. */
function partial<T extends object>(raw: unknown, keys: (keyof T)[]): Record<string, Partial<T>> {
  const out: Record<string, Partial<T>> = {};
  for (const [id, v] of Object.entries(objOf(raw)).slice(0, 500)) {
    if (!isObj(v)) continue;
    const p: Record<string, unknown> = {};
    for (const k of keys) {
      const val = v[k as string];
      if (val === undefined) continue;
      if (typeof val === 'boolean') p[k as string] = val;
      else if (typeof val === 'number') p[k as string] = clampInt(val, 0, 5);
      else if (Array.isArray(val)) p[k as string] = val.slice(0, 30).map(d => text(d, 80)).filter(Boolean);
      else p[k as string] = text(val, 2000);
    }
    out[text(id, 40)] = p as Partial<T>;
  }
  return out;
}
function normalizeRecipes(raw: unknown): Record<string, Recipe> {
  const out: Record<string, Recipe> = {};
  for (const [k, v] of Object.entries(objOf(raw)).slice(0, 200)) {
    const [st, lvl] = k.split(':');
    const station = STATIONS.find(s => s.id === st);
    if (!station || !(Number(lvl) >= 1 && Number(lvl) <= station.max) || !Array.isArray(v)) continue;
    out[`${st}:${Number(lvl)}`] = v.filter(Array.isArray).slice(0, 20)
      .map(([m, n]) => [text(m, 80), clampInt(n, 1, 99999)] as [string, number]).filter(([m]) => m);
  }
  return out;
}

function normalizeRoute(x: Record<string, unknown>): Route {
  return {
    id: text(x.id || 'vlastni-' + uid(), 40), name: text(x.name, 80).trim() || t('default.newRoute'), origin: 'vlastni',
    map: MAP_IDS.includes(String(x.map)) ? String(x.map) : 'dam', risk: text(x.risk, 60), loadout: text(x.loadout, 200),
    yield: text(x.yield, 80), phase: text(x.phase, 20), steps: arr(x.steps).slice(0, 40).map(t => text(t, 500)).filter(Boolean),
  };
}
function normalizeSell(x: Record<string, unknown>): SellItem {
  return {
    id: text(x.id || 'vlastni-' + uid(), 40), name: text(x.name, 120).trim() || t('default.newSell'), origin: 'vlastni',
    price: clampInt(x.price ?? 0, 0, 1e8), note: text(x.note, 300),
  };
}
function routeOverrides(raw: unknown): Record<string, Partial<Route>> {
  const out: Record<string, Partial<Route>> = {};
  for (const [id, v] of Object.entries(objOf(raw)).slice(0, 200)) {
    if (!isObj(v)) continue;
    const p: Partial<Route> = {};
    for (const k of ['name', 'risk', 'loadout', 'yield', 'phase'] as const) if (v[k] !== undefined) p[k] = text(v[k], k === 'loadout' ? 200 : 80);
    if (v.map !== undefined && MAP_IDS.includes(String(v.map))) p.map = String(v.map);
    if (Array.isArray(v.steps)) p.steps = v.steps.slice(0, 40).map(t => text(t, 500)).filter(Boolean);
    out[text(id, 40)] = p;
  }
  return out;
}
function sellOverrides(raw: unknown): Record<string, Partial<SellItem>> {
  const out: Record<string, Partial<SellItem>> = {};
  for (const [id, v] of Object.entries(objOf(raw)).slice(0, 200)) {
    if (!isObj(v)) continue;
    const p: Partial<SellItem> = {};
    if (v.name !== undefined) p.name = text(v.name, 120);
    if (v.price !== undefined) p.price = clampInt(v.price, 0, 1e8);
    if (v.note !== undefined) p.note = text(v.note, 300);
    out[text(id, 40)] = p;
  }
  return out;
}
const uniqueIds = <T extends { id: string }>(list: T[]): T[] => {
  const seen = new Set<string>();
  return list.filter(x => !seen.has(x.id) && !!seen.add(x.id));
};

export function normalizeGameData(raw: unknown): GameDataEdits {
  const g = objOf(raw);
  const arcKeys: (keyof ArcUnit)[] = ['name', 'type', 'category', 'difficulty', 'danger', 'traits', 'weakness', 'weaknessVerified', 'tactic', 'gear', 'drops'];
  const wKeys: (keyof Weapon)[] = ['name', 'tier', 'antiArc', 'category', 'ammo', 'info'];
  const mats: Record<string, { category?: string; source?: string }> = {};
  for (const [k, v] of Object.entries(objOf(g.materials)).slice(0, 1000)) {
    if (!isObj(v)) continue;
    const e: { category?: string; source?: string } = {};
    if (v.category !== undefined) e.category = text(v.category, 60);
    if (v.source !== undefined) e.source = text(v.source, 200);
    mats[text(k, 80)] = e;
  }
  return {
    arc: partial<ArcUnit>(g.arc, arcKeys),
    arcCustom: arr(g.arcCustom).filter(isObj).slice(0, 200).map(normalizeArcUnit),
    arcHidden: trueMap(g.arcHidden),
    weapons: partial<Weapon>(g.weapons, wKeys),
    weaponsCustom: arr(g.weaponsCustom).filter(isObj).slice(0, 200).map(normalizeWeapon),
    weaponsHidden: trueMap(g.weaponsHidden),
    materials: mats,
    materialsCustom: arr(g.materialsCustom).filter(isObj).slice(0, 500)
      .map(m => ({ name: text(m.name, 80), category: text(m.category, 60), source: text(m.source, 200) })).filter(m => m.name),
    recipes: normalizeRecipes(g.recipes),
    routes: routeOverrides(g.routes),
    routesCustom: uniqueIds(arr(g.routesCustom).filter(isObj).slice(0, 100).map(normalizeRoute)),
    routesHidden: trueMap(g.routesHidden),
    sell: sellOverrides(g.sell),
    sellCustom: uniqueIds(arr(g.sellCustom).filter(isObj).slice(0, 200).map(normalizeSell)),
    sellHidden: trueMap(g.sellHidden),
  };
}

/* lang = jazyk pro stav bez uložené volby (starší stav a zálohy); uložená volba má přednost. */
export function normalize(raw: unknown, now: number = Date.now(), lang: Lang = 'cs'): AppState {
  const r = objOf(raw);
  const savedLang = objOf(r.settings).lang;
  const stateLang: Lang = isLang(savedLang) ? savedLang : lang;
  const d = defaultState(now, stateLang);
  const out = d;

  const meta = objOf(r.meta);
  out.meta.createdAt = clampInt(meta.createdAt || now, 0, 9e15);
  out.meta.updatedAt = clampInt(meta.updatedAt || 0, 0, 9e15);
  const imp = objOf(meta.importedFrom);
  out.meta.importedFrom = imp.source ? { source: text(imp.source, 40), at: clampInt(imp.at || 0, 0, 9e15) } : null;

  const p = objOf(r.profile);
  out.profile = {
    level: lim(p.level, 'level', d.profile.level), coins: lim(p.coins, 'coins'), xp: lim(p.xp, 'xp'), xpNext: lim(p.xpNext, 'xpNext'),
    rounds: lim(p.rounds, 'rounds'), expBonus: lim(p.expBonus, 'expBonus'), rewardPass: lim(p.rewardPass, 'rewardPass'),
    amplified: lim(p.amplified, 'amplified'),
  };

  const seenDays = new Set<string>();
  out.profileLog = arr(r.profileLog).filter(isObj).map((e): ProfileLogEntry => ({
    day: text(e.day, 10), level: lim(e.level, 'level'), coins: lim(e.coins, 'coins'), xp: lim(e.xp, 'xp'),
    rounds: lim(e.rounds, 'rounds'), rewardPass: lim(e.rewardPass, 'rewardPass'),
  })).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.day) && !seenDays.has(e.day) && !!seenDays.add(e.day))
    .sort((a, b) => a.day.localeCompare(b.day)).slice(-3650);

  const sk = objOf(r.skills);
  out.skills.current = cleanPoints(sk.current);
  out.skills.showPlan = sk.showPlan !== false;
  out.skills.builds = normalizeBuilds(sk.builds);
  const plan = String(sk.activePlan ?? '');
  out.skills.activePlan = isPlanKey(plan, out.skills.builds) ? plan : 'runner';

  const st = objOf(r.stations);
  for (const s of STATIONS) if (st[s.id] !== undefined) out.stations[s.id] = clampInt(st[s.id], s.min, s.max);

  for (const [k, v] of Object.entries(objOf(r.inventory))) { const n = lim(v, 'inventory'); if (n > 0) out.inventory[text(k, 80)] = n; }

  out.steps = r.steps === undefined ? d.steps : normalizeSteps(r.steps, stateLang);

  out.raids = arr(r.raids).filter(isObj).map(normalizeRaid);
  const seenRaid = new Set<string>();
  for (const x of out.raids) { if (seenRaid.has(x.id)) x.id = uid() + seenRaid.size; seenRaid.add(x.id); }

  const tr = objOf(r.trials);
  if (isObj(r.trials)) {
    const w = normalizeWeek(tr);
    out.trials = { ...w, history: arr(tr.history).filter(isObj).slice(-520).map(normalizeWeek).filter(h => h.week) };
  }

  const cl = objOf(r.checklists);
  out.checklists.templates = normalizeTemplates(cl.templates, stateLang);
  out.checklists.active = out.checklists.templates.some(t => t.id === cl.active) ? String(cl.active) : RAID_TEMPLATE_ID;
  out.checklists.checked = trueMap(cl.checked);
  out.checklists.routeChecks = trueMap(cl.routeChecks);

  out.maps = normalizeMapNotes(r.maps);
  out.arcNotes = strRecord(r.arcNotes, 4000);
  for (const [k, v] of Object.entries(objOf(r.weaponNotes)).slice(0, 500)) {
    if (!isObj(v)) continue;
    const n: WeaponNote = { tier: ['S', 'A', 'B', 'C'].includes(String(v.tier)) ? String(v.tier) : '', note: text(v.note, 2000) };
    if (n.tier || n.note) out.weaponNotes[text(k, 40)] = n;
  }

  const db = objOf(r.dashboard);
  out.dashboard.hidden = trueMap(db.hidden, k => (DASHBOARD_CARDS as readonly string[]).includes(k));
  const order = arr(db.order).map(String).filter((k, i, a) => (DASHBOARD_CARDS as readonly string[]).includes(k) && a.indexOf(k) === i);
  out.dashboard.order = [...order, ...DASHBOARD_CARDS.filter(k => !order.includes(k))];

  out.gameData = normalizeGameData(r.gameData);
  out.goals = normalizeGoals(r.goals, now);
  out.planner = normalizePlanner(r.planner);
  out.loadouts = normalizeLoadouts(r.loadouts);
  out.items = normalizeItemStock(r.items);
  out.vision = normalizeVision(r.vision);
  /* schéma 9 (0.10.2): zaškrtnuté cíle úkolů; ve starším stavu chybí a začnou prázdné */
  out.quests = {
    done: normalizeQuestDone(objOf(r.quests).done), pinned: normalizePinned(objOf(r.quests).pinned),
    objectives: normalizeQuestObjectives(objOf(r.quests).objectives),
  };
  /* schéma 5 (milník 4): ve starším stavu chybí a dostanou výchozí hodnoty */
  out.advice = normalizeAdvice(r.advice);
  out.blueprints = normalizeBlueprints(r.blueprints);
  out.tierList = normalizeTierList(r.tierList);
  out.projects = normalizeProjects(r.projects);
  /* schéma 6 (milník 5): ve starším stavu chybí, přepínač je vypnutý; sbírku dílů doplní store při změně */
  out.buddy = normalizeBuddy(r.buddy);
  /* schéma 7 (0.9.0): ve starším stavu chybí, okno začne v plném režimu, křížek se zeptá */
  out.mainWindow = normalizeMainWindow(r.mainWindow);
  /* schéma 8 (0.10.0): ve starším stavu chybí; povaha Kamarádský, zvuky potichu zapnuté, průvodce se nabídne */
  out.opsPrefs = normalizeOpsPrefs(r.opsPrefs);
  /* schéma 10 (0.11.0): minihry a nátěry; ve starším stavu chybí, začnou od nuly s původním vzhledem Opse.
     schéma 11 (0.12.0): Opsův hack (games.hack); ve starším stavu chybí a začne od nuly, ostatní minihry beze změny */
  out.games = normalizeGames(r.games);
  out.settings.autoSnapshot = objOf(r.settings).autoSnapshot !== false;
  out.settings.lang = stateLang;
  return out;
}
