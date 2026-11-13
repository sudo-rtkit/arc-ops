/* Import zálohy z původního deníku (formát v1). normalizeV1 je věrný převod funkce normalize z deníku;
   importV1 ji použije a výsledek rozdělí do schématu 2. Záloha bez pole „plan“ (starší verze deníku) dostane Solo Looter. */
import type { AppState, Raid, ReportRow } from './types';
import { clampInt, isObj, safeEntries } from './util';
import { SKILL, PLANS } from './data/skills';
import { STATIONS } from './data/stations';
import { MAPS } from './data/maps';
import { NEXT_STEPS, RAID_CHECK } from './data/checklists';
import { defaultState, emptyRaidExtras, normalize, raidCheckId, RAID_TEMPLATE_ID } from './state';
import { totalPoints } from './skills';
import { uid } from './util';
import { t, type Key, type Lang } from '../i18n';

export interface DiaryV1 {
  v: 1;
  profile: { level: number; coins: number; rounds: number; expBonus: number; rewardPass: number };
  skills: { cur: Record<string, number>; showPlan: boolean; plan: string };
  stations: Record<string, number>;
  inv: Record<string, number>;
  steps: Record<string, true>;
  runs: { id: string; ts: number; map: string; route: string; ok: boolean; coins: number; min: number }[];
  trials: { week: string; stars: number[]; names: string[] };
  raid: Record<string, true>;
  amplified: number;
  updated: number;
}

export const DEFAULT_V1 = (): DiaryV1 => ({
  v: 1,
  profile: { level: 1, coins: 0, rounds: 0, expBonus: 0, rewardPass: 0 },
  skills: { cur: {}, showPlan: true, plan: 'runner' },
  stations: { gunsmith: 0, gear: 0, medical: 0, refiner: 0, utility: 0, explosives: 0, scrappy: 1, outpost: 0, research: 0 },
  inv: {},
  steps: {},
  runs: [],
  trials: { week: '', stars: [0, 0, 0, 0, 0], names: ['', '', '', '', ''] },
  raid: {},
  amplified: 0,
  updated: 0,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeV1(raw: any): DiaryV1 {
  const d = DEFAULT_V1();
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = d;
  if (r.profile && typeof r.profile === 'object') {
    out.profile.level = clampInt(r.profile.level ?? d.profile.level, 0, 75);
    out.profile.coins = clampInt(r.profile.coins ?? 0, 0, 1e10);
    out.profile.rounds = clampInt(r.profile.rounds ?? 0, 0, 100000);
    out.profile.expBonus = clampInt(r.profile.expBonus ?? 0, 0, 15);
    out.profile.rewardPass = clampInt(r.profile.rewardPass ?? 0, 0, 60);
  }
  if (r.skills && typeof r.skills === 'object') {
    const cur: Record<string, number> = {};
    for (const [k, v] of safeEntries(r.skills.cur)) {
      if (SKILL[k]) { const n = clampInt(v, 0, SKILL[k].max); if (n > 0) cur[k] = n; }
    }
    out.skills.cur = cur;
    out.skills.showPlan = r.skills.showPlan !== false;
    out.skills.plan = PLANS[r.skills.plan] ? r.skills.plan : 'runner';
  }
  if (r.stations && typeof r.stations === 'object') {
    for (const st of STATIONS) {
      if (r.stations[st.id] !== undefined) out.stations[st.id] = clampInt(r.stations[st.id], st.min, st.max);
    }
  }
  if (r.inv && typeof r.inv === 'object') {
    for (const [k, v] of safeEntries(r.inv)) { const n = clampInt(v, 0, 99999); if (n > 0) out.inv[String(k).slice(0, 80)] = n; }
  }
  if (r.steps && typeof r.steps === 'object') {
    for (const [k, v] of safeEntries(r.steps)) if (v === true && Number(k) >= 0 && Number(k) < NEXT_STEPS.length) out.steps[k] = true;
  }
  if (Array.isArray(r.runs)) {
    out.runs = r.runs.filter((x: any) => x && typeof x === 'object').slice(-400).map((x: any) => ({
      id: String(x.id || Math.random().toString(36).slice(2, 10)).slice(0, 24),
      ts: clampInt(x.ts || 0, 0, 9e15),
      map: MAPS.some(m => m.id === x.map) ? x.map : 'dam',
      route: String(x.route || '').slice(0, 24),
      ok: x.ok !== false,
      coins: clampInt(x.coins || 0, 0, 1e8),
      min: Math.max(0, Math.min(120, Number(x.min) || 0)),
    }));
  }
  if (r.trials && typeof r.trials === 'object') {
    out.trials.week = String(r.trials.week || '').slice(0, 10);
    out.trials.stars = [0, 1, 2, 3, 4].map(i => clampInt((r.trials.stars || [])[i] || 0, 0, 3));
    out.trials.names = [0, 1, 2, 3, 4].map(i => String((r.trials.names || [])[i] || '').slice(0, 80));
  }
  if (r.raid && typeof r.raid === 'object') {
    for (const [k, v] of safeEntries(r.raid)) if (v === true && Number(k) >= 0 && Number(k) < RAID_CHECK.length) out.raid[k] = true;
  }
  out.amplified = clampInt(r.amplified || 0, 0, 99);
  out.updated = clampInt(r.updated || 0, 0, 9e15);
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* Záloha deníku: v === 1, nebo (u ručně upravených) typická pole v1 bez schématu 2. */
export function isDiaryV1(raw: unknown): boolean {
  if (!isObj(raw)) return false;
  if (raw.schema !== undefined) return false;
  if (raw.v === 1) return true;
  return ['inv', 'runs', 'raid'].some(k => k in raw) && ('profile' in raw || 'skills' in raw);
}

export interface ImportReport { rows: ReportRow[]; ok: boolean; notes: string[] }

const sumValues = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const fmtN = (n: number) => String(n);

/* lang = jazyk nového stavu (výchozí obsah, jako jsou kroky a checklist, vznikne v něm). */
export function importV1(raw: unknown, now: number = Date.now(), lang: Lang = 'cs'): { state: AppState; report: ImportReport } {
  const notes: string[] = [];
  const r = isObj(raw) ? raw : {};
  const v1 = normalizeV1(raw);
  const hasPlanField = isObj(r.skills) && 'plan' in r.skills;
  if (!hasPlanField) {
    v1.skills.plan = 'looter';
    notes.push(t('import.note.noPlan'));
  }

  const s = defaultState(now, lang);
  s.meta.importedFrom = { source: 'denik-v1', at: now };
  s.meta.updatedAt = v1.updated || 0;
  s.profile = { ...s.profile, ...v1.profile, amplified: v1.amplified };
  s.skills.current = { ...v1.skills.cur };
  s.skills.showPlan = v1.skills.showPlan;
  s.skills.activePlan = v1.skills.plan;
  if (totalPoints(v1.skills.cur) > 0) {
    s.skills.builds.push({ id: uid(), name: t('import.build.name'), note: t('import.build.note'), points: { ...v1.skills.cur } });
  }
  s.stations = { ...v1.stations };
  s.inventory = { ...v1.inv };
  s.steps = s.steps.map((st, i) => ({ ...st, done: !!v1.steps[i] }));
  s.raids = v1.runs.map((x): Raid => ({ id: x.id, ts: x.ts, map: x.map, type: 'money', route: x.route, ok: x.ok, coins: x.ok ? x.coins : 0, min: x.min, notes: '', ...emptyRaidExtras() }));
  const zeroed = v1.runs.filter(x => !x.ok && x.coins > 0).length;
  if (zeroed) notes.push(t('import.note.zeroed', { count: zeroed }));
  s.trials = { ...s.trials, week: v1.trials.week, stars: [...v1.trials.stars], names: [...v1.trials.names] };
  for (const k of Object.keys(v1.raid)) s.checklists.checked[raidCheckId(Number(k))] = true;
  s.checklists.active = RAID_TEMPLATE_ID;

  const state = normalize(s, now);

  const src = {
    level: v1.profile.level, coins: v1.profile.coins, rounds: v1.profile.rounds, rp: v1.profile.rewardPass, exp: v1.profile.expBonus,
    skill: totalPoints(v1.skills.cur), mats: Object.keys(v1.inv).length, matSum: sumValues(v1.inv), stationSum: sumValues(v1.stations),
    runs: v1.runs.length, okRuns: v1.runs.filter(x => x.ok).length, stars: v1.trials.stars.reduce((a, b) => a + b, 0),
    steps: Object.keys(v1.steps).length, raid: Object.keys(v1.raid).length, amp: v1.amplified,
  };
  const dst = {
    level: state.profile.level, coins: state.profile.coins, rounds: state.profile.rounds, rp: state.profile.rewardPass, exp: state.profile.expBonus,
    skill: totalPoints(state.skills.current), mats: Object.keys(state.inventory).length, matSum: sumValues(state.inventory),
    stationSum: sumValues(state.stations), runs: state.raids.length, okRuns: state.raids.filter(x => x.ok).length,
    stars: state.trials.stars.reduce((a, b) => a + b, 0), steps: state.steps.filter(x => x.done).length,
    raid: Object.keys(state.checklists.checked).length, amp: state.profile.amplified,
  };
  const labels = (['level', 'coins', 'rounds', 'exp', 'rp', 'skill', 'stationSum', 'mats', 'matSum', 'runs', 'okRuns', 'stars', 'steps', 'raid', 'amp'] as const)
    .map(k => [k, `import.row.${k}`] as [keyof typeof src, Key]);
  const rows: ReportRow[] = labels.map(([k, label]) => ({ label: t(label), source: fmtN(src[k]), value: fmtN(dst[k]) }));
  rows.push({ label: t('import.row.plan'), source: hasPlanField ? String(r.skills && (r.skills as Record<string, unknown>).plan) : '—', value: PLANS[state.skills.activePlan]?.name || state.skills.activePlan });
  rows.push({ label: t('import.row.week'), source: v1.trials.week || '—', value: state.trials.week || '—' });
  const ok = labels.every(([k]) => src[k] === dst[k]);
  return { state, report: { rows, ok, notes } };
}
