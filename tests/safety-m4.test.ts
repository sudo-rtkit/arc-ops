/* Bezpečnost milníku 4: nová data o předmětech a statistiky zbraní jsou jen čísla a názvy (bez URL, obrázků a popisů),
   a jediný nový externí odkaz (oficiální rozpis podmínek map od Embarku) se otevírá jen na kliknutí přes ExtLink.
   tests/safety.test.ts zůstává beze změny. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(n) ? [p] : [];
});
const rel = (f: string) => f.slice(root.length).split('\\').join('/');

describe('bezpečnost milníku 4', () => {
  it('itemdata.ts: jen název, typ, vzácnost a čísla; nabídka obchodníků bez URL', async () => {
    const txt = readFileSync(join(root, 'src', 'core', 'data', 'itemdata.ts'), 'utf8');
    expect(/https?:\/\/|\.png|\.webp|description|imageFilename|icon/i.test(txt)).toBe(false);
    const { ITEM_DATA, TRADER_OFFERS } = await import('../src/core/data/itemdata');
    expect(ITEM_DATA.length).toBeGreaterThan(500);
    for (const r of ITEM_DATA) for (const k of Object.keys(r)) expect(['n', 'ty', 'ra', 'v', 'w', 's', 'r', 'bp']).toContain(k);
    for (const o of TRADER_OFFERS) for (const k of Object.keys(o)) expect(['trader', 'item', 'cost', 'qty', 'limit', 'refreshH', 'level']).toContain(k);
  });
  it('weaponStats.ts: jen název a čísla', async () => {
    const txt = readFileSync(join(root, 'src', 'core', 'data', 'weaponStats.ts'), 'utf8');
    expect(/https?:\/\/|\.png|description|icon/i.test(txt)).toBe(false);
    const { WEAPON_STATS } = await import('../src/core/data/weaponStats');
    for (const r of WEAPON_STATS) for (const [k, v] of Object.entries(r)) {
      expect(['n', 'dmg', 'fr', 'rng', 'stab', 'agi', 'stl', 'mag', 'w']).toContain(k);
      if (k !== 'n') expect(typeof v).toBe('number');
    }
  });
  it('odkaz na rozpis událostí je jen oficiální stránka Embarku v Maps a otevírá se přes ExtLink', () => {
    const src = walk(join(root, 'src'));
    const hits = src.filter(f => /arcraiders\.com/i.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits.filter(f => f !== 'src/i18n/cs.ts' && f !== 'src/i18n/en.ts')).toEqual(['src/modules/Maps.tsx']);
    const maps = readFileSync(join(root, 'src', 'modules', 'Maps.tsx'), 'utf8');
    expect(maps.match(/https:\/\/arcraiders\.com[^'"`]*/g)).toEqual(['https://arcraiders.com/map-conditions']);
    expect(maps).toMatch(/<ExtLink url=\{EVENTS_URL\}/);
  });
});
