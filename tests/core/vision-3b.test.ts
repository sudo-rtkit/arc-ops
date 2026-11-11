/* Milník 3b nad vzorovými snímky (v repozitáři): katalog MetaForge (názvy, otisky), přiřazení názvu z tooltipu,
   evidence předmětů (Vybavení), loot z batohu a quick use, odečtení výbavy. Názvy předmětů na vzorcích ověřené
   okem proti ikonám katalogu (Light/Heavy Ammo, Bandage, Shield Recharger). */
import { describe, expect, it } from 'vitest';
import { loadFixture, AMMO, TOOLTIP, TOP } from '../vision/load';
import { readScreenshot, type ScreenRead } from '../../src/core/vision/read';
import { analyzeLoot, analyzeShots, applyVisionImport, defaultTarget, lootMinusGear, mergeLoot, type ImportAnalysis, type ImportGroup, type Target, type VisionApply } from '../../src/core/visionImport';
import { catalogByName, catalogCount, catalogItems, categoryFromTag, matchContext, matchName } from '../../src/core/catalog';
import { CATALOG } from '../../src/core/data/catalog';
import { FP_LEN } from '../../src/core/vision/fingerprint';
import { getMaterials } from '../../src/core/gamedata';
import { defaultState } from '../../src/core/state';
import { makeBackup } from '../../src/core/backup';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();
const MATS = getMaterials(defaultState(NOW)).map(m => m.name);
const CTX = matchContext(MATS);
const reads = new Map<string, ScreenRead>();
const read = (f: string): ScreenRead => { if (!reads.has(f)) reads.set(f, readScreenshot(loadFixture(f))); return reads.get(f)!; };
const groupAt = (a: { groups: ImportGroup[] }, row: number, col: number) => a.groups.find(g => g.cells.some(c => c.row === row && c.col === col && c.shot === 0))!;
const apply = (a: ImportAnalysis, extra: Partial<VisionApply> = {}, targets?: [ImportGroup, Target][]): VisionApply => ({
  rows: (targets ?? a.groups.map(g => [g, defaultTarget(g, MATS)] as [ImportGroup, Target])).map(([group, target]) => ({ group, target, count: group.count ?? 0 })),
  coins: null, zeroMissing: false, canZero: a.canZero, profile: a.profile, ...extra,
});

describe('katalog', () => {
  it('obsahuje názvy, kategorie a otisky ikon (bez obrázků)', () => {
    const c = catalogCount();
    expect(c.items).toBe(CATALOG.length);
    expect(c.items).toBeGreaterThan(500);
    expect(c.withFp).toBeGreaterThan(400);
    for (const x of catalogItems().filter(x => x.fp)) expect(x.fp!.length).toBe(FP_LEN);
    expect(catalogByName('fabric')).toMatchObject({ name: 'Fabric', category: 'material', rarity: 'common' });
    expect(catalogByName('Grappling Hook')).toMatchObject({ category: 'quickUse', rarity: 'uncommon' });
    /* zbraně bez tieru v názvu (tier se čte z políčka) */
    expect(catalogByName('Anvil')).toMatchObject({ category: 'weapon' });
    expect(catalogByName('Anvil I')).toBeUndefined();
  });
  it('přibližné přiřazení názvu z tooltipu', () => {
    const names = catalogItems().map(x => x.name);
    expect(matchName('MAGNETIC ACCELERATOR', names)?.name).toBe('Magnetic Accelerator');
    expect(matchName('CPUDE EXPLOSIVES', names)?.name).toBe('Crude Explosives');
    expect(matchName('GRAPPLIN? HOOK', names)?.name).toBe('Grappling Hook');
    expect(matchName('?IRES', names)?.name).toBe('Wires');
    expect(matchName('XQZKJWV', names)).toBeNull();
    expect(categoryFromTag('QUICKUSE')).toBe('quickUse');
    expect(categoryFromTag('TOPSIDE MATERIAL')).toBe('material');
  });
});

describe('rozpoznání s katalogem a tooltipem', () => {
  it('tooltip pojmenuje své políčko i ostatní políčka se stejnou ikonou', () => {
    const a = analyzeShots([read(TOOLTIP)], [], CTX);
    const g = groupAt(a, 2, 3);
    expect(g.cells.map(c => `${c.row},${c.col}`)).toEqual(['2,1', '2,2', '2,3']);
    expect(g.match).toMatchObject({ status: 'known', itemKey: 'Magnetic Accelerator', kind: 'material', source: 'tooltip' });
    expect(defaultTarget(g, MATS)).toEqual({ kind: 'material', name: 'Magnetic Accelerator' });
  });
  it('bez kontextu (katalog, názvy) se tooltip ani katalog nepoužijí', () => {
    const a = analyzeShots([read(TOOLTIP)], []);
    expect(a.groups.every(g => g.match.status === 'unknown')).toBe(true);
  });
  it('munice z katalogu: předměty do Vybavení s kategorií munice', () => {
    const a = analyzeShots([read(AMMO)], [], CTX);
    expect(a.groups.map(g => [g.match.itemKey, g.count])).toEqual([['Launcher Ammo', 6], ['Light Ammo', 156], ['Medium Ammo', 179], ['Shotgun Ammo', 3]]);
    expect(a.groups.every(g => g.match.source === 'catalog' && g.match.status === 'known')).toBe(true);
    expect(defaultTarget(groupAt(a, 0, 1), MATS)).toEqual({ kind: 'item', name: 'Light Ammo', category: 'ammo' });
  });
  it('zbraně: klíč předmětu je název + tier', () => {
    const a = analyzeShots([read(TOP)], [], CTX);
    const anvil = a.groups.find(g => g.match.itemKey === 'Anvil');
    expect(anvil?.tier).toBe('I');
    const s = defaultState(NOW);
    applyVisionImport(s, apply(a), NOW);
    expect(s.items['Anvil I']).toEqual({ key: 'Anvil I', name: 'Anvil', category: 'weapon', tier: 'I', count: 1 });
    expect(Object.values(s.items).every(x => x.category !== undefined)).toBe(true);
  });
});

describe('zápis do Vybavení', () => {
  it('přepíše počty rozpoznaných předmětů, učí otisky, ostatní nechá', () => {
    const a = analyzeShots([read(AMMO)], [], CTX);
    const s = defaultState(NOW);
    s.items = { 'Light Ammo': { key: 'Light Ammo', name: 'Light Ammo', category: 'ammo', count: 999 }, Wolfpack: { key: 'Wolfpack', name: 'Wolfpack', category: 'quickUse', count: 2 } };
    const sum = applyVisionImport(s, apply(a), NOW);
    expect(sum).toMatchObject({ items: 4, materials: 0, other: 0 });
    expect(s.items['Light Ammo'].count).toBe(156);
    expect(s.items['Medium Ammo']).toEqual({ key: 'Medium Ammo', name: 'Medium Ammo', category: 'ammo', count: 179 });
    expect(s.items.Wolfpack.count).toBe(2);
    /* shoda z katalogu se naučí (otisk ze hry) a příště se pozná jako naučená */
    expect(sum.learned).toBe(4);
    expect(s.vision.learned.map(l => [l.itemKey, l.kind])).toContainEqual(['Light Ammo', 'item']);
    const b = analyzeShots([read(AMMO)], s.vision.learned, CTX);
    expect(groupAt(b, 0, 1).match.source).toBe('learned');
    expect(applyVisionImport(s, apply(b), NOW + 1).learned).toBe(0);
  });
  it('„chybějící na 0“ vynuluje i předměty, které na snímcích nejsou', () => {
    const a = analyzeShots([read(AMMO)], [], CTX);
    const s = defaultState(NOW);
    s.items = { Wolfpack: { key: 'Wolfpack', name: 'Wolfpack', category: 'quickUse', count: 2 } };
    s.inventory = { 'Metal Parts': 5 };
    const sum = applyVisionImport(s, apply(a, { zeroMissing: true, canZero: true }), NOW);
    expect(s.items.Wolfpack).toBeUndefined();
    expect(s.inventory['Metal Parts']).toBeUndefined();
    expect(sum.zeroed).toBe(2);
  });
  it('materiál z katalogu, který aplikace nevede, se nabídne jako nový vlastní materiál', () => {
    const g = { ...analyzeShots([read(AMMO)], [], CTX).groups[0], match: { status: 'known' as const, itemKey: 'Battery', kind: 'material' as const, score: 0.98, source: 'catalog' as const } };
    expect(defaultTarget(g, MATS)).toEqual({ kind: 'newMaterial', name: 'Battery' });
  });
  it('záloha obsahuje evidenci vybavení', () => {
    const s = defaultState(NOW);
    s.items = { 'Anvil II': { key: 'Anvil II', name: 'Anvil', category: 'weapon', tier: 'II', count: 1 } };
    expect(JSON.parse(makeBackup(s, new Date(NOW))).state.items).toEqual(s.items);
  });
});

describe('loot ze snímku (batoh a quick use)', () => {
  it('vzorový snímek: batoh 2/14 (64, 8), quick use 2/4 (2, 1), názvy z katalogu', () => {
    const l = analyzeLoot(read(AMMO), [], CTX);
    expect(l.backpack).toEqual({ slots: 2, max: 14, cells: 2 });
    expect(l.quickUse).toEqual({ slots: 2, max: 4, cells: 2 });
    expect(l.empty).toBe(false);
    expect(l.groups.map(g => [g.cells[0].panel, g.match.itemKey, g.count])).toEqual([
      ['backpack', 'Light Ammo', 64], ['backpack', 'Heavy Ammo', 8], ['quickUse', 'Bandage', 2], ['quickUse', 'Shield Recharger', 1],
    ]);
  });
  it('od nalezeného se odečte výbava, sloučí se se zapsaným lootem', () => {
    const found = [{ name: 'Light Ammo', qty: 64 }, { name: 'Heavy Ammo', qty: 8 }, { name: 'Bandage', qty: 2 }, { name: 'Shield Recharger', qty: 1 }];
    const gear = [{ name: 'bandage', qty: 3 }, { name: 'Light Ammo', qty: 30 }, { name: 'Ferro II', qty: 1 }];
    const left = lootMinusGear(found, gear);
    expect(left).toEqual([{ name: 'Light Ammo', qty: 34 }, { name: 'Heavy Ammo', qty: 8 }, { name: 'Shield Recharger', qty: 1 }]);
    expect(mergeLoot([{ name: 'Metal Parts', qty: 3 }, { name: 'heavy ammo', qty: 2 }], left)).toEqual([
      { name: 'Metal Parts', qty: 3 }, { name: 'heavy ammo', qty: 10 }, { name: 'Light Ammo', qty: 34 }, { name: 'Shield Recharger', qty: 1 },
    ]);
  });
  it('snímek bez batohu', () => {
    const l = analyzeLoot(readScreenshot({ width: 320, height: 180, data: new Uint8ClampedArray(320 * 180 * 4) }), [], CTX);
    expect([l.noBackpack, l.empty, l.groups.length]).toEqual([true, false, 0]);
  });
});

describe('store: Vybavení', () => {
  async function makeApp() {
    const kv = memoryKV();
    kv.setItem('arcops:state', JSON.stringify(defaultState(NOW)));
    const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW });
    await app.init();
    return { app, st: () => app.store.getState().state };
  }
  it('přidání, změna počtu, přejmenování (nový klíč), smazání, reset Inventory', async () => {
    const { app, st } = await makeApp();
    expect(app.actions.itemSave({ name: ' Anvil ', category: 'weapon', tier: 'II', count: 1 })).toBe('Anvil II');
    expect(st().items['Anvil II']).toEqual({ key: 'Anvil II', name: 'Anvil', category: 'weapon', tier: 'II', count: 1 });
    expect(app.actions.itemSetCount('Anvil II', 4)).toBe(4);
    expect(st().items['Anvil II'].count).toBe(4);
    app.actions.itemSave({ name: 'Anvil', category: 'weapon', tier: 'III', count: 4 }, 'Anvil II');
    expect(Object.keys(st().items)).toEqual(['Anvil III']);
    expect(app.actions.itemSave({ name: '   ', category: 'other', count: 1 })).toBeNull();
    app.actions.itemSave({ name: 'Wolfpack', category: 'quickUse', count: 2 });
    app.actions.itemSetCount('Wolfpack', 0);
    expect(st().items.Wolfpack).toBeUndefined();
    app.actions.itemDelete('Anvil III');
    expect(st().items).toEqual({});
    app.actions.itemSave({ name: 'Light Ammo', category: 'ammo', count: 50 });
    await app.actions.resetModule('inventory');
    expect(st().items).toEqual({});
  });
});
