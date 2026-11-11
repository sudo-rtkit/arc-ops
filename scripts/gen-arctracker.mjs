// Herní data o úkolech, workshopu (hideout) a projektech z VEŘEJNÝCH endpointů ARC Tracker (https://arctracker.io,
// neoficiální, ne od Embarku). Jen při vývoji. Spuštění: node scripts/gen-arctracker.mjs [--offline]
//
// - Používá jen veřejná data hry bez přihlášení: /api/quests, /api/hideout, /api/projects?season=1,2 a /api/items
//   (jen pro převod id předmětu na anglický název, stejný jako v katalogu MetaForge a v materiálech aplikace).
//   Žádné uživatelské endpointy, klíče ani propojení účtu: synchronizace hráčského účtu porušuje podmínky Embarku.
// - Odpovědi se ukládají do scripts/.cache/arctracker/ (v .gitignore); --offline použije jen cache.
// - Zapíše src/core/data/arctracker.ts: id, názvy, krátké cíle úkolů, požadavky, odměny, fáze. Bez popisů a příběhu.
// - Milník 4: zapíše i src/core/data/itemdata.ts z téhož /api/items: hodnota, hmotnost, stack, výstupy recyklace,
//   příznak blueprintu a nabídka obchodníků (cena, kusy, denní limit, úroveň). Jen názvy a čísla.
//   Texty jsou vícejazyčné ({ en, de, … }); bere se cs, když existuje, jinak en.
// - Porovná workshop s ručně převedenými stanicemi aplikace (src/core/data/stations.ts) a rozdíly i názvy, které
//   nesedí na materiály aplikace nebo katalog MetaForge, zapíše do docs/superpowers/plans/catalog-mismatch.md
//   (oddíl „ARC Tracker“). Ruční data se nepřepisují.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const OFFLINE = process.argv.includes('--offline');
const BASE = 'https://arctracker.io/api/';
const CACHE = 'scripts/.cache/arctracker';
mkdirSync(CACHE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(path) {
  const file = `${CACHE}/${path.replace(/[?=,]/g, '_')}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  if (OFFLINE) throw new Error(`chybí cache ${file}`);
  const res = await fetch(BASE + path, { headers: { 'User-Agent': 'arc-raiders-companion data script (dev, one-off)' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text);
  await sleep(1000);
  return JSON.parse(text);
}

const quests = Object.values((await getJson('quests')).quests);
const hideout = Object.values((await getJson('hideout')).hideoutModules);
const projects = Object.values((await getJson('projects?season=1,2')).projects);
const itemsRaw = (await getJson('items')).items;
console.log(`ARC Tracker: ${quests.length} úkolů, ${hideout.length} modulů, ${projects.length} projektů, ${itemsRaw.length} předmětů`);

/* Vícejazyčný text → cs, když je, jinak en; zkrácený a bez zalomení. */
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const loc = (v, max = 160) => {
  if (typeof v === 'string') return clean(v).slice(0, max);
  const en = clean(v?.en).slice(0, max);
  const cs = clean(v?.cs).slice(0, max);
  return cs && cs !== en ? { en, cs } : en;
};
const titleCase = id => id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const itemName = new Map(itemsRaw.map(x => [x.id, clean(x.name?.en)]));
const unknownIds = new Set();
const nameOf = id => { const n = itemName.get(id); if (!n) { unknownIds.add(id); return titleCase(id); } return n; };
const pairs = list => (list || []).filter(x => x && x.itemId && x.quantity > 0).map(x => [nameOf(x.itemId), Math.round(x.quantity)]);
const sumPairs = list => { const m = new Map(); for (const [n, q] of list) m.set(n, (m.get(n) || 0) + q); return [...m]; };

/* Mapy pod id aplikace (src/core/data/maps.ts). */
const MAP_ID = { dam_battlegrounds: 'dam', buried_city: 'buried', the_spaceport: 'spaceport', the_blue_gate: 'bluegate', riven_tide: 'riven', stella_montis: 'stella', pendola_pass: 'pendola' };
const unknownMaps = new Set();
const mapId = m => { const id = MAP_ID[m]; if (!id) unknownMaps.add(m); return id || m; };
const Q = quests.map(q => ({
  id: q.id, name: loc(q.name, 80), trader: clean(q.trader), maps: (q.map || []).map(String).map(mapId),
  objectives: (q.objectives || []).map(o => loc(o, 160)).filter(Boolean),
  /* questItem: true = předmět se objeví až během úkolu; false = hráč ho donese ze zásoby (patří do nákupního seznamu) */
  deliver: sumPairs(pairs((q.requiredItemIds || []).filter(r => !r.questItem))),
  questItems: sumPairs(pairs((q.requiredItemIds || []).filter(r => r.questItem))),
  rewards: sumPairs(pairs(q.rewardItemIds)), xp: Math.round(q.xp || 0),
  prev: (q.previousQuestIds || []).map(String),
  ...(q.kind === 'research' ? { research: true } : {}),
})).sort((a, b) => String(a.name.en ?? a.name).localeCompare(String(b.name.en ?? b.name)));

const H = hideout.map(m => ({
  id: m.id, name: loc(m.name, 60), maxLevel: m.maxLevel,
  levels: (m.levels || []).map(l => {
    const outpost = (l.requires || []).map(r => r.outpostRooms).find(Number.isFinite);
    const coins = (l.otherRequirements || []).map(s => /^([\d,.]+)\s*Coins$/i.exec(String(s))?.[1]).find(Boolean);
    return { level: l.level, req: sumPairs(pairs(l.requirementItemIds)), ...(outpost ? { outpost } : {}), ...(coins ? { coins: Number(coins.replace(/[,.]/g, '')) } : {}) };
  }),
}));

const day = ts => (Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString().slice(0, 10) : undefined);
const P = projects.filter(p => !p.disabled).map(p => ({
  id: p.id, name: loc(p.name, 80), ...(day(p.startDate) ? { start: day(p.startDate) } : {}), ...(day(p.endDate) && p.endDate < 2.4e9 ? { end: day(p.endDate) } : {}),
  phases: (p.phases || []).map(ph => ({
    phase: ph.phase, name: loc(ph.name, 80),
    req: sumPairs(pairs(ph.requirementItemIds)),
    tasks: (ph.requirementCategories || []).map(c => loc(c.localizations || ph.description, 160)).filter(Boolean),
    /* odměny: za celou fázi, nebo (Trophy Display) za každý odevzdaný předmět */
    rewards: sumPairs([...pairs(ph.rewards), ...(ph.requirementItemIds || []).flatMap(r => pairs(r.rewardItemIds))]),
  })),
}));

/* ----- zápis ----- */
const lit = v => JSON.stringify(v).replace(/"([A-Za-z_$][\w$]*)":/g, '$1: ');
const out = `/* Úkoly, workshop (hideout) a projekty ARC Raiders. Zdroj: ARC Tracker (odkaz v Settings → Zdroje dat), neoficiální,
   ne od Embarku. Vygenerováno scripts/gen-arctracker.mjs ${new Date().toISOString().slice(0, 10)} z veřejných herních dat
   (${Q.length} úkolů, ${H.length} modulů, ${P.length} projektů). Jen id, názvy, krátké cíle, požadavky, odměny a fáze;
   žádné popisy. Text je anglicky, nebo { en, cs }, když zdroj má češtinu. Názvy předmětů jsou anglické herní názvy. */
export type Loc = string | { en: string; cs: string };
export type Qty = [string, number];
export interface AtQuest { id: string; name: Loc; trader: string; maps: string[]; objectives: Loc[]; deliver: Qty[]; questItems: Qty[]; rewards: Qty[]; xp: number; prev: string[]; research?: true }
export interface AtHideoutLevel { level: number; req: Qty[]; outpost?: number; coins?: number }
export interface AtModule { id: string; name: Loc; maxLevel: number; levels: AtHideoutLevel[] }
export interface AtPhase { phase: number; name: Loc; req: Qty[]; tasks: Loc[]; rewards: Qty[] }
export interface AtProject { id: string; name: Loc; start?: string; end?: string; phases: AtPhase[] }
export const AT_DATE = '${new Date().toISOString().slice(0, 10)}';
export const AT_QUESTS: AtQuest[] = [
${Q.map(q => '  ' + lit(q) + ',').join('\n')}
];
export const AT_HIDEOUT: AtModule[] = [
${H.map(m => '  ' + lit(m) + ',').join('\n')}
];
export const AT_PROJECTS: AtProject[] = [
${P.map(p => '  ' + lit(p) + ',').join('\n')}
];
`;
writeFileSync('src/core/data/arctracker.ts', out);
console.log(`zapsáno src/core/data/arctracker.ts (${(out.length / 1024).toFixed(0)} kB)`);

/* ----- milník 4: čísla o předmětech a nabídka obchodníků (z /api/items, žádný další endpoint) -----
   Prodejní hodnota, hmotnost, stack, výstupy recyklace, příznak „vyrábí se jen s blueprintem“ a typ (Blueprint = plán).
   Vynechá se vzhled Outpostu (nábytek, místnosti, designy, šablony) a varianty Amplified s módy („·“ v názvu). */
const SKIP_IT = new Set(['Design', 'Stencil', 'Outpost Furniture', 'Outpost Room']);
const RAR = { Common: 'common', Uncommon: 'uncommon', Rare: 'rare', Epic: 'epic', Legendary: 'legendary' };
const num = (v, d = 2) => (Number.isFinite(v) && v > 0 ? Math.round(v * 10 ** d) / 10 ** d : undefined);
const idPairs = obj => Object.entries(obj || {}).filter(([, q]) => q > 0).map(([id, q]) => [nameOf(id), Math.round(q)]);
const seenIt = new Set();
const IT = [];
for (const x of [...itemsRaw].sort((a, b) => Number(!!a.phasedOut) - Number(!!b.phasedOut))) {
  const n = clean(x.name?.en);
  if (!n || n.includes('·') || SKIP_IT.has(x.type) || seenIt.has(n.toLowerCase())) continue;
  seenIt.add(n.toLowerCase());
  const r = idPairs(x.recyclesInto);
  IT.push({
    n, ty: clean(x.type), ...(RAR[x.rarity] ? { ra: RAR[x.rarity] } : {}),
    ...(num(x.value, 0) ? { v: num(x.value, 0) } : {}), ...(num(x.weightKg) ? { w: num(x.weightKg) } : {}),
    ...(num(x.stackSize, 0) ? { s: num(x.stackSize, 0) } : {}), ...(r.length ? { r } : {}), ...(x.blueprintLocked ? { bp: 1 } : {}),
  });
}
IT.sort((a, b) => a.n.localeCompare(b.n));
const costName = id => (id === 'coins' ? 'Coins' : nameOf(id));
const OFFERS = [];
for (const x of itemsRaw) for (const v of x.vendors || []) {
  const n = clean(x.name?.en);
  if (!n || !v?.trader) continue;
  OFFERS.push({
    trader: clean(v.trader), item: n, cost: Object.entries(v.cost || {}).filter(([, q]) => q > 0).map(([id, q]) => [costName(id), Math.round(q)]),
    ...(v.quantity > 1 ? { qty: Math.round(v.quantity) } : {}), ...(v.limit > 0 ? { limit: Math.round(v.limit) } : {}),
    ...(v.refreshSeconds > 0 ? { refreshH: Math.round(v.refreshSeconds / 3600) } : {}), ...(v.requiredLevel > 0 ? { level: Math.round(v.requiredLevel) } : {}),
  });
}
OFFERS.sort((a, b) => a.trader.localeCompare(b.trader) || a.item.localeCompare(b.item));
const itemsJson = await getJson('items');
const ITEMS_DATE = String(itemsJson.generatedAt || new Date().toISOString()).slice(0, 10);
const outItems = `/* Čísla o předmětech ARC Raiders a nabídka obchodníků. Zdroj: ARC Tracker (odkaz v Settings → Zdroje dat), neoficiální,
   ne od Embarku. Vygenerováno scripts/gen-arctracker.mjs ${new Date().toISOString().slice(0, 10)} z veřejného /api/items (data ze dne
   ${ITEMS_DATE}; ${IT.length} předmětů, ${OFFERS.length} nabídek). Jen anglický název, typ, vzácnost a čísla; žádné popisy ani obrázky.
   n = název, ty = typ, ra = vzácnost, v = prodejní hodnota, w = hmotnost (kg), s = velikost stacku, r = výstupy recyklace,
   bp = vyrábí se jen s naučeným blueprintem. Nabídka: cost = cena (Coins nebo předmět), qty = kusů za nákup,
   limit = nákupů za refreshH hodin, level = potřebná úroveň obchodníka. */
import type { Qty } from './arctracker';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface ItemDataRow { n: string; ty: string; ra?: ItemRarity; v?: number; w?: number; s?: number; r?: Qty[]; bp?: 1 }
export interface TraderOffer { trader: string; item: string; cost: Qty[]; qty?: number; limit?: number; refreshH?: number; level?: number }
export const ITEMS_DATE = '${ITEMS_DATE}';
export const ITEM_DATA: ItemDataRow[] = [
${IT.map(x => '  ' + lit(x) + ',').join('\n')}
];
export const TRADER_OFFERS: TraderOffer[] = [
${OFFERS.map(x => '  ' + lit(x) + ',').join('\n')}
];
`;
writeFileSync('src/core/data/itemdata.ts', outItems);
console.log(`zapsáno src/core/data/itemdata.ts (${IT.length} předmětů, ${IT.filter(x => x.r).length} s recyklací, ${IT.filter(x => x.ty === 'Blueprint').length} blueprintů, ${OFFERS.length} nabídek, ${(outItems.length / 1024).toFixed(0)} kB)`);

/* ----- porovnání s daty aplikace ----- */
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { STATIONS } = await server.ssrLoadModule('/src/core/data/stations.ts');
const { getMaterials } = await server.ssrLoadModule('/src/core/gamedata.ts');
const { defaultState } = await server.ssrLoadModule('/src/core/state.ts');
const { CATALOG } = await server.ssrLoadModule('/src/core/data/catalog.ts');
await server.close();

const MAP = { weapon_bench: 'gunsmith', equipment_bench: 'gear', med_station: 'medical', refiner: 'refiner', utility_bench: 'utility', explosives_bench: 'explosives', scrappy: 'scrappy', research_station: 'research' };
const fmt = r => r.map(([n, q]) => `${q}× ${n}`).sort().join(', ') || '—';
const diffs = [];
for (const m of H) {
  const st = STATIONS.find(s => s.id === MAP[m.id]);
  if (!st) { diffs.push(`| ${m.name.en ?? m.name} (\`${m.id}\`) | — | modul v aplikaci není (${m.maxLevel ? `${m.maxLevel} úrovní` : 'bez úrovní'}) |`); continue; }
  if (st.max !== m.maxLevel) diffs.push(`| ${st.name} | max. úroveň | aplikace ${st.max}, ARC Tracker ${m.maxLevel} |`);
  for (const l of m.levels) {
    const a = fmt(st.levels[l.level] || []), b = fmt(l.req);
    if (a !== b && !(l.req.length === 0 && !st.levels[l.level])) diffs.push(`| ${st.name} ${l.level} | materiál | aplikace: ${a}; ARC Tracker: ${b} |`);
    const ao = st.req?.[l.level]?.outpost;
    if ((ao || 0) !== (l.outpost || 0)) diffs.push(`| ${st.name} ${l.level} | Outpost | aplikace ${ao ?? '—'}, ARC Tracker ${l.outpost ?? '—'} |`);
  }
}
/* Outpost aplikace (deník) proti projektu Sheltered Retreat, jehož 2. fáze staví Outpost. */
const outpost = STATIONS.find(s => s.id === 'outpost');
const sheltered = P.find(p => p.id === 'sheltered_retreat_project')?.phases.find(ph => ph.phase === 2);
if (outpost && sheltered) {
  const a = fmt(outpost.levels[1] || []), b = fmt(sheltered.req);
  diffs.push(`| Outpost 1 | proti projektu Sheltered Retreat, fáze 2 | ${a === b ? 'shodné' : `aplikace: ${a}; ARC Tracker: ${b}`} (úrovně 2–4 Outpostu ARC Tracker nemá) |`);
}
for (const st of STATIONS) if (!Object.values(MAP).includes(st.id)) diffs.push(`| ${st.name} (\`${st.id}\`) | — | v hideoutu ARC Tracker není (${st.id === 'outpost' ? 'Outpost je tam projekt, ne modul' : 'chybí'}) |`);

const mats = new Set(getMaterials(defaultState()).map(m => m.name.toLowerCase()));
const catalog = new Set(CATALOG.map(c => c.name.toLowerCase()));
const used = new Set([...Q.flatMap(q => q.deliver), ...H.flatMap(m => m.levels.flatMap(l => l.req)), ...P.flatMap(p => p.phases.flatMap(ph => ph.req))].map(([n]) => n));
const notInCatalog = [...used].filter(n => !catalog.has(n.toLowerCase())).sort();
const notInApp = [...used].filter(n => !mats.has(n.toLowerCase())).sort();

const section = `## ARC Tracker

Vygenerováno \`scripts/gen-arctracker.mjs\` ${new Date().toISOString().slice(0, 10)} (${Q.length} úkolů, ${H.length} modulů hideoutu, ${P.length} projektů).
Stanice aplikace pocházejí z původního deníku (\`src/core/data/stations.ts\`, hlídá je zlatý test) a skript je nepřepisuje.

### Workshop: rozdíly proti stanicím aplikace (${diffs.length})

| Stanice | Pole | Rozdíl |
|---|---|---|
${diffs.join('\n') || '| — | — | žádné |'}

### Názvy předmětů v požadavcích, které katalog MetaForge nezná (${notInCatalog.length})

${notInCatalog.map(n => `- ${n}`).join('\n') || '- žádné'}

### Předměty z požadavků úkolů a projektů, které nejsou mezi materiály aplikace (${notInApp.length})

Do nákupního seznamu a Planneru jdou pod svým herním názvem (jako materiál, i když ho Zásoba zatím nevede).

${notInApp.map(n => `- ${n}`).join('\n') || '- žádné'}
${unknownMaps.size ? `\n### Mapy bez id v aplikaci (${unknownMaps.size})\n\n${[...unknownMaps].map(n => `- \`${n}\``).join('\n')}\n` : ''}${unknownIds.size ? `\n### Id předmětů bez názvu v /api/items (${unknownIds.size})\n\n${[...unknownIds].sort().map(n => `- \`${n}\``).join('\n')}\n` : ''}`;

const DOC = 'docs/superpowers/plans/catalog-mismatch.md';
const prev = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '# Katalog × data aplikace\n';
const head = prev.split(/\n## ARC Tracker\n/)[0].trimEnd();
writeFileSync(DOC, `${head}\n\n${section}`);
console.log(`rozdíly workshopu: ${diffs.length}, mimo katalog: ${notInCatalog.length}, mimo materiály aplikace: ${notInApp.length}, neznámá id: ${unknownIds.size}`);
