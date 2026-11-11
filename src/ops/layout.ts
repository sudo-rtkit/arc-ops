/* Rozvržení okna buddyho (čisté funkce): bublina s hláškou se vejde na monitor, Ops zůstane na místě.
   Vše ve fyzických pixelech. */
export interface Rect { x: number; y: number; w: number; h: number }

export const monitorKey = (m: { name: string | null; position: { x: number; y: number }; size: { width: number; height: number } }): string =>
  `${m.name || 'monitor'}@${m.position.x},${m.position.y},${m.size.width}x${m.size.height}`.slice(0, 120);

/* Ops celý na monitoru. */
export function clampTo(p: { x: number; y: number }, size: number, mon: Rect): { x: number; y: number } {
  return {
    x: Math.round(Math.min(Math.max(p.x, mon.x), mon.x + mon.w - size)),
    y: Math.round(Math.min(Math.max(p.y, mon.y), mon.y + mon.h - size)),
  };
}

/* Výchozí místo: vpravo dole v pracovní ploše, kousek od okraje. */
export const defaultSpot = (size: number, work: Rect, sf = 1): { x: number; y: number } =>
  ({ x: Math.round(work.x + work.w - size - 32 * sf), y: Math.round(work.y + work.h - size - 32 * sf) });

/* Okno s bublinou: bublina na stranu blíž ke středu monitoru a nad Opse, když je nahoře místo, jinak pod něj. */
export function buddyWindow(ops: { x: number; y: number }, size: number, mon: Rect, bubble: { w: number; h: number } | null):
  { win: Rect; ops: { x: number; y: number }; below: boolean; right: boolean } {
  if (!bubble) return { win: { x: ops.x, y: ops.y, w: size, h: size }, ops: { x: 0, y: 0 }, below: false, right: false };
  const w = Math.max(size, bubble.w), h = size + bubble.h;
  const right = ops.x + size / 2 > mon.x + mon.w / 2;
  const below = ops.y - bubble.h < mon.y;
  const win = { x: right ? ops.x + size - w : ops.x, y: below ? ops.y : ops.y - bubble.h, w, h };
  return { win, ops: { x: right ? w - size : 0, y: below ? 0 : bubble.h }, below, right };
}
