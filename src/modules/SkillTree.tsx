import { useEffect, useState } from 'react';
import { ArrowLeft, Check as CheckIcon, CircleAlert, FlaskConical, GitCompare, Lock, Minus, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, ConfirmButton, Dialog, ExtLink, IconBtn, PageHead, Panel, Select, Stepper, Tabs, cx } from '../ui/components';
import { fmt, fmtDay } from '../ui/format';
import { BRANCHES, PLANS, SKILL, SKILLS } from '../core/data/skills';
import { BUILD_CATALOG, BUILD_GAME_VERSION } from '../core/data/builds';
import {
  addBlock, branchTotals, catalogPlanKey, catalogRef, fitsPoints, invalidNodes, planProgress, planTarget, pointsIn, resetCost, totalPoints, BUILD_PREFIX,
} from '../core/skills';
import { BUILD_SORTS, BUILD_TAGS, buildPoints, catalogBuild, compareTree, filterBuilds, sortBuilds, type BuildSort, type DiffRow } from '../core/buildCatalog';
import { gameTexts, skillDesc, tierNames } from '../core/gametext';
import type { BranchId, BuildTag, CatalogBuild, Points, Skill } from '../core/types';
import { branchVar } from './shared';
import { useT } from '../i18n/react';

type Tab = 'tree' | 'plan' | 'builds';

function Node({ s, have, target, next, bad, readOnly }: { s: Skill; have: number; target: number; next: boolean; bad?: string; readOnly?: boolean }) {
  const st = useAppState();
  const t = useT();
  const full = have >= s.max;
  if (readOnly) {
    return (
      <div className={cx('node ro', have > 0 && 'has', full && 'full', have === 0 && 'off', s.t === 4 && 'end')} style={{ ['--bc' as string]: branchVar(s.b) }} data-skill={s.id}>
        <div className="node-head">
          <span className="node-name">{s.name}</span>
          <span className="node-pts mono">{have}/{s.max}</span>
        </div>
        <p className="node-desc">{skillDesc(s, t.lang)}</p>
      </div>
    );
  }
  const blk = addBlock(st.skills.current, s.id, st.profile);
  const locked = !!blk && have === 0 && blk !== t('skill.block.noPoint');
  return (
    <div className={cx('node', have > 0 && 'has', full && 'full', next && 'next', bad && 'invalid', locked && 'locked')} style={{ ['--bc' as string]: branchVar(s.b) }} data-node={s.id}>
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

/* Strom skillů. S „view“ jen pro čtení (náhled buildu z katalogu), jinak aktuální strom hráče s tlačítky. */
function Tree({ view, label }: { view?: Points; label?: string }) {
  const st = useAppState();
  const d = useDerived();
  const readOnly = !!view;
  const cur = view || st.skills.current;
  const target = !readOnly && st.skills.showPlan ? planTarget(cur, d.planSteps) : {};
  const bad = readOnly ? {} : invalidNodes(cur);
  const t = useT();
  const tiers = tierNames(t.lang);
  return (
    <div className={cx('tree-scroll', readOnly && 'tree-ro')} role={label ? 'region' : undefined} aria-label={label}>
      <div className="tree">
        {BRANCHES.map(b => (
          <section key={b.id} className="branch" style={{ ['--bc' as string]: branchVar(b.id) }} aria-label={b.name}>
            <header className="branch-head"><h3>{b.name}</h3><span className="mono">{t('skill.points', { count: pointsIn(cur, b.id) })}</span></header>
            {[0, 1, 2, 3, 4].map(tier => (
              <div key={tier} className="tier">
                <div className="tier-name label">{tiers[tier]}</div>
                <div className="tier-nodes">
                  {SKILLS.filter(s => s.b === b.id && s.t === tier).map(s => (
                    <Node key={s.id} s={s} have={cur[s.id] || 0} target={target[s.id] || 0} next={!readOnly && d.nextPoint?.id === s.id} bad={bad[s.id]} readOnly={readOnly} />
                  ))}
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

/* Uložení buildu: aktuální strom, nebo (catalog) body buildu z katalogu s předvyplněným názvem. */
function SaveBuildDialog({ onClose, points, initialName = '', initialNote = '', catalog }: {
  onClose: () => void; points?: Points; initialName?: string; initialNote?: string; catalog?: boolean;
}) {
  const cur = useAppState().skills.current;
  const pts = points || cur;
  const t = useT();
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState(initialNote);
  return (
    <Dialog title={catalog ? t('skill.saveFromCatalog') : t('skill.saveTitle')} onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" icon={Save} disabled={!name.trim()} onClick={() => { actions.saveBuild(name, note, pts); onClose(); }}>{t('skill.saveBuild')}</Btn></>}>
      <div className="field"><label className="field-label" htmlFor="bname">{t('common.name')}</label><input id="bname" className="input" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label className="field-label" htmlFor="bnote">{t('common.note')}</label><textarea id="bnote" className="textarea" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></div>
      <p className="meta">{catalog ? t('skill.saveCatalogHint', { count: totalPoints(pts) }) : t('skill.saveHint', { count: totalPoints(pts) })}</p>
    </Dialog>
  );
}

/* ----- katalog buildů ----- */

const BRANCH_IDS: BranchId[] = ['c', 'm', 's'];
const DIFF_DOTS = [1, 2, 3] as const;
const SECTIONS = ['summary', 'playstyle', 'strengths', 'weaknesses', 'synergies', 'loadout', 'leveling', 'notes'] as const;

function Difficulty({ n }: { n: 1 | 2 | 3 }) {
  const t = useT();
  return (
    <span className="build-diff" title={t('skill.difficulty') + ': ' + t(`skill.diff.${n}`)}>
      <span className="build-diff-dots" aria-hidden="true">{DIFF_DOTS.map(i => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
      <span className="meta">{t(`skill.diff.${n}`)}</span>
    </span>
  );
}

function BuildTags({ b }: { b: CatalogBuild }) {
  const t = useT();
  return <>{b.tags.map(tag => <Badge key={tag} tone={tag === 'broken' ? 'danger' : tag === 'expedition' ? 'amber' : undefined}>{t(`skill.tag.${tag}`)}</Badge>)}</>;
}

/* Mini strom: 3 sloupce (větve), řádky = patra, čtverečky = skilly s rankem; koncové uzly výrazně. */
function MiniTree({ points, name }: { points: Points; name: string }) {
  const t = useT();
  return (
    <div className="mini-tree" role="img" aria-label={t('skill.miniTree', { name })}>
      {BRANCH_IDS.map(b => (
        <div key={b} className="mini-branch" style={{ ['--bc' as string]: branchVar(b) }}>
          {[0, 1, 2, 3, 4].map(tier => (
            <div key={tier} className={cx('mini-tier', tier === 4 && 'end')}>
              {SKILLS.filter(s => s.b === b && s.t === tier).map(s => {
                const n = points[s.id] || 0;
                return (
                  <span key={s.id} className={cx('mini-node', n > 0 && 'on', n >= s.max && 'full', tier === 4 && 'end')}
                    title={t('skill.nodeRank', { name: s.name, n, max: s.max }) + (tier === 4 ? ' · ' + t('skill.endNode') : '')}>
                    {n > 0 && s.max > 1 ? n : ''}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BranchBars({ points }: { points: Points }) {
  const t = useT();
  return (
    <div className="branch-bars" role="group" aria-label={t('skill.branchBars')}>
      {BRANCHES.map(b => {
        const n = pointsIn(points, b.id);
        return (
          <div key={b.id} className="branch-bar" style={{ ['--bc' as string]: branchVar(b.id) }}>
            <span className="branch-bar-name">{b.name}</span>
            <span className="branch-bar-track" aria-hidden="true"><span style={{ width: `${Math.min(100, (n / 41) * 100)}%` }} /></span>
            <span className="mono branch-bar-num">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function BuildCard({ b, onOpen }: { b: CatalogBuild; onOpen: () => void }) {
  const st = useAppState();
  const t = useT();
  const name = b.name[t.lang];
  const diff = compareTree(st.skills.current, b.points);
  const active = st.skills.activePlan === catalogPlanKey(b) || (!!b.variant91 && st.skills.activePlan === catalogPlanKey(b, true));
  return (
    <article className={cx('build-card', b.theory && 'theory', active && 'active')} data-build={b.id} aria-label={name}>
      <header className="build-card-head">
        <h3>{name}</h3>
        <span className="mono meta">{totalPoints(b.points)}{b.variant91 ? ' / 91' : ''}</span>
      </header>
      <div className="row build-card-tags">
        <BuildTags b={b} />
        {b.theory && <Badge tone="danger">{t('skill.theory')}</Badge>}
        {active && <Badge tone="accent">{t('skill.yourPlan')}</Badge>}
      </div>
      <Difficulty n={b.difficulty} />
      <MiniTree points={b.points} name={name} />
      <BranchBars points={b.points} />
      <div className="build-keys"><span className="label">{t('skill.keySkills')}</span><span>{b.keys.map(k => SKILL[k].name).join(' · ')}</span></div>
      <footer className="build-card-foot">
        {diff.same ? <Badge tone="success">{t('skill.cmp.same')}</Badge> : diff.needsReset ? <Badge tone="orange">{t('skill.cmp.resetBadge')}</Badge> : <Badge tone="success">{t('skill.cmp.ok')}</Badge>}
        <Btn size="sm" variant="primary" onClick={onOpen} aria-label={t('skill.cat.openLabel', { name })}>{t('skill.cat.open')}</Btn>
      </footer>
    </article>
  );
}

function DiffList({ title, rows, sign }: { title: string; rows: DiffRow[]; sign: '+' | '−' }) {
  const t = useT();
  return (
    <div className="cmp-col" role="group" aria-label={title}>
      <h4 className="label">{title}</h4>
      {rows.length === 0 ? <p className="muted">{t('skill.cmp.none')}</p> : (
        <ul className="cmp-list">
          {rows.map(r => (
            <li key={r.id} style={{ ['--bc' as string]: branchVar(SKILL[r.id].b) }}>
              <span className="grow">{SKILL[r.id].name}</span>
              <span className="mono">{r.have} → {r.want}</span>
              <span className={cx('mono', sign === '+' ? 'success' : 'danger')}>{sign}{Math.abs(r.want - r.have)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComparePanel({ target }: { target: Points }) {
  const st = useAppState();
  const d = useDerived();
  const t = useT();
  const diff = compareTree(st.skills.current, target);
  const need = totalPoints(target);
  return (
    <Panel title={t('skill.compareTitle')} className="build-compare">
      <div className="stack" aria-live="polite">
        {diff.same ? <p><Badge tone="success">{t('skill.cmp.ok')}</Badge> {t('skill.cmp.same')}</p>
          : diff.needsReset ? (
            <div className="stack-sm">
              <p><Badge tone="orange">{t('skill.cmp.resetBadge')}</Badge> {t('skill.cmp.reset', { count: diff.extraPoints })}</p>
              <p className="meta">{t('skill.cmp.resetCost', { cost: diff.resetCost, count: totalPoints(st.skills.current), need })}</p>
            </div>
          ) : <p><Badge tone="success">{t('skill.cmp.ok')}</Badge> {t('skill.cmp.noReset', { count: diff.addPoints })}</p>}
        {need > d.budget && <p className="amber">{t('skill.cmp.over', { need, budget: d.budget })}</p>}
        <div className="cmp-grid">
          <DiffList title={t('skill.cmp.add')} rows={diff.add} sign="+" />
          <DiffList title={t('skill.cmp.extra')} rows={diff.extra} sign="−" />
        </div>
      </div>
    </Panel>
  );
}

function BuildDetail({ b, onBack }: { b: CatalogBuild; onBack: () => void }) {
  const st = useAppState();
  const t = useT();
  const [v91, setV91] = useState(() => !!b.variant91 && st.skills.activePlan === catalogPlanKey(b, true));
  const [cmp, setCmp] = useState(false);
  const [save, setSave] = useState(false);
  const name = b.name[t.lang];
  const variant = v91 && !!b.variant91;
  const points = buildPoints(b, variant);
  const key = catalogPlanKey(b, variant);
  const active = st.skills.activePlan === key;
  const desc = b.desc[t.lang];
  const label = name + (variant ? ' (91)' : '');
  return (
    <div className="stack build-detail" data-build-detail={b.id}>
      <div className="row"><Btn variant="ghost" icon={ArrowLeft} onClick={onBack}>{t('skill.back')}</Btn></div>
      <Panel title={name} actions={<span className="mono meta" data-testid="build-points">{t('skill.points', { count: totalPoints(points) })}</span>}>
        <div className="stack">
          <div className="row"><BuildTags b={b} /><Difficulty n={b.difficulty} />{b.only91 && <Badge tone="amber">{t('skill.only91')}</Badge>}</div>
          {b.theory && (
            <div className="build-theory" role="note"><FlaskConical size={18} aria-hidden="true" /><span><b>{t('skill.theory')}.</b> {t('skill.theoryText')}</span></div>
          )}
          {b.variant91 && (
            <div className="row">
              <span className="label">{t('skill.variant')}</span>
              <div className="seg" role="group" aria-label={t('skill.variant')}>
                <button type="button" aria-pressed={!variant} onClick={() => setV91(false)}>{t('skill.variant76')}</button>
                <button type="button" aria-pressed={variant} onClick={() => setV91(true)}>{t('skill.variant91')}</button>
              </div>
            </div>
          )}
          <BranchBars points={points} />
          <div className="row build-actions">
            {active ? <Badge tone="success">{t('skill.planLoaded')}</Badge> : <Btn variant="primary" icon={Wand2} onClick={() => actions.setPlan(key)}>{t('skill.loadPlan')}</Btn>}
            <Btn icon={GitCompare} aria-expanded={cmp} onClick={() => setCmp(x => !x)}>{cmp ? t('skill.compareHide') : t('skill.compare')}</Btn>
            <Btn icon={Save} onClick={() => setSave(true)}>{t('skill.saveAsMine')}</Btn>
          </div>
        </div>
      </Panel>
      {cmp && <ComparePanel target={points} />}
      <div className="build-desc">
        {SECTIONS.map(sec => {
          const v = desc[sec];
          if (!v || (Array.isArray(v) && !v.length)) return null;
          return (
            <section key={sec} className={cx('build-sec', sec === 'notes' && b.theory && 'theory')} aria-label={t(`skill.sec.${sec}`)}>
              <h3 className="label">{t(`skill.sec.${sec}`)}</h3>
              {Array.isArray(v) ? <ul>{v.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p>{v}</p>}
            </section>
          );
        })}
        <section className="build-sec" aria-label={t('skill.source')}>
          <h3 className="label">{t('skill.source')}</h3>
          <p className="row">
            {b.source.kind === 'web'
              ? b.source.refs.map(r => (r.url ? <ExtLink key={r.label} url={r.url}>{r.label}</ExtLink> : <span key={r.label}>{r.label}</span>))
              : <span>{t(b.source.kind === 'own' ? 'skill.source.own' : 'skill.source.diary')}</span>}
          </p>
          <p className="meta">{t('skill.sourceMeta', { date: fmtDay(b.source.date, t.lang), v: b.gameVersion })}</p>
          {b.source.kind === 'web' && <p className="meta">{t('skill.sourceHint')}</p>}
        </section>
      </div>
      <Tree view={points} label={t('skill.buildTree', { name: label })} />
      {save && <SaveBuildDialog catalog points={points} initialName={label} initialNote={t('skill.saveFromCatalogNote', { name: label })} onClose={() => setSave(false)} />}
    </div>
  );
}

function Catalog({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useAppState();
  const t = useT();
  const [tags, setTags] = useState<BuildTag[]>([]);
  const [sort, setSort] = useState<BuildSort>('default');
  const list = sortBuilds(filterBuilds(BUILD_CATALOG, tags), sort, st.skills.current, t.lang);
  const toggle = (tag: BuildTag) => setTags(x => (x.includes(tag) ? x.filter(y => y !== tag) : [...x, tag]));
  return (
    <Panel title={t('skill.cat.title')} actions={<span className="mono meta" aria-live="polite" data-testid="catalog-count">{t('skill.cat.count', { count: list.length, total: BUILD_CATALOG.length })}</span>}>
      <div className="stack">
        <p className="meta">{t('skill.cat.hint', { v: BUILD_GAME_VERSION })}</p>
        <div className="catalog-tools">
          <div className="tag-filter" role="group" aria-label={t('skill.cat.filter')}>
            <button type="button" className={cx('btn sm', !tags.length && 'selected')} aria-pressed={!tags.length} onClick={() => setTags([])}>{t('skill.cat.all')}</button>
            {BUILD_TAGS.map(tag => (
              <button key={tag} type="button" className={cx('btn sm', tags.includes(tag) && 'selected')} aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>{t(`skill.tag.${tag}`)}</button>
            ))}
          </div>
          <div className="catalog-sort"><Select label={t('skill.cat.sort')} value={sort} onChange={v => setSort(v as BuildSort)} options={BUILD_SORTS.map(x => ({ value: x, label: t(`skill.sort.${x}`) }))} /></div>
        </div>
        {list.length === 0 ? <p className="muted">{t('skill.cat.empty')}</p> : (
          <div className="build-grid">{list.map(b => <BuildCard key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}</div>
        )}
      </div>
    </Panel>
  );
}

function Builds() {
  const st = useAppState();
  const cur = st.skills.current;
  const now = branchTotals(cur);
  const [save, setSave] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const t = useT();
  const plan = st.skills.activePlan;
  const delta = (a: number, b: number) => { const x = a - b; return x === 0 ? '' : x > 0 ? ` (+${x})` : ` (${x})`; };
  const openBuild = open ? catalogBuild(open) : undefined;
  if (openBuild) return <BuildDetail key={openBuild.id} b={openBuild} onBack={() => setOpen(null)} />;
  return (
    <div className="stack">
      <Catalog onOpen={setOpen} />
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

/* Součty větví jako text pro lištu (vestavěný plán má text z deníku, katalog se spočítá). */
function planTotals(key: string): string | undefined {
  if (PLANS[key]) return PLANS[key].totals;
  const c = catalogRef(key);
  if (!c) return undefined;
  const bt = branchTotals(c.points);
  return `Conditioning ${bt.c} · Mobility ${bt.m} · Survival ${bt.s}`;
}

export default function SkillTree({ sub }: { sub: string }) {
  const st = useAppState();
  const d = useDerived();
  const [tab, setTab] = useState<Tab>(sub === 'builds' || sub === 'plan' ? sub : 'tree');
  /* 0.18.0: odkaz z hledání (#skills/builds, #skills/skill=<id>) přepne záložku a ukáže skill */
  useEffect(() => {
    if (sub === 'builds' || sub === 'plan') { setTab(sub); return; }
    if (!sub.startsWith('skill=')) return;
    setTab('tree');
    const id = sub.slice(6);
    const h = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`);
      el?.scrollIntoView?.({ block: 'center' });
      el?.classList.add('search-hit');
      setTimeout(() => el?.classList.remove('search-hit'), 2400);
    }, 40);
    return () => clearTimeout(h);
  }, [sub]);
  const t = useT();
  const cur = st.skills.current;
  const free = d.budget - d.used;
  const bad = invalidNodes(cur);
  const plan = st.skills.activePlan;
  const totals = planTotals(plan);
  const nx = d.nextPoint;
  const planOptions = [
    ...Object.entries(PLANS).map(([k, v]) => ({ value: k, label: v.name })),
    ...BUILD_CATALOG.filter(b => !b.plan).flatMap(b => [
      { value: catalogPlanKey(b), label: t('skill.cat.option', { name: b.name[t.lang] }) },
      ...(b.variant91 ? [{ value: catalogPlanKey(b, true), label: t('skill.cat.option', { name: b.name[t.lang] + ' (91)' }) }] : []),
    ]),
    ...st.skills.builds.map(b => ({ value: BUILD_PREFIX + b.id, label: 'Build: ' + b.name })),
  ];
  return (
    <div className="page">
      <PageHead title="Skill Tree" sub={t('skill.sub')} />
      <div className="panel skill-bar">
        <div className="skill-bar-stats">
          <div className="stat"><span className="label">{t('top.skillShort')}</span><span className={cx('stat-val', free < 0 && 'danger')}>{d.used} / {d.budget}</span><span className="meta">{st.profile.expBonus ? t('skill.budgetExp', { level: st.profile.level, exp: st.profile.expBonus }) : t('skill.budget', { level: st.profile.level })}{free < 0 ? ' · ' + t('top.over') : ''}</span></div>
          <div className="stat"><span className="label">{t('skill.resetCost')}</span><span className="stat-val amber">{fmt(resetCost(cur))}</span><span className="meta">{t('skill.perPoint', { n: 2000 })}</span></div>
          <div className="stat"><span className="label">{t('skill.nextByPlan')}</span><span className="stat-val" style={{ fontFamily: 'var(--font-ui)', fontSize: 16 }}>{nx ? SKILL[nx.id].name : t('common.done')}</span><span className="meta">{nx ? t('skill.targetN', { to: nx.to, max: SKILL[nx.id].max }) : totals || d.planName}</span></div>
        </div>
        <div className="skill-bar-actions">
          <div style={{ width: 260 }}><Select label={t('skill.plan')} value={plan} onChange={v => actions.setPlan(v)} options={planOptions} /></div>
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
