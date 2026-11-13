/* Material Planner (záložka Inventory): cílové úrovně stanic, crafting, vlastní cíle a cíle z Goal Trackeru.
   Jen plánuje; materiál odečítá až upgrade ve Workshopu. */
import { useState } from 'react';
import { CircleCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, ConfirmButton, Dialog, Empty, IconBtn, Panel, Select, Stepper, cx } from '../ui/components';
import { ItemList, itemsText } from '../ui/ItemList';
import { fmt } from '../ui/format';
import { planSummary } from '../core/planner';
import { sourceLabel } from '../core/gametext';
import { LIMITS } from '../core/state';
import type { ItemQty, PlannerItem } from '../core/types';
import { useT } from '../i18n/react';
import { ItemLink } from '../ui/ItemCard';

function ItemDialog({ item, onClose }: { item: PlannerItem | null; onClose: () => void }) {
  const d = useDerived();
  const t = useT();
  const [name, setName] = useState(item?.name || '');
  const [kind, setKind] = useState<PlannerItem['kind']>(item?.kind || 'craft');
  const [qty, setQty] = useState(String(item?.qty || 1));
  const [mats, setMats] = useState<ItemQty[]>(item?.mats || []);
  const save = () => {
    const data = { name, kind, qty: kind === 'custom' ? 1 : Math.max(1, Math.min(999, Math.round(Number(qty) || 1))), mats };
    if (item) actions.updatePlannerItem(item.id, data); else actions.addPlannerItem(data);
    onClose();
  };
  return (
    <Dialog title={item ? t('plan.editItem') : t('plan.addTitle')} onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" disabled={!name.trim() || !mats.length} onClick={save}>{t('common.save')}</Btn></>}>
      <Select label={t('plan.kind')} value={kind} onChange={v => setKind(v as PlannerItem['kind'])} options={[{ value: 'craft', label: t('plan.kind.craft') }, { value: 'custom', label: t('plan.kind.custom') }]} />
      <div className="form-grid">
        <div className="field"><label className="field-label" htmlFor="pi-name">{t('common.name')}</label><input id="pi-name" className="input" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder={kind === 'craft' ? t('plan.namePhCraft') : t('plan.namePhCustom')} /></div>
        {kind === 'craft' && <div className="field"><label className="field-label" htmlFor="pi-qty">{t('plan.howMany')}</label><input id="pi-qty" className="input num-input" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} /></div>}
      </div>
      <ItemList label={kind === 'craft' ? t('plan.matsPerPiece') : t('plan.matsNeeded')} items={mats} onChange={setMats} suggestions={d.materials.map(m => m.name)} empty={t('plan.matsEmpty')} max={30} />
      <p className="meta">{t('plan.craftHint')}</p>
    </Dialog>
  );
}

export default function Planner() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [edit, setEdit] = useState<PlannerItem | null | undefined>(undefined);
  const sum = planSummary(d.plan);
  const rows = d.plan.filter(r => !onlyMissing || r.missing > 0);
  const planned = d.targets.filter(x => x.target > x.current);
  return (
    <div className="stack">
      {/* Souhrn je stejný výpočet jako v tabulce Součet materiálu níže (jediný planSummary), jen vidět hned nahoře. */}
      <Panel title={t('plan.summary')} className="planner-summary" id="planner-summary">
        <div className="stats-row">
          <div className="stat"><span className="label">{t('plan.matsInPlan')}</span><span className="stat-val">{sum.rows}</span></div>
          <div className="stat"><span className="label">{t('plan.needTotal')}</span><span className="stat-val">{fmt(sum.need)}</span></div>
          <div className="stat"><span className="label">{t('inv.missing')}</span><span className="stat-val amber">{fmt(sum.missing)}</span></div>
          <div className="stat"><span className="label">{t('plan.contention')}</span><span className="stat-val">{sum.contention}</span></div>
        </div>
        <p className="meta">{t('plan.contentionHint')}{sum.blockedLevels ? ' ' + t('plan.blockedLevels', { count: sum.blockedLevels }) : ''} {t('plan.levels', { list: planned.length ? planned.map(x => `${x.station.name} ${x.current}→${x.target}`).join(', ') : t('plan.levelsNone') })}</p>
      </Panel>

      <Panel title={t('plan.targets')} flush className="planner-targets"
        actions={<><Btn size="sm" onClick={() => actions.plannerAll('next')}>{t('plan.allNext')}</Btn><Btn size="sm" onClick={() => actions.plannerAll('max')}>{t('plan.allMax')}</Btn><Btn size="sm" variant="ghost" disabled={!Object.keys(s.planner.stations).length} onClick={() => actions.plannerAll('clear')}>{t('plan.clearTargets')}</Btn></>}>
        <div style={{ padding: '0 16px' }}>
          <label className="toggle"><input type="checkbox" checked={s.planner.includeGoals} onChange={e => actions.setPlannerIncludeGoals(e.target.checked)} />{t('plan.includeGoals')}</label>
          <label className="toggle"><input type="checkbox" checked={s.planner.includeQuests} onChange={e => actions.setPlannerIncludeQuests(e.target.checked)} />{t('plan.includeQuests')}</label>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{t('plan.station')}</th><th className="num">{t('plan.now')}</th><th>{t('plan.planTarget')}</th><th>{t('plan.fromGoals')}</th><th className="num">{t('plan.plannedLevel')}</th></tr></thead>
          <tbody>{d.targets.map(x => {
            const levels = Array.from({ length: x.station.max - x.current + 1 }, (_, i) => x.current + i);
            return (
              <tr key={x.station.id} className={x.target > x.current ? 'selected' : ''}>
                <td><b>{x.station.name}</b></td>
                <td className="num">{x.current} / {x.station.max}</td>
                <td>{x.current >= x.station.max ? <span className="muted">{t('plan.atMax')}</span> : (
                  <Select hideLabel label={t('plan.planTargetOf', { name: x.station.name })} value={String(Math.max(x.current, x.fromPlan))} onChange={v => actions.setPlannerTarget(x.station.id, Number(v))}
                    options={levels.map(l => ({ value: String(l), label: l === x.current ? t('plan.noPlan') : t('plan.level', { n: l }) }))} />
                )}</td>
                <td className="meta wrap">{x.goalTitles.length ? `${x.fromGoals} · ${x.goalTitles.join(', ')}` : '—'}</td>
                <td className="num"><b>{x.target}</b></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <p className="meta" style={{ padding: '8px 16px 16px' }}>{t('plan.targetsHint')}</p>
      </Panel>

      <Panel title={t('plan.items')} actions={<Btn size="sm" icon={Plus} onClick={() => setEdit(null)}>{t('common.add')}</Btn>}>
        {s.planner.items.length === 0 ? <Empty>{t('plan.itemsEmpty')}</Empty> : (
          <div className="list-rows">{s.planner.items.map(it => (
            <div key={it.id} className="list-row">
              <span className="grow"><b>{it.name}</b> <Badge>{it.kind === 'craft' ? t('plan.craftBadge', { n: it.qty }) : t('plan.customBadge')}</Badge>
                <small>{itemsText(it.mats)}{it.kind === 'craft' && it.qty > 1 ? ' · ' + t('plan.perPiece') : ''}</small></span>
              <IconBtn label={t('loadout.editAria', { name: it.name })} icon={Pencil} onClick={() => setEdit(it)} />
              <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('plan.removeTitle')} confirmLabel={t('plan.remove')} text={<p>{t('plan.removeText', { name: it.name })}</p>} onConfirm={() => actions.deletePlannerItem(it.id)}><span className="sr-only">{t('plan.removeAria', { name: it.name })}</span></ConfirmButton>
            </div>
          ))}</div>
        )}
      </Panel>

      <Panel title={t('plan.total')} flush actions={<label className="toggle"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />{t('inv.show.missing')}</label>}>
        {d.plan.length === 0 ? <Empty icon={CircleCheck}>{t('plan.empty')}</Empty> : rows.length === 0 ? <Empty icon={CircleCheck}><span className="success">{t('plan.enough')}</span></Empty> : (
          <div className="table-wrap tall"><table className="table mat-table">
            <thead><tr><th>{t('inv.material')}</th><th className="num">{t('inv.have')}</th><th className="num">{t('plan.needCol')}</th><th className="num">{t('inv.missing')}</th><th>{t('inv.source')}</th><th>{t('plan.forNoDup')}</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.mat}>
                <td><ItemLink name={r.mat}><b>{r.mat}</b></ItemLink> {r.arc && <Badge>{t('inv.arcPart')}</Badge>} {r.contention && <Badge tone="amber">{t('plan.contention')}</Badge>}</td>
                <td className="num"><Stepper label={t('ws.have', { name: r.mat })} value={r.have} min={0} max={LIMITS.inventory[1]} onChange={v => actions.invSet(r.mat, v)} /></td>
                <td className="num">{fmt(r.need)}</td>
                <td className={cx('num', r.missing ? 'amber' : 'success')}>{r.missing ? fmt(r.missing) : <><span className="sr-only">{t('inv.nothing')} </span>✓</>}</td>
                <td className="wrap">{sourceLabel(r.mat, r.src, t.lang)}</td>
                <td className="muted wrap">{r.sources.map(x => `${x.label}: ${fmt(x.qty)}${x.blocked ? ' (' + x.blocked.toLowerCase() + ')' : ''}`).join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
      {edit !== undefined && <ItemDialog item={edit} onClose={() => setEdit(undefined)} />}
    </div>
  );
}
