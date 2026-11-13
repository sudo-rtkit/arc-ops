/* 0.18.0: karta předmětu „Proč to potřebuju?“ nad skutečnými daty. Wires: odevzdání v dostupném úkolu After Rain
   Comes (5×) a v zamčeném Clamoring for Attention (3×, později); Metal Parts: Gunsmith 1 (20×); Acoustic Guitar se
   recykluje na Metal Parts a Wires; typy míst Wires (Electrical, Technological) a body na mapě; plán raidu; neznámý
   předmět zůstane neznámý. Potřeba a rada sedí s Inventory (stejný výpočet). */
import { describe, expect, it } from 'vitest';
import { defaultState } from '../../src/core/state';
import { setQuestDone } from '../../src/core/quests';
import { itemCard, needRoute } from '../../src/core/itemCard';
import { adviseAll } from '../../src/core/advice';
import { emptyGoals } from '../../src/core/raidPrep';
import type { AppState, Poi } from '../../src/core/types';

const NOW = new Date(2026, 10, 13, 12, 0).getTime();
const TODAY = '2026-11-13';
function base(): AppState {
  const s = defaultState(NOW);
  /* After Rain Comes (ss10y) je dostupný po ss10s; Clamoring for Attention (prev ss10b) zůstane zamčený */
  s.quests.done = setQuestDone({}, 'ss10s', true, NOW);
  return s;
}
const poi = (id: string, area: string, name = ''): Poi => ({ id, name, note: '', type: 'crate', area, x: 0.5, y: 0.5 });

describe('karta předmětu: kde je potřeba', () => {
  it('Wires: dostupný úkol teď (do součtu), zamčený úkol později', () => {
    const s = base();
    s.inventory.Wires = 2;
    const c = itemCard(s, 'Wires', 'en', TODAY);
    const now = c.needs.find(n => n.key === 'quest:ss10y');
    expect(now).toMatchObject({ kind: 'quest', qty: 5, when: 'now', label: expect.stringContaining('After Rain Comes'), route: { module: 'quests', sub: 'q=ss10y' } });
    expect(now?.questItem).toBeUndefined();
    const later = c.needs.find(n => n.key === 'quest:clamoring_for_attention');
    expect(later).toMatchObject({ qty: 3, when: 'later' });
    expect(c.have).toBe(2);
    expect(c.need).toBeGreaterThanOrEqual(5);
    expect(c.missing).toBe(c.need - 2);
    /* potřeby teď jsou před pozdějšími */
    const idx = (k: string) => c.needs.findIndex(n => n.key === k);
    expect(idx('quest:ss10y')).toBeLessThan(idx('quest:clamoring_for_attention'));
  });

  it('součet a rada jsou stejné jako v Inventory (adviseAll)', () => {
    const s = base();
    s.inventory.Wires = 2;
    s.inventory['Metal Parts'] = 50;
    for (const name of ['Wires', 'Metal Parts']) {
      const c = itemCard(s, name, 'cs', TODAY);
      const a = adviseAll(s, TODAY, 'cs').get(name)!;
      expect(c.need).toBe(a.need);
      expect(c.verdict.basis).toBe('stock');
      if (c.verdict.basis === 'stock') {
        expect(c.verdict.advice.kind).toBe(a.kind);
        expect(c.verdict.advice.keep).toBe(a.keep);
        expect(c.verdict.advice.surplus).toBe(a.surplus);
      }
    }
  });

  it('Metal Parts: další úroveň Gunsmith (20×) teď, s cestou do Workshopu', () => {
    const s = base();
    s.stations.gunsmith = 0;
    const c = itemCard(s, 'metal parts', 'cs', TODAY);
    expect(c.name).toBe('Metal Parts');
    expect(c.needs.find(n => n.key === 'station:gunsmith:1')).toMatchObject({ kind: 'station', qty: 20, when: 'now', label: 'Gunsmith 1', route: { module: 'workshop', sub: 'gunsmith' } });
    /* po vylepšení už Gunsmith 1 mezi potřebami není */
    s.stations.gunsmith = 1;
    expect(itemCard(s, 'Metal Parts', 'cs', TODAY).needs.some(n => n.key === 'station:gunsmith:1')).toBe(false);
  });

  it('cíl stanice z Planneru (další úrovně) se počítá teď, bez dvojího počítání', () => {
    const s = base();
    s.stations.gunsmith = 0;
    s.planner.stations.gunsmith = 1;
    const c = itemCard(s, 'Metal Parts', 'cs', TODAY);
    expect(c.needs.filter(n => n.key === 'station:gunsmith:1')).toHaveLength(1);
  });

  it('bez zásoby: rada pro nalezený kus (příprava na raid)', () => {
    const c = itemCard(base(), 'Wires', 'cs', TODAY);
    expect(c.have).toBe(0);
    expect(c.verdict.basis).toBe('found');
    if (c.verdict.basis === 'found') expect(c.verdict.verdict.kind).toBe('keep');
  });

  it('aktivní plán raidu ukáže řádek seznamu', () => {
    const s = base();
    s.raidPlan = { goals: { ...emptyGoals(), quests: ['ss10y'] }, map: 'dam', loadout: '', route: '', startedAt: NOW, sig: '', found: ['Wires'], snap: null, open: [] };
    const c = itemCard(s, 'Wires', 'en', TODAY);
    expect(c.plan).toMatchObject({ need: 5, have: 0, missing: 5, found: true });
    expect(itemCard(base(), 'Wires', 'en', TODAY).plan).toBeNull();
  });
});

describe('karta předmětu: údaje, recyklace, místa', () => {
  it('údaje z dat: vzácnost, hodnota, hmotnost, stack, typ', () => {
    const c = itemCard(base(), 'Wires', 'cs', TODAY);
    expect(c).toMatchObject({ known: true, rarity: 'uncommon', value: 200, weight: 0.25, stack: 15, type: 'Topside Material' });
  });

  it('recyklace tam i zpět', () => {
    const guitar = itemCard(base(), 'Acoustic Guitar', 'cs', TODAY);
    expect(guitar.recycle).toEqual([['Metal Parts', 4], ['Wires', 6]]);
    const wires = itemCard(base(), 'Wires', 'cs', TODAY);
    expect(wires.recycle).toEqual([['Rubber Parts', 2]]);
    expect(wires.recycleFrom.find(r => r.name === 'Acoustic Guitar')?.qty).toBe(6);
  });

  it('typy míst z katalogu a body na vlastních mapách se stejným typem', () => {
    const s = base();
    s.maps.dam = { ...s.maps.dam, pois: [poi('p1', 'Electrical', 'Substation'), poi('p2', 'Nature')] };
    const c = itemCard(s, 'Wires', 'cs', TODAY);
    expect([...c.areas].sort()).toEqual(['Electrical', 'Technological']);
    expect(c.pois).toEqual([{ map: 'dam', mapName: 'Dam Battlegrounds', id: 'p1', name: 'Substation', area: 'Electrical' }]);
  });

  it('neznámý předmět: nic se nedomýšlí', () => {
    const s = base();
    s.inventory['Mystery Gizmo'] = 1;
    const c = itemCard(s, 'Mystery Gizmo', 'cs', TODAY);
    expect(c).toMatchObject({ known: false, rarity: 'unknown', value: null, weight: null, stack: null, type: null, needsBlueprint: null, areas: [], pois: [], recycle: [], need: 0, have: 1 });
    expect(c.verdict.basis === 'stock' && c.verdict.advice.kind).toBe('unknown');
  });

  it('cesty zdrojů potřeb', () => {
    expect(needRoute('quest', 'quest:ss10y')).toEqual({ module: 'quests', sub: 'q=ss10y' });
    expect(needRoute('station', 'station:gear:2')).toEqual({ module: 'workshop', sub: 'gear' });
    expect(needRoute('project', 'project:x:1')).toEqual({ module: 'quests', sub: 'projects' });
    expect(needRoute('goal', 'goal:g1')).toEqual({ module: 'dashboard', sub: 'goals' });
    expect(needRoute('craft', 'craft:a')).toEqual({ module: 'inventory', sub: 'planner' });
    expect(needRoute('blueprint', 'blueprint:x')).toEqual({ module: 'items', sub: 'blueprints' });
  });
});
