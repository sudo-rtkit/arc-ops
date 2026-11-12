/* Obrazovky postupu (0.10.1): PROFIL (RAIDER), DÍLNA (přehled stanic a detail stanice), ÚKOLY obchodníka
   a SKILL TREE (součty větví a tooltip skillu). Výsledek obsahuje jen přečtená čísla a texty s jistotou, ne obrazová
   data. Nic se tu nepáruje s daty aplikace (to dělá core/progressImport.ts) a nic se nehádá: co nejde přečíst, je null.
   Polohy se měří v jednotkách výšky obrazu (UI hry se škáluje podle výšky), levý okraj se počítá od levé hrany,
   pravé panely od pravé hrany, strom skillů od středu. Text hry musí být anglicky (vzory písmen jsou anglické). */
import { hueSat, rgbAt, type RgbaImage } from './image';
import type { Box } from './layout';
import { components, isCream, maskOf, numberTokens, segmentLine, words, type Glyph, type Line, type PixelTest } from './digits';
import { segmentText } from './tooltip';
import { isPanelCream } from './overlays';
import { anyInk, creamPanel, darkInk, hueInk, inkRows, lightInk, parseNumber, readLine, readNumberIn, romanOf, wordNumber, type LineRead } from './text';
import { nameDistance } from '../catalog';
import { readMixed } from './mixed';

export type ProgressScreen = 'profile' | 'workshop' | 'station' | 'quest' | 'skills';
/* Přečtená hodnota: null = nepřečteno. conf 0–1 = nejhorší znak (u čísel a textu) nebo jistota tvaru. */
export interface Read<T> { value: T | null; conf: number; raw: string }
const none = <T>(raw = ''): Read<T> => ({ value: null, conf: 0, raw });

export interface ProfileRead { screen: 'profile'; level: Read<number>; xp: Read<number>; xpNext: Read<number>; coins: Read<number> }
/* Přehled dílny: slot 0 = Scrappy (oddělená dlaždice vlevo), 1–7 = stanice zleva doprava; level = římská číslice
   v rohu dlaždice (Scrappy ji nemá). */
export interface WorkshopRead { screen: 'workshop'; tiles: { slot: number; level: Read<number> }[] }
/* Detail stanice: název a úroveň z hlavičky („GEAR BENCH — LEVEL 01“) a z panelu („GEAR BENCH I“), materiály na další
   úroveň (řádky „mám/potřeba“ v pořadí na obrazovce). 0.12.0: i název materiálu nad řádkem počtů (malá písmena,
   core/vision/mixed.ts) jako text s jistotou; ke známému názvu ho přiřadí až core/progressImport.ts. */
export interface StationResourceRead { name: Read<string>; have: Read<number>; need: Read<number> }
export interface StationRead {
  screen: 'station'; title: Read<string>; level: Read<number>; panelLevel: Read<number>;
  resources: StationResourceRead[];
}
/* Úkol obchodníka: obchodník z hlavičky, název úkolu, zaškrtávací políčka cílů v pořadí (null = nejisté). */
export interface QuestRead { screen: 'quest'; trader: Read<string>; title: Read<string>; objectives: (boolean | null)[] }
/* Skill tree: součty větví (jen pro kontrolu) a tooltip skillu, je-li otevřený. */
export interface SkillTipRead { name: Read<string>; current: Read<number>; next: Read<number>; arrow: boolean }
export interface SkillsRead { screen: 'skills'; totals: { c: Read<number>; m: Read<number>; s: Read<number> }; tooltip: SkillTipRead | null }
export type ProgressRead = ProfileRead | WorkshopRead | StationRead | QuestRead | SkillsRead;

/* ----- souřadnice ----- */
interface Geo { W: number; H: number; u: number; L: (x: number) => number; R: (x: number) => number; C: (x: number) => number; Y: (y: number) => number }
const geo = (img: RgbaImage): Geo => {
  const W = img.width, H = img.height, u = H / 1080;
  return { W, H, u, L: x => x * u, R: x => W - (1920 - x) * u, C: x => W / 2 + (x - 960) * u, Y: y => y * u };
};
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const words2 = (s: string) => s.replace(/[^A-Z0-9? ]/gi, ' ').replace(/\s+/g, ' ').trim();
/* Shoda přečteného slova s očekávaným (malá chyba povolena). */
export const near = (read: string, want: string, frac = 0.25): boolean => {
  const n = want.replace(/[^A-Z0-9]/gi, '').length;
  return read.replace(/[^A-Z0-9?]/gi, '').length >= Math.max(2, n * 0.6) && nameDistance(read, want) <= Math.max(1, n * frac);
};

/* ----- hlavička: šipka zpět, nadpis podobrazovky a zvýrazněná záložka ----- */
export interface Header { back: boolean; title: Read<string>; sub: Read<string>; tab: Read<string> }

/* Tlačítko zpět: tmavě šedomodrý kruh vlevo nahoře. */
function hasBack(img: RgbaImage, g: Geo): boolean {
  const cx = g.L(86), cy = g.Y(31), r = g.u * 11;
  let on = 0, n = 0;
  for (let a = 0; a < 16; a++) {
    const x = Math.round(cx + r * Math.cos((a * Math.PI) / 8)), y = Math.round(cy + r * Math.sin((a * Math.PI) / 8));
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    n++;
    const [rr, gg, bb] = rgbAt(img, x, y), l = lum(rr, gg, bb);
    if (l > 30 && l < 80 && bb >= rr + 6 && hueSat(rr, gg, bb).s < 0.45) on++;
  }
  return n > 0 && on / n >= 0.6;
}

/* Zvýrazněná záložka: světlý obrys „pilulky“; jeho horní rovná hrana je dlouhý světlý běh v pásu nad textem. */
function selectedTab(img: RgbaImage, g: Geo): Read<string> {
  let best: [number, number] | null = null;
  const xEnd = Math.round(Math.min(g.W * 0.7, g.L(1300)));
  for (let y = Math.round(g.Y(9)); y <= Math.round(g.Y(18)); y++) {
    let s = -1;
    for (let x = 0; x <= xEnd; x++) {
      const [r, gg, b] = x < xEnd ? rgbAt(img, x, y) : [0, 0, 0];
      const on = x < xEnd && lum(r, gg, b) > 170 && hueSat(r, gg, b).s < 0.3;
      if (on && s < 0) s = x;
      if (!on && s >= 0) { if (x - s >= g.u * 40 && (!best || x - s > best[1] - best[0])) best = [s, x - 1]; s = -1; }
    }
  }
  if (!best) return none();
  const box = { x: best[0], y: g.Y(19), w: best[1] - best[0] + 1, h: g.Y(26) };
  const r = readLine(img, box, lightInk, 'head');
  return r.text ? { value: words2(r.text), conf: r.conf, raw: r.text } : none();
}

export function readHeader(img: RgbaImage): Header {
  const g = geo(img);
  const back = hasBack(img, g);
  if (!back) return { back, title: none(), sub: none(), tab: selectedTab(img, g) };
  const line = readLine(img, { x: g.L(132), y: g.Y(17), w: g.L(900), h: g.Y(30) }, lightInk, 'head');
  const ws = line.words.filter(w => w.h >= line.lineH * 0.4);
  /* skupina nadpisu končí první velkou mezerou (dál jsou záložky) */
  const group: typeof ws = [];
  for (const w of ws) { if (group.length && w.x0 - group[group.length - 1].x1 > line.lineH * 3) break; group.push(w); }
  const maxH = Math.max(0, ...group.map(w => w.h));
  /* nadpis = úvodní slova velkým písmem; od prvního menšího slova je to podnadpis („LEVEL 01“, „GRENADES & GADGETS“) */
  const k = group.findIndex(w => w.h < maxH * 0.9);
  const tw = k < 0 ? group : group.slice(0, k), sw = k < 0 ? [] : group.slice(k);
  const rd = (xs: typeof ws): Read<string> => xs.length ? { value: xs.map(w => w.text).join(' '), conf: Math.min(...xs.map(w => w.conf)), raw: xs.map(w => w.text).join(' ') } : none();
  return { back, title: rd(tw), sub: rd(sw), tab: selectedTab(img, g) };
}

/* ----- PROFIL: karta „LEVEL 20 · 2,977/29,000 XP“ vpravo nahoře, mince v horní liště ----- */
function readProfile(img: RgbaImage, g: Geo): ProfileRead | null {
  const card = creamPanel(img, { x: g.R(1540), y: g.Y(90), w: g.W - g.R(1540), h: g.Y(170) }, g.u * 180, g.u * 50);
  if (!card) return null;
  const rows = inkRows(img, { x: card.x + g.u * 8, y: card.y + 2, w: card.w - g.u * 16, h: card.h - 4 }, darkInk, 2).filter(r => r.y1 - r.y0 + 1 >= g.u * 8);
  if (rows.length < 2) return null;
  const pad = g.u * 4;
  const lv = readLine(img, { x: card.x + g.u * 8, y: rows[0].y0 - pad, w: card.w - g.u * 16, h: rows[0].y1 - rows[0].y0 + 1 + 2 * pad }, darkInk);
  if (!lv.words.length || !near(lv.words[0].text, 'LEVEL')) return null;
  const lw = lv.words[lv.words.length - 1];
  const ln = lv.words.length >= 2 ? wordNumber(lw.glyphs, lv.line, false) : { text: '', conf: 0 };
  const lvl = parseNumber(ln.text);
  const level: Read<number> = lvl !== null && lvl >= 1 && lvl <= 200 ? { value: lvl, conf: ln.conf, raw: ln.text } : none(ln.text);
  /* XP: poslední řádek karty; čte se jen první slovo („2,977/29,000“), „XP“ za ním ne */
  const xr = rows[rows.length - 1];
  const xLine = segmentText(img, { x: card.x + g.u * 8, y: xr.y0 - pad, w: card.w - g.u * 16, h: xr.y1 - xr.y0 + 1 + 2 * pad }, null, darkInk);
  const xw = words(xLine, 0.55)[0] ?? [];
  const xn = xw.length ? wordNumber(xw, xLine, true) : { text: '', conf: 0, scores: [] as number[] };
  /* „XP“ za číslem může přilepnout; skupiny tisíců musí sedět, jinak nic */
  const m = /^(\d{1,3}(?:,\d{3})*|\d+)\/(\d{1,3}(?:,\d{3})*|\d+)(?=\?|$)/.exec(xn.text);
  const a = m ? parseNumber(m[1]) : null, b = m ? parseNumber(m[2]) : null;
  const ok = a !== null && b !== null && b > 0 && a <= b;
  /* jistota jen ze znaků čísla (ne z přilepeného „XP“) */
  const xc = m ? Math.min(...xn.scores.slice(0, m[0].length)) : 0;
  return { screen: 'profile', level, xp: ok ? { value: a, conf: xc, raw: m![0] } : none(xn.text), xpNext: ok ? { value: b, conf: xc, raw: m![0] } : none(xn.text), coins: readCoins(img, g) };
}

/* Mince: krémové číslo za ikonou mince v horní liště (prémiová měna je žlutá a nečte se). */
function readCoins(img: RgbaImage, g: Geo): Read<number> {
  const toks = numberTokens(img, { x: g.R(1480), y: g.Y(14), w: g.R(1790) - g.R(1480), h: g.Y(34) }, isCream);
  const t = toks[0];
  if (!t) return none();
  const v = parseNumber(t.text);
  return v === null ? none(t.text) : { value: v, conf: t.conf, raw: t.text };
}

/* ----- DÍLNA: řada dlaždic stanic dole; v pravém dolním rohu dlaždice římská číslice úrovně ----- */
const isNavy = (r: number, g: number, b: number) => { const l = lum(r, g, b); return l < 60 && b >= r + 6 && b >= 14; };
/* Řada dlaždic: 7 stanic ve stejné rozteči a vlevo od nich s větší mezerou Scrappy. Vrací sloty 0 (Scrappy, když je
   vidět) a 1–7 (stanice zleva doprava). Jiný počet stanic = nic (pořadí by nebylo jisté). */
function tileRow(img: RgbaImage, g: Geo): { y: number; tiles: { slot: number; x0: number; x1: number }[] } | null {
  const minW = g.u * 80, maxW = g.u * 130, maxGap = Math.max(2, Math.round(g.u * 6));
  for (let y = Math.round(g.Y(975)); y >= Math.round(g.Y(915)) && y > 0; y -= Math.max(1, Math.round(g.u * 2))) {
    if (y >= g.H) continue;
    const runs: [number, number][] = [];
    let s = -1, last = -1;
    for (let x = 0; x <= g.W; x++) {
      const on = x < g.W && isNavy(...rgbAt(img, x, y));
      if (on) { if (s < 0) s = x; last = x; }
      else if (s >= 0 && x - last > maxGap) { runs.push([s, last]); s = -1; }
    }
    if (s >= 0) runs.push([s, last]);
    const t = runs.filter(([a, b]) => b - a + 1 >= minW && b - a + 1 <= maxW);
    /* nejdelší úsek dlaždic se stejnou roztečí */
    for (let i = 0; i + 7 <= t.length; i++) {
      const grp = t.slice(i, i + 7), pitch = grp.slice(1).map((q, k) => q[0] - grp[k][0]);
      const med = [...pitch].sort((p, q) => p - q)[3];
      if (pitch.some(p => Math.abs(p - med) > g.u * 8)) continue;
      if (t[i + 7] && Math.abs(t[i + 7][0] - grp[6][0] - med) <= g.u * 8) continue; /* víc než 7 stanic */
      const prev = t[i - 1];
      const scrappy = prev && grp[0][0] - prev[0] > med * 1.12 && grp[0][0] - prev[0] < med * 2 ? [{ slot: 0, x0: prev[0], x1: prev[1] }] : [];
      return { y, tiles: [...scrappy, ...grp.map(([x0, x1], k) => ({ slot: k + 1, x0, x1 }))] };
    }
  }
  return null;
}

/* Římská číslice ve výřezu: všechny tvary inkoustu se spojí (patky je stejně spojují). */
export function romanIn(img: RgbaImage, box: Box, ink: PixelTest, minN = 4): Read<number> {
  const { mask, w, h } = maskOf(img, box, ink);
  const cs = components(mask, w, h).filter(c => c.n >= minN);
  if (!cs.length) return none();
  const c = { x0: Math.min(...cs.map(q => q.x0)), y0: Math.min(...cs.map(q => q.y0)), x1: Math.max(...cs.map(q => q.x1)), y1: Math.max(...cs.map(q => q.y1)) };
  const v = romanOf(mask, w, c);
  return v === null ? none('?') : { value: v, conf: 0.9, raw: ['', 'I', 'II', 'III', 'IV', 'V'][v] };
}

function readWorkshop(img: RgbaImage, g: Geo): WorkshopRead | null {
  const row = tileRow(img, g);
  if (!row) return null;
  const light: PixelTest = (r, gg, b, l) => l > 85 && hueSat(r, gg, b).s < 0.3;
  const tiles = row.tiles.map(({ slot, x0, x1 }) => {
    const tw = x1 - x0 + 1, xm = Math.round(x0 + tw * 0.9);
    let yb = row.y;
    while (yb + 1 < g.H && isNavy(...rgbAt(img, xm, yb + 1))) yb++;
    /* číslice je těsně vlevo od pravého rámečku dlaždice; rámeček sám do výřezu nepatří */
    return { slot, level: romanIn(img, { x: x1 - tw * 0.2, y: yb - tw * 0.2, w: tw * 0.13, h: tw * 0.2 }, light) };
  });
  return { screen: 'workshop', tiles };
}

/* ----- DETAIL STANICE ----- */
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
function readStation(img: RgbaImage, g: Geo, h: Header): StationRead {
  /* úroveň v hlavičce: znaky za slovem „LEVEL“ (při malém rozlišení může mezera splynout) znovu jako číslice */
  let level: Read<number> = none(h.sub.raw);
  const line = readLine(img, { x: g.L(132), y: g.Y(17), w: g.L(900), h: g.Y(30) }, lightInk, 'head');
  const subStart = line.words.findIndex(w => near(w.text.slice(0, 5), 'LEVEL') && w.h < line.lineH * 1.05 && w.x0 > g.L(150));
  if (subStart >= 0) {
    const w0 = line.words[subStart], gl = w0.glyphs.length > 5 ? w0.glyphs.slice(5) : line.words[subStart + 1]?.glyphs ?? [];
    const n = gl.length ? wordNumber(gl, line.line, false) : null;
    const v = n ? parseNumber(n.text) : null;
    if (n && v !== null && v >= 0 && v <= 20 && gl.length <= 2) level = { value: v, conf: n.conf, raw: n.text };
  }
  const out: StationRead = { screen: 'station', title: h.title, level, panelLevel: none(), resources: [] };
  const panel = creamPanel(img, { x: g.R(1380), y: g.Y(130), w: g.W - g.R(1380), h: g.Y(820) }, g.u * 300, g.u * 300);
  if (!panel) return out;
  /* název v panelu („GEAR BENCH I“): druhý řádek nahoře (první je štítek WORKSHOP STATION) */
  const top = inkRows(img, { x: panel.x + g.u * 20, y: panel.y + g.u * 10, w: panel.w - g.u * 40, h: g.u * 110 }, darkInk, 3);
  const tr = top.find(r => r.y0 > top[0].y1 + g.u * 4 && r.y1 - r.y0 + 1 >= g.u * 12);
  if (tr) {
    const t = readLine(img, { x: panel.x + g.u * 20, y: tr.y0 - g.u * 4, w: panel.w - g.u * 40, h: tr.y1 - tr.y0 + 1 + g.u * 8 }, darkInk);
    const last = t.words[t.words.length - 1];
    if (t.words.length >= 2 && last && ROMAN[last.text]) out.panelLevel = { value: ROMAN[last.text], conf: last.conf, raw: last.text };
  }
  for (const r of stationResources(img, g, panel)) {
    const n = wordNumber(r.glyphs, r.line, true);
    const m = /^(\d{1,4})\/(\d{1,4})$/.exec(n.text);
    if (!m) continue;
    /* jistota zvlášť pro „mám“ a „potřeba“ (nejhorší číslice každé části) */
    const cut = m[1].length;
    const have: Read<number> = { value: Number(m[1]), conf: Math.min(...n.scores.slice(0, cut)), raw: m[1] };
    const need: Read<number> = { value: Number(m[2]), conf: Math.min(...n.scores.slice(cut + 1)), raw: m[2] };
    let name: Read<string> = none();
    if (r.name) {
      const t = readMixed(img, r.name, darkInk);
      if (t.chars >= 3) name = { value: t.text, conf: t.conf, raw: t.text };
    }
    out.resources.push({ name, have, need });
  }
  return out;
}

/* Řádky materiálů v panelu stanice: řádek počtů „mám/potřeba“ (mám je červeně, když chybí) pod nadpisem REQUIRED
   RESOURCES a těsně nad ním řádek názvu. Vrací výřezy a tvary řádku počtů (jedno slovo). */
interface ResourceRow { name: Box | null; amount: Box; glyphs: Glyph[]; line: Line }
const RED_INK = hueInk(345, 15, 0.45, 110);
function stationResources(img: RgbaImage, g: Geo, panel: Box): ResourceRow[] {
  const ink = anyInk(darkInk, RED_INK);
  const area: Box = { x: panel.x + g.u * 86, y: panel.y + panel.h * 0.4, w: panel.w - g.u * 110, h: panel.h * 0.34 };
  const rows = inkRows(img, area, ink, 2).filter(r => r.y1 - r.y0 + 1 >= g.u * 8);
  const out: ResourceRow[] = [];
  let lastAmount = -1;
  rows.forEach((r, j) => {
    const amount: Box = { x: area.x, y: r.y0 - g.u * 3, w: area.w, h: r.y1 - r.y0 + 1 + g.u * 6 };
    const line = segmentText(img, amount, null, ink);
    const ws = words(line, 0.6);
    if (ws.length !== 1 || ws[0].length < 3) return;
    /* jen řádek z číslic a lomítka (název materiálu je víc slov nebo písmena) */
    if (!/^[\d?]+\/[\d?]+$/.test(wordNumber(ws[0], line, true).text)) return;
    const prev = j > 0 && j - 1 !== lastAmount ? rows[j - 1] : null;
    const name = prev && r.y0 - prev.y1 <= g.u * 16 ? { x: area.x, y: prev.y0 - g.u * 3, w: area.w, h: prev.y1 - prev.y0 + 1 + g.u * 6 } : null;
    lastAmount = j;
    out.push({ name, amount, glyphs: ws[0], line });
  });
  return out;
}

/* Výřezy detailu stanice pro generátor vzorů písmen (tests/vision/body.gen.test.ts): panel a řádky materiálů. */
export function stationLayout(img: RgbaImage): { panel: Box; resources: { name: Box | null; amount: Box }[] } | null {
  const g = geo(img);
  const panel = creamPanel(img, { x: g.R(1380), y: g.Y(130), w: g.W - g.R(1380), h: g.Y(820) }, g.u * 300, g.u * 300);
  return panel ? { panel, resources: stationResources(img, g, panel).map(r => ({ name: r.name, amount: r.amount })) } : null;
}

/* ----- ÚKOL OBCHODNÍKA ----- */
function readQuest(img: RgbaImage, g: Geo, h: Header): QuestRead {
  const out: QuestRead = { screen: 'quest', trader: h.title, title: none(), objectives: [] };
  const panel = creamPanel(img, { x: g.R(1380), y: g.Y(90), w: g.W - g.R(1380), h: g.Y(900) }, g.u * 300, g.u * 300);
  if (!panel) return out;
  /* název úkolu: nejvyšší světlý řádek nad popisem, vlevo od panelu (nad ním je menší název mapy) */
  const tb: Box = { x: panel.x - g.u * 556, y: g.Y(388), w: g.u * 520, h: g.Y(78) };
  const rows = inkRows(img, tb, lightInk, 3);
  const tr = [...rows].sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))[0];
  if (tr) {
    const t: LineRead = readLine(img, { x: tb.x, y: tr.y0 - g.u * 4, w: tb.w, h: tr.y1 - tr.y0 + 1 + g.u * 8 }, lightInk, 'head');
    if (t.text) out.title = { value: words2(t.text), conf: t.conf, raw: t.text };
  }
  /* zaškrtávací políčka cílů: čtverečky v levém pruhu panelu; plný = splněno, prázdný (krém uvnitř) = ne */
  const strip: Box = { x: panel.x + g.u * 6, y: panel.y + g.u * 6, w: g.u * 40, h: panel.h * 0.68 };
  const dark: PixelTest = (_r, _g, _b, l) => l < 175;
  const { mask, w, h: mh } = maskOf(img, strip, dark);
  const boxes = components(mask, w, mh).filter(c => {
    const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
    return cw >= g.u * 10 && cw <= g.u * 24 && ch >= g.u * 10 && ch <= g.u * 24 && Math.abs(cw - ch) <= Math.max(2, g.u * 3);
  }).sort((a, b) => a.y0 - b.y0);
  for (const c of boxes) {
    const inset = Math.max(2, Math.round(g.u * 3));
    let cream = 0, n = 0;
    for (let y = c.y0 + inset; y <= c.y1 - inset; y++) for (let x = c.x0 + inset; x <= c.x1 - inset; x++) {
      n++; if (isPanelCream(...rgbAt(img, Math.round(strip.x) + x, Math.round(strip.y) + y))) cream++;
    }
    const f = n ? cream / n : 0.5;
    out.objectives.push(f <= 0.25 ? true : f >= 0.75 ? false : null);
  }
  return out;
}

/* ----- SKILL TREE ----- */
/* Krémové panely na hrubé mřížce bloků; největší (dost velký a širší než vysoký) je tooltip skillu. */
function biggestCream(img: RgbaImage, g: Geo): Box | null {
  const s = Math.max(4, Math.round(g.u * 8));
  const bw = Math.floor(g.W / s), bh = Math.floor(g.H / s), on = new Uint8Array(bw * bh);
  for (let by = Math.round(g.Y(70) / s); by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let hit = 0, n = 0;
    for (let y = by * s; y < (by + 1) * s; y += 2) for (let x = bx * s; x < (bx + 1) * s; x += 2) { n++; if (isPanelCream(...rgbAt(img, x, y))) hit++; }
    if (hit >= n * 0.5) on[by * bw + bx] = 1;
  }
  const cs = components(on, bw, bh).map(c => ({ x: c.x0 * s, y: c.y0 * s, w: (c.x1 - c.x0 + 1) * s, h: (c.y1 - c.y0 + 1) * s, n: c.n }));
  const ok = cs.filter(c => c.w >= g.u * 240 && c.h >= g.u * 70 && c.w > c.h).sort((a, b) => b.n - a.n)[0];
  return ok ? { x: ok.x, y: ok.y, w: ok.w, h: ok.h } : null;
}

const BLUE = hueInk(180, 215, 0.35, 100);
function readSkillTip(img: RgbaImage, g: Geo): SkillTipRead | null {
  const p = biggestCream(img, g);
  if (!p) return null;
  const inner: Box = { x: p.x + g.u * 8, y: p.y, w: p.w - g.u * 16, h: Math.min(p.h, g.u * 60) };
  const ink = anyInk(darkInk, BLUE);
  const row = inkRows(img, inner, ink, 3).find(r => r.y1 - r.y0 + 1 >= g.u * 10);
  if (!row) return null;
  const box: Box = { x: inner.x, y: row.y0 - g.u * 4, w: inner.w, h: row.y1 - row.y0 + 1 + g.u * 8 };
  /* název vlevo, římské číslice vpravo za velkou mezerou */
  const all = segmentLine(img, box, ink, null);
  const gs = all.glyphs;
  if (!gs.length) return null;
  let cut = -1, gap = all.lineH * 1.5;
  for (let i = 1; i < gs.length; i++) { const d = gs[i].x0 - gs[i - 1].x1; if (d > gap) { gap = d; cut = i; } }
  const nameEnd = cut > 0 ? gs[cut - 1].x1 : gs[gs.length - 1].x1;
  const nl = readLine(img, { x: box.x, y: box.y, w: nameEnd + 2, h: box.h }, darkInk);
  const name: Read<string> = nl.text ? { value: words2(nl.text), conf: nl.conf, raw: nl.text } : none();
  const tip: SkillTipRead = { name, current: none(), next: none(), arrow: false };
  if (cut < 0) return tip;
  /* tvary vpravo: číslice (tmavá = aktuální, modrá = další) a modrá šipka mezi nimi */
  const rb: Box = { x: box.x + gs[cut].x0 - 2, y: box.y, w: gs[gs.length - 1].x1 - gs[cut].x0 + 5, h: box.h };
  const { mask, w, h } = maskOf(img, rb, ink);
  const parts = components(mask, w, h).filter(c => c.n >= 6).sort((a, b) => a.x0 - b.x0);
  const tall = Math.max(0, ...parts.map(c => c.y1 - c.y0 + 1));
  const blueShare = (c: { x0: number; y0: number; x1: number; y1: number }) => {
    let bl = 0, n = 0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
      if (!mask[y * w + x]) continue;
      n++; const [r, gg, b] = rgbAt(img, Math.round(rb.x) + x, Math.round(rb.y) + y); if (BLUE(r, gg, b, lum(r, gg, b))) bl++;
    }
    return n ? bl / n : 0;
  };
  /* šipka je modrý trojúhelník bez patek: horní řádek tvaru je úzký (číslice tam mají plnou patku) */
  const topShare = (c: { x0: number; y0: number; x1: number }) => { let n = 0; for (let x = c.x0; x <= c.x1; x++) n += mask[(c.y0 + 1) * w + x]; return n / (c.x1 - c.x0 + 1); };
  const items = parts.map(c => {
    const ch = c.y1 - c.y0 + 1, blue = blueShare(c) > 0.5;
    const arrow = blue && ch <= tall * 0.95 && topShare(c) < 0.5;
    return { blue, arrow, v: arrow ? null : romanOf(mask, w, c) };
  });
  const ai = items.findIndex(x => x.arrow);
  tip.arrow = ai >= 0;
  const nums = items.filter(x => !x.arrow);
  if (nums.some(x => x.v === null)) return tip;
  const R = (v: number, conf = 0.9): Read<number> => ({ value: v, conf, raw: ['', 'I', 'II', 'III', 'IV', 'V'][v] ?? String(v) });
  if (!tip.arrow && nums.length === 1 && !nums[0].blue) tip.current = R(nums[0].v!);
  else if (tip.arrow && nums.length === 2 && !nums[0].blue && nums[1].blue && items[ai - 1] && !items[ai - 1].arrow) {
    tip.current = R(nums[0].v!); tip.next = R(nums[1].v!);
  } else if (tip.arrow && nums.length === 1 && nums[0].blue) tip.next = R(nums[0].v!);
  return tip;
}

/* Součty větví: velké barevné číslo pod názvem větve (zelená Conditioning, žlutá Mobility, červená Survival). */
function readTotals(img: RgbaImage, g: Geo): SkillsRead['totals'] {
  const at = (cx: number, y: number, ink: PixelTest): Read<number> => {
    const r = readNumberIn(img, { x: g.C(cx) - g.u * 52, y: g.Y(y), w: g.u * 104, h: g.Y(44) }, ink);
    return r.value === null ? none(r.text) : { value: r.value, conf: r.conf, raw: r.text };
  };
  return { c: at(710, 878, hueInk(95, 170)), m: at(960, 610, hueInk(38, 70)), s: at(1260, 878, hueInk(340, 15)) };
}

/* ----- vstup ----- */
export function readProgress(img: RgbaImage): ProgressRead | null {
  if (!img.width || !img.height || img.data.length < img.width * img.height * 4) return null;
  const g = geo(img);
  const h = readHeader(img);
  const title = h.title.value ?? '', tab = h.tab.value ?? '';
  if (!h.back) {
    if (near(tab, 'RAIDER')) return readProfile(img, g);
    if (near(tab, 'WORKSHOP')) return readWorkshop(img, g);
    return null;
  }
  if (near(title, 'SKILL TREE')) return { screen: 'skills', totals: readTotals(img, g), tooltip: readSkillTip(img, g) };
  if (near(tab, 'QUESTS')) return readQuest(img, g, h);
  if (near((h.sub.value ?? '').slice(0, 5), 'LEVEL')) return readStation(img, g, h);
  return null;
}
