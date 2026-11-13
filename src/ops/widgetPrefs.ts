/* 0.22.0: rozložení widgetů patří tomuto počítači (jako velikost panelu Aplikace v ovPanel.ts). Leží jen v místním
   úložišti webview (localStorage, místní data aplikace), ne ve stavu aplikace: nejdou do zálohy, import ani obnova
   zálohy je nemění a hlavní okno je nepíše. Zapisuje je jen okno widgetů; záznam má verzi a ověřuje se při čtení
   (core/widgets.ts normalizeWidgetPrefs). Jeden setItem je atomický, takže se nikdy neuloží napůl.
   Bez úložiště (soukromý režim, chyba) platí výchozí rozložení a nic se nepamatuje. */
import { defaultWidgetPrefs, normalizeWidgetPrefs, type WidgetPrefs } from '../core/widgets';

export const WIDGETS_KEY = 'arcops:widgets';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const local = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function readWidgetPrefs(store: Store | null = local()): WidgetPrefs {
  try { const v = store?.getItem(WIDGETS_KEY); return v ? normalizeWidgetPrefs(JSON.parse(v)) : defaultWidgetPrefs(); } catch { return defaultWidgetPrefs(); }
}
export function writeWidgetPrefs(p: WidgetPrefs, store: Store | null = local()): boolean {
  try { store?.setItem(WIDGETS_KEY, JSON.stringify(normalizeWidgetPrefs(p))); return !!store; } catch { return false; }
}
