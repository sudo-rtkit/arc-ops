/* Hub buddyho pro hlavní okno (jediná instance). Spouští ho main.tsx; Nastavení přes něj mění zkratku. */
import { app, navigate, setGameFront } from '../store';
import { createBus } from './bus';
import { createNative } from './native';
import { DISMISS_MS, createOpsHub } from './hub';
import { isTauri } from '../storage/tauri';
import { createSoundPlayer } from './sound';
import { setHost } from '../shell/host';
import { autoActive, isRustScreen } from '../core/autoCapture';
import { createAiController } from './aiHub';
import { createAiNative } from '../shell/aiNative';
import { setAiHook } from '../store/aiHook';
import { createUpdateController } from './updateHub';
import { createUpdateNative } from '../shell/updateNative';
import { createClothingNotices } from '../core/clothingNotice';

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
/* 0.23.0: režim nízké zátěže: derive ví, jestli je hra v popředí (rádce se pak přepočítává méně často) */
hub.onFront(setGameFront);
if (!isTauri() && typeof window !== 'undefined') (window as unknown as { __opsSound?: unknown }).__opsSound = mainSound;
/* 0.16.0: moduly hrají zvuk přes hostitele (shell/host.ts); v hlavním okně je to mainSound */
setHost({ kind: 'main', play: id => { mainSound.play(id); }, openInApp: route => { const [m, sub] = route.split('/'); navigate(m, sub); } });

/* 0.30.0: AI asistent Ops. Jediná obsluha dotazů (jen hlavní okno volá Rust); otázky z panelu, karty předmětu,
   tlačítka „Proč?“ i z overlaye (relay) přijdou jako akce store aiAsk. Overlay dostane pohled s kopií stavu. */
export const ai = createAiController({
  app, native: createAiNative(),
  port: { say: (anim, l) => hub.aiSay(anim, l), game: () => hub.gameInfo(), push: () => hub.pushAi() },
});
hub.setAiViewSource(() => ai.view());
setAiHook((a, origin) => { void ai.ask(a, origin); });

/* 0.33.0: kontrola nové verze (výchozí stav vypnuto; síť jen v Rustu, pevná adresa api.github.com). Jediná obsluha
   v hlavním okně; automatická kontrola počká, když je hra v popředí. Spouští ji main.tsx spolu s hubem. */
export const updates = createUpdateController({
  app, native: createUpdateNative(),
  port: { say: (anim, l) => hub.noteSay(anim, l), game: () => hub.gameInfo() },
});

/* 0.34.0: nově odemčená sada oblečení: Ops o ní jednou krátce řekne (nevyžádaná hláška: dialogy zapnuté, mimo raid,
   hra ne v popředí; jinak počká). Když hra odejde z popředí, zkusí se to znovu. */
export const clothingNotices = createClothingNotices(app, { say: l => hub.noteSay('talk', l), game: () => hub.gameInfo() });
hub.onFront(() => clothingNotices.poke());
