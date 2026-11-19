/* Přenese finální oblečení Opse / Bedňáka (0.34.0) z návrhu (docs/design/buddy/clothing) do aplikace v kompaktní
   podobě. Výtvarný výsledek se nemění: každý pixel zůstane přesně stejný (skript to po zápisu ověří zpětným čtením).
   - src/core/data/clothing.json: malá společná data (ID sad, sloty, pořadí kreslení, skrývané stávající sloty,
     skryté klipy, odemykání podle unlockSuggestions, pořadí barev palety). Importuje se hned (ověřování ID ve store),
     má asi 1 kB, takže okna bez šatníku skoro nic navíc nenačtou.
   - src/core/data/clothing-names.json: názvy sad a dílů cs/en (jen šatník a hláška v hlavním okně).
   Paleta a pravidla nátěru se ověří proti src/core/paints.ts (stejné barvy, stejné přemalované a pevné barvy).
   - src/core/data/clothing/<varianta>-<podoba>.json: geometrie jedné varianty a podoby (umístění dílů v atlasu,
     společná tabulka pohybu po snímcích, opravy těla). Načítá se líně (dynamický import), jen když Ops něco nosí
     nebo je otevřený šatník, a jen pro právě kreslenou variantu a podobu. Výrazy (expressions) aplikace nekreslí,
     proto se nepřenáší.
   - src/assets/clothing/<varianta>-<podoba>.png: atlas 64 dílů jedné varianty a podoby (místo 64 samostatných PNG).
   Opravy těla (2 641 párů maska/obnova, v DETAIL samé masky) se ukládají jako řádkové běhy (RLE): maska = běhy
   pixelů, které se z těla vymažou; obnova = běhy pixelů s indexem barvy palety. Duplicitní opravy se v rámci
   podoby sloučí. Runtime je aplikuje přímo na dlaždici těla (src/core/clothingPlan.ts), bez tisíců obrázků.
   Spuštění: node scripts/gen-clothing-assets.mjs. Nic nestahuje, do návrhové složky nic nezapisuje. */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'docs/design/buddy/clothing');
const outPng = join(root, 'src/assets/clothing');
const outGeo = join(root, 'src/core/data/clothing');
const M = JSON.parse(readFileSync(join(src, 'clothing.json'), 'utf8').replace(/^﻿/, ''));
const OPS = JSON.parse(readFileSync(join(root, 'src/core/data/ops2.json'), 'utf8'));
const fail = msg => { throw new Error('gen-clothing-assets: ' + msg); };
const same = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(what + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };

/* ----- kontrola manifestu proti stávajícímu Opsovi ----- */
if (M.version !== 1) fail('neznámá verze manifestu ' + M.version);
const SLOTS = M.slots;
same(SLOTS, ['headwear', 'torso', 'neck', 'back'], 'sloty');
same(M.drawOrder.filter(s => !SLOTS.includes(s)), OPS.drawOrder, 'drawOrder bez oblečení');
for (const s of SLOTS) {
  const r = M.slotRules[s];
  if (!r || r.replaces !== s) fail('slotRules.' + s);
  for (const h of r.hides) if (!OPS.slots.includes(h)) fail('neznámý skrývaný slot ' + h);
}
const PALETTE = Object.entries(M.palette).map(([k, v]) => [k, v.toUpperCase()]);
if (PALETTE.length !== 20) fail('paleta');
/* paleta a nátěr musí sedět se src/core/paints.ts (aplikace přebarvuje oblečení stejnou mapou jako tělo) */
{
  const paints = readFileSync(join(root, 'src/core/paints.ts'), 'utf8');
  const pal = paints.match(/OPS_PALETTE = \{([^}]*)\}/)[1];
  const known = Object.fromEntries([...pal.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map(m => [m[1], m[2].toUpperCase()]));
  same(Object.fromEntries(PALETTE), known, 'paleta proti paints.ts');
  const list = name => [...paints.match(new RegExp(name + '[^=]*= \\[([^\\]]*)\\]'))[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
  same(M.paint.swap, list('PAINT_SWAP'), 'paint.swap');
  same(M.paint.keep, list('PAINT_KEEP'), 'paint.keep');
}
const PAL_INDEX = new Map(PALETTE.map(([, hex], i) => [parseInt(hex.slice(1), 16), i]));
if (M.paint.mode !== 'exact-rgb') fail('paint.mode');
const ID = /^[a-z][a-z0-9]{1,15}$/;
const CLIPS = Object.keys(OPS.states);
const HIDDEN = M.rules.hiddenClips;
same(HIDDEN, ['appear', 'dismiss', 'transform'], 'hiddenClips');

/* ----- odemykání: přesně podle unlockSuggestions ----- */
function unlockRule(id) {
  const u = M.unlockSuggestions.sets[id];
  if (!u) fail('chybí unlock ' + id);
  if (typeof u.level === 'number') return { kind: 'level', level: u.level };
  if (u.minigame?.milestone === 'rounds-completed') return { kind: 'rounds', count: u.minigame.count };
  if (u.raid?.achievement === 'extractions') return { kind: 'extractions', count: u.raid.count };
  return fail('neznámé pravidlo ' + id);
}

const meta = {
  version: 1,
  slots: SLOTS,
  drawOrder: M.drawOrder,
  hides: Object.fromEntries(SLOTS.map(s => [s, M.slotRules[s].hides])),
  hiddenClips: HIDDEN,
  /* pořadí barev = indexy barev v RLE obnovy; hodnoty jsou v src/core/paints.ts (OPS_PALETTE) */
  palette: PALETTE.map(([k]) => k),
  sets: M.sets.map(s => {
    if (!ID.test(s.id)) fail('ID sady ' + s.id);
    same(s.pieces.map(p => p.slot), SLOTS, 'díly sady ' + s.id);
    for (const p of s.pieces) if (p.id !== s.id + '-' + p.slot) fail('ID dílu ' + p.id);
    return { id: s.id, unlock: unlockRule(s.id) };
  }),
};
const names = Object.fromEntries(M.sets.map(s => [s.id, { name: { cs: s.name.cs, en: s.name.en }, pieces: Object.fromEntries(s.pieces.map(p => [p.slot, { cs: p.name.cs, en: p.name.en }])) }]));
for (const n of Object.values(names)) for (const t of [n.name, ...Object.values(n.pieces)]) if (!t.cs?.trim() || !t.en?.trim() || t.cs.length > 60 || t.en.length > 60) fail('název');
if (meta.sets.length !== 16) fail('počet sad');

/* ----- PNG ----- */
const pngCache = new Map();
function readPng(file) {
  let p = pngCache.get(file);
  if (!p) {
    const path = join(src, file);
    if (!existsSync(path)) fail('chybí ' + file);
    p = PNG.sync.read(readFileSync(path));
    for (let i = 0; i < p.data.length; i += 4) {
      const a = p.data[i + 3];
      if (a !== 0 && a !== 255) fail('poloprůhledný pixel ' + file);
    }
    pngCache.set(file, p);
  }
  return p;
}
const colorOf = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];

/* Atlas: police podle výšky (deterministicky), 1 px mezera, šířka podle varianty. */
function pack(items, maxW) {
  const order = [...items].sort((a, b) => b.h - a.h || b.w - a.w || (a.id < b.id ? -1 : 1));
  let x = 0, y = 0, row = 0, W = 0;
  for (const it of order) {
    if (x && x + it.w > maxW) { y += row + 1; x = 0; row = 0; }
    it.x = x; it.y = y; x += it.w + 1; row = Math.max(row, it.h); W = Math.max(W, it.x + it.w);
  }
  return { w: W, h: y + row };
}

/* RLE opravy: [w, h, nMaska, (y, x, délka)…, nObnova, (y, x, délka, barvy…)…] */
function encodeRepair(mask, restore) {
  if (mask.width !== restore.width || mask.height !== restore.height) fail('velikost opravy');
  const { width: w, height: h } = mask;
  const m = [], r = [];
  let nm = 0, nr = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w;) {
      if (!mask.data[(y * w + x) * 4 + 3]) { x++; continue; }
      let e = x;
      while (e < w && mask.data[(y * w + e) * 4 + 3]) e++;
      m.push(y, x, e - x); nm++; x = e;
    }
    for (let x = 0; x < w;) {
      if (!restore.data[(y * w + x) * 4 + 3]) { x++; continue; }
      let e = x;
      const cols = [];
      while (e < w && restore.data[(y * w + e) * 4 + 3]) {
        const c = PAL_INDEX.get(colorOf(restore.data, (y * w + e) * 4));
        if (c === undefined) fail('barva mimo paletu v opravě');
        cols.push(c); e++;
      }
      r.push(y, x, e - x, ...cols); nr++; x = e;
    }
  }
  return [w, h, nm, ...m, nr, ...r];
}
/* Zpětné dekódování (kontrola): RGBA masky (jen alfa) a obnovy. */
function decodeRepair(a) {
  const [w, h] = a;
  const mask = new Uint8Array(w * h), rest = new Int16Array(w * h).fill(-1);
  let i = 2;
  for (let n = a[i++]; n > 0; n--) { const y = a[i++], x = a[i++], l = a[i++]; for (let k = 0; k < l; k++) mask[y * w + x + k] = 1; }
  for (let n = a[i++]; n > 0; n--) { const y = a[i++], x = a[i++], l = a[i++]; for (let k = 0; k < l; k++) rest[y * w + x + k] = a[i++]; }
  if (i !== a.length) fail('délka RLE');
  return { w, h, mask, rest };
}

rmSync(outPng, { recursive: true, force: true });
rmSync(outGeo, { recursive: true, force: true });
mkdirSync(outPng, { recursive: true });
mkdirSync(outGeo, { recursive: true });

const report = [];
for (const [vid, vm] of Object.entries(M.variants)) {
  const n = vm.frameSize.width;
  const base = JSON.parse(readFileSync(join(root, 'src/core/data/ops2-' + vid + '.json'), 'utf8'));
  if (base.frameSize.width !== n) fail('mřížka ' + vid);
  for (const fid of OPS.forms.map(f => f.id)) {
    const fm = vm.forms[fid];
    if (!fm) fail('chybí podoba ' + vid + '/' + fid);
    /* díly → atlas */
    const items = [];
    for (const s of M.sets) for (const p of s.pieces) {
      const a = p.assets[vid][fid];
      const png = readPng(a.file);
      same([png.width, png.height], a.size, 'velikost ' + a.file);
      if (a.pose !== 'neutral') fail('póza ' + a.file);
      for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 3] && !PAL_INDEX.has(colorOf(png.data, i))) fail('barva mimo paletu ' + a.file);
      items.push({ id: p.id, w: png.width, h: png.height, png, ox: a.origin[0], oy: a.origin[1], ref: a.verticalReference === 'bottom' ? 1 : a.verticalReference === 'top' ? 0 : fail('verticalReference ' + a.file) });
      const want = p.slot === 'neck' || p.slot === 'torso' ? 1 : 0;
      if (items.at(-1).ref !== want) fail('svislá reference ' + p.id);
    }
    const size = pack(items, vid === 'corner' ? 256 : 320);
    const atlas = new PNG({ width: size.w, height: size.h });
    atlas.data.fill(0);
    for (const it of items) PNG.bitblt(it.png, atlas, 0, 0, it.w, it.h, it.x, it.y);
    const atlasBuf = PNG.sync.write(atlas, { colorType: 6, deflateLevel: 9 });
    /* kontrola: každý díl je v atlasu pixel po pixelu stejný */
    const back = PNG.sync.read(atlasBuf);
    for (const it of items) for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) {
      const i = (y * it.w + x) * 4, j = ((it.y + y) * back.width + it.x + x) * 4;
      for (let k = 0; k < 4; k++) if (it.png.data[i + k] !== back.data[j + k]) fail('atlas se liší ' + it.id);
    }
    const atlasName = `${vid}-${fid}.png`;
    writeFileSync(join(outPng, atlasName), atlasBuf);

    /* pohyb a opravy podle klipů aplikace */
    const motion = {}, frames = {}, repairs = [], repairIndex = new Map(), refs = [], refIndex = new Map();
    let repairPx = 0;
    for (const clip of CLIPS) {
      const mo = fm.motion[clip], rf = fm.repairFrames[clip];
      const count = OPS.states[clip].frameCount;
      if (!mo || mo.length !== count || !rf || rf.length !== count) fail(`${vid}/${fid}/${clip}: počet snímků`);
      motion[clip] = mo.flatMap(d => { if (d.length !== 3 || !d.every(Number.isInteger)) fail('pohyb ' + clip); return d; });
      const row = [];
      let any = false;
      for (const fr of rf) {
        for (const k of Object.keys(fr)) if (!['headwear', 'back', 'both'].includes(k)) fail('klíč opravy ' + k);
        for (const key of ['headwear', 'back', 'both']) {
          const ref = fr[key];
          if (!ref) { row.push(-1); continue; }
          any = true;
          if (HIDDEN.includes(clip)) fail('oprava ve skrytém klipu ' + clip);
          const rp = vm.repairs[ref.id];
          if (!rp) fail('chybí oprava ' + ref.id);
          const mask = readPng(rp.mask), restore = readPng(rp.restore);
          same([mask.width, mask.height], rp.size, 'velikost masky ' + ref.id);
          const [ax, ay] = ref.at;
          if (ax < 0 || ay < 0 || ax + mask.width > n || ay + mask.height > n) fail('oprava mimo plátno ' + ref.id);
          const enc = encodeRepair(mask, restore);
          /* kontrola zpětným dekódováním proti zdrojovým PNG */
          const dec = decodeRepair(enc);
          for (let p = 0; p < dec.w * dec.h; p++) {
            if (dec.mask[p] !== (mask.data[p * 4 + 3] ? 1 : 0)) fail('maska RLE ' + ref.id);
            const c = restore.data[p * 4 + 3] ? PAL_INDEX.get(colorOf(restore.data, p * 4)) : -1;
            if (dec.rest[p] !== c) fail('obnova RLE ' + ref.id);
          }
          const ek = enc.join(',');
          let ri = repairIndex.get(ek);
          if (ri === undefined) { ri = repairs.length; repairs.push(enc); repairIndex.set(ek, ri); repairPx += mask.width * mask.height; }
          const rk = ri + ',' + ax + ',' + ay;
          let fi = refIndex.get(rk);
          if (fi === undefined) { fi = refs.length; refs.push([ri, ax, ay]); refIndex.set(rk, fi); }
          row.push(fi);
        }
      }
      if (any) frames[clip] = row;
    }
    const geo = {
      variant: vid, form: fid, size: n, atlas: atlasName,
      pieces: Object.fromEntries(items.sort((a, b) => (a.id < b.id ? -1 : 1)).map(it => [it.id, [it.x, it.y, it.w, it.h, it.ox, it.oy, it.ref]])),
      motion, repairs, refs, frames,
    };
    const json = JSON.stringify(geo) + '\n';
    writeFileSync(join(outGeo, `${vid}-${fid}.json`), json);
    report.push(`${vid}/${fid}: atlas ${size.w}×${size.h} ${atlasBuf.length} B, geometrie ${json.length} B, ${repairs.length} oprav (${refs.length} umístění)`);
  }
}
writeFileSync(join(root, 'src/core/data/clothing.json'), JSON.stringify(meta) + '\n');
writeFileSync(join(root, 'src/core/data/clothing-names.json'), JSON.stringify(names) + '\n');
for (const l of report) console.log(l);
console.log(`clothing.json ${JSON.stringify(meta).length + 1} B, clothing-names.json ${JSON.stringify(names).length + 1} B, ${meta.sets.length} sad`);
