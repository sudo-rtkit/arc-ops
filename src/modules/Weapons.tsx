import { useState } from 'react';
import { Crosshair, Eye, EyeOff, Pencil, Plus, Trash2, Undo2, X } from 'lucide-react';
import { actions, navigate, useAppState, useDerived } from '../store';
import Loadouts from './Loadouts';
import { Badge, Btn, ConfirmButton, Dialog, ExtLink, OriginBadge, PageHead, Panel, Search, Select, Tabs, TextField, cx, orNA } from '../ui/components';
import { TIER_ORDER } from '../core/data/weapons';
import { WEAPON_PHASES } from '../core/data/weaponsDiary';
import { gameTexts, patchNotes, weaponPhases } from '../core/gametext';
import { baseWeapon, hiddenWeapons, type Edited } from '../core/gamedata';
import type { Weapon } from '../core/types';
import { useT } from '../i18n/react';

type W = Edited<Weapon>;
const TIER_TONE: Record<string, 'accent' | 'success' | 'amber' | undefined> = { S: 'accent', A: 'success', B: 'amber', C: undefined };

function EditWeapon({ w, onClose }: { w: W; onClose: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: w.name, tier: w.tier, antiArc: w.antiArc, category: w.category, ammo: w.ammo, info: w.info });
  const custom = w.origin === 'vlastni';
  const save = () => {
    /* Pole beze změny proti vestavěnému základu (v kterémkoli jazyce) se neukládá. */
    const bases = [baseWeapon(w.id, 'cs'), baseWeapon(w.id, 'en')].filter((b): b is Weapon => !!b);
    const next: Partial<Weapon> = custom ? f : { category: f.category, ammo: f.ammo, info: f.info };
    /* Pole vrácené na základ (undefined) smaže dřívější úpravu. */
    for (const k of Object.keys(next) as (keyof Weapon)[]) if (bases.some(b => next[k] === b[k])) next[k] = undefined;
    actions.editWeapon(w.id, next);
    onClose();
  };
  return (
    <Dialog title={t('common.editItem', { name: w.name })} onClose={onClose} footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" onClick={save}>{t('common.save')}</Btn></>}
      footNote={custom ? undefined : t('wpn.editNote')}>
      {custom && <>
        <div className="field"><label className="field-label" htmlFor="w-name">{t('common.name')}</label><input id="w-name" className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <Select label="Tier" value={f.tier} onChange={v => setF({ ...f, tier: v })} options={[{ value: '', label: t('wpn.noTier') }, ...TIER_ORDER.map(x => ({ value: x, label: x }))]} />
        <label className="toggle"><input type="checkbox" checked={f.antiArc} onChange={e => setF({ ...f, antiArc: e.target.checked })} />Anti-ARC</label>
      </>}
      <div className="field"><label className="field-label" htmlFor="w-cat">{t('inv.category')}</label><input id="w-cat" className="input" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></div>
      <div className="field"><label className="field-label" htmlFor="w-ammo">{t('wpn.ammo')}</label><input id="w-ammo" className="input" value={f.ammo} onChange={e => setF({ ...f, ammo: e.target.value })} /></div>
      <div className="field"><label className="field-label" htmlFor="w-info">{t('wpn.info')}</label><textarea id="w-info" className="textarea" value={f.info} onChange={e => setF({ ...f, info: e.target.value })} /></div>
    </Dialog>
  );
}

function WeaponDetail({ w, onClose }: { w: W; onClose: () => void }) {
  const t = useT();
  const note = useAppState().weaponNotes[w.id] || { tier: '', note: '' };
  const [edit, setEdit] = useState(false);
  return (
    <Dialog title={w.name} size="side" onClose={onClose} footer={<Btn onClick={onClose}>{t('common.close')}</Btn>}>
      <div className="row"><OriginBadge origin={w.origin} edited={w.edited} />{w.tier && <Badge className="tier" tone={TIER_TONE[w.tier]}>{w.tier}</Badge>}{w.antiArc && <Badge tone="accent"><Crosshair size={12} aria-hidden="true" />anti-ARC</Badge>}</div>
      <dl className="dl">
        <dt>{t('wpn.tierDiary')}</dt><dd>{w.tier || orNA('')}</dd>
        <dt>{t('inv.category')}</dt><dd>{orNA(w.category)}{w.category && w.sources.length > 0 && <> <Badge tone="amber">{t('origin.reserse')}</Badge></>}</dd>
        <dt>{t('wpn.ammo')}</dt><dd>{orNA(w.ammo)}</dd>
        <dt>{t('wpn.info')}</dt><dd>{orNA(w.info)}</dd>
      </dl>
      {w.sources.length > 0 && <div className="stack-sm"><span className="note-head">{t('arc.sources')}</span>{w.sources.map(u => <ExtLink key={u} url={u}>{u.replace(/^https:\/\/(www\.)?/, '').slice(0, 60)}</ExtLink>)}</div>}
      <hr className="divider" />
      <span className="note-head">{t('wpn.myRating')}</span>
      <Select label={t('wpn.ownTier')} value={note.tier} onChange={v => actions.setWeaponNote(w.id, { tier: v })} options={[{ value: '', label: t('wpn.noOwnTier') }, ...TIER_ORDER.map(x => ({ value: x, label: x }))]} />
      <TextField key={w.id} label={t('maps.myNotes')} multiline value={note.note} onCommit={v => actions.setWeaponNote(w.id, { note: v })} />
      <div className="row">
        <Btn size="sm" icon={Pencil} onClick={() => setEdit(true)}>{t('arc.editData')}</Btn>
        {w.edited && <Btn size="sm" icon={Undo2} onClick={() => actions.resetWeapon(w.id)}>{t('check.restore')}</Btn>}
        {w.origin === 'vlastni'
          ? <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('wpn.deleteTitle')} confirmLabel={t('common.delete')} text={<p>{t('wpn.deleteText', { name: w.name })}</p>} onConfirm={() => { actions.deleteCustomWeapon(w.id); onClose(); }}>{t('common.delete')}</ConfirmButton>
          : <Btn size="sm" variant="ghost" icon={EyeOff} onClick={() => { actions.setWeaponHidden(w.id, true); onClose(); }}>{t('common.hide')}</Btn>}
      </div>
      {edit && <EditWeapon key={t.lang} w={w} onClose={() => setEdit(false)} />}
    </Dialog>
  );
}

export default function Weapons({ sub }: { sub: string }) {
  const tab = sub === 'loadouts' ? 'loadouts' : 'tiers';
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [q, setQ] = useState('');
  const [onlyArc, setOnlyArc] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const list = d.weapons.filter(w => (!q || (w.name + ' ' + w.category + ' ' + w.ammo).toLowerCase().includes(q.toLowerCase())) && (!onlyArc || w.antiArc));
  const tiers = [...TIER_ORDER, ''];
  const toggleCompare = (id: string) => setCompare(c => (c.includes(id) ? c.filter(x => x !== id) : c.length >= 3 ? c : [...c, id]));
  const cmp = compare.map(id => d.weapons.find(w => w.id === id)).filter((w): w is W => !!w);
  const detail = d.weapons.find(w => w.id === open);
  const hidden = hiddenWeapons(s.gameData, t.lang);
  return (
    <div className="page">
      <PageHead title="Weapons" sub={t('wpn.sub')}
        actions={tab === 'tiers' ? <Btn icon={Plus} onClick={() => setOpen(actions.addCustomWeapon(t('default.newWeapon')))}>{t('wpn.custom')}</Btn> : undefined} />
      <Tabs label="Weapons" value={tab} onChange={v => navigate('weapons', v === 'tiers' ? '' : v)} tabs={[{ id: 'tiers', label: 'Tier list' }, { id: 'loadouts', label: <>{t('loadout.title')} {s.loadouts.length > 0 && <Badge>{s.loadouts.length}</Badge>}</> }]} />
      {tab === 'loadouts' && <Loadouts />}
      {tab === 'tiers' && <>
      <Panel title={t('wpn.tierTitle')}>
        <div className="filter-bar">
          <Search label={t('wpn.search')} value={q} onChange={setQ} />
          <label className="toggle" style={{ height: 36 }}><input type="checkbox" checked={onlyArc} onChange={e => setOnlyArc(e.target.checked)} />{t('wpn.onlyArc')}</label>
          <span className="meta">{t('wpn.count', { count: list.length, n: cmp.length })}</span>
        </div>
        <div className="tier-list">
          {tiers.map(tier => {
            const ws = list.filter(w => w.tier === tier);
            if (!ws.length) return null;
            return (
              <div key={tier || 'none'} className="tier-row">
                <span className={cx('tier-label', 't-' + (tier || 'none'))} aria-label={tier ? `Tier ${tier}` : t('wpn.noTier')}>{tier || '—'}</span>
                <div className="tier-items">
                  {ws.map(w => {
                    const own = s.weaponNotes[w.id]?.tier;
                    return (
                      <div key={w.id} className={cx('wchip', compare.includes(w.id) && 'selected')}>
                        <button type="button" className="wchip-main" onClick={() => setOpen(w.id)} aria-label={t('wpn.detailAria', { name: w.name })}>
                          <b>{w.name}</b>
                          {w.antiArc && <Badge tone="accent"><Crosshair size={12} aria-hidden="true" />anti-ARC</Badge>}
                          {own && own !== w.tier && <Badge title={t('wpn.myRating')}>{t('wpn.mine', { v: own })}</Badge>}
                          {w.origin === 'vlastni' && <Badge tone="accent">{t('origin.vlastni')}</Badge>}
                        </button>
                        <label className="wchip-cmp" title={t('wpn.compare')}><input type="checkbox" checked={compare.includes(w.id)} disabled={!compare.includes(w.id) && compare.length >= 3} onChange={() => toggleCompare(w.id)} /><span className="sr-only">{t('wpn.compareAria', { name: w.name })}</span></label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="meta">{gameTexts(t.lang).tierHint}</p>
      </Panel>
      {cmp.length > 0 && (
        <Panel title={t('wpn.comparison')} actions={<Btn size="sm" variant="ghost" icon={X} onClick={() => setCompare([])}>{t('wpn.clearCompare')}</Btn>} flush>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('wpn.field')}</th>{cmp.map(w => <th key={w.id}>{w.name}</th>)}</tr></thead>
              <tbody>
                <tr><td>{t('wpn.tierDiary')}</td>{cmp.map(w => <td key={w.id}>{w.tier || '—'}</td>)}</tr>
                <tr><td>{t('wpn.myRating')}</td>{cmp.map(w => <td key={w.id}>{s.weaponNotes[w.id]?.tier || '—'}</td>)}</tr>
                <tr><td>Anti-ARC</td>{cmp.map(w => <td key={w.id}>{w.antiArc ? t('common.yes') : t('common.no')}</td>)}</tr>
                <tr><td>{t('inv.category')}</td>{cmp.map(w => <td key={w.id}>{orNA(w.category)}</td>)}</tr>
                <tr><td>{t('wpn.ammo')}</td>{cmp.map(w => <td key={w.id}>{orNA(w.ammo)}</td>)}</tr>
                <tr><td>{t('wpn.phaseDiary')}</td>{cmp.map(w => <td key={w.id}>{WEAPON_PHASES.filter(p => (p[2] + ', ' + p[3]).includes(w.name)).map(p => p[0]).join(', ') || '—'}</td>)}</tr>
                <tr><td>{t('maps.myNotes')}</td>{cmp.map(w => <td key={w.id} className="wrap">{s.weaponNotes[w.id]?.note || '—'}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <Panel title={t('wpn.byPhase')} flush>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('top.phase')}</th><th>{t('common.level')}</th><th>{t('wpn.vsPlayers')}</th><th>{t('wpn.vsArc')}</th></tr></thead>
            <tbody>{weaponPhases(t.lang).map(([f, l, p, a]) => {
              const cur = d.phases.current === Number(f);
              return <tr key={f} className={cur ? 'selected current-phase' : ''}><td><b className="mono">{f}</b>{cur && <> <Badge tone="accent">{t('wpn.now')}</Badge></>}</td><td>{l}</td><td>{p}</td><td>{a}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t('wpn.patch')}>
        <ul className="plain-list">{patchNotes(t.lang).map(n => <li key={n}>{n}</li>)}</ul>
      </Panel>
      {hidden.length > 0 && (
        <Panel title={t('wpn.hidden')} actions={<Btn size="sm" variant="ghost" onClick={() => setShowHidden(!showHidden)}>{showHidden ? t('arc.collapse') : t('arc.showN', { n: hidden.length })}</Btn>}>
          {showHidden && hidden.map(h => <div key={h.id} className="row between"><span>{h.name}</span><Btn size="sm" icon={Eye} onClick={() => actions.setWeaponHidden(h.id, false)}>{t('common.show')}</Btn></div>)}
        </Panel>
      )}
      </>}
      {detail && <WeaponDetail w={detail} onClose={() => setOpen(null)} />}
    </div>
  );
}
