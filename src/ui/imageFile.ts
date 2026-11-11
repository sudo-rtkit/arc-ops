/* Dekódování obrázku, který hráč sám vložil (Ctrl+V, přetažení, výběr souboru), na RGBA buffer pro rozpoznávání.
   Obrázek zůstává jen v paměti stránky: neukládá se ani neodesílá. */
import type { RgbaImage } from '../core/vision/image';

export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8192;

export type DecodeError = 'notImage' | 'tooBig' | 'decode';
export interface Decoded { img: RgbaImage; bitmap: ImageBitmap }

export async function decodeImage(file: Blob): Promise<Decoded | DecodeError> {
  if (file.type && !file.type.startsWith('image/')) return 'notImage';
  if (file.size > MAX_IMAGE_BYTES) return 'tooBig';
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return 'decode'; }
  if (bitmap.width > MAX_IMAGE_SIDE || bitmap.height > MAX_IMAGE_SIDE) { bitmap.close(); return 'tooBig'; }
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
