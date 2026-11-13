/* 0.22.0: okno widgetů nad hrou (návrh docs/design/overlay-widgets). Jedno průhledné okno přes celý monitor hry.
   - Hra: widgety jen ukazují. Okno propouští myš (Rust set_ignore_cursor_events) a nejde aktivovat, v DOM není nic
     k zaměření, žádné ztmavení. Změna dat nikdy nežádá o fokus.
   - Úpravy: zapne je jen Rust (klik na Opse, zkratka, Nastavení) událostí widgets-mode; 20 % závoj, lišta nástrojů,
     úchyty, katalog, rozložení, nastavení widgetu a hledání Ctrl+K. Hotovo / Esc požádá Rust o návrat do Hry (okno
     znovu propouští myš a fokus dostane hra).
   - Stav aplikace je kopie z hlavního okna (store tohoto okna je zrcadlo a nic neukládá). Rozložení patří tomuto
     počítači a ukládá je jen toto okno (ops/widgetPrefs.ts).
   - V prohlížeči (vývoj, E2E) Rust není: režim se přepíná rovnou tady a __widgetsTest nahrazuje události z Rustu. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, Lock } from 'lucide-react';
import { app } from '../store';
import { createBus } from './bus';
import { startHello } from './handshake';
import { createNative } from './native';
import type { WidgetView } from './hub';
import { readWidgetPrefs, writeWidgetPrefs } from './widgetPrefs';
import { WidgetCard } from './WidgetCards';
import { useT, type TFn } from '../i18n/react';
import type { Key } from '../i18n';
import { cx } from '../ui/components';
import { MODULES, moduleName } from '../shell/modules';
import { autoActive } from '../core/autoCapture';
import { isTauri } from '../storage/tauri';
import {
  EDGES, LAYOUTS_MAX, WIDGETS, WIDGET_IDS, activeLayout, addWidget, clampN, clampOpacity, deleteLayout, emptyHistory, followDecision, followTarget,
  initialMode, isPresetId, modeStep, nameError, placeRect, record, redo, removeWidget, rename, resetActive, resizeRect, restack, saveAs,
  selectLayout, setDensity, setFollow, setPlace, snapMove, textSurface, undo, withRect,
  type Edge, type Guides, type History, type LifePhase, type ModeEvent, type ModeState, type PresetId, type Rect, type Viewport, type WidgetId,
  type WidgetPlace, type WidgetPrefs,
} from '../core/widgets';

const bus = createBus('widgets');
const native = createNative();
/* store tohoto okna je jen kopie stavu z hlavního okna (nic se nenačítá ani neukládá) */
app.setMirror();

const viewport = (): Viewport => ({ w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) });
const newId = () => 'l' + Math.random().toString(36).slice(2, 10);
const noGuides: Guides = { x: null, y: null, kindX: null, kindY: null };

/* Panel Aplikace: v Tauri ho otevře Rust (overlay), v prohlížeči nová stránka overlaye se stejným modulem. */
function openApp(tab: string) {
  if (native.available) { void native.widgetsApp(tab).catch(() => undefined); return; }
  const m = /^apps:([a-z]+)$/.exec(tab);
  window.open('overlay.html' + (m ? '#' + m[1] : ''), '_blank');
}

type Drag = { id: WidgetId; kind: 'move' | Edge; start: Rect; px: number; py: number; rect: Rect; guides: Guides };

export default function WidgetsApp() {
  const t = useT();
  const [view, setView] = useState<WidgetView | null>(null);
  const [prefs, setPrefsRaw] = useState<WidgetPrefs>(() => readWidgetPrefs());
  const [mode, setMode] = useState<ModeState>(initialMode);
  const [vp, setVp] = useState<Viewport>(viewport);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<WidgetId | null>(null);
  const [live, setLive] = useState('');
  const hist = useRef<History>(emptyHistory());
  const [, bumpHist] = useState(0);
  const modeRef = useRef(mode); modeRef.current = mode;
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const dragRef = useRef(drag); dragRef.current = drag;
  const gotState = useRef(false);
  const lastPhase = useRef<LifePhase | null>(null);
  const pendingFollow = useRef<PresetId | null>(null);
  const addBtn = useRef<HTMLButtonElement | null>(null);
  const edit = mode.mode === 'edit';

  /* ----- uložení (jen toto okno) ----- */
  useEffect(() => { writeWidgetPrefs(prefs); }, [prefs]);
  /* změna s krokem pro Zpět (jen v Úpravách) */
  const change = useCallback((fn: (p: WidgetPrefs) => WidgetPrefs | null, announce?: string) => {
    const cur = prefsRef.current, next = fn(cur);
    if (!next || next === cur) return false;
    hist.current = record(hist.current, cur);
    bumpHist(x => x + 1);
    setPrefsRaw(next);
    if (announce) setLive(announce);
    return true;
  }, []);

  /* ----- režim ----- */
  const dispatch = useCallback((e: ModeEvent) => {
    const r = modeStep(modeRef.current, e);
    modeRef.current = r.state;
    setMode(r.state);
    if (r.effect === 'cancelDrag') setDrag(null);
    if (r.effect === 'requestPlay') {
      /* v Tauri vrátí Rust okno do Hry a pošle widgets-mode play; v prohlížeči hned */
      if (native.available) void native.widgetsEdit(false).catch(() => dispatch({ type: 'exit' }));
      else dispatch({ type: 'exit' });
    }
    if (e.type === 'exit') {
      hist.current = emptyHistory(); bumpHist(x => x + 1);
      setDrag(null); setSelected(null); setLive('');
      /* odložené přepnutí rozložení podle stavu hry až po Úpravách */
      const target = pendingFollow.current;
      pendingFollow.current = null;
      if (target) setPrefsRaw(p => (followDecision(p, target, true, false) === 'switch' ? selectLayout(p, target, false) : p));
    }
    if (e.type === 'enter') setTimeout(() => addBtn.current?.focus(), 30);
  }, []);

  useEffect(() => {
    const offs = [
      bus.on('state', (p, from) => {
        if (from !== 'main' || !p || typeof p !== 'object') return;
        const v = p as WidgetView;
        app.store.setState({ state: v.state });
        gotState.current = true;
        setView(v);
      }),
      bus.onNative('widgets-mode', p => dispatch({ type: p === 'edit' ? 'enter' : 'exit' })),
      bus.onNative('widgets-hide', () => dispatch({ type: 'toggleHidden' })),
    ];
    const stopHello = startHello(bus, 'widgets', () => gotState.current);
    const onResize = () => setVp(viewport());
    window.addEventListener('resize', onResize);
    /* změna rozlišení, DPI nebo monitoru hry: okno znovu přes celý monitor hry (Rust, bez aktivace) */
    let sig = '';
    const fit = () => {
      const s = `${screen.width}x${screen.height}@${window.devicePixelRatio}`;
      if (s !== sig) { sig = s; void native.widgetsFit().catch(() => undefined); }
    };
    fit();
    const timer = setInterval(fit, 3000);
    const slow = setInterval(() => { void native.widgetsFit().catch(() => undefined); }, 15000);
    if (!isTauri()) {
      (window as unknown as { __widgetsTest?: unknown }).__widgetsTest = {
        mode: (m: 'edit' | 'play') => dispatch({ type: m === 'edit' ? 'enter' : 'exit' }),
        hide: () => dispatch({ type: 'toggleHidden' }),
      };
    }
    return () => { stopHello(); offs.forEach(f => f()); window.removeEventListener('resize', onResize); clearInterval(timer); clearInterval(slow); };
  }, [dispatch]);

  /* ----- automatika Lobby / Raid (stav z automatického snímání mimo raid; výchozí vypnuto) ----- */
  useEffect(() => {
    const s = view?.state;
    if (!s) return;
    const phase = s.raidLife.phase as LifePhase;
    const target = followTarget(lastPhase.current, phase);
    lastPhase.current = phase;
    const busy = modeRef.current.mode === 'edit' || !!modeRef.current.popup || !!dragRef.current;
    const d = followDecision(prefsRef.current, target, autoActive(s), busy);
    if (d === 'switch' && target) setPrefsRaw(p => selectLayout(p, target, false));
    if (d === 'defer') pendingFollow.current = target;
  }, [view?.state]);

  /* ----- klávesnice: Esc, Ctrl+K, Zpět / Znovu (jen v Úpravách; okno ve Hře klávesy nedostává) ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modeRef.current.mode !== 'edit') return;
      if (e.key === 'Escape') { e.preventDefault(); dispatch({ type: 'esc' }); return; }
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea, select') ?? false;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); dispatch({ type: 'open', popup: 'search' }); return; }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); doUndo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const doUndo = () => { const u = undo(hist.current, prefsRef.current); if (u) { hist.current = u.h; bumpHist(x => x + 1); setPrefsRaw(u.prefs); } };
  const doRedo = () => { const r = redo(hist.current, prefsRef.current); if (r) { hist.current = r.h; bumpHist(x => x + 1); setPrefsRaw(r.prefs); } };

  const layout = activeLayout(prefs);
  const rects = useMemo(() => new Map(layout.widgets.map(w => [w.id, placeRect(w, vp)])), [layout, vp]);
  const name = (id: WidgetId) => t(`wg.w.${id}` as Key);

  /* ----- tažení a změna velikosti myší ----- */
  const startDrag = (e: ReactPointerEvent, w: WidgetPlace, kind: Drag['kind']) => {
    if (!edit || w.locked || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const start = rects.get(w.id)!;
    setSelected(w.id);
    setDrag({ id: w.id, kind, start, px: e.clientX, py: e.clientY, rect: start, guides: noGuides });
    dispatch({ type: 'dragStart' });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (d.kind === 'move') {
      const others = layout.widgets.filter(x => x.id !== d.id).map(x => rects.get(x.id)!);
      const s = snapMove({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, vp, others, e.altKey);
      setDrag({ ...d, rect: s.rect, guides: s.guides });
    } else {
      setDrag({ ...d, rect: resizeRect(d.start, d.kind, dx, dy, d.id, vp, e.altKey), guides: noGuides });
    }
  };
  const endDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    dispatch({ type: 'dragEnd' });
    const w = layout.widgets.find(x => x.id === d.id);
    if (!w || (d.rect.x === d.start.x && d.rect.y === d.start.y && d.rect.w === d.start.w && d.rect.h === d.start.h)) return;
    change(p => setPlace(p, withRect(w, d.rect, vp)), d.kind === 'move' ? t('wg.live.moved', { x: d.rect.x, y: d.rect.y }) : t('wg.live.size', { w: d.rect.w, h: d.rect.h }));
  };

  /* ----- klávesnice na úchytu: šipky 8 px (Shift 1 px), Ctrl mění velikost, Delete odebere ----- */
  const onHandleKey = (e: ReactKeyboardEvent, w: WidgetPlace) => {
    if (e.key === 'Delete') { e.preventDefault(); remove(w.id); return; }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir || w.locked) return;
    e.preventDefault();
    const step = e.shiftKey ? 1 : 8, r = rects.get(w.id)!;
    const next = e.ctrlKey
      ? { ...r, w: r.w + dir[0] * step, h: r.h + dir[1] * step }
      : { ...r, x: clampN(r.x + dir[0] * step, 0, vp.w - r.w), y: clampN(r.y + dir[1] * step, 0, vp.h - r.h) };
    const placed = withRect(w, next, vp), pr = placeRect(placed, vp);
    change(p => setPlace(p, placed), e.ctrlKey ? t('wg.live.size', { w: pr.w, h: pr.h }) : t('wg.live.moved', { x: pr.x, y: pr.y }));
  };

  const remove = (id: WidgetId) => {
    change(p => removeWidget(p, id), t('wg.live.removed'));
    if (modeRef.current.popup === 'settings') dispatch({ type: 'close' });
    setSelected(null);
    setTimeout(() => addBtn.current?.focus(), 0);
  };
  const add = (id: WidgetId) => { if (change(p => addWidget(p, id, vp), t('wg.live.added', { name: name(id) }))) setSelected(id); };
  const act = (n: 'questObjective' | 'setRaidFound', args: unknown[]) => { if (modeRef.current.mode === 'edit') bus.send('main', 'widgetAction', { name: n, args }); };
  const setLookup = (q: string) => setPrefsRaw(p => ({ ...p, lookup: q.slice(0, 80) }));

  const shown = !mode.hidden || edit;
  const sorted = [...layout.widgets].sort((a, b) => (edit && a.id === selected ? 1 : edit && b.id === selected ? -1 : a.z - b.z));
  const pending = view?.pending ?? { stash: 0, loot: false, progress: false };

  return (
    <div className={cx('wgc', edit ? 'is-edit' : 'is-play')} data-testid="widgets" data-mode={mode.mode} data-hidden={String(mode.hidden)} data-layout={prefs.active}
      onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {edit && <div className="wgc-veil" aria-hidden="true" />}
      {shown && view && sorted.map(w => {
        const r = drag?.id === w.id ? drag.rect : rects.get(w.id)!;
        const style = { left: r.x, top: r.y, width: r.w, height: r.h, ['--wg-a' as string]: String(clampOpacity(w.opacity) / 100), ['--wg-t' as string]: String(textSurface(w.opacity) / 100) } as CSSProperties;
        const label = t('wg.aria', { name: name(w.id), density: t(`wg.density.${w.density}` as Key) });
        return (
          <section key={w.id} className={cx('wg', w.density, edit && 'edit', selected === w.id && 'sel', r.y < 44 && 'bar-below')} style={style} data-testid={'widget-' + w.id} data-widget={w.id}
            aria-label={label}>
            {edit && (
              <div className="wg-ebar">
                <button type="button" className="wg-move" onPointerDown={e => startDrag(e, w, 'move')} onKeyDown={e => onHandleKey(e, w)} onFocus={() => setSelected(w.id)}
                  aria-label={t('wg.h.moveAria', { name: name(w.id) })} title={w.locked ? t('wg.lockedHint') : t('wg.h.move')} data-testid="wg-move">
                  {w.locked ? <Lock size={13} aria-hidden="true" /> : <GripVertical size={13} aria-hidden="true" />}{w.locked ? t('wg.locked') : t('wg.h.move')}
                </button>
                <span className="grow" />
                <button type="button" onClick={() => { setSelected(w.id); dispatch({ type: 'open', popup: 'settings' }); }} aria-label={t('wg.h.settingsAria', { name: name(w.id) })} data-testid="wg-settings-open">{t('wg.h.settings')}</button>
                <button type="button" onClick={() => remove(w.id)} aria-label={t('wg.h.removeAria', { name: name(w.id) })} data-testid="wg-remove">{t('wg.h.remove')}</button>
              </div>
            )}
            <div className="wg-surface">
              <WidgetCard id={w.id} density={w.density} edit={edit} height={r.h} pending={pending} lookup={prefs.lookup} setLookup={setLookup} act={act} openApp={openApp} />
            </div>
            {edit && !w.locked && EDGES.map(e => <i key={e} className={'wg-h ' + e} onPointerDown={ev => startDrag(ev, w, e)} aria-hidden="true" data-edge={e} />)}
          </section>
        );
      })}
      {edit && drag?.guides.x !== null && drag?.guides.x !== undefined && <i className="wg-guide v" style={{ left: drag.guides.x }} aria-hidden="true" />}
      {edit && drag?.guides.y !== null && drag?.guides.y !== undefined && <i className="wg-guide h" style={{ top: drag.guides.y }} aria-hidden="true" />}
      {edit && (
        <>
          <Toolbar t={t} addRef={addBtn} mode={mode} dispatch={dispatch} canUndo={hist.current.past.length > 0} canRedo={hist.current.future.length > 0}
            onUndo={doUndo} onRedo={doRedo} onApp={() => openApp('apps')} />
          {mode.popup === 'catalog' && <Catalog t={t} prefs={prefs} add={add} close={() => dispatch({ type: 'close' })} />}
          {mode.popup === 'layouts' && <Layouts t={t} prefs={prefs} change={change} setRaw={setPrefsRaw} autoOn={!!view && autoActive(view.state)} />}
          {mode.popup === 'settings' && selected && layout.widgets.some(w => w.id === selected) && (
            <Settings t={t} w={layout.widgets.find(w => w.id === selected)!} vp={vp} change={change} remove={remove} close={() => dispatch({ type: 'close' })} />
          )}
          {mode.popup === 'search' && <Search t={t} prefs={prefs} close={() => dispatch({ type: 'close' })}
            pickWidget={id => {
              if (activeLayout(prefsRef.current).widgets.some(w => w.id === id)) { dispatch({ type: 'close' }); setSelected(id); setTimeout(() => document.querySelector<HTMLElement>(`[data-widget="${id}"] .wg-move`)?.focus(), 0); }
              else dispatch({ type: 'open', popup: 'catalog' });
            }}
            pickModule={id => { dispatch({ type: 'close' }); openApp('apps:' + id); }} />}
          {mode.popup === 'reset' && (
            <div className="wg-pop wg-dialog" role="alertdialog" aria-modal="true" aria-labelledby="wg-reset-title" data-testid="wg-reset">
              <h2 id="wg-reset-title">{t('wg.reset.title')}</h2>
              <p className="secondary">{t('wg.reset.text', { name: layout.name })}</p>
              <div className="wg-actions">
                <button type="button" onClick={() => dispatch({ type: 'close' })} autoFocus>{t('common.cancel')}</button>
                <button type="button" className="primary" onClick={() => { change(resetActive); dispatch({ type: 'close' }); }} data-testid="wg-reset-ok">{t('wg.reset.ok')}</button>
              </div>
            </div>
          )}
          <p className="sr-only" role="status" aria-live="polite" data-testid="wg-live">{live}</p>
        </>
      )}
      {!view && edit && <p className="wgc-loading" role="status">{t('wg.loading')}</p>}
    </div>
  );
}

/* ----- lišta Úprav ----- */
function Toolbar({ t, addRef, mode, dispatch, canUndo, canRedo, onUndo, onRedo, onApp }: {
  t: TFn; addRef: RefObject<HTMLButtonElement | null>; mode: ModeState; dispatch: (e: ModeEvent) => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; onApp: () => void;
}) {
  const p = mode.popup;
  return (
    <div className="wg-toolbar" role="toolbar" aria-label={t('wg.tb.aria')} data-testid="wg-toolbar">
      <span className="wg-mode">{t('wg.edit.kicker')}</span>
      <button ref={addRef} type="button" aria-expanded={p === 'catalog'} onClick={() => dispatch({ type: 'open', popup: 'catalog' })} data-testid="wg-add">{t('wg.tb.add')}</button>
      <button type="button" aria-expanded={p === 'layouts'} onClick={() => dispatch({ type: 'open', popup: 'layouts' })} data-testid="wg-layouts">{t('wg.tb.layouts')} ▾</button>
      <button type="button" onClick={onUndo} disabled={!canUndo} aria-keyshortcuts="Control+Z" data-testid="wg-undo">{t('wg.tb.undo')}</button>
      <button type="button" onClick={onRedo} disabled={!canRedo} aria-keyshortcuts="Control+Shift+Z" className="wg-redo" data-testid="wg-redo">{t('wg.tb.redo')}</button>
      <button type="button" onClick={() => dispatch({ type: 'open', popup: 'reset' })} data-testid="wg-reset-open">{t('wg.tb.reset')}</button>
      <button type="button" onClick={onApp} data-testid="wg-app">{t('wg.tb.app')} ↗</button>
      <button type="button" onClick={() => dispatch({ type: 'open', popup: 'search' })} aria-keyshortcuts="Control+K" data-testid="wg-search">{t('wg.tb.search')}</button>
      <button type="button" onClick={() => dispatch({ type: 'hideAll' })} data-testid="wg-hide">{t('wg.tb.hideAll')}</button>
      <button type="button" className="primary" onClick={() => dispatch({ type: 'done' })} aria-keyshortcuts="Escape" data-testid="wg-done">{t('wg.tb.done')}</button>
    </div>
  );
}

/* ----- katalog ----- */
function Catalog({ t, prefs, add, close }: { t: TFn; prefs: WidgetPrefs; add: (id: WidgetId) => void; close: () => void }) {
  const have = new Set(activeLayout(prefs).widgets.map(w => w.id));
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <div className="wg-pop wg-catalog" role="dialog" aria-labelledby="wg-cat-title" data-testid="wg-catalog">
      <h2 id="wg-cat-title">{t('wg.cat.title')}</h2>
      <p className="secondary">{t('wg.cat.sub')}</p>
      <ul>{WIDGET_IDS.map((id, i) => {
        const n = t(`wg.w.${id}` as Key);
        return (
          <li key={id} className="wg-catrow" data-widget={id}>
            <span className="grow">{n}</span>
            {have.has(id) ? <span className="wg-added mono">{t('wg.cat.added')}</span>
              : <button type="button" ref={i === WIDGET_IDS.findIndex(x => !have.has(x)) ? first : undefined} onClick={() => add(id)} aria-label={t('wg.cat.addAria', { name: n })} data-testid={'wg-cat-' + id}>{t('wg.cat.add')}</button>}
          </li>
        );
      })}</ul>
      <p className="wg-notice">{t('wg.cat.fair')}</p>
      <div className="wg-actions"><button type="button" onClick={close}>{t('wg.set.done')}</button></div>
    </div>
  );
}

/* ----- rozložení ----- */
function Layouts({ t, prefs, change, setRaw, autoOn }: {
  t: TFn; prefs: WidgetPrefs; change: (fn: (p: WidgetPrefs) => WidgetPrefs | null, announce?: string) => boolean;
  setRaw: (fn: (p: WidgetPrefs) => WidgetPrefs) => void; autoOn: boolean;
}) {
  const [form, setForm] = useState<null | { kind: 'saveAs' | 'rename'; name: string; error: boolean }>(null);
  const cur = activeLayout(prefs);
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { listRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(); }, []);
  const onListKey = (e: ReactKeyboardEvent) => {
    const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.wg-preset') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : null;
    if (j === null || !btns.length) return;
    e.preventDefault();
    btns[(j + btns.length) % btns.length].focus();
  };
  const submit = () => {
    if (!form) return;
    const next = form.kind === 'saveAs' ? saveAs(prefs, form.name, newId()) : rename(prefs, cur.id, form.name);
    if (!next) { setForm({ ...form, error: true }); return; }
    change(() => next, t('wg.live.saved'));
    setForm(null);
  };
  /* výběr rozložení se do Zpět nepočítá: je to přepnutí, ne úprava */
  const pickLayout = (id: string) => setRaw(p => selectLayout(p, id));
  return (
    <div className="wg-pop wg-layouts" role="dialog" aria-labelledby="wg-lay-title" data-testid="wg-layouts-pop">
      <h2 id="wg-lay-title">{t('wg.lay.title')}</h2>
      <div ref={listRef} onKeyDown={onListKey}>
        {prefs.layouts.map(l => (
          <div key={l.id} className="wg-preset-row">
            <button type="button" className="wg-preset" aria-pressed={l.id === prefs.active} onClick={() => pickLayout(l.id)} data-testid={'wg-layout-' + l.id} data-layout={l.id}>
              <strong>{l.name}</strong>
              <small>{isPresetId(l.id) ? t(`wg.lay.desc.${l.id}` as Key) : t('wg.lay.desc.own', { count: l.widgets.length })}{l.id === prefs.active ? ' · ' + t('wg.lay.active') : ''}</small>
            </button>
            {!isPresetId(l.id) && <button type="button" className="wg-x" onClick={() => change(p => deleteLayout(p, l.id))} aria-label={t('wg.lay.delete') + ': ' + l.name} title={t('wg.lay.delete')}>×</button>}
          </div>
        ))}
      </div>
      {form ? (
        <form className="wg-form" onSubmit={e => { e.preventDefault(); submit(); }}>
          <label htmlFor="wg-lay-name">{t('wg.lay.name')}</label>
          <input id="wg-lay-name" type="text" value={form.name} maxLength={40} autoFocus onChange={e => setForm({ ...form, name: e.target.value, error: false })}
            aria-invalid={form.error || nameError(form.name, prefs, form.kind === 'rename' ? cur.id : undefined)} aria-describedby="wg-lay-err" data-testid="wg-layout-name" />
          {form.error && <p id="wg-lay-err" className="wg-err" role="alert">{t('wg.lay.nameErr')}</p>}
          <div className="wg-actions">
            <button type="button" onClick={() => setForm(null)}>{t('wg.lay.cancel')}</button>
            <button type="submit" className="primary" data-testid="wg-layout-save">{t('wg.lay.save')}</button>
          </div>
        </form>
      ) : (
        <div className="wg-actions split">
          <button type="button" onClick={() => setForm({ kind: 'saveAs', name: '', error: false })} disabled={prefs.layouts.length >= LAYOUTS_MAX} title={prefs.layouts.length >= LAYOUTS_MAX ? t('wg.lay.full') : undefined} data-testid="wg-layout-saveas">{t('wg.lay.saveAs')}</button>
          <button type="button" onClick={() => setForm({ kind: 'rename', name: cur.name, error: false })} disabled={isPresetId(cur.id)} data-testid="wg-layout-rename">{t('wg.lay.rename')}</button>
        </div>
      )}
      <label className="wg-checkline"><input type="checkbox" checked={prefs.follow} onChange={e => setRaw(p => setFollow(p, e.target.checked))} data-testid="wg-follow" />{t('wg.lay.follow')}</label>
      <p className="wg-notice">{t('wg.lay.followHint')}</p>
      {prefs.follow && (prefs.followPaused || !autoOn) && <p className="wg-meta" role="status" data-testid="wg-follow-paused">{t('wg.lay.paused')}</p>}
      <p className="wg-meta">{t('wg.lay.local')}</p>
    </div>
  );
}

/* ----- nastavení widgetu ----- */
function Settings({ t, w, vp, change, remove, close }: {
  t: TFn; w: WidgetPlace; vp: Viewport; change: (fn: (p: WidgetPrefs) => WidgetPrefs | null, announce?: string) => boolean; remove: (id: WidgetId) => void; close: () => void;
}) {
  const spec = WIDGETS[w.id];
  const r = placeRect(w, vp);
  const [op, setOp] = useState(w.opacity);
  useEffect(() => setOp(w.opacity), [w.opacity]);
  const commitOp = () => { if (op !== w.opacity) change(p => setPlace(p, { ...w, opacity: clampOpacity(op) })); };
  const geo = (k: 'x' | 'y' | 'w' | 'h', v: number) => {
    if (!Number.isFinite(v) || w.locked) return;
    const next = withRect(w, { ...r, [k]: Math.round(v) }, vp);
    change(p => setPlace(p, next));
  };
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('input, button')?.focus(); }, [w.id]);
  const anchor = t(`wg.anchor.${w.ax}.${w.ay}` as Key);
  return (
    <div ref={ref} className="wg-pop wg-settings" role="dialog" aria-labelledby="wg-set-title" data-testid="wg-settings">
      <h2 id="wg-set-title">{t(`wg.w.${w.id}` as Key)}</h2>
      <p className="secondary">{t('wg.set.title')}</p>
      <label className="wg-range"><span className="row-between"><span>{t('wg.set.opacity')}</span><b className="mono">{t('wg.set.opacityVal', { v: op })}</b></span>
        <input type="range" min={30} max={100} step={5} value={op} onChange={e => setOp(Number(e.target.value))} onPointerUp={commitOp} onKeyUp={commitOp} onBlur={commitOp} data-testid="wg-opacity" />
      </label>
      <p className="wg-notice">{t('wg.set.opacityHint')}</p>
      <span className="wg-label" id="wg-density-l">{t('wg.set.density')}</span>
      <div className="wg-seg" role="group" aria-labelledby="wg-density-l">
        {(['compact', 'expanded'] as const).map(d => (
          <button key={d} type="button" aria-pressed={w.density === d} onClick={() => change(p => setDensity(p, w.id, d, vp))} data-testid={'wg-density-' + d}>{t(`wg.density.${d}` as Key)}</button>
        ))}
      </div>
      <span className="wg-label">{t('wg.set.size')}</span>
      <p className="mono">{t('wg.set.sizeVal', { w: r.w, h: r.h })}</p>
      <p className="wg-meta">{t('wg.set.limits', { minW: spec.min.w, minH: spec.min.h, maxW: spec.max.w, maxH: spec.max.h })}</p>
      <div className="wg-nums">
        <label>{t('wg.set.w')}<input type="number" min={spec.min.w} max={spec.max.w} step={8} value={r.w} disabled={w.locked} onChange={e => geo('w', Number(e.target.value))} data-testid="wg-num-w" /></label>
        <label>{t('wg.set.h')}<input type="number" min={spec.min.h} max={spec.max.h} step={8} value={r.h} disabled={w.locked} onChange={e => geo('h', Number(e.target.value))} data-testid="wg-num-h" /></label>
      </div>
      <span className="wg-label">{t('wg.set.anchor')}</span>
      <p className="mono" data-testid="wg-anchor">{t('wg.set.anchorVal', { anchor, dx: w.dx, dy: w.dy })}</p>
      <div className="wg-nums">
        <label>{t('wg.set.x')}<input type="number" min={0} max={vp.w - r.w} step={8} value={r.x} disabled={w.locked} onChange={e => geo('x', Number(e.target.value))} data-testid="wg-num-x" /></label>
        <label>{t('wg.set.y')}<input type="number" min={0} max={vp.h - r.h} step={8} value={r.y} disabled={w.locked} onChange={e => geo('y', Number(e.target.value))} data-testid="wg-num-y" /></label>
      </div>
      <label className="wg-checkline"><input type="checkbox" checked={w.locked} onChange={e => change(p => setPlace(p, { ...w, locked: e.target.checked }))} data-testid="wg-lock" />{t('wg.set.lock')}</label>
      <div className="wg-actions split">
        <button type="button" onClick={() => change(p => restack(p, w.id, 1))}>{t('wg.set.forward')}</button>
        <button type="button" onClick={() => change(p => restack(p, w.id, -1))}>{t('wg.set.backward')}</button>
      </div>
      <div className="wg-actions split">
        <button type="button" onClick={() => remove(w.id)}>{t('wg.set.remove')}</button>
        <button type="button" className="primary" onClick={close} data-testid="wg-settings-done">{t('wg.set.done')}</button>
      </div>
    </div>
  );
}

/* ----- hledání (Ctrl+K): widgety a moduly aplikace; nic nezapíná ----- */
function Search({ t, prefs, close, pickWidget, pickModule }: { t: TFn; prefs: WidgetPrefs; close: () => void; pickWidget: (id: WidgetId) => void; pickModule: (id: string) => void }) {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qq = norm(q.trim());
  const widgets = WIDGET_IDS.filter(id => !qq || norm(t(`wg.w.${id}` as Key)).includes(qq));
  const mods = MODULES.filter(m => !qq || norm(moduleName(m, t)).includes(qq) || m.id.includes(qq));
  const have = new Set(activeLayout(prefs).widgets.map(w => w.id));
  return (
    <div className="wg-pop wg-search" role="dialog" aria-labelledby="wg-search-title" data-testid="wg-search-pop">
      <h2 id="wg-search-title">{t('wg.search.title')}</h2>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder={t('wg.search.field')} aria-label={t('wg.search.field')} data-testid="wg-search-field"
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (widgets[0]) pickWidget(widgets[0]); else if (mods[0]) pickModule(mods[0].id); } }} />
      {widgets.length + mods.length === 0 && <p className="secondary">{t('wg.search.none')}</p>}
      {widgets.length > 0 && <><h3>{t('wg.search.widgets')}</h3><ul>{widgets.map(id => (
        <li key={id}><button type="button" className="wg-result" onClick={() => pickWidget(id)}>{t(`wg.w.${id}` as Key)}{have.has(id) && <small className="mono"> · {t('wg.cat.added')}</small>}</button></li>
      ))}</ul></>}
      {mods.length > 0 && <><h3>{t('wg.search.modules')}</h3><ul>{mods.map(m => (
        <li key={m.id}><button type="button" className="wg-result" onClick={() => pickModule(m.id)} data-testid={'wg-search-mod-' + m.id}>{moduleName(m, t)} ↗</button></li>
      ))}</ul></>}
      <p className="wg-meta">{t('wg.search.esc')}</p>
      <div className="wg-actions"><button type="button" onClick={close}>{t('common.close')}</button></div>
    </div>
  );
}
