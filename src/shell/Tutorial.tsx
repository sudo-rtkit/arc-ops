/* Průvodce prvním spuštěním (0.10.0): Ops (DETAIL) mluví v bublině a nabízí odpovědi. Není modální, nic neblokuje
   a nebere fokus (ani při běžící hře: okno zůstane na pozadí a karta se jen vykreslí). Jde přeskočit v každém
   kroku, schovat do příštího spuštění (pak pokračuje, kde skončil) a znovu spustit v Nastavení. Kroky a přechody
   jsou v core/tutorial.ts, texty podle povahy v i18n/opsLines.ts. */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { actions, navigate, useAppState } from '../store';
import { useUi } from '../store/ui';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { OpsCanvas, type OpsHandle } from '../ops/OpsCanvas';
import { useOpsSpeech } from '../ops/speech';
import { mainSound } from '../ops/mainHub';
import { hotkeyLabel } from '../ops/hotkey';
import { resolveOutfit } from '../core/ops';
import { line, type LineRef } from '../core/opsVoice';
import { STEPS, isResume, reply, skip, tutorialShown, type ReplyId } from '../core/tutorial';
import { TUTORIAL_STEPS } from '../core/opsPrefs';
import { expandTo, windowCtl } from './windowCtl';
import { cx } from '../ui/components';

/* Automaticky se průvodce spustí jen v aplikaci (ne v automatizovaném prohlížeči testů, pokud si to test nevyžádá). */
const autoStart = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  const w = window as unknown as { __arcopsTutorial?: boolean };
  return !navigator.webdriver || w.__arcopsTutorial === true;
};
/* kroky do počítadla (ruční vyplnění profilu je jen odbočka) */
const COUNTED = TUTORIAL_STEPS.filter(x => x !== 'profile-manual');
/* ptát se na pokračování jen jednou za relaci */
let resumeAsked = false;

/* Je průvodce právě vidět? (kompaktní okno místo něj neukazuje řádek s Opsem) */
export function useTourShown(): boolean {
  const p = useAppState().opsPrefs;
  const hidden = useUi(u => u.tourHidden);
  return tutorialShown(p.tutorial, p.dialogs, autoStart(), hidden);
}

export function Tutorial({ compact }: { compact: boolean }) {
  const t = useT();
  const s = useAppState();
  const p = s.opsPrefs, tut = p.tutorial;
  const hidden = useUi(u => u.tourHidden);
  const [resume, setResume] = useState(() => { const r = !resumeAsked && isResume(tut, true); resumeAsked = true; return r; });
  const shown = tutorialShown(tut, p.dialogs, autoStart(), hidden);
  const def = STEPS[tut.step];
  const ops = useRef<OpsHandle>(null);

  /* na co krok ukazuje v postranním panelu (jen plný režim) */
  const target = shown && !resume && !compact ? def.target : null;
  useEffect(() => { useUi.setState({ tourTarget: target }); return () => useUi.setState({ tourTarget: null }); }, [target]);

  const ref: LineRef | null = !shown ? null : resume ? line('tut.resume')
    : tut.step === 'capture' ? (s.buddy.hotkey ? line('tut.capture', { key: hotkeyLabel(s.buddy.hotkey) }) : line('tut.captureNoKey'))
      : line(def.line);
  /* v kompaktním okně není postranní panel: ukazuje nahoru na rozbalení */
  const gesture = resume ? 'greet' : compact && def.gesture.startsWith('point-') ? 'point-up' : def.gesture;
  const sp = useOpsSpeech(ref, p.personality, t.lang, { ops, gesture, nonce: resume ? -1 : TUTORIAL_STEPS.indexOf(tut.step), onSay: () => mainSound.play('beep') });

  if (!shown || !ref) return null;

  const go = (route: string) => {
    const [m, sub] = route.split('/');
    if (compact) void expandTo(m, sub);
    else navigate(m, sub);
  };
  const onReply = (id: ReplyId) => {
    if (id === 'resume') { setResume(false); return; }
    const e = reply(tut.step, id);
    if (e.tutorial) actions.setOpsPrefs({ tutorial: e.tutorial });
    if (e.navigate) go(e.navigate);
    if (e.compact) void windowCtl.setMode('compact');
  };
  const replies = resume ? [{ id: 'resume' as const, primary: true }] : def.replies;
  const n = COUNTED.indexOf(tut.step === 'profile-manual' ? 'profile' : tut.step) + 1;

  return (
    <aside className={cx('tour', compact && 'tour--compact')} aria-label={t('tut.label')} data-testid="tour" data-step={resume ? 'resume' : tut.step}>
      <OpsCanvas ref={ops} variant="detail" fit scale={1} level={s.profile.level} outfit={resolveOutfit(s.profile.level, s.buddy)} label={t('ops.previewAria')}
        restAnim={sp.talking ? 'talk' : 'idle'} />
      <div className="tour-bubble">
        <div className="tour-head">
          <span className="tour-step mono">{t('tut.step', { n, total: COUNTED.length })}</span>
          <button type="button" className="tour-x" aria-label={t('tut.hide')} title={t('tut.hide')} onClick={() => useUi.setState({ tourHidden: true })}><X size={15} aria-hidden="true" /></button>
        </div>
        <p className="tour-line" role="status" data-testid="tour-line">{sp.text}</p>
        <div className="tour-replies">
          {replies.map(r => (
            <button key={r.id} type="button" className={cx('btn', 'sm', r.primary && 'primary')} disabled={r.disabled} onClick={() => onReply(r.id)}
              title={r.disabled ? t('tut.soon') : undefined}>
              {t(`tut.reply.${r.id}` as Key)}{r.disabled && <small className="tour-soon">{t('tut.soon')}</small>}
            </button>
          ))}
        </div>
        <button type="button" className="tour-skip" onClick={() => actions.setOpsPrefs({ tutorial: skip(tut.step) })}>{t('tut.skip')}</button>
      </div>
    </aside>
  );
}
