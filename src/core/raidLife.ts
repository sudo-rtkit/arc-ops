/* 0.20.0: průběh raidu z automaticky snímaných obrazovek mimo raid (čistá logika, bez DOM a bez snímků).
   Stavový automat: loadout viděn → v raidu (žádná známá obrazovka menu) → výsledek viděn (FINDINGS = přežil
   a loot, KNOCKED OUT = ztratil výbavu). Z výsledku vznikne návrh záznamu do Deníku raidů:
   - čas, mapa (z aktivního plánu raidu, jinak neznámá a ke kontrole), loadout, přežil ano/ne, loot a hodnota
     ztraceného loadoutu, pokud je známá;
   - jisté údaje se zapíší hned (store se snímkem stavu a tlačítkem Zpět), nejisté jdou do fronty „Ke kontrole“.
   Okrajové případy:
   - výsledek bez viděného loadoutu: loadout neznámý, loot nejde oddělit od výbavy → celý do kontroly;
   - dva loadouty po sobě: platí poslední (předchozí se nenasadil);
   - restart aplikace uprostřed raidu: stav je uložený (schéma 17), výsledek se spáruje s loadoutem, pokud není
     starší než LOADOUT_STALE_MS;
   - vypnutí snímání uprostřed raidu: stav se zahodí (loadout se nespáruje s pozdějším výsledkem);
   - po raidu bez zachyceného výsledku (v raidu, pak jiná obrazovka menu): loadout se zahodí. */
import type { AppState, ItemQty, Raid, RaidType } from './types';
import { MAPS } from './data/maps';
import { clampInt, isObj, text } from './util';
import { normalizeItems } from './raidItems';
import { lootMinusGear, type LootAnalysis, type MatchContext } from './visionImport';
import { matchFp, MATCH_SURE, type LearnedFp } from './vision/match';
import { analyzeLoot } from './visionImport';
import type { LoadoutRead } from './vision/loadout';
import { LOADOUT_SLOTS, isRustScreen, type LoadoutSlot, type ReviewItem, type ReviewRow, type RustScreen } from './autoCapture';

export type FieldConf = 'high' | 'medium' | 'unknown';
/* Jedno místo výbavy nebo předmět v batohu / quick use. state: item = předmět (name null = nepoznaný),
   random = volný loadout (hra vylosuje), empty = prázdné místo. */
export interface LoadoutField { slot: LoadoutSlot; state: 'item' | 'random' | 'empty'; name: string | null; qty: number; conf: FieldConf }
export interface LoadoutSnap { at: number; kind: 'free' | 'custom' | 'unknown'; value: number | null; fields: LoadoutField[] }

export type LifePhase = 'idle' | 'loadout' | 'inRaid';
export interface RaidLife {
  phase: LifePhase;
  loadout: LoadoutSnap | null;
  /* od kdy je na obrazovce ticho (žádná známá obrazovka) po loadoutu; 0 = není */
  quietSince: number;
}
export const emptyRaidLife = (): RaidLife => ({ phase: 'idle', loadout: null, quietSince: 0 });

/* Ticho delší než tohle po loadoutu = hráč je v raidu (matchmaking a načítání trvají desítky sekund). */
export const IN_RAID_QUIET_MS = 45_000;
/* Starší loadout se s výsledkem nespáruje (raid trvá nejvýš ~30–45 min, plus čekání). */
export const LOADOUT_STALE_MS = 3 * 3600_000;

export type LifeEvent =
  | { type: 'loadout'; at: number; loadout: LoadoutSnap }
  | { type: 'screen'; at: number; screen: RustScreen | null }
  | { type: 'result'; at: number }
  | { type: 'disable'; at: number };
/* Výsledek kroku. pair = loadout ke spárování s výsledkem (jen u 'result'); stale = loadout byl, ale je starý. */
export interface LifeStep { life: RaidLife; pair?: { loadout: LoadoutSnap | null; stale: boolean } }

const MENU: readonly RustScreen[] = ['stash', 'profile', 'workshop', 'quests', 'skills'];

export function lifeStep(life: RaidLife, ev: LifeEvent): LifeStep {
  switch (ev.type) {
    case 'loadout':
      return { life: { phase: 'loadout', loadout: ev.loadout, quietSince: 0 } };
    case 'disable':
      return { life: emptyRaidLife() };
    case 'result': {
      const lo = life.loadout;
      const stale = !!lo && ev.at - lo.at > LOADOUT_STALE_MS;
      return { life: emptyRaidLife(), pair: { loadout: lo && !stale ? lo : null, stale } };
    }
    case 'screen': {
      if (life.phase === 'idle') return { life };
      if (ev.screen === null) {
        const quietSince = life.quietSince || ev.at;
        const phase: LifePhase = life.phase === 'loadout' && ev.at - quietSince >= IN_RAID_QUIET_MS ? 'inRaid' : life.phase;
        return { life: { ...life, phase, quietSince } };
      }
      if (MENU.includes(ev.screen)) {
        /* v raidu se menu neukazuje: raid skončil bez zachyceného výsledku, loadout už neplatí */
        if (life.phase === 'inRaid') return { life: emptyRaidLife() };
        return { life: { ...life, quietSince: 0 } };
      }
      /* loadout a výsledek řeší vlastní události (plný snímek) */
      return { life: { ...life, quietSince: 0 } };
    }
  }
}

/* ----- loadout ze snímku ----- */
/* Pole s jistotou z otisku: known (≥ MATCH_SURE) = high, uncertain = medium, jinak neznámé. */
export function loadoutSnap(read: LoadoutRead, learned: LearnedFp[], ctx: MatchContext, at: number): LoadoutSnap {
  const fields: LoadoutField[] = [];
  for (const e of read.equip) {
    if (e.state !== 'item' || !e.fp) { fields.push({ slot: e.slot, state: e.state, name: null, qty: 1, conf: 'high' }); continue; }
    const m = matchFp(e.fp, e.rarity, learned, ctx.catalog ?? []);
    const conf: FieldConf = m.itemKey === null ? 'unknown' : m.status === 'known' && m.score >= MATCH_SURE ? 'high' : m.status === 'unknown' ? 'unknown' : 'medium';
    fields.push({ slot: e.slot, state: 'item', name: conf === 'unknown' ? null : m.itemKey, qty: 1, conf });
  }
  /* batoh a quick use: stejné rozpoznání jako loot po raidu (skupiny stejných předmětů) */
  if (read.screen) {
    const a = analyzeLoot(read.screen, learned, ctx);
    for (const g of a.groups) {
      const slot: LoadoutSlot = g.cells[0]?.panel === 'quickUse' ? 'quickUse' : 'backpack';
      const known = g.match.itemKey !== null && g.match.status !== 'unknown';
      const conf: FieldConf = !known ? 'unknown' : g.match.status === 'known' && g.countSure ? 'high' : 'medium';
      fields.push({ slot, state: 'item', name: known ? g.match.itemKey : null, qty: clampInt(g.count ?? 1, 1, 99999), conf });
    }
  }
  /* volný loadout: batoh a quick use vylosuje hra (na obrazovce jen symbol „náhodné“) */
  if (read.kind === 'free') for (const slot of ['backpack', 'quickUse'] as const) if (!fields.some(f => f.slot === slot)) fields.push({ slot, state: 'random', name: null, qty: 1, conf: 'high' });
  return { at, kind: read.kind, value: read.value, fields };
}

/* Výbava, která je jistě známá (jen pojmenované předměty). */
export const knownGear = (lo: LoadoutSnap): ItemQty[] =>
  normalizeItems(lo.fields.filter(f => f.state === 'item' && f.name && f.conf !== 'unknown').map(f => ({ name: f.name!, qty: f.qty })));
/* Místa, o kterých nic nevíme (nepoznaný předmět nebo vylosovaná výbava). */
export const unknownSlots = (lo: LoadoutSnap | null): LoadoutSlot[] =>
  lo ? [...new Set(lo.fields.filter(f => (f.state === 'item' && f.conf === 'unknown') || f.state === 'random').map(f => f.slot))] : [...LOADOUT_SLOTS];
/* Obsah batohu a quick use je celý známý (jen pak jde loot oddělit od výbavy). */
export const packKnown = (lo: LoadoutSnap | null): boolean =>
  !!lo && lo.kind !== 'free' && !lo.fields.some(f => (f.slot === 'backpack' || f.slot === 'quickUse') && (f.state === 'random' || f.conf === 'unknown'));

export function normalizeLoadoutSnap(raw: unknown): LoadoutSnap | null {
  if (!isObj(raw)) return null;
  const kind = raw.kind === 'free' || raw.kind === 'custom' ? raw.kind : 'unknown';
  const fields = (Array.isArray(raw.fields) ? raw.fields : []).filter(isObj).slice(0, 40).flatMap((f): LoadoutField[] => {
    if (!(LOADOUT_SLOTS as readonly unknown[]).includes(f.slot)) return [];
    const state = f.state === 'random' || f.state === 'empty' ? f.state : 'item';
    const conf: FieldConf = f.conf === 'high' || f.conf === 'medium' ? f.conf : 'unknown';
    const name = typeof f.name === 'string' && f.name.trim() ? text(f.name, 80) : null;
    return [{ slot: f.slot as LoadoutSlot, state, name, qty: clampInt(f.qty ?? 1, 1, 99999), conf: name || state !== 'item' ? conf : 'unknown' }];
  });
  return { at: clampInt(raw.at || 0, 0, 9e15), kind, value: raw.value === null || raw.value === undefined ? null : clampInt(raw.value, 0, 1e9), fields };
}
export function normalizeRaidLife(raw: unknown): RaidLife {
  if (!isObj(raw)) return emptyRaidLife();
  const loadout = normalizeLoadoutSnap(raw.loadout);
  const phase: LifePhase = raw.phase === 'loadout' || raw.phase === 'inRaid' ? raw.phase : 'idle';
  if (phase === 'idle' || !loadout) return emptyRaidLife();
  return { phase, loadout, quietSince: clampInt(raw.quietSince || 0, 0, 9e15) };
}
export const isLifeScreen = (v: unknown): v is RustScreen | null => v === null || isRustScreen(v);

/* ----- návrh záznamu raidu z výsledku ----- */
export type RaidOutcome = 'survived' | 'knockedOut';
export interface ResultCapture { at: number; outcome: RaidOutcome; loot: LootAnalysis | null; sig: string | null }
export type AutoUnsure = 'map' | 'loadout' | 'loot';
/* Údaje automatického zápisu v záznamu raidu (schéma 17, volitelné). */
export interface RaidAuto {
  at: number; survived: boolean;
  /* hodnota loadoutu z přípravy (null = neznámá) a hodnota ztraceného loadoutu (jen KNOCKED OUT) */
  value: number | null; lostValue: number | null;
  kind: 'free' | 'custom' | 'unknown' | null;
  unsure: AutoUnsure[];
}
export interface RaidDraft {
  raid: Pick<Raid, 'ts' | 'map' | 'type' | 'ok' | 'coins' | 'min' | 'gear' | 'loot' | 'lost'> & { auto: RaidAuto };
  review: Omit<ReviewItem, 'id' | 'raidId' | 'at'>[];
  /* počet jistě zapsaných položek lootu */
  items: number;
}

const MAP_IDS = MAPS.map(m => m.id);

export function buildDraft(s: AppState, cap: ResultCapture, pair: { loadout: LoadoutSnap | null }): RaidDraft {
  const plan = s.raidPlan && s.raidPlan.startedAt <= cap.at ? s.raidPlan : null;
  const lo = pair.loadout;
  const unsure: AutoUnsure[] = [];
  const review: RaidDraft['review'] = [];
  /* mapa: jen z aktivního plánu; jinak poslední mapa (nebo první) a kontrola */
  let map = plan && MAP_IDS.includes(plan.map) ? plan.map : '';
  if (!map) {
    unsure.push('map');
    review.push({ kind: 'map' });
    map = MAP_IDS.includes(s.raids[s.raids.length - 1]?.map ?? '') ? s.raids[s.raids.length - 1].map : MAP_IDS[0];
  }
  const type: RaidType = plan ? (plan.goals.money ? 'money' : plan.goals.quests.length ? 'quest' : 'other') : 'other';
  const gear = lo ? knownGear(lo) : [];
  const slots = unknownSlots(lo);
  if (!lo || slots.some(sl => lo.fields.some(f => f.slot === sl && f.state === 'item'))) {
    unsure.push('loadout');
    review.push({ kind: 'loadout', slots });
  }
  const survived = cap.outcome === 'survived';
  let loot: ItemQty[] = [];
  let items = 0;
  if (survived && cap.loot) {
    const sure = cap.loot.groups.filter(g => g.match.status === 'known' && g.match.itemKey && g.countSure && g.count !== null);
    const rest = cap.loot.groups.filter(g => !sure.includes(g));
    const toRow = (g: typeof cap.loot.groups[number]): ReviewRow => ({ guess: g.match.itemKey ?? '', qty: g.count, score: Math.round(g.match.score * 1000) / 1000 });
    if (packKnown(lo)) {
      /* výbava známá: jistý loot = jisté položky batohu minus výbava; nejisté řádky ke kontrole */
      loot = lootMinusGear(normalizeItems(sure.map(g => ({ name: g.match.itemKey!, qty: g.count! }))), gear);
      items = loot.length;
      if (rest.length) { unsure.push('loot'); review.push({ kind: 'loot', rows: rest.map(toRow) }); }
    } else if (cap.loot.groups.length) {
      /* výbava batohu neznámá (bez loadoutu nebo volný loadout): loot nejde oddělit od výbavy, vše ke kontrole */
      unsure.push('loot');
      review.push({ kind: 'loot', rows: cap.loot.groups.map(toRow) });
    }
  }
  return {
    raid: {
      ts: cap.at, map, type, ok: survived, coins: 0, min: 0, gear,
      loot, lost: survived ? [] : gear,
      auto: { at: cap.at, survived, value: lo?.value ?? null, lostValue: !survived ? lo?.value ?? null : null, kind: lo?.kind ?? null, unsure },
    },
    review, items,
  };
}

export function normalizeRaidAuto(raw: unknown): { auto?: RaidAuto } {
  if (!isObj(raw)) return {};
  const num = (v: unknown) => (v === null || v === undefined ? null : clampInt(v, 0, 1e9));
  const kind = raw.kind === 'free' || raw.kind === 'custom' || raw.kind === 'unknown' ? raw.kind : null;
  const unsure = (Array.isArray(raw.unsure) ? raw.unsure : []).filter((u): u is AutoUnsure => u === 'map' || u === 'loadout' || u === 'loot');
  return { auto: { at: clampInt(raw.at || 0, 0, 9e15), survived: raw.survived !== false, value: num(raw.value), lostValue: num(raw.lostValue), kind, unsure: [...new Set(unsure)] } };
}
