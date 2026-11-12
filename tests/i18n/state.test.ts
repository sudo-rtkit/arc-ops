/* Volba jazyka ve stavu: zpětná kompatibilita (milník 1 a 2, deník v1, starší zálohy), výchozí jazyk a výchozí obsah. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup, backupFileName } from '../../src/core/backup';
import { importV1 } from '../../src/core/importV1';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { NEXT_STEPS, RAID_CHECK } from '../../src/core/data/checklists';
import { NEXT_STEPS_EN, RAID_CHECK_EN } from '../../src/core/data/en';
import { checkLabel, stepLabel, templateLabel } from '../../src/core/gametext';
import { getLang, setLang } from '../../src/i18n';
import { SAMPLE_V1 } from '../core/sample';

const NOW = new Date(2026, 10, 12, 12, 0).getTime();
const withoutLang = <T extends { settings: object }>(s: T) => ({ ...s, settings: { ...s.settings, lang: undefined } });

/* Stav z milníku 1 (bez cílů, plánovače, loadoutů a bez settings) a z milníku 2 (settings jen s autoSnapshot). */
const M1 = {
  schema: 2, meta: { createdAt: 1, updatedAt: 2, importedFrom: null },
  profile: { level: 30, coins: 50000, xp: 0, xpNext: 0, rounds: 40, expBonus: 3, rewardPass: 20, amplified: 1 },
  skills: { current: { c_used: 1 }, showPlan: true, activePlan: 'looter', builds: [] },
  steps: [{ id: 'n0', text: NEXT_STEPS[0], done: true }, { id: 'x1', text: 'Můj vlastní krok', done: false }],
  raids: [{ id: 'r1', ts: 5, map: 'dam', type: 'money', route: 'galleria', ok: true, coins: 1000, min: 10, notes: 'poznámka' }],
  checklists: { templates: [{ id: 'raid', name: 'Před raidem', items: [{ id: 'r0', text: RAID_CHECK[0] }, { id: 'u1', text: 'Vlastní bod' }] }], active: 'raid', checked: { r0: true }, routeChecks: {} },
};
const M2 = { ...M1, goals: [{ id: 'g', title: 'Cíl uživatele', link: { kind: 'level', level: 40 } }], planner: { stations: {}, items: [], includeGoals: true }, loadouts: [], settings: { autoSnapshot: false } };

afterEach(() => setLang('cs'));

describe('stav: pole settings.lang', () => {
  /* Pole lang schéma nezvedlo (0.3.0); schéma 3 přišlo s milníkem 3a (items, vision), 4 s úkoly (3b), 5 s radami, blueprinty, tier listem a projekty (milník 4). */
  it('schéma zvedly až milníky 3a, 3b a 4, ne pole lang', () => {
    expect(SCHEMA).toBe(13);
  });

  it('starší stav (milník 1 a 2) se načte beze ztrát a chybějící jazyk dostane výchozí hodnotu', () => {
    for (const raw of [M1, M2]) {
      const cs = normalize(raw, NOW);
      const en = normalize(raw, NOW, 'en');
      expect(cs.settings.lang).toBe('cs');
      expect(en.settings.lang).toBe('en');
      /* kromě jazyka je výsledek stejný: nic se nepřepsalo ani neztratilo */
      expect(withoutLang(en)).toEqual(withoutLang(cs));
      expect(en.steps).toEqual([{ id: 'n0', text: NEXT_STEPS[0], done: true }, { id: 'x1', text: 'Můj vlastní krok', done: false }]);
      expect(en.checklists.templates[0]).toEqual(M1.checklists.templates[0]);
      expect(en.raids[0].notes).toBe('poznámka');
    }
    expect(normalize(M2, NOW, 'en').settings.autoSnapshot).toBe(false);
    expect(normalize(M2, NOW, 'en').goals[0].title).toBe('Cíl uživatele');
  });

  it('uložená volba jazyka má přednost před výchozí', () => {
    expect(normalize({ ...M2, settings: { lang: 'cs' } }, NOW, 'en').settings.lang).toBe('cs');
    expect(normalize({ ...M2, settings: { lang: 'en' } }, NOW, 'cs').settings.lang).toBe('en');
    expect(normalize({ ...M2, settings: { lang: 'de' } }, NOW, 'en').settings.lang).toBe('en');
  });

  it('normalize je idempotentní i s jazykem', () => {
    const s = normalize(M2, NOW, 'en');
    expect(normalize(JSON.parse(JSON.stringify(s)), NOW, 'cs')).toEqual(s);
  });

  it('výchozí obsah vzniká v jazyce stavu, uložený obsah se nepřepisuje', () => {
    const en = defaultState(NOW, 'en');
    expect(en.steps.map(x => x.text)).toEqual(NEXT_STEPS_EN);
    expect(en.checklists.templates[0].name).toBe('Before the raid');
    expect(en.checklists.templates[0].items.map(i => i.text)).toEqual(RAID_CHECK_EN);
    expect(defaultState(NOW).steps.map(x => x.text)).toEqual(NEXT_STEPS);
    /* stav bez kroků (starší) dostane výchozí kroky v jazyce stavu */
    expect(normalize({ settings: { lang: 'en' } }, NOW).steps.map(x => x.text)).toEqual(NEXT_STEPS_EN);
  });
});

describe('zálohy a deník v1', () => {
  it('starší záloha aplikace (bez jazyka) převezme aktuální jazyk, data zůstanou', () => {
    const old = JSON.stringify({ app: 'arc-raiders-companion', schema: 2, exportedAt: '2026-11-10T10:00:00Z', state: M2 });
    const p = parseBackup(old, NOW, 'en');
    if ('error' in p) throw new Error(p.error);
    expect(p.state.settings.lang).toBe('en');
    expect(withoutLang(p.state)).toEqual(withoutLang(normalize(M2, NOW)));
    const p2 = parseBackup(old, NOW);
    expect('error' in p2 ? null : p2.state.settings.lang).toBe('cs');
  });

  it('nová záloha nese jazyk a po importu ho zachová', () => {
    const s = normalize({ ...M2, settings: { lang: 'en' } }, NOW);
    const p = parseBackup(makeBackup(s), NOW, 'cs');
    expect('error' in p ? null : p.state).toEqual(s);
  });

  it('deník v1: import zachová všechna data, výchozí kroky a checklist vzniknou v jazyce', () => {
    const cs = importV1(SAMPLE_V1, NOW, 'cs');
    const en = importV1(SAMPLE_V1, NOW, 'en');
    expect(en.report.ok).toBe(true);
    expect(en.report.rows.map(r => [r.source, r.value])).toEqual(cs.report.rows.map(r => [r.source, r.value]));
    expect(en.state.settings.lang).toBe('en');
    expect(en.state.steps.map(s => s.done)).toEqual(cs.state.steps.map(s => s.done));
    expect(en.state.steps.map(s => s.text)).toEqual(NEXT_STEPS_EN);
    expect(en.state.checklists.checked).toEqual(cs.state.checklists.checked);
    expect(en.state.raids).toEqual(cs.state.raids);
    expect(en.state.profile).toEqual(cs.state.profile);
    expect(en.state.inventory).toEqual(cs.state.inventory);
    const p = parseBackup(JSON.stringify(SAMPLE_V1), NOW, 'en');
    expect('error' in p ? null : p.state.settings.lang).toBe('en');
  });

  it('název souboru zálohy podle jazyka (bez diakritiky)', () => {
    const d = new Date(2026, 10, 12, 9, 5);
    expect(backupFileName(d)).toBe('arc-companion-zaloha-2026-11-12-0905.json');
    expect(backupFileName(d, 'en')).toBe('arc-companion-backup-2026-11-12-0905.json');
  });
});

describe('zobrazení uloženého výchozího obsahu', () => {
  it('výchozí krok a bod checklistu s nezměněným textem se zobrazí v aktuálním jazyce', () => {
    expect(stepLabel('n0', NEXT_STEPS[0], 'en')).toBe(NEXT_STEPS_EN[0]);
    expect(stepLabel('n0', NEXT_STEPS_EN[0], 'cs')).toBe(NEXT_STEPS[0]);
    expect(checkLabel('r3', RAID_CHECK[3], 'en')).toBe(RAID_CHECK_EN[3]);
    expect(templateLabel({ id: 'raid', name: 'Před raidem' }, 'en')).toBe('Before the raid');
  });
  it('upravený nebo vlastní text zůstane přesně, jak je uložený', () => {
    expect(stepLabel('n0', 'Upravený krok', 'en')).toBe('Upravený krok');
    expect(stepLabel('x1', NEXT_STEPS[0], 'en')).toBe(NEXT_STEPS[0]);
    expect(stepLabel('n1', NEXT_STEPS[0], 'en')).toBe(NEXT_STEPS[0]);
    expect(checkLabel('u1', 'Vlastní bod', 'en')).toBe('Vlastní bod');
    expect(templateLabel({ id: 'raid', name: 'Moje příprava' }, 'en')).toBe('Moje příprava');
    expect(templateLabel({ id: 'x', name: 'Před raidem' }, 'en')).toBe('Před raidem');
  });
});

describe('store: jazyk při startu, přepnutí a uložení', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('první spuštění bez uložené volby použije jazyk z navigator.language (předaný store)', async () => {
    const app = createApp(createBrowserStorage(memoryKV(), () => NOW), { now: () => NOW, lang: 'en' });
    await app.init();
    const s = app.store.getState().state;
    expect(s.settings.lang).toBe('en');
    expect(s.steps[0].text).toBe(NEXT_STEPS_EN[0]);
  });

  it('starší uložený stav bez volby dostane jazyk z navigator.language, s volbou zůstane', async () => {
    const kv = memoryKV();
    kv.setItem('arcops:state', JSON.stringify(M2));
    const a = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, lang: 'en' });
    await a.init();
    expect(a.store.getState().state.settings.lang).toBe('en');
    expect(a.store.getState().state.steps[0].text).toBe(NEXT_STEPS[0]);
    kv.setItem('arcops:state', JSON.stringify({ ...M2, settings: { lang: 'cs' } }));
    const b = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, lang: 'en' });
    await b.init();
    expect(b.store.getState().state.settings.lang).toBe('cs');
  });

  it('setLang se uloží a přežije nový start; obsah se nepřepíše', async () => {
    const kv = memoryKV();
    const a = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW });
    await a.init();
    const before = a.store.getState().state.steps;
    a.actions.setLang('en');
    expect(a.store.getState().state.settings.lang).toBe('en');
    expect(a.store.getState().state.steps).toEqual(before);
    await vi.advanceTimersByTimeAsync(600);
    const b = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, lang: 'cs' });
    await b.init();
    expect(b.store.getState().state.settings.lang).toBe('en');
  });

  it('reset kroků a checklistu použije aktuální jazyk; ostatní moduly i jazyk zůstanou', async () => {
    const a = createApp(createBrowserStorage(memoryKV(), () => NOW), { now: () => NOW });
    await a.init();
    a.actions.setLang('en');
    a.actions.setProfile('level', 12);
    await a.actions.resetModule('steps');
    await a.actions.resetModule('checklists');
    const s = a.store.getState().state;
    expect(s.steps.map(x => x.text)).toEqual(NEXT_STEPS_EN);
    expect(s.checklists.templates[0].name).toBe('Before the raid');
    expect(s.profile.level).toBe(12);
    expect(s.settings.lang).toBe('en');
    await a.actions.resetAll();
    expect(a.store.getState().state.settings.lang).toBe('en');
  });

  it('oznámení store jsou v aktuálním jazyce', async () => {
    const a = createApp(createBrowserStorage(memoryKV(), () => NOW), { now: () => NOW });
    await a.init();
    setLang('en');
    expect(getLang()).toBe('en');
    await a.actions.createManualSnapshot('x');
    expect(a.store.getState().notices.at(-1)!.text).toBe('Snapshot created.');
    setLang('cs');
    await a.actions.createManualSnapshot('y');
    expect(a.store.getState().notices.at(-1)!.text).toBe('Snímek vytvořen.');
  });
});
