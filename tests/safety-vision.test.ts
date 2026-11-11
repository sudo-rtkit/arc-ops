/* Bezpečnost rozpoznávání ze snímků (milník 3a): jádro je čistá funkce bez DOM, aplikace sama nesnímá obrazovku
   a v src/ není URL MetaForge (v 3b smí být jen text odkazu v Settings). tests/safety.test.ts zůstává beze změny. */
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

describe('bezpečnost rozpoznávání', () => {
  const src = walk(join(root, 'src'));
  it('aplikace nesnímá obrazovku ani neposlouchá globální zkratky', () => {
    for (const word of ['getDisplayMedia', 'getUserMedia', 'globalShortcut', 'global-shortcut', 'desktopCapturer', 'screenshot(']) {
      expect(src.filter(f => readFileSync(f, 'utf8').includes(word)).map(rel), word).toEqual([]);
    }
  });
  it('jádro rozpoznávání nepoužívá DOM ani úložiště', () => {
    const core = walk(join(root, 'src', 'core', 'vision'));
    expect(core.length).toBeGreaterThanOrEqual(10);
    for (const word of ['document.', 'window.', 'localStorage', 'canvas', 'Image(', '@tauri-apps']) {
      expect(core.filter(f => readFileSync(f, 'utf8').includes(word)).map(rel), word).toEqual([]);
    }
  });
  it('v src/ není URL MetaForge (kromě odkazu a jeho textu v Settings → Zdroje dat)', () => {
    const hits = src.filter(f => /metaforge\.app/i.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits.filter(f => f !== 'src/modules/Settings.tsx' && f !== 'src/i18n/cs.ts' && f !== 'src/i18n/en.ts')).toEqual([]);
    /* odkaz je jen jeden a otevírá se jen na kliknutí (ExtLink) */
    const settings = readFileSync(join(root, 'src', 'modules', 'Settings.tsx'), 'utf8');
    expect(settings.match(/https:\/\/metaforge\.app[^'"`]*/g)).toEqual(['https://metaforge.app/arc-raiders']);
    expect(settings).toMatch(/<ExtLink url=\{METAFORGE_URL\}/);
  });
  it('katalog obsahuje jen id, název, kategorii, vzácnost a otisk (žádné obrázky, popisy ani URL)', async () => {
    const txt = readFileSync(join(root, 'src', 'core', 'data', 'catalog.ts'), 'utf8').replace(/f: '[A-Za-z0-9+/=]*'/g, ''); /* otisky v base64 mohou náhodou obsahovat písmena */
    expect(/https?:\/\/|\.png|\.webp|description|icon/i.test(txt)).toBe(false);
    const { CATALOG } = await import('../src/core/data/catalog');
    expect(CATALOG.length).toBeGreaterThan(500);
    for (const row of CATALOG) for (const k of Object.keys(row)) expect(['id', 'name', 'category', 't', 'rarity', 'f']).toContain(k);
  });
  it('snímky se neukládají: stav ani úložiště neznají obrazová data', () => {
    for (const f of ['src/core/types.ts', 'src/core/visionState.ts', 'src/core/visionImport.ts', 'src/store/app.ts']) {
      const s = readFileSync(join(root, f), 'utf8');
      expect(/ImageData|RgbaImage|toDataURL|Blob/.test(s), f).toBe(false);
    }
  });
});
