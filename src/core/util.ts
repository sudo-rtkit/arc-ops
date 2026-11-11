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

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

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
