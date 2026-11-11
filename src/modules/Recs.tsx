/* Smart Recommendations (záložka Dashboardu). Počítá je jádro jen z lokálních dat; každé ukazuje proč.
   Texty se vykreslují z klíčů slovníku (r.msg), takže jsou vždy v aktuálním jazyce. */
import { ChevronRight, Lightbulb } from 'lucide-react';
import { useDerived } from '../store';
import { Badge, Empty, Panel } from '../ui/components';
import type { Recommendation } from '../core/recommend';
import { useT } from '../i18n/react';

export function RecItem({ r, compact }: { r: Recommendation; compact?: boolean }) {
  const t = useT();
  const title = t.m(r.msg.title);
  const why = r.msg.why.map(t.m);
  return (
    <div className="list-row rec-row">
      <span className="grow stack-sm" style={{ gap: 4 }}>
        <span className="row" style={{ gap: 6 }}><Badge tone={r.tone}>{t(`rec.tone.${r.tone}`)}</Badge><b className="wrap">{title}</b></span>
        <span className="wrap">{t.m(r.msg.detail)}</span>
        {!compact && (
          <details>
            <summary className="meta">{t('rec.why')}</summary>
            <ul className="plain-list meta">{why.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </details>
        )}
        {compact && <span className="meta wrap">{t('rec.whyShort', { why: why[0] })}</span>}
      </span>
      <a className="link-btn" href={r.href} aria-label={t('rec.openAria', { title })}>{t('rec.open')} <ChevronRight size={14} aria-hidden="true" /></a>
    </div>
  );
}

export default function Recs() {
  const d = useDerived();
  const t = useT();
  return (
    <Panel title={t('card.recs')} actions={<span className="meta">{t('rec.count', { count: d.recs.length })}</span>}>
      {d.recs.length === 0 ? <Empty icon={Lightbulb}>{t('rec.empty')}</Empty>
        : <div className="list-rows">{d.recs.map(r => <RecItem key={r.id} r={r} />)}</div>}
      <p className="meta">{t('rec.rules')}</p>
    </Panel>
  );
}
