/* Záložka Raid v overlayi (0.14.0, návrh docs/design/maps/raid.html): seznam k hledání z aktivního plánu,
   orientační zaškrtnutí „mám“ (jde do hlavního okna jako akce raidFound a NIKDY nemění inventář), vyhledání
   předmětu → nechat / prodat / recyklovat s důvodem a malý pasivní náhled vlastní mapy se zvýrazněním.
   Bez aktivního plánu výzva do přípravy. Vyhledávací pole nedostane fokus samo (overlay fokus nepřebírá). */
import { useMemo, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { useAppState, useDerived } from '../store';
import type { Bus } from './bus';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { fmt } from '../ui/format';
import { cx } from '../ui/components';
import { dayKey } from '../core/util';
import { MAPS } from '../core/data/maps';
import { emptyMapNotes } from '../core/state';
import { findName, highlightPois, lookupAdvice, lookupNames, neededAreas, questsOnMap, raidList } from '../core/raidPrep';
import { evaluateRaid, nextRaid, savedRaid } from '../core/raidEval';
import { AreaBadge, AreaBadges, MapBackdrop, PoiIcon, areaColor, frameOf, pinLabel, poiNumber, useMapImage } from '../ui/MapView';

const MINI = { w: 420, h: 310 };

function MiniMap({ mapId, highlights }: { mapId: string; highlights: ReturnType<typeof highlightPois> }) {
  const t = useT();
  const notes = useAppState().maps[mapId] ?? emptyMapNotes();
  const { img } = useMapImage(mapId, notes.img?.at ?? 0);
  if (!img) return <div className="ovr-nomap" data-testid="ovr-nomap"><p>{t('ops.ov.r.noMap')}</p></div>;
  const f = frameOf(MINI.w, MINI.h, img.w, img.h, { z: 1, px: 0, py: 0 });
  const pins = notes.pois.map((p, i) => ({ p, i })).filter(x => x.p.x !== undefined && x.p.y !== undefined && (highlights.size === 0 || highlights.has(x.p.id)));
  return (
    <div className="ovr-mini" style={{ width: MINI.w, height: MINI.h } as CSSProperties} role="img" aria-label={t('ops.ov.r.mapAria', { count: highlights.size })} data-testid="ovr-minimap">
      <MapBackdrop img={img} frame={f} harmonise={notes.harmonise} grid />
      {pins.map(({ p, i }) => (
        <span key={p.id} className={cx('map-pin mini', highlights.has(p.id) && 'highlight')} style={{ left: f.ox + p.x! * f.dw, top: f.oy + p.y! * f.dh, color: areaColor(p.area) }} aria-hidden="true">
          <PoiIcon type={p.type} size={20} /><small>{pinLabel(i, p.area)}</small>
        </span>
      ))}
    </div>
  );
}

/* 0.15.0: vyhodnocení plánu ve výsledku revize FINDINGS (po potvrzeném zápisu lootu při aktivním plánu).
   Jen čte stav; „Uložit do deníku“ jde do hlavního okna jako akce raidPlanSave (plán k záznamu raidu). */
export function OvRaidEval({ bus, raidId }: { bus: Bus; raidId: string }) {
  const t = useT();
  const s = useAppState();
  const plan = s.raidPlan;
  const today = dayKey(Date.now());
  const raid = s.raids.find(r => r.id === raidId) ?? null;
  const ev = useMemo(() => (plan && raid ? evaluateRaid(s, plan, raid, t.lang, today) : null), [s, plan, raid, t.lang, today]);
  const next = useMemo(() => (plan && ev ? nextRaid(s, plan, ev, t.lang, today) : null), [s, plan, ev, t.lang, today]);
  const [sent, setSent] = useState(false);
  if (!plan || !raid || !ev) return null;
  const saved = savedRaid(s, plan)?.id === raid.id;
  const missing = ev.rows.filter(r => r.missing > 0);
  return (
    <section className="ov-card ovr-eval" data-testid="ov-raid-eval" data-kind={ev.kind}>
      <span className="ov-stencil">{t('ops.ov.e.kicker')}</span>
      <h3>{t('raid.eval.sum', { found: ev.found, need: ev.need })}</h3>
      {ev.done.length > 0 && <ul className="ovr-done">{ev.done.map(d => <li key={d.key}>{t(`raid.eval.done.${d.kind}` as Key, { name: d.name })}</li>)}</ul>}
      {ev.rows.length > 0 && (
        <ul className="ovr-list">{ev.rows.map(r => (
          <li key={r.mat} className={cx('ovr-row', r.missing === 0 && 'found')} data-mat={r.mat}>
            <span className="grow"><b>{r.mat}</b></span><strong>{fmt(r.found)}/{fmt(r.need)}</strong>
          </li>
        ))}</ul>
      )}
      <p className="ov-muted">{missing.length ? t('ops.ov.e.missing', { list: missing.slice(0, 5).map(r => `${fmt(r.missing)}× ${r.mat}`).join(', ') }) : t('raid.eval.nothingMissing')}</p>
      {next && next.best && (next.rows.length > 0 || next.goals.money) && (
        <p className="ov-muted" data-testid="ov-raid-next">{t('ops.ov.e.next', { map: next.best.name, count: next.units })}</p>
      )}
      <div className="row">
        <button type="button" className="ov-btn primary" disabled={sent && !saved} onClick={() => { setSent(true); bus.send('main', 'raidPlanSave', { raidId: raid.id }); }} data-testid="ov-raid-save">
          {saved ? t('raid.eval.saveAgain') : t('raid.eval.save')}</button>
        <button type="button" className="ov-btn" onClick={() => bus.send('main', 'open', { route: 'raid' })}>{t('ops.ov.r.open')}</button>
      </div>
      {saved && <p className="ov-muted" role="status" data-testid="ov-raid-saved">{t('ops.ov.e.saved')}</p>}
    </section>
  );
}

export function OvRaid({ bus }: { bus: Bus }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const plan = s.raidPlan;
  const today = dayKey(Date.now());
  const rows = useMemo(() => (plan ? raidList(s, plan.goals, t.lang, today) : []), [s, plan, t.lang, today]);
  const [q, setQ] = useState('');
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const names = useMemo(() => lookupNames(s, d.materials.map(m => m.name)), [s, d.materials]);
  const found = findName(q, names);
  const verdict = useMemo(() => (found && plan ? lookupAdvice(s, found, plan.goals, rows, t.lang, today) : null), [found, plan, s, rows, t.lang, today]);
  const mapNotes = plan ? s.maps[plan.map] ?? emptyMapNotes() : emptyMapNotes();
  const highlights = useMemo(() => (plan ? highlightPois(mapNotes.pois, rows, questsOnMap(s, plan.goals, plan.map)) : new Map()), [plan, mapNotes.pois, rows, s]);

  if (!plan) {
    return (
      <div className="ovr-empty" data-testid="ov-raid-empty">
        <span className="ov-stencil">{t('ops.ov.r.kicker')}</span>
        <h2>{t('ops.ov.r.emptyTitle')}</h2>
        <p>{t('ops.ov.r.emptyText')}</p>
        <button type="button" className="ov-btn primary" onClick={() => bus.send('main', 'open', { route: 'raid' })}>{t('ops.ov.r.open')}</button>
      </div>
    );
  }
  const isFound = (mat: string) => optimistic[mat] ?? plan.found.includes(mat);
  const setFound = (mat: string, on: boolean) => { setOptimistic(x => ({ ...x, [mat]: on })); bus.send('main', 'raidFound', { mat, on }); };
  const units = rows.reduce((a, r) => a + r.missing, 0);
  const map = MAPS.find(m => m.id === plan.map);
  const areas = [...neededAreas(rows).keys()];
  const hl = mapNotes.pois.map((p, i) => ({ p, i, h: highlights.get(p.id) })).filter(x => x.h);
  const kindKey = (k: string) => `ops.ov.r.kind.${k}` as Key;
  const reasonOf = () => {
    if (!verdict) return '';
    if (verdict.kind === 'keep') {
      if (verdict.override) return t('ops.ov.r.why.override');
      const lbl = verdict.reasons.slice(0, 2).map(r => r.label).join(', ');
      return verdict.missing > 0 ? t('ops.ov.r.why.keep', { count: verdict.missing, for: lbl }) : t('ops.ov.r.why.keepAll', { for: lbl });
    }
    if (verdict.kind === 'recycle') return t('ops.ov.r.why.recycle', { mats: verdict.recycle.slice(0, 3).join(', ') });
    if (verdict.kind === 'sell') return verdict.need > 0 ? t('ops.ov.r.why.enough', { have: verdict.have, need: verdict.need, value: verdict.value ?? 0 }) : t('ops.ov.r.why.sell', { value: verdict.value ?? 0 });
    return t('ops.ov.r.why.unknown');
  };
  return (
    <div className="ovr" data-testid="ov-raid">
      <div className="ovr-left">
        <div className="ovr-head"><h2>{t('ops.ov.r.toFind')}</h2><span>{t('ops.ov.r.sum', { count: units, items: rows.length })}</span></div>
        {rows.length === 0 ? <p className="ov-muted">{t('ops.ov.r.nothing')}</p> : (
          <ul className="ovr-list">{rows.map(r => (
            <li key={r.mat} className={cx('ovr-row', isFound(r.mat) && 'found')} data-mat={r.mat}>
              <label>
                <input type="checkbox" checked={isFound(r.mat)} onChange={e => setFound(r.mat, e.target.checked)} aria-label={t('ops.ov.r.foundAria', { name: r.mat })} />
                <span className="grow"><b>{r.mat}</b><AreaBadges areas={r.areas} /></span>
                <strong>{fmt(r.missing)}×</strong>
              </label>
            </li>
          ))}</ul>
        )}
        <p className="ov-muted">{t('ops.ov.r.foundNote')}</p>
        <section className="ovr-lookup">
          <h3>{t('ops.ov.r.lookupTitle')}</h3>
          <label htmlFor="ovr-q">{t('ops.ov.r.lookupLabel')}</label>
          <div className="ovr-search">
            <input id="ovr-q" type="search" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" spellCheck={false} data-testid="ovr-lookup" />
            {q && <button type="button" aria-label={t('common.clearSearch')} onClick={() => setQ('')}><X size={14} aria-hidden="true" /></button>}
          </div>
          {q.trim().length >= 2 && (verdict ? (
            <div className={cx('ovr-advice', verdict.kind)} data-testid="ovr-verdict" data-kind={verdict.kind} role="status">
              <b>{t(kindKey(verdict.kind))}</b>
              <strong>{verdict.name}</strong>
              <p>{reasonOf()}</p>
            </div>
          ) : <div className="ovr-advice none" role="status"><b>—</b><strong>{t('ops.ov.r.noResult')}</strong><p>{t('ops.ov.r.noResultHint')}</p></div>)}
          <small className="ov-muted">{t('ops.ov.r.lookupNote')}</small>
        </section>
      </div>
      <aside className="ovr-right">
        <div className="ovr-head"><h2>{map?.name ?? plan.map}</h2>{hl.length > 0 && <span className="mono">{poiNumber(hl[0].i)}—{poiNumber(hl[hl.length - 1].i)}</span>}</div>
        <MiniMap mapId={plan.map} highlights={highlights} />
        {areas.length > 0 && <div className="ovr-legend">{areas.map(a => <AreaBadge key={a} area={a} />)}</div>}
        {hl.length > 0 && <ul className="ovr-lines">{hl.slice(0, 5).map(x => (
          <li key={x.p.id}>{poiNumber(x.i)} → {x.h!.reason === 'quest' ? t('ops.ov.r.questPoint') : x.h!.items.join(', ')}</li>
        ))}</ul>}
        <p className="ov-muted">{t('ops.ov.r.ownPoints')}</p>
      </aside>
    </div>
  );
}
