/* 0.28.0: náhradní obsah okna po chybě vykreslení: dvojjazyčný, s tlačítkem pro nové načtení, nic neaktivuje;
   chyba vykreslení jde do deníku (reportError) se zásobníkem komponent. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const reportError = vi.fn();
vi.mock('../../src/shell/diagLog', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { CrashFallback, ErrorBoundary } from '../../src/ui/ErrorBoundary';
import { CRASH_TEXT } from '../../src/i18n/crashText';
import { setLang } from '../../src/i18n';

afterEach(() => { setLang('cs'); reportError.mockClear(); });

describe('ErrorBoundary', () => {
  it('full: nadpis, vysvětlení a tlačítko v jazyce okna', () => {
    for (const lang of ['cs', 'en'] as const) {
      setLang(lang);
      const html = renderToStaticMarkup(createElement(CrashFallback, { variant: 'full' }));
      expect(html).toContain('role="alert"');
      expect(html).toContain(CRASH_TEXT[lang].title);
      expect(html).toContain(CRASH_TEXT[lang].text);
      expect(html).toContain(CRASH_TEXT[lang].reload);
      expect(html).not.toMatch(/autofocus/i);
    }
  });
  it('pill (widgety) a icon (buddy): jen malé tlačítko, popisek v jazyce okna', () => {
    setLang('en');
    const pill = renderToStaticMarkup(createElement(CrashFallback, { variant: 'pill' }));
    expect(pill).toContain(CRASH_TEXT.en.short);
    expect(pill.match(/<button/g)).toHaveLength(1);
    const icon = renderToStaticMarkup(createElement(CrashFallback, { variant: 'icon' }));
    expect(icon).toContain(`aria-label="${CRASH_TEXT.en.short}"`);
    expect(icon.match(/<button/g)).toHaveLength(1);
    expect(icon).not.toContain(CRASH_TEXT.en.text);
  });
  it('chyba vykreslení přepne na náhradní obsah a zapíše se do deníku se zásobníkem komponent', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const b = new ErrorBoundary({ children: null, variant: 'icon' });
    const err = new Error('render boom');
    b.componentDidCatch(err, { componentStack: '\n    in BuddyApp' });
    expect(reportError).toHaveBeenCalledWith(err, 'error', 'render', '\n    in BuddyApp');
  });
  it('texty mají obě jazykové verze a anglická je bez české diakritiky', () => {
    expect(Object.keys(CRASH_TEXT.en)).toEqual(Object.keys(CRASH_TEXT.cs));
    for (const v of Object.values(CRASH_TEXT.en)) expect(/[áčďéěíňóřšťúůýž]/i.test(v), v).toBe(false);
  });
});
