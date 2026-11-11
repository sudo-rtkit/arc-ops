/* Hlídací test: v UI (src/modules, src/shell, src/ui) nesmí zůstat natvrdo český text. Každý text UI patří do
   slovníku src/i18n/cs.ts a en.ts. Hledají se řetězcové literály a JSX text se znaky české diakritiky; komentáře se
   ignorují. Výjimky musí být explicitní a odůvodněné (EXCEPTIONS). */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIRS = ['src/modules', 'src/shell', 'src/ui'];
const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

/* Výjimky: soubor → přesné řádky (po odstranění komentářů), které smí obsahovat diakritiku, s důvodem. */
const EXCEPTIONS: { file: string; contains: string; reason: string }[] = [];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
  });
}

/* Odstraní komentáře a zachová řetězce (i s jejich obsahem), aby se diakritika v textu UI nepřehlédla. */
export function stripComments(src: string): string {
  const re = /(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*')|("(?:\\.|[^"\\\n])*")|(`(?:\\[\s\S]|[^`\\])*`)/g;
  return src.replace(re, (m, block: string | undefined, line: string | undefined) => {
    if (block) return block.replace(/[^\n]/g, ' ');
    if (line) return '';
    return m;
  });
}

describe('hlídací test: žádný natvrdo český text v UI', () => {
  it('stripComments ignoruje komentáře, ale ne řetězce', () => {
    expect(CZ.test(stripComments('/* čeština */ const a = 1; // žluť'))).toBe(false);
    expect(CZ.test(stripComments("const a = 'žluť';"))).toBe(true);
    expect(CZ.test(stripComments('<p>Načítám</p>'))).toBe(true);
    expect(CZ.test(stripComments("const u = 'https://x.cz'; const b = 'čaj';"))).toBe(true);
  });

  const all = DIRS.flatMap(d => files(join(ROOT, d)));
  it('prohledává všechny soubory UI', () => {
    expect(all.filter(f => f.endsWith('.tsx')).length).toBeGreaterThanOrEqual(25);
  });

  it('mimo komentáře není česká diakritika', () => {
    const found: string[] = [];
    for (const f of all) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      stripComments(readFileSync(f, 'utf8')).split('\n').forEach((ln, i) => {
        if (!CZ.test(ln)) return;
        if (EXCEPTIONS.some(e => e.file === rel && ln.includes(e.contains))) return;
        found.push(`${rel}:${i + 1}: ${ln.trim().slice(0, 140)}`);
      });
    }
    expect(found).toEqual([]);
  });

  it('každá výjimka je použitá a má důvod', () => {
    for (const e of EXCEPTIONS) {
      expect(e.reason.length, e.file).toBeGreaterThan(10);
      const text = stripComments(readFileSync(join(ROOT, e.file), 'utf8'));
      expect(text.includes(e.contains), `${e.file}: ${e.contains}`).toBe(true);
    }
  });
});
