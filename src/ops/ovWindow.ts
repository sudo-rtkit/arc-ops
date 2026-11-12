/* 0.16.0: velikost a poloha okna overlaye pro velký panel (Aplikace). V Tauri jen setSize a setPosition (oprávnění
   overlaye v capabilities/ops.json se nemění); okno se neaktivuje, takže to fokus nebere. Mimo Tauri (vývoj
   v prohlížeči, E2E) se okno nemění: panel jen počítá virtuální obdélník, aby šla vyzkoušet pravidla a uložení. */
import { isTauri } from '../storage/tauri';
import type { Rect } from './layout';
import type { Screen } from './ovPanel';

export interface PanelWindow {
  /* okno je skutečné (Tauri) */
  real: boolean;
  get(): Promise<Rect>;
  set(r: Rect): Promise<void>;
  screens(): Promise<{ all: Screen[]; current: Screen }>;
}

type Mon = { position: { x: number; y: number }; size: { width: number; height: number }; workArea?: { position: { x: number; y: number }; size: { width: number; height: number } }; scaleFactor: number };
const screenOf = (m: Mon): Screen => {
  const a = m.workArea ?? { position: m.position, size: m.size };
  return { work: { x: a.position.x, y: a.position.y, w: a.size.width, h: a.size.height }, sf: m.scaleFactor || 1 };
};

function tauriWindow(): PanelWindow {
  const api = Promise.all([import('@tauri-apps/api/window'), import('@tauri-apps/api/dpi')]);
  return {
    real: true,
    async get() {
      const [m] = await api;
      const w = m.getCurrentWindow();
      const [p, s] = await Promise.all([w.outerPosition(), w.innerSize()]);
      return { x: p.x, y: p.y, w: s.width, h: s.height };
    },
    async set(r) {
      const [m, d] = await api;
      const w = m.getCurrentWindow();
      await w.setSize(new d.PhysicalSize(r.w, r.h));
      await w.setPosition(new d.PhysicalPosition(r.x, r.y));
    },
    async screens() {
      const [m] = await api;
      const [all, cur, prim] = await Promise.all([m.availableMonitors(), m.currentMonitor(), m.primaryMonitor()]);
      const list = (all as Mon[]).map(screenOf);
      const c = (cur ?? prim ?? all[0]) as Mon | null;
      const current = c ? screenOf(c) : { work: { x: 0, y: 0, w: 1920, h: 1080 }, sf: 1 };
      return { all: list.length ? list : [current], current };
    },
  };
}

function browserWindow(): PanelWindow {
  const sf = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const scr = (): Screen => ({ work: { x: 0, y: 0, w: Math.round((typeof screen !== 'undefined' ? screen.availWidth : 1920) * sf), h: Math.round((typeof screen !== 'undefined' ? screen.availHeight : 1080) * sf) }, sf });
  let rect: Rect = { x: 0, y: 0, w: Math.round((typeof window !== 'undefined' ? window.innerWidth : 1100) * sf), h: Math.round((typeof window !== 'undefined' ? window.innerHeight : 760) * sf) };
  return {
    real: false,
    get: async () => ({ ...rect }),
    set: async r => { rect = { ...r }; },
    screens: async () => ({ all: [scr()], current: scr() }),
  };
}

export const createPanelWindow = (): PanelWindow => (isTauri() ? tauriWindow() : browserWindow());
