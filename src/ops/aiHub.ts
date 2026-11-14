/* 0.30.0: obsluha AI asistenta v hlavním okně (jediná instance, jediné místo, které posílá dotaz do Rustu).
   - Otázka přijde jako akce store aiAsk (z panelu „Zeptej se Opse“, z karty předmětu, z tlačítka „Proč?“, nebo
     z overlaye přes relay). Dotaz se pošle jen na tuto výslovnou akci hráče; nikdy sám (bezplatná kvóta).
   - Nejdřív aiBlock (vypnuto, bez souhlasu, bez klíče, v raidu; z overlaye nad hrou jen mimo raid), pak data
     z deterministického kódu (core/aiContext.ts), pak Rust (ai_ask) s vlastním časovým limitem i tady, takže se nikdy
     nezasekne v „přemýšlí“.
   - Ops odpovídá ve své bublině (thinking → talk) ve své povaze; celá odpověď se zdroji je v panelu a v polní
     konzoli. Chyba v raidu nebo s hrou v popředí bublinu neukáže (žádné nevyžádané okno při hraní).
   Bez Reactu a DOM, takže jde testovat v Node se zástupným native. */
import type { App } from '../store/app';
import type { OpsAnim } from '../core/ops';
import { line, type LineRef } from '../core/opsVoice';
import { aiBlock, bubbleText, mapAiError, modelOf, plainAnswer, reachedProvider, type AiAsk, type AiError, type AiOrigin, type AiProvider, type GameInfo } from '../core/ai';
import { buildAiContext, messagesBytes, MESSAGES_MAX_BYTES } from '../core/aiContext';
import { advisorTips, visibleTips } from '../core/advisor';
import { dayKey } from '../core/util';
import { getLang, t, type Key } from '../i18n';
import type { AiNative } from '../shell/aiNative';
import { emptyAiView, setAiView, type AiView } from '../store/aiView';

export interface AiHubPort {
  say(anim: OpsAnim, l: LineRef): void;
  game(): GameInfo;
  /* nový stav panelu poslat overlayi */
  push(): void;
}
export interface AiControllerOptions { app: App; native: AiNative; port: AiHubPort; now?: () => number; timeoutMs?: number }
/* Pojistka v okně nad časovým limitem Rustu (30 s). */
export const AI_UI_TIMEOUT_MS = 35_000;

export function createAiController({ app, native, port, now = Date.now, timeoutMs = AI_UI_TIMEOUT_MS }: AiControllerOptions) {
  const st = () => app.store.getState().state;
  let cur: AiView = emptyAiView();
  let hasKey = false;
  let keyFor: AiProvider | null = null;
  let seq = 0;
  const listeners = new Set<(v: AiView) => void>();

  const view = (): AiView => {
    const s = st(), game = port.game();
    return {
      ...cur, hasKey, available: native.available,
      overlayBlock: native.available ? aiBlock(s, { origin: 'overlay', game, hasKey }) : 'unavailable',
      mainBlock: native.available ? aiBlock(s, { origin: 'main', game, hasKey }) : 'unavailable',
    };
  };
  const publish = () => { const v = view(); setAiView(v); listeners.forEach(f => f(v)); port.push(); };
  const set = (patch: Partial<AiView>) => { cur = { ...cur, ...patch }; publish(); };
  const errText = (e: AiError) => t(`ai.err.${e}` as Key);

  async function refreshKey(): Promise<void> {
    const p = st().ai.provider;
    keyFor = p;
    try { const has = native.available ? await native.keyStatus(p) : false; if (keyFor === p) hasKey = has; } catch { if (keyFor === p) hasKey = false; }
    publish();
  }

  /* Klíč z Nastavení: rovnou do Rustu, nikam jinam. Vrací chybu nebo null. */
  async function setKey(p: AiProvider, key: string): Promise<AiError | null> {
    try { await native.keySet(p, key); return null; } catch (e) { return mapAiError(e); } finally { await refreshKey(); }
  }
  async function clearKey(p: AiProvider): Promise<AiError | null> {
    try { await native.keyClear(p); return null; } catch (e) { return mapAiError(e); } finally { await refreshKey(); }
  }

  function withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((res, rej) => {
      const h = setTimeout(() => rej(new Error('ai:timeout')), timeoutMs);
      p.then(v => { clearTimeout(h); res(v); }, e => { clearTimeout(h); rej(e); });
    });
  }

  async function ask(a: AiAsk, origin: AiOrigin): Promise<void> {
    if (cur.status === 'thinking') return;
    const id = ++seq;
    const base = { id, question: a.question, kind: a.kind, ref: a.ref, answer: '', at: now() };
    const fail = (error: AiError, bubble: boolean, keepSources = false) => {
      set({ ...base, sources: keepSources ? cur.sources : [], status: 'error', error });
      if (bubble) port.say(error === 'game' ? 'shrug' : 'error', line('ai.error', { text: errText(error) }));
    };
    if (!native.available) { fail('unavailable', false); return; }
    if (keyFor !== st().ai.provider) await refreshKey();
    const s = st();
    const block = aiBlock(s, { origin, game: port.game(), hasKey });
    /* v raidu žádná bublina (nic nevyskočí při hraní) */
    if (block) { fail(block, block !== 'inRaid'); return; }
    const t0 = now();
    const tips = visibleTips(advisorTips(s, t0, s.settings.lang), s.advisor, t0);
    const ctx = buildAiContext(s, a, { lang: getLang(), personality: s.opsPrefs.personality, now: t0, today: dayKey(t0), tips });
    if (messagesBytes(ctx.messages) > MESSAGES_MAX_BYTES) { fail('tooLong', true); return; }
    set({ ...base, sources: ctx.sources, status: 'thinking', error: null });
    port.say('thinking', line('ai.thinking'));
    try {
      const r = await withTimeout(native.ask(s.ai.provider, modelOf(s.ai), ctx.messages));
      if (id !== seq) return;
      const answer = plainAnswer(r?.text);
      if (!answer) throw new Error('ai:empty');
      app.actions.aiCount();
      set({ status: 'answer', answer, error: null, at: now() });
      port.say('talk', line('ai.answer', { text: bubbleText(answer) }));
    } catch (e) {
      if (id !== seq) return;
      const code = mapAiError(e);
      if (reachedProvider(code)) app.actions.aiCount();
      /* hra v popředí: bez bubliny */
      fail(code, code !== 'game', true);
    }
  }

  /* Vymazat poslední odpověď (ne během přemýšlení). */
  const clear = () => { if (cur.status !== 'thinking') { cur = { ...emptyAiView(), id: cur.id }; publish(); } };

  let off: (() => void) | null = null;
  function start() {
    let prev = '';
    const sig = () => { const a = st().ai; return `${a.on}|${a.provider}|${a.consentAt > 0}`; };
    off = app.store.subscribe(x => {
      if (!x.ready) return;
      const next = sig();
      if (next === prev) return;
      const providerChanged = prev.split('|')[1] !== x.state.ai.provider;
      prev = next;
      if (providerChanged) void refreshKey(); else publish();
    });
    if (app.store.getState().ready) { prev = sig(); void refreshKey(); }
  }
  const stop = () => { off?.(); off = null; };
  const subscribe = (f: (v: AiView) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

  return { start, stop, ask, view, subscribe, refreshKey, setKey, clearKey, clear, available: () => native.available };
}
export type AiController = ReturnType<typeof createAiController>;
