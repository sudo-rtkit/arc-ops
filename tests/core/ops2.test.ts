/* 0.10.0: Bedňák 2.0 (dvě varianty, nové animace), povahy a hlášky, pravidla zvuků, průvodce a schéma 8. */
import { describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { OPS, OPS_ANIMS, OPS_GEOMETRY, animMs, normalizeBuddy, resolveOutfit, sleepAfterMs } from '../../src/core/ops';
import { Animator } from '../../src/ops/animator';
import { OPS_LINES, LINE_KEYS } from '../../src/i18n/opsLines';
import { createMemo, lineGesture, line, nextIndex, sayLine, upgradeHint } from '../../src/core/opsVoice';
import { BUDDY_TOUCH_MS, soundAllowed, soundGain, type SoundContext } from '../../src/core/opsSound';
import { PERSONALITIES, emptyOpsPrefs, normalizeOpsPrefs, TUTORIAL_STEPS } from '../../src/core/opsPrefs';
import { STEPS, isResume, reply, restart, skip, tutorialShown } from '../../src/core/tutorial';
import { createOpsHub, DISMISS_MS, type BuddyStatus } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import { LANGS, type Lang } from '../../src/i18n';
import type { CompactUpgrade } from '../../src/core/compact';

const NOW = new Date(2026, 10, 12, 12, 0).getTime();
async function makeApp(stored?: unknown): Promise<App> {
  const kv = memoryKV();
  if (stored !== undefined) kv.setItem('arcops:state', JSON.stringify(stored));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return app;
}

describe('Bedňák 2.0: manifest a varianty', () => {
  it('23 animací v obou variantách, časování z manifestu, aliasy starých stavů', () => {
    expect(Object.keys(OPS.states).sort()).toEqual([...OPS_ANIMS].sort());
    expect(OPS.aliases).toEqual({ done: 'success', unsure: 'thinking', sleeping: 'sleep', alert: 'error' });
    expect(OPS.states.dismiss).toMatchObject({ loop: false, returnTo: null });
    expect(OPS.fx.sparkle.frameCount).toBe(8);
    expect(animMs('dismiss')).toBe(DISMISS_MS);
    for (const g of Object.values(OPS_GEOMETRY)) {
      /* příchod začíná a odchod končí neviditelnými snímky (tělo ani šatník se nekreslí) */
      expect(g.forms.rookie.appear.frames[0]).toBeLessThan(0);
      expect(g.forms.rookie.dismiss.frames.at(-1)).toBeLessThan(0);
      expect(g.forms.rookie.idle.frames.every(f => f >= 0)).toBe(true);
      for (const f of Object.values(g.forms)) for (const st of Object.values(f)) for (const fr of st.frames) expect(g.anchors[fr < 0 ? -1 - fr : fr], g.variant).toHaveLength(OPS.slots.length);
    }
  });

  it('šatník: ID dílů se nezměnila; neznámá ruční volba z dřívějška se vrátí na automatiku, sbírka zůstane', () => {
    const b = normalizeBuddy({ enabled: true, unlocked: ['antenna-1', 'visor-1', 'old-part'], outfit: { antenna: 'antenna-old', visor: 'visor-1', tool: null } });
    expect(b.unlocked).toEqual(['antenna-1', 'visor-1']);
    expect(b.outfit).toEqual({ visor: 'visor-1', tool: null });
    const o = resolveOutfit(20, b);
    expect(o.antenna).toBe(OPS.unlocks[20].defaultOutfit.antenna);
    expect(o.tool).toBeNull();
  });

  it('spánek: rychleji, když hra neběží', () => {
    expect(sleepAfterMs(false)).toBeLessThan(sleepAfterMs(null));
    expect(sleepAfterMs(true)).toBe(sleepAfterMs(null));
  });
});

describe('Animator 2.0', () => {
  const run = (a: Animator, ms: number) => { for (let t = 0; t < ms; t += 50) a.tick(50); };
  it('dismiss zůstane skrytý na posledním snímku, nový příkaz ho ukončí', () => {
    const a = new Animator();
    a.play('dismiss');
    run(a, DISMISS_MS + 500);
    expect(a.anim).toBe('dismiss');
    expect(a.hidden()).toBe(true);
    expect(a.frame).toBe(OPS.states.dismiss.frameCount - 1);
    a.play('appear');
    expect(a.hidden()).toBe(false);
    run(a, animMs('appear') + 100);
    expect(a.anim).toBe('idle');
  });
  it('fronta: probuzení, pak výsledek; klid během bubliny je talk', () => {
    const a = new Animator();
    a.play('sleep');
    a.play('wake-up');
    a.then('success');
    expect(a.anim).toBe('wake-up');
    run(a, animMs('wake-up') + 10);
    expect(a.anim).toBe('success');
    a.setRest('talk');
    run(a, animMs('success') + 10);
    expect(a.anim).toBe('talk');
    a.setRest('idle');
    expect(a.anim).toBe('idle');
  });
  it('smyčka once (krok po přesunu) skončí v klidu; omezení pohybu ukáže rovnou výsledek', () => {
    const a = new Animator();
    a.play('walk', { once: true });
    run(a, animMs('walk') + 10);
    expect(a.anim).toBe('idle');
    const r = new Animator(); r.reduced = true;
    r.play('dismiss');
    expect(r.hidden()).toBe(true);
    r.play('success');
    expect(r.anim).toBe('idle');
  });
});

describe('povahy a hlášky', () => {
  it('každá hláška má všechny tři povahy v obou jazycích, aspoň dvě varianty a parametry shodné mezi jazyky', () => {
    expect(LINE_KEYS.length).toBeGreaterThanOrEqual(30);
    const params = (m: unknown) => [...new Set(JSON.stringify(m).match(/\{\w+(?::\w+)?\}/g) ?? [])].map(x => x.replace(/:.*\}/, '}')).sort();
    for (const lang of LANGS) {
      expect(Object.keys(OPS_LINES[lang]).sort(), lang).toEqual([...LINE_KEYS].sort());
      for (const k of LINE_KEYS) for (const mode of PERSONALITIES) {
        const v = OPS_LINES[lang][k][mode];
        expect(v.length, `${lang} ${k} ${mode}`).toBeGreaterThanOrEqual(2);
        /* varianta smí parametr vynechat, ale nesmí použít neznámý (stejná sada v obou jazycích) */
        const known = new Set(PERSONALITIES.flatMap(x => OPS_LINES.cs[k][x].flatMap(params)));
        for (const m of v) for (const x of params(m)) expect(known.has(x), `${lang} ${k} ${mode} ${x}`).toBe(true);
        if (lang === 'cs') for (const m of v) if (typeof m !== 'string') expect(m.few, `${k} ${mode}`).toBeDefined();
      }
    }
  });
  it('drzá povaha bez vulgarit a urážek', () => {
    const bad = /\b(idiot|stupid|dumb|loser|shit|damn|hell|kurv|debil|blb|píč|hovn|prdel|kretén|trotl|lemr|sráč)/i;
    for (const lang of LANGS) for (const k of LINE_KEYS) for (const m of OPS_LINES[lang][k].cheeky) expect(bad.test(JSON.stringify(m)), `${lang} ${k}`).toBe(false);
  });
  it('střídání bez okamžitého opakování; poprvé vždy první varianta', () => {
    expect(nextIndex(3, undefined)).toBe(0);
    for (let last = 0; last < 3; last++) for (const r of [0, 0.3, 0.6, 0.99]) expect(nextIndex(3, last, () => r)).not.toBe(last);
    const memo = createMemo();
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) seen.push(sayLine(line('hint.missing', { mats: '2× Power Cable', station: 'Gear Bench', level: 2 }), 'cheeky', 'cs', memo));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(new Set(seen).size).toBe(3);
  });
  it('povaha mění text i plurál a gesto', () => {
    const l = line('scan.check', { count: 3, pages: 1 });
    const texts = PERSONALITIES.map(m => sayLine(l, m, 'cs'));
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toBe('Ke kontrole 3 řádky · stránek 1.');
    expect(sayLine(line('scan.check', { count: 1, pages: 1 }), 'plain', 'en')).toBe('1 row to check · pages 1.');
    expect(lineGesture('loot.empty', 'cheeky')).toBe('laugh');
    expect(lineGesture('loot.empty', 'plain')).toBe('shrug');
    expect(lineGesture('scan.read', 'friendly')).toBeNull();
  });
  it('rada k dalšímu vylepšení: chybí, hotovo, nic, prázdný profil', () => {
    const up = { station: { id: 'gear', name: 'Gear Bench' }, level: 2, mats: [{ mat: 'Power Cable', have: 1, need: 3, missing: 2, rarity: 'rare' }], missing: 2, have: 1, need: 3, block: null, chosen: false } as unknown as CompactUpgrade;
    expect(upgradeHint(up, false)).toEqual({ line: 'hint.missing', params: { mats: '2× Power Cable', station: 'Gear Bench', level: 2, count: 2 } });
    expect(sayLine(upgradeHint(up, false), 'plain', 'cs')).toBe('Chybí ti 2× Power Cable na Gear Bench 2.');
    expect(upgradeHint({ ...up, missing: 0 }, false).line).toBe('hint.ready');
    expect(upgradeHint(null, false).line).toBe('hint.idle');
    expect(upgradeHint(up, true).line).toBe('hint.fresh');
  });
});

describe('zvuky: kdy smí Ops pípnout', () => {
  const base: SoundContext = { on: true, volume: 25, overlayOpen: false, appFocused: false, buddyTouchAt: 0, gameForeground: true, now: NOW };
  it('hra v popředí a žádné Ops UI v použití = ticho', () => {
    expect(soundAllowed(base)).toBe(false);
    expect(soundAllowed({ ...base, gameForeground: false })).toBe(false);
  });
  it('otevřený overlay, okno s fokusem nebo čerstvé kliknutí na buddyho = smí', () => {
    expect(soundAllowed({ ...base, overlayOpen: true })).toBe(true);
    expect(soundAllowed({ ...base, appFocused: true })).toBe(true);
    expect(soundAllowed({ ...base, buddyTouchAt: NOW - 1000 })).toBe(true);
    expect(soundAllowed({ ...base, buddyTouchAt: NOW - BUDDY_TOUCH_MS - 1 })).toBe(false);
  });
  it('vypnuto nebo nulová hlasitost = nikdy; hlasitost je tichá křivka', () => {
    expect(soundAllowed({ ...base, appFocused: true, on: false })).toBe(false);
    expect(soundAllowed({ ...base, appFocused: true, volume: 0 })).toBe(false);
    expect(soundGain(0)).toBe(0);
    expect(soundGain(100)).toBeLessThanOrEqual(0.35);
    expect(soundGain(25)).toBeLessThan(soundGain(50));
    expect(emptyOpsPrefs()).toMatchObject({ sound: true, volume: 25, personality: 'friendly', dialogs: true });
  });
});

describe('průvodce prvním spuštěním', () => {
  it('celý průchod: přivítání → profil → snímek → prohlídka → buddy → konec', () => {
    let st = { status: 'new', step: 'welcome' } as ReturnType<typeof restart>;
    const go = (id: Parameters<typeof reply>[1]) => { const e = reply(st.step, id); if (e.tutorial) st = e.tutorial; return e; };
    go('start'); expect(st).toEqual({ status: 'active', step: 'profile' });
    expect(go('manual')).toMatchObject({ navigate: 'profile' }); expect(st.step).toBe('profile-manual');
    go('done'); expect(st.step).toBe('capture');
    expect(go('setKey')).toEqual({ navigate: 'settings' }); expect(st.step).toBe('capture');
    go('next'); expect(st.step).toBe('tour-inventory');
    expect(go('show')).toEqual({ navigate: 'inventory' });
    go('next'); go('next'); go('next'); expect(st.step).toBe('tour-builds');
    expect(go('show')).toEqual({ navigate: 'skills/builds' });
    go('next'); expect(st.step).toBe('tour-compact');
    expect(go('tryCompact')).toEqual({ compact: true });
    go('next'); expect(st.step).toBe('buddy');
    go('next'); go('finish'); expect(st).toEqual({ status: 'done', step: 'end' });
  });
  it('přeskočení v každém kroku, prohlídku jde vynechat, snímek profilu je aktivní (0.10.1)', () => {
    for (const step of TUTORIAL_STEPS) expect(skip(step)).toEqual({ status: 'skipped', step });
    expect(reply('welcome', 'know').tutorial?.status).toBe('skipped');
    expect(reply('tour-workshop', 'skipTour').tutorial?.step).toBe('buddy');
    expect(STEPS.profile.replies.find(r => r.id === 'shot')?.disabled).toBeFalsy();
    expect(reply('profile', 'shot')).toEqual({ tutorial: { status: 'active', step: 'profile-shot' }, navigate: 'profile/shot' });
    expect(reply('profile-shot', 'done').tutorial?.step).toBe('capture');
    expect(reply('profile-shot', 'manual')).toEqual({ tutorial: { status: 'active', step: 'profile-manual' }, navigate: 'profile' });
    for (const s of TUTORIAL_STEPS) expect(STEPS[s].replies.some(r => r.primary)).toBe(true);
  });
  it('kdy se ukáže: nový jen se zapnutými dialogy a automatikou, rozběhnutý vždy (pokračuje), schovaný ne', () => {
    expect(tutorialShown({ status: 'new', step: 'welcome' }, true, true, false)).toBe(true);
    expect(tutorialShown({ status: 'new', step: 'welcome' }, false, true, false)).toBe(false);
    expect(tutorialShown({ status: 'new', step: 'welcome' }, true, false, false)).toBe(false);
    expect(tutorialShown({ status: 'active', step: 'capture' }, false, false, false)).toBe(true);
    expect(tutorialShown({ status: 'active', step: 'capture' }, true, true, true)).toBe(false);
    expect(tutorialShown({ status: 'done', step: 'end' }, true, true, false)).toBe(false);
    expect(isResume({ status: 'active', step: 'capture' }, true)).toBe(true);
    expect(isResume({ status: 'active', step: 'welcome' }, true)).toBe(false);
    expect(restart()).toEqual({ status: 'active', step: 'welcome' });
  });
});

describe('schéma 8: povaha, zvuky a průvodce', () => {
  it('starší stav (schéma 7) se načte beze ztráty a dostane výchozí hodnoty', () => {
    const s7 = { schema: 7, profile: { level: 33, coins: 1200 }, inventory: { 'Metal Parts': 5 }, buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS', scale: 2, outfit: { antenna: 'antenna-2' }, unlocked: ['antenna-1', 'antenna-2'] }, mainWindow: { mode: 'compact' } };
    const s = normalize(s7, NOW);
    expect(SCHEMA).toBe(8);
    expect(s.schema).toBe(8);
    expect(s.profile).toMatchObject({ level: 33, coins: 1200 });
    expect(s.inventory).toEqual({ 'Metal Parts': 5 });
    expect(s.buddy).toMatchObject({ enabled: true, hotkey: 'Ctrl+Shift+KeyS', scale: 2, outfit: { antenna: 'antenna-2' } });
    expect(s.mainWindow.mode).toBe('compact');
    expect(s.opsPrefs).toEqual(emptyOpsPrefs());
    expect(defaultState(NOW).opsPrefs).toEqual(emptyOpsPrefs());
  });
  it('normalizace: neplatné hodnoty se zahodí, hlasitost 0–100', () => {
    expect(normalizeOpsPrefs({ personality: 'rude', sound: 'yes', volume: 400, dialogs: false, tutorial: { status: 'x', step: 'tour-quests' } }))
      .toEqual({ personality: 'friendly', sound: true, volume: 100, dialogs: false, tutorial: { status: 'new', step: 'tour-quests' } });
    expect(normalizeOpsPrefs({ personality: 'cheeky', volume: -3 })).toMatchObject({ personality: 'cheeky', volume: 0 });
  });
  it('akce a záloha: import ani obnova nemění povahu, zvuky a průvodce tohoto počítače', async () => {
    const app = await makeApp();
    app.actions.setOpsPrefs({ personality: 'cheeky', volume: 60, tutorial: { status: 'active', step: 'tour-quests' } });
    const here = structuredClone(app.store.getState().state.opsPrefs);
    expect(here).toMatchObject({ personality: 'cheeky', volume: 60, tutorial: { status: 'active', step: 'tour-quests' } });
    const other = defaultState(NOW);
    other.profile.level = 50;
    other.opsPrefs = { personality: 'plain', sound: false, volume: 0, dialogs: false, tutorial: { status: 'done', step: 'end' } };
    const file = parseBackup(makeBackup(other, new Date(NOW)), NOW);
    if ('error' in file) throw new Error(file.error);
    expect(await app.actions.importState(file.state, '{}', 'app')).toBe(true);
    expect(app.store.getState().state.profile.level).toBe(50);
    expect(app.store.getState().state.opsPrefs).toEqual(here);
  });
});

describe('hub 0.10.0: odchod před zavřením a stav pro okna', () => {
  function fakeNative(): Native & { calls: string[] } {
    const calls: string[] = [];
    const rec = (name: string) => async () => { calls.push(name); };
    return {
      calls, available: true, enable: rec('enable'), setHotkey: rec('setHotkey'), watch: rec('watch'), buddyOpen: rec('buddyOpen'), buddyClose: rec('buddyClose'),
      overlayOpen: rec('overlayOpen'), overlayClose: rec('overlayClose'), overlayToggle: rec('overlayToggle'), mainFocus: rec('mainFocus'),
      captureNow: rec('captureNow'), captureTake: async () => new ArrayBuffer(0),
    };
  }
  it('skrytí buddyho: nejdřív dismiss, okno se zavře až po odchodu; povaha a zvuky jdou do view', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    try {
      const app = await makeApp({ schema: 8, buddy: { enabled: true }, opsPrefs: { personality: 'plain', volume: 40 } });
      const native = fakeNative();
      const buses = memoryBuses();
      const buddy = buses('buddy');
      const statuses: BuddyStatus[] = [], views: unknown[] = [];
      buddy.on('status', s => statuses.push(s as BuddyStatus));
      buddy.on('view', v => views.push(v));
      const hub = createOpsHub({ app, bus: buses('main'), native, now: () => Date.now(), pushMs: 0, dismissMs: DISMISS_MS, appFocused: () => true });
      hub.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(views.at(-1)).toMatchObject({ personality: 'plain', sound: true, volume: 40, dialogs: true, game: null });
      hub.setBuddyVisible(false);
      await vi.advanceTimersByTimeAsync(10);
      expect(statuses.at(-1)).toMatchObject({ anim: 'dismiss', ui: { appFocused: true } });
      expect(native.calls).not.toContain('buddyClose');
      await vi.advanceTimersByTimeAsync(DISMISS_MS + 10);
      expect(native.calls.at(-1)).toBe('buddyClose');
      hub.stop();
    } finally { vi.useRealTimers(); }
  });
});

void (null as unknown as Lang);
