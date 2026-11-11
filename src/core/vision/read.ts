/* Vstupní bod rozpoznávání: readScreenshot(img) přečte jeden snímek obrazovky INVENTORY. Výsledek obsahuje jen
   čísla (polohy, počty, otisky), ne obrazová data, takže se snímek po přečtení může zahodít. */
import { lumMap, type RgbaImage } from './image';
import { detectLayout, type Box, type Grid, type PanelGrid, type PanelId } from './layout';
import { brightShare, categoryArea, countArea, gridCells, iconArea, tierArea } from './cells';
import { isCream, isGold, maskOf, numberTokens, parseGrouped, readCount, readTier, type Tier } from './digits';
import { fingerprint } from './fingerprint';
import { readRarity, type Rarity } from './rarity';
import { coinsArea, panelLabelArea, stashHeaderArea } from './regions';

export type VisionWarning =
  | 'noInventory'        /* na snímku není mřížka inventory */
  | 'noStash'            /* mřížka je, ale chybí STASH (jen batoh) */
  | 'headerUnreadable'   /* nepřečtený počet míst v hlavičce STASH */
  | 'countUnreadable'    /* aspoň jeden nečitelný počet */
  | 'scaleOdd';          /* neobvyklé měřítko (mimo 16:9 nebo jiné UI) */

export interface CellRead {
  row: number; col: number; box: Box;
  rarity: Rarity;
  /* null = bez počtu (zbraně, štíty) nebo nečitelné (pak countText obsahuje přečtené znaky) */
  count: number | null; countConf: number; countText: string;
  tier: Tier | null;
  fp: number[];
  /* hrubý otisk ikony kategorie vlevo dole (pomocný signál) */
  cat: number[];
}

export interface PanelRead {
  panel: PanelId; grid: Grid;
  /* obsazená políčka */
  cells: CellRead[];
  /* prázdná místa (řádek, sloupec) – pro spojování snímků */
  empty: { row: number; col: number }[];
  slots: number | null; slotsMax: number | null;
}

export interface ScreenRead {
  width: number; height: number; cellPx: number; ui: number;
  panel: PanelId | null;
  headerSlots: number | null; headerSlotsMax: number | null; stashValue: number | null;
  coins: number | null; premium: number | null;
  cells: CellRead[];
  panels: PanelRead[];
  warnings: VisionWarning[];
}

export interface ReadContext { panels?: PanelId[] }

/* Hrubá mapa ikony kategorie 6×6 (podíl krémových pixelů). */
function categoryMap(img: RgbaImage, area: Box): number[] {
  const { mask, w, h } = maskOf(img, area, isCream);
  const out: number[] = [];
  for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 6; gx++) {
    let on = 0, n = 0;
    for (let y = Math.floor((gy * h) / 6); y < Math.floor(((gy + 1) * h) / 6); y++)
      for (let x = Math.floor((gx * w) / 6); x < Math.floor(((gx + 1) * w) / 6); x++) { n++; on += mask[y * w + x]; }
    out.push(n ? Math.round((on / n) * 9) : 0);
  }
  return out;
}

function readPanel(img: RgbaImage, g: PanelGrid): PanelRead {
  const cells: CellRead[] = [], empty: { row: number; col: number }[] = [];
  for (const gc of gridCells(g)) {
    const b = gc.box;
    const cnt = readCount(img, countArea(b));
    const tier = cnt ? null : readTier(img, tierArea(b));
    const rar = readRarity(img, b);
    const bright = brightShare(img, iconArea(b));
    const colored = rar.rarity !== 'common' && rar.rarity !== 'unknown';
    const occupied = !!cnt || !!tier || colored || bright > 0.04;
    if (!occupied) { if (gc.framed) empty.push({ row: gc.row, col: gc.col }); continue; }
    cells.push({
      row: gc.row, col: gc.col, box: b, rarity: rar.rarity,
      count: cnt?.count ?? null, countConf: cnt?.conf ?? 1, countText: cnt?.text ?? '',
      tier, fp: fingerprint(img, iconArea(b), rar.rgb), cat: categoryMap(img, categoryArea(b)),
    });
  }
  let slots: number | null = null, slotsMax: number | null = null;
  if (g.panel !== 'stash') {
    const tok = numberTokens(img, panelLabelArea(g), isCream).find(t => /^\d+\/\d+$/.test(t.text));
    if (tok) [slots, slotsMax] = tok.text.split('/').map(Number);
  }
  return { panel: g.panel, grid: g, cells, empty, slots, slotsMax };
}

export function readScreenshot(img: RgbaImage, ctx: ReadContext = {}): ScreenRead {
  const base: ScreenRead = {
    width: img.width, height: img.height, cellPx: 0, ui: 0, panel: null,
    headerSlots: null, headerSlotsMax: null, stashValue: null, coins: null, premium: null, cells: [], panels: [], warnings: [],
  };
  const layout = detectLayout(img, lumMap(img));
  if (!layout) return { ...base, warnings: ['noInventory'] };
  const panels = layout.panels.filter(p => !ctx.panels || ctx.panels.includes(p.panel)).map(p => readPanel(img, p));
  const out: ScreenRead = { ...base, cellPx: layout.cellPx, ui: layout.ui, panels };
  const aspect = img.width / img.height;
  if (Math.abs(aspect - 16 / 9) > 0.05 || layout.ui < 0.8 || layout.ui > 1.25) out.warnings.push('scaleOdd');

  const stash = panels.find(p => p.panel === 'stash');
  const primary = stash || panels[0];
  out.panel = primary?.panel ?? null;
  out.cells = primary?.cells ?? [];
  if (!stash) out.warnings.push('noStash');
  else {
    const toks = numberTokens(img, stashHeaderArea(stash.grid), isCream);
    const m = toks.length ? /^(\d+)(?:\/(\d+))?$/.exec(toks[0].text) : null;
    if (m) { out.headerSlots = Number(m[1]); out.headerSlotsMax = m[2] ? Number(m[2]) : null; }
    else out.warnings.push('headerUnreadable');
    if (toks.length >= 2) out.stashValue = parseGrouped(toks[toks.length - 1].text);
  }
  const coinBox = coinsArea(img, layout.cellPx);
  const coin = numberTokens(img, coinBox, isCream)[0];
  out.coins = coin ? parseGrouped(coin.text) : null;
  const prem = numberTokens(img, coinBox, isGold)[0];
  out.premium = prem ? parseGrouped(prem.text) : null;
  if (panels.some(p => p.cells.some(c => c.count === null && c.countText))) out.warnings.push('countUnreadable');
  return out;
}
