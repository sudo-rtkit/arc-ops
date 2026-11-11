/* Přenos zpráv mezi okny (milník 5). V Tauri události s cílovým oknem (emitTo), v prohlížeči BroadcastChannel,
   takže E2E může otevřít hlavní okno a overlay jako dvě stránky. Zprávy jsou jen data aplikace. */
import { isTauri } from '../storage/tauri';

export type WindowLabel = 'main' | 'buddy' | 'overlay';
export type Handler = (payload: unknown) => void;
export interface Bus {
  label: WindowLabel;
  send(to: WindowLabel, type: string, payload?: unknown): void;
  on(type: string, fn: Handler): () => void;
}

const CHANNEL = 'arcops-ops';
const PREFIX = 'ops:';

function tauriBus(label: WindowLabel): Bus {
  const ev = import('@tauri-apps/api/event');
  const win = import('@tauri-apps/api/webviewWindow');
  return {
    label,
    send(to, type, payload) { void ev.then(m => m.emitTo(to, PREFIX + type, payload ?? null)).catch(() => undefined); },
    on(type, fn) {
      let off: (() => void) | null = null, dead = false;
      void win.then(m => m.getCurrentWebviewWindow().listen(PREFIX + type, e => fn(e.payload)))
        .then(u => { if (dead) u(); else off = u; }, () => undefined);
      return () => { dead = true; off?.(); };
    },
  };
}

function browserBus(label: WindowLabel): Bus {
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  const handlers = new Map<string, Set<Handler>>();
  ch?.addEventListener('message', e => {
    const m = e.data as { to?: string; type?: string; payload?: unknown };
    if (!m || m.to !== label || typeof m.type !== 'string') return;
    handlers.get(m.type)?.forEach(fn => fn(m.payload));
  });
  return {
    label,
    send(to, type, payload) { ch?.postMessage({ to, type, payload: payload ?? null }); },
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(fn);
      return () => { handlers.get(type)?.delete(fn); };
    },
  };
}

export const createBus = (label: WindowLabel): Bus => (isTauri() ? tauriBus(label) : browserBus(label));

export interface MemoryBus extends Bus { sent: { to: WindowLabel; type: string; payload: unknown }[] }
/* Bus v paměti pro testy: zprávy se doručí synchronně (jako kopie) všem bus se stejným jménem. */
export function memoryBuses(): (label: WindowLabel) => MemoryBus {
  const all: { label: WindowLabel; handlers: Map<string, Set<Handler>> }[] = [];
  const sent: MemoryBus['sent'] = [];
  return label => {
    const handlers = new Map<string, Set<Handler>>();
    all.push({ label, handlers });
    return {
      label, sent,
      send(to, type, payload) {
        sent.push({ to, type, payload });
        for (const b of all) if (b.label === to) b.handlers.get(type)?.forEach(fn => fn(structuredClone(payload ?? null)));
      },
      on(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(fn);
        return () => { handlers.get(type)?.delete(fn); };
      },
    };
  };
}
