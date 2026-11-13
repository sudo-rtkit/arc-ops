/* Hub buddyho pro hlavní okno (jediná instance). Spouští ho main.tsx; Nastavení přes něj mění zkratku. */
import { app, navigate } from '../store';
import { createBus } from './bus';
import { createNative } from './native';
import { DISMISS_MS, createOpsHub } from './hub';
import { isTauri } from '../storage/tauri';
import { createSoundPlayer } from './sound';
import { setHost } from '../shell/host';
import { autoActive, isRustScreen } from '../core/autoCapture';

export const native = createNative();
export const hub = createOpsHub({
  app, bus: createBus('main'), native,
  navigate: route => { const [m, sub] = route.split('/'); navigate(m, sub); },
  appFocused: () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus(),
  dismissMs: DISMISS_MS,
});

/* Jen ve vývoji v prohlížeči (E2E): obrazová data z testu projdou stejnou cestou jako snímek ze zkratky.
   V Tauri tato cesta neexistuje, snímek dodává jen Rust. */
if (!isTauri() && typeof window !== 'undefined') {
  (window as unknown as { __opsTest?: unknown }).__opsTest = {
    capture: (width: number, height: number, data: ArrayLike<number>) => hub.handleCapture({ width, height, data: Uint8Array.from(data) }),
    /* 0.20.0: automatický snímek s obrazovkou podle nadpisu (jako capture-ready s auto z Rustu) a změna obrazovky
       v pásu s nadpisy (auto-screen); jen v prohlížeči, jen když je snímání zapnuté */
    autoCapture: (width: number, height: number, data: ArrayLike<number>, screen: string) =>
      isRustScreen(screen) ? hub.handleAutoCapture({ width, height, data: Uint8Array.from(data) }, screen) : Promise.resolve('empty'),
    autoScreen: (screen: string | null, at?: number) => { if ((screen === null || isRustScreen(screen)) && autoActive(app.store.getState().state)) app.actions.lifeEvent({ type: 'screen', at: at ?? Date.now(), screen }); },
  };
}

/* 0.10.0: zvuky hlavního okna (plný i kompaktní režim). Hraje jen s fokusem okna (hráč ho používá); jinak hraje
   overlay nebo buddy, nebo nikdo (hra v popředí). */
export const mainSound = createSoundPlayer(() => {
  const p = app.store.getState().state.opsPrefs;
  return {
    on: p.sound, volume: p.volume, overlayOpen: false, buddyTouchAt: 0, gameForeground: false,
    appFocused: typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus(),
  };
});
hub.onStatus(s => { if (s.sound && s.sound !== 'beep') mainSound.play(s.sound); });
hub.onLevel(() => { mainSound.play('levelup'); });
if (!isTauri() && typeof window !== 'undefined') (window as unknown as { __opsSound?: unknown }).__opsSound = mainSound;
/* 0.16.0: moduly hrají zvuk přes hostitele (shell/host.ts); v hlavním okně je to mainSound */
setHost({ kind: 'main', play: id => { mainSound.play(id); }, openInApp: route => { const [m, sub] = route.split('/'); navigate(m, sub); } });
