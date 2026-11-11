import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../../src/i18n';
import { fmt, fmtBytes, fmtDate, fmtDateTime, fmtDay, fmtDayShort, fmtDec, fmtMinutes, fmtTime, pct, ratio } from '../../src/ui/format';

const NB = ' ';
const ts = new Date(2026, 10, 10, 17, 7).getTime();
afterEach(() => setLang('cs'));

describe('formátování: čeština (výchozí, stejné jako dřív)', () => {
  it('čísla', () => {
    expect(fmt(184500)).toBe(`184${NB}500`);
    expect(fmt(1234567)).toBe(`1${NB}234${NB}567`);
    expect(fmt(3000)).toBe(`3${NB}000`);
    expect(fmt(999)).toBe('999');
    expect(fmt(-2500)).toBe(`−2${NB}500`);
    expect(fmt(0)).toBe('0');
    expect(fmt(Number.NaN)).toBe('0');
    expect(fmt(12.6)).toBe('13');
    expect(fmtDec(1.5)).toBe('1,5');
    expect(fmtDec(2)).toBe('2');
    expect(fmtDec(12345.25, 2)).toBe(`12${NB}345,25`);
    expect(fmtDec(-0.5)).toBe('−0,5');
    expect(pct(0.75)).toBe(`75${NB}%`);
    expect(ratio(1500, 3000)).toBe(`1${NB}500 / 3${NB}000`);
  });
  it('data a časy', () => {
    expect(fmtDate(ts)).toBe(`10.${NB}11.${NB}2026`);
    expect(fmtTime(ts)).toBe('17:07');
    expect(fmtDateTime(ts)).toBe(`10.${NB}11.${NB}2026 17:07`);
    expect(fmtDay('2026-11-10')).toBe(`10.${NB}11.${NB}2026`);
    expect(fmtDay('2026-01-05')).toBe(`5.${NB}1.${NB}2026`);
    expect(fmtDayShort('2026-11-10')).toBe(`10.${NB}11.`);
    expect(fmtMinutes(8.4)).toBe('08:24');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1536)).toBe('1,5 kB');
  });
});

describe('formátování: angličtina', () => {
  it('čísla s parametrem jazyka i podle aktuálního jazyka', () => {
    expect(fmt(184500, 'en')).toBe('184,500');
    expect(fmt(-2500, 'en')).toBe('−2,500');
    expect(fmtDec(1.5, 1, 'en')).toBe('1.5');
    expect(pct(0.75, 'en')).toBe('75%');
    setLang('en');
    expect(fmt(184500)).toBe('184,500');
    expect(fmtDec(12345.25, 2)).toBe('12,345.25');
    expect(pct(0.456)).toBe('46%');
    expect(ratio(1500, 3000)).toBe('1,500 / 3,000');
    expect(fmtBytes(1536)).toBe('1.5 kB');
  });
  it('data a časy jsou jednoznačné', () => {
    setLang('en');
    expect(fmtDate(ts)).toBe(`10${NB}Nov${NB}2026`);
    expect(fmtTime(ts)).toBe('17:07');
    expect(fmtDateTime(ts)).toBe(`10${NB}Nov${NB}2026 17:07`);
    expect(fmtDay('2026-01-05')).toBe(`5${NB}Jan${NB}2026`);
    expect(fmtDayShort('2026-11-10')).toBe(`10${NB}Nov`);
    expect(fmtDate(ts, 'cs')).toBe(`10.${NB}11.${NB}2026`);
  });
});
