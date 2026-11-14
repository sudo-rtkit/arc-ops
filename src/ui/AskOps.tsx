/* 0.30.0: „Zeptej se Opse“ (AI asistent je přímo Ops). Stejná komponenta v hlavním okně (modul Zeptej se Opse) i
   v polní konzoli (overlay), kde se otázka pošle hlavnímu oknu přes relay (akce aiAsk). Dotaz se pošle jen na
   výslovnou akci hráče: tlačítko Zeptat se, „Proč?“ u návrhu „Co dál?“, nebo „Zeptat se Opse“ na kartě předmětu.
   - Návrhy „Co dál?“: tři nejlepší tipy deterministického rádce, zdarma a bez AI; jen mimo raid a se zapnutými
     dialogy. „Proč?“ požádá AI o vysvětlení.
   - Odpověď je prostý text (žádné HTML, Markdown ani odkazy), pod ní zdroje s původem a jistotou a poznámka
     „vytvořeno AI, čísla počítá aplikace“. Tlačítka pod odpovědí počítá aplikace z otázky, ne z textu modelu. */
import { useState } from 'react';
import { Bot, ChevronRight, HelpCircle, Settings as SettingsIcon } from 'lucide-react';
import { actions, navigate, useAppState } from '../store';
import { useAiView } from '../store/aiView';
import { AI_Q_MAX, type AiError, type AiKind } from '../core/ai';
import type { AdvisorTip } from '../core/advisor';
import { inOverlay, openInApp } from '../shell/host';
import { Badge, Btn, cx } from './components';
import { useTips, openTip } from './Advisor';
import { openItemCard } from './ItemCard';
import { provText } from './Provenance';
import { useT, type TFn } from '../i18n/react';
import type { Key } from '../i18n';

/* Nastavení chybí (vypnuto, bez souhlasu, bez klíče, mimo aplikaci pro Windows): odkaz do Nastavení → AI asistent. */
const SETUP: readonly AiError[] = ['off', 'consent', 'noKey', 'unavailable'];
export const aiErrText = (t: TFn, e: AiError): string => t(`ai.err.${e}` as Key);

/* Otázka pro Opse (v overlayi ji zrcadlo pošle hlavnímu oknu). */
export const askOps = (question: string, kind: AiKind, ref = ''): void => actions.aiAsk(question, kind, ref);
export const askWhy = (t: TFn, tip: AdvisorTip): void => askOps(t('ai.q.why', { title: t.m(tip.title) }), 'advisor', tip.id);
export const askItem = (t: TFn, name: string): void => askOps(t('ai.q.item', { name }), 'item', name);

/* Smí se teď ptát z tohoto okna? (null = ano) */
export function useAiBlock(): AiError | null {
  const v = useAiView(x => x.view);
  return inOverlay() ? v.overlayBlock : v.mainBlock;
}

const openAiSettings = () => { if (inOverlay()) openInApp('settings/ai'); else navigate('settings', 'ai'); };

export function AskOps({ compact }: { compact?: boolean }) {
  const t = useT();
  const s = useAppState();
  const v = useAiView(x => x.view);
  const block = useAiBlock();
  const { visible } = useTips();
  const [q, setQ] = useState('');
  const thinking = v.status === 'thinking';
  const ready = block === null;
  const setup = block !== null && SETUP.includes(block);
  /* „Co dál?“ jen mimo raid a se zapnutými dialogy Opse */
  const showNext = block !== 'inRaid' && s.opsPrefs.dialogs && !compact;
  const top = visible.slice(0, 3);
  const send = () => { const text = q.trim(); if (!text || !ready || thinking) return; askOps(text, 'free'); };
  const tip = v.kind === 'advisor' ? visible.find(x => x.id === v.ref) : undefined;
  return (
    <div className={cx('ask-ops', compact && 'ask-compact')} data-testid="ask-ops" data-block={block ?? ''}>
      {setup && (
        <div className="ask-note" role="status" data-testid="ask-setup">
          <p>{aiErrText(t, block!)}</p>
          {block !== 'unavailable' && <Btn size="sm" icon={SettingsIcon} onClick={openAiSettings} data-testid="ask-settings">{t('ai.openSettings')}</Btn>}
        </div>
      )}
      {block === 'inRaid' && <p className="ask-note" role="status" data-testid="ask-inraid">{aiErrText(t, 'inRaid')}</p>}

      {showNext && (
        <section className="ask-next" aria-labelledby="ask-next-h" data-testid="ask-next">
          <h3 id="ask-next-h">{t('ai.next.title')}</h3>
          <p className="meta">{t('ai.next.sub')}</p>
          {top.length === 0 ? <p className="meta">{t('advisor.empty')}</p> : (
            <ul className="ask-tips">{top.map(x => {
              const title = t.m(x.title);
              return (
                <li key={x.id} data-tip={x.id}>
                  <span className="grow"><Badge tone={x.tone}>{t(`advisor.rule.${x.rule}` as Key)}</Badge> <b>{title}</b><span className="meta"> · {t.m(x.detail)}</span></span>
                  <Btn size="sm" variant="ghost" icon={HelpCircle} disabled={!ready || thinking} onClick={() => askWhy(t, x)}
                    aria-label={t('ai.whyAria', { title })} data-testid="ask-why">{t('ai.why')}</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => openTip(x)} aria-label={t('advisor.openAria', { title })}>{t('advisor.open')}<ChevronRight size={14} aria-hidden="true" /></Btn>
                </li>
              );
            })}</ul>
          )}
        </section>
      )}

      {block !== 'inRaid' && (
        <form className="ask-form" onSubmit={e => { e.preventDefault(); send(); }}>
          <label htmlFor="ask-q" className="field-label">{t('ai.ask.label')}</label>
          <textarea id="ask-q" className="textarea" rows={compact ? 2 : 3} value={q} maxLength={AI_Q_MAX} placeholder={t('ai.ask.placeholder')}
            disabled={!ready} onChange={e => setQ(e.target.value.slice(0, AI_Q_MAX))} data-testid="ask-input"
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
          <div className="row">
            <Btn type="submit" variant="primary" icon={Bot} disabled={!ready || thinking || !q.trim()} data-testid="ask-send">{t('ai.ask.send')}</Btn>
            <span className="meta mono" aria-live="off">{t('ai.ask.count', { n: q.length, max: AI_Q_MAX })}</span>
          </div>
        </form>
      )}

      {v.status !== 'idle' && (
        <section className="ask-result" aria-live="polite" data-testid="ask-result" data-status={v.status}>
          <p className="meta ask-q">{t('ai.youAsked')} <span className="wrap">{v.question}</span></p>
          {thinking && <p role="status" data-testid="ask-thinking">{t('ai.thinking')}</p>}
          {v.status === 'answer' && (
            <>
              <p className="ask-answer" data-testid="ask-answer">{v.answer}</p>
              <p className="meta ask-aiNote" data-testid="ask-ainote">{t('ai.note')}</p>
            </>
          )}
          {v.status === 'error' && v.error && <p className="ask-error" role="alert" data-testid="ask-error" data-error={v.error}>{aiErrText(t, v.error)}</p>}
          {v.status === 'answer' && (v.kind === 'item' || tip) && (
            <div className="row" data-testid="ask-actions">
              {v.kind === 'item' && v.ref && <Btn size="sm" onClick={() => openItemCard(v.ref)}>{t('ai.action.itemCard')}</Btn>}
              {tip && <Btn size="sm" onClick={() => openTip(tip)}>{t('ai.action.openTip')}</Btn>}
            </div>
          )}
          {v.sources.length > 0 && v.status !== 'thinking' && (
            <details className="ask-sources" open={!compact} data-testid="ask-sources">
              <summary>{t('ai.sources', { count: v.sources.length })}</summary>
              <ul>{v.sources.map(x => (
                <li key={x.id}><span>{x.label}</span> <span className="meta">· {x.rec === undefined ? t('ai.src.computed') : provText(t, x.rec)}</span></li>
              ))}</ul>
            </details>
          )}
        </section>
      )}
      {!compact && <p className="meta" data-testid="ask-privacy">{t('ai.privacyShort')}</p>}
    </div>
  );
}
