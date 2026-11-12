import { useState } from 'react';
import { ArrowDownToLine, BookOpen, Check as CheckIcon, ChevronDown, ChevronRight, Pencil, Plus, Trash2, Undo2, X } from 'lucide-react';
import { actions, app, useAppState, useDerived } from '../store';
import { useUi } from '../store/ui';
import { Badge, Btn, Check, Confirm, Empty, IconBtn, PageHead, Panel, Search, Select } from '../ui/components';
import { itemsText } from '../ui/ItemList';
import { fmt, fmtDate, fmtMinutes, fmtTime } from '../ui/format';
import { MAPS } from '../core/data/maps';
import { raidTypes, filterRaids, runStats, raidTypeName } from '../core/runs';
import { lootDelta, lootState } from '../core/raidItems';
import type { Raid, RaidType } from '../core/types';
import { mapName } from './shared';
import { useT } from '../i18n/react';

function LootStatus({ r }: { r: Raid }) {
  const t = useT();
  const st = lootState(r.loot, r.lootApplied);
  if (st === 'none') return null;
  if (st === 'applied') return <Badge tone="success">{t('journal.lootApplied')}</Badge>;
  if (st === 'changed') return <Badge tone="amber">{t('journal.lootChanged')}</Badge>;
  return <Badge tone="accent">{t('journal.lootPending')}</Badge>;
}

function RaidDetail({ r }: { r: Raid }) {
  const d = useDerived();
  const s = useAppState();
  const t = useT();
  const st = lootState(r.loot, r.lootApplied);
  const delta = lootDelta(r.loot, r.lootApplied);
  const goals = r.goals.map(id => s.goals.find(g => g.id === id)?.title || id);
  return (
    <div className="raid-detail stack-sm">
      <dl className="dl">
        <dt>Loadout</dt><dd>{r.loadout ? d.loadoutName(r.loadout) : <span className="muted">{t('journal.noLoadout')}</span>}</dd>
        <dt>{t('loadout.gear')}</dt><dd className="wrap">{r.gear.length ? itemsText(r.gear) : <span className="muted">{t('journal.notRecorded')}</span>}</dd>
        <dt>{t('journal.lostGear')}</dt><dd className="wrap">{r.lost.length ? <span className="danger">{itemsText(r.lost)}</span> : <span className="muted">{t('items.empty')}</span>}</dd>
        <dt>{t('journal.loot')}</dt><dd className="wrap">{r.loot.length ? itemsText(r.loot) : <span className="muted">{t('journal.notRecorded')}</span>}</dd>
        {r.lootApplied.length > 0 && <><dt>{t('journal.moved')}</dt><dd className="wrap">{itemsText(r.lootApplied)}</dd></>}
        <dt>{t('journal.goalsDone')}</dt><dd className="wrap">{goals.length ? goals.join(', ') : <span className="muted">{t('journal.none')}</span>}</dd>
        {r.notes && <><dt>{t('common.note')}</dt><dd className="wrap">{r.notes}</dd></>}
      </dl>
      {r.plan && <PlanDetail r={r} />}
      <div className="row">
        {(st === 'pending' || st === 'changed') && (
          <Btn size="sm" variant="primary" icon={ArrowDownToLine} onClick={() => {
            const dl = actions.applyRaidLoot(r.id);
            const parts = Object.entries(dl).map(([k, v]) => (v > 0 ? '+' : '') + v + ' ' + k);
            app.notify(parts.length ? 'Inventory: ' + parts.join(', ') : t('journal.nothingToMove'), parts.length ? 'success' : 'info');
          }}>{st === 'pending' ? t('journal.moveLoot') : t('journal.moveDiff')}</Btn>
        )}
        {st === 'changed' && <span className="meta">{t('journal.diff', { list: Object.entries(delta).map(([k, v]) => (v > 0 ? '+' : '') + v + ' ' + k).join(', ') })}</span>}
        {r.lootApplied.length > 0 && <Btn size="sm" icon={Undo2} onClick={() => actions.revertRaidLoot(r.id)}>{t('journal.revert')}</Btn>}
      </div>
      {st !== 'none' && <p className="meta">{t('journal.moveHint', { revert: t('journal.revert') })}</p>}
    </div>
  );
}

/* 0.15.0: plán uložený se záznamem (cíle, mapa, loadout, nalezené z plánu, hotové požadavky, hodnota). */
function PlanDetail({ r }: { r: Raid }) {
  const d = useDerived();
  const t = useT();
  const p = r.plan!;
  const found = p.items.reduce((a, i) => a + i.found, 0), need = p.items.reduce((a, i) => a + i.need, 0);
  const goals = [...p.goals, ...(p.money ? [t('raid.goal.money')] : [])];
  return (
    <section className="raid-plan" data-testid="journal-plan" aria-label={t('journal.plan')}>
      <h4>{t('journal.plan')}</h4>
      <dl className="dl">
        <dt>{t('journal.planGoals')}</dt><dd className="wrap">{goals.length ? goals.join(', ') : <span className="muted">{t('journal.none')}</span>}</dd>
        <dt>{t('journal.planMap')}</dt><dd>{p.map ? mapName(p.map) : '\u2014'}{' \u00b7 '}{p.loadout ? d.loadoutName(p.loadout) : t('journal.noLoadout')}</dd>
        <dt>{t('journal.planFound')}</dt><dd className="wrap" data-testid="journal-plan-found">{p.items.length
          ? <>{t('raid.eval.sum', { found, need })}: {p.items.map(i => `${i.mat} ${fmt(i.found)}/${fmt(i.need)}`).join(', ')}</>
          : <span className="muted">{t('raid.eval.empty')}</span>}</dd>
        {p.done.length > 0 && <><dt>{t('journal.planDone')}</dt><dd className="wrap success">{p.done.join(', ')}</dd></>}
        {p.value !== null && <><dt>{t('journal.planValue')}</dt><dd className="mono amber">{fmt(p.value)}</dd></>}
      </dl>
    </section>
  );
}

export default function Journal() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const open = useUi(st => st.openRaidForm);
  const [type, setType] = useState('');
  const [map, setMap] = useState('');
  const [result, setResult] = useState('');
  const [loadout, setLoadout] = useState('');
  const [q, setQ] = useState('');
  const [del, setDel] = useState<Raid | null>(null);
  const [revert, setRevert] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const text = (r: Raid) => [r.notes, ...(r.plan?.goals ?? []), d.routeName(r.route), mapName(r.map), itemsText(r.gear), itemsText(r.loot), itemsText(r.lost), r.loadout ? d.loadoutName(r.loadout) : ''].join(' ').toLowerCase();
  const rows = filterRaids(s.raids, { type: type as RaidType | '', map })
    .filter(r => (!result || (result === 'ok' ? r.ok : !r.ok)) && (!loadout || (loadout === '-' ? !r.loadout : r.loadout === loadout)) && (!q || text(r).includes(q.toLowerCase())))
    .sort((a, b) => b.ts - a.ts);
  const st = runStats(rows);
  const pending = s.raids.filter(r => ['pending', 'changed'].includes(lootState(r.loot, r.lootApplied))).length;
  const filtered = !!(type || map || result || q || loadout);
  const clear = () => { setType(''); setMap(''); setResult(''); setQ(''); setLoadout(''); };
  return (
    <div className="page">
      <PageHead title="Raid Journal" sub={t('journal.sub')}
        actions={<Btn variant="primary" icon={Plus} onClick={() => open()}>{t('raid.log')}</Btn>} />
      <div className="panel"><div className="panel-body">
        <div className="journal-filters">
          <Search label={t('journal.search')} value={q} onChange={setQ} />
          <Select label={t('journal.type')} value={type} onChange={setType} options={[{ value: '', label: t('journal.allTypes') }, ...raidTypes().map(([v, l]) => ({ value: v, label: l }))]} />
          <Select label={t('common.map')} value={map} onChange={setMap} options={[{ value: '', label: t('journal.allMaps') }, ...MAPS.map(m => ({ value: m.id, label: m.name }))]} />
          <Select label={t('chart.result')} value={result} onChange={setResult} options={[{ value: '', label: t('goals.show.all') }, { value: 'ok', label: t('chart.extract') }, { value: 'dead', label: t('chart.death') }]} />
          <Select label="Loadout" value={loadout} onChange={setLoadout} options={[{ value: '', label: t('journal.allLoadouts') }, { value: '-', label: t('journal.noLoadout') }, ...s.loadouts.map(l => ({ value: l.id, label: l.name }))]} />
          <div className="filters-clear">{filtered && <Btn size="sm" variant="ghost" onClick={clear}>{t('filter.clear')}</Btn>}</div>
        </div>
        <span className="meta" aria-live="polite">{t('journal.count', { count: rows.length })} · {t('journal.summary', { ok: st.ok, coins: st.coins })}{pending ? ' · ' + t('journal.pending', { count: pending }) : ''}</span>
      </div></div>
      <Panel title={t('nav.group.raids')} flush>
        {s.raids.length === 0 ? <Empty icon={BookOpen} action={<Btn variant="primary" icon={Plus} onClick={() => open()}>{t('raid.log')}</Btn>}>{t('journal.empty')}</Empty>
          : rows.length === 0 ? <Empty action={<Btn onClick={clear}>{t('filter.clear')}</Btn>}>{t('filter.none')}</Empty> : (
            <>
              <div className="table-wrap tall">
                <table className="table journal-table">
                  <thead><tr><th><span className="sr-only">{t('journal.detail')}</span></th><th>{t('chart.date')}</th><th>{t('common.map')}</th><th>{t('journal.routeType')}</th><th>{t('chart.result')}</th><th className="num">{t('import.row.coins')}</th><th className="num">{t('journal.minutes')}</th><th>{t('journal.gearLoot')}</th><th className="actions-cell">{t('inv.actions')}</th></tr></thead>
                  <tbody>{rows.slice(0, limit).flatMap(r => {
                    const isOpen = expanded === r.id;
                    const row = (
                      <tr key={r.id} className={isOpen ? 'selected' : ''}>
                        <td><IconBtn ghost label={t(isOpen ? 'journal.hideDetail' : 'journal.showDetail', { date: fmtDate(r.ts) })} icon={isOpen ? ChevronDown : ChevronRight} aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : r.id)} /></td>
                        <td className="mono date-cell"><span className="date">{fmtDate(r.ts)}</span> <span className="time">{fmtTime(r.ts)}</span></td>
                        <td>{mapName(r.map)}</td>
                        <td>{r.route ? d.routeName(r.route) : '—'}<br /><span className="meta">{raidTypeName(r.type)}{r.loadout ? ' · ' + d.loadoutName(r.loadout) : ''}</span></td>
                        <td>{r.ok ? <Badge tone="success"><CheckIcon size={12} aria-hidden="true" />{t('chart.extract')}</Badge> : <Badge tone="danger"><X size={12} aria-hidden="true" />{t('chart.death')}</Badge>}</td>
                        <td className="num amber">{fmt(r.coins)}</td>
                        <td className="num">{fmtMinutes(r.min)}</td>
                        <td className="wrap meta items-cell">
                          {r.loot.length > 0 && <>{t('journal.lootLbl', { list: itemsText(r.loot) })}<br /></>}
                          {r.lost.length > 0 && <span className="danger">{t('journal.lostLbl', { list: itemsText(r.lost) })}<br /></span>}
                          {r.goals.length > 0 && <>{t('journal.goalsLbl', { n: r.goals.length })}<br /></>}
                          {r.plan && <Badge tone="accent">{t('journal.planBadge', { found: r.plan.items.reduce((a, i) => a + i.found, 0), need: r.plan.items.reduce((a, i) => a + i.need, 0) })}</Badge>}
                          <LootStatus r={r} />
                          {!r.loot.length && !r.lost.length && !r.goals.length && !r.plan && r.notes}
                        </td>
                        <td className="actions-cell"><span className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                          <IconBtn label={t('journal.editRaid', { date: fmtDate(r.ts) })} icon={Pencil} onClick={() => open({ editId: r.id })} />
                          <IconBtn label={t('journal.deleteRaidAria', { date: fmtDate(r.ts) })} icon={Trash2} onClick={() => { setRevert(false); setDel(r); }} />
                        </span></td>
                      </tr>
                    );
                    return isOpen ? [row, <tr key={r.id + '-d'} className="detail-row"><td colSpan={9}><RaidDetail r={r} /></td></tr>] : [row];
                  })}</tbody>
                </table>
              </div>
              {rows.length > limit && <div style={{ padding: 12 }}><Btn size="sm" onClick={() => setLimit(limit + 200)}>{t('journal.more', { n: Math.min(200, rows.length - limit) })}</Btn></div>}
            </>
          )}
      </Panel>
      {del && <Confirm title={t('journal.deleteRaid')} confirmLabel={t('journal.deleteRaid')} onClose={() => setDel(null)} onConfirm={() => { actions.deleteRaid(del.id, { revertLoot: revert }); setDel(null); }}>
        <p>{t('journal.deleteQ', { when: fmtDate(del.ts) + ' ' + fmtTime(del.ts), map: mapName(del.map), result: del.ok ? t('profile.coinsN', { n: del.coins }) : t('chart.deathLower') })}</p>
        <p className="secondary-text">{t('journal.deleteNote')}</p>
        {del.lootApplied.length > 0 && <Check checked={revert} onChange={setRevert} note={itemsText(del.lootApplied)}>{t('journal.revertLoot')}</Check>}
      </Confirm>}
    </div>
  );
}
