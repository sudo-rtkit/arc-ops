/* Oblečení Opse / Bedňáka (0.34.0): 16 sad po 4 dílech (pokrývka hlavy, trup, krk, záda) z docs/design/buddy/clothing.
   Malá společná data (src/core/data/clothing.json, generuje scripts/gen-clothing-assets.mjs, asi 1 kB) se načítají
   hned: ID pro ověřování ve store a pravidla odemykání. Názvy cs/en jsou zvlášť (src/core/clothingNames.ts, jen
   hlavní okno). Geometrie a obrázky jsou samostatně a líně (src/ops/clothingData.ts), takže okno, ve kterém Ops nic
   nenosí, je vůbec nenačte.
   Odemykání postupně podle unlockSuggestions: 6 sad za level profilu, 5 za dohraná kola miniher, 5 za úspěšné
   extrakce v deníku raidů. Odemčená sada zůstane odemčená (jako sbírka dílů), i když level později klesne nebo se
   deník zkrátí. Čisté funkce bez DOM. */
import META from './data/clothing.json';
import type { AppState, BuddyState } from './types';
import { isObj } from './util';

export type ClothingSlot = 'headwear' | 'torso' | 'neck' | 'back';
export type ClothingRule =
  | { kind: 'level'; level: number }
  | { kind: 'rounds'; count: number }
  | { kind: 'extractions'; count: number };
export interface ClothingSet { id: string; unlock: ClothingRule }
export interface ClothingMeta {
  version: number; slots: ClothingSlot[]; drawOrder: string[];
  hides: Record<ClothingSlot, string[]>; hiddenClips: string[];
  /* jména barev palety v pořadí indexů RLE obnovy (hodnoty v OPS_PALETTE) */
  palette: string[];
  sets: ClothingSet[];
}

export const CLOTHING = META as unknown as ClothingMeta;
export const CLOTHING_SLOTS: readonly ClothingSlot[] = CLOTHING.slots;
export const CLOTHING_SETS: readonly ClothingSet[] = CLOTHING.sets;
export const CLOTHING_SET_IDS: readonly string[] = CLOTHING.sets.map(s => s.id);
const SETS = new Map(CLOTHING.sets.map(s => [s.id, s]));
/* Oblečení = slot oblečení → ID dílu. */
export type Worn = Partial<Record<ClothingSlot, string>>;

export const isClothingSlot = (v: unknown): v is ClothingSlot => typeof v === 'string' && (CLOTHING_SLOTS as readonly string[]).includes(v);
export const isClothingSet = (v: unknown): v is string => typeof v === 'string' && SETS.has(v);
export const clothingSet = (id: string): ClothingSet | undefined => SETS.get(id);
export const pieceId = (set: string, slot: ClothingSlot): string => set + '-' + slot;
/* ID dílu „<sada>-<slot>“ jen ze zabaleného manifestu; cokoli jiného = null. */
export function parsePiece(id: unknown): { set: string; slot: ClothingSlot } | null {
  if (typeof id !== 'string' || id.length > 40) return null;
  const i = id.lastIndexOf('-');
  if (i <= 0) return null;
  const set = id.slice(0, i), slot = id.slice(i + 1);
  return SETS.has(set) && isClothingSlot(slot) ? { set, slot } : null;
}
export const isPiece = (id: unknown, slot?: ClothingSlot): id is string => { const p = parsePiece(id); return !!p && (!slot || p.slot === slot); };

/* ----- odemykání ----- */
export interface ClothingProgress { level: number; rounds: number; extractions: number }
const nonNeg = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
/* Postup hráče: level profilu, dohraná kola všech miniher, úspěšné extrakce (záznamy deníku s ok). */
export function clothingProgress(s: Pick<AppState, 'profile' | 'games' | 'raids'>): ClothingProgress {
  const g = s.games;
  return {
    level: nonNeg(s.profile?.level),
    rounds: nonNeg(g?.tetris?.played) + nonNeg(g?.quiz?.played) + nonNeg(g?.hack?.played),
    extractions: Array.isArray(s.raids) ? s.raids.filter(r => r?.ok === true).length : 0,
  };
}
export function ruleMet(rule: ClothingRule, p: ClothingProgress): boolean {
  switch (rule.kind) {
    case 'level': return p.level >= rule.level;
    case 'rounds': return p.rounds >= rule.count;
    case 'extractions': return p.extractions >= rule.count;
  }
}
/* Sady, které postup nově odemyká (v pořadí manifestu, bez už odemčených). */
export const newlyUnlockedSets = (have: readonly string[], p: ClothingProgress): string[] =>
  CLOTHING_SETS.filter(s => !have.includes(s.id) && ruleMet(s.unlock, p)).map(s => s.id);
/* Doplní odemčené sady do stavu (jen přidává). Vrací nově odemčené. */
export function syncClothing(s: AppState): string[] {
  const have = s.buddy.clothingSets ?? [];
  const add = newlyUnlockedSets(have, clothingProgress(s));
  if (add.length) s.buddy.clothingSets = CLOTHING_SET_IDS.filter(id => have.includes(id) || add.includes(id));
  return add;
}
export const unlockedSets = (b: Pick<BuddyState, 'clothingSets'>): string[] => CLOTHING_SET_IDS.filter(id => b.clothingSets?.includes(id));

/* ----- normalizace (načtení, import): jen známá ID, nejvýš jedna sada/díl za ID, omezené délky ----- */
const MAX_LIST = 64;
export function normalizeClothingSets(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_LIST) : [];
  return CLOTHING_SET_IDS.filter(id => list.includes(id));
}
export function normalizeWorn(raw: unknown): Worn {
  const out: Worn = {};
  if (!isObj(raw)) return out;
  for (const slot of CLOTHING_SLOTS) {
    const v = raw[slot];
    if (isPiece(v, slot)) out[slot] = v;
  }
  return out;
}
/* Co Ops opravdu nosí: zvolené díly jen z odemčených sad. */
export function wornClothing(b: Pick<BuddyState, 'clothing' | 'clothingSets'> | null | undefined): Worn {
  const out: Worn = {};
  if (!b?.clothing) return out;
  for (const slot of CLOTHING_SLOTS) {
    const id = b.clothing[slot];
    const p = parsePiece(id);
    if (p && p.slot === slot && b.clothingSets?.includes(p.set)) out[slot] = id;
  }
  return out;
}
/* Stálý klíč oblečení (pro závislosti efektů a mezipaměti). */
export const wornKey = (w: Worn | null | undefined): string => (w ? CLOTHING_SLOTS.map(s => w[s] ?? '').join('|') : '|||');
export const wearsAny = (w: Worn | null | undefined): boolean => !!w && CLOTHING_SLOTS.some(s => !!w[s]);
