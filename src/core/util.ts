/* Malé čisté pomůcky. clampInt a isoWeek jsou věrné převody z původního deníku. */

export function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function clampNum(v: unknown, lo: number, hi: number): number {
  const n = Number(v) || 0;
  return Math.max(lo, Math.min(hi, n));
}

export const text = (v: unknown, max: number): string => String(v ?? '').slice(0, max);

/* 0.16.0: id lze během jedné akce zaznamenat (overlay) a stejné id přehrát (hlavní okno), aby nový záznam měl
   v obou oknech stejné id. Mimo recordIds / replayIds se chová jako dřív. */
let idTap: { log: string[] | null; take: string[] } | null = null;
const freshId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const uid = (): string => {
  if (idTap?.take.length) return idTap.take.shift()!;
  const id = freshId();
  idTap?.log?.push(id);
  return id;
};
/* Tvar id z uid() (base36). Přehrát jde jen id v tomto tvaru. */
export const UID_RE = /^[0-9a-z]{6,20}$/;
/* Spustí fn a vrátí výsledek a všechna id, která během ní vznikla (v pořadí). Vnořené volání se nezaznamená zvlášť. */
export function recordIds<T>(fn: () => T): { value: T; ids: string[] } {
  if (idTap) return { value: fn(), ids: [] };
  const log: string[] = [];
  idTap = { log, take: [] };
  try { return { value: fn(), ids: log }; } finally { idTap = null; }
}
/* Spustí fn tak, že uid() vrací nejdřív zadaná id (jen platná, nejvýš 32); pak zase nová. */
export function replayIds<T>(ids: readonly unknown[], fn: () => T): T {
  if (idTap) return fn();
  idTap = { log: null, take: ids.filter((x): x is string => typeof x === 'string' && UID_RE.test(x)).slice(0, 32) };
  try { return fn(); } finally { idTap = null; }
}

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/* 0.16.1: klíče, které v prostém objektu mění prototyp nebo se tváří jako vestavěné vlastnosti. JSON.parse je
   nechává jako vlastní klíče a přiřazení out['__proto__'] = {...} by objektu vyměnilo prototyp. */
export const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
export const safeKey = (k: string): boolean => !UNSAFE_KEYS.has(k);
/* Object.entries bez nebezpečných klíčů; cokoli jiného než objekt (i null) dá prázdný seznam. */
export function safeEntries<T>(v: Record<string, T> | null | undefined): [string, T][];
export function safeEntries(v: unknown): [string, unknown][];
export function safeEntries(v: unknown): [string, unknown][] {
  return v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).filter(([k]) => safeKey(k)) : [];
}
/* 0.16.1: největší stav, snímek nebo záloha v bajtech UTF-8; stejný limit hlídá Rust (storage.rs MAX_FILE). */
export const MAX_STATE_BYTES = 20 * 1024 * 1024;
/* Délka textu v bajtech UTF-8 (bez kopie textu). */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { n += 4; i++; } else n += 3; }
    else n += 3;
  }
  return n;
}
/* Vejde se text do limitu stavu? */
export const fitsState = (s: string): boolean => s.length * 3 <= MAX_STATE_BYTES || (s.length <= MAX_STATE_BYTES && utf8Bytes(s) <= MAX_STATE_BYTES);

/* JSON.parse, který nebezpečné klíče rovnou zahodí (stav, záloha, snímek). */
export const safeJsonParse = (text: string): unknown => JSON.parse(text, (k, v) => (UNSAFE_KEYS.has(k) ? undefined : v));

/* Číslo týdne podle ISO 8601, např. 2026-W46. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}

/* decodeURIComponent, který nespadne na poškozené sekvenci (#maps/%E0): vrátí text tak, jak je. */
export function safeDecode(v: string): string {
  try { return decodeURIComponent(v); } catch { return v; }
}

/* Místní datum jako RRRR-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
