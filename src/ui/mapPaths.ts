/* Ikony typů bodů a glyfy typů míst (0.14.0). Geometrie 1:1 ze src/assets/maps/sprite.svg (návrh Sol,
   docs/design/maps/assets): mřížka 24 px, tah 1,7, currentColor, takže zůstanou ostré v každé velikosti.
   Shodu se sprite hlídá tests/core/raid-prep.test.ts. */
import type { PoiType } from '../core/lootAreas';

export const POI_PATHS: Record<PoiType, string> = {
  crate: 'M4 7h16v13H4zM3 4h18v4H3zM9 11h6',
  weapon: 'M3 5h18v15H3zM6 14l3-4h9m-5 0v4m-6 0h4',
  extraction: 'M5 4h8v5M5 4v16h8v-5M10 12h11m-4-4 4 4-4 4',
  hatch: 'M4 5h16v15H4zM8 5v15m8-15v15M8 10h8m-8 5h8',
  key: 'M14 4h6v16h-6M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 15v6m0-3h3',
  quest: 'm12 3 9 9-9 9-9-9zM12 7v6m0 3v1',
  arc: 'm12 3 10 18H2zM8 16l4-8 4 8m-6-3h4',
  pvp: 'M4 4l16 16M20 4 4 20M3 7V3h4m10 0h4v4M3 17v4h4m10 0h4v-4',
  room: 'M4 4h16v16H4zM8 20V9h8v11M12 13v3',
  note: 'M5 3h14v14l-4 4H5zM9 8h6m-6 4h6m0 9v-5h4',
  player: 'm12 3 8 17-8-4-8 4z',
};
/* klíč = slug typu místa (areaSlug) */
export const AREA_PATHS: Record<string, string> = {
  'arc': 'M5 17 12 4 19 17M8 12h8',
  'electrical': 'm14 3-8 10h6l-2 8 8-12h-6z',
  'mechanical': 'M8 4h8l4 8-4 8H8l-4-8zM9 9h6v6H9z',
  'nature': 'M18 4C7 4 3 10 7 16s13 1 11-12ZM7 18l8-10',
  'residential': 'm4 11 8-7 8 7M6 10v10h12V10M10 20v-6h4v6',
  'medical': 'M9 4h6v5h5v6h-5v5H9v-5H4V9h5z',
  'commercial': 'M4 8h16l-2 12H6zM8 8V4h8v4',
  'old-world': 'M5 8h14M6 8v10m6-10v10m6-10v10M4 20h16M4 6l8-3 8 3',
  'technological': 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4',
  'security': 'm12 3 8 3v6c0 4-8 9-8 9S4 16 4 12V6zM8 11l3 3 5-6',
  'exodus': 'm4 5 8 6 8-6M4 19l8-6 8 6M12 3v18',
  'industrial': 'M4 20V9l6 4V9l6 4V4h4v16zM7 16v2m5-2v2',
  'raider': 'm6 20 5-16h7l-4 7h4l-9 9 3-8H9',
};
