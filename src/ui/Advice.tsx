/* Rada „nech / recykluj / prodej“ u předmětu (milník 4): štítek, krátké zdůvodnění a přepínač „vždy nechat“.
   Výpočet je v src/core/advice.ts; tady je jen zobrazení. */
import { Pin, PinOff } from 'lucide-react';
import { actions } from '../store';
import { Badge, IconBtn, type Tone } from './components';
import { fmt } from './format';
import { useT } from '../i18n/react';
import type { Advice, AdviceKind } from '../core/advice';
import type { Verdict } from '../core/raidPrep';
import type { Key } from '../i18n';

export const ADVICE_TONE: Record<AdviceKind, Tone> = { keep: 'success', recycle: 'amber', sell: 'accent', unknown: 'muted' };
export const adviceKey = (k: AdviceKind): Key => `advice.${k}` as Key;

type T = ReturnType<typeof useT>;
/* Co s předmětem (nebo s přebytkem) udělat, když není potřeba (bez názvu rady, ten nese štítek). */
export function restText(a: Advice, t: T): string {
  if (a.rest === 'recycle') {
    const list = [...a.recycle].sort((x, y) => Number(y.needed) - Number(x.needed)).map(r => `${fmt(r.qty)}× ${r.name}${r.needed ? ` (${t('advice.needed')})` : ''}`).join(', ');
    return t('advice.recycleInto', { list });
  }
  if (a.rest === 'sell' && a.value !== null) return t('advice.sellFor', { value: a.value });
  return t('advice.noData');
}
export function reasonText(a: Advice, r: Advice['reasons'][number], t: T): string {
  return t('advice.reason', { label: r.label, have: Math.min(a.count, r.qty), qty: r.qty });
}
/* Celé zdůvodnění (do title a do úklidu). */
export function adviceLines(a: Advice, t: T): string[] {
  if (a.override) return [t('advice.override')];
  const rest = `${t(adviceKey(a.rest))} ${restText(a, t)}`;
  const out = a.kind === 'keep' ? a.reasons.map(r => reasonText(a, r, t)) : [];
  if (a.kind !== 'keep') out.push(rest);
  else if (a.surplus > 0) out.push(t('advice.surplus', { n: a.surplus, action: rest }));
  return out;
}

/* Zdůvodnění rady k nalezenému kusu (příprava na raid, overlay Raid, karta předmětu bez zásoby). */
export function verdictText(v: Verdict, t: T): string {
  if (v.kind === 'keep') {
    if (v.override) return t('ops.ov.r.why.override');
    const lbl = v.reasons.slice(0, 2).map(r => r.label).join(', ');
    return v.missing > 0 ? t('ops.ov.r.why.keep', { count: v.missing, for: lbl }) : t('ops.ov.r.why.keepAll', { for: lbl });
  }
  if (v.kind === 'recycle') return t('ops.ov.r.why.recycle', { mats: v.recycle.slice(0, 3).join(', ') });
  if (v.kind === 'sell') return v.need > 0 ? t('ops.ov.r.why.enough', { have: v.have, need: v.need, value: v.value ?? 0 }) : t('ops.ov.r.why.sell', { value: v.value ?? 0 });
  return t('ops.ov.r.why.unknown');
}

export function AdviceCell({ advice: a, label }: { advice: Advice | undefined; label: string }) {
  const t = useT();
  if (!a) return <span className="muted">—</span>;
  const lines = adviceLines(a, t);
  const first = a.kind === 'keep' && !a.override && a.reasons[0] ? reasonText(a, a.reasons[0], t) : a.kind === 'keep' ? lines[0] : restText(a, t);
  const more = a.kind === 'keep' && !a.override ? a.reasons.length - 1 : 0;
  return (
    <div className="advice" data-advice={a.kind} title={lines.join('\n')}>
      <Badge tone={ADVICE_TONE[a.kind]}>{t(adviceKey(a.kind))}</Badge>
      <span className="advice-text meta">{first}{more > 0 && <> · {t('advice.more', { count: more })}</>}
        {a.kind === 'keep' && !a.override && a.surplus > 0 && <> · {t('advice.surplus', { n: a.surplus, action: t(adviceKey(a.rest)) })}</>}</span>
      <IconBtn ghost icon={a.override ? PinOff : Pin} aria-pressed={a.override}
        label={a.override ? t('advice.keepOff', { name: label }) : t('advice.keepOn', { name: label })}
        onClick={() => actions.adviceKeep(a.key, !a.override)} />
    </div>
  );
}
