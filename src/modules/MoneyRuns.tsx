import { useEffect, useState } from 'react';
import { Coins, Eye, EyeOff, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trash2, Undo2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { elapsed, elapsedMinutes, useUi } from '../store/ui';
import { Badge, Btn, Check, ConfirmButton, Dialog, Empty, ExtLink, IconBtn, OriginBadge, PageHead, Panel, Select, Tabs, cx } from '../ui/components';
import { HBars, ResultChart } from '../ui/charts';
import { DASH, fmt, fmtDate, mmss, pct } from '../ui/format';
import { MAPS } from '../core/data/maps';
import { gameTexts } from '../core/gametext';
import { groupStats, raidTypeName, runStats } from '../core/runs';
import { hiddenRoutes, hiddenSell, type Edited } from '../core/gamedata';
import type { Route, SellItem } from '../core/types';
import { mapName } from './shared';
import { useT } from '../i18n/react';

type Tab = 'chart' | 'routes' | 'guides' | 'sell';
type RouteText = 'name' | 'risk' | 'loadout' | 'yield' | 'phase';

function RouteDialog({ r, onClose }: { r: Edited<Route>; onClose: () => void }) {
  const t = useT();
  const init = { name: r.name, map: r.map, risk: r.risk, loadout: r.loadout, yield: r.yield, phase: r.phase, steps: r.steps.join('\n') };
  const [f, setF] = useState(init);
  /* Formulář je předvyplněný v aktuálním jazyce: uloží se jen změněná pole, takže vestavěný text trasy zůstane
     přeložitelný a uložené úpravy uživatele se nepřepíšou. */
  const save = () => {
    const patch: Partial<Route> = {};
    for (const k of ['name', 'map', 'risk', 'loadout', 'yield', 'phase'] as const) if (f[k] !== init[k]) patch[k] = f[k];
    if (f.steps !== init.steps) patch.steps = f.steps.split('\n');
    actions.editRoute(r.id, patch);
    onClose();
  };
  const field = (k: RouteText, label: string, max = 80) => (
    <div className="field"><label className="field-label" htmlFor={'rt-' + k}>{label}</label>
      <input id={'rt-' + k} className="input" value={f[k]} maxLength={max} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <Dialog title={t('money.editRoute', { name: r.name })} size="wide" onClose={onClose}
      footNote={t('money.editRouteNote')}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" onClick={save}>{t('money.saveRoute')}</Btn></>}>
      <div className="form-grid">
        {field('name', t('common.name'))}
        <Select label={t('common.map')} value={f.map} onChange={v => setF({ ...f, map: v })} options={MAPS.map(m => ({ value: m.id, label: m.name }))} />
        {field('risk', t('money.risk'))}{field('loadout', 'Loadout', 200)}{field('yield', t('money.yield'))}{field('phase', t('top.phase'), 20)}
      </div>
      <div className="field"><label className="field-label" htmlFor="rt-steps">{t('money.stepsLabel')}</label>
        <textarea id="rt-steps" className="textarea" rows={8} value={f.steps} onChange={e => setF({ ...f, steps: e.target.value })} /></div>
    </Dialog>
  );
}

function SellDialog({ item, onClose }: { item: Edited<SellItem> | null; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(item?.name || '');
  const [price, setPrice] = useState(String(item?.price ?? ''));
  const [note, setNote] = useState(item?.note || '');
  const save = () => {
    const p = Math.max(0, Math.round(Number(price.replace(/\s/g, '')) || 0));
    /* Uloží se jen změněná pole (vestavěný text ceníku zůstane přeložitelný). */
    if (item) {
      const patch: Partial<SellItem> = {};
      if (name !== item.name) patch.name = name;
      if (p !== item.price) patch.price = p;
      if (note !== item.note) patch.note = note;
      actions.editSell(item.id, patch);
    } else actions.addCustomSell(name, p, note);
    onClose();
  };
  return (
    <Dialog title={item ? t('common.editItem', { name: item.name }) : t('money.addSell')} onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" disabled={!name.trim()} onClick={save}>{t('common.save')}</Btn></>}>
      <div className="field"><label className="field-label" htmlFor="sell-name">Item</label><input id="sell-name" className="input" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label className="field-label" htmlFor="sell-price">{t('money.priceCoins')}</label><input id="sell-price" className="input num-input" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} /></div>
      <div className="field"><label className="field-label" htmlFor="sell-note">{t('common.note')}</label><input id="sell-note" className="input" value={note} maxLength={300} onChange={e => setNote(e.target.value)} /></div>
    </Dialog>
  );
}

function Clock({ route }: { route: string }) {
  const tr = useT();
  const t = useUi(s => s.timer);
  const toggle = useUi(s => s.timerToggle);
  const reset = useUi(s => s.timerReset);
  const open = useUi(s => s.openRaidForm);
  const routes = useDerived().allRoutes;
  const [, setTick] = useState(0);
  useEffect(() => { if (!t.running) return; const iv = setInterval(() => setTick(x => x + 1), 500); return () => clearInterval(iv); }, [t.running]);
  const ms = elapsed(t);
  const level = ms >= 600000 ? 'late' : ms >= 480000 ? 'soon' : '';
  const msg = tr(ms >= 600000 ? 'money.clock.late' : ms >= 480000 ? 'money.clock.soon' : 'money.clock.ok');
  const r = routes.find(x => x.id === route);
  return (
    <Panel title={tr('money.clock')} actions={<span className="meta">{tr('money.clockTarget')}</span>}>
      <div className="row" style={{ gap: 16, alignItems: 'center' }}>
        <div className={cx('clock mono', level)} role="timer" aria-live="off">{mmss(ms)}</div>
        <div className="stack-sm">
          {level === 'soon' && <Badge tone="orange"><Timer size={12} aria-hidden="true" />{tr('money.minutes', { n: 8 })}</Badge>}
          {level === 'late' && <Badge tone="danger"><Timer size={12} aria-hidden="true" />{tr('money.minutes', { n: 10 })}</Badge>}
          <span className={cx(level === 'late' ? 'danger' : level === 'soon' ? 'orange' : 'secondary-text')} aria-live="polite">{msg}</span>
        </div>
      </div>
      <div className="row">
        <Btn variant="primary" icon={t.running ? Pause : Play} onClick={toggle}>{t.running ? tr('money.pause') : ms ? tr('money.resume') : tr('money.start')}</Btn>
        <Btn icon={RotateCcw} onClick={reset} disabled={!ms}>{tr('common.reset')}</Btn>
        <Btn onClick={() => open({ preset: { type: 'money', route: r?.id || '', map: r?.map, min: elapsedMinutes(t) } })} disabled={!ms}>{tr('money.transfer')}</Btn>
      </div>
      <p className="meta">{tr('money.clockHint')}</p>
    </Panel>
  );
}

export default function MoneyRuns({ sub }: { sub: string }) {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const ROUTES = d.routes;
  const routeName = d.routeName;
  const open = useUi(st => st.openRaidForm);
  const [tab, setTab] = useState<Tab>(ROUTES.some(r => r.id === sub) ? 'guides' : 'chart');
  const [routeSel, setRoute] = useState(ROUTES.some(r => r.id === sub) ? sub : ROUTES[0]?.id || '');
  const [range, setRange] = useState<'24' | '60' | 'all'>('24');
  const [editRoute, setEditRoute] = useState(false);
  const [sellEdit, setSellEdit] = useState<Edited<SellItem> | null | undefined>(undefined);
  const [showHidden, setShowHidden] = useState(false);
  const money = s.raids.filter(r => r.type === 'money').sort((a, b) => a.ts - b.ts);
  const rs = runStats(money);
  const shown = range === 'all' ? money : money.slice(-Number(range));
  const r = ROUTES.find(x => x.id === routeSel) || ROUTES[0];
  const route = r?.id || '';
  const rmap = MAPS.find(m => m.id === r?.map) || MAPS[0];
  const checks = s.checklists.routeChecks;
  const done = r ? r.steps.filter((_, i) => checks[r.id + ':' + i]).length : 0;
  const hRoutes = hiddenRoutes(s.gameData, t.lang), hSell = hiddenSell(s.gameData, t.lang);
  const texts = gameTexts(t.lang);
  const noRoute = t('money.noRoute');
  return (
    <div className="page">
      <PageHead title="Money Runs" sub={t('money.sub')}
        actions={<Btn variant="primary" icon={Plus} onClick={() => open({ preset: { type: 'money', route, map: r?.map } })}>{t('money.logRun')}</Btn>} />
      <div className="cols-2">
        <Clock route={route} />
        <Panel title={t('money.yieldTitle')} actions={<span className="meta">{t('money.runsAll', { count: rs.n })}</span>}>
          <div className="stats-row">
            <div className="stat"><span className="label">{t('money.perHour')}</span><span className="stat-val amber">{rs.minutes > 0 ? fmt(rs.perHour) : DASH}</span></div>
            <div className="stat"><span className="label">{t('money.rate')}</span><span className="stat-val">{rs.n ? pct(rs.rate) : DASH}</span></div>
            <div className="stat"><span className="label">{t('money.avg')}</span><span className="stat-val">{rs.ok ? fmt(rs.avg) : DASH}</span></div>
            <div className="stat"><span className="label">{t('money.total')}</span><span className="stat-val amber">{fmt(rs.coins)}</span></div>
          </div>
          <p className="meta">{texts.runHint} {t('money.coinsHint')}</p>
          <a className="link-btn" href="#journal">{t('money.history')}</a>
        </Panel>
      </div>
      <Tabs label="Money Runs" value={tab} onChange={setTab} tabs={[{ id: 'chart', label: t('money.tab.chart') }, { id: 'routes', label: t('money.tab.routes') }, { id: 'guides', label: t('money.tab.guides') }, { id: 'sell', label: t('money.tab.sell') }]} />
      {tab === 'chart' && (
        <Panel title={t('money.runValue')} actions={<div className="seg" role="group" aria-label={t('money.range')}>{(['24', '60', 'all'] as const).map(x => <button key={x} type="button" aria-pressed={range === x} onClick={() => setRange(x)}>{x === 'all' ? t('goals.show.all') : t('money.last', { n: x })}</button>)}</div>}>
          {shown.length === 0 ? <Empty icon={Coins} action={<Btn variant="primary" icon={Plus} onClick={() => open({ preset: { type: 'money', route } })}>{t('money.logRun')}</Btn>}>{t('money.empty')}</Empty> : (
            <ResultChart title={t('money.chartTitle')} unit={t('profile.unit.coins')} points={shown.map((x, i) => ({ key: x.id, label: String(money.length - shown.length + i + 1), value: x.coins, ok: x.ok, detail: `${fmtDate(x.ts)} · ${routeName(x.route) === DASH ? mapName(x.map) : routeName(x.route)} · ${x.min} min` }))}
              summary={t('money.chartSummary', { count: shown.length, ok: shown.filter(x => x.ok).length, coins: runStats(shown).coins })} />
          )}
        </Panel>
      )}
      {tab === 'routes' && (
        <div className="stack">
          <Panel title={t('money.byRoute')} flush>
            {rs.routes.length === 0 ? <Empty>{t('money.noRuns')}</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>{t('common.route')}</th><th className="num">{t('money.runsCol')}</th><th className="num">{t('chart.extract')}</th><th className="num">{t('money.avgCol')}</th><th className="num">{t('money.totalCol')}</th><th className="num">{t('money.perHourCol')}</th></tr></thead>
                <tbody>{rs.routes.map(x => <tr key={x.route}><td>{x.route === '—' ? noRoute : routeName(x.route)}</td><td className="num">{x.n}</td><td className="num">{pct(x.rate)}</td><td className="num">{x.ok ? fmt(Math.round(x.coins / x.ok)) : DASH}</td><td className="num">{fmt(x.coins)}</td><td className="num"><b className="amber">{x.min > 0 ? fmt(x.perHour) : DASH}</b></td></tr>)}</tbody>
              </table></div>
            )}
          </Panel>
          {rs.routes.length > 0 && (
            <div className="cols-2">
              <Panel title={t('money.cmpRoutes')}><HBars unit="/ h" rows={rs.routes.map(x => ({ key: x.route, label: x.route === '—' ? noRoute : routeName(x.route), value: x.perHour, note: t('money.barNote', { count: x.n, rate: pct(x.rate) }) }))} /></Panel>
              <Panel title={t('money.cmpMaps')}><HBars unit="/ h" rows={groupStats(money, x => x.map).map(g => ({ key: g.key, label: mapName(g.key), value: g.perHour, note: t('money.barNote', { count: g.n, rate: pct(g.rate) }) }))} /></Panel>
            </div>
          )}
          {s.raids.length > money.length && (
            <Panel title={t('money.cmpTypes')}>
              <HBars unit="/ h" rows={groupStats(s.raids, x => x.type).map(g => ({ key: g.key, label: raidTypeName(g.key), value: g.perHour, note: t('money.barNoteRaids', { count: g.n, rate: pct(g.rate), coins: g.coins }) }))} />
            </Panel>
          )}
        </div>
      )}
      {tab === 'guides' && (
        <div className="stack">
          <div className="row">
            <Btn size="sm" icon={Plus} onClick={() => { const id = actions.addCustomRoute(t('default.newRoute'), r?.map || 'dam'); setRoute(id); setEditRoute(true); }}>{t('money.customRoute')}</Btn>
            {hRoutes.length > 0 && <Btn size="sm" variant="ghost" onClick={() => setShowHidden(!showHidden)}>{showHidden ? t('money.collapseHidden') : t('money.hiddenRoutes', { n: hRoutes.length })}</Btn>}
          </div>
          {showHidden && hRoutes.map(h => <div key={h.id} className="row between"><span>{h.name}</span><Btn size="sm" icon={Eye} onClick={() => actions.setRouteHidden(h.id, false)}>{t('money.showRoute', { name: h.name })}</Btn></div>)}
          {!r ? <Panel><Empty>{t('money.allHidden')}</Empty></Panel> : (
            <div className="route-layout">
              <nav className="route-pick" aria-label={t('maps.routes')}>
                {ROUTES.map(x => (
                  <button key={x.id} type="button" className={cx('list-row', x.id === route && 'selected')} aria-current={x.id === route ? 'true' : undefined} onClick={() => setRoute(x.id)}>
                    <span className="grow"><b>{x.name}</b><small>{mapName(x.map)} · {x.risk || t('money.noRisk')}{x.origin === 'vlastni' ? ' · ' + t('money.customLower') : x.edited ? ' · ' + t('money.editedLower') : ''}</small></span>
                  </button>
                ))}
              </nav>
              <Panel title={r.name} actions={<><OriginBadge origin={r.origin || 'denik'} edited={r.edited} /><ExtLink url={rmap.live}>{t('maps.live')}</ExtLink></>}>
                <dl className="facts">
                  <div><dt>{t('common.map')}</dt><dd>{rmap.name}</dd></div><div><dt>{t('money.risk')}</dt><dd>{r.risk || DASH}</dd></div><div><dt>Loadout</dt><dd>{r.loadout || DASH}</dd></div>
                  <div><dt>{t('money.yield')}</dt><dd className="amber">{r.yield || DASH}</dd></div><div><dt>{t('top.phase')}</dt><dd>{r.phase || DASH}</dd></div>
                </dl>
                <div className="row between"><span className="label">{t('check.routeSteps')}</span><span className="mono meta">{done} / {r.steps.length}</span></div>
                {r.steps.length === 0 ? <p className="muted">{t('money.noSteps')}</p>
                  : <div>{r.steps.map((x, i) => <Check key={i} checked={!!checks[r.id + ':' + i]} onChange={() => actions.toggleRouteCheck(r.id + ':' + i)} prefix={<span className="step-n">{i + 1}</span>}>{x}</Check>)}</div>}
                <div className="row"><Btn onClick={() => actions.resetRouteChecks(r.id)} disabled={!done}>{t('check.uncheckRoute')}</Btn><Btn variant="primary" icon={Plus} onClick={() => open({ preset: { type: 'money', route: r.id, map: r.map } })}>{t('money.logOnRoute')}</Btn></div>
                <div className="row">
                  <Btn size="sm" icon={Pencil} onClick={() => setEditRoute(true)}>{t('money.editRouteBtn')}</Btn>
                  {r.edited && <ConfirmButton size="sm" icon={Undo2} title={t('money.resetRoute')} confirmLabel={t('check.restore')} text={<p>{t('money.resetRouteText', { name: r.name })}</p>} onConfirm={() => actions.resetRoute(r.id)}>{t('check.restore')}</ConfirmButton>}
                  {r.origin === 'vlastni'
                    ? <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('money.deleteRoute')} confirmLabel={t('money.deleteRoute')} text={<p>{t('money.deleteRouteText', { name: r.name })}</p>} onConfirm={() => actions.deleteCustomRoute(r.id)}>{t('common.delete')}</ConfirmButton>
                    : <Btn size="sm" variant="ghost" icon={EyeOff} onClick={() => actions.setRouteHidden(r.id, true)}>{t('common.hide')}</Btn>}
                </div>
              </Panel>
            </div>
          )}
          {editRoute && r && <RouteDialog key={r.id + t.lang} r={r} onClose={() => setEditRoute(false)} />}
        </div>
      )}
      {tab === 'sell' && (
        <Panel title={t('money.tab.sell')} flush actions={<Btn size="sm" icon={Plus} onClick={() => setSellEdit(null)}>{t('money.addItem')}</Btn>}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Item</th><th className="num">{t('money.price')}</th><th>{t('common.note')}</th><th>{t('money.origin')}</th><th className="actions-cell">{t('inv.actions')}</th></tr></thead>
            <tbody>{d.sell.map(x => (
              <tr key={x.id}>
                <td>{x.name}</td><td className="num amber">{fmt(x.price)}</td><td className="muted">{x.note}</td><td><OriginBadge origin={x.origin} edited={x.edited} /></td>
                <td className="actions-cell"><span className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                  <IconBtn label={t('loadout.editAria', { name: x.name })} icon={Pencil} onClick={() => setSellEdit(x)} />
                  {x.edited && <IconBtn label={t('money.resetItem', { name: x.name })} icon={Undo2} onClick={() => actions.resetSell(x.id)} />}
                  {x.origin === 'vlastni'
                    ? <IconBtn label={t('common.deleteItem', { name: x.name })} icon={Trash2} onClick={() => actions.deleteCustomSell(x.id)} />
                    : <IconBtn label={t('money.hideItem', { name: x.name })} icon={EyeOff} onClick={() => actions.setSellHidden(x.id, true)} />}
                </span></td>
              </tr>
            ))}</tbody>
          </table></div>
          {hSell.length > 0 && <div className="row" style={{ padding: '8px 16px' }}><span className="meta">{t('money.hiddenLbl')}</span>{hSell.map(h => <Btn key={h.id} size="sm" icon={Eye} onClick={() => actions.setSellHidden(h.id, false)}>{h.name}</Btn>)}</div>}
          <p className="meta" style={{ padding: '8px 16px 16px' }}>{texts.sellRules} {t('money.sellHint')}</p>
        </Panel>
      )}
      {sellEdit !== undefined && <SellDialog key={t.lang} item={sellEdit} onClose={() => setSellEdit(undefined)} />}
    </div>
  );
}
