/* Vstupní bod rozpoznávání: readScreenshot(img) přečte jeden snímek obrazovky INVENTORY (nebo FINDINGS po raidu).
   Výsledek obsahuje jen čísla (polohy, počty, otisky, podpisy řádků), ne obrazová data, takže se snímek po přečtení
   může zahodít. */
import { lumMap, type RgbaImage } from './image';
import { detectLayout, viewportOf, type Box, type Grid, type PanelGrid, type PanelId, type Viewport } from './layout';
import { brightShare, categoryArea, cellSig, countArea, creamShare, frameLum, gridCells, iconArea, isPlusSlot, tierArea } from './cells';
import { isCream, isGold, isTeal, maskOf, numberTokens, parseGrouped, readCount, readTier, type Tier } from './digits';
import { fingerprint } from './fingerprint';
import { readRarity, type Rarity } from './rarity';
import { coinsArea, panelLabelArea, stashHeaderArea } from './regions';
import { findOverlays, isPanelCream, occludedBy, type Overlay } from './overlays';
import { readTooltip, type TooltipRead } from './tooltip';

export type VisionWarning =
  | 'noInventory'        /* na snímku není mřížka inventory */
  | 'noStash'            /* mřížka je, ale chybí STASH (jen batoh) */
  | 'headerUnreadable'   /* nepřečtený počet míst v hlavičce STASH */
  | 'countUnreadable'    /* aspoň jeden nečitelný počet */
  | 'occluded'           /* část políček zakrývá tooltip nebo nápověda */
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
  /* název z tooltipu, když je políčko zvýrazněné (pod kurzorem) a tooltip jde přečíst */
  name?: string;
}

/* Řádek useknutý okrajem posuvné oblasti: nečte se, ale jeho viditelná část pomáhá navázat posunuté snímky. */
export interface PartialRow { visible: number; sigs: number[][] }

export interface PanelRead {
  panel: PanelId; grid: Grid;
  /* obsazená políčka */
  cells: CellRead[];
  /* prázdná místa (řádek, sloupec) – pro spojování snímků */
  empty: { row: number; col: number }[];
  /* místa zakrytá tooltipem nebo nápovědou: nečtou se a nepočítají */
  hidden: { row: number; col: number }[];
  slots: number | null; slotsMax: number | null;
  /* podpisy všech celých míst [řádek][sloupec] a useknutých řádků nad a pod mřížkou */
  sigs: number[][][];
  partialTop: PartialRow | null; partialBottom: PartialRow | null;
  /* zvýrazněné místo (bílý rámeček pod kurzorem) */
  selected: { row: number; col: number } | null;
}

export interface ScreenRead {
  width: number; height: number; cellPx: number; ui: number;
  panel: PanelId | null;
  headerSlots: number | null; headerSlotsMax: number | null; stashValue: number | null;
  coins: number | null; premium: number | null;
  cells: CellRead[];
  panels: PanelRead[];
  overlays: Overlay[];
  tooltip: (TooltipRead & { cell: { panel: PanelId; row: number; col: number } | null }) | null;
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

function panelCreamShare(img: RgbaImage, a: Box): number {
  let on = 0, n = 0;
  for (let y = Math.round(a.y); y < a.y + a.h; y += 2) for (let x = Math.round(a.x); x < a.x + a.w; x += 2) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    n++; const i = (y * img.width + x) * 4;
    if (isPanelCream(img.data[i], img.data[i + 1], img.data[i + 2])) on++;
  }
  return n ? on / n : 0;
}

/* Prah obsazenosti: podíl světlých neutrálních pixelů v ikoně kategorie (prázdné místo 0, tmavý zaměřovač ~0,05). */
export const CATEGORY_ICON_MIN = 0.02;

function readPanel(img: RgbaImage, g: PanelGrid, overlays: Overlay[], vp: Viewport | null): PanelRead {
  const cells: CellRead[] = [], empty: { row: number; col: number }[] = [], hidden: { row: number; col: number }[] = [];
  const sigs: number[][][] = Array.from({ length: g.rows }, () => []);
  const frames: { row: number; col: number; lum: number }[] = [];
  for (const gc of gridCells(g)) {
    const b = gc.box;
    if (occludedBy(b, gc.framed, overlays, g.cell)) { hidden.push({ row: gc.row, col: gc.col }); sigs[gc.row][gc.col] = []; continue; }
    sigs[gc.row][gc.col] = cellSig(img, b);
    const ring = Math.max(2, Math.round(g.cell * 0.05));
    frames.push({ row: gc.row, col: gc.col, lum: frameLum(img, b, [-ring - 1, -ring, -ring + 1]) });
    const cnt = readCount(img, countArea(b));
    const tier = cnt ? null : readTier(img, tierArea(b));
    const rar = readRarity(img, b);
    const bright = brightShare(img, iconArea(b));
    const colored = rar.rarity !== 'common' && rar.rarity !== 'unknown';
    /* 0.23.0: volné místo „+“ vlastního loadoutu (modrozelený rámeček a křížek, bez ikony) je prázdné, ne předmět */
    if (!cnt && !tier && !rar.rgb && isPlusSlot(img, b)) { if (gc.framed) empty.push({ row: gc.row, col: gc.col }); continue; }
    /* Každý předmět má vlevo dole ikonu kategorie; prázdné místo ani zástupné ikony (kroužek, „náhodný“ symbol) ne. */
    const occupied = !!cnt || !!tier || colored || bright > 0.04 || creamShare(img, categoryArea(b)) >= CATEGORY_ICON_MIN;
    if (!occupied) { if (gc.framed) empty.push({ row: gc.row, col: gc.col }); continue; }
    cells.push({
      row: gc.row, col: gc.col, box: b, rarity: rar.rarity,
      count: cnt?.count ?? null, countConf: cnt?.conf ?? 1, countText: cnt?.text ?? '',
      tier, fp: fingerprint(img, iconArea(b), rar.rgb), cat: categoryMap(img, categoryArea(b)),
    });
  }
  let slots: number | null = null, slotsMax: number | null = null;
  if (g.panel !== 'stash') {
    /* 0.23.0: vlastní loadout má popisek modrozelený („0/20“), ostatní obrazovky krémový */
    const label = (test: typeof isCream) => numberTokens(img, panelLabelArea(g), test).find(t => /^\d+\/\d+$/.test(t.text));
    const tok = label(isCream) ?? label(isTeal);
    if (tok) [slots, slotsMax] = tok.text.split('/').map(Number);
  }
  const partial = (row: number, visible: number, top: boolean): PartialRow | null => {
    if (!vp || visible < g.cell * 0.12) return null;
    const out: number[][] = [];
    for (let col = 0; col < g.cols; col++) {
      const b: Box = { x: Math.round(g.x + col * g.pitchX), y: Math.round(g.y + row * g.pitchY), w: g.cell, h: g.cell };
      out.push(occludedBy(b, true, overlays, g.cell) ? [] : top ? cellSig(img, b, vp.top + 1) : cellSig(img, b, -Infinity, vp.bottom - 1));
    }
    return { visible, sigs: out };
  };
  /* Zvýrazněné místo: dvojitý světlý rámeček rozbije hledání rámečku, takže je to místo uvnitř mřížky bez nalezeného
     rámečku (a nezakryté), které má světlý obrys v mezeře vně políčka (u ostatních míst je mezera tmavá). */
  const lums = frames.map(f => f.lum).sort((a, b) => a - b);
  const med = lums.length ? lums[Math.floor(lums.length / 2)] : 0;
  const top = frames.filter(f => !g.present[f.row * g.cols + f.col] && f.lum >= Math.max(med + 25, 50)).sort((a, b) => b.lum - a.lum)[0];
  const selected = top ? { row: top.row, col: top.col } : null;
  /* Zvýrazněné políčko může mít krémový podklad: otisk se pak spočítá znovu bez něj. */
  const sc = selected && cells.find(c => c.row === selected.row && c.col === selected.col);
  if (sc && panelCreamShare(img, iconArea(sc.box)) > 0.25) sc.fp = fingerprint(img, iconArea(sc.box), null, true);
  return {
    panel: g.panel, grid: g, cells, empty, hidden, slots, slotsMax, sigs, selected,
    partialTop: vp ? partial(-1, vp.partialTop, true) : null,
    partialBottom: vp ? partial(g.rows, vp.partialBottom, false) : null,
  };
}

/* Hlavička STASH: pás se měří od horního okraje posuvné oblasti; když se nepřečte, zkusí se o kousek výš a níž. */
function readHeader(img: RgbaImage, g: Grid, top: number): { slots: number | null; max: number | null; value: number | null } {
  for (const f of [0, -0.06, 0.06, -0.12, 0.12]) {
    const toks = numberTokens(img, stashHeaderArea(g, top, f * g.pitchY), isCream);
    const m = toks.length ? /^(\d+)(?:\/(\d+))?$/.exec(toks[0].text) : null;
    if (!m) continue;
    const value = toks.length >= 2 ? parseGrouped(toks[toks.length - 1].text) : null;
    return { slots: Number(m[1]), max: m[2] ? Number(m[2]) : null, value };
  }
  return { slots: null, max: null, value: null };
}

export function readScreenshot(img: RgbaImage, ctx: ReadContext = {}): ScreenRead {
  const base: ScreenRead = {
    width: img.width, height: img.height, cellPx: 0, ui: 0, panel: null,
    headerSlots: null, headerSlotsMax: null, stashValue: null, coins: null, premium: null, cells: [], panels: [], overlays: [], tooltip: null, warnings: [],
  };
  const L = lumMap(img);
  const layout = detectLayout(img, L);
  if (!layout) return { ...base, warnings: ['noInventory'] };
  const overlays = findOverlays(img, layout.cellPx);
  const stashGrid = layout.panels.find(p => p.panel === 'stash');
  const vp = stashGrid ? viewportOf(img, stashGrid, L) : null;
  const panels = layout.panels.filter(p => !ctx.panels || ctx.panels.includes(p.panel)).map(p => readPanel(img, p, overlays, p.panel === 'stash' ? vp : null));
  const out: ScreenRead = { ...base, cellPx: layout.cellPx, ui: layout.ui, panels, overlays };
  const aspect = img.width / img.height;
  if (Math.abs(aspect - 16 / 9) > 0.05 || layout.ui < 0.8 || layout.ui > 1.25) out.warnings.push('scaleOdd');

  const stash = panels.find(p => p.panel === 'stash');
  const primary = stash || panels[0];
  out.panel = primary?.panel ?? null;
  out.cells = primary?.cells ?? [];
  if (!stash) out.warnings.push('noStash');
  else {
    const h = readHeader(img, stash.grid, vp!.top);
    out.headerSlots = h.slots; out.headerSlotsMax = h.max; out.stashValue = h.value;
    if (h.slots === null) out.warnings.push('headerUnreadable');
  }
  const coinBox = coinsArea(img, layout.cellPx);
  const coin = numberTokens(img, coinBox, isCream)[0];
  out.coins = coin ? parseGrouped(coin.text) : null;
  const prem = numberTokens(img, coinBox, isGold)[0];
  out.premium = prem ? parseGrouped(prem.text) : null;

  /* Tooltip pojmenuje zvýrazněné políčko (to, nad kterým je kurzor). */
  const tip = overlays.find(o => o.kind === 'tooltip');
  if (tip) {
    const t = readTooltip(img, tip.box, layout.cellPx);
    if (t) {
      const sel = panels.find(p => p.selected && p.cells.some(c => c.row === p.selected!.row && c.col === p.selected!.col));
      const cell = sel ? { panel: sel.panel, row: sel.selected!.row, col: sel.selected!.col } : null;
      if (sel && t.name) { const c = sel.cells.find(x => x.row === cell!.row && x.col === cell!.col)!; c.name = t.name; }
      out.tooltip = { ...t, cell };
    }
  }
  if (panels.some(p => p.hidden.length)) out.warnings.push('occluded');
  if (panels.some(p => p.cells.some(c => c.count === null && c.countText))) out.warnings.push('countUnreadable');
  return out;
}
