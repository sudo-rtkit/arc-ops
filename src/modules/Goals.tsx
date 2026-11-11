/* Goal Tracker (záložka Dashboardu): cíle s prioritou, termínem a progresem z Workshopu, Skill Tree, mincí, materiálů a Trials. */
import { useId, useState } from 'react';
import { CircleCheck, Pencil, Plus, RotateCcw, Target, Trash2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, ConfirmButton, Dialog, Empty, IconBtn, Panel, Progress, Select, Stepper } from '../ui/components';
import { fmt, fmtDate } from '../ui/format';
import { SKILL_TOTAL, daysLeft, goalKindName, goalKinds, goalProgress, isDone, priorityName, sortGoals } from '../core/goals';
import { STATIONS } from '../core/data/stations';
import { SKILLS } from '../core/data/skills';
import type { Goal, GoalKind, GoalLink } from '../core/types';
import { useT, type TFn } from '../i18n/react';

const defaultLink = (k: GoalKind): GoalLink => {
  switch (k) {
    case 'level': return { kind: 'level', level: 20 };
    case 'station': return { kind: 'station', station: 'gunsmith', level: 1 };
    case 'skill': return { kind: 'skill', skill: SKILL_TOTAL, points: 10 };
    case 'coins': return { kind: 'coins', amount: 100000 };
    case 'material': return { kind: 'material', mat: 'Metal Parts', qty: 10 };
    case 'trials': return { kind: 'trials', stars: 15 };
    default: return { kind: 'manual', target: 1, progress: 0 };
  }
};

function NumIn({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="input num-input" inputMode="numeric" value={value}
        onChange={e => { const n = Math.round(Number(e.target.value.replace(/\s/g, ''))); onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min); }} />
    </div>
  );
}

export function GoalDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const d = useDerived();
  const t = useT();
  const goalProgressLabel = (l: GoalLink) => progressLabel(t, l);
  const [title, setTitle] = useState(goal?.title || '');
  const [note, setNote] = useState(goal?.note || '');
  const [priority, setPriority] = useState(String(goal?.priority || 2));
  const [due, setDue] = useState(goal?.due || '');
  const [link, setLink] = useState<GoalLink>(goal?.link || defaultLink('manual'));
  const set = (p: Partial<GoalLink>) => setLink({ ...link, ...p } as GoalLink);
  const mats = d.materials.map(m => m.name);
  const save = () => {
    const input = { title: title.trim() || goalProgressLabel(link), note, priority: Number(priority), due, link };
    if (goal) actions.updateGoal(goal.id, { ...input, priority: Number(priority) as 1 | 2 | 3 });
    else actions.addGoal(input);
    onClose();
  };
  const st = link.kind === 'station' ? STATIONS.find(x => x.id === link.station)! : null;
  return (
    <Dialog title={goal ? t('goals.edit') : t('goals.new')} onClose={onClose}
      footNote={t('goals.footNote')}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" onClick={save}>{t('goals.save')}</Btn></>}>
      <div className="field"><label className="field-label" htmlFor="goal-title">{t('common.name')}</label>
        <input id="goal-title" className="input" value={title} maxLength={120} placeholder={goalProgressLabel(link)} onChange={e => setTitle(e.target.value)} /></div>
      <div className="form-grid">
        <Select label={t('goals.priority')} value={priority} onChange={setPriority} options={[1, 2, 3].map(p => ({ value: String(p), label: priorityName(p) }))} />
        <div className="field"><label className="field-label" htmlFor="goal-due">{t('goals.due')}</label>
          <input id="goal-due" className="input" type="date" lang={t.lang} value={due} onChange={e => setDue(e.target.value)} /></div>
      </div>
      <Select label={t('goals.link')} value={link.kind} onChange={v => setLink(defaultLink(v as GoalKind))} options={goalKinds().map(([v, l]) => ({ value: v, label: l }))} />
      <div className="form-grid">
        {link.kind === 'manual' && <><NumIn label={t('goals.targetCount')} value={link.target} min={1} max={1e9} onChange={n => set({ target: n, progress: Math.min(link.progress, n) })} />
          <NumIn label={t('common.done')} value={link.progress} min={0} max={link.target} onChange={n => set({ progress: n })} /></>}
        {link.kind === 'level' && <NumIn label={t('common.level')} value={link.level} min={1} max={75} onChange={n => set({ level: n })} />}
        {link.kind === 'station' && st && <>
          <Select label={t('plan.station')} value={link.station} onChange={v => { const s2 = STATIONS.find(x => x.id === v)!; setLink({ kind: 'station', station: v, level: Math.min(s2.max, Math.max(1, link.level)) }); }} options={STATIONS.map(x => ({ value: x.id, label: x.name }))} />
          <NumIn label={t('goals.levelMax', { n: st.max })} value={link.level} min={Math.max(1, st.min)} max={st.max} onChange={n => set({ level: n })} /></>}
        {link.kind === 'skill' && <>
          <Select label="Skill" value={link.skill} onChange={v => set({ skill: v, points: v === SKILL_TOTAL ? link.points : Math.min(link.points, SKILLS.find(x => x.id === v)!.max) })}
            options={[{ value: SKILL_TOTAL, label: t('goals.skillTotal') }, ...SKILLS.map(x => ({ value: x.id, label: x.name }))]} />
          <NumIn label={t('top.skillShort')} value={link.points} min={1} max={link.skill === SKILL_TOTAL ? 200 : SKILLS.find(x => x.id === link.skill)!.max} onChange={n => set({ points: n })} /></>}
        {link.kind === 'coins' && <NumIn label={t('goal.kind.coins')} value={link.amount} min={1} max={1e10} onChange={n => set({ amount: n })} />}
        {link.kind === 'material' && <>
          <div className="field"><label className="field-label" htmlFor="goal-mat">{t('inv.material')}</label>
            <input id="goal-mat" className="input" list="goal-mats" value={link.mat} maxLength={80} onChange={e => set({ mat: e.target.value })} />
            <datalist id="goal-mats">{mats.map(m => <option key={m} value={m} />)}</datalist></div>
          <NumIn label={t('goals.qtyStock')} value={link.qty} min={1} max={99999} onChange={n => set({ qty: n })} /></>}
        {link.kind === 'trials' && <NumIn label={t('trials.progress')} value={link.stars} min={1} max={15} onChange={n => set({ stars: n })} />}
      </div>
      {link.kind === 'material' && <p className="meta">{t('goals.matHint')}</p>}
      {link.kind === 'station' && <p className="meta">{t('goals.stationHint')}</p>}
      <div className="field"><label className="field-label" htmlFor="goal-note">{t('common.note')}</label>
        <textarea id="goal-note" className="textarea" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></div>
    </Dialog>
  );
}

/* Výchozí název cíle podle vazby (vznikne v aktuálním jazyce, když uživatel název nevyplní). */
function progressLabel(t: TFn, link: GoalLink): string {
  const st = link.kind === 'station' ? STATIONS.find(x => x.id === link.station) : null;
  switch (link.kind) {
    case 'level': return t('goal.label.level', { n: link.level });
    case 'station': return t('goal.label.station', { station: st?.name || link.station, n: link.level });
    case 'skill': return link.skill === SKILL_TOTAL ? t('goals.lbl.skillTotal', { n: link.points }) : t('goal.label.skill', { skill: SKILLS.find(x => x.id === link.skill)?.name || link.skill, n: link.points });
    case 'coins': return t('goals.lbl.coins', { n: link.amount });
    case 'material': return t('goal.label.material', { n: link.qty, mat: link.mat });
    case 'trials': return t('goals.lbl.trials', { n: link.stars });
    default: return t('goals.new');
  }
}

function DueBadge({ due, done }: { due: string; done: boolean }) {
  const t = useT();
  const left = daysLeft(due, Date.now());
  if (left === null) return null;
  const [y, m, d] = due.split('-').map(Number);
  const txt = fmtDate(new Date(y, m - 1, d).getTime());
  if (done) return <span className="meta">{t('goals.dueOn', { d: txt })}</span>;
  if (left < 0) return <Badge tone="danger">{t('goals.late', { d: txt })}</Badge>;
  if (left <= 3) return <Badge tone="amber">{left === 0 ? t('goals.today') : t('goals.inDays', { n: left })} · {txt}</Badge>;
  return <span className="meta">{t('goals.dueOn', { d: txt })}</span>;
}

export function GoalRow({ g, compact }: { g: Goal; compact?: boolean }) {
  const s = useAppState();
  const t = useT();
  const [edit, setEdit] = useState(false);
  const p = goalProgress(g, s);
  const done = isDone(g);
  const lockedOpen = done && g.link.kind !== 'manual' && p.met;
  return (
    <div className={'goal-row list-row' + (done ? ' done' : '')}>
      <span className="grow stack-sm" style={{ gap: 4 }}>
        <span className="row" style={{ gap: 6 }}>
          {done ? <CircleCheck size={16} className="success" aria-hidden="true" /> : <Target size={16} className="accent" aria-hidden="true" />}
          <b className="wrap">{g.title}</b>
          <Badge tone={g.priority === 1 ? 'danger' : g.priority === 2 ? 'amber' : 'muted'}>{priorityName(g.priority)}</Badge>
          <DueBadge due={g.due} done={done} />
          {done && <Badge tone="success">{t('goals.doneOn', { d: fmtDate(g.doneAt) })}</Badge>}
        </span>
        <span className="meta">{goalKindName(g.link.kind)} · {p.label}{g.doneRaid ? ' · ' + t('goals.doneInRaid') : ''}</span>
        <Progress value={Math.min(p.value, p.target)} max={p.target} tone={done ? 'success' : undefined} label={<span className="sr-only">{t('goals.progressOf', { name: g.title })}</span>} valueText={`${fmt(Math.min(p.value, p.target))} / ${fmt(p.target)}`} />
        {!compact && g.note && <span className="meta wrap">{g.note}</span>}
      </span>
      {!compact && (
        <span className="row" style={{ flexWrap: 'nowrap', gap: 4, alignSelf: 'flex-start' }}>
          {g.link.kind === 'manual' && !done && <Stepper label={t('goals.progressOf', { name: g.title })} value={g.link.progress} min={0} max={g.link.target} onChange={n => actions.setGoalProgress(g.id, n)} />}
          {done
            ? <IconBtn label={lockedOpen ? t('goals.stillMet', { name: g.title }) : t('goals.reopen', { name: g.title })} icon={RotateCcw} disabled={lockedOpen} onClick={() => actions.setGoalDone(g.id, false)} />
            : <IconBtn label={t('goals.markDone', { name: g.title })} icon={CircleCheck} onClick={() => actions.setGoalDone(g.id, true)} />}
          <IconBtn label={t('loadout.editAria', { name: g.title })} icon={Pencil} onClick={() => setEdit(true)} />
          <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('goals.delete')} confirmLabel={t('goals.delete')} text={<p>{t('goals.deleteText', { name: g.title })}</p>} onConfirm={() => actions.deleteGoal(g.id)}><span className="sr-only">{t('common.deleteItem', { name: g.title })}</span></ConfirmButton>
        </span>
      )}
      {edit && <GoalDialog goal={g} onClose={() => setEdit(false)} />}
    </div>
  );
}

export default function Goals() {
  const s = useAppState();
  const t = useT();
  const [add, setAdd] = useState(false);
  const [show, setShow] = useState<'open' | 'done' | 'all'>('open');
  const [kind, setKind] = useState('');
  const list = sortGoals(s.goals).filter(g => (show === 'all' || (show === 'done') === isDone(g)) && (!kind || g.link.kind === kind));
  const open = s.goals.filter(g => !isDone(g)).length;
  return (
    <Panel title="Goal Tracker" actions={<><span className="meta">{t('goals.counts', { open, done: s.goals.length - open })}</span><Btn size="sm" variant="primary" icon={Plus} onClick={() => setAdd(true)}>{t('goals.new')}</Btn></>}>
      <div className="filter-bar">
        <div className="seg" role="group" aria-label={t('goals.showAria')}>
          {(['open', 'done', 'all'] as const).map(x => <button key={x} type="button" aria-pressed={show === x} onClick={() => setShow(x)}>{t(`goals.show.${x}`)}</button>)}
        </div>
        <div style={{ width: 240 }}><Select label={t('goals.link')} value={kind} onChange={setKind} options={[{ value: '', label: t('goals.allLinks') }, ...goalKinds().map(([v, l]) => ({ value: v, label: l }))]} /></div>
      </div>
      {s.goals.length === 0 ? <Empty icon={Target} action={<Btn variant="primary" icon={Plus} onClick={() => setAdd(true)}>{t('goals.new')}</Btn>}>{t('goals.empty')}</Empty>
        : list.length === 0 ? <Empty>{t('filter.none')}</Empty>
          : <div className="list-rows">{list.map(g => <GoalRow key={g.id} g={g} />)}</div>}
      <p className="meta">{t('goals.hint')}</p>
      {add && <GoalDialog goal={null} onClose={() => setAdd(false)} />}
    </Panel>
  );
}
