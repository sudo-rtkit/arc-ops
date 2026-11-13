/* Pravidla skill tree a plány buildů. Funkce do „resetCost“ jsou věrný převod z původního deníku. */
import type { BranchId, CatalogBuild, PlanStep, Points, ReachStep, SavedBuild } from './types';
import { BRANCHES, PLANS, SKILL, SKILLS } from './data/skills';
import { BUILD_CATALOG } from './data/builds';
import { getLang, t } from '../i18n';
import { safeEntries } from './util';

export interface BudgetSource { level: number; expBonus: number }

export function pointsIn(cur: Points, b: BranchId, opts?: { excludeEnd?: boolean; except?: string }): number {
  let n = 0;
  for (const s of SKILLS) {
    if (s.b !== b) continue;
    if (opts && opts.excludeEnd && s.t === 4) continue;
    if (opts && opts.except && s.id === opts.except) continue;
    n += cur[s.id] || 0;
  }
  return n;
}
export const totalPoints = (cur: Points): number => SKILLS.reduce((a, s) => a + (cur[s.id] || 0), 0);
export const budget = (profile: BudgetSource): number => (profile.level || 0) + 1 + (profile.expBonus || 0);
export const choiceTaken = (cur: Points, b: BranchId): boolean => SKILLS.some(s => s.b === b && s.t === 2 && (cur[s.id] || 0) > 0);
export const endTaken = (cur: Points, b: BranchId): number => SKILLS.filter(s => s.b === b && s.t === 4 && (cur[s.id] || 0) > 0).length;
export const resetCost = (cur: Points): number => totalPoints(cur) * 2000;

const startOf = (b: BranchId) => SKILLS.find(x => x.b === b && x.t === 0)!;

/* Proč nejde přidat bod (nebo null, když jde). */
export function addBlock(cur: Points, id: string, profile: BudgetSource): string | null {
  const s = SKILL[id];
  const have = cur[id] || 0;
  if (have >= s.max) return 'Maximum';
  if (totalPoints(cur) >= budget(profile)) return t('skill.block.noPoint');
  const start = startOf(s.b);
  if (s.t >= 1 && !(cur[start.id] > 0)) return t('skill.block.first', { name: start.name });
  if (s.t === 2) {
    if (choiceTaken(cur, s.b)) return t('skill.block.choiceTaken');
    if (pointsIn(cur, s.b) < 10) return t('skill.block.need10');
  }
  if (s.t === 3 && !choiceTaken(cur, s.b)) return t('skill.block.choiceFirst');
  if (s.t === 4) {
    const taken = endTaken(cur, s.b);
    if (taken >= 2) return t('skill.block.twoOfThree');
    const pts = pointsIn(cur, s.b);
    if (taken === 0 && pts < 30) return t('skill.block.need30');
    if (taken === 1 && pts < 40) return t('skill.block.need40');
  }
  return null;
}

/* Neplatné uzly po odebrání bodů. */
export function invalidNodes(cur: Points): Record<string, string> {
  const bad: Record<string, string> = {};
  for (const b of ['c', 'm', 's'] as BranchId[]) {
    const start = startOf(b);
    const hasStart = (cur[start.id] || 0) > 0;
    const noEnd = pointsIn(cur, b, { excludeEnd: true });
    for (const s of SKILLS.filter(x => x.b === b && (cur[x.id] || 0) > 0)) {
      if (s.t >= 1 && !hasStart) bad[s.id] = t('skill.bad.missing', { name: start.name });
      else if (s.t === 2 && pointsIn(cur, b, { except: s.id, excludeEnd: true }) < 10) bad[s.id] = t('skill.bad.lt10');
      else if (s.t === 3 && !choiceTaken(cur, b)) bad[s.id] = t('skill.bad.noChoice');
      else if (s.t === 4) {
        const ends = endTaken(cur, b);
        if (ends > 2) bad[s.id] = t('skill.bad.ends');
        else if (ends === 1 && noEnd < 30) bad[s.id] = t('skill.bad.lt30');
        else if (ends === 2 && noEnd + 1 < 40) bad[s.id] = t('skill.bad.lt40');
      }
    }
    const choices = SKILLS.filter(x => x.b === b && x.t === 2 && (cur[x.id] || 0) > 0);
    if (choices.length > 1) choices.forEach(x => { bad[x.id] = t('skill.bad.oneChoice'); });
  }
  return bad;
}

/* ----- plány ----- */
const isReach = (st: PlanStep): st is ReachStep => 'reach' in st;
const reachPts = (cur: Points, st: ReachStep): number => pointsIn(cur, st.reach, st.incl ? undefined : { excludeEnd: true });

export const BUILD_PREFIX = 'build:';

/* Build z katalogu jako plán: „catalog:<id>“ (76 bodů nebo build jen pro 91) a „catalog:<id>:91“ (varianta s Expedicemi). */
export const CATALOG_PREFIX = 'catalog:';
export interface CatalogRef { build: CatalogBuild; v91: boolean; points: Points }
export function catalogRef(key: string): CatalogRef | null {
  if (!key.startsWith(CATALOG_PREFIX)) return null;
  const [id, variant] = key.slice(CATALOG_PREFIX.length).split(':');
  const build = BUILD_CATALOG.find(b => b.id === id);
  if (!build) return null;
  if (variant === undefined) return { build, v91: !!build.only91, points: build.points };
  if (variant === '91' && build.variant91) return { build, v91: true, points: build.variant91 };
  return null;
}
export const catalogPlanKey = (b: CatalogBuild, v91 = false): string => (b.plan && !v91 ? b.plan : CATALOG_PREFIX + b.id + (v91 && b.variant91 ? ':91' : ''));
export const catalogSteps = (b: CatalogBuild, v91 = false): PlanStep[] =>
  (v91 && b.variant91 ? stepsFromBuild(b.variant91) : b.order || stepsFromBuild(b.points));

/* Platný klíč plánu: vestavěný plán, build z katalogu, nebo existující uložený build. */
export const isPlanKey = (key: string, builds: SavedBuild[] = []): boolean =>
  !!PLANS[key] || !!catalogRef(key) || (key.startsWith(BUILD_PREFIX) && builds.some(b => BUILD_PREFIX + b.id === key));

/* Kroky plánu podle klíče: vestavěný plán, build z katalogu, nebo uložený build („build:<id>“). */
export function planSteps(key: string, builds: SavedBuild[] = []): PlanStep[] {
  if (key.startsWith(BUILD_PREFIX)) {
    const b = builds.find(x => BUILD_PREFIX + x.id === key);
    if (b) return stepsFromBuild(b.points);
  }
  const c = catalogRef(key);
  if (c) return catalogSteps(c.build, c.v91 && !c.build.only91);
  return (PLANS[key] || PLANS.runner).steps;
}

export function planName(key: string, builds: SavedBuild[] = []): string {
  if (key.startsWith(BUILD_PREFIX)) {
    const b = builds.find(x => BUILD_PREFIX + x.id === key);
    if (b) return b.name;
  }
  const c = catalogRef(key);
  if (c) return c.build.name[getLang()] + (c.v91 && !c.build.only91 ? ' (91)' : '');
  return (PLANS[key] || PLANS.runner).name;
}

/* Cílový strom podle plánu (pro zobrazení cílů u uzlů). */
export function planTarget(cur: Points, steps: PlanStep[]): Points {
  const sim: Points = Object.assign({}, cur);
  const target: Points = Object.assign({}, cur);
  for (const st of steps) {
    if (!isReach(st)) { target[st.id] = Math.max(target[st.id] || 0, st.to); sim[st.id] = Math.max(sim[st.id] || 0, st.to); }
    else {
      let guard = 0;
      while (reachPts(sim, st) < st.n && guard++ < 60) {
        const pick = st.prefer.find(id => (sim[id] || 0) < SKILL[id].max);
        if (!pick) break;
        sim[pick] = (sim[pick] || 0) + 1; target[pick] = sim[pick];
      }
    }
  }
  return target;
}

export interface NextPoint { id: string; step: number; have: number; to: number; reach?: ReachStep }

/* Další doporučený bod podle plánu, nebo null, když je plán hotový. */
export function nextPlanPoint(cur: Points, steps: PlanStep[]): NextPoint | null {
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (!isReach(st)) {
      if ((cur[st.id] || 0) < st.to) return { id: st.id, step: i, have: cur[st.id] || 0, to: st.to };
    } else if (reachPts(cur, st) < st.n) {
      const pick = st.prefer.find(id => (cur[id] || 0) < SKILL[id].max);
      if (pick) return { id: pick, step: i, have: cur[pick] || 0, to: (cur[pick] || 0) + 1, reach: st };
    }
  }
  return null;
}

export interface PlanProgressItem { i: number; label: string; done: boolean; next: boolean; branch: BranchId }

/* Kroky plánu se stavem (hotovo / další / čeká). */
export function planProgress(cur: Points, steps: PlanStep[]): PlanProgressItem[] {
  const next = nextPlanPoint(cur, steps);
  return steps.map((st, i) => {
    const done = !isReach(st) ? (cur[st.id] || 0) >= st.to : reachPts(cur, st) >= st.n;
    const label = !isReach(st)
      ? (SKILL[st.id].max > 1 ? t('skill.step.to', { name: SKILL[st.id].name, n: st.to }) : SKILL[st.id].name)
      : t('skill.step.reach', { branch: BRANCHES.find(b => b.id === st.reach)!.name, n: st.n });
    return { i, label, done, next: !!next && next.step === i, branch: !isReach(st) ? SKILL[st.id].b : st.reach };
  });
}

/* ----- uložené buildy (nové, v deníku nebyly) ----- */

/* Pořadí rozdávání pro uložený build: větev s nejvíce body první, uvnitř větve po patrech. */
export function stepsFromBuild(points: Points): PlanStep[] {
  const order = BRANCHES.map(b => b.id).sort((a, b) => pointsIn(points, b) - pointsIn(points, a));
  const steps: PlanStep[] = [];
  for (const b of order) {
    for (let t = 0; t <= 4; t++) {
      for (const s of SKILLS) if (s.b === b && s.t === t && (points[s.id] || 0) > 0) steps.push({ id: s.id, to: Math.min(points[s.id], s.max) });
    }
  }
  return steps;
}

export interface BranchTotals { c: number; m: number; s: number }
export const branchTotals = (cur: Points): BranchTotals => ({ c: pointsIn(cur, 'c'), m: pointsIn(cur, 'm'), s: pointsIn(cur, 's') });

/* Jde se k součtům buildu dostat z aktuálního stromu bez resetu? (pravidlo ze starší verze deníku) */
export function fitsTotals(cur: Points, target: BranchTotals): boolean {
  const t = branchTotals(cur);
  return t.c <= target.c && t.m <= target.m && t.s <= target.s;
}

/* Totéž pro build s konkrétními skilly: žádný skill nesmí mít víc bodů, než chce cíl. */
export function fitsPoints(cur: Points, target: Points): boolean {
  return SKILLS.every(s => (cur[s.id] || 0) <= (target[s.id] || 0));
}

/* Ořízne body na platné skilly a rozsahy; nuly zahodí. */
export function cleanPoints(raw: unknown): Points {
  const out: Points = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of safeEntries(raw)) {
    const s = SKILL[k];
    if (!s) continue;
    const n = Math.min(s.max, Math.max(0, Math.round(Number(v)) || 0));
    if (n > 0) out[k] = n;
  }
  return out;
}
