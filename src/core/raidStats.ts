/* 0.32.0: osobní analytika z deníku raidů (AI Bedňák fáze 3, Personal AI Analyst). Čisté deterministické funkce bez
   DOM: souhrny přežití, hodnoty lootu, trendu a sérií po mapách, loadoutech, zbraních a typech raidu. Ke každému
   číslu patří velikost vzorku (n) a příznak smallSample, když je vzorek pod STATS_MIN_SAMPLE raidů; z malého vzorku
   se nic nevyvozuje (trend jen s enoughData). Stejná čísla ukazuje Statistics (tabulka map) i AI (core/aiContext.ts).
   - Přežití: survived = raid.ok, knockedOut = ostatní. Podíl jen při n > 0 (jinak null).
   - Hodnota lootu: součet itemFacts(name).value × qty u předmětů se známou cenou; průměr jen přes raidy, které mají
     zapsaný loot (lootN). Předměty bez ceny se spočítají zvlášť (itemsWithoutPrice).
   - Mince: průměr jen z přežitých raidů (stejně jako runStats).
   - Trend: posledních TREND_N raidů skupiny proti všem dřívějším; enoughData, když obě části mají aspoň
     STATS_MIN_SAMPLE raidů. Rozdíly jen tehdy, když obě části mají data.
   - Série: aktuální série výsledků od nejnovějšího raidu a nejdelší série přežití a vyřazení.
   - Zbraň raidu: první položka výbavy raidu (gear), jejíž název bez tieru (I–IV) je zbraň z katalogu; raidy bez
     zbraně ve výbavě se do přehledu zbraní nepočítají.
   Nic z toho neobsahuje poznámky, id záznamů ani jména hráčů; id map a loadoutů zůstávají jen jako klíče. */
import type { Raid } from './types';
import { ITEM_TIERS } from './types';
import { itemFacts } from './loadouts';

export const STATS_MIN_SAMPLE = 5;
export const TREND_N = 5;

const r2 = (v: number): number => Math.round(v * 100) / 100;
const byTime = (a: Raid, b: Raid) => a.ts - b.ts || a.id.localeCompare(b.id);

/* Hodnota lootu jednoho raidu: známá část a počet položek bez ceny. */
export function lootValueOf(r: Pick<Raid, 'loot'>): { value: number; unknown: number } {
  let value = 0, unknown = 0;
  for (const x of r.loot) {
    const v = itemFacts(x.name).value;
    if (v === null) unknown++; else value += v * x.qty;
  }
  return { value, unknown };
}

export interface StatsAgg {
  raids: number; survived: number; knockedOut: number;
  /* 0–1, dvě desetinná místa; null = žádný raid */
  survivalRate: number | null;
  /* raidy se zapsaným lootem (lootN), průměrná známá hodnota lootu, položky bez ceny */
  lootN: number; avgLootValue: number | null; itemsWithoutPrice: number;
  /* přežité raidy s mincemi (coinsN = survived), průměr mincí */
  coinsN: number; avgCoins: number | null;
  smallSample: boolean;
}
export function aggregate(raids: readonly Raid[]): StatsAgg {
  const n = raids.length;
  const survived = raids.filter(r => r.ok).length;
  let lootN = 0, lootSum = 0, unknown = 0;
  for (const r of raids) {
    if (!r.loot.length) continue;
    const v = lootValueOf(r);
    lootN++; lootSum += v.value; unknown += v.unknown;
  }
  const coins = raids.reduce((a, r) => a + (r.ok ? r.coins : 0), 0);
  return {
    raids: n, survived, knockedOut: n - survived,
    survivalRate: n ? r2(survived / n) : null,
    lootN, avgLootValue: lootN ? Math.round(lootSum / lootN) : null, itemsWithoutPrice: unknown,
    coinsN: survived, avgCoins: survived ? Math.round(coins / survived) : null,
    smallSample: n < STATS_MIN_SAMPLE,
  };
}

export interface TrendPart { raids: number; survivalRate: number | null; lootN: number; avgLootValue: number | null }
export interface StatsTrend {
  lastN: number;
  recent: TrendPart; earlier: TrendPart;
  /* recent − earlier; null, když jedna z částí data nemá */
  survivalRateChange: number | null; avgLootValueChange: number | null;
  /* obě části mají aspoň STATS_MIN_SAMPLE raidů: jen pak má smysl o trendu mluvit */
  enoughData: boolean;
}
const part = (rs: readonly Raid[]): TrendPart => { const a = aggregate(rs); return { raids: a.raids, survivalRate: a.survivalRate, lootN: a.lootN, avgLootValue: a.avgLootValue }; };
export function trendOf(raids: readonly Raid[], lastN = TREND_N): StatsTrend {
  const sorted = [...raids].sort(byTime);
  const cut = Math.max(0, sorted.length - lastN);
  const recent = part(sorted.slice(cut)), earlier = part(sorted.slice(0, cut));
  return {
    lastN, recent, earlier,
    survivalRateChange: recent.survivalRate !== null && earlier.survivalRate !== null ? r2(recent.survivalRate - earlier.survivalRate) : null,
    avgLootValueChange: recent.avgLootValue !== null && earlier.avgLootValue !== null ? recent.avgLootValue - earlier.avgLootValue : null,
    enoughData: recent.raids >= STATS_MIN_SAMPLE && earlier.raids >= STATS_MIN_SAMPLE,
  };
}

export type StreakOutcome = 'survived' | 'knockedOut';
export interface StatsStreaks {
  raids: number;
  current: { outcome: StreakOutcome; length: number } | null;
  longestSurvived: number; longestKnockedOut: number;
}
export function streaksOf(raids: readonly Raid[]): StatsStreaks {
  const sorted = [...raids].sort(byTime);
  let longestSurvived = 0, longestKnockedOut = 0, run = 0, prev: boolean | null = null;
  for (const r of sorted) {
    run = prev === r.ok ? run + 1 : 1;
    prev = r.ok;
    if (r.ok) longestSurvived = Math.max(longestSurvived, run); else longestKnockedOut = Math.max(longestKnockedOut, run);
  }
  return {
    raids: sorted.length,
    current: prev === null ? null : { outcome: prev ? 'survived' : 'knockedOut', length: run },
    longestSurvived, longestKnockedOut,
  };
}

/* Zbraň raidu z výbavy: název bez tieru, který je v seznamu zbraní (porovnání bez ohledu na velikost písmen). */
const TIER_RE = new RegExp(`\\s+(?:${ITEM_TIERS.join('|')})$`, 'i');
export function weaponOfRaid(r: Pick<Raid, 'gear'>, weapons: ReadonlyMap<string, string>): string | null {
  for (const g of r.gear) {
    const base = g.name.trim().replace(TIER_RE, '').toLowerCase();
    const w = weapons.get(base);
    if (w) return w;
  }
  return null;
}

export interface GroupRow extends StatsAgg { key: string }
export interface MapRow extends GroupRow { trend: StatsTrend; currentStreak: StatsStreaks['current'] }
export interface RaidStatsReport {
  overall: StatsAgg;
  /* první a poslední den deníku (čas), null = prázdný deník; auto = zapsané automatickým snímáním */
  from: number | null; to: number | null; auto: number;
  trend: StatsTrend; streaks: StatsStreaks;
  /* nejvíc raidů napřed, pak klíč */
  byMap: MapRow[]; byLoadout: GroupRow[]; byWeapon: GroupRow[]; byType: GroupRow[];
  /* raidy, u kterých je zbraň ve výbavě */
  weaponRaids: number;
}

function groups(raids: readonly Raid[], keyOf: (r: Raid) => string | null): [string, Raid[]][] {
  const by = new Map<string, Raid[]>();
  for (const r of raids) { const k = keyOf(r); if (k === null) continue; const l = by.get(k); if (l) l.push(r); else by.set(k, [r]); }
  return [...by].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/* Celý přehled deníku. weapons: názvy zbraní (malými písmeny → název), z katalogu včetně vlastních. */
export function raidStats(raids: readonly Raid[], weapons: ReadonlyMap<string, string> = new Map()): RaidStatsReport {
  const sorted = [...raids].sort(byTime);
  const weaponOf = (r: Raid) => weaponOfRaid(r, weapons);
  const byWeapon = groups(sorted, weaponOf).map(([key, l]) => ({ key, ...aggregate(l) }));
  return {
    overall: aggregate(sorted),
    from: sorted.length ? sorted[0].ts : null, to: sorted.length ? sorted[sorted.length - 1].ts : null,
    auto: sorted.filter(r => !!r.auto).length,
    trend: trendOf(sorted), streaks: streaksOf(sorted),
    byMap: groups(sorted, r => r.map || null).map(([key, l]) => ({ key, ...aggregate(l), trend: trendOf(l), currentStreak: streaksOf(l).current })),
    byLoadout: groups(sorted, r => r.loadout || '').map(([key, l]) => ({ key, ...aggregate(l) })),
    byWeapon, weaponRaids: byWeapon.reduce((a, g) => a + g.raids, 0),
    byType: groups(sorted, r => r.type || 'other').map(([key, l]) => ({ key, ...aggregate(l) })),
  };
}

/* Trend pro zobrazení: 'up' / 'down' / 'flat' jen s dostatkem dat (změna podílu přežití aspoň o 10 bodů), jinak null. */
export function trendDirection(t: StatsTrend): 'up' | 'down' | 'flat' | null {
  if (!t.enoughData || t.survivalRateChange === null) return null;
  if (t.survivalRateChange >= 0.1) return 'up';
  if (t.survivalRateChange <= -0.1) return 'down';
  return 'flat';
}
