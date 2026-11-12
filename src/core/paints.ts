/* Nátěry Opse (0.11.0): čistě kosmetické přebarvení existujících spritů Bedňáka 2.0 v kódu (žádné nové obrázky).
   Mění se jen šedé plechy těla (graphite … tin) a hnědé díly (štít na hrudi, batoh, měď). Meruňkový vnější lem
   a oči (apricot, light), tmavé oddělení (ink), krémové odlesky a signální barvy zůstávají, takže 96px Ops v rohu
   je pořád stejně čitelný. Přebarvuje se přesná shoda RGB, alfa zůstává 0/255: pixely zůstanou ostré.
   Odemykají se milníky miniher; výchozí je původní vzhled. Čisté funkce bez DOM. */
import type { GamesState } from './types';

/* Paleta spritů (docs/design/buddy/bednak2/tools/build.py, P). */
export const OPS_PALETTE = {
  ink: '#101214', graphite: '#141719', panel: '#1D2225', dark: '#272D31', seam: '#363E43', steel: '#596267', slate: '#738084',
  tin: '#A2A8AA', cream: '#F2EEE7', bone: '#D8D0BC', apricot: '#F4AD82', light: '#FFC69F', copper: '#DE966F', rust: '#B78060',
  umber: '#795842', cloth: '#585D50', clothLight: '#81856B', green: '#91CFAB', amber: '#E6C66D', danger: '#F09B9E',
} as const;
export type PaletteName = keyof typeof OPS_PALETTE;

/* Barvy, které nátěr nikdy nemění (čitelnost: lem, oči, oddělení, odlesky a signální barvy). */
export const PAINT_KEEP: readonly PaletteName[] = ['ink', 'apricot', 'light', 'cream', 'bone', 'green', 'amber', 'danger'];
/* Barvy, které nátěr smí měnit. */
export const PAINT_SWAP = ['graphite', 'panel', 'dark', 'seam', 'steel', 'slate', 'tin', 'copper', 'rust', 'umber', 'cloth', 'clothLight'] as const;
type SwapName = typeof PAINT_SWAP[number];

/* Milník, který nátěr odemkne (vyhodnocuje se po každém dohraném kole). */
export type PaintRule =
  | { kind: 'default' }
  | { kind: 'played'; rounds: number }
  | { kind: 'tetrisPct'; pct: number }
  | { kind: 'quizScore'; correct: number }
  | { kind: 'quizStreak'; streak: number };

export interface PaintSpec { id: string; rule: PaintRule; colors: Partial<Record<SwapName, string>> }

export const DEFAULT_PAINT = 'original';
export const PAINTS: PaintSpec[] = [
  { id: DEFAULT_PAINT, rule: { kind: 'default' }, colors: {} },
  { /* Polní oliva: první dohraná minihra */
    id: 'olive', rule: { kind: 'played', rounds: 1 },
    colors: { graphite: '#151A12', panel: '#1E2619', dark: '#28331F', seam: '#38452B', steel: '#56663E', slate: '#6F8050', tin: '#9DAA7C', copper: '#C9B27A', rust: '#9C8A5A', umber: '#5E5236', cloth: '#4A4E3A', clothLight: '#6E7352' },
  },
  { /* Rezavá bedna: Stash Tetris aspoň na 90 % Opsova balení */
    id: 'rust', rule: { kind: 'tetrisPct', pct: 90 },
    colors: { graphite: '#1C1512', panel: '#2A1E18', dark: '#3A291F', seam: '#4D3527', steel: '#7A4F36', slate: '#956446', tin: '#BC8C69', copper: '#8FA3A3', rust: '#6D8484', umber: '#455757', cloth: '#5A4A3C', clothLight: '#7E6A55' },
  },
  { /* Arktická: recyklační kvíz aspoň 8 z 10 */
    id: 'arctic', rule: { kind: 'quizScore', correct: 8 },
    colors: { graphite: '#2A3138', panel: '#3B4650', dark: '#4E5B67', seam: '#66747F', steel: '#8E9BA5', slate: '#AEB9C1', tin: '#D7DEE2', copper: '#7FA7C4', rust: '#5F87A6', umber: '#3F5D75', cloth: '#5C6870', clothLight: '#7F8C94' },
  },
  { /* Noční hlídka: 10 správných odpovědí v kvízu za sebou */
    id: 'night', rule: { kind: 'quizStreak', streak: 10 },
    colors: { graphite: '#0F1424', panel: '#161D33', dark: '#1F2944', seam: '#2B3858', steel: '#3F5482', slate: '#566C9C', tin: '#8597C0', copper: '#C79A4E', rust: '#A27C3C', umber: '#6B5330', cloth: '#3A3F55', clothLight: '#585E7A' },
  },
  { /* Pouštní: 10 dohraných kol */
    id: 'desert', rule: { kind: 'played', rounds: 10 },
    colors: { graphite: '#211C14', panel: '#30281C', dark: '#433826', seam: '#594A32', steel: '#8A7652', slate: '#A58F66', tin: '#CDBB92', copper: '#B5674A', rust: '#94523A', umber: '#663A2A', cloth: '#6B5E45', clothLight: '#8F7F5C' },
  },
  { /* Zlacený: Stash Tetris aspoň stejně dobře jako Ops (100 %) */
    id: 'gold', rule: { kind: 'tetrisPct', pct: 100 },
    colors: { graphite: '#1E1709', panel: '#2E230C', dark: '#433210', seam: '#5C4516', steel: '#8F6B1F', slate: '#B38A2C', tin: '#DDBA5A', copper: '#5E6E78', rust: '#45535C', umber: '#2E393F', cloth: '#4F4A3A', clothLight: '#6F684F' },
  },
];
export const PAINT_IDS: string[] = PAINTS.map(p => p.id);
export const paintById = (id: string): PaintSpec | undefined => PAINTS.find(p => p.id === id);
export const isPaint = (id: unknown): id is string => typeof id === 'string' && PAINT_IDS.includes(id);

/* Nátěr k vykreslení: neznámý nebo prázdný = původní. */
export const paintOf = (id: string | undefined | null): string => (id && isPaint(id) ? id : DEFAULT_PAINT);

const rgb = (hex: string): number => parseInt(hex.slice(1), 16);
/* Mapa přebarvení: RGB (24 bitů) → [r, g, b]. Prázdná pro původní vzhled. */
const MAPS = new Map<string, Map<number, [number, number, number]>>();
export function paintMap(id: string): Map<number, [number, number, number]> {
  const key = paintOf(id);
  let m = MAPS.get(key);
  if (!m) {
    m = new Map();
    for (const [name, hex] of Object.entries(paintById(key)?.colors ?? {})) {
      const to = rgb(hex as string);
      m.set(rgb(OPS_PALETTE[name as SwapName]), [(to >> 16) & 255, (to >> 8) & 255, to & 255]);
    }
    MAPS.set(key, m);
  }
  return m;
}

/* Přebarví RGBA pixely na místě (přesná shoda barvy, alfa beze změny). Vrací počet změněných pixelů. */
export function recolorPixels(data: Uint8ClampedArray | Uint8Array, id: string): number {
  const m = paintMap(id);
  if (!m.size) return 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const to = m.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (!to) continue;
    data[i] = to[0]; data[i + 1] = to[1]; data[i + 2] = to[2];
    n++;
  }
  return n;
}

/* Splňuje stav miniher pravidlo nátěru? */
export function ruleMet(rule: PaintRule, g: GamesState): boolean {
  switch (rule.kind) {
    case 'default': return true;
    case 'played': return g.tetris.played + g.quiz.played >= rule.rounds;
    case 'tetrisPct': return g.tetris.bestPct >= rule.pct;
    case 'quizScore': return g.quiz.best >= rule.correct;
    case 'quizStreak': return g.quiz.bestStreak >= rule.streak;
  }
}

/* Nátěry, které stav nově odemyká (v pořadí PAINTS, bez výchozího a bez už odemčených). */
export const newlyUnlocked = (g: GamesState): string[] =>
  PAINTS.filter(p => p.rule.kind !== 'default' && !g.paints.includes(p.id) && ruleMet(p.rule, g)).map(p => p.id);
