/* Skládání oblečení do snímku Opse (0.34.0) podle docs/design/buddy/clothing/README.md. Čisté funkce bez DOM, takže
   stejný plán kreslí plátno (src/ops/sprite.ts) i pixelové testy v Node.
   1. Viditelnost dílů: v klipech příchodu, odchodu a proměny (hiddenClips), v neviditelném snímku a v neznámém klipu
      se oblečení nekreslí vůbec (ani skrývání slotů, ani oprava těla). Díl, jehož obdélník by nebyl celý uvnitř
      plátna s okrajem 1 px, se potlačí celý včetně svých hides a opravy.
   2. Poloha jen jednou: x = origin.x + dL, y = origin.y + (svislá reference dole ? dB : dT) ze společné tabulky
      pohybu motion[clip][snímek] = [dL, dT, dB].
   3. Viditelné díly skryjí sjednocení svých hides (stávající sloty).
   4. Oprava těla podle viditelných dílů: pokrývka hlavy i záda = both, jinak headwear nebo back. Chybí-li pro snímek,
      nic se nemění. Aplikuje se na samostatnou dlaždici těla: maska vymaže pixely těla, obnova je překreslí.
   5. Kreslí se v závazném drawOrder (stávající sloty i čtyři sloty oblečení).
   Ve sprite se oprava aplikuje na už natřený pás těla a obnova se natře stejnou mapou nátěru: nátěr je přesná
   záměna barev po pixelech, takže je to totéž jako oprava před nátěrem, a maska LED emocí (emoteKeepMask) zůstane
   beze změny (opravy do optiky nikdy nezasahují, hlídají to testy). */
import { CLOTHING, CLOTHING_SLOTS, type ClothingSlot, type Worn } from './clothing';
import { OPS_PALETTE } from './paints';

/* Geometrie jedné varianty a podoby (src/core/data/clothing/<varianta>-<podoba>.json). */
export interface ClothingGeo {
  variant: string; form: string; size: number; atlas: string;
  /* ID dílu → [sx, sy, w, h, originX, originY, svislá reference 0 = horní okraj optiky, 1 = dolní] */
  pieces: Record<string, number[]>;
  /* klip → [dL, dT, dB] po snímcích za sebou */
  motion: Record<string, number[]>;
  /* RLE opravy: [w, h, nMaska, (y, x, délka)…, nObnova, (y, x, délka, indexy barev…)…] */
  repairs: number[][];
  /* umístění opravy: [index opravy, x, y] */
  refs: number[][];
  /* klip → po snímcích trojice [headwear, back, both] = index do refs, -1 = bez opravy (chybějící klip = bez oprav) */
  frames: Record<string, number[]>;
}

export interface ClothLayer { kind: 'cloth'; slot: ClothingSlot; id: string; sx: number; sy: number; w: number; h: number; x: number; y: number }
export type Layer = { kind: 'body' } | { kind: 'part'; slot: string } | ClothLayer;
export interface FramePlan {
  layers: Layer[];
  /* stávající sloty, které viditelné oblečení skrývá */
  hides: string[];
  repair: { key: 'headwear' | 'back' | 'both'; rle: number[]; x: number; y: number } | null;
}

const REPAIR_KEYS = ['headwear', 'back', 'both'] as const;
const DRAW = CLOTHING.drawOrder;
const CLOTH_SLOTS = new Set<string>(CLOTHING_SLOTS);

/* Plán jednoho snímku. visible = snímek těla je viditelný (frames[i] >= 0). geo null = oblečení se nekreslí. */
export function planFrame(geo: ClothingGeo | null, clip: string, frame: number, worn: Worn | null | undefined, visible = true): FramePlan {
  const cloth = new Map<ClothingSlot, ClothLayer>();
  const motion = geo?.motion[clip];
  if (geo && worn && visible && motion && !CLOTHING.hiddenClips.includes(clip) && frame >= 0 && frame * 3 + 2 < motion.length) {
    const n = geo.size;
    const dL = motion[frame * 3], dT = motion[frame * 3 + 1], dB = motion[frame * 3 + 2];
    for (const slot of CLOTHING_SLOTS) {
      const id = worn[slot];
      const p = id ? geo.pieces[id] : undefined;
      if (!id || !p) continue;
      const [sx, sy, w, h, ox, oy, ref] = p;
      const x = ox + dL, y = oy + (ref === 1 ? dB : dT);
      /* bezpečnostní pravidlo: celý obdélník uvnitř plátna s okrajem 1 px, jinak potlačit celý díl */
      if (x < 1 || y < 1 || x + w >= n || y + h >= n) continue;
      cloth.set(slot, { kind: 'cloth', slot, id, sx, sy, w, h, x, y });
    }
  }
  const hides = new Set<string>();
  for (const slot of cloth.keys()) for (const h of CLOTHING.hides[slot]) hides.add(h);
  let repair: FramePlan['repair'] = null;
  const key = cloth.has('headwear') && cloth.has('back') ? 'both' : cloth.has('headwear') ? 'headwear' : cloth.has('back') ? 'back' : null;
  const row = key && geo ? geo.frames[clip] : undefined;
  if (key && geo && row) {
    const ri = row[frame * 3 + REPAIR_KEYS.indexOf(key)];
    const ref = ri !== undefined && ri >= 0 ? geo.refs[ri] : undefined;
    const rle = ref ? geo.repairs[ref[0]] : undefined;
    if (ref && rle) repair = { key, rle, x: ref[1], y: ref[2] };
  }
  const layers: Layer[] = [];
  for (const slot of DRAW) {
    if (slot === 'body') layers.push({ kind: 'body' });
    else if (CLOTH_SLOTS.has(slot)) { const c = cloth.get(slot as ClothingSlot); if (c) layers.push(c); }
    else if (!hides.has(slot)) layers.push({ kind: 'part', slot });
  }
  return { layers, hides: [...hides], repair };
}

/* Paleta jako [r, g, b] v pořadí indexů RLE obnovy. */
export const PALETTE_RGB: [number, number, number][] = CLOTHING.palette.map(name => {
  const v = parseInt(OPS_PALETTE[name as keyof typeof OPS_PALETTE].slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
});

/* Oprava těla na RGBA dlaždici W × H na místě: maska vymaže pixely (RGBA 0), obnova zapíše barvu palety (alfa 255).
   colors = barvy indexů (původní paleta, nebo paleta po nátěru). Nic mimo dlaždici se nezapíše. */
export function applyRepair(data: Uint8ClampedArray | Uint8Array, W: number, H: number, rle: readonly number[], ax: number, ay: number, colors: readonly (readonly [number, number, number])[] = PALETTE_RGB): void {
  let i = 2;
  const put = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? (y * W + x) * 4 : -1);
  for (let n = rle[i++]; n > 0; n--) {
    const y = rle[i++] + ay, x = rle[i++] + ax, l = rle[i++];
    for (let k = 0; k < l; k++) { const j = put(x + k, y); if (j >= 0) { data[j] = 0; data[j + 1] = 0; data[j + 2] = 0; data[j + 3] = 0; } }
  }
  for (let n = rle[i++]; n > 0; n--) {
    const y = rle[i++] + ay, x = rle[i++] + ax, l = rle[i++];
    for (let k = 0; k < l; k++) {
      const c = colors[rle[i++]], j = put(x + k, y);
      if (j >= 0 && c) { data[j] = c[0]; data[j + 1] = c[1]; data[j + 2] = c[2]; data[j + 3] = 255; }
    }
  }
}
