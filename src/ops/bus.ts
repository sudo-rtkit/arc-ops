/* Přenos zpráv mezi okny (milník 5). V Tauri události s cílovým oknem (emitTo), v prohlížeči BroadcastChannel,
   takže E2E může otevřít hlavní okno a overlay jako dvě stránky. Zprávy jsou jen data aplikace.
   0.8.0: v Tauri se posluchač registruje asynchronně (listen() se vyřeší později). Zpráva poslaná dřív, než
   posluchač existuje, se ztratí. Proto ready(): vyřeší se, až jsou aktivní všechny dosud přidané posluchače. */
import { isTauri } from '../storage/tauri';

export type WindowLabel = 'main' | 'buddy' | 'overlay';
export type Handler = (payload: unknown) => void;
export interface Bus {
  label: WindowLabel;
  send(to: WindowLabel, type: string, payload?: unknown): void;
  on(type: string, fn: Handler): () => void;
  /* Vyřeší se, až jsou zaregistrované všechny posluchače přidané přes on() do této chvíle. Nikdy neselže. */
  ready(): Promise<void>;
}

const CHANNEL = 'arcops-ops';
const PREFIX = 'ops:';

/* Sleduje rozpracované registrace posluchačů. */
function registrations() {
  const pending = new Set<Promise<unknown>>();
  return {
    track(p: Promise<unknown>) { const q = p.then(() => undefined, () => undefined); pending.add(q); void q.then(() => pending.delete(q)); },
    ready: (): Promise<void> => Promise.all([...pending]).then(() => undefined),
  };
}

function tauriBus(label: WindowLabel): Bus {
  const ev = import('@tauri-apps/api/event');
  const win = import('@tauri-apps/api/webviewWindow');
  const reg = registrations();
  return {
    label,
    send(to, type, payload) { void ev.then(m => m.emitTo(to, PREFIX + type, payload ?? null)).catch(() => undefined); },
    on(type, fn) {
      let off: (() => void) | null = null, dead = false;
      const p = win.then(m => m.getCurrentWebviewWindow().listen(PREFIX + type, e => fn(e.payload)))
        .then(u => { if (dead) u(); else off = u; }, () => undefined);
      reg.track(p);
      return () => { dead = true; off?.(); };
    },
    ready: reg.ready,
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
    ready: () => Promise.resolve(),
  };
}

export const createBus = (label: WindowLabel): Bus => (isTauri() ? tauriBus(label) : browserBus(label));

export interface MemoryBus extends Bus { sent: { to: WindowLabel; type: string; payload: unknown }[] }
export interface MemoryBusOptions {
  /* Zpoždění registrace posluchače v ms (jako listen() v Tauri). Bez něj se posluchač přidá hned. */
  registerDelayMs?: number;
}
/* Bus v paměti pro testy: zprávy se doručí synchronně (jako kopie) všem bus se stejným jménem.
   S registerDelayMs se posluchač aktivuje až po zpoždění; zpráva poslaná dřív se ztratí jako v Tauri. */
export function memoryBuses(opts: MemoryBusOptions = {}): (label: WindowLabel) => MemoryBus {
  const all: { label: WindowLabel; handlers: Map<string, Set<Handler>> }[] = [];
  const sent: MemoryBus['sent'] = [];
  return label => {
    const handlers = new Map<string, Set<Handler>>();
    const reg = registrations();
    all.push({ label, handlers });
    return {
      label, sent,
      send(to, type, payload) {
        sent.push({ to, type, payload });
        for (const b of all) if (b.label === to) b.handlers.get(type)?.forEach(fn => fn(structuredClone(payload ?? null)));
      },
      on(type, fn) {
        let dead = false;
        const add = () => {
          if (dead) return;
          if (!handlers.has(type)) handlers.set(type, new Set());
          handlers.get(type)!.add(fn);
        };
        if (opts.registerDelayMs === undefined) add();
        else reg.track(new Promise<void>(res => setTimeout(() => { add(); res(); }, opts.registerDelayMs)));
        return () => { dead = true; handlers.get(type)?.delete(fn); };
      },
      ready: reg.ready,
    };
  };
}
