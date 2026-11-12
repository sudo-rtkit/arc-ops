/* Statistiky raidů. runStats je věrný převod z původního deníku; ostatní funkce jsou nové. */
import type { Raid, RaidType } from './types';
import { dayKey } from './util';
import { t } from '../i18n';

type RunLike = Pick<Raid, 'route' | 'ok' | 'coins' | 'min'>;

export interface RouteStats { route: string; n: number; ok: number; coins: number; min: number; perHour: number; rate: number }
export interface RunStats {
  n: number; ok: number; rate: number; coins: number; minutes: number; perHour: number; avg: number;
  routes: RouteStats[];
}

/* Coiny se počítají jen z úspěšných runů, minuty ze všech. */
export function runStats(runs: RunLike[]): RunStats {
  const n = runs.length;
  const ok = runs.filter(r => r.ok).length;
  const coins = runs.reduce((a, r) => a + (r.ok ? r.coins : 0), 0);
  const minutes = runs.reduce((a, r) => a + (r.min || 0), 0);
  const perHour = minutes > 0 ? Math.round(coins / minutes * 60) : 0;
  const byRoute: Record<string, { route: string; n: number; ok: number; coins: number; min: number }> = {};
  for (const r of runs) {
    const k = r.route || '—';
    if (!byRoute[k]) byRoute[k] = { route: k, n: 0, ok: 0, coins: 0, min: 0 };
    const b = byRoute[k]; b.n++; if (r.ok) { b.ok++; b.coins += r.coins; } b.min += r.min || 0;
  }
  const routes = Object.values(byRoute)
    .map(b => Object.assign(b, { perHour: b.min > 0 ? Math.round(b.coins / b.min * 60) : 0, rate: b.n ? b.ok / b.n : 0 }))
    .sort((a, b) => b.perHour - a.perHour);
  return { n, ok, rate: n ? ok / n : 0, coins, minutes, perHour, avg: ok ? Math.round(coins / ok) : 0, routes };
}

export interface GroupStats { key: string; n: number; ok: number; coins: number; min: number; perHour: number; rate: number; avg: number }

/* Stejné počty jako runStats, seskupené podle libovolného klíče (mapa, typ, trasa). */
export function groupStats(raids: Raid[], keyOf: (r: Raid) => string): GroupStats[] {
  const groups: Record<string, Raid[]> = {};
  for (const r of raids) (groups[keyOf(r)] ||= []).push(r);
  return Object.entries(groups).map(([key, list]) => {
    const s = runStats(list);
    return { key, n: s.n, ok: s.ok, coins: s.coins, min: s.minutes, perHour: s.perHour, rate: s.rate, avg: s.avg };
  }).sort((a, b) => b.perHour - a.perHour || b.coins - a.coins);
}

export interface RaidFilter { from?: number; to?: number; type?: RaidType | ''; map?: string }

export function filterRaids(raids: Raid[], f: RaidFilter): Raid[] {
  return raids.filter(r =>
    (f.from === undefined || r.ts >= f.from) && (f.to === undefined || r.ts <= f.to) &&
    (!f.type || r.type === f.type) && (!f.map || r.map === f.map));
}

/* Nejlepší a nejhorší úspěšný run podle coinů. */
export function bestWorst(raids: Raid[]): { best: Raid | null; worst: Raid | null } {
  const ok = raids.filter(r => r.ok);
  if (!ok.length) return { best: null, worst: null };
  return {
    best: ok.reduce((a, r) => (r.coins > a.coins ? r : a)),
    worst: ok.reduce((a, r) => (r.coins < a.coins ? r : a)),
  };
}

export interface DayPoint { day: string; n: number; ok: number; coins: number; min: number; total: number }

/* Denní řada: počet raidů, výdělek dne a průběžný součet. */
export function dailySeries(raids: Raid[]): DayPoint[] {
  const days: Record<string, DayPoint> = {};
  for (const r of raids.slice().sort((a, b) => a.ts - b.ts)) {
    const d = (days[dayKey(r.ts)] ||= { day: dayKey(r.ts), n: 0, ok: 0, coins: 0, min: 0, total: 0 });
    d.n++; d.min += r.min || 0;
    if (r.ok) { d.ok++; d.coins += r.coins; }
  }
  let total = 0;
  return Object.values(days).sort((a, b) => a.day.localeCompare(b.day)).map(d => ({ ...d, total: (total += d.coins) }));
}

export const RAID_TYPE_IDS: RaidType[] = ['money', 'quest', 'trials', 'arc', 'pvp', 'other'];
/* Typy s názvem v aktuálním jazyce. */
export const raidTypes = (): [RaidType, string][] => RAID_TYPE_IDS.map(k => [k, t(`raidType.${k}`)]);
export const raidTypeName = (k: string): string => t(`raidType.${(RAID_TYPE_IDS as string[]).includes(k) ? k as RaidType : 'other'}`);

/* ----- 0.15.0: které mapy pomáhají s cíli (raidy s uloženým plánem) -----
   Počítá se jen z raidů s plánem v deníku a jen u map, kde nějaký je. Malý vzorek se označí (little) a do
   bodování map v přípravě se historie započítá až od PLAN_MIN_SAMPLE raidů. Úspěch = z plánu se našlo vše,
   nebo raid dokončil aspoň jeden požadavek (např. materiál na další úroveň stanice). */
export const PLAN_MIN_SAMPLE = 3;
export interface MapPlanStats { map: string; n: number; found: number; avg: number; ok: number; rate: number; little: boolean }
export const planSuccess = (p: NonNullable<Raid['plan']>): boolean =>
  p.done.length > 0 || (p.items.length > 0 && p.items.every(i => i.found >= i.need));
export function planMapStats(raids: Pick<Raid, 'map' | 'plan'>[]): MapPlanStats[] {
  const by: Record<string, MapPlanStats> = {};
  for (const r of raids) {
    if (!r.plan) continue;
    const b = (by[r.map] ||= { map: r.map, n: 0, found: 0, avg: 0, ok: 0, rate: 0, little: true });
    b.n++;
    b.found += r.plan.items.reduce((a, i) => a + Math.min(i.need, i.found), 0);
    if (planSuccess(r.plan)) b.ok++;
  }
  return Object.values(by)
    .map(b => ({ ...b, avg: Math.round(b.found / b.n * 10) / 10, rate: b.ok / b.n, little: b.n < PLAN_MIN_SAMPLE }))
    .sort((a, b) => Number(a.little) - Number(b.little) || b.avg - a.avg || b.n - a.n);
}
