/* Dekódování obrázku, který hráč sám vložil (Ctrl+V, přetažení, výběr souboru), na RGBA buffer pro rozpoznávání.
   Obrázek zůstává jen v paměti stránky: neukládá se ani neodesílá.
   0.16.1: rozměry se přečtou z hlavičky ještě před dekódováním (core/imageSize.ts). Obrázek nad rozpočtem
   (8192 px na stranu, 40 MP) nebo v neznámém formátu se odmítne bez dekódování, takže malý soubor s obřími
   rozměry nezabere gigabajty paměti. */
import type { RgbaImage } from '../core/vision/image';
import { MAX_SIDE_PX, imageSize, withinBudget } from '../core/imageSize';

export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_SIDE = MAX_SIDE_PX;

export type DecodeError = 'notImage' | 'tooBig' | 'decode';
export interface Decoded { img: RgbaImage; bitmap: ImageBitmap }

export async function decodeImage(file: Blob): Promise<Decoded | DecodeError> {
  if (file.type && !file.type.startsWith('image/')) return 'notImage';
  if (file.size > MAX_IMAGE_BYTES) return 'tooBig';
  let head: Uint8Array;
  try { head = new Uint8Array(await file.arrayBuffer()); } catch { return 'decode'; }
  const size = imageSize(head);
  if (!size) return 'decode';
  if (!withinBudget(size.w, size.h)) return 'tooBig';
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return 'decode'; }
  if (!withinBudget(bitmap.width, bitmap.height)) { bitmap.close(); return 'tooBig'; }
  const c = document.createElement('canvas');
  c.width = bitmap.width; c.height = bitmap.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bitmap.close(); return 'decode'; }
  ctx.drawImage(bitmap, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  c.width = 0; c.height = 0;
  return { img: { width: d.width, height: d.height, data: d.data }, bitmap };
}

/* Obrázky ze schránky nebo přetažení (soubory i položky typu image/*). */
export function imagesFrom(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const files = [...dt.files].filter(f => f.type.startsWith('image/'));
  if (files.length) return files;
  return [...dt.items].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter((f): f is File => !!f);
}
