/* Týdenní reset Trials. Deník hvězdy při novém týdnu zahodil; tady se týden nejdřív uloží do historie. */
import type { TrialsState } from './types';
import { isoWeek } from './util';

export function rollWeek(t: TrialsState, now: Date): TrialsState {
  const wk = isoWeek(now);
  if (t.week === wk) return t;
  const worthKeeping = !!t.week && (t.stars.some(s => s > 0) || t.names.some(n => n.trim() !== ''));
  const history = worthKeeping
    ? [...t.history.filter(h => h.week !== t.week), { week: t.week, stars: [...t.stars], names: [...t.names], notes: [...t.notes] }]
    : t.history;
  return { week: wk, stars: [0, 0, 0, 0, 0], names: t.names, notes: t.notes, history };
}

export const starSum = (stars: number[]): number => stars.reduce((a, b) => a + b, 0);
