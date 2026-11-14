/* 0.30.0: otázka pro AI asistenta jako akce store (aiAsk). Akce stav nemění: jen ověří otázku a předá ji obsluze
   AI v hlavním okně (src/ops/aiHub.ts), která jediná volá Rust (ai_ask). V overlayi obsluha není, takže akce se
   na kopii stavu neprovede nijak; zrcadlo (store/relay.ts) ji pošle hlavnímu oknu jako jedinou akci AI v allow-listu.
   fromRelay(): akce právě přišla z overlaye (applyRelay), takže hlavní okno ví, odkud otázka je (nad hrou se smí
   ptát jen mimo raid). Bez Reactu a DOM. */
import type { AiAsk, AiOrigin } from '../core/ai';

type Hook = (ask: AiAsk, origin: AiOrigin) => void;
let hook: Hook | null = null;
let relayDepth = 0;

export const setAiHook = (h: Hook | null): void => { hook = h; };
export const callAiHook = (ask: AiAsk): void => { hook?.(ask, relayDepth > 0 ? 'overlay' : 'main'); };
/* Provede fn jako akci z overlaye (volá jen applyRelay v hlavním okně). */
export function asRelay<T>(fn: () => T): T {
  relayDepth++;
  try { return fn(); } finally { relayDepth--; }
}
export const fromRelay = (): boolean => relayDepth > 0;
