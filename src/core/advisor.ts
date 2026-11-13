/* Rádce „Co dál?“ (0.17.0). Jeden seřazený seznam dalších kroků (tipů) z aktuálního stavu. Čisté funkce nad stavem,
   žádný DOM ani React. Každé pravidlo platí jen tehdy, když ho podporují data, která hráč zadal; nic se neodhaduje:
   - upgrade: na další úroveň stanice je všechen materiál a nic ji neblokuje;
   - evaluate: aktivní plán má zapsaný raid (loot) nebo zaškrtnuté nálezy, ale vyhodnocení ještě není v deníku;
   - stale: seznam aktivního plánu se od spuštění změnil (zásoba nebo cíle);
   - prep: bez aktivního plánu, s výchozími cíli z kompaktu, kterým něco chybí, s doporučenou mapou;
   - skills: volné skill body (jen když hráč skill tree vede);
   - trials: týden Weekly Trials není dokončený (jen když hráč Trials vede), se zbývajícími dny týdne;
   - deliver: připnutý úkol, jehož všechny předměty k odevzdání jsou v zásobě;
   - stash: bedna skoro plná nebo plná podle hlavičky posledního snímku STASH (nejvýš STASH_FRESH_DAYS dní starého);
   - cleanup: Úklid má co prodat nebo recyklovat a uvolní políčka;
   - backup: poslední záloha je stará, nebo o žádné záloze aplikace neví (jen u hráče s daty);
   - goal: otevřený cíl s termínem do GOAL_SOON_DAYS dní, nebo po termínu;
   - review (0.20.0): fronta „Ke kontrole“ z automatického snímání není prázdná.
   Texty jsou odkazy do slovníku (MsgRef), hlášky Opse odkazy do OPS_LINES (LineRef), takže se vykreslí v aktuálním
   jazyce a povaze okna, které je ukáže. Skrytí (dismiss) platí, dokud se nezmění klíč podmínky (key); odložení
   (snooze) do daného času. */
import type { AdvisorState, AppState, Lang } from './types';
import { getStations } from './gamedata';
import { nextNeeds, readiness } from './workshop';
import { budget, totalPoints } from './skills';
import { starSum } from './week';
import { clampInt, dayKey, isObj, isoWeek, safeEntries, text } from './util';
import { daysLeft, isDone } from './goals';
import { questById, questName, questStatus } from './quests';
import { haveOf, isFreshProfile } from './compact';
import { adviseAll, cleanupRows, cleanupSummary, type Advice } from './advice';
import { defaultGoals, hasGoals, listSig, raidList, recommendedMap, scoreMaps } from './raidPrep';
import { planRaid, savedRaid } from './raidEval';
import { STATIONS } from './data/stations';
import { MAPS } from './data/maps';
import { line, type LineRef } from './opsVoice';
import { msg, type MsgRef } from '../i18n';

export type AdvisorRule = 'upgrade' | 'evaluate' | 'stale' | 'prep' | 'skills' | 'trials' | 'deliver' | 'stash' | 'cleanup' | 'backup' | 'goal' | 'review';
export const ADVISOR_RULES: readonly AdvisorRule[] = ['upgrade', 'evaluate', 'stale', 'prep', 'skills', 'trials', 'deliver', 'stash', 'cleanup', 'backup', 'goal', 'review'];
/* Kam tip vede: modul (#modul/podsekce), nebo akce, která se provede v modulu (spustit plán, vyhodnotit raid,
   uložit zálohu). Zálohu umí jen hlavní okno (overlay ji otevře v aplikaci). */
export type AdvisorAction = 'startPlan' | 'evaluateRaid' | 'backup';
export type AdvisorTarget = { kind: 'route'; route: string } | { kind: 'action'; action: AdvisorAction; route: string };
export type AdvisorTone = 'success' | 'accent' | 'amber' | 'danger';
export interface AdvisorTip {
  /* stálé id podle předmětu tipu (upgrade:gear, goal:<id>, trials …); pod ním se tip skrývá a odkládá */
  id: string;
  rule: AdvisorRule;
  /* priorita 0–100 (vyšší = důležitější) a čitelný důvod priority */
  score: number;
  reason: MsgRef;
  title: MsgRef;
  detail: MsgRef;
  target: AdvisorTarget;
  /* klíč podmínky: skrytý tip se vrátí, až se změní */
  key: string;
  tone: AdvisorTone;
  /* hláška Opse k tipu (varianta a povaha v okně, které ji řekne) */
  line: LineRef;
}

export const STASH_NEAR = 0.9;
export const STASH_FRESH_DAYS = 14;
export const BACKUP_OLD_DAYS = 14;
/* bez záznamu o záloze se tip ukáže až hráči, který aplikaci používá aspoň tolik dní */
export const BACKUP_NEW_DAYS = 7;
export const GOAL_SOON_DAYS = 3;
export const SNOOZE_DAYS_MAX = 30;
/* nejvýš tolik záznamů skrytí a odložení (nejstarší se odmažou) */
export const ADVISOR_MAX = 300;
const DAY = 86_400_000;

/* Krátký otisk textu pro klíč podmínky. */
export function hashKey(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/* Dní do konce týdne Trials (týden podle ISO, končí v neděli o půlnoci místního času): pondělí 7, neděle 1. */
export const weekDaysLeft = (now: number): number => 7 - ((new Date(now).getDay() + 6) % 7);

/* Vede hráč Weekly Trials (zapsal hvězdy, názvy výzev, nebo má historii)? */
const tracksTrials = (s: AppState): boolean => s.trials.history.length > 0 || s.trials.stars.some(x => x > 0) || s.trials.names.some(n => n.trim() !== '');

const STATION_MINS: Record<string, number> = Object.fromEntries(STATIONS.map(s => [s.id, s.min]));
const mapName = (id: string): string => MAPS.find(m => m.id === id)?.name ?? id;

export interface AdvisorOptions {
  /* rada Úklidu, pokud už je spočítaná (store ji má v odvozených hodnotách) */
  advice?: Map<string, Advice>;
}

/* Všechny platné tipy, seřazené od nejdůležitějšího (bez ohledu na skrytí a odložení). */
export function advisorTips(s: AppState, now: number, lang: Lang, opts: AdvisorOptions = {}): AdvisorTip[] {
  const out: AdvisorTip[] = [];
  const today = dayKey(now);
  const fresh = isFreshProfile(s, STATION_MINS);
  const stations = getStations(s.gameData);

  /* ----- upgrade připravený ----- */
  const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
  const chosen = new Set([...Object.keys(s.planner.stations), ...s.goals.filter(g => !isDone(g) && g.link.kind === 'station').map(g => (g.link as { station: string }).station)]);
  for (const n of nextNeeds(view, stations)) {
    if (n.block || !n.mats.length || readiness(s.inventory, n.mats) < 1) continue;
    const picked = chosen.has(n.station.id);
    out.push({
      id: 'upgrade:' + n.station.id, rule: 'upgrade', score: picked ? 92 : 88, tone: 'success',
      reason: msg(picked ? 'advisor.why.upgradeGoal' : 'advisor.why.upgrade'),
      title: msg('advisor.upgrade.title', { station: n.station.name, level: n.level }),
      detail: msg('advisor.upgrade.detail', { count: n.mats.length }),
      target: { kind: 'route', route: 'workshop' }, key: `${n.station.id}:${n.level}`,
      line: line('advisor.upgrade', { station: n.station.name, level: n.level }),
    });
  }

  /* ----- plán raidu ----- */
  const plan = s.raidPlan;
  if (plan) {
    const name = mapName(plan.map);
    const raid = planRaid(s, plan);
    const captured = !!raid && raid.loot.length > 0;
    const evaluate = !savedRaid(s, plan) && (captured || plan.found.length > 0);
    if (evaluate) {
      out.push({
        id: 'evaluate', rule: 'evaluate', score: 95, tone: 'accent',
        reason: msg(captured ? 'advisor.why.evaluateRaid' : 'advisor.why.evaluateFound', { count: plan.found.length }),
        title: msg('advisor.evaluate.title', { map: name }),
        detail: msg(captured ? 'advisor.evaluate.detailRaid' : 'advisor.evaluate.detailFound', { count: plan.found.length }),
        target: { kind: 'action', action: 'evaluateRaid', route: 'raid' }, key: `${plan.startedAt}:${raid?.id ?? ''}:${plan.found.length}`,
        line: line('advisor.evaluate', { map: name }),
      });
    } else {
      const rows = raidList(s, plan.goals, lang, today);
      if (plan.sig && listSig(rows) !== plan.sig) {
        const units = rows.reduce((a, r) => a + r.missing, 0);
        out.push({
          id: 'stale', rule: 'stale', score: 55, tone: 'amber',
          reason: msg('advisor.why.stale'),
          title: msg('advisor.stale.title', { map: name }),
          detail: msg('advisor.stale.detail', { count: units }),
          target: { kind: 'action', action: 'startPlan', route: 'raid' }, key: `${plan.startedAt}:${listSig(rows)}`,
          line: line('advisor.stale', { map: name }),
        });
      }
    }
  } else if (!fresh) {
    const goals = defaultGoals(s, lang);
    if (hasGoals(goals)) {
      const best = recommendedMap(scoreMaps(s, goals, lang));
      const rows = raidList(s, goals, lang, today);
      const units = rows.reduce((a, r) => a + r.missing, 0);
      /* jen když je pro výchozí cíle co hledat (připravený upgrade řeší pravidlo upgrade) */
      if (best && !best.locked && units > 0) {
        out.push({
          id: 'prep', rule: 'prep', score: 50, tone: 'accent',
          reason: msg('advisor.why.prep', { score: best.score }),
          title: msg('advisor.prep.title', { map: best.name }),
          detail: msg('advisor.prep.detail', { count: units }),
          target: { kind: 'action', action: 'startPlan', route: 'raid' }, key: `${best.id}:${listSig(rows)}`,
          line: line('advisor.prep', { map: best.name, count: units }),
        });
      }
    }
  }

  /* ----- volné skill body (jen když hráč skill tree vede) ----- */
  const used = totalPoints(s.skills.current);
  const free = budget(s.profile) - used;
  if (used > 0 && free > 0) {
    out.push({
      id: 'skills', rule: 'skills', score: 60, tone: 'accent',
      reason: msg('advisor.why.skills', { budget: budget(s.profile), used }),
      title: msg('advisor.skills.title', { count: free }),
      detail: msg('advisor.skills.detail'),
      target: { kind: 'route', route: 'skills' }, key: String(free),
      line: line('advisor.skills', { count: free }),
    });
  }

  /* ----- Weekly Trials ----- */
  if (tracksTrials(s) && s.trials.week === isoWeek(new Date(now))) {
    const sum = starSum(s.trials.stars);
    if (sum < 15) {
      const days = weekDaysLeft(now);
      out.push({
        id: 'trials', rule: 'trials', score: 40 + (7 - days) * 6, tone: days <= 2 ? 'amber' : 'accent',
        reason: msg('advisor.why.trials', { count: days }),
        title: msg('advisor.trials.title', { stars: sum }),
        detail: msg('advisor.trials.detail', { count: days, left: 15 - sum }),
        target: { kind: 'route', route: 'trials' }, key: `${s.trials.week}:${sum}`,
        line: line('advisor.trials', { count: days, left: 15 - sum }),
      });
    }
  }

  /* ----- připnutý úkol připravený k odevzdání ----- */
  for (const id of s.quests.pinned) {
    const q = questById(id);
    if (!q || questStatus(q, s.quests.done) !== 'active') continue;
    const need = [...q.deliver, ...q.questItems];
    if (!need.length || !need.every(([m, n]) => haveOf(s, m) >= n)) continue;
    const name = questName(q, lang);
    out.push({
      id: 'deliver:' + q.id, rule: 'deliver', score: 85, tone: 'success',
      reason: msg('advisor.why.deliver', { count: need.length }),
      title: msg('advisor.deliver.title', { name }),
      detail: msg('advisor.deliver.detail', { trader: q.trader }),
      target: { kind: 'route', route: 'quests' }, key: q.id,
      line: line('advisor.deliver', { name, trader: q.trader }),
    });
  }

  /* ----- bedna a úklid ----- */
  const sl = s.vision.stash;
  const stashFull = !!sl && sl.max > 0 && now - sl.at <= STASH_FRESH_DAYS * DAY && sl.used / sl.max >= STASH_NEAR;
  const clean = cleanupRows((opts.advice ?? adviseAll(s, today, lang)).values());
  const sum = cleanupSummary(clean);
  if (stashFull && sl) {
    const over = sl.used >= sl.max;
    out.push({
      id: 'stash', rule: 'stash', score: over ? 82 : 70, tone: over ? 'danger' : 'amber',
      reason: msg('advisor.why.stash', { at: dayKey(sl.at) }),
      title: msg(over ? 'advisor.stash.titleFull' : 'advisor.stash.title', { used: sl.used, max: sl.max }),
      detail: sum.items > 0 ? msg('advisor.stash.detailClean', { count: sum.slots }) : msg('advisor.stash.detail'),
      target: { kind: 'route', route: 'inventory/cleanup' }, key: `${sl.used}/${sl.max}:${sl.at}`,
      line: line('advisor.stash', { used: sl.used, max: sl.max }),
    });
  } else if (sum.items > 0 && sum.slots > 0) {
    out.push({
      id: 'cleanup', rule: 'cleanup', score: 35, tone: 'accent',
      reason: msg('advisor.why.cleanup', { sell: sum.sell, recycle: sum.recycle }),
      title: msg('advisor.cleanup.title', { count: sum.slots }),
      detail: msg('advisor.cleanup.detail', { count: sum.items }),
      target: { kind: 'route', route: 'inventory/cleanup' }, key: hashKey(clean.map(r => r.key).sort().join('|')),
      line: line('advisor.cleanup', { count: sum.slots }),
    });
  }

  /* ----- 0.20.0: fronta „Ke kontrole“ z automatického snímání ----- */
  const review = s.review?.length ?? 0;
  if (review > 0) {
    out.push({
      id: 'review', rule: 'review', score: 62, tone: 'amber',
      reason: msg('advisor.why.review'),
      title: msg('advisor.review.title', { count: review }), detail: msg('advisor.review.detail'),
      target: { kind: 'route', route: 'journal' }, key: hashKey(s.review.map(x => x.id).join('|')),
      line: line('advisor.review', { count: review }),
    });
  }

  /* ----- záloha ----- */
  const b = s.advisor.backupAt;
  if (b > 0) {
    const days = Math.floor((now - b) / DAY);
    if (days >= BACKUP_OLD_DAYS) {
      out.push({
        id: 'backup', rule: 'backup', score: 30 + Math.min(20, days - BACKUP_OLD_DAYS), tone: 'amber',
        reason: msg('advisor.why.backup', { count: BACKUP_OLD_DAYS }),
        title: msg('advisor.backup.titleOld', { count: days }), detail: msg('advisor.backup.detail'),
        target: { kind: 'action', action: 'backup', route: 'settings' }, key: String(b),
        line: line('advisor.backup', { count: days }),
      });
    }
  } else if (!fresh && now - s.meta.createdAt >= BACKUP_NEW_DAYS * DAY) {
    out.push({
      id: 'backup', rule: 'backup', score: 30, tone: 'amber',
      reason: msg('advisor.why.backupNone'),
      title: msg('advisor.backup.titleNone'), detail: msg('advisor.backup.detail'),
      target: { kind: 'action', action: 'backup', route: 'settings' }, key: '0',
      line: line('advisor.backupNone'),
    });
  }

  /* ----- cíle s blízkým termínem nebo po termínu ----- */
  for (const g of s.goals) {
    if (isDone(g)) continue;
    const left = daysLeft(g.due, now);
    if (left === null || left > GOAL_SOON_DAYS) continue;
    const late = left < 0;
    out.push({
      id: 'goal:' + g.id, rule: 'goal', score: late ? 80 : left <= 1 ? 78 : 65, tone: late ? 'danger' : 'amber',
      reason: msg(late ? 'advisor.why.goalLate' : 'advisor.why.goalSoon', { count: GOAL_SOON_DAYS }),
      title: msg(late ? 'advisor.goal.titleLate' : 'advisor.goal.title', { title: g.title }),
      detail: late ? msg('advisor.goal.ago', { count: -left }) : left === 0 ? msg('advisor.goal.today') : msg('advisor.goal.left', { count: left }),
      target: { kind: 'route', route: 'dashboard/goals' }, key: `${g.due}:${late ? 'late' : 'soon'}`,
      line: line(late ? 'advisor.goalLate' : 'advisor.goal', { title: g.title, count: Math.abs(left) }),
    });
  }

  /* pořadí: priorita, pak pravidlo (stálé pořadí), pak id */
  const order = (r: AdvisorRule) => ADVISOR_RULES.indexOf(r);
  return out.sort((a, b) => b.score - a.score || order(a.rule) - order(b.rule) || a.id.localeCompare(b.id));
}

/* ----- skrytí a odložení ----- */
export type TipHidden = 'dismissed' | 'snoozed' | null;
export function hiddenState(tip: Pick<AdvisorTip, 'id' | 'key'>, st: AdvisorState, now: number): TipHidden {
  if ((st.snoozed[tip.id] ?? 0) > now) return 'snoozed';
  if (Object.hasOwn(st.dismissed, tip.id) && st.dismissed[tip.id] === tip.key) return 'dismissed';
  return null;
}
export const visibleTips = (tips: AdvisorTip[], st: AdvisorState, now: number): AdvisorTip[] => tips.filter(x => hiddenState(x, st, now) === null);
export const hiddenTips = (tips: AdvisorTip[], st: AdvisorState, now: number): { tip: AdvisorTip; hidden: Exclude<TipHidden, null> }[] =>
  tips.flatMap(tip => { const h = hiddenState(tip, st, now); return h ? [{ tip, hidden: h }] : []; });

/* Hláška Opse k nejdůležitějšímu tipu (null = nic k radě). */
export const advisorLine = (tips: AdvisorTip[]): LineRef | null => tips[0]?.line ?? null;

export const emptyAdvisor = (): AdvisorState => ({ dismissed: {}, snoozed: {}, backupAt: 0 });
export const TIP_ID_RE = /^[a-z]{1,20}(:[^\s]{1,100})?$/;
export function normalizeAdvisor(raw: unknown): AdvisorState {
  const r = isObj(raw) ? raw : {};
  const out = emptyAdvisor();
  for (const [k, v] of safeEntries(r.dismissed).slice(-ADVISOR_MAX)) if (TIP_ID_RE.test(k) && typeof v === 'string') out.dismissed[k] = text(v, 200);
  for (const [k, v] of safeEntries(r.snoozed).slice(-ADVISOR_MAX)) if (TIP_ID_RE.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out.snoozed[k] = clampInt(v, 0, 9e15);
  out.backupAt = clampInt(r.backupAt || 0, 0, 9e15);
  return out;
}

/* Úprava stavu rádce (store): skrýt, odložit, vrátit. Prošlá odložení se odmažou, záznamů je nejvýš ADVISOR_MAX.
   Vrací false, když se nic nezměnilo. */
function trim<T>(rec: Record<string, T>): void {
  const keys = Object.keys(rec);
  for (const k of keys.slice(0, Math.max(0, keys.length - ADVISOR_MAX))) delete rec[k];
}
const prune = (st: AdvisorState, now: number) => { for (const [k, v] of Object.entries(st.snoozed)) if (v <= now) delete st.snoozed[k]; };
export function dismissTip(st: AdvisorState, id: string, key: string, now: number): boolean {
  if (!TIP_ID_RE.test(id)) return false;
  const k = text(key, 200);
  prune(st, now);
  if (st.dismissed[id] === k) return false;
  delete st.dismissed[id];
  st.dismissed[id] = k;
  trim(st.dismissed);
  return true;
}
export function snoozeTip(st: AdvisorState, id: string, days: number, now: number): boolean {
  if (!TIP_ID_RE.test(id)) return false;
  prune(st, now);
  const until = now + clampInt(days, 1, SNOOZE_DAYS_MAX) * DAY;
  delete st.snoozed[id];
  st.snoozed[id] = until;
  trim(st.snoozed);
  return true;
}
export function restoreTip(st: AdvisorState, id: string): boolean {
  if (!TIP_ID_RE.test(id)) return false;
  const had = Object.hasOwn(st.dismissed, id) || Object.hasOwn(st.snoozed, id);
  delete st.dismissed[id]; delete st.snoozed[id];
  return had;
}
export function restoreAllTips(st: AdvisorState): boolean {
  const had = Object.keys(st.dismissed).length + Object.keys(st.snoozed).length > 0;
  st.dismissed = {}; st.snoozed = {};
  return had;
}
