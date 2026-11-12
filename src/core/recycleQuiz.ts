/* Recyklační kvíz (0.11.0): otázky generované z dat aplikace, jen takové, jejichž odpověď je v datech jistá.
   - recyklace: na co se předmět recykluje (výstupy recyklace z itemdata.ts; nabídnuté jiné sady se liší),
   - stanice: která úroveň stanice potřebuje materiál (jen materiál, který chce právě jedna úroveň jedné stanice;
     vestavěné recepty z data/stations.ts, ne ruční úpravy),
   - úkol: který úkol chce předmět odevzdat (jen předmět, který chce odevzdat právě jeden úkol, data ARC Tracker),
   - hodnota: který ze dvou předmětů má vyšší prodejní hodnotu (rozdíl aspoň 20 %).
   Každá otázka nese vysvětlení. Kolo je dané číslem (seed) a jazykem. Čisté funkce bez DOM. */
import { ITEM_DATA, type ItemDataRow } from './data/itemdata';
import { STATIONS } from './data/stations';
import { AT_QUESTS, type Qty } from './data/arctracker';
import { questName } from './quests';
import { QUIZ_LEN, rng, shuffle } from './minigames';
import type { Key, Lang } from '../i18n';

export type QuizKind = 'recycle' | 'station' | 'quest' | 'value';
export interface Msg { key: Key; params: Record<string, string | number> }
export interface QuizOption { id: string; label: string }
export interface QuizQuestion { kind: QuizKind; prompt: Msg; options: QuizOption[]; answer: string; explain: Msg }
export interface QuizRound { seed: number; questions: QuizQuestion[] }

const OPTION_IDS = ['a', 'b', 'c', 'd'];
export const qtyText = (list: Qty[]): string => list.map(([n, q]) => `${q}× ${n}`).join(', ');

/* ----- zdroje otázek (spočítají se jednou) ----- */
interface Pools {
  recycle: ItemDataRow[];
  /* materiál → jediná úroveň stanice, která ho chce */
  station: { item: string; qty: number; station: string; level: number }[];
  stationLevels: { station: string; level: number }[];
  quest: { item: string; qty: number; quest: string }[];
  value: ItemDataRow[];
}
let POOLS: Pools | null = null;
export function quizPools(): Pools {
  if (POOLS) return POOLS;
  const seen = new Set<string>();
  const unique = ITEM_DATA.filter(r => !seen.has(r.n) && !!seen.add(r.n));
  const recycle = unique.filter(r => r.r?.length && r.ty !== 'Blueprint');
  const value = unique.filter(r => r.v && r.v > 0 && r.ra && !['Blueprint', 'Key', 'Research'].includes(r.ty) && !/^Amplified\s/.test(r.n));

  const byItem = new Map<string, { station: string; level: number; qty: number }[]>();
  const stationLevels: { station: string; level: number }[] = [];
  for (const st of STATIONS) {
    for (const [lv, mats] of Object.entries(st.levels)) {
      stationLevels.push({ station: st.name, level: Number(lv) });
      for (const [m, q] of mats) byItem.set(m, [...(byItem.get(m) ?? []), { station: st.name, level: Number(lv), qty: q }]);
    }
  }
  const station = [...byItem.entries()].filter(([, l]) => l.length === 1).map(([item, [x]]) => ({ item, ...x }));

  const byQuest = new Map<string, { quest: string; qty: number }[]>();
  for (const q of AT_QUESTS) for (const [m, n] of q.deliver) byQuest.set(m, [...(byQuest.get(m) ?? []), { quest: q.id, qty: n }]);
  const quest = [...byQuest.entries()].filter(([, l]) => l.length === 1).map(([item, [x]]) => ({ item, ...x }));

  POOLS = { recycle, station, stationLevels, quest, value };
  return POOLS;
}

const KINDS: QuizKind[] = ['recycle', 'value', 'station', 'quest', 'recycle', 'value', 'station', 'quest', 'recycle', 'value'];

function withOptions(r: () => number, correct: string, wrong: string[]): { options: QuizOption[]; answer: string } {
  const labels = shuffle([correct, ...wrong], r);
  const options = labels.map((label, i) => ({ id: OPTION_IDS[i], label }));
  return { options, answer: options.find(o => o.label === correct)!.id };
}
/* n různých prvků z pole (podle klíče), které nejsou vyloučené */
function pickDistinct<T>(list: readonly T[], n: number, r: () => number, key: (x: T) => string, exclude: Set<string>): T[] {
  const out: T[] = [];
  const used = new Set(exclude);
  for (const x of shuffle(list, r)) {
    const k = key(x);
    if (used.has(k)) continue;
    used.add(k); out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

export function makeQuiz(seed: number, lang: Lang): QuizRound {
  const r = rng(seed);
  const P = quizPools();
  const usedItems = new Set<string>();
  const questions: QuizQuestion[] = [];
  const qName = (id: string) => { const q = AT_QUESTS.find(x => x.id === id)!; return questName(q, lang); };
  const questTrader = (id: string) => AT_QUESTS.find(x => x.id === id)!.trader;

  for (const kind of shuffle(KINDS, r).slice(0, QUIZ_LEN)) {
    if (kind === 'recycle') {
      const [it] = pickDistinct(P.recycle, 1, r, x => x.n, usedItems);
      if (!it) continue;
      usedItems.add(it.n);
      const correct = qtyText(it.r!);
      const wrong = pickDistinct(P.recycle, 3, r, x => qtyText(x.r!), new Set([correct])).map(x => qtyText(x.r!));
      questions.push({ kind, prompt: { key: 'games.quiz.q.recycle', params: { item: it.n } }, ...withOptions(r, correct, wrong),
        explain: { key: 'games.quiz.e.recycle', params: { item: it.n, out: correct } } });
    } else if (kind === 'station') {
      const [x] = pickDistinct(P.station, 1, r, s => s.item, usedItems);
      if (!x) continue;
      usedItems.add(x.item);
      const label = (s: { station: string; level: number }) => `${s.station} ${s.level}`;
      const correct = label(x);
      const wrong = pickDistinct(P.stationLevels, 3, r, label, new Set([correct])).map(label);
      questions.push({ kind, prompt: { key: 'games.quiz.q.station', params: { item: x.item, qty: x.qty } }, ...withOptions(r, correct, wrong),
        explain: { key: 'games.quiz.e.station', params: { item: x.item, qty: x.qty, station: x.station, level: x.level } } });
    } else if (kind === 'quest') {
      const [x] = pickDistinct(P.quest, 1, r, s => s.item, usedItems);
      if (!x) continue;
      usedItems.add(x.item);
      const correct = qName(x.quest);
      /* jiné úkoly, které tento předmět neodevzdávají (předmět chce jen jeden úkol) a mají jiný název */
      const others = AT_QUESTS.filter(q => q.id !== x.quest);
      const wrong = pickDistinct(others, 3, r, q => questName(q, lang), new Set([correct])).map(q => questName(q, lang));
      questions.push({ kind, prompt: { key: 'games.quiz.q.quest', params: { item: x.item } }, ...withOptions(r, correct, wrong),
        explain: { key: 'games.quiz.e.quest', params: { item: x.item, qty: x.qty, quest: correct, trader: questTrader(x.quest) } } });
    } else {
      const [a] = pickDistinct(P.value, 1, r, x => x.n, usedItems);
      if (!a) continue;
      const b = shuffle(P.value, r).find(x => x.n !== a.n && !usedItems.has(x.n) && Math.abs(x.v! - a.v!) >= 0.2 * Math.max(x.v!, a.v!));
      if (!b) continue;
      usedItems.add(a.n); usedItems.add(b.n);
      const hi = a.v! > b.v! ? a : b, lo = hi === a ? b : a;
      questions.push({ kind, prompt: { key: 'games.quiz.q.value', params: {} }, ...withOptions(r, hi.n, [lo.n]),
        explain: { key: 'games.quiz.e.value', params: { hi: hi.n, hiValue: hi.v!, lo: lo.n, loValue: lo.v! } } });
    }
  }
  return { seed, questions };
}
