/* 0.20.0: automatické snímání obrazovek mimo raid (žlutá zóna, výchozí vypnuto, čeká na ověření u Embarku).
   Čisté funkce bez DOM. Co tu je:
   - nastavení snímání (zapnuto, vybrané obrazovky, pozastavení, potvrzené vysvětlení). Patří tomuto počítači:
     import zálohy ho nikdy nezapne a nezmění (store/app.ts);
   - hlavní vypínač „Vypnout všechna napojení na hru“: vypne automatické zobrazení buddyho, zkratku snímku
     i automatické snímání najednou a pamatuje si předchozí nastavení, aby šlo vrátit;
   - fronta „Ke kontrole“ (nejisté údaje z automatického zápisu, vyřizují se později najednou);
   - záznam automatických zápisů (tlačítko Zpět a upozornění, až hráč otevře okno Ops).
   Snímání samo běží jen v Rustu (src-tauri/src/ops.rs, hlídací smyčka ops_watch); tady se jen počítá, co mu poslat. */
import type { AppState } from './types';
import { clampInt, isObj, text, uid } from './util';
import { normalizeItems } from './raidItems';

/* Obrazovky, které jde vybrat v Nastavení. 'result' = výsledek raidu (FINDINGS i KNOCKED OUT). */
export const AUTO_SCREENS = ['loadout', 'result', 'stash', 'profile', 'workshop', 'quests', 'skills'] as const;
export type AutoScreenPref = typeof AUTO_SCREENS[number];
/* Obrazovky, které hlásí Rust (header::Screen); pořadí = bit v masce. */
export const RUST_SCREENS = ['loadout', 'findings', 'knockedOut', 'stash', 'profile', 'workshop', 'quests', 'skills'] as const;
export type RustScreen = typeof RUST_SCREENS[number];
export const isRustScreen = (v: unknown): v is RustScreen => typeof v === 'string' && (RUST_SCREENS as readonly string[]).includes(v);
export const prefOf = (s: RustScreen): AutoScreenPref => (s === 'findings' || s === 'knockedOut' ? 'result' : s);
/* Pro budoucí obrazovky (výběr mapy, nasazení…) stačí přidat id sem, do Rustu (GEOS a DEFS) a do slovníku. */

/* Maska bitů pro Rust z vybraných obrazovek. */
export function screenBits(screens: Record<AutoScreenPref, boolean>): number {
  let bits = 0;
  RUST_SCREENS.forEach((s, i) => { if (screens[prefOf(s)]) bits |= 1 << i; });
  return bits;
}

export interface AutoCaptureState {
  /* opt-in, výchozí vypnuto */
  enabled: boolean;
  screens: Record<AutoScreenPref, boolean>;
  /* pozastaveno z Nastavení, kompaktu nebo nabídky v oznamovací oblasti (bez další globální zkratky) */
  paused: boolean;
  /* kdy hráč potvrdil vysvětlení (0 = nikdy) */
  ackAt: number;
}
/* Výchozí výběr: jen to, co potřebuje Deník raidů (loadout a výsledek). Ostatní obrazovky si hráč zapne sám. */
export const emptyAutoCapture = (): AutoCaptureState => ({
  enabled: false, paused: false, ackAt: 0,
  screens: { loadout: true, result: true, stash: false, profile: false, workshop: false, quests: false, skills: false },
});
export function normalizeAutoCapture(raw: unknown): AutoCaptureState {
  const r = isObj(raw) ? raw : {};
  const d = emptyAutoCapture();
  d.enabled = r.enabled === true;
  d.paused = r.paused === true;
  d.ackAt = clampInt(r.ackAt || 0, 0, 9e15);
  const sc = isObj(r.screens) ? r.screens : {};
  for (const k of AUTO_SCREENS) if (typeof sc[k] === 'boolean') d.screens[k] = sc[k] as boolean;
  return d;
}

/* Hlavní vypínač napojení na hru: saved = nastavení před vypnutím (null = nic k obnovení). */
export interface GameLinkSaved { autoOpen: boolean; hotkey: string; auto: boolean }
export interface GameLinkState { off: boolean; saved: GameLinkSaved | null }
export const emptyGameLink = (): GameLinkState => ({ off: false, saved: null });
export function normalizeGameLink(raw: unknown): GameLinkState {
  const r = isObj(raw) ? raw : {};
  const s = isObj(r.saved) ? r.saved : null;
  return {
    off: r.off === true,
    saved: s ? { autoOpen: s.autoOpen === true, hotkey: text(s.hotkey, 60), auto: s.auto === true } : null,
  };
}

/* Běží automatické snímání? Jen se zapnutým Ops, zapnutým snímáním, bez pozastavení a hlavního vypínače
   a s aspoň jednou vybranou obrazovkou. */
export const autoActive = (s: Pick<AppState, 'buddy' | 'autoCapture' | 'gameLink'>): boolean =>
  s.buddy.enabled && s.autoCapture.enabled && !s.autoCapture.paused && !s.gameLink.off && screenBits(s.autoCapture.screens) !== 0;
/* Stav pro ukazatel a nabídku: 'on' běží, 'paused' pozastaveno, null = vypnuto (nic se neukazuje). */
export type AutoIndicator = 'on' | 'paused' | null;
export const autoIndicator = (s: Pick<AppState, 'buddy' | 'autoCapture' | 'gameLink'>): AutoIndicator =>
  !s.buddy.enabled || !s.autoCapture.enabled || s.gameLink.off || screenBits(s.autoCapture.screens) === 0 ? null : s.autoCapture.paused ? 'paused' : 'on';

/* ----- fronta „Ke kontrole“ ----- */
export type ReviewKind = 'map' | 'outcome' | 'loadout' | 'loot' | 'screen';
export const REVIEW_KINDS: readonly ReviewKind[] = ['map', 'outcome', 'loadout', 'loot', 'screen'];
/* Nejistý řádek lootu: odhad názvu (prázdný = neznámý), počet (null = nepřečtený) a jistota shody 0–1.
   0.25.0: sure = jistě poznaná výbava ze snímku ze zkratky (v kontrole předem zaškrtnutá, hráč ji jen potvrdí). */
export interface ReviewRow { guess: string; qty: number | null; score: number; sure?: true }
export interface ReviewItem {
  id: string; at: number; kind: ReviewKind;
  /* záznam raidu, ke kterému údaj patří (u 'screen' null) */
  raidId: string | null;
  /* 'screen': obrazovka, jejíž snímek čeká na revizi v Ops */
  screen?: RustScreen;
  /* 'loot': nejisté řádky; 'loadout': neznámá místa výbavy */
  rows?: ReviewRow[];
  slots?: string[];
}
export const REVIEW_MAX = 100;
export const LOADOUT_SLOTS = ['augment', 'shield', 'weapon1', 'weapon2', 'backpack', 'quickUse'] as const;
export type LoadoutSlot = typeof LOADOUT_SLOTS[number];

export function normalizeReview(raw: unknown): ReviewItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ReviewItem[] = [];
  for (const x of raw) {
    if (!isObj(x) || !REVIEW_KINDS.includes(x.kind as ReviewKind)) continue;
    let id = text(x.id || uid(), 24);
    if (seen.has(id)) id = uid() + seen.size;
    seen.add(id);
    const item: ReviewItem = { id, at: clampInt(x.at || 0, 0, 9e15), kind: x.kind as ReviewKind, raidId: typeof x.raidId === 'string' ? text(x.raidId, 24) : null };
    if (isRustScreen(x.screen)) item.screen = x.screen;
    if (Array.isArray(x.rows)) {
      item.rows = x.rows.filter(isObj).slice(0, 40).map(r => ({
        guess: text(r.guess, 80), qty: r.qty === null || r.qty === undefined ? null : clampInt(r.qty, 1, 99999), score: Math.round(Math.min(1, Math.max(0, Number(r.score) || 0)) * 1000) / 1000,
        ...(r.sure === true && x.kind === 'loadout' && text(r.guess, 80).trim() ? { sure: true as const } : {}),
      }));
    }
    if (Array.isArray(x.slots)) item.slots = [...new Set(x.slots.filter((v): v is LoadoutSlot => (LOADOUT_SLOTS as readonly unknown[]).includes(v)))];
    if (item.kind === 'screen' && !item.screen) continue;
    if (item.kind !== 'screen' && !item.raidId) continue;
    out.push(item);
  }
  return out.slice(-REVIEW_MAX);
}

/* Úprava hráče při vyřizování fronty (jedna položka). */
export type ReviewEdit =
  | { id: string; kind: 'map'; map: string }
  | { id: string; kind: 'outcome'; survived: boolean }
  | { id: string; kind: 'loot'; rows: { name: string; qty: number }[] }
  /* 0.24.0: výbava potvrzená v kontrole (nepoznaná zbraň nebo augment) */
  | { id: string; kind: 'gear'; rows: { name: string; qty: number }[] }
  | { id: string; kind: 'dismiss' };
export function normalizeReviewEdit(raw: unknown): ReviewEdit | null {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const id = text(raw.id, 24);
  switch (raw.kind) {
    case 'map': return typeof raw.map === 'string' ? { id, kind: 'map', map: text(raw.map, 40) } : null;
    case 'outcome': return typeof raw.survived === 'boolean' ? { id, kind: 'outcome', survived: raw.survived } : null;
    case 'loot': return Array.isArray(raw.rows) ? { id, kind: 'loot', rows: normalizeItems(raw.rows, 40) } : null;
    case 'gear': return Array.isArray(raw.rows) ? { id, kind: 'gear', rows: normalizeItems(raw.rows, 8) } : null;
    case 'dismiss': return { id, kind: 'dismiss' };
    default: return null;
  }
}

/* ----- automatické zápisy (Zpět a upozornění) ----- */
export interface AutoWrite {
  id: string; at: number; raidId: string;
  /* výsledek raidu (null = nejistý) a počet zapsaných jistých položek lootu */
  survived: boolean | null; items: number;
  /* kolik údajů šlo do fronty „Ke kontrole“ */
  review: number;
  undone: boolean;
  /* hráč upozornění viděl a zavřel (otevřel okno Ops) */
  seen: boolean;
}
export const AUTO_LOG_MAX = 20;
export function normalizeAutoLog(raw: unknown): AutoWrite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).slice(-AUTO_LOG_MAX).flatMap(x => (typeof x.raidId !== 'string' ? [] : [{
    id: text(x.id || uid(), 24), at: clampInt(x.at || 0, 0, 9e15), raidId: text(x.raidId, 24),
    survived: typeof x.survived === 'boolean' ? x.survived : null, items: clampInt(x.items || 0, 0, 9999), review: clampInt(x.review || 0, 0, 999),
    undone: x.undone === true, seen: x.seen === true,
  }]));
}
/* Upozornění, která hráč ještě neviděl (nejnovější první). */
export const unseenWrites = (log: AutoWrite[]): AutoWrite[] => log.filter(w => !w.seen).slice().reverse();
