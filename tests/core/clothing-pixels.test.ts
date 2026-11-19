/* 0.34.0: pixelové testy oblečení nad skutečnými daty aplikace (src/assets, src/core/data). Snímky se skládají stejným
   plánem jako na plátně (planFrame + applyRepair) v nativní mřížce a kontroluje se ochranná zóna optiky jako ve
   validátoru návrhu (docs/design/buddy/clothing/tools/validate.py): obdélník opticClearance snímku z manifestu
   Bedňáka 2 rozšířený o q(3) vlevo, q(5) nahoře a dole a q(4) vpravo. V této zóně (hledí a LED) se složený snímek
   s oblečením nesmí lišit od snímku bez oblečení. Vzorek: všechny klipy a snímky obou variant a všech podob, v každém
   snímku jedna celá sada a jeden mix čtyř sad (sady se střídají). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { OPS, OPS_GEOMETRY, partById, type OpsVariantId } from '../../src/core/ops';
import { CLOTHING_SET_IDS, CLOTHING_SLOTS, pieceId, type Worn } from '../../src/core/clothing';
import { PALETTE_RGB, applyRepair, planFrame, type ClothingGeo } from '../../src/core/clothingPlan';
import { DEFAULT_PAINT, emoteKeepMask, paintMap, recolorPixels } from '../../src/core/paints';
import { isAutoEmote } from '../../src/core/opsEmote';

const ROOT = join(__dirname, '../..');
const pngs = new Map<string, PNG>();
const png = (path: string): PNG => { let p = pngs.get(path); if (!p) { p = PNG.sync.read(readFileSync(join(ROOT, path))); pngs.set(path, p); } return p; };
const geo = (v: string, f: string) => JSON.parse(readFileSync(join(ROOT, `src/core/data/clothing/${v}-${f}.json`), 'utf8')) as ClothingGeo;
const base = (v: OpsVariantId) => JSON.parse(readFileSync(join(ROOT, `docs/design/buddy/bednak2/${v === 'corner' ? 'ops-layers.json' : 'ops-layers-detail.json'}`), 'utf8').replace(/^﻿/, '')) as {
  forms: { id: string; states: Record<string, { frames: { opticClearance: [number, number, number, number] }[] }> }[];
};

/* natřené RGBA kopie (jako sprite.source: přesná záměna barev, u emocí maska LED proti idle) */
const paintedCache = new Map<string, Uint8Array>();
function painted(path: string, paint: string, idlePath?: string, frameW = 0): { data: Uint8Array; width: number; height: number } {
  const p = png(path);
  if (paint === DEFAULT_PAINT) return { data: p.data as unknown as Uint8Array, width: p.width, height: p.height };
  const key = paint + '|' + path + '|' + (idlePath ?? '');
  let d = paintedCache.get(key);
  if (!d) {
    d = Uint8Array.from(p.data);
    const idle = idlePath ? png(idlePath) : null;
    recolorPixels(d, paint, idle ? emoteKeepMask(d, p.width, p.height, idle.data, idle.width, frameW) : null);
    paintedCache.set(key, d);
  }
  return { data: d, width: p.width, height: p.height };
}
/* binární alfa: neprůhledný pixel zdroje přepíše cíl */
function blit(dst: Uint8Array, n: number, src: { data: Uint8Array; width: number }, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = dx + x, ty = dy + y;
    if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
    const i = ((sy + y) * src.width + sx + x) * 4;
    if (!src.data[i + 3]) continue;
    const j = (ty * n + tx) * 4;
    dst[j] = src.data[i]; dst[j + 1] = src.data[i + 1]; dst[j + 2] = src.data[i + 2]; dst[j + 3] = 255;
  }
}

interface Opts { variant: OpsVariantId; form: string; clip: string; frame: number; worn: Worn; level: number; paint?: string; geo: ClothingGeo | null; hides?: string[]; repair?: boolean; parts?: boolean }
/* Jeden snímek stejně jako drawOps: pořadí z plánu, oprava na dlaždici těla po nátěru, díly na kotvě + posun. */
function compose(o: Opts): Uint8Array {
  const g = OPS_GEOMETRY[o.variant], n = g.frameSize.width, paint = o.paint ?? DEFAULT_PAINT;
  const states = g.forms[o.form], st = states[o.clip];
  const ref = st.frames[o.frame];
  const out = new Uint8Array(n * n * 4);
  if (ref < 0) return out;
  const plan = planFrame(o.geo, o.clip, o.frame, o.worn);
  const hides = new Set(o.hides ?? plan.hides);
  const outfit = OPS.unlocks[Math.min(o.level, OPS.unlocks.length - 1)].defaultOutfit;
  const asset = (f: string) => 'src/assets/ops2/' + f;
  for (const layer of plan.layers) {
    if (layer.kind === 'body') {
      const strip = painted(asset(st.file), paint, st !== states.idle && isAutoEmote(o.clip) ? asset(states.idle.file) : undefined, n);
      const tile = new Uint8Array(n * n * 4);
      blit(tile, n, strip, o.frame * n, 0, n, n, 0, 0);
      if (plan.repair && o.repair !== false) {
        const m = paintMap(paint);
        applyRepair(tile, n, n, plan.repair.rle, plan.repair.x, plan.repair.y, PALETTE_RGB.map(c => m.get((c[0] << 16) | (c[1] << 8) | c[2]) ?? c));
      }
      blit(out, n, { data: tile, width: n }, 0, 0, n, n, 0, 0);
    } else if (layer.kind === 'cloth') {
      blit(out, n, painted(`src/assets/clothing/${o.geo!.atlas}`, paint), layer.sx, layer.sy, layer.w, layer.h, layer.x, layer.y);
    } else if (o.parts !== false && !hides.has(layer.slot)) {
      const id = outfit[layer.slot];
      const p = id ? partById(id) : undefined, a = g.anchors[ref][OPS.slots.indexOf(layer.slot)], pa = id ? g.parts[id] : undefined;
      if (!p || !a || !pa) continue;
      const im = painted(asset(pa.file), paint);
      const x = a[0] + pa.offset[0], y = a[1] + pa.offset[1];
      if (pa.frameSize) blit(out, n, im, Math.min(o.level, (p.frameCount ?? 1) - 1) * pa.frameSize.width, 0, pa.frameSize.width, pa.frameSize.height, x, y);
      else blit(out, n, im, 0, 0, im.width, im.height, x, y);
    }
  }
  return out;
}
const guardOf = (variant: OpsVariantId, optic: [number, number, number, number]) => {
  const n = OPS_GEOMETRY[variant].frameSize.width, q = (x: number) => Math.round(x * n / 128);
  const [L, T, R, B] = optic;
  return { x0: L - q(3), y0: T - q(5), x1: R + q(4) + 1, y1: B + q(5) + 1, n };
};
/* počet rozdílných pixelů v zóně */
function diffIn(a: Uint8Array, b: Uint8Array, g: ReturnType<typeof guardOf>): number {
  let d = 0;
  for (let y = Math.max(0, g.y0); y < Math.min(g.n, g.y1); y++) for (let x = Math.max(0, g.x0); x < Math.min(g.n, g.x1); x++) {
    const i = (y * g.n + x) * 4;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) d++;
  }
  return d;
}
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const fullSet = (set: string): Worn => Object.fromEntries(CLOTHING_SLOTS.map(s => [s, pieceId(set, s)]));
const mix = (k: number): Worn => Object.fromEntries(CLOTHING_SLOTS.map((s, i) => [s, pieceId(CLOTHING_SET_IDS[(k + i * 5) % 16], s)]));

describe('0.34.0 oblečení: pixely skutečných snímků', () => {
  for (const variant of ['corner', 'detail'] as const) {
    it(`${variant}: hledí a LED nikdy nezakryté (všechny podoby, klipy a snímky; celé sady i mixy)`, () => {
      const b = base(variant);
      let checked = 0, visibleCloth = 0, repaired = 0;
      const bad: string[] = [];
      for (const form of OPS.forms) {
        const gm = geo(variant, form.id), bf = b.forms.find(f => f.id === form.id)!;
        const level = form.levels[1];
        Object.keys(OPS.states).forEach((clip, ci) => {
          const frames = OPS_GEOMETRY[variant].forms[form.id][clip].frames;
          for (let i = 0; i < frames.length; i++) {
            if (frames[i] < 0) continue;
            const guard = guardOf(variant, bf.states[clip].frames[i].opticClearance);
            for (const worn of [fullSet(CLOTHING_SET_IDS[(ci + i) % 16]), mix(ci * 3 + i)]) {
              const plan = planFrame(gm, clip, i, worn);
              const cloth = plan.layers.filter(l => l.kind === 'cloth').length;
              visibleCloth += cloth;
              if (plan.repair) repaired++;
              /* s oblečením (i opravou) proti stejnému snímku se stejnými skrytými sloty bez oblečení */
              const withC = compose({ variant, form: form.id, clip, frame: i, worn, level, geo: gm });
              const without = compose({ variant, form: form.id, clip, frame: i, worn: {}, level, geo: gm, hides: plan.hides });
              const d1 = diffIn(withC, without, guard);
              /* jako validátor: jen tělo (opravené) + oblečení proti holému tělu */
              const bodyC = compose({ variant, form: form.id, clip, frame: i, worn, level, geo: gm, parts: false });
              const body = compose({ variant, form: form.id, clip, frame: i, worn: {}, level, geo: gm, parts: false });
              const d2 = diffIn(bodyC, body, guard);
              if (d1 || d2) bad.push(`${form.id}/${clip}/${i} ${JSON.stringify(worn)} ${d1}/${d2}`);
              checked++;
            }
          }
        });
      }
      expect(bad.slice(0, 5)).toEqual([]);
      expect(checked).toBeGreaterThan(5000);
      /* klipy kromě příchodu a odchodu oblečení opravdu kreslí; opravy těla se opravdu používají */
      expect(visibleCloth).toBeGreaterThan(checked * 3);
      expect(repaired).toBeGreaterThan(1000);
    }, 120_000);
  }

  it('příchod a odchod: snímek s oblečením je pixel po pixelu původní tělo s díly', () => {
    for (const variant of ['corner', 'detail'] as const) for (const form of ['explorer', 'legend']) {
      const gm = geo(variant, form);
      for (const clip of ['appear', 'dismiss']) {
        const frames = OPS_GEOMETRY[variant].forms[form][clip].frames;
        for (let i = 0; i < frames.length; i++) {
          const a = compose({ variant, form, clip, frame: i, worn: fullSet('drone'), level: 70, geo: gm });
          const b = compose({ variant, form, clip, frame: i, worn: {}, level: 70, geo: null });
          expect(same(a, b)).toBe(true);
        }
      }
    }
  });

  it('bez oblečení je snímek beze změny proti dosavadnímu skládání (geometrie načtená, nic nenosí)', () => {
    for (const variant of ['corner', 'detail'] as const) {
      const gm = geo(variant, 'scavenger');
      for (const clip of ['idle', 'talk', 'level-up', 'scan-ok']) {
        const a = compose({ variant, form: 'scavenger', clip, frame: 1, worn: {}, level: 40, geo: gm });
        const b = compose({ variant, form: 'scavenger', clip, frame: 1, worn: {}, level: 40, geo: null });
        expect(same(a, b)).toBe(true);
      }
    }
  });

  it('emoce skenu s nátěrem: měděné LED zůstanou nepřebarvené a oblečení je nezakryje', () => {
    for (const variant of ['corner', 'detail'] as const) {
      const b = base(variant);
      for (const form of ['rookie', 'veteran', 'legend']) {
        const gm = geo(variant, form), bf = b.forms.find(f => f.id === form)!;
        const n = OPS_GEOMETRY[variant].frameSize.width;
        /* měděnou linku LED má scan; scan-ok a scan-unsure svítí meruňkovou (ta je pevná vždy) */
        let leds = 0;
        for (const clip of ['scan', 'scan-ok', 'scan-unsure']) {
          const frames = OPS_GEOMETRY[variant].forms[form][clip].frames;
          for (let i = 0; i < frames.length; i++) {
            const guard = guardOf(variant, bf.states[clip].frames[i].opticClearance);
            for (const paint of ['night', 'uplink']) {
              const worn = fullSet(CLOTHING_SET_IDS[(i + 3) % 16]);
              const plan = planFrame(gm, clip, i, worn);
              const a = compose({ variant, form, clip, frame: i, worn, level: 70, geo: gm, paint });
              const c = compose({ variant, form, clip, frame: i, worn: {}, level: 70, geo: gm, paint, hides: plan.hides });
              expect(diffIn(a, c, guard)).toBe(0);
              /* měděné pixely v zóně optiky = nepřebarvené LED (nátěr měď mění) */
              for (let y = Math.max(0, guard.y0); y < Math.min(n, guard.y1); y++) for (let x = Math.max(0, guard.x0); x < Math.min(n, guard.x1); x++) {
                const j = (y * n + x) * 4;
                if (a[j + 3] && a[j] === 0xDE && a[j + 1] === 0x96 && a[j + 2] === 0x6F) leds++;
              }
            }
          }
        }
        expect(leds).toBeGreaterThan(0);
      }
    }
  }, 60_000);

  it('celočíselná poloha a díly celé uvnitř plátna v klipech, kde se kreslí', () => {
    for (const variant of ['corner', 'detail'] as const) for (const form of OPS.forms) {
      const gm = geo(variant, form.id), n = gm.size;
      for (const clip of ['idle', 'sleep', 'level-up', 'walk', 'laugh']) {
        const frames = OPS_GEOMETRY[variant].forms[form.id][clip].frames;
        for (let i = 0; i < frames.length; i++) for (const set of CLOTHING_SET_IDS) {
          const plan = planFrame(gm, clip, i, fullSet(set));
          const cloth = plan.layers.filter(l => l.kind === 'cloth');
          expect(cloth).toHaveLength(4);
          for (const l of cloth) if (l.kind === 'cloth') {
            expect([l.x, l.y, l.w, l.h].every(Number.isInteger)).toBe(true);
            expect(l.x >= 1 && l.y >= 1 && l.x + l.w < n && l.y + l.h < n).toBe(true);
          }
        }
      }
    }
  });
});
