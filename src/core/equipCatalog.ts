/* 0.24.0: tvary zbraní a augmentů pro místa výbavy (src/core/data/equipShapes.ts, generuje scripts/gen-equip.mjs).
   0.25.0: samostatný modul (dřív v catalog.ts): tvary potřebuje jen čtečka výbavy, takže se načtou s ní a ne se
   sdíleným balíkem všech oken (widgety, overlay, hlavní okno při startu). */
import { EQUIP_MAG_MODS, EQUIP_SHAPES } from './data/equipShapes';
import { SHAPE_LEN, type EquipShape } from './vision/equip';

let shapes: EquipShape[] | null = null;
export function equipShapes(): EquipShape[] {
  if (!shapes) {
    const dec = (b64: string): number[] => { const bin = atob(b64); return Array.from(bin, c => c.charCodeAt(0)); };
    shapes = EQUIP_SHAPES.map(r => ({
      name: r.n, kind: r.k, ...(r.r ? { rarity: r.r } : {}), ...(r.mag ? { mag: r.mag } : {}),
      /* 0.25.0: zásobník po tierech a zvětšení doplňkem podle druhu munice (bez druhu munice nevíme: magAdd chybí) */
      ...(r.mt ? { magTiers: r.mt } : {}), ...(r.am ? { magAdd: EQUIP_MAG_MODS[r.am] ?? [] } : {}),
      shapes: r.s.map(x => ({ v: dec(x.v), aspect: x.a })).filter(x => x.v.length === SHAPE_LEN),
    }));
  }
  return shapes;
}
