/* 0.20.0: obrazovka přípravy loadoutu před raidem (MANAGE LOADOUT) a výbava na obrazovce výsledku raidu.
   Přečte výbavu (augment, štít, dvě zbraně) z míst vlevo od batohu a obsah BACKPACK a QUICK USE stejnou cestou
   jako snímek INVENTORY. Místa výbavy nejsou čtvercová políčka, takže se odvozují od mřížky batohu (stejné
   rozvržení na obou obrazovkách, měřeno v roztečích políček, ne v pixelech). Hodnota loadoutu se čte z řádku
   pod nadpisem LOADOUT (poslední číslo; první je váha „0.0/35.0“).
   0.24.0: zbraně (název, tier, munice) a augment se poznají podle tvaru z katalogu (vision/equip.ts).
   Výsledek obsahuje jen čísla (otisky, vzácnosti, počty), ne obrazová data. Nic se tu nehádá: co nejde poznat,
   je 'unknown'. Volný loadout (FREE LOADOUT) má na neobsazených místech symbol „náhodné“ (hra výbavu vylosuje
   až při nasazení), takže tato místa jsou 'random', ne prázdná. Čistá funkce, jen čte pixely. */
import { lumMap, type RgbaImage } from './image';
import { detectLayout, type Box, type PanelGrid } from './layout';
import { brightShare, frac, iconArea } from './cells';
import { fingerprint } from './fingerprint';
import { readRarity, type Rarity } from './rarity';
import { isCream, numberTokens, parseGrouped } from './digits';
import { readScreenshot, type CellRead, type ScreenRead } from './read';
import { readHeader, near } from './progress';
import { AUGMENT_PAD, augmentImageArea, matchShape, readAmmo, readWeaponTier, shapeOf, weaponImageArea, type EquipShape, type ShapeMatch } from './equip';
import type { Tier } from './digits';
import { equipShapes } from '../equipCatalog';

export type EquipSlot = 'augment' | 'shield' | 'weapon1' | 'weapon2';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['augment', 'shield', 'weapon1', 'weapon2'];
export type SlotState = 'item' | 'empty' | 'random';
/* 0.24.0: zbraně a augment se poznají podle tvaru (vision/equip.ts): match = shoda s katalogem tvarů (null = místo
   bez předmětu nebo štít), tier a munice jen u zbraní (null = nepřečteno). */
export interface EquipRead {
  slot: EquipSlot; box: Box; state: SlotState; rarity: Rarity; fp: number[] | null;
  match?: ShapeMatch | null; tier?: Tier | null; ammo?: { loaded: number; max: number } | null;
}
export type LoadoutKind = 'free' | 'custom' | 'unknown';
export interface LoadoutRead {
  kind: LoadoutKind;
  /* hodnota loadoutu z řádku pod LOADOUT (null = nepřečteno) */
  value: number | null;
  /* 0.23.0: váha a její mez z téhož řádku („0.0/30.0“, kg; null = nepřečteno) */
  weight: number | null; weightMax: number | null;
  equip: EquipRead[];
  backpack: CellRead[] | null;
  quickUse: CellRead[] | null;
  /* počet míst batohu a quick use z popisku („0/14“) */
  backpackMax: number | null;
  quickUseMax: number | null;
  /* přečtený BACKPACK a QUICK USE (čísla, otisky) pro stejné rozpoznání jako loot po raidu */
  screen: ScreenRead | null;
}

/* Místa výbavy v roztečích batohu (1080p: rozteč 104 px, batoh od x 1044, y 272 na přípravě loadoutu). */
const U = 104;
export function equipBoxes(bp: Pick<PanelGrid, 'x' | 'y' | 'pitchX'>): Record<EquipSlot, Box> {
  const u = bp.pitchX / U;
  const at = (dx: number, dy: number, w: number, h: number): Box => ({ x: bp.x + dx * u, y: bp.y + dy * u, w: w * u, h: h * u });
  return { augment: at(-352, 0, 144, 96), shield: at(-192, 0, 144, 96), weapon1: at(-352, 120, 304, 200), weapon2: at(-352, 336, 304, 200) };
}
/* Řádek s váhou a hodnotou pod nadpisem LOADOUT. */
export const valueArea = (bp: Pick<PanelGrid, 'x' | 'y' | 'pitchX'>): Box => {
  const u = bp.pitchX / U;
  return { x: bp.x - 250 * u, y: bp.y - 100 * u, w: 230 * u, h: 26 * u };
};

/* Předmět v místě výbavy: jasná ikona (prázdné místo, silueta i symbol „náhodné“ jsou tmavě šedé, podíl 0).
   Na vlastních snímcích: augment a štít 0,13–0,15, zbraně (tenká ikona přes šířku místa) 0,024–0,06. */
export const EQUIP_ITEM_MIN = 0.06;
export const WEAPON_ITEM_MIN = 0.012;
function readEquip(img: RgbaImage, slot: EquipSlot, box: Box, free: boolean, shapes: EquipShape[]): EquipRead {
  /* ikona je uprostřed místa; vzácnost v levém dolním rohu (čtverec u levého okraje) */
  const side = Math.min(box.w, box.h);
  const center: Box = { x: box.x + (box.w - side) / 2, y: box.y, w: side, h: side };
  const left: Box = { x: box.x, y: box.y + box.h - side, w: side, h: side };
  const rar = readRarity(img, left);
  const weapon = slot === 'weapon1' || slot === 'weapon2';
  const bright = weapon ? brightShare(img, frac(box, 0.08, 0.06, 0.92, 0.6), 120) : brightShare(img, frac(box, 0.25, 0.05, 0.75, 0.74), 120);
  const colored = rar.rarity !== 'common' && rar.rarity !== 'unknown';
  if (bright < (weapon ? WEAPON_ITEM_MIN : EQUIP_ITEM_MIN) && !colored) return { slot, box, state: free ? 'random' : 'empty', rarity: 'unknown', fp: null };
  const out: EquipRead = { slot, box, state: 'item', rarity: rar.rarity, fp: fingerprint(img, iconArea(center), rar.rgb) };
  if (weapon) {
    out.ammo = readAmmo(img, box);
    out.tier = readWeaponTier(img, box);
    out.match = matchShape(shapeOf(img, weaponImageArea(box), rar.rgb), 'weapon', rar.rarity, shapes, out.ammo?.max ?? null, out.tier);
  } else if (slot === 'augment') {
    out.match = matchShape(shapeOf(img, augmentImageArea(box), rar.rgb, 40, AUGMENT_PAD), 'augment', rar.rarity, shapes);
  }
  return out;
}

/* 0.23.0: váha z řádku pod LOADOUT. Tečky se jako znaky nečtou a mezera po nich může číslo rozdělit („00/35“, „0“),
   takže se spojí všechny části před hodnotou (poslední číslo) a čte se tvar „aa/bb“ s jedním desetinným místem
   na každé straně (váha ve hře má vždy jedno). Cokoli jiného je nepřečteno (null), nic se nedoplňuje. */
export function parseWeight(tokens: string[]): { weight: number; max: number } | null {
  if (tokens.length < 2 || tokens[tokens.length - 1].includes('/')) return null;
  const m = /^(\d{2,4})\/(\d{2,4})$/.exec(tokens.slice(0, -1).join(''));
  if (!m) return null;
  const weight = Number(m[1]) / 10, max = Number(m[2]) / 10;
  if (max < 5 || max > 200 || weight > max * 1.5) return null;
  return { weight, max };
}

/* shapes = katalog tvarů zbraní a augmentů (výchozí z catalog.ts; prázdný = zbraně a augment se nepoznají). */
export function readLoadout(img: RgbaImage, shapes: EquipShape[] = equipShapes()): LoadoutRead | null {
  if (!img.width || !img.height || img.data.length < img.width * img.height * 4) return null;
  const layout = detectLayout(img, lumMap(img));
  const bp = layout?.panels.find(p => p.panel === 'backpack');
  if (!layout || !bp) return null;
  const tab = readHeader(img).tab.value ?? '';
  const kind: LoadoutKind = near(tab, 'FREE LOADOUT') ? 'free' : near(tab, 'CUSTOM LOADOUT') ? 'custom' : 'unknown';
  const boxes = equipBoxes(bp);
  const equip = EQUIP_SLOTS.map(s => readEquip(img, s, boxes[s], kind === 'free', shapes));
  const raw = numberTokens(img, valueArea(bp), isCream);
  const toks = raw.filter(t => !t.text.includes('/') && !t.text.includes('.'));
  const value = toks.length ? parseGrouped(toks[toks.length - 1].text) : null;
  const w = parseWeight(raw.map(t => t.text));
  const read = readScreenshot(img, { panels: ['backpack', 'quickUse'] });
  const panel = (id: 'backpack' | 'quickUse') => read.panels.find(p => p.panel === id);
  return {
    kind, value, weight: w?.weight ?? null, weightMax: w?.max ?? null, equip,
    backpack: panel('backpack')?.cells ?? null, quickUse: panel('quickUse')?.cells ?? null,
    backpackMax: panel('backpack')?.slotsMax ?? null, quickUseMax: panel('quickUse')?.slotsMax ?? null,
    screen: { ...read, coins: null, premium: null, stashValue: null, headerSlots: null, headerSlotsMax: null },
  };
}
