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
  it('v src/ není URL MetaForge (kromě textu odkazu v Settings)', () => {
    const hits = src.filter(f => /metaforge/i.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits.filter(f => f !== 'src/modules/Settings.tsx' && !f.startsWith('src/i18n/'))).toEqual([]);
  });
  it('snímky se neukládají: stav ani úložiště neznají obrazová data', () => {
    for (const f of ['src/core/types.ts', 'src/core/visionState.ts', 'src/core/visionImport.ts', 'src/store/app.ts']) {
      const s = readFileSync(join(root, f), 'utf8');
      expect(/ImageData|RgbaImage|toDataURL|Blob/.test(s), f).toBe(false);
    }
  });
});
