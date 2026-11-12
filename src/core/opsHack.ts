/* Opsův hack (0.12.0): logická minihra „hackni terminál“. Mřížka obvodových dlaždic, každá má vodiče do některých
   stran (sever, východ, jih, západ). Otáčením dlaždic se zdroj napětí propojí se všemi výstupy tak, aby žádný vodič
   nevedl do prázdna. Kolo má tři uzly s rostoucí obtížností (4×4, 5×5, 6×6).
   Každý uzel vzniká ze seedovaného náhodného stromu přes všechna políčka: z nezamíchaného stromu je řešení, takže je
   každé kolo řešitelné z konstrukce (test to navíc ověřuje nezávislým řešičem). Zamíchání jen otočí dlaždice.
   Opsova norma (par) = nejmenší počet otočení k řešení, ze kterého uzel vznikl (otočení oběma směry). Čisté funkce. */
import { rng } from './minigames';
export { hackPct } from './minigames';

/* Směry jako bity: sever 1, východ 2, jih 4, západ 8. */
export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [N, E, S, W] as const;
const DX: Record<number, number> = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY: Record<number, number> = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
const OPP: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E };

/* Velikosti uzlů v kole (rostoucí obtížnost). */
export const HACK_SIZES: readonly (readonly [number, number])[] = [[4, 4], [5, 5], [6, 6]];
export const HACK_NODES = HACK_SIZES.length;

/* Otočení masky o k čtvrtotáček po směru hodinových ručiček (záporné k = proti směru). */
export function rotateMask(m: number, k: number): number {
  let r = m & 15;
  const t = ((k % 4) + 4) % 4;
  for (let i = 0; i < t; i++) r = ((r << 1) | (r >> 3)) & 15;
  return r;
}
export const degree = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

export type TileKind = 'source' | 'output' | 'wire';
export interface HackNode {
  cols: number; rows: number;
  /* masky vodičů v řešení (index = y * cols + x) */
  solution: number[];
  /* počáteční otočení každé dlaždice (0–3) proti řešení */
  start: number[];
  /* zdroj napětí a výstupy (listy stromu) */
  source: number;
  outputs: number[];
  /* Opsova norma: nejmenší počet otočení z počátku do řešení */
  par: number;
}
export interface HackRound { seed: number; nodes: HackNode[] }

export const kindOf = (n: HackNode, i: number): TileKind => (i === n.source ? 'source' : n.outputs.includes(i) ? 'output' : 'wire');
/* Aktuální maska dlaždice při otočení rot (počet čtvrtotáček po směru od řešení). */
export const maskAt = (n: HackNode, rot: readonly number[], i: number): number => rotateMask(n.solution[i], rot[i]);

/* Nejmenší počet otočení dlaždice z otočení r do polohy shodné s řešením (rovný vodič má dvě shodné polohy, kříž čtyři). */
export function tileSteps(mask: number, r: number): number {
  let best = 4;
  for (let k = 0; k < 4; k++) {
    if (rotateMask(mask, k) !== mask) continue;
    const d = (((k - r) % 4) + 4) % 4;
    best = Math.min(best, d, (4 - d) % 4);
  }
  return best;
}

/* Náhodný strom přes všechna políčka (randomizovaný Prim z prostředního políčka). Omezení stupně 3 drží dlaždice čitelné. */
function makeNode(cols: number, rows: number, r: () => number): HackNode {
  const n = cols * rows;
  const source = Math.floor(rows / 2) * cols + Math.floor(cols / 2) - (cols % 2 === 0 ? 1 : 0);
  const mask = new Array<number>(n).fill(0);
  const inTree = new Uint8Array(n);
  inTree[source] = 1;
  let frontier: [number, number][] = [];
  const addEdges = (i: number) => {
    const x = i % cols, y = Math.floor(i / cols);
    for (const d of DIRS) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (!inTree[j]) frontier.push([i, d]);
    }
  };
  addEdges(source);
  let count = 1;
  const target = ([a, b]: [number, number]) => (Math.floor(a / cols) + DY[b]) * cols + (a % cols) + DX[b];
  let guard = 0;
  while (count < n && frontier.length && guard++ < 100000) {
    const k = Math.floor(r() * frontier.length);
    const [i, d] = frontier[k];
    /* stupeň nejvýš 3 (žádné kříže), dokud existuje jiná cesta; hrana zůstává ve frontě, takže strom vždy pokryje vše */
    if (degree(mask[i]) >= 3 && frontier.some(e => degree(mask[e[0]]) < 3)) continue;
    frontier.splice(k, 1);
    const j = target([i, d]);
    if (inTree[j]) continue;
    mask[i] |= d; mask[j] |= OPP[d];
    inTree[j] = 1; count++;
    addEdges(j);
    frontier = frontier.filter(e => !inTree[target(e)]);
  }
  const outputs = mask.map((m, i) => (i !== source && degree(m) === 1 ? i : -1)).filter(i => i >= 0);
  /* zamíchání: každá dlaždice s nesouměrným tvarem se otočí; uzel nesmí začínat vyřešený */
  const start = mask.map(m => (rotateMask(m, 1) === m ? 0 : Math.floor(r() * 4)));
  const node: HackNode = { cols, rows, solution: mask, start, source, outputs, par: 0 };
  guard = 0;
  while ((isSolved(node, start) || start.filter((k, i) => tileSteps(mask[i], k) > 0).length < Math.ceil(n * 0.5)) && guard++ < 50) {
    const i = Math.floor(r() * n);
    if (rotateMask(mask[i], 1) !== mask[i]) start[i] = (start[i] + 1 + Math.floor(r() * 3)) % 4;
  }
  node.par = start.reduce((s, k, i) => s + tileSteps(mask[i], k), 0);
  return node;
}

/* Kolo podle čísla: stejné číslo = stejné uzly. */
export function makeHack(seed: number): HackRound {
  const r = rng(seed * 7919 + 17);
  return { seed, nodes: HACK_SIZES.map(([c, rr]) => makeNode(c, rr, r)) };
}

/* Napájená políčka: od zdroje přes vodiče, které na sebe navazují z obou stran. */
export function powered(n: HackNode, rot: readonly number[]): Set<number> {
  const on = new Set<number>([n.source]);
  const stack = [n.source];
  while (stack.length) {
    const i = stack.pop()!;
    const m = maskAt(n, rot, i), x = i % n.cols, y = Math.floor(i / n.cols);
    for (const d of DIRS) {
      if (!(m & d)) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= n.cols || ny >= n.rows) continue;
      const j = ny * n.cols + nx;
      if (on.has(j) || !(maskAt(n, rot, j) & OPP[d])) continue;
      on.add(j); stack.push(j);
    }
  }
  return on;
}

/* Vodiče, které vedou do prázdna (mimo mřížku nebo k dlaždici bez protějšího vodiče). */
export function leaks(n: HackNode, rot: readonly number[]): number {
  let out = 0;
  for (let i = 0; i < n.solution.length; i++) {
    const m = maskAt(n, rot, i), x = i % n.cols, y = Math.floor(i / n.cols);
    for (const d of DIRS) {
      if (!(m & d)) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= n.cols || ny >= n.rows || !(maskAt(n, rot, ny * n.cols + nx) & OPP[d])) out++;
    }
  }
  return out;
}

/* Vyřešeno: napájená jsou všechna políčka (tedy všechny výstupy) a žádný vodič nevede do prázdna. Platí každé
   takové otočení, nejen to, ze kterého uzel vznikl. */
export const isSolved = (n: HackNode, rot: readonly number[]): boolean => leaks(n, rot) === 0 && powered(n, rot).size === n.solution.length;

/* Otočení dlaždice o krok (1 = po směru, -1 = proti). Zdroj se otáčí taky (patří do hádanky). */
export function rotateAt(rot: readonly number[], i: number, dir: 1 | -1): number[] {
  const next = [...rot];
  next[i] = (((next[i] + dir) % 4) + 4) % 4;
  return next;
}


/* Směry masky jako seznam (pro popis dlaždice čtečce obrazovky). */
export const dirsOf = (m: number): ('n' | 'e' | 's' | 'w')[] => (['n', 'e', 's', 'w'] as const).filter((_, k) => m & (1 << k));
