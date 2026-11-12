// Katalog předmětů z MetaForge (https://metaforge.app/arc-raiders, neoficiální, ne od Embarku). Jen při vývoji.
// Spuštění: node scripts/gen-catalog.mjs [--offline]
//
// - Seznam předmětů stáhne z https://metaforge.app/api/arc-raiders/items (po stránkách) do scripts/.cache/
//   (složka je v .gitignore). MetaForge žádá ukládat data u sebe a API nevolat opakovaně, proto cache;
//   --offline použije jen cache.
// - Ikony stáhne jen do cache a spočítá z nich otisk STEJNOU funkcí, jakou používá aplikace
//   (src/core/vision/fingerprint.ts, načtená přes Vite). Ikona se nejdřív vloží do políčka jako ve hře
//   (tmavý podklad, ikona 74/96 políčka, střed ve výšce 36/96 – změřeno na snímcích s tooltipem).
// - Zapíše src/core/data/catalog.ts jen s { id, name, category, rarity, fp, typ místa } – žádné obrázky ani popisy.
//   0.14.0: typ místa (pole loot_area MetaForge, např. „Electrical, Technological“) jako indexy do CATALOG_AREAS.
//   Předmět bez loot_area ho nemá a aplikace ukáže „neznámé“; nic se nedomýšlí.
//   Otisk je kvůli velikosti uložen jako base64 bajtů (dekóduje src/core/catalog.ts).
// - Názvy materiálů aplikace, které v katalogu nejsou, zapíše do docs/superpowers/plans/catalog-mismatch.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const OFFLINE = process.argv.includes('--offline');
const API = 'https://metaforge.app/api/arc-raiders/items';
const CACHE = 'scripts/.cache';
mkdirSync(`${CACHE}/icons`, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, file) {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  if (OFFLINE) throw new Error(`chybí cache ${file}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'arc-raiders-companion catalog script (dev, one-off)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text);
  await sleep(300);
  return JSON.parse(text);
}

/* Typy, které se v inventory nevyskytují (vzhled postavy), se vynechají; stejně tak „Amplified“ varianty zbraní. */
const SKIP_TYPES = new Set(['Outfits', 'Cosmetic', 'Design', 'Stencil']);
const CATEGORY = {
  Weapon: 'weapon', Shield: 'shield', Augment: 'augment', Ammunition: 'ammo', 'Quick Use': 'quickUse', Key: 'key',
  'Topside Material': 'material', 'Refined Material': 'material', 'Basic Material': 'material', Nature: 'material', Material: 'material',
};
const RARITY = { Common: 'common', Uncommon: 'uncommon', Rare: 'rare', Epic: 'epic', Legendary: 'legendary' };
/* Plán (blueprint) má u všech předmětů skoro stejnou ikonu: otisk by nic nerozlišil, nese se jen název. */
const NO_FP = new Set(['Blueprint']);

const items = [];
for (let page = 1; ; page++) {
  const j = await getJson(`${API}?limit=200&page=${page}`, `${CACHE}/items-${page}.json`);
  items.push(...j.data);
  if (!j.pagination?.hasNextPage) break;
}
console.log(`MetaForge: ${items.length} položek`);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { fingerprint } = await server.ssrLoadModule('/src/core/vision/fingerprint.ts');
const { resize } = await server.ssrLoadModule('/src/core/vision/image.ts');
const { iconArea } = await server.ssrLoadModule('/src/core/vision/cells.ts');
const { getMaterials } = await server.ssrLoadModule('/src/core/gamedata.ts');
const { defaultState } = await server.ssrLoadModule('/src/core/state.ts');

const CELL = 96, ICON = 74, CY = 36, BG = [16, 19, 31];
function iconFp(png) {
  const k = png.width / ICON, C = Math.round(CELL * k);
  const out = new Uint8ClampedArray(C * C * 4);
  for (let i = 0; i < C * C; i++) { out[i * 4] = BG[0]; out[i * 4 + 1] = BG[1]; out[i * 4 + 2] = BG[2]; out[i * 4 + 3] = 255; }
  const ox = Math.round((CELL / 2) * k - png.width / 2), oy = Math.round(CY * k - png.height / 2);
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const X = x + ox, Y = y + oy;
    if (X < 0 || Y < 0 || X >= C || Y >= C) continue;
    const s = (y * png.width + x) * 4, d = (Y * C + X) * 4, a = png.data[s + 3] / 255;
    for (let c = 0; c < 3; c++) out[d + c] = png.data[s + c] * a + out[d + c] * (1 - a);
  }
  const cell = resize({ width: C, height: C, data: out }, CELL, CELL);
  return fingerprint(cell, iconArea({ x: 0, y: 0, w: CELL, h: CELL }), null);
}

/* Zbraně jsou v katalogu po tierech („Anvil I“ … „Anvil IV“) se stejnou ikonou; tier se čte z políčka. */
const baseName = (x) => (x.item_type === 'Weapon' ? x.name.replace(/\s+(I|II|III|IV)$/, '') : x.name);
/* Typy míst z loot_area (text oddělený čárkami), bez opakování, v pořadí zdroje. */
const lootAreas = (x) => [...new Set(String(x.loot_area ?? '').split(',').map(a => a.trim()).filter(Boolean))];

const out = new Map();
let icons = 0, iconFail = 0;
for (const x of items) {
  if (SKIP_TYPES.has(x.item_type) || x.rarity === 'Amplified') continue;
  const name = baseName(x).trim();
  if (!name || out.has(name.toLowerCase())) continue;
  const e = { id: String(x.id), name, category: CATEGORY[x.item_type] || 'other', type: x.item_type, rarity: RARITY[x.rarity], areas: lootAreas(x) };
  if (x.icon && !NO_FP.has(x.item_type)) {
    const file = `${CACHE}/icons/${String(x.id).replace(/[^\w.-]/g, '_')}.png`;
    try {
      if (!existsSync(file)) {
        if (OFFLINE) throw new Error('offline');
        const res = await fetch(x.icon);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        await sleep(150);
      }
      e.fp = iconFp(PNG.sync.read(readFileSync(file)));
      icons++;
    } catch (err) { iconFail++; if (iconFail <= 5) console.warn(`ikona ${x.id}: ${err.message}`); }
  }
  out.set(name.toLowerCase(), e);
}
await server.close();
const list = [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
console.log(`katalog: ${list.length} předmětů, otisk ikony: ${icons}, bez ikony: ${iconFail}`);
if (!icons) console.warn('POZOR: žádná ikona nešla načíst – katalog obsahuje jen názvy a kategorie, rozpoznávání stojí na učení.');

const str = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const b64 = fp => Buffer.from(Uint8Array.from(fp.map(v => Math.max(0, Math.min(255, Math.round(v)))))).toString('base64');
const types = [...new Set(list.map(e => e.type))].sort();
const areas = [...new Set(list.flatMap(e => e.areas))].sort();
const withAreas = list.filter(e => e.areas.length).length;
console.log(`typ místa (loot_area): ${withAreas} předmětů, ${areas.length} typů`);
writeFileSync('src/core/data/catalog.ts', `/* Katalog předmětů ARC Raiders. Zdroj: MetaForge (odkaz v Settings → Zdroje dat), neoficiální, ne od Embarku.
   Vygenerováno scripts/gen-catalog.mjs ${new Date().toISOString().slice(0, 10)} (${list.length} předmětů, ${icons} s otiskem ikony).
   Obsahuje jen identifikátor, anglický název, kategorii, vzácnost, otisk ikony (čísla, ne obrázek) a typ místa.
   f = otisk jako base64 bajtů (FP_LEN čísel 0–255), t = index typu v CATALOG_TYPES,
   a = typy míst (loot_area MetaForge, ${withAreas} předmětů) jako indexy v CATALOG_AREAS; bez a = neznámé. */
export type CatalogCategory = 'material' | 'weapon' | 'shield' | 'augment' | 'ammo' | 'quickUse' | 'key' | 'other';
export type CatalogRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface CatalogRow { id: string; name: string; category: CatalogCategory; t: number; rarity?: CatalogRarity; f?: string; a?: number[] }
/* Názvy typů z MetaForge (velkými písmeny je ukazuje štítek tooltipu ve hře). */
export const CATALOG_TYPES: string[] = [${types.map(str).join(', ')}];
/* Typy míst z pole loot_area MetaForge (stabilní anglické katalogové hodnoty). */
export const CATALOG_AREAS: string[] = [${areas.map(str).join(', ')}];
export const CATALOG: CatalogRow[] = [
${list.map(e => `  { id: ${str(e.id)}, name: ${str(e.name)}, category: '${e.category}', t: ${types.indexOf(e.type)}${e.rarity ? `, rarity: '${e.rarity}'` : ''}${e.fp ? `, f: '${b64(e.fp)}'` : ''}${e.areas.length ? `, a: [${e.areas.map(x => areas.indexOf(x)).join(', ')}]` : ''} },`).join('\n')}
];
`);

/* Milník 4: statistiky zbraní pro porovnání (stat_block MetaForge, tier I nebo zbraň bez tieru). Jen čísla. */
const WSTAT = { damage: 'dmg', fireRate: 'fr', range: 'rng', stability: 'stab', agility: 'agi', stealth: 'stl', magazineSize: 'mag', weight: 'w' };
const wstats = new Map();
for (const x of items) {
  if (x.item_type !== 'Weapon' || x.rarity === 'Amplified' || /Amplified/i.test(x.name)) continue;
  const m = /^(.*?)(?:\s+(I|II|III|IV))?$/.exec(x.name.trim());
  if (!m || (m[2] && m[2] !== 'I') || wstats.has(m[1])) continue;
  const row = { n: m[1] };
  for (const [k, short] of Object.entries(WSTAT)) { const v = Number(x.stat_block?.[k]); if (Number.isFinite(v) && v > 0) row[short] = Math.round(v * 10) / 10; }
  if (Object.keys(row).length > 1) wstats.set(m[1], row);
}
const wlist = [...wstats.values()].sort((a, b) => a.n.localeCompare(b.n));
writeFileSync('src/core/data/weaponStats.ts', `/* Statistiky zbraní ARC Raiders pro porovnání. Zdroj: MetaForge (odkaz v Settings → Zdroje dat), neoficiální, ne od Embarku.
   Vygenerováno scripts/gen-catalog.mjs ${new Date().toISOString().slice(0, 10)} (${wlist.length} zbraní, hodnoty pro tier I). Jen čísla.
   dmg = poškození, fr = kadence, rng = dostřel, stab = stabilita, agi = ovladatelnost, stl = nenápadnost, mag = zásobník, w = hmotnost (kg). */
export interface WeaponStatRow { n: string; dmg?: number; fr?: number; rng?: number; stab?: number; agi?: number; stl?: number; mag?: number; w?: number }
export const WEAPON_STATS: WeaponStatRow[] = [
${wlist.map(r => `  { ${Object.entries(r).map(([k, v]) => `${k}: ${typeof v === 'string' ? str(v) : v}`).join(', ')} },`).join('\n')}
];
`);
console.log(`statistiky zbraní: ${wlist.length} (src/core/data/weaponStats.ts)`);

/* Materiály aplikace (deník, recepty stanic), které v katalogu pod stejným názvem nejsou. */
const mats = getMaterials(defaultState()).map(m => m.name);
const missing = mats.filter(n => !out.has(n.toLowerCase()));
const near = n => list.map(e => e.name).filter(c => c.toLowerCase().includes(n.toLowerCase().split(' ')[0])).slice(0, 4);
/* Oddíl ARC Tracker zapisuje scripts/gen-arctracker.mjs; při přegenerování katalogu se zachová. */
const MISMATCH = 'docs/superpowers/plans/catalog-mismatch.md';
const atSection = existsSync(MISMATCH) ? (readFileSync(MISMATCH, 'utf8').split(/\n## ARC Tracker\n/)[1] ?? null) : null;
writeFileSync(MISMATCH, `# Katalog MetaForge × materiály aplikace

Vygenerováno \`scripts/gen-catalog.mjs\` ${new Date().toISOString().slice(0, 10)}. Materiály aplikace (deník, recepty stanic), které v katalogu
MetaForge pod stejným anglickým názvem nejsou: ${missing.length} z ${mats.length}. Ke kontrole ručně (překlep, přejmenování ve hře, nebo
předmět, který MetaForge nevede). Rozpoznávání je u nich jen přes naučené otisky.

| Materiál v aplikaci | Podobné názvy v katalogu |
|---|---|
${missing.map(n => `| ${n} | ${near(n).join(', ') || '—'} |`).join('\n') || '| — | žádné |'}
${atSection !== null ? `\n## ARC Tracker\n${atSection}` : ''}`);
console.log(`neshody názvů materiálů: ${missing.length} (docs/superpowers/plans/catalog-mismatch.md)`);
