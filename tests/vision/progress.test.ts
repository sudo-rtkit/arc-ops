/* Obrazovky postupu (0.10.1) bez vlastních snímků: umělé obrazovky kreslené ze vzorů písmen (progress-synth.ts),
   římské číslice, pravidla návrhu (jistota, ověření proti datům, nic se nehádá) a zápis jen potvrzených hodnot. */
import { describe, expect, it } from 'vitest';
import { components, maskOf } from '../../src/core/vision/digits';
import { resize } from '../../src/core/vision/image';
import { readProgress, type ProgressRead } from '../../src/core/vision/progress';
import { creamPanel, parseNumber, romanOf } from '../../src/core/vision/text';
import { readCapture } from '../../src/core/opsCapture';
import { applyProgress, bestMatch, defaultApply, normalizeProgressApply, proposalChanges, proposeProgress, WORKSHOP_SLOTS, type ProfileProposal, type QuestProposal, type SkillsProposal, type StationsProposal } from '../../src/core/progressImport';
import { defaultState } from '../../src/core/state';
import { QUESTS } from '../../src/core/quests';
import { loadFixture, AMMO, TOOLTIP, TOP } from './load';
import { canvas, CREAM, INK, profileScreen, questScreen, rect, roman, skillScreen } from './progress-synth';

const R = <T>(value: T | null, conf = 0.9, raw = '') => ({ value, conf, raw });
const at = (img: ReturnType<typeof canvas>, w: number) => (w === 1920 ? img : resize(img, w, Math.round((w * 9) / 16)));

describe('římské číslice s patkami', () => {
  it.each([[1], [2], [3], [4], [5]])('%i se přečte v různých velikostech, tmavě na krému', v => {
    for (const h of [12, 16, 22, 34]) {
      const img = canvas(80, 60, CREAM);
      roman(img, 10, 10, h, v, INK);
      const ink = (_r: number, _g: number, _b: number, l: number) => l < 120;
      const { mask, w, h: mh } = maskOf(img, { x: 0, y: 0, w: 80, h: 60 }, ink);
      const c = components(mask, w, mh)[0];
      expect(romanOf(mask, w, c), `${v} @ ${h}px`).toBe(v);
    }
  });
  it('jiný tvar (plný blok, vodorovná čárka) není číslice', () => {
    const img = canvas(60, 40, CREAM);
    rect(img, 10, 10, 20, 20, INK);
    rect(img, 40, 20, 15, 3, INK);
    const ink = (_r: number, _g: number, _b: number, l: number) => l < 120;
    const { mask, w, h } = maskOf(img, { x: 0, y: 0, w: 60, h: 40 }, ink);
    for (const c of components(mask, w, h)) expect(romanOf(mask, w, c)).toBeNull();
  });
});

describe('pomocné čtení', () => {
  it('číslo se skupinami tisíců: špatná čárka = nečitelné', () => {
    expect(parseNumber('58,313')).toBe(58313);
    expect(parseNumber('29000')).toBe(29000);
    expect(parseNumber('2,97')).toBeNull();
    expect(parseNumber('5?3')).toBeNull();
  });
  it('krémový panel: nalezne obdélník, malou skvrnu ne', () => {
    const img = canvas(400, 300);
    rect(img, 100, 50, 200, 150, CREAM);
    rect(img, 20, 20, 10, 10, CREAM);
    expect(creamPanel(img, { x: 0, y: 0, w: 400, h: 300 }, 100, 80)).toEqual({ x: 100, y: 50, w: 200, h: 150 });
    expect(creamPanel(canvas(400, 300), { x: 0, y: 0, w: 400, h: 300 }, 100, 80)).toBeNull();
  });
});

describe('druh obrazovky: nic se nehádá', () => {
  it('prázdný, poškozený a malý snímek nejsou obrazovka postupu', () => {
    expect(readProgress(canvas(320, 180))).toBeNull();
    expect(readProgress({ width: 10, height: 10, data: new Uint8ClampedArray(4) })).toBeNull();
    expect(readCapture(canvas(640, 360))).toEqual({ kind: 'empty', reason: 'noInventory' });
  });
  it('vzorové snímky STASH zůstávají stash (ne postup)', () => {
    for (const f of [AMMO, TOOLTIP, TOP]) {
      expect(readProgress(loadFixture(f)), f).toBeNull();
      expect(readCapture(loadFixture(f)).kind, f).toBe('read');
    }
  });
});

describe('umělé obrazovky postupu', () => {
  /* 1366 px se tu nezkouší: zmenšené kreslené vzory číslic nejsou písmo hry (skutečný snímek 1366 px hlídá own-return) */
  it.each([1920, 2560, 3840])('profil: level, XP a mince (šířka %i)', w => {
    const r = readCapture(at(profileScreen({ level: 'LEVEL 20', xp: '2,977/29,000 XP', coins: '58,313' }), w));
    expect(r.kind).toBe('progress');
    if (r.kind !== 'progress' || r.progress.screen !== 'profile') throw new Error('profil nenalezen');
    expect([r.progress.level.value, r.progress.xp.value, r.progress.xpNext.value, r.progress.coins.value]).toEqual([20, 2977, 29000, 58313]);
  });
  it('profil bez čísla levelu: level je nečitelný, ostatní pole zůstanou', () => {
    const r = readProgress(profileScreen({ level: 'LEVEL', xp: '100/2,000 XP', coins: '7' }));
    if (r?.screen !== 'profile') throw new Error('profil nenalezen');
    expect(r.level.value).toBeNull();
    expect([r.xp.value, r.xpNext.value, r.coins.value]).toEqual([100, 2000, 7]);
    const p = proposeProgress(r, defaultState()) as ProfileProposal;
    expect(p.level.conf).toBe('unknown');
    expect(defaultApply(p).profile).not.toHaveProperty('level');
  });

  it.each([1920, 1366, 2560])('úkol: obchodník, název a zaškrtnutí cílů (šířka %i)', w => {
    const r = readProgress(at(questScreen({ trader: 'APOLLO', title: 'SHORING UP DEFENSES', checks: [true, true, false, true] }), w));
    if (r?.screen !== 'quest') throw new Error('úkol nenalezen');
    expect(r.objectives).toEqual([true, true, false, true]);
    const p = proposeProgress(r, defaultState(), 'en') as QuestProposal;
    expect([p.questId, p.trader, p.countMatch, p.open]).toEqual(['shoring_up_defenses', 'Apollo', true, true]);
    expect(p.objectives[2]).toEqual({ text: 'Use 1 ARC Alloy to reinforce the Raider structure on top of any Stacking Yard crane', checked: false });
  });
  it('úkol se všemi cíli zaškrtnutými se přesto neoznačí jako splněný', () => {
    const r = readProgress(questScreen({ trader: 'APOLLO', title: 'BATTENING DOWN', checks: [true, true, true] }))!;
    const s = defaultState();
    const p = proposeProgress(r, s) as QuestProposal;
    expect([p.questId, p.open]).toEqual(['battening_down', false]);
    expect(defaultApply(p)).toEqual({});
    applyProgress(s, { questPin: [p.questId!] });
    expect(s.quests.done).toEqual({});
    expect(s.quests.pinned).toEqual(['battening_down']);
  });

  it.each([1920, 1366, 2560])('skill tree: tooltip s maximem a s šipkou, součty větví (šířka %i)', w => {
    const max = readProgress(at(skillScreen({ name: 'MARATHON RUNNER', current: 5 }), w));
    if (max?.screen !== 'skills') throw new Error('skill tree nenalezen');
    expect([max.totals.c.value, max.totals.m.value, max.totals.s.value]).toEqual([0, 17, 4]);
    expect(max.tooltip).toMatchObject({ arrow: false, current: { value: 5 }, next: { value: null } });
    const part = readProgress(at(skillScreen({ name: 'LOOTERS INSTINCTS', current: 3, next: 4 }), w));
    if (part?.screen !== 'skills') throw new Error('skill tree nenalezen');
    expect(part.tooltip).toMatchObject({ arrow: true, current: { value: 3 }, next: { value: 4 } });
    expect((proposeProgress(part, defaultState()) as SkillsProposal).skill).toMatchObject({ id: 's_instincts', current: { value: 3 }, next: 4 });
  });
  it('tooltip jen s modrým dalším rankem: aktuální rank je neznámý (nic se neodvozuje)', () => {
    const r = readProgress(skillScreen({ name: 'MARATHON RUNNER', current: null, next: 1 }));
    if (r?.screen !== 'skills') throw new Error('skill tree nenalezen');
    expect(r.tooltip).toMatchObject({ arrow: true, current: { value: null }, next: { value: 1 } });
    const p = proposeProgress(r, defaultState()) as SkillsProposal;
    expect(p.skill!.current.conf).toBe('unknown');
    expect(defaultApply(p)).toEqual({});
  });
});

describe('návrh: jistota a ověření proti datům', () => {
  const s = defaultState();
  it('profil: XP větší než XP na další level = obě nečitelné; level mimo rozsah = nečitelný', () => {
    const p = proposeProgress({ screen: 'profile', level: R(99), xp: R(5000), xpNext: R(4000), coins: R(10, 0.5) }, s) as ProfileProposal;
    expect([p.level.conf, p.xp.conf, p.xpNext.conf, p.coins.conf]).toEqual(['unknown', 'unknown', 'unknown', 'medium']);
    expect(defaultApply(p)).toEqual({ profile: {} });
  });
  it('nízká jistota znaků: nejisté (potvrzení) nebo neznámé', () => {
    const p = proposeProgress({ screen: 'profile', level: R(12, 0.5), xp: R(1, 0.2), xpNext: R(2, 0.9), coins: R(3, 0.9) }, s) as ProfileProposal;
    expect([p.level.conf, p.xp.conf, p.coins.conf]).toEqual(['medium', 'unknown', 'high']);
    expect(defaultApply(p).profile).toEqual({ coins: 3 });
  });
  it('detail stanice: hlavička a panel se musí shodnout; recept ověří úroveň', () => {
    const base: ProgressRead = { screen: 'station', title: R('GEAR BENCH'), level: R(1), panelLevel: R(1), resources: [3, 5, 5].map(n => ({ have: R(0), need: R(n) })) };
    const ok = proposeProgress(base, s) as StationsProposal;
    expect(ok.rows[0]).toMatchObject({ id: 'gear', value: 1, conf: 'high' });
    expect(ok.recipeMatch).toBe(true);
    expect(ok.resources!.map(x => x.name)).toEqual(['Power Cable', 'Electrical Components', 'Hornet Driver']);
    const clash = proposeProgress({ ...base, panelLevel: R(2) }, s) as StationsProposal;
    expect(clash.rows[0]).toMatchObject({ value: null, conf: 'unknown' });
    const oneSrc = proposeProgress({ ...base, panelLevel: R<number>(null, 0), resources: [] }, s) as StationsProposal;
    expect(oneSrc.rows[0]).toMatchObject({ value: 1, conf: 'medium' });
    expect(oneSrc.recipeMatch).toBe(false);
    const tooHigh = proposeProgress({ ...base, level: R(9), panelLevel: R(9) }, s) as StationsProposal;
    expect(tooHigh.rows[0].value).toBeNull();
    const unknown = proposeProgress({ ...base, title: R('WORKBENCH') }, s) as StationsProposal;
    expect(unknown.rows).toEqual([]);
  });
  it('přehled dílny: Workbench se přeskočí, Scrappy bez čísla je neznámý', () => {
    expect(WORKSHOP_SLOTS).toHaveLength(8);
    const p = proposeProgress({ screen: 'workshop', tiles: WORKSHOP_SLOTS.map((_, slot) => ({ slot, level: slot === 0 ? R<number>(null, 0) : R(2) })) }, s) as StationsProposal;
    expect(p.rows.map(r => r.id)).toEqual(['scrappy', 'gear', 'utility', 'gunsmith', 'medical', 'refiner', 'explosives']);
    expect(p.rows[0].conf).toBe('unknown');
    expect(proposalChanges(p)).toBe(6);
  });
  it('úkol: neznámý název nic nenabízí; podobné názvy bez jasného vítěze se nepárují', () => {
    const q = proposeProgress({ screen: 'quest', trader: R('APOLLO'), title: R('XYZZY QWERTY'), objectives: [false] }, s) as QuestProposal;
    expect(q.questId).toBeNull();
    expect(defaultApply(q)).toEqual({});
    expect(bestMatch('A', QUESTS, x => String(x.name))).toBeNull();
  });
  it('skill: rank nad maximum nebo nesouvislá šipka = neznámý', () => {
    const tip = (current: number, next: number | null) => ({ screen: 'skills' as const, totals: { c: R(0), m: R(0), s: R(0) }, tooltip: { name: R('MARATHON RUNNER'), current: R(current), next: R(next), arrow: next !== null } });
    expect((proposeProgress(tip(6, null), s) as SkillsProposal).skill!.current.conf).toBe('unknown');
    expect((proposeProgress(tip(2, 4), s) as SkillsProposal).skill!.current.conf).toBe('unknown');
    expect((proposeProgress(tip(2, 3), s) as SkillsProposal).skill!.current).toMatchObject({ value: 2, conf: 'high' });
    const one = proposeProgress({ ...tip(1, null), tooltip: { ...tip(1, null).tooltip, name: R('VAULT SPRING') } }, s) as SkillsProposal;
    expect(one.skill).toMatchObject({ id: 'm_spring', max: 1 });
  });
});

describe('zápis jen potvrzených a platných hodnot', () => {
  it('neplatné hodnoty a neznámá id se zahodí', () => {
    const s = defaultState();
    const sum = applyProgress(s, {
      profile: { level: 200, xp: 10, coins: -5, xpNext: 1.5 }, stations: { gear: 9, nope: 1, gunsmith: 2 },
      skills: { m_marathon: 6, m_spring: 1, nope: 1 }, questUndone: ['nope'], questPin: ['nope', 'battening_down'],
    });
    expect(s.profile).toMatchObject({ level: 1, xp: 10, coins: 0, xpNext: 0 });
    expect(s.stations).toMatchObject({ gear: 0, gunsmith: 2 });
    expect(s.skills.current).toEqual({ m_spring: 1 });
    expect(s.quests.pinned).toEqual(['battening_down']);
    expect(sum.fields).toBe(4);
  });
  it('vstup z okna overlaye: jen čísla a krátká id', () => {
    expect(normalizeProgressApply(null)).toBeNull();
    expect(normalizeProgressApply({ profile: { level: '20', coins: 5, evil: 1 }, stations: [1], skills: { a: NaN, b: 2 }, questPin: ['x', 3] }))
      .toEqual({ profile: { coins: 5 }, stations: {}, skills: { b: 2 }, questUndone: [], questPin: ['x'] });
  });
});
