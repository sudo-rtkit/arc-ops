/* 0.19.0: velikost toho, co každé okno načte hned při startu (vstupní skript + modulepreload + styly).
   0.25.0: slovníky jsou samostatné balíky (src/i18n/index.ts) a okno při startu načte jeden z nich, takže se
   k oknu, které na ně odkazuje, přičte větší z nich („+ slovník“); celkem = co okno opravdu stáhne a spustí.
   Spuštění po `pnpm build`: node scripts/bundle-size.mjs [dist] */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] || 'dist';
const kb = n => (n / 1024).toFixed(1).padStart(8) + ' KB';
const size = f => { const b = readFileSync(join(dist, f)); return { raw: b.length, gz: gzipSync(b).length }; };
const assets = readdirSync(join(dist, 'assets'));
const dicts = assets.filter(f => /^(cs|en)-[\w-]+\.js$/.test(f));

for (const html of readdirSync(dist).filter(f => f.endsWith('.html'))) {
  const src = readFileSync(join(dist, html), 'utf8');
  const js = [...src.matchAll(/<(?:script[^>]*src|link[^>]*rel="modulepreload"[^>]*href)="\/?([^"]+\.js)"/g)].map(m => m[1]);
  const css = [...src.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\/?([^"]+\.css)"/g)].map(m => m[1]);
  const sum = list => list.map(size).reduce((a, b) => ({ raw: a.raw + b.raw, gz: a.gz + b.gz }), { raw: 0, gz: 0 });
  const j = sum(js), c = sum(css);
  /* slovník, na který okno odkazuje (dynamický import); při startu se načte jeden, počítá se větší */
  const code = js.map(f => readFileSync(join(dist, f), 'utf8')).join('\n');
  const used = dicts.filter(d => code.includes(d)).map(d => size('assets/' + d)).sort((a, b) => b.raw - a.raw)[0];
  const dict = used ? ` + slovník ${kb(used.raw)} = ${kb(j.raw + used.raw)} (gzip ${kb(j.gz + used.gz)})` : '';
  console.log(`${html.padEnd(14)} JS ${kb(j.raw)} (gzip ${kb(j.gz)}) in ${String(js.length).padStart(2)} files${dict} · CSS ${kb(c.raw)} (gzip ${kb(c.gz)})`);
}
const all = assets.filter(f => f.endsWith('.js'));
const total = all.reduce((a, f) => a + statSync(join(dist, 'assets', f)).size, 0);
const big = all.map(f => [f, statSync(join(dist, 'assets', f)).size]).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`all JS        ${kb(total)} in ${all.length} files; largest:`);
for (const [f, s] of big) console.log(`  ${kb(s)}  ${f}`);
