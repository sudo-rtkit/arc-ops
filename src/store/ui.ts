/* Stav rozhraní, který se neukládá: otevřený formulář raidu a raid hodiny (jako v deníku se hodiny neukládají). */
import { create } from 'zustand';
import type { Raid } from '../core/types';

export interface RaidPreset { map?: string; route?: string; type?: Raid['type']; min?: number; loadout?: string }

interface UiStore {
  raidForm: null | { editId?: string; preset?: RaidPreset };
  openRaidForm: (o?: { editId?: string; preset?: RaidPreset }) => void;
  closeRaidForm: () => void;
  timer: { start: number; acc: number; running: boolean };
  timerToggle: () => void;
  timerReset: () => void;
}

export const useUi = create<UiStore>((set, get) => ({
  raidForm: null,
  openRaidForm: (o = {}) => set({ raidForm: o }),
  closeRaidForm: () => set({ raidForm: null }),
  timer: { start: 0, acc: 0, running: false },
  timerToggle: () => {
    const t = get().timer;
    set({ timer: t.running ? { start: 0, acc: t.acc + Date.now() - t.start, running: false } : { start: Date.now(), acc: t.acc, running: true } });
  },
  timerReset: () => set({ timer: { start: 0, acc: 0, running: false } }),
}));

export const elapsed = (t: UiStore['timer'], now = Date.now()): number => t.acc + (t.running ? now - t.start : 0);
/* Převod času hodin na minuty zápisu: na půl minuty, jako v deníku. */
export const elapsedMinutes = (t: UiStore['timer']): number => Math.min(120, Math.round(elapsed(t) / 30000) / 2);
