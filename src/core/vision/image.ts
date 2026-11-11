/* Obrázek jako RGBA buffer a základní operace nad ním. Čisté funkce bez DOM, takže běží v Node i v prohlížeči. */

export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

/* Jas pixelu (Rec. 601), 0–255. */
export const lumAt = (img: RgbaImage, x: number, y: number): number => {
  const i = (y * img.width + x) * 4, d = img.data;
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
};

export const rgbAt = (img: RgbaImage, x: number, y: number): [number, number, number] => {
  const i = (y * img.width + x) * 4, d = img.data;
  return [d[i], d[i + 1], d[i + 2]];
};

/* Jasová mapa celého obrázku (jeden průchod, pak se čte rychle). */
export function lumMap(img: RgbaImage): Float32Array {
  const out = new Float32Array(img.width * img.height), d = img.data;
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return out;
}

/* Sytost 0–1 a odstín 0–360 (HSV). */
export function hueSat(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  let h = 0;
  if (c > 0) {
    if (mx === r) h = ((g - b) / c) % 6;
    else if (mx === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: mx ? c / mx : 0, v: mx };
}

export function crop(img: RgbaImage, x: number, y: number, w: number, h: number): RgbaImage {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.max(0, Math.min(Math.round(w), img.width - x)); h = Math.max(0, Math.min(Math.round(h), img.height - y));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) out.set(img.data.subarray(((y + j) * img.width + x) * 4, ((y + j) * img.width + x + w) * 4), j * w * 4);
  return { width: w, height: h, data: out };
}

/* Změna velikosti průměrováním plochy (zmenšení) a bilineárně (zvětšení). Slouží testům robustnosti a otiskům. */
export function resize(img: RgbaImage, w: number, h: number): RgbaImage {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = img.width / w, sy = img.height / h, d = img.data, W = img.width;
  if (sx >= 1 && sy >= 1) {
    for (let j = 0; j < h; j++) {
      const y0 = j * sy, y1 = y0 + sy;
      for (let i = 0; i < w; i++) {
        const x0 = i * sx, x1 = x0 + sx;
        let r = 0, g = 0, b = 0, a = 0, wt = 0;
        for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
          const fy = Math.min(y + 1, y1) - Math.max(y, y0);
          for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
            const f = fy * (Math.min(x + 1, x1) - Math.max(x, x0));
            const k = (Math.min(y, img.height - 1) * W + Math.min(x, W - 1)) * 4;
            r += d[k] * f; g += d[k + 1] * f; b += d[k + 2] * f; a += d[k + 3] * f; wt += f;
          }
        }
        const o = (j * w + i) * 4;
        out[o] = r / wt; out[o + 1] = g / wt; out[o + 2] = b / wt; out[o + 3] = a / wt;
      }
    }
  } else {
    for (let j = 0; j < h; j++) {
      const fy = Math.max(0, Math.min(img.height - 1, (j + 0.5) * sy - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(img.height - 1, y0 + 1), ty = fy - y0;
      for (let i = 0; i < w; i++) {
        const fx = Math.max(0, Math.min(W - 1, (i + 0.5) * sx - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), tx = fx - x0;
        const o = (j * w + i) * 4;
        for (let c = 0; c < 4; c++) {
          const top = d[(y0 * W + x0) * 4 + c] * (1 - tx) + d[(y0 * W + x1) * 4 + c] * tx;
          const bot = d[(y1 * W + x0) * 4 + c] * (1 - tx) + d[(y1 * W + x1) * 4 + c] * tx;
          out[o + c] = top * (1 - ty) + bot * ty;
        }
      }
    }
  }
  return { width: w, height: h, data: out };
}
