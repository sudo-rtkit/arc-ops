/* Rychlejší resize pro testy: přesně stejný výsledek jako src/core/vision/image.ts resize (bajt po bajtu, hlídá to
   tests/vision/robust.test.ts), jen s předpočítanými rozsahy a vahami sloupců a řádků. Testy na vlastních snímcích
   zvětšují celé snímky na 1366–3840 px a původní smyčka v nich zabrala většinu času. Stejné operace s plovoucí čárkou ve
   stejném pořadí, takže i zaokrouhlení do Uint8ClampedArray je stejné. */
import type { RgbaImage } from '../../src/core/vision/image';

export function resizeExact(img: RgbaImage, w: number, h: number): RgbaImage {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = img.width / w, sy = img.height / h, d = img.data, W = img.width, H = img.height;
  if (sx >= 1 && sy >= 1) {
    /* plocha: pro každý sloupec výstupu rozsah zdrojových sloupců, jejich (oříznutý) index a váha */
    const xs = new Int32Array(w + 1), xk: number[] = [], xw: number[] = [];
    for (let i = 0; i < w; i++) {
      const x0 = i * sx, x1 = x0 + sx;
      xs[i] = xk.length;
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) { xk.push(Math.min(x, W - 1) * 4); xw.push(Math.min(x + 1, x1) - Math.max(x, x0)); }
    }
    xs[w] = xk.length;
    const XK = Int32Array.from(xk), XW = Float64Array.from(xw);
    const ys = new Int32Array(h + 1), yk: number[] = [], yw: number[] = [];
    for (let j = 0; j < h; j++) {
      const y0 = j * sy, y1 = y0 + sy;
      ys[j] = yk.length;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) { yk.push(Math.min(y, H - 1) * W * 4); yw.push(Math.min(y + 1, y1) - Math.max(y, y0)); }
    }
    ys[h] = yk.length;
    const YK = Int32Array.from(yk), YW = Float64Array.from(yw);
    for (let j = 0; j < h; j++) {
      const ya = ys[j], yb = ys[j + 1];
      for (let i = 0; i < w; i++) {
        const xa = xs[i], xb = xs[i + 1];
        let r = 0, g = 0, b = 0, a = 0, wt = 0;
        for (let p = ya; p < yb; p++) {
          const fy = YW[p], row = YK[p];
          for (let q = xa; q < xb; q++) {
            const f = fy * XW[q], k = row + XK[q];
            r += d[k] * f; g += d[k + 1] * f; b += d[k + 2] * f; a += d[k + 3] * f; wt += f;
          }
        }
        const o = (j * w + i) * 4;
        out[o] = r / wt; out[o + 1] = g / wt; out[o + 2] = b / wt; out[o + 3] = a / wt;
      }
    }
  } else {
    /* bilineárně: sousední sloupce a váhy předem; vodorovně proložený zdrojový řádek (top/bot původní smyčky) se
       spočítá jednou a použije pro všechny řádky výstupu, které z něj berou; hodnoty i pořadí operací stejné */
    const X0 = new Int32Array(w), X1 = new Int32Array(w), TX = new Float64Array(w), UX = new Float64Array(w);
    for (let i = 0; i < w; i++) {
      const fx = Math.max(0, Math.min(W - 1, (i + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      X0[i] = x0 * 4; X1[i] = Math.min(W - 1, x0 + 1) * 4; TX[i] = fx - x0; UX[i] = 1 - TX[i];
    }
    const rowAt = (y: number, into: Float64Array) => {
      const r = y * W * 4;
      for (let i = 0, o = 0; i < w; i++, o += 4) {
        const tx = TX[i], ux = UX[i], a0 = r + X0[i], a1 = r + X1[i];
        into[o] = d[a0] * ux + d[a1] * tx;
        into[o + 1] = d[a0 + 1] * ux + d[a1 + 1] * tx;
        into[o + 2] = d[a0 + 2] * ux + d[a1 + 2] * tx;
        into[o + 3] = d[a0 + 3] * ux + d[a1 + 3] * tx;
      }
    };
    let rA = new Float64Array(w * 4), rB = new Float64Array(w * 4), yA = -1, yB = -1;
    const n = w * 4;
    for (let j = 0; j < h; j++) {
      const fy = Math.max(0, Math.min(H - 1, (j + 0.5) * sy - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), ty = fy - y0, uy = 1 - ty;
      /* dva řádky v mezipaměti; řádky výstupu jdou shora dolů, takže y0 a y1 jen rostou */
      if (y0 !== yA) {
        if (y0 === yB) { const t = rA; rA = rB; rB = t; yA = yB; yB = -1; }
        else { rowAt(y0, rA); yA = y0; }
      }
      if (y1 !== yB) {
        if (y1 === yA) { rB.set(rA); } else rowAt(y1, rB);
        yB = y1;
      }
      const o0 = j * n;
      for (let k = 0; k < n; k++) out[o0 + k] = rA[k] * uy + rB[k] * ty;
    }
  }
  return { width: w, height: h, data: out };
}
