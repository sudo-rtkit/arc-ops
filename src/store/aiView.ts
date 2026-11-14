/* 0.30.0: co právě ukazuje „Zeptej se Opse“ (otázka, přemýšlí, odpověď se zdroji, chyba). Neukládá se. V hlavním okně
   ho nastavuje obsluha AI (src/ops/aiHub.ts), v overlayi přijde s kopií stavu z hlavního okna (OverlayView.ai). */
import { create } from 'zustand';
import type { AiError, AiKind } from '../core/ai';
import type { AiSource } from '../core/aiContext';

export interface AiView {
  status: 'idle' | 'thinking' | 'answer' | 'error';
  /* pořadí dotazu (nová otázka = vyšší číslo) */
  id: number;
  question: string; kind: AiKind; ref: string;
  /* prostý text odpovědi (core/ai.ts plainAnswer) */
  answer: string;
  error: AiError | null;
  sources: AiSource[];
  at: number;
  /* je pro vybraného poskytovatele uložený klíč (jen ano / ne) a je asistent v tomto prostředí k dispozici */
  hasKey: boolean; available: boolean;
  /* proč se teď nejde ptát z overlaye nad hrou / z hlavního okna (null = jde) */
  overlayBlock: AiError | null; mainBlock: AiError | null;
}
export const emptyAiView = (): AiView => ({
  status: 'idle', id: 0, question: '', kind: 'free', ref: '', answer: '', error: null, sources: [], at: 0,
  hasKey: false, available: false, overlayBlock: 'off', mainBlock: 'off',
});

export const useAiView = create<{ view: AiView }>(() => ({ view: emptyAiView() }));
export const setAiView = (view: AiView): void => useAiView.setState({ view });
