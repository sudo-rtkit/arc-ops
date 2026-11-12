/* Hlavní moduly v overlayi (0.10.1, milník 6 – podmnožina): Profil, Inventář, Dílna a Skill tree jako kompaktní
   přehledy s rychlými úpravami. Overlay drží jen kopii stavu (jeho store se nikdy nespustí ani neuloží), takže každá
   úprava jde jako pojmenovaná akce „edit“ do hlavního okna, kde ji hub ověří a provede stejnou akcí store jako
   v hlavním okně. Podrobnosti (grafy, recepty, buildy) zůstávají v aplikaci: odkaz „Otevřít v aplikaci“. */
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAppState, useDerived } from '../store';
import { profileLimit, type ProfileField } from '../store/app';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { fmt } from '../ui/format';
import { cx } from '../ui/components';
import { SKILLS, BRANCHES } from '../core/data/skills';
import { addBlock, branchTotals } from '../core/skills';
import { LIMITS } from '../core/state';
import type { Bus } from './bus';

export type EditOp =
  | { op: 'profile'; field: ProfileField; value: number }
  | { op: 'station'; id: string; dir: 1 | -1 }
  | { op: 'inv'; name: string; value: number }
  | { op: 'skill'; id: string; dir: 1 | -1 };

const send = (bus: Bus, e: EditOp) => bus.send('main', 'edit', e);
const openApp = (bus: Bus, route: string) => bus.send('main', 'open', { route });

/* Číselné pole, které zapisuje až po Enter nebo opuštění pole (ne při každém stisku). */
function NumIn({ value, min, max, label, onCommit, testId }: { value: number; min: number; max: number; label: string; onCommit: (v: number) => void; testId?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.max(min, Math.min(max, Math.round(Number(draft))));
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); } };
  return <input className="ov-input ov-count mono" type="number" min={min} max={max} value={draft ?? value} aria-label={label} data-testid={testId}
    onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={onKey} />;
}

function Head({ title, sub, route, bus }: { title: string; sub: string; route: string; bus: Bus }) {
  const t = useT();
  return (
    <div className="ov-head row-between">
      <div><h2>{title}</h2><p>{sub}</p></div>
      <button type="button" className="ov-btn" onClick={() => openApp(bus, route)}>{t('ops.ov.openApp')} →</button>
    </div>
  );
}

/* ----- Profil ----- */
const PROFILE_FIELDS: { f: ProfileField; k: Key }[] = [
  { f: 'level', k: 'common.level' }, { f: 'xp', k: 'profile.xp' }, { f: 'xpNext', k: 'profile.xpNext' },
  { f: 'coins', k: 'common.coins' }, { f: 'rounds', k: 'common.rounds' }, { f: 'rewardPass', k: 'profile.rp' },
];
export function OvProfile({ bus }: { bus: Bus }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const p = s.profile;
  return (
    <div className="ov-single" data-testid="ov-mod-profile">
      <Head title={t('ops.ov.m.profile')} sub={t('ops.ov.m.profileSub')} route="profile" bus={bus} />
      <div className="ov-kpis">
        <div className="ov-kpi accent"><span>{t('common.level')}</span><b>{p.level}</b><em>{t('ops.ov.m.points', { used: d.used, budget: d.budget })}</em></div>
        <div className="ov-kpi"><span>{t('common.coins')}</span><b>{fmt(p.coins)}</b><em>{t('ops.ov.m.rounds', { n: p.rounds })}</em></div>
        <div className="ov-kpi"><span>XP</span><b>{fmt(p.xp)}</b><em>{p.xpNext ? `/ ${fmt(p.xpNext)}` : '—'}</em></div>
      </div>
      <section className="ov-card">
        <h3>{t('ops.ov.m.quickEdit')}</h3>
        <div className="ov-form">
          {PROFILE_FIELDS.map(({ f, k }) => {
            const [lo, hi] = profileLimit(f);
            return <label key={f} className="ov-field">{t(k)}<NumIn value={p[f]} min={lo} max={hi} label={t(k)} testId={'ov-prof-' + f} onCommit={v => send(bus, { op: 'profile', field: f, value: v })} /></label>;
          })}
        </div>
        <p className="ov-muted">{t('ops.ov.m.profileHint')}</p>
      </section>
    </div>
  );
}

/* ----- Dílna ----- */
export function OvWorkshop({ bus }: { bus: Bus }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  return (
    <div className="ov-single" data-testid="ov-mod-workshop">
      <Head title={t('ops.ov.m.workshop')} sub={t('ops.ov.m.workshopSub', { now: d.workshop.now, max: d.workshop.max })} route="workshop" bus={bus} />
      <section className="ov-card">
        <table className="ov-table">
          <thead><tr><th>{t('ops.ov.m.col.station')}</th><th className="num">{t('ops.ov.m.col.level')}</th><th>{t('ops.ov.m.col.next')}</th><th><span className="sr-only">{t('ops.ov.m.col.edit')}</span></th></tr></thead>
          <tbody>{d.stations.map(st => {
            const lvl = s.stations[st.id] ?? st.min;
            const need = d.needs.find(n => n.station.id === st.id);
            return (
              <tr key={st.id} data-station={st.id}>
                <td><b>{st.name}</b></td>
                <td className="num mono" data-testid="ov-station-level">{lvl} / {st.max}</td>
                <td className="ov-why">{need ? (need.block ? need.block : need.mats.map(([m, n]) => `${m} ${fmt(Math.min(s.inventory[m] || 0, n))}/${fmt(n)}`).join(' · ')) : t('ops.ov.m.maxed')}</td>
                <td className="ov-steppers">
                  <button type="button" className="ov-btn icon" aria-label={t('ops.ov.m.down', { name: st.name })} disabled={lvl <= st.min} onClick={() => send(bus, { op: 'station', id: st.id, dir: -1 })}><Minus size={14} aria-hidden="true" /></button>
                  <button type="button" className="ov-btn icon" aria-label={t('ops.ov.m.up', { name: st.name })} disabled={lvl >= st.max || !!need?.block} onClick={() => send(bus, { op: 'station', id: st.id, dir: 1 })}><Plus size={14} aria-hidden="true" /></button>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
        <p className="ov-muted">{t('ops.ov.m.workshopHint')}</p>
      </section>
    </div>
  );
}

/* ----- Inventář ----- */
export function OvInventory({ bus }: { bus: Bus }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const names = [...new Set([...d.materials.map(m => m.name), ...Object.keys(s.inventory)])];
    const needle = q.trim().toLowerCase();
    return names.filter(n => (all || needle || (s.inventory[n] || 0) > 0) && (!needle || n.toLowerCase().includes(needle))).sort((a, b) => a.localeCompare(b)).slice(0, 200);
  }, [d.materials, s.inventory, q, all]);
  const pcs = Object.values(s.inventory).reduce((a, b) => a + b, 0);
  const items = Object.values(s.items).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="ov-body-grid" data-testid="ov-mod-inventory">
      <div className="ov-main">
        <Head title={t('ops.ov.m.inventory')} sub={t('ops.ov.m.inventorySub', { kinds: Object.keys(s.inventory).length, pcs })} route="inventory" bus={bus} />
        <section className="ov-card">
          <div className="ov-filter" role="group" aria-label={t('ops.ov.s.filter')}>
            <input className="ov-input" type="search" value={q} placeholder={t('ops.ov.m.search')} aria-label={t('ops.ov.m.search')} onChange={e => setQ(e.target.value)} data-testid="ov-inv-search" />
            <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>{t('ops.ov.m.inStock')}</button>
            <button type="button" aria-pressed={all} onClick={() => setAll(true)}>{t('ops.ov.m.allMats')}</button>
          </div>
          {rows.length === 0 ? <p className="ov-muted">{t('ops.ov.m.invEmpty')}</p> : (
            <table className="ov-table">
              <thead><tr><th>{t('ops.ov.s.col.item')}</th><th className="num">{t('ops.ov.s.col.have')}</th></tr></thead>
              <tbody>{rows.map(n => (
                <tr key={n} data-mat={n}><td>{n}</td>
                  <td className="num"><NumIn value={s.inventory[n] || 0} min={0} max={LIMITS.inventory[1]} label={t('ops.ov.m.countAria', { name: n })} onCommit={v => send(bus, { op: 'inv', name: n, value: v })} /></td></tr>
              ))}</tbody>
            </table>
          )}
          <p className="ov-muted">{t('ops.ov.m.invHint')}</p>
        </section>
      </div>
      <aside className="ov-rail">
        <section className="ov-card">
          <span className="ov-stencil">{t('ops.ov.m.items', { n: items.length })}</span>
          {items.length === 0 ? <p className="ov-muted">{t('ops.ov.m.itemsEmpty')}</p> : (
            <ul className="ov-list">{items.slice(0, 40).map(x => <li key={x.key}><span>{x.key}</span><b className="mono">{fmt(x.count)}</b></li>)}</ul>
          )}
        </section>
      </aside>
    </div>
  );
}

/* ----- Skill tree ----- */
export function OvSkills({ bus }: { bus: Bus }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const cur = s.skills.current;
  const tot = branchTotals(cur);
  const [branch, setBranch] = useState<'c' | 'm' | 's'>('m');
  const next = d.nextPoint;
  return (
    <div className="ov-single" data-testid="ov-mod-skills">
      <Head title={t('ops.ov.m.skills')} sub={t('ops.ov.m.points', { used: d.used, budget: d.budget })} route="skills" bus={bus} />
      <div className="ov-kpis">
        {BRANCHES.map(b => <div key={b.id} className={cx('ov-kpi', branch === b.id && 'accent')}><span>{b.name}</span><b>{tot[b.id]}</b></div>)}
        <div className="ov-kpi"><span>{t('ops.ov.m.plan')}</span><b className="ov-small">{d.planName || '—'}</b><em>{next ? t('ops.ov.m.planNext', { name: SKILLS.find(x => x.id === next.id)?.name ?? next.id, to: next.to }) : t('ops.ov.m.planNone')}</em></div>
      </div>
      <section className="ov-card">
        <div className="ov-filter" role="group" aria-label={t('ops.ov.m.branch')}>
          {BRANCHES.map(b => <button key={b.id} type="button" aria-pressed={branch === b.id} onClick={() => setBranch(b.id)}>{b.name}</button>)}
        </div>
        <table className="ov-table">
          <thead><tr><th>{t('ops.ov.m.col.skill')}</th><th className="num">{t('ops.ov.m.col.rank')}</th><th><span className="sr-only">{t('ops.ov.m.col.edit')}</span></th></tr></thead>
          <tbody>{SKILLS.filter(x => x.b === branch).map(k => {
            const r = cur[k.id] || 0, block = addBlock(cur, k.id, s.profile);
            return (
              <tr key={k.id} data-skill={k.id} className={cx(!r && 'off')}>
                <td><b>{k.name}</b></td>
                <td className="num mono">{r} / {k.max}</td>
                <td className="ov-steppers">
                  <button type="button" className="ov-btn icon" aria-label={t('ops.ov.m.down', { name: k.name })} disabled={!r} onClick={() => send(bus, { op: 'skill', id: k.id, dir: -1 })}><Minus size={14} aria-hidden="true" /></button>
                  <button type="button" className="ov-btn icon" aria-label={t('ops.ov.m.up', { name: k.name })} title={block ?? undefined} disabled={!!block} onClick={() => send(bus, { op: 'skill', id: k.id, dir: 1 })}><Plus size={14} aria-hidden="true" /></button>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
        <p className="ov-muted">{t('ops.ov.m.skillsHint')}</p>
      </section>
    </div>
  );
}
