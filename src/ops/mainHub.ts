/* Hub buddyho pro hlavní okno (jediná instance). Spouští ho main.tsx; Nastavení přes něj mění zkratku. */
import { app, navigate } from '../store';
import { createBus } from './bus';
import { createNative } from './native';
import { createOpsHub } from './hub';
import { isTauri } from '../storage/tauri';

export const native = createNative();
export const hub = createOpsHub({
  app, bus: createBus('main'), native,
  navigate: route => { const [m, sub] = route.split('/'); navigate(m, sub); },
});

/* Jen ve vývoji v prohlížeči (E2E): obrazová data z testu projdou stejnou cestou jako snímek ze zkratky.
   V Tauri tato cesta neexistuje, snímek dodává jen Rust. */
if (!isTauri() && typeof window !== 'undefined') {
  (window as unknown as { __opsTest?: unknown }).__opsTest = {
    capture: (width: number, height: number, data: ArrayLike<number>) => hub.handleCapture({ width, height, data: Uint8Array.from(data) }),
  };
}
