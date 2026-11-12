/* Typy míst (loot_area z katalogu MetaForge) a typy bodů na mapě (0.14.0, návrh docs/design/maps).
   Typ místa u předmětu pochází jen z dat katalogu (scripts/gen-catalog.mjs); kde chybí, je „neznámé“ a nic se
   nedomýšlí. Typy míst se k mapám nepřiřazují (data o tom, které mapy mají které zóny, nemáme). Čisté funkce. */
import { catalogByName } from './catalog';

/* Pořadí, kódy a barvy podle docs/design/maps/assets/manifest.json (kód pomáhá rozlišit typ i bez barvy). */
export const LOOT_AREAS = [
  { id: 'ARC', slug: 'arc', code: 'A' },
  { id: 'Electrical', slug: 'electrical', code: 'E' },
  { id: 'Mechanical', slug: 'mechanical', code: 'M' },
  { id: 'Nature', slug: 'nature', code: 'N' },
  { id: 'Residential', slug: 'residential', code: 'R' },
  { id: 'Medical', slug: 'medical', code: '+' },
  { id: 'Commercial', slug: 'commercial', code: 'C' },
  { id: 'Old World', slug: 'old-world', code: 'O' },
  { id: 'Technological', slug: 'technological', code: 'T' },
  { id: 'Security', slug: 'security', code: 'S' },
  { id: 'Exodus', slug: 'exodus', code: 'X' },
  { id: 'Industrial', slug: 'industrial', code: 'I' },
  { id: 'Raider', slug: 'raider', code: '/' },
] as const;
export type LootArea = typeof LOOT_AREAS[number]['id'];
export const LOOT_AREA_IDS: LootArea[] = LOOT_AREAS.map(a => a.id);
export const isLootArea = (v: unknown): v is LootArea => typeof v === 'string' && (LOOT_AREA_IDS as string[]).includes(v);
const BY_ID = new Map<string, (typeof LOOT_AREAS)[number]>(LOOT_AREAS.map(a => [a.id, a]));
/* Slug pro CSS proměnné (--loot-<slug>) a glyf; neznámý typ = 'unknown'. */
export const areaSlug = (id: string): string => BY_ID.get(id)?.slug ?? 'unknown';
export const areaCode = (id: string): string => BY_ID.get(id)?.code ?? '?';

/* Typy míst předmětu z katalogu; prázdné pole = neznámé (předmět v katalogu chybí, nebo nemá loot_area). */
export function itemAreas(name: string): LootArea[] {
  return (catalogByName(name)?.areas ?? []).filter(isLootArea);
}

/* Typy bodů na mapě (ikony docs/design/maps/assets/icons). */
export const POI_TYPES = ['crate', 'weapon', 'extraction', 'hatch', 'key', 'quest', 'arc', 'pvp', 'room', 'note', 'player'] as const;
export type PoiType = typeof POI_TYPES[number];
export const isPoiType = (v: unknown): v is PoiType => typeof v === 'string' && (POI_TYPES as readonly string[]).includes(v);
