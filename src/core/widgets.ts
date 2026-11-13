/* Widgety nad hrou (0.22.0, návrh docs/design/overlay-widgets). Čisté funkce bez DOM a Tauri, takže jdou testovat v Node.
   - Katalog: deset widgetů s velikostmi z návrhu (kompaktní / rozšířená, minimum, maximum v logických CSS px).
     Žádná mapa, poloha ani minimapa (fair play). Každý widget nejvýš jednou v rozložení.
   - Rozložení: pojmenovaná, výchozí šablony „Raid“ a „Lobby“ (osobní úpravy jsou přepis šablony a jdou obnovit).
     Patří tomuto počítači: drží je jen okno widgetů v místním úložišti webview (ops/widgetPrefs.ts), ne stav aplikace,
     takže nejsou v zálohách a import zálohy je nikdy nemění.
   - Poloha se ukládá jako kotva (vlevo / uprostřed / vpravo, nahoře / uprostřed / dole) a odstup od ní v logických px,
     ne procenta: po změně rozlišení zůstane widget u svého okraje se stejnou velikostí a odstupem, pak se ořízne
     do monitoru. Kotva se po puštění vybere podle nejbližšího okraje nebo středu; při shodě zůstane předchozí.
   - Přichycení: mřížka 8 px, okraj monitoru, bezpečný odstup 24 px, střed monitoru a okraje či středy ostatních
     widgetů do 8 px; vyhraje nejbližší cíl, při shodě okraj, pak widget; mřížka jen bez cíle v dosahu. Alt přichycení vypne.
   - Krytí 30–100 % (výchozí 85 %) platí pro podklad; plocha přímo pod textem má vždy aspoň 90 %.
   - Režimy: Hra (jen zobrazení, okno propouští myš) a Úpravy; „Skrýt vše“ je jen pro tuto relaci. */

export const WIDGET_IDS = ['toFind', 'quests', 'shopping', 'next', 'lookup', 'stash', 'weekly', 'ops', 'review', 'capture'] as const;
export type WidgetId = typeof WIDGET_IDS[number];
export const isWidgetId = (v: unknown): v is WidgetId => typeof v === 'string' && (WIDGET_IDS as readonly string[]).includes(v);

export type Density = 'compact' | 'expanded';
export type AnchorX = 'left' | 'center' | 'right';
export type AnchorY = 'top' | 'center' | 'bottom';
export interface Size { w: number; h: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Viewport { w: number; h: number }
export interface WidgetSpec { id: WidgetId; compact: Size; expanded: Size; min: Size; max: Size }

const sz = (w: number, h: number): Size => ({ w, h });
/* Velikosti z README návrhu (šířka × výška včetně rámu, bez úchytů Úprav). */
export const WIDGETS: Readonly<Record<WidgetId, WidgetSpec>> = {
  toFind: { id: 'toFind', compact: sz(344, 248), expanded: sz(344, 336), min: sz(280, 200), max: sz(480, 560) },
  quests: { id: 'quests', compact: sz(344, 128), expanded: sz(344, 176), min: sz(280, 112), max: sz(480, 480) },
  shopping: { id: 'shopping', compact: sz(344, 120), expanded: sz(344, 208), min: sz(280, 112), max: sz(480, 480) },
  next: { id: 'next', compact: sz(344, 144), expanded: sz(344, 192), min: sz(280, 128), max: sz(440, 320) },
  lookup: { id: 'lookup', compact: sz(344, 224), expanded: sz(344, 280), min: sz(300, 208), max: sz(480, 480) },
  stash: { id: 'stash', compact: sz(280, 128), expanded: sz(280, 192), min: sz(224, 112), max: sz(400, 256) },
  weekly: { id: 'weekly', compact: sz(344, 104), expanded: sz(344, 192), min: sz(280, 96), max: sz(480, 400) },
  ops: { id: 'ops', compact: sz(224, 128), expanded: sz(344, 192), min: sz(192, 112), max: sz(384, 256) },
  review: { id: 'review', compact: sz(224, 104), expanded: sz(344, 152), min: sz(192, 96), max: sz(400, 240) },
  capture: { id: 'capture', compact: sz(224, 88), expanded: sz(344, 176), min: sz(192, 80), max: sz(400, 240) },
};

export const GRID = 8;
export const SAFE = 24;
export const SNAP = 8;
export const OPACITY_MIN = 30;
export const OPACITY_MAX = 100;
export const OPACITY_DEFAULT = 85;
/* nejmenší krytí plochy přímo pod textem (validation.json: textSurfaceFloor) */
export const TEXT_FLOOR = 90;
export const LAYOUTS_MAX = 12;
export const NAME_MAX = 40;
export const PRESET_IDS = ['raid', 'lobby'] as const;
export type PresetId = typeof PRESET_IDS[number];
export const isPresetId = (v: unknown): v is PresetId => v === 'raid' || v === 'lobby';
/* Názvy šablon se nepřekládají (Raid a Lobby jsou herní pojmy, stejně v obou jazycích). */
export const PRESET_NAMES: Record<PresetId, string> = { raid: 'Raid', lobby: 'Lobby' };

export interface WidgetPlace {
  id: WidgetId; ax: AnchorX; ay: AnchorY;
  /* odstup od kotvy v logických px; u středu se znaménkem od středu monitoru */
  dx: number; dy: number; w: number; h: number;
  /* krytí podkladu v procentech (30–100) */
  opacity: number; density: Density; locked: boolean;
  /* pořadí vrstvení (vyšší je navrchu) */
  z: number;
}
export interface Layout {
  id: string; name: string; widgets: WidgetPlace[];
  /* šablona, ze které rozložení vychází (Obnovit ji vrátí) */
  from: PresetId;
}
export interface WidgetPrefs {
  version: 1;
  active: string;
  /* volitelně přepínat Lobby / Raid podle stavu hry z automatického snímání (výchozí vypnuto) */
  follow: boolean;
  /* ruční výběr rozložení automatiku pozastaví až do dalšího zapnutí */
  followPaused: boolean;
  layouts: Layout[];
  /* poslední výslovně vyhledaný předmět widgetu Nechat / prodat / recyklovat */
  lookup: string;
}

export const clampN = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));
const int = (v: unknown, lo: number, hi: number, d: number): number => { const n = Number(v); return Number.isFinite(n) ? Math.round(clampN(n, lo, hi)) : d; };
export const clampOpacity = (v: unknown): number => int(v, OPACITY_MIN, OPACITY_MAX, OPACITY_DEFAULT);
/* Krytí plochy pod textem: nikdy pod 90 %, i když hráč posuvník stáhne na 30 %. */
export const textSurface = (opacity: number): number => Math.max(clampOpacity(opacity), TEXT_FLOOR);

/* ----- šablony ----- */
function place(id: WidgetId, density: Density, ax: AnchorX, ay: AnchorY, dx: number, dy: number, z: number): WidgetPlace {
  const s = WIDGETS[id][density];
  return { id, ax, ay, dx, dy, w: s.w, h: s.h, opacity: OPACITY_DEFAULT, density, locked: false, z };
}
/* Raid: seznam k nalezení a úkoly kompaktně vlevo nahoře, střed obrazovky volný. Lobby: Co dál? a nákupy vlevo,
   úkoly a skrýš vpravo nahoře (README návrhu, „Presets and placement“). */
export function presetWidgets(id: PresetId): WidgetPlace[] {
  if (id === 'raid') return [place('toFind', 'compact', 'left', 'top', 24, 24, 0), place('quests', 'compact', 'left', 'top', 24, 300, 1)];
  return [
    place('next', 'expanded', 'left', 'top', 24, 24, 0), place('shopping', 'expanded', 'left', 'top', 24, 260, 1),
    place('quests', 'expanded', 'right', 'top', 24, 24, 2), place('stash', 'expanded', 'right', 'top', 24, 268, 3),
  ];
}
export const presetLayout = (id: PresetId): Layout => ({ id, name: PRESET_NAMES[id], widgets: presetWidgets(id), from: id });
export const defaultWidgetPrefs = (): WidgetPrefs => ({ version: 1, active: 'raid', follow: false, followPaused: false, layouts: [presetLayout('raid'), presetLayout('lobby')], lookup: '' });

/* ----- ověření uložených dat (vše z úložiště je nedůvěryhodné) ----- */
const AX: readonly AnchorX[] = ['left', 'center', 'right'];
const AY: readonly AnchorY[] = ['top', 'center', 'bottom'];
const LIM = 20000;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const LAYOUT_ID_RE = /^(raid|lobby|l[0-9a-z]{1,16})$/;

export function normalizePlace(raw: unknown): WidgetPlace | null {
  if (!isObj(raw) || !isWidgetId(raw.id)) return null;
  const spec = WIDGETS[raw.id];
  const density: Density = raw.density === 'expanded' ? 'expanded' : 'compact';
  const nums = [raw.dx, raw.dy, raw.w, raw.h].map(Number);
  if (!nums.every(Number.isFinite)) return null;
  return {
    id: raw.id,
    ax: AX.includes(raw.ax as AnchorX) ? (raw.ax as AnchorX) : 'left',
    ay: AY.includes(raw.ay as AnchorY) ? (raw.ay as AnchorY) : 'top',
    dx: int(raw.dx, -LIM, LIM, 0), dy: int(raw.dy, -LIM, LIM, 0),
    w: int(raw.w, spec.min.w, spec.max.w, spec[density].w), h: int(raw.h, spec.min.h, spec.max.h, spec[density].h),
    opacity: clampOpacity(raw.opacity), density, locked: raw.locked === true, z: int(raw.z, 0, 999, 0),
  };
}

export const cleanName = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX) : '');

export function normalizeWidgetPrefs(raw: unknown): WidgetPrefs {
  const d = defaultWidgetPrefs();
  if (!isObj(raw) || raw.version !== 1) return d;
  const out: Layout[] = [];
  const names = new Set<string>();
  for (const x of Array.isArray(raw.layouts) ? raw.layouts.slice(0, LAYOUTS_MAX * 2) : []) {
    if (!isObj(x) || typeof x.id !== 'string' || !LAYOUT_ID_RE.test(x.id) || out.some(l => l.id === x.id)) continue;
    const preset = isPresetId(x.id) ? x.id : null;
    const name = preset ? PRESET_NAMES[preset] : cleanName(x.name);
    if (!name || names.has(name.toLowerCase())) continue;
    const seen = new Set<WidgetId>();
    const widgets: WidgetPlace[] = [];
    for (const w of Array.isArray(x.widgets) ? x.widgets.slice(0, WIDGET_IDS.length * 2) : []) {
      const p = normalizePlace(w);
      if (p && !seen.has(p.id)) { seen.add(p.id); widgets.push(p); }
    }
    names.add(name.toLowerCase());
    out.push({ id: x.id, name, widgets, from: preset ?? (isPresetId(x.from) ? x.from : 'raid') });
    if (out.length >= LAYOUTS_MAX) break;
  }
  /* šablony jsou vždy na začátku (chybějící se doplní výchozí) */
  const layouts = [...PRESET_IDS.map(id => out.find(l => l.id === id) ?? presetLayout(id)), ...out.filter(l => !isPresetId(l.id))].slice(0, LAYOUTS_MAX);
  return {
    version: 1,
    active: typeof raw.active === 'string' && layouts.some(l => l.id === raw.active) ? raw.active : 'raid',
    follow: raw.follow === true,
    followPaused: raw.followPaused === true,
    layouts,
    lookup: typeof raw.lookup === 'string' ? raw.lookup.slice(0, 80) : '',
  };
}

/* ----- geometrie ----- */
/* Velikost v mezích widgetu a monitoru (menší monitor než minimum: velikost monitoru). */
export function clampSize(id: WidgetId, w: number, h: number, vp: Viewport): Size {
  const s = WIDGETS[id];
  return { w: Math.round(clampN(clampN(w, s.min.w, s.max.w), 0, Math.min(s.max.w, vp.w))), h: Math.round(clampN(clampN(h, s.min.h, s.max.h), 0, Math.min(s.max.h, vp.h))) };
}
const axisPos = (a: 'start' | 'center' | 'end', d: number, size: number, span: number): number =>
  a === 'start' ? d : a === 'end' ? span - size - d : span / 2 + d - size / 2;
const ax3 = (a: AnchorX | AnchorY): 'start' | 'center' | 'end' => (a === 'left' || a === 'top' ? 'start' : a === 'center' ? 'center' : 'end');

/* Kde widget na monitoru je: kotva + odstup, pak oříznutí do monitoru (nic se neroztahuje). */
export function placeRect(p: WidgetPlace, vp: Viewport): Rect {
  const { w, h } = clampSize(p.id, p.w, p.h, vp);
  const x = Math.round(clampN(axisPos(ax3(p.ax), p.dx, w, vp.w), 0, vp.w - w));
  const y = Math.round(clampN(axisPos(ax3(p.ay), p.dy, h, vp.h), 0, vp.h - h));
  return { x, y, w, h };
}

/* Kotva podle nejbližšího okraje nebo středu; při shodě zůstane předchozí (proti přeskakování). */
function nearest<T extends string>(dists: [T, number][], prev: T | undefined): T {
  const min = Math.min(...dists.map(d => d[1]));
  const tied = dists.filter(d => Math.abs(d[1] - min) < 0.5).map(d => d[0]);
  return prev && tied.includes(prev) ? prev : tied[0];
}
export function anchorOf(r: Rect, vp: Viewport, prev?: { ax: AnchorX; ay: AnchorY }): { ax: AnchorX; ay: AnchorY; dx: number; dy: number } {
  const ax = nearest<AnchorX>([['left', r.x], ['right', vp.w - r.x - r.w], ['center', Math.abs(r.x + r.w / 2 - vp.w / 2)]], prev?.ax);
  const ay = nearest<AnchorY>([['top', r.y], ['bottom', vp.h - r.y - r.h], ['center', Math.abs(r.y + r.h / 2 - vp.h / 2)]], prev?.ay);
  const dx = ax === 'left' ? r.x : ax === 'right' ? vp.w - r.x - r.w : r.x + r.w / 2 - vp.w / 2;
  const dy = ay === 'top' ? r.y : ay === 'bottom' ? vp.h - r.y - r.h : r.y + r.h / 2 - vp.h / 2;
  return { ax, ay, dx: Math.round(dx), dy: Math.round(dy) };
}
/* Uloží obdélník do místa widgetu (kotva + odstup + velikost). */
export function withRect(p: WidgetPlace, r: Rect, vp: Viewport): WidgetPlace {
  const s = clampSize(p.id, r.w, r.h, vp);
  const rect = { x: Math.round(clampN(r.x, 0, vp.w - s.w)), y: Math.round(clampN(r.y, 0, vp.h - s.h)), ...s };
  return { ...p, ...anchorOf(rect, vp, p), w: s.w, h: s.h };
}

/* ----- přichycení ----- */
export type SnapKind = 'edge' | 'widget' | 'grid';
const PRIO: Record<SnapKind, number> = { edge: 0, widget: 1, grid: 2 };
export interface Guides { x: number | null; y: number | null; kindX: SnapKind | null; kindY: SnapKind | null }
interface Cand { v: number; line: number | null; kind: SnapKind }

function axisCands(pos: number, size: number, span: number, others: { a: number; s: number }[]): Cand[] {
  const c: Cand[] = [
    { v: 0, line: 0, kind: 'edge' }, { v: span - size, line: span, kind: 'edge' },
    { v: SAFE, line: SAFE, kind: 'edge' }, { v: span - size - SAFE, line: span - SAFE, kind: 'edge' },
    { v: (span - size) / 2, line: span / 2, kind: 'edge' },
  ];
  for (const o of others) {
    c.push(
      { v: o.a, line: o.a, kind: 'widget' }, { v: o.a + o.s - size, line: o.a + o.s, kind: 'widget' },
      { v: o.a + o.s, line: o.a + o.s, kind: 'widget' }, { v: o.a - size, line: o.a, kind: 'widget' },
      { v: o.a + o.s / 2 - size / 2, line: o.a + o.s / 2, kind: 'widget' },
    );
  }
  c.push({ v: Math.round(pos / GRID) * GRID, line: null, kind: 'grid' });
  return c;
}
/* Cíle (okraj, odstup, střed, widget) do 8 px mají přednost před mřížkou; mezi nimi nejbližší, při shodě okraj. */
function pick(pos: number, all: Cand[]): Cand | null {
  const targets = all.filter(c => c.kind !== 'grid' && Math.abs(c.v - pos) <= SNAP + 1e-9);
  const cands = targets.length ? targets : all.filter(c => c.kind === 'grid');
  let best: Cand | null = null, bd = Infinity;
  for (const c of cands) {
    const d = Math.abs(c.v - pos);
    if (d > SNAP + 1e-9) continue;
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && PRIO[c.kind] < PRIO[best.kind])) { best = c; bd = d; }
  }
  return best;
}
/* Přesun: přichycení v obou osách zvlášť, pak oříznutí do monitoru. bypass (Alt) = bez přichycení. */
export function snapMove(r: Rect, vp: Viewport, others: Rect[], bypass = false): { rect: Rect; guides: Guides } {
  const clampX = (x: number) => Math.round(clampN(x, 0, vp.w - r.w)), clampY = (y: number) => Math.round(clampN(y, 0, vp.h - r.h));
  if (bypass) return { rect: { ...r, x: clampX(r.x), y: clampY(r.y) }, guides: { x: null, y: null, kindX: null, kindY: null } };
  const cx = pick(r.x, axisCands(r.x, r.w, vp.w, others.map(o => ({ a: o.x, s: o.w }))));
  const cy = pick(r.y, axisCands(r.y, r.h, vp.h, others.map(o => ({ a: o.y, s: o.h }))));
  const x = clampX(cx ? cx.v : r.x), y = clampY(cy ? cy.v : r.y);
  return {
    rect: { ...r, x, y },
    guides: { x: cx && cx.line !== null ? cx.line : null, y: cy && cy.line !== null ? cy.line : null, kindX: cx?.kind ?? null, kindY: cy?.kind ?? null },
  };
}

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const EDGES: readonly Edge[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const snapGrid = (v: number, bypass: boolean) => (bypass ? Math.round(v) : Math.round(v / GRID) * GRID);
/* Změna velikosti tažením úchytu: velikost po 8 px v mezích widgetu, protější okraj stojí, vše uvnitř monitoru. */
export function resizeRect(start: Rect, edge: Edge, dx: number, dy: number, id: WidgetId, vp: Viewport, bypass = false): Rect {
  const s = WIDGETS[id];
  const maxW = Math.min(s.max.w, vp.w), maxH = Math.min(s.max.h, vp.h);
  const minW = Math.min(s.min.w, maxW), minH = Math.min(s.min.h, maxH);
  let { x, y, w, h } = start;
  if (edge.includes('e')) w = clampN(snapGrid(start.w + dx, bypass), minW, Math.min(maxW, vp.w - start.x));
  if (edge.includes('s')) h = clampN(snapGrid(start.h + dy, bypass), minH, Math.min(maxH, vp.h - start.y));
  if (edge.includes('w')) { w = clampN(snapGrid(start.w - dx, bypass), minW, Math.min(maxW, start.x + start.w)); x = start.x + start.w - w; }
  if (edge.includes('n')) { h = clampN(snapGrid(start.h - dy, bypass), minH, Math.min(maxH, start.y + start.h)); y = start.y + start.h - h; }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/* ----- úpravy rozložení (vrací nový objekt, nic nemění na místě) ----- */
export const activeLayout = (p: WidgetPrefs): Layout => p.layouts.find(l => l.id === p.active) ?? p.layouts[0];
export function mapActive(p: WidgetPrefs, fn: (l: Layout) => Layout): WidgetPrefs {
  return { ...p, layouts: p.layouts.map(l => (l.id === p.active ? fn(l) : l)) };
}
export function setPlace(p: WidgetPrefs, w: WidgetPlace): WidgetPrefs {
  return mapActive(p, l => ({ ...l, widgets: l.widgets.map(x => (x.id === w.id ? w : x)) }));
}
/* Přidání z katalogu: výchozí kompaktní velikost, první volné místo (vlevo, uprostřed, vpravo) po 8 px; mezi widgety
   zůstane místo na lištu Úprav (BAR_GAP), aby lišta nového widgetu nezakryla sousední. */
export const BAR_GAP = 48;
export function addWidget(p: WidgetPrefs, id: WidgetId, vp: Viewport): WidgetPrefs {
  const l = activeLayout(p);
  if (l.widgets.some(w => w.id === id)) return p;
  const spec = WIDGETS[id];
  const { w, h } = clampSize(id, spec.compact.w, spec.compact.h, vp);
  const rects = l.widgets.map(x => placeRect(x, vp));
  let x = SAFE, y = SAFE;
  const hit = (yy: number, xx: number) => rects.some(r => xx < r.x + r.w + GRID && xx + w + GRID > r.x && yy < r.y + r.h + BAR_GAP && yy + h + BAR_GAP > r.y);
  outer: for (const xx of [SAFE, Math.round((vp.w - w) / 2 / GRID) * GRID, vp.w - w - SAFE]) {
    for (let yy = SAFE; yy + h <= vp.h - SAFE; yy += GRID) { if (!hit(yy, xx)) { x = xx; y = yy; break outer; } }
  }
  const z = l.widgets.reduce((m, x2) => Math.max(m, x2.z + 1), 0);
  const base: WidgetPlace = { id, ax: 'left', ay: 'top', dx: 0, dy: 0, w, h, opacity: OPACITY_DEFAULT, density: 'compact', locked: false, z };
  return mapActive(p, lay => ({ ...lay, widgets: [...lay.widgets, withRect(base, { x, y, w, h }, vp)] }));
}
export const removeWidget = (p: WidgetPrefs, id: WidgetId): WidgetPrefs => mapActive(p, l => ({ ...l, widgets: l.widgets.filter(w => w.id !== id) }));
/* Hustota: velikost na doporučenou pro danou hustotu (ruční velikost se přepíše, jde vrátit Zpět). */
export function setDensity(p: WidgetPrefs, id: WidgetId, density: Density, vp: Viewport): WidgetPrefs {
  const w = activeLayout(p).widgets.find(x => x.id === id);
  if (!w || w.density === density) return p;
  const r = placeRect(w, vp), s = clampSize(id, WIDGETS[id][density].w, WIDGETS[id][density].h, vp);
  return setPlace(p, withRect({ ...w, density }, { ...r, ...s }, vp));
}
/* Posunout dopředu / dozadu: výměna pořadí se sousedem ve vrstvení; pořadí se pak přečísluje 0…n−1. */
export function restack(p: WidgetPrefs, id: WidgetId, dir: 1 | -1): WidgetPrefs {
  return mapActive(p, l => {
    const order = [...l.widgets].sort((a, b) => a.z - b.z);
    const i = order.findIndex(w => w.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return l;
    [order[i], order[j]] = [order[j], order[i]];
    const z = new Map(order.map((w, k) => [w.id, k]));
    return { ...l, widgets: l.widgets.map(w => ({ ...w, z: z.get(w.id)! })) };
  });
}
/* Obnovit: rozložení podle jeho šablony (jen toto rozložení; jde vrátit Zpět). */
export const resetActive = (p: WidgetPrefs): WidgetPrefs => mapActive(p, l => ({ ...l, widgets: presetWidgets(l.from) }));

/* Název rozložení: 1–40 znaků a jedinečný (bez ohledu na velikost písmen). */
export function nameError(name: string, p: WidgetPrefs, except?: string): boolean {
  const n = cleanName(name);
  return !n || p.layouts.some(l => l.id !== except && l.name.toLowerCase() === n.toLowerCase());
}
export function saveAs(p: WidgetPrefs, name: string, id: string): WidgetPrefs | null {
  if (nameError(name, p) || p.layouts.length >= LAYOUTS_MAX || !LAYOUT_ID_RE.test(id) || isPresetId(id) || p.layouts.some(l => l.id === id)) return null;
  const cur = activeLayout(p);
  return { ...p, layouts: [...p.layouts, { id, name: cleanName(name), widgets: cur.widgets.map(w => ({ ...w })), from: cur.from }], active: id };
}
/* Přejmenovat jde jen vlastní rozložení (šablony Raid a Lobby mají pevný název). */
export function rename(p: WidgetPrefs, id: string, name: string): WidgetPrefs | null {
  if (isPresetId(id) || !p.layouts.some(l => l.id === id) || nameError(name, p, id)) return null;
  return { ...p, layouts: p.layouts.map(l => (l.id === id ? { ...l, name: cleanName(name) } : l)) };
}
export function deleteLayout(p: WidgetPrefs, id: string): WidgetPrefs {
  if (isPresetId(id) || !p.layouts.some(l => l.id === id)) return p;
  return { ...p, layouts: p.layouts.filter(l => l.id !== id), active: p.active === id ? 'raid' : p.active };
}
/* Ruční výběr: při zapnuté automatice ji pozastaví (žádné překvapivé přepnutí přes hráčovu volbu). */
export function selectLayout(p: WidgetPrefs, id: string, manual = true): WidgetPrefs {
  if (!p.layouts.some(l => l.id === id)) return p;
  return { ...p, active: id, followPaused: manual && p.follow ? true : p.followPaused };
}
export const setFollow = (p: WidgetPrefs, on: boolean): WidgetPrefs => ({ ...p, follow: on, followPaused: false });

/* ----- Zpět / Znovu v rámci jedné relace Úprav ----- */
export interface History { past: WidgetPrefs[]; future: WidgetPrefs[] }
export const HISTORY_MAX = 100;
export const emptyHistory = (): History => ({ past: [], future: [] });
export const record = (h: History, before: WidgetPrefs): History => ({ past: [...h.past, before].slice(-HISTORY_MAX), future: [] });
export function undo(h: History, cur: WidgetPrefs): { h: History; prefs: WidgetPrefs } | null {
  const prev = h.past[h.past.length - 1];
  return prev ? { h: { past: h.past.slice(0, -1), future: [cur, ...h.future] }, prefs: prev } : null;
}
export function redo(h: History, cur: WidgetPrefs): { h: History; prefs: WidgetPrefs } | null {
  const next = h.future[0];
  return next ? { h: { past: [...h.past, cur], future: h.future.slice(1) }, prefs: next } : null;
}

/* ----- režimy ----- */
export type Mode = 'play' | 'edit';
export type Popup = null | 'catalog' | 'layouts' | 'settings' | 'search' | 'reset';
export interface ModeState { mode: Mode; hidden: boolean; popup: Popup; dragging: boolean }
export type ModeEvent =
  | { type: 'enter' } | { type: 'exit' } | { type: 'esc' } | { type: 'done' } | { type: 'hideAll' } | { type: 'toggleHidden' } | { type: 'showAll' }
  | { type: 'open'; popup: Exclude<Popup, null> } | { type: 'close' } | { type: 'dragStart' } | { type: 'dragEnd' };
/* requestPlay = požádat Rust o návrat do Hry (okno znovu propouští myš a fokus se vrátí hře); cancelDrag = zrušit tažení */
export type ModeEffect = 'requestPlay' | 'cancelDrag' | null;
export const initialMode = (): ModeState => ({ mode: 'play', hidden: false, popup: null, dragging: false });

export function modeStep(s: ModeState, e: ModeEvent): { state: ModeState; effect: ModeEffect } {
  const done = (state: ModeState, effect: ModeEffect = null) => ({ state, effect });
  switch (e.type) {
    /* Úpravy vždy ukážou widgety (návrat ze „Skrýt vše“) */
    case 'enter': return done({ mode: 'edit', hidden: false, popup: null, dragging: false });
    case 'exit': return done({ ...s, mode: 'play', popup: null, dragging: false });
    case 'esc':
      if (s.mode !== 'edit') return done(s);
      if (s.dragging) return done({ ...s, dragging: false }, 'cancelDrag');
      if (s.popup) return done({ ...s, popup: null });
      return done(s, 'requestPlay');
    /* Hotovo: uloží a vrátí do Hry vždy (i s otevřeným dialogem) */
    case 'done': return s.mode === 'edit' ? done({ ...s, popup: null, dragging: false }, 'requestPlay') : done(s);
    case 'hideAll': return s.mode === 'edit' ? done({ ...s, hidden: true, popup: null, dragging: false }, 'requestPlay') : done({ ...s, hidden: true });
    case 'toggleHidden': return s.mode === 'edit' ? modeStep(s, { type: 'hideAll' }) : done({ ...s, hidden: !s.hidden });
    case 'showAll': return done({ ...s, hidden: false });
    case 'open': return s.mode === 'edit' ? done({ ...s, popup: s.popup === e.popup ? null : e.popup }) : done(s);
    case 'close': return done({ ...s, popup: null });
    case 'dragStart': return s.mode === 'edit' ? done({ ...s, dragging: true, popup: null }) : done(s);
    case 'dragEnd': return done({ ...s, dragging: false });
  }
}

/* ----- automatika Lobby / Raid ----- */
export type LifePhase = 'idle' | 'loadout' | 'inRaid';
/* Jen přechod stavu z povoleného snímání mimo raid: do raidu → Raid, z raidu nebo do loadoutu → Lobby.
   První známý stav nic nepřepne (neznámý stav nechá aktuální rozložení). */
export function followTarget(prev: LifePhase | null, next: LifePhase): PresetId | null {
  if (prev === null || prev === next) return null;
  return next === 'inRaid' ? 'raid' : 'lobby';
}
/* Přepnout teď? Jen při zapnuté a nepozastavené automatice a běžícím snímání; během Úprav, dialogu nebo tažení
   se změna odloží (vrací 'defer'). */
export function followDecision(p: WidgetPrefs, target: PresetId | null, captureActive: boolean, busy: boolean): 'switch' | 'defer' | null {
  if (!target || !p.follow || p.followPaused || !captureActive || p.active === target) return null;
  return busy ? 'defer' : 'switch';
}
