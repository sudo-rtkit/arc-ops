/* 0.27.0: druh munice z ikony v místě zbraně (src/core/vision/ammoIcon.ts).
   V CI běží umělá místa: ikona nakreslená z uložených vzorů (odvozená data, ne herní grafika) a cizí tvary, které se
   za žádný druh vzít nesmí. Vlastní snímky hráče jen lokálně (tests/fixtures/vision/own, v .gitignore); bez nich se
   testy na nich přeskočí. Na nich se ověří čtení ve více rozlišeních a nezávislost vzorů (vzor bez snímku, na kterém
   se ověřuje: druh, pro který jiný snímek není, se nepozná, ale ani nevezme za jiný). */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { RgbaImage } from '../../src/core/vision/image';
import type { Box } from '../../src/core/vision/layout';
import {
  AMMO_MARGIN, AMMO_SURE, AMMO_TYPES, ICON_H, ICON_LEN, ICON_W, ammoIconArea, ammoIconOf, classifyAmmoIcon, gridRows, iconSimilarity, readAmmoType, templateGrid,
  type AmmoIconTemplate, type AmmoType,
} from '../../src/core/vision/ammoIcon';
import { AMMO_ICONS } from '../../src/core/vision/ammoIcons';
import { readAmmo } from '../../src/core/vision/equip';
import { readLoadout } from '../../src/core/vision/loadout';
import { equipShapes } from '../../src/core/equipCatalog';
import { CREAM, canvas, disc, rect, text as drawText } from './progress-synth';
import { AMMO_SAMPLES, scaled } from './ammo-samples';

const BG: [number, number, number] = [12, 15, 26];
/* prázdné místo zbraně (k = měřítko proti 1080p: místo 304 × 200) */
function slot(k = 1): { img: RgbaImage; box: Box } {
  const img = canvas(Math.round(340 * k), Math.round(240 * k), BG);
  return { img, box: { x: 18 * k, y: 20 * k, w: 304 * k, h: 200 * k } };
}
/* ikona ze vzoru: každé pole mřížky jako čtverec cell × cell px, barva podle podílu inkoustu mezi podkladem a krémovou */
function drawTemplate(img: RgbaImage, box: Box, t: AmmoIconTemplate, cell: number) {
  const v = templateGrid(t)!;
  const a = ammoIconArea(box);
  const x0 = Math.round(a.x + 2), y0 = Math.round(a.y + (a.h - ICON_H * cell) / 2);
  for (let gy = 0; gy < ICON_H; gy++) for (let gx = 0; gx < ICON_W; gx++) {
    const p = v[gy * ICON_W + gx];
    const c = BG.map((b, i) => Math.round(b + (CREAM[i] - b) * p)) as [number, number, number];
    rect(img, x0 + gx * cell, y0 + gy * cell, cell, cell, c);
  }
}
/* řádek munice vpravo od ikony a výdrž (jako ve hře) */
function ammoLine(img: RgbaImage, box: Box, ammo: string) {
  const h = Math.round(box.h * 0.07), y = Math.round(box.y + box.h * 0.905 - h / 2);
  drawText(img, Math.round(box.x + box.w * 0.135), y, h, ammo, CREAM);
  drawText(img, Math.round(box.x + box.w * 0.68), y, h, '100/100', CREAM);
}
const icon = (box: Box) => { const a = ammoIconArea(box); return { x: Math.round(a.x + 3), y: Math.round(a.y + a.h * 0.12), s: Math.round(a.h * 0.76) }; };

describe('0.27.0: vzory ikony druhu munice (src/core/vision/ammoIcons.ts)', () => {
  it('lehká, střední a těžká ve třech měřítkách; vzory jsou celé a různé druhy si nejsou podobné', () => {
    const grids = AMMO_ICONS.map(t => ({ t: t.t, v: templateGrid(t) }));
    expect(grids.every(g => g.v && g.v.length === ICON_LEN)).toBe(true);
    for (const t of ['light', 'medium', 'heavy'] as const) expect(AMMO_ICONS.filter(x => x.t === t)).toHaveLength(3);
    expect(AMMO_ICONS.every(t => AMMO_TYPES.includes(t.t) && t.a > 0.5 && t.a < 2)).toBe(true);
    for (const a of grids) for (const b of grids) {
      const s = iconSimilarity(a.v!, b.v!);
      if (a.t === b.t) expect(s, `${a.t}`).toBeGreaterThan(0.75);
      else expect(s, `${a.t} × ${b.t}`).toBeLessThan(0.2);
    }
    /* mřížka tam a zpět */
    expect(gridRows(templateGrid(AMMO_ICONS[0])!)).toEqual(AMMO_ICONS[0].rows);
    /* vadný vzor se nepoužije */
    expect(templateGrid({ t: 'light', a: 1, rows: ['zz'] })).toBeNull();
    expect(AMMO_SURE - AMMO_MARGIN).toBeGreaterThan(0.5);
  });
  it('katalog zbraní: každá zbraň má druh munice (MetaForge), známé zbraně správně', () => {
    const weapons = equipShapes().filter(e => e.kind === 'weapon');
    expect(weapons.every(e => e.ammo && AMMO_TYPES.includes(e.ammo))).toBe(true);
    const ammoOf = (n: string) => weapons.find(e => e.name === n)?.ammo;
    expect([ammoOf('Stitcher'), ammoOf('Kettle'), ammoOf('Rattler'), ammoOf('Anvil'), ammoOf('Ferro'), ammoOf('Torrente')]).toEqual(['light', 'light', 'medium', 'heavy', 'heavy', 'medium']);
  });
});

describe('0.27.0: čtení ikony na umělém místě zbraně', () => {
  it('ikona nakreslená ze vzoru se pozná v různém měřítku; řádek munice se čte dál', () => {
    for (const t of AMMO_ICONS) for (const [k, cell] of [[1, 2], [1.4, 3], [2, 4]] as const) {
      const { img, box } = slot(k);
      drawTemplate(img, box, t, cell);
      ammoLine(img, box, '0/20');
      const r = readAmmoType(img, box);
      expect(r, `${t.t} ×${k}`).toMatchObject({ type: t.t, best: t.t });
      expect(r.score).toBeGreaterThanOrEqual(AMMO_SURE);
      expect(readAmmo(img, box), `${t.t} ×${k}`).toEqual({ loaded: 0, max: 20 });
    }
  });
  it('bez ikony, s malou ikonou nebo s cizím tvarem nic: druh se nehádá', () => {
    /* prázdné místo a samotný text munice */
    const empty = slot();
    expect(ammoIconOf(empty.img, empty.box)).toBeNull();
    expect(readAmmoType(empty.img, empty.box)).toEqual({ type: null, best: null, score: 0, second: 0 });
    ammoLine(empty.img, empty.box, '0/20');
    expect(readAmmoType(empty.img, empty.box).type).toBeNull();
    /* ikona nižší než polovina pruhu (text, šum) */
    const low = slot();
    { const a = ammoIconArea(low.box); rect(low.img, Math.round(a.x + 3), Math.round(a.y + a.h * 0.4), 20, Math.round(a.h * 0.3), CREAM); }
    expect(ammoIconOf(low.img, low.box)).toBeNull();
    /* cizí tvary (jiný druh munice, pro který vzor není): kruh, dva tlusté náboje, plný čtverec, šikmý náboj opačně */
    const shapes: [string, (img: RgbaImage, box: Box) => void][] = [
      ['kruh', (img, box) => { const i = icon(box); disc(img, i.x + i.s / 2, i.y + i.s / 2, Math.round(i.s / 2), CREAM); }],
      ['dva náboje', (img, box) => { const i = icon(box); const w = Math.round(i.s * 0.38); rect(img, i.x, i.y, w, i.s, CREAM); rect(img, i.x + i.s - w, i.y, w, i.s, CREAM); rect(img, i.x, i.y + Math.round(i.s * 0.7), i.s, 2, BG); }],
      ['čtverec', (img, box) => { const i = icon(box); rect(img, i.x, i.y, i.s, i.s, CREAM); }],
      ['opačná diagonála', (img, box) => { const i = icon(box); for (let d = 0; d < i.s; d++) rect(img, i.x + i.s - d - 4, i.y + d, 5, 1, CREAM); }],
      ['blesk', (img, box) => { const i = icon(box); for (let d = 0; d < i.s / 2; d++) rect(img, i.x + i.s / 2 - d / 2, i.y + d, 6, 1, CREAM); for (let d = 0; d < i.s / 2; d++) rect(img, i.x + i.s / 4 + d / 2, i.y + i.s / 2 + d, 6, 1, CREAM); }],
    ];
    for (const [name, paint] of shapes) {
      const { img, box } = slot();
      paint(img, box);
      ammoLine(img, box, '0/5');
      const r = readAmmoType(img, box);
      expect(r.type, `${name}: ${r.best} ${r.score}`).toBeNull();
    }
  });
  it('vzory jen jiných druhů: ikona se nepozná (nejisté), nikdy se nevezme za jiný druh', () => {
    for (const t of ['light', 'medium', 'heavy'] as const) {
      const { img, box } = slot();
      /* vzor 1920 px daného druhu */
      drawTemplate(img, box, AMMO_ICONS.filter(x => x.t === t)[1], 2);
      expect(readAmmoType(img, box, AMMO_ICONS.filter(x => x.t !== t)).type, t).toBeNull();
    }
    expect(classifyAmmoIcon(null)).toMatchObject({ type: null });
    expect(classifyAmmoIcon({ v: [1, 2], aspect: 1 })).toMatchObject({ type: null });
  });
  it('nepřiměřeně velký vstup: výřez je omezený místem zbraně', () => {
    const { img, box } = slot();
    const a = ammoIconArea(box);
    expect(a.w * a.h).toBeLessThan(box.w * box.h * 0.03);
    /* místo mimo obraz nic nečte */
    expect(ammoIconOf(img, { x: 5000, y: 5000, w: 304, h: 200 })).toBeNull();
  });
});

/* ----- vlastní snímky hráče (jen lokálně) ----- */
const OWN = new URL('../fixtures/vision/own/', import.meta.url);
const has = (n: string) => existsSync(new URL(n, OWN));
const load = (n: string): RgbaImage => { const p = PNG.sync.read(readFileSync(new URL(n, OWN))); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
const SAMPLES = AMMO_SAMPLES.filter(s => has(s[0]));
/* snímek a místa výbavy jen jednou (čtení celé obrazovky je pomalé) */
const cache = new Map<string, { img: RgbaImage; boxes: Record<string, Box> }>();
const shot = (n: string) => { let c = cache.get(n); if (!c) { const img = load(n); c = { img, boxes: Object.fromEntries(readLoadout(img)!.equip.map(e => [e.slot, e.box])) }; cache.set(n, c); } return c; };

describe('0.27.0: ikona munice na vlastních snímcích (jen lokálně)', () => {
  it.skipIf(!SAMPLES.length)('druh munice se pozná v rozlišení 1366–3840 px; pod tím je čtení nejisté, nikdy špatné', () => {
    const lines: string[] = [];
    /* dvě místa téhož snímku jdou po sobě: snímek, jeho čtení a zvětšeniny se spočítají jednou na snímek */
    let cur = '', src: RgbaImage | undefined, equip: NonNullable<ReturnType<typeof readLoadout>>['equip'] = [];
    const sized = new Map<number, RgbaImage>();
    for (const [file, slotId, want, weapon] of SAMPLES) {
      if (file !== cur) { cur = file; src = load(file); equip = readLoadout(src)!.equip; sized.clear(); }
      const e = equip.find(x => x.slot === slotId)!;
      expect(e.ammoType, `${file} ${slotId}`).toBe(want);
      for (const width of [1280, 1366, 1600, 1920, 2560, 3200, 3840]) {
        const s = scaled(src!, e.box, width, sized);
        const r = readAmmoType(s.img, s.box);
        lines.push(`${weapon} ${width}: ${want} → ${r.type ?? '(' + r.best + ')'} ${r.score} / ${r.second}`);
        if (width >= 1366) expect(r.type, `${weapon} ${width}`).toBe(want);
        else expect([null, want], `${weapon} ${width}`).toContain(r.type);
      }
    }
    console.log(['druh munice z ikony (vlastní snímky):', ...lines].join('\n'));
  }, 120_000);
  it.skipIf(!SAMPLES.length)('vzory bez snímku, na kterém se ověřuje: stejný druh z jiného snímku se pozná, druh bez jiného snímku je nejistý', () => {
    for (const [file, slotId, want, weapon] of SAMPLES) {
      const { img: src, boxes } = shot(file);
      const e = { box: boxes[slotId] };
      /* vzory z ostatních snímků (průměr, jen 1920 px) */
      const others = AMMO_SAMPLES.filter(s => s[0] !== file && has(s[0]));
      const templates: AmmoIconTemplate[] = [];
      for (const t of AMMO_TYPES) {
        const from = others.filter(s => s[2] === t);
        if (!from.length) continue;
        const acc = new Array(ICON_LEN).fill(0);
        let asp = 0;
        for (const [f, sl] of from) {
          const c = shot(f);
          const ic = ammoIconOf(c.img, c.boxes[sl])!;
          ic.v.forEach((x, i) => { acc[i] += x; });
          asp += ic.aspect;
        }
        templates.push({ t, a: asp / from.length, rows: gridRows(acc.map(x => x / from.length)) });
      }
      const r = readAmmoType(src, e.box, templates);
      const known: AmmoType[] = templates.map(t => t.t);
      if (known.includes(want)) expect(r.type, `${weapon}: ${r.best} ${r.score}`).toBe(want);
      else expect(r.type, `${weapon} bez vzoru ${want}: ${r.best} ${r.score}`).toBeNull();
    }
  }, 120_000);
});
