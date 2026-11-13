/* 0.20.0: obrazovka přípravy loadoutu před raidem (MANAGE LOADOUT) a výbava na obrazovce výsledku raidu.
   Přečte výbavu (augment, štít, dvě zbraně) z míst vlevo od batohu a obsah BACKPACK a QUICK USE stejnou cestou
   jako snímek INVENTORY. Místa výbavy nejsou čtvercová políčka, takže se odvozují od mřížky batohu (stejné
   rozvržení na obou obrazovkách, měřeno v roztečích políček, ne v pixelech). Hodnota loadoutu se čte z řádku
   pod nadpisem LOADOUT (poslední číslo; první je váha „0.0/35.0“).
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

export type EquipSlot = 'augment' | 'shield' | 'weapon1' | 'weapon2';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['augment', 'shield', 'weapon1', 'weapon2'];
export type SlotState = 'item' | 'empty' | 'random';
export interface EquipRead { slot: EquipSlot; box: Box; state: SlotState; rarity: Rarity; fp: number[] | null }
export type LoadoutKind = 'free' | 'custom' | 'unknown';
export interface LoadoutRead {
  kind: LoadoutKind;
  /* hodnota loadoutu z řádku pod LOADOUT (null = nepřečteno) */
  value: number | null;
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
function readEquip(img: RgbaImage, slot: EquipSlot, box: Box, free: boolean): EquipRead {
  /* ikona je uprostřed místa; vzácnost v levém dolním rohu (čtverec u levého okraje) */
  const side = Math.min(box.w, box.h);
  const center: Box = { x: box.x + (box.w - side) / 2, y: box.y, w: side, h: side };
  const left: Box = { x: box.x, y: box.y + box.h - side, w: side, h: side };
  const rar = readRarity(img, left);
  const weapon = slot === 'weapon1' || slot === 'weapon2';
  const bright = weapon ? brightShare(img, frac(box, 0.08, 0.06, 0.92, 0.6), 120) : brightShare(img, frac(box, 0.25, 0.05, 0.75, 0.74), 120);
  const colored = rar.rarity !== 'common' && rar.rarity !== 'unknown';
  if (bright < (weapon ? WEAPON_ITEM_MIN : EQUIP_ITEM_MIN) && !colored) return { slot, box, state: free ? 'random' : 'empty', rarity: 'unknown', fp: null };
  return { slot, box, state: 'item', rarity: rar.rarity, fp: fingerprint(img, iconArea(center), rar.rgb) };
}

export function readLoadout(img: RgbaImage): LoadoutRead | null {
  if (!img.width || !img.height || img.data.length < img.width * img.height * 4) return null;
  const layout = detectLayout(img, lumMap(img));
  const bp = layout?.panels.find(p => p.panel === 'backpack');
  if (!layout || !bp) return null;
  const tab = readHeader(img).tab.value ?? '';
  const kind: LoadoutKind = near(tab, 'FREE LOADOUT') ? 'free' : near(tab, 'CUSTOM LOADOUT') ? 'custom' : 'unknown';
  const boxes = equipBoxes(bp);
  const equip = EQUIP_SLOTS.map(s => readEquip(img, s, boxes[s], kind === 'free'));
  const toks = numberTokens(img, valueArea(bp), isCream).filter(t => !t.text.includes('/') && !t.text.includes('.'));
  const value = toks.length ? parseGrouped(toks[toks.length - 1].text) : null;
  const read = readScreenshot(img, { panels: ['backpack', 'quickUse'] });
  const panel = (id: 'backpack' | 'quickUse') => read.panels.find(p => p.panel === id);
  return {
    kind, value, equip,
    backpack: panel('backpack')?.cells ?? null, quickUse: panel('quickUse')?.cells ?? null,
    backpackMax: panel('backpack')?.slotsMax ?? null, quickUseMax: panel('quickUse')?.slotsMax ?? null,
    screen: { ...read, coins: null, premium: null, stashValue: null, headerSlots: null, headerSlotsMax: null },
  };
}
