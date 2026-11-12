/* Hlavní okno (0.9.0): plný a kompaktní režim, připnutí a chování křížku. Čisté funkce bez DOM a Tauri, takže jdou
   testovat v Node. Pravidla:
   - Připnutí („vždy navrchu“) platí jen v kompaktu. V plném režimu se nativně vypíná, uložená volba kompaktu se
     ale nemění, takže ji návrat do kompaktu obnoví. Výchozí stav je vypnuto.
   - Křížek: 'ask' se ptá při každém zavření, dokud uživatel volbu nezapamatuje; zapamatovaná volba
     ('tray' / 'quit') platí potichu a v Nastavení jde kdykoli změnit (i zpět na 'ask').
   - Poloha a velikost se pamatují zvlášť pro každý režim (fyzické pixely). Celé mainWindow patří tomuto počítači:
     import zálohy ani obnova snímku ho nemění. */
import type { CloseAction, CompactSection, MainWindowPrefs, WinRect, WindowMode } from './types';
import { clampInt, isObj } from './util';

export const CLOSE_ACTIONS: CloseAction[] = ['ask', 'tray', 'quit'];
export const COMPACT_SECTIONS: CompactSection[] = ['quests', 'shop', 'upgrade'];
export const QUESTS_MIN = 1, QUESTS_MAX = 5, QUESTS_DEFAULT = 3;
/* Rozsah velikosti kompaktu v CSS px (návrh: šířka 380–480, výška 520–900; výchozí 420 × 720). */
export const COMPACT_SIZE = { w: 420, h: 720, minW: 380, maxW: 480, minH: 520, maxH: 900 } as const;
/* Pod touto výškou okna se použije nízká varianta kompaktu (520 px). */
export const SHORT_BELOW = 620;
/* Místní zkratky v okně (ne globální): změna režimu a připnutí. */
export const MODE_KEY = 'Ctrl+Shift+KeyM';
export const PIN_KEY = 'Ctrl+Shift+KeyP';

export const emptyMainWindow = (): MainWindowPrefs => ({
  mode: 'full', pin: false, full: null, fullMax: false, compact: null, close: 'ask', quests: QUESTS_DEFAULT, collapsed: {},
});

const LIM = 100000;
export function normalizeRect(raw: unknown): WinRect | null {
  if (!isObj(raw)) return null;
  const n = (v: unknown) => Number(v);
  const [x, y, w, h] = [n(raw.x), n(raw.y), n(raw.w), n(raw.h)];
  if (![x, y, w, h].every(Number.isFinite) || w < 100 || h < 100) return null;
  return { x: clampInt(x, -LIM, LIM), y: clampInt(y, -LIM, LIM), w: clampInt(w, 100, 20000), h: clampInt(h, 100, 20000) };
}

export function normalizeMainWindow(raw: unknown): MainWindowPrefs {
  const r = isObj(raw) ? raw : {};
  const m = emptyMainWindow();
  m.mode = r.mode === 'compact' ? 'compact' : 'full';
  m.pin = r.pin === true;
  m.full = normalizeRect(r.full);
  m.fullMax = r.fullMax === true;
  m.compact = normalizeRect(r.compact);
  m.close = CLOSE_ACTIONS.includes(r.close as CloseAction) ? (r.close as CloseAction) : 'ask';
  m.quests = r.quests === undefined ? QUESTS_DEFAULT : clampInt(r.quests, QUESTS_MIN, QUESTS_MAX);
  const c = isObj(r.collapsed) ? r.collapsed : {};
  for (const k of COMPACT_SECTIONS) if (c[k] === true) m.collapsed[k] = true;
  return m;
}

/* Geometrie režimu, který okno opouští (z Rustu); null = okno bylo minimalizované, poslední známá zůstává. */
export interface LeftGeometry { mode: WindowMode; rect: WinRect | null; max: boolean }

/* Přepnutí režimu: uloží geometrii opouštěného režimu, připnutí kompaktu zůstane beze změny. */
export function switchMode(p: MainWindowPrefs, mode: WindowMode, left?: LeftGeometry | null): MainWindowPrefs {
  const next = withGeometry(p, left);
  return next.mode === mode ? next : { ...next, mode };
}

/* Zapíše geometrii režimu (při přepnutí, skrytí nebo ukončení). */
export function withGeometry(p: MainWindowPrefs, g?: LeftGeometry | null): MainWindowPrefs {
  if (!g) return p;
  const rect = normalizeRect(g.rect);
  if (g.mode === 'compact') return rect ? { ...p, compact: rect } : p;
  /* maximalizované plné okno: poslední obnovená geometrie zůstává, jen se zapamatuje maximalizace */
  return { ...p, full: rect && !g.max ? rect : p.full, fullMax: g.max };
}

/* Připnutí jde měnit jen v kompaktu; v plném režimu se nic nezmění. */
export function setPin(p: MainWindowPrefs, on: boolean): MainWindowPrefs {
  if (p.mode !== 'compact' || p.pin === on) return p;
  return { ...p, pin: on };
}

/* Má být okno nativně vždy navrchu? Jen v kompaktu se zapnutým připnutím. */
export const nativeOnTop = (p: MainWindowPrefs): boolean => p.mode === 'compact' && p.pin;

/* Co udělat po stisku křížku: zeptat se, nebo rovnou provést zapamatovanou volbu. */
export const closeDecision = (p: MainWindowPrefs): CloseAction => p.close;

/* Volba z dialogu při zavření: se „Zapamatovat volbu“ se uloží, jinak zůstane 'ask' (zeptá se příště znovu). */
export function rememberClose(p: MainWindowPrefs, choice: Exclude<CloseAction, 'ask'>, remember: boolean): MainWindowPrefs {
  if (!remember || p.close === choice) return p;
  return { ...p, close: choice };
}

/* Zkratka z události klávesnice v okně (Ctrl+Shift+M / Ctrl+Shift+P). Kolize s globální zkratkou buddyho:
   tu systém zachytí dřív, takže místní zkratka se pak nehlásí. */
export function windowShortcut(e: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; code: string }, buddyHotkey = ''): 'mode' | 'pin' | null {
  if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return null;
  const key = 'Ctrl+Shift+' + e.code;
  if (key === buddyHotkey) return null;
  if (key === MODE_KEY) return 'mode';
  if (key === PIN_KEY) return 'pin';
  return null;
}
/* Je místní zkratka volná (není zároveň globální zkratkou buddyho)? */
export const shortcutFree = (key: string, buddyHotkey: string): boolean => key !== buddyHotkey;
