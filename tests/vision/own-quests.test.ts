/* 0.29.0: vlastní snímky hráče z obrazovky úkolů obchodníka (Tian Wen, záložka QUESTS) ve třech stavech. Jen lokálně:
   složka own/ je v .gitignore, bez ní se testy přeskočí (CI je pokrývá synteticky v quest-states.test.ts). Ruční odečet:
   - own-trader-quests-claim.png: „THE RIGHT TOOL“, tři zaškrtnuté cíle, tlačítko CLAIM (splněno, odměna čeká);
   - own-trader-quest-complete.png: okno „THE RIGHT TOOL“ / COMPLETE s tlačítkem DONE, bez panelu cílů;
   - own-trader-quest-accept.png: „A BETTER USE“, seznam map nad názvem, dva cíle s kosočtverečnými odrážkami (ne
     políčky), tlačítko ACCEPT a přes spodek obrazovky titulek hry.
   Snímky čtou jen obrazovku úkolu; kód relace v pravém dolním rohu se nikde nečte ani neukládá. Tvrdé pravidlo: žádné
   falešné „splněno“ na žádném vlastním snímku v žádné velikosti.
   Negativní snímek own-inraid-map-quests.png: mapa V RAIDU se seznamem úkolů. Fair play: z raidu se nic nečte (živá
   poloha a minimapa jsou červená zóna), takže to nesmí být úkol ani žádná obrazovka postupu a nic se z něj nesnímá.
   Obsahuje jména hráčů: v testech se uvádí jen název souboru, žádný text ze snímku. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FIXTURES } from './load';
import type { RgbaImage } from '../../src/core/vision/image';
import { resizeExact as resize } from './resize';
import { decodeResized, type SizedQueue } from './pool';
import { readAutoCapture, readCapture } from '../../src/core/opsCapture';
import { RUST_SCREENS } from '../../src/core/autoCapture';
import { readProgress, type QuestRead } from '../../src/core/vision/progress';
import { defaultApply, proposalChanges, proposeProgress, questTickChanges, type QuestProposal } from '../../src/core/progressImport';
import { prerequisites } from '../../src/core/quests';
import { nameDistance } from '../../src/core/catalog';
import { provOf } from '../../src/core/provenance';
import { defaultState } from '../../src/core/state';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { StorageAdapter } from '../../src/storage/adapter';

const OWN = FIXTURES + 'own/';
const CLAIM = 'own-trader-quests-claim.png', COMPLETE = 'own-trader-quest-complete.png', ACCEPT = 'own-trader-quest-accept.png';
const HAS = [CLAIM, COMPLETE, ACCEPT].every(f => existsSync(OWN + f));
const RAID_MAP = 'own-inraid-map-quests.png';
const NOW = new Date(2026, 10, 14, 19, 0).getTime();

const cache = new Map<string, RgbaImage>();
const load = (rel: string, width = 0): RgbaImage => {
  const key = rel + '@' + width;
  if (!cache.has(key)) {
    const p = PNG.sync.read(readFileSync(OWN + rel));
    let img: RgbaImage = { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) };
    if (width) img = resize(img, width, Math.round((img.height * width) / img.width));
    cache.set(key, img);
  }
  return cache.get(key)!;
};
const quest = (rel: string, width = 0): QuestRead => {
  const r = readCapture(load(rel, width));
  if (r.kind !== 'progress' || r.progress.screen !== 'quest') throw new Error(`${rel} ${width}: ${r.kind}`);
  return r.progress;
};
const SIZES = [0, 1366, 2560];

async function makeApp() {
  const kv = memoryKV();
  kv.setItem('arcops:state', JSON.stringify(defaultState(NOW)));
  const base = createBrowserStorage(kv, () => NOW);
  const snaps: string[] = [];
  const adapter: StorageAdapter = { ...base, async createSnapshot(k, l, c) { snaps.push(k + ':' + l); return base.createSnapshot(k, l, c); } };
  const app = createApp(adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return { app, snaps, adapter, state: () => app.store.getState().state };
}

/* Negativní snímek z raidu: v žádné velikosti úkol ani obrazovka postupu, snímek ze zkratky ho odmítne a ani kdyby ho
   automatické snímání omylem poslalo jako kteroukoli obrazovku, nic se nepřečte ani nezapíše. */
describe.skipIf(!existsSync(OWN + RAID_MAP))('vlastní snímek: mapa v raidu se seznamem úkolů je negativní', () => {
  it.each([0, 1366, 1600, 2560, 3840])('nikdy úkol ani obrazovka postupu (šířka %i)', w => {
    const img = load(RAID_MAP, w);
    expect(readProgress(img)).toBeNull();
    expect(readCapture(img).kind).toBe('empty');
    for (const screen of RUST_SCREENS) {
      const r = readAutoCapture(img, screen);
      /* loadout a výsledek raidu mají vlastní čtečky; jen nic z nich nesmí být obrazovka postupu */
      expect(r.kind === 'other' && r.result.kind === 'progress', `${screen}`).toBe(false);
      if (r.kind === 'other') expect(r.result.kind, screen).toBe('empty');
    }
  });
});

describe.skipIf(!HAS)('vlastní snímky: tři stavy obrazovky úkolu obchodníka (0.29.0)', () => {
  /* snímky pro poslední test (všechny vlastní snímky v pěti velikostech) se dekódují a zvětšují ve vláknech
     (tests/vision/pool.ts) už během ostatních testů; čtou se pak v hlavním vlákně stejně jako dřív */
  const SWEEP_WIDTHS = [0, 1366, 1600, 2560, 3840];
  let sweepFiles: string[] = [];
  let sweep: SizedQueue | undefined;
  beforeAll(() => {
    sweepFiles = [...readdirSync(OWN).filter(x => x.endsWith('.png')), ...(existsSync(OWN + 'return-and-progression/') ? readdirSync(OWN + 'return-and-progression/').filter(x => x.endsWith('.png')).map(x => 'return-and-progression/' + x) : [])];
    sweep = decodeResized(sweepFiles.map(f => ({ path: OWN + f, widths: SWEEP_WIDTHS })));
  });
  afterAll(async () => { await sweep?.close(); });

  it.each(SIZES)('CLAIM: The Right Tool, tři zaškrtnuté cíle, splněno a odměna čeká (šířka %i)', w => {
    const r = quest(CLAIM, w);
    expect([r.state, r.objectives, r.bullets, r.button.value]).toEqual(['claim', [true, true, true], 0, 'CLAIM']);
    /* v původní velikosti přesně; zmenšený snímek čte E někdy jako F (jeden znak, shoda to unese) */
    expect(nameDistance(r.title.value ?? '', 'THE RIGHT TOOL')).toBeLessThanOrEqual(w ? 1 : 0);
    expect(r.trader.value).toBe('TIAN WEN');
    const p = proposeProgress(r, defaultState(), 'en') as QuestProposal;
    expect(p).toMatchObject({ questId: 'ss7', title: 'The Right Tool', trader: 'Tian Wen', state: 'claim', doneOffer: true, reward: true, done: false });
    if (!w) expect(p.conf).toBe('high');
    expect(questTickChanges(p)).toEqual([]);
    expect(defaultApply(p)).toEqual(p.conf === 'high' ? { questDone: ['ss7'] } : {});
  });

  it.each(SIZES)('COMPLETE: okno bez panelu, název z okna, splněno (šířka %i)', w => {
    const r = quest(COMPLETE, w);
    expect([r.state, r.objectives, r.bullets, r.button.value]).toEqual(['complete', [], 0, 'DONE']);
    expect(nameDistance(r.title.value ?? '', 'THE RIGHT TOOL')).toBeLessThanOrEqual(w ? 1 : 0);
    const p = proposeProgress(r, defaultState()) as QuestProposal;
    expect(p).toMatchObject({ questId: 'ss7', state: 'complete', doneOffer: true, reward: false });
    /* v původní velikosti jisté a předvybrané; zmenšené nebo zvětšené jisté, nebo aspoň k potvrzení */
    if (!w) expect(p.conf).toBe('high');
    expect(defaultApply(p)).toEqual(p.conf === 'high' ? { questDone: ['ss7'] } : {});
  });

  it.each(SIZES)('ACCEPT: A Better Use, kosočtverečné odrážky nejsou políčka, nic se nezapíše (šířka %i)', w => {
    const r = quest(ACCEPT, w);
    expect([r.state, r.title.value, r.objectives, r.button.value]).toEqual(['accept', 'A BETTER USE', [], 'ACCEPT']);
    expect(r.bullets).toBe(2);
    const s = defaultState();
    const p = proposeProgress(r, s) as QuestProposal;
    expect(p).toMatchObject({ questId: 'ss10', state: 'accept', available: true, doneOffer: false, objectives: [] });
    expect([defaultApply(p), proposalChanges(p), questTickChanges(p)]).toEqual([{}, 0, []]);
  });

  it('zápis přes store: CLAIM a COMPLETE označí úkol splněný se snímkem stavu, původem a návratem; ACCEPT nic', async () => {
    const { app, snaps, adapter, state } = await makeApp();
    /* ACCEPT: nic k zápisu, stav beze změny */
    const pa = proposeProgress(quest(ACCEPT), state()) as QuestProposal;
    expect(defaultApply(pa)).toEqual({});
    const before = JSON.stringify(state().quests);
    expect(await app.actions.importProgress(defaultApply(pa), 'auto-capture')).toEqual({ fields: 0 });
    expect(JSON.stringify(state().quests)).toBe(before);
    /* CLAIM ze zkratky: úkol i předchozí úkoly splněné, snímek stavu před zápisem, původ = snímek ze zkratky */
    const pc = proposeProgress(quest(CLAIM), state()) as QuestProposal;
    const sum = await app.actions.importProgress(defaultApply(pc), 'screenshot-hotkey');
    expect(sum).toEqual({ fields: 1 + prerequisites('ss7').filter(id => !JSON.parse(before).done[id]).length });
    expect(snaps.at(-1)).toBe('import:pred importem postupu ze snimku');
    expect(state().quests.done.ss7).toBe(NOW);
    expect(provOf(state(), 'quests', 'ss7')).toMatchObject({ src: 'screenshot-hotkey', ver: true });
    expect(state().quests.objectives).toEqual({});
    /* COMPLETE téhož úkolu: už splněný, nic dalšího */
    const pd = proposeProgress(quest(COMPLETE), state()) as QuestProposal;
    expect([pd.done, defaultApply(pd), proposalChanges(pd)]).toEqual([true, {}, 0]);
    /* návrat: snímek stavu před zápisem vrátí úkol do nesplněného */
    const list = await adapter.listSnapshots();
    const snap = list.filter(x => x.name.includes('import')).sort((a, b) => b.name.localeCompare(a.name))[0];
    expect(snap).toBeTruthy();
    expect(await app.actions.restoreSnapshot(snap.name)).toBe(true);
    expect(state().quests.done.ss7).toBeUndefined();
  });

  it('žádné falešné „splněno“ a žádný jiný snímek není úkol (5 velikostí, všechny vlastní snímky)', async () => {
    const files = sweepFiles, WIDTHS = SWEEP_WIDTHS;
    expect(files.length).toBeGreaterThan(0);
    const quests = new Set([CLAIM, COMPLETE, ACCEPT, 'return-and-progression/quest-shoring.png', 'return-and-progression/quest-battening.png']);
    const done: string[] = [];
    for (const f of files) {
      const imgs = await sweep!.next();
      for (const [k, w] of WIDTHS.entries()) {
        const r = readProgress(imgs[k]);
        if (!quests.has(f)) { expect(r?.screen ?? null, `${f} ${w}`).not.toBe('quest'); continue; }
        expect(r?.screen, `${f} ${w}`).toBe('quest');
        if (r?.screen !== 'quest') continue;
        const p = proposeProgress(r, defaultState()) as QuestProposal;
        const a = defaultApply(p);
        if (a.questDone) done.push(`${f}@${w}:${a.questDone.join(',')}`);
        /* „splněno“ jen ze CLAIM a COMPLETE a jen pro The Right Tool; nikdy z ACCEPT nebo z obrazovky s cíli */
        if (p.doneOffer) expect([f === CLAIM || f === COMPLETE, p.questId], `${f} ${w}`).toEqual([true, 'ss7']);
        if (f !== CLAIM && f !== COMPLETE) expect([p.doneOffer, a.questDone], `${f} ${w}`).toEqual([false, undefined]);
        if (f === ACCEPT) expect([r.objectives, a], `${f} ${w}`).toEqual([[], {}]);
      }
    }
    console.log('„splněno“ předvybrané z vlastních snímků:\n  ' + done.join('\n  '));
    expect(done.every(x => x.endsWith(':ss7'))).toBe(true);
  }, 300000);
});
