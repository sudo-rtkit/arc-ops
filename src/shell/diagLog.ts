/* 0.28.0: místní deník chyb z JS (každé okno: hlavní, buddy, overlay, widgety). Chyby window.onerror,
   unhandledrejection a chyby vykreslení (ErrorBoundary) jdou jediným příkazem diag_log do Rustu, který doplní
   okno podle volajícího okna (nikdy z dat), omezí délku a počet záznamů a očistí cesty a e-maily.
   - Posílá se jen název, zpráva a zásobník chyby. Nikdy objekt, stav aplikace ani jiná data: odmítnutí s jinou
     hodnotou než Error se zapíše jen typem, úryvek textu v chybě JSON.parse se vynechá.
   - Stejná zpráva se v okně zapíše nejvýš jednou za DEDUPE_MS; Rust navíc omezí počet na okno.
   - Nic z toho nesmí shodit okno: všechny chyby deníku se tiše zahodí.
   - Číst, exportovat a mazat deník smí jen hlavní okno (Rust to hlídá podle štítku okna). Mimo Tauri se nic
     nezapisuje (prohlížeč při vývoji a E2E). */
import { isTauri } from '../storage/tauri';
import type { AppState } from '../core/types';

export type DiagLevel = 'error' | 'warn' | 'info';
export interface DiagEntry { ts: number; at: string; version: string; window: string; level: DiagLevel; message: string; stack?: string }
/* stejné meze jako v Rustu (src-tauri/src/diag.rs), který je vynutí znovu */
export const DIAG_MAX_MESSAGE = 2048;
export const DIAG_MAX_STACK = 4096;
export const DEDUPE_MS = 10_000;

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
};

/* Chybu převede jen na text: název, zpráva a zásobník. Jiná hodnota než Error, text nebo číslo se nikdy
   neserializuje (mohla by nést stav aplikace), zapíše se jen její typ. */
export function describeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    let msg = String(err.message ?? '');
    /* Chromium u JSON.parse cituje kus vstupu ("…" is not valid JSON): vstup může být stav, proto pryč */
    if (err.name === 'SyntaxError' && /JSON/.test(msg)) {
      /* citace nemá escapované uvozovky uvnitř, proto vše od první do poslední uvozovky */
      const a = msg.indexOf('"'), b = msg.lastIndexOf('"');
      if (a >= 0 && b > a) msg = msg.slice(0, a) + '"…"' + msg.slice(b + 1);
    }
    const head = `${err.name || 'Error'}: ${msg}`;
    let stack = typeof err.stack === 'string' ? err.stack : undefined;
    /* zásobník Chromia začíná zprávou; ta je už v message */
    if (stack) {
      const nl = stack.indexOf('\n');
      stack = nl >= 0 && !/^\s+at /.test(stack.slice(0, nl)) ? stack.slice(nl + 1) : stack;
    }
    return { message: head, stack };
  }
  if (typeof err === 'string') return { message: err };
  if (typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint') return { message: String(err) };
  return { message: `non-Error value (${err === null ? 'null' : typeof err})` };
}

const recent = new Map<string, number>();
let busy = false;

/* Zapíše chybu do deníku. ctx = odkud (onerror, render…), extraStack = zásobník komponent Reactu. */
export function reportError(err: unknown, level: DiagLevel = 'error', ctx?: string, extraStack?: string): void {
  if (busy) return;
  busy = true;
  try {
    const d = describeError(err);
    const message = ((ctx ? `${ctx}: ` : '') + d.message).slice(0, DIAG_MAX_MESSAGE);
    const stack = [d.stack, extraStack].filter((x): x is string => !!x && !!x.trim()).join('\n').slice(0, DIAG_MAX_STACK) || null;
    const now = Date.now();
    const last = recent.get(message);
    if (last !== undefined && now - last < DEDUPE_MS) return;
    if (recent.size >= 100) recent.clear();
    recent.set(message, now);
    if (!isTauri()) return;
    void call('diag_log', { level, message, stack }).catch(() => undefined);
  } catch {
    /* deník nesmí shodit okno */
  } finally {
    busy = false;
  }
}

let installed = false;
/* Zachytávání nezachycených chyb okna (jednou na okno). */
export function installDiag(): void {
  if (installed || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  installed = true;
  window.addEventListener('error', e => {
    reportError(e.error ?? `${e.message || 'error'}${e.lineno ? ` (line ${e.lineno}:${e.colno})` : ''}`, 'error', 'onerror');
  });
  window.addEventListener('unhandledrejection', e => { reportError(e.reason, 'error', 'unhandled rejection'); });
}

/* Testy: nový začátek (jinak by deduplikace držela zprávy z předchozího testu). */
export function resetDiagForTests(): void { recent.clear(); busy = false; }

/* ----- jen hlavní okno (Rust odmítne jiné okno) ----- */
export const DIAG_FEATURES = ['buddy', 'autoOpen', 'hotkey', 'widgets', 'autoCapture', 'gameLinkOff', 'passClicks', 'lowImpact', 'sound', 'autoSnapshot', 'ai'] as const;
export type DiagFeatures = Record<(typeof DIAG_FEATURES)[number], boolean>;

/* Které volitelné funkce jsou zapnuté (jen true/false, žádná hodnota ani nastavení navíc). */
export function diagFeatures(s: AppState): DiagFeatures {
  return {
    buddy: s.buddy.enabled === true,
    autoOpen: s.buddy.autoOpen === true,
    hotkey: !!s.buddy.hotkey,
    widgets: s.opsPrefs.widgets.on === true,
    autoCapture: s.autoCapture.enabled === true,
    gameLinkOff: s.gameLink.off === true,
    passClicks: s.opsPrefs.passClicks === true,
    lowImpact: s.opsPrefs.lowImpact === true,
    sound: s.opsPrefs.sound === true,
    autoSnapshot: s.settings.autoSnapshot === true,
    ai: s.ai?.on === true,
  };
}

export const diagAvailable = (): boolean => isTauri();
export const diagRead = (): Promise<DiagEntry[]> => call<DiagEntry[]>('diag_read');
export const diagClear = (): Promise<void> => call<void>('diag_clear');
/* Cestu vybere hráč v systémovém dialogu, název navrhne Rust; vrací false, když dialog zavřel. */
export const diagExport = (features: DiagFeatures, title: string, filter: string): Promise<boolean> => call<boolean>('diag_export', { features, title, filter });
