/* Skládání vrstev Opse / Bedňáka 2.0 na plátně podle docs/design/buddy/bednak2/README.md („Kompatibilita“):
   tělo z pásu [i*W,0,W,H] podle frameSize varianty, díly celé na kotvě + posun (přičte se právě jednou), štítek
   jako dlaždice atlasu podle levelu, pořadí drawOrder, jiskra nahoře, při proměně jen pás proměny. Neviditelný
   snímek (příchod/odchod) nekreslí tělo ani šatník. Binární alfa, bez vyhlazování, celočíselné souřadnice;
   nejdřív v nativní mřížce varianty (96 nebo 128 px), pak celým násobkem.
   0.34.0: oblečení podle src/core/clothingPlan.ts (pořadí, skrývání slotů, oprava dlaždice těla, skryté klipy).
   Geometrie a atlas oblečení se načtou líně, jen když Ops něco nosí. */
import { OPS, OPS_GEOMETRY, resolveForm, partById, type OpsVariantId } from '../core/ops';
import type { Pose } from './animator';
import { DEFAULT_PAINT, emoteKeepMask, paintMap, paintOf, recolorPixels } from '../core/paints';
import { isAutoEmote } from '../core/opsEmote';
import { wearsAny, type Worn } from '../core/clothing';
import { PALETTE_RGB, applyRepair, planFrame, type ClothingGeo, type FramePlan } from '../core/clothingPlan';
import { atlasUrl, clothingGeo, loadClothingGeo } from './clothingData';

const URLS = import.meta.glob('../assets/ops2/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const cache = new Map<string, HTMLImageElement>();

export const assetUrl = (file: string): string | undefined => URLS['../assets/ops2/' + file];
/* 0.34.0: atlas oblečení má předponu clothing/ (jen soubory zabalené s aplikací) */
const CLOTH = 'clothing/';
const urlOf = (file: string): string | undefined => (file.startsWith(CLOTH) ? atlasUrl(file.slice(CLOTH.length)) : assetUrl(file));

function image(file: string): HTMLImageElement | null {
  let im = cache.get(file);
  if (!im) {
    const url = urlOf(file);
    if (!url) return null;
    im = new Image();
    im.decoding = 'async';
    im.src = url;
    cache.set(file, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

/* 0.11.0: nátěr = přebarvená kopie obrázku (přesná shoda barev palety, alfa beze změny), jednou na soubor a nátěr.
   Původní vzhled kreslí přímo obrázek. */
const painted = new Map<string, HTMLCanvasElement>();
/* RGBA data obrázku (pro masku emocí). */
function pixels(im: HTMLImageElement): ImageData | null {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return null;
  x.drawImage(im, 0, 0);
  return x.getImageData(0, 0, c.width, c.height);
}
/* idleFile (0.20.1): pás emoce automatického snímku; měděné LED proti idle zůstanou nepřebarvené (emoteKeepMask). */
function source(file: string, paint: string, idleFile?: string, frameW = 0): CanvasImageSource | null {
  const im = image(file);
  if (!im || paint === DEFAULT_PAINT) return im;
  const key = paint + '|' + file;
  let c = painted.get(key);
  if (!c) {
    /* bez načteného idle by maska chyběla: raději snímek vynechat (preload načte celou podobu) */
    const idle = idleFile ? image(idleFile) : null;
    if (idleFile && !idle) return null;
    c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return im;
    x.imageSmoothingEnabled = false;
    x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const ip = idle ? pixels(idle) : null;
    if (idle && !ip) return im;
    recolorPixels(d.data, paint, ip ? emoteKeepMask(d.data, c.width, c.height, ip.data, ip.width, frameW) : null);
    x.putImageData(d, 0, 0);
    painted.set(key, c);
  }
  return c;
}

/* Barvy palety po nátěru (pro obnovu opravy těla: přesná záměna jako u pásu těla). */
const paintedPalettes = new Map<string, [number, number, number][]>();
function paletteFor(paint: string): [number, number, number][] {
  let p = paintedPalettes.get(paint);
  if (!p) {
    const m = paintMap(paint);
    p = PALETTE_RGB.map(c => m.get((c[0] << 16) | (c[1] << 8) | c[2]) ?? c);
    paintedPalettes.set(paint, p);
  }
  return p;
}
/* Opravená dlaždice těla (vymazané zapečené doplňky): natřený snímek pásu + RLE oprava. Mezipaměť podle
   varianty, podoby, klipu, snímku, opravy a nátěru (jak doporučuje README oblečení). */
const repaired = new Map<string, HTMLCanvasElement>();
const REPAIRED_MAX = 96;
function repairedBody(im: CanvasImageSource, key: string, frame: number, W: number, H: number, repair: NonNullable<FramePlan['repair']>, paint: string): CanvasImageSource | null {
  let c = repaired.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return null;
  x.imageSmoothingEnabled = false;
  x.drawImage(im, frame * W, 0, W, H, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H);
  applyRepair(d.data, W, H, repair.rle, repair.x, repair.y, paletteFor(paint));
  x.putImageData(d, 0, 0);
  if (repaired.size >= REPAIRED_MAX) { const first = repaired.keys().next().value; if (first !== undefined) repaired.delete(first); }
  repaired.set(key, c);
  return c;
}

const wait = (f: string) => new Promise<void>(res => {
  image(f);
  const im = cache.get(f);
  if (!im || (im.complete && im.naturalWidth)) return res();
  im.addEventListener('load', () => res(), { once: true });
  im.addEventListener('error', () => res(), { once: true });
});

/* Načte všechny obrázky potřebné pro podobu, outfit a efekty (aby první snímek nebyl neúplný). 0.34.0: když Ops
   něco nosí, i geometrii a atlas oblečení této varianty a podoby (jinak nic z oblečení). */
export function preload(variant: OpsVariantId, level: number, outfit: Record<string, string | null>, formId?: string, clothing?: Worn): Promise<void> {
  const g = OPS_GEOMETRY[variant], form = resolveForm(level, formId);
  const files = new Set<string>([...Object.values(g.forms[form.id]).map(s => s.file), g.sparkle, ...Object.values(g.transforms)]);
  for (const id of Object.values(outfit)) { const p = id ? g.parts[id] : undefined; if (p) files.add(p.file); }
  const cloth = wearsAny(clothing) ? loadClothingGeo(variant, form.id).then(geo => (geo ? wait(CLOTH + geo.atlas) : undefined)) : Promise.resolve();
  return Promise.all([...[...files].map(wait), cloth]).then(() => undefined);
}

/* Je oblečení připravené ke kreslení? undefined = ještě se načítá (snímek počká, aby Ops neproblikl bez oblečení),
   null = nic nenosí nebo nejde načíst (kreslí se bez oblečení). */
function clothingReady(variant: OpsVariantId, form: string, clothing: Worn | undefined): ClothingGeo | null | undefined {
  if (!wearsAny(clothing)) return null;
  const geo = clothingGeo(variant, form);
  if (geo === undefined) { void loadClothingGeo(variant, form); return undefined; }
  if (!geo) return null;
  if (image(CLOTH + geo.atlas)) return geo;
  const im = cache.get(CLOTH + geo.atlas);
  /* atlas se nenačetl (chyba) = bez oblečení; jinak počkat */
  return !im || im.complete ? null : undefined;
}

export const frameOf = (variant: OpsVariantId): number => OPS_GEOMETRY[variant].frameSize.width;

/* Jeden snímek W × H do ctx (ctx musí mít velikost mřížky varianty). Vrací false, když se nekreslilo, protože
   se oblečení ještě načítá (plátno si nechá předchozí snímek a zkusí to znovu). */
export function drawOps(ctx: CanvasRenderingContext2D, variant: OpsVariantId, level: number, outfit: Record<string, string | null>, pose: Pose, paintIn?: string, formId?: string, clothing?: Worn): boolean {
  const g = OPS_GEOMETRY[variant], W = g.frameSize.width, H = g.frameSize.height;
  const paint = paintOf(paintIn);
  const form = resolveForm(level, formId);
  /* proměna kreslí jen pás proměny (oblečení potlačené), proto na oblečení nečeká */
  const geo = pose.transform ? null : clothingReady(variant, form.id, clothing);
  if (geo === undefined) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  if (pose.transform) {
    const im = source(g.transforms[pose.transform.spec.id], paint);
    if (im) ctx.drawImage(im, pose.transform.index * W, 0, W, H, 0, 0, W, H);
    return true;
  }
  const states = g.forms[form.id];
  const clip = states[pose.anim] ? pose.anim : 'idle';
  const st = states[clip];
  const frame = Math.min(pose.frame, st.frames.length - 1);
  const ref = st.frames[frame];
  if (ref >= 0) {
    const anchors = g.anchors[ref];
    const plan = planFrame(geo, clip, frame, clothing);
    const atlas = geo && plan.layers.some(l => l.kind === 'cloth') ? source(CLOTH + geo.atlas, paint) : null;
    for (const layer of plan.layers) {
      if (layer.kind === 'body') {
        const im = source(st.file, paint, st !== states.idle && isAutoEmote(pose.anim) ? states.idle.file : undefined, W);
        if (!im) continue;
        const r = plan.repair;
        if (r) {
          const body = repairedBody(im, [variant, form.id, clip, frame, r.key, paint].join('|'), frame, W, H, r, paint);
          if (body) ctx.drawImage(body, 0, 0);
        } else ctx.drawImage(im, frame * W, 0, W, H, 0, 0, W, H);
        continue;
      }
      if (layer.kind === 'cloth') {
        if (atlas) ctx.drawImage(atlas, layer.sx, layer.sy, layer.w, layer.h, layer.x, layer.y, layer.w, layer.h);
        continue;
      }
      const slot = layer.slot;
      const id = outfit[slot];
      const p = id ? partById(id) : undefined;
      const a = anchors[OPS.slots.indexOf(slot)];
      const asset = id ? g.parts[id] : undefined;
      if (!p || !a || !asset) continue;
      const im = source(asset.file, paint);
      if (!im) continue;
      const x = a[0] + asset.offset[0], y = a[1] + asset.offset[1];
      if (asset.frameSize) {
        const { width: w, height: h } = asset.frameSize;
        ctx.drawImage(im, Math.min(level, (p.frameCount ?? 1) - 1) * w, 0, w, h, x, y, w, h);
      } else ctx.drawImage(im, x, y);
    }
  }
  if (pose.sparkle !== null) {
    const im = image(g.sparkle);
    if (im) ctx.drawImage(im, pose.sparkle * W, 0, W, H, 0, 0, W, H);
  }
  return true;
}
