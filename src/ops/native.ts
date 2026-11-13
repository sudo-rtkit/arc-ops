/* Volání Rust modulu src-tauri/src/ops.rs. Mimo Tauri (vývoj v prohlížeči, E2E) nic nedělají:
   v prohlížeči se obrazovka nesnímá a žádná zkratka se neregistruje. */
import { isTauri } from '../storage/tauri';

export interface Native {
  available: boolean;
  enable(on: boolean): Promise<void>;
  /* prázdný text zkratku zruší; chyba je kód hotkey:invalid / hotkey:taken / hotkey:off.
     0.22.0: slot = zkratka snímku (výchozí), Úprav widgetů (edit) nebo Skrýt / zobrazit widgety (hide) */
  setHotkey(accel: string, slot?: HotkeySlot): Promise<void>;
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
  /* 0.16.1: velikost a poloha vlastního okna (buddy, overlay) ve fyzických px; Rust změní jen volající okno */
  place(r: { x: number; y: number; w: number; h: number }): Promise<void>;
  /* 0.16.1: tažení vlastního okna buddyho */
  drag(): Promise<void>;
  /* 0.20.0: automatické snímání mimo raid (jen hlavní okno; screens = maska obrazovek pro Rust) a jeho měření */
  autoCapture(on: boolean, screens: number): Promise<void>;
  autoStats(): Promise<AutoStats | null>;
  /* 0.22.0: okno widgetů nad hrou (otevřít a zavřít jen hlavní okno), Úpravy (true / false / přepnout), okno přes
     monitor hry po změně rozlišení (jen okno widgetů) a panel Aplikace z Úprav (jen okno widgetů) */
  widgetsOpen(): Promise<void>;
  widgetsClose(): Promise<void>;
  widgetsEdit(on?: boolean): Promise<void>;
  widgetsFit(): Promise<void>;
  widgetsApp(tab?: string): Promise<void>;
}
export type HotkeySlot = 'capture' | 'edit' | 'hide';
/* Měření automatického snímání z Rustu (doba kroku v µs na hodinách, velikost pásu v B). */
export interface AutoStats { ticks: number; totalUs: number; maxUs: number; lastUs: number; stripBytes: number; captures: number; screen: string | null }

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
};

const tauriNative: Native = {
  available: true,
  enable: on => call('ops_enable', { on }),
  setHotkey: (accel, slot) => call('ops_hotkey', { accel, slot: slot ?? null }),
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
  place: r => call('win_place', { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }),
  drag: () => call('win_drag'),
  autoCapture: (on, screens) => call('ops_autocapture', { on, screens }),
  autoStats: () => call<AutoStats>('ops_autostats'),
  widgetsOpen: () => call('widgets_open'),
  widgetsClose: () => call('widgets_close'),
  widgetsEdit: on => call('widgets_edit', { on: on ?? null }),
  widgetsFit: () => call('widgets_fit'),
  widgetsApp: tab => call('widgets_app', { tab: tab ?? null }),
};

const none = async () => undefined;
export const browserNative: Native = {
  available: false,
  enable: none, setHotkey: none, watch: none, buddyOpen: none, buddyClose: none, buddyReveal: none,
  overlayOpen: none, overlayClose: none, overlayToggle: none, mainFocus: none, captureNow: none, place: none, drag: none,
  captureTake: async () => { throw new Error('capture:unsupported'); },
  autoCapture: none, autoStats: async () => null,
  widgetsOpen: none, widgetsClose: none, widgetsEdit: none, widgetsFit: none, widgetsApp: none,
};

export const createNative = (): Native => (isTauri() ? tauriNative : browserNative);

/* Jak se aplikace spustila (0.8.0): běžela při startu hra, takže je okno na pozadí? Mimo Tauri vždy ne. */
export interface LaunchInfo { gameRunning: boolean }
export const launchInfo = async (): Promise<LaunchInfo> => {
  if (!isTauri()) return { gameRunning: false };
  try { return await call<LaunchInfo>('launch_info'); } catch { return { gameRunning: false }; }
};
