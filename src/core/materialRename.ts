/* 0.13.1: převod uloženého stavu na opravené názvy materiálů (src/core/data/materials.ts, MATERIAL_RENAMES).
   Volá ho normalize při každém načtení i obnově zálohy. Je idempotentní: stav bez starých názvů se nezmění.
   Materiál je v uloženém stavu klíčem nebo názvem na více místech; převedou se všechna, aby se starý název neobjevil
   v Zásobě znovu (getMaterials bere i klíče Zásoby) a aby převod lootu z raidu nic nezapočítal dvakrát. */
import type { AppState, ItemQty, Recipe } from './types';
import { MATERIAL_RENAMES } from './data/materials';

type Renames = Readonly<Record<string, string>>;

/* Záznamy s počtem: stejný název se sloučí (součet), pořadí zůstane podle prvního výskytu. */
function renameQty(list: ItemQty[], r: Renames): ItemQty[] {
  if (!list.some(x => r[x.name])) return list;
  const out: ItemQty[] = [];
  for (const x of list) {
    const name = r[x.name] ?? x.name;
    const same = out.find(y => y.name === name);
    if (same) same.qty += x.qty; else out.push({ ...x, name });
  }
  return out;
}

function renameRecipe(list: Recipe, r: Renames): Recipe {
  if (!list.some(([m]) => r[m])) return list;
  const out: Recipe = [];
  for (const [m, n] of list) {
    const name = r[m] ?? m;
    const same = out.find(y => y[0] === name);
    if (same) same[1] += n; else out.push([name, n]);
  }
  return out;
}

/* Klíč objektu: když už nový klíč existuje, rozhodne merge (výchozí: nový klíč zůstane). */
function renameKeys<T>(obj: Record<string, T>, r: Renames, merge: (old: T, cur: T) => T = (_o, c) => c): void {
  for (const [from, to] of Object.entries(r)) {
    if (!(from in obj)) continue;
    const old = obj[from];
    delete obj[from];
    obj[to] = to in obj ? merge(old, obj[to]) : old;
  }
}

export function migrateMaterialNames(s: AppState, r: Renames = MATERIAL_RENAMES): AppState {
  /* Zásoba: měl-li hráč oba názvy (ruční počet pod starým, snímek pod herním), platí vyšší počet. Součet by týž
     stack započítal dvakrát, a vyšší počet se neztratí. */
  renameKeys(s.inventory, r, (old, cur) => Math.max(old, cur));
  const gd = s.gameData;
  renameKeys(gd.materials, r);
  const custom = new Set(gd.materialsCustom.map(m => m.name));
  gd.materialsCustom = gd.materialsCustom
    .filter(m => !(r[m.name] && custom.has(r[m.name])))
    .map(m => (r[m.name] ? { ...m, name: r[m.name] } : m));
  for (const k of Object.keys(gd.recipes)) gd.recipes[k] = renameRecipe(gd.recipes[k], r);
  for (const g of s.goals) if (g.link.kind === 'material' && r[g.link.mat]) g.link = { ...g.link, mat: r[g.link.mat] };
  for (const p of s.planner.items) p.mats = renameQty(p.mats, r);
  for (const x of s.raids) {
    x.gear = renameQty(x.gear, r);
    x.loot = renameQty(x.loot, r);
    x.lost = renameQty(x.lost, r);
    x.lootApplied = renameQty(x.lootApplied, r);
    if (x.lootScan) x.lootScan = { ...x.lootScan, items: renameQty(x.lootScan.items, r) };
  }
  s.vision.learned = s.vision.learned.map(l => (l.kind === 'material' && r[l.itemKey] ? { ...l, itemKey: r[l.itemKey] } : l));
  renameKeys(s.advice.keep, r);
  /* tier list: starý název dostane herní název; je-li herní název už zařazený, starý se vynechá */
  const ranked = new Set(Object.values(s.tierList.items).flat());
  for (const tier of Object.keys(s.tierList.items) as (keyof typeof s.tierList.items)[]) {
    const list = s.tierList.items[tier];
    if (!list.some(n => r[n])) continue;
    s.tierList.items[tier] = list.flatMap(n => {
      const to = r[n];
      if (!to) return [n];
      if (ranked.has(to)) return [];
      ranked.add(to);
      return [to];
    });
  }
  return s;
}
