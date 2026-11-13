/* Import vlastního snímku mapy (0.14.0): soubor, schránka nebo přetažení. Jen PNG, JPEG a WebP. Obrázek se
   přečte lokálně (FileReader), nic se neposílá ven. Velký snímek se před uložením zmenší, aby se vešel do paměti
   a místního úložiště; poměr stran zůstane a zmenšení se ukáže před potvrzením.
   0.16.1: rozměry se nejdřív přečtou z hlavičky (core/imageSize.ts); obrázek nad rozpočtem (8192 px na stranu,
   40 MP) se odmítne bez dekódování. Stejnou cestou jdou i snímky map ze zálohy (restoreImage). */
import { dataUrlBytes, imageSize, mimeOf, withinBudget } from '../core/imageSize';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/* Nejdelší strana uloženého snímku a největší velikost obrázku bez přepočtu. */
export const MAX_SIDE = 4096;
export const MAX_BYTES = 12 * 1024 * 1024;
/* Největší soubor, který se vůbec zkusí načíst. */
export const MAX_FILE = 40 * 1024 * 1024;

export interface ImportedImage { dataUrl: string; w: number; h: number; origW: number; origH: number; scaled: boolean }
export type ImportError = 'type' | 'big' | 'read';

const readDataUrl = (b: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(new Error('read'));
  r.readAsDataURL(b);
});
const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('read'));
  img.src = url;
});

/* Zmenší obrázek na nejdelší stranu `side` (WebP, při nepodpoře PNG). */
export function scaleImage(img: HTMLImageElement, side: number, quality = 0.92): { dataUrl: string; w: number; h: number } {
  const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('read');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  let dataUrl = c.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) dataUrl = c.toDataURL('image/png');
  return { dataUrl, w, h };
}

export async function importImage(b: Blob): Promise<ImportedImage | ImportError> {
  if (!IMAGE_TYPES.includes(b.type)) return 'type';
  if (b.size > MAX_FILE) return 'big';
  try {
    const size = imageSize(new Uint8Array(await b.arrayBuffer()));
    if (!size || mimeOf(size.kind) !== b.type) return size ? 'type' : 'read';
    if (!withinBudget(size.w, size.h)) return 'big';
    const url = await readDataUrl(b);
    const img = await loadImage(url);
    const origW = img.naturalWidth, origH = img.naturalHeight;
    if (!origW || !origH) return 'read';
    if (!withinBudget(origW, origH)) return 'big';
    if (Math.max(origW, origH) <= MAX_SIDE && url.length <= MAX_BYTES) return { dataUrl: url, w: origW, h: origH, origW, origH, scaled: false };
    const s = scaleImage(img, MAX_SIDE);
    return { ...s, origW, origH, scaled: true };
  } catch { return 'read'; }
}

/* Snímek mapy ze zálohy (0.16.1): stejná kontrola a zmenšení jako vlastní import; rozměry jdou ze skutečného
   obrázku, ne z údajů v záloze. */
export async function restoreImage(dataUrl: string): Promise<ImportedImage | ImportError> {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(dataUrl);
  if (!m) return 'type';
  const bytes = dataUrlBytes(dataUrl);
  if (!bytes) return 'read';
  return importImage(new Blob([bytes], { type: m[1] }));
}

/* Kopie snímku do zálohy: menší WebP, když je originál velký (záloha se musí vejít do limitu importu). */
export async function backupCopy(dataUrl: string, maxChars = 2_500_000): Promise<string> {
  if (dataUrl.length <= maxChars) return dataUrl;
  try {
    const img = await loadImage(dataUrl);
    for (const [side, q] of [[MAX_SIDE, 0.85], [2560, 0.8], [1920, 0.75]] as const) {
      const s = scaleImage(img, side, q);
      if (s.dataUrl.length <= maxChars) return s.dataUrl;
    }
    return scaleImage(img, 1280, 0.7).dataUrl;
  } catch { return dataUrl; }
}

/* První obrázek ze schránky (tlačítko). Bez oprávnění nebo podpory vrací null; vložení Ctrl+V funguje vždy. */
export async function clipboardImage(): Promise<Blob | null> {
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const type = it.types.find(t => IMAGE_TYPES.includes(t));
      if (type) return await it.getType(type);
    }
  } catch { /* bez oprávnění */ }
  return null;
}
/* Obrázek z události vložení nebo přetažení. */
export function imageFromTransfer(dt: DataTransfer | null): Blob | null {
  if (!dt) return null;
  for (const f of Array.from(dt.files)) if (IMAGE_TYPES.includes(f.type)) return f;
  for (const it of Array.from(dt.items ?? [])) if (it.kind === 'file' && IMAGE_TYPES.includes(it.type)) { const f = it.getAsFile(); if (f) return f; }
  return null;
}
