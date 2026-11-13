import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check as CheckIcon, ChevronRight, CircleCheck, Eye, EyeOff, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { actions, navigate, useAppState, useDerived } from '../store';
import { useUi } from '../store/ui';
import { Badge, Btn, Check, Dialog, Empty, IconBtn, PageHead, Panel, Progress, Tabs, cx } from '../ui/components';
import Goals, { GoalRow } from './Goals';
import Recs, { RecItem } from './Recs';
import { AdvisorAll, AdvisorCard, useTips } from '../ui/Advisor';
import { isDone, sortGoals } from '../core/goals';
import { DASH, fmt, fmtDate, fmtMinutes, pct } from '../ui/format';
import { SKILL } from '../core/data/skills';
import { raidTypeName } from '../core/runs';
import { starSum } from '../core/week';
import { sourceLabel, stepLabel } from '../core/gametext';
import { MAP_COUNT, mapName, branchVar } from './shared';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

const cardName = (k: string): Key => `card.${k}` as Key;


function Kpi({ label, value, ctx, tone, children }: { label: string; value: ReactNode; ctx: ReactNode; tone?: string; children?: ReactNode }) {
  return (
    <div className="panel kpi">
      <span className="label">{label}</span>
      <span className={cx('kpi-val', tone)}>{value}</span>
      {children}
      <span className="kpi-ctx">{ctx}</span>
    </div>
  );
}

function KpiStrip() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const p = s.profile, r = d.runs;
  return (
    <div className="kpi-strip" role="group" aria-label={t('card.kpi')}>
      <Kpi label={t('common.level')} value={<>{p.level} <span className="muted" style={{ fontSize: 16 }}>/ 75</span></>}
        ctx={p.xpNext > 0 ? `XP ${fmt(p.xp)} / ${fmt(p.xpNext)}` : p.xp > 0 ? t('dash.xpNoTarget', { xp: fmt(p.xp) }) : t('dash.xpEmpty')}>
        {p.xpNext > 0 ? <Progress value={Math.min(p.xp, p.xpNext)} max={p.xpNext} showValue={false} label={t('profile.xpToNext')} /> : <div className="progress" aria-hidden="true"><i style={{ width: (p.level / 75 * 100) + '%' }} /></div>}
      </Kpi>
      <Kpi label={t('goal.kind.coins')} value={fmt(p.coins)} tone="amber" ctx={t('dash.coinsCtx')} />
      <Kpi label={t('nav.group.raids')} value={fmt(r.n)} ctx={t('stats.period.all')} />
      <Kpi label={t('chart.extract')} value={r.n ? pct(r.rate) : DASH} ctx={r.n ? t('dash.extractCtx', { ok: r.ok, count: r.n }) : t('dash.noRaids')} tone={r.n ? 'success' : undefined} />
      <Kpi label={t('dash.earnings')} value={fmt(r.coins)} tone="amber" ctx={t('dash.earningsCtx')} />
      <Kpi label={t('money.perHourCol')} value={r.minutes > 0 ? fmt(r.perHour) : DASH} ctx={r.minutes > 0 ? t('dash.phCtx') : t('dash.phEmpty')} />
    </div>
  );
}

function RowLink({ href, label, title, children }: { href: string; label: string; title: ReactNode; children: ReactNode }) {
  return (
    <a className="list-row" href={href} aria-label={label}>
      <span className="grow"><span className="label">{title}</span><span style={{ display: 'block' }}>{children}</span></span>
      <ChevronRight size={16} aria-hidden="true" />
    </a>
  );
}

function NextCard() {
  const d = useDerived();
  const s = useAppState();
  const t = useT();
  const free = d.budget - d.used;
  const nx = d.nextPoint;
  const top = d.needs.filter(n => !n.block).sort((a, b) => b.ready - a.ready)[0];
  const open = d.maps.filter(m => m.open).length;
  const nextMap = d.maps.find(m => !m.open);
  return (
    <Panel title={t('card.next')} className="span-5 row-a">
      <div className="list-rows">
        <RowLink href="#skills" label={t('dash.openSkills')} title={t('dash.nextSkill', { plan: d.planName })}>
          {nx ? <><b style={{ color: branchVar(SKILL[nx.id].b) }}>{SKILL[nx.id].name}</b> <span className="mono muted">{nx.have}/{SKILL[nx.id].max} → {nx.to}</span>
            <small>{free > 0 ? t('dash.freePoints', { count: free }) : free < 0 ? t('dash.overspent') : t('dash.nextLevel')}</small></>
            : <><b>{t('dash.planDone')}</b><small>{d.planName}</small></>}
        </RowLink>
        <RowLink href="#workshop" label={t('dash.openWorkshop')} title={t('dash.nearest')}>
          {top ? <><b>{top.station.name} {top.level}</b> <span className="mono muted">{t('ws.matPct', { p: pct(top.ready) })}</span><Progress value={Math.round(top.ready * 100)} max={100} showValue={false} tone={top.ready >= 1 ? 'success' : undefined} label={t('dash.readiness')} /></>
            : <><b>{d.needs.length ? t('dash.blocked') : t('dash.allDone')}</b>{d.needs.length > 0 && <small>{d.needs[0].block}</small>}</>}
        </RowLink>
        <RowLink href="#maps" label={t('dash.openMaps')} title={t('dash.maps')}>
          <b className="mono">{open} / {MAP_COUNT}</b> {t('dash.unlockedLower')}
          <small>{nextMap ? t('dash.nextMap', { map: nextMap.map.name, count: nextMap.left, rounds: s.profile.rounds }) : t('dash.allMaps')}</small>
        </RowLink>
      </div>
    </Panel>
  );
}

function PhasesCard() {
  const d = useDerived();
  const t = useT();
  const cur = d.phases.list.find(p => p.current);
  return (
    <Panel title={t('card.phases')} className="span-4 row-a" id="phases">
      <div className="phase-segs" role="list" aria-label={t('dash.phasesAria')}>
        {d.phases.list.map(p => (
          <div key={p.n} role="listitem" className={cx('phase-seg', p.done && 'done', p.current && 'current')} title={p.name}>
            <span className="mono">{p.n}</span><span className="sr-only">{p.name}: {p.done ? t('dash.phaseDone') : p.current ? t('maps.now') : t('dash.phaseWait')}</span>
          </div>
        ))}
      </div>
      {cur ? (
        <>
          <div><span className="label">{t('dash.phaseLabel', { n: cur.n, lv: cur.lv })}</span><h3>{cur.name}</h3></div>
          <ul className="gates">
            {cur.gates.map(g => <li key={g.label} className={g.ok ? 'ok' : ''}>{g.ok ? <CheckIcon size={16} aria-hidden="true" /> : <span className="gate-dot" aria-hidden="true" />}<span>{g.label}</span><span className="sr-only">{' ' + t(g.ok ? 'dash.gateOk' : 'dash.gateNo')}</span></li>)}
          </ul>
        </>
      ) : <Empty icon={CircleCheck}>{t('dash.endgame')}</Empty>}
    </Panel>
  );
}

function TrialsCard() {
  const tr = useAppState().trials;
  const t = useT();
  const sum = starSum(tr.stars);
  return (
    <Panel title="Weekly Trials" className="span-3 row-a" actions={<a className="link-btn" href="#trials">{t('rec.open')}</a>}>
      <div className="row between"><span className="label">{tr.week}</span><span className="trials-sum amber">{sum} / 15 ★</span></div>
      <Progress value={sum} max={15} tone="amber" showValue={false} label={t('trials.progress')} />
      <div className="list-rows">
        {tr.stars.map((st, i) => (
          <div key={i} className="trial-mini">
            <span className="grow wrap">{tr.names[i] || <span className="muted">{t('trials.namePh', { n: i + 1 })}</span>}</span>
            <span className="stars-static" aria-label={t('dash.starsOf', { n: st })}>{[1, 2, 3].map(k => <Star key={k} size={14} aria-hidden="true" fill={st >= k ? 'var(--amber)' : 'none'} color={st >= k ? 'var(--amber)' : 'var(--text-muted)'} />)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RaidsCard() {
  const raids = useAppState().raids;
  const d = useDerived();
  const open = useUi(s => s.openRaidForm);
  const t = useT();
  const last = raids.slice().sort((a, b) => b.ts - a.ts).slice(0, 5);
  return (
    <Panel title={t('card.raids')} className="span-8" flush actions={<a className="link-btn" href="#journal">{t('dash.allRaids')} <ChevronRight size={14} aria-hidden="true" /></a>}>
      {last.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('chart.date')}</th><th>{t('common.map')}</th><th>{t('journal.routeType')}</th><th>{t('chart.result')}</th><th className="num">{t('chart.earnings')}</th><th className="num">{t('dash.length')}</th></tr></thead>
            <tbody>{last.map(r => (
              <tr key={r.id}>
                <td className="mono">{fmtDate(r.ts)}</td><td>{mapName(r.map)}</td>
                <td>{r.route ? d.routeName(r.route) : raidTypeName(r.type)}</td>
                <td>{r.ok ? <Badge tone="success"><CheckIcon size={14} aria-hidden="true" />{t('chart.extract')}</Badge> : <Badge tone="danger"><X size={14} aria-hidden="true" />{t('chart.death')}</Badge>}</td>
                <td className="num amber">{fmt(r.coins)}</td><td className="num">{fmtMinutes(r.min)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty icon={BookOpen} action={<Btn variant="primary" icon={Plus} onClick={() => open()}>{t('raid.log')}</Btn>}>{t('journal.empty')}</Empty>}
    </Panel>
  );
}

function MissingCard() {
  const d = useDerived();
  const t = useT();
  const missing = d.shop.filter(x => x.missing > 0);
  return (
    <Panel title={t('card.missing')} className="span-4" actions={<a className="link-btn" href="#inventory/shopping">{t('inv.tab.shopping')} <ChevronRight size={14} aria-hidden="true" /></a>}>
      {missing.length ? (
        <div className="list-rows">
          {missing.slice(0, 5).map(x => (
            <div key={x.mat} className="list-row">
              <span className="grow wrap">{x.mat}<small>{sourceLabel(x.mat, x.src, t.lang)}</small></span>
              <span className="num mono"><span className="amber">{fmt(x.missing)}</span> <span className="muted">{t('dash.missingLower')}</span></span>
            </div>
          ))}
          {missing.length > 5 && <span className="meta">{t('stats.andMore', { n: missing.length - 5 })}</span>}
        </div>
      ) : <Empty icon={CircleCheck}><span className="success">{t('inv.enough')}</span><br /><span className="meta">{t('dash.enoughNote')}</span></Empty>}
    </Panel>
  );
}

function ProgressCard() {
  const d = useDerived();
  const t = useT();
  return (
    <Panel title={t('card.progress')} className="span-5">
      <Progress label={t('dash.wsLevels')} value={d.workshop.now} max={d.workshop.max} />
      <Progress label={t('stats.skill')} value={d.used} max={d.budget} tone={d.used > d.budget ? 'danger' : undefined} />
      {d.used > d.budget && <span className="meta danger">{t('dash.overBy', { count: d.used - d.budget })}</span>}
      <div className="row"><a className="link-btn" href="#workshop">Workshop</a><a className="link-btn" href="#skills">Skill Tree</a></div>
    </Panel>
  );
}

function StepsCard() {
  const steps = useAppState().steps;
  const t = useT();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState('');
  const done = steps.filter(s => s.done).length;
  /* Uložený výchozí krok se zobrazí v aktuálním jazyce; nezměněné pole se při opuštění neuloží. */
  const label = (st: { id: string; text: string }) => stepLabel(st.id, st.text, t.lang);
  return (
    <Panel title={t('card.steps')} className="span-7"
      actions={<><span className="mono meta">{done} / {steps.length}</span><Btn size="sm" variant="ghost" icon={edit ? CheckIcon : Pencil} onClick={() => setEdit(!edit)}>{edit ? t('common.done') : t('common.edit')}</Btn></>}>
      <Progress value={done} max={steps.length || 1} showValue={false} tone="success" label={t('import.row.steps')} />
      {steps.length === 0 && <Empty>{t('dash.stepsEmpty')}</Empty>}
      <div className="stack-sm" style={{ gap: 0 }}>
        {steps.map((st, i) => edit ? (
          <div key={st.id} className="row step-edit">
            <span className="mono muted" style={{ width: 24, textAlign: 'right' }}>{i + 1}</span>
            <input key={t.lang} className="input grow" defaultValue={label(st)} aria-label={t('dash.stepText', { n: i + 1 })} onBlur={e => { if (e.target.value !== label(st)) actions.editStep(st.id, e.target.value); }} />
            <IconBtn label={t('check.moveUp')} icon={ArrowUp} disabled={i === 0} onClick={() => actions.moveStep(st.id, -1)} />
            <IconBtn label={t('check.moveDown')} icon={ArrowDown} disabled={i === steps.length - 1} onClick={() => actions.moveStep(st.id, 1)} />
            <IconBtn label={t('dash.deleteStep')} icon={Trash2} onClick={() => actions.deleteStep(st.id)} />
          </div>
        ) : (
          <Check key={st.id} checked={st.done} onChange={() => actions.toggleStep(st.id)} prefix={<span className="step-n">{i + 1}</span>}>{label(st)}</Check>
        ))}
      </div>
      {edit && (
        <form className="row" onSubmit={e => { e.preventDefault(); actions.addStep(draft); setDraft(''); }}>
          <label htmlFor="new-step" className="sr-only">{t('dash.newStep')}</label>
          <input id="new-step" className="input grow" value={draft} placeholder={t('dash.newStep')} onChange={e => setDraft(e.target.value)} />
          <Btn type="submit" icon={Plus} disabled={!draft.trim()}>{t('common.add')}</Btn>
        </form>
      )}
    </Panel>
  );
}

function GoalsCard() {
  const goals = useAppState().goals;
  const t = useT();
  const open = sortGoals(goals).filter(g => !isDone(g));
  return (
    <Panel title={t('card.goals')} className="span-6" actions={<a className="link-btn" href="#dashboard/goals">Goal Tracker <ChevronRight size={14} aria-hidden="true" /></a>}>
      {open.length ? <div className="list-rows">{open.slice(0, 4).map(g => <GoalRow key={g.id} g={g} compact />)}</div>
        : <Empty action={<a className="btn sm" href="#dashboard/goals">{t('dash.addGoal')}</a>}>{goals.length ? t('dash.allGoalsDone') : t('dash.noGoals')}</Empty>}
      {open.length > 4 && <span className="meta">{t('stats.andMore', { n: open.length - 4 })}</span>}
    </Panel>
  );
}

function RecsCard() {
  const d = useDerived();
  const t = useT();
  return (
    <Panel title={t('card.recs')} className="span-6" actions={<a className="link-btn" href="#dashboard/recs">{t('rec.all')} <ChevronRight size={14} aria-hidden="true" /></a>}>
      {d.recs.length ? <div className="list-rows">{d.recs.slice(0, 3).map(r => <RecItem key={r.id} r={r} compact />)}</div> : <Empty>{t('rec.emptyShort')}</Empty>}
    </Panel>
  );
}

const CARDS: Record<string, () => ReactNode> = {
  advisor: AdvisorCard, goals: GoalsCard, recs: RecsCard,
  next: NextCard, phases: PhasesCard, trials: TrialsCard, raids: RaidsCard, missing: MissingCard, progress: ProgressCard, steps: StepsCard,
};

function EditDashboard({ onClose }: { onClose: () => void }) {
  const db = useAppState().dashboard;
  const t = useT();
  return (
    <Dialog title={t('dash.editTitle')} size="side" onClose={onClose} footer={<><Btn onClick={() => actions.resetDashboard()}>{t('dash.resetDefault')}</Btn><Btn variant="primary" onClick={onClose}>{t('common.done')}</Btn></>}>
      <p className="secondary-text">{t('dash.editHint')}</p>
      <div className="list-rows">
        {db.order.map((k, i) => {
          const name = t(cardName(k));
          return (
            <div key={k} className="list-row">
              <span className="grow">{name}{db.hidden[k] && <small>{t('common.hidden')}</small>}</span>
              <IconBtn label={t(db.hidden[k] ? 'dash.showCard' : 'dash.hideCard', { name })} icon={db.hidden[k] ? EyeOff : Eye} onClick={() => actions.setCardHidden(k, !db.hidden[k])} />
              <IconBtn label={t('common.moveUp', { name })} icon={ArrowUp} disabled={i === 0} onClick={() => actions.moveCard(k, -1)} />
              <IconBtn label={t('common.moveDown', { name })} icon={ArrowDown} disabled={i === db.order.length - 1} onClick={() => actions.moveCard(k, 1)} />
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

function FirstRun() {
  const s = useAppState();
  const t = useT();
  const fresh = !s.meta.importedFrom && s.raids.length === 0 && s.profile.level <= 1 && s.profile.coins === 0 && s.profile.rounds === 0 && Object.keys(s.skills.current).length === 0;
  if (!fresh) return null;
  return (
    <div className="panel first-run" role="status">
      <div className="panel-body row">
        <span className="grow">{t('dash.firstRun')}</span>
        <a className="btn primary sm" href="#profile">{t('dash.editProfile')}</a>
        <a className="btn sm" href="#settings/import">{t('dash.importDiary')}</a>
      </div>
    </div>
  );
}

type DashTab = 'overview' | 'tips' | 'goals' | 'recs';

export default function Dashboard({ sub }: { sub: string }) {
  const s = useAppState();
  const d = useDerived();
  const db = s.dashboard;
  const open = useUi(st => st.openRaidForm);
  const t = useT();
  const [edit, setEdit] = useState(false);
  const tab: DashTab = sub === 'goals' || sub === 'recs' || sub === 'tips' ? sub : 'overview';
  const tips = useTips().visible.length;
  const visible = db.order.filter(k => !db.hidden[k]);
  const openGoals = s.goals.filter(g => !isDone(g)).length;
  return (
    <div className="page dashboard">
      <PageHead title="Dashboard" sub={t('dash.sub')}
        actions={<>{tab === 'overview' && <Btn onClick={() => setEdit(true)}>{t('dash.editTitle')}</Btn>}<Btn variant="primary" icon={Plus} onClick={() => open()}>{t('raid.log')}</Btn></>} />
      <Tabs label="Dashboard" value={tab} onChange={v => navigate('dashboard', v === 'overview' ? '' : v)} tabs={[
        { id: 'overview', label: t('nav.group.overview') },
        { id: 'tips', label: <>{t('dash.tab.tips')} {tips > 0 && <Badge tone="accent">{tips}</Badge>}</> },
        { id: 'goals', label: <>{t('dash.tab.goals')} {openGoals > 0 && <Badge tone="accent">{openGoals}</Badge>}</> },
        { id: 'recs', label: <>{t('card.recs')} {d.recs.length > 0 && <Badge tone="amber">{d.recs.length}</Badge>}</> },
      ]} />
      {tab === 'tips' && <AdvisorAll />}
      {tab === 'goals' && <Goals />}
      {tab === 'recs' && <Recs />}
      {tab === 'overview' && <>
      <FirstRun />
      {visible.length === 0 && <Panel><Empty action={<Btn onClick={() => actions.resetDashboard()}>{t('dash.restoreCards')}</Btn>}>{t('dash.allHidden')}</Empty></Panel>}
      {/* KPI je samostatná skupina; ostatní karty tvoří grid ve zvoleném pořadí před a za ní. */}
      {[visible.slice(0, Math.max(0, visible.indexOf('kpi'))), visible.includes('kpi') ? ['kpi'] : [], visible.slice(visible.indexOf('kpi') + 1)]
        .map((group, gi) => group.length === 0 ? null : group[0] === 'kpi' ? <KpiStrip key="kpi" /> : (
          <div key={gi} className="dash-grid">{group.map(c => { const C = CARDS[c]; return <C key={c} />; })}</div>
        ))}
      </>}
      {edit && <EditDashboard onClose={() => setEdit(false)} />}
    </div>
  );
}
