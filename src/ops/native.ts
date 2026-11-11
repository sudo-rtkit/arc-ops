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
  enable: none, setHotkey: none, watch: none, buddyOpen: none, buddyClose: none,
  overlayOpen: none, overlayClose: none, overlayToggle: none, mainFocus: none, captureNow: none,
  captureTake: async () => { throw new Error('capture:unsupported'); },
};

export const createNative = (): Native => (isTauri() ? tauriNative : browserNative);
