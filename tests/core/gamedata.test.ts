import { describe, expect, it } from 'vitest';
import { getArc, getMaterials, getSources, getStations, getWeapons } from '../../src/core/gamedata';
import { emptyGameData } from '../../src/core/state';
import { ARC_UNITS } from '../../src/core/data/arc';
import { STATIONS, SOURCES } from '../../src/core/data/stations';

describe('skládání herních dat', () => {
  it('bez úprav vrací vestavěná data', () => {
    const gd = emptyGameData();
    expect(getArc(gd).map(a => a.id)).toEqual(ARC_UNITS.map(a => a.id));
    expect(getStations(gd)).toBe(STATIONS);
    expect(getSources(gd)).toEqual(SOURCES);
  });
  it('úprava přepíše jen dané pole, smazání úpravy vrátí výchozí hodnotu', () => {
    const gd = emptyGameData();
    const id = ARC_UNITS[0].id;
    gd.arc[id] = { tactic: 'Moje taktika' };
    const u = getArc(gd).find(a => a.id === id)!;
    expect(u.tactic).toBe('Moje taktika');
    expect(u.drops).toEqual(ARC_UNITS[0].drops);
    expect(u.edited).toBe(true);
    delete gd.arc[id];
    expect(getArc(gd).find(a => a.id === id)!.tactic).toBe(ARC_UNITS[0].tactic);
  });
  it('skrytý záznam zmizí, vlastní se přidá', () => {
    const gd = emptyGameData();
    gd.weaponsHidden[getWeapons(gd)[0].id] = true;
    gd.weaponsCustom.push({ id: 'moje', name: 'Moje', origin: 'vlastni', tier: 'A', antiArc: false, category: '', ammo: '', info: '', sources: [] });
    const list = getWeapons(gd);
    expect(list.some(w => w.id === 'moje')).toBe(true);
    expect(list.some(w => gd.weaponsHidden[w.id])).toBe(false);
  });
  it('úprava receptu a materiálu', () => {
    const gd = emptyGameData();
    gd.recipes['gunsmith:1'] = [['Metal Parts', 1]];
    gd.materials['Metal Parts'] = { category: 'Moje', source: 'Recyklace' };
    expect(getStations(gd).find(s => s.id === 'gunsmith')!.levels[1]).toEqual([['Metal Parts', 1]]);
    expect(getStations(gd).find(s => s.id === 'gear')).toBe(STATIONS.find(s => s.id === 'gear'));
    const m = getMaterials({ gameData: gd, inventory: { 'Neznámý kus': 2 } });
    expect(m.find(x => x.name === 'Metal Parts')).toMatchObject({ category: 'Moje', source: 'Recyklace' });
    expect(m.find(x => x.name === 'Neznámý kus')).toMatchObject({ category: 'Ostatní', source: 'Loot' });
  });
});
