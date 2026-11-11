/* Formátování podle jazyka přes Intl. cs (výchozí): 125 400, 75 %, 10. 11. 2026, 17:07, 08:24.
   en: 125,400, 75%, 10 Nov 2026, 17:07, 08:24. Bez jazyka se použije aktuální jazyk UI. Neznámá hodnota je „—“. */
import { formatDec, formatInt, formatPct, getLang, LOCALE, type Lang } from '../i18n';

const NBSP = ' ';
export const DASH = '—';

export const fmt = (n: number, lang: Lang = getLang()): string => formatInt(lang, n);
export const fmtDec = (n: number, d = 1, lang: Lang = getLang()): string => formatDec(lang, n, d);
export const pct = (x: number, lang: Lang = getLang()): string => formatPct(lang, x);
export const ratio = (a: number, b: number, lang: Lang = getLang()): string => `${fmt(a, lang)} / ${fmt(b, lang)}`;

const p2 = (n: number) => String(n).padStart(2, '0');
const dateFmt: Partial<Record<string, Intl.DateTimeFormat>> = {};
const DATE_OPTS: Record<Lang, Intl.DateTimeFormatOptions> = {
  cs: { day: 'numeric', month: 'numeric', year: 'numeric' },
  en: { day: 'numeric', month: 'short', year: 'numeric' },
};
const SHORT_OPTS: Record<Lang, Intl.DateTimeFormatOptions> = {
  cs: { day: 'numeric', month: 'numeric' },
  en: { day: 'numeric', month: 'short' },
};
function dateParts(d: Date, lang: Lang, short: boolean): string {
  const k = lang + (short ? ':s' : ':d');
  const f = (dateFmt[k] ||= new Intl.DateTimeFormat(LOCALE[lang], short ? SHORT_OPTS[lang] : DATE_OPTS[lang]));
  return f.format(d).replace(/\s+/g, NBSP);
}

export const fmtDate = (ts: number, lang: Lang = getLang()): string => dateParts(new Date(ts), lang, false);
export const fmtTime = (ts: number): string => { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const fmtDateTime = (ts: number, lang: Lang = getLang()): string => `${fmtDate(ts, lang)} ${fmtTime(ts)}`;
const dayDate = (day: string): Date => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtDay = (day: string, lang: Lang = getLang()): string => dateParts(dayDate(day), lang, false);
export const fmtDayShort = (day: string, lang: Lang = getLang()): string => dateParts(dayDate(day), lang, true);
/* Délka v minutách → 08:24 (mm:ss), raidy mají půlminuty. */
export const fmtMinutes = (min: number): string => {
  const s = Math.round((Number(min) || 0) * 60);
  return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
};
export const mmss = (ms: number): string => { const s = Math.floor(ms / 1000); return p2(Math.floor(s / 60)) + ':' + p2(s % 60); };
export const fmtBytes = (n: number, lang: Lang = getLang()): string =>
  (n < 1024 ? `${n} B` : n < 1048576 ? `${fmtDec(n / 1024, 1, lang)} kB` : `${fmtDec(n / 1048576, 1, lang)} MB`);
/* Číslo z textového pole podle jazyka. Mezery (i nezlomitelné) se ignorují.
   en: čárka je oddělovač tisíců („125,400“ = 125400), tečka desetinná.
   cs: čárka je desetinná („1,5“), tečky mezi trojicemi číslic jsou tisíce („1.200“ = 1200).
   Prázdný text vrací NaN. */
export function parseNumberInput(input: string, lang: Lang = getLang()): number {
  const s = String(input).replace(/[\s  ]/g, '');
  if (!s) return NaN;
  if (lang === 'en') return Number(s.replace(/,/g, ''));
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return Number(s.replace(',', '.'));
}

/* Datum pro input type=datetime-local a zpět */
export const toLocalInput = (ts: number): string => { const d = new Date(ts); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const fromLocalInput = (v: string): number => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : Date.now(); };
