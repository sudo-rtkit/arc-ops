/* Karta předmětu „Proč to potřebuju?“ (0.18.0): jeden pohled na předmět složený z existující logiky, nic se
   nepočítá znovu po svém:
   - údaje (vzácnost, hodnota, hmotnost, stack, typ): katalog (catalog.ts) a čísla předmětů (itemdb.ts);
   - zásoba: haveOfState / stockEntries z rady (advice.ts);
   - k čemu je teď potřeba: stejný seznam potřeb jako rada a Úklid (collectNeedList + needIndex: další úroveň stanic,
     Planner, cíle, dostupné úkoly, běžící projekty, nenaučené blueprinty), takže součet sedí s Inventory;
   - později: další úrovně stanic, zamčené úkoly a další fáze běžících projektů (jen přehled, do součtu nejdou);
   - aktivní plán raidu: řádek seznamu raidList (raidPrep.ts);
   - recyklace tam i zpět (itemdb.ts), typy míst (lootAreas.ts), body na vlastních mapách se stejným typem místa;
   - rada nech / recykluj / prodej: v zásobě stejná rada jako Inventory (advise), jinak rada přípravy na raid pro
     nalezený kus (lookupAdvice).
   Co data neznají, zůstane null / prázdné a UI to ukáže jako neznámé; nic se nedomýšlí. */
import type { AppState, Lang } from './types';
import { catalogByName, type CatalogItem } from './catalog';
import { itemData, recycleOutputs, recycleSources, TRADER_OFFERS, weaponStats, isBlueprint, type RecycleSource, type TraderOffer } from './itemdb';
import { advise, collectNeedList, haveOfState, needIndex, type Advice, type NeedKind } from './advice';
import { QUESTS, PROJECTS, locText, projectActive, questName, questStatus } from './quests';
import { getSources, getStations } from './gamedata';
import { itemAreas, type LootArea } from './lootAreas';
import { emptyGoals, lookupAdvice, raidList, type Verdict } from './raidPrep';
import { rarityOf, type RarityWord } from './compact';
import { MAPS } from './data/maps';
import type { Qty } from './data/arctracker';

export type CardNeedKind = NeedKind | 'plan';
export interface CardNeed {
  key: string; kind: CardNeedKind; label: string; qty: number;
  /* now = počítá se do potřeby (rada), later = až později (zamčený úkol, další úroveň, další fáze) */
  when: 'now' | 'later';
  /* předmět, který se pro úkol najde během raidu (ne ze zásoby): do součtu nejde */
  questItem?: boolean;
  /* kam vede (#modul/podsekce) */
  route: { module: string; sub?: string };
}
export interface CardPoi { map: string; mapName: string; id: string; name: string; area: string }
export interface ItemCardData {
  name: string;
  /* předmět je v katalogu nebo v číslech předmětů */
  known: boolean;
  type: string | null; category: CatalogItem['category'] | null;
  rarity: RarityWord;
  value: number | null; weight: number | null; stack: number | null;
  /* původ materiálu z dat aplikace (stanice), null = neznámý */
  source: string | null;
  /* vyrábí se jen s naučeným blueprintem (null = neví se) */
  needsBlueprint: boolean | null;
  blueprint: { is: boolean; learned: boolean };
  have: number;
  stock: { key: string; count: number }[];
  /* potřeba teď celkem (bez dvojího počítání) a kolik chybí */
  need: number; missing: number;
  needs: CardNeed[];
  plan: { need: number; have: number; missing: number; found: boolean; reasons: { label: string; qty: number }[] } | null;
  recycle: Qty[];
  recycleFrom: RecycleSource[];
  areas: LootArea[];
  pois: CardPoi[];
  verdict: { basis: 'stock'; advice: Advice } | { basis: 'found'; verdict: Verdict };
  offers: TraderOffer[];
  weapon: boolean;
}

const lower = (s: string) => s.trim().toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);

/* Kam vede zdroj potřeby. */
export function needRoute(kind: CardNeedKind, key: string): CardNeed['route'] {
  if (kind === 'quest') return { module: 'quests', sub: 'q=' + key.replace(/^quest:/, '') };
  if (kind === 'station') return { module: 'workshop', sub: key.split(':')[1] };
  if (kind === 'project') return { module: 'quests', sub: 'projects' };
  if (kind === 'goal') return { module: 'dashboard', sub: 'goals' };
  if (kind === 'craft' || kind === 'custom') return { module: 'inventory', sub: 'planner' };
  if (kind === 'blueprint') return { module: 'items', sub: 'blueprints' };
  return { module: 'raid' };
}

export function itemCard(s: AppState, nameIn: string, lang: Lang, today: string): ItemCardData {
  const name = nameIn.trim();
  const cat = catalogByName(name);
  const data = itemData(name);
  const haveOf = haveOfState(s);
  const have = haveOf(name);
  const stock: ItemCardData['stock'] = [];
  for (const [k, n] of Object.entries(s.inventory)) if (n > 0 && same(k, name)) stock.push({ key: k, count: n });
  for (const it of Object.values(s.items)) if (it.count > 0 && same(it.key, name)) stock.push({ key: it.key, count: it.count });

  /* ----- potřeby teď: stejný seznam jako rada ----- */
  const list = collectNeedList(s, today, lang);
  const needs = needIndex(list);
  const entry = needs.get(lower(name));
  const out: CardNeed[] = (entry?.sources ?? []).map(src => ({ key: src.key, kind: src.kind, label: src.label, qty: src.qty, when: 'now' as const, route: needRoute(src.kind, src.key) }));
  const keys = new Set(out.map(n => n.key));

  /* úkoly: předměty nalezené během dostupného úkolu (nejdou do součtu) a zamčené úkoly (později) */
  for (const q of QUESTS) {
    const st = questStatus(q, s.quests.done);
    if (st === 'done') continue;
    const key = 'quest:' + q.id;
    const deliver = q.deliver.filter(([m]) => same(m, name)).reduce((a, [, n]) => a + n, 0);
    const found = q.questItems.filter(([m]) => same(m, name)).reduce((a, [, n]) => a + n, 0);
    if (st === 'active') {
      if (found && !keys.has(key)) out.push({ key, kind: 'quest', label: questName(q, lang), qty: found, when: 'now', questItem: true, route: needRoute('quest', key) });
      continue;
    }
    if (deliver || found) out.push({ key, kind: 'quest', label: questName(q, lang), qty: deliver || found, when: 'later', ...(deliver ? {} : { questItem: true }), route: needRoute('quest', key) });
  }
  /* stanice: všechny další úrovně, které předmět chtějí a nejsou už mezi potřebami teď */
  for (const st of getStations(s.gameData)) {
    const cur = s.stations[st.id] ?? st.min;
    for (let lvl = cur + 1; lvl <= st.max; lvl++) {
      const key = `station:${st.id}:${lvl}`;
      if (keys.has(key)) continue;
      const qty = (st.levels[lvl] ?? []).filter(([m]) => same(m, name)).reduce((a, [, n]) => a + n, 0);
      if (qty) out.push({ key, kind: 'station', label: `${st.name} ${lvl}`, qty, when: 'later', route: needRoute('station', key) });
    }
  }
  /* projekty: další fáze běžících projektů po té, která je na řadě */
  for (const p of PROJECTS) {
    if (!projectActive(p, today)) continue;
    const phases = [...p.phases].sort((a, b) => a.phase - b.phase);
    phases.slice((s.projects[p.id] || 0) + 1).forEach(ph => {
      const qty = ph.req.filter(([m]) => same(m, name)).reduce((a, [, n]) => a + n, 0);
      const key = `project:${p.id}:${ph.phase}`;
      if (qty && !keys.has(key)) out.push({ key, kind: 'project', label: `${locText(p.name, lang)} ${ph.phase}`, qty, when: 'later', route: needRoute('project', key) });
    });
  }

  /* ----- aktivní plán raidu ----- */
  let plan: ItemCardData['plan'] = null;
  const planRows = s.raidPlan ? raidList(s, s.raidPlan.goals, lang, today) : [];
  if (s.raidPlan) {
    const row = planRows.find(r => same(r.mat, name));
    if (row) plan = { need: row.need, have: row.have, missing: row.missing, found: s.raidPlan.found.some(f => same(f, name)), reasons: row.reasons.map(r => ({ label: r.label, qty: r.qty })) };
  }

  /* ----- rada ----- */
  const stockKey = stock[0]?.key ?? name;
  const verdict: ItemCardData['verdict'] = have > 0
    ? { basis: 'stock', advice: advise({ key: stockKey, name, count: have, kind: s.inventory[stockKey] ? 'material' : 'item' }, needs, haveOf, !!s.advice.keep[stockKey]) }
    : { basis: 'found', verdict: lookupAdvice(s, name, s.raidPlan?.goals ?? emptyGoals(), planRows, lang, today) };

  /* ----- místa a body na mapách ----- */
  const areas = itemAreas(name);
  const pois: CardPoi[] = [];
  if (areas.length) {
    for (const m of MAPS) {
      for (const p of s.maps[m.id]?.pois ?? []) if (p.area && (areas as string[]).includes(p.area)) pois.push({ map: m.id, mapName: m.name, id: p.id, name: p.name, area: p.area });
    }
  }

  const need = entry?.total ?? 0;
  const sources = getSources(s.gameData);
  const srcKey = Object.keys(sources).find(k => same(k, name));
  return {
    name: cat?.name ?? data?.n ?? stock[0]?.key ?? name,
    known: !!(cat || data),
    type: cat?.type || data?.ty || null,
    category: cat?.category ?? null,
    rarity: rarityOf(cat?.name ?? name) !== 'unknown' ? rarityOf(cat?.name ?? name) : (data?.ra ?? 'unknown'),
    value: data?.v ?? null, weight: data?.w ?? null, stack: data?.s ?? null,
    source: srcKey ? sources[srcKey] : null,
    needsBlueprint: data ? !!data.bp : null,
    blueprint: { is: isBlueprint(name), learned: !!s.blueprints[data?.n ?? name] },
    have, stock,
    need, missing: Math.max(0, need - have),
    needs: out.sort((a, b) => Number(a.when === 'later') - Number(b.when === 'later') || Number(!!a.questItem) - Number(!!b.questItem)),
    plan,
    recycle: recycleOutputs(name),
    recycleFrom: recycleSources(name),
    areas, pois,
    verdict,
    offers: TRADER_OFFERS.filter(o => same(o.item, name)),
    weapon: !!weaponStats(name) && (cat?.category === 'weapon' || data?.ty === 'Weapon'),
  };
}
