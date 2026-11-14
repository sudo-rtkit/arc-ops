/* Jádro slovníku bez textů (0.19.0): typy, formáty, plurály a aktuální jazyk. Slovníky (cs.ts, en.ts) přidává
   index.ts (registerDicts), který používá hlavní okno, overlay, jádro i store. Okno buddyho slovníky nepotřebuje
   (mluví hláškami z opsLines.ts), a proto importuje jen tohle jádro: jeho balík je tím o oba slovníky menší.
   Bez registrovaného slovníku tl vrátí klíč.
   0.25.0: slovníky se načítají po jazycích (index.ts registruje zavaděč, každý jazyk je samostatný balík). Okno
   načte jen slovník aktivního jazyka. Přepnutí je bezpečné: setLang jazyk přepne až po načtení jeho slovníku,
   do té doby se celé okno dál kreslí v předchozím jazyce (nikdy ne klíče ani směs jazyků). Okna před prvním
   vykreslením počkají na langReady(). Bez zavaděče (okno buddyho, testy se slovníky registrovanými předem)
   se přepíná hned jako dřív. */
import type { cs } from './cs';

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

const DICTS: Partial<Record<Lang, Dict>> = {};
export function registerDicts(d: Partial<Record<Lang, Dict>>): void { Object.assign(DICTS, d); }
/* 0.25.0: zavaděč slovníku jazyka (dynamický import) a rozběhnutá načtení */
let loader: ((lang: Lang) => Promise<Dict>) | null = null;
const loading: Partial<Record<Lang, Promise<void>>> = {};
export function registerLoader(f: (lang: Lang) => Promise<Dict>): void { loader = f; }
export const hasDict = (lang: Lang): boolean => !!DICTS[lang];
/* Načte slovník jazyka (jednou); nezdar se nehlásí, další volání to zkusí znovu. */
export function ensureLang(lang: Lang): Promise<void> {
  if (DICTS[lang] || !loader || !isLang(lang)) return Promise.resolve();
  return (loading[lang] ||= loader(lang).then(d => { DICTS[lang] = d; }, () => { delete loading[lang]; }));
}

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
  const m = DICTS[lang]?.[key] ?? DICTS.cs?.[key];
  if (m === undefined) return String(key);
  const s = typeof m === 'string' ? m : plural(lang, Number(params?.count ?? 0), m);
  return interpolate(lang, s, params);
}
/* 0.25.0: text v jiném než aktivním jazyce (vyhledávání v obou jazycích); null, když jeho slovník není načtený. */
export const tlOpt = (lang: Lang, key: Key, params?: Params): string | null => (DICTS[lang] ? tl(lang, key, params) : null);

/* ----- aktuální jazyk ----- */
let current: Lang = 'cs';
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;
export const isLang = (v: unknown): v is Lang => v === 'cs' || v === 'en';

/* jazyk, o který se naposledy žádalo (přepne se na něj, až bude jeho slovník načtený) */
let wanted: Lang = 'cs';
function apply(lang: Lang): void {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
  if (lang === current) return;
  current = lang;
  listeners.forEach(f => f());
}
export function setLang(lang: Lang): void {
  if (!isLang(lang)) return;
  wanted = lang;
  if (DICTS[lang] || !loader) { apply(lang); return; }
  void ensureLang(lang).then(() => { if (wanted === lang && DICTS[lang]) apply(lang); });
}
/* 0.25.0: brána pro stav z jiného okna (overlay, widgety): fn s novým stavem proběhne až po načtení slovníku jeho
   jazyka, takže se stav s jiným jazykem nikdy nevykreslí se slovníkem, který ještě chybí. Platí jen poslední volání. */
export function langGate(): (lang: Lang, fn: () => void) => void {
  let seq = 0;
  return (lang, fn) => {
    const n = ++seq;
    if (!isLang(lang) || DICTS[lang] || !loader) { fn(); return; }
    void ensureLang(lang).then(() => { if (n === seq) fn(); });
  };
}
/* Slovník jazyka, o který se naposledy žádalo, je načtený a jazyk přepnutý (okna na to čekají před vykreslením). */
export async function langReady(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const l = wanted;
    await ensureLang(l);
    if (wanted === l) { if (DICTS[l] || !loader) apply(l); return; }
  }
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
