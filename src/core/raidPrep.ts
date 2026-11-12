/* Příprava na raid (0.14.0, spec docs/superpowers/specs/2026-11-12-priprava-na-raid-design.md). Čisté funkce.
   Nic se nepočítá znovu:
   - seznam k hledání = Material Planner (planNeeds) nad vybranými cíli a celou zásobou (stockOf z kompaktu),
     takže chybějící množství = požadavek − zásoba a stejný zdroj se nikdy nezapočítá dvakrát;
   - výchozí cíle = připnuté a rozpracované úkoly a další vylepšení z kompaktního okna (activeQuests, nextUpgrade);
   - nechat / prodat / recyklovat = rada Úklidu (advise) nad potřebami aplikace a požadavky plánu.
   Typ místa (loot_area) je jen z katalogu; kde chybí, je neznámé. Typy míst se k mapám nepřiřazují. */
import type { AppState, GameMap, Lang, PlannerState, Poi, RaidGoals, RaidPlan, RaidPlanItem, RaidPlanRecord, RaidPlanSnap, Route } from './types';
import { activeQuests, nextUpgrade, stockOf } from './compact';
import { planNeeds, stationTargets, type ReqKind } from './planner';
import { nextNeeds, readiness } from './workshop';
import { projectNeeds, questById, questName, questStatus, type QuestNeed } from './quests';
import { getRoutes, getSources, getStations } from './gamedata';
import { advise, collectNeedList, haveOfState, needIndex, type AdviceKind, type NeedInput } from './advice';
import { itemAreas, type LootArea } from './lootAreas';
import { catalogItems } from './catalog';
import { phases } from './phases';
import { MAPS } from './data/maps';
import { clampInt, isObj, text } from './util';
import { PLAN_MIN_SAMPLE, planMapStats } from './runs';
import { t, type Key, type Params } from '../i18n';

export const emptyGoals = (): RaidGoals => ({ quests: [], stations: [], projects: [], money: false });
export const hasGoals = (g: RaidGoals): boolean => g.money || g.quests.length + g.stations.length + g.projects.length > 0;

/* ----- nabídka cílů ----- */
export interface QuestOption { id: string; name: string; maps: string[]; pinned: boolean; started: boolean }
export interface StationOption { id: string; name: string; level: number; block: string | null }
export interface ProjectOption { id: string; label: string }
export interface GoalOptions { quests: QuestOption[]; stations: StationOption[]; projects: ProjectOption[] }

const workshopView = (s: AppState) => ({ stations: s.stations, inventory: s.inventory, profile: s.profile });

/* Dostupné úkoly (pořadí kompaktu: připnuté, rozpracované, ostatní), další úroveň stanic a běžící projekty. */
export function goalOptions(s: AppState, lang: Lang, today: string): GoalOptions {
  const quests = activeQuests(s, lang, 1000).map(q => ({ id: q.id, name: q.name, maps: questById(q.id)?.maps ?? [], pinned: q.pinned, started: q.have > 0 }));
  const stations = nextNeeds(workshopView(s), getStations(s.gameData)).map(n => ({ id: n.station.id, name: n.station.name, level: n.level, block: n.block }));
  const projects = projectNeeds(s.projects, today, lang).map(p => ({ id: p.id, label: p.label }));
  return { quests, stations, projects };
}

/* Výchozí výběr: připnuté a rozpracované úkoly a další vylepšení z kompaktního okna. */
export function defaultGoals(s: AppState, lang: Lang): RaidGoals {
  const stations = getStations(s.gameData);
  const view = workshopView(s);
  const needs = nextNeeds(view, stations).map(n => ({ ...n, ready: readiness(s.inventory, n.mats) }));
  const up = nextUpgrade(needs, stationTargets(view, s.planner, s.goals, stations), s.inventory);
  return {
    quests: activeQuests(s, lang, 1000).filter(q => q.pinned || q.have > 0).map(q => q.id),
    stations: up ? [up.station.id] : [],
    projects: [],
    money: false,
  };
}

/* Cíle, které už neplatí (splněný úkol, stanice na maximu, skončený projekt), se tiše vynechají. */
export function validGoals(s: AppState, goals: RaidGoals, lang: Lang, today: string): RaidGoals {
  const o = goalOptions(s, lang, today);
  const has = (list: { id: string }[]) => (id: string) => list.some(x => x.id === id);
  return {
    quests: goals.quests.filter(id => { const q = questById(id); return !!q && questStatus(q, s.quests.done) === 'active'; }),
    stations: goals.stations.filter(has(o.stations)),
    projects: goals.projects.filter(has(o.projects)),
    money: goals.money,
  };
}

/* ----- seznam k hledání ----- */
export interface RaidReason { kind: ReqKind; label: string; qty: number }
export interface RaidRow { mat: string; need: number; have: number; missing: number; reasons: RaidReason[]; areas: LootArea[] }

/* Požadavky vybraných cílů ve tvaru Material Planneru: stanice na další úroveň, projekty jako vlastní položky,
   úkoly s předměty k odevzdání i předměty, které se pro úkol najdou během raidu. */
export function goalRequirements(s: AppState, goals: RaidGoals, lang: Lang, today: string): { planner: PlannerState; quests: QuestNeed[] } {
  const stations = getStations(s.gameData);
  const plannerStations: Record<string, number> = {};
  /* stejný cíl vybraný dvakrát se počítá jednou (Planner by stejný zdroj ve stejném seznamu sečetl) */
  for (const id of new Set(goals.stations)) {
    const st = stations.find(x => x.id === id);
    if (st) plannerStations[id] = Math.min(st.max, (s.stations[id] ?? st.min) + 1);
  }
  const projects = projectNeeds(s.projects, today, lang).filter(p => goals.projects.includes(p.id));
  const quests: QuestNeed[] = [];
  for (const id of new Set(goals.quests)) {
    const q = questById(id);
    if (!q || questStatus(q, s.quests.done) !== 'active') continue;
    const mats = [...q.deliver, ...q.questItems].map(([m, n]) => [m, n] as [string, number]);
    if (mats.length) quests.push({ id: q.id, label: questName(q, lang), mats });
  }
  return {
    planner: {
      stations: plannerStations,
      items: projects.map(p => ({ id: p.id, kind: 'custom' as const, name: p.label, qty: 1, mats: p.mats.map(([name, qty]) => ({ name, qty })) })),
      includeGoals: false, includeQuests: true,
    },
    quests,
  };
}

/* Chybějící předměty pro vybrané cíle (jen řádky, kterým něco chybí). */
export function raidList(s: AppState, goals: RaidGoals, lang: Lang, today: string): RaidRow[] {
  const { planner, quests } = goalRequirements(s, goals, lang, today);
  const view = { ...workshopView(s), inventory: stockOf(s) };
  return planNeeds(view, planner, [], getStations(s.gameData), getSources(s.gameData), quests)
    .filter(r => r.missing > 0)
    .map(r => ({ mat: r.mat, need: r.need, have: r.have, missing: r.missing, reasons: r.sources.map(x => ({ kind: x.kind, label: x.label, qty: x.qty })), areas: itemAreas(r.mat) }))
    .sort((a, b) => b.missing - a.missing || a.mat.localeCompare(b.mat));
}

/* Otisk seznamu (předmět a chybějící počet). Jiný otisk než při spuštění = plán se přepočítal. */
export function listSig(rows: RaidRow[]): string {
  const str = rows.map(r => `${r.mat}:${r.missing}`).sort().join('|');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return 'r' + h.toString(16).padStart(8, '0');
}

/* Typy míst chybějících předmětů (pro zvýraznění bodů na mapě). */
export function neededAreas(rows: RaidRow[]): Map<LootArea, string[]> {
  const out = new Map<LootArea, string[]>();
  for (const r of rows) for (const a of r.areas) out.set(a, [...(out.get(a) ?? []), r.mat]);
  return out;
}

/* ----- doporučená mapa ----- */
export interface MapReason { key: Key; params?: Params }
export interface MapScore { id: string; name: string; score: number; locked: boolean; reasons: MapReason[]; route: Route | null }

/* Fáze trasy („1“, „1–2“, „2–4“) jako rozsah. */
export function phaseRange(phase: string): [number, number] | null {
  const n = (phase.match(/\d+/g) ?? []).map(Number).filter(Number.isFinite);
  return n.length ? [Math.min(...n), Math.max(...n)] : null;
}

/* Bodování map: otevřené úkoly z výběru s danou mapou (3 body za úkol), u cíle „peníze“ nejlepší trasa na mapě
   (3 body ve fázi hráče, jinak 1), 0.15.0: historie plánů na mapě (+1 při průměru aspoň 1 nalezeného kusu z plánu,
   jen od PLAN_MIN_SAMPLE raidů s plánem) a fáze hráče proti obtížnosti mapy (±1). Zamčená mapa se nedoporučuje.
   Každé skóre má čitelné důvody. Seřazeno od nejlepší. */
export function scoreMaps(s: AppState, goals: RaidGoals, lang: Lang, maps: GameMap[] = MAPS): MapScore[] {
  const phase = phases({ profile: s.profile, stations: s.stations, skills: s.skills }).current;
  const routes = goals.money ? getRoutes(s.gameData, lang) : [];
  const quests = goals.quests.map(questById).filter((q): q is NonNullable<typeof q> => !!q && questStatus(q, s.quests.done) === 'active');
  const history = planMapStats(s.raids);
  const list = maps.map((m, order) => {
    const reasons: MapReason[] = [];
    let score = 0;
    const locked = s.profile.rounds < m.rounds;
    if (locked) reasons.push({ key: 'raid.reason.locked', params: { count: m.rounds - s.profile.rounds } });
    const here = quests.filter(q => q.maps.includes(m.id));
    if (here.length) {
      score += 3 * here.length;
      reasons.push({ key: 'raid.reason.quests', params: { count: here.length, names: here.slice(0, 3).map(q => questName(q, lang)).join(', ') } });
    }
    let route: Route | null = null;
    if (goals.money) {
      let best = 0;
      for (const r of routes.filter(x => x.map === m.id)) {
        const pr = phaseRange(r.phase);
        const pts = pr && phase >= pr[0] && phase <= pr[1] ? 3 : 1;
        if (pts > best) { best = pts; route = r; }
      }
      if (route) {
        score += best;
        reasons.push({ key: best === 3 ? 'raid.reason.route' : 'raid.reason.routeOther', params: { name: route.name } });
      }
    }
    /* 0.15.0: historie plánů z deníku, jen s dostatečným vzorkem (jinak by malý vzorek vypadal jako závěr) */
    const h = history.find(x => x.map === m.id);
    if (h && h.n >= PLAN_MIN_SAMPLE) {
      if (h.avg >= 1) score += 1;
      reasons.push({ key: 'raid.reason.history', params: { avg: h.avg, count: h.n } });
    }
    if (m.diff <= phase + 2) { score += 1; reasons.push({ key: 'raid.reason.fit', params: { n: m.diff } }); }
    else { score -= 1; reasons.push({ key: 'raid.reason.hard', params: { n: m.diff } }); }
    return { id: m.id, name: m.name, score, locked, reasons, route, order, diff: m.diff };
  });
  return list
    .sort((a, b) => Number(a.locked) - Number(b.locked) || b.score - a.score || a.diff - b.diff || a.order - b.order)
    .map(({ order: _o, diff: _d, ...x }) => x);
}

/* Doporučená mapa: nejlepší odemčená (bez odemčené mapy první v pořadí). */
export const recommendedMap = (scores: MapScore[]): MapScore | undefined => scores.find(x => !x.locked) ?? scores[0];

/* ----- nechat / prodat / recyklovat ----- */
export interface Verdict {
  name: string; kind: AdviceKind; have: number; need: number; missing: number;
  reasons: { label: string; qty: number }[]; recycle: string[]; value: number | null; override: boolean; inPlan: boolean;
}

/* Názvy pro vyhledávání: katalog, materiály aplikace a zásoba. */
export function lookupNames(s: AppState, materials: string[]): string[] {
  const set = new Map<string, string>();
  for (const n of [...materials, ...Object.keys(s.inventory), ...Object.values(s.items).map(i => i.key), ...catalogItems().map(c => c.name)]) {
    const k = n.trim().toLowerCase();
    if (k && !set.has(k)) set.set(k, n.trim());
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}

/* Nejlepší shoda dotazu: přesný název, pak začátek, pak část názvu (bez ohledu na velikost písmen). */
export function findName(query: string, names: string[]): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;
  return names.find(n => n.toLowerCase() === q) ?? names.find(n => n.toLowerCase().startsWith(q)) ?? names.find(n => n.toLowerCase().includes(q)) ?? null;
}

/* Rada k předmětu, který hráč právě našel: počítá se, jako by ho sebral (zásoba + 1). Nechat, když ho potřebuje
   aplikace (stanice, úkoly, projekty, cíle, Planner) nebo plán; jinak recyklovat, nebo prodat (rada Úklidu).
   Potřeby aplikace už obsahují další úroveň stanic, dostupné úkoly a běžící projekty; plán k nim přidá jen předměty,
   které se pro vybraný úkol najdou během raidu (stejný klíč zdroje, takže se nic nepočítá dvakrát). */
export function lookupAdvice(s: AppState, name: string, goals: RaidGoals, plan: RaidRow[], lang: Lang, today: string): Verdict {
  const list: NeedInput[] = collectNeedList(s, today, lang);
  for (const q of goalRequirements(s, goals, lang, today).quests) {
    for (const [mat, qty] of q.mats) list.push({ key: `quest:${q.id}`, kind: 'quest', label: t('planner.req.quest', { name: q.label }), mat, qty });
  }
  const needs = needIndex(list);
  const haveOf = haveOfState(s);
  const have = haveOf(name);
  const a = advise({ key: name, name, count: have + 1, kind: 'material' }, needs, haveOf, !!s.advice.keep[name]);
  const kind: AdviceKind = a.override || a.surplus === 0 ? 'keep' : a.rest;
  const lower = name.trim().toLowerCase();
  return {
    name, kind, have, need: a.need, missing: Math.max(0, a.need - have),
    reasons: a.reasons.map(r => ({ label: r.label, qty: r.qty })), recycle: a.recycle.filter(r => r.needed).map(r => r.name),
    value: a.value, override: a.override, inPlan: plan.some(r => r.mat.trim().toLowerCase() === lower),
  };
}

/* ----- stav ----- */
const ids = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80))].slice(0, max) : [];
export function normalizeGoals(raw: unknown): RaidGoals {
  const g = isObj(raw) ? raw : {};
  return { quests: ids(g.quests, 200), stations: ids(g.stations, 50), projects: ids(g.projects, 50), money: g.money === true };
}
export function normalizeRaidPlan(raw: unknown): RaidPlan | null {
  if (!isObj(raw)) return null;
  const map = MAPS.some(m => m.id === raw.map) ? String(raw.map) : null;
  if (!map) return null;
  return {
    goals: normalizeGoals(raw.goals), map, loadout: text(raw.loadout, 24), route: text(raw.route, 40),
    startedAt: clampInt(raw.startedAt || 0, 0, 9e15), sig: typeof raw.sig === 'string' && /^r[0-9a-f]{8}$/.test(raw.sig) ? raw.sig : '',
    found: Array.isArray(raw.found) ? [...new Set(raw.found.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => text(x, 80)))].slice(0, 300) : [],
    /* schéma 14 (0.15.0): starší plán snímek zásoby nemá (null) */
    snap: Array.isArray(raw.snap) ? normalizeSnap(raw.snap) : null,
    open: Array.isArray(raw.open) ? [...new Set(raw.open.filter((x): x is string => typeof x === 'string' && GOAL_KEY_RE.test(x)))].slice(0, 300) : [],
  };
}
/* Klíč cíle plánu: station:id, quest:id nebo project:id. */
export const GOAL_KEY_RE = /^(station|quest|project):[^\s].{0,79}$/;
const qty = (v: unknown) => clampInt(v || 0, 0, 999999);
function normalizeSnap(raw: unknown[]): RaidPlanSnap[] {
  const seen = new Set<string>();
  const out: RaidPlanSnap[] = [];
  for (const x of raw.filter(isObj).slice(0, 300)) {
    const mat = text(x.mat, 80).trim();
    if (!mat || seen.has(mat.toLowerCase())) continue;
    seen.add(mat.toLowerCase());
    out.push({ mat, have: qty(x.have), missing: qty(x.missing) });
  }
  return out;
}
/* Plán v záznamu raidu (schéma 14). Chybí nebo je vadný = záznam bez plánu (nic jiného se nemění). */
export function normalizePlanRecord(raw: unknown): { plan?: RaidPlanRecord } {
  if (!isObj(raw)) return {};
  const strs = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => text(x, len)).slice(0, max) : []);
  const seen = new Set<string>();
  const items: RaidPlanItem[] = [];
  for (const x of (Array.isArray(raw.items) ? raw.items : []).filter(isObj).slice(0, 300)) {
    const mat = text(x.mat, 80).trim();
    if (!mat || seen.has(mat.toLowerCase())) continue;
    seen.add(mat.toLowerCase());
    const need = qty(x.need);
    items.push({ mat, need, found: Math.min(need, qty(x.found)) });
  }
  const value = typeof raw.value === 'number' && Number.isFinite(raw.value) ? clampInt(raw.value, 0, 1e10) : null;
  return { plan: {
    at: clampInt(raw.at || 0, 0, 9e15), goals: strs(raw.goals, 50, 120), money: raw.money === true,
    map: MAPS.some(m => m.id === raw.map) ? String(raw.map) : '', loadout: text(raw.loadout, 24),
    items, done: strs(raw.done, 50, 120), value,
  } };
}

/* ----- zvýraznění bodů na mapě -----
   Průnik typů míst chybějících předmětů a typů míst, které hráč u bodu sám zadal (není to detektor lootu ani
   navigace), a body typu „cíl úkolu“, když má výběr úkol na této mapě. Úkol svítí i bez známého typu místa. */
export interface PoiHighlight { reason: 'area' | 'quest'; items: string[] }
export function highlightPois(pois: Pick<Poi, 'id' | 'type' | 'area'>[], rows: RaidRow[], questOnMap: boolean): Map<string, PoiHighlight> {
  const areas = neededAreas(rows);
  const out = new Map<string, PoiHighlight>();
  for (const p of pois) {
    const items = p.area ? areas.get(p.area as LootArea) : undefined;
    if (items?.length) out.set(p.id, { reason: 'area', items });
    else if (p.type === 'quest' && questOnMap) out.set(p.id, { reason: 'quest', items: [] });
  }
  return out;
}
/* Má výběr otevřený úkol s danou mapou? */
export function questsOnMap(s: AppState, goals: RaidGoals, mapId: string): boolean {
  return goals.quests.some(id => { const q = questById(id); return !!q && questStatus(q, s.quests.done) === 'active' && q.maps.includes(mapId); });
}

/* Krátké názvy cílů (stanice s cílovou úrovní, úkoly, projekty); peníze doplní UI. */
export function goalLabels(s: AppState, goals: RaidGoals, lang: Lang, today: string): string[] {
  const o = goalOptions(s, lang, today);
  return [
    ...goals.stations.map(id => o.stations.find(x => x.id === id)).filter((x): x is StationOption => !!x).map(x => `${x.name} ${x.level}`),
    ...goals.quests.map(questById).filter((q): q is NonNullable<typeof q> => !!q).map(q => questName(q, lang)),
    ...goals.projects.map(id => o.projects.find(x => x.id === id)?.label).filter((x): x is string => !!x),
  ];
}
