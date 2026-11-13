/* 0.17.0 (schéma 15): rádce „Co dál?“. Každé pravidlo platí jen s daty, která ho podporují (kladný i záporný
   případ), pořadí podle priority, skrytí do změny podmínky, odložení, migrace a akce store. */
import { describe, expect, it } from 'vitest';
import {
  ADVISOR_MAX, ADVISOR_RULES, advisorLine, advisorTips, dismissTip, emptyAdvisor, hiddenTips, normalizeAdvisor, restoreAllTips,
  restoreTip, snoozeTip, visibleTips, weekDaysLeft, type AdvisorRule, type AdvisorTip,
} from '../../src/core/advisor';
import { defaultState, normalize, normalizeRaid, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { RELAY_ACTIONS } from '../../src/store/relay';
import { QUESTS, questStatus } from '../../src/core/quests';
import { emptyGoals, listSig, raidList } from '../../src/core/raidPrep';
import { applyVisionImport } from '../../src/core/visionImport';
import { normalizeStashSlots } from '../../src/core/visionState';
import { SKILL } from '../../src/core/data/skills';
import { isoWeek } from '../../src/core/util';
import { LINE_KEYS } from '../../src/i18n/opsLines';
import { sayLine } from '../../src/core/opsVoice';
import { tl, type Key } from '../../src/i18n';
import type { AppState, RaidPlan } from '../../src/core/types';

/* čtvrtek 12. 11. 2026 v poledne: do konce týdne Trials zbývají 4 dny */
const NOW = new Date(2026, 10, 12, 12, 0).getTime();
const DAY = 86_400_000;
const GEAR2 = { 'Power Cable': 3, 'Electrical Components': 5, 'Hornet Driver': 5 };
const SKILL_ID = Object.keys(SKILL)[0];

/* Hráč s daty (ne úplně nový): level 10, Gear Bench 1. */
function base(over: Partial<AppState> = {}): AppState {
  const s = defaultState(NOW);
  s.profile.level = 10;
  s.profile.rounds = 5;
  s.stations.gear = 1;
  return Object.assign(s, over);
}
const tips = (s: AppState, now = NOW) => advisorTips(s, now, 'cs');
const of = (s: AppState, rule: AdvisorRule, now = NOW): AdvisorTip[] => tips(s, now).filter(x => x.rule === rule);
const one = (s: AppState, rule: AdvisorRule, now = NOW): AdvisorTip => {
  const l = of(s, rule, now);
  expect(l, rule).toHaveLength(1);
  return l[0];
};
const text = (m: AdvisorTip['title']) => tl('cs', m.key, m.params);
const plan = (over: Partial<RaidPlan> = {}): RaidPlan => ({
  goals: { ...emptyGoals(), stations: ['gear'] }, map: 'dam', loadout: '', route: '', startedAt: NOW - 3_600_000, sig: '', found: [], snap: null, open: [], ...over,
});
/* aktivní úkol s předměty k odevzdání (data ARC Tracker) */
const DELIVER = QUESTS.find(q => questStatus(q, {}) === 'active' && q.deliver.length > 0)!;
const deliverStock = () => Object.fromEntries([...DELIVER.deliver, ...DELIVER.questItems].map(([m, n]) => [m, n]));

describe('pravidla rádce', () => {
  it('upgrade: všechen materiál a nic neblokuje; chybí kus nebo blokuje požadavek = nic', () => {
    const tip = one(base({ inventory: { ...GEAR2 } }), 'upgrade');
    expect(tip).toMatchObject({ id: 'upgrade:gear', key: 'gear:2', score: 88, target: { kind: 'route', route: 'workshop' }, tone: 'success' });
    expect(text(tip.title)).toBe('Vylepši Gear Bench na 2');
    expect(of(base({ inventory: { ...GEAR2, 'Hornet Driver': 4 } }), 'upgrade')).toEqual([]);
    /* Outpost 1 vyžaduje level 18: s materiálem, ale na levelu 10 je blokovaný */
    const outpost = { Planks: 3, 'Sheet Metal': 5, 'ARC Alloy': 10, 'Advanced Electrical Components': 3 };
    expect(of(base({ inventory: outpost }), 'upgrade').map(x => x.id)).not.toContain('upgrade:outpost');
    /* stanice jako cíl (Material Planner) má vyšší prioritu */
    const s = base({ inventory: { ...GEAR2 } });
    s.planner.stations = { gear: 2 };
    expect(one(s, 'upgrade').score).toBe(92);
  });

  it('evaluate: raid s lootem nebo zaškrtnuté nálezy bez vyhodnocení v deníku; uložené vyhodnocení nebo nic = ne', () => {
    const p = plan();
    const withRaid = base({ raidPlan: p, raids: [normalizeRaid({ id: 'r1', ts: NOW, map: 'dam', loot: [{ name: 'Power Cable', qty: 2 }] })] });
    const tip = one(withRaid, 'evaluate');
    expect(tip).toMatchObject({ score: 95, target: { kind: 'action', action: 'evaluateRaid', route: 'raid' } });
    expect(text(tip.title)).toBe('Vyhodnoť raid na Dam Battlegrounds');
    expect(text(tip.reason)).toContain('loot');
    /* nálezy z overlaye bez raidu */
    const found = one(base({ raidPlan: plan({ found: ['Power Cable', 'Hornet Driver'] }) }), 'evaluate');
    expect(found.key).toBe(`${p.startedAt}::2`);
    expect(text(found.detail)).toBe('Zaškrtnuté 2 nálezy; spočítám, co ještě chybí.');
    /* vyhodnocení už je v deníku */
    const saved = base({ raidPlan: p, raids: [normalizeRaid({ id: 'r1', ts: NOW, map: 'dam', loot: [{ name: 'Power Cable', qty: 2 }], plan: { at: p.startedAt, goals: [], map: 'dam', items: [] } })] });
    expect(of(saved, 'evaluate')).toEqual([]);
    /* raid před spuštěním plánu ani raid bez lootu se nepočítají */
    expect(of(base({ raidPlan: p, raids: [normalizeRaid({ id: 'r0', ts: p.startedAt - 1000, map: 'dam', loot: [{ name: 'Fabric', qty: 1 }] })] }), 'evaluate')).toEqual([]);
    expect(of(base({ raidPlan: p, raids: [normalizeRaid({ id: 'r1', ts: NOW, map: 'dam' })] }), 'evaluate')).toEqual([]);
    expect(of(base({ raidPlan: p }), 'evaluate')).toEqual([]);
  });

  it('stale: seznam plánu se od spuštění změnil; stejný seznam nebo plán bez otisku = nic', () => {
    const s = base({ inventory: { 'Power Cable': 1 } });
    s.raidPlan = plan({ sig: listSig(raidList(s, plan().goals, 'cs', '2026-11-12')) });
    expect(of(s, 'stale')).toEqual([]);
    s.inventory['Power Cable'] = 2;
    const tip = one(s, 'stale');
    expect(tip).toMatchObject({ score: 55, target: { kind: 'action', action: 'startPlan', route: 'raid' } });
    expect(text(tip.detail)).toContain('11 ks');
    expect(of(base({ raidPlan: plan({ sig: '' }) }), 'stale')).toEqual([]);
    /* s raidem k vyhodnocení se zastaralost neukazuje (zásoba se po raidu změnit má) */
    const ev = base({ inventory: { 'Power Cable': 3 }, raidPlan: plan({ sig: 'r00000000', found: ['Power Cable'] }) });
    expect(of(ev, 'stale')).toEqual([]);
    expect(of(ev, 'evaluate')).toHaveLength(1);
  });

  it('prep: bez plánu s výchozími cíli a doporučenou mapou; nový hráč, aktivní plán nebo nic k cíli = nic', () => {
    const tip = one(base(), 'prep');
    expect(tip).toMatchObject({ id: 'prep', score: 50, target: { kind: 'action', action: 'startPlan', route: 'raid' } });
    expect(text(tip.title)).toMatch(/^Připrav raid: /);
    expect(text(tip.reason)).toContain('skóre');
    expect(of(defaultState(NOW), 'prep')).toEqual([]);
    expect(of(base({ raidPlan: plan() }), 'prep')).toEqual([]);
    /* výchozí cíl (Gear Bench 2) má všechno: není co hledat, radí jen upgrade */
    expect(of(base({ inventory: { ...GEAR2 } }), 'prep')).toEqual([]);
    /* všechny stanice na maximu a žádný připnutý ani rozpracovaný úkol = žádné cíle */
    const max = base();
    for (const id of Object.keys(max.stations)) max.stations[id] = 99;
    expect(of(normalize(max, NOW), 'prep')).toEqual([]);
  });

  it('skills: volné body jen u hráče, který skill tree vede', () => {
    const s = base();
    s.skills.current = { [SKILL_ID]: 1 };
    const tip = one(s, 'skills');
    expect(tip).toMatchObject({ key: '10', score: 60, target: { route: 'skills' } });
    expect(text(tip.title)).toBe('Rozdej 10 volných skill bodů');
    expect(text(tip.reason)).toBe('Rozpočet bodů 11, rozdáno 1.');
    expect(of(base(), 'skills')).toEqual([]);
    s.profile.level = 0;
    expect(of(s, 'skills')).toEqual([]);
  });

  it('trials: nedokončený týden jen u hráče, který Trials vede; zbývající dny zvedají prioritu', () => {
    expect(weekDaysLeft(NOW)).toBe(4);
    expect(weekDaysLeft(new Date(2026, 10, 9, 8).getTime())).toBe(7);
    expect(weekDaysLeft(new Date(2026, 10, 15, 23).getTime())).toBe(1);
    const s = base();
    s.trials.week = isoWeek(new Date(NOW));
    s.trials.stars = [3, 3, 0, 0, 0];
    const tip = one(s, 'trials');
    expect(tip).toMatchObject({ key: `${s.trials.week}:6`, score: 58, target: { route: 'trials' } });
    expect(text(tip.detail)).toBe('Zbývají 4 dny, chybí hvězd: 9.');
    const sunday = new Date(2026, 10, 15, 20).getTime();
    expect(one(s, 'trials', sunday)).toMatchObject({ score: 76, tone: 'amber' });
    expect(of({ ...s, trials: { ...s.trials, stars: [3, 3, 3, 3, 3] } }, 'trials')).toEqual([]);
    /* hráč Trials nevede (nic nezapsal, žádná historie) */
    expect(of({ ...s, trials: { ...s.trials, stars: [0, 0, 0, 0, 0] } }, 'trials')).toEqual([]);
    /* jen jméno výzvy stačí */
    expect(of({ ...s, trials: { ...s.trials, stars: [0, 0, 0, 0, 0], names: ['Hvězdy', '', '', '', ''] } }, 'trials')).toHaveLength(1);
    /* jiný týden (starší stav před přechodem týdne) */
    expect(of({ ...s, trials: { ...s.trials, week: '2026-W01' } }, 'trials')).toEqual([]);
  });

  it('deliver: připnutý úkol se všemi předměty k odevzdání v zásobě; chybí kus nebo nepřipnutý = nic', () => {
    const s = base({ inventory: deliverStock() });
    s.quests.pinned = [DELIVER.id];
    const tip = one(s, 'deliver');
    expect(tip).toMatchObject({ id: 'deliver:' + DELIVER.id, score: 85, target: { route: 'quests' } });
    expect(text(tip.detail)).toContain(DELIVER.trader);
    expect(of(base({ inventory: deliverStock() }), 'deliver')).toEqual([]);
    const short = base({ inventory: { ...deliverStock(), [DELIVER.deliver[0][0]]: DELIVER.deliver[0][1] - 1 } });
    short.quests.pinned = [DELIVER.id];
    expect(of(short, 'deliver')).toEqual([]);
    /* hotový úkol */
    s.quests.done = { [DELIVER.id]: NOW };
    expect(of(s, 'deliver')).toEqual([]);
  });

  it('stash: skoro plná nebo plná bedna podle čerstvé hlavičky STASH; bez snímku, starý snímek nebo místo = nic', () => {
    const s = base();
    s.vision.stash = { used: 250, max: 268, at: NOW - DAY };
    const tip = one(s, 'stash');
    expect(tip).toMatchObject({ score: 70, tone: 'amber', target: { route: 'inventory/cleanup' } });
    expect(text(tip.title)).toBe('Bedna je skoro plná: 250/268');
    s.vision.stash = { used: 268, max: 268, at: NOW - DAY };
    expect(one(s, 'stash')).toMatchObject({ score: 82, tone: 'danger' });
    expect(text(one(s, 'stash').title)).toBe('Bedna je plná: 268/268');
    s.vision.stash = { used: 200, max: 268, at: NOW - DAY };
    expect(of(s, 'stash')).toEqual([]);
    s.vision.stash = { used: 268, max: 268, at: NOW - 20 * DAY };
    expect(of(s, 'stash')).toEqual([]);
    expect(of(base(), 'stash')).toEqual([]);
  });

  it('cleanup: Úklid má přebytek a uvolní políčka; „vždy nechat“ nebo nic navíc = nic; plná bedna ho převezme', () => {
    const s = base({ items: { 'Ferro I': { key: 'Ferro I', name: 'Ferro', category: 'weapon', tier: 'I', count: 1 } } });
    const tip = one(s, 'cleanup');
    expect(tip).toMatchObject({ score: 35, target: { route: 'inventory/cleanup' } });
    expect(text(tip.title)).toBe('Úklid uvolní 1 políčko');
    const key = tip.key;
    expect(one({ ...s, items: { ...s.items, 'Anvil I': { key: 'Anvil I', name: 'Anvil', category: 'weapon', tier: 'I', count: 1 } } }, 'cleanup').key).not.toBe(key);
    expect(of({ ...s, advice: { keep: { 'Ferro I': true } } }, 'cleanup')).toEqual([]);
    expect(of(base(), 'cleanup')).toEqual([]);
    const full = structuredClone(s);
    full.vision.stash = { used: 260, max: 268, at: NOW };
    expect(of(full, 'cleanup')).toEqual([]);
    expect(text(one(full, 'stash').detail)).toBe('Úklid uvolní 1 políčko.');
  });

  it('backup: stará záloha, nebo žádný záznam u hráče s daty starými aspoň týden; čerstvá záloha nebo nový hráč = nic', () => {
    const s = base();
    s.advisor.backupAt = NOW - 20 * DAY;
    const tip = one(s, 'backup');
    expect(tip).toMatchObject({ key: String(NOW - 20 * DAY), score: 36, target: { kind: 'action', action: 'backup', route: 'settings' } });
    expect(text(tip.title)).toBe('Poslední záloha je stará 20 dní');
    s.advisor.backupAt = NOW - 3 * DAY;
    expect(of(s, 'backup')).toEqual([]);
    const none = base();
    none.meta.createdAt = NOW - 10 * DAY;
    expect(one(none, 'backup')).toMatchObject({ key: '0', score: 30 });
    expect(text(one(none, 'backup').title)).toBe('Ulož si zálohu');
    expect(of(base(), 'backup')).toEqual([]);
    const fresh = defaultState(NOW - 30 * DAY);
    expect(of(fresh, 'backup')).toEqual([]);
  });

  it('goal: termín do 3 dnů nebo po termínu; vzdálený termín, bez termínu nebo splněný cíl = nic', () => {
    const g = (id: string, due: string, doneAt = 0) => ({ id, title: 'Cíl ' + id, note: '', priority: 2 as const, due, createdAt: 0, doneAt, doneRaid: '', link: { kind: 'manual' as const, target: 1, progress: 0 } });
    const s = base({ goals: [g('a', '2026-11-13'), g('b', '2026-11-15'), g('c', '2026-11-20'), g('d', '2026-11-10'), g('e', ''), g('f', '2026-11-12', 5)] });
    const list = of(s, 'goal');
    expect(list.map(x => [x.id, x.score])).toEqual([['goal:d', 80], ['goal:a', 78], ['goal:b', 65]]);
    expect(text(list[0].title)).toBe('Cíl po termínu: Cíl d');
    expect(text(list[0].detail)).toBe('Termín uplynul před 2 dny.');
    expect(text(list[1].detail)).toBe('Zbývá 1 den.');
    expect(list[0].key).toBe('2026-11-10:late');
    expect(list.every(x => x.target.route === 'dashboard/goals')).toBe(true);
  });
});

describe('pořadí, hlášky a texty', () => {
  function busy(): AppState {
    const s = base({ inventory: { ...GEAR2 }, raidPlan: plan({ found: ['Power Cable'] }) });
    s.skills.current = { [SKILL_ID]: 1 };
    s.advisor.backupAt = NOW - 30 * DAY;
    s.vision.stash = { used: 268, max: 268, at: NOW };
    return s;
  }
  it('seřazeno podle priority, při shodě podle pořadí pravidel', () => {
    const l = tips(busy());
    expect(l.map(x => x.rule)).toEqual(['evaluate', 'upgrade', 'stash', 'skills', 'backup']);
    for (let i = 1; i < l.length; i++) expect(l[i - 1].score).toBeGreaterThanOrEqual(l[i].score);
    expect(advisorLine(l)).toEqual(l[0].line);
    expect(advisorLine([])).toBeNull();
    /* stejná priorita: dřívější pravidlo v ADVISOR_RULES první */
    const s = base({ goals: [{ id: 'g', title: 'X', note: '', priority: 2, due: '2026-11-10', createdAt: 0, doneAt: 0, doneRaid: '', link: { kind: 'manual', target: 1, progress: 0 } }] });
    s.vision.stash = { used: 268, max: 268, at: NOW };
    s.raidPlan = plan({ found: ['A'] });
    expect(tips(s).map(x => x.rule).slice(0, 3)).toEqual(['evaluate', 'stash', 'goal']);
  });
  it('každý tip má hlášku Opse s variantami v obou jazycích a texty ze slovníku', () => {
    const all = [...tips(busy()), ...tips(base({ items: { 'Ferro I': { key: 'Ferro I', name: 'Ferro', category: 'weapon', tier: 'I', count: 1 } } }))];
    const s = base();
    s.trials.week = isoWeek(new Date(NOW)); s.trials.stars = [1, 0, 0, 0, 0];
    all.push(...tips(s));
    expect(new Set(all.map(x => x.rule)).size).toBeGreaterThanOrEqual(8);
    for (const tip of all) {
      expect(LINE_KEYS).toContain(tip.line.line);
      for (const lang of ['cs', 'en'] as const) for (const mode of ['plain', 'friendly', 'cheeky'] as const) {
        const said = sayLine(tip.line, mode, lang);
        expect(said, `${tip.id} ${lang} ${mode}`).not.toMatch(/\{\w+(:\w+)?\}/);
      }
      for (const m of [tip.title, tip.detail, tip.reason]) for (const lang of ['cs', 'en'] as const) {
        const s2 = tl(lang, m.key, m.params);
        expect(s2, m.key).not.toBe(m.key);
        expect(s2, m.key).not.toMatch(/\{\w+(:\w+)?\}/);
      }
      expect(tl('cs', `advisor.rule.${tip.rule}` as Key)).not.toBe(`advisor.rule.${tip.rule}`);
    }
    for (const r of ADVISOR_RULES) expect(LINE_KEYS.some(k => k.startsWith('advisor.' + r))).toBe(true);
  });
});

describe('skrytí a odložení', () => {
  const s = base({ inventory: { ...GEAR2 } });
  const tip = one(s, 'upgrade');
  it('skrytý tip se vrátí, až se změní klíč podmínky', () => {
    const st = emptyAdvisor();
    expect(dismissTip(st, tip.id, tip.key, NOW)).toBe(true);
    expect(dismissTip(st, tip.id, tip.key, NOW)).toBe(false);
    expect(visibleTips([tip], st, NOW)).toEqual([]);
    expect(hiddenTips([tip], st, NOW)).toEqual([{ tip, hidden: 'dismissed' }]);
    expect(visibleTips([{ ...tip, key: 'gear:3' }], st, NOW)).toHaveLength(1);
    expect(restoreTip(st, tip.id)).toBe(true);
    expect(restoreTip(st, tip.id)).toBe(false);
    expect(visibleTips([tip], st, NOW)).toHaveLength(1);
  });
  it('odložený tip je skrytý do uplynutí doby (1–30 dní)', () => {
    const st = emptyAdvisor();
    snoozeTip(st, tip.id, 1, NOW);
    expect(st.snoozed[tip.id]).toBe(NOW + DAY);
    expect(visibleTips([tip], st, NOW + DAY - 1)).toEqual([]);
    expect(hiddenTips([tip], st, NOW)).toEqual([{ tip, hidden: 'snoozed' }]);
    expect(visibleTips([tip], st, NOW + DAY)).toHaveLength(1);
    snoozeTip(st, tip.id, 400, NOW);
    expect(st.snoozed[tip.id]).toBe(NOW + 30 * DAY);
    /* prošlá odložení se při další úpravě odmažou */
    snoozeTip(st, 'skills', 1, NOW + 31 * DAY);
    expect(Object.keys(st.snoozed)).toEqual(['skills']);
    expect(restoreAllTips(st)).toBe(true);
    expect(restoreAllTips(st)).toBe(false);
  });
  it('neplatné id se odmítne a záznamů je nejvýš ADVISOR_MAX', () => {
    const st = emptyAdvisor();
    expect(dismissTip(st, 'Bad Id', 'k', NOW)).toBe(false);
    expect(snoozeTip(st, '__proto__', 1, NOW)).toBe(false);
    for (let i = 0; i < ADVISOR_MAX + 20; i++) dismissTip(st, 'goal:g' + i, 'k', NOW);
    expect(Object.keys(st.dismissed)).toHaveLength(ADVISOR_MAX);
    expect(st.dismissed['goal:g0']).toBeUndefined();
    expect(st.dismissed['goal:g' + (ADVISOR_MAX + 19)]).toBe('k');
  });
});

describe('schéma 15: migrace, záloha a store', () => {
  it('starší stav (schéma 14) dostane prázdný rádce, neznámou bednu a kartu „Co dál?“ hned za ukazateli', () => {
    expect(SCHEMA).toBe(16);
    const s = normalize({ schema: 14, profile: { level: 20 }, vision: { lastImportAt: 3 }, dashboard: { hidden: { raids: true }, order: ['raids', 'kpi', 'next'] } }, NOW);
    expect(s.schema).toBe(16);
    expect(s.advisor).toEqual(emptyAdvisor());
    expect(s.vision.stash).toBeNull();
    expect(s.opsPrefs.advisor).toBe(true);
    expect(s.dashboard.order.slice(0, 4)).toEqual(['raids', 'kpi', 'advisor', 'next']);
    expect(s.dashboard.hidden).toEqual({ raids: true });
    expect(normalize({ dashboard: { order: ['next'] } }, NOW).dashboard.order.slice(0, 2)).toEqual(['advisor', 'next']);
    expect(defaultState(NOW).dashboard.order.slice(0, 2)).toEqual(['kpi', 'advisor']);
    /* skrytá karta zůstane skrytá */
    expect(normalize({ dashboard: { hidden: { advisor: true }, order: ['kpi', 'advisor'] } }, NOW).dashboard.hidden).toEqual({ advisor: true });
  });
  it('normalizace zahodí vadné záznamy; záloha nese rádce i bednu beze změny', () => {
    expect(normalizeAdvisor({ dismissed: { 'upgrade:gear': 'gear:2', 'Bad Id': 'x', skills: 5 }, snoozed: { trials: NOW, x: 'a', goal: -1 }, backupAt: -5 }))
      .toEqual({ dismissed: { 'upgrade:gear': 'gear:2' }, snoozed: { trials: NOW }, backupAt: 0 });
    expect(normalizeStashSlots({ used: 300, max: 268 })).toBeNull();
    expect(normalizeStashSlots({ used: 10, max: null })).toBeNull();
    expect(normalizeStashSlots({ used: 10, max: 268, at: 5 })).toEqual({ used: 10, max: 268, at: 5 });
    const s = base();
    s.advisor = { dismissed: { 'upgrade:gear': 'gear:2' }, snoozed: { trials: NOW + DAY }, backupAt: NOW - DAY };
    s.vision.stash = { used: 200, max: 268, at: NOW };
    const p = parseBackup(makeBackup(s), NOW);
    if ('error' in p) throw new Error(p.error);
    expect(p.state.advisor).toEqual(s.advisor);
    expect(p.state.vision.stash).toEqual(s.vision.stash);
  });
  it('import ze snímku STASH zapíše obsazenost bedny jen s maximem z hlavičky', () => {
    const s = base();
    applyVisionImport(s, { rows: [], coins: null, zeroMissing: false, canZero: false, profile: null, slots: { used: 140, max: null } }, NOW);
    expect(s.vision.stash).toBeNull();
    applyVisionImport(s, { rows: [], coins: null, zeroMissing: false, canZero: false, profile: null, slots: { used: 240, max: 268 } }, NOW);
    expect(s.vision.stash).toEqual({ used: 240, max: 268, at: NOW });
    applyVisionImport(s, { rows: [], coins: null, zeroMissing: false, canZero: false, profile: null }, NOW + 1);
    expect(s.vision.stash).toEqual({ used: 240, max: 268, at: NOW });
  });

  async function makeApp(stored: AppState) {
    const kv = memoryKV();
    kv.setItem('arcops:state', JSON.stringify(stored));
    let t = NOW;
    let saved = '';
    const storage = { ...createBrowserStorage(kv, () => t), exportBackup: async (_n: string, c: string) => { saved = c; return true; } };
    const app = createApp(storage, { now: () => t, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    return { app, state: () => app.store.getState().state, tick: (ms: number) => { t += ms; }, saved: () => saved };
  }
  it('akce store: skrýt, odložit, vrátit; přes overlay jen akce ze seznamu', async () => {
    for (const n of ['advisorDismiss', 'advisorSnooze', 'advisorRestore', 'advisorRestoreAll']) expect(RELAY_ACTIONS as readonly string[]).toContain(n);
    const { app, state } = await makeApp(base({ inventory: { ...GEAR2 } }));
    app.actions.advisorDismiss('upgrade:gear', 'gear:2');
    expect(state().advisor.dismissed).toEqual({ 'upgrade:gear': 'gear:2' });
    app.actions.advisorSnooze('skills', 3);
    expect(state().advisor.snoozed).toEqual({ skills: NOW + 3 * DAY });
    app.actions.advisorDismiss('x'.repeat(500), 'k');
    expect(Object.keys(state().advisor.dismissed)).toEqual(['upgrade:gear']);
    app.actions.advisorRestore('upgrade:gear');
    expect(state().advisor.dismissed).toEqual({});
    app.actions.advisorRestoreAll();
    expect(state().advisor.snoozed).toEqual({});
  });
  it('záloha zapíše svůj čas (i do souboru); starší záloha ani reset ho nevrátí; reset Dashboardu vrátí tipy', async () => {
    const old = base();
    old.advisor.backupAt = NOW - 40 * DAY;
    const { app, state, tick, saved } = await makeApp(base());
    expect(await app.actions.exportBackup('a.json')).toBe(true);
    expect(state().advisor.backupAt).toBe(NOW);
    expect(JSON.parse(saved()).state.advisor.backupAt).toBe(NOW);
    tick(1000);
    expect(await app.actions.importState(old, '{}', 'app')).toBe(true);
    expect(state().advisor.backupAt).toBe(NOW);
    app.actions.advisorDismiss('skills', '3');
    expect(await app.actions.resetModule('dashboard')).toBe(true);
    expect(state().advisor).toEqual({ dismissed: {}, snoozed: {}, backupAt: NOW });
    expect(await app.actions.resetAll()).toBe(true);
    expect(state().advisor.backupAt).toBe(NOW);
  });
});
