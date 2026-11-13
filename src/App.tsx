import { Component, Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Loader } from 'lucide-react';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { Banners, Toasts } from './shell/Banners';
import { moduleById, moduleName } from './shell/modules';
import { useApp, useRoute } from './store';
import { RaidFormHost } from './ui/RaidForm';
import { cx } from './ui/components';
import Dashboard from './modules/Dashboard';
import { useT } from './i18n/react';
import Compact from './shell/Compact';
import { CloseDialog } from './shell/CloseDialog';
import { Tutorial } from './shell/Tutorial';
import { windowCtl } from './shell/windowCtl';
import { windowShortcut } from './core/mainWindow';
import { app as appStore } from './store';
import { ItemCardHost } from './ui/ItemCard';
import { SearchHost, useSearchShortcut } from './ui/SearchPalette';
import { WhatsNew } from './shell/WhatsNew';

/* 0.18.0: Ctrl+K (místní zkratka okna); z kompaktu nejdřív přepne do plné aplikace */
const searchEnabled = () => appStore.store.getState().ready;
const searchBefore = async () => { if (appStore.store.getState().state.mainWindow.mode === 'compact') await windowCtl.setMode('full'); };

/* 0.19.0: moduly se načtou až při prvním otevření (jako v overlayi, OverlayApps.tsx); Dashboard je výchozí stránka,
   proto je v hlavním balíku. Po startu se ostatní moduly v klidu přednačtou, aby první přepnutí nečekalo. */
const LOADERS: Record<string, () => Promise<{ default: ComponentType<{ sub: string }> }>> = {
  profile: () => import('./modules/Profile'), skills: () => import('./modules/SkillTree'), workshop: () => import('./modules/Workshop'),
  inventory: () => import('./modules/Inventory'), quests: () => import('./modules/Quests'), maps: () => import('./modules/Maps'),
  arc: () => import('./modules/ArcDb'), weapons: () => import('./modules/Weapons'), items: () => import('./modules/ItemDb'),
  money: () => import('./modules/MoneyRuns'), trials: () => import('./modules/Trials'), journal: () => import('./modules/Journal'),
  checklist: () => import('./modules/Checklist'), stats: () => import('./modules/Statistics'), settings: () => import('./modules/Settings'),
  games: () => import('./modules/Minigames'), raid: () => import('./modules/RaidPrep'),
};
const VIEWS: Record<string, ComponentType<{ sub: string }>> = {
  dashboard: Dashboard,
  ...Object.fromEntries(Object.entries(LOADERS).map(([id, load]) => [id, lazy(load)])),
};
let prefetched = false;
function prefetchModules() {
  if (prefetched) return;
  prefetched = true;
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const run = () => { for (const load of Object.values(LOADERS)) void load().catch(() => undefined); };
  if (idle) idle(run, { timeout: 4000 }); else setTimeout(run, 1500);
}

const COLLAPSE_KEY = 'arcops:ui:collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  /* 0.19.0: po přihlášení ještě jednou přečíst šířku (změna velikosti mezi prvním vykreslením a přihlášením se neztratí) */
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener('resize', on); on(); return () => window.removeEventListener('resize', on); }, []);
  return w;
}

/* Místní zkratky okna (0.9.0, žádné globální): Ctrl+Shift+M změní režim, Ctrl+Shift+P připne kompakt. */
function useWindowShortcuts() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !appStore.store.getState().ready) return;
      const k = windowShortcut(e, appStore.store.getState().state.buddy.hotkey);
      if (!k) return;
      e.preventDefault();
      void (k === 'mode' ? windowCtl.toggleMode() : windowCtl.togglePin());
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

export default function App() {
  const ready = useApp(s => s.ready);
  const compactMode = useApp(s => s.ready && s.state.mainWindow.mode === 'compact');
  useWindowShortcuts();
  useSearchShortcut(searchEnabled, searchBefore);
  if (compactMode) return <><Compact /><CloseDialog /></>;
  if (!ready && window.innerWidth <= 480) return <div className="cw" role="status" aria-busy="true" />;
  return <FullApp />;
}

/* Chyba modulu (i nenačtený balík) nesmí shodit celé okno: ukáže se hláška, jiné moduly dál fungují. */
class ModuleGuard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ModuleLoading({ text }: { text: string }) {
  return <div className="page"><div className="panel"><div className="panel-body"><div className="empty" role="status" data-testid="module-loading"><Loader size={24} className="spin" aria-hidden="true" />{text}</div></div></div></div>;
}

function FullApp() {
  const ready = useApp(s => s.ready);
  const route = useRoute();
  const width = useWidth();
  const t = useT();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const canCollapse = width >= 1280;
  const compact = !canCollapse || collapsed;
  const mod = moduleById(route.module);
  const View = VIEWS[mod.id];

  const modName = moduleName(mod, t);
  useEffect(() => { document.title = `${modName} · ARC OPS`; }, [modName]);
  useEffect(() => { document.querySelector('.content')?.scrollTo(0, 0); }, [mod.id]);
  useEffect(() => { if (ready) prefetchModules(); }, [ready]);

  const toggle = () => { const v = !collapsed; setCollapsed(v); try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* bez úložiště */ } };

  return (
    <div className={cx('shell', compact && 'compact')}>
      <Sidebar active={mod.id} compact={compact} canCollapse={canCollapse} onToggle={toggle} />
      <div className="main">
        {ready ? <TopBar /> : <header className="topbar" />}
        {ready && <Banners />}
        <main className="content" id="content">
          {ready && <WhatsNew />}
          {ready ? (
            <ModuleGuard key={mod.id} fallback={<div className="page"><div className="panel"><div className="panel-body"><p className="empty" role="alert">{t('common.moduleFailed')}</p></div></div></div>}>
              <Suspense fallback={<ModuleLoading text={t('common.loadingModule')} />}>
                <View sub={route.sub} />
              </Suspense>
            </ModuleGuard>
          ) : (
            <div className="page"><div className="panel"><div className="panel-body"><div className="empty" role="status"><Loader size={24} className="spin" aria-hidden="true" />{t('common.loading')}</div></div></div></div>
          )}
        </main>
      </div>
      {ready && <RaidFormHost />}
      {ready && <ItemCardHost />}
      {ready && <SearchHost />}
      {ready && <Tutorial compact={false} />}
      <Toasts />
      <CloseDialog />
    </div>
  );
}
