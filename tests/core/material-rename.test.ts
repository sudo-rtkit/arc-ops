/* 0.13.1: „Cable Strippers“ (název z deníku) → „Cable Stripper“ (název ve hře, MetaForge i ARC Tracker).
   Uložený stav se převede při načtení; počty v Zásobě a odkazy na materiál se neztratí. */
import { describe, expect, it } from 'vitest';
import { defaultState, normalize } from '../../src/core/state';
import { migrateMaterialNames } from '../../src/core/materialRename';
import { MATERIAL_RENAMES } from '../../src/core/data/materials';
import { STATIONS } from '../../src/core/data/stations';
import { getMaterials } from '../../src/core/gamedata';
import { catalogByName } from '../../src/core/catalog';
import type { AppState, Raid } from '../../src/core/types';

const OLD = 'Cable Strippers', NEW = 'Cable Stripper';
const NOW = 1_800_000_000_000;

describe('opravený název materiálu Cable Stripper', () => {
  it('data aplikace vedou herní název, který zná katalog MetaForge', () => {
    expect(MATERIAL_RENAMES[OLD]).toBe(NEW);
    expect(catalogByName(NEW)?.category).toBe('material');
    const outpost = STATIONS.find(s => s.id === 'outpost')!;
    expect(outpost.levels[2]).toContainEqual([NEW, 3]);
    const names = getMaterials(defaultState(NOW)).map(m => m.name);
    expect(names).toContain(NEW);
    expect(names).not.toContain(OLD);
    /* žádný materiál aplikace už nechybí v katalogu pod svým názvem */
    expect(names.filter(n => !catalogByName(n))).toEqual([]);
  });

  it('načtení staršího stavu převede Zásobu, úpravy materiálu i recepty', () => {
    const s = normalize({
      schema: 12,
      inventory: { [OLD]: 7, 'Steel Cable': 2 },
      gameData: { materials: { [OLD]: { category: 'Komponenty' } }, recipes: { 'outpost:2': [['Steel Cable', 3], [OLD, 4]] } },
    }, NOW);
    expect(s.inventory).toEqual({ [NEW]: 7, 'Steel Cable': 2 });
    expect(s.gameData.materials).toEqual({ [NEW]: { category: 'Komponenty' } });
    expect(s.gameData.recipes['outpost:2']).toEqual([['Steel Cable', 3], [NEW, 4]]);
    expect(getMaterials(s).find(m => m.name === NEW)?.category).toBe('Komponenty');
    expect(getMaterials(s).some(m => m.name === OLD)).toBe(false);
    /* opakované načtení nic nemění */
    expect(normalize(JSON.parse(JSON.stringify(s)), NOW)).toEqual(s);
  });

  it('oba názvy v Zásobě: platí vyšší počet (stejný stack se nezapočítá dvakrát)', () => {
    expect(normalize({ inventory: { [OLD]: 9, [NEW]: 4 } }, NOW).inventory).toEqual({ [NEW]: 9 });
    expect(normalize({ inventory: { [OLD]: 2, [NEW]: 5 } }, NOW).inventory).toEqual({ [NEW]: 5 });
  });

  it('převede cíle, Planner, raidy, naučené otisky, rady a tier list', () => {
    const s: AppState = defaultState(NOW);
    s.goals = [{ id: 'g', title: 'x', note: '', priority: 2, due: '', createdAt: NOW, doneAt: 0, doneRaid: '', link: { kind: 'material', mat: OLD, qty: 5 } }];
    s.planner.items = [{ id: 'p', kind: 'custom', name: 'Něco', qty: 1, mats: [{ name: OLD, qty: 2 }, { name: NEW, qty: 1 }] }];
    const raid = { id: 'r', loot: [{ name: OLD, qty: 3 }], lootApplied: [{ name: OLD, qty: 3 }], gear: [], lost: [], lootScan: { sig: 'x', at: NOW, items: [{ name: OLD, qty: 3 }] } };
    s.raids = [raid as unknown as Raid];
    s.vision.learned = [
      { id: 'a', itemKey: OLD, kind: 'material', fp: [1, 2], at: NOW },
      { id: 'b', itemKey: OLD, kind: 'item', fp: [1, 2], at: NOW },
    ];
    s.advice.keep = { [OLD]: true };
    s.tierList.items.A = [OLD, 'Steel Cable'];
    migrateMaterialNames(s);
    expect(s.goals[0].link).toEqual({ kind: 'material', mat: NEW, qty: 5 });
    expect(s.planner.items[0].mats).toEqual([{ name: NEW, qty: 3 }]);
    expect(s.raids[0].loot).toEqual([{ name: NEW, qty: 3 }]);
    expect(s.raids[0].lootApplied).toEqual([{ name: NEW, qty: 3 }]);
    expect(s.raids[0].lootScan!.items).toEqual([{ name: NEW, qty: 3 }]);
    expect(s.vision.learned.map(l => l.itemKey)).toEqual([NEW, OLD]);
    expect(s.advice.keep).toEqual({ [NEW]: true });
    expect(s.tierList.items.A).toEqual([NEW, 'Steel Cable']);
    /* herní název už v tier listu je: starý se jen vynechá */
    const t = defaultState(NOW);
    t.tierList.items.S = [NEW];
    t.tierList.items.B = [OLD];
    migrateMaterialNames(t);
    expect(t.tierList.items.S).toEqual([NEW]);
    expect(t.tierList.items.B).toEqual([]);
  });

  it('vlastní materiál se starým názvem se přejmenuje, duplicitní se zahodí', () => {
    const a = defaultState(NOW);
    a.gameData.materialsCustom = [{ name: OLD, category: 'Ostatní', source: '' }];
    expect(migrateMaterialNames(a).gameData.materialsCustom).toEqual([{ name: NEW, category: 'Ostatní', source: '' }]);
    const b = defaultState(NOW);
    b.gameData.materialsCustom = [{ name: OLD, category: 'Ostatní', source: '' }, { name: NEW, category: 'Komponenty', source: '' }];
    expect(migrateMaterialNames(b).gameData.materialsCustom).toEqual([{ name: NEW, category: 'Komponenty', source: '' }]);
  });
});
