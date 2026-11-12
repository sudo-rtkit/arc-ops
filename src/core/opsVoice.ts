/* Hlas Opse (0.10.0): výběr hlášky podle povahy a jazyka, střídání variant bez okamžitého opakování a gesto,
   které se k hlášce hodí (povaha mění text a případně gesto, nikdy identitu robota). Čisté funkce bez DOM. */
import { OPS_LINES, type LineKey } from '../i18n/opsLines';
import { interpolate, plural, type Lang, type Params } from '../i18n';
import type { OpsPersonality } from './types';
import type { OpsAnim } from './ops';
import type { CompactUpgrade } from './compact';

export type { LineKey } from '../i18n/opsLines';
/* Hláška pro pozdější výběr varianty v okně, které ji ukáže (každé okno zná povahu a jazyk). */
export interface LineRef { line: LineKey; params?: Params }
export const line = (key: LineKey, params?: Params): LineRef => (params ? { line: key, params } : { line: key });

/* Paměť střídání: poslední zobrazená varianta pro klíč + povahu. */
export type LineMemo = Map<string, number>;
export const createMemo = (): LineMemo => new Map();

/* Index další varianty: poprvé vždy první (předvídatelné, testovatelné), pak náhodně jiná než minule. */
export function nextIndex(count: number, last: number | undefined, rnd: () => number = Math.random): number {
  if (count <= 1) return 0;
  if (last === undefined) return 0;
  const k = Math.floor(rnd() * (count - 1)) % (count - 1);
  return k >= last ? k + 1 : k;
}

/* Text hlášky. memo = paměť střídání okna (bez ní vždy první varianta). */
export function sayLine(ref: LineRef, mode: OpsPersonality, lang: Lang, memo?: LineMemo, rnd?: () => number): string {
  const variants = OPS_LINES[lang][ref.line]?.[mode] ?? OPS_LINES.cs[ref.line]?.[mode];
  if (!variants?.length) return ref.line;
  const id = `${ref.line}:${mode}`;
  const i = memo ? nextIndex(variants.length, memo.get(id), rnd) : 0;
  memo?.set(id, i);
  const m = variants[i];
  const s = typeof m === 'string' ? m : plural(lang, Number(ref.params?.count ?? 0), m);
  return interpolate(lang, s, ref.params);
}

/* Gesto k hlášce podle povahy (bez záznamu = jen řeč). */
const GESTURE: Partial<Record<LineKey, Partial<Record<OpsPersonality, OpsAnim>> & { all?: OpsAnim }>> = {
  'scan.nothing': { all: 'shrug' },
  'scan.otherScreen': { all: 'shrug', cheeky: 'annoyed' },
  'scan.check': { all: 'thinking' },
  'scan.failed': { all: 'error' },
  'scan.written': { all: 'success' },
  'loot.found': { all: 'inspect' },
  'loot.empty': { all: 'shrug', cheeky: 'laugh' },
  'loot.dup': { all: 'shrug', friendly: 'shrug', cheeky: 'annoyed' },
  'loot.written': { all: 'success' },
  'greet': { all: 'greet' },
  'poke': { plain: 'shrug', friendly: 'laugh', cheeky: 'annoyed' },
  'hint.ready': { all: 'success', plain: 'talk' },
  'hint.idle': { cheeky: 'laugh' },
  'hint.fresh': { cheeky: 'shrug' },
  'tut.end': { all: 'success' },
  'tut.welcome': { all: 'greet' },
  'game.win': { all: 'success' },
  'game.record': { all: 'success', cheeky: 'laugh' },
  'game.unlock': { all: 'success' },
  'game.done': { plain: 'talk', friendly: 'shrug', cheeky: 'laugh' },
  'hint.minigame': { cheeky: 'laugh' },
  'game.hackStart': { all: 'thinking', cheeky: 'laugh' },
  'game.hackNode': { all: 'success' },
  'raid.start': { all: 'success', cheeky: 'laugh' },
  'raid.startEmpty': { all: 'talk', cheeky: 'shrug' },
  'raid.eval.all': { all: 'success', cheeky: 'laugh' },
  'raid.eval.partial': { all: 'talk' },
  'raid.eval.none': { all: 'shrug' },
  'raid.eval.upgrade': { all: 'success' },
};
export function lineGesture(key: LineKey, mode: OpsPersonality): OpsAnim | null {
  const g = GESTURE[key];
  return g ? g[mode] ?? g.all ?? null : null;
}

/* Rada k dalšímu vylepšení (kompaktní okno, overlay): chybějící materiály, hotové vylepšení, nebo nic. */
export function upgradeHint(up: CompactUpgrade | null, fresh: boolean): LineRef {
  if (fresh) return line('hint.fresh');
  if (!up) return line('hint.idle');
  const station = up.station.name, level = up.level;
  if (up.missing <= 0) return up.block ? line('hint.idle') : line('hint.ready', { station, level });
  const mats = up.mats.filter(m => m.missing > 0).slice(0, 3).map(m => `${m.missing}× ${m.mat}`).join(', ');
  return line('hint.missing', { mats, station, level, count: up.missing });
}

/* 0.11.0: když nic nechybí, smí Ops mimo raid nabídnout minihru, ale jen v okně, se kterým hráč právě pracuje
   (hlavní okno s fokusem, otevřený overlay) a se zapnutými dialogy. Nad hrou nikdy nic nenabízí. */
export const withMinigameHint = (ref: LineRef, allowed: boolean): LineRef => (allowed && ref.line === 'hint.idle' ? line('hint.minigame') : ref);

/* Jak dlouho bublina zůstane: podle délky textu, 3,5–9 s. */
export const bubbleMs = (text: string): number => Math.min(9000, Math.max(3500, 1800 + text.length * 55));
