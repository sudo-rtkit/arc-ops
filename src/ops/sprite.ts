/* Skládání vrstev Opse / Bedňáka 2.0 na plátně podle docs/design/buddy/bednak2/README.md („Kompatibilita“):
   tělo z pásu [i*W,0,W,H] podle frameSize varianty, díly celé na kotvě + posun (přičte se právě jednou), štítek
   jako dlaždice atlasu podle levelu, pořadí drawOrder, jiskra nahoře, při proměně jen pás proměny. Neviditelný
   snímek (příchod/odchod) nekreslí tělo ani šatník. Binární alfa, bez vyhlazování, celočíselné souřadnice;
   nejdřív v nativní mřížce varianty (96 nebo 128 px), pak celým násobkem. */
import { OPS, OPS_GEOMETRY, formForLevel, partById, type OpsVariantId } from '../core/ops';
import type { Pose } from './animator';

const URLS = import.meta.glob('../assets/ops2/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const cache = new Map<string, HTMLImageElement>();

export const assetUrl = (file: string): string | undefined => URLS['../assets/ops2/' + file];

function image(file: string): HTMLImageElement | null {
  let im = cache.get(file);
  if (!im) {
    const url = assetUrl(file);
    if (!url) return null;
    im = new Image();
    im.decoding = 'async';
    im.src = url;
    cache.set(file, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

/* Načte všechny obrázky potřebné pro podobu, outfit a efekty (aby první snímek nebyl neúplný). */
export function preload(variant: OpsVariantId, level: number, outfit: Record<string, string | null>): Promise<void> {
  const g = OPS_GEOMETRY[variant], form = formForLevel(level);
  const files = new Set<string>([...Object.values(g.forms[form.id]).map(s => s.file), g.sparkle, ...Object.values(g.transforms)]);
  for (const id of Object.values(outfit)) { const p = id ? g.parts[id] : undefined; if (p) files.add(p.file); }
  return Promise.all([...files].map(f => new Promise<void>(res => {
    image(f);
    const im = cache.get(f);
    if (!im || (im.complete && im.naturalWidth)) return res();
    im.addEventListener('load', () => res(), { once: true });
    im.addEventListener('error', () => res(), { once: true });
  }))).then(() => undefined);
}

export const frameOf = (variant: OpsVariantId): number => OPS_GEOMETRY[variant].frameSize.width;

/* Jeden snímek W × H do ctx (ctx musí mít velikost mřížky varianty). */
export function drawOps(ctx: CanvasRenderingContext2D, variant: OpsVariantId, level: number, outfit: Record<string, string | null>, pose: Pose): void {
  const g = OPS_GEOMETRY[variant], W = g.frameSize.width, H = g.frameSize.height;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  if (pose.transform) {
    const im = image(g.transforms[pose.transform.spec.id]);
    if (im) ctx.drawImage(im, pose.transform.index * W, 0, W, H, 0, 0, W, H);
    return;
  }
  const form = formForLevel(level);
  const states = g.forms[form.id];
  const st = states[pose.anim] ?? states.idle;
  const frame = Math.min(pose.frame, st.frames.length - 1);
  const ref = st.frames[frame];
  if (ref >= 0) {
    const anchors = g.anchors[ref];
    for (const slot of OPS.drawOrder) {
      if (slot === 'body') {
        const im = image(st.file);
        if (im) ctx.drawImage(im, frame * W, 0, W, H, 0, 0, W, H);
        continue;
      }
      const id = outfit[slot];
      const p = id ? partById(id) : undefined;
      const a = anchors[OPS.slots.indexOf(slot)];
      const asset = id ? g.parts[id] : undefined;
      if (!p || !a || !asset) continue;
      const im = image(asset.file);
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
}
