/* Bezpečnost katalogu buildů (0.8.0): jediné nové URL jsou domovské stránky zdrojů buildů v src/core/data/builds.ts.
   Nepoužívají se nikde jinde v src/, v UI se otevírají jen na kliknutí přes ExtLink a katalog nic nestahuje.
   tests/safety.test.ts zůstává beze změny. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_CATALOG, BUILD_SOURCE_URLS } from '../src/core/data/builds';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(n) ? [p] : [];
});
const rel = (f: string) => f.slice(root.length).split('\\').join('/');
const DOMAINS = ['thearcraiders.com', 'boostingmarket.com', 'arcraiders.uk', 'lfcarry.com'];

describe('bezpečnost katalogu buildů', () => {
  const buildsSrc = readFileSync(join(root, 'src', 'core', 'data', 'builds.ts'), 'utf8');

  it('builds.ts obsahuje jen 4 domovské stránky zdrojů (https, bez cesty a parametrů)', () => {
    expect(buildsSrc.match(/https?:\/\/[^'"`\s]*/g)).toEqual(DOMAINS.map(d => `https://${d}/`));
    expect(Object.values(BUILD_SOURCE_URLS)).toEqual(DOMAINS.map(d => `https://${d}/`));
    expect(/\.png|\.webp|\.jpg|<img|import\(|require\(/i.test(buildsSrc)).toBe(false);
  });

  it('každý odkaz buildu je jedna z povolených stránek', () => {
    const allowed = new Set<string>(Object.values(BUILD_SOURCE_URLS));
    for (const b of BUILD_CATALOG) for (const r of b.source.refs) if (r.url) expect(allowed.has(r.url), `${b.id}: ${r.url}`).toBe(true);
  });

  it('domény zdrojů buildů nejsou nikde jinde v src/', () => {
    const hits = walk(join(root, 'src')).filter(f => DOMAINS.some(d => readFileSync(f, 'utf8').includes(d))).map(rel);
    expect(hits).toEqual(['src/core/data/builds.ts']);
  });

  it('Skill Tree otevírá zdroj jen přes ExtLink (na kliknutí), bez href, window.open a vlastního URL', () => {
    const ui = readFileSync(join(root, 'src', 'modules', 'SkillTree.tsx'), 'utf8');
    expect(ui).toMatch(/<ExtLink key=\{r\.label\} url=\{r\.url\}>/);
    expect(/https?:\/\//.test(ui)).toBe(false);
    for (const word of ['href=', 'window.open', 'openExternal', 'location.', '<iframe', '<img']) expect(ui.includes(word), word).toBe(false);
    const core = readFileSync(join(root, 'src', 'core', 'buildCatalog.ts'), 'utf8');
    expect(/https?:\/\//.test(core)).toBe(false);
  });
});
