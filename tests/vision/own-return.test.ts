/* 0.8.1: skutečné snímky hráče po raidu a obrazovky postupu (jen lokálně, složka own/ je v .gitignore). Bez
   složky se testy přeskočí, takže čerstvý klon projde. Ručně odečtené hodnoty: own/return-and-progression/
   expected-manual.json (return-findings: BACKPACK 14/14, QUICK USE 4/4, hodnota loadoutu 55 551 = NE mince ani
   výdělek, váha 51/35). Rozložení buněk níže je ruční odečet téhož snímku (počet nebo tier + vzácnost). */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FIXTURES } from './load';
import type { RgbaImage } from '../../src/core/vision/image';
import type { PanelRead } from '../../src/core/vision/read';
import { readCapture, screenKind } from '../../src/core/opsCapture';
import { analyzeLoot } from '../../src/core/visionImport';
import { applyRaidLoot, checkRaidLoot, lootItems, lootRows, lootSignature } from '../../src/core/lootImport';
import { matchContext } from '../../src/core/catalog';
import { getMaterials } from '../../src/core/gamedata';
import { defaultState } from '../../src/core/state';
import { itemKey } from '../../src/core/types';

const DIR = FIXTURES + 'own/return-and-progression/';
const HAS = existsSync(DIR + 'expected-manual.json') && existsSync(DIR + 'return-findings.png');
const OLD = FIXTURES + 'own/';
const exp = HAS ? JSON.parse(readFileSync(DIR + 'expected-manual.json', 'utf8')) : {};
const cache = new Map<string, RgbaImage>();
const load = (path: string): RgbaImage => {
  if (!cache.has(path)) { const p = PNG.sync.read(readFileSync(path)); cache.set(path, { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }); }
  return cache.get(path)!;
};
const R: Record<string, string> = { common: 'c', uncommon: 'u', rare: 'r', epic: 'e', legendary: 'l', unknown: '?' };
function tokens(p: PanelRead): (string | null)[][] {
  return Array.from({ length: p.grid.rows }, (_, row) => Array.from({ length: p.grid.cols }, (_, col) => {
    if (p.hidden.some(h => h.row === row && h.col === col)) return 'H';
    const c = p.cells.find(x => x.row === row && x.col === col);
    return c ? `${c.count ?? c.tier ?? '-'}${R[c.rarity]}` : null;
  }));
}
/* ruční odečet return-findings.png */
const BACKPACK = [['2c', '60c', '1r', '3u'], ['-e', '80c', '80c', 'IVr'], ['80c', '1r', '3u', '3r'], ['80c', 'Ir', null, null]];
const QUICK = [['1r', '3u', '4c'], ['2u', null, null]];
const CTX = matchContext(getMaterials(defaultState()).map(m => m.name));

describe.skipIf(!HAS)('vlastní snímek po raidu: return-findings.png (1920×1080)', () => {
  const img = () => load(DIR + 'return-findings.png');
  const read = () => { const r = readCapture(img()); if (r.kind !== 'read') throw new Error('nečteno'); return r; };

  it('rozměr a druh obrazovky: FINDINGS → loot (dřív se odmítal, protože chyběl STASH)', () => {
    expect([img().width, img().height]).toEqual(exp.resolution);
    expect(screenKind(img())).toBe('findings');
    expect(read().screen).toBe('loot');
    expect(read().read.panels.map(p => p.panel)).toEqual(['backpack', 'quickUse']);
  });

  it('všechna viditelná políčka a počty: BACKPACK 14/14, QUICK USE 4/4', () => {
    const r = read().read;
    const bp = r.panels.find(p => p.panel === 'backpack')!, qu = r.panels.find(p => p.panel === 'quickUse')!;
    expect([bp.slots, bp.slotsMax]).toEqual([exp['return-findings'].backpackSlots, 14]);
    expect([qu.slots, qu.slotsMax]).toEqual([exp['return-findings'].quickUseSlots, 4]);
    expect(bp.cells).toHaveLength(14);
    expect(qu.cells).toHaveLength(4);
    expect(tokens(bp)).toEqual(BACKPACK);
    expect(tokens(qu)).toEqual(QUICK);
    expect([bp.hidden, qu.hidden, bp.empty, qu.empty].map(x => x.length)).toEqual([0, 0, 0, 0]);
    expect(r.warnings).not.toContain('countUnreadable');
  });

  it('hodnota loadoutu 55 551 ani váha 51/35 se nikde nečtou jako mince nebo výdělek', () => {
    const r = read().read;
    expect([r.coins, r.premium, r.stashValue]).toEqual([null, null, null]);
    expect(JSON.stringify(r)).not.toContain(String(exp['return-findings'].loadoutValue));
  });

  it('rozpoznání skupin z katalogu: známé názvy, neznámé zůstanou ke kontrole (ne hádání)', () => {
    const a = analyzeLoot(read().read, [], CTX);
    expect(a.groups.reduce((n, g) => n + g.cells.length, 0)).toBe(18);
    const named = Object.fromEntries(a.groups.filter(g => g.match.status === 'known').map(g => [itemKey(g.match.itemKey!, g.tier ?? undefined), g.count]));
    /* čtyři políčka Medium Ammo po 80 = 320; Anvil s tierem I */
    expect(named['Medium Ammo']).toBe(320);
    expect(named['Anvil I']).toBe(1);
    expect(named['Bandage']).toBe(2);
    expect(named['Adrenaline Shot']).toBe(4);
    /* epický předmět bez počtu a zbraň IV se neodhadují */
    expect(a.groups.filter(g => g.match.status === 'unknown').length).toBeGreaterThanOrEqual(2);
    expect(a.groups.reduce((n, g) => n + (g.count ?? 0), 0)).toBe(2 + 60 + 1 + 3 + 1 + 320 + 1 + 1 + 3 + 3 + 1 + 1 + 3 + 4 + 2);
  });

  it('odečtení výbavy: co hráč přinesl, se nezapíše jako loot; bez výbavy je nutná ruční kontrola', () => {
    const r = read().read;
    const a = analyzeLoot(r, [], CTX);
    const rows = lootRows(a.groups.filter(g => g.match.status === 'known').map(g => ({ id: g.id, name: itemKey(g.match.itemKey!, g.tier ?? undefined), qty: g.count ?? 1 })),
      [{ name: 'Medium Ammo', qty: 160 }, { name: 'Anvil I', qty: 1 }, { name: 'Bandage', qty: 2 }]);
    const items = lootItems(rows);
    expect(items.find(x => x.name === 'Medium Ammo')!.qty).toBe(160);
    expect(items.some(x => x.name === 'Anvil I' || x.name === 'Bandage')).toBe(false);
    const s = defaultState();
    s.profile.coins = exp.profile.coins;
    const sig = lootSignature(r);
    expect(checkRaidLoot(s, { raidId: null, items, replace: false, toInventory: false, gearChecked: false }, sig)).toBe('gearUnchecked');
    applyRaidLoot(s, { raidId: null, items, replace: false, toInventory: false, gearChecked: true }, sig, 1, 'R');
    expect(s.profile.coins).toBe(exp.profile.coins);
    expect(s.raids[0].coins).toBe(0);
    expect(checkRaidLoot(s, { raidId: 'R', items, replace: true, toInventory: false, gearChecked: true }, lootSignature(read().read))).toBe('duplicate');
  });
});

describe.skipIf(!HAS)('vlastní snímky: ostatní obrazovky se odmítnou (import postupu je navazující práce)', () => {
  const others = ['profile.png', 'skill-tree.png', 'skill-marathon-max.png', 'skill-looters-partial.png', 'quest-shoring.png', 'quest-battening.png', 'workshop-overview.png', 'gear-level.png', 'gunsmith-level.png'];
  it.each(others)('%s: bez inventáře, nic se nečte', f => {
    expect(readCapture(load(DIR + f))).toEqual({ kind: 'empty', reason: 'noInventory' });
  });
  it('MANAGE LOADOUT před raidem (zástupné ikony) není FINDINGS', () => {
    if (!existsSync(OLD + 'own-prerade-free-loadout.png')) return;
    expect(readCapture(load(OLD + 'own-prerade-free-loadout.png'))).toEqual({ kind: 'empty', reason: 'otherScreen' });
  });
  it('starší snímky FINDINGS: přežitý → loot, KNOCKED OUT → loot bez položek', () => {
    if (!existsSync(OLD + 'own-after-raid-knocked-out.png')) return;
    const ko = readCapture(load(OLD + 'own-after-raid-knocked-out.png'));
    expect(ko).toMatchObject({ kind: 'read', screen: 'loot' });
    if (ko.kind === 'read') expect(analyzeLoot(ko.read, [], CTX).empty).toBe(true);
    const ok = readCapture(load(OLD + 'own-after-raid-survived-findings.png'));
    expect(ok).toMatchObject({ kind: 'read', screen: 'loot' });
    if (ok.kind === 'read') expect(ok.read.panels.find(p => p.panel === 'backpack')!.cells).toHaveLength(14);
  });
  it('INVENTORY se STASH zůstává stash (čte se jen STASH)', () => {
    if (!existsSync(OLD + 'own-all-1-top.png')) return;
    const r = readCapture(load(OLD + 'own-all-1-top.png'));
    expect(r).toMatchObject({ kind: 'read', screen: 'stash' });
    if (r.kind === 'read') expect(r.read.panels.map(p => p.panel)).toEqual(['stash']);
  });

  /* Navazující práce (zatím jen evidence, žádný import): hodnoty jsou v expected-manual.json. */
  it.todo('profil: level 20, XP 2977/29000, mince 58 313 (import profilu ze snímku)');
  it.todo('skill tree: součty větví 0/17/4 (jednotlivé ranky nejsou vidět, nic neodvozovat)');
  it.todo('skill-marathon-max: Marathon Runner V bez šipky (aktuální rank 5)');
  it.todo('skill-looters-partial: Looter’s Instincts III→IV, uzel 3/5 (IV je návrh, ne aktuální rank)');
  it.todo('úkoly Shoring Up Defenses a Battening Down: zaškrtnuté cíle, nesplněné');
  it.todo('dílna: Gear Bench a Gunsmith úroveň 1 a materiály na další úroveň');
});
