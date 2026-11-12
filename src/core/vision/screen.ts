/* Druh obrazovky bez STASH (0.8.1): obrazovka FINDINGS po raidu má vpravo dole krémové tlačítko CONTINUE.
   Jiné obrazovky s batohem (MANAGE LOADOUT před raidem se žlutým READY UP, inventář v raidu) ho nemají.
   Měří se v jednotkách velikosti políčka, ne v pevných pixelech. Čistá funkce, jen čte pixely. */
import type { RgbaImage } from './image';
import type { Layout } from './layout';

/* Krém tlačítek obrazovky po raidu (249, 238, 223) s tolerancí na kompresi a jas. */
export const isButtonCream = (r: number, g: number, b: number): boolean =>
  Math.abs(r - 249) <= 16 && Math.abs(g - 238) <= 16 && Math.abs(b - 223) <= 20 && r >= b;

/* Plné krémové tlačítko: v pásu vysokém jedno políčko aspoň 0,25 políčka řádků se souvislým krémovým úsekem
   dlouhým aspoň 1,5 políčka, v pravé polovině pod mřížkami (spodní čtvrtina obrazovky). Řádky nemusí jít za sebou:
   tmavý nápis CONTINUE uprostřed tlačítka úsek v řádcích textu přeruší. Text ani ikony takový úsek nemají. */
export function hasContinueButton(img: RgbaImage, layout: Layout): boolean {
  const W = img.width, H = img.height, cell = layout.cellPx;
  if (!cell) return false;
  const gridBottom = Math.max(...layout.panels.map(p => p.y + p.rows * p.pitchY));
  const y0 = Math.max(Math.round(gridBottom), Math.round(H * 0.75)), x0 = Math.round(W * 0.5);
  const minRun = cell * 1.5, minRows = Math.max(3, Math.round(cell * 0.25)), band = Math.round(cell);
  const ys: number[] = [];
  for (let y = y0; y < H; y++) {
    let run = 0, longest = 0;
    for (let x = x0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (isButtonCream(img.data[i], img.data[i + 1], img.data[i + 2])) { if (++run > longest) longest = run; } else run = 0;
    }
    if (longest >= minRun) ys.push(y);
  }
  /* nejvíc takových řádků v jednom pásu výšky políčka */
  for (let i = 0, j = 0; j < ys.length; j++) {
    while (ys[j] - ys[i] >= band) i++;
    if (j - i + 1 >= minRows) return true;
  }
  return false;
}
