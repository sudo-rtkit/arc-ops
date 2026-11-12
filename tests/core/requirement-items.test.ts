/* 0.13.1: každý předmět z požadavků úkolů, workshopu a projektů (ARC Tracker) jde spočítat v Inventory, takže s ním
   počítá nákupní seznam, Planner i postup. Materiál nebo loot je materiál aplikace (Zásoba), klíč a předmět k použití
   se evidují ve Vybavení. Po přegenerování dat (scripts/gen-arctracker.mjs) tento test ohlásí nový předmět, kterému
   je potřeba dát kategorii v src/core/data/materials.ts. */
import { describe, expect, it } from 'vitest';
import { AT_HIDEOUT, AT_PROJECTS, AT_QUESTS } from '../../src/core/data/arctracker';
import { MATERIAL_CATEGORIES, MATERIAL_CATEGORY } from '../../src/core/data/materials';
import { defaultState } from '../../src/core/state';
import { getMaterials } from '../../src/core/gamedata';
import { catalogByName, catalogFps } from '../../src/core/catalog';
import { haveOf, stockOf } from '../../src/core/compact';
import { shopping } from '../../src/core/workshop';
import { planNeeds } from '../../src/core/planner';

const NOW = 1_800_000_000_000;
const EQUIPMENT = new Set(['weapon', 'shield', 'augment', 'ammo', 'quickUse', 'key']);
const required = [...new Set([
  ...AT_QUESTS.flatMap(q => q.deliver),
  ...AT_HIDEOUT.flatMap(m => m.levels.flatMap(l => l.req)),
  ...AT_PROJECTS.flatMap(p => p.phases.flatMap(ph => ph.req)),
].map(([n]) => n))].sort();

describe('předměty z požadavků jdou spočítat v Inventory', () => {
  const mats = new Set(getMaterials(defaultState(NOW)).map(m => m.name));

  it('materiál a loot jsou materiály aplikace, vybavení zná katalog', () => {
    expect(required.length).toBeGreaterThan(50);
    const missing = required.filter(n => !mats.has(n) && !EQUIPMENT.has(catalogByName(n)?.category ?? ''));
    expect(missing).toEqual([]);
    /* dnes dva předměty mimo materiály: klíč a předmět k použití (evidence ve Vybavení) */
    expect(required.filter(n => !mats.has(n))).toEqual(['Emperor Gateway Conduit', 'Remote Raider Flare']);
  });

  it('nově přidané materiály mají kategorii ze seznamu a rozpoznávání je bere jako materiál', () => {
    for (const n of ['Battery', 'Wires', 'Geiger Counter', 'Rusted Bolts', 'Glitched ARC Transmitter', 'Great Mullein', 'Queen Reactor']) {
      expect(mats.has(n), n).toBe(true);
      expect(MATERIAL_CATEGORIES as readonly string[]).toContain(MATERIAL_CATEGORY[n]);
    }
    const fps = catalogFps(mats);
    for (const n of ['Geiger Counter', 'Rusted Bolts', 'Railway Lantern']) {
      const fp = fps.find(f => f.key === n);
      if (fp) expect(fp.kind, n).toBe('material');
    }
  });

  it('nákupní seznam a Planner počítají se Zásobou i s Vybavením', () => {
    const s = defaultState(NOW);
    s.inventory['Geiger Counter'] = 1;
    s.items['Remote Raider Flare'] = { key: 'Remote Raider Flare', name: 'Remote Raider Flare', category: 'quickUse', count: 2 };
    s.items['Anvil II'] = { key: 'Anvil II', name: 'Anvil', category: 'weapon', tier: 'II', count: 1 };
    const stock = stockOf(s);
    expect(stock).toMatchObject({ 'Geiger Counter': 1, 'Remote Raider Flare': 2 });
    expect(stock.Anvil).toBeUndefined();
    for (const n of Object.keys(stock)) expect(stock[n]).toBe(haveOf(s, n));
    const quest = { id: 'q', label: 'Úkol', mats: [['Geiger Counter', 3], ['Remote Raider Flare', 2]] as [string, number][] };
    const view = { stations: s.stations, inventory: stock, profile: s.profile };
    const shop = shopping(view, undefined, undefined, [quest]);
    expect(shop.find(r => r.mat === 'Geiger Counter')).toMatchObject({ have: 1, need: 3, missing: 2 });
    expect(shop.find(r => r.mat === 'Remote Raider Flare')).toMatchObject({ have: 2, need: 2, missing: 0 });
    const plan = planNeeds(view, { ...s.planner, includeQuests: true }, [], undefined, undefined, [quest]);
    expect(plan.find(r => r.mat === 'Geiger Counter')).toMatchObject({ have: 1, missing: 2 });
    expect(plan.find(r => r.mat === 'Remote Raider Flare')).toMatchObject({ have: 2, missing: 0 });
    /* materiál ze Zásoby má přednost před stejným názvem ve Vybavení */
    s.inventory['Remote Raider Flare'] = 5;
    expect(stockOf(s)['Remote Raider Flare']).toBe(5);
  });
});
