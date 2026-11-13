/* Rádce „Co dál?“ (0.17.0): karta na Dashboardu, záložka Všechny tipy a společný řádek tipu. Tipy počítá jádro
   (src/core/advisor.ts) v odvozených hodnotách; tady se jen filtrují skryté a odložené a vykreslují v aktuálním
   jazyce. Stejné komponenty běží i v overlayi (plný Dashboard), kde Nastavení otevře hlavní okno. */
import { AlarmClock, ChevronRight, Lightbulb, RotateCcw, X } from 'lucide-react';
import { actions, navigate, useAppState, useDerived } from '../store';
import { Badge, Btn, Empty, IconBtn, Panel } from './components';
import { hiddenTips, visibleTips, type AdvisorTip } from '../core/advisor';
import { inOverlay, openInApp } from '../shell/host';
import { fmtDateTime } from './format';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

/* Moduly jen pro hlavní okno: v overlayi je tip otevře v aplikaci. */
const APP_ONLY = ['settings'];

/* Otevře cíl tipu (#modul/podsekce). */
export function openTip(tip: Pick<AdvisorTip, 'target'>): void {
  const [module, sub = ''] = tip.target.route.split('/');
  if (inOverlay() && APP_ONLY.includes(module)) { openInApp(tip.target.route); return; }
  navigate(module, sub || undefined);
}

export function useTips(): { visible: AdvisorTip[]; hidden: ReturnType<typeof hiddenTips> } {
  const s = useAppState();
  const d = useDerived();
  const now = Date.now();
  return { visible: visibleTips(d.tips, s.advisor, now), hidden: hiddenTips(d.tips, s.advisor, now) };
}

export function TipRow({ tip, full }: { tip: AdvisorTip; full?: boolean }) {
  const t = useT();
  const title = t.m(tip.title);
  return (
    <div className="list-row advisor-row" data-testid="advisor-tip" data-tip={tip.id} data-rule={tip.rule}>
      <span className="grow stack-sm" style={{ gap: 4 }}>
        <span className="row" style={{ gap: 6 }}><Badge tone={tip.tone}>{t(`advisor.rule.${tip.rule}` as Key)}</Badge><b className="wrap">{title}</b></span>
        <span className="wrap">{t.m(tip.detail)}</span>
        <span className="meta wrap">{full ? <>{t('advisor.score', { score: tip.score })} · </> : null}{t('advisor.why', { why: t.m(tip.reason) })}</span>
      </span>
      <span className="row advisor-actions" style={{ gap: 4 }}>
        <Btn size="sm" variant="primary" onClick={() => openTip(tip)} aria-label={t('advisor.openAria', { title })} data-testid="advisor-open">
          {t('advisor.open')}<ChevronRight size={14} aria-hidden="true" />
        </Btn>
        <IconBtn label={t('advisor.snoozeAria', { title })} icon={AlarmClock} onClick={() => actions.advisorSnooze(tip.id, 1)} data-testid="advisor-snooze" />
        {full && <Btn size="sm" variant="ghost" onClick={() => actions.advisorSnooze(tip.id, 7)} aria-label={t('advisor.snoozeWeekAria', { title })}>{t('advisor.snoozeWeek')}</Btn>}
        <IconBtn label={t('advisor.dismissAria', { title })} icon={X} onClick={() => actions.advisorDismiss(tip.id, tip.key)} data-testid="advisor-dismiss" />
      </span>
    </div>
  );
}

/* Karta Dashboardu: nejvýš 5 tipů. */
export function AdvisorCard() {
  const t = useT();
  const { visible, hidden } = useTips();
  return (
    <Panel title={t('card.advisor')} className="span-12 advisor-card" id="advisor"
      actions={<a className="link-btn" href="#dashboard/tips" data-testid="advisor-all">{t('advisor.all')} <ChevronRight size={14} aria-hidden="true" /></a>}>
      <div data-testid="advisor-card" role="region" aria-label={t('advisor.tipsAria')}>
        {visible.length ? <div className="list-rows">{visible.slice(0, 5).map(x => <TipRow key={x.id} tip={x} />)}</div>
          : <Empty icon={Lightbulb}>{hidden.length ? t('advisor.emptyHidden', { count: hidden.length }) : t('advisor.empty')}</Empty>}
        {visible.length > 5 && <span className="meta">{t('stats.andMore', { n: visible.length - 5 })}</span>}
      </div>
    </Panel>
  );
}

/* Záložka Všechny tipy: celé pořadí s prioritou a důvodem, skryté a odložené s návratem. */
export function AdvisorAll() {
  const t = useT();
  const s = useAppState();
  const { visible, hidden } = useTips();
  return (
    <div className="stack" data-testid="advisor-all-view">
      <Panel title={t('advisor.all')} actions={<span className="meta">{t('advisor.count', { count: visible.length })}</span>}>
        <p className="meta">{t('advisor.sub')}</p>
        {visible.length ? <div className="list-rows">{visible.map(x => <TipRow key={x.id} tip={x} full />)}</div>
          : <Empty icon={Lightbulb}>{t('advisor.empty')}</Empty>}
        <p className="meta">{t('advisor.rules')}</p>
      </Panel>
      {hidden.length > 0 && (
        <Panel title={t('advisor.hiddenTitle')} actions={<Btn size="sm" icon={RotateCcw} onClick={() => actions.advisorRestoreAll()} data-testid="advisor-restore-all">{t('advisor.restoreAll')}</Btn>}>
          <div className="list-rows" data-testid="advisor-hidden">
            {hidden.map(({ tip, hidden: h }) => {
              const title = t.m(tip.title);
              return (
                <div key={tip.id} className="list-row" data-tip={tip.id}>
                  <span className="grow wrap"><b>{title}</b>
                    <small>{h === 'snoozed' ? t('advisor.hidden.snoozed', { at: fmtDateTime(s.advisor.snoozed[tip.id] ?? 0) }) : t('advisor.hidden.dismissed')}</small></span>
                  <Btn size="sm" icon={RotateCcw} onClick={() => actions.advisorRestore(tip.id)} aria-label={t('advisor.restoreAria', { title })}>{t('advisor.restore')}</Btn>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
