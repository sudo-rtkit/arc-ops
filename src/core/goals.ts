/* Goal Tracker: progres cílů z uživatelských dat a jejich splnění. */
import type { AppState, Goal, GoalKind, GoalLink } from './types';
import { clampInt, isObj, text, uid } from './util';
import { SKILL } from './data/skills';
import { STATIONS } from './data/stations';
import { totalPoints } from './skills';
import { starSum } from './week';
import { t } from '../i18n';

export const GOAL_KIND_IDS: GoalKind[] = ['manual', 'level', 'station', 'skill', 'coins', 'material', 'trials'];
/* Názvy v aktuálním jazyce (čte se při každém volání, ne jednou při načtení modulu). */
export const goalKinds = (): [GoalKind, string][] => GOAL_KIND_IDS.map(k => [k, t(`goal.kind.${k}`)]);
export const goalKindName = (k: string): string => t(`goal.kind.${(GOAL_KIND_IDS as string[]).includes(k) ? k as GoalKind : 'manual'}`);
export const priorityName = (p: number): string => t(p === 1 ? 'goal.priority.1' : p === 3 ? 'goal.priority.3' : 'goal.priority.2');
export const SKILL_TOTAL = '*';

type GoalView = Pick<AppState, 'profile' | 'stations' | 'skills' | 'inventory' | 'trials'>;

export interface GoalProgress { value: number; target: number; ratio: number; met: boolean; label: string }

/* Aktuální hodnota a cíl. Vlastní progres zadává uživatel, ostatní se čtou ze stavu. */
export function goalProgress(g: Goal, s: GoalView): GoalProgress {
  const l = g.link;
  let value = 0, target = 1, label = '';
  switch (l.kind) {
    case 'manual': value = l.progress; target = l.target; label = t('goal.label.manual'); break;
    case 'level': value = s.profile.level; target = l.level; label = t('goal.label.level', { n: l.level }); break;
    case 'station': {
      const st = STATIONS.find(x => x.id === l.station);
      value = s.stations[l.station] || 0; target = l.level; label = t('goal.label.station', { station: st?.name || l.station, n: l.level }); break;
    }
    case 'skill':
      if (l.skill === SKILL_TOTAL) { value = totalPoints(s.skills.current); label = t('goal.label.skillTotal', { n: l.points }); }
      else { value = s.skills.current[l.skill] || 0; label = t('goal.label.skill', { skill: SKILL[l.skill]?.name || l.skill, n: l.points }); }
      target = l.points; break;
    case 'coins': value = s.profile.coins; target = l.amount; label = t('goal.label.coins', { n: l.amount }); break;
    case 'material': value = s.inventory[l.mat] || 0; target = l.qty; label = t('goal.label.material', { n: l.qty, mat: l.mat }); break;
    case 'trials': value = starSum(s.trials.stars); target = l.stars; label = t('goal.label.trials', { n: l.stars }); break;
  }
  target = Math.max(1, target);
  return { value, target, ratio: Math.min(1, value / target), met: value >= target, label };
}

export const isDone = (g: Goal): boolean => g.doneAt > 0;

/* Propojené cíle se při splnění podmínky označí jako splněné. Zpětně se samy neotevírají
   (utracené mince nebo spotřebovaný materiál nemažou to, že cíl byl splněn). Vrací počet nově splněných. */
export function syncGoals(s: AppState, now: number): number {
  let n = 0;
  for (const g of s.goals) {
    if (isDone(g) || g.link.kind === 'manual') continue;
    if (goalProgress(g, s).met) { g.doneAt = now; n++; }
  }
  return n;
}

/* Řazení: otevřené před splněnými, priorita, termín (bez termínu na konec), vznik. */
export function sortGoals(goals: Goal[]): Goal[] {
  return goals.slice().sort((a, b) =>
    Number(isDone(a)) - Number(isDone(b)) || a.priority - b.priority ||
    (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt);
}

/* Počet dní do termínu podle místního data; záporné = po termínu. null = bez termínu. */
export function daysLeft(due: string, now: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const [y, m, d] = due.split('-').map(Number);
  const t = new Date(now);
  const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
}

function normalizeLink(raw: unknown): GoalLink {
  const l = isObj(raw) ? raw : {};
  switch (l.kind) {
    case 'level': return { kind: 'level', level: clampInt(l.level ?? 1, 1, 75) };
    case 'station': {
      const st = STATIONS.find(x => x.id === l.station) || STATIONS[0];
      return { kind: 'station', station: st.id, level: clampInt(l.level ?? st.max, Math.max(1, st.min), st.max) };
    }
    case 'skill': {
      const skill = l.skill === SKILL_TOTAL || SKILL[String(l.skill)] ? String(l.skill) : SKILL_TOTAL;
      const max = skill === SKILL_TOTAL ? 200 : SKILL[skill].max;
      return { kind: 'skill', skill, points: clampInt(l.points ?? 1, 1, max) };
    }
    case 'coins': return { kind: 'coins', amount: clampInt(l.amount ?? 1, 1, 1e10) };
    case 'material': return { kind: 'material', mat: text(l.mat, 80).trim() || 'Metal Parts', qty: clampInt(l.qty ?? 1, 1, 99999) };
    case 'trials': return { kind: 'trials', stars: clampInt(l.stars ?? 15, 1, 15) };
    default: {
      const target = clampInt(l.target ?? 1, 1, 1e9);
      return { kind: 'manual', target, progress: clampInt(l.progress ?? 0, 0, target) };
    }
  }
}

export function normalizeGoal(x: Record<string, unknown>, now = 0): Goal {
  const p = clampInt(x.priority ?? 2, 1, 3) as 1 | 2 | 3;
  const due = typeof x.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.due) ? x.due : '';
  return {
    id: text(x.id || uid(), 24), title: text(x.title, 120).trim() || t('goal.defaultTitle'), note: text(x.note, 2000),
    priority: p, due, createdAt: clampInt(x.createdAt || now, 0, 9e15),
    doneAt: clampInt(x.doneAt || 0, 0, 9e15), doneRaid: text(x.doneRaid, 24),
    link: normalizeLink(x.link),
  };
}

export function normalizeGoals(raw: unknown, now = 0): Goal[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter(isObj).slice(0, 500).map(x => normalizeGoal(x, now)).map(g => {
    if (seen.has(g.id)) g.id = uid() + seen.size;
    seen.add(g.id);
    return g;
  });
}
