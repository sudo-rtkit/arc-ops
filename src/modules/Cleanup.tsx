/* Inventory → „Úklid stashe“ (milník 4): přebytky a nepotřebné předměty seřazené podle hodnoty na políčko,
   s radou recykluj / prodej a počtem uvolněných políček. Jen přehled: nic se samo nemaže ani neprodává. */
import { useState } from 'react';
import { CircleCheck, Pin } from 'lucide-react';
import { actions, useDerived } from '../store';
import { Badge, Empty, IconBtn, Panel, Select } from '../ui/components';
import { ADVICE_TONE, adviceKey, restText } from '../ui/Advice';
import { cleanupRows, cleanupSummary, type CleanupSort } from '../core/advice';
import { ITEMS_DATE } from '../core/itemdb';
import { fmt } from '../ui/format';
import { useT } from '../i18n/react';
import { ItemLink } from '../ui/ItemCard';

export default function Cleanup() {
  const d = useDerived();
  const t = useT();
  const [sort, setSort] = useState<CleanupSort>('low');
  const rows = cleanupRows(d.advice.values(), sort);
  const sum = cleanupSummary(rows);
  return (
    <Panel title={t('cleanup.title')} flush actions={<div style={{ width: 300 }}><Select label={t('cleanup.sort')} hideLabel value={sort} onChange={v => setSort(v as CleanupSort)}
      options={[{ value: 'low', label: t('cleanup.sort.low') }, { value: 'high', label: t('cleanup.sort.high') }]} /></div>}>
      <p className="meta" style={{ padding: '0 16px' }}>{t('cleanup.hint')}</p>
      {rows.length === 0 ? <Empty icon={CircleCheck}>{t('cleanup.empty')}</Empty> : <>
        <p style={{ padding: '0 16px' }} data-testid="cleanup-summary"><b>{t('cleanup.summary', { count: sum.slots, value: sum.value, items: sum.items })}</b></p>
        <div className="table-wrap tall">
          <table className="table mat-table cleanup-table">
            <thead><tr>
              <th>{t('cleanup.item')}</th><th className="num">{t('cleanup.have')}</th><th className="num">{t('cleanup.keep')}</th>
              <th>{t('cleanup.action')}</th><th className="num">{t('cleanup.valueSlot')}</th><th className="num">{t('cleanup.slots')}</th>
              <th className="num">{t('cleanup.value')}</th><th className="actions-cell"><span className="sr-only">{t('inv.actions')}</span></th>
            </tr></thead>
            <tbody>{rows.map(a => (
              <tr key={a.key} data-item={a.key} data-advice={a.rest}>
                <td><ItemLink name={a.name}><b className="wrap">{a.name}</b></ItemLink></td>
                <td className="num">{fmt(a.count)}</td>
                <td className="num">{a.keep ? <span title={a.reasons.map(r => r.label).join(', ')}>{fmt(a.keep)}</span> : <span className="muted">0</span>}</td>
                <td className="wrap"><Badge tone={ADVICE_TONE[a.rest]}>{t(adviceKey(a.rest))}</Badge> <span className="meta">{restText(a, t)}</span></td>
                <td className="num">{a.valuePerSlot !== null ? fmt(a.valuePerSlot) : <span className="muted">—</span>}</td>
                <td className="num">{fmt(a.slotsFreed)}</td>
                <td className="num">{a.rest === 'sell' && a.surplusValue !== null ? fmt(a.surplusValue) : <span className="muted">—</span>}</td>
                <td className="actions-cell"><IconBtn ghost icon={Pin} label={t('advice.keepOn', { name: a.name })} onClick={() => actions.adviceKeep(a.key, true)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>}
      <p className="meta" style={{ padding: '0 16px' }}>{t('cleanup.data', { date: ITEMS_DATE })}</p>
    </Panel>
  );
}
