/* 0.16.0: Aplikace v overlayi (tlačítko vedle záložek). Výběr modulu seskupený jako postranní panel a skutečný plný modul
   z registru (src/shell/modules.ts) ve velkém panelu, jehož velikost a polohu si overlay pamatuje (ovPanel.ts).
   - Moduly se načtou až při otevření (lazy), overlay se tím při startu nezpomalí.
   - Zápisy modulů jdou přes zrcadlo do hlavního okna (store/relay.ts); overlay sám nic neukládá.
   - Nastavení a zálohy (soubory, dialogy, snímky, zkratka, okno) jsou jen v hlavním okně: místo nich
     „Otevřít v aplikaci“. Části modulů se souborem (snímek mapy, import ze snímku) to řeší samy (InAppOnly).
   - Cesta modulu je v location.hash okna overlaye (#modul/podsekce), takže odkazy mezi moduly fungují i tady. */
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { AppWindow, ArrowLeft, Grip, Maximize } from 'lucide-react';
import { MODULES, moduleName, type ModuleDef } from '../shell/modules';
import { useT, type TFn } from '../i18n/react';
import { openInApp } from '../shell/host';
import { safeDecode } from '../core/util';
import { cx } from '../ui/components';
import { InAppOnly } from '../ui/InAppOnly';
import { PANEL_STEP, fitPanel, movePanel, readPanel, resizePanel, writePanel, defaultPanel, type Screen } from './ovPanel';
import { createPanelWindow } from './ovWindow';
import type { Rect } from './layout';

/* Plné moduly, které v overlayi běží. Nastavení (settings) chybí záměrně: jen v hlavním okně. */
const VIEWS: Record<string, ComponentType<{ sub: string }>> = {
  dashboard: lazy(() => import('../modules/Dashboard')),
  profile: lazy(() => import('../modules/Profile')),
  skills: lazy(() => import('../modules/SkillTree')),
  workshop: lazy(() => import('../modules/Workshop')),
  inventory: lazy(() => import('../modules/Inventory')),
  quests: lazy(() => import('../modules/Quests')),
  maps: lazy(() => import('../modules/Maps')),
  arc: lazy(() => import('../modules/ArcDb')),
  weapons: lazy(() => import('../modules/Weapons')),
  items: lazy(() => import('../modules/ItemDb')),
  raid: lazy(() => import('../modules/RaidPrep')),
  money: lazy(() => import('../modules/MoneyRuns')),
  trials: lazy(() => import('../modules/Trials')),
  journal: lazy(() => import('../modules/Journal')),
  checklist: lazy(() => import('../modules/Checklist')),
  stats: lazy(() => import('../modules/Statistics')),
  games: lazy(() => import('../modules/Minigames')),
};
/* Moduly jen pro hlavní okno (v overlayi „Otevřít v aplikaci“). */
export const APP_ONLY = ['settings'] as const;
export const overlayModules = (): ModuleDef[] => MODULES;
export const runsInOverlay = (id: string): boolean => id in VIEWS;

/* ----- cesta v okně overlaye ----- */
const subscribeHash = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
const getHash = () => window.location.hash;
export function parseOvRoute(hash: string): { module: string | null; sub: string } {
  const [m, sub = ''] = hash.replace(/^#\/?/, '').split('/');
  return { module: MODULES.some(x => x.id === m) ? m : null, sub: safeDecode(sub) };
}
export function useOvRoute() { return parseOvRoute(useSyncExternalStore(subscribeHash, getHash, () => '')); }
export const openModule = (id: string) => { const h = '#' + id; if (window.location.hash !== h) window.location.hash = h; };
export const closeModule = () => { if (window.location.hash) window.location.hash = ''; };

/* Cesta pro hlavní okno (hub přijme jen #modul nebo #modul/podsekce z malých písmen a pomlček). */
export const mainRoute = (module: string, sub: string): string => (sub && /^[a-z-]+$/.test(sub) ? `${module}/${sub}` : module);

/* ----- chyba modulu nesmí shodit overlay ----- */
class Guard extends Component<{ children: ReactNode; fallback: ReactNode; id: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev: { id: string }) { if (prev.id !== this.props.id && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/* ----- velký panel: velikost a poloha okna overlaye ----- */
const win = createPanelWindow();
/* Změny okna jdou za sebou a platí jen poslední požadovaná (tažení posílá mnoho změn). */
let want: Rect | null = null;
let setting = false;
function setWindow(r: Rect) {
  want = r;
  if (setting) return;
  setting = true;
  void (async () => {
    try { while (want) { const x = want; want = null; await win.set(x).catch(() => undefined); } }
    finally { setting = false; }
  })();
}
/* Při otevření modulu se okno zvětší na uložený panel, při odchodu (zpět na výběr, jiná záložka) se vrátí. */
function usePanel() {
  const [rect, setRect] = useState<Rect | null>(null);
  const screen = useRef<Screen | null>(null);
  useEffect(() => {
    let dead = false, std: Rect | null = null;
    void (async () => {
      try {
        const [cur, scr] = await Promise.all([win.get(), win.screens()]);
        if (dead) return;
        std = cur;
        const target = fitPanel(readPanel(), scr.all, scr.current);
        const c = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
        screen.current = scr.all.find(s => c.x >= s.work.x && c.x < s.work.x + s.work.w && c.y >= s.work.y && c.y < s.work.y + s.work.h) ?? scr.current;
        setRect(target);
        setWindow(target);
      } catch { /* okno se nezmění */ }
    })();
    return () => { dead = true; if (std) setWindow(std); };
  }, []);
  const apply = useCallback((r: Rect) => { setRect(r); setWindow(r); }, []);
  const reset = () => { const s = screen.current; if (!s) return; writePanel(null); apply(defaultPanel(s)); };
  return { rect, screen, apply, commit: (r: Rect) => writePanel(r), reset };
}

type Drag = { kind: 'move' | 'size'; sx: number; sy: number; start: Rect; last: Rect } | null;

function ModuleHost({ mod, sub, t }: { mod: ModuleDef; sub: string; t: TFn }) {
  const View = VIEWS[mod.id];
  const panel = usePanel();
  const drag = useRef<Drag>(null);
  const back = useRef<HTMLButtonElement>(null);
  const name = moduleName(mod, t);
  useEffect(() => { const h = setTimeout(() => back.current?.focus({ preventScroll: true }), 30); return () => clearTimeout(h); }, [mod.id]);
  useEffect(() => { document.querySelector('.ov-appview')?.scrollTo(0, 0); }, [mod.id]);
  const dpr = () => window.devicePixelRatio || 1;
  const down = (kind: 'move' | 'size') => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !panel.rect) return;
    if (kind === 'move' && (e.target as HTMLElement).closest('button, a, input, select')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { kind, sx: e.screenX, sy: e.screenY, start: panel.rect, last: panel.rect };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current, s = panel.screen.current;
    if (!d || !s) return;
    const dx = Math.round((e.screenX - d.sx) * dpr()), dy = Math.round((e.screenY - d.sy) * dpr());
    d.last = d.kind === 'size' ? resizePanel(d.start, dx, dy, s) : movePanel(d.start, dx, dy, s);
    panel.apply(d.last);
  };
  const up = () => { const d = drag.current; drag.current = null; if (d) panel.commit(d.last); };
  const gripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const s = panel.screen.current, r = panel.rect;
    if (!s || !r) return;
    const step = Math.round(PANEL_STEP * s.sf);
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    const n = e.shiftKey ? movePanel(r, dir[0] * step, dir[1] * step, s) : resizePanel(r, dir[0] * step, dir[1] * step, s);
    panel.apply(n);
    panel.commit(n);
  };
  const Icon = mod.icon;
  return (
    <div className="ov-apphost" data-testid="ov-app-host" data-module={mod.id}>
      <div className="ov-appbar" onPointerDown={down('move')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <button ref={back} type="button" className="ov-btn" onClick={closeModule} data-testid="ov-app-back"><ArrowLeft size={16} aria-hidden="true" />{t('ops.ov.app.back')}</button>
        <span className="ov-apptitle"><Icon size={18} aria-hidden="true" /><h2>{name}</h2></span>
        <span className="ov-muted ov-appdrag" aria-hidden="true">{t('ops.ov.app.drag')}</span>
        <button type="button" className="ov-btn" onClick={panel.reset} data-testid="ov-app-reset"><Maximize size={16} aria-hidden="true" />{t('ops.ov.app.reset')}</button>
        <button type="button" className="ov-btn" onClick={() => openInApp(mainRoute(mod.id, sub))} data-testid="ov-app-open"><AppWindow size={16} aria-hidden="true" />{t('host.openInApp')}</button>
      </div>
      <div className="ov-appview" data-testid="ov-appview">
        {View ? (
          <Guard id={mod.id} fallback={<div className="page"><InAppOnly route={mod.id} what="ops.ov.app.failed" /></div>}>
            <Suspense fallback={<p className="ov-muted ov-apploading" role="status">{t('ops.ov.app.loading')}</p>}>
              <View sub={sub} key={mod.id} />
            </Suspense>
          </Guard>
        ) : (
          <div className="page"><div className="ov-apponly"><Icon size={28} aria-hidden="true" /><h3>{name}</h3><InAppOnly route={mod.id} what="host.why.settings" /></div></div>
        )}
      </div>
      <button type="button" className="ov-grip" aria-label={t('ops.ov.app.grip')} title={t('ops.ov.app.grip')} data-testid="ov-app-grip"
        onPointerDown={down('size')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={gripKey}><Grip size={14} aria-hidden="true" /></button>
    </div>
  );
}

/* ----- výběr modulu: skupiny jako v postranním panelu, šipky mezi moduly ----- */
function Picker({ t, last }: { t: TFn; last: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!last) return;
    const h = setTimeout(() => ref.current?.querySelector<HTMLButtonElement>(`button[data-module="${last}"]`)?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(h);
  }, [last]);
  const groups: { id: ModuleDef['group']; mods: ModuleDef[] }[] = [];
  for (const m of MODULES) { const g = groups.find(x => x.id === m.group); if (g) g.mods.push(m); else groups.push({ id: m.group, mods: [m] }); }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button[data-module]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    all[(n + all.length) % all.length]?.focus();
  };
  return (
    <div className="ov-single ov-picker" ref={ref} onKeyDown={onKey} data-testid="ov-app-picker">
      <div className="ov-head"><h2>{t('ops.ov.app.title')}</h2><p>{t('ops.ov.app.sub')}</p></div>
      <div className="ov-picker-groups">
        {groups.map(g => (
          <section key={g.id} className="ov-card ov-picker-group" aria-labelledby={'ov-pg-' + g.id}>
            <span className="ov-stencil" id={'ov-pg-' + g.id}>{t(`nav.group.${g.id}`)}</span>
            <ul>{g.mods.map(m => {
              const Icon = m.icon, only = !runsInOverlay(m.id);
              return (
                <li key={m.id}>
                  <button type="button" className={cx('ov-picker-item', only && 'only')} data-module={m.id} onClick={() => openModule(m.id)}>
                    <Icon size={18} aria-hidden="true" /><span className="grow">{moduleName(m, t)}{only && <em className="ov-picker-note">{t('ops.ov.app.mainOnly')}</em>}</span>
                  </button>
                </li>
              );
            })}</ul>
          </section>
        ))}
      </div>
      <p className="ov-muted">{t('ops.ov.app.hint')}</p>
    </div>
  );
}

export function OverlayApps() {
  const t = useT();
  const route = useOvRoute();
  const last = useRef<string | null>(null);
  const mod = route.module ? MODULES.find(m => m.id === route.module) ?? null : null;
  const prev = last.current;
  if (mod) last.current = mod.id;
  return mod ? <ModuleHost mod={mod} sub={route.sub} t={t} /> : <Picker t={t} last={prev} />;
}
