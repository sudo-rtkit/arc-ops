/* 0.27.0: generátor vzorů ikony druhu munice (src/core/vision/ammoIcons.ts) z vlastních snímků hráče. Běží jen na
   vyžádání a jen s lokální složkou vlastních snímků:  GEN_AMMO=1 pnpm vitest run tests/vision/ammo.gen.test.ts
   Popisky jsou ručně určené druhy munice zbraní na snímcích (podle zbraně a podle katalogu MetaForge). Výsledkem jsou
   malé číselné mřížky (podíl inkoustu), ne herní grafika. Vzory ze tří měřítek snímku (1366, 1920 a 2560 px na
   šířku); testy robustnosti (tests/vision/ammo.test.ts) používají jiná (1600, 3200). */
import { expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import type { RgbaImage } from '../../src/core/vision/image';
import { readLoadout } from '../../src/core/vision/loadout';
import { ICON_LEN, ammoIconOf, gridRows, type AmmoType } from '../../src/core/vision/ammoIcon';
import { AMMO_SAMPLES, scaled } from './ammo-samples';

const OWN = new URL('../fixtures/vision/own/', import.meta.url);
const has = (n: string) => existsSync(new URL(n, OWN));
const load = (n: string): RgbaImage => { const p = PNG.sync.read(readFileSync(new URL(n, OWN))); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };

it.runIf(process.env.GEN_AMMO === '1')('generuje vzory ikony druhu munice', () => {
  const avail = AMMO_SAMPLES.filter(s => has(s[0]));
  expect(avail.length).toBe(AMMO_SAMPLES.length);
  const acc = new Map<string, { t: AmmoType; width: number; v: number[]; a: number; n: number; from: string[] }>();
  for (const width of [1366, 1920, 2560]) for (const [file, slot, t, weapon] of avail) {
    const src = load(file);
    const box = readLoadout(src)!.equip.find(e => e.slot === slot)!.box;
    const s = scaled(src, box, width);
    const icon = ammoIconOf(s.img, s.box);
    expect(icon, `${file} ${slot} ${width}`).not.toBeNull();
    const k = `${t}:${width}`;
    const a = acc.get(k) ?? { t, width, v: new Array(ICON_LEN).fill(0), a: 0, n: 0, from: [] as string[] };
    icon!.v.forEach((x, i) => { a.v[i] += x; });
    a.a += icon!.aspect; a.n++; a.from.push(weapon);
    acc.set(k, a);
  }
  const lines = [...acc.values()].sort((a, b) => a.t.localeCompare(b.t) || a.width - b.width).map(a => {
    const v = a.v.map(x => x / a.n);
    return `  { t: '${a.t}', a: ${Math.round((a.a / a.n) * 1000) / 1000}, rows: [${gridRows(v).map(r => `'${r}'`).join(', ')}] }, // ${a.width} px, ${[...new Set(a.from)].join(', ')}`;
  });
  const file = fileURLToPath(new URL('../../src/core/vision/ammoIcons.ts', import.meta.url));
  writeFileSync(file, `/* Vzory ikony druhu munice v místě zbraně jako malé mřížky ICON_W × ICON_H (podíl krémového inkoustu × 15 jako
   šestnáctková číslice) s poměrem stran a. Vygenerováno z vlastních snímků hráče testem tests/vision/ammo.gen.test.ts
   (GEN_AMMO=1, potřebuje lokální vlastní snímky). Jde o tvar ikony v číslech, ne o herní grafiku. Vzory jsou jen pro
   druhy, které na snímcích jsou (lehká, střední, těžká); ostatní druhy se nepoznají (čtení je pak nejisté). */
import type { AmmoIconTemplate } from './ammoIcon';
export const AMMO_ICONS: AmmoIconTemplate[] = [
${lines.join('\n')}
];
`);
  console.log(lines.join('\n'));
});
