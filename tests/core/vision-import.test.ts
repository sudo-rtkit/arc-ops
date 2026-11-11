/* Převod rozpoznaných snímků na změny stavu: skupiny, kontrolní součet, přepis materiálů, nulování, mince,
   nový vlastní materiál a učení otisků. Store: snímek stavu před zápisem. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture, AMMO, TOOLTIP, TOP } from '../vision/load';
import { hideRowsFrom, scrollRows } from '../vision/synth';
import { readScreenshot, type ScreenRead } from '../../src/core/vision/read';
import { analyzeShots, applyVisionImport, addLearned, defaultTarget, type ImportAnalysis, type ImportGroup, type Target, type VisionApply } from '../../src/core/visionImport';
import { defaultState } from '../../src/core/state';
import { LEARNED_MAX, type LearnedFp } from '../../src/core/types';
import { FP_LEN } from '../../src/core/vision/fingerprint';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();
const reads = new Map<string, ScreenRead>();
const read = (f: string): ScreenRead => { if (!reads.has(f)) reads.set(f, readScreenshot(loadFixture(f))); return reads.get(f)!; };
const has = (g: ImportGroup, row: number, col: number) => g.cells.some(c => c.row === row && c.col === col && c.shot === 0);
const groupAt = (a: ImportAnalysis, row: number, col: number) => a.groups.find(g => has(g, row, col))!;
const apply = (a: ImportAnalysis, targets: [ImportGroup, Target][], extra: Partial<VisionApply> = {}): VisionApply => ({
  rows: targets.map(([group, target]) => ({ group, target, count: group.count ?? 0 })),
  coins: a.coins, zeroMissing: false, canZero: a.canZero, profile: a.profile, ...extra,
});

describe('analyzeShots', () => {
  it('celý stash: 13 skupin, počty se sčítají, kontrolní součet nesedí (24 z 200)', () => {
    const a = analyzeShots([read(TOOLTIP)], []);
    expect(a.groups).toHaveLength(13);
    expect(groupAt(a, 2, 3).count).toBe(8);
    expect(groupAt(a, 2, 3).cells).toHaveLength(3);
    expect(groupAt(a, 4, 0).count).toBe(19);
    expect(a.groups.every(g => g.match.status === 'unknown')).toBe(true);
    expect([a.found, a.headerSlots, a.checksumOk, a.canZero]).toEqual([24, 200, false, false]);
    expect(a.warnings).toContain('checksum');
    expect(a.coins).toBe(51060);
    expect(a.stashValue).toBe(752983);
  });
  it('munice: 7 z 7 sedí, ale filtrovaný pohled (bez maxima) nedovolí nulovat', () => {
    const a = analyzeShots([read(AMMO)], []);
    expect([a.found, a.headerSlots, a.checksumOk, a.canZero]).toEqual([7, 7, true, false]);
    expect(a.groups.map(g => g.count)).toEqual([6, 156, 179, 3]);
    expect(a.warnings).not.toContain('checksum');
  });
  it('zbraně bez počtu: každé políčko je jeden kus', () => {
    const a = analyzeShots([read(TOP)], []);
    expect(a.groups.reduce((x, g) => x + (g.count ?? 0), 0)).toBe(24);
    expect(a.groups.every(g => g.countSure)).toBe(true);
  });
  it('naučený otisk se pozná a skupina dostane výchozí cíl', () => {
    const r = read(TOOLTIP);
    const fp = r.cells.find(c => c.row === 2 && c.col === 3)!.fp;
    const a = analyzeShots([r], [{ id: 'l', itemKey: 'Magnetic Accelerator', kind: 'material', fp, rarity: 'epic', at: 1 }]);
    const g = groupAt(a, 2, 1);
    expect(g.match).toMatchObject({ status: 'known', itemKey: 'Magnetic Accelerator' });
    expect(defaultTarget(g, ['Magnetic Accelerator', 'Metal Parts'])).toEqual({ kind: 'material', name: 'Magnetic Accelerator' });
    expect(defaultTarget(groupAt(a, 0, 0), ['Magnetic Accelerator'])).toEqual({ kind: 'skip' });
  });
  it('dva posunuté snímky: spojí se bez zdvojení', () => {
    const src = loadFixture(TOOLTIP);
    const a = analyzeShots([readScreenshot(hideRowsFrom(src, 4)), readScreenshot(scrollRows(src, 2))], []);
    expect(a.found).toBe(24);
    expect(a.groups).toHaveLength(13);
    expect(groupAt(a, 2, 3).count).toBe(8);
  });
  it('snímky z různého stavu (jiná hodnota stashe) dají varování', () => {
    const a = analyzeShots([read(TOOLTIP), read(AMMO)], []);
    expect(a.warnings).toContain('differentState');
  });
  it('snímek bez inventory', () => {
    const blank = readScreenshot({ width: 320, height: 180, data: new Uint8ClampedArray(320 * 180 * 4) });
    const a = analyzeShots([blank], []);
    expect(a.warnings).toContain('noInventory');
    expect(a.groups).toEqual([]);
  });
});

describe('applyVisionImport', () => {
  const base = () => {
    const s = defaultState(NOW);
    s.inventory = { 'Magnetic Accelerator': 2, 'Metal Parts': 40, 'ARC Alloy': 3 };
    s.profile.coins = 1000;
    return s;
  };
  it('přepíše materiály přesným počtem, mince do profilu, ostatní se jen spočítají', () => {
    const a = analyzeShots([read(TOOLTIP)], []);
    const s = base();
    const sum = applyVisionImport(s, apply(a, [[groupAt(a, 2, 3), { kind: 'material', name: 'Magnetic Accelerator' }], [groupAt(a, 0, 0), { kind: 'skip' }]]), NOW);
    expect(s.inventory).toEqual({ 'Magnetic Accelerator': 8, 'Metal Parts': 40, 'ARC Alloy': 3 });
    expect(s.profile.coins).toBe(51060);
    expect(sum).toMatchObject({ materials: 1, zeroed: 0, coins: 51060, other: 1, newMaterials: 0 });
    expect(s.vision.lastImportAt).toBe(NOW);
    expect(s.vision.profile).toEqual({ cellPx: 96, ui: 1 });
  });
  it('mince se nezmění, když je volba vypnutá (coins null)', () => {
    const a = analyzeShots([read(TOOLTIP)], []);
    const s = base();
    applyVisionImport(s, apply(a, [], { coins: null }), NOW);
    expect(s.profile.coins).toBe(1000);
  });
  it('stejný materiál z více skupin se sečte', () => {
    const a = analyzeShots([read(TOOLTIP)], []);
    const s = base();
    applyVisionImport(s, apply(a, [[groupAt(a, 2, 3), { kind: 'material', name: 'ARC Alloy' }], [groupAt(a, 4, 0), { kind: 'material', name: 'ARC Alloy' }]]), NOW);
    expect(s.inventory['ARC Alloy']).toBe(27);
  });
  it('nový vlastní materiál se přidá do materialsCustom', () => {
    const a = analyzeShots([read(TOOLTIP)], []);
    const s = base();
    const sum = applyVisionImport(s, apply(a, [[groupAt(a, 4, 0), { kind: 'newMaterial', name: 'Zvláštní díl' }]]), NOW);
    expect(s.gameData.materialsCustom).toEqual([{ name: 'Zvláštní díl', category: 'Ostatní', source: '' }]);
    expect(s.inventory['Zvláštní díl']).toBe(19);
    expect(sum.newMaterials).toBe(1);
  });
  it('nulování chybějících jen při sedícím součtu a zapnuté volbě', () => {
    const a = analyzeShots([read(TOOLTIP)], []);
    const rows: [ImportGroup, Target][] = [[groupAt(a, 2, 3), { kind: 'material', name: 'Magnetic Accelerator' }]];
    const off = base(); applyVisionImport(off, apply(a, rows, { zeroMissing: false, canZero: true }), NOW);
    expect(off.inventory['Metal Parts']).toBe(40);
    const bad = base(); applyVisionImport(bad, apply(a, rows, { zeroMissing: true, canZero: false }), NOW);
    expect(bad.inventory['Metal Parts']).toBe(40);
    const ok = base(); const sum = applyVisionImport(ok, apply(a, rows, { zeroMissing: true, canZero: true }), NOW);
    expect(ok.inventory).toEqual({ 'Magnetic Accelerator': 8 });
    expect(sum.zeroed).toBe(2);
  });
  it('pojmenovaná neznámá skupina se naučí, přeskočená jako jiný předmět', () => {
    const a = analyzeShots([read(TOOLTIP)], []);
    const s = base();
    const sum = applyVisionImport(s, apply(a, [[groupAt(a, 2, 3), { kind: 'material', name: 'Magnetic Accelerator' }], [groupAt(a, 0, 0), { kind: 'skip' }]]), NOW);
    expect(sum.learned).toBe(2);
    expect(s.vision.learned.map(l => [l.itemKey, l.kind, l.rarity])).toEqual([['Magnetic Accelerator', 'material', 'epic'], ['', 'item', 'epic']]);
    /* další import téhož snímku už skupinu pozná */
    const b = analyzeShots([read(TOOLTIP)], s.vision.learned);
    expect(groupAt(b, 2, 2).match).toMatchObject({ status: 'known', itemKey: 'Magnetic Accelerator' });
    expect(defaultTarget(groupAt(b, 0, 1), [])).toEqual({ kind: 'skip' });
    /* poznaná skupina se znovu neučí */
    const again = applyVisionImport(s, apply(b, [[groupAt(b, 2, 2), { kind: 'material', name: 'Magnetic Accelerator' }]]), NOW + 1);
    expect(again.learned).toBe(0);
    expect(s.vision.learned).toHaveLength(2);
  });
  it('oprava rozpoznání přepíše dřívější naučený otisk', () => {
    const r = read(TOOLTIP);
    const fp = r.cells.find(c => c.row === 2 && c.col === 3)!.fp;
    const s = base();
    s.vision.learned = [{ id: 'old', itemKey: 'ARC Alloy', kind: 'material', fp, rarity: 'epic', at: 1 }];
    const a = analyzeShots([r], s.vision.learned);
    applyVisionImport(s, apply(a, [[groupAt(a, 2, 3), { kind: 'material', name: 'Magnetic Accelerator' }]]), NOW);
    expect(s.vision.learned.map(l => l.itemKey)).toEqual(['Magnetic Accelerator']);
  });
});

describe('addLearned', () => {
  /* pseudonáhodné otisky (navzájem nepodobné) */
  const fp = (seed: number) => { let x = seed * 2654435761 + 1; return Array.from({ length: FP_LEN }, () => { x = (x * 1103515245 + 12345) % 2147483648; return x % 256; }); };
  it('drží nejvýš 2000 otisků, nejstarší se odmažou', () => {
    let list: LearnedFp[] = Array.from({ length: LEARNED_MAX }, (_, i) => ({ id: 'x' + i, itemKey: 'M', kind: 'material' as const, fp: fp(i), at: i + 1 }));
    list = addLearned(list, { itemKey: 'N', kind: 'material', fp: fp(99999) }, NOW);
    expect(list).toHaveLength(LEARNED_MAX);
    expect(list.some(l => l.id === 'x0')).toBe(false);
    expect(list[list.length - 1]).toMatchObject({ itemKey: 'N', at: NOW });
  });
});

describe('store: zápis ze snímku', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });
  async function makeApp() {
    const kv = memoryKV();
    const s = defaultState(NOW);
    s.inventory = { 'Metal Parts': 40 };
    kv.setItem('arcops:state', JSON.stringify(s));
    const storage = createBrowserStorage(kv, () => NOW);
    const app = createApp(storage, { now: () => NOW });
    await app.init();
    return { app, storage, st: () => app.store.getState().state };
  }
  it('před zápisem vytvoří snímek stavu druhu import a pak zapíše', async () => {
    const { app, storage, st } = await makeApp();
    const a = analyzeShots([read(TOOLTIP)], []);
    const sum = await app.actions.importFromScreens(apply(a, [[groupAt(a, 2, 3), { kind: 'material', name: 'Magnetic Accelerator' }]]));
    expect(sum).toMatchObject({ materials: 1, coins: 51060 });
    expect(st().inventory['Magnetic Accelerator']).toBe(8);
    expect(st().profile.coins).toBe(51060);
    const snaps = (await storage.listSnapshots()).filter(x => x.kind === 'import');
    expect(snaps).toHaveLength(1);
    const before = JSON.parse(await storage.readSnapshot(snaps[0].name));
    expect(before.inventory).toEqual({ 'Metal Parts': 40 });
    expect(before.profile.coins).toBe(0);
    expect(st().vision.learned).toHaveLength(1);
  });
  it('když snímek stavu selže, nic se nezapíše', async () => {
    const { app, storage, st } = await makeApp();
    storage.createSnapshot = async () => { throw new Error('Disk je plný'); };
    const a = analyzeShots([read(TOOLTIP)], []);
    const sum = await app.actions.importFromScreens(apply(a, [[groupAt(a, 2, 3), { kind: 'material', name: 'Magnetic Accelerator' }]]));
    expect(sum).toBeNull();
    expect(st().inventory).toEqual({ 'Metal Parts': 40 });
  });
  it('smazání naučených otisků', async () => {
    const { app, st } = await makeApp();
    const a = analyzeShots([read(TOOLTIP)], []);
    await app.actions.importFromScreens(apply(a, [[groupAt(a, 2, 3), { kind: 'material', name: 'Magnetic Accelerator' }]]));
    expect(st().vision.learned.length).toBe(1);
    app.actions.clearLearned();
    expect(st().vision.learned).toEqual([]);
  });
});
