import { useState } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { useAppState, useDerived } from '../store';
import { useUi } from '../store/ui';
import { Btn, Empty, PageHead, Panel, Progress, Select } from '../ui/components';
import { HBars, LineChart, ResultChart } from '../ui/charts';
import { DASH, fmt, fmtDate, fmtDay, fmtDayShort, pct } from '../ui/format';
import { raidTypes, bestWorst, dailySeries, filterRaids, groupStats, raidTypeName, runStats } from '../core/runs';
import type { RaidType } from '../core/types';
import { mapName } from './shared';
import { isDone, goalKindName } from '../core/goals';
import { loadoutStats, tallyItems } from '../core/loadouts';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

const PERIODS: { value: string; label: Key }[] = [
  { value: 'all', label: 'stats.period.all' }, { value: '7', label: 'stats.period.7' }, { value: '30', label: 'stats.period.30' },
  { value: '90', label: 'stats.period.90' }, { value: '365', label: 'stats.period.365' },
];

export default function Statistics() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const open = useUi(st => st.openRaidForm);
  const [period, setPeriod] = useState('all');
  const [type, setType] = useState('');
  const [loadout, setLoadout] = useState('');
  const routeName = d.routeName;
  const from = period === 'all' ? undefined : Date.now() - Number(period) * 86400000;
  const raids = filterRaids(s.raids, { from, type: type as RaidType | '' }).filter(r => !loadout || (loadout === '-' ? !r.loadout : r.loadout === loadout)).sort((a, b) => a.ts - b.ts);
  const doneGoals = s.goals.filter(g => isDone(g) && (from === undefined || g.doneAt >= from)).sort((a, b) => b.doneAt - a.doneAt);
  const openGoals = s.goals.filter(g => !isDone(g)).length;
  const byLoadout = loadoutStats(raids);
  const lost = tallyItems(raids, r => r.lost);
  const loot = tallyItems(raids, r => r.loot);
  const st = runStats(raids);
  const bw = bestWorst(raids);
  const byMap = groupStats(raids, r => r.map);
  const byRoute = groupStats(raids.filter(r => r.route), r => r.route);
  const byType = groupStats(raids, r => r.type);
  const bestMap = byMap.filter(g => g.min > 0)[0];
  const series = dailySeries(raids);
  const periodLabel = t(PERIODS.find(p => p.value === period)!.label);
  const coinsUnit = t('profile.unit.coins');
  return (
    <div className="page">
      <PageHead title="Statistics" sub={t('stats.sub')} />
      <div className="panel"><div className="panel-body"><div className="stats-filters">
        <div className="field-wrap"><Select label={t('stats.period')} value={period} onChange={setPeriod} options={PERIODS.map(p => ({ value: p.value, label: t(p.label) }))} /></div>
        <div className="field-wrap"><Select label={t('raid.type')} value={type} onChange={setType} options={[{ value: '', label: t('journal.allTypes') }, ...raidTypes().map(([v, l]) => ({ value: v, label: l }))]} /></div>
        <div className="field-wrap"><Select label="Loadout" value={loadout} onChange={setLoadout} options={[{ value: '', label: t('journal.allLoadouts') }, { value: '-', label: t('journal.noLoadout') }, ...s.loadouts.map(l => ({ value: l.id, label: l.name }))]} /></div>
        <span className="meta">{periodLabel}{type ? ' · ' + raidTypeName(type) : ''} · {t('stats.raids', { count: raids.length })}</span>
        {(period !== 'all' || type || loadout) && <Btn size="sm" variant="ghost" onClick={() => { setPeriod('all'); setType(''); setLoadout(''); }}>{t('filter.clear')}</Btn>}
      </div></div></div>
      <div className="kpi-strip">
        <div className="panel kpi"><span className="label">{t('nav.group.raids')}</span><span className="kpi-val">{fmt(st.n)}</span><span className="kpi-ctx">{periodLabel}</span></div>
        <div className="panel kpi"><span className="label">{t('chart.extract')}</span><span className="kpi-val success">{st.n ? pct(st.rate) : DASH}</span><span className="kpi-ctx">{t('inv.countOf', { n: st.ok, total: st.n })}</span></div>
        <div className="panel kpi"><span className="label">{t('chart.earnings')}</span><span className="kpi-val amber">{fmt(st.coins)}</span><span className="kpi-ctx">{t('stats.onlyOk')}</span></div>
        <div className="panel kpi"><span className="label">{t('money.perHourCol')}</span><span className="kpi-val">{st.minutes > 0 ? fmt(st.perHour) : DASH}</span><span className="kpi-ctx">{t('stats.minTotal', { n: st.minutes })}</span></div>
        <div className="panel kpi"><span className="label">{t('stats.avgExtract')}</span><span className="kpi-val sm">{st.ok ? fmt(st.avg) : DASH}</span><span className="kpi-ctx">{coinsUnit}</span></div>
        <div className="panel kpi"><span className="label">{t('stats.bestMap')}</span><span className="kpi-val sm kpi-text">{bestMap ? mapName(bestMap.key) : DASH}</span><span className="kpi-ctx">{bestMap ? t('stats.bestMapCtx', { ph: fmt(bestMap.perHour), count: bestMap.n }) : t('stats.byPerHour')}</span></div>
      </div>
      <Panel title={t('stats.goalsDone')} actions={<a className="link-btn" href="#dashboard/goals">Goal Tracker</a>}>
        <div className="stats-row">
          <div className="stat"><span className="label">{t('stats.donePeriod', { period: periodLabel.toLowerCase() })}</span><span className="stat-val success">{doneGoals.length}</span></div>
          <div className="stat"><span className="label">{t('stats.openGoals')}</span><span className="stat-val">{openGoals}</span></div>
          <div className="stat"><span className="label">{t('stats.inRaid')}</span><span className="stat-val">{doneGoals.filter(g => g.doneRaid).length}</span></div>
        </div>
        {doneGoals.length > 0 ? (
          <div className="list-rows">{doneGoals.slice(0, 8).map(g => (
            <div key={g.id} className="list-row"><span className="grow wrap">{g.title}<small>{goalKindName(g.link.kind)}</small></span><span className="mono meta">{fmtDate(g.doneAt)}</span></div>
          ))}{doneGoals.length > 8 && <span className="meta">{t('stats.andMore', { n: doneGoals.length - 8 })}</span>}</div>
        ) : <p className="muted">{t('stats.noGoals')}</p>}
        <p className="meta">{t('stats.goalsHint')}</p>
      </Panel>
      {raids.length === 0 ? (
        <Panel><Empty icon={ChartNoAxesCombined} action={s.raids.length ? <Btn onClick={() => { setPeriod('all'); setType(''); }}>{t('filter.clear')}</Btn> : <Btn variant="primary" onClick={() => open()}>{t('raid.log')}</Btn>}>
          {s.raids.length ? t('filter.none') : t('journal.empty')}</Empty></Panel>
      ) : (
        <>
          <div className="cols-2">
            <Panel title={t('stats.bestWorst')}>
              {bw.best ? (
                <dl className="dl">
                  <dt>{t('stats.best')}</dt><dd><b className="amber mono">{fmt(bw.best.coins)}</b> · {fmtDate(bw.best.ts)} · {mapName(bw.best.map)}{bw.best.route ? ' · ' + routeName(bw.best.route) : ''}</dd>
                  <dt>{t('stats.worst')}</dt><dd><b className="mono">{fmt(bw.worst!.coins)}</b> · {fmtDate(bw.worst!.ts)} · {mapName(bw.worst!.map)}{bw.worst!.route ? ' · ' + routeName(bw.worst!.route) : ''}</dd>
                </dl>
              ) : <p className="muted">{t('stats.noExtract')}</p>}
              <p className="meta">{t('stats.bwHint', { n: st.n - st.ok })}</p>
            </Panel>
            <Panel title={t('card.progress')}>
              <Progress label={t('stats.ws')} value={d.workshop.now} max={d.workshop.max} />
              <Progress label={t('stats.skill')} value={d.used} max={d.budget} tone={d.used > d.budget ? 'danger' : undefined} />
              <Progress label={t('stats.maps')} value={d.maps.filter(m => m.open).length} max={d.maps.length} />
              <p className="meta">{t('stats.nowHint')}</p>
            </Panel>
          </div>
          <div className="chart-pair">
          <Panel title={t('stats.earnTrend')}>
            <LineChart title={t('stats.earnTotal')} unit={coinsUnit} color="var(--amber)" points={series.map(p => ({ key: p.day, label: fmtDayShort(p.day), value: p.total }))}
              summary={series.length ? t('stats.earnSummary', { from: fmtDay(series[0].day), to: fmtDay(series[series.length - 1].day), days: t('stats.days', { count: series.length }), coins: st.coins }) : ''} />
          </Panel>
          <Panel title={t('stats.results')}>
            <ResultChart title={t('stats.resultsTitle')} unit={coinsUnit} points={raids.slice(-60).map((r, i, a) => ({ key: r.id, label: String(raids.length - a.length + i + 1), value: r.coins, ok: r.ok, detail: `${fmtDate(r.ts)} · ${mapName(r.map)} · ${raidTypeName(r.type)}` }))}
              summary={t('stats.resultsSummary', { n: Math.min(60, raids.length) })} />
          </Panel>
          </div>
          <div className="cols-2">
            <Panel title={t('stats.mapsPh')}><HBars unit="/ h" rows={byMap.map(g => ({ key: g.key, label: mapName(g.key), value: g.perHour, note: t('money.barNoteRaids', { count: g.n, rate: pct(g.rate), coins: g.coins }) }))} /></Panel>
            <Panel title={t('stats.routesPh')}>{byRoute.length ? <HBars unit="/ h" rows={byRoute.map(g => ({ key: g.key, label: routeName(g.key), value: g.perHour, note: t('stats.raidNote', { count: g.n, rate: pct(g.rate) }) }))} /> : <p className="muted">{t('stats.noRoute')}</p>}</Panel>
          </div>
          <Panel title={t('stats.types')} flush>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('journal.type')}</th><th className="num">{t('nav.group.raids')}</th><th className="num">{t('chart.extract')}</th><th className="num">{t('chart.earnings')}</th><th className="num">{t('money.avgCol')}</th><th className="num">{t('money.perHourCol')}</th></tr></thead>
              <tbody>{byType.map(g => <tr key={g.key}><td>{raidTypeName(g.key)}</td><td className="num">{g.n}</td><td className="num">{pct(g.rate)}</td><td className="num amber">{fmt(g.coins)}</td><td className="num">{g.ok ? fmt(g.avg) : DASH}</td><td className="num">{g.min > 0 ? fmt(g.perHour) : DASH}</td></tr>)}</tbody>
            </table></div>
          </Panel>
          <Panel title={t('loadout.title')} flush actions={<a className="link-btn" href="#weapons/loadouts">Loadout Planner</a>}>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Loadout</th><th className="num">{t('nav.group.raids')}</th><th className="num">{t('chart.extract')}</th><th className="num">{t('chart.earnings')}</th><th className="num">{t('money.perHourCol')}</th><th className="num">{t('stats.lostPcs')}</th></tr></thead>
              <tbody>{byLoadout.map(g => <tr key={g.id || '-'}><td>{g.id ? d.loadoutName(g.id) : t('journal.noLoadout')}</td><td className="num">{g.n}</td><td className="num">{pct(g.rate)}</td><td className="num amber">{fmt(g.coins)}</td><td className="num">{g.perHour ? fmt(g.perHour) : DASH}</td><td className="num">{fmt(g.lost)}</td></tr>)}</tbody>
            </table></div>
          </Panel>
          <div className="cols-2">
            <Panel title={t('journal.lostGear')}>
              {lost.length ? <HBars unit={t('common.pieces')} tone="var(--danger)" rows={lost.slice(0, 10).map(x => ({ key: x.name, label: x.name, value: x.qty, note: t('stats.inRaids', { count: x.raids }) }))} /> : <p className="muted">{t('stats.noLost')}</p>}
            </Panel>
            <Panel title={t('journal.loot')}>
              {loot.length ? <HBars unit={t('common.pieces')} tone="var(--success)" rows={loot.slice(0, 10).map(x => ({ key: x.name, label: x.name, value: x.qty, note: t('stats.fromRaids', { count: x.raids }) }))} /> : <p className="muted">{t('stats.noLoot')}</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
