/* Schéma 3 (milník 3a): nové items (pro 3b) a vision. Starší stav, zálohy a deník v1 se načtou beze ztrát. */
import { describe, expect, it } from 'vitest';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup, ERR_NEWER } from '../../src/core/backup';
import { importV1 } from '../../src/core/importV1';
import { FP_LEN } from '../../src/core/vision/fingerprint';
import { LEARNED_MAX, itemKey } from '../../src/core/types';
import { SAMPLE_V1 } from './sample';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();
const fp = (v: number) => new Array(FP_LEN).fill(v);

const S2 = {
  schema: 2,
  meta: { createdAt: 5, updatedAt: 6, importedFrom: null },
  profile: { level: 30, coins: 120000, xp: 10, xpNext: 100, rounds: 40, expBonus: 2, rewardPass: 12, amplified: 0 },
  inventory: { 'Metal Parts': 12, 'ARC Alloy': 3 },
  gameData: { materialsCustom: [{ name: 'Moje součástka', category: 'Ostatní', source: '' }] },
  settings: { autoSnapshot: false, lang: 'en' },
};

describe('schéma 3 (dnes 5)', () => {
  it('výchozí stav (aktuálně schéma 5) má prázdné items a vision', () => {
    const s = defaultState(NOW);
    expect(SCHEMA).toBe(7);
    expect(s.schema).toBe(7);
    expect(s.items).toEqual({});
    expect(s.vision).toEqual({ learned: [], profile: null, lastImportAt: 0 });
  });
  it('migrace 2 → 4 doplní items a vision a nic neztratí', () => {
    const s = normalize(S2, NOW);
    expect(s.schema).toBe(7);
    expect(s.items).toEqual({});
    expect(s.vision.learned).toEqual([]);
    expect(s.profile.coins).toBe(120000);
    expect(s.inventory).toEqual({ 'Metal Parts': 12, 'ARC Alloy': 3 });
    expect(s.gameData.materialsCustom[0].name).toBe('Moje součástka');
    expect(s.settings).toEqual({ autoSnapshot: false, lang: 'en' });
  });
  it('záloha schématu 2 se načte, schéma 8 je novější verze', () => {
    const p = parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 2, exportedAt: 'x', state: S2 }), NOW);
    expect('error' in p ? p.error : p.state.inventory).toEqual({ 'Metal Parts': 12, 'ARC Alloy': 3 });
    const raw = parseBackup(JSON.stringify(S2), NOW);
    expect('error' in raw ? raw.error : raw.kind).toBe('app');
    expect(parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 8, state: {} }))).toEqual({ error: ERR_NEWER });
  });
  it('deník v1 se převede na aktuální schéma', () => {
    const { state } = importV1(SAMPLE_V1, NOW);
    expect(state.schema).toBe(7);
    expect(state.vision.learned).toEqual([]);
    expect(normalize(JSON.parse(JSON.stringify(state)), NOW)).toEqual(state);
  });
  it('záloha obsahuje items i vision a vrátí je beze změny', () => {
    const s = defaultState(NOW);
    s.items = { 'Ferro II': { key: 'Ferro II', name: 'Ferro', category: 'weapon', tier: 'II', count: 1 } };
    s.vision = { learned: [{ id: 'l1', itemKey: 'ARC Alloy', kind: 'material', fp: fp(3), rarity: 'rare', at: 7 }], profile: { cellPx: 96, ui: 1 }, lastImportAt: 9 };
    const file = JSON.parse(makeBackup(s));
    expect(file.schema).toBe(7);
    expect(file.state.items).toEqual(s.items);
    expect(file.state.vision).toEqual(s.vision);
    const p = parseBackup(makeBackup(s), NOW);
    expect('error' in p ? p.error : p.state).toEqual(s);
  });
  it('normalizace vision zahodí vadné otisky a drží nejvýš 2000 nejnovějších', () => {
    const learned = Array.from({ length: LEARNED_MAX + 5 }, (_, i) => ({ id: 'x' + i, itemKey: 'M' + i, kind: 'material', fp: fp(1), at: i + 1 }));
    const s = normalize({ ...S2, vision: { learned: [...learned, { id: 'bad', itemKey: 'B', kind: 'material', fp: [1, 2], at: 99999 }, { id: 'k', itemKey: 'K', kind: 'nonsense', fp: fp(1), at: 99998 }], profile: { cellPx: 'x' }, lastImportAt: -4 } }, NOW);
    expect(s.vision.learned).toHaveLength(LEARNED_MAX);
    expect(s.vision.learned.some(l => l.id === 'bad' || l.id === 'k')).toBe(false);
    expect(s.vision.learned[0].id).toBe('x5');
    expect(s.vision.profile).toBeNull();
    expect(s.vision.lastImportAt).toBe(0);
  });
  it('items: klíč je název + tier, neplatné položky se zahodí', () => {
    expect(itemKey('Ferro', 'II')).toBe('Ferro II');
    expect(itemKey('Bandage')).toBe('Bandage');
    const s = normalize({ ...S2, items: { a: { name: 'Ferro', category: 'weapon', tier: 'II', count: 2 }, b: { name: '', category: 'weapon', count: 1 }, c: { name: 'Mystery', category: 'xx', tier: 'V', count: 0 } } }, NOW);
    expect(s.items).toEqual({ 'Ferro II': { key: 'Ferro II', name: 'Ferro', category: 'weapon', tier: 'II', count: 2 } });
  });
});
