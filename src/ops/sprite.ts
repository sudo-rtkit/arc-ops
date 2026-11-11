/* Skládání vrstev Opse na plátně podle docs/design/buddy/layers/README.md („Kotvy a skládání“):
   tělo z pásu [i*64,0,64,64], díly celé na kotvě + posun, štítek jako dlaždice atlasu podle levelu,
   pořadí drawOrder, jiskra nahoře, při proměně jen pás proměny. Binární alfa, bez vyhlazování,
   nejdřív 64 × 64, pak celým násobkem. */
import { OPS, formForLevel, partAsset, partById } from '../core/ops';
import type { Pose } from './animator';

const URLS = import.meta.glob('../assets/ops/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const cache = new Map<string, HTMLImageElement>();

export const assetUrl = (file: string): string | undefined => URLS['../assets/ops/' + file];

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
export function preload(level: number, outfit: Record<string, string | null>): Promise<void> {
  const form = formForLevel(level);
  const files = new Set<string>([...Object.values(form.states).map(s => s.file), OPS.fx.sparkle.file, ...OPS.transforms.map(t => t.file)]);
  for (const id of Object.values(outfit)) { const p = id ? partById(id) : undefined; if (p) files.add(partAsset(p, form.id).file); }
  return Promise.all([...files].map(f => new Promise<void>(res => {
    image(f);
    const im = cache.get(f);
    if (!im || (im.complete && im.naturalWidth)) return res();
    im.addEventListener('load', () => res(), { once: true });
    im.addEventListener('error', () => res(), { once: true });
  }))).then(() => undefined);
}

export const FRAME = OPS.frameSize.width;

/* Jeden snímek 64 × 64 do ctx (ctx musí být 64 × 64). */
export function drawOps(ctx: CanvasRenderingContext2D, level: number, outfit: Record<string, string | null>, pose: Pose): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, FRAME, FRAME);
  if (pose.transform) {
    const im = image(pose.transform.spec.file);
    if (im) ctx.drawImage(im, pose.transform.index * FRAME, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
    return;
  }
  const form = formForLevel(level);
  const st = form.states[pose.anim] ?? form.states.idle;
  const frame = Math.min(pose.frame, st.anchors.length - 1);
  const anchors = st.anchors[frame];
  for (const slot of OPS.drawOrder) {
    if (slot === 'body') {
      const im = image(st.file);
      if (im) ctx.drawImage(im, frame * FRAME, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
      continue;
    }
    const id = outfit[slot];
    const p = id ? partById(id) : undefined;
    const a = anchors[slot];
    if (!p || !a) continue;
    const asset = partAsset(p, form.id), im = image(asset.file);
    if (!im) continue;
    const x = a[0] + asset.offset[0], y = a[1] + asset.offset[1];
    if (p.frameSize) {
      const { width: w, height: h } = p.frameSize;
      ctx.drawImage(im, Math.min(level, (p.frameCount ?? 1) - 1) * w, 0, w, h, x, y, w, h);
    } else ctx.drawImage(im, x, y);
  }
  if (pose.sparkle !== null) {
    const im = image(OPS.fx.sparkle.file);
    if (im) ctx.drawImage(im, pose.sparkle * FRAME, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
  }
}
