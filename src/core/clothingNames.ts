/* 0.34.0: názvy sad a dílů oblečení cs/en (src/core/data/clothing-names.json, generuje
   scripts/gen-clothing-assets.mjs). Zvlášť od src/core/clothing.ts, aby je okna bez šatníku (buddy, overlay, widgety)
   nenačítala; potřebuje je jen šatník a hláška o nové sadě v hlavním okně. */
import NAMES from './data/clothing-names.json';
import { parsePiece, type ClothingSlot } from './clothing';
import type { Lang } from './types';

type Text = { cs: string; en: string };
const N = NAMES as unknown as Record<string, { name: Text; pieces: Record<ClothingSlot, Text> }>;

export const setName = (id: string, lang: Lang): string => N[id]?.name[lang] ?? id;
export const pieceName = (id: string, lang: Lang): string => { const p = parsePiece(id); return p ? N[p.set]?.pieces[p.slot][lang] ?? id : id; };
