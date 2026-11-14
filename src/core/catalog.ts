/* Přístup ke katalogu předmětů (src/core/data/catalog.ts, generuje scripts/gen-catalog.mjs z dat MetaForge):
   dekódování otisků, hledání podle názvu a přibližné přiřazení názvu přečteného z tooltipu. */
import { CATALOG, CATALOG_AREAS, CATALOG_TYPES, type CatalogCategory } from './data/catalog';
import type { CatalogFp, FpKind } from './vision/match';
import { FP_LEN } from './vision/fingerprint';
import type { Rarity } from './vision/rarity';
import type { ItemCategory } from './types';
import { EQUIP_SHAPES } from './data/equipShapes';
import { SHAPE_LEN, type EquipShape } from './vision/equip';

/* areas (0.14.0) = typy míst z loot_area MetaForge; chybí = neznámé */
export interface CatalogItem { id: string; name: string; category: CatalogCategory; type: string; rarity?: Rarity; fp?: number[]; areas?: string[] }

function decode(b64: string): number[] | undefined {
  const bin = atob(b64);
  if (bin.length !== FP_LEN) return undefined;
  const out = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let items: CatalogItem[] | null = null;
let byName: Map<string, CatalogItem> | null = null;
export function catalogItems(): CatalogItem[] {
  if (!items) {
    items = CATALOG.map(r => ({ id: r.id, name: r.name, category: r.category, type: CATALOG_TYPES[r.t] ?? '', ...(r.rarity ? { rarity: r.rarity } : {}), ...(r.f ? { fp: decode(r.f) } : {}), ...(r.a?.length ? { areas: r.a.map(i => CATALOG_AREAS[i]).filter(Boolean) } : {}) }));
    byName = new Map(items.map(x => [x.name.toLowerCase(), x]));
  }
  return items;
}
export const catalogByName = (name: string): CatalogItem | undefined => { catalogItems(); return byName!.get(name.trim().toLowerCase()); };
export const catalogCount = (): { items: number; withFp: number } => ({ items: catalogItems().length, withFp: catalogItems().filter(x => x.fp).length });

/* Otisky katalogu pro párování. Materiál = materiál aplikace nebo katalogová kategorie materiálu. */
export function catalogFps(materials: ReadonlySet<string>): CatalogFp[] {
  return catalogItems().filter(x => x.fp).map(x => ({ key: x.name, kind: (materials.has(x.name) || x.category === 'material' ? 'material' : 'item') as FpKind, fp: x.fp, rarity: x.rarity }));
}

/* Kategorie předmětu pro evidenci (materiály se evidují zvlášť v Zásobě). */
export const itemCategoryOf = (c: CatalogCategory | undefined): ItemCategory => (!c || c === 'material' ? 'other' : c);

/* Kategorie podle textu štítku tooltipu („QUICK USE“, „TOPSIDE MATERIAL“), když název v katalogu chybí. */
export function categoryFromTag(tag: string): CatalogCategory | null {
  const t = tag.replace(/[^A-Z]/gi, '').toUpperCase();
  if (!t) return null;
  if (/MATERIAL$/.test(t) || t === 'NATURE') return 'material';
  const map: Record<string, CatalogCategory> = { WEAPON: 'weapon', SHIELD: 'shield', AUGMENT: 'augment', AMMUNITION: 'ammo', QUICKUSE: 'quickUse', KEY: 'key' };
  return map[t] ?? 'other';
}

/* Vzdálenost přečteného textu od názvu (Levenshtein bez ohledu na velikost písmen a mezery). Nepřečtený znak '?'
   se shoduje s čímkoli za malou cenu (písmena J, Q, W, Z nemají vzor). */
export function nameDistance(read: string, name: string): number {
  const a = read.toUpperCase().replace(/[^A-Z0-9?]/g, ''), b = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prev = new Array<number>(b.length + 1), cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : a[i - 1] === '?' ? 0.3 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/* Nejbližší název ze seznamu; null, když je i nejbližší příliš daleko (víc než asi čtvrtina znaků). */
export function matchName(read: string, names: Iterable<string>): { name: string; dist: number } | null {
  const len = read.replace(/[^A-Z0-9?]/gi, '').length;
  if (len < 2) return null;
  let best: { name: string; dist: number } | null = null;
  for (const n of names) {
    const d = nameDistance(read, n);
    if (!best || d < best.dist || (d === best.dist && n.length < best.name.length)) best = { name: n, dist: d };
  }
  return best && best.dist <= Math.max(1, len * 0.25) ? best : null;
}

/* Kontext rozpoznávání pro UI: otisky katalogu, materiály aplikace a známé názvy pro tooltip. */
export function matchContext(materials: string[], itemNames: string[] = []): { catalog: CatalogFp[]; materials: string[]; names: string[] } {
  return { catalog: catalogFps(new Set(materials)), materials, names: [...catalogItems().map(x => x.name), ...itemNames] };
}

/* 0.24.0: tvary zbraní a augmentů pro místa výbavy (src/core/data/equipShapes.ts, generuje scripts/gen-equip.mjs). */
let shapes: EquipShape[] | null = null;
export function equipShapes(): EquipShape[] {
  if (!shapes) {
    const dec = (b64: string): number[] => { const bin = atob(b64); return Array.from(bin, c => c.charCodeAt(0)); };
    shapes = EQUIP_SHAPES.map(r => ({
      name: r.n, kind: r.k, ...(r.r ? { rarity: r.r } : {}), ...(r.mag ? { mag: r.mag } : {}),
      shapes: r.s.map(x => ({ v: dec(x.v), aspect: x.a })).filter(x => x.v.length === SHAPE_LEN),
    }));
  }
  return shapes;
}
