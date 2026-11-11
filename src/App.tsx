import { useEffect, useState, type ComponentType } from 'react';
import { Loader } from 'lucide-react';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { Banners, Toasts } from './shell/Banners';
import { moduleById } from './shell/modules';
import { useApp, useRoute } from './store';
import { RaidFormHost } from './ui/RaidForm';
import { cx } from './ui/components';
import Dashboard from './modules/Dashboard';
import Profile from './modules/Profile';
import SkillTree from './modules/SkillTree';
import Workshop from './modules/Workshop';
import Inventory from './modules/Inventory';
import Quests from './modules/Quests';
import Maps from './modules/Maps';
import ArcDb from './modules/ArcDb';
import Weapons from './modules/Weapons';
import ItemDb from './modules/ItemDb';
import MoneyRuns from './modules/MoneyRuns';
import Trials from './modules/Trials';
import Journal from './modules/Journal';
import Checklist from './modules/Checklist';
import Statistics from './modules/Statistics';
import Settings from './modules/Settings';
import { useT } from './i18n/react';

const VIEWS: Record<string, ComponentType<{ sub: string }>> = {
  dashboard: Dashboard, profile: Profile, skills: SkillTree, workshop: Workshop, inventory: Inventory, quests: Quests, maps: Maps,
  arc: ArcDb, weapons: Weapons, items: ItemDb, money: MoneyRuns, trials: Trials, journal: Journal, checklist: Checklist,
  stats: Statistics, settings: Settings,
};

const COLLAPSE_KEY = 'arcops:ui:collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return w;
}

export default function App() {
  const ready = useApp(s => s.ready);
  const route = useRoute();
  const width = useWidth();
  const t = useT();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const canCollapse = width >= 1280;
  const compact = !canCollapse || collapsed;
  const mod = moduleById(route.module);
  const View = VIEWS[mod.id];

  useEffect(() => { document.title = `${mod.name} · ARC OPS`; }, [mod.name]);
  useEffect(() => { document.querySelector('.content')?.scrollTo(0, 0); }, [mod.id]);

  const toggle = () => { const v = !collapsed; setCollapsed(v); try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* bez úložiště */ } };

  return (
    <div className={cx('shell', compact && 'compact')}>
      <Sidebar active={mod.id} compact={compact} canCollapse={canCollapse} onToggle={toggle} />
      <div className="main">
        {ready ? <TopBar /> : <header className="topbar" />}
        {ready && <Banners />}
        <main className="content" id="content">
          {ready ? <View sub={route.sub} key={mod.id} /> : (
            <div className="page"><div className="panel"><div className="panel-body"><div className="empty" role="status"><Loader size={24} className="spin" aria-hidden="true" />{t('common.loading')}</div></div></div></div>
          )}
        </main>
      </div>
      {ready && <RaidFormHost />}
      <Toasts />
    </div>
  );
}
