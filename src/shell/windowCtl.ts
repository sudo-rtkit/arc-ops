/* Ovládání hlavního okna (0.9.0): plný a kompaktní režim, připnutí, křížek a nabídka oznamovací oblasti.
   Okno přestavuje Rust (src-tauri/src/mainwin.rs), stav a pravidla drží store (core/mainWindow.ts).
   Mimo Tauri (vývoj v prohlížeči, E2E) se mění jen stav a rozhraní; nativní volání nic nedělají.
   Žádná akce tady nebere hře fokus: přepnutí režimu ani změna dat okno neaktivují. */
import { app, navigate } from '../store';
import { useUi } from '../store/ui';
import { isTauri } from '../storage/tauri';
import { createBus } from '../ops/bus';
import { hub } from '../ops/mainHub';
import type { LeftGeometry } from '../core/mainWindow';
import { browserWin, createWindowCtl, type TrayMenu, type WinNative } from './windowCore';
import { t } from '../i18n';
import { autoIndicator } from '../core/autoCapture';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
};

const tauriWin: WinNative = {
  available: true,
  mode: args => call<LeftGeometry>('main_mode', { args }),
  pin: on => call('main_pin', { on }),
  geometry: () => call<LeftGeometry>('main_geometry'),
  drag: () => call('main_drag'),
  minimize: () => call('main_minimize'),
  hide: () => call('main_hide'),
  show: () => call('main_show'),
  ready: () => call('main_ready'),
  quit: () => call('app_quit'),
  traySync: menu => call('tray_sync', { menu }),
};

/* ----- instance hlavního okna ----- */
const winLog: string[] = [];
export const winNative: WinNative = isTauri() ? tauriWin : browserWin(winLog);
export const windowCtl = createWindowCtl({
  win: winNative,
  prefs: () => app.store.getState().state.mainWindow,
  save: p => app.actions.setMainWindow(p),
  flush: () => app.flush(),
  askClose: open => useUi.setState({ closeAsk: open }),
});
if (!isTauri() && typeof window !== 'undefined') (window as unknown as { __winTest?: unknown }).__winTest = { log: winLog };

/* Expand z kompaktu na konkrétní místo plné aplikace (Zápis raidu, Úklid stashe, Nastavit profil …). */
export async function expandTo(module: string, sub?: string, then?: () => void): Promise<void> {
  navigate(module, sub);
  await windowCtl.setMode('full');
  then?.();
}

const trayMenu = (): TrayMenu => {
  const s = app.store.getState().state, b = s.buddy, auto = autoIndicator(s);
  return {
    open: t('tray.open'), compact: t('tray.compact'), buddyLabel: t('tray.buddy'), buddy: b.enabled ? hub.buddyVisible() : null,
    autoLabel: t('tray.auto'), auto: auto === null ? null : auto === 'on', quit: t('tray.quit'),
    tooltip: 'ARC Raiders Companion' + (auto === 'on' ? ' · ' + t('auto.chip.on') : ''),
  };
};

/* Spouští main.tsx: posluchače událostí z Rustu, sladění okna s uloženým stavem a nabídka oznamovací oblasti. */
export function startWindowCtl(): void {
  const bus = createBus('main');
  /* 0.16.1: jen z Rustu (native:), jiné okno je podvrhnout nemůže */
  bus.onNative('win-close', () => { void windowCtl.requestClose(true); });
  bus.onNative('win-tray', p => {
    if (p === 'full' || p === 'compact') void windowCtl.setMode(p);
    else if (p === 'buddy') hub.setBuddyVisible(!hub.buddyVisible());
    /* 0.20.0: pozastavit / pokračovat v automatickém snímání (místní přepínač, žádná globální zkratka) */
    else if (p === 'auto') { const a = app.store.getState().state.autoCapture; if (a.enabled) app.actions.setAutoCapture({ paused: !a.paused }); }
    else if (p === 'quit') void windowCtl.quit();
  });
  let lastTray = '';
  const syncTray = () => {
    if (!app.store.getState().ready) return;
    const m = trayMenu(), sig = JSON.stringify(m);
    if (sig === lastTray) return;
    lastTray = sig;
    void winNative.traySync(m).catch(() => undefined);
  };
  let started = false;
  const onReady = async () => {
    if (started) return;
    started = true;
    await bus.ready();
    /* okno vzniklo podle state.json; po obnově ze zálohy (.bak) může stav říkat jiný režim, tak ho sladit */
    const p = app.store.getState().state.mainWindow;
    try { await winNative.mode({ mode: p.mode, pin: p.pin, full: p.full, fullMax: p.fullMax, compact: p.compact }); } catch { /* nevadí */ }
    await winNative.ready().catch(() => undefined);
    syncTray();
  };
  app.store.subscribe(s => { if (s.ready) { void onReady(); syncTray(); } });
  hub.onVisibility(syncTray);
  if (app.store.getState().ready) void onReady();
}
