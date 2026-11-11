/* Workshop: další upgrady, připravenost, nákupní seznam. Věrný převod z původního deníku. */
import type { Recipe, Station } from './types';
import { SOURCES, STATIONS } from './data/stations';
import { t } from '../i18n';

export interface WorkshopView {
  stations: Record<string, number>;
  inventory: Record<string, number>;
  profile: { level: number };
}

export interface NextNeed { station: Station; level: number; mats: Recipe; block: string | null }

export function reqBlock(view: WorkshopView, st: Station, lvl: number): string | null {
  const r = st.req && st.req[lvl];
  if (!r) return null;
  if (r.outpost && view.stations.outpost < r.outpost) return t('workshop.req.outpost', { n: r.outpost });
  if (r.level && view.profile.level < r.level) return t('workshop.req.level', { n: r.level });
  return null;
}

/* Další úroveň každé stanice, která ještě není na maximu. */
export function nextNeeds(view: WorkshopView, stations: Station[] = STATIONS): NextNeed[] {
  const out: NextNeed[] = [];
  for (const st of stations) {
    const lvl = view.stations[st.id];
    const nxt = lvl + 1;
    if (nxt > st.max || !st.levels[nxt]) continue;
    out.push({ station: st, level: nxt, mats: st.levels[nxt], block: reqBlock(view, st, nxt) });
  }
  return out;
}

/* Podíl materiálu, který už je na skladě (0–1). */
export function readiness(inventory: Record<string, number>, mats: Recipe): number {
  let have = 0, need = 0;
  for (const [m, n] of mats) { need += n; have += Math.min(n, inventory[m] || 0); }
  return need ? have / need : 1;
}

export interface ShoppingRow {
  mat: string; need: number; uses: string[];
  have: number; missing: number; src: string; arc: boolean;
}

/* Součet materiálu na další úroveň všech stanic; jeden řádek na materiál. */
export function shopping(view: WorkshopView, stations: Station[] = STATIONS, sources: Record<string, string> = SOURCES): ShoppingRow[] {
  const agg: Record<string, { mat: string; need: number; uses: string[] }> = {};
  for (const nn of nextNeeds(view, stations)) {
    for (const [m, n] of nn.mats) {
      if (!agg[m]) agg[m] = { mat: m, need: 0, uses: [] };
      agg[m].need += n;
      agg[m].uses.push(nn.station.name + ' ' + nn.level);
    }
  }
  return Object.values(agg).map(x => {
    const have = view.inventory[x.mat] || 0;
    const src = sources[x.mat] || 'Loot';
    return Object.assign(x, { have, missing: Math.max(0, x.need - have), src, arc: src.startsWith('ARC') });
  }).sort((a, b) => (Number(b.arc) - Number(a.arc)) || (b.missing - a.missing) || a.mat.localeCompare(b.mat));
}

export function workshopProgress(levels: Record<string, number>, stations: Station[] = STATIONS): { now: number; max: number } {
  return {
    now: stations.reduce((a, st) => a + (levels[st.id] || 0), 0),
    max: stations.reduce((a, st) => a + st.max, 0),
  };
}

/* Upgrade s odečtem materiálu. Vrací nové úrovně a zásobu, nebo null, když upgrade nejde. */
export function applyUpgrade(view: WorkshopView, stationId: string, stations: Station[] = STATIONS):
  { stations: Record<string, number>; inventory: Record<string, number> } | null {
  const st = stations.find(s => s.id === stationId);
  if (!st) return null;
  const nxt = view.stations[stationId] + 1;
  const mats = st.levels[nxt];
  if (!mats || reqBlock(view, st, nxt) || readiness(view.inventory, mats) < 1) return null;
  const inventory = { ...view.inventory };
  for (const [m, n] of mats) {
    inventory[m] = (inventory[m] || 0) - n;
    if (inventory[m] <= 0) delete inventory[m];
  }
  return { stations: { ...view.stations, [stationId]: nxt }, inventory };
}
