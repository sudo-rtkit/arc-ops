/* Loot ze snímku FINDINGS do evidence raidu (0.8.1). Čisté funkce; snímek stavu a uložení přidává store.
   Pravidla:
   - Obsah BACKPACK a QUICK USE není automaticky nový loot: odečte se známá výbava raidu (výbava zadaná u raidu,
     jinak položky jeho loadoutu). Když výbava známá není, zápis vyžaduje výslovnou ruční kontrolu.
   - EQUIPMENT se nečte vůbec a hodnota loadoutu se nikam nepřičítá (mince profilu ani výdělek raidu se nemění).
   - Stejný snímek (podpis) se zapíše nejvýš jednou. Nový snímek téhož raidu předchozí loot ze snímku nahradí
     (jen s výslovným souhlasem), nepřičte se k němu.
   - Převod do Inventory jde přes stejný rozdíl lootu jako u ručního raidu (lootApplied), takže nic dvakrát. */
import type { AppState, ItemQty, Loadout, Raid } from './types';
import type { ScreenRead } from './vision/read';
import { applyDelta, ITEM_MAX, lootDelta, normalizeItems } from './raidItems';
import { LIMITS, LOOT_SIG_RE, normalizeRaid } from './state';
import { clampInt, text } from './util';
import { MAPS } from './data/maps';

/* FNV-1a (32 bitů) se dvěma počátky → 16 hex znaků. Jen na rozpoznání opakovaného snímku, ne kryptografie. */
function hash(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/* Podpis snímku FINDINGS z přečtených čísel (panel, obsazenost, místo, počet, tier, vzácnost). Dva snímky téže
   obrazovky (dvojí stisk zkratky) mají stejný podpis; obrazová data ani otisky ikon se nepoužijí. */
export function lootSignature(read: Pick<ScreenRead, 'panels'>): string {
  const parts: string[] = [];
  for (const p of read.panels.filter(x => x.panel !== 'stash').sort((a, b) => a.panel.localeCompare(b.panel))) {
    parts.push(`${p.panel}:${p.slots ?? ''}/${p.slotsMax ?? ''}`);
    for (const c of [...p.cells].sort((a, b) => a.row - b.row || a.col - b.col)) parts.push(`${c.row},${c.col},${c.count ?? ''},${c.tier ?? ''},${c.rarity}`);
  }
  const s = parts.join('|');
  return 'L' + hash(s, 0x811c9dc5) + hash(s, 0x2f6b7a1d);
}

/* Výbava raidu, která se od batohu odečte. */
export interface RaidGear { items: ItemQty[]; source: 'raid' | 'loadout' | 'none' }
export function raidGear(raid: Pick<Raid, 'gear' | 'loadout'> | null, loadouts: Loadout[]): RaidGear {
  if (!raid) return { items: [], source: 'none' };
  if (raid.gear.length) return { items: raid.gear.map(x => ({ ...x })), source: 'raid' };
  const lo = raid.loadout ? loadouts.find(l => l.id === raid.loadout) : undefined;
  /* 0.23.0: obrazovka po raidu ukazuje BACKPACK i QUICK USE, takže výbava loadoutu z obou míst */
  const items = lo ? [...lo.items, ...(lo.quickUse ?? [])] : [];
  if (items.length) return { items: items.map(x => ({ ...x })), source: 'loadout' };
  return { items: [], source: 'none' };
}

/* Řádek revize: nalezený počet, kolik z něj je výbava a kolik zbývá jako loot. Výbava se rozdělí po řádcích
   v pořadí (stejný název bez ohledu na velikost písmen), takže dvě políčka téže věci se neodečtou dvakrát. */
export interface LootRowIn { id: string; name: string; qty: number }
export interface LootRowOut { id: string; name: string; found: number; gear: number; loot: number }
export function lootRows(rows: LootRowIn[], gear: ItemQty[]): LootRowOut[] {
  const left = new Map<string, number>();
  for (const g of gear) { const k = g.name.trim().toLowerCase(); if (k) left.set(k, (left.get(k) || 0) + Math.max(0, g.qty)); }
  return rows.map(r => {
    const name = text(r.name, 80).trim(), found = clampInt(r.qty, 0, ITEM_MAX), k = name.toLowerCase();
    const take = name ? Math.min(left.get(k) || 0, found) : 0;
    if (take) left.set(k, (left.get(k) || 0) - take);
    return { id: r.id, name, found, gear: take, loot: name ? found - take : 0 };
  });
}
/* Položky k zápisu (sečtené podle názvu, jen kladné). */
export const lootItems = (rows: LootRowOut[]): ItemQty[] => normalizeItems(rows.filter(r => r.name && r.loot > 0).map(r => ({ name: r.name, qty: r.loot })));

/* Odečte položky (stejný název) z lootu; co klesne na 0, zmizí. */
export function minusItems(list: ItemQty[], sub: ItemQty[]): ItemQty[] {
  const left = new Map<string, number>();
  for (const x of sub) left.set(x.name, (left.get(x.name) || 0) + x.qty);
  const out: ItemQty[] = [];
  for (const x of list) {
    const take = Math.min(left.get(x.name) || 0, x.qty);
    if (take) left.set(x.name, (left.get(x.name) || 0) - take);
    if (x.qty - take > 0) out.push({ name: x.name, qty: x.qty - take });
  }
  return out;
}

export interface RaidLootInput {
  /* null = nový záznam raidu */
  raidId: string | null;
  /* mapa nového raidu */
  map?: string;
  /* loot po odečtení výbavy (z revize) */
  items: ItemQty[];
  /* raid už má loot ze snímku: hráč souhlasil s nahrazením */
  replace: boolean;
  /* převést loot i do Inventory (jen rozdíl proti už převedenému) */
  toInventory: boolean;
  /* výbava raidu není známá: hráč ručně potvrdil, že řádky jsou nový loot */
  gearChecked: boolean;
}
export type RaidLootRefusal = 'empty' | 'badSig' | 'duplicate' | 'noRaid' | 'replaceNeeded' | 'gearUnchecked';

/* Raid, do kterého už byl tento snímek zapsán. */
export const raidWithSig = (s: Pick<AppState, 'raids'>, sig: string): Raid | undefined => s.raids.find(r => r.lootScan?.sig === sig);

export function checkRaidLoot(s: AppState, input: RaidLootInput, sig: string): RaidLootRefusal | null {
  if (!LOOT_SIG_RE.test(sig)) return 'badSig';
  if (!normalizeItems(input.items).length) return 'empty';
  if (raidWithSig(s, sig)) return 'duplicate';
  const raid = input.raidId === null ? null : s.raids.find(r => r.id === input.raidId);
  if (input.raidId !== null && !raid) return 'noRaid';
  if (raid?.lootScan && !input.replace) return 'replaceNeeded';
  if (raidGear(raid ?? null, s.loadouts).source === 'none' && !input.gearChecked) return 'gearUnchecked';
  return null;
}

export interface RaidLootDone { raidId: string; created: boolean; items: ItemQty[]; replaced: ItemQty[]; inventory: Record<string, number> }

/* Zápis po kontrole (checkRaidLoot musí vrátit null). Mince profilu ani výdělek raidu se nemění. */
export function applyRaidLoot(s: AppState, input: RaidLootInput, sig: string, now: number, newId: string): RaidLootDone {
  const items = normalizeItems(input.items);
  let raid: Raid;
  let created = false;
  if (input.raidId === null) {
    const map = MAPS.some(m => m.id === input.map) ? input.map : s.raids[s.raids.length - 1]?.map;
    raid = normalizeRaid({ id: newId, ts: now, map, type: 'other', ok: true, coins: 0, lootApplied: [] });
    s.raids.push(raid);
    s.profile.rounds = Math.min(LIMITS.rounds[1], s.profile.rounds + 1);
    created = true;
  } else raid = s.raids.find(r => r.id === input.raidId)!;
  const replaced = raid.lootScan?.items ?? [];
  raid.loot = normalizeItems([...minusItems(raid.loot, replaced), ...items]);
  raid.lootScan = { sig, at: now, items };
  let inventory: Record<string, number> = {};
  if (input.toInventory) {
    inventory = lootDelta(raid.loot, raid.lootApplied);
    if (Object.keys(inventory).length) {
      s.inventory = applyDelta(s.inventory, inventory);
      raid.lootApplied = normalizeItems(structuredClone(raid.loot));
    }
  }
  return { raidId: raid.id, created, items, replaced, inventory };
}
