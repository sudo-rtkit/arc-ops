/* Katalog buildů ve storu: načtení jako plán, rozdání podle plánu, uložení jako vlastní build. Schéma zůstává 6:
   klíč „catalog:…“ je jen nová platná hodnota activePlan; starší stavy a zálohy se načtou beze ztráty. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { normalize, SCHEMA } from '../../src/core/state';
import { BUILD_CATALOG } from '../../src/core/data/builds';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();
const bul = BUILD_CATALOG.find(b => b.id === 'buldozer')!;

async function app(content?: unknown) {
  const kv = memoryKV();
  if (content !== undefined) kv.setItem('arcops:state', JSON.stringify(content));
  const a = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW });
  await a.init();
  return a;
}

describe('katalog buildů ve storu', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('schéma je 7 (0.9.0 přidalo okno a připnuté úkoly)', () => { expect(SCHEMA).toBe(10); });

  it('načíst jako plán a rozdat body: strom = přesně build (76 i varianta 91)', async () => {
    const a = await app({ schema: 6, profile: { level: 75, expBonus: 0 } });
    a.actions.setPlan('catalog:buldozer');
    expect(a.store.getState().state.skills.activePlan).toBe('catalog:buldozer');
    expect(a.actions.planFill()).toBe(76);
    expect(a.store.getState().state.skills.current).toEqual(bul.points);
    a.actions.setProfile('expBonus', 15);
    a.actions.setPlan('catalog:buldozer:91');
    expect(a.actions.planFill()).toBe(15);
    expect(a.store.getState().state.skills.current).toEqual(bul.variant91);
  });

  it('neplatný klíč katalogu se nenastaví', async () => {
    const a = await app();
    a.actions.setPlan('catalog:nope');
    a.actions.setPlan('catalog:expedition-pvp:91');
    expect(a.store.getState().state.skills.activePlan).toBe('runner');
  });

  it('uložit jako můj build: nový uložený build s body z katalogu, strom beze změny', async () => {
    const a = await app({ schema: 6, skills: { current: { m_lungs: 1 }, builds: [{ id: 'old', name: 'Můj', note: '', points: { c_used: 1 } }] } });
    a.actions.saveBuild('Buldozer (91)', 'Z katalogu: Buldozer (91)', bul.variant91!);
    const s = a.store.getState().state.skills;
    expect(s.builds).toHaveLength(2);
    expect(s.builds[0]).toEqual({ id: 'old', name: 'Můj', note: '', points: { c_used: 1 } });
    expect(s.builds[1].points).toEqual(bul.variant91);
    expect(s.current).toEqual({ m_lungs: 1 });
  });

  it('normalizace: klíč katalogu přežije uložení, neznámý spadne na runner, staré plány zůstávají', () => {
    expect(normalize({ skills: { activePlan: 'catalog:buldozer:91' } }, NOW).skills.activePlan).toBe('catalog:buldozer:91');
    expect(normalize({ skills: { activePlan: 'catalog:pvp-fighter' } }, NOW).skills.activePlan).toBe('catalog:pvp-fighter');
    expect(normalize({ skills: { activePlan: 'catalog:zzz' } }, NOW).skills.activePlan).toBe('runner');
    expect(normalize({ skills: { activePlan: 'looter' } }, NOW).skills.activePlan).toBe('looter');
    const st = normalize({ schema: 5, skills: { activePlan: 'build:b1', current: { c_used: 1 }, builds: [{ id: 'b1', name: 'X', note: 'n', points: { c_used: 1, c_mule: 2 } }] } }, NOW);
    expect(st.skills.activePlan).toBe('build:b1');
    expect(st.skills.builds).toEqual([{ id: 'b1', name: 'X', note: 'n', points: { c_used: 1, c_mule: 2 } }]);
  });
});
