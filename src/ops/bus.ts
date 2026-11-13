/* Přenos zpráv mezi okny (milník 5). V Tauri přes příkaz bus_send v Rustu, v prohlížeči BroadcastChannel,
   takže E2E může otevřít hlavní okno a overlay jako dvě stránky. Zprávy jsou jen data aplikace.
   0.8.0: v Tauri se posluchač registruje asynchronně (listen() se vyřeší později). Zpráva poslaná dřív, než
   posluchač existuje, se ztratí. Proto ready(): vyřeší se, až jsou aktivní všechny dosud přidané posluchače.
   0.16.1 (bezpečnost):
   - Okna nemají oprávnění vysílat události z JS. Zprávu pošle Rust (src-tauri/src/bus.rs): odesílatele doplní podle
     štítku volajícího okna, pustí jen trasy hlavní ↔ buddy, hlavní ↔ overlay a hlavní ↔ widgety (0.22.0) a omezí velikost. Příjemce dostane
     ověřeného odesílatele jako druhý argument handleru (from).
   - Události, které posílá jen Rust (oznamovací oblast, zavření okna, hra, snímek, overlay), se poslouchají přes
     onNative (předpona native:). Zpráva z jiného okna se za ně vydávat nemůže. */
import { isTauri } from '../storage/tauri';

export type WindowLabel = 'main' | 'buddy' | 'overlay' | 'widgets';
export type Handler = (payload: unknown, from: WindowLabel | null) => void;
export interface Bus {
  label: WindowLabel;
  send(to: WindowLabel, type: string, payload?: unknown): void;
  on(type: string, fn: Handler): () => void;
  /* Událost jen z Rustu (předpona native:). V prohlížeči nikdy nepřijde. */
  onNative(type: string, fn: (payload: unknown) => void): () => void;
  /* Vyřeší se, až jsou zaregistrované všechny posluchače přidané přes on() do této chvíle. Nikdy neselže. */
  ready(): Promise<void>;
}

const CHANNEL = 'arcops-ops';
const LABELS: readonly string[] = ['main', 'buddy', 'overlay', 'widgets'];
const labelOf = (v: unknown): WindowLabel | null => (typeof v === 'string' && LABELS.includes(v) ? (v as WindowLabel) : null);

/* Sleduje rozpracované registrace posluchačů. */
function registrations() {
  const pending = new Set<Promise<unknown>>();
  return {
    track(p: Promise<unknown>) { const q = p.then(() => undefined, () => undefined); pending.add(q); void q.then(() => pending.delete(q)); },
    ready: (): Promise<void> => Promise.all([...pending]).then(() => undefined),
  };
}

function tauriBus(label: WindowLabel): Bus {
  const core = import('@tauri-apps/api/core');
  const win = import('@tauri-apps/api/webviewWindow');
  const reg = registrations();
  const listen = (event: string, fn: (payload: unknown) => void) => {
    let off: (() => void) | null = null, dead = false;
    const p = win.then(m => m.getCurrentWebviewWindow().listen(event, e => fn(e.payload)))
      .then(u => { if (dead) u(); else off = u; }, () => undefined);
    reg.track(p);
    return () => { dead = true; off?.(); };
  };
  return {
    label,
    send(to, type, payload) { void core.then(m => m.invoke('bus_send', { to, kind: type, payload: payload ?? null })).catch(() => undefined); },
    on(type, fn) {
      return listen('bus:' + type, e => {
        const m = e as { from?: unknown; payload?: unknown } | null;
        if (m && typeof m === 'object') fn(m.payload ?? null, labelOf(m.from));
      });
    },
    onNative: (type, fn) => listen('native:' + type, fn),
    ready: reg.ready,
  };
}

function browserBus(label: WindowLabel): Bus {
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  const handlers = new Map<string, Set<Handler>>();
  ch?.addEventListener('message', e => {
    const m = e.data as { to?: string; from?: string; type?: string; payload?: unknown };
    if (!m || m.to !== label || typeof m.type !== 'string') return;
    handlers.get(m.type)?.forEach(fn => fn(m.payload, labelOf(m.from)));
  });
  return {
    label,
    send(to, type, payload) { ch?.postMessage({ to, from: label, type, payload: payload ?? null }); },
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(fn);
      return () => { handlers.get(type)?.delete(fn); };
    },
    /* v prohlížeči žádný Rust není */
    onNative: () => () => undefined,
    ready: () => Promise.resolve(),
  };
}

export const createBus = (label: WindowLabel): Bus => (isTauri() ? tauriBus(label) : browserBus(label));

export interface MemoryBus extends Bus {
  sent: { to: WindowLabel; type: string; payload: unknown }[];
  /* Testy: událost z Rustu (native:) pro okno `to`. */
  native(to: WindowLabel, type: string, payload?: unknown): void;
}
export interface MemoryBusOptions {
  /* Zpoždění registrace posluchače v ms (jako listen() v Tauri). Bez něj se posluchač přidá hned. */
  registerDelayMs?: number;
}
/* Bus v paměti pro testy: zprávy se doručí synchronně (jako kopie) všem bus se stejným jménem, s odesílatelem.
   S registerDelayMs se posluchač aktivuje až po zpoždění; zpráva poslaná dřív se ztratí jako v Tauri. */
export function memoryBuses(opts: MemoryBusOptions = {}): (label: WindowLabel) => MemoryBus {
  type Entry = { label: WindowLabel; handlers: Map<string, Set<Handler>>; natives: Map<string, Set<(p: unknown) => void>> };
  const all: Entry[] = [];
  const sent: MemoryBus['sent'] = [];
  return label => {
    const handlers = new Map<string, Set<Handler>>();
    const natives = new Map<string, Set<(p: unknown) => void>>();
    const reg = registrations();
    all.push({ label, handlers, natives });
    const add = <F>(map: Map<string, Set<F>>, type: string, fn: F) => {
      let dead = false;
      const doAdd = () => {
        if (dead) return;
        if (!map.has(type)) map.set(type, new Set());
        map.get(type)!.add(fn);
      };
      if (opts.registerDelayMs === undefined) doAdd();
      else reg.track(new Promise<void>(res => setTimeout(() => { doAdd(); res(); }, opts.registerDelayMs)));
      return () => { dead = true; map.get(type)?.delete(fn); };
    };
    return {
      label, sent,
      send(to, type, payload) {
        sent.push({ to, type, payload });
        for (const b of all) if (b.label === to) b.handlers.get(type)?.forEach(fn => fn(structuredClone(payload ?? null), label));
      },
      native(to, type, payload) {
        for (const b of all) if (b.label === to) b.natives.get(type)?.forEach(fn => fn(structuredClone(payload ?? null)));
      },
      on: (type, fn) => add(handlers, type, fn),
      onNative: (type, fn) => add(natives, type, fn),
      ready: reg.ready,
    };
  };
}
