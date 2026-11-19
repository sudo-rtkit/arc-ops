/* 0.30.0: data pro AI asistenta. Model nedostane žádné nástroje: aplikace podle druhu otázky sama složí malý balík
   údajů ze stávajících deterministických výpočtů a pošle ho jako data, ne jako pokyny.
   - Předmět (karta předmětu, tlačítko „Zeptat se Opse“): údaje z karty předmětu (itemCard), rada nech / prodej /
     recykluj, potřeby úkolů, stanic a projektů, zásoba a obsazenost bedny.
   - „Co dál?“ (tlačítko „Proč?“): tipy rádce s důvodem a čísla, ze kterých vychází.
   - Volná otázka: obojí (předměty jen ty, které otázka jmenuje), omezené velikostí.
   0.31.0 (fáze 2), každý druh má vlastní balík jen s potřebnými poli:
   - Úkoly a dílna (quests; tlačítko u úkolu v Úkolech a u stanice ve Workshopu): stav katalogu úkolů (splněno,
     dostupné, další v řetězu, cíle), materiály, které úkoly ještě potřebují, další úrovně stanic s recepty a
     zásobou a doporučené další vylepšení (stejný výběr jako kompaktní okno).
   - Příprava na raid (raid, AI Raid Planner): aktivní plán (cíle, mapa a trasa jménem), seznam k hledání, souhrn
     loadoutu z builderu (hodnota, váha, hodnota v riziku) a další mapy s body jako varianty. Všechna čísla jsou
     z Přípravy na raid; model nic nepočítá.
   - Shrnutí po raidu (postRaid; jen na kliknutí Shrnout raid): vyhodnocení po raidu a záznam posledního raidu
     z deníku (výsledek, hodnota lootu, co posunul). Poznámky raidu, cíle hráče z deníku ani id se neposílají.
   0.32.0 (fáze 3, Personal AI Analyst):
   - Analytika (stats; tlačítko ve Statistics a u řádku mapy, odkaz map:<id>): souhrny deníku raidů z core/raidStats.ts
     (přežití, vyřazení, průměrná hodnota lootu a mincí, trend posledních raidů proti dřívějším, série) celkově, po
     mapách, loadoutech, zbraních a typech raidu. Ke každému číslu velikost vzorku a smallSample (n < minSample).
   - Volná otázka, která zmiňuje mapy nebo raidy, dostane stručný souhrn (celkově, série, nejvýš 4 mapy).
   Nikdy se neposílá: snímek obrazovky, jména jiných hráčů (deník raidů, poznámky a body map vůbec), celá záloha,
   cesty k souborům, e-maily, kód relace ani jiné dlouhé tokeny. Každý text projde safeText (bez řídicích znaků,
   bez < a >, které by mohly ukončit blok dat, bez adres, cest, e-mailů a tokenů, omezená délka).
   Otázka a data jsou v ohraničených blocích <question> a <app_data>; pokyny modelu (aiPrompts.ts) říkají, že obsah
   bloků jsou data, ne pokyny. Každý údaj má zdroj pro seznam pod odpovědí (původ hodnoty z 0.21.0 a jistota). */
import type { AppState, Lang, OpsPersonality, Raid } from './types';
import type { AtQuest } from './data/arctracker';
import type { AdvisorTip } from './advisor';
import { provOf, type ProvRec } from './provenance';
import { itemCard } from './itemCard';
import { catalogItems } from './catalog';
import { locText, objectiveProgress, projectNeeds, questById, questName, questNeeds, questProgress, questStatus, QUESTS } from './quests';
import { activeQuests, nextUpgrade, stockOf } from './compact';
import { nextNeeds, readiness, reqBlock, workshopProgress } from './workshop';
import { stationTargets } from './planner';
import { getRoutes, getStations, getWeapons, recipeKey } from './gamedata';
import { raidStats, STATS_MIN_SAMPLE, trendDirection, type MapRow, type StatsAgg, type StatsTrend } from './raidStats';
import { defaultGoals, goalLabels, listSig, raidList, recommendedMap, scoreMaps, validGoals, type MapReason } from './raidPrep';
import { evaluateRaid, knownRisk, loadoutOutcome, nextRaid, planLoadout, planRaid, raidGear } from './raidEval';
import { itemFacts, type LoadoutSummary } from './loadouts';
import { MAPS } from './data/maps';
import { tl, type Key, type MsgRef } from '../i18n/core';
import { aiSystemPrompt } from '../i18n/aiPrompts';
import type { AiAsk, AiKind } from './ai';

export interface AiMessage { role: 'system' | 'user'; content: string }
/* Zdroj pod odpovědí. rec: původ hodnoty (null = výchozí, nikdy nezadaná); undefined = spočítala aplikace. */
export interface AiSource {
  id: string;
  kind: 'item' | 'stock' | 'need' | 'advice' | 'stash' | 'tip' | 'profile' | 'quest' | 'quests' | 'questMats' | 'station' | 'workshop'
    | 'plan' | 'raidList' | 'map' | 'loadout' | 'eval' | 'raid'
    /* 0.32.0: analytika z deníku raidů */
    | 'journal' | 'statsMap' | 'statsMaps' | 'statsLoadouts' | 'statsWeapons';
  label: string; rec?: ProvRec | null;
}
export interface AiContext { messages: AiMessage[]; sources: AiSource[]; dataChars: number }

/* Nejvýš tolik znaků dat (JSON) v jednom dotazu; zprávy dohromady musí pod mez Rustu (24 KB). */
export const CONTEXT_MAX = 12_000;
const STR_MAX = 120;

/* Text do dat: bez řídicích znaků, bez < > (blok dat nejde ukončit), bez adres, cest, e-mailů a dlouhých tokenů. */
export function safeText(v: unknown, max = STR_MAX): string {
  let s = typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  s = s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[link]');
  s = s.replace(/(?:\b[A-Za-z]:[\\/]|\\\\|(?:^|\s)\/(?:Users|home|mnt|var|tmp|etc)\/)\S*/g, ' [path]');
  s = s.replace(/[A-Za-z0-9_-]{24,}/g, m => (/\d/.test(m) && /[A-Za-z]/.test(m) ? '[redacted]' : m));
  s = s.replace(/</g, '‹').replace(/>/g, '›');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const day = (at: number): string | null => (at > 0 ? new Date(at).toISOString().slice(0, 10) : null);
const origin = (rec: ProvRec | null) => (rec ? { source: rec.src, date: day(rec.at), confidence: rec.conf ?? null, verified: rec.ver } : { source: 'default' });

/* ----- předmět ----- */
function itemBundle(s: AppState, name: string, lang: Lang, today: string, src: AiSource[], full: boolean) {
  const c = itemCard(s, name, lang, today);
  const L = (k: Key, p?: Record<string, string | number>) => tl(lang, k, p);
  src.push({ id: 'item:' + c.name, kind: 'item', label: L('ai.src.item', { name: safeText(c.name) }) });
  src.push({ id: 'stock:' + c.name, kind: 'stock', label: L('ai.src.stock', { name: safeText(c.name), count: c.have }), rec: c.origin });
  if (c.need > 0 || c.needs.length) src.push({ id: 'need:' + c.name, kind: 'need', label: L('ai.src.need', { name: safeText(c.name), count: c.need }) });
  src.push({ id: 'advice:' + c.name, kind: 'advice', label: L('ai.src.advice', { name: safeText(c.name) }) });
  const needRow = (n: (typeof c.needs)[number]) => ({ for: safeText(n.label, 60), kind: n.kind, qty: n.qty, ...(n.questItem ? { foundInRaid: true } : {}) });
  const v = c.verdict;
  const advice = v.basis === 'stock'
    ? {
        basis: 'inStock', verdict: v.advice.kind, keepCount: v.advice.keep, surplus: v.advice.surplus, surplusVerdict: v.advice.rest,
        playerOverrideKeep: v.advice.override, reasons: v.advice.reasons.slice(0, 8).map(r => ({ for: safeText(r.label, 60), qty: r.qty })),
        recycleInto: v.advice.recycle.slice(0, 8).map(r => ({ name: safeText(r.name, 60), qty: r.qty, missingMaterial: r.needed })),
        sellValueEach: num(v.advice.value), valuePerSlot: num(v.advice.valuePerSlot), slotsFreedBySurplus: v.advice.slotsFreed, surplusValue: num(v.advice.surplusValue),
      }
    : {
        basis: 'ifFound', verdict: v.verdict.kind, need: v.verdict.need, have: v.verdict.have, missing: v.verdict.missing,
        reasons: v.verdict.reasons.slice(0, 8).map(r => ({ for: safeText(r.label, 60), qty: r.qty })), recycleInto: v.verdict.recycle.slice(0, 8).map(x => safeText(x, 60)),
        sellValueEach: num(v.verdict.value), inRaidPlan: v.verdict.inPlan,
      };
  const now = c.needs.filter(n => n.when === 'now'), later = c.needs.filter(n => n.when === 'later');
  return {
    name: safeText(c.name), knownInAppData: c.known, type: c.type ? safeText(c.type, 40) : null, rarity: c.rarity,
    sellValue: num(c.value), weightKg: num(c.weight), stackSize: num(c.stack),
    blueprint: c.blueprint.is ? { learned: c.blueprint.learned } : null, craftNeedsBlueprint: c.needsBlueprint,
    have: c.have, stockOrigin: origin(c.origin), neededNow: c.need, missingNow: c.missing,
    needsNow: now.slice(0, full ? 10 : 5).map(needRow), needsLater: later.slice(0, full ? 6 : 3).map(needRow),
    advice, recycleOutputs: c.recycle.slice(0, 8).map(([n, q]) => ({ name: safeText(n, 60), qty: q })),
    activeRaidPlan: c.plan ? { need: c.plan.need, have: c.plan.have, missing: c.plan.missing, markedFound: c.plan.found } : null,
  };
}

/* ----- „Co dál?“ ----- */
function advisorBundle(s: AppState, tips: AdvisorTip[], askedId: string, lang: Lang, src: AiSource[], max: number) {
  const m = (r: MsgRef) => safeText(tl(lang, r.key, r.params), 160);
  const asked = tips.find(x => x.id === askedId);
  const list = (asked ? [asked, ...tips.filter(x => x !== asked)] : tips).slice(0, max);
  for (const tip of list) src.push({ id: 'tip:' + tip.id, kind: 'tip', label: tl(lang, 'ai.src.tip', { title: m(tip.title) }) });
  src.push({ id: 'profile', kind: 'profile', label: tl(lang, 'ai.src.profile') });
  const active = QUESTS.filter(q => questStatus(q, s.quests.done) === 'active');
  const pinned = s.quests.pinned.map(id => QUESTS.find(q => q.id === id)).filter(q => !!q).slice(0, 5).map(q => safeText(questName(q!, lang), 60));
  return {
    nextSteps: list.map((tip, i) => ({
      rank: i + 1, askedAbout: tip.id === askedId, rule: tip.rule, priority: tip.score,
      title: m(tip.title), detail: m(tip.detail), why: m(tip.reason),
    })),
    player: {
      level: s.profile.level, coins: s.profile.coins, materialKinds: Object.keys(s.inventory).length,
      materialPieces: Object.values(s.inventory).reduce((a, b) => a + b, 0), activeQuests: active.length, pinnedQuests: pinned,
    },
  };
}

/* Předměty, které volná otázka jmenuje (nejdelší názvy napřed, nejvýš dva). */
export function itemsInQuestion(s: AppState, q: string, max = 2): string[] {
  const text = ' ' + q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  const names = new Set<string>([...catalogItems().map(c => c.name), ...Object.keys(s.inventory), ...Object.values(s.items).map(i => i.key)]);
  const out: string[] = [];
  for (const n of [...names].filter(n => n.length >= 3).sort((a, b) => b.length - a.length)) {
    const k = ' ' + n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
    if (k.trim() && text.includes(k) && !out.some(o => o.toLowerCase().includes(n.toLowerCase()))) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

const stashBundle = (s: AppState, lang: Lang, src: AiSource[]) => {
  const st = s.vision.stash;
  if (!st) return null;
  src.push({ id: 'stash', kind: 'stash', label: tl(lang, 'ai.src.stash', { used: st.used, max: st.max }), rec: { src: 'screenshot-hotkey', at: st.at, ver: false } });
  return { usedSlots: st.used, maxSlots: st.max, readOn: day(st.at) };
};

/* ----- 0.31.0: úkoly a dílna ----- */
/* lim(n): kolik řádků seznamu se pošle na dané úrovni zmenšování (na úrovni 0 celé n). */
type Lim = (n: number) => number;
const mapLabel = (id: string): string => safeText(MAPS.find(m => m.id === id)?.name ?? id, 40);
const qtyRows = (xs: readonly (readonly [string, number])[], max: number) => xs.slice(0, max).map(([n, q]) => ({ name: safeText(n, 60), qty: q }));
const matRows = (xs: readonly (readonly [string, number])[], stock: Record<string, number>, max: number) =>
  xs.slice(0, max).map(([m, n]) => { const have = stock[m] ?? 0; return { name: safeText(m, 60), need: n, have, missing: Math.max(0, n - have) }; });
const questState = (q: AtQuest, done: Record<string, number>) => { const st = questStatus(q, done); return st === 'active' ? 'available' : st; };

function questFocus(s: AppState, q: AtQuest, lang: Lang, stock: Record<string, number>, src: AiSource[], lim: Lim) {
  const done = s.quests.done, st = questStatus(q, done), ticked = s.quests.objectives[q.id] ?? [];
  const op = objectiveProgress(s.quests.objectives, q);
  src.push({ id: 'quest:' + q.id, kind: 'quest', label: tl(lang, 'ai.src.quest', { name: safeText(questName(q, lang), 60) }), ...(st === 'done' ? { rec: provOf(s, 'quests', q.id) } : {}) });
  return {
    name: safeText(questName(q, lang), 60), trader: safeText(q.trader, 40), status: questState(q, done), pinned: s.quests.pinned.includes(q.id),
    maps: q.maps.slice(0, 6).map(mapLabel), xp: q.xp,
    objectives: q.objectives.slice(0, lim(10)).map((o, i) => ({ text: safeText(locText(o, lang), 100), ticked: ticked.includes(i) })),
    objectivesTicked: op.done, objectivesTotal: op.total,
    deliver: matRows(q.deliver, stock, lim(8)), findInRaid: qtyRows(q.questItems, lim(6)), rewards: qtyRows(q.rewards, lim(6)),
    previous: q.prev.map(questById).filter((p): p is AtQuest => !!p).slice(0, 4).map(p => ({ name: safeText(questName(p, lang), 60), done: !!done[p.id] })),
    nextInChain: QUESTS.filter(x => x.prev.includes(q.id)).slice(0, lim(5)).map(x => ({ name: safeText(questName(x, lang), 60), status: questState(x, done) })),
  };
}

function stationFocus(s: AppState, id: string, lang: Lang, src: AiSource[], lim: Lim) {
  const st = getStations(s.gameData).find(x => x.id === id);
  if (!st) return null;
  const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
  const level = s.stations[st.id] ?? st.min, nxt = level + 1, mats = st.levels[nxt];
  src.push({ id: 'station:' + st.id, kind: 'station', label: tl(lang, 'ai.src.station', { name: safeText(st.name, 40), level, max: st.max }), rec: provOf(s, 'stations', st.id) });
  const block = mats && nxt <= st.max ? reqBlock(view, st, nxt) : null;
  return {
    name: safeText(st.name, 40), level, maxLevel: st.max,
    next: mats && nxt <= st.max ? {
      level: nxt, recipe: matRows(mats, s.inventory, lim(12)), readyPercent: Math.round(readiness(s.inventory, mats) * 100),
      blockedBy: block ? safeText(block, 80) : null, recipeEditedByPlayer: !!s.gameData.recipes[recipeKey(st.id, nxt)],
    } : null,
  };
}

function questsBundle(s: AppState, ref: string, lang: Lang, today: string, src: AiSource[], lim: Lim) {
  const stock = stockOf(s), done = s.quests.done;
  const qp = questProgress(done);
  const cut = ref.indexOf(':');
  const refKind = cut > 0 ? ref.slice(0, cut) : '', refId = cut > 0 ? ref.slice(cut + 1) : '';
  const fq = refKind === 'quest' ? questById(refId) : undefined;
  const focusQuest = fq ? questFocus(s, fq, lang, stock, src, lim) : null;
  const focusStation = refKind === 'station' ? stationFocus(s, refId, lang, src, lim) : null;
  src.push({ id: 'quests', kind: 'quests', label: tl(lang, 'ai.src.quests', { done: qp.done, total: qp.total }) });
  /* dostupné úkoly v pořadí kompaktu (připnuté, rozpracované, ostatní) a co jim ze zásoby chybí */
  const active = activeQuests(s, lang, lim(8)).map(c => {
    const q = questById(c.id);
    const missing = q ? matRows([...q.deliver, ...q.questItems], stock, 12).filter(r => r.missing > 0).slice(0, 4).map(r => ({ name: r.name, missing: r.missing })) : [];
    return { name: safeText(c.name, 60), trader: safeText(c.trader, 40), pinned: c.pinned, progress: { have: c.have, need: c.need, by: c.by }, missingMaterials: missing };
  });
  /* materiály, které dostupné úkoly ještě potřebují (součet přes úkoly, proti zásobě) */
  const sum = new Map<string, { need: number; quests: string[] }>();
  for (const n of questNeeds(done, lang)) for (const [m, q] of n.mats) {
    const r = sum.get(m) ?? { need: 0, quests: [] };
    r.need += q;
    if (r.quests.length < 3) r.quests.push(safeText(n.label, 60));
    sum.set(m, r);
  }
  const questMaterials = [...sum].map(([m, r]) => ({ name: safeText(m, 60), need: r.need, have: stock[m] ?? 0, missing: Math.max(0, r.need - (stock[m] ?? 0)), forQuests: r.quests }))
    .filter(r => r.missing > 0).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name)).slice(0, lim(10));
  if (questMaterials.length) src.push({ id: 'questMats', kind: 'questMats', label: tl(lang, 'ai.src.questMats', { count: questMaterials.length }) });
  /* dílna: další úrovně stanic, recepty proti zásobě, doporučené další vylepšení (stejný výběr jako kompakt) */
  const stations = getStations(s.gameData);
  const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
  const needs = nextNeeds(view, stations).map(n => ({ ...n, ready: readiness(s.inventory, n.mats) }));
  const up = nextUpgrade(needs, stationTargets(view, s.planner, s.goals, stations), s.inventory);
  const wp = workshopProgress(s.stations, stations);
  src.push({ id: 'workshop', kind: 'workshop', label: tl(lang, 'ai.src.workshop', { now: wp.now, max: wp.max }) });
  const projects = projectNeeds(s.projects, today, lang).slice(0, lim(3)).map(p => ({ name: safeText(p.label, 60), missing: matRows(p.mats, stock, 6).filter(r => r.missing > 0) }));
  return {
    focus: focusQuest ? { quest: focusQuest } : focusStation ? { station: focusStation } : null,
    quests: { done: qp.done, total: qp.total, available: QUESTS.filter(q => questStatus(q, done) === 'active').length, availableTop: active },
    questMaterialsMissing: questMaterials,
    workshop: {
      levelsDone: wp.now, levelsTotal: wp.max,
      recommendedUpgrade: up ? { station: safeText(up.station.name, 40), level: up.level, missingPieces: up.missing, chosenInPlanner: up.chosen, blockedBy: up.block ? safeText(up.block, 80) : null } : null,
      nextLevels: needs.slice(0, lim(9)).map(n => ({
        station: safeText(n.station.name, 40), level: n.level, maxLevel: n.station.max, readyPercent: Math.round(n.ready * 100),
        blockedBy: n.block ? safeText(n.block, 80) : null,
        missing: matRows(n.mats, s.inventory, 8).filter(r => r.missing > 0).slice(0, 4).map(r => ({ name: r.name, missing: r.missing })),
      })),
    },
    projects,
    player: { level: s.profile.level },
  };
}

/* ----- 0.31.0: příprava na raid (AI Raid Planner) ----- */
const reasonText = (lang: Lang, r: MapReason): string => safeText(tl(lang, r.key, r.params), 120);
function loadoutData(lo: { name: string; sum: LoadoutSummary }, lim: Lim) {
  const x = lo.sum;
  return {
    name: safeText(lo.name, 60), freeLoadout: x.free,
    value: num(x.value), itemsWithoutPrice: x.valueUnknown.length,
    weightKg: num(x.weight), weightLimitKg: num(x.weightMax), overWeight: x.weightOver,
    valueAtRisk: knownRisk(x), riskUnknownItems: x.riskUnknown.slice(0, 5).map(n => safeText(n, 60)), safePocketValue: num(x.safeValue),
    slotsOver: x.slots.filter(v => v.over).map(v => v.section),
    missingFromStash: x.missing.slice(0, lim(8)).map(m => ({ name: safeText(m.name, 60), missing: m.missing })),
    items: x.lines.slice(0, lim(12)).map(l => ({ name: safeText(l.name, 60), slot: l.section, qty: l.qty, value: num(l.value) })),
  };
}

function raidBundle(s: AppState, lang: Lang, today: string, src: AiSource[], lim: Lim) {
  const plan = s.raidPlan;
  const goals = plan ? validGoals(s, plan.goals, lang, today) : defaultGoals(s, lang);
  const rows = raidList(s, goals, lang, today);
  const units = rows.reduce((a, r) => a + r.missing, 0);
  const scores = scoreMaps(s, goals, lang);
  const rec = recommendedMap(scores);
  const mapId = plan?.map ?? rec?.id ?? MAPS[0].id;
  const chosen = scores.find(x => x.id === mapId);
  const routeId = plan ? plan.route : chosen?.route?.id ?? '';
  const route = routeId ? getRoutes(s.gameData, lang).find(r => r.id === routeId) ?? null : null;
  const lo = planLoadout(s, plan?.loadout ?? '');
  src.push(plan
    ? { id: 'plan', kind: 'plan', label: tl(lang, 'ai.src.plan', { at: day(plan.startedAt) ?? '' }) }
    : { id: 'plan', kind: 'plan', label: tl(lang, 'ai.src.planNone') });
  src.push({ id: 'raidList', kind: 'raidList', label: tl(lang, 'ai.src.raidList', { count: units, items: rows.length }) });
  if (chosen) src.push({ id: 'map', kind: 'map', label: tl(lang, 'ai.src.map', { name: mapLabel(chosen.id) }) });
  if (lo) src.push({ id: 'loadout', kind: 'loadout', label: tl(lang, 'ai.src.loadout', { name: safeText(lo.name, 60) }) });
  return {
    planActive: !!plan, planStartedOn: plan ? day(plan.startedAt) : null, recalculatedSinceStart: plan ? plan.sig !== listSig(rows) : false,
    goals: goalLabels(s, goals, lang, today).slice(0, lim(10)).map(g => safeText(g, 60)), moneyGoal: goals.money,
    materials: {
      missingPieces: units, items: rows.length, markedFoundInRaid: plan?.found.length ?? 0,
      list: rows.slice(0, lim(12)).map(r => ({
        name: safeText(r.mat, 60), need: r.need, have: r.have, missing: r.missing,
        for: r.reasons.slice(0, 3).map(x => ({ goal: safeText(x.label, 60), qty: x.qty })), areas: r.areas.slice(0, 3),
      })),
    },
    map: chosen ? { name: mapLabel(chosen.id), score: chosen.score, recommended: chosen.id === rec?.id, locked: chosen.locked, reasons: chosen.reasons.slice(0, 4).map(r => reasonText(lang, r)) } : null,
    otherMaps: scores.filter(x => x.id !== mapId && !x.locked).slice(0, lim(3)).map(x => ({ name: mapLabel(x.id), score: x.score, reasons: x.reasons.slice(0, 3).map(r => reasonText(lang, r)) })),
    route: route ? { name: safeText(route.name, 60), risk: safeText(route.risk, 40), yield: safeText(route.yield, 60), phase: safeText(route.phase, 20) } : null,
    loadout: lo ? loadoutData(lo, lim) : null,
  };
}

/* ----- 0.31.0: shrnutí po raidu ----- */
/* Původ záznamu raidu: z provenance, jinak z automatického snímání nebo ručního zápisu (nikdy neověřený). */
const raidRec = (s: AppState, r: Raid): ProvRec => provOf(s, 'raids', r.id) ?? (r.auto ? { src: 'auto-capture', at: r.auto.at, ver: false } : { src: 'manual', at: r.ts, ver: false });
function valueOf(xs: Raid['loot']) {
  let value = 0, unknown = 0;
  for (const x of xs) { const v = itemFacts(x.name).value; if (v === null) unknown++; else value += v * x.qty; }
  return { value: num(value), unknown };
}
function journalRow(r: Raid, lim: Lim) {
  const loot = valueOf(r.loot), lost = valueOf(r.lost), gear = raidGear(r);
  const top = r.loot.map(x => ({ x, v: (itemFacts(x.name).value ?? 0) * x.qty })).sort((a, b) => b.v - a.v).slice(0, lim(8));
  return {
    date: day(r.ts), map: mapLabel(r.map), type: r.type, outcome: r.ok ? 'survived' : 'knockedOut', coinsEarned: r.ok ? r.coins : 0, minutes: r.min,
    lootItems: r.loot.length, lootPieces: r.loot.reduce((a, x) => a + x.qty, 0), lootValue: loot.value, lootWithoutPrice: loot.unknown,
    lootTop: top.map(({ x }) => ({ name: safeText(x.name, 60), qty: x.qty })),
    lostItems: r.lost.length, lostValue: lost.value, gearValue: gear ? gear.value : null, autoRecorded: !!r.auto,
    plan: r.plan ? {
      goals: r.plan.goals.slice(0, lim(8)).map(g => safeText(g, 60)), completed: r.plan.done.slice(0, 8).map(g => safeText(g, 60)),
      piecesNeeded: r.plan.items.reduce((a, x) => a + x.need, 0), piecesFound: r.plan.items.reduce((a, x) => a + x.found, 0),
      foundValue: num(r.plan.value), valueAtRisk: r.plan.risk ?? null,
    } : null,
  };
}

function postRaidBundle(s: AppState, lang: Lang, today: string, src: AiSource[], lim: Lim) {
  const plan = s.raidPlan;
  const planR = plan ? planRaid(s, plan) : null;
  const captured = planR && planR.loot.length ? planR : null;
  const ev = plan && (captured || plan.snap) ? evaluateRaid(s, plan, captured, lang, today) : null;
  const next = plan && ev ? nextRaid(s, plan, ev, lang, today) : null;
  const lo = plan ? planLoadout(s, plan.loadout) : null;
  const last = planR ?? [...s.raids].sort((a, b) => b.ts - a.ts)[0] ?? null;
  if (ev) src.push({ id: 'eval', kind: 'eval', label: tl(lang, 'ai.src.eval', { found: ev.found, need: ev.need }) });
  if (last) src.push({ id: 'raid', kind: 'raid', label: tl(lang, 'ai.src.raid', { date: day(last.ts) ?? '', map: mapLabel(last.map) }), rec: raidRec(s, last) });
  if (lo) src.push({ id: 'loadout', kind: 'loadout', label: tl(lang, 'ai.src.loadout', { name: safeText(lo.name, 60) }) });
  return {
    planActive: !!plan,
    evaluation: ev ? {
      basedOn: ev.source === 'raid' ? 'raidLoot' : 'stockChange', result: ev.kind,
      piecesNeeded: ev.need, piecesFound: ev.found, piecesMissing: ev.missing, foundValue: num(ev.value),
      completed: ev.done.slice(0, 8).map(d => ({ kind: d.kind, name: safeText(d.name, 60) })),
      items: ev.rows.slice(0, lim(12)).map(r => ({ name: safeText(r.mat, 60), need: r.need, found: Math.min(r.need, r.found), missing: r.missing })),
    } : null,
    loadout: lo ? { name: safeText(lo.name, 60), valueAtRisk: knownRisk(lo.sum), outcome: loadoutOutcome(planR) } : null,
    nextRaid: next ? { recommendedMap: next.best ? mapLabel(next.best.id) : null, reasons: (next.best?.reasons ?? []).slice(0, 3).map(r => reasonText(lang, r)), missingPieces: next.units, items: next.rows.length } : null,
    lastRaid: last ? journalRow(last, lim) : null,
  };
}

/* ----- 0.32.0: osobní analytika z deníku raidů (Personal AI Analyst) -----
   Jen souhrny z core/raidStats.ts, každý s velikostí vzorku (raids / lootN / coinsN) a příznakem smallSample.
   Mapy, zbraně a typy raidu jménem z katalogu; loadouty jménem (safeText), id loadoutů ani záznamů se neposílají.
   Poznámky raidů, poznámky map, loot po položkách ani jména hráčů vůbec. */
const weaponIndex = (s: AppState, lang: Lang): Map<string, string> => {
  const m = new Map<string, string>();
  for (const w of getWeapons(s.gameData, lang)) if (w.name.trim()) m.set(w.name.trim().toLowerCase(), w.name.trim());
  return m;
};
const aggData = (a: StatsAgg) => ({
  raids: a.raids, survived: a.survived, knockedOut: a.knockedOut, survivalRate: a.survivalRate,
  avgLootValue: a.avgLootValue, lootN: a.lootN, lootItemsWithoutPrice: a.itemsWithoutPrice,
  avgCoinsSurvived: a.avgCoins, coinsN: a.coinsN, smallSample: a.smallSample,
});
const trendData = (t: StatsTrend) => ({
  lastN: t.lastN, recent: t.recent, earlier: t.earlier,
  survivalRateChange: t.survivalRateChange, avgLootValueChange: t.avgLootValueChange, enoughData: t.enoughData, direction: trendDirection(t),
});
const typeLabel = (k: string): string => (['money', 'quest', 'trials', 'arc', 'pvp', 'other'].includes(k) ? k : 'other');
const loadoutLabel = (s: AppState, id: string): string => {
  if (!id) return 'no loadout';
  const l = s.loadouts.find(x => x.id === id);
  return l ? safeText(l.name, 60) || 'unnamed loadout' : 'deleted loadout';
};

/* Zmiňuje volná otázka mapy, raidy nebo statistiky? (pak dostane i stručný souhrn deníku) Vrací i id zmíněné mapy. */
const STATS_WORDS = /(^| )(raid\w*|map[aěuyo]?|mapách|mapám|statistik\w*|statistics?|stats|deník\w*|journal|přežív\w*|přežil\w*|přežití|survive\w*|survival|extract\w*|vyřaz\w*|knocked|daří|nedaří|úspěšnost\w*|win rate|série|sérii|streak\w*|loot\w*|trend\w*)( |$)/u;
export function statsInQuestion(q: string): { asks: boolean; map: string | null } {
  const text = ' ' + q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  let map: string | null = null;
  for (const m of MAPS) {
    const names = [m.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), m.id, m.name.toLowerCase().replace(/^the /, '').split(' ')[0]];
    if (names.some(n => n.length >= 3 && text.includes(' ' + n + ' '))) { map = m.id; break; }
  }
  return { asks: map !== null || STATS_WORDS.test(text.trim()), map };
}

function statsBundle(s: AppState, ref: string, lang: Lang, src: AiSource[], lim: Lim, compact: boolean) {
  const rep = raidStats(s.raids, weaponIndex(s, lang));
  const o = rep.overall;
  const from = rep.from !== null ? day(rep.from) : null, to = rep.to !== null ? day(rep.to) : null;
  src.push({ id: 'journal', kind: 'journal', label: o.raids
    ? tl(lang, 'ai.src.journal', { count: o.raids, from: from ?? '', to: to ?? '', auto: rep.auto })
    : tl(lang, 'ai.src.journalEmpty') });
  const focusId = ref.startsWith('map:') ? ref.slice(4) : '';
  const focus = focusId ? rep.byMap.find(m => m.key === focusId) ?? null : null;
  if (focusId) src.push({ id: 'statsMap:' + focusId, kind: 'statsMap', label: tl(lang, 'ai.src.statsMap', { name: mapLabel(focusId), count: focus?.raids ?? 0 }) });
  const mapRow = (m: MapRow, full: boolean) => ({
    map: mapLabel(m.key), ...aggData(m),
    ...(full ? { trend: trendData(m.trend), currentStreak: m.currentStreak } : { trendDirection: trendDirection(m.trend) }),
  });
  const base = {
    minSample: STATS_MIN_SAMPLE,
    period: { from, to, raids: o.raids, autoRecorded: rep.auto },
    overall: aggData(o),
    streaks: rep.streaks,
    focusMap: focusId ? (focus ? mapRow(focus, true) : { map: mapLabel(focusId), raids: 0, smallSample: true }) : null,
  };
  if (rep.byMap.length) src.push({ id: 'statsMaps', kind: 'statsMaps', label: tl(lang, 'ai.src.statsMaps', { count: rep.byMap.length }) });
  if (compact) return { ...base, maps: rep.byMap.slice(0, lim(4)).map(m => mapRow(m, false)) };
  if (rep.byLoadout.length) src.push({ id: 'statsLoadouts', kind: 'statsLoadouts', label: tl(lang, 'ai.src.statsLoadouts', { count: rep.byLoadout.length }) });
  if (rep.byWeapon.length) src.push({ id: 'statsWeapons', kind: 'statsWeapons', label: tl(lang, 'ai.src.statsWeapons', { count: rep.weaponRaids }) });
  return {
    ...base,
    trend: trendData(rep.trend),
    maps: rep.byMap.slice(0, lim(8)).map(m => mapRow(m, true)),
    loadouts: rep.byLoadout.slice(0, lim(6)).map(g => ({ loadout: loadoutLabel(s, g.key), ...aggData(g) })),
    weapons: { raidsWithWeapon: rep.weaponRaids, list: rep.byWeapon.slice(0, lim(6)).map(g => ({ weapon: safeText(g.key, 60), ...aggData(g) })) },
    raidTypes: rep.byType.slice(0, lim(6)).map(g => ({ type: typeLabel(g.key), ...aggData(g) })),
  };
}

const KIND_ATTR: Record<AiKind, string> = { item: 'item', advisor: 'next-steps', free: 'question', quests: 'quests-workshop', raid: 'raid-prep', postRaid: 'post-raid', stats: 'raid-stats' };

/* Celý dotaz: pokyny (povaha a jazyk), otázka a data v ohraničených blocích. Data se zmenšují, dokud nejsou pod
   CONTEXT_MAX znaků. */
export function buildAiContext(s: AppState, ask: AiAsk, o: { lang: Lang; personality: OpsPersonality; now: number; today: string; tips: AdvisorTip[] }): AiContext {
  let data = '';
  let sources: AiSource[] = [];
  let withStats = false;
  for (const level of [0, 1, 2, 3]) {
    const src: AiSource[] = [];
    const full = level === 0;
    const bundle: Record<string, unknown> = { app: 'ARC Raiders Companion', language: o.lang, date: o.today };
    if (ask.kind === 'item') bundle.item = itemBundle(s, ask.ref, o.lang, o.today, src, full);
    if (ask.kind === 'free' && level < 3) {
      const items = itemsInQuestion(s, ask.question, level < 2 ? 2 : 1);
      if (items.length) bundle.items = items.map(n => itemBundle(s, n, o.lang, o.today, src, full));
    }
    const lim: Lim = n => Math.max(1, Math.ceil(n / (1 + level)));
    if (ask.kind === 'quests') bundle.questsWorkshop = questsBundle(s, ask.ref, o.lang, o.today, src, lim);
    else if (ask.kind === 'raid') bundle.raidPrep = raidBundle(s, o.lang, o.today, src, lim);
    else if (ask.kind === 'postRaid') bundle.postRaid = postRaidBundle(s, o.lang, o.today, src, lim);
    else if (ask.kind === 'stats') bundle.raidStats = statsBundle(s, ask.ref, o.lang, src, lim, level === 3);
    else {
      /* 0.32.0: volná otázka o mapách nebo raidech dostane i stručný souhrn deníku (zmíněná mapa jako focusMap) */
      if (ask.kind === 'free' && level < 3) {
        const st = statsInQuestion(ask.question);
        if (st.asks) bundle.raidStats = statsBundle(s, st.map ? 'map:' + st.map : '', o.lang, src, lim, true);
      }
      if (ask.kind !== 'item' || level === 0) {
        bundle.advisor = advisorBundle(s, o.tips, ask.kind === 'advisor' ? ask.ref : '', o.lang, src, level === 0 ? 5 : level === 1 ? 3 : 1);
      }
      bundle.stash = stashBundle(s, o.lang, src);
    }
    data = JSON.stringify(bundle);
    sources = src;
    withStats = ask.kind === 'free' && 'raidStats' in bundle;
    if (data.length <= CONTEXT_MAX) break;
  }
  if (data.length > CONTEXT_MAX) { data = JSON.stringify({ app: 'ARC Raiders Companion', note: 'data too large' }); withStats = false; }
  const question = safeText(ask.question, 600);
  const user = `<question>\n${question}\n</question>\n<app_data kind="${KIND_ATTR[ask.kind]}">\n${data}\n</app_data>`;
  return { messages: [{ role: 'system', content: aiSystemPrompt(o.lang, o.personality, ask.kind, withStats) }, { role: 'user', content: user }], sources: dedupe(sources), dataChars: data.length };
}

const dedupe = (src: AiSource[]): AiSource[] => { const seen = new Set<string>(); return src.filter(x => !seen.has(x.id) && !!seen.add(x.id)).slice(0, 16); };
/* Velikost zpráv v bajtech UTF-8 (mez Rustu je 24 KB). */
export const messagesBytes = (m: AiMessage[]): number => m.reduce((a, x) => a + new TextEncoder().encode(x.content).length, 0);
export const MESSAGES_MAX_BYTES = 24 * 1024;
