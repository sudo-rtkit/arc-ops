// 0.24.0: tvary zbraní a augmentů pro rozpoznání míst výbavy (src/core/vision/equip.ts). Jen při vývoji, bez sítě.
// Spuštění: node scripts/gen-equip.mjs   (nejdřív node scripts/gen-catalog.mjs, který ikony stáhne do cache)
//
// - Čte jen cache scripts/.cache/ (seznam předmětů MetaForge a ikony, složka je v .gitignore). Nic nestahuje.
// - Ikonu vloží na tmavý podklad, u zbraní ji narovná (ikony katalogu jsou natočené šikmo, asi o 32°; uloží se
//   tvar pro úhly ANGLES), a spočítá tvar STEJNOU funkcí, jakou používá aplikace (shapeOf z equip.ts).
// - Zapíše src/core/data/equipShapes.ts jen s { název, druh, vzácnost, zásobník, tvar (čísla, ne obrázek) }.
//   Zásobník je základní velikost z stat_block MetaForge (tier I); slouží jen ke kontrole přečtené munice.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const CACHE = 'scripts/.cache';
const ANGLES = [30, 32, 34];
/* Zmenšení narovnané ikony zbraně na velikost jako ve hře (1080p: zbraň asi 120–170 px na šířku), aby tenké části
   (hlaveň) měly po zmenšení stejný jas jako na snímku. */
const SCALE = Number(process.env.EQUIP_SCALE || 0.35);
const BG = [16, 19, 31, 255];
const RARITY = { Common: 'common', Uncommon: 'uncommon', Rare: 'rare', Epic: 'epic', Legendary: 'legendary' };

const items = [];
for (let page = 1; existsSync(`${CACHE}/items-${page}.json`); page++) items.push(...JSON.parse(readFileSync(`${CACHE}/items-${page}.json`, 'utf8')).data);
if (!items.length) throw new Error('chybí cache scripts/.cache/items-*.json (spusť nejdřív scripts/gen-catalog.mjs)');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { shapeOf, SHAPE_LEN, AUGMENT_PAD } = await server.ssrLoadModule('/src/core/vision/equip.ts');
const { rotate, resize } = await server.ssrLoadModule('/src/core/vision/image.ts');

/* Ikona na tmavém podkladu (alfa složená), jako RgbaImage. */
function onBg(png) {
  const out = new Uint8ClampedArray(png.width * png.height * 4);
  for (let i = 0; i < png.width * png.height; i++) {
    const a = png.data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = png.data[i * 4 + c] * a + BG[c] * (1 - a);
    out[i * 4 + 3] = 255;
  }
  return { width: png.width, height: png.height, data: out };
}
const whole = img => ({ x: 0, y: 0, w: img.width, h: img.height });
const small = img => resize(img, Math.round(img.width * SCALE), Math.round(img.height * SCALE));

const baseName = x => x.name.replace(/\s+(I|II|III|IV)$/, '').trim();
const out = new Map();
let miss = 0;
for (const x of items) {
  if (x.item_type !== 'Weapon' && x.item_type !== 'Augment') continue;
  if (x.rarity === 'Amplified' || /Amplified/i.test(x.name)) continue;
  const name = x.item_type === 'Weapon' ? baseName(x) : x.name.trim();
  if (!name || out.has(name.toLowerCase())) continue;
  const file = `${CACHE}/icons/${String(x.id).replace(/[^\w.-]/g, '_')}.png`;
  if (!existsSync(file)) { miss++; continue; }
  const img = onBg(PNG.sync.read(readFileSync(file)));
  const weapon = x.item_type === 'Weapon';
  const shapes = (weapon ? ANGLES : [0]).map(a => { const r = a ? small(rotate(img, a, BG)) : img; return shapeOf(r, whole(r), null, 40, weapon ? 0 : AUGMENT_PAD); }).filter(Boolean);
  if (!shapes.length || shapes.some(s => s.v.length !== SHAPE_LEN)) { miss++; continue; }
  const mag = weapon ? Number(x.stat_block?.magazineSize) : NaN;
  out.set(name.toLowerCase(), { name, kind: weapon ? 'weapon' : 'augment', rarity: RARITY[x.rarity], mag: Number.isFinite(mag) && mag > 0 ? Math.round(mag) : undefined, shapes });
}
await server.close();
const list = [...out.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
const str = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const b64 = v => Buffer.from(Uint8Array.from(v.map(n => Math.max(0, Math.min(255, Math.round(n)))))).toString('base64');
writeFileSync('src/core/data/equipShapes.ts', `/* Tvary zbraní a augmentů pro rozpoznání míst výbavy (0.24.0). Zdroj ikon: MetaForge (odkaz v Settings → Zdroje
   dat), neoficiální, ne od Embarku. Vygenerováno scripts/gen-equip.mjs ${new Date().toISOString().slice(0, 10)} (${list.length} předmětů) z cache ikon.
   Obsahuje jen název, druh, vzácnost, základní zásobník a tvar ikony (čísla, ne obrázek): s = tvary jako base64 bajtů
   (SHAPE_LEN čísel 0–255) s poměrem stran a, u zbraní pro úhly narovnání ${ANGLES.join(', ')}°. */
export interface EquipShapeRow { n: string; k: 'weapon' | 'augment'; r?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; mag?: number; s: { v: string; a: number }[] }
export const EQUIP_SHAPES: EquipShapeRow[] = [
${list.map(e => `  { n: ${str(e.name)}, k: '${e.kind}'${e.rarity ? `, r: '${e.rarity}'` : ''}${e.mag ? `, mag: ${e.mag}` : ''}, s: [${e.shapes.map(s => `{ v: '${b64(s.v)}', a: ${s.aspect} }`).join(', ')}] },`).join('\n')}
];
`);
console.log(`tvary výbavy: ${list.length} (zbraně ${list.filter(e => e.kind === 'weapon').length}, augmenty ${list.filter(e => e.kind === 'augment').length}), bez ikony ${miss}`);
