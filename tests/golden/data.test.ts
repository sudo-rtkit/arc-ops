import { describe, expect, it } from 'vitest';
import { O, plain } from './original';
import { BRANCHES, BUILDS, PLANS, SKILLS, TIER_NAMES } from '../../src/core/data/skills';
import { SOURCES, STATIONS } from '../../src/core/data/stations';
import { CONDITIONS, MAPS } from '../../src/core/data/maps';
import { ROUTES, SELL } from '../../src/core/data/routes';
import { ANTI_ARC, TIERS, WEAPON_PHASES } from '../../src/core/data/weaponsDiary';
import { DOC_URL, NEXT_STEPS, RAID_CHECK } from '../../src/core/data/checklists';
import { ARC_DIARY } from '../../src/core/data/arcDiary';
import { ARC_UNITS } from '../../src/core/data/arc';
import { WEAPONS } from '../../src/core/data/weapons';
import { PATCH_NOTES, TEXTS } from '../../src/core/data/texts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('herní data se shodují s původním deníkem', () => {
  const cases: [string, unknown][] = [
    ['BRANCHES', BRANCHES.map(({ id, key, name }) => ({ id, key, name }))],
    ['TIER_NAMES', TIER_NAMES], ['SKILLS', SKILLS], ['PLANS', PLANS], ['BUILDS', BUILDS],
    ['STATIONS', STATIONS], ['SOURCES', SOURCES], ['MAPS', MAPS], ['CONDITIONS', CONDITIONS],
    ['ROUTES', ROUTES], ['SELL', SELL], ['ARC', ARC_DIARY], ['TIERS', TIERS], ['ANTI_ARC', ANTI_ARC],
    ['WEAPON_PHASES', WEAPON_PHASES], ['NEXT_STEPS', NEXT_STEPS], ['RAID_CHECK', RAID_CHECK], ['DOC_URL', DOC_URL],
  ];
  for (const [name, ours] of cases) {
    it(name, () => {
      let orig = plain(O[name]);
      if (name === 'BRANCHES') orig = orig.map(({ id, key, name: n }: { id: string; key: string; name: string }) => ({ id, key, name: n }));
      expect(plain(ours)).toEqual(orig);
    });
  }

  it('ARC po rozdělení kombinovaných záznamů nese všechny dropy a taktiky', () => {
    for (const entry of O.ARC as { name: string; tac: string; drops: string[] }[]) {
      const names = entry.name.replace(/ \(2\.0\)$/, '').split(', ');
      const units = names.map(n => ARC_UNITS.find(u => u.name === n));
      units.forEach(u => { expect(u, entry.name).toBeTruthy(); expect(u!.tactic).toBe(entry.tac); expect(u!.origin).toBe('denik'); });
      const all = new Set(units.flatMap(u => u!.drops));
      for (const d of entry.drops) expect(all.has(d), d).toBe(true);
    }
  });

  it('zbraně: tier a anti-ARC odpovídají deníku', () => {
    const total = (O.TIERS as [string, string[]][]).reduce((a, [, l]) => a + l.length, 0);
    expect(WEAPONS.length).toBe(total);
    for (const [tier, list] of O.TIERS as [string, string[]][]) for (const name of list) {
      const w = WEAPONS.find(x => x.name === name)!;
      expect(w.tier).toBe(tier);
      expect(w.antiArc).toBe(O.ANTI_ARC.includes(name));
    }
  });

  it('nápovědy a změny 2.0 jsou doslova z deníku', () => {
    const html = readFileSync(fileURLToPath(new URL('../../reference/denik-v2-2026-11-08-1707.html', import.meta.url)), 'utf8');
    const esc = (s: string) => s.replace(/&/g, '&amp;');
    for (const t of [...Object.values(TEXTS), ...PATCH_NOTES]) {
      expect(html.includes(t) || html.includes(esc(t)), t).toBe(true);
    }
  });
});
