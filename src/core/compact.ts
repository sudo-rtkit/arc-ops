/* Výběr dat pro kompaktní režim hlavního okna (0.9.0). Čisté funkce nad stavem a odvozenými hodnotami:
   - aktivní úkoly: připnuté (v pořadí připnutí), pak rozpracované (zaškrtnutý cíl, nebo část předmětů k odevzdání
     už je v zásobě),
     pak ostatní dostupné; hotové nikdy, nejvýš `max` (1–5);
   - další vylepšení: uživatelem zvolený cíl (Material Planner / cíle), jinak nejbližší dosažitelný upgrade;
   - nákupní seznam: chybějící materiál právě pro tento upgrade (ne součet všech cílů), nejvýš 5;
     když upgradu nic nechybí, nejvíc chybějící materiál ze všech cílů;
   - prázdný stav pro úplně nového hráče. */
import type { AppState, Recipe, Station } from './types';
import { QUESTS, objectiveProgress, questName, questStatus } from './quests';
import type { AtQuest } from './data/arctracker';
import { catalogByName } from './catalog';
import type { Lang } from '../i18n';

export type RarityWord = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'unknown';
const RARITIES: RarityWord[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const rarityOf = (name: string): RarityWord => {
  const r = catalogByName(name)?.rarity;
  return r && (RARITIES as string[]).includes(r) ? (r as RarityWord) : 'unknown';
};

/* Kolik kusů předmětu hráč má (materiál v Inventory, ostatní předměty v items). */
export const haveOf = (s: Pick<AppState, 'inventory' | 'items'>, name: string): number => s.inventory[name] || s.items[name]?.count || 0;

/* Celá zásoba podle názvu, jak ji čte haveOf (0.13.1): materiály ze Zásoby, k tomu předměty z Vybavení bez tieru
   (klíč nebo předmět k použití z požadavku úkolu). Materiál ze Zásoby má přednost. */
export function stockOf(s: Pick<AppState, 'inventory' | 'items'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of Object.values(s.items)) if (!it.tier && it.count > 0) out[it.key] = it.count;
  for (const [m, n] of Object.entries(s.inventory)) if (n > 0) out[m] = n;
  return out;
}

/* by = podle čeho je postup: zaškrtnuté cíle (0.10.2, mají přednost, když nějaký je), jinak předměty k odevzdání */
export interface CompactQuest { id: string; name: string; have: number; need: number; by: 'objectives' | 'items'; pinned: boolean; objectives: number; trader: string }

/* Postup úkolu podle předmětů k odevzdání (když hráč nezaškrtl žádný cíl). */
function itemProgress(q: AtQuest, s: Pick<AppState, 'inventory' | 'items'>): { have: number; need: number } {
  let have = 0, need = 0;
  for (const [m, n] of [...q.deliver, ...q.questItems]) { need += n; have += Math.min(n, haveOf(s, m)); }
  return { have, need };
}

function progressOf(q: AtQuest, s: Pick<AppState, 'quests' | 'inventory' | 'items'>): { have: number; need: number; by: CompactQuest['by'] } {
  const o = objectiveProgress(s.quests.objectives, q);
  return o.done > 0 ? { have: o.done, need: o.total, by: 'objectives' } : { ...itemProgress(q, s), by: 'items' };
}

export function activeQuests(s: Pick<AppState, 'quests' | 'inventory' | 'items'>, lang: Lang, max: number): CompactQuest[] {
  const done = s.quests.done, pinned = s.quests.pinned ?? [];
  const row = (q: AtQuest): CompactQuest => ({ id: q.id, name: questName(q, lang), ...progressOf(q, s), pinned: pinned.includes(q.id), objectives: q.objectives.length, trader: q.trader });
  const byId = new Map(QUESTS.map(q => [q.id, q]));
  const first = pinned.map(id => byId.get(id)).filter((q): q is AtQuest => !!q && !done[q.id]).map(row);
  const seen = new Set(first.map(q => q.id));
  const rest = QUESTS.filter(q => !seen.has(q.id) && questStatus(q, done) === 'active').map(row);
  const started = rest.filter(q => q.have > 0).sort((a, b) => b.have / b.need - a.have / a.need || a.name.localeCompare(b.name));
  const other = rest.filter(q => q.have === 0).sort((a, b) => a.name.localeCompare(b.name));
  return [...first, ...started, ...other].slice(0, Math.max(0, max));
}

export interface UpgradeMat { mat: string; have: number; need: number; missing: number; rarity: RarityWord }
export interface CompactUpgrade {
  station: Station; level: number; mats: UpgradeMat[]; missing: number; have: number; need: number;
  block: string | null; chosen: boolean;
}

interface NeedLike { station: Station; level: number; mats: Recipe; block: string | null; ready: number }
interface TargetLike { station: Station; current: number; target: number }

const matsOf = (recipe: Recipe, inventory: Record<string, number>): UpgradeMat[] =>
  recipe.map(([mat, need]) => { const have = inventory[mat] || 0; return { mat, have, need, missing: Math.max(0, need - have), rarity: rarityOf(mat) }; });

/* Další vylepšení: přednost má uživatelem zvolený cíl (nejpřipravenější z nich), jinak nejbližší dosažitelný
   upgrade (nezablokovaný, s nejvyšší připraveností a nejméně chybějícími kusy); když jsou všechny zablokované,
   nejpřipravenější z nich. */
export function nextUpgrade(needs: NeedLike[], targets: TargetLike[], inventory: Record<string, number>): CompactUpgrade | null {
  if (!needs.length) return null;
  const chosenIds = new Set(targets.filter(t => t.target > t.current).map(t => t.station.id));
  const missingOf = (n: NeedLike) => n.mats.reduce((a, [m, q]) => a + Math.max(0, q - (inventory[m] || 0)), 0);
  const rank = (list: NeedLike[]) => [...list].sort((a, b) => b.ready - a.ready || missingOf(a) - missingOf(b) || a.station.name.localeCompare(b.station.name))[0];
  const chosen = needs.filter(n => chosenIds.has(n.station.id));
  const pick = chosen.length ? rank(chosen) : rank(needs.filter(n => !n.block)) ?? rank(needs);
  if (!pick) return null;
  const mats = matsOf(pick.mats, inventory);
  return {
    station: pick.station, level: pick.level, mats, block: pick.block, chosen: chosen.length > 0,
    missing: mats.reduce((a, m) => a + m.missing, 0), have: mats.reduce((a, m) => a + Math.min(m.have, m.need), 0), need: mats.reduce((a, m) => a + m.need, 0),
  };
}

export interface ShopRow { mat: string; have: number; need: number; missing: number; rarity: RarityWord }
export interface CompactShop { forUpgrade: boolean; rows: ShopRow[] }

/* Nákupní seznam kompaktu: chybějící materiál pro zvolený upgrade; když mu nic nechybí, nejvíc chybějící
   materiál ze všech cílů (stanice a dostupné úkoly). */
export function compactShopping(up: CompactUpgrade | null, shop: { mat: string; have: number; need: number; missing: number }[], max = 5): CompactShop {
  const own = up ? up.mats.filter(m => m.missing > 0).sort((a, b) => b.missing - a.missing || a.mat.localeCompare(b.mat)) : [];
  if (own.length) return { forUpgrade: true, rows: own.slice(0, max) };
  return {
    forUpgrade: false,
    rows: shop.filter(r => r.missing > 0).sort((a, b) => b.missing - a.missing || a.mat.localeCompare(b.mat)).slice(0, max)
      .map(r => ({ mat: r.mat, have: r.have, need: r.need, missing: r.missing, rarity: rarityOf(r.mat) })),
  };
}

/* Úplně nový hráč: nic nezadal (výchozí profil, prázdná zásoba, žádné úkoly ani cíle, raidy ani stanice nad minimem). */
export function isFreshProfile(s: Pick<AppState, 'profile' | 'inventory' | 'items' | 'quests' | 'raids' | 'stations'>, stationMins: Record<string, number>): boolean {
  const p = s.profile;
  if (p.level > 1 || p.xp > 0 || p.coins > 0 || p.rounds > 0) return false;
  if (Object.keys(s.inventory).length || Object.keys(s.items).length || Object.keys(s.quests.done).length || Object.keys(s.quests.objectives ?? {}).length || s.raids.length) return false;
  return Object.entries(s.stations).every(([id, lvl]) => lvl <= (stationMins[id] ?? 0));
}
