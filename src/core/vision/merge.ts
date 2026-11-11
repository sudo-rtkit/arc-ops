/* Spojení více snímků stejného panelu (posunutý STASH). Řádky se porovnají podle podpisu: otisk, počet a tier
   každého políčka. Překryv mezi po sobě jdoucími snímky se započítá jen jednou. Pořadí snímků je pořadí vložení. */
import { similarity } from './fingerprint';
import { MATCH_SURE } from './match';
import type { PanelId } from './layout';
import type { CellRead, PanelRead } from './read';

/* null = prázdné (nebo neexistující) místo */
export type Slot = CellRead | null;
export interface MergedPanel {
  panel: PanelId; cols: number;
  rows: Slot[][];
  /* odkud je každý řádek výsledku: pořadí snímku a řádek v něm */
  source: { shot: number; row: number }[];
  /* překryv (počet řádků) každého dalšího snímku s předchozím výsledkem */
  overlaps: number[];
  warnings: 'noOverlap'[];
}

export function panelRows(p: PanelRead): Slot[][] {
  const rows: Slot[][] = Array.from({ length: p.grid.rows }, () => new Array<Slot>(p.grid.cols).fill(null));
  for (const c of p.cells) rows[c.row][c.col] = c;
  return rows;
}

export const sameCell = (a: Slot, b: Slot): boolean =>
  a === null || b === null ? a === b : a.count === b.count && a.tier === b.tier && similarity(a.fp, b.fp) >= MATCH_SURE;

export const rowsEqual = (a: Slot[], b: Slot[]): boolean => a.length === b.length && a.every((x, i) => sameCell(x, b[i]));

const hasItem = (rows: Slot[][]) => rows.some(r => r.some(Boolean));

export function mergePanels(panels: PanelRead[]): MergedPanel {
  const first = panels[0];
  const out: MergedPanel = { panel: first?.panel ?? 'stash', cols: first?.grid.cols ?? 0, rows: [], source: [], overlaps: [], warnings: [] };
  panels.forEach((p, shot) => {
    const rows = panelRows(p);
    if (shot === 0) { out.rows = rows; out.source = rows.map((_, row) => ({ shot, row })); return; }
    let k = Math.min(out.rows.length, rows.length);
    for (; k > 0; k--) {
      const tail = out.rows.slice(-k), head = rows.slice(0, k);
      /* Shoda jen prázdných řádků nic nedokazuje (kromě snímku, který je celý obsažený). */
      if (head.every((r, i) => rowsEqual(tail[i], r)) && (hasItem(head) || k === rows.length)) break;
    }
    if (k === 0 && hasItem(rows) && hasItem(out.rows)) out.warnings.push('noOverlap');
    out.overlaps.push(k);
    for (let row = k; row < rows.length; row++) { out.rows.push(rows[row]); out.source.push({ shot, row }); }
  });
  return out;
}

export const occupied = (m: MergedPanel): number => m.rows.reduce((a, r) => a + r.filter(Boolean).length, 0);
