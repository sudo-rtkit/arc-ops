/* Buddy Ops / Bedňák 2.0 (0.10.0): podoba podle levelu hráče, sbírka odemčených dílů, šatník a události levelu.
   Čisté funkce nad manifestem z docs/design/buddy/bednak2 (zúžené kopie src/core/data/ops2*.json generuje
   scripts/gen-ops-assets.mjs). Dvě varianty se stejnou logikou: CORNER 96 px (okno buddyho) a DETAIL 128 px
   (overlay, kompaktní okno, průvodce; 256 px vzniká přesným 2× zvětšením). Vývoj řídí jen level v profilu
   Companionu, nic se nečte ze hry. */
import M from './data/ops2.json';
import CORNER from './data/ops2-corner.json';
import DETAIL from './data/ops2-detail.json';
import type { BuddyState, Lang } from './types';
import { clampInt, isObj, safeEntries, text } from './util';

export const OPS_ANIMS = [
  'idle', 'talk', 'greet', 'point-left', 'point-right', 'point-up', 'point-down', 'scanning', 'thinking', 'success', 'level-up',
  'error', 'sleep', 'wake-up', 'appear', 'dismiss', 'inspect', 'carry', 'drag', 'walk', 'annoyed', 'laugh', 'shrug',
  /* 0.20.1: malé tiché emoce automatického snímku (jen LED v hledí, viz src/core/opsEmote.ts) */
  'scan', 'scan-ok', 'scan-unsure',
] as const;
export type OpsAnim = typeof OPS_ANIMS[number];
export const isOpsAnim = (v: unknown): v is OpsAnim => typeof v === 'string' && (OPS_ANIMS as readonly string[]).includes(v);

export interface AnimSpec { frameCount: number; durationsMs: number[]; loop: boolean; returnTo: string | null }
export interface FormSpec { id: string; name: { cs: string; en: string }; levels: [number, number] }
export interface PartSpec {
  id: string; slot: string; variant: number; name: { cs: string; en: string };
  /* štítek: atlas 76 dlaždic, index = level */
  frameCount?: number;
}
export interface UnlockRow { level: number; form: string; unlockedParts: string[]; defaultOutfit: Record<string, string | null>; transformation?: string }
export interface TransformSpec { id: string; from: string; to: string; frameCount: number; durationsMs: number[] }
export interface OpsManifest {
  version: number; slots: string[]; drawOrder: string[];
  states: Record<OpsAnim, AnimSpec>;
  forms: FormSpec[]; parts: PartSpec[]; unlocks: UnlockRow[]; transforms: TransformSpec[];
  fx: { sparkle: { frameCount: number; durationsMs: number[] } };
  aliases: Record<string, string>;
}

/* Geometrie varianty: cesty k PNG (relativně k src/assets/ops2/), posuny dílů a kotvy slotů po snímcích.
   frames[i] >= 0: index sady kotev; < 0: snímek je neviditelný (tělo ani šatník se nekreslí), kotvy -1 - i. */
export type OpsVariantId = 'corner' | 'detail';
export interface OpsGeometry {
  variant: OpsVariantId; frameSize: { width: number; height: number };
  anchors: [number, number][][];
  forms: Record<string, Record<string, { file: string; frames: number[] }>>;
  parts: Record<string, { file: string; offset: [number, number]; frameSize?: { width: number; height: number } }>;
  transforms: Record<string, string>;
  sparkle: string;
}

export const OPS = M as unknown as OpsManifest;
export const OPS_GEOMETRY: Record<OpsVariantId, OpsGeometry> = { corner: CORNER as unknown as OpsGeometry, detail: DETAIL as unknown as OpsGeometry };
export const OPS_SLOTS: string[] = OPS.slots;
export const OPS_LEVEL_MAX = OPS.unlocks.length - 1;
const PARTS = new Map(OPS.parts.map(p => [p.id, p]));

/* Celková délka jednorázové animace v ms (např. odchod před zavřením okna). */
export const animMs = (anim: OpsAnim): number => OPS.states[anim].durationsMs.reduce((a, b) => a + b, 0);

/* Kdy Ops usne bez aktivity: rychleji, když víme, že hra neběží (null = nevíme). */
export const sleepAfterMs = (game: boolean | null): number => (game === false ? 60_000 : 10 * 60_000);

export const clampLevel = (level: number): number => clampInt(level, 0, OPS_LEVEL_MAX);
export const partById = (id: string): PartSpec | undefined => PARTS.get(id);
export const partName = (id: string, lang: Lang): string => PARTS.get(id)?.name[lang] ?? id;
export const formForLevel = (level: number): FormSpec => {
  const l = clampLevel(level);
  return OPS.forms.find(f => l >= f.levels[0] && l <= f.levels[1]) ?? OPS.forms[0];
};

/* Všechny díly odemčené do daného levelu včetně (level 0 je holé tělo). */
export function unlockedUpTo(level: number): string[] {
  const l = clampLevel(level);
  return OPS.unlocks.filter(u => u.level <= l).flatMap(u => u.unlockedParts);
}

/* Sbírka je sjednocení: pokles levelu (import profilu, reset) nic neodebere. Vrací true, když přibyl díl. */
export function syncBuddy(b: BuddyState, level: number): boolean {
  const have = new Set(b.unlocked);
  const add = unlockedUpTo(level).filter(id => !have.has(id));
  if (!add.length) return false;
  b.unlocked = [...b.unlocked, ...add];
  return true;
}

/* Sbírka, se kterou se počítá: uložená (store ji doplňuje při každé změně) a vše do aktuálního levelu. */
export const collection = (b: Pick<BuddyState, 'unlocked'>, level: number): string[] => [...new Set([...b.unlocked, ...unlockedUpTo(level)])];

/* Výsledný outfit: ruční volba slotu (díl ze sbírky, nebo null = bez dílu), jinak automaticky podle levelu. */
export function resolveOutfit(level: number, b: Pick<BuddyState, 'unlocked' | 'outfit'>): Record<string, string | null> {
  const auto = OPS.unlocks[clampLevel(level)].defaultOutfit;
  const have = new Set(collection(b, level));
  const out: Record<string, string | null> = {};
  for (const slot of OPS_SLOTS) {
    const manual = b.outfit[slot];
    if (manual === null) out[slot] = null;
    else if (manual !== undefined && have.has(manual) && PARTS.get(manual)?.slot === slot) out[slot] = manual;
    else out[slot] = auto[slot] ?? null;
  }
  return out;
}

/* Díly sbírky v jednom slotu (pro šatník), seřazené podle varianty. */
export const slotParts = (slot: string, unlocked: string[]): PartSpec[] =>
  OPS.parts.filter(p => p.slot === slot && unlocked.includes(p.id)).sort((a, b) => a.variant - b.variant);

/* Událost po změně levelu: přechod do další podoby = proměna, jinak jiskra a hláška s novým dílem.
   Při přeskočení několika podob se přehraje poslední proměna (do cílové podoby). Pokles levelu nic nehraje. */
export type LevelEvent =
  | { kind: 'transform'; level: number; from: string; to: string; transform: string | null; parts: string[] }
  | { kind: 'unlock'; level: number; parts: string[] };
export function levelEvent(prev: number, next: number): LevelEvent | null {
  const a = clampLevel(prev), b = clampLevel(next);
  if (b <= a) return null;
  const parts = OPS.unlocks.filter(u => u.level > a && u.level <= b).flatMap(u => u.unlockedParts);
  const fa = formForLevel(a), fb = formForLevel(b);
  if (fa.id !== fb.id) {
    const tr = OPS.transforms.find(t => t.to === fb.id) ?? null;
    return { kind: 'transform', level: b, from: fa.id, to: fb.id, transform: tr?.id ?? null, parts };
  }
  return { kind: 'unlock', level: b, parts };
}

/* ----- stav (schéma 6; od 0.10.0 se ID dílů nezměnila, neznámé ruční volby se při načtení vrátí na automatiku) ----- */

export const OPACITY_MIN = 70;
export const OPACITY_MAX = 100;
export const emptyBuddy = (): BuddyState => ({
  enabled: false, hotkey: '', scale: 1, opacity: 90, autoOpen: false, outfit: {}, unlocked: [], positions: {}, monitor: '',
});

/* Zkratka ve tvaru Ctrl+Alt+Shift+<KeyboardEvent.code>; bez modifikátoru jen F1–F24 (jako v Rustu). */
export const HOTKEY_RE = /^(?:(?:Ctrl|Alt|Shift|Super)\+){0,4}(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Numpad[0-9]|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Insert|Home|End|PageUp|PageDown|Pause|ScrollLock)$/;
export const validHotkey = (h: string): boolean => HOTKEY_RE.test(h) && (h.includes('+') || /^F\d+$/.test(h));

export function normalizeBuddy(raw: unknown): BuddyState {
  const r = isObj(raw) ? raw : {};
  const b = emptyBuddy();
  b.enabled = r.enabled === true;
  b.hotkey = typeof r.hotkey === 'string' && validHotkey(r.hotkey) ? r.hotkey : '';
  b.scale = r.scale === 2 ? 2 : 1;
  b.opacity = clampInt(r.opacity ?? 90, OPACITY_MIN, OPACITY_MAX);
  b.autoOpen = r.autoOpen === true;
  b.unlocked = [...new Set((Array.isArray(r.unlocked) ? r.unlocked : []).filter((x): x is string => typeof x === 'string' && PARTS.has(x)))];
  const o = isObj(r.outfit) ? r.outfit : {};
  for (const slot of OPS_SLOTS) {
    const v = o[slot];
    if (v === null) b.outfit[slot] = null;
    else if (typeof v === 'string' && PARTS.get(v)?.slot === slot) b.outfit[slot] = v;
  }
  const pos = isObj(r.positions) ? r.positions : {};
  for (const [k, v] of safeEntries(pos).slice(0, 16)) {
    if (!isObj(v)) continue;
    const n = (x: unknown) => (Number.isFinite(Number(x)) ? clampInt(x, -20000, 20000) : 0);
    b.positions[text(k, 120)] = { x: n(v.x), y: n(v.y) };
  }
  b.monitor = text(r.monitor, 120);
  return b;
}
