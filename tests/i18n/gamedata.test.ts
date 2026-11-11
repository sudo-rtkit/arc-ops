/* Anglické verze popisných herních dat: stejný tvar jako české, nic prázdného, herní názvy beze změny. */
import { describe, expect, it } from 'vitest';
import * as EN from '../../src/core/data/en';
import { TEXTS, PATCH_NOTES } from '../../src/core/data/texts';
import { CONDITIONS, MAPS } from '../../src/core/data/maps';
import { NEXT_STEPS, RAID_CHECK } from '../../src/core/data/checklists';
import { ROUTES, SELL } from '../../src/core/data/routes';
import { MATERIAL_CATEGORIES } from '../../src/core/data/materials';
import { SOURCES, STATIONS } from '../../src/core/data/stations';
import { ARC_DIARY } from '../../src/core/data/arcDiary';
import { ARC_META } from '../../src/core/data/arcMeta';
import { ARC_DANGERS, ARC_UNITS } from '../../src/core/data/arc';
import { WEAPON_META } from '../../src/core/data/weaponMeta';
import { WEAPON_PHASES } from '../../src/core/data/weaponsDiary';
import { BUILDS, SKILLS, TIER_NAMES } from '../../src/core/data/skills';
import { mapPlaces } from '../../src/core/maps';
import { getArc, getRoutes, getSell, getWeapons } from '../../src/core/gamedata';
import { emptyGameData } from '../../src/core/state';
import { phases } from '../../src/core/phases';
import { placeLabel, sourceLabel, categoryLabel, purposeLabel } from '../../src/core/gametext';
import { setLang } from '../../src/i18n';

const CZ = /[áčďéěíňóřšťúůýž]/i;
const filled = (s: string | undefined) => !!s && s.trim().length > 0;

describe('anglická herní data', () => {
  it('mají stejný tvar jako česká a nic není prázdné', () => {
    expect(Object.keys(EN.TEXTS_EN).sort()).toEqual(Object.keys(TEXTS).sort());
    expect(EN.PATCH_NOTES_EN).toHaveLength(PATCH_NOTES.length);
    expect(EN.CONDITIONS_EN).toHaveLength(CONDITIONS.length);
    expect(EN.NEXT_STEPS_EN).toHaveLength(NEXT_STEPS.length);
    expect(EN.RAID_CHECK_EN).toHaveLength(RAID_CHECK.length);
    expect(EN.SELL_EN).toHaveLength(SELL.length);
    expect(EN.WEAPON_PHASES_EN).toHaveLength(WEAPON_PHASES.length);
    expect(EN.TIER_NAMES_EN).toHaveLength(TIER_NAMES.length);
    expect(EN.BUILDS_WHO_EN).toHaveLength(BUILDS.length);
    expect(Object.keys(EN.MAPS_EN).sort()).toEqual(MAPS.map(m => m.id).sort());
    for (const m of MAPS) expect(EN.MAPS_EN[m.id].places.split(', ')).toHaveLength(mapPlaces(m).length);
    expect(Object.keys(EN.ROUTES_EN).sort()).toEqual(ROUTES.map(r => r.id).sort());
    for (const r of ROUTES) expect(EN.ROUTES_EN[r.id].steps, r.id).toHaveLength(r.steps.length);
    expect(Object.keys(EN.MATERIAL_CATEGORY_EN).sort()).toEqual([...MATERIAL_CATEGORIES].sort());
    expect(Object.keys(EN.SOURCES_EN).sort()).toEqual(Object.keys(SOURCES).sort());
    expect(Object.keys(EN.STATIONS_EN).sort()).toEqual(STATIONS.map(s => s.id).sort());
    for (const s of STATIONS) expect(Object.keys(EN.STATIONS_EN[s.id].notes || {})).toEqual(Object.keys(s.notes || {}));
    expect(Object.keys(EN.ARC_TACTICS_EN).sort()).toEqual(ARC_DIARY.map(e => e.name).sort());
    expect(Object.keys(EN.ARC_META_EN).sort()).toEqual(Object.keys(ARC_META).sort());
    for (const [k, m] of Object.entries(ARC_META)) for (const f of ['type', 'category', 'weakness'] as const) expect(!!EN.ARC_META_EN[k][f], `${k}.${f}`).toBe(!!m[f]);
    expect(Object.keys(EN.ARC_DANGER_EN).sort()).toEqual([...ARC_DANGERS].sort());
    for (const m of Object.values(WEAPON_META)) expect(filled(EN.WEAPON_CATEGORY_EN[m.category!]), m.category).toBe(true);
    expect(Object.keys(EN.SKILL_DESC_EN).sort()).toEqual(SKILLS.map(s => s.id).sort());
    const all: string[] = [
      ...Object.values(EN.TEXTS_EN), ...EN.PATCH_NOTES_EN, ...EN.CONDITIONS_EN, ...EN.NEXT_STEPS_EN, ...EN.RAID_CHECK_EN,
      ...Object.values(EN.MAPS_EN).flatMap(m => [m.best, m.places]), ...Object.values(EN.ROUTES_EN).flatMap(r => [r.risk, r.loadout, r.yield, ...r.steps]),
      ...EN.SELL_EN.map(x => x.note), ...Object.values(EN.MATERIAL_CATEGORY_EN), ...Object.values(EN.SOURCES_EN),
      ...Object.values(EN.STATIONS_EN).flatMap(s => [s.role, ...Object.values(s.notes || {})]), ...Object.values(EN.ARC_TACTICS_EN),
      ...Object.values(EN.ARC_META_EN).flatMap(m => [m.type, m.category, m.weakness].filter((x): x is string => !!x)),
      ...Object.values(EN.ARC_DANGER_EN), ...Object.values(EN.WEAPON_CATEGORY_EN), ...EN.WEAPON_PHASES_EN.flat(), ...EN.TIER_NAMES_EN,
      ...Object.values(EN.SKILL_DESC_EN), ...EN.BUILDS_WHO_EN,
    ];
    for (const s of all) { expect(filled(s), s).toBe(true); expect(CZ.test(s), s).toBe(false); }
  });

  it('skládání dat podle jazyka: herní názvy a čísla stejné, popisy anglicky, úpravy uživatele beze změny', () => {
    const gd = emptyGameData();
    gd.arc = { tick: { tactic: 'Moje taktika' } };
    gd.routes = { galleria: { risk: 'Moje riziko' } };
    const csArc = getArc(gd, 'cs'), enArc = getArc(gd, 'en');
    expect(enArc.map(u => [u.id, u.name, u.drops, u.difficulty])).toEqual(csArc.map(u => [u.id, u.name, u.drops, u.difficulty]));
    expect(enArc.find(u => u.id === 'tick')!.tactic).toBe('Moje taktika');
    expect(enArc.find(u => u.id === 'wasp')!.tactic).toBe(EN.ARC_TACTICS_EN['Wasp, Hornet']);
    expect(enArc.find(u => u.id === 'wasp')!.type).toBe('Flying, small');
    expect(getWeapons(gd, 'en').map(w => [w.id, w.name, w.tier, w.ammo])).toEqual(getWeapons(gd, 'cs').map(w => [w.id, w.name, w.tier, w.ammo]));
    const r = getRoutes(gd, 'en');
    expect(r.find(x => x.id === 'galleria')!.risk).toBe('Moje riziko');
    expect(r.find(x => x.id === 'oldbattle')!.risk).toBe('Low to medium');
    expect(r.find(x => x.id === 'rna')!.name).toBe('Research & Admin lockers');
    expect(getSell(gd, 'en').map(x => x.price)).toEqual(getSell(gd, 'cs').map(x => x.price));
    expect(ARC_UNITS.length).toBe(csArc.length);
  });

  it('fáze roadmapy v angličtině (logika stejná)', () => {
    const view = { profile: { level: 20, rounds: 25, amplified: 0 }, stations: { gunsmith: 2, gear: 2, medical: 2, refiner: 2, utility: 0, explosives: 0, scrappy: 3, outpost: 1, research: 0 }, skills: { current: {} } };
    const cs = phases(view);
    setLang('en');
    const en = phases(view);
    setLang('cs');
    expect(en.current).toBe(cs.current);
    expect(en.list.map(p => p.gates.map(g => g.ok))).toEqual(cs.list.map(p => p.gates.map(g => g.ok)));
    expect(en.list[0].name).toBe('Survive and build the basics');
    expect(cs.list[0].name).toBe('Přežít a postavit základ');
  });

  it('zobrazení uložených hodnot: české klíče se přeloží, vlastní text zůstane', () => {
    const riven = MAPS.find(m => m.id === 'riven')!;
    expect(placeLabel(riven, 'pláž a bazén', 'en')).toBe('beach and pool');
    expect(placeLabel(riven, 'pláž a bazén', 'cs')).toBe('pláž a bazén');
    expect(sourceLabel('ARC Alloy', SOURCES['ARC Alloy'], 'en')).toBe('ARC: most machines');
    expect(sourceLabel('ARC Alloy', 'Můj zdroj', 'en')).toBe('Můj zdroj');
    expect(categoryLabel('Komponenty', 'en')).toBe('Components');
    expect(categoryLabel('Moje kategorie', 'en')).toBe('Moje kategorie');
    expect(purposeLabel('Lov ARC', 'en')).toBe('ARC hunt');
    expect(purposeLabel('Moje', 'en')).toBe('Moje');
  });
});
