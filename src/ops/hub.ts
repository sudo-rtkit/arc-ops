/* Hub buddyho v hlavním okně (milník 5). Jediné místo, které mění stav: okna buddy a overlay dostávají kopii
   a posílají sem pojmenované akce, které projdou stejnými akcemi store jako v hlavním okně.
   - Přepínač „Buddy a zkratka“ promítá do Rustu: vypnuto = žádné okno, žádná zkratka, žádné hlídání hry.
   - Snímek ze zkratky se tu přečte (readCapture) a obrazová data se hned zahodí; drží se jen ScreenRead
     v dávce v paměti. Prázdný snímek (bez inventáře) nic nezapíše.
   Bez Reactu a bez DOM, takže jde testovat v Node se zástupným bus a native. */
import type { App } from '../store/app';
import type { AppState } from '../core/types';
import type { ScreenRead } from '../core/vision/read';
import type { RgbaImage } from '../core/vision/image';
import { readCapture } from '../core/opsCapture';
import { analyzeShots, type VisionApply, type VisionSummary } from '../core/visionImport';
import { matchContext } from '../core/catalog';
import { getMaterials } from '../core/gamedata';
import { levelEvent, resolveOutfit, type LevelEvent, type OpsAnim } from '../core/ops';
import { msg, t, type Lang, type MsgRef } from '../i18n';
import type { Bus } from './bus';
import type { Native } from './native';

export interface Shot { id: number; at: number; read: ScreenRead }
export interface BatchView { shots: Shot[]; emptyAt: number; failed: string }
export interface BuddyView {
  lang: Lang; level: number; outfit: Record<string, string | null>; scale: 1 | 2;
  positions: Record<string, { x: number; y: number }>; monitor: string; hotkey: string;
}
export interface OverlayView { state: AppState; batch: BatchView; savedAt: number; hotkey: string }
export interface BuddyStatus { anim: OpsAnim; msg: MsgRef | null }

/* Nejvýš tolik stránek stashe v jedné dávce. */
export const BATCH_MAX = 12;

export interface HubOptions { app: App; bus: Bus; native: Native; now?: () => number; pushMs?: number; navigate?: (route: string) => void }

export function createOpsHub({ app, bus, native, now = Date.now, pushMs = 120, navigate }: HubOptions) {
  const st = () => app.store.getState().state;
  let batch: BatchView = { shots: [], emptyAt: 0, failed: '' };
  let nextShot = 1;
  let applied: { enabled: boolean; autoOpen: boolean } = { enabled: false, autoOpen: false };
  let prevLevel: number | null = null;
  let lastBuddy = '';
  let overlayKnown = false;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let gameRunning = false;
  const offs: (() => void)[] = [];

  /* Nativní volání jdou za sebou, aby se zapnutí a vypnutí nepředběhla. */
  let queue: Promise<unknown> = Promise.resolve();
  const run = (fn: () => Promise<unknown>) => { queue = queue.then(fn).catch(() => undefined); return queue; };

  /* ----- kopie stavu pro okna ----- */
  const buddyView = (s: AppState): BuddyView => ({
    lang: s.settings.lang, level: s.profile.level, outfit: resolveOutfit(s.profile.level, s.buddy), scale: s.buddy.scale,
    positions: s.buddy.positions, monitor: s.buddy.monitor, hotkey: s.buddy.hotkey,
  });
  const overlayView = (): OverlayView => ({ state: st(), batch, savedAt: app.store.getState().lastSavedAt, hotkey: st().buddy.hotkey });
  const pushBuddy = (force = false) => {
    const v = buddyView(st()), sig = JSON.stringify(v);
    if (!force && sig === lastBuddy) return;
    lastBuddy = sig;
    bus.send('buddy', 'view', v);
  };
  const pushOverlay = (now = false) => {
    if (!overlayKnown) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    if (now || pushMs <= 0) { bus.send('overlay', 'state', overlayView()); return; }
    pushTimer = setTimeout(() => { pushTimer = null; bus.send('overlay', 'state', overlayView()); }, pushMs);
  };
  const status = (anim: OpsAnim, m: MsgRef | null = null) => bus.send('buddy', 'status', { anim, msg: m } satisfies BuddyStatus);

  /* ----- přepínač a okna ----- */
  function syncNative(s: AppState) {
    const b = s.buddy;
    if (b.enabled !== applied.enabled) {
      applied = { enabled: b.enabled, autoOpen: b.autoOpen };
      if (b.enabled) {
        const hotkey = b.hotkey, auto = b.autoOpen;
        run(async () => {
          await native.enable(true);
          if (hotkey) await native.setHotkey(hotkey).catch(() => app.notify(t('ops.hotkey.lost'), 'warning'));
          if (auto) await native.watch(true); else await native.buddyOpen();
        });
      } else {
        clearBatch();
        overlayKnown = false;
        run(() => native.enable(false));
      }
      return;
    }
    if (b.enabled && b.autoOpen !== applied.autoOpen) {
      applied.autoOpen = b.autoOpen;
      const auto = b.autoOpen;
      run(async () => {
        await native.watch(auto);
        if (!auto) await native.buddyOpen();
        else if (!gameRunning) await native.buddyClose();
      });
    }
  }

  /* ----- zkratka (volá ji Nastavení): uloží se jen ta, kterou systém přijal ----- */
  async function setHotkey(accel: string): Promise<string | null> {
    try {
      await run(async () => undefined);
      await native.setHotkey(accel);
      app.actions.setBuddy({ hotkey: accel });
      return null;
    } catch (e) {
      const code = String((e as Error)?.message || e);
      return /^hotkey:(invalid|taken|off)$/.test(code) ? code : 'hotkey:taken';
    }
  }

  /* ----- snímek ----- */
  function clearBatch() { batch = { shots: [], emptyAt: 0, failed: '' }; }

  /* Přečte snímek a zahodí obrazová data. Nic nezapisuje do stavu ani do úložiště. */
  function handleCapture(img: RgbaImage): 'empty' | 'read' {
    const r = readCapture(img);
    if (r.kind === 'empty') {
      batch = { ...batch, emptyAt: now(), failed: '' };
      status('unsure', msg('ops.msg.nothing'));
      pushOverlay(true);
      return 'empty';
    }
    const shots = [...batch.shots, { id: nextShot++, at: now(), read: r.read }].slice(-BATCH_MAX);
    batch = { shots, emptyAt: 0, failed: '' };
    const s = st();
    const mats = getMaterials(s).map(m => m.name);
    const a = analyzeShots(shots.map(x => x.read), s.vision.learned, matchContext(mats, [...new Set(Object.values(s.items).map(x => x.name))]));
    const check = a.groups.filter(g => g.match.status !== 'known' || !g.countSure).length;
    if (check) status('unsure', msg('ops.msg.check', { count: check, pages: shots.length }));
    else status('done', msg('ops.msg.read', { count: a.groups.length, pages: shots.length }));
    pushOverlay(true);
    return 'read';
  }

  async function takeCapture(p: { id: number; width: number; height: number }) {
    let buf: ArrayBuffer | null = null;
    try { buf = await native.captureTake(p.id); } catch { status('alert', msg('ops.msg.failed')); return; }
    let data: Uint8Array | null = new Uint8Array(buf);
    buf = null;
    try { handleCapture({ width: p.width, height: p.height, data }); }
    finally { data = null; }
  }

  async function importShots(input: VisionApply): Promise<VisionSummary | null> {
    const sum = await app.actions.importFromScreens(input);
    if (sum) { clearBatch(); status('done', msg('ops.msg.written', { count: sum.materials + sum.items })); }
    bus.send('overlay', 'imported', { summary: sum });
    pushOverlay(true);
    return sum;
  }

  /* ----- start ----- */
  function start() {
    const onState = (s: AppState) => {
      syncNative(s);
      if (!s.buddy.enabled) return;
      pushBuddy();
      pushOverlay();
      if (prevLevel !== null && s.profile.level !== prevLevel) {
        const ev: LevelEvent | null = levelEvent(prevLevel, s.profile.level);
        if (ev) bus.send('buddy', 'event', ev);
      }
      prevLevel = s.profile.level;
    };
    let last: AppState | null = null;
    offs.push(app.store.subscribe(x => { if (x.ready && x.state !== last) { last = x.state; onState(x.state); } }));
    if (app.store.getState().ready) { last = st(); onState(st()); }

    offs.push(bus.on('hello', p => {
      const from = (p as { from?: string } | null)?.from;
      if (!st().buddy.enabled) return;
      if (from === 'buddy') pushBuddy(true);
      if (from === 'overlay') { overlayKnown = true; pushOverlay(true); }
    }));
    offs.push(bus.on('import', p => { const input = (p as { input?: VisionApply } | null)?.input; if (input && Array.isArray(input.rows)) void importShots(input); }));
    offs.push(bus.on('questSet', p => {
      const q = p as { id?: unknown; done?: unknown } | null;
      if (q && typeof q.id === 'string' && typeof q.done === 'boolean') app.actions.questSet(q.id, q.done);
    }));
    offs.push(bus.on('opacity', p => { const v = Number((p as { value?: unknown } | null)?.value); if (Number.isFinite(v)) app.actions.setBuddy({ opacity: v }); }));
    offs.push(bus.on('batchClear', () => { clearBatch(); pushOverlay(true); }));
    offs.push(bus.on('moved', p => {
      const m = p as { monitor?: unknown; x?: unknown; y?: unknown } | null;
      if (m && typeof m.monitor === 'string' && Number.isFinite(m.x) && Number.isFinite(m.y)) app.actions.setBuddyPosition(m.monitor, Number(m.x), Number(m.y));
    }));
    offs.push(bus.on('open', p => {
      const route = (p as { route?: unknown } | null)?.route;
      if (typeof route === 'string' && /^[a-z]+(\/[a-z-]+)?$/.test(route)) { navigate?.(route); void native.mainFocus(); }
    }));
    /* události z Rustu */
    offs.push(bus.on('capture-start', () => status('scanning')));
    offs.push(bus.on('capture-ready', p => { const c = p as { id: number; width: number; height: number }; if (c && Number.isFinite(c.id)) void takeCapture(c); }));
    offs.push(bus.on('capture-failed', () => { batch = { ...batch, failed: 'capture' }; status('alert', msg('ops.msg.failed')); pushOverlay(true); }));
    offs.push(bus.on('game', p => {
      gameRunning = p === true;
      const b = st().buddy;
      if (!b.enabled || !b.autoOpen) return;
      run(() => (gameRunning ? native.buddyOpen() : native.buddyClose()));
    }));
  }

  function stop() { offs.splice(0).forEach(f => f()); if (pushTimer) clearTimeout(pushTimer); }

  return { start, stop, setHotkey, handleCapture, importShots, batch: () => batch, idle: () => queue };
}
export type OpsHub = ReturnType<typeof createOpsHub>;
