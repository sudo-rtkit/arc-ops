import { useState } from 'react';
import { ArrowUpCircle, Check as CheckIcon, Lock, Pencil, Plus, Trash2, Undo2, Wrench } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, Confirm, Dialog, IconBtn, PageHead, Panel, Progress, Stepper, cx } from '../ui/components';
import { pct } from '../ui/format';
import { readiness, reqBlock } from '../core/workshop';
import { STATIONS as BASE_STATIONS } from '../core/data/stations';
import { gameTexts, sourceLabel, stationNote, stationRole } from '../core/gametext';
import { recipeKey } from '../core/gamedata';
import type { Recipe, Station } from '../core/types';
import { LIMITS } from '../core/state';
import { useT } from '../i18n/react';

function RecipeEditor({ station, level, onClose }: { station: Station; level: number; onClose: () => void }) {
  const t = useT();
  const gd = useAppState().gameData;
  const base = BASE_STATIONS.find(s => s.id === station.id)!.levels[level];
  const [rows, setRows] = useState<Recipe>(() => (gd.recipes[recipeKey(station.id, level)] || base).map(([m, n]) => [m, n] as [string, number]));
  const edited = !!gd.recipes[recipeKey(station.id, level)];
  const set = (i: number, v: [string, number]) => setRows(rows.map((r, j) => (j === i ? v : r)));
  return (
    <Dialog title={t('ws.recipeTitle', { name: station.name, n: level })} onClose={onClose}
      footNote={t('ws.recipeNote')}
      footer={<>
        {edited && <Btn icon={Undo2} onClick={() => { actions.setRecipe(station.id, level, null); onClose(); }}>{t('check.restore')}</Btn>}
        <Btn onClick={onClose}>{t('common.cancel')}</Btn>
        <Btn variant="primary" onClick={() => { actions.setRecipe(station.id, level, rows.filter(([m]) => m.trim())); onClose(); }}>{t('ws.saveRecipe')}</Btn>
      </>}>
      {rows.map(([m, n], i) => (
        <div key={i} className="row">
          <input className="input grow" aria-label={t('ws.material', { n: i + 1 })} value={m} onChange={e => set(i, [e.target.value, n])} />
          <input className="input num-input" style={{ width: 90 }} aria-label={t('ws.amount', { n: i + 1 })} inputMode="numeric" value={n} onChange={e => set(i, [m, Math.max(1, Math.min(99999, Number(e.target.value) || 1))])} />
          <IconBtn label={t('ws.removeRow')} icon={Trash2} onClick={() => setRows(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Btn icon={Plus} size="sm" onClick={() => setRows([...rows, ['', 1]])}>{t('ws.addMaterial')}</Btn>
      <p className="meta">{t('ws.defaultRecipe', { list: base.map(([m, n]) => `${n}× ${m}`).join(', ') })}</p>
    </Dialog>
  );
}

function StationCard({ st }: { st: Station }) {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [fix, setFix] = useState(false);
  const lvl = s.stations[st.id];
  const nxt = lvl + 1;
  const mats = st.levels[nxt];
  const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
  const blk = mats ? reqBlock(view, st, nxt) : null;
  const r = mats ? readiness(s.inventory, mats) : 1;
  const can = !!mats && !blk && r >= 1;
  const edited = mats && !!s.gameData.recipes[recipeKey(st.id, nxt)];
  const note = mats ? stationNote(st, nxt, t.lang) : undefined;
  return (
    <article className={cx('panel station', !mats && 'maxed', can && 'ready')} aria-label={st.name}>
      <div className="panel-head">
        <h2>{st.name}</h2>
        <span className="mono">{lvl} <span className="muted">/ {st.max}</span></span>
      </div>
      <div className="panel-body">
        <div className="row between"><span className="meta">{stationRole(st, t.lang)}</span>
          <div className="pips" aria-hidden="true">{Array.from({ length: st.max }, (_, i) => <span key={i} className={cx('pip', i < lvl && 'on')} />)}</div>
        </div>
        {mats ? (
          <>
            <div className="row between">
              <span className="label">{t('ws.next', { n: nxt })}</span>
              {blk ? <Badge tone="orange"><Lock size={12} aria-hidden="true" />{blk}</Badge> : can ? <Badge tone="success"><CheckIcon size={12} aria-hidden="true" />{t('rec.tone.success')}</Badge> : <span className="mono meta">{t('ws.matPct', { p: pct(r) })}</span>}
            </div>
            <Progress value={Math.round(r * 100)} max={100} showValue={false} tone={can ? 'success' : undefined} label={t('ws.readiness', { name: st.name, n: nxt })} />
            <ul className="mats">
              {mats.map(([m, n]) => {
                const have = s.inventory[m] || 0;
                return (
                  <li key={m} className={cx(have >= n && 'ok')}>
                    <span className="grow wrap">{m}<small>{sourceLabel(m, d.sources[m] || 'Loot', t.lang)}</small></span>
                    <Stepper label={t('ws.have', { name: m })} value={have} min={LIMITS.inventory[0]} max={LIMITS.inventory[1]} onChange={v => actions.invSet(m, v)} />
                    <span className={cx('mono need', have >= n ? 'success' : 'amber')}>/ {n}</span>
                  </li>
                );
              })}
            </ul>
            {note && <p className="meta">{note}</p>}
            <div className="row">
              <Btn variant="primary" size="sm" icon={ArrowUpCircle} disabled={!can} onClick={() => actions.upgrade(st.id)}>{t('ws.upgrade')}</Btn>
              <Btn size="sm" disabled={!!blk} onClick={() => actions.levelUp(st.id)} title={t('ws.levelUpTitle')}>{t('ws.levelUp')}</Btn>
              <IconBtn label={t('ws.editRecipe')} icon={Pencil} ghost onClick={() => setEditing(true)} />
              {edited && <Badge tone="accent">{t('ws.editedRecipe')}</Badge>}
            </div>
            {blk && <span className="meta">{t('ws.blocked', { reason: blk })}</span>}
          </>
        ) : <p className="success row"><CheckIcon size={16} aria-hidden="true" />{t('ws.max')}</p>}
        {lvl > st.min && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setFix(true)}><Wrench size={14} aria-hidden="true" />{t('ws.lower')}</button>}
      </div>
      {editing && mats && <RecipeEditor station={st} level={nxt} onClose={() => setEditing(false)} />}
      {fix && <Confirm title={t('ws.lowerTitle', { name: st.name })} confirmLabel={t('ws.lowerTo', { n: lvl - 1 })} danger={false} onClose={() => setFix(false)} onConfirm={() => { actions.levelDown(st.id); setFix(false); }}>
        <p>{t('ws.lowerText', { from: lvl, to: lvl - 1 })}</p>
        <p className="secondary-text">{t('ws.lowerNote')}</p>
      </Confirm>}
    </article>
  );
}

export default function Workshop() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const texts = gameTexts(t.lang);
  return (
    <div className="page">
      <PageHead title="Workshop" sub={t('ws.sub')} />
      <Panel title={t('ws.panel')} actions={<span className="mono meta">{t('ws.levels', { n: d.workshop.now, max: d.workshop.max })}</span>}>
        <Progress value={d.workshop.now} max={d.workshop.max} showValue={false} label={t('ws.total')} />
        <p className="meta">{texts.workshopHint}</p>
      </Panel>
      <div className="station-grid">{d.stations.map(st => <StationCard key={st.id} st={st} />)}</div>
      <Panel title={t('profile.amplified')}>
        <p className="secondary-text">{texts.amplified}</p>
        <div className="row"><span>{t('ws.ampCount')}</span><Stepper label={t('profile.amplified')} value={s.profile.amplified} min={0} max={99} onChange={n => actions.setProfile('amplified', n)} /></div>
      </Panel>
    </div>
  );
}
