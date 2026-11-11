/* Spojení více snímků stejného panelu (posunutý STASH). Řádky se porovnají podle podpisu: otisk, počet a tier
   každého políčka. Překryv mezi po sobě jdoucími snímky se započítá jen jednou. Pořadí snímků je pořadí vložení.
   Hráč často posouvá tak, že sousední snímky nemají žádný společný celý řádek: poslední celý řádek snímku N je na
   snímku N+1 jen useknutý nahoře (a první celý řádek N+1 je na snímku N useknutý dole). Navázání se pak potvrdí
   porovnáním viditelné části useknutého řádku (podpisy jasu), úplnost pak kontrolní součet s hlavičkou. */
import { similarity } from './fingerprint';
import { MATCH_SURE } from './match';
import { sigDiff } from './cells';
import type { PanelId } from './layout';
import type { CellRead, PanelRead, PartialRow } from './read';

/* Místo zakryté tooltipem: nečte se, při porovnání řádků se shoduje s čímkoli. */
export const HIDDEN = 'hidden' as const;
/* null = prázdné (nebo neexistující) místo */
export type Slot = CellRead | null | typeof HIDDEN;
export const isCell = (s: Slot): s is CellRead => s !== null && s !== HIDDEN;

export type Link = 'overlap' | 'partial' | 'none';
export interface MergedPanel {
  panel: PanelId; cols: number;
  rows: Slot[][];
  /* odkud je každý řádek výsledku: pořadí snímku a řádek v něm */
  source: { shot: number; row: number }[];
  /* překryv (počet řádků) každého dalšího snímku s předchozím výsledkem */
  overlaps: number[];
  /* jak se každý další snímek navázal: společné celé řádky, useknutý řádek, nebo vůbec */
  links: Link[];
  warnings: 'noOverlap'[];
}

export function panelRows(p: PanelRead): Slot[][] {
  const rows: Slot[][] = Array.from({ length: p.grid.rows }, () => new Array<Slot>(p.grid.cols).fill(null));
  for (const c of p.cells) rows[c.row][c.col] = c;
  for (const h of p.hidden) rows[h.row][h.col] = HIDDEN;
  return rows;
}

export const sameCell = (a: Slot, b: Slot): boolean => {
  if (a === HIDDEN || b === HIDDEN) return true;
  return a === null || b === null ? a === b : a.count === b.count && a.tier === b.tier && similarity(a.fp, b.fp) >= MATCH_SURE;
};

export const rowsEqual = (a: Slot[], b: Slot[]): boolean => a.length === b.length && a.every((x, i) => sameCell(x, b[i]));

const hasItem = (rows: Slot[][]) => rows.some(r => r.some(isCell));

/* Prahy porovnání useknutého řádku: průměrný rozdíl jasu v pásu a nejmenší rozptyl jasu (prázdný řádek nic
   nedokazuje). Jeden sloupec se smí lišit (zvýraznění pod kurzorem). */
const PARTIAL_DIFF = 5;
const PARTIAL_SPREAD = 60;

export type PartialMatch = 'match' | 'mismatch' | 'unknown';
export function partialMatch(part: PartialRow | null, row: number[][] | undefined): PartialMatch {
  if (!part || !row) return 'unknown';
  let compared = 0, ok = 0, textured = 0;
  for (let c = 0; c < part.sigs.length; c++) {
    const a = part.sigs[c], b = row[c];
    if (!a?.length || !b?.length) continue;
    const d = sigDiff(a, b);
    if (!d || d.bands < 2) continue;
    compared++;
    if (d.diff <= PARTIAL_DIFF) { ok++; if (d.spread >= PARTIAL_SPREAD) textured++; }
  }
  if (compared < 2 || !textured) return compared >= 2 && ok < compared - 1 ? 'mismatch' : 'unknown';
  return ok >= compared - 1 && ok >= 2 ? 'match' : 'mismatch';
}

export function mergePanels(panels: PanelRead[]): MergedPanel {
  const first = panels[0];
  const out: MergedPanel = { panel: first?.panel ?? 'stash', cols: first?.grid.cols ?? 0, rows: [], source: [], overlaps: [], links: [], warnings: [] };
  let sigs: number[][][] = [];
  let lastBottom: PartialRow | null = null;
  panels.forEach((p, shot) => {
    const rows = panelRows(p);
    if (shot === 0) {
      out.rows = rows; out.source = rows.map((_, row) => ({ shot, row })); sigs = rows.map((_, r) => p.sigs[r] ?? []);
      lastBottom = p.partialBottom; return;
    }
    const n = out.rows.length;
    let k = Math.min(n, rows.length);
    for (; k > 0; k--) {
      const tail = out.rows.slice(-k), head = rows.slice(0, k);
      /* Shoda jen prázdných řádků nic nedokazuje (kromě snímku, který je celý obsažený). */
      if (!head.every((r, i) => rowsEqual(tail[i], r)) || !(hasItem(head) || k === rows.length)) continue;
      /* Useknutý řádek nad mřížkou musí sedět na řádek nad překryvem (jinak jde o náhodnou shodu, např. munice ×100). */
      if (n - k - 1 >= 0 && partialMatch(p.partialTop, sigs[n - k - 1]) === 'mismatch') continue;
      break;
    }
    let link: Link = k > 0 ? 'overlap' : 'none';
    if (k === 0 && (partialMatch(p.partialTop, sigs[n - 1]) === 'match' || partialMatch(lastBottom, p.sigs[0]) === 'match')) link = 'partial';
    if (link === 'none' && hasItem(rows) && hasItem(out.rows)) out.warnings.push('noOverlap');
    out.overlaps.push(k);
    out.links.push(link);
    /* Zakrytá místa v překryvu doplní nový snímek. */
    for (let i = 0; i < k; i++) {
      const oi = n - k + i;
      rows[i].forEach((s, c) => { if (out.rows[oi][c] === HIDDEN && s !== HIDDEN) { out.rows[oi][c] = s; sigs[oi][c] = p.sigs[i]?.[c] ?? []; } });
    }
    for (let row = k; row < rows.length; row++) { out.rows.push(rows[row]); out.source.push({ shot, row }); sigs.push(p.sigs[row] ?? []); }
    if (rows.length > k) lastBottom = p.partialBottom;
  });
  return out;
}

export const occupied = (m: MergedPanel): number => m.rows.reduce((a, r) => a + r.filter(isCell).length, 0);
export const hiddenCount = (m: MergedPanel): number => m.rows.reduce((a, r) => a + r.filter(s => s === HIDDEN).length, 0);
