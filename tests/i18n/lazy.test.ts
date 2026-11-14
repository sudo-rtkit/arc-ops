/* 0.25.0: slovníky po jazycích. Okno načte jen slovník aktivního jazyka; přepnutí jazyka proběhne až po načtení
   jeho slovníku (do té doby se kreslí celé v předchozím jazyce, nikdy klíče ani směs). Čerstvá instance jádra
   (vi.resetModules) s řízeným zavaděčem, aby šlo zkoušet i stav bez načteného slovníku. */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cs } from '../../src/i18n/cs';
import { en } from '../../src/i18n/en';
import { RAID_TEMPLATE_NAME } from '../../src/core/gametext';
import { defaultState } from '../../src/core/state';

async function freshCore() {
  vi.resetModules();
  const core = await import('../../src/i18n/core');
  const pending: Partial<Record<'cs' | 'en', () => void>> = {};
  const loads: string[] = [];
  core.registerLoader(lang => new Promise(res => { loads.push(lang); pending[lang] = () => res(lang === 'en' ? en : cs); }));
  return { core, pending, loads };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('0.25.0: slovníky po jazycích', () => {
  it('setLang přepne až po načtení slovníku; mezitím zůstane předchozí jazyk, nikdy klíč', async () => {
    const { core, pending, loads } = await freshCore();
    core.setLang('cs');
    expect(loads).toEqual(['cs']);
    const ready = core.langReady();
    pending.cs!();
    await ready;
    expect(core.getLang()).toBe('cs');
    expect(core.t('common.cancel')).toBe(cs['common.cancel']);
    /* přepnutí na angličtinu: dokud slovník nepřijde, všechno dál česky */
    let changes = 0;
    core.subscribeLang(() => changes++);
    core.setLang('en');
    await tick();
    expect(core.getLang()).toBe('cs');
    expect(core.t('common.cancel')).toBe(cs['common.cancel']);
    expect(core.hasDict('en')).toBe(false);
    expect(core.tlOpt('en', 'common.cancel')).toBeNull();
    pending.en!();
    await tick();
    expect(core.getLang()).toBe('en');
    expect(core.t('common.cancel')).toBe(en['common.cancel']);
    expect(changes).toBe(1);
    /* oba načtené: přepnutí hned, slovník se znovu nenačítá */
    core.setLang('cs');
    expect(core.getLang()).toBe('cs');
    expect(loads).toEqual(['cs', 'en']);
  });
  it('rychlé přepnutí tam a zpět: platí poslední volba', async () => {
    const { core, pending } = await freshCore();
    core.setLang('cs'); pending.cs!(); await core.langReady();
    core.setLang('en');
    core.setLang('cs');
    pending.en!();
    await tick();
    expect(core.getLang()).toBe('cs');
  });
  it('langGate: stav s jiným jazykem projde až s jeho slovníkem; platí jen poslední stav', async () => {
    const { core, pending } = await freshCore();
    core.setLang('cs'); pending.cs!(); await core.langReady();
    const gate = core.langGate();
    const seen: string[] = [];
    gate('cs', () => seen.push('cs1'));
    gate('en', () => seen.push('en1'));
    gate('en', () => seen.push('en2'));
    expect(seen).toEqual(['cs1']);
    pending.en!();
    await tick();
    expect(seen).toEqual(['cs1', 'en2']);
  });
  it('bez zavaděče (okno buddyho) se přepíná hned', async () => {
    vi.resetModules();
    const core = await import('../../src/i18n/core');
    core.setLang('en');
    expect(core.getLang()).toBe('en');
    await core.langReady();
    expect(core.t('common.cancel')).toBe('common.cancel');
  });
  it('index.ts nevkládá slovníky do balíku (jen dynamický import); výchozí šablona bez slovníku', () => {
    const src = readFileSync(new URL('../../src/i18n/index.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/import\s*\{[^}]*\}\s*from\s*'\.\/(cs|en)'/);
    expect(src).toMatch(/import\('\.\/en'\)/);
    expect(src).toMatch(/import\('\.\/cs'\)/);
    expect(RAID_TEMPLATE_NAME).toEqual({ cs: cs['default.raidTemplate'], en: en['default.raidTemplate'] });
    expect(defaultState(0, 'en').checklists.templates.find(c => c.id === 'raid')?.name).toBe(en['default.raidTemplate']);
  });
});
