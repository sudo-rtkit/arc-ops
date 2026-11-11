import {
  BookOpen, Bot, Boxes, ChartNoAxesCombined, Coins, Crosshair, GitBranch, Hammer, LayoutDashboard, ListChecks, Map, Package,
  ScrollText, Settings, Trophy, UserRound, type LucideIcon,
} from 'lucide-react';

/* group = klíč skupiny (nav.group.*); název modulu je herní/produktový a je v obou jazycích stejný. */
export interface ModuleDef { id: string; name: string; icon: LucideIcon; group: 'overview' | 'progress' | 'explore' | 'raids' | 'system' }

/* Pořadí, skupiny a ikony podle visual-design.md kap. 4. */
export const MODULES: ModuleDef[] = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, group: 'overview' },
  { id: 'profile', name: 'Player Profile', icon: UserRound, group: 'overview' },
  { id: 'skills', name: 'Skill Tree', icon: GitBranch, group: 'progress' },
  { id: 'workshop', name: 'Workshop', icon: Hammer, group: 'progress' },
  { id: 'inventory', name: 'Inventory', icon: Package, group: 'progress' },
  { id: 'quests', name: 'Quests', icon: ScrollText, group: 'progress' },
  { id: 'maps', name: 'Maps', icon: Map, group: 'explore' },
  { id: 'arc', name: 'ARC Database', icon: Bot, group: 'explore' },
  { id: 'weapons', name: 'Weapons', icon: Crosshair, group: 'explore' },
  { id: 'items', name: 'Item Database', icon: Boxes, group: 'explore' },
  { id: 'money', name: 'Money Runs', icon: Coins, group: 'raids' },
  { id: 'trials', name: 'Weekly Trials', icon: Trophy, group: 'raids' },
  { id: 'journal', name: 'Raid Journal', icon: BookOpen, group: 'raids' },
  { id: 'checklist', name: 'Raid Checklist', icon: ListChecks, group: 'raids' },
  { id: 'stats', name: 'Statistics', icon: ChartNoAxesCombined, group: 'raids' },
  { id: 'settings', name: 'Settings & Backup', icon: Settings, group: 'system' },
];
export const moduleById = (id: string): ModuleDef => MODULES.find(m => m.id === id) || MODULES[0];
