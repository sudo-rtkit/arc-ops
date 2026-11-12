/* Řeč Opse ve stránce (overlay, kompaktní okno, průvodce): hláška se vybere podle povahy a jazyka (varianty se
   střídají), Ops po dobu bubliny „mluví“ (klid = talk), k hlášce zahraje gesto podle povahy a okno může pípnout. */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { bubbleMs, createMemo, lineGesture, sayLine, type LineRef } from '../core/opsVoice';
import type { OpsPersonality } from '../core/types';
import type { Lang } from '../i18n';
import type { OpsHandle } from './OpsCanvas';
import type { OpsAnim } from '../core/ops';

export interface Speech { text: string; talking: boolean }

/* nonce: změna = říct hlášku znovu (další varianta), i když je stejná. gesture: vlastní gesto místo podle povahy. */
export function useOpsSpeech(l: LineRef | null, mode: OpsPersonality, lang: Lang, opts: {
  ops?: RefObject<OpsHandle | null>; nonce?: number; gesture?: OpsAnim | null; onSay?: (text: string) => void;
} = {}): Speech {
  const memo = useRef(createMemo());
  const [sp, setSp] = useState<Speech>({ text: '', talking: false });
  const onSay = useRef(opts.onSay);
  onSay.current = opts.onSay;
  const sig = l ? JSON.stringify(l) : '';
  useEffect(() => {
    if (!l) { setSp({ text: '', talking: false }); return; }
    const text = sayLine(l, mode, lang, memo.current);
    setSp({ text, talking: true });
    const g = opts.gesture === undefined ? lineGesture(l.line, mode) : opts.gesture;
    if (g) opts.ops?.current?.play(g);
    onSay.current?.(text);
    const h = setTimeout(() => setSp(s => ({ ...s, talking: false })), bubbleMs(text));
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, mode, lang, opts.nonce]);
  return sp;
}
