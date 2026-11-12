/* Nátěry Opse v UI (0.11.0): název, podmínka odemčení a vzorník barev (sdílí Minihry a šatník). */
import type { Key } from '../i18n';
import type { TFn } from '../i18n/react';
import { OPS_PALETTE, paintById, type PaintRule } from '../core/paints';
import { QUIZ_LEN } from '../core/minigames';

export const paintName = (t: TFn, id: string): string => t(`games.paint.${id}` as Key);

export function ruleText(t: TFn, rule: PaintRule): string {
  switch (rule.kind) {
    case 'default': return t('games.rule.default');
    case 'played': return t('games.rule.played', { count: rule.rounds });
    case 'tetrisPct': return t('games.rule.tetrisPct', { pct: rule.pct });
    case 'quizScore': return t('games.rule.quizScore', { correct: rule.correct, total: QUIZ_LEN });
    case 'quizStreak': return t('games.rule.quizStreak', { count: rule.streak });
    case 'hackRounds': return t('games.rule.hackRounds', { count: rule.rounds });
    case 'hackPerfect': return t('games.rule.hackPerfect');
  }
}

/* Vzorník: plech, hrana, štít a meruňkový lem (lem se nemění nikdy). */
export function PaintSwatch({ id }: { id: string }) {
  const c = paintById(id)?.colors ?? {};
  const col = (k: 'panel' | 'steel' | 'tin' | 'rust') => c[k] ?? OPS_PALETTE[k];
  return (
    <span className="paint-swatch" aria-hidden="true" style={{ borderColor: OPS_PALETTE.apricot }}>
      <i style={{ background: col('panel') }} /><i style={{ background: col('steel') }} /><i style={{ background: col('tin') }} /><i style={{ background: col('rust') }} />
    </span>
  );
}
