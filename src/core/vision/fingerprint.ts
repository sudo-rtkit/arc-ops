/* Otisk ikony předmětu: výřez se zmenší na 16×16, potlačí se pozadí (barva vzácnosti a tmavý podklad) a spočítá se
   vektor jasu a barevný histogram. Otisk jsou jen čísla; z otisku nejde obrázek zpětně složit. */
import { hueSat, rgbAt, type RgbaImage } from './image';
import type { Box } from './layout';

export const FP_SIZE = 16;
export const FP_HIST = 16;
export const FP_LEN = FP_SIZE * FP_SIZE + FP_HIST;

const dist2 = (a: [number, number, number], r: number, g: number, b: number) => (a[0] - r) ** 2 + (a[1] - g) ** 2 + (a[2] - b) ** 2;

/* Je pixel pozadí? Tmavý podklad (i dobarvený vzácností) a plná barva rohu vzácnosti. */
function isBackground(r: number, g: number, b: number, rarityRgb: [number, number, number] | null): boolean {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  if (l < 50) return true;
  return !!rarityRgb && dist2(rarityRgb, r, g, b) < 55 * 55;
}

function histBin(r: number, g: number, b: number): number {
  const h = hueSat(r, g, b);
  if (h.s > 0.28 && h.v > 70) return Math.floor(h.h / 30) % 12;
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  return 12 + Math.min(3, Math.floor(l / 64));
}

/* area = výřez ikony; mask = oblast vpravo nahoře se značkou „viděno“, která se ignoruje. */
export function fingerprint(img: RgbaImage, area: Box, rarityRgb: [number, number, number] | null): number[] {
  const grid = new Float64Array(FP_SIZE * FP_SIZE), hist = new Float64Array(FP_HIST);
  const sx = area.w / FP_SIZE, sy = area.h / FP_SIZE;
  /* Vzorkování: v každém poli mřížky zhruba 4×4 body (stejně při každém rozlišení). */
  const k = 4;
  let fgAll = 0;
  for (let gy = 0; gy < FP_SIZE; gy++) for (let gx = 0; gx < FP_SIZE; gx++) {
    let sum = 0, n = 0;
    const eye = gx >= FP_SIZE * 0.8 && gy < FP_SIZE * 0.22;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const x = Math.floor(area.x + (gx + (i + 0.5) / k) * sx), y = Math.floor(area.y + (gy + (j + 0.5) / k) * sy);
      n++;
      if (eye || x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const [r, g, b] = rgbAt(img, x, y);
      if (isBackground(r, g, b, rarityRgb)) continue;
      sum += 0.299 * r + 0.587 * g + 0.114 * b;
      hist[histBin(r, g, b)]++; fgAll++;
    }
    grid[gy * FP_SIZE + gx] = sum / n;
  }
  const out: number[] = Array.from(grid, v => Math.round(v));
  for (let i = 0; i < FP_HIST; i++) out.push(Math.round(fgAll ? (hist[i] / fgAll) * 255 : 0));
  return out;
}

/* Lehké rozmazání jasové mřížky (3×3) tlumí posun o zlomek pole při jiném měřítku. */
function blurred(fp: number[]): Float64Array {
  const out = new Float64Array(FP_SIZE * FP_SIZE);
  for (let y = 0; y < FP_SIZE; y++) for (let x = 0; x < FP_SIZE; x++) {
    let s = 0, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= FP_SIZE || yy >= FP_SIZE) continue;
      const f = dx === 0 && dy === 0 ? 2 : 1;
      s += fp[yy * FP_SIZE + xx] * f; w += f;
    }
    out[y * FP_SIZE + x] = s / w;
  }
  return out;
}

/* Kosinová podobnost středěných jasových mřížek (korelace) doplněná průnikem barevných histogramů. 0–1. */
export function similarity(a: number[], b: number[]): number {
  if (a.length !== FP_LEN || b.length !== FP_LEN) return 0;
  const A = blurred(a), B = blurred(b);
  let ma = 0, mb = 0;
  for (let i = 0; i < A.length; i++) { ma += A[i]; mb += B[i]; }
  ma /= A.length; mb /= B.length;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < A.length; i++) { const x = A[i] - ma, y = B[i] - mb; ab += x * y; aa += x * x; bb += y * y; }
  const cos = aa && bb ? ab / Math.sqrt(aa * bb) : 0;
  let inter = 0;
  for (let i = 0; i < FP_HIST; i++) inter += Math.min(a[FP_SIZE * FP_SIZE + i], b[FP_SIZE * FP_SIZE + i]);
  return 0.8 * Math.max(0, cos) + 0.2 * (inter / 255);
}
