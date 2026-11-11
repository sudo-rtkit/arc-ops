import { useMemo, useState } from 'react';
import { Bot, CircleCheck, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { actions, navigate, useAppState, useDerived } from '../store';
import { Badge, Btn, Dialog, Empty, IconBtn, PageHead, Panel, Search, Select, Stepper, Tabs, cx } from '../ui/components';
import { fmt } from '../ui/format';
import { MATERIAL_CATEGORIES } from '../core/data/materials';
import { OTHER_CATEGORY, categoryLabel, gameTexts, sourceLabel } from '../core/gametext';
import { LIMITS } from '../core/state';
import type { Material } from '../core/types';
import type { ShoppingRow } from '../core/workshop';
import Planner from './Planner';
import ScreenImport from './ScreenImport';
import Equipment from './Equipment';
import { useT } from '../i18n/react';

type Tab = 'stock' | 'equipment' | 'import' | 'shopping' | 'hunt' | 'planner';
type Show = 'all' | 'have' | 'needed' | 'missing' | 'surplus';

/* Kategorie a původ se ukládají v původní (české) podobě; zobrazují se přeložené. Nezměněné pole se uloží beze změny. */
function MaterialDialog({ mat, onClose }: { mat: Material | null; onClose: () => void }) {
  const gd = useAppState().gameData;
  const t = useT();
  const shownSource = mat ? sourceLabel(mat.name, mat.source, t.lang) : '';
  const [name, setName] = useState(mat?.name || '');
  const [category, setCategory] = useState(mat?.category || OTHER_CATEGORY);
  const [source, setSource] = useState(shownSource);
  const isNew = !mat;
  const edited = mat && !!gd.materials[mat.name];
  const save = () => {
    const src = mat && source === shownSource ? mat.source : source;
    if (isNew) actions.addCustomMaterial(name, category, src);
    else actions.setMaterialMeta(mat!.name, { category, source: src });
    onClose();
  };
  return (
    <Dialog title={isNew ? t('inv.addCustom') : t('common.editItem', { name: mat!.name })} onClose={onClose}
      footer={<>
        {edited && <Btn icon={Undo2} onClick={() => { actions.setMaterialMeta(mat!.name, null); onClose(); }}>{t('check.restore')}</Btn>}
        {mat?.custom && <Btn variant="danger" icon={Trash2} onClick={() => { actions.deleteCustomMaterial(mat.name); onClose(); }}>{t('inv.deleteMat')}</Btn>}
        <Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" disabled={isNew && !name.trim()} onClick={save}>{t('common.save')}</Btn>
      </>}>
      {isNew && <div className="field"><label className="field-label" htmlFor="mname">{t('common.name')}</label><input id="mname" className="input" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></div>}
      <Select label={t('inv.category')} value={category} onChange={setCategory} options={[...new Set([...MATERIAL_CATEGORIES, category])].map(c => ({ value: c, label: categoryLabel(c, t.lang) }))} />
      <div className="field"><label className="field-label" htmlFor="msrc">{t('inv.source')}</label><input id="msrc" className="input" value={source} maxLength={200} onChange={e => setSource(e.target.value)} placeholder="Loot" /><span className="hint">{t('inv.sourceHint')}</span></div>
    </Dialog>
  );
}

function ShoppingTable({ rows }: { rows: ShoppingRow[] }) {
  const t = useT();
  return (
    <div className="table-wrap tall">
      <table className="table mat-table">
        <thead><tr><th>{t('inv.material')}</th><th className="num">{t('inv.have')}</th><th className="num">{t('inv.need')}</th><th className="num">{t('inv.missing')}</th><th>{t('inv.source')}</th><th>{t('inv.for')}</th></tr></thead>
        <tbody>{rows.map(x => (
          <tr key={x.mat}>
            <td><b>{x.mat}</b> {x.arc && <Badge>{t('inv.arcPart')}</Badge>}</td>
            <td className="num"><Stepper label={t('ws.have', { name: x.mat })} value={x.have} min={0} max={LIMITS.inventory[1]} onChange={v => actions.invSet(x.mat, v)} /></td>
            <td className="num">{fmt(x.need)}</td>
            <td className={cx('num', x.missing ? 'amber' : 'success')}>{x.missing ? fmt(x.missing) : <><span className="sr-only">{t('inv.nothing')} </span>✓</>}</td>
            <td>{sourceLabel(x.mat, x.src, t.lang)}</td><td className="muted wrap">{x.uses.join(', ')}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Stock() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [edit, setEdit] = useState<Material | null | undefined>(undefined);
  const needBy = useMemo(() => Object.fromEntries(d.shop.map(x => [x.mat, x])), [d.shop]);
  const rows = d.materials.filter(m => {
    const have = s.inventory[m.name] || 0, need = needBy[m.name]?.need || 0;
    if (q && !(m.name + ' ' + m.source + ' ' + m.category + ' ' + sourceLabel(m.name, m.source, t.lang) + ' ' + categoryLabel(m.category, t.lang)).toLowerCase().includes(q.toLowerCase())) return false;
    if (cat && m.category !== cat) return false;
    if (show === 'have') return have > 0;
    if (show === 'needed') return need > 0;
    if (show === 'missing') return need > have;
    if (show === 'surplus') return have > need && have > 0;
    return true;
  });
  const cats = [...new Set(d.materials.map(m => m.category))].sort((a, b) => categoryLabel(a, t.lang).localeCompare(categoryLabel(b, t.lang)));
  const clear = () => { setQ(''); setCat(''); setShow('all'); };
  return (
    <Panel title={t('inv.stockTitle')} flush actions={<Btn size="sm" icon={Plus} onClick={() => setEdit(null)}>{t('inv.customMat')}</Btn>}>
      <div className="filter-bar" style={{ padding: '0 16px' }}>
        <Search label={t('inv.search')} value={q} onChange={setQ} placeholder={t('inv.searchPh')} />
        <div style={{ width: 200 }}><Select label={t('inv.category')} value={cat} onChange={setCat} options={[{ value: '', label: t('inv.allCats') }, ...cats.map(c => ({ value: c, label: categoryLabel(c, t.lang) }))]} /></div>
        <div style={{ width: 220 }}><Select label={t('inv.show')} value={show} onChange={v => setShow(v as Show)} options={[
          { value: 'all', label: t('inv.show.all') }, { value: 'have', label: t('inv.show.have') }, { value: 'needed', label: t('inv.show.needed') },
          { value: 'missing', label: t('inv.show.missing') }, { value: 'surplus', label: t('inv.show.surplus') },
        ]} /></div>
        <span className="meta" aria-live="polite">{t('inv.countOf', { n: rows.length, total: d.materials.length })}</span>
        {(q || cat || show !== 'all') && <Btn size="sm" variant="ghost" onClick={clear}>{t('filter.clear')}</Btn>}
      </div>
      <p className="meta" style={{ padding: '0 16px' }}>{t('inv.needHint')}</p>
      {rows.length === 0 ? <Empty action={<Btn onClick={clear}>{t('filter.clear')}</Btn>}>{t('filter.none')}</Empty> : (
        <div className="table-wrap tall">
          <table className="table mat-table">
            <thead><tr><th>{t('common.name')}</th><th>{t('inv.category')}</th><th className="num">{t('inv.have')}</th><th className="num">{t('inv.need')}</th><th className="num">{t('inv.missing')}</th><th>{t('inv.source')}</th><th>{t('inv.for')}</th><th className="actions-cell"><span className="sr-only">{t('inv.actions')}</span></th></tr></thead>
            <tbody>{rows.map(m => {
              const have = s.inventory[m.name] || 0, sh = needBy[m.name];
              const missing = sh ? sh.missing : 0;
              return (
                <tr key={m.name}>
                  <td><b className="wrap">{m.name}</b> {m.custom && <Badge tone="accent">{t('origin.vlastni')}</Badge>}</td>
                  <td>{categoryLabel(m.category, t.lang)}</td>
                  <td className="num"><Stepper label={t('ws.have', { name: m.name })} value={have} min={0} max={LIMITS.inventory[1]} onChange={v => actions.invSet(m.name, v)} /></td>
                  <td className="num">{sh ? fmt(sh.need) : <span className="muted">0</span>}</td>
                  <td className={cx('num', missing > 0 && 'amber')}>{missing > 0 ? fmt(missing) : <span className="muted">0</span>}</td>
                  <td className="wrap">{sourceLabel(m.name, m.source, t.lang)}</td>
                  <td className="muted wrap">{sh ? sh.uses.join(', ') : ''}</td>
                  <td className="actions-cell"><IconBtn ghost label={t('loadout.editAria', { name: m.name })} icon={Pencil} onClick={() => setEdit(m)} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {edit !== undefined && <MaterialDialog mat={edit} onClose={() => setEdit(undefined)} />}
    </Panel>
  );
}

function Hunt() {
  const d = useDerived();
  const t = useT();
  const arc = d.shop.filter(x => x.missing > 0 && x.arc);
  const groups: Record<string, ShoppingRow[]> = {};
  for (const x of arc) { const src = sourceLabel(x.mat, x.src, t.lang); (groups[src.replace(/^ARC:?\s*/, '') || src] ||= []).push(x); }
  return (
    <Panel title={t('inv.hunt')} actions={<a className="link-btn" href="#arc/needed">ARC Database</a>}>
      <p className="meta">{t('inv.huntHint')}</p>
      {arc.length === 0 ? <Empty icon={CircleCheck}><span className="success">{t('inv.huntDone')}</span></Empty> : (
        <div className="cards">
          {Object.entries(groups).map(([machine, list]) => (
            <div key={machine} className="panel hunt-card">
              <div className="panel-body">
                <div className="row"><Bot size={18} aria-hidden="true" className="accent" /><h3 className="grow">{machine}</h3></div>
                {list.map(x => <div key={x.mat} className="row between"><span>{x.mat}</span><Badge tone="amber">{t('inv.missingN', { n: x.missing })}</Badge></div>)}
                <span className="meta">{list.flatMap(x => x.uses).join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function Inventory({ sub }: { sub: string }) {
  const d = useDerived();
  const t = useT();
  const tab: Tab = sub === 'equipment' || sub === 'import' || sub === 'shopping' || sub === 'hunt' || sub === 'planner' ? sub : 'stock';
  const missing = d.shop.filter(x => x.missing > 0);
  return (
    <div className="page">
      <PageHead title="Inventory" sub={t('inv.sub')} />
      <Tabs label="Inventory" value={tab} onChange={v => navigate('inventory', v === 'stock' ? '' : v)}
        tabs={[{ id: 'stock', label: t('inv.tab.stock') }, { id: 'equipment', label: t('inv.tab.equipment') }, { id: 'import', label: t('inv.tab.import') }, { id: 'shopping', label: <>{t('inv.tab.shopping')} {missing.length > 0 && <Badge tone="amber">{missing.length}</Badge>}</> }, { id: 'hunt', label: t('inv.hunt') }, { id: 'planner', label: <>Material Planner {d.plan.some(x => x.missing > 0) && <Badge tone="amber">{d.plan.filter(x => x.missing > 0).length}</Badge>}</> }]} />
      {tab === 'stock' && <Stock />}
      {tab === 'equipment' && <Equipment />}
      {tab === 'import' && <ScreenImport />}
      {tab === 'shopping' && (
        <Panel title={t('inv.shoppingTitle')} flush actions={<span className="meta">{t('inv.shoppingMissing', { count: missing.length })}</span>}>
          <p className="meta" style={{ padding: '0 16px' }}>{gameTexts(t.lang).shoppingHint}</p>
          {missing.some(x => x.arc) && (
            <div className="row" style={{ padding: '0 16px' }}><b>{t('inv.huntLabel')}</b>{missing.filter(x => x.arc).map(x => <Badge key={x.mat} tone="amber">{sourceLabel(x.mat, x.src, t.lang).replace('ARC: ', '')} · {x.missing}× {x.mat}</Badge>)}</div>
          )}
          {d.shop.length === 0 ? <Empty icon={CircleCheck}>{t('inv.allMax')}</Empty> : missing.length === 0 ? (
            <><Empty icon={CircleCheck}><span className="success">{t('inv.enough')}</span><br /><span className="meta">{t('inv.enoughNote')}</span></Empty><ShoppingTable rows={d.shop} /></>
          ) : <ShoppingTable rows={d.shop} />}
        </Panel>
      )}
      {tab === 'hunt' && <Hunt />}
      {tab === 'planner' && <Planner />}
    </div>
  );
}
