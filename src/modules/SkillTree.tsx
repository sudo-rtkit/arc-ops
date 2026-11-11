import { useState } from 'react';
import { Check as CheckIcon, CircleAlert, Lock, Minus, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, ConfirmButton, Dialog, IconBtn, PageHead, Panel, Select, Stepper, Tabs, cx } from '../ui/components';
import { fmt } from '../ui/format';
import { BRANCHES, BUILDS, PLANS, SKILLS } from '../core/data/skills';
import { addBlock, branchTotals, fitsPoints, fitsTotals, invalidNodes, planProgress, planTarget, pointsIn, resetCost, totalPoints, BUILD_PREFIX } from '../core/skills';
import { buildWho, gameTexts, skillDesc, tierNames } from '../core/gametext';
import type { BranchId, Skill } from '../core/types';
import { branchVar } from './shared';
import { useT } from '../i18n/react';

type Tab = 'tree' | 'plan' | 'builds';

function Node({ s, target, next, bad }: { s: Skill; target: number; next: boolean; bad?: string }) {
  const st = useAppState();
  const t = useT();
  const have = st.skills.current[s.id] || 0;
  const blk = addBlock(st.skills.current, s.id, st.profile);
  const full = have >= s.max;
  const locked = !!blk && have === 0 && blk !== t('skill.block.noPoint');
  return (
    <div className={cx('node', have > 0 && 'has', full && 'full', next && 'next', bad && 'invalid', locked && 'locked')} style={{ ['--bc' as string]: branchVar(s.b) }}>
      <div className="node-head">
        <span className="node-name">{s.name}</span>
        <span className="node-pts mono">{have}/{s.max}{st.skills.showPlan && target > have && <em title={t('skill.planTarget')}> → {target}</em>}</span>
      </div>
      <p className="node-desc">{skillDesc(s, t.lang)}</p>
      {bad && <p className="node-warn"><CircleAlert size={14} aria-hidden="true" />{bad}</p>}
      <div className="node-foot">
        <IconBtn label={t('skill.remove', { name: s.name })} icon={Minus} disabled={!have} onClick={() => actions.skillRemove(s.id)} />
        <IconBtn label={blk ? `${s.name}: ${blk}` : t('skill.add', { name: s.name })} icon={Plus} disabled={!!blk} onClick={() => actions.skillAdd(s.id)} />
        {next && <Badge tone="accent">{t('skill.next')}</Badge>}
        {full && <CheckIcon size={16} className="success" aria-label={t('plan.atMax')} />}
        {blk && !full && <span className="node-block" title={blk}>{locked && <Lock size={12} aria-hidden="true" />}{blk}</span>}
      </div>
    </div>
  );
}

function Tree() {
  const st = useAppState();
  const d = useDerived();
  const cur = st.skills.current;
  const target = st.skills.showPlan ? planTarget(cur, d.planSteps) : {};
  const bad = invalidNodes(cur);
  const t = useT();
  const tiers = tierNames(t.lang);
  return (
    <div className="tree-scroll">
      <div className="tree">
        {BRANCHES.map(b => (
          <section key={b.id} className="branch" style={{ ['--bc' as string]: branchVar(b.id) }} aria-label={b.name}>
            <header className="branch-head"><h3>{b.name}</h3><span className="mono">{t('skill.points', { count: pointsIn(cur, b.id) })}</span></header>
            {[0, 1, 2, 3, 4].map(tier => (
              <div key={tier} className="tier">
                <div className="tier-name label">{tiers[tier]}</div>
                <div className="tier-nodes">
                  {SKILLS.filter(s => s.b === b.id && s.t === tier).map(s => <Node key={s.id} s={s} target={target[s.id] || 0} next={d.nextPoint?.id === s.id} bad={bad[s.id]} />)}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function PlanList() {
  const st = useAppState();
  const d = useDerived();
  const prog = planProgress(st.skills.current, d.planSteps);
  const t = useT();
  return (
    <Panel title={t('skill.planTitle', { name: d.planName })} actions={<span className="mono meta">{prog.filter(x => x.done).length} / {prog.length}</span>}>
      {prog.length === 0 ? <p className="muted">{t('skill.planEmpty')}</p> : (
        <ol className="plan-list">
          {prog.map(x => (
            <li key={x.i} className={cx(x.done && 'done', x.next && 'next')} style={{ ['--bc' as string]: branchVar(x.branch as BranchId) }}>
              <span className="plan-dot" aria-hidden="true">{x.done ? <CheckIcon size={12} /> : null}</span>
              <span className="grow">{x.label}</span>
              {x.done ? <Badge tone="success">{t('common.done')}</Badge> : x.next ? <Badge tone="accent">{t('wpn.now')}</Badge> : <Badge>{t('skill.waiting')}</Badge>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function SaveBuildDialog({ onClose }: { onClose: () => void }) {
  const cur = useAppState().skills.current;
  const t = useT();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  return (
    <Dialog title={t('skill.saveTitle')} onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" icon={Save} disabled={!name.trim()} onClick={() => { actions.saveBuild(name, note, cur); onClose(); }}>{t('skill.saveBuild')}</Btn></>}>
      <div className="field"><label className="field-label" htmlFor="bname">{t('common.name')}</label><input id="bname" className="input" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label className="field-label" htmlFor="bnote">{t('common.note')}</label><textarea id="bnote" className="textarea" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></div>
      <p className="meta">{t('skill.saveHint', { count: totalPoints(cur) })}</p>
    </Dialog>
  );
}

function Builds() {
  const st = useAppState();
  const cur = st.skills.current;
  const now = branchTotals(cur);
  const [save, setSave] = useState(false);
  const t = useT();
  const plan = st.skills.activePlan;
  const delta = (a: number, b: number) => { const x = a - b; return x === 0 ? '' : x > 0 ? ` (+${x})` : ` (${x})`; };
  return (
    <div className="stack">
      <Panel title={t('skill.readyBuilds')} flush>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Build</th><th className="num">Cond.</th><th className="num">Mob.</th><th className="num">Surv.</th><th>{t('skill.keySkills')}</th><th>{t('skill.who')}</th><th>{t('skill.noReset')}</th><th>{t('skill.plan')}</th></tr></thead>
            <tbody>{BUILDS.map((b, bi) => {
              const on = !!b.plan && b.plan === plan;
              const fits = fitsTotals(cur, b);
              return (
                <tr key={b.name} className={on ? 'selected' : ''}>
                  <td><b>{b.name}</b> {on && <Badge tone="accent">{t('skill.yourPlan')}</Badge>}</td>
                  <td className="num">{b.c}<span className="muted">{delta(b.c, now.c)}</span></td><td className="num">{b.m}<span className="muted">{delta(b.m, now.m)}</span></td><td className="num">{b.s}<span className="muted">{delta(b.s, now.s)}</span></td>
                  <td>{b.keys}</td><td>{buildWho(bi, t.lang)}</td>
                  <td>{fits ? <Badge tone="success">{t('common.yes')}</Badge> : <Badge tone="orange">Reset</Badge>}</td>
                  <td>{b.plan ? (on ? <Badge tone="success">{t('skill.active')}</Badge> : <Btn size="sm" onClick={() => actions.setPlan(b.plan!)}>{t('skill.use')}</Btn>) : <span className="muted">{t('skill.onlyTotals')}</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <p className="meta" style={{ padding: '8px 16px 16px' }}>{t('skill.deltaHint', { c: now.c, m: now.m, s: now.s })}</p>
      </Panel>
      <Panel title={t('skill.myBuilds')} actions={<Btn icon={Save} onClick={() => setSave(true)} disabled={!totalPoints(cur)}>{t('skill.saveCurrent')}</Btn>} flush>
        {st.skills.builds.length === 0 ? <p className="muted" style={{ padding: '0 16px 16px' }}>{t('skill.buildsEmpty')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Build</th><th className="num">{t('top.skillShort')}</th><th className="num">Cond.</th><th className="num">Mob.</th><th className="num">Surv.</th><th>{t('skill.noReset')}</th><th>{t('common.note')}</th><th className="actions-cell">{t('inv.actions')}</th></tr></thead>
              <tbody>{st.skills.builds.map(b => {
                const bt = branchTotals(b.points);
                const key = BUILD_PREFIX + b.id;
                return (
                  <tr key={b.id} className={plan === key ? 'selected' : ''}>
                    <td><b>{b.name}</b> {plan === key && <Badge tone="accent">{t('skill.yourPlan')}</Badge>}</td>
                    <td className="num">{totalPoints(b.points)}</td>
                    <td className="num">{bt.c}<span className="muted">{delta(bt.c, now.c)}</span></td><td className="num">{bt.m}<span className="muted">{delta(bt.m, now.m)}</span></td><td className="num">{bt.s}<span className="muted">{delta(bt.s, now.s)}</span></td>
                    <td>{fitsPoints(cur, b.points) ? <Badge tone="success">{t('common.yes')}</Badge> : <Badge tone="orange">Reset</Badge>}</td>
                    <td className="wrap">{b.note}</td>
                    <td className="actions-cell">
                      <span className="row" style={{ flexWrap: 'nowrap' }}>
                        {plan !== key && <Btn size="sm" onClick={() => actions.setPlan(key)}>{t('skill.useAsPlan')}</Btn>}
                        <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('skill.deleteBuild')} confirmLabel={t('skill.deleteBuild')} text={<p>{t('skill.deleteBuildText', { name: b.name })}</p>} onConfirm={() => actions.deleteBuild(b.id)}>{t('common.delete')}</ConfirmButton>
                      </span>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Panel>
      {save && <SaveBuildDialog onClose={() => setSave(false)} />}
    </div>
  );
}

export default function SkillTree({ sub }: { sub: string }) {
  const st = useAppState();
  const d = useDerived();
  const [tab, setTab] = useState<Tab>(sub === 'builds' || sub === 'plan' ? sub : 'tree');
  const t = useT();
  const cur = st.skills.current;
  const free = d.budget - d.used;
  const bad = invalidNodes(cur);
  const plan = st.skills.activePlan;
  const totals = PLANS[plan]?.totals;
  const nx = d.nextPoint;
  const planOptions = [
    ...Object.entries(PLANS).map(([k, v]) => ({ value: k, label: v.name })),
    ...st.skills.builds.map(b => ({ value: BUILD_PREFIX + b.id, label: 'Build: ' + b.name })),
  ];
  return (
    <div className="page">
      <PageHead title="Skill Tree" sub={t('skill.sub')} />
      <div className="panel skill-bar">
        <div className="skill-bar-stats">
          <div className="stat"><span className="label">{t('top.skillShort')}</span><span className={cx('stat-val', free < 0 && 'danger')}>{d.used} / {d.budget}</span><span className="meta">{st.profile.expBonus ? t('skill.budgetExp', { level: st.profile.level, exp: st.profile.expBonus }) : t('skill.budget', { level: st.profile.level })}{free < 0 ? ' · ' + t('top.over') : ''}</span></div>
          <div className="stat"><span className="label">{t('skill.resetCost')}</span><span className="stat-val amber">{fmt(resetCost(cur))}</span><span className="meta">{t('skill.perPoint', { n: 2000 })}</span></div>
          <div className="stat"><span className="label">{t('skill.nextByPlan')}</span><span className="stat-val" style={{ fontFamily: 'var(--font-ui)', fontSize: 16 }}>{nx ? SKILLS.find(s => s.id === nx.id)!.name : t('common.done')}</span><span className="meta">{nx ? t('skill.targetN', { to: nx.to, max: SKILLS.find(s => s.id === nx.id)!.max }) : totals || d.planName}</span></div>
        </div>
        <div className="skill-bar-actions">
          <div style={{ width: 220 }}><Select label={t('skill.plan')} value={plan} onChange={v => actions.setPlan(v)} options={planOptions} /></div>
          <Stepper label={t('profile.exp')} hideLabel={false} value={st.profile.expBonus} min={0} max={15} onChange={n => actions.setProfile('expBonus', n)} />
          <label className="toggle"><input type="checkbox" checked={st.skills.showPlan} onChange={e => actions.setShowPlan(e.target.checked)} />{t('skill.showTargets')}</label>
          {nx && <Btn variant="primary" icon={Wand2} disabled={free <= 0} onClick={() => actions.planFill()}>{free > 0 ? t('skill.fillN', { count: free }) : t('skill.fill')}</Btn>}
          {nx && <Btn disabled={free <= 0} onClick={() => actions.planNext()}>{t('skill.one')}</Btn>}
          {d.used > 0 && <ConfirmButton variant="ghost" title={t('skill.empty')} confirmLabel={t('skill.empty')} text={<p>{t('skill.emptyText', { count: d.used, cost: fmt(resetCost(cur)) })}</p>} onConfirm={() => actions.treeReset()}>{t('skill.emptyBtn')}</ConfirmButton>}
        </div>
      </div>
      {Object.keys(bad).length > 0 && <div className="banner danger" role="alert" style={{ borderRadius: 6, border: '1px solid var(--danger)' }}><CircleAlert size={18} aria-hidden="true" /><span className="banner-text">{t('skill.invalid')}</span></div>}
      <p className="meta">{t('skill.planHint', { plan: d.planName + (totals ? ` (${totals})` : ''), fill: t('skill.fill') })} {gameTexts(t.lang).treeRules}</p>
      <Tabs label="Skill Tree" value={tab} onChange={setTab} tabs={[{ id: 'tree', label: t('skill.tab.tree') }, { id: 'plan', label: t('skill.tab.plan') }, { id: 'builds', label: t('skill.tab.builds') }]} />
      {tab === 'tree' && <Tree />}
      {tab === 'plan' && <PlanList />}
      {tab === 'builds' && <Builds />}
    </div>
  );
}
