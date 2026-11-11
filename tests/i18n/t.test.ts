import { afterEach, describe, expect, it } from 'vitest';
import { detectLang, getLang, interpolate, setLang, subscribeLang, t, tl, plural } from '../../src/i18n';

afterEach(() => setLang('cs'));

describe('t(): parametry a plurály', () => {
  it('výchozí jazyk v testech je čeština', () => {
    expect(getLang()).toBe('cs');
    expect(t('common.cancel')).toBe('Zrušit');
    expect(tl('en', 'common.cancel')).toBe('Cancel');
  });

  it('dosadí parametry a čísla formátuje podle jazyka', () => {
    expect(tl('cs', 'stepper.clamped', { min: 0, max: 75 })).toBe('Upraveno na povolený rozsah 0–75.');
    expect(tl('cs', 'stepper.clamped', { min: 0, max: 100000 })).toBe('Upraveno na povolený rozsah 0–100 000.');
    expect(tl('en', 'stepper.clamped', { min: 0, max: 100000 })).toBe('Adjusted to the allowed range 0–100,000.');
  });

  it('české plurály 1 / 2–4 / 5+', () => {
    const f = (n: number) => tl('cs', 'journal.count', { count: n });
    expect(f(1)).toBe('1 záznam');
    expect(f(2)).toBe('2 záznamy');
    expect(f(4)).toBe('4 záznamy');
    expect(f(5)).toBe('5 záznamů');
    expect(f(0)).toBe('0 záznamů');
    expect(f(22)).toBe('22 záznamů'); // čeština: few jen pro 2–4 (CLDR)
    expect(f(1000)).toBe('1 000 záznamů');
  });

  it('anglické plurály 1 / jinak', () => {
    const f = (n: number) => tl('en', 'journal.count', { count: n });
    expect(f(1)).toBe('1 entry');
    expect(f(2)).toBe('2 entries');
    expect(f(0)).toBe('0 entries');
    expect(f(5)).toBe('5 entries');
  });

  it('plural() vybere tvar podle Intl.PluralRules', () => {
    expect(plural('cs', 1, { one: 'a', few: 'b', other: 'c' })).toBe('a');
    expect(plural('cs', 3, { one: 'a', few: 'b', other: 'c' })).toBe('b');
    expect(plural('cs', 7, { one: 'a', few: 'b', other: 'c' })).toBe('c');
    expect(plural('cs', 1.5, { one: 'a', few: 'b', other: 'c' })).toBe('c');
    expect(plural('en', 3, { one: 'a', other: 'c' })).toBe('c');
  });

  it('procenta a nezformátované hodnoty', () => {
    expect(interpolate('cs', 'Extrakce {rate:pct}', { rate: 0.456 })).toBe('Extrakce 46 %');
    expect(interpolate('en', 'Extraction {rate:pct}', { rate: 0.456 })).toBe('Extraction 46%');
    expect(interpolate('cs', 'Rok {year:raw}', { year: 2026 })).toBe('Rok 2026');
    expect(interpolate('cs', 'Rok {year}', { year: 2026 })).toBe('Rok 2 026');
    expect(interpolate('en', '{a} a {a}', { a: 'x' })).toBe('x a x');
  });

  it('chybějící parametr nechá zástupný text, neznámý klíč vrátí klíč', () => {
    expect(tl('cs', 'stepper.clamped', { min: 1 })).toBe('Upraveno na povolený rozsah 1–{max}.');
    expect(tl('cs', 'neexistuje' as never)).toBe('neexistuje');
  });

  it('setLang změní jazyk, upozorní posluchače a nastaví <html lang>', () => {
    const seen: string[] = [];
    const off = subscribeLang(() => seen.push(getLang()));
    setLang('en');
    expect(t('common.cancel')).toBe('Cancel');
    setLang('en');
    off();
    setLang('cs');
    expect(seen).toEqual(['en']);
  });
});

describe('detectLang podle navigator.language', () => {
  it.each([
    ['cs', 'cs'], ['cs-CZ', 'cs'], ['CS-cz', 'cs'], ['sk', 'cs'], ['sk-SK', 'cs'],
    ['en-US', 'en'], ['en', 'en'], ['de-DE', 'en'], ['', 'en'], [undefined, 'en'], ['csb', 'en'],
  ])('%s → %s', (nav, lang) => {
    expect(detectLang(nav as string | undefined)).toBe(lang);
  });
});
