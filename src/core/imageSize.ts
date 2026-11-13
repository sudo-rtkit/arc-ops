/* 0.16.1: rozměry obrázku z hlavičky souboru, ještě před dekódováním. Malý soubor (PNG se zkomprimuje i 1000:1)
   může mít obrovské rozměry a jeho dekódování by zabralo gigabajty paměti. Proto se rozměry přečtou z hlavičky
   (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X, GIF, BMP) a obrázek nad rozpočtem se odmítne bez dekódování.
   Rozpočet (pro import obrazovky, snímek mapy i snímky map ze zálohy):
   - nejvýš 8192 px na stranu (8K monitor 7680 × 4320 projde),
   - nejvýš 40 MP (40 × 2^20 px, RGBA v paměti zhruba 160 MB).
   Bez DOM, takže jde testovat v Node. */

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp';
export interface ImageSize { kind: ImageKind; w: number; h: number }

export const MAX_SIDE_PX = 8192;
export const MAX_PIXELS = 40 * 1024 * 1024;

/* Vejde se obrázek do rozpočtu? */
export const withinBudget = (w: number, h: number): boolean =>
  Number.isSafeInteger(w) && Number.isSafeInteger(h) && w > 0 && h > 0 && w <= MAX_SIDE_PX && h <= MAX_SIDE_PX && w * h <= MAX_PIXELS;

const MIME: Record<ImageKind, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
export const mimeOf = (k: ImageKind): string => MIME[k];

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const i32le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
const ascii = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
const ok = (kind: ImageKind, w: number, h: number): ImageSize | null => (w > 0 && h > 0 ? { kind, w, h } : null);

function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || !ascii(b, 12, 'IHDR')) return null;
  return ok('png', u32be(b, 16), u32be(b, 20));
}

/* Rámce SOF (baseline, progresivní, aritmetické…); DHT (C4), JPG (C8) a DAC (CC) mezi ně nepatří. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
function jpeg(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    while (b[i] === 0xff && i < b.length) i++;
    const m = b[i++];
    /* samostatné značky bez délky */
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
    /* konec obrázku nebo začátek dat bez rámce SOF */
    if (m === 0xd9 || m === 0xda) return null;
    if (i + 1 >= b.length) return null;
    const len = u16be(b, i);
    if (len < 2) return null;
    if (SOF.has(m)) return i + 6 < b.length ? ok('jpeg', u16be(b, i + 5), u16be(b, i + 3)) : null;
    i += len;
  }
  return null;
}

function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  if (ascii(b, 12, 'VP8 ')) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return ok('webp', u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (ascii(b, 12, 'VP8L')) {
    if (b[20] !== 0x2f) return null;
    const w = 1 + (b[21] | ((b[22] & 0x3f) << 8));
    const h = 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10));
    return ok('webp', w, h);
  }
  if (ascii(b, 12, 'VP8X')) return ok('webp', 1 + u24le(b, 24), 1 + u24le(b, 27));
  return null;
}

function bmp(b: Uint8Array): ImageSize | null {
  if (b.length < 26) return null;
  const hdr = u16le(b, 14) | (u16le(b, 16) << 16);
  if (hdr === 12) return ok('bmp', u16le(b, 18), u16le(b, 20));
  if (hdr < 40) return null;
  return ok('bmp', Math.abs(i32le(b, 18)), Math.abs(i32le(b, 22)));
}

/* Rozměry z hlavičky; neznámý nebo poškozený formát vrací null. */
export function imageSize(b: Uint8Array): ImageSize | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 'PNG\r\n\x1a\n')) return png(b);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpeg(b);
  if (b.length >= 12 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return webp(b);
  if (b.length >= 10 && (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a'))) return ok('gif', u16le(b, 6), u16le(b, 8));
  if (b.length >= 2 && ascii(b, 0, 'BM')) return bmp(b);
  return null;
}

/* Data URL obrázku → bajty (base64), nejvýš prvních maxBytes (na hlavičku stačí začátek). Bez platného base64
   vrací null. */
export function dataUrlBytes(dataUrl: string, maxBytes = Infinity): Uint8Array<ArrayBuffer> | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !/;base64$/.test(dataUrl.slice(0, comma))) return null;
  try {
    const b64 = dataUrl.slice(comma + 1);
    const chars = Number.isFinite(maxBytes) ? Math.min(b64.length, Math.ceil(maxBytes / 3) * 4) : b64.length;
    const bin = atob(b64.slice(0, chars));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

/* Kolik bajtů ze začátku stačí na hlavičku (JPEG může mít před rámcem SOF metadata EXIF a ICC). */
export const HEAD_BYTES = 4 * 1024 * 1024;
/* Rozměry obrázku v data URL z hlavičky (jen začátek dat). */
export const dataUrlSize = (dataUrl: string): ImageSize | null => {
  const b = dataUrlBytes(dataUrl, HEAD_BYTES);
  return b ? imageSize(b) : null;
};
