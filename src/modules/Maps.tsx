import { useState } from 'react';
import { Check as CheckIcon, Lock, MapPin, Plus, Trash2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, Check, Dialog, ExtLink, IconBtn, PageHead, Panel, Stepper, TextField, cx } from '../ui/components';

import { mapPlaces, type MapStatus } from '../core/maps';
import { conditions, gameTexts, mapBest, mapPlacesText, placeLabel } from '../core/gametext';
import { emptyMapNotes, LIMITS } from '../core/state';
import { MAP_COUNT } from './shared';
import { useT } from '../i18n/react';

function UnlockAxis() {
  const d = useDerived();
  const t = useT();
  const r = useAppState().profile.rounds;
  const W = 720, top = 40, rowH = 30, L = 150, R = 110;
  const max = Math.max(25, ...d.maps.map(m => m.map.rounds));
  const X = (n: number) => L + (Math.min(n, max) / max) * (W - L - R);
  const H = top + d.maps.length * rowH + 8;
  return (
    <div className="table-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 560, maxWidth: 960, display: 'block' }} role="img" aria-label={t('maps.axisAria', { count: r })}>
        {[0, 5, 10, 15, 20, 25].map(v => (
          <g key={v}><line x1={X(v)} x2={X(v)} y1={top - 8} y2={H - 4} stroke="var(--chart-grid)" strokeWidth="1" /><text x={X(v)} y={14} fill="var(--text-muted)" fontSize="12" textAnchor="middle">{v}</text></g>
        ))}
        <line x1={X(r)} x2={X(r)} y1={top - 8} y2={H - 4} stroke="var(--accent)" strokeWidth="2" />
        <text x={X(r) + 4} y={top - 10} fill="var(--accent)" fontSize="12">{r > max ? t('maps.rounds', { count: r }) : t('maps.now')}</text>
        {d.maps.map((m, i) => {
          const y = top + i * rowH + 12;
          return (
            <g key={m.map.id}>
              <text x={0} y={y + 4} fill={m.open ? 'var(--text-primary)' : 'var(--text-muted)'} fontSize="13">{m.map.name}</text>
              <rect x={X(0)} y={y - 4} width={Math.max(0, X(m.map.rounds) - X(0))} height={8} rx={4} fill="var(--bg-raised)" />
              <rect x={X(0)} y={y - 4} width={Math.max(0, X(Math.min(r, m.map.rounds)) - X(0))} height={8} rx={4} fill={m.open ? 'var(--success)' : 'var(--accent)'} />
              <path d={`M${X(m.map.rounds)} ${y - 7}l7 7l-7 7l-7 -7z`} fill={m.open ? 'var(--success)' : 'var(--bg-panel)'} stroke={m.open ? 'var(--success)' : 'var(--border-control)'} />
              <text x={X(m.map.rounds) + 12} y={y + 4} fill="var(--text-muted)" fontSize="12">{m.open ? t('maps.openLower') : t('maps.inRounds', { count: m.left })}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MapDetail({ m, onClose }: { m: MapStatus; onClose: () => void }) {
  const t = useT();
  const notes = useAppState().maps[m.map.id] || emptyMapNotes();
  const [poi, setPoi] = useState({ name: '', note: '' });
  const [todo, setTodo] = useState('');
  const id = m.map.id;
  const routes = useDerived().routes.filter(x => x.map === id);
  return (
    <Dialog title={m.map.name} size="wide" onClose={onClose} footer={<Btn onClick={onClose}>{t('common.close')}</Btn>}>
      <div className="row">{m.open ? <Badge tone="success"><CheckIcon size={12} aria-hidden="true" />{t('maps.unlocked')}</Badge> : <Badge><Lock size={12} aria-hidden="true" />{t('maps.left', { count: m.left })}</Badge>}
        <Badge>{t('maps.diff', { n: m.map.diff })}</Badge><Badge>{t('origin.denik')}</Badge><ExtLink url={m.map.live}>{t('maps.live')}</ExtLink></div>
      <p><b>{t('maps.bestFor')}</b> {mapBest(m.map, t.lang)}</p>
      <div>
        <h3>{t('maps.places')}</h3>
        <p className="meta">{t('maps.placesHint')}</p>
        {mapPlaces(m.map).map(p => <Check key={p} checked={!!notes.visited[p]} onChange={() => actions.toggleVisited(id, p)}>{placeLabel(m.map, p, t.lang)}</Check>)}
      </div>
      {routes.length > 0 && <div><h3>{t('maps.routes')}</h3><div className="row">{routes.map(r => <a key={r.id} className="btn sm" href={'#money/' + r.id} onClick={onClose}>{r.name}</a>)}</div></div>}
      <hr className="divider" />
      <span className="note-head">{t('maps.myNotes')}</span>
      <TextField label={t('maps.notesLabel')} multiline value={notes.notes} onCommit={v => actions.setMapNotes(id, v)} />
      <div>
        <h3>{t('maps.pois')}</h3>
        {notes.pois.map(p => (
          <div key={p.id} className="list-row"><MapPin size={16} aria-hidden="true" className="accent" /><span className="grow">{p.name}{p.note && <small>{p.note}</small>}</span><IconBtn label={t('maps.deletePoi', { name: p.name })} icon={Trash2} ghost onClick={() => actions.deletePoi(id, p.id)} /></div>
        ))}
        <form className="row" onSubmit={e => { e.preventDefault(); actions.addPoi(id, poi.name, poi.note); setPoi({ name: '', note: '' }); }}>
          <input className="input" style={{ flex: 1, minWidth: 160 }} aria-label={t('maps.poiName')} placeholder={t('maps.poiName')} value={poi.name} onChange={e => setPoi({ ...poi, name: e.target.value })} />
          <input className="input" style={{ flex: 2, minWidth: 200 }} aria-label={t('maps.poiNote')} placeholder={t('maps.poiNotePh')} value={poi.note} onChange={e => setPoi({ ...poi, note: e.target.value })} />
          <Btn type="submit" icon={Plus} disabled={!poi.name.trim()}>{t('maps.addPoi')}</Btn>
        </form>
      </div>
      <div>
        <h3>{t('maps.tasks')}</h3>
        {notes.todo.map(x => (
          <div key={x.id} className="row"><div className="grow"><Check checked={x.done} onChange={() => actions.toggleMapTodo(id, x.id)}>{x.text}</Check></div><IconBtn label={t('maps.deleteTask', { name: x.text })} icon={Trash2} ghost onClick={() => actions.deleteMapTodo(id, x.id)} /></div>
        ))}
        <form className="row" onSubmit={e => { e.preventDefault(); actions.addMapTodo(id, todo); setTodo(''); }}>
          <input className="input grow" aria-label={t('maps.newTask')} placeholder={t('maps.newTask')} value={todo} onChange={e => setTodo(e.target.value)} />
          <Btn type="submit" icon={Plus} disabled={!todo.trim()}>{t('maps.addTask')}</Btn>
        </form>
      </div>
    </Dialog>
  );
}

export default function Maps() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const openCount = d.maps.filter(m => m.open).length;
  const detail = d.maps.find(m => m.map.id === open);
  const texts = gameTexts(t.lang);
  return (
    <div className="page">
      <PageHead title="Maps" sub={t('maps.sub')} />
      <Panel title={t('maps.unlocking')} actions={<><span className="mono meta">{t('maps.openCount', { n: openCount, total: MAP_COUNT })}</span><Stepper label={t('common.rounds')} hideLabel={false} value={s.profile.rounds} min={0} max={LIMITS.rounds[1]} onChange={n => actions.setProfile('rounds', n)} /></>}>
        <p className="meta">{texts.mapsHint}</p>
        <UnlockAxis />
      </Panel>
      <div className="cards">
        {d.maps.map(m => {
          const n = s.maps[m.map.id];
          const places = mapPlaces(m.map);
          const visited = n ? places.filter(p => n.visited[p]).length : 0;
          const routes = d.routes.filter(x => x.map === m.map.id);
          return (
            <article key={m.map.id} className={cx('panel map-card', !m.open && 'locked')} aria-label={m.map.name}>
              <div className="panel-head"><h2>{m.map.name}</h2>
                {m.open ? <Badge tone="success"><CheckIcon size={12} aria-hidden="true" />{t('maps.unlocked')}</Badge> : <Badge><Lock size={12} aria-hidden="true" />{t('maps.left', { count: m.left })}</Badge>}
              </div>
              <div className="panel-body">
                <div className="row between"><span className="meta">{t('maps.difficulty')}</span><span className="diff" aria-label={t('maps.diffAria', { n: m.map.diff })}>{[1, 2, 3, 4, 5].map(k => <i key={k} className={k <= m.map.diff ? 'on' : ''} />)}</span></div>
                <p><b>{mapBest(m.map, t.lang)}</b></p>
                <p className="meta">{mapPlacesText(m.map, t.lang)}</p>
                <div className="row between"><span className="meta">{t('maps.visited', { n: visited, total: places.length })}{n?.pois.length ? ' · ' + t('maps.poiCount', { count: n.pois.length }) : ''}{n?.todo.length ? ' · ' + t('maps.taskCount', { n: n.todo.filter(x => x.done).length, total: n.todo.length }) : ''}</span></div>
                {routes.length > 0 && <p className="meta">{t('maps.routesLabel')} {routes.map((r, i) => <span key={r.id}>{i > 0 && ', '}<a href={'#money/' + r.id}>{r.name}</a></span>)}</p>}
                <div className="row" style={{ marginTop: 'auto' }}><Btn size="sm" onClick={() => setOpen(m.map.id)}>{t('maps.detail')}</Btn><ExtLink url={m.map.live}>{t('maps.live')}</ExtLink></div>
              </div>
            </article>
          );
        })}
      </div>
      <Panel title={t('maps.conditions')}>
        <dl className="dl">{conditions(t.lang).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <p className="meta">{texts.pendola}</p>
      </Panel>
      {detail && <MapDetail m={detail} onClose={() => setOpen(null)} />}
    </div>
  );
}
