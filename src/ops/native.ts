/* Volání Rust modulu src-tauri/src/ops.rs. Mimo Tauri (vývoj v prohlížeči, E2E) nic nedělají:
   v prohlížeči se obrazovka nesnímá a žádná zkratka se neregistruje. */
import { isTauri } from '../storage/tauri';

export interface Native {
  available: boolean;
  enable(on: boolean): Promise<void>;
  /* prázdný text zkratku zruší; chyba je kód hotkey:invalid / hotkey:taken / hotkey:off */
  setHotkey(accel: string): Promise<void>;
  watch(on: boolean): Promise<void>;
  buddyOpen(): Promise<void>;
  buddyClose(): Promise<void>;
  /* 0.13.1: okno buddyho se poprvé ukáže bez aktivace (volá ho jen buddy); nevezme fokus hře ani hlavnímu oknu */
  buddyReveal(): Promise<void>;
  overlayOpen(tab?: string): Promise<void>;
  overlayClose(): Promise<void>;
  overlayToggle(): Promise<void>;
  mainFocus(): Promise<void>;
  captureNow(): Promise<void>;
  captureTake(id: number): Promise<ArrayBuffer>;
}

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
};

const tauriNative: Native = {
  available: true,
  enable: on => call('ops_enable', { on }),
  setHotkey: accel => call('ops_hotkey', { accel }),
  watch: on => call('ops_watch', { on }),
  buddyOpen: () => call('buddy_open'),
  buddyClose: () => call('buddy_close'),
  buddyReveal: () => call('buddy_reveal'),
  overlayOpen: tab => call('overlay_open', { tab: tab ?? null }),
  overlayClose: () => call('overlay_close'),
  overlayToggle: () => call('overlay_toggle'),
  mainFocus: () => call('main_focus'),
  captureNow: () => call('capture_now'),
  captureTake: id => call<ArrayBuffer>('capture_take', { id }),
};

const none = async () => undefined;
export const browserNative: Native = {
  available: false,
  enable: none, setHotkey: none, watch: none, buddyOpen: none, buddyClose: none, buddyReveal: none,
  overlayOpen: none, overlayClose: none, overlayToggle: none, mainFocus: none, captureNow: none,
  captureTake: async () => { throw new Error('capture:unsupported'); },
};

export const createNative = (): Native => (isTauri() ? tauriNative : browserNative);

/* Jak se aplikace spustila (0.8.0): běžela při startu hra, takže je okno na pozadí? Mimo Tauri vždy ne. */
export interface LaunchInfo { gameRunning: boolean }
export const launchInfo = async (): Promise<LaunchInfo> => {
  if (!isTauri()) return { gameRunning: false };
  try { return await call<LaunchInfo>('launch_info'); } catch { return { gameRunning: false }; }
};
