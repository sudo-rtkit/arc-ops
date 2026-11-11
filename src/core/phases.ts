/* Fáze roadmapy. Věrný převod z původního deníku. */
import type { BranchId, Points } from './types';
import { endTaken } from './skills';
import { t, type Key } from '../i18n';

export interface PhaseView {
  profile: { level: number; rounds: number; amplified: number };
  stations: Record<string, number>;
  skills: { current: Points };
}
export interface Gate { label: string; ok: boolean }
export interface Phase { n: number; name: string; lv: string; gates: Gate[]; done: boolean; current: boolean }

const CORE = ['gunsmith', 'gear', 'medical', 'refiner', 'utility', 'explosives'];

export function phases(state: PhaseView): { list: Phase[]; current: number } {
  const s = state.stations, p = state.profile, cur = state.skills.current;
  const anyEnd = (['c', 'm', 's'] as BranchId[]).some(b => endTaken(cur, b) > 0);
  const gate = (key: Key, ok: unknown): Gate => ({ label: t(key), ok: !!ok });
  const raw = [
    { n: 1, name: t('phase.1.name'), lv: '1–10', gates: [
      gate('phase.1.g1', p.rounds >= 12),
      gate('phase.1.g2', s.gunsmith >= 1 && s.gear >= 1 && s.medical >= 1 && s.refiner >= 1),
      gate('phase.1.g3', s.scrappy >= 2)] },
    { n: 2, name: t('phase.2.name'), lv: '10–20', gates: [
      gate('phase.2.g1', p.level >= 20),
      gate('phase.2.g2', p.rounds >= 25),
      gate('phase.2.g3', s.gunsmith >= 2 && s.gear >= 2 && s.refiner >= 2 && s.medical >= 2),
      gate('phase.2.g4', s.scrappy >= 3),
      gate('phase.2.g5', s.outpost >= 1)] },
    { n: 3, name: t('phase.3.name'), lv: '20–45', gates: [
      gate('phase.3.g1', CORE.every(id => s[id] >= 3)),
      gate('phase.3.g2', s.scrappy >= 5),
      gate('phase.3.g3', s.outpost >= 2 && s.research >= 2),
      gate('phase.3.g4', anyEnd)] },
    { n: 4, name: t('phase.4.name'), lv: '45–75', gates: [
      gate('phase.4.g1', p.level >= 75),
      gate('phase.4.g2', s.outpost >= 4 && s.research >= 4),
      gate('phase.4.g3', s.gunsmith >= 4),
      gate('phase.4.g4', p.amplified >= 1)] },
  ];
  let current = 5;
  const list: Phase[] = raw.map(ph => {
    const done = ph.gates.every(g => g.ok);
    if (!done && current === 5) current = ph.n;
    return { ...ph, done, current: false };
  });
  list.forEach(ph => { ph.current = ph.n === current; });
  return { list, current };
}
