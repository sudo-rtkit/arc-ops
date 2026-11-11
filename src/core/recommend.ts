/* Smart Recommendations: pravidla nad lokálními daty uživatele. Nic se nestahuje a nic se neodhaduje
   mimo zapsané údaje; každé doporučení nese důvody (why) s čísly, ze kterých vzniklo.
   Texty jsou klíče slovníku s parametry (msg); title, detail a why jsou tytéž texty v jazyce, ve kterém se doporučení
   spočítalo. UI vykresluje msg, takže po změně jazyka nezůstane nic v původním jazyce. */
import type { AppState } from './types';
import { getSources, getStations, routeLookup } from './gamedata';
import { nextNeeds, readiness } from './workshop';
import { planNeeds } from './planner';
import { daysLeft, goalProgress, isDone, priorityName } from './goals';
import { groupStats, runStats } from './runs';
import { loadoutStats, tallyItems } from './loadouts';
import { budget, nextPlanPoint, planName, planSteps, totalPoints } from './skills';
import { SKILL } from './data/skills';
import { mapStatus } from './maps';
import { starSum } from './week';
import { isoWeek } from './util';
import { MAPS } from './data/maps';
import { sourceLabel } from './gametext';
import { getLang, msg, tm, type MsgRef } from '../i18n';

export type RecTone = 'success' | 'accent' | 'amber' | 'danger';
export interface RecText { title: MsgRef; detail: MsgRef; why: MsgRef[] }
export interface Recommendation { id: string; title: string; detail: string; why: string[]; msg: RecText; href: string; tone: RecTone; score: number }
type RecInput = Omit<Recommendation, 'title' | 'detail' | 'why' | 'msg'> & RecText;

export const MIN_RUNS = 3;
const nf = (n: number) => Math.round(n);

export function recommend(s: AppState, now: number): Recommendation[] {
  const out: Recommendation[] = [];
  const lang = getLang();
  const push = ({ title, detail, why, ...rest }: RecInput) =>
    out.push({ ...rest, title: tm(title), detail: tm(detail), why: why.map(tm), msg: { title, detail, why } });
  const stations = getStations(s.gameData);
  const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
  const routeNames = Object.fromEntries(routeLookup(s.gameData, lang).map(r => [r.id, r.name]));
  const mapNames = Object.fromEntries(MAPS.map(m => [m.id, m.name]));

  /* 1. Upgrade, na který je všechen materiál a nic ho neblokuje. */
  for (const n of nextNeeds(view, stations)) {
    if (n.block || readiness(s.inventory, n.mats) < 1) continue;
    push({
      id: 'upgrade:' + n.station.id, tone: 'success', score: 90, href: '#workshop',
      title: msg('rec.upgrade.title', { station: n.station.name, level: n.level }), detail: msg('rec.upgrade.detail'),
      why: [msg('rec.upgrade.why', { items: n.mats.map(([m, q]) => msg('rec.upgrade.item', { q, mat: m, have: s.inventory[m] || 0 })) })],
    });
  }

  /* 2. Souběh požadavků z Material Planneru a nejvíc chybějící ARC díl. */
  const rows = planNeeds(view, s.planner, s.goals, stations, getSources(s.gameData));
  for (const r of rows.filter(x => x.contention).slice(0, 3)) {
    push({
      id: 'contention:' + r.mat, tone: 'amber', score: 75, href: '#inventory/planner',
      title: msg('rec.contention.title', { mat: r.mat }), detail: msg('rec.contention.detail', { n: nf(r.missing) }),
      why: [msg('rec.contention.why', { have: nf(r.have), need: nf(r.need) }), ...r.sources.map(x => msg('rec.source', { label: x.label, n: nf(x.qty) }))],
    });
  }
  const arc = rows.filter(r => r.arc && r.missing > 0)[0];
  if (arc) {
    push({
      id: 'hunt:' + arc.mat, tone: 'accent', score: 60, href: '#inventory/hunt',
      title: msg('rec.hunt.title', { src: sourceLabel(arc.mat, arc.src, lang).replace(/^ARC:?\s*/, '') }),
      detail: msg('rec.hunt.detail', { n: nf(arc.missing), mat: arc.mat }),
      why: [msg('rec.hunt.why', { need: nf(arc.need), have: nf(arc.have) }), msg('rec.hunt.for', { list: arc.sources.map(x => x.label).join(', ') })],
    });
  }

  /* 3. Volné skill body podle aktivního plánu. */
  const free = budget(s.profile) - totalPoints(s.skills.current);
  const nx = nextPlanPoint(s.skills.current, planSteps(s.skills.activePlan, s.skills.builds));
  if (free > 0 && nx) {
    push({
      id: 'skill', tone: 'accent', score: 70, href: '#skills',
      title: msg('rec.skill.title', { count: free }),
      detail: msg('rec.skill.detail', { plan: planName(s.skills.activePlan, s.skills.builds), skill: SKILL[nx.id]?.name || nx.id }),
      why: [msg('rec.skill.why', { budget: budget(s.profile), level: s.profile.level, exp: s.profile.expBonus, used: totalPoints(s.skills.current) })],
    });
  }

  /* 4. Cíle po termínu nebo s blízkým termínem. */
  for (const g of s.goals) {
    if (isDone(g)) continue;
    const left = daysLeft(g.due, now);
    if (left === null || left > 3) continue;
    const p = goalProgress(g, s);
    push({
      id: 'goal:' + g.id, tone: left < 0 ? 'danger' : 'amber', score: 85 - g.priority * 5 - Math.max(0, left), href: '#dashboard/goals',
      title: msg(left < 0 ? 'rec.goal.late' : 'rec.goal.soon', { title: g.title }),
      detail: left < 0 ? msg('rec.goal.ago', { count: -left }) : left === 0 ? msg('rec.goal.today') : msg('rec.goal.left', { count: left }),
      why: [msg('rec.goal.priority', { p: priorityName(g.priority).toLowerCase() }),
        msg('rec.goal.progress', { v: nf(Math.min(p.value, p.target)), t: nf(p.target), r: p.ratio })],
    });
  }

  /* 5. Trasy a loadouty podle vlastních výsledků (aspoň 3 raidy). */
  const money = s.raids.filter(r => r.type === 'money');
  const routes = runStats(money).routes.filter(r => r.route !== '—' && r.n >= MIN_RUNS && r.min > 0);
  if (routes.length >= 1) {
    const best = routes[0];
    push({
      id: 'route:best', tone: 'success', score: 55, href: '#money',
      title: msg('rec.route.best', { route: routeNames[best.route] || best.route }), detail: msg('rec.route.bestDetail', { n: nf(best.perHour) }),
      why: [msg('rec.route.bestWhy', { count: best.n, rate: best.rate, coins: nf(best.coins), min: nf(best.min) }),
        ...(routes[1] ? [msg('rec.route.next', { route: routeNames[routes[1].route] || routes[1].route, n: nf(routes[1].perHour) })] : [])],
    });
    for (const r of routes.filter(x => x.rate < 0.5)) {
      push({
        id: 'route:risky:' + r.route, tone: 'danger', score: 50, href: '#money',
        title: msg('rec.route.risky', { route: routeNames[r.route] || r.route }), detail: msg('rec.route.riskyDetail'),
        why: [msg('rec.route.riskyWhy', { rate: r.rate, count: r.n })],
      });
    }
  }
  const lstats = loadoutStats(s.raids).filter(l => l.id && l.n >= MIN_RUNS && s.loadouts.some(x => x.id === l.id));
  if (lstats.length >= 2) {
    const best = lstats.slice().sort((a, b) => b.rate - a.rate || b.perHour - a.perHour)[0];
    const name = s.loadouts.find(x => x.id === best.id)!.name;
    push({
      id: 'loadout:best', tone: 'success', score: 45, href: '#weapons/loadouts',
      title: msg('rec.loadout.best', { name }), detail: msg('rec.loadout.detail', { rate: best.rate }),
      why: lstats.map(l => msg('rec.loadout.why', { name: s.loadouts.find(x => x.id === l.id)!.name, count: l.n, rate: l.rate, n: nf(l.perHour) })),
    });
  }
  const maps = groupStats(s.raids.filter(r => r.min > 0), r => r.map).filter(g => g.n >= MIN_RUNS);
  if (maps.length >= 2) {
    push({
      id: 'map:best', tone: 'accent', score: 35, href: '#stats',
      title: msg('rec.map.best', { map: mapNames[maps[0].key] || maps[0].key }), detail: msg('rec.map.detail', { n: nf(maps[0].perHour) }),
      why: maps.slice(0, 3).map(g => msg('rec.map.why', { map: mapNames[g.key] || g.key, count: g.n, n: nf(g.perHour), rate: g.rate })),
    });
  }

  /* 6. Často ztrácená výbava. */
  const lost = tallyItems(s.raids, r => r.lost).filter(t => t.raids >= MIN_RUNS)[0];
  if (lost) {
    push({
      id: 'lost:' + lost.name, tone: 'amber', score: 40, href: '#stats',
      title: msg('rec.lost.title', { name: lost.name }), detail: msg('rec.lost.detail'),
      why: [msg('rec.lost.why', { qty: nf(lost.qty), count: lost.raids })],
    });
  }

  /* 7. Weekly Trials ke konci týdne. */
  const sum = starSum(s.trials.stars);
  const day = new Date(now).getDay() || 7;
  if (s.trials.week === isoWeek(new Date(now)) && sum < 15 && day >= 5) {
    push({
      id: 'trials', tone: 'amber', score: 50 + day, href: '#trials',
      title: msg('rec.trials.title'), detail: msg('rec.trials.detail', { count: 8 - day }),
      why: [msg('rec.trials.why', { sum })],
    });
  }

  /* 8. Mapa, která se brzy odemkne. */
  const nextMap = mapStatus(s.profile.rounds).find(m => !m.open);
  if (nextMap && nextMap.left <= 3) {
    push({
      id: 'map:unlock', tone: 'accent', score: 30, href: '#maps',
      title: msg('rec.unlock.title', { map: nextMap.map.name, count: nextMap.left }), detail: msg('rec.unlock.detail'),
      why: [msg('rec.unlock.why', { rounds: s.profile.rounds, need: nextMap.map.rounds })],
    });
  }

  /* 9. Loot zapsaný v raidech, který ještě není v Inventory. */
  const pending = s.raids.filter(r => r.loot.length && !r.lootApplied.length).length;
  if (pending) {
    push({
      id: 'loot', tone: 'accent', score: 65, href: '#journal',
      title: msg('rec.loot.title', { count: pending }), detail: msg('rec.loot.detail'),
      why: [msg('rec.loot.why', { count: pending })],
    });
  }

  if (!s.raids.length) {
    push({
      id: 'first-raid', tone: 'accent', score: 20, href: '#journal',
      title: msg('rec.first.title'), detail: msg('rec.first.detail'),
      why: [msg('rec.first.why', { n: MIN_RUNS })],
    });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
