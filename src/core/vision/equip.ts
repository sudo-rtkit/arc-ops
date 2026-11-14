/* 0.24.0: rozpoznání zbraní a augmentu v místech výbavy (MANAGE LOADOUT, FINDINGS po raidu, inventář v raidu).
   Místa výbavy nejsou čtvercová políčka: zbraň je velký vodorovný obrázek (na šířku místa), augment malá ikona.
   Otisk ikony z políček (fingerprint.ts) tu nestačí, protože předpokládá ikonu v políčku v pevném měřítku. Proto
   „tvar“ normalizovaný měřítkem: popředí (světlé pixely mimo barvu vzácnosti) se ořízne na nejmenší obdélník,
   ten se roztáhne na pevnou mřížku SHAPE_W × SHAPE_H a k tomu se pamatuje poměr stran obdélníku. Stejná funkce
   počítá tvar ze snímku i z ikony katalogu (scripts/gen-equip.mjs), takže měřítko ani rozlišení nehrají roli.
   Ikony zbraní v katalogu jsou natočené šikmo (asi o 32°); skript je narovná a uloží tvar pro tři úhly.
   Rozhodnutí: shoda tvaru (korelace), odstup od druhého nejlepšího předmětu, poměr stran, vzácnost místa
   a u zbraní velikost zásobníku z řádku munice („0/20“: zásobník menší než základní u zbraně být nemůže).
   Pod prahem zůstane místo neznámé a jde ke kontrole; nic se nehádá. Tier zbraně se čte z římské číslice vpravo
   dole. Čisté funkce, jen čtou pixely; výsledek jsou čísla, ne obrazová data.
   0.25.0: zbraň s doplňkem (tlumič, jiná pažba, zásobník) má jiný obrys než ikona katalogu, takže shoda tvaru
   klesne pod práh (0,62–0,71), i když je správný kandidát první. Druhá cesta k jistotě je zásobník: přečtená
   velikost („0/82“) musí být základ zásobníku pro přečtený tier, nebo základ plus jedno zvětšení doplňkem pro druh
   munice zbraně (data MetaForge). Když tomu z kandidátů stejné vzácnosti odpovídá jediná zbraň a ta je zároveň
   první podle tvaru, je to jisté (via 'magazine'). Volnější hledání tvaru (obrys katalogu kdekoli uvnitř obrysu
   na snímku) se zkoušelo a nepoužívá se: zvedlo i cizí zbraně a u Anvilu s tlumičem dalo první Renegade. */
import { hueSat, rgbAt, type RgbaImage } from './image';
import type { Box } from './layout';
import { frac } from './cells';
import { components, isCream, isGrey, maskOf, numberTokens, tierOfShape, type Tier } from './digits';
import type { Rarity } from './rarity';

export const SHAPE_W = 32;
export const SHAPE_H = 12;
export const SHAPE_LEN = SHAPE_W * SHAPE_H;
/* Popředí: jas nad tímto prahem (tmavý podklad místa i šedá silueta prázdného místa jsou pod ním). */
export const FG_LUM = 62;

export interface Shape { v: number[]; aspect: number }

const lumOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const dist2 = (a: [number, number, number], r: number, g: number, b: number) => (a[0] - r) ** 2 + (a[1] - g) ** 2 + (a[2] - b) ** 2;

/* Pixel popředí: dost jasný a ne barva vzácnosti (velký barevný roh místa zbraně zasahuje do výřezu vlevo dole). */
function isFg(r: number, g: number, b: number, rarityRgb: [number, number, number] | null): boolean {
  if (lumOf(r, g, b) <= FG_LUM) return false;
  if (rarityRgb && dist2(rarityRgb, r, g, b) < 60 * 60) return false;
  const h = hueSat(r, g, b);
  /* plná modrá, zelená, fialová nebo zlatá plocha (roh vzácnosti bez přečtené barvy) není kov zbraně */
  return !(h.s > 0.55 && h.v > 90 && !(h.h >= 15 && h.h < 45));
}

/* Hranice popředí v jedné ose: od 0,5 % do 99,5 % hmoty (osamělý světlý pixel obdélník nerozšíří). */
function span(counts: Float64Array, total: number): [number, number] {
  const lo = total * 0.005, hi = total * 0.995;
  let acc = 0, a = 0, b = counts.length - 1;
  for (let i = 0; i < counts.length; i++) { acc += counts[i]; if (acc > lo) { a = i; break; } }
  acc = 0;
  for (let i = 0; i < counts.length; i++) { acc += counts[i]; if (acc >= hi) { b = i; break; } }
  return [a, b];
}

/* Tvar popředí ve výřezu. null = popředí skoro žádné (prázdné místo, zástupný symbol). */
/* pad = okraj kolem obdélníku popředí (podíl jeho rozměru): plný tvar (krabička augmentu) bez okraje nemá obrys,
   takže by korelace porovnávala jen texturu; s okrajem rozhoduje obrys. */
export function shapeOf(img: RgbaImage, area: Box, rarityRgb: [number, number, number] | null = null, minPx = 40, pad = 0): Shape | null {
  const x0 = Math.max(0, Math.round(area.x)), y0 = Math.max(0, Math.round(area.y));
  const w = Math.max(0, Math.min(Math.round(area.w), img.width - x0)), h = Math.max(0, Math.min(Math.round(area.h), img.height - y0));
  if (w < 4 || h < 4) return null;
  /* šedá barva běžné vzácnosti je i barva kovu: jako pozadí se bere jen sytá barva vzácnosti */
  if (rarityRgb && hueSat(...rarityRgb).s < 0.3) rarityRgb = null;
  const val = new Float32Array(w * h);
  const cols = new Float64Array(w), rows = new Float64Array(h);
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = rgbAt(img, x0 + x, y0 + y);
    if (!isFg(r, g, b, rarityRgb)) continue;
    val[y * w + x] = lumOf(r, g, b);
    cols[x]++; rows[y]++; n++;
  }
  if (n < minPx) return null;
  const [sx0, sx1] = span(cols, n), [sy0, sy1] = span(rows, n);
  const sw = sx1 - sx0 + 1, sh = sy1 - sy0 + 1;
  if (sw < 3 || sh < 3) return null;
  /* okraj může sahat mimo výřez: pole mimo výřez mají jas 0 (pozadí) */
  const px = Math.round(sw * pad), py = Math.round(sh * pad);
  const bx0 = sx0 - px, by0 = sy0 - py, bw = sw + 2 * px, bh = sh + 2 * py;
  /* průměr jasu popředí (pozadí = 0) v každém poli mřížky; pole menší než pixel bere aspoň jeden pixel */
  const v: number[] = [];
  for (let gy = 0; gy < SHAPE_H; gy++) {
    const ya = by0 + Math.floor((gy * bh) / SHAPE_H), yb = Math.max(ya + 1, by0 + Math.floor(((gy + 1) * bh) / SHAPE_H));
    for (let gx = 0; gx < SHAPE_W; gx++) {
      const xa = bx0 + Math.floor((gx * bw) / SHAPE_W), xb = Math.max(xa + 1, bx0 + Math.floor(((gx + 1) * bw) / SHAPE_W));
      let s = 0, k = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { k++; if (y >= 0 && x >= 0 && y < h && x < w) s += val[y * w + x]; }
      v.push(Math.round(k ? s / k : 0));
    }
  }
  return { v, aspect: Math.round((sw / sh) * 1000) / 1000 };
}

/* Korelace dvou tvarů (středěný kosinus), 0–1. */
export function shapeSimilarity(a: number[], b: number[]): number {
  if (a.length !== SHAPE_LEN || b.length !== SHAPE_LEN) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < SHAPE_LEN; i++) { ma += a[i]; mb += b[i]; }
  ma /= SHAPE_LEN; mb /= SHAPE_LEN;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < SHAPE_LEN; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; }
  return aa && bb ? Math.max(0, ab / Math.sqrt(aa * bb)) : 0;
}

/* ----- katalog tvarů ----- */
export type EquipKind = 'weapon' | 'augment';
/* Položka katalogu tvarů (src/core/data/equipShapes.ts). shapes = tvar pro několik úhlů narovnání ikony.
   mag = základní zásobník (tier I), magTiers = zásobník pro tiery I–IV (když se liší), magAdd = možná zvětšení
   zásobníku doplňkem (prázdné = zbraň doplněk zásobníku nemá; chybí = nevíme, kontroluje se jen dolní mez). */
export interface EquipShape { name: string; kind: EquipKind; rarity?: Rarity; mag?: number; magTiers?: number[]; magAdd?: number[]; shapes: Shape[] }

/* Prahy podle vlastních snímků hráče (tests/vision/loadout.test.ts): stejná zbraň bez doplňků 0,79–0,89, nejlepší
   jiná ≤ 0,74; augment 0,96. Poměr stran stejné zbraně ±3 %, se tlumičem nebo jinou pažbou o 15–60 % jiný.
   high = jisté (zapíše se); medium = jen návrh do kontroly (nikdy se nezapíše sám); jinak neznámé. */
export const SHAPE_SURE = 0.8;
export const SHAPE_MARGIN = 0.07;
export const SHAPE_MAYBE = 0.75;
export const SHAPE_MAYBE_MARGIN = 0.04;
/* největší dovolený rozdíl poměru stran (násobek) */
export const ASPECT_TOL = 1.15;
/* 0.25.0, jistota přes zásobník: nejnižší shoda tvaru, nejmenší odstup prvního od druhého (oba bez ohledu na zásobník)
   a největší rozdíl poměru stran (doplňky ho mění: na snímcích hráče 1,22–1,34×). */
export const MAG_SHAPE_MIN = 0.6;
export const MAG_SHAPE_GAP = 0.03;
export const ASPECT_MOD_TOL = 1.5;

export type FieldConf = 'high' | 'medium' | 'unknown';
export interface ShapeMatch {
  /* název jen při jisté shodě (high) */
  name: string | null;
  /* jistota 0–1 (skóre nejlepšího kandidáta, i pod prahem) a úroveň */
  score: number; conf: FieldConf;
  /* nejlepší kandidát (návrh pro kontrolu; při medium a unknown se do dat nezapisuje) a skóre druhého */
  best: string | null; second: number;
  /* proč není jisté: bez tvaru, nízká shoda, malý odstup, poměr stran, 0.25.0 zásobník nesedí */
  why?: 'none' | 'score' | 'margin' | 'aspect' | 'magazine';
  /* 0.25.0: jistá shoda potvrzená zásobníkem (tvar sám pod prahem kvůli doplňku) */
  via?: 'magazine';
}

const rarityOk = (a: Rarity | undefined, b: Rarity | undefined) => !a || !b || a === 'unknown' || b === 'unknown' || a === b;
const aspectOk = (a: number, b: number) => a > 0 && b > 0 && Math.max(a / b, b / a) <= ASPECT_TOL;

const TIER_IDX: Record<Tier, number> = { I: 0, II: 1, III: 2, IV: 3 };
/* Sedí přečtený zásobník ke zbrani? true = ano (základ pro tier, nebo základ + jedno zvětšení doplňkem), false = ne,
   null = nedá se říct (zbraň bez údaje o zásobníku). Bez přečteného tieru platí kterýkoli tier. Když nevíme, jak
   doplněk zásobník zvětšuje (magAdd chybí), kontroluje se jen dolní mez: false pod základem, jinak null. */
export function magFits(e: Pick<EquipShape, 'mag' | 'magTiers' | 'magAdd'>, read: number, tier: Tier | null = null): boolean | null {
  if (!e.mag) return null;
  const bases = e.magTiers?.length === 4 ? (tier ? [e.magTiers[TIER_IDX[tier]]] : e.magTiers) : [e.mag];
  if (!e.magAdd) return bases.some(b => read >= b) ? null : false;
  return bases.some(b => read === b || e.magAdd!.some(d => read === b + d));
}

/* Nejlepší shoda tvaru v katalogu daného druhu. Kandidáti jen se stejnou vzácností jako místo; u zbraní jen ti,
   jejichž základní zásobník není větší než přečtený (magMax; doplněk zásobník jen zvětší, null = nepřečteno).
   0.25.0: jistá shoda podle tvaru navíc vyžaduje, aby k ní přečtený zásobník seděl (magFits není false); druhá cesta
   k jistotě je zásobník (viz hlavička souboru). tier = přečtený tier zbraně (null = nepřečteno). */
export function matchShape(shape: Shape | null, kind: EquipKind, rarity: Rarity, list: EquipShape[], magMax: number | null = null, tier: Tier | null = null): ShapeMatch {
  if (!shape) return { name: null, score: 0, conf: 'unknown', best: null, second: 0, why: 'none' };
  /* všichni kandidáti stejného druhu a vzácnosti, bez ohledu na zásobník */
  const all: { e: EquipShape; s: number; aspect: number; fits: boolean | null }[] = [];
  for (const e of list) {
    if (e.kind !== kind || !rarityOk(rarity, e.rarity)) continue;
    let s = 0, aspect = 0;
    for (const x of e.shapes) { const v = shapeSimilarity(shape.v, x.v); if (v > s) { s = v; aspect = x.aspect; } }
    all.push({ e, s, aspect, fits: kind === 'weapon' && magMax !== null ? magFits(e, magMax, tier) : null });
  }
  all.sort((a, b) => b.s - a.s);
  /* 0.24.0: zbraň se základním zásobníkem větším než přečtený nepřichází v úvahu */
  const scored = all.filter(x => !(kind === 'weapon' && magMax !== null && x.e.mag && magMax < x.e.mag));
  const top = scored[0];
  if (!top) return { name: null, score: 0, conf: 'unknown', best: null, second: 0, why: 'none' };
  const second = scored.find(x => x.e.name !== top.e.name)?.s ?? 0;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const base = { score: r3(top.s), best: top.e.name, second: r3(second) };
  const gap = top.s - second, shapeOk = aspectOk(shape.aspect, top.aspect);
  if (shapeOk && top.s >= SHAPE_SURE && gap >= SHAPE_MARGIN && top.fits !== false) return { name: top.e.name, conf: 'high', ...base };
  /* 0.25.0: zásobník. První podle tvaru (ze všech kandidátů) je jediný, ke komu přečtený zásobník sedí; kandidát
     bez údaje o zásobníku (fits null) se počítá jako možný, takže jedinečnost nedá. Jen u přečtené vzácnosti místa
     (bez ní je kandidátů moc a jedinečnost náhodná). Zbývající riziko: nová zbraň, která v katalogu ještě není, a
     zásobník, který náhodou sedí jediné podobné zbrani (na snímcích hráče 20 z 3 000 zkoušek, jen u chybějícího
     Stitcheru se zásobníkem 8/13/18/23 → Hairpin); proto katalog přegenerovat po každé aktualizaci hry. */
  const first = all[0];
  if (rarity !== 'unknown' && first === top && first.fits === true && all.every(x => x === first || x.fits === false)) {
    const rival = all.find(x => x.e.name !== first.e.name)?.s ?? 0;
    const modOk = shape.aspect > 0 && first.aspect > 0 && Math.max(shape.aspect / first.aspect, first.aspect / shape.aspect) <= ASPECT_MOD_TOL;
    if (modOk && first.s >= MAG_SHAPE_MIN && first.s - rival >= MAG_SHAPE_GAP) return { name: first.e.name, conf: 'high', ...base, second: r3(rival), via: 'magazine' };
  }
  const why: ShapeMatch['why'] = !shapeOk ? 'aspect' : top.fits === false ? 'magazine' : top.s < SHAPE_SURE ? 'score' : 'margin';
  const maybe = shapeOk && top.s >= SHAPE_MAYBE && gap >= SHAPE_MAYBE_MARGIN && top.fits !== false;
  return { name: null, conf: maybe ? 'medium' : 'unknown', ...base, why };
}

/* ----- místo zbraně: oblasti ----- */
/* Obrázek zbraně: horní polovina místa (pod ním řada doplňků, dole pruh s municí, výdrží a tierem). */
export const weaponImageArea = (b: Box): Box => frac(b, 0.08, 0.03, 0.92, 0.54);
/* Ikona augmentu: střed místa bez zámku vpravo nahoře a bez pruhu dole. */
export const augmentImageArea = (b: Box): Box => frac(b, 0.12, 0.04, 0.84, 0.74);
/* okraj tvaru augmentu (viz shapeOf) */
export const AUGMENT_PAD = 0.15;
/* Pruh dole: munice „0/20“ a výdrž „100/100“ (krémový text), vpravo tier. */
export const ammoArea = (b: Box): Box => frac(b, 0.1, 0.83, 0.9, 0.985);
export const weaponTierArea = (b: Box): Box => frac(b, 0.9, 0.83, 0.985, 0.985);

/* Munice a výdrž z pruhu dole. Ikona munice vlevo se nečte (není číslo). null = nepřečteno.
   0.25.0: munice je vlevo, výdrž („64/110“) vpravo; bere se jen číslo v levé polovině místa, aby nepřečtená munice
   nevzala výdrž jako zásobník (zásobník rozhoduje o jistotě zbraně). */
export function readAmmo(img: RgbaImage, box: Box): { loaded: number; max: number } | null {
  const toks = numberTokens(img, ammoArea(box), isCream).filter(t => /^\d{1,3}\/\d{1,3}$/.test(t.text) && t.x0 < box.x + box.w * 0.5);
  if (!toks.length) return null;
  const [a, b] = toks[0].text.split('/').map(Number);
  if (b < 1 || a > b * 2) return null;
  return { loaded: a, max: b };
}

/* Tier zbraně: šedá římská číslice vpravo v pruhu (stejný tvar jako v políčku, jen větší). Rámeček místa a barevný
   roh vpravo dole se vynechají: číslice je nejvyšší souvislá šedá oblast výřezu. */
export function readWeaponTier(img: RgbaImage, box: Box): Tier | null {
  const { mask, w, h } = maskOf(img, weaponTierArea(box), isGrey);
  const cs = components(mask, w, h).filter(c => c.n >= 6 && c.y1 - c.y0 + 1 >= h * 0.35 && c.x1 < w - 1);
  if (!cs.length) return null;
  const c = cs.sort((a, b) => b.n - a.n)[0];
  return tierOfShape(mask, w, c);
}
