/* 0.19.0: „Co je nového“ po aktualizaci (schéma 16). Verze tohoto počítače: nová instalace, aktualizace o několik
   verzí, stejná verze, návrat ke starší verzi a import zálohy (ten poslední viděnou verzi nemění). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { RELEASES } from '../../src/core/data/whatsnew';
import {
  APP_VERSION, allReleases, compareVersions, isVersion, markSeen, normalizeWhatsNew, pendingReleases, versionForSchema,
} from '../../src/core/whatsnew';
import { BLOCKED_ACTIONS, isRelayAction } from '../../src/store/relay';
import { COUNTED_STEPS, stepNumber } from '../../src/core/tutorial';

const NOW = new Date(2026, 10, 13, 12, 0).getTime();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const versions = (list: { version: string }[]) => list.map(r => r.version);

async function makeApp(stored?: unknown): Promise<App> {
  const kv = memoryKV();
  if (stored !== undefined) kv.setItem('arcops:state', JSON.stringify(stored));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return app;
}

describe('Co je nového: data', () => {
  it('verze aplikace je nejnovější vydání a sedí s package.json, tauri.conf.json a Cargo.toml', () => {
    expect(APP_VERSION).toBe('0.22.1');
    expect(JSON.parse(readFileSync(ROOT + 'package.json', 'utf8')).version).toBe(APP_VERSION);
    expect(JSON.parse(readFileSync(ROOT + 'src-tauri/tauri.conf.json', 'utf8')).version).toBe(APP_VERSION);
    expect(readFileSync(ROOT + 'src-tauri/Cargo.toml', 'utf8')).toMatch(new RegExp(`^version = "${APP_VERSION.replace(/\./g, '\\.')}"`, 'm'));
  });
  it('pokrývá 0.10.0 až 0.22.1, od nejnovější, bez duplicit; každý bod má český i anglický text', () => {
    const v = versions([...RELEASES]);
    expect(v[0]).toBe('0.22.1');
    expect(v[v.length - 1]).toBe('0.10.0');
    expect(new Set(v).size).toBe(v.length);
    for (let i = 1; i < v.length; i++) expect(compareVersions(v[i - 1], v[i])).toBeGreaterThan(0);
    for (const r of RELEASES) {
      expect(isVersion(r.version)).toBe(true);
      expect(r.title.cs.trim() && r.title.en.trim()).toBeTruthy();
      expect(r.items.length).toBeGreaterThan(0);
      expect(r.items.length).toBeLessThanOrEqual(4);
      for (const it of r.items) {
        expect(it.text.cs.trim().length, r.version).toBeGreaterThan(10);
        expect(it.text.en.trim().length, r.version).toBeGreaterThan(10);
        expect(it.text.cs).not.toBe(it.text.en);
        expect(it.text.en.length, r.version).toBeLessThanOrEqual(160);
      }
    }
    /* odkazy na moduly, které zadání chce: příprava na raid, mapy, rádce, hledání, karta předmětu, aplikace v overlayi, minihry */
    const links = new Set(RELEASES.flatMap(r => r.items.map(i => i.link)).filter(Boolean));
    for (const l of ['raid', 'maps', 'advisor', 'search', 'itemCard', 'overlayApp', 'games']) expect(links.has(l as never), l).toBe(true);
  });
});

describe('Co je nového: verze', () => {
  it('porovnání verzí', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('0.16.1', '0.16.0')).toBeGreaterThan(0);
    expect(compareVersions('0.19.0', '0.19.0')).toBe(0);
    expect(compareVersions('0.13.1', '0.14.0')).toBeLessThan(0);
    expect(isVersion('0.19.0')).toBe(true);
    for (const bad of ['0.19', 'v0.19.0', '', null, 19, '0.19.0-beta', '<b>']) expect(isVersion(bad)).toBe(false);
  });
  it('nová instalace: výchozí stav zná aktuální verzi, nic se neukáže', () => {
    expect(defaultState(NOW).whatsNew).toEqual({ seen: APP_VERSION });
    expect(pendingReleases(defaultState(NOW).whatsNew.seen)).toEqual([]);
    expect(normalize({}, NOW).whatsNew).toEqual({ seen: APP_VERSION });
  });
  it('aktualizace o několik verzí: jen vydání novější než viděná verze, od nejnovějšího', () => {
    expect(versions(pendingReleases('0.16.1'))).toEqual(['0.22.1', '0.22.0', '0.21.0', '0.20.1', '0.20.0', '0.19.0', '0.18.0', '0.17.0']);
    expect(versions(pendingReleases('0.18.0'))).toEqual(['0.22.1', '0.22.0', '0.21.0', '0.20.1', '0.20.0', '0.19.0']);
    expect(versions(pendingReleases('0.19.0'))).toEqual(['0.22.1', '0.22.0', '0.21.0', '0.20.1', '0.20.0']);
    expect(versions(pendingReleases('0.20.0'))).toEqual(['0.22.1', '0.22.0', '0.21.0', '0.20.1']);
    expect(versions(pendingReleases('0.20.1'))).toEqual(['0.22.1', '0.22.0', '0.21.0']);
    expect(versions(pendingReleases('0.9.0'))).toEqual(versions([...RELEASES]));
    /* jiná aktuální verze (např. budoucí 0.20.0 s daty do 0.19.0) */
    expect(versions(pendingReleases('0.17.0', '0.18.0'))).toEqual(['0.18.0']);
  });
  it('stejná verze, návrat ke starší verzi a neznámá verze: nic', () => {
    expect(pendingReleases(APP_VERSION)).toEqual([]);
    expect(pendingReleases('0.22.1')).toEqual([]);
    expect(versions(pendingReleases('0.22.0'))).toEqual(['0.22.1']);
    expect(pendingReleases('1.0.0', '0.19.0')).toEqual([]);
    expect(pendingReleases(null)).toEqual([]);
    expect(pendingReleases('nesmysl')).toEqual([]);
  });
  it('zavření karty: seen = max(seen, aktuální); po návratu ke starší verzi se novější nezapomene', () => {
    expect(markSeen({ seen: '0.16.1' })).toEqual({ seen: APP_VERSION });
    expect(markSeen({ seen: APP_VERSION })).toBeNull();
    expect(markSeen({ seen: '0.22.1' })).toBeNull();
    expect(markSeen({ seen: null })).toEqual({ seen: APP_VERSION });
    expect(markSeen({ seen: '0.20.0' }, '0.19.0')).toBeNull();
  });
  it('znovu otevřená karta ukáže všechna vydání do aktuální verze', () => {
    expect(versions(allReleases())).toEqual(versions([...RELEASES]));
    expect(versions(allReleases('0.17.0'))[0]).toBe('0.17.0');
  });
});

describe('Co je nového: schéma 16 a migrace', () => {
  it('starší stav bez pole: verze podle schématu (poslední verze, která ho ukládala)', () => {
    expect(SCHEMA).toBe(18);
    expect(versionForSchema(17)).toBe('0.20.1');
    expect(versionForSchema(16)).toBe('0.19.0');
    expect(versionForSchema(15)).toBe('0.18.0');
    expect(versionForSchema(14)).toBe('0.16.1');
    expect(versionForSchema(8)).toBe('0.10.1');
    expect(versionForSchema(7)).toBe('0.9.0');
    expect(versionForSchema(2)).toBe('0.9.0');
    expect(normalize({ schema: 15, profile: { level: 4 } }, NOW).whatsNew).toEqual({ seen: '0.18.0' });
    expect(normalize({ schema: 13 }, NOW).whatsNew).toEqual({ seen: '0.14.0' });
    expect(normalize({ schema: 5 }, NOW).whatsNew).toEqual({ seen: '0.9.0' });
    expect(versions(pendingReleases(normalize({ schema: 15 }, NOW).whatsNew.seen))).toEqual(['0.22.1', '0.22.0', '0.21.0', '0.20.1', '0.20.0', '0.19.0']);
  });
  it('uložená hodnota se ověří; schéma 16 bez pole nebo s vadnou verzí = nic neukazovat', () => {
    expect(normalizeWhatsNew({ seen: '0.17.0' }, 16)).toEqual({ seen: '0.17.0' });
    expect(normalizeWhatsNew({ seen: '<script>' }, 16)).toEqual({ seen: null });
    expect(normalizeWhatsNew({ seen: 17 }, 16)).toEqual({ seen: null });
    expect(normalizeWhatsNew(undefined, 16)).toEqual({ seen: null });
    expect(normalize({ schema: 16, whatsNew: { seen: '0.18.0' } }, NOW).whatsNew).toEqual({ seen: '0.18.0' });
  });
});

describe('Co je nového: store', () => {
  it('nová instalace (bez uloženého stavu): nic k ukázání', async () => {
    const app = await makeApp();
    expect(pendingReleases(app.store.getState().state.whatsNew.seen)).toEqual([]);
  });
  it('aktualizace z 0.16.1 (schéma 14): karta ukáže 0.17.0–0.21.0, zavření uloží aktuální verzi', async () => {
    const app = await makeApp({ schema: 14, profile: { level: 20 } });
    expect(versions(pendingReleases(app.store.getState().state.whatsNew.seen))).toEqual(['0.22.1', '0.22.0', '0.21.0', '0.20.1', '0.20.0', '0.19.0', '0.18.0', '0.17.0']);
    app.actions.whatsNewSeen();
    expect(app.store.getState().state.whatsNew).toEqual({ seen: APP_VERSION });
    expect(pendingReleases(app.store.getState().state.whatsNew.seen)).toEqual([]);
    await app.flush();
    const again = JSON.parse(String(app.storage ? await app.storage.load().then(r => r.content) : '{}'));
    expect(again.whatsNew).toEqual({ seen: APP_VERSION });
  });
  it('návrat ke starší verzi: uložená novější verze zůstane a nic se neukáže', async () => {
    const app = await makeApp({ ...defaultState(NOW), whatsNew: { seen: '0.22.1' } });
    expect(app.store.getState().state.whatsNew).toEqual({ seen: '0.22.1' });
    expect(pendingReleases(app.store.getState().state.whatsNew.seen)).toEqual([]);
    app.actions.whatsNewSeen();
    expect(app.store.getState().state.whatsNew).toEqual({ seen: '0.22.1' });
  });
  it('import zálohy, obnova ani reset poslední viděnou verzi nemění', async () => {
    const app = await makeApp({ schema: 15, profile: { level: 3 } });
    expect(app.store.getState().state.whatsNew).toEqual({ seen: '0.18.0' });
    /* starší záloha (schéma 12 = 0.13.1) i záloha z novějšího počítače (viděl 0.19.0) */
    for (const raw of [{ schema: 12, profile: { level: 40 } }, { ...defaultState(NOW), whatsNew: { seen: '0.19.0' } }]) {
      const file = parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: raw.schema, exportedAt: new Date(NOW).toISOString(), state: raw }), NOW);
      if ('error' in file) throw new Error(file.error);
      expect(await app.actions.importState(file.state, '{}', 'app')).toBe(true);
      expect(app.store.getState().state.whatsNew).toEqual({ seen: '0.18.0' });
    }
    /* záloha nese pole (je součástí stavu), ale import ho nepřevezme */
    const exported = parseBackup(makeBackup(app.store.getState().state, new Date(NOW)), NOW);
    if ('error' in exported) throw new Error(exported.error);
    expect(exported.state.whatsNew).toEqual({ seen: '0.18.0' });
    expect(await app.actions.resetAll()).toBe(true);
    expect(app.store.getState().state.whatsNew).toEqual({ seen: '0.18.0' });
  });
  it('zavření karty je akce jen hlavního okna (overlay ji nepřepošle)', () => {
    expect(isRelayAction('whatsNewSeen')).toBe(false);
    expect('whatsNewSeen' in BLOCKED_ACTIONS).toBe(true);
  });
});

describe('průvodce 0.19.0: počítadlo kroků', () => {
  it('odbočky profilu mají číslo kroku profilu; nové kroky jsou před kompaktem', () => {
    expect(COUNTED_STEPS).toEqual([
      'welcome', 'profile', 'capture', 'tour-inventory', 'tour-workshop', 'tour-quests', 'tour-builds',
      'tour-advisor', 'tour-raid', 'tour-map', 'tour-search', 'tour-compact', 'buddy', 'end',
    ]);
    expect(stepNumber('profile-shot')).toBe(stepNumber('profile'));
    expect(stepNumber('profile-manual')).toBe(2);
    expect(stepNumber('end')).toBe(COUNTED_STEPS.length);
  });
});
