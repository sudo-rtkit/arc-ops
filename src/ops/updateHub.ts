/* 0.33.0: obsluha kontroly nové verze v hlavním okně (jediná instance, jediné místo, které volá update_check).
   - Automaticky jen se zapnutou kontrolou (výchozí stav vypnuto), chvíli po startu (UPDATE_START_MS) a nejvýš jednou
     za den (autoDue). Když je hra v popředí (hub to ví z hlídací smyčky, Rust to ověří znovu a vrátí update:game),
     kontrola počká (UPDATE_DEFER_MS) a nic se neposílá.
   - Ručně (tlačítko „Zkontrolovat teď“ v Nastavení) i s vypnutou kontrolou: je to výslovná akce hráče. Rust i tak
     pustí na síť nejvýš jeden dotaz za 10 minut (jinak vrátí uložený výsledek).
   - Výsledek jde do stavu (akce updateResult, znovu ověřený); pruh v hlavním okně si ho přečte sám.
   - Ops smí o nové verzi jednou říct krátkou nevyžádanou hlášku (announceVersion: dialogy zapnuté, mimo raid, hra
     ne v popředí); bublina dál podléhá pravidlům nevyžádaných hlášek. Žádné okno, fokus ani nic nad hrou.
   Bez Reactu a DOM, takže jde testovat v Node se zástupným native. */
import type { App } from '../store/app';
import type { OpsAnim } from '../core/ops';
import type { GameInfo } from '../core/ai';
import { line, type LineRef } from '../core/opsVoice';
import {
  announceVersion, autoDue, fromNative, mapUpdateError, nextDelay, NO_NET_ERRORS, UPDATE_DEFER_MS, UPDATE_IDLE_MS, UPDATE_START_MS, UPDATE_UI_TIMEOUT_MS,
  type UpdateResult,
} from '../core/update';
import type { UpdateNative } from '../shell/updateNative';

export interface UpdateHubPort {
  /* nevyžádaná hláška Opse (pravidla nevyžádaných hlášek platí) */
  say(anim: OpsAnim, l: LineRef): void;
  game(): GameInfo;
}
export interface UpdateControllerOptions {
  app: App; native: UpdateNative; port: UpdateHubPort; now?: () => number;
  startMs?: number; deferMs?: number; timeoutMs?: number;
}

export function createUpdateController({ app, native, port, now = Date.now, startMs = UPDATE_START_MS, deferMs = UPDATE_DEFER_MS, timeoutMs = UPDATE_UI_TIMEOUT_MS }: UpdateControllerOptions) {
  const st = () => app.store.getState().state;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let off: (() => void) | null = null;
  const listeners = new Set<(busy: boolean) => void>();
  const setBusy = (b: boolean) => { busy = b; listeners.forEach(f => f(b)); };

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!running) return;
    timer = setTimeout(() => { timer = null; void tick(); }, ms);
    (timer as { unref?: () => void }).unref?.();
  };

  function withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((res, rej) => {
      const h = setTimeout(() => rej(new Error('update:timeout')), timeoutMs);
      p.then(v => { clearTimeout(h); res(v); }, e => { clearTimeout(h); rej(e); });
    });
  }

  /* Ops o nové verzi jednou (jen když to announceVersion dovolí). */
  function announce(): void {
    const v = announceVersion(st(), port.game());
    if (!v) return;
    port.say('talk', line('update.available', { version: v }));
    app.actions.updateNotified(v);
  }

  /* Jedna kontrola. manual = tlačítko hráče (i s vypnutou kontrolou). Vrací výsledek, nebo null, když už jedna běží. */
  async function check(manual: boolean): Promise<UpdateResult | null> {
    if (busy) return null;
    let res: UpdateResult;
    if (!native.available) res = { ok: false, error: 'unavailable' };
    else {
      setBusy(true);
      try { res = fromNative(await withTimeout(native.check())); } catch (e) { res = { ok: false, error: mapUpdateError(e) }; } finally { setBusy(false); }
    }
    /* automatická kontrola při hře v popředí: nic neukládat, zkusit později */
    if (!manual && !res.ok && res.error === 'game') { schedule(deferMs); return res; }
    app.actions.updateResult(res, now());
    announce();
    return res;
  }

  async function tick(): Promise<void> {
    if (!running) return;
    if (!app.store.getState().ready) { schedule(startMs); return; }
    const p = st().update;
    if (!autoDue(p, now())) { if (p.enabled) announce(); schedule(nextDelay(p, now())); return; }
    /* bez nativní vrstvy (prohlížeč bez zkušební náhrady) nic */
    if (!native.available) { schedule(UPDATE_IDLE_MS); return; }
    /* hra v popředí: počkat, nic neposílat */
    if (port.game().visible) { schedule(deferMs); return; }
    const r = await check(false);
    /* právě běží ruční kontrola: zkusit za chvíli */
    if (!r) { schedule(startMs); return; }
    /* na síť se nešlo (hra v popředí: check už naplánoval odklad) */
    if (!r.ok && NO_NET_ERRORS.includes(r.error)) { if (r.error !== 'game') schedule(UPDATE_IDLE_MS); return; }
    schedule(nextDelay(st().update, now()));
  }

  function start(): void {
    if (running) return;
    running = true;
    schedule(startMs);
    /* zapnutí kontroly v Nastavení: první kontrola za chvíli (ne hned při kliknutí) */
    let prev = st().update.enabled;
    off = app.store.subscribe(x => {
      const on = x.state.update.enabled;
      if (on === prev) return;
      prev = on;
      if (on) schedule(startMs);
    });
  }
  function stop(): void {
    running = false;
    off?.(); off = null;
    if (timer) clearTimeout(timer);
    timer = null;
  }
  const subscribe = (f: (busy: boolean) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

  return { start, stop, check, tick, subscribe, busy: () => busy, available: () => native.available, scheduled: () => timer !== null };
}
export type UpdateController = ReturnType<typeof createUpdateController>;
