/* Inventory → „Vybavení“: evidence předmětů mimo materiály (zbraně, štíty, augmenty, munice, quick use, klíče,
   ostatní) po kategoriích. Ruční přidání, úprava počtu a smazání; počty zapisuje i rozpoznávání ze snímku. */
import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { AdviceCell } from '../ui/Advice';
import { Badge, Btn, ConfirmButton, Dialog, Empty, IconBtn, Panel, Search, Select, Stepper } from '../ui/components';
import { LIMITS } from '../core/state';
import { ITEM_CATEGORIES, ITEM_TIERS, itemKey, type ItemCategory, type ItemStock, type ItemTier } from '../core/types';
import { catalogItems, itemCategoryOf } from '../core/catalog';
import { fmt } from '../ui/format';
import { useT } from '../i18n/react';
import { ItemLink } from '../ui/ItemCard';
import { ProvDot } from '../ui/Provenance';
import { provOf } from '../core/provenance';
import type { Key } from '../i18n';

export const catKey = (c: ItemCategory): Key => `equip.cat.${c}` as Key;
/* Návrhy názvů z katalogu (bez materiálů, ty patří do Zásoby). */
const suggestions = () => catalogItems().filter(x => x.category !== 'material').map(x => x.name);

function ItemDialog({ item, onClose }: { item: ItemStock | null; onClose: () => void }) {
  const t = useT();
  const s = useAppState();
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState<ItemCategory>(item?.category || 'other');
  const [tier, setTier] = useState<ItemTier | ''>(item?.tier || '');
  const [count, setCount] = useState(item?.count || 1);
  const [touchedCat, setTouchedCat] = useState(!!item);
  const names = useMemo(suggestions, []);
  const n = name.trim();
  const key = itemKey(n, tier || undefined);
  const clash = !!n && key !== item?.key && !!s.items[key];
  const onName = (v: string) => {
    setName(v);
    /* Kategorie se doplní z katalogu, dokud ji hráč sám nezmění. */
    const hit = catalogItems().find(x => x.name.toLowerCase() === v.trim().toLowerCase());
    if (hit && !touchedCat) setCategory(itemCategoryOf(hit.category));
  };
  const save = () => {
    if (!n) return;
    actions.itemSave({ name: n, category, ...(tier ? { tier } : {}), count }, item?.key);
    onClose();
  };
  return (
    <Dialog title={item ? t('equip.dialogEdit') : t('equip.dialogNew')} onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" disabled={!n || count < 1} onClick={save}>{t('common.save')}</Btn></>}>
      <div className="field">
        <label className="field-label" htmlFor="equip-name">{t('common.name')}</label>
        <input id="equip-name" className="input" list="equip-names" value={name} maxLength={120} onChange={e => onName(e.target.value)} />
        <datalist id="equip-names">{names.map(x => <option key={x} value={x} />)}</datalist>
        <span className="hint">{t('equip.nameHint')}</span>
      </div>
      <div className="form-grid">
        <Select label={t('inv.category')} value={category} onChange={v => { setCategory(v as ItemCategory); setTouchedCat(true); }}
          options={ITEM_CATEGORIES.map(c => ({ value: c, label: t(catKey(c)) }))} />
        <Select label={t('equip.tier')} value={tier} onChange={v => setTier(v as ItemTier | '')}
          options={[{ value: '', label: t('equip.noTier') }, ...ITEM_TIERS.map(x => ({ value: x, label: x }))]} />
        <Stepper label={t('equip.count')} hideLabel={false} value={count} min={1} max={LIMITS.inventory[1]} onChange={setCount} />
      </div>
      {clash && <p className="amber">{t('equip.exists')}</p>}
    </Dialog>
  );
}

export default function Equipment() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState<ItemStock | null | undefined>(undefined);
  const all = Object.values(s.items);
  const rows = all.filter(x => (!cat || x.category === cat) && (!q || `${x.name} ${x.tier || ''} ${t(catKey(x.category))}`.toLowerCase().includes(q.toLowerCase())));
  const byCat = ITEM_CATEGORIES.map(c => ({ c, list: rows.filter(x => x.category === c).sort((a, b) => a.name.localeCompare(b.name) || (a.tier || '').localeCompare(b.tier || '')) })).filter(g => g.list.length);
  const pcs = all.reduce((a, x) => a + x.count, 0);
  return (
    <Panel title={t('equip.title')} flush actions={<Btn size="sm" icon={Plus} onClick={() => setEdit(null)}>{t('equip.add')}</Btn>}>
      <p className="meta" style={{ padding: '0 16px' }}>{t('equip.hint')}</p>
      {all.length === 0 ? <Empty action={<Btn icon={Plus} onClick={() => setEdit(null)}>{t('equip.add')}</Btn>}>{t('equip.empty')}</Empty> : (
        <>
          <div className="filter-bar" style={{ padding: '0 16px' }}>
            <Search label={t('equip.search')} value={q} onChange={setQ} placeholder={t('equip.searchPh')} />
            <div style={{ width: 200 }}><Select label={t('inv.category')} value={cat} onChange={setCat} options={[{ value: '', label: t('equip.allCats') }, ...ITEM_CATEGORIES.map(c => ({ value: c, label: t(catKey(c)) }))]} /></div>
            <span className="meta" aria-live="polite" data-testid="equip-summary">{t('equip.summary', { count: all.length, pcs })}</span>
            {(q || cat) && <Btn size="sm" variant="ghost" onClick={() => { setQ(''); setCat(''); }}>{t('filter.clear')}</Btn>}
          </div>
          {rows.length === 0 ? <Empty action={<Btn onClick={() => { setQ(''); setCat(''); }}>{t('filter.clear')}</Btn>}>{t('filter.none')}</Empty> : (
            <div className="table-wrap tall">
              <table className="table mat-table equip-table">
                <thead><tr><th>{t('common.name')}</th><th>{t('equip.tier')}</th><th className="num">{t('equip.count')}</th><th>{t('advice.col')}</th><th className="actions-cell"><span className="sr-only">{t('inv.actions')}</span></th></tr></thead>
                {byCat.map(({ c, list }) => (
                  <tbody key={c} data-category={c}>
                    <tr className="group-row"><th colSpan={5} scope="colgroup">{t(catKey(c))} <span className="meta">· {fmt(list.reduce((a, x) => a + x.count, 0))}</span></th></tr>
                    {list.map(x => {
                      const label = x.tier ? `${x.name} ${x.tier}` : x.name;
                      return (
                        <tr key={x.key} data-item={x.key}>
                          <td><ItemLink name={x.key}><b className="wrap">{x.name}</b></ItemLink></td>
                          <td>{x.tier ? <Badge>{x.tier}</Badge> : <span className="muted">—</span>}</td>
                          <td className="num"><span className="with-prov"><Stepper label={t('equip.countAria', { name: label })} value={x.count} min={1} max={LIMITS.inventory[1]} onChange={v => actions.itemSetCount(x.key, v)} /><ProvDot rec={provOf(s, 'items', x.key)} /></span></td>
                          <td className="advice-cell"><AdviceCell advice={d.advice.get(x.key)} label={label} /></td>
                          <td className="actions-cell"><span className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                            <IconBtn ghost label={t('equip.editAria', { name: label })} icon={Pencil} onClick={() => setEdit(x)} />
                            <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('equip.deleteTitle')} text={t('equip.deleteText', { name: label })}
                              confirmLabel={t('common.delete')} onConfirm={() => actions.itemDelete(x.key)}><span className="sr-only">{t('equip.deleteAria', { name: label })}</span></ConfirmButton>
                          </span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </>
      )}
      {edit !== undefined && <ItemDialog item={edit} onClose={() => setEdit(undefined)} />}
    </Panel>
  );
}
