/* Slovník: cs a en mají stejné klíče, žádná hodnota není prázdná, parametry sedí a plurály mají povinné tvary. */
import { describe, expect, it } from 'vitest';
import { cs } from '../../src/i18n/cs';
import { en } from '../../src/i18n/en';
import type { Msg } from '../../src/i18n';

const forms = (m: Msg): string[] => (typeof m === 'string' ? [m] : [m.one, m.few, m.other].filter((x): x is string => x !== undefined));
const params = (m: Msg): string[] => [...new Set(forms(m).flatMap(s => [...s.matchAll(/\{(\w+)(?::\w+)?\}/g)].map(x => x[1])))].sort();

describe('slovník cs/en', () => {
  const csKeys = Object.keys(cs).sort();
  const enKeys = Object.keys(en).sort();

  it('má stejné klíče (parita)', () => {
    expect(enKeys).toEqual(csKeys);
    expect(csKeys.length).toBeGreaterThan(900);
  });

  it('žádná hodnota není prázdná', () => {
    for (const [lang, d] of [['cs', cs], ['en', en]] as const) {
      for (const [k, m] of Object.entries(d)) for (const s of forms(m as Msg)) expect(s.trim().length, `${lang}:${k}`).toBeGreaterThan(0);
    }
  });

  it('obě verze používají stejné parametry', () => {
    for (const k of csKeys) {
      const c = params((cs as Record<string, Msg>)[k]), e = params((en as Record<string, Msg>)[k]);
      /* count může být jen v plurálu jednoho jazyka (např. cs „{count} záznamů“ jako jeden tvar) */
      expect(e.filter(x => x !== 'count'), k).toEqual(c.filter(x => x !== 'count'));
    }
  });

  it('plurál má tvary one/other, v češtině i few; parametr count je v každém tvaru', () => {
    for (const [lang, d] of [['cs', cs], ['en', en]] as const) {
      for (const [k, m] of Object.entries(d)) {
        if (typeof m === 'string') continue;
        expect(m.one, `${lang}:${k}`).toBeTruthy();
        expect(m.other, `${lang}:${k}`).toBeTruthy();
        if (lang === 'en') expect(m.few, `${lang}:${k}`).toBeUndefined();
        for (const s of forms(m)) expect(s.includes('{count'), `${lang}:${k}: ${s}`).toBe(true);
      }
    }
  });

  it('anglický text neobsahuje českou diakritiku (kromě názvů z deníku v uvozovkách)', () => {
    const allowed = ['import.introPath'];
    for (const [k, m] of Object.entries(en)) {
      if (allowed.includes(k)) continue;
      for (const s of forms(m as Msg)) expect(/[áčďéěíňóřšťúůýž]/i.test(s), `${k}: ${s}`).toBe(false);
    }
  });
});
