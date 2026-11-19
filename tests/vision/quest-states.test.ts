/* 0.29.0: tři stavy obrazovky úkolu obchodníka (CLAIM, COMPLETE, ACCEPT) a přijatý úkol s cíli. Všechno synteticky
   (bez vlastních snímků), takže to ověří i CI: logika stavu (questState), přísná shoda názvu pro „splněno“
   (questDoneMatch, nikdy jiný úkol), čtení umělých obrazovek v několika rozlišeních a výsledná změna stavu aplikace.
   Tvrdé pravidlo: žádné falešné „splněno“. */
import { describe, expect, it } from 'vitest';
import { questState, readProgress, type QuestEvidence, type QuestRead } from '../../src/core/vision/progress';
import { resizeExact as resize } from './resize';
import { applyProgress, defaultApply, normalizeProgressApply, proposalChanges, proposeProgress, questDoneMatch, questTickChanges, type QuestProposal } from '../../src/core/progressImport';
import { QUESTS, prerequisites } from '../../src/core/quests';
import { nameDistance } from '../../src/core/catalog';
import { defaultState } from '../../src/core/state';
import { completeScreen, questScreen, type canvas } from './progress-synth';

const R = <T>(value: T | null, conf = 0.9, raw = '') => ({ value, conf, raw: raw || String(value ?? '') });
const at = (img: ReturnType<typeof canvas>, w: number) => (w === 1920 ? img : resize(img, w, Math.round((w * 9) / 16)));
const quest = (img: ReturnType<typeof canvas>): QuestRead => {
  const r = readProgress(img);
  if (r?.screen !== 'quest') throw new Error('úkol nenalezen: ' + (r?.screen ?? 'nic'));
  return r;
};
const ev = (o: Partial<QuestEvidence>): QuestEvidence => ({ panel: true, button: null, completeWord: false, checks: [], bullets: 0, ...o });
const SIZES = [1920, 1366, 2560];

describe('stav obrazovky úkolu: čistá logika', () => {
  it('jednoznačné doklady dají stav', () => {
    expect(questState(ev({ button: 'claim', checks: [true, true, true] }))).toBe('claim');
    expect(questState(ev({ panel: false, button: 'done', completeWord: true }))).toBe('complete');
    expect(questState(ev({ button: 'accept', bullets: 2 }))).toBe('accept');
    expect(questState(ev({ button: 'accept' }))).toBe('accept');
    expect(questState(ev({ checks: [true, false, null] }))).toBe('progress');
    expect(questState(ev({ checks: [false] }))).toBe('progress');
  });
  it('cokoli nejistého nebo protichůdného je unknown', () => {
    /* CLAIM s nezaškrtnutým nebo nečitelným cílem, bez políček, s odrážkami, bez panelu */
    expect(questState(ev({ button: 'claim', checks: [true, false] }))).toBe('unknown');
    expect(questState(ev({ button: 'claim', checks: [true, null] }))).toBe('unknown');
    expect(questState(ev({ button: 'claim' }))).toBe('unknown');
    expect(questState(ev({ button: 'claim', checks: [true], bullets: 1 }))).toBe('unknown');
    expect(questState(ev({ panel: false, button: 'claim', checks: [true] }))).toBe('unknown');
    /* DONE bez slova COMPLETE, COMPLETE bez DONE, COMPLETE s panelem */
    expect(questState(ev({ panel: false, button: 'done' }))).toBe('unknown');
    expect(questState(ev({ panel: false, completeWord: true }))).toBe('unknown');
    expect(questState(ev({ panel: false, button: 'claim', completeWord: true }))).toBe('unknown');
    expect(questState(ev({ panel: true, button: 'done', completeWord: true }))).toBe('unknown');
    expect(questState(ev({ button: 'done', checks: [true] }))).toBe('unknown');
    /* ACCEPT s políčky, nečitelné tlačítko, panel bez cílů, odrážky bez tlačítka, nic */
    expect(questState(ev({ button: 'accept', checks: [true] }))).toBe('unknown');
    expect(questState(ev({ button: 'other', checks: [true, true] }))).toBe('unknown');
    expect(questState(ev({}))).toBe('unknown');
    expect(questState(ev({ bullets: 2 }))).toBe('unknown');
    expect(questState(ev({ checks: [true], bullets: 1 }))).toBe('unknown');
    expect(questState(ev({ panel: false }))).toBe('unknown');
  });
});

describe('přísná shoda názvu úkolu pro „splněno“', () => {
  const TW = R('TIAN WEN');
  it('přesný název s poznaným obchodníkem je jistý', () => {
    expect(questDoneMatch(R('THE RIGHT TOOL'), TW)).toMatchObject({ quest: { id: 'ss7' }, dist: 0, conf: 'high' });
    expect(questDoneMatch(R('A BETTER USE'), TW)).toMatchObject({ quest: { id: 'ss10' }, conf: 'high' });
    /* jeden špatný znak ještě jistý, bez obchodníka nebo s nejistým čtením jen k potvrzení */
    expect(questDoneMatch(R('THE RIGHT TOOI'), TW)).toMatchObject({ quest: { id: 'ss7' }, conf: 'high' });
    expect(questDoneMatch(R('THE RIGHT TOOL'), R(null, 0))).toMatchObject({ quest: { id: 'ss7' }, conf: 'medium' });
    expect(questDoneMatch(R('THE RIGHT TOOL', 0.5), TW)).toMatchObject({ quest: { id: 'ss7' }, conf: 'medium' });
  });
  it('nepřesný, useknutý, cizí nebo nejistě přečtený název: nic', () => {
    expect(questDoneMatch(R('THE RIGHT'), TW)).toBeNull();
    expect(questDoneMatch(R('THE RIGHT TOOL EXTRA'), TW)).toBeNull();
    expect(questDoneMatch(R('THE RIQHT TQQL'), TW)).toBeNull();
    expect(questDoneMatch(R('XYZZY QWERTY'), TW)).toBeNull();
    expect(questDoneMatch(R('THE RIGHT TOOL', 0.3), TW)).toBeNull();
    expect(questDoneMatch(R(null, 0), TW)).toBeNull();
    expect(questDoneMatch(R('USE'), TW)).toBeNull();
    /* úkol jiného obchodníka se u Tian Wena nepozná (Shoring Up Defenses je Apollův) */
    expect(questDoneMatch(R('SHORING UP DEFENSES'), TW)).toBeNull();
  });
  it('celý katalog: přesný název vždy jen svůj úkol a jistě; jeden pozměněný znak nikdy jiný úkol', () => {
    let changed = 0;
    for (const q of QUESTS) {
      const name = typeof q.name === 'string' ? q.name : q.name.en;
      const up = name.toUpperCase();
      expect(questDoneMatch(R(up), R(q.trader.toUpperCase())), name).toMatchObject({ quest: { id: q.id }, conf: 'high' });
      expect(questDoneMatch(R(up), R(null, 0))?.quest.id ?? q.id, name).toBe(q.id);
      /* záměna, vypuštění a vložení znaku na každé pozici (s obchodníkem i bez něj) */
      const letters = up.replace(/[^A-Z0-9]/g, '');
      for (let i = 0; i < letters.length; i++) {
        for (const v of [letters.slice(0, i) + 'X' + letters.slice(i + 1), letters.slice(0, i) + letters.slice(i + 1), letters.slice(0, i) + 'E' + letters.slice(i)]) {
          for (const tr of [R(q.trader.toUpperCase()), R(null, 0)]) {
            const m = questDoneMatch(R(v), tr);
            if (m) { expect(m.quest.id, `${name} → ${v}`).toBe(q.id); changed++; }
          }
        }
      }
    }
    expect(changed).toBeGreaterThan(QUESTS.length);
  }, 120000);
});

describe('umělé obrazovky úkolu: čtení a zápis', () => {
  it.each(SIZES)('CLAIM: zaškrtnuté cíle a tlačítko CLAIM = splněný úkol, odměna čeká (šířka %i)', w => {
    const r = quest(at(questScreen({ trader: 'TIAN WEN', title: 'THE RIGHT TOOL', checks: [true, true, true], button: 'CLAIM' }), w));
    expect([r.state, r.title.value, r.objectives, r.bullets]).toEqual(['claim', 'THE RIGHT TOOL', [true, true, true], 0]);
    expect(r.button.value).toBe('CLAIM');
    const s = defaultState();
    const p = proposeProgress(r, s, 'en') as QuestProposal;
    expect(p).toMatchObject({ questId: 'ss7', state: 'claim', doneOffer: true, reward: true, available: false, done: false });
    /* cíle se u CLAIM nezaškrtávají, rozhoduje „splněno“ */
    expect(questTickChanges(p)).toEqual([]);
    if (w === 1920) expect(p.conf).toBe('high');
    if (p.conf !== 'high') { expect(defaultApply(p)).toEqual({}); return; }
    expect(defaultApply(p)).toEqual({ questDone: ['ss7'] });
    expect(proposalChanges(p)).toBe(1);
    applyProgress(s, defaultApply(p), 5, 1000);
    /* s úkolem i předchozí úkoly (jako ruční zaškrtnutí), nic jiného */
    expect(Object.keys(s.quests.done).sort()).toEqual(['ss7', ...prerequisites('ss7')].sort());
    expect(s.quests.done.ss7).toBe(1000);
    expect(s.quests.objectives).toEqual({});
    /* znovu stejný snímek: nic nového */
    expect(defaultApply(proposeProgress(r, s) as QuestProposal)).toEqual({});
    expect(proposalChanges(proposeProgress(r, s))).toBe(0);
  });

  it.each(SIZES)('COMPLETE: okno s DONE bez panelu, název z okna = splněný úkol (šířka %i)', w => {
    const r = quest(at(completeScreen({ trader: 'TIAN WEN', title: 'THE RIGHT TOOL' }), w));
    expect([r.state, r.objectives, r.button.value]).toEqual(['complete', [], 'DONE']);
    /* malý šedý název okna se po změně velikosti může přečíst s jedním znakem jinak (E/F); shoda to unese */
    expect(nameDistance(r.title.value ?? '', 'THE RIGHT TOOL')).toBeLessThanOrEqual(w === 1920 ? 0 : 1);
    const s = defaultState();
    const p = proposeProgress(r, s) as QuestProposal;
    expect(p).toMatchObject({ questId: 'ss7', state: 'complete', doneOffer: true, reward: false });
    if (w === 1920) expect(p.conf).toBe('high');
    if (p.conf === 'high') {
      applyProgress(s, defaultApply(p));
      expect(s.quests.done.ss7).toBeGreaterThan(0);
    } else expect(defaultApply(p)).toEqual({});
  });

  it.each(SIZES)('ACCEPT: kosočtverečné odrážky nejsou políčka, nic se nezapíše (šířka %i)', w => {
    const r = quest(at(questScreen({ trader: 'TIAN WEN', title: 'A BETTER USE', checks: [], bullets: 2, button: 'ACCEPT', map: 'BURIED CITY, SPACEPORT', caption: true }), w));
    expect([r.state, r.title.value, r.objectives]).toEqual(['accept', 'A BETTER USE', []]);
    expect(r.bullets).toBe(2);
    const s = defaultState();
    s.quests.objectives = { ss10: [1] };
    const before = JSON.stringify(s);
    const p = proposeProgress(r, s) as QuestProposal;
    expect(p).toMatchObject({ questId: 'ss10', state: 'accept', available: true, doneOffer: false, objectives: [] });
    expect([defaultApply(p), proposalChanges(p), questTickChanges(p)]).toEqual([{}, 0, []]);
    applyProgress(s, defaultApply(p));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('ACCEPT u úkolu, který je v aplikaci splněný: „splněno“ se nezruší ani nepřidá', () => {
    const r = quest(questScreen({ trader: 'TIAN WEN', title: 'A BETTER USE', checks: [], bullets: 2, button: 'ACCEPT' }));
    const s = defaultState();
    s.quests.done = { ss10: 5 };
    const p = proposeProgress(r, s) as QuestProposal;
    expect([p.done, defaultApply(p), proposalChanges(p)]).toEqual([true, {}, 0]);
  });

  it.each(SIZES)('přijatý úkol bez tlačítka: stav progress, zaškrtnuté cíle se nabídnou, „splněno“ nikdy (šířka %i)', w => {
    const r = quest(at(questScreen({ trader: 'TIAN WEN', title: 'THE RIGHT TOOL', checks: [true, false, true] }), w));
    expect([r.state, r.objectives]).toEqual(['progress', [true, false, true]]);
    const p = proposeProgress(r, defaultState()) as QuestProposal;
    expect([p.state, p.doneOffer, p.open]).toEqual(['progress', false, true]);
    expect(questTickChanges(p)).toEqual([{ id: 'ss7', index: 0, on: true }, { id: 'ss7', index: 2, on: true }]);
    expect(defaultApply(p).questDone).toBeUndefined();
    /* i se všemi zaškrtnutými a bez tlačítka jen cíle */
    const all = proposeProgress(quest(at(questScreen({ trader: 'TIAN WEN', title: 'THE RIGHT TOOL', checks: [true, true, true] }), w)), defaultState()) as QuestProposal;
    expect([all.state, all.doneOffer, defaultApply(all).questDone]).toEqual(['progress', false, undefined]);
  });

  it('CLAIM s nezaškrtnutým cílem nebo nepřečteným tlačítkem: nejistý stav, nic se nezapíše', () => {
    for (const img of [
      questScreen({ trader: 'TIAN WEN', title: 'THE RIGHT TOOL', checks: [true, false, true], button: 'CLAIM' }),
      questScreen({ trader: 'TIAN WEN', title: 'THE RIGHT TOOL', checks: [true, true, true], button: 'START' }),
      completeScreen({ trader: 'TIAN WEN', title: 'THE RIGHT TOOL', button: 'CLAIM' }),
      completeScreen({ trader: 'TIAN WEN', title: 'THE RIGHT TOOL', word: 'FAILED' }),
    ]) {
      const r = quest(img);
      expect(r.state).toBe('unknown');
      const p = proposeProgress(r, defaultState()) as QuestProposal;
      expect([p.doneOffer, defaultApply(p), proposalChanges(p)]).toEqual([false, {}, 0]);
    }
  });

  it('CLAIM u úkolu, který v datech není: nic', () => {
    const r = quest(questScreen({ trader: 'TIAN WEN', title: 'BRAND NEW QUEST', checks: [true, true], button: 'CLAIM' }));
    expect(r.state).toBe('claim');
    const p = proposeProgress(r, defaultState()) as QuestProposal;
    expect([p.questId, p.doneOffer, defaultApply(p)]).toEqual([null, false, {}]);
  });

  it('nejisté tlačítko nebo název: „splněno“ jen po potvrzení, nikdy předvybrané', () => {
    const base: QuestRead = { screen: 'quest', trader: R('TIAN WEN'), title: R('THE RIGHT TOOL'), objectives: [], state: 'complete', button: R('DONE'), bullets: 0 };
    for (const r of [{ ...base, button: R('DONE', 0.5) }, { ...base, title: R('THE RIGHT TOOL', 0.5) }, { ...base, trader: R(null, 0) }]) {
      const p = proposeProgress(r, defaultState()) as QuestProposal;
      expect([p.questId, p.conf, p.doneOffer]).toEqual(['ss7', 'medium', true]);
      expect(defaultApply(p)).toEqual({});
    }
    /* čtení bez stavu (starší okno): nejisté, nic */
    const legacy = { ...base, state: undefined } as unknown as QuestRead;
    const p = proposeProgress({ ...legacy, objectives: [true] }, defaultState()) as QuestProposal;
    expect([p.state, defaultApply(p), proposalChanges(p)]).toEqual(['unknown', {}, 0]);
  });

  it('zápis „splněno“: jen známé id, už splněný beze změny, zrušení má přednost', () => {
    const s = defaultState();
    expect(applyProgress(s, { questDone: ['nope', 'ss7'] }, 5, 7).fields).toBe(1 + prerequisites('ss7').length);
    expect(applyProgress(s, { questDone: ['ss7'] }).fields).toBe(0);
    const t = defaultState();
    expect(applyProgress(t, { questDone: ['ss7'], questUndone: ['ss7'] }).fields).toBe(0);
    expect(t.quests.done).toEqual({});
    /* vstup z jiného okna: jen řetězce, nejvýš 16 */
    expect(normalizeProgressApply({ questDone: ['ss7', 3, 'x'.repeat(81), ...Array(30).fill('a')] })!.questDone).toEqual(['ss7', ...Array(15).fill('a')]);
  });
});
