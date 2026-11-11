/* Herní data = vestavěný základ + uživatelské úpravy (gameData). Úpravy se ukládají odděleně a skládají se při čtení. */
import type { ArcUnit, GameDataEdits, Material, Recipe, Route, SellItem, Station, Weapon } from './types';
import { ROUTES, SELL } from './data/routes';
import { ARC_UNITS } from './data/arc';
import { WEAPONS } from './data/weapons';
import { SOURCES, STATIONS } from './data/stations';
import { MATERIAL_CATEGORY } from './data/materials';
import { ARC_DIARY } from './data/arcDiary';
import { ARC_META_EN, ARC_TACTICS_EN, ROUTES_EN, SELL_EN, WEAPON_CATEGORY_EN } from './data/en';
import { getLang, type Lang } from '../i18n';

export type Edited<T> = T & { edited: boolean };

function compose<T extends { id: string }>(base: T[], over: Record<string, Partial<T>>, hidden: Record<string, true>, custom: T[]): Edited<T>[] {
  const out: Edited<T>[] = [];
  for (const b of base) {
    if (hidden[b.id]) continue;
    const o = over[b.id];
    out.push(o ? { ...b, ...o, id: b.id, edited: true } : { ...b, edited: false });
  }
  for (const c of custom) if (!hidden[c.id]) out.push({ ...c, edited: false });
  return out;
}

/* Vestavěný základ v angličtině: popisné texty z data/en.ts, ostatní pole beze změny. Úpravy uživatele se skládají
   nad základ v aktuálním jazyce, takže vlastní text zůstane, jak byl zadán. */
const ARC_EN: ArcUnit[] = ARC_UNITS.map(u => {
  const entry = ARC_DIARY.find(e => e.tac === u.tactic);
  const meta = ARC_META_EN[u.name] || {};
  return {
    ...u, tactic: (entry && ARC_TACTICS_EN[entry.name]) || u.tactic,
    type: u.type && (meta.type || u.type), category: u.category && (meta.category || u.category), weakness: u.weakness && (meta.weakness || u.weakness),
  };
});
const WEAPONS_EN: Weapon[] = WEAPONS.map(w => ({ ...w, category: w.category && (WEAPON_CATEGORY_EN[w.category] || w.category) }));
const arcBase = (lang: Lang): ArcUnit[] => (lang === 'en' ? ARC_EN : ARC_UNITS);
const weaponBase = (lang: Lang): Weapon[] => (lang === 'en' ? WEAPONS_EN : WEAPONS);

export const getArc = (gd: GameDataEdits, lang: Lang = getLang()): Edited<ArcUnit>[] => compose(arcBase(lang), gd.arc, gd.arcHidden, gd.arcCustom);
export const getWeapons = (gd: GameDataEdits, lang: Lang = getLang()): Edited<Weapon>[] => compose(weaponBase(lang), gd.weapons, gd.weaponsHidden, gd.weaponsCustom);
export const hiddenArc = (gd: GameDataEdits, lang: Lang = getLang()): ArcUnit[] => [...arcBase(lang), ...gd.arcCustom].filter(u => gd.arcHidden[u.id]);
export const hiddenWeapons = (gd: GameDataEdits, lang: Lang = getLang()): Weapon[] => [...weaponBase(lang), ...gd.weaponsCustom].filter(u => gd.weaponsHidden[u.id]);
export const baseArc = (id: string, lang: Lang = 'cs'): ArcUnit | undefined => arcBase(lang).find(u => u.id === id);
export const baseWeapon = (id: string, lang: Lang = 'cs'): Weapon | undefined => weaponBase(lang).find(u => u.id === id);

/* Trasy a prodejní ceník z deníku dostanou původ, aby šly upravit, skrýt a vrátit stejně jako ARC a zbraně. */
export const BASE_ROUTES: Route[] = ROUTES.map(r => ({ ...r, origin: 'denik' }));
export const BASE_SELL: SellItem[] = SELL.map(([name, price, note], i) => ({ id: 's' + i, name, price, note, origin: 'denik' }));
const ROUTES_BASE_EN: Route[] = BASE_ROUTES.map(r => {
  const e = ROUTES_EN[r.id];
  return e ? { ...r, name: e.name || r.name, risk: e.risk, loadout: e.loadout, yield: e.yield, steps: [...e.steps] } : r;
});
const SELL_BASE_EN: SellItem[] = BASE_SELL.map((x, i) => ({ ...x, name: SELL_EN[i]?.name || x.name, note: SELL_EN[i]?.note ?? x.note }));
const routeBase = (lang: Lang): Route[] => (lang === 'en' ? ROUTES_BASE_EN : BASE_ROUTES);
const sellBase = (lang: Lang): SellItem[] => (lang === 'en' ? SELL_BASE_EN : BASE_SELL);
export const getRoutes = (gd: GameDataEdits, lang: Lang = getLang()): Edited<Route>[] => compose(routeBase(lang), gd.routes, gd.routesHidden, gd.routesCustom);
export const getSell = (gd: GameDataEdits, lang: Lang = getLang()): Edited<SellItem>[] => compose(sellBase(lang), gd.sell, gd.sellHidden, gd.sellCustom);
export const hiddenRoutes = (gd: GameDataEdits, lang: Lang = getLang()): Route[] => [...routeBase(lang), ...gd.routesCustom].filter(u => gd.routesHidden[u.id]);
export const hiddenSell = (gd: GameDataEdits, lang: Lang = getLang()): SellItem[] => [...sellBase(lang), ...gd.sellCustom].filter(u => gd.sellHidden[u.id]);
/* Všechny trasy včetně skrytých, pro jména tras u starších raidů. */
export const routeLookup = (gd: GameDataEdits, lang: Lang = getLang()): Route[] =>
  [...routeBase(lang), ...gd.routesCustom].map(r => (gd.routes[r.id] ? { ...r, ...gd.routes[r.id], id: r.id } : r));
/* Vestavěný záznam bez úprav; bez jazyka česká podoba z deníku (podle ní store pozná nezměněná pole). */
export const baseRoute = (id: string, lang: Lang = 'cs'): Route | undefined => routeBase(lang).find(r => r.id === id);
export const baseSell = (id: string, lang: Lang = 'cs'): SellItem | undefined => sellBase(lang).find(r => r.id === id);

export const recipeKey = (station: string, level: number): string => `${station}:${level}`;

/* Stanice s upravenými recepty. Bez úprav vrací přímo vestavěné pole (výpočty jsou pak shodné s deníkem). */
export function getStations(gd: GameDataEdits): Station[] {
  if (!Object.keys(gd.recipes).length) return STATIONS;
  return STATIONS.map(st => {
    const levels: Record<number, Recipe> = { ...st.levels };
    let changed = false;
    for (const lvl of Object.keys(st.levels).map(Number)) {
      const r = gd.recipes[recipeKey(st.id, lvl)];
      if (r) { levels[lvl] = r; changed = true; }
    }
    return changed ? { ...st, levels } : st;
  });
}

export function getSources(gd: GameDataEdits): Record<string, string> {
  const out: Record<string, string> = { ...SOURCES };
  for (const m of gd.materialsCustom) if (m.source) out[m.name] = m.source;
  for (const [k, v] of Object.entries(gd.materials)) {
    if (v.source === undefined) continue;
    if (v.source) out[k] = v.source; else delete out[k];
  }
  return out;
}

/* Všechny známé materiály: z receptů, původů, kategorií, vlastních a z toho, co je na skladě. */
export function getMaterials(state: { gameData: GameDataEdits; inventory: Record<string, number> }): Material[] {
  const gd = state.gameData;
  const sources = getSources(gd);
  const custom = new Set(gd.materialsCustom.map(m => m.name));
  const names = new Set<string>();
  for (const st of getStations(gd)) for (const r of Object.values(st.levels)) for (const [m] of r) names.add(m);
  Object.keys(SOURCES).forEach(n => names.add(n));
  Object.keys(MATERIAL_CATEGORY).forEach(n => names.add(n));
  custom.forEach(n => names.add(n));
  Object.keys(state.inventory).forEach(n => names.add(n));
  return [...names].map(name => {
    const c = gd.materialsCustom.find(m => m.name === name);
    const o = gd.materials[name] || {};
    return {
      name,
      category: o.category || c?.category || MATERIAL_CATEGORY[name] || 'Ostatní',
      source: sources[name] || 'Loot',
      custom: custom.has(name),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
