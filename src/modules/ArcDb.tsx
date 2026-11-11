import { useMemo, useState } from 'react';
import { Bot, ChevronRight, Eye, EyeOff, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, ConfirmButton, Dialog, Empty, ExtLink, OriginBadge, PageHead, Panel, Search, Select, TextField, cx, orNA } from '../ui/components';
import { hiddenArc, baseArc, type Edited } from '../core/gamedata';
import { dangerLabel } from '../core/gametext';
import { ARC_DANGERS } from '../core/data/arc';
import type { ArcUnit } from '../core/types';
import { useT } from '../i18n/react';

type Unit = Edited<ArcUnit>;

function EditArc({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const t = useT();
  const [f, setF] = useState({
    name: unit.name, type: unit.type, category: unit.category, difficulty: unit.difficulty, danger: unit.danger,
    traits: unit.traits, weakness: unit.weakness, tactic: unit.tactic, gear: unit.gear, drops: unit.drops.join(', '),
  });
  const field = (k: 'type' | 'category' | 'traits' | 'weakness' | 'tactic' | 'gear' | 'drops' | 'name', label: string, multi = false) => (
    <div className="field"><label className="field-label" htmlFor={'arc-' + k}>{label}</label>
      {multi ? <textarea id={'arc-' + k} className="textarea" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />
        : <input id={'arc-' + k} className="input" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />}</div>
  );
  const save = () => {
    /* Formulář je předvyplněný základem v aktuálním jazyce: pole beze změny proti základu (v kterémkoli jazyce)
       se neuloží, takže se vestavěný text nezmrazí v jednom jazyce. */
    const bases = [baseArc(unit.id, 'cs'), baseArc(unit.id, 'en')].filter((b): b is ArcUnit => !!b);
    const next: Partial<ArcUnit> = { ...f, drops: f.drops.split(',').map(x => x.trim()).filter(Boolean) };
    /* U vestavěného záznamu ukládáme jen pole, která se liší od základu. */
    for (const k of Object.keys(next) as (keyof ArcUnit)[]) if (bases.some(b => JSON.stringify(next[k]) === JSON.stringify(b[k]))) delete next[k];
    actions.editArc(unit.id, next);
    onClose();
  };
  return (
    <Dialog title={t('common.editItem', { name: unit.name })} size="wide" onClose={onClose}
      footNote={t('arc.editNote')}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" onClick={save}>{t('common.save')}</Btn></>}>
      <div className="form-grid">
        {unit.origin === 'vlastni' && field('name', t('common.name'))}
        {field('type', t('arc.type'))}
        {field('category', t('inv.category'))}
        <Select label={t('arc.danger')} value={f.danger} onChange={v => setF({ ...f, danger: v })} options={[{ value: '', label: t('common.notSpecified') }, ...[...ARC_DANGERS, ...(f.danger && !(ARC_DANGERS as readonly string[]).includes(f.danger) ? [f.danger] : [])].map(x => ({ value: x, label: dangerLabel(x, t.lang) }))]} />
        <Select label={t('maps.difficulty')} value={String(f.difficulty)} onChange={v => setF({ ...f, difficulty: Number(v) })} options={[{ value: '0', label: t('common.notSpecified') }, ...[1, 2, 3, 4, 5].map(x => ({ value: String(x), label: `${x} / 5` }))]} />
      </div>
      {field('tactic', t('arc.tactic'), true)}
      {field('weakness', t('arc.weakness'), true)}
      {field('traits', t('arc.traits'), true)}
      {field('gear', t('arc.gearRec'), true)}
      {field('drops', t('arc.dropsComma'))}
    </Dialog>
  );
}

function Detail({ unit, needed }: { unit: Unit; needed: Record<string, number> }) {
  const s = useAppState();
  const t = useT();
  const [edit, setEdit] = useState(false);
  const research = unit.sources.length > 0;
  return (
    <div className="stack">
      <div className="row"><h2 className="grow">{unit.name}</h2><OriginBadge origin={unit.origin} edited={unit.edited} />{unit.since && <Badge>{t('arc.since', { v: unit.since })}</Badge>}</div>
      <dl className="dl">
        <dt>{t('arc.type')}</dt><dd>{orNA(unit.type)}</dd>
        <dt>{t('inv.category')}</dt><dd>{orNA(unit.category)}</dd>
        <dt>{t('maps.difficulty')}</dt><dd>{unit.difficulty ? `${unit.difficulty} / 5` : orNA('')}</dd>
        <dt>{t('arc.danger')}</dt><dd>{orNA(dangerLabel(unit.danger, t.lang))}</dd>
        <dt>{t('arc.weakness')}</dt><dd>{orNA(unit.weakness)}{unit.weakness && research && !unit.weaknessVerified && <> <Badge tone="amber">{t('origin.reserse')}</Badge></>}</dd>
        <dt>{t('arc.traits')}</dt><dd>{orNA(unit.traits)}</dd>
        <dt>{t('arc.tactic')}</dt><dd>{orNA(unit.tactic)} {unit.origin === 'denik' && unit.tactic && <Badge>{t('origin.denik')}</Badge>}</dd>
        <dt>{t('loadout.gear')}</dt><dd>{orNA(unit.gear)}</dd>
        <dt>{t('arc.drops')}</dt><dd className="row">{unit.drops.length ? unit.drops.map(dr => (
          <Badge key={dr} tone={needed[dr] ? 'amber' : undefined}>{dr}{needed[dr] ? ' · ' + t('arc.dropMissing', { n: needed[dr] }) : ''}{s.inventory[dr] ? ' · ' + t('arc.dropHave', { n: s.inventory[dr] }) : ''}</Badge>
        )) : orNA('')}</dd>
      </dl>
      {research && (
        <div className="stack-sm">
          <span className="note-head">{t('arc.sources')}</span>
          <p className="meta">{t('arc.sourcesHint')}</p>
          {unit.sources.map(u => <ExtLink key={u} url={u}>{u.replace(/^https:\/\/(www\.)?/, '').slice(0, 60)}</ExtLink>)}
        </div>
      )}
      <hr className="divider" />
      <span className="note-head">{t('maps.myNotes')}</span>
      <TextField key={unit.id} label={t('arc.notesLabel', { name: unit.name })} hideLabel multiline value={s.arcNotes[unit.id] || ''} onCommit={v => actions.setArcNote(unit.id, v)} placeholder={t('arc.notesPh')} />
      <div className="row">
        <Btn size="sm" icon={Pencil} onClick={() => setEdit(true)}>{t('arc.editData')}</Btn>
        {unit.edited && <Btn size="sm" icon={Undo2} onClick={() => actions.resetArc(unit.id)}>{t('check.restore')}</Btn>}
        {unit.origin === 'vlastni'
          ? <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('arc.deleteTitle')} confirmLabel={t('common.delete')} text={<p>{t('arc.deleteText', { name: unit.name })}</p>} onConfirm={() => actions.deleteCustomArc(unit.id)}>{t('common.delete')}</ConfirmButton>
          : <Btn size="sm" variant="ghost" icon={EyeOff} onClick={() => actions.setArcHidden(unit.id, true)}>{t('common.hide')}</Btn>}
      </div>
      {edit && <EditArc key={t.lang} unit={unit} onClose={() => setEdit(false)} />}
    </div>
  );
}

export default function ArcDb({ sub }: { sub: string }) {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [q, setQ] = useState('');
  const [onlyNeeded, setOnlyNeeded] = useState(sub === 'needed');
  const [danger, setDanger] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const needed = useMemo(() => Object.fromEntries(d.shop.filter(x => x.missing > 0).map(x => [x.mat, x.missing])), [d.shop]);
  const rows = d.arc.filter(a => {
    const hay = [a.name, a.tactic, a.type, a.category, a.weakness, a.traits, dangerLabel(a.danger, t.lang), s.arcNotes[a.id] || '', ...a.drops].join(' ').toLowerCase();
    return (!q || hay.includes(q.trim().toLowerCase())) && (!onlyNeeded || a.drops.some(x => needed[x])) && (!danger || a.danger === danger);
  });
  const selected = rows.find(a => a.id === sel) || null;
  const hidden = hiddenArc(s.gameData, t.lang);
  const reset = () => { setQ(''); setOnlyNeeded(false); setDanger(''); };
  const wide = typeof window !== 'undefined' && window.innerWidth >= 1280;
  return (
    <div className="page">
      <PageHead title="ARC Database" sub={t('arc.sub')}
        actions={<Btn icon={Plus} onClick={() => setSel(actions.addCustomArc(t('default.newArc')))}>{t('arc.custom')}</Btn>} />
      <div className="panel"><div className="panel-body">
        <div className="filter-bar">
          <Search label={t('arc.search')} value={q} onChange={setQ} placeholder={t('arc.searchPh')} />
          <div style={{ width: 180 }}><Select label={t('arc.danger')} value={danger} onChange={setDanger} options={[{ value: '', label: t('common.all') }, ...ARC_DANGERS.map(x => ({ value: x, label: dangerLabel(x, t.lang) }))]} /></div>
          <label className="toggle" style={{ height: 36 }}><input type="checkbox" checked={onlyNeeded} onChange={e => setOnlyNeeded(e.target.checked)} />{t('arc.onlyNeeded')}</label>
          <span className="meta" aria-live="polite">{t('inv.countOf', { n: rows.length, total: d.arc.length })}</span>
          {(q || onlyNeeded || danger) && <Btn size="sm" variant="ghost" onClick={reset}>{t('filter.clear')}</Btn>}
        </div>
      </div></div>
      <div className={cx('master-detail', selected && wide && 'with-detail')}>
        <Panel title={t('arc.machines')} flush>
          {rows.length === 0 ? <Empty icon={Bot} action={<Btn onClick={reset}>{t('filter.clear')}</Btn>}>{t('filter.none')}</Empty> : (
            <div className="list-rows">
              {rows.map(a => {
                const need = a.drops.filter(x => needed[x]);
                return (
                  <button key={a.id} type="button" className={cx('list-row arc-row', sel === a.id && 'selected')} aria-current={sel === a.id ? 'true' : undefined} onClick={() => setSel(a.id)}>
                    <span className="grow"><b>{a.name}</b>{a.origin === 'vlastni' && <> <Badge tone="accent">{t('origin.vlastni')}</Badge></>}
                      <small>{[a.category || null, a.danger ? t('arc.dangerLower', { v: dangerLabel(a.danger, t.lang).toLowerCase() }) : null].filter(Boolean).join(' · ') || a.tactic.slice(0, 90)}</small></span>
                    {need.length > 0 && <Badge tone="amber">{need.length === 1 ? t('arc.missingOne', { name: need[0] }) : t('arc.missingDrops', { count: need.length })}</Badge>}
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
        {selected && wide && <Panel className="detail-panel"><Detail unit={selected} needed={needed} /></Panel>}
      </div>
      {selected && !wide && <Dialog title={selected.name} size="side" onClose={() => setSel(null)}><Detail unit={selected} needed={needed} /></Dialog>}
      {hidden.length > 0 && (
        <Panel title={t('arc.hidden')} actions={<Btn size="sm" variant="ghost" onClick={() => setShowHidden(!showHidden)}>{showHidden ? t('arc.collapse') : t('arc.showN', { n: hidden.length })}</Btn>}>
          {showHidden && hidden.map(h => <div key={h.id} className="row between"><span>{h.name}</span><Btn size="sm" icon={Eye} onClick={() => actions.setArcHidden(h.id, false)}>{t('common.show')}</Btn></div>)}
        </Panel>
      )}
    </div>
  );
}
