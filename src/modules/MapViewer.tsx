/* Interaktivní mapa nad vlastním snímkem (0.14.0, návrh docs/design/maps/viewer.html). Podklad je snímek mapy ze
   hry, který si hráč sám vloží (soubor, schránka, přetažení); aplikace žádné mapy nepřibaluje. Body jsou
   v relativních souřadnicích snímku a rozšiřují stávající body map (maps[*].pois). Přiblížení 100–300 %, posun
   tažením a šipkami, klik = nový bod, tažení bodu = přesun (zápis až po puštění, Esc vrátí), smazání se Zpět.
   Zvýraznění bodů podle aktivního plánu je jen shoda typu místa, ne detektor lootu. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { actions, app, navigate, useAppState } from '../store';
import { Btn, ConfirmButton, Dialog, ExtLink, cx } from '../ui/components';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { MAPS } from '../core/data/maps';
import { emptyMapNotes } from '../core/state';
import type { Poi } from '../core/types';
import { LOOT_AREA_IDS, POI_TYPES, areaCode, type PoiType } from '../core/lootAreas';
import { goalLabels, highlightPois, questsOnMap, raidList, type PoiHighlight } from '../core/raidPrep';
import { dayKey } from '../core/util';
import {
  AreaBadge, AreaGlyph, MapBackdrop, PoiIcon, VIEW0, Z_MAX, Z_MIN, areaColor, areaStyle, clampView, frameOf, pinLabel, poiNumber, poiTypeLabel,
  toRel, useMapImage, zoomAt, type View,
} from '../ui/MapView';
import { clipboardImage, imageFromTransfer, importImage, type ImportedImage } from '../ui/mapImport';
import { deleteMapImage, putMapImage } from '../storage/mapImages';
import { fmt } from '../ui/format';

const ZOOM_STEP = 0.25;
type Form = { mode: 'add'; x: number; y: number } | { mode: 'edit'; id: string };
interface Draft { type: PoiType; area: string; name: string; note: string }
const DRAFT0: Draft = { type: 'crate', area: '', name: '', note: '' };

/* ----- formulář bodu (nový i úprava) ----- */
function PointForm({ initial, edit, style, onSave, onCancel }: { initial: Draft; edit: boolean; style: CSSProperties; onSave: (d: Draft) => void; onCancel: () => void }) {
  const t = useT();
  const [d, setD] = useState<Draft>(initial);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); onSave(d); }
  };
  return (
    <form className="mv-form" style={style} onSubmit={e => { e.preventDefault(); onSave(d); }} onKeyDown={onKey} onPointerDown={e => e.stopPropagation()}
      aria-label={edit ? t('mapv.form.editTitle') : t('mapv.form.title')} data-testid="map-point-form">
      <span className="mv-eyebrow">{edit ? t('mapv.form.editEyebrow') : t('mapv.form.eyebrow')}</span>
      <h3>{edit ? t('mapv.form.editTitle') : t('mapv.form.title')}</h3>
      <label>{t('mapv.form.type')}
        <select ref={first} className="select" value={d.type} onChange={e => setD({ ...d, type: e.target.value as PoiType })}>
          {POI_TYPES.map(x => <option key={x} value={x}>{poiTypeLabel(t, x)}</option>)}
        </select>
      </label>
      <label>{t('mapv.form.area')}
        <select className="select" value={d.area} onChange={e => setD({ ...d, area: e.target.value })}>
          <option value="">{t('mapv.unknown')}</option>
          {LOOT_AREA_IDS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      <label>{t('mapv.form.name')}
        <input className="input" value={d.name} maxLength={120} placeholder={t('mapv.form.namePh')} onChange={e => setD({ ...d, name: e.target.value })} />
      </label>
      <label>{t('mapv.form.note')}
        <textarea className="input" value={d.note} maxLength={1000} placeholder={t('mapv.form.notePh')} onChange={e => setD({ ...d, note: e.target.value })} />
      </label>
      <div className="row mv-form-actions">
        <Btn onClick={onCancel}>{t('common.cancel')}</Btn>
        <Btn type="submit" variant="primary">{t('mapv.form.save')}</Btn>
      </div>
    </form>
  );
}

/* ----- prázdný stav: návod a vložení snímku ----- */
function EmptyShot({ onFile, onPaste, onDropBlob, err }: { onFile: () => void; onPaste: () => void; onDropBlob: (b: Blob) => void; err: string }) {
  const t = useT();
  const [over, setOver] = useState(false);
  return (
    <section className="mv-empty" data-testid="map-empty">
      <div className="mv-empty-glyph" aria-hidden="true"><PoiIcon type="note" size={32} /></div>
      <span className="mv-eyebrow">{t('mapv.empty.eyebrow')}</span>
      <h2>{t('mapv.empty.title')}</h2>
      <p>{t('mapv.empty.lead')}</p>
      <ol>
        <li>{t('mapv.empty.step1')}</li>
        <li>{t('mapv.empty.step2')}</li>
        <li>{t('mapv.empty.step3')}</li>
      </ol>
      <div className={cx('mv-dropzone', over && 'over')} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const b = imageFromTransfer(e.dataTransfer); if (b) onDropBlob(b); }} data-testid="map-dropzone">
        <b>{t('mapv.empty.drop')}</b>
        <div className="row mv-drop-actions">
          <Btn variant="primary" onClick={onPaste}>{t('mapv.empty.paste')}</Btn>
          <Btn onClick={onFile}>{t('mapv.empty.file')}</Btn>
        </div>
        <small>PNG / JPEG / WEBP</small>
      </div>
      {err && <p className="mv-err" role="alert">{err}</p>}
      <p className="meta">{t('mapv.empty.noBundled')}</p>
    </section>
  );
}

/* ----- náhrada snímku: náhled a potvrzení ----- */
function ReplaceDialog({ next, cur, onApply, onClose }: { next: ImportedImage; cur: { w: number; h: number }; onApply: (unplace: boolean) => void; onClose: () => void }) {
  const t = useT();
  const differs = next.w !== cur.w || next.h !== cur.h;
  const [unplace, setUnplace] = useState(Math.abs(next.w / next.h - cur.w / cur.h) > 0.01);
  return (
    <Dialog title={t('mapv.replace.title')} onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" onClick={() => onApply(unplace)}>{t('mapv.replace.apply')}</Btn></>}>
      <img className="mv-preview" src={next.dataUrl} alt={t('mapv.replace.previewAlt')} />
      <p>{t('mapv.replace.size', { w: next.w, h: next.h })}{next.scaled ? ' ' + t('mapv.replace.scaled', { w: next.origW, h: next.origH }) : ''}</p>
      <p className="meta">{differs ? t('mapv.replace.differs', { w: cur.w, h: cur.h }) : t('mapv.replace.same')}</p>
      <label className="toggle"><input type="checkbox" checked={unplace} onChange={e => setUnplace(e.target.checked)} />{t('mapv.replace.unplace')}</label>
    </Dialog>
  );
}

export default function MapViewer({ mapId }: { mapId: string }) {
  const t = useT();
  const s = useAppState();
  const map = MAPS.find(m => m.id === mapId) ?? MAPS[0];
  const notes = s.maps[map.id] ?? emptyMapNotes();
  const { img, loading } = useMapImage(map.id, notes.img?.at ?? 0);
  const stage = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ cw: 0, ch: 0 });
  const [view, setView] = useState<View>(VIEW0);
  const [grid, setGrid] = useState(true);
  const [hlOn, setHlOn] = useState(true);
  const [typeOff, setTypeOff] = useState<Set<string>>(new Set());
  const [areaOff, setAreaOff] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; ox: number; oy: number } | null>(null);
  const [undo, setUndo] = useState<{ poi: Poi; index: number } | null>(null);
  const [pending, setPending] = useState<ImportedImage | null>(null);
  const [err, setErr] = useState('');
  const pan = useRef<{ x: number; y: number; px: number; py: number; moved: boolean; id: number } | null>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; moved: boolean; pid: number } | null>(null);

  /* změna mapy: vlastní snímek, body a výchozí zobrazení; body z předchozí mapy se nepřenášejí */
  useEffect(() => { setView(VIEW0); setSelected(null); setForm(null); setPlacing(null); setDrag(null); setUndo(null); setErr(''); }, [map.id]);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ cw: el.clientWidth, ch: el.clientHeight }));
    ro.observe(el);
    setSize({ cw: el.clientWidth, ch: el.clientHeight });
    return () => ro.disconnect();
  }, [img]);
  useEffect(() => { if (!undo) return; const h = setTimeout(() => setUndo(null), 8000); return () => clearTimeout(h); }, [undo]);

  const frame = img && size.cw ? frameOf(size.cw, size.ch, img.w, img.h, view) : null;
  const plan = s.raidPlan;
  const today = dayKey(Date.now());
  const rows = useMemo(() => (plan ? raidList(s, plan.goals, t.lang, today) : []), [s, plan, t.lang, today]);
  const planHere = !!plan && plan.map === map.id;
  const highlights: Map<string, PoiHighlight> = useMemo(
    () => (planHere && hlOn ? highlightPois(notes.pois, rows, questsOnMap(s, plan!.goals, map.id)) : new Map()),
    [planHere, hlOn, notes.pois, rows, s, plan, map.id]);
  const visible = (p: Poi) => !typeOff.has(p.type) && !areaOff.has(p.area);
  const placed = notes.pois.map((p, i) => ({ p, i })).filter(x => x.p.x !== undefined && x.p.y !== undefined);
  const hiddenMatches = placed.filter(x => highlights.has(x.p.id) && !visible(x.p)).length;
  const sel = notes.pois.find(p => p.id === selected) ?? null;
  const selIndex = sel ? notes.pois.indexOf(sel) : -1;

  /* ----- snímek ----- */
  const commit = useCallback(async (r: ImportedImage, unplace: boolean) => {
    try {
      await putMapImage({ mapId: map.id, dataUrl: r.dataUrl, w: r.w, h: r.h, at: Date.now() });
      actions.setMapImage(map.id, { w: r.w, h: r.h }, unplace);
      setErr('');
      app.notify(r.scaled ? t('mapv.saved.scaled', { w: r.w, h: r.h, ow: r.origW, oh: r.origH }) : t('mapv.saved', { name: map.name }));
    } catch { setErr(t('mapv.err.save')); }
  }, [map.id, map.name, t]);
  const handleBlob = useCallback(async (b: Blob) => {
    const r = await importImage(b);
    if (typeof r === 'string') { setErr(t(`mapv.err.${r}` as Key)); return; }
    if (img) setPending(r); else await commit(r, false);
  }, [img, commit, t]);
  const pasteBtn = async () => { const b = await clipboardImage(); if (b) await handleBlob(b); else setErr(t('mapv.err.clipboard')); };
  /* Ctrl+V kdekoli v modulu (mimo textová pole) */
  useEffect(() => {
    const on = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const b = imageFromTransfer(e.clipboardData);
      if (b) { e.preventDefault(); void handleBlob(b); }
    };
    window.addEventListener('paste', on);
    return () => window.removeEventListener('paste', on);
  }, [handleBlob]);

  /* ----- přiblížení kolečkem (neblokující posluchač nejde, proto nativní) ----- */
  useEffect(() => {
    const el = stage.current;
    if (!el || !img) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView(v => zoomAt(el.clientWidth, el.clientHeight, img.w, img.h, v, v.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [img]);
  const zoomBy = (d: number) => { if (img) setView(v => zoomAt(size.cw, size.ch, img.w, img.h, v, Math.round((v.z + d) * 100) / 100)); };

  /* ----- ukazatel na ploše: posun, nebo klik = nový bod / umístění bodu ----- */
  const local = (e: { clientX: number; clientY: number }) => { const r = stage.current!.getBoundingClientRect(); return { mx: e.clientX - r.left, my: e.clientY - r.top }; };
  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !img) return;
    pan.current = { x: e.clientX, y: e.clientY, px: view.px, py: view.py, moved: false, id: e.pointerId };
    stage.current?.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (d && frame) {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
      if (d.moved) {
        const { mx, my } = local(e);
        const x = Math.min(1, Math.max(0, (mx - frame.ox) / frame.dw)), y = Math.min(1, Math.max(0, (my - frame.oy) / frame.dh));
        setDrag(g => (g && g.id === d.id ? { ...g, x, y } : g));
      }
      return;
    }
    const p = pan.current;
    if (!p || !img) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) > 5) p.moved = true;
    if (p.moved) setView(v => clampView(size.cw, size.ch, img.w, img.h, { ...v, px: p.px + dx, py: p.py + dy }));
  };
  const onUp = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (d) {
      dragRef.current = null;
      if (d.moved && drag) actions.movePoi(map.id, d.id, { x: drag.x, y: drag.y });
      else { setSelected(d.id); setForm(null); }
      setDrag(null);
      return;
    }
    const p = pan.current;
    pan.current = null;
    if (!p || p.moved || !frame) return;
    const { mx, my } = local(e);
    const rel = toRel(frame, mx, my);
    if (!rel) return;
    if (placing) { actions.movePoi(map.id, placing, rel); setSelected(placing); setPlacing(null); return; }
    setSelected(null);
    setForm({ mode: 'add', x: rel.x, y: rel.y });
  };
  const onPinDown = (e: ReactPointerEvent, p: Poi) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    dragRef.current = { id: p.id, sx: e.clientX, sy: e.clientY, moved: false, pid: e.pointerId };
    setDrag({ id: p.id, x: p.x!, y: p.y!, ox: p.x!, oy: p.y! });
    stage.current?.setPointerCapture?.(e.pointerId);
  };
  /* Esc postupně ruší tažení, formulář a umisťování */
  const onStageKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      if (dragRef.current) { dragRef.current = null; setDrag(null); e.preventDefault(); return; }
      if (form) { setForm(null); e.preventDefault(); return; }
      if (placing) { setPlacing(null); e.preventDefault(); return; }
    }
    if (e.target !== e.currentTarget || !img) return;
    const step = 40;
    const k: Record<string, () => void> = {
      ArrowLeft: () => setView(v => clampView(size.cw, size.ch, img.w, img.h, { ...v, px: v.px + step })),
      ArrowRight: () => setView(v => clampView(size.cw, size.ch, img.w, img.h, { ...v, px: v.px - step })),
      ArrowUp: () => setView(v => clampView(size.cw, size.ch, img.w, img.h, { ...v, py: v.py + step })),
      ArrowDown: () => setView(v => clampView(size.cw, size.ch, img.w, img.h, { ...v, py: v.py - step })),
      '+': () => zoomBy(ZOOM_STEP), '=': () => zoomBy(ZOOM_STEP), '-': () => zoomBy(-ZOOM_STEP), '0': () => setView(VIEW0),
    };
    if (k[e.key]) { e.preventDefault(); k[e.key](); }
  };

  /* ----- body ----- */
  const saveForm = (d: Draft) => {
    if (!form) return;
    if (form.mode === 'add') {
      const id = actions.addMapPoint(map.id, { ...d, x: form.x, y: form.y });
      setForm(null);
      if (id) { setSelected(id); setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-poi="${id}"]`)?.focus(), 30); }
    } else {
      actions.updatePoi(map.id, form.id, d);
      setForm(null);
      setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-poi="${form.id}"]`)?.focus(), 30);
    }
  };
  const remove = (p: Poi) => {
    const index = notes.pois.indexOf(p);
    actions.deletePoi(map.id, p.id);
    setSelected(null); setForm(null);
    setUndo({ poi: p, index });
  };
  const addCenter = () => {
    if (!frame) return;
    const rel = toRel(frame, size.cw / 2, size.ch / 2) ?? { x: 0.5, y: 0.5 };
    setSelected(null);
    setForm({ mode: 'add', x: rel.x, y: rel.y });
  };
  const formStyle = (): CSSProperties => {
    if (!form || !frame) return {};
    let x = 0.5, y = 0.5;
    if (form.mode === 'add') { x = form.x; y = form.y; } else { const p = notes.pois.find(q => q.id === form.id); x = p?.x ?? 0.5; y = p?.y ?? 0.5; }
    const sx = frame.ox + x * frame.dw, sy = frame.oy + y * frame.dh;
    const W = 268, H = Math.min(420, size.ch - 16);
    const left = sx + 24 + W > size.cw ? sx - 24 - W : sx + 24;
    return { left: Math.max(8, Math.min(size.cw - W - 8, left)), top: Math.max(8, Math.min(size.ch - H - 8, sy - 60)) };
  };
  const formInitial = (): Draft => {
    if (form?.mode === 'edit') { const p = notes.pois.find(q => q.id === form.id); if (p) return { type: p.type, area: p.area, name: p.name, note: p.note }; }
    return DRAFT0;
  };
  const toggle = (set: Set<string>, setter: (v: Set<string>) => void, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); setter(n); };
  const pointName = (p: Poi, i: number) => `${poiNumber(i)} / ${p.name || poiTypeLabel(t, p.type)}`;
  const hl = sel ? highlights.get(sel.id) : undefined;
  const needOf = (mat: string) => rows.find(r => r.mat === mat)?.missing ?? 0;

  const toolbar = (
    <div className="mv-toolbar">
      <label className="mv-map-select">{t('common.map')}
        <select className="select" value={map.id} onChange={e => navigate('maps', e.target.value)} data-testid="map-select">
          {MAPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <Btn icon={ImagePlus} onClick={() => fileRef.current?.click()} data-testid="map-change">{img ? t('mapv.change') : t('mapv.choose')}</Btn>
      <label className="toggle"><input type="checkbox" checked={notes.harmonise} onChange={e => actions.setMapHarmonise(map.id, e.target.checked)} data-testid="map-harmonise" />{t('mapv.harmonise')}</label>
      <span className="mv-web"><ExtLink url={map.live}>{t('mapv.web')}</ExtLink></span>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="map-file"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleBlob(f); }} />
    </div>
  );

  return (
    <section className="mv" aria-label={t('mapv.aria', { name: map.name })} data-testid="map-viewer">
      {toolbar}
      {plan && (
        <div className="mv-plan" data-testid="map-plan-strip">
          <i className="mv-dot" aria-hidden="true" />
          <b>{t('mapv.plan.active')}</b>
          <span>{[...goalLabels(s, plan.goals, t.lang, today), ...(plan.goals.money ? [t('raid.goal.money')] : [])].slice(0, 3).join(', ')}</span>
          {planHere
            ? <span className="muted" data-testid="map-hl-count">{t('mapv.plan.count', { count: placed.filter(x => highlights.has(x.p.id)).length })}</span>
            : <button type="button" className="btn sm ghost" onClick={() => navigate('maps', plan.map)}>{t('mapv.plan.goto', { name: MAPS.find(m => m.id === plan.map)?.name ?? plan.map })}</button>}
          {planHere && <label className="toggle mv-plan-toggle"><input type="checkbox" checked={hlOn} onChange={e => setHlOn(e.target.checked)} />{t('mapv.plan.highlight')}</label>}
        </div>
      )}
      {!img ? (loading ? <p className="meta" role="status">{t('common.loading')}</p> : <EmptyShot onFile={() => fileRef.current?.click()} onPaste={() => void pasteBtn()} onDropBlob={b => void handleBlob(b)} err={err} />) : (
        <div className="mv-layout">
          <aside className="mv-legend" aria-label={t('mapv.legend')}>
            <h3>{t('mapv.legend')}</h3>
            <label className="toggle"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} />{t('mapv.grid')}</label>
            <h4>{t('mapv.pointType')}</h4>
            {POI_TYPES.map(x => (
              <label key={x} className="mv-filter"><input type="checkbox" checked={!typeOff.has(x)} onChange={() => toggle(typeOff, setTypeOff, x)} /><PoiIcon type={x} size={16} />{poiTypeLabel(t, x)}</label>
            ))}
            <h4>{t('mapv.lootArea')}</h4>
            {[...LOOT_AREA_IDS, ''].map(a => (
              <label key={a || 'unknown'} className="mv-filter" style={areaStyle(a)}><input type="checkbox" checked={!areaOff.has(a)} onChange={() => toggle(areaOff, setAreaOff, a)} /><AreaGlyph area={a} size={16} /><span>{a || t('mapv.unknown')}</span><code>{areaCode(a)}</code></label>
            ))}
            {hiddenMatches > 0 && <p className="mv-hidden" role="status">{t('mapv.hiddenMatches', { count: hiddenMatches })} <button type="button" className="btn sm ghost" onClick={() => { setTypeOff(new Set()); setAreaOff(new Set()); }}>{t('mapv.resetFilters')}</button></p>}
          </aside>
          <div className="mv-stage-wrap">
            <div ref={stage} className={cx('mv-stage', placing && 'placing', drag && dragRef.current?.moved && 'dragging')} tabIndex={0} role="application"
              aria-label={t('mapv.stageAria', { name: map.name })} aria-describedby="mv-hint"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { pan.current = null; dragRef.current = null; setDrag(null); }}
              onKeyDown={onStageKey} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const b = imageFromTransfer(e.dataTransfer); if (b) void handleBlob(b); }}
              data-testid="map-stage">
              {frame && <MapBackdrop img={img} frame={frame} harmonise={notes.harmonise} grid={grid} />}
              {frame && drag && dragRef.current?.moved && <i className="mv-origin" aria-hidden="true" style={{ left: frame.ox + drag.ox * frame.dw, top: frame.oy + drag.oy * frame.dh }} />}
              {frame && placed.filter(x => visible(x.p)).map(({ p, i }) => {
                const pos = drag && drag.id === p.id ? { x: drag.x, y: drag.y } : { x: p.x!, y: p.y! };
                const h = highlights.get(p.id);
                return (
                  <button key={p.id} type="button" data-poi={p.id} data-area={p.area || 'unknown'} data-highlight={h ? h.reason : undefined}
                    className={cx('map-pin', h && 'highlight', highlights.size > 0 && !h && 'dimmed', selected === p.id && 'selected', drag?.id === p.id && dragRef.current?.moved && 'dragging')}
                    style={{ left: frame.ox + pos.x * frame.dw, top: frame.oy + pos.y * frame.dh, color: areaColor(p.area) }}
                    aria-label={t('mapv.pinAria', { n: poiNumber(i), type: poiTypeLabel(t, p.type), name: p.name || poiTypeLabel(t, p.type), area: p.area || t('mapv.unknown'), x: Math.round(pos.x * 100), y: Math.round(pos.y * 100) }) + (h ? ' · ' + t(h.reason === 'quest' ? 'mapv.hl.quest' : 'mapv.hl.area') : '')}
                    aria-pressed={selected === p.id}
                    onPointerDown={e => onPinDown(e, p)} onClick={e => { if (e.detail === 0) { setSelected(p.id); setForm(null); } }}>
                    <PoiIcon type={p.type} size={22} />
                    <small>{pinLabel(i, p.area)}</small>
                  </button>
                );
              })}
              <div className="mv-zoom" onPointerDown={e => e.stopPropagation()}>
                <button type="button" aria-label={t('mapv.zoomIn')} onClick={() => zoomBy(ZOOM_STEP)} disabled={view.z >= Z_MAX}>+</button>
                <button type="button" aria-label={t('mapv.zoomOut')} onClick={() => zoomBy(-ZOOM_STEP)} disabled={view.z <= Z_MIN}>−</button>
                <button type="button" aria-label={t('mapv.zoomReset')} onClick={() => setView(VIEW0)} data-testid="map-zoom">{fmt(Math.round(view.z * 100))} %</button>
              </div>
              <span id="mv-hint" className="mv-hint">{placing ? t('mapv.placingHint') : t('mapv.hint')}</span>
              {form && <PointForm key={form.mode === 'edit' ? form.id : `${form.x}:${form.y}`} initial={formInitial()} edit={form.mode === 'edit'} style={formStyle()} onSave={saveForm} onCancel={() => setForm(null)} />}
            </div>
            {err && <p className="mv-err" role="alert">{err}</p>}
          </div>
          <aside className="mv-detail" aria-label={t('mapv.detail')}>
            {sel ? (
              <div data-testid="map-detail">
                <span className="mv-eyebrow">{t('mapv.selected')}</span>
                <h2>{pointName(sel, selIndex)}</h2>
                <p className="mv-type-line"><PoiIcon type={sel.type} size={20} />{poiTypeLabel(t, sel.type)}</p>
                <span className="mv-eyebrow">{t('mapv.lootArea')}</span>
                <p><AreaBadge area={sel.area} /></p>
                {sel.note && <><span className="mv-eyebrow">{t('mapv.noteHead')}</span><p className="mv-note">{sel.note}</p></>}
                {sel.x !== undefined && sel.y !== undefined ? (
                  <div className="mv-coords">
                    <label>X %<input className="input" type="number" min={0} max={100} value={Math.round(sel.x * 100)} onChange={e => actions.movePoi(map.id, sel.id, { x: Number(e.target.value) / 100, y: sel.y! })} /></label>
                    <label>Y %<input className="input" type="number" min={0} max={100} value={Math.round(sel.y * 100)} onChange={e => actions.movePoi(map.id, sel.id, { x: sel.x!, y: Number(e.target.value) / 100 })} /></label>
                  </div>
                ) : <p className="meta">{t('mapv.unplaced')}</p>}
                <div className="row">
                  <Btn onClick={() => setForm({ mode: 'edit', id: sel.id })}>{t('common.edit')}</Btn>
                  {sel.x === undefined && <Btn onClick={() => setPlacing(sel.id)}>{t('mapv.place')}</Btn>}
                  <Btn className="danger-text" onClick={() => remove(sel)}>{t('common.delete')}</Btn>
                </div>
                {hl && (
                  <div className="mv-plan-box" data-testid="map-detail-plan">
                    <hr />
                    <span className="mv-eyebrow">{t('mapv.forPlan')}</span>
                    <h3>{t('mapv.lookHere')}</h3>
                    {hl.reason === 'area'
                      ? hl.items.map(m => <div key={m} className="mv-need"><b>{m}</b><span className="mono">{needOf(m)}×</span></div>)
                      : <p>{t('mapv.hl.questText')}</p>}
                    <p className="mv-callout">{t('mapv.disclaimer')}</p>
                  </div>
                )}
                <button type="button" className="btn sm ghost" onClick={() => setSelected(null)}>{t('mapv.backToList')}</button>
              </div>
            ) : (
              <div data-testid="map-points">
                <span className="mv-eyebrow">{t('mapv.points', { count: notes.pois.length })}</span>
                {notes.pois.length === 0 ? <p className="meta">{t('mapv.noPoints')}</p> : (
                  <ul className="mv-list">{notes.pois.map((p, i) => (
                    <li key={p.id}>
                      <button type="button" className="mv-list-btn" onClick={() => setSelected(p.id)} style={areaStyle(p.area)}>
                        <PoiIcon type={p.type} size={16} /><span>{pointName(p, i)}</span>{highlights.has(p.id) && <i className="mv-dot" aria-label={t('mapv.plan.match')} />}
                      </button>
                      {p.x === undefined && <button type="button" className="btn sm ghost" onClick={() => { setPlacing(p.id); stage.current?.focus(); }}>{t('mapv.place')}</button>}
                    </li>
                  ))}</ul>
                )}
                <p className="mv-callout">{t('mapv.manual')}</p>
              </div>
            )}
          </aside>
        </div>
      )}
      <footer className="mv-foot">
        <span>{img ? t('mapv.foot.local') : t('mapv.foot.backup')}</span>
        {undo && <span className="mv-undo" role="status">{t('mapv.deleted')} <button type="button" className="btn sm" onClick={() => { actions.restorePoi(map.id, undo.poi, undo.index); setUndo(null); }}>{t('mapv.undo')}</button></span>}
        {img && <span className="row">
          <ConfirmButton size="sm" variant="ghost" title={t('mapv.remove.title')} text={t('mapv.remove.text')} confirmLabel={t('mapv.remove.btn')}
            onConfirm={async () => { await deleteMapImage(map.id); actions.setMapImage(map.id, null); }}>{t('mapv.remove.btn')}</ConfirmButton>
          <Btn onClick={addCenter} data-testid="map-add">{t('mapv.add')}</Btn>
        </span>}
      </footer>
      {pending && img && <ReplaceDialog next={pending} cur={img} onClose={() => setPending(null)} onApply={unplace => { const r = pending; setPending(null); void commit(r, unplace); }} />}
    </section>
  );
}
