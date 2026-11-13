/* 0.20.1: tiché emoce Opse k automatickému snímku (scan, scan-ok, scan-unsure).
   - manifest a runtime assety: počty snímků, časování, kotvy, soubory a jejich rozměry v obou variantách a všech podobách,
   - nátěry: přesná paleta, binární alfa, měděná LED linka skenu zůstane, návrat do klidu bez barevného skoku,
   - pravidla: událost → emoce, spánek, tažení, gesto, proměna, skrytí, omezení pohybu, sloučení opakování,
   - hub: emoce jen při běžícím snímání (pozastavení a hlavní vypínač = nic), žádný stav se zvukem, zastaralý výsledek
     a opakované číslo snímku se zahodí. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { OPS, OPS_ANIMS, OPS_GEOMETRY, animMs, type OpsVariantId } from '../../src/core/ops';
import { AUTO_EMOTES, emoteAllowed, emoteFor, emoteMsg, isAutoEmote, type AutoEmote } from '../../src/core/opsEmote';
import { OPS_PALETTE, PAINT_IDS, emoteKeepMask, recolorPixels } from '../../src/core/paints';
import { Animator } from '../../src/ops/animator';
import { createApp } from '../../src/store/app';
import { createOpsHub } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import { syntheticFindings } from '../vision/findings';

const root = fileURLToPath(new URL('../..', import.meta.url));
const SPEC: Record<AutoEmote, number[]> = {
  scan: [100, 100, 120, 120, 120, 120, 120, 100, 100],
  'scan-ok': [60, 70, 140, 70, 60],
  'scan-unsure': [70, 90, 180, 90, 70],
};
const png = (p: string) => PNG.sync.read(readFileSync(p));
const hex = (d: Uint8Array, i: number) => '#' + [d[i], d[i + 1], d[i + 2]].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

describe('0.20.1: manifest a assety emocí automatického snímku', () => {
  it('tři nové jednorázové stavy s časováním z návrhu; ruční scanning beze změny', () => {
    expect(OPS_ANIMS).toHaveLength(26);
    for (const e of AUTO_EMOTES) {
      expect(OPS_ANIMS).toContain(e);
      expect(OPS.states[e]).toEqual({ frameCount: SPEC[e].length, durationsMs: SPEC[e], loop: false, returnTo: 'idle' });
    }
    expect([animMs('scan'), animMs('scan-ok'), animMs('scan-unsure')]).toEqual([1000, 400, 500]);
    expect(OPS.states.scanning).toMatchObject({ frameCount: 24, loop: true });
    expect(animMs('scanning')).toBe(2160);
  });

  for (const variant of ['corner', 'detail'] as OpsVariantId[]) {
    it(`${variant}: každá podoba má všechny snímky viditelné, kotvy jako idle[0], PNG v aplikaci = návrh`, () => {
      const g = OPS_GEOMETRY[variant], W = g.frameSize.width;
      expect(W).toBe(variant === 'corner' ? 96 : 128);
      expect(Object.keys(g.forms)).toEqual(['rookie', 'explorer', 'scavenger', 'veteran', 'legend']);
      for (const [form, states] of Object.entries(g.forms)) {
        for (const e of AUTO_EMOTES) {
          const st = states[e];
          expect(st.file, `${form}/${e}`).toBe(`${variant}/bodies/${form}/${e}.png`);
          expect(st.frames).toHaveLength(SPEC[e].length);
          /* viditelné a s kotvami prvního snímku idle: šatník se při emoci nehne */
          expect(st.frames.every(f => f === states.idle.frames[0]), `${form}/${e}`).toBe(true);
          const app = join(root, 'src/assets/ops2', st.file), design = join(root, 'docs/design/buddy/bednak2', st.file);
          expect(existsSync(app), app).toBe(true);
          expect(readFileSync(app).equals(readFileSync(design)), st.file).toBe(true);
          const im = png(app);
          expect([im.width, im.height]).toEqual([W * SPEC[e].length, W]);
        }
      }
    });
  }

  it('aplikace nese jen to, co potřebuje: žádné 256px kopie, desky ani nástroje návrhu', () => {
    const list = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap(d => (d.isDirectory() ? list(join(dir, d.name)) : [join(dir, d.name)]));
    const files = list(join(root, 'src/assets/ops2')).map(f => f.slice(join(root, 'src/assets/ops2').length + 1).replace(/\\/g, '/'));
    expect(files.every(f => /^(corner|detail)\//.test(f) && f.endsWith('.png'))).toBe(true);
    expect(files.filter(f => /\/scan(-ok|-unsure)?\.png$/.test(f))).toHaveLength(30);
  });
});

describe('0.20.1: nátěry na emocích', () => {
  const palette = new Set(Object.values(OPS_PALETTE));
  for (const variant of ['corner', 'detail'] as OpsVariantId[]) {
    it(`${variant}: paleta, alfa 0/255, LED linka zůstane měděná a krajní snímky = idle i po nátěru`, () => {
      const g = OPS_GEOMETRY[variant], W = g.frameSize.width;
      const copper = OPS_PALETTE.copper;
      for (const [form, states] of Object.entries(g.forms)) {
        const idle = png(join(root, 'src/assets/ops2', states.idle.file));
        for (const e of AUTO_EMOTES) {
          const sh = png(join(root, 'src/assets/ops2', states[e].file));
          const bad = new Set<string>();
          for (let i = 0; i < sh.data.length; i += 4) {
            if (sh.data[i + 3] !== 0 && sh.data[i + 3] !== 255) bad.add('alfa ' + sh.data[i + 3]);
            else if (sh.data[i + 3] && !palette.has(hex(sh.data, i) as never)) bad.add(hex(sh.data, i));
          }
          expect([...bad], `${form}/${e}`).toEqual([]);
          const keep = emoteKeepMask(sh.data, sh.width, sh.height, idle.data, idle.width, W);
          const kept = keep.reduce((a, b) => a + b, 0);
          /* jen scan má měděnou linku; ok a unsure jsou jen apricot/panel */
          if (e === 'scan') expect(kept, `${form}`).toBeGreaterThan(0); else expect(kept).toBe(0);
          const notCopper = (d: Uint8Array) => { let n = 0; for (let p = 0; p < keep.length; p++) if (keep[p] && hex(d, p * 4) !== copper) n++; return n; };
          expect(notCopper(sh.data)).toBe(0);
          for (const paint of PAINT_IDS) {
            const a = Uint8Array.from(sh.data), b = Uint8Array.from(idle.data);
            recolorPixels(a, paint, keep);
            recolorPixels(b, paint);
            expect(notCopper(a), paint).toBe(0);
            /* první a poslední snímek je přesně idle[0] i po přebarvení */
            for (const k of [0, SPEC[e].length - 1]) {
              for (let y = 0; y < W; y++) {
                const row = Buffer.from(a.subarray((y * sh.width + k * W) * 4, (y * sh.width + k * W + W) * 4));
                const ref = Buffer.from(b.subarray((y * idle.width) * 4, (y * idle.width + W) * 4));
                if (!row.equals(ref)) throw new Error(`${variant}/${form}/${e}/${paint}: snímek ${k}, řádek ${y}`);
              }
            }
          }
        }
      }
    }, 60_000);
  }

  it('bez masky nátěr mění měď jako dřív (díly a plechy se chovají stejně)', () => {
    const d = Uint8Array.from([0xDE, 0x96, 0x6F, 255, 0xDE, 0x96, 0x6F, 255]);
    expect(recolorPixels(d, 'olive', Uint8Array.from([1, 0]))).toBe(1);
    expect(hex(d, 0)).toBe('#DE966F');
    expect(hex(d, 4)).toBe('#C9B27A');
  });
});

describe('0.20.1: událost → emoce a pravidla přehrávání', () => {
  it('výsledek automatického snímku → závěrečná emoce', () => {
    expect(emoteFor('loadout')).toBe('scan-ok');
    expect(emoteFor('result', 0)).toBe('scan-ok');
    expect(emoteFor('result', 2)).toBe('scan-unsure');
    expect(emoteFor('screen', 1)).toBe('scan-unsure');
    for (const o of ['off', 'empty', 'dup'] as const) expect(emoteFor(o)).toBeNull();
    expect(isAutoEmote('scanning')).toBe(false);
    expect(emoteMsg({ anim: 'scan-ok', id: 7 })).toEqual({ anim: 'scan-ok', id: 7 });
    for (const bad of [null, 'scan', { anim: 'success', id: 1 }, { anim: 'scan', id: 1.5 }, { anim: 'scan' }]) expect(emoteMsg(bad)).toBeNull();
  });

  it('jen nad klidem nebo jinou emocí; opakování se sloučí', () => {
    const g = { anim: 'idle' as const, transform: false, hidden: false, queued: false, reduced: false };
    for (const e of AUTO_EMOTES) expect(emoteAllowed(e, g)).toBe(true);
    for (const anim of ['sleep', 'wake-up', 'drag', 'walk', 'talk', 'scanning', 'thinking', 'carry', 'success', 'greet', 'appear', 'dismiss', 'level-up', 'inspect'] as const) {
      for (const e of AUTO_EMOTES) expect(emoteAllowed(e, { ...g, anim }), `${anim} → ${e}`).toBe(false);
    }
    expect(emoteAllowed('scan', { ...g, anim: 'scan' })).toBe(false);
    expect(emoteAllowed('scan-ok', { ...g, anim: 'scan' })).toBe(true);
    expect(emoteAllowed('scan-unsure', { ...g, anim: 'scan' })).toBe(true);
    expect(emoteAllowed('scan-ok', { ...g, anim: 'scan-ok' })).toBe(false);
    expect(emoteAllowed('scan', { ...g, anim: 'scan-ok' })).toBe(true);
    for (const k of ['transform', 'hidden', 'queued', 'reduced'] as const) expect(emoteAllowed('scan', { ...g, [k]: true })).toBe(false);
  });

  it('Animator: scan → scan-ok nahradí, po dohrání klid od snímku 0', () => {
    const a = new Animator();
    expect(a.emote('scan')).toBe(true);
    a.tick(220);
    expect([a.anim, a.frame]).toEqual(['scan', 2]);
    expect(a.emote('scan')).toBe(false);
    expect([a.anim, a.frame]).toEqual(['scan', 2]);
    expect(a.emote('scan-ok')).toBe(true);
    expect([a.anim, a.frame]).toEqual(['scan-ok', 0]);
    for (let t = 0; t < 400; t += 50) a.tick(50);
    expect([a.anim, a.frame]).toEqual(['idle', 0]);
    /* scan sám skončí po 1 s (čtení trvá déle = čeká v klidu, nesmyčkuje) */
    a.emote('scan');
    for (let t = 0; t < 1000; t += 100) a.tick(100);
    expect([a.anim, a.frame]).toEqual(['idle', 0]);
    expect(a.emote('scan-unsure')).toBe(true);
    for (let t = 0; t < 500; t += 100) a.tick(100);
    expect(a.anim).toBe('idle');
  });

  it('Animator: spící, tažený, mluvící nebo skrytý Ops se nebudí a nic se nefrontuje', () => {
    const a = new Animator();
    a.play('sleep');
    expect(a.emote('scan')).toBe(false);
    expect(a.anim).toBe('sleep');
    a.play('drag');
    expect(a.emote('scan-ok')).toBe(false);
    expect(a.anim).toBe('drag');
    a.play('scanning');
    expect(a.emote('scan')).toBe(false);
    a.play('dismiss');
    for (let t = 0; t < 3000; t += 100) a.tick(100);
    expect(a.hidden()).toBe(true);
    expect(a.emote('scan')).toBe(false);
    expect(a.hidden()).toBe(true);
    const b = new Animator();
    b.reduced = true;
    expect(b.emote('scan')).toBe(false);
    expect(b.emote('scan-ok')).toBe(false);
    expect(b.anim).toBe('idle');
    const c = new Animator();
    c.play('wake-up'); c.then('success');
    expect(c.emote('scan')).toBe(false);
    expect(c.queue).toEqual(['success']);
    /* spánek vyhraje i nad běžící emocí (BuddyApp přepne do sleep) */
    const d = new Animator();
    d.emote('scan');
    d.setRest('idle'); d.play('sleep');
    expect(d.anim).toBe('sleep');
    expect(d.emote('scan-ok')).toBe(false);
  });
});

/* ----- hub ----- */
const T0 = Date.UTC(2026, 10, 13, 18, 0);
async function makeApp() {
  const box = { content: null as string | null };
  const storage = {
    kind: 'browser' as const,
    load: async () => ({ content: box.content, source: box.content ? 'state' as const : 'none' as const, warning: null }),
    save: async (c: string) => { box.content = c; },
    createSnapshot: async () => undefined,
    listSnapshots: async () => [], readSnapshot: async () => '', deleteSnapshot: async () => undefined, saveImportRaw: async () => undefined,
    exportBackup: async () => true, importBackup: async () => null, dataDir: async () => '', openDataDir: async () => undefined, openExternal: async () => undefined,
  } as unknown as Parameters<typeof createApp>[0];
  const app = createApp(storage, { debounceMs: 0, weekCheckMs: 0, now: () => T0 });
  await app.init();
  return app;
}
function fakeNative(): Native {
  const ok = async () => undefined;
  return {
    available: true, enable: ok, setHotkey: ok, watch: ok, buddyOpen: ok, buddyClose: ok, buddyReveal: ok, overlayOpen: ok, overlayClose: ok, overlayToggle: ok,
    mainFocus: ok, captureNow: ok, place: ok, drag: ok, widgetsOpen: ok, widgetsClose: ok, widgetsEdit: ok, widgetsFit: ok, widgetsApp: ok, captureTake: async () => new ArrayBuffer(0), autoCapture: ok, autoStats: async () => null,
  };
}
const LOADOUT = () => syntheticFindings({ skip: [0, 1, 2, 3, 4, 5, 6] });

describe('0.20.1: hub posílá tiché emoce', () => {
  async function setup() {
    const app = await makeApp();
    app.actions.setBuddy({ enabled: true });
    const buses = memoryBuses();
    const main = buses('main'), buddy = buses('buddy');
    const got: unknown[] = [];
    buddy.on('emote', (p, from) => got.push({ ...(p as object), from }));
    const hub = createOpsHub({ app, bus: main, native: fakeNative(), now: () => T0, pushMs: 0 });
    const local: string[] = [];
    hub.onEmote(e => local.push(e.anim));
    hub.start();
    await hub.idle();
    return { app, hub, main, got, local };
  }
  const emotes = (main: ReturnType<ReturnType<typeof memoryBuses>>) => main.sent.filter(m => m.type === 'emote').map(m => `${m.to}:${(m.payload as { anim: string }).anim}`);
  const statuses = (main: ReturnType<ReturnType<typeof memoryBuses>>) => main.sent.filter(m => m.type === 'status');

  it('vypnuté, pozastavené nebo hlavním vypínačem vypnuté snímání = žádná emoce', async () => {
    const { app, hub, main, local } = await setup();
    expect(await hub.handleAutoCapture(LOADOUT(), 'loadout')).toBe('off');
    app.actions.setAutoCapture({ ack: true, enabled: true, paused: true });
    expect(await hub.handleAutoCapture(LOADOUT(), 'loadout')).toBe('off');
    app.actions.setAutoCapture({ paused: false });
    app.actions.setGameLinkOff(true);
    expect(app.store.getState().state.gameLink.off).toBe(true);
    expect(await hub.handleAutoCapture(LOADOUT(), 'loadout')).toBe('off');
    expect(emotes(main)).toEqual([]);
    expect(local).toEqual([]);
    hub.stop();
  });

  it('loadout: scan, pak scan-ok; výsledek s údaji ke kontrole: scan-unsure. Bez zvuku a hlášky, jen od hlavního okna', async () => {
    const { app, hub, main, got, local } = await setup();
    app.actions.setAutoCapture({ ack: true, enabled: true });
    const before = statuses(main).length;
    expect(await hub.handleAutoCapture(LOADOUT(), 'loadout', 41)).toBe('loadout');
    expect(await hub.handleAutoCapture(syntheticFindings(), 'findings', 42)).toBe('result');
    expect(app.store.getState().state.review.length).toBeGreaterThan(0);
    expect(got).toEqual([
      { anim: 'scan', id: 41, from: 'main' }, { anim: 'scan-ok', id: 41, from: 'main' },
      { anim: 'scan', id: 42, from: 'main' }, { anim: 'scan-unsure', id: 42, from: 'main' },
    ]);
    expect(local).toEqual(['scan', 'scan-ok', 'scan', 'scan-unsure']);
    /* žádný stav (ten nese zvuk a hlášku) */
    expect(statuses(main).length).toBe(before);
    /* opakovaný výsledek: scan, ale žádná výsledná emoce */
    expect(await hub.handleAutoCapture(syntheticFindings(), 'findings', 43)).toBe('dup');
    expect(local.slice(4)).toEqual(['scan']);
    /* stejné číslo snímku podruhé (opakovaná událost) nic nepřehraje */
    expect(await hub.handleAutoCapture(LOADOUT(), 'loadout', 44)).toBe('loadout');
    expect(local.slice(5)).toEqual(['scan', 'scan-ok']);
    expect(await hub.handleAutoCapture(LOADOUT(), 'loadout', 44)).toBe('loadout');
    expect(local.slice(7)).toEqual([]);
    hub.stop();
  });

  it('překrývající se snímky se sloučí: výsledek staršího snímku se zahodí', async () => {
    const { app, hub, local } = await setup();
    app.actions.setAutoCapture({ ack: true, enabled: true });
    const a = hub.handleAutoCapture(LOADOUT(), 'loadout', 7);
    const b = hub.handleAutoCapture(LOADOUT(), 'loadout', 8);
    await Promise.all([a, b]);
    expect(local).toEqual(['scan', 'scan', 'scan-ok']);
    hub.stop();
  });

  it('pozastavení během čtení: výsledná emoce se už nepošle', async () => {
    const { app, hub, local } = await setup();
    app.actions.setAutoCapture({ ack: true, enabled: true });
    const p = hub.handleAutoCapture(LOADOUT(), 'loadout', 9);
    app.actions.setAutoCapture({ paused: true });
    expect(await p).toBe('loadout');
    expect(local).toEqual(['scan']);
    hub.stop();
  });
});
