/* Quests: úkoly obchodníků z veřejných dat ARC Tracker s ručním zaškrtnutím splněných a (0.10.2) jednotlivých cílů. Předměty k donesení u
   dostupných úkolů jdou do nákupního seznamu a Planneru (počítá jádro, viz core/quests.ts). Záložka Projekty je
   jen přehled fází projektů sezóny. Texty úkolů jsou ve zdroji anglicky. */
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pin, PinOff } from 'lucide-react';
import { actions, app, navigate, useAppState } from '../store';
import { Badge, Btn, Empty, IconBtn, PageHead, Panel, Progress, Search, Select, Stepper, Tabs, cx } from '../ui/components';
import { PROJECTS, QUESTS, locText, objectiveProgress, questById, questName, questStatus, type QuestStatus } from '../core/quests';
import type { Qty } from '../core/data/arctracker';
import { stockOf } from '../core/compact';
import { mapName } from './shared';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

type Show = 'all' | QuestStatus;
const TONE: Record<QuestStatus, 'success' | 'accent' | undefined> = { done: 'success', active: 'accent', locked: undefined };
const qtyText = (xs: Qty[]) => xs.map(([n, q]) => (q > 1 ? `${q}× ${n}` : n)).join(', ');

/* Seznam předmětů s počtem; u předmětů k donesení i kolik je v zásobě. */
function Items({ list, inventory }: { list: Qty[]; inventory?: Record<string, number> }) {
  const t = useT();
  if (!list.length) return <span className="muted">{t('quests.none')}</span>;
  return (
    <ul className="quest-items">{list.map(([n, q]) => {
      const have = inventory ? inventory[n] || 0 : null;
      return <li key={n}><span className="mono">{q}×</span> {n}{have !== null && <span className={cx('meta', have >= q ? 'success' : 'amber')}> · {t('quests.haveNeed', { have, need: q })}</span>}</li>;
    })}</ul>
  );
}

function QuestList() {
  const s = useAppState();
  const t = useT();
  /* 0.13.1: zásoba i s Vybavením (klíč nebo předmět k použití) */
  const stock = useMemo(() => stockOf(s), [s]);
  const [q, setQ] = useState('');
  const [trader, setTrader] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(null);
  const done = s.quests.done;
  const pinned = s.quests.pinned;
  const objs = s.quests.objectives;
  const traders = useMemo(() => [...new Set(QUESTS.map(x => x.trader))].sort(), []);
  const lang = t.lang;
  const rows = QUESTS.filter(x => {
    const st = questStatus(x, done);
    if (show !== 'all' && st !== show) return false;
    if (trader && x.trader !== trader) return false;
    if (!q) return true;
    const hay = [questName(x, lang), x.trader, ...x.objectives.map(o => locText(o, lang)), ...x.deliver.map(d => d[0]), ...x.questItems.map(d => d[0]), ...x.rewards.map(d => d[0]), ...x.maps.map(mapName)].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const total = QUESTS.length, doneN = QUESTS.filter(x => done[x.id]).length;
  const toggle = (id: string, v: boolean) => {
    const n = actions.questSet(id, v);
    if (v && n > 1) app.notify(t('quests.marked', { count: n - 1 }), 'success');
  };
  const clear = () => { setQ(''); setTrader(''); setShow('all'); };
  return (
    <Panel title={t('quests.title')} flush actions={<span className="meta" data-testid="quests-progress">{t('quests.progress', { done: doneN, total })}</span>}>
      <div style={{ padding: '0 16px' }} className="stack-sm">
        <Progress value={doneN} max={total} showValue={false} label={t('quests.progress', { done: doneN, total })} />
        <p className="meta">{t('quests.hint')}</p>
      </div>
      <div className="filter-bar" style={{ padding: '0 16px' }}>
        <Search label={t('quests.search')} value={q} onChange={setQ} placeholder={t('quests.searchPh')} />
        <div style={{ width: 200 }}><Select label={t('quests.trader')} value={trader} onChange={setTrader} options={[{ value: '', label: t('quests.allTraders') }, ...traders.map(x => ({ value: x, label: x }))]} /></div>
        <div style={{ width: 180 }}><Select label={t('quests.show')} value={show} onChange={v => setShow(v as Show)} options={(['all', 'active', 'locked', 'done'] as Show[]).map(v => ({ value: v, label: t(`quests.show.${v}` as Key) }))} /></div>
        <span className="meta" aria-live="polite" data-testid="quests-count">{t('quests.count', { n: rows.length, total })}</span>
        {(q || trader || show !== 'all') && <Btn size="sm" variant="ghost" onClick={clear}>{t('filter.clear')}</Btn>}
      </div>
      {rows.length === 0 ? <Empty action={<Btn onClick={clear}>{t('filter.clear')}</Btn>}>{t('filter.none')}</Empty> : (
        <div className="table-wrap tall">
          <table className="table quest-table">
            <thead><tr><th><span className="sr-only">{t('quests.col.done')}</span></th><th>{t('quests.col.quest')}</th><th>{t('quests.trader')}</th><th>{t('quests.col.needs')}</th><th>{t('quests.col.rewards')}</th><th className="actions-cell"><span className="sr-only">{t('inv.actions')}</span></th></tr></thead>
            <tbody>{rows.map(x => {
              const st = questStatus(x, done), name = questName(x, lang), isOpen = open === x.id;
              const op = objectiveProgress(objs, x), ticked = objs[x.id] ?? [];
              return (
                <Fragment key={x.id}>
                  <tr data-quest={x.id} data-status={st} className={cx(st === 'done' && 'muted', isOpen && 'selected')}>
                    <td><input type="checkbox" aria-label={t('quests.doneAria', { name })} checked={st === 'done'} onChange={e => toggle(x.id, e.target.checked)} /></td>
                    <td>
                      <b className="wrap">{name}</b> <Badge tone={TONE[st]}>{t(`quests.status.${st}` as Key)}</Badge>
                      {x.research && <> <Badge>{t('quests.research')}</Badge></>}
                      {st !== 'done' && pinned.includes(x.id) && <> <Badge tone="accent">{t('quests.pinnedBadge')}</Badge></>}
                      <br /><span className="meta">{[...x.maps.map(mapName), x.xp ? t('quests.xp', { xp: x.xp }) : ''].filter(Boolean).join(' · ')}</span>
                      {op.total > 0 && <> <span className={cx('meta', op.done > 0 && st !== 'done' && 'accent')} data-testid="quest-obj-progress">{t('quests.objProgress', op)}</span></>}
                    </td>
                    <td>{x.trader}</td>
                    <td className="wrap meta">{x.deliver.length ? qtyText(x.deliver) : '—'}</td>
                    <td className="wrap meta">{x.rewards.length ? qtyText(x.rewards) : '—'}</td>
                    <td className="actions-cell"><div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                      {st !== 'done' && <IconBtn ghost label={t(pinned.includes(x.id) ? 'quests.unpin' : 'quests.pin', { name })} icon={pinned.includes(x.id) ? PinOff : Pin} aria-pressed={pinned.includes(x.id)} data-testid="quest-pin" onClick={() => actions.questPin(x.id, !pinned.includes(x.id))} />}
                      <IconBtn ghost label={t(isOpen ? 'quests.detailHide' : 'quests.detailShow', { name })} icon={isOpen ? ChevronDown : ChevronRight} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : x.id)} />
                    </div></td>
                  </tr>
                  {isOpen && (
                    <tr className="detail-row"><td colSpan={6}>
                      <div className="quest-detail" data-testid="quest-detail">
                        <div><h4>{t('quests.objectives')} <span className="meta">{t('quests.objProgress', op)}</span></h4>
                          <ol className="quest-objectives">{x.objectives.map((o, i) => {
                            const txt = locText(o, lang), on = ticked.includes(i);
                            return <li key={i} data-objective={i} data-done={String(on)}><label className="quest-objective">
                              <input type="checkbox" checked={on} aria-label={t('quests.objAria', { text: txt })} onChange={e => actions.questObjective(x.id, i, e.target.checked)} />
                              <span className={cx(on && 'muted')}>{txt}</span></label></li>;
                          })}</ol>
                          <p className="meta">{t('quests.objHint')}</p></div>
                        <div><h4>{t('quests.deliver')}</h4><Items list={x.deliver} inventory={stock} /></div>
                        {x.questItems.length > 0 && <div><h4>{t('quests.questItems')}</h4><Items list={x.questItems} /></div>}
                        <div><h4>{t('quests.rewards')}</h4><Items list={x.rewards} />{x.xp > 0 && <span className="meta">{t('quests.xp', { xp: x.xp })}</span>}</div>
                        {x.prev.length > 0 && <div><h4>{t('quests.prev')}</h4><ul className="quest-items">{x.prev.map(p => { const pq = questById(p); return <li key={p}>{pq ? questName(pq, lang) : p}{pq && done[p] ? ' ✓' : ''}</li>; })}</ul></div>}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Projects() {
  const s = useAppState();
  const t = useT();
  const stock = useMemo(() => stockOf(s), [s]);
  return (
    <Panel title={t('projects.title')}>
      <p className="meta">{t('projects.hint')} {t('projects.nextHint')}</p>
      <div className="cards">{PROJECTS.map(p => (
        <section key={p.id} className="panel project-card" data-project={p.id}>
          <div className="panel-body stack-sm">
            <h3>{locText(p.name, t.lang)}</h3>
            {p.start && <span className="meta">{p.end ? t('projects.dates', { from: p.start, to: p.end }) : t('projects.from', { from: p.start })}</span>}
            <Stepper label={t('projects.doneAria', { name: locText(p.name, t.lang) })} value={s.projects[p.id] || 0} min={0} max={p.phases.length} onChange={n => actions.projectSetPhases(p.id, n)} />
            <span className="meta">{t('projects.done')}: {s.projects[p.id] || 0} / {p.phases.length}</span>
            {p.phases.map(ph => (
              <div key={ph.phase} className={cx('project-phase', ph.phase <= (s.projects[p.id] || 0) && 'done')}>
                <b>{t('projects.phase', { n: ph.phase, name: locText(ph.name, t.lang) })}</b>
                {ph.req.length > 0 && <div><span className="meta">{t('projects.req')}</span><Items list={ph.req} inventory={stock} /></div>}
                {ph.tasks.length > 0 && <div><span className="meta">{t('projects.tasks')}</span><ul className="quest-items">{ph.tasks.map((x, i) => <li key={i}>{locText(x, t.lang)}</li>)}</ul></div>}
                {ph.rewards.length > 0 && <div><span className="meta">{t('projects.rewards')}:</span> <span className="meta">{qtyText(ph.rewards)}</span></div>}
              </div>
            ))}
          </div>
        </section>
      ))}</div>
    </Panel>
  );
}

export default function Quests({ sub }: { sub: string }) {
  const t = useT();
  const tab = sub === 'projects' ? 'projects' : 'quests';
  return (
    <div className="page">
      <PageHead title="Quests" sub={t('quests.sub')} />
      <Tabs label="Quests" value={tab} onChange={v => navigate('quests', v === 'quests' ? '' : v)}
        tabs={[{ id: 'quests', label: t('quests.tab.quests') }, { id: 'projects', label: t('quests.tab.projects') }]} />
      {tab === 'quests' ? <QuestList /> : <Projects />}
    </div>
  );
}

