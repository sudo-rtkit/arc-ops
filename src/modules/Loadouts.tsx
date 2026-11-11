/* Loadout Planner (záložka Weapons): uložené sestavy a jejich výsledky z Raid Journalu. */
import { useState } from 'react';
import { Copy, Crosshair, Pencil, Plus, Trash2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { useUi } from '../store/ui';
import { Badge, Btn, ConfirmButton, Dialog, Empty, IconBtn, Panel, Select } from '../ui/components';
import { ItemList, itemsText } from '../ui/ItemList';
import { DASH, fmt, pct } from '../ui/format';
import { LOADOUT_PURPOSES, loadoutStats } from '../core/loadouts';
import { purposeLabel } from '../core/gametext';
import { TIER_ORDER } from '../core/data/weapons';
import type { Loadout } from '../core/types';
import { useT } from '../i18n/react';

const tierIdx = (t: string): number => { const i = (TIER_ORDER as readonly string[]).indexOf(t); return i < 0 ? 9 : i; };

function LoadoutDialog({ l, onClose }: { l: Loadout | null; onClose: () => void }) {
  const d = useDerived();
  const t = useT();
  const [f, setF] = useState<Partial<Loadout>>(l || { name: '', purpose: 'Money run', primary: '', secondary: '', augment: '', shield: '', items: [], note: '' });
  const weaponOpts = [{ value: '', label: t('loadout.none') }, ...[...d.weapons].sort((a, b) => tierIdx(a.tier) - tierIdx(b.tier) || a.name.localeCompare(b.name))
    .map(w => ({ value: w.id, label: `${w.name}${w.tier ? ' · ' + w.tier : ''}${w.antiArc ? ' · anti-ARC' : ''}` }))];
  for (const k of ['primary', 'secondary'] as const) if (f[k] && !d.weapons.some(w => w.id === f[k])) weaponOpts.push({ value: f[k]!, label: t('loadout.missingWeapon', { name: f[k]! }) });
  const purposes = [...LOADOUT_PURPOSES, ...(f.purpose && !LOADOUT_PURPOSES.includes(f.purpose) ? [f.purpose] : [])];
  const save = () => { actions.saveLoadout({ ...f, id: l?.id }); onClose(); };
  return (
    <Dialog title={l ? t('loadout.editTitle', { name: l.name }) : t('loadout.new')} size="wide" onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" disabled={!f.name?.trim()} onClick={save}>{t('loadout.save')}</Btn></>}>
      <div className="form-grid">
        <div className="field"><label className="field-label" htmlFor="lo-name">{t('common.name')}</label><input id="lo-name" className="input" value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <Select label={t('loadout.purpose')} value={f.purpose || ''} onChange={v => setF({ ...f, purpose: v })} options={[{ value: '', label: t('common.notSpecified') }, ...purposes.map(p => ({ value: p, label: purposeLabel(p, t.lang) }))]} />
        <Select label={t('loadout.primary')} value={f.primary || ''} onChange={v => setF({ ...f, primary: v })} options={weaponOpts} />
        <Select label={t('loadout.secondary')} value={f.secondary || ''} onChange={v => setF({ ...f, secondary: v })} options={weaponOpts} />
        <div className="field"><label className="field-label" htmlFor="lo-aug">Augment</label><input id="lo-aug" className="input" value={f.augment} maxLength={80} onChange={e => setF({ ...f, augment: e.target.value })} /></div>
        <div className="field"><label className="field-label" htmlFor="lo-sh">{t('loadout.shield')}</label><input id="lo-sh" className="input" value={f.shield} maxLength={80} onChange={e => setF({ ...f, shield: e.target.value })} /></div>
      </div>
      <ItemList label={t('loadout.items')} items={f.items || []} onChange={items => setF({ ...f, items })} empty={t('loadout.itemsEmpty')} max={40} />
      <div className="field"><label className="field-label" htmlFor="lo-note">{t('common.note')}</label><textarea id="lo-note" className="textarea" value={f.note} maxLength={2000} onChange={e => setF({ ...f, note: e.target.value })} /></div>
      <p className="meta">{t('loadout.formHint')}</p>
    </Dialog>
  );
}

export default function Loadouts() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const openRaid = useUi(x => x.openRaidForm);
  const [edit, setEdit] = useState<Loadout | null | undefined>(undefined);
  const stats = Object.fromEntries(loadoutStats(s.raids).map(x => [x.id, x]));
  const none = stats[''];
  return (
    <div className="stack">
      <Panel title={t('loadout.title')} actions={<Btn size="sm" variant="primary" icon={Plus} onClick={() => setEdit(null)}>{t('loadout.new')}</Btn>}>
        {s.loadouts.length === 0 ? <Empty icon={Crosshair} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit(null)}>{t('loadout.new')}</Btn>}>{t('loadout.empty')}</Empty> : (
          <div className="cards">
            {s.loadouts.map(l => {
              const st = stats[l.id];
              return (
                <div key={l.id} className="panel">
                  <div className="panel-body stack-sm">
                    <div className="row"><h3 className="grow wrap">{l.name}</h3>{l.purpose && <Badge>{purposeLabel(l.purpose, t.lang)}</Badge>}</div>
                    <dl className="dl">
                      <dt>{t('loadout.weapons')}</dt><dd>{[l.primary, l.secondary].filter(Boolean).map(d.weaponName).join(' + ') || DASH}</dd>
                      <dt>Augment</dt><dd>{l.augment || DASH}</dd>
                      <dt>{t('loadout.shield')}</dt><dd>{l.shield || DASH}</dd>
                      <dt>{t('loadout.gear')}</dt><dd className="wrap">{l.items.length ? itemsText(l.items) : DASH}</dd>
                      <dt>{t('loadout.results')}</dt><dd>{st ? t('loadout.resultsVal', { count: st.n, rate: pct(st.rate), ph: st.perHour ? fmt(st.perHour) + ' / h' : DASH, lost: st.lost }) : t('loadout.noRaid')}</dd>
                    </dl>
                    {l.note && <p className="meta wrap">{l.note}</p>}
                    <div className="row">
                      <Btn size="sm" variant="primary" icon={Plus} onClick={() => openRaid({ preset: { loadout: l.id } })}>{t('loadout.logRaid')}</Btn>
                      <IconBtn label={t('loadout.editAria', { name: l.name })} icon={Pencil} onClick={() => setEdit(l)} />
                      <IconBtn label={t('loadout.dupAria', { name: l.name })} icon={Copy} onClick={() => actions.duplicateLoadout(l.id)} />
                      <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('loadout.delete')} confirmLabel={t('loadout.delete')}
                        text={<p>{t('loadout.deleteQ', { name: l.name })} {st ? t('loadout.deleteRaids', { count: st.n }) : ''}</p>} onConfirm={() => actions.deleteLoadout(l.id)}><span className="sr-only">{t('common.deleteItem', { name: l.name })}</span></ConfirmButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {none && s.loadouts.length > 0 && <p className="meta">{t('loadout.without', { count: none.n, rate: pct(none.rate) })}</p>}
      </Panel>
      {edit !== undefined && <LoadoutDialog l={edit} onClose={() => setEdit(undefined)} />}
    </div>
  );
}
