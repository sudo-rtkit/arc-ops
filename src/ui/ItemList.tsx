/* Úprava seznamu položek s počtem (výbava, loot, ztráty, materiál receptu). Přechodná funkční komponenta. */
import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ItemQty } from '../core/types';
import { Btn, IconBtn } from './components';
import { ITEM_MAX } from '../core/raidItems';
import { useT } from '../i18n/react';

export function ItemList({ label, items, onChange, suggestions = [], addLabel, empty, max = 100 }: {
  label: string; items: ItemQty[]; onChange: (v: ItemQty[]) => void; suggestions?: string[]; addLabel?: string; empty?: string; max?: number;
}) {
  const id = useId();
  const t = useT();
  addLabel ??= t('common.add');
  empty ??= t('items.empty');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const q = Math.max(1, Math.min(ITEM_MAX, Math.round(Number(qty) || 1)));
    const i = items.findIndex(x => x.name === n);
    if (i >= 0) onChange(items.map((x, k) => (k === i ? { ...x, qty: Math.min(ITEM_MAX, x.qty + q) } : x)));
    else if (items.length < max) onChange([...items, { name: n, qty: q }]);
    setName(''); setQty('1');
  };
  return (
    <fieldset className="item-list">
      <legend className="field-label">{label}</legend>
      {items.length === 0 && <span className="meta">{empty}</span>}
      {items.map((it, i) => (
        <div key={it.name} className="row item-row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <span className="grow wrap">{it.name}</span>
          <label className="sr-only" htmlFor={`${id}-q${i}`}>{t('items.qtyOf', { label, name: it.name })}</label>
          <input id={`${id}-q${i}`} className="input num-input" style={{ width: 80 }} inputMode="numeric" value={it.qty}
            onChange={e => { const q = Math.max(1, Math.min(ITEM_MAX, Math.round(Number(e.target.value) || 1))); onChange(items.map((x, k) => (k === i ? { ...x, qty: q } : x))); }} />
          <IconBtn label={t('items.remove', { label, name: it.name })} icon={Trash2} onClick={() => onChange(items.filter((_, k) => k !== i))} />
        </div>
      ))}
      <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
        <label className="sr-only" htmlFor={`${id}-n`}>{t('items.nameOf', { label })}</label>
        <input id={`${id}-n`} className="input grow" list={`${id}-dl`} value={name} placeholder={t('common.name')} maxLength={80}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <label className="sr-only" htmlFor={`${id}-c`}>{t('items.qty', { label })}</label>
        <input id={`${id}-c`} className="input num-input" style={{ width: 80 }} inputMode="numeric" value={qty}
          onChange={e => setQty(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Btn size="sm" icon={Plus} onClick={add} disabled={!name.trim()} aria-label={`${label}: ${addLabel}`}>{addLabel}</Btn>
      </div>
      <datalist id={`${id}-dl`}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
    </fieldset>
  );
}

export const itemsText = (items: ItemQty[]): string => items.map(i => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ');
