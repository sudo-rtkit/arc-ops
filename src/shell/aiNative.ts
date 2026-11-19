/* 0.30.0: jediné místo, které volá příkazy AI v Rustu (ai_ask, ai_key_set, ai_key_clear, ai_key_status). Smí je jen
   hlavní okno (Rust ověřuje štítek okna, capabilities/main.json). Klíč se sem dostane jen jednou, při zadání
   v Nastavení, a hned jde do Rustu; nikdy se nevrací ani neukládá. Stav klíče je jen ano / ne.
   Mimo Tauri (vývoj v prohlížeči, E2E) žádná síť: bez zkušební náhrady (window.__aiTest, jen v prohlížeči) je asistent
   nedostupný. */
import { isTauri } from '../storage/tauri';
import type { AiProvider } from '../core/ai';
import type { AiMessage } from '../core/aiContext';

/* 0.32.0: retried = Rust dostal prázdnou odpověď a zkusil to jednou znovu bez reasoning_effort */
export interface AiReply { text: string; today: number; retried?: boolean }
export interface AiNative {
  available: boolean;
  ask(provider: AiProvider, model: string, messages: AiMessage[]): Promise<AiReply>;
  keySet(provider: AiProvider, key: string): Promise<void>;
  keyClear(provider: AiProvider): Promise<void>;
  keyStatus(provider: AiProvider): Promise<boolean>;
}

const call = async <T>(cmd: string, args: Record<string, unknown>): Promise<T> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
};

const tauriAi: AiNative = {
  available: true,
  ask: (provider, model, messages) => call<AiReply>('ai_ask', { provider, model, messages }),
  keySet: (provider, key) => call('ai_key_set', { provider, key }),
  keyClear: provider => call('ai_key_clear', { provider }),
  keyStatus: async provider => (await call<boolean>('ai_key_status', { provider })) === true,
};

/* Prohlížeč: zkušební náhrada z testu (E2E), jinak nic. */
type TestAi = Partial<Omit<AiNative, 'available'>>;
const testAi = (): TestAi | null => (typeof window !== 'undefined' ? ((window as unknown as { __aiTest?: TestAi }).__aiTest ?? null) : null);
const browserAi: AiNative = {
  get available() { return !!testAi(); },
  ask: (p, m, msgs) => { const x = testAi(); return x?.ask ? x.ask(p, m, msgs) : Promise.reject(new Error('ai:unavailable')); },
  keySet: (p, k) => { const x = testAi(); return x?.keySet ? x.keySet(p, k) : Promise.reject(new Error('ai:unavailable')); },
  keyClear: p => { const x = testAi(); return x?.keyClear ? x.keyClear(p) : Promise.resolve(); },
  keyStatus: p => { const x = testAi(); return x?.keyStatus ? x.keyStatus(p) : Promise.resolve(false); },
};

export const createAiNative = (): AiNative => (isTauri() ? tauriAi : browserAi);
