/* Vlastní typovaný slovník bez knihovny. Čistý TypeScript bez Reactu: používá ho jádro, store i UI.
   cs.ts je zdroj pravdy (odvozuje se z něj typ klíčů), en.ts musí mít všechny klíče, jinak je to chyba tsc.
   Jazyk drží modul; store ho při startu a při změně nastavení přepne (setLang), UI se překreslí přes useT(). */
import { cs } from './cs';
import { en } from './en';

export type Lang = 'cs' | 'en';
export const LANGS: readonly Lang[] = ['cs', 'en'];
export const LANG_NAMES: Record<Lang, string> = { cs: 'Čeština', en: 'English' };

/* Text nebo plurál. Tvar se vybírá podle parametru count přes Intl.PluralRules (cs: one / few / other, en: one / other). */
export interface PluralMsg { one: string; few?: string; other: string }
export type Msg = string | PluralMsg;
export type Key = keyof typeof cs;
export type Dict = Record<Key, Msg>;
/* Parametr může být i odkaz na další text nebo jejich seznam (spojí se čárkou), takže se přeloží celý. */
export type ParamValue = string | number | MsgRef | MsgRef[];
export type Params = Record<string, ParamValue>;
/* Text s parametry pro pozdější překlad (např. doporučení z jádra). */
export interface MsgRef { key: Key; params?: Params }
export const msg = (key: Key, params?: Params): MsgRef => (params ? { key, params } : { key });

const DICTS: Record<Lang, Dict> = { cs, en };
export const dict = (lang: Lang): Dict => DICTS[lang];

/* Značky jazyka pro Intl. Angličtina používá britský zápis kvůli jednoznačnému datu (10 Nov 2026) a 24h času. */
export const LOCALE: Record<Lang, string> = { cs: 'cs-CZ', en: 'en-GB' };

const NBSP = ' ';
const numFmt: Partial<Record<string, Intl.NumberFormat>> = {};
const rules: Partial<Record<Lang, Intl.PluralRules>> = {};

/* Celé číslo podle jazyka: cs „184 500“, en „184,500“; záporné se znaménkem „−“. */
export function formatInt(lang: Lang, n: number): string {
  const v = Math.round(Number(n) || 0);
  const f = (numFmt[lang] ||= new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions));
  return (v < 0 ? '−' : '') + f.format(Math.abs(v)).replace(/[  ]/g, NBSP);
}
/* Číslo s desetinnými místy (bez koncových nul): cs „1,5“, en „1.5“. */
export function formatDec(lang: Lang, n: number, d = 1): string {
  const v = Number(n) || 0;
  const k = lang + ':' + d;
  const f = (numFmt[k] ||= new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: d, minimumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions));
  const s = f.format(Math.abs(Number(Math.abs(v).toFixed(d)))).replace(/[  ]/g, NBSP);
  return (v < 0 && s !== '0' ? '−' : '') + s;
}
/* Procenta z poměru 0–1: cs „75 %“, en „75%“. */
export const formatPct = (lang: Lang, x: number): string => Math.round((Number(x) || 0) * 100) + (lang === 'cs' ? NBSP + '%' : '%');

export function plural(lang: Lang, n: number, forms: PluralMsg): string {
  const cat = (rules[lang] ||= new Intl.PluralRules(LOCALE[lang])).select(n);
  if (cat === 'one') return forms.one;
  if (cat === 'few' && forms.few !== undefined) return forms.few;
  return forms.other;
}

/* Dosazení parametrů: {name}; čísla se formátují podle jazyka, {x:pct} jako procenta z poměru, {x:raw} bez úprav. */
export function interpolate(lang: Lang, s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)(?::(pct|raw))?\}/g, (m, name: string, mode?: string) => {
    const v = params[name];
    if (v === undefined) return m;
    if (Array.isArray(v)) return v.map(x => tl(lang, x.key, x.params)).join(', ');
    if (typeof v === 'object') return tl(lang, v.key, v.params);
    if (typeof v !== 'number') return v;
    if (mode === 'pct') return formatPct(lang, v);
    if (mode === 'raw') return String(v);
    return Number.isInteger(v) ? formatInt(lang, v) : formatDec(lang, v);
  });
}

export function tl(lang: Lang, key: Key, params?: Params): string {
  const m = DICTS[lang][key] ?? DICTS.cs[key];
  if (m === undefined) return String(key);
  const s = typeof m === 'string' ? m : plural(lang, Number(params?.count ?? 0), m);
  return interpolate(lang, s, params);
}

/* ----- aktuální jazyk ----- */
let current: Lang = 'cs';
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;
export const isLang = (v: unknown): v is Lang => v === 'cs' || v === 'en';

export function setLang(lang: Lang): void {
  if (!isLang(lang)) return;
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
  if (lang === current) return;
  current = lang;
  listeners.forEach(f => f());
}
export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/* Text v aktuálním jazyce. */
export const t = (key: Key, params?: Params): string => tl(current, key, params);
export const tm = (m: MsgRef): string => tl(current, m.key, m.params);

/* Jazyk při prvním spuštění bez uložené volby: čeština pro cs a sk, jinak angličtina. */
export function detectLang(nav?: string | null): Lang {
  return /^(cs|sk)(?:[-_]|$)/i.test(String(nav || '')) ? 'cs' : 'en';
}
export const navigatorLang = (): Lang => detectLang(typeof navigator !== 'undefined' ? navigator.language : undefined);
