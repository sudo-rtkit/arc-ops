/* Jeden store pro celou aplikaci: drží stav, mění ho přes akce a ukládá ho přes rozhraní úložiště.
   Neimportuje React, takže jde testovat v Node se zástupným úložištěm. */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CloseAction, CompactSection, MainWindowPrefs, OpsPrefs } from '../core/types';
import type { AppState, ItemCategory, ItemTier, ArcUnit, Goal, GoalLink, Loadout, MapNotes, PlannerItem, Points, Raid, Route, SavedBuild, SellItem, Weapon, WeaponNote, Recipe } from '../core/types';
import type { StorageAdapter, SnapshotInfo, SnapshotKind, LoadSource } from '../storage/adapter';
import { defaultState, normalize, normalizeRaid, emptyMapNotes, emptyGameData, defaultSteps, defaultTemplates, DASHBOARD_CARDS, LIMITS, RAID_TEMPLATE_ID } from '../core/state';
import { rollWeek } from '../core/week';
import { addBlock, nextPlanPoint, planSteps, isPlanKey, BUILD_PREFIX, cleanPoints } from '../core/skills';
import { applyUpgrade, reqBlock } from '../core/workshop';
import { getStations } from '../core/gamedata';
import { clampInt, dayKey, text, uid } from '../core/util';
import { makeBackup } from '../core/backup';
import { applyDelta, lootDelta, normalizeItems } from '../core/raidItems';
import { normalizeGoal, syncGoals } from '../core/goals';
import { emptyPlanner, normalizePlanner } from '../core/planner';
import { normalizeLoadout } from '../core/loadouts';
import { STATIONS } from '../core/data/stations';
import { baseRoute, baseSell } from '../core/gamedata';
import { MAPS } from '../core/data/maps';
import { applyVisionImport, type VisionApply, type VisionSummary } from '../core/visionImport';
import { applyRaidLoot, checkRaidLoot, type RaidLootDone, type RaidLootInput, type RaidLootRefusal } from '../core/lootImport';
import { applyProgress, type ProgressApply, type ProgressSummary } from '../core/progressImport';
import { PIN_MAX, projectById, questById, setObjective, setQuestDone } from '../core/quests';
import { CLOSE_ACTIONS, COMPACT_SECTIONS, QUESTS_MAX, QUESTS_MIN, normalizeMainWindow } from '../core/mainWindow';
import { normalizeOpsPrefs } from '../core/opsPrefs';
import { applyGameResult, applyQuizAnswer, mergeGames, type GameOutcome, type GameResult } from '../core/minigames';
import { answerQuiz, discardRound, finishRound, mergeRounds, saveRound, type GameId } from '../core/gameRounds';
import type { GameRounds, SavedQuiz } from '../core/types';
import { DEFAULT_PAINT } from '../core/paints';
import { placeTier, moveWithin, shiftTier, emptyTierList } from '../core/tierlist';
import type { TierId } from '../core/types';
import { normalizeItemStock } from '../core/visionState';
import { OPACITY_MAX, OPACITY_MIN, OPS_SLOTS, collection, partById, syncBuddy, validHotkey } from '../core/ops';
import type { BuddyState } from '../core/types';
import { getLang, t, isLang, type Key, type Lang } from '../i18n';
import { sysError } from '../i18n/system';

/* Úprava vestavěného záznamu (ARC, zbraně): klíč s hodnotou undefined vrací pole na vestavěný základ.
   Prázdná úprava se smaže, takže se záznam neoznačí jako upravený. Vrací false, když se nic nezměnilo. */
function setOverride<T extends object>(map: Record<string, Partial<T>>, id: string, patch: Partial<T>): false | void {
  const cur = map[id] || {};
  const next: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete next[k]; else next[k] = v; }
  if (JSON.stringify(next) === JSON.stringify(cur)) return false;
  if (Object.keys(next).length) map[id] = next as Partial<T>; else delete map[id];
}
const definedOnly = <T extends object>(patch: Partial<T>): Partial<T> =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;

/* Text chyby úložiště v jazyce UI (úložiště vrací česky). */
const errText = (e: unknown): string => sysError(String((e as Error)?.message || e), getLang());

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export interface Notice { id: string; text: string; tone: 'success' | 'info' | 'warning' | 'danger' }
export interface LoadInfo { source: LoadSource; warning: string | null; recoveredFrom: string | null; at: number }

export interface AppStore {
  state: AppState;
  ready: boolean;
  save: SaveStatus;
  saveError: string | null;
  lastSavedAt: number;
  load: LoadInfo | null;
  notices: Notice[];
  storageKind: 'tauri' | 'browser';
}

/* lang = jazyk pro první spuštění a pro stav bez uložené volby (UI předá jazyk z navigator.language). */
/* weekCheckMs = jak často se za běhu kontroluje přechod týdne Trials (0 = jen při startu, změně a nahrazení stavu). */
export interface AppOptions { now?: () => number; debounceMs?: number; retryMs?: number; maxRetryMs?: number; lang?: Lang; weekCheckMs?: number }

export type ProfileField = 'level' | 'coins' | 'xp' | 'xpNext' | 'rounds' | 'expBonus' | 'rewardPass' | 'amplified';
export type ResetModule = 'profile' | 'skills' | 'workshop' | 'inventory' | 'quests' | 'raids' | 'trials' | 'checklists' | 'maps' | 'arc' | 'weapons' | 'dashboard' | 'steps'
  | 'goals' | 'planner' | 'loadouts' | 'routes' | 'blueprints' | 'tiers' | 'games';

/* Moduly pro reset; název a dopad jsou ve slovníku (reset.<id>.name / reset.<id>.impact). */
export const RESET_MODULES: { id: ResetModule }[] = (['profile', 'skills', 'workshop', 'inventory', 'quests', 'raids', 'trials', 'checklists', 'steps', 'maps', 'arc', 'weapons', 'dashboard', 'goals', 'planner', 'loadouts', 'routes', 'blueprints', 'tiers', 'games'] as ResetModule[]).map(id => ({ id }));
export const resetName = (id: ResetModule): string => t(`reset.${id}.name` as Key);
export const resetImpact = (id: ResetModule): string => t(`reset.${id}.impact` as Key);

const PROFILE_LIMITS: Record<ProfileField, readonly [number, number]> = {
  level: LIMITS.level, coins: LIMITS.coins, xp: LIMITS.xp, xpNext: LIMITS.xpNext, rounds: LIMITS.rounds,
  expBonus: LIMITS.expBonus, rewardPass: LIMITS.rewardPass, amplified: LIMITS.amplified,
};
export const profileLimit = (f: ProfileField) => PROFILE_LIMITS[f];

export type App = ReturnType<typeof createApp>;
/* Výsledek zápisu lootu ze snímku FINDINGS (0.8.1). */
export type RaidLootResult = ({ ok: true } & RaidLootDone) | { ok: false; reason: RaidLootRefusal | 'notReady' | 'busy' | 'snapshot' };

export function createApp(storage: StorageAdapter, opts: AppOptions = {}) {
  const now = opts.now || Date.now;
  const debounceMs = opts.debounceMs ?? 500;
  const retryMs = opts.retryMs ?? 3000;
  const maxRetryMs = opts.maxRetryMs ?? 30000;
  const startLang: Lang = opts.lang ?? 'cs';
  const weekCheckMs = opts.weekCheckMs ?? 60_000;
  let weekTimer: ReturnType<typeof setInterval> | null = null;

  const store: StoreApi<AppStore> = createStore<AppStore>(() => ({
    state: defaultState(now(), startLang), ready: false, save: 'idle', saveError: null, lastSavedAt: 0,
    load: null, notices: [], storageKind: storage.kind,
  }));
  const get = () => store.getState();
  const set = (p: Partial<AppStore>) => store.setState(p);

  /* ----- oznámení ----- */
  const notify = (textIn: string, tone: Notice['tone'] = 'success') => {
    const n: Notice = { id: uid(), text: textIn, tone };
    set({ notices: [...get().notices, n].slice(-4) });
    return n.id;
  };
  const dismiss = (id: string) => set({ notices: get().notices.filter(n => n.id !== id) });

  /* ----- ukládání ----- */
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<void> | null = null;
  let pending = false;
  let lastSaved = '';
  let retryDelay = retryMs;

  /* Jeden zápis aktuálního stavu. Vrací false při chybě (opakování pak naplánuje retryTimer). */
  async function saveOnce(): Promise<boolean> {
    /* Nenačtený store (např. kopie stavu v okně overlaye) nikdy neukládá. */
    if (!get().ready) return true;
    const content = JSON.stringify(get().state);
    if (content === lastSaved) { if (get().save !== 'error') set({ save: 'saved' }); return true; }
    set({ save: 'saving' });
    try {
      await storage.save(content);
      lastSaved = content;
      retryDelay = retryMs;
      set({ save: 'saved', saveError: null, lastSavedAt: now() });
      return true;
    } catch (e) {
      set({ save: 'error', saveError: String((e as Error)?.message || e) });
      retryTimer = setTimeout(() => { void doSave(); }, retryDelay);
      retryDelay = Math.min(maxRetryMs, retryDelay * 2);
      return false;
    }
  }
  /* Volání během rozběhnutého zápisu dostane slib celého cyklu včetně dopsání nejnovějšího stavu,
     takže flush() (zavření okna, nahrazení stavu) se vrátí až po uložení posledních změn. */
  function doSave(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (saving) { pending = true; return saving; }
    saving = (async () => {
      try {
        do { pending = false; if (!(await saveOnce())) break; } while (pending);
      } finally {
        saving = null;
      }
    })();
    return saving;
  }
  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void doSave(); }, debounceMs);
  };
  const flush = () => doSave();

  /* ----- změna stavu ----- */
  function logProfile(s: AppState) {
    const day = dayKey(now());
    const p = s.profile;
    const entry = { day, level: p.level, coins: p.coins, xp: p.xp, rounds: p.rounds, rewardPass: p.rewardPass };
    const last = s.profileLog[s.profileLog.length - 1];
    if (last && last.day === day) s.profileLog[s.profileLog.length - 1] = entry;
    else s.profileLog.push(entry);
  }

  /* Každá akce: kopie stavu → úprava → zápis dnešního profilu → uložení za 500 ms. Vrací false, když úprava nic nezměnila. */
  /* Přechod na nový týden Trials (pondělí). Vrací nový stav, nebo null, když se týden nezměnil. */
  function rollTrials(state: AppState): { state: AppState; archived: boolean } | null {
    const rolled = rollWeek(state.trials, new Date(now()));
    if (rolled === state.trials) return null;
    return { state: { ...state, trials: rolled }, archived: rolled.history.length > state.trials.history.length };
  }
  /* Aplikace může běžet přes půlnoc na pondělí: týden se kontroluje i za běhu, ne jen při startu. */
  function checkWeek(): boolean {
    if (!get().ready) return false;
    const r = rollTrials(get().state);
    if (!r) return false;
    set({ state: r.state });
    if (r.archived) notify(t('notice.weekArchived'), 'info');
    scheduleSave();
    return true;
  }

  function change(fn: (s: AppState) => void | false): boolean {
    if (!get().ready) return false;
    checkWeek();
    const s = structuredClone(get().state);
    if (fn(s) === false) return false;
    syncGoals(s, now());
    syncBuddy(s.buddy, s.profile.level);
    s.meta.updatedAt = now();
    logProfile(s);
    set({ state: s });
    scheduleSave();
    return true;
  }

  async function snapshot(kind: SnapshotKind, label: string): Promise<boolean> {
    try { await storage.createSnapshot(kind, label, JSON.stringify(get().state)); return true; }
    catch (e) { notify(t('notice.snapshotFailed', { err: errText(e) }), 'danger'); return false; }
  }

  /* ----- start ----- */
  async function init(): Promise<void> {
    let info: LoadInfo = { source: 'none', warning: null, recoveredFrom: null, at: now() };
    let state = defaultState(now(), startLang);
    try {
      const res = await storage.load();
      info = { source: res.source, warning: res.warning, recoveredFrom: res.recoveredFrom || null, at: now() };
      if (res.content !== null) {
        try { state = normalize(JSON.parse(res.content), now(), startLang); lastSaved = res.source === 'state' ? res.content : ''; }
        catch { state = defaultState(now(), startLang); info.warning = t('load.warn.none'); info.source = 'none'; }
      }
    } catch (e) {
      info.warning = t('load.warn.none') + ' (' + String((e as Error)?.message || e) + ')';
    }
    const roll = rollTrials(state);
    if (roll) state = roll.state;
    set({ state, ready: true, load: info, save: lastSaved ? 'saved' : 'idle' });
    if (roll?.archived) notify(t('notice.weekArchived'), 'info');
    if (info.source !== 'state' && info.source !== 'none') scheduleSave();
    else if (roll) scheduleSave();
    if (weekCheckMs > 0 && !weekTimer) {
      weekTimer = setInterval(checkWeek, weekCheckMs);
      (weekTimer as { unref?: () => void }).unref?.();
    }

    if (state.settings.autoSnapshot && info.source !== 'none') {
      try {
        const list = await storage.listSnapshots();
        const lastAuto = list.filter(x => x.kind === 'auto').sort((a, b) => b.ts - a.ts)[0];
        if (!lastAuto || now() - lastAuto.ts > 24 * 3600 * 1000) await storage.createSnapshot('auto', 'start', JSON.stringify(state));
      } catch { /* snímek není podmínkou startu */ }
    }
  }

  /* ----- nahrazení celého stavu (import, obnova, reset) ----- */
  async function replaceState(next: AppState, kind: SnapshotKind, label: string, raw?: string): Promise<boolean> {
    if (!(await snapshot(kind, label))) return false;
    if (raw !== undefined) { try { await storage.saveImportRaw(raw); } catch { /* původní text je jen pojistka */ } }
    const n = normalize(next, now(), st().settings.lang);
    /* 0.9.0: okno (režim, připnutí, poloha, křížek) patří tomuto počítači; import, obnova ani reset ho nemění */
    n.mainWindow = structuredClone(st().mainWindow);
    /* 0.10.0: povaha, zvuky a průvodce Opse také patří tomuto počítači */
    n.opsPrefs = structuredClone(st().opsPrefs);
    const roll = rollTrials(n);
    const s = roll ? roll.state : n;
    syncGoals(s, now());
    syncBuddy(s.buddy, s.profile.level);
    s.meta.updatedAt = now();
    logProfile(s);
    set({ state: s });
    await doSave();
    return true;
  }

  const st = () => get().state;
  let lootBusy = false;
  const stationsOf = (s: AppState) => getStations(s.gameData);

  /* Cíle splněné raidem: množinově podle id. Cíl odebraný z raidu se otevře jen tehdy, když ho splnil právě tento raid. */
  function linkRaidGoals(s: AppState, r: Raid, prev: string[]) {
    for (const gid of prev) {
      if (r.goals.includes(gid)) continue;
      const g = s.goals.find(x => x.id === gid);
      if (g && g.doneRaid === r.id) { g.doneAt = 0; g.doneRaid = ''; }
    }
    for (const gid of r.goals) {
      const g = s.goals.find(x => x.id === gid);
      if (g && !g.doneAt) { g.doneAt = r.ts || now(); g.doneRaid = r.id; }
    }
  }
  function clearRouteChecks(s: AppState, routeId: string) {
    for (const k of Object.keys(s.checklists.routeChecks)) if (k.startsWith(routeId + ':')) delete s.checklists.routeChecks[k];
  }
  /* Přičte jen rozdíl proti už převedenému a zapamatuje si převedený stav. */
  function applyLootIn(s: AppState, r: Raid): Record<string, number> {
    const delta = lootDelta(r.loot, r.lootApplied);
    if (!Object.keys(delta).length) return {};
    s.inventory = applyDelta(s.inventory, delta);
    r.lootApplied = normalizeItems(structuredClone(r.loot));
    return delta;
  }

  const actions = {
    /* profil */
    setProfile(field: ProfileField, value: unknown): number {
      const [lo, hi] = PROFILE_LIMITS[field];
      const v = clampInt(value, lo, hi);
      change(s => { if (s.profile[field] === v) return false; s.profile[field] = v; });
      return v;
    },
    bumpProfile(field: ProfileField, delta: number) { actions.setProfile(field, st().profile[field] + delta); },

    /* skill tree */
    skillAdd(id: string) { change(s => { if (addBlock(s.skills.current, id, s.profile)) return false; s.skills.current[id] = (s.skills.current[id] || 0) + 1; }); },
    skillRemove(id: string) { change(s => { const c = s.skills.current; if (!c[id]) return false; c[id]--; if (!c[id]) delete c[id]; }); },
    planNext(): boolean {
      return change(s => {
        const nx = nextPlanPoint(s.skills.current, planSteps(s.skills.activePlan, s.skills.builds));
        if (!nx || addBlock(s.skills.current, nx.id, s.profile)) return false;
        s.skills.current[nx.id] = (s.skills.current[nx.id] || 0) + 1;
      });
    },
    planFill(): number {
      let n = 0;
      change(s => {
        const steps = planSteps(s.skills.activePlan, s.skills.builds);
        for (let g = 0; g < 80; g++) {
          const nx = nextPlanPoint(s.skills.current, steps);
          if (!nx || addBlock(s.skills.current, nx.id, s.profile)) break;
          s.skills.current[nx.id] = (s.skills.current[nx.id] || 0) + 1; n++;
        }
        if (!n) return false;
      });
      return n;
    },
    setPlan(key: string) {
      change(s => {
        if (!isPlanKey(key, s.skills.builds) || s.skills.activePlan === key) return false;
        s.skills.activePlan = key;
      });
    },
    setShowPlan(v: boolean) { change(s => { s.skills.showPlan = v; }); },
    treeReset() { change(s => { if (!Object.keys(s.skills.current).length) return false; s.skills.current = {}; }); },
    saveBuild(name: string, note: string, points: Points): string {
      const id = uid();
      change(s => { s.skills.builds.push({ id, name: text(name, 80) || t('skill.defaultBuild'), note: text(note, 1000), points: cleanPoints(points) }); });
      return id;
    },
    updateBuild(id: string, patch: Partial<Pick<SavedBuild, 'name' | 'note' | 'points'>>) {
      change(s => {
        const b = s.skills.builds.find(x => x.id === id); if (!b) return false;
        if (patch.name !== undefined) b.name = text(patch.name, 80) || t('skill.defaultBuild');
        if (patch.note !== undefined) b.note = text(patch.note, 1000);
        if (patch.points) b.points = cleanPoints(patch.points);
      });
    },
    deleteBuild(id: string) {
      change(s => {
        const before = s.skills.builds.length;
        s.skills.builds = s.skills.builds.filter(b => b.id !== id);
        if (s.skills.activePlan === BUILD_PREFIX + id) s.skills.activePlan = 'runner';
        if (s.skills.builds.length === before) return false;
      });
    },

    /* workshop */
    upgrade(stationId: string): boolean {
      return change(s => {
        const r = applyUpgrade({ stations: s.stations, inventory: s.inventory, profile: s.profile }, stationId, stationsOf(s));
        if (!r) return false;
        s.stations = r.stations; s.inventory = r.inventory;
      });
    },
    levelUp(stationId: string): boolean {
      return change(s => {
        const station = stationsOf(s).find(x => x.id === stationId); if (!station) return false;
        const lvl = s.stations[stationId];
        if (lvl >= station.max || reqBlock({ stations: s.stations, inventory: s.inventory, profile: s.profile }, station, lvl + 1)) return false;
        s.stations[stationId] = lvl + 1;
      });
    },
    levelDown(stationId: string): boolean {
      return change(s => {
        const station = stationsOf(s).find(x => x.id === stationId); if (!station) return false;
        if (s.stations[stationId] <= station.min) return false;
        s.stations[stationId]--;
      });
    },
    setRecipe(stationId: string, level: number, recipe: Recipe | null) {
      change(s => {
        const k = `${stationId}:${level}`;
        if (recipe === null) delete s.gameData.recipes[k];
        else s.gameData.recipes[k] = recipe.map(([m, n]) => [text(m, 80), clampInt(n, 1, 99999)] as [string, number]).filter(([m]) => m);
      });
    },

    /* zásoba */
    invSet(mat: string, value: unknown): number {
      const n = clampInt(value, LIMITS.inventory[0], LIMITS.inventory[1]);
      change(s => { if ((s.inventory[mat] || 0) === n) return false; if (n) s.inventory[text(mat, 80)] = n; else delete s.inventory[mat]; });
      return n;
    },
    invAdd(mat: string, delta: number) { actions.invSet(mat, (st().inventory[mat] || 0) + delta); },
    setMaterialMeta(name: string, patch: { category?: string; source?: string } | null) {
      change(s => {
        if (patch === null) { delete s.gameData.materials[name]; return; }
        const cur = { ...(s.gameData.materials[name] || {}) };
        if (patch.category !== undefined) cur.category = text(patch.category, 60);
        if (patch.source !== undefined) cur.source = text(patch.source, 200);
        s.gameData.materials[name] = cur;
      });
    },
    addCustomMaterial(name: string, category: string, source: string): boolean {
      const n = text(name, 80).trim();
      return change(s => {
        if (!n || s.gameData.materialsCustom.some(m => m.name === n)) return false;
        s.gameData.materialsCustom.push({ name: n, category: text(category, 60), source: text(source, 200) });
      });
    },
    deleteCustomMaterial(name: string) { change(s => { s.gameData.materialsCustom = s.gameData.materialsCustom.filter(m => m.name !== name); }); },

    /* vybavení (evidence předmětů mimo materiály): klíč je název + tier */
    itemSave(input: { name: string; category: ItemCategory; tier?: ItemTier; count: number }, prevKey?: string): string | null {
      const it = Object.values(normalizeItemStock({ x: input }))[0];
      if (!it) return null;
      change(s => {
        if (prevKey && prevKey !== it.key) delete s.items[prevKey];
        s.items[it.key] = it;
      });
      return it.key;
    },
    itemSetCount(key: string, value: unknown): number {
      const n = clampInt(value, 0, LIMITS.inventory[1]);
      change(s => {
        const it = s.items[key];
        if (!it || it.count === n) return false;
        if (n) it.count = n; else delete s.items[key];
      });
      return n;
    },
    itemDelete(key: string) { change(s => { if (!s.items[key]) return false; delete s.items[key]; }); },

    /* rozpoznávání ze snímků: před zápisem vždy snímek stavu (druh import); když se nepodaří, nic se nezapíše. */
    async importFromScreens(input: VisionApply): Promise<VisionSummary | null> {
      if (!get().ready) return null;
      await doSave();
      if (!(await snapshot('import', 'pred importem ze snimku'))) return null;
      let sum: VisionSummary | null = null;
      change(s => { sum = applyVisionImport(s, input, now()); });
      await doSave();
      return sum;
    },
    /* Loot ze snímku FINDINGS do raidu (0.8.1): kontrola (opakovaný snímek, výbava, nahrazení), snímek stavu,
       teprve potom zápis. Když se snímek stavu nepodaří, nic se nezapíše. Mince se nemění. */
    async importRaidLoot(input: RaidLootInput, sig: string): Promise<RaidLootResult> {
      if (!get().ready) return { ok: false, reason: 'notReady' };
      if (lootBusy) return { ok: false, reason: 'busy' };
      const first = checkRaidLoot(st(), input, sig);
      if (first) return { ok: false, reason: first };
      lootBusy = true;
      try {
        await doSave();
        if (!(await snapshot('import', 'pred importem lootu ze snimku'))) return { ok: false, reason: 'snapshot' };
        let done: RaidLootDone | null = null, late: RaidLootRefusal | null = null;
        const id = uid();
        change(s => {
          late = checkRaidLoot(s, input, sig);
          if (late) return false;
          done = applyRaidLoot(s, input, sig, now(), id);
        });
        await doSave();
        return done ? { ok: true, ...(done as RaidLootDone) } : { ok: false, reason: late ?? 'notReady' };
      } finally { lootBusy = false; }
    },
    /* Postup ze snímku (0.10.1): profil, úrovně stanic, ranky skillů z tooltipu, úkol (jen zrušení chybného
       „splněno“ a připnutí). Před zápisem snímek stavu; když se nepodaří, nic se nezapíše. */
    async importProgress(input: ProgressApply): Promise<ProgressSummary | null> {
      if (!get().ready) return null;
      await doSave();
      if (!(await snapshot('import', 'pred importem postupu ze snimku'))) return null;
      let sum: ProgressSummary = { fields: 0 };
      change(s => { sum = applyProgress(s, input, PIN_MAX); if (!sum.fields) return false; });
      await doSave();
      return sum;
    },
    clearLearned() { change(s => { if (!s.vision.learned.length) return false; s.vision.learned = []; }); },

    /* raidy: zápis přidá kolo, mince profilu ani zásoba se nemění. Úprava nemění kola ani zásobu.
       Loot se do Inventory převádí jen výslovně, a to jen rozdíl proti už převedenému. */
    addRaid(input: Partial<Raid>, opts: { applyLoot?: boolean } = {}): string {
      const id = uid();
      change(s => {
        const r = normalizeRaid({ ...input, id, ts: input.ts || now(), lootApplied: [] });
        if (!r.ok) r.coins = 0;
        r.goals = r.goals.filter(g => s.goals.some(x => x.id === g));
        s.raids.push(r);
        s.profile.rounds = Math.min(LIMITS.rounds[1], s.profile.rounds + 1);
        linkRaidGoals(s, r, []);
        if (opts.applyLoot) applyLootIn(s, r);
      });
      return id;
    },
    updateRaid(id: string, patch: Partial<Raid>, opts: { applyLoot?: boolean } = {}) {
      change(s => {
        const i = s.raids.findIndex(r => r.id === id); if (i < 0) return false;
        const prev = s.raids[i];
        const r = normalizeRaid({ ...prev, ...patch, id, lootApplied: prev.lootApplied });
        if (!r.ok) r.coins = 0;
        r.goals = r.goals.filter(g => s.goals.some(x => x.id === g));
        s.raids[i] = r;
        linkRaidGoals(s, r, prev.goals);
        if (opts.applyLoot) applyLootIn(s, r);
      });
    },
    deleteRaid(id: string, opts: { revertLoot?: boolean } = {}) {
      change(s => {
        const r = s.raids.find(x => x.id === id); if (!r) return false;
        if (opts.revertLoot && r.lootApplied.length) s.inventory = applyDelta(s.inventory, lootDelta([], r.lootApplied));
        s.raids = s.raids.filter(x => x.id !== id);
        for (const g of s.goals) if (g.doneRaid === id) g.doneRaid = '';
      });
    },
    /* Vrací rozdíl, který se přičetl (prázdný = nebylo co převádět). Opakované volání nic nepřičte. */
    applyRaidLoot(id: string): Record<string, number> {
      let delta: Record<string, number> = {};
      change(s => {
        const r = s.raids.find(x => x.id === id); if (!r) return false;
        delta = applyLootIn(s, r);
        if (!Object.keys(delta).length) return false;
      });
      return delta;
    },
    revertRaidLoot(id: string): boolean {
      return change(s => {
        const r = s.raids.find(x => x.id === id); if (!r || !r.lootApplied.length) return false;
        s.inventory = applyDelta(s.inventory, lootDelta([], r.lootApplied));
        r.lootApplied = [];
      });
    },

    /* cíle */
    addGoal(input: { title: string; note?: string; priority?: number; due?: string; link: GoalLink }): string {
      const id = uid();
      change(s => { s.goals.push(normalizeGoal({ ...input, id, createdAt: now(), doneAt: 0 }, now())); });
      return id;
    },
    updateGoal(id: string, patch: Partial<Pick<Goal, 'title' | 'note' | 'priority' | 'due' | 'link'>>) {
      change(s => {
        const i = s.goals.findIndex(g => g.id === id); if (i < 0) return false;
        const prev = s.goals[i];
        const g = normalizeGoal({ ...prev, ...patch, id }, now());
        /* Ruční cíl se změněným cílem: splnění odpovídá progresu (zvýšený cíl ho znovu otevře, snížený pod progres splní). */
        if (g.link.kind === 'manual' && (prev.link.kind !== 'manual' || prev.link.target !== g.link.target)) {
          if (g.link.progress >= g.link.target) { if (!g.doneAt) g.doneAt = now(); }
          else if (g.doneAt) { g.doneAt = 0; g.doneRaid = ''; }
        }
        if (JSON.stringify(g) === JSON.stringify(prev)) return false;
        s.goals[i] = g;
      });
    },
    setGoalProgress(id: string, progress: number) {
      change(s => {
        const g = s.goals.find(x => x.id === id); if (!g || g.link.kind !== 'manual') return false;
        const v = clampInt(progress, 0, g.link.target);
        if (v === g.link.progress) return false;
        g.link.progress = v;
        if (v >= g.link.target && !g.doneAt) g.doneAt = now();
      });
    },
    /* Ruční splnění nebo znovuotevření. Propojený cíl, jehož podmínka platí, se po otevření hned znovu splní. */
    setGoalDone(id: string, done: boolean): boolean {
      return change(s => {
        const g = s.goals.find(x => x.id === id); if (!g) return false;
        if (done === g.doneAt > 0) return false;
        g.doneAt = done ? now() : 0;
        if (done && g.link.kind === 'manual') g.link.progress = g.link.target;
        if (!done) {
          g.doneRaid = '';
          if (g.link.kind === 'manual' && g.link.progress >= g.link.target) g.link.progress = Math.max(0, g.link.target - 1);
          for (const r of s.raids) r.goals = r.goals.filter(x => x !== id);
        }
      });
    },
    deleteGoal(id: string) {
      change(s => {
        const n = s.goals.length;
        s.goals = s.goals.filter(g => g.id !== id);
        if (n === s.goals.length) return false;
        for (const r of s.raids) r.goals = r.goals.filter(g => g !== id);
      });
    },

    /* Material Planner: jen plán, zásobu nemění */
    setPlannerTarget(stationId: string, level: number | null) {
      change(s => {
        const st = STATIONS.find(x => x.id === stationId); if (!st) return false;
        const before = JSON.stringify(s.planner.stations);
        if (level === null || level <= (s.stations[stationId] ?? st.min)) delete s.planner.stations[stationId];
        else s.planner.stations[stationId] = clampInt(level, st.min, st.max);
        if (before === JSON.stringify(s.planner.stations)) return false;
      });
    },
    plannerAll(mode: 'next' | 'max' | 'clear') {
      change(s => {
        if (mode === 'clear') { s.planner.stations = {}; return; }
        for (const st of STATIONS) {
          const cur = s.stations[st.id] ?? st.min;
          if (cur >= st.max) { delete s.planner.stations[st.id]; continue; }
          s.planner.stations[st.id] = mode === 'max' ? st.max : cur + 1;
        }
      });
    },
    setPlannerIncludeGoals(v: boolean) { change(s => { if (s.planner.includeGoals === v) return false; s.planner.includeGoals = v; }); },
    setPlannerIncludeQuests(v: boolean) { change(s => { if (s.planner.includeQuests === v) return false; s.planner.includeQuests = v; }); },

    /* úkoly: zaškrtnutí doplní i předchozí úkoly řetězu (splněný úkol je nemá jak přeskočit) */
    questSet(id: string, done: boolean): number {
      let n = 0;
      change(s => {
        const next = setQuestDone(s.quests.done, id, done, now());
        n = Object.keys(next).length - Object.keys(s.quests.done).length;
        if (next === s.quests.done || (n === 0 && !!s.quests.done[id] === done)) return false;
        s.quests.done = next;
      });
      return n;
    },
    /* 0.10.2: ruční zaškrtnutí cíle úkolu (index v datech). Splnění úkolu se tím nemění. */
    questObjective(id: string, index: number, on: boolean) {
      change(s => {
        const next = setObjective(s.quests.objectives, id, index, on);
        if (next === s.quests.objectives) return false;
        s.quests.objectives = next;
      });
    },
    /* 0.9.0: připnutý úkol jde v kompaktu první; nejvýš PIN_MAX, nejstarší připnutí odpadne */
    questPin(id: string, pin: boolean) {
      change(s => {
        const cur = s.quests.pinned;
        if (!questById(id) || cur.includes(id) === pin) return false;
        s.quests.pinned = pin ? [...cur, id].slice(-PIN_MAX) : cur.filter(x => x !== id);
      });
    },
    /* milník 4: rada „vždy nechat“, naučené blueprinty, vlastní tier list, hotové fáze projektů */
    adviceKeep(key: string, keep: boolean) {
      const k = text(key, 130).trim();
      change(s => {
        if (!k || !!s.advice.keep[k] === keep) return false;
        if (keep) s.advice.keep[k] = true; else delete s.advice.keep[k];
      });
    },
    blueprintSet(name: string, learned: boolean) {
      const n = text(name, 120).trim();
      change(s => {
        if (!n || !!s.blueprints[n] === learned) return false;
        if (learned) s.blueprints[n] = now(); else delete s.blueprints[n];
      });
    },
    tierPlace(list: 'weapons' | 'items', id: string, tier: TierId | null, index?: number) {
      const v = text(id, 130).trim();
      change(s => {
        const next = placeTier(s.tierList[list], v, tier, index);
        if (!v || JSON.stringify(next) === JSON.stringify(s.tierList[list])) return false;
        s.tierList[list] = next;
      });
    },
    tierMove(list: 'weapons' | 'items', id: string, how: 'left' | 'right' | 'up' | 'down') {
      change(s => {
        const cur = s.tierList[list];
        const next = how === 'left' || how === 'right' ? moveWithin(cur, id, how === 'left' ? -1 : 1) : shiftTier(cur, id, how === 'up' ? -1 : 1);
        if (next === cur || JSON.stringify(next) === JSON.stringify(cur)) return false;
        s.tierList[list] = next;
      });
    },
    tierClear(list: 'weapons' | 'items') {
      change(s => {
        if (!Object.values(s.tierList[list]).some(x => x.length)) return false;
        s.tierList[list] = emptyTierList()[list];
      });
    },
    projectSetPhases(id: string, n: number) {
      const p = projectById(id);
      if (!p) return;
      const v = clampInt(n, 0, p.phases.length);
      change(s => {
        if ((s.projects[id] || 0) === v) return false;
        if (v) s.projects[id] = v; else delete s.projects[id];
      });
    },
    addPlannerItem(input: Partial<PlannerItem>): string {
      const id = uid();
      change(s => { s.planner.items.push(normalizePlanner({ items: [{ ...input, id }] }).items[0]); });
      return id;
    },
    updatePlannerItem(id: string, patch: Partial<PlannerItem>) {
      change(s => {
        const i = s.planner.items.findIndex(x => x.id === id); if (i < 0) return false;
        s.planner.items[i] = normalizePlanner({ items: [{ ...s.planner.items[i], ...patch, id }] }).items[0];
      });
    },
    deletePlannerItem(id: string) { change(s => { const n = s.planner.items.length; s.planner.items = s.planner.items.filter(x => x.id !== id); if (n === s.planner.items.length) return false; }); },

    /* loadouty */
    saveLoadout(input: Partial<Loadout>): string {
      const id = input.id && st().loadouts.some(l => l.id === input.id) ? input.id : uid();
      change(s => {
        const l = normalizeLoadout({ ...input, id });
        const i = s.loadouts.findIndex(x => x.id === id);
        if (i >= 0) s.loadouts[i] = l; else s.loadouts.push(l);
      });
      return id;
    },
    duplicateLoadout(id: string): string | null {
      const src = st().loadouts.find(l => l.id === id); if (!src) return null;
      return actions.saveLoadout({ ...structuredClone(src), id: undefined, name: t('default.copySuffix', { name: src.name }) });
    },
    deleteLoadout(id: string) { change(s => { const n = s.loadouts.length; s.loadouts = s.loadouts.filter(l => l.id !== id); if (n === s.loadouts.length) return false; }); },

    /* Trials: klik na stejnou hvězdu ubere jednu, jako v deníku */
    setStar(i: number, stars: number) {
      change(s => { const cur = s.trials.stars[i]; s.trials.stars[i] = clampInt(cur === stars ? stars - 1 : stars, 0, 3); });
    },
    setStarsExact(i: number, stars: number) { change(s => { s.trials.stars[i] = clampInt(stars, 0, 3); }); },
    setTrialName(i: number, name: string) { change(s => { s.trials.names[i] = text(name, 80); }); },
    setTrialNote(i: number, note: string) { change(s => { s.trials.notes[i] = text(note, 500); }); },

    /* checklisty */
    toggleCheck(itemId: string) { change(s => { if (s.checklists.checked[itemId]) delete s.checklists.checked[itemId]; else s.checklists.checked[itemId] = true; }); },
    resetChecklist(templateId: string = RAID_TEMPLATE_ID) {
      change(s => {
        const t = s.checklists.templates.find(x => x.id === templateId);
        if (!t || !t.items.some(i => s.checklists.checked[i.id])) return false;
        for (const it of t.items) delete s.checklists.checked[it.id];
      });
    },
    /* šablony: id položek jsou jedinečná napříč šablonami, odškrtnutí se ukládají podle nich */
    setActiveTemplate(id: string) { change(s => { if (s.checklists.active === id || !s.checklists.templates.some(t => t.id === id)) return false; s.checklists.active = id; }); },
    addTemplate(name: string, copyFrom?: string): string {
      const id = uid();
      change(s => {
        const src = copyFrom ? s.checklists.templates.find(t => t.id === copyFrom) : undefined;
        s.checklists.templates.push({ id, name: text(name, 80).trim() || t('default.newChecklist'), items: src ? src.items.map((i, k) => ({ id: id + '-' + k, text: i.text })) : [] });
        s.checklists.active = id;
      });
      return id;
    },
    renameTemplate(id: string, name: string) {
      change(s => { const t = s.checklists.templates.find(x => x.id === id); const n = text(name, 80).trim(); if (!t || !n || t.name === n) return false; t.name = n; });
    },
    deleteTemplate(id: string) {
      change(s => {
        const t = s.checklists.templates.find(x => x.id === id);
        if (!t || id === RAID_TEMPLATE_ID) return false;
        for (const i of t.items) delete s.checklists.checked[i.id];
        s.checklists.templates = s.checklists.templates.filter(x => x.id !== id);
        if (s.checklists.active === id) s.checklists.active = RAID_TEMPLATE_ID;
      });
    },
    restoreDefaultTemplate() {
      change(s => {
        const i = s.checklists.templates.findIndex(t => t.id === RAID_TEMPLATE_ID);
        const def = defaultTemplates(s.settings.lang)[0];
        if (i < 0) { s.checklists.templates.unshift(def); return; }
        for (const it of s.checklists.templates[i].items) if (!def.items.some(d => d.id === it.id)) delete s.checklists.checked[it.id];
        s.checklists.templates[i] = def;
      });
    },
    addTemplateItem(templateId: string, t: string) {
      const v = text(t, 300).trim(); if (!v) return;
      change(s => { const tp = s.checklists.templates.find(x => x.id === templateId); if (!tp || tp.items.length >= 100) return false; tp.items.push({ id: uid(), text: v }); });
    },
    editTemplateItem(templateId: string, itemId: string, t: string) {
      change(s => { const it = s.checklists.templates.find(x => x.id === templateId)?.items.find(i => i.id === itemId); const v = text(t, 300).trim(); if (!it || !v || it.text === v) return false; it.text = v; });
    },
    deleteTemplateItem(templateId: string, itemId: string) {
      change(s => { const tp = s.checklists.templates.find(x => x.id === templateId); if (!tp) return false; tp.items = tp.items.filter(i => i.id !== itemId); delete s.checklists.checked[itemId]; });
    },
    moveTemplateItem(templateId: string, itemId: string, dir: -1 | 1) {
      change(s => {
        const tp = s.checklists.templates.find(x => x.id === templateId); if (!tp) return false;
        const i = tp.items.findIndex(x => x.id === itemId), j = i + dir;
        if (i < 0 || j < 0 || j >= tp.items.length) return false;
        [tp.items[i], tp.items[j]] = [tp.items[j], tp.items[i]];
      });
    },
    toggleRouteCheck(key: string) { change(s => { if (s.checklists.routeChecks[key]) delete s.checklists.routeChecks[key]; else s.checklists.routeChecks[key] = true; }); },
    resetRouteChecks(routeId: string) {
      change(s => { clearRouteChecks(s, routeId); });
    },

    /* trasy (Money Runs): úprava, skrytí, vrácení, vlastní. Změna kroků zruší rozpracované odškrtnutí trasy. */
    editRoute(id: string, patch: Partial<Route>) {
      change(s => {
        const clean: Partial<Route> = {};
        for (const k of ['name', 'risk', 'loadout', 'yield', 'phase'] as const) if (patch[k] !== undefined) clean[k] = text(patch[k], k === 'loadout' ? 200 : 80);
        if (clean.name !== undefined && !clean.name.trim()) delete clean.name;
        if (patch.map !== undefined && MAPS.some(m => m.id === patch.map)) clean.map = patch.map;
        if (patch.steps) clean.steps = patch.steps.map(t => text(t, 500).trim()).filter(Boolean).slice(0, 40);
        const c = s.gameData.routesCustom.find(r => r.id === id);
        const base = baseRoute(id);
        const before = c ? c.steps : (s.gameData.routes[id]?.steps || base?.steps);
        if (c) Object.assign(c, clean, { id, origin: 'vlastni' });
        else {
          if (!base) return false;
          const o: Partial<Route> = { ...(s.gameData.routes[id] || {}), ...clean };
          for (const k of Object.keys(o) as (keyof Route)[]) if (JSON.stringify(o[k]) === JSON.stringify(base[k])) delete o[k];
          if (Object.keys(o).length) s.gameData.routes[id] = o; else delete s.gameData.routes[id];
        }
        if (clean.steps && JSON.stringify(clean.steps) !== JSON.stringify(before)) clearRouteChecks(s, id);
      });
    },
    resetRoute(id: string) {
      change(s => {
        const o = s.gameData.routes[id]; if (!o) return false;
        if (o.steps) clearRouteChecks(s, id);
        delete s.gameData.routes[id];
      });
    },
    setRouteHidden(id: string, hidden: boolean) { change(s => { if (hidden) s.gameData.routesHidden[id] = true; else delete s.gameData.routesHidden[id]; }); },
    addCustomRoute(name: string, map: string): string {
      const id = 'vlastni-' + uid();
      change(s => { s.gameData.routesCustom.push({ id, name: text(name, 80).trim() || t('default.newRoute'), map: MAPS.some(m => m.id === map) ? map : 'dam', risk: '', loadout: '', yield: '', phase: '', steps: [], origin: 'vlastni' }); });
      return id;
    },
    deleteCustomRoute(id: string) {
      change(s => {
        const n = s.gameData.routesCustom.length;
        s.gameData.routesCustom = s.gameData.routesCustom.filter(r => r.id !== id);
        if (n === s.gameData.routesCustom.length) return false;
        clearRouteChecks(s, id);
        delete s.gameData.routesHidden[id];
      });
    },

    /* prodejní ceník */
    editSell(id: string, patch: Partial<SellItem>) {
      change(s => {
        const clean: Partial<SellItem> = {};
        if (patch.name !== undefined && text(patch.name, 120).trim()) clean.name = text(patch.name, 120).trim();
        if (patch.price !== undefined) clean.price = clampInt(patch.price, 0, 1e8);
        if (patch.note !== undefined) clean.note = text(patch.note, 300);
        const c = s.gameData.sellCustom.find(x => x.id === id);
        if (c) { Object.assign(c, clean, { id, origin: 'vlastni' }); return; }
        const base = baseSell(id); if (!base) return false;
        const o: Partial<SellItem> = { ...(s.gameData.sell[id] || {}), ...clean };
        for (const k of Object.keys(o) as (keyof SellItem)[]) if (o[k] === base[k]) delete o[k];
        if (Object.keys(o).length) s.gameData.sell[id] = o; else delete s.gameData.sell[id];
      });
    },
    resetSell(id: string) { change(s => { if (!s.gameData.sell[id]) return false; delete s.gameData.sell[id]; }); },
    setSellHidden(id: string, hidden: boolean) { change(s => { if (hidden) s.gameData.sellHidden[id] = true; else delete s.gameData.sellHidden[id]; }); },
    addCustomSell(name: string, price: number, note: string): string {
      const id = 'vlastni-' + uid();
      change(s => { s.gameData.sellCustom.push({ id, name: text(name, 120).trim() || t('default.newSell'), price: clampInt(price, 0, 1e8), note: text(note, 300), origin: 'vlastni' }); });
      return id;
    },
    deleteCustomSell(id: string) { change(s => { const n = s.gameData.sellCustom.length; s.gameData.sellCustom = s.gameData.sellCustom.filter(x => x.id !== id); if (n === s.gameData.sellCustom.length) return false; delete s.gameData.sellHidden[id]; }); },

    /* další kroky */
    toggleStep(id: string) { change(s => { const x = s.steps.find(t => t.id === id); if (!x) return false; x.done = !x.done; }); },
    addStep(t: string) { const v = text(t, 300).trim(); if (v) change(s => { s.steps.push({ id: uid(), text: v, done: false }); }); },
    editStep(id: string, t: string) { change(s => { const x = s.steps.find(y => y.id === id); if (!x) return false; x.text = text(t, 300); }); },
    deleteStep(id: string) { change(s => { s.steps = s.steps.filter(x => x.id !== id); }); },
    moveStep(id: string, dir: -1 | 1) {
      change(s => { const i = s.steps.findIndex(x => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= s.steps.length) return false; [s.steps[i], s.steps[j]] = [s.steps[j], s.steps[i]]; });
    },

    /* mapy */
    mapEdit(mapId: string, fn: (m: MapNotes) => void) { change(s => { const m = s.maps[mapId] || (s.maps[mapId] = emptyMapNotes()); fn(m); }); },
    setMapNotes(mapId: string, notes: string) { actions.mapEdit(mapId, m => { m.notes = text(notes, 8000); }); },
    toggleVisited(mapId: string, place: string) { actions.mapEdit(mapId, m => { if (m.visited[place]) delete m.visited[place]; else m.visited[place] = true; }); },
    addPoi(mapId: string, name: string, note: string) { const n = text(name, 120).trim(); if (n) actions.mapEdit(mapId, m => { m.pois.push({ id: uid(), name: n, note: text(note, 1000) }); }); },
    deletePoi(mapId: string, id: string) { actions.mapEdit(mapId, m => { m.pois = m.pois.filter(p => p.id !== id); }); },
    addMapTodo(mapId: string, t: string) { const v = text(t, 300).trim(); if (v) actions.mapEdit(mapId, m => { m.todo.push({ id: uid(), text: v, done: false }); }); },
    toggleMapTodo(mapId: string, id: string) { actions.mapEdit(mapId, m => { const x = m.todo.find(t => t.id === id); if (x) x.done = !x.done; }); },
    deleteMapTodo(mapId: string, id: string) { actions.mapEdit(mapId, m => { m.todo = m.todo.filter(t => t.id !== id); }); },

    /* ARC */
    setArcNote(id: string, note: string) { change(s => { const v = text(note, 4000); if (v) s.arcNotes[id] = v; else delete s.arcNotes[id]; }); },
    editArc(id: string, patch: Partial<ArcUnit>) {
      change(s => {
        const c = s.gameData.arcCustom.find(u => u.id === id);
        if (c) { Object.assign(c, definedOnly(patch), { id, origin: 'vlastni' }); return; }
        return setOverride(s.gameData.arc, id, patch);
      });
    },
    resetArc(id: string) { change(s => { if (!s.gameData.arc[id]) return false; delete s.gameData.arc[id]; }); },
    setArcHidden(id: string, hidden: boolean) { change(s => { if (hidden) s.gameData.arcHidden[id] = true; else delete s.gameData.arcHidden[id]; }); },
    addCustomArc(name: string): string {
      const id = 'vlastni-' + uid();
      change(s => {
        s.gameData.arcCustom.push({ id, name: text(name, 80).trim() || t('default.newArc'), origin: 'vlastni', since: '', type: '', category: '', difficulty: 0, danger: '', traits: '', weakness: '', weaknessVerified: false, tactic: '', gear: '', drops: [], sources: [] });
      });
      return id;
    },
    deleteCustomArc(id: string) { change(s => { s.gameData.arcCustom = s.gameData.arcCustom.filter(u => u.id !== id); delete s.arcNotes[id]; }); },

    /* zbraně */
    setWeaponNote(id: string, patch: Partial<WeaponNote>) {
      change(s => {
        const cur: WeaponNote = s.weaponNotes[id] ? { ...s.weaponNotes[id] } : { tier: '', note: '' };
        if (patch.tier !== undefined) cur.tier = ['S', 'A', 'B', 'C'].includes(patch.tier) ? patch.tier : '';
        if (patch.note !== undefined) cur.note = text(patch.note, 2000);
        if (cur.tier || cur.note) s.weaponNotes[id] = cur; else delete s.weaponNotes[id];
      });
    },
    editWeapon(id: string, patch: Partial<Weapon>) {
      change(s => {
        const c = s.gameData.weaponsCustom.find(u => u.id === id);
        if (c) { Object.assign(c, definedOnly(patch), { id, origin: 'vlastni' }); return; }
        return setOverride(s.gameData.weapons, id, patch);
      });
    },
    resetWeapon(id: string) { change(s => { if (!s.gameData.weapons[id]) return false; delete s.gameData.weapons[id]; }); },
    setWeaponHidden(id: string, hidden: boolean) { change(s => { if (hidden) s.gameData.weaponsHidden[id] = true; else delete s.gameData.weaponsHidden[id]; }); },
    addCustomWeapon(name: string): string {
      const id = 'vlastni-' + uid();
      change(s => { s.gameData.weaponsCustom.push({ id, name: text(name, 80).trim() || t('default.newWeapon'), origin: 'vlastni', tier: '', antiArc: false, category: '', ammo: '', info: '', sources: [] }); });
      return id;
    },
    deleteCustomWeapon(id: string) { change(s => { s.gameData.weaponsCustom = s.gameData.weaponsCustom.filter(u => u.id !== id); delete s.weaponNotes[id]; }); },

    /* dashboard */
    setCardHidden(card: string, hidden: boolean) { change(s => { if (hidden) s.dashboard.hidden[card] = true; else delete s.dashboard.hidden[card]; }); },
    moveCard(card: string, dir: -1 | 1) {
      change(s => { const o = s.dashboard.order, i = o.indexOf(card), j = i + dir; if (i < 0 || j < 0 || j >= o.length) return false; [o[i], o[j]] = [o[j], o[i]]; });
    },
    resetDashboard() { change(s => { s.dashboard = { hidden: {}, order: [...DASHBOARD_CARDS] }; }); },

    /* nastavení */
    setAutoSnapshot(v: boolean) { change(s => { s.settings.autoSnapshot = v; }); },
    /* Jazyk UI. Uložený obsah (i výchozí kroky a šablony) se nepřepisuje. */
    setLang(lang: Lang) { change(s => { if (!isLang(lang) || s.settings.lang === lang) return false; s.settings.lang = lang; }); },

    /* milník 5: buddy a zkratka. Zapnutí a zkratku do systému promítá hub (src/ops/hub.ts). */
    setBuddy(patch: Partial<Pick<BuddyState, 'enabled' | 'hotkey' | 'scale' | 'opacity' | 'autoOpen'>>) {
      change(s => {
        const b = s.buddy, before = JSON.stringify(b);
        if (patch.enabled !== undefined) b.enabled = patch.enabled === true;
        if (patch.hotkey !== undefined) b.hotkey = patch.hotkey === '' || validHotkey(patch.hotkey) ? patch.hotkey : b.hotkey;
        if (patch.scale !== undefined) b.scale = patch.scale === 2 ? 2 : 1;
        if (patch.opacity !== undefined) b.opacity = clampInt(patch.opacity, OPACITY_MIN, OPACITY_MAX);
        if (patch.autoOpen !== undefined) b.autoOpen = patch.autoOpen === true;
        if (JSON.stringify(b) === before) return false;
      });
    },
    /* 0.9.0: hlavní okno (režim, připnutí, geometrie, křížek, obsah kompaktu); pravidla v core/mainWindow.ts */
    setMainWindow(next: MainWindowPrefs) {
      change(s => {
        const n = normalizeMainWindow(next);
        if (JSON.stringify(n) === JSON.stringify(s.mainWindow)) return false;
        s.mainWindow = n;
      });
    },
    setCloseAction(a: CloseAction) { change(s => { if (!CLOSE_ACTIONS.includes(a) || s.mainWindow.close === a) return false; s.mainWindow.close = a; }); },
    setCompactQuests(n: number) {
      change(s => { const v = clampInt(n, QUESTS_MIN, QUESTS_MAX); if (s.mainWindow.quests === v) return false; s.mainWindow.quests = v; });
    },
    setCompactCollapsed(section: CompactSection, collapsed: boolean) {
      change(s => {
        if (!COMPACT_SECTIONS.includes(section) || !!s.mainWindow.collapsed[section] === collapsed) return false;
        if (collapsed) s.mainWindow.collapsed[section] = true; else delete s.mainWindow.collapsed[section];
      });
    },
    /* 0.10.0: povaha, zvuky, dialogy a postup průvodce (pravidla v core/opsPrefs.ts) */
    setOpsPrefs(patch: Partial<Omit<OpsPrefs, 'tutorial'>> & { tutorial?: Partial<OpsPrefs['tutorial']> }) {
      change(s => {
        const n = normalizeOpsPrefs({ ...s.opsPrefs, ...patch, tutorial: { ...s.opsPrefs.tutorial, ...patch.tutorial } });
        if (JSON.stringify(n) === JSON.stringify(s.opsPrefs)) return false;
        s.opsPrefs = n;
      });
    },
    /* šatník: 'auto' = podle levelu, null = bez dílu, jinak díl ze sbírky */
    setBuddyOutfit(slot: string, value: string | null) {
      change(s => {
        if (!OPS_SLOTS.includes(slot)) return false;
        const o = s.buddy.outfit;
        if (value === 'auto') { if (!(slot in o)) return false; delete o[slot]; return; }
        if (value !== null && (partById(value)?.slot !== slot || !collection(s.buddy, s.profile.level).includes(value))) return false;
        if (o[slot] === value) return false;
        o[slot] = value;
      });
    },
    /* 0.11.0: výsledek dohraného kola minihry (mění jen s.games, nikdy herní data). Vrací, co se stalo
       (výhra, rekord, nově odemčené nátěry), nebo null, když store není připravený. */
    finishGame(result: GameResult): GameOutcome | null {
      let out: GameOutcome | null = null;
      change(s => { out = applyGameResult(s.games, result); });
      return out as GameOutcome | null;
    },
    /* 0.12.0: odpověď v kvízu uloží sérii hned (odchod uprostřed kola ji zachová). Vrací nově odemčené nátěry. */
    quizAnswer(correct: boolean): { streak: number; unlocked: string[] } | null {
      let out: { streak: number; unlocked: string[] } | null = null;
      change(s => { out = applyQuizAnswer(s.games, !!correct); });
      return out as { streak: number; unlocked: string[] } | null;
    },
    /* 0.13.0: rozehrané kolo minihry se ukládá průběžně (po každém tahu); dohrané kolo stejného čísla se nepřepíše */
    saveRound<G extends GameId>(game: G, data: NonNullable<GameRounds[G]>): boolean {
      return change(s => { if (!saveRound(s.gameRounds, game, data)) return false; });
    },
    /* zahodí jen uložené kolo jedné hry; rekordy, série a nátěry zůstanou */
    discardRound(game: GameId): boolean {
      return change(s => { if (!discardRound(s.gameRounds, game)) return false; });
    },
    /* dohrání kola: odměny a značka „dohráno“ v jedné změně; stejné kolo podruhé vrátí null a nic nepřipíše */
    finishRound<G extends GameId>(result: GameResult & { game: G }, data: NonNullable<GameRounds[G]>): GameOutcome | null {
      let out: GameOutcome | null = null;
      change(s => { out = finishRound(s.games, s.gameRounds, result, data); if (!out) return false; });
      return out as GameOutcome | null;
    },
    /* odpověď v kvízu: série a uložené kolo v jedné změně; už zodpovězená otázka vrátí null */
    answerQuiz(data: SavedQuiz, correct: boolean): { streak: number; unlocked: string[] } | null {
      let out: { streak: number; unlocked: string[] } | null = null;
      change(s => { out = answerQuiz(s.games, s.gameRounds, data, !!correct); if (!out) return false; });
      return out as { streak: number; unlocked: string[] } | null;
    },
    /* vybraný nátěr Opse: původní, nebo odemčený */
    setPaint(id: string) {
      change(s => {
        if (id !== DEFAULT_PAINT && !s.games.paints.includes(id)) return false;
        if (s.games.paint === id) return false;
        s.games.paint = id;
      });
    },
    resetBuddyOutfit() { change(s => { if (!Object.keys(s.buddy.outfit).length) return false; s.buddy.outfit = {}; }); },
    setBuddyPosition(monitor: string, x: number, y: number) {
      change(s => {
        const key = text(monitor, 120), p = { x: clampInt(x, -20000, 20000), y: clampInt(y, -20000, 20000) };
        const cur = s.buddy.positions[key];
        if (cur && cur.x === p.x && cur.y === p.y && s.buddy.monitor === key) return false;
        const keys = Object.keys(s.buddy.positions).filter(k => k !== key).slice(-15);
        s.buddy.positions = { ...Object.fromEntries(keys.map(k => [k, s.buddy.positions[k]])), [key]: p };
        s.buddy.monitor = key;
      });
    },

    /* snímky, import, reset */
    async createManualSnapshot(label: string): Promise<boolean> {
      await doSave();
      const ok = await snapshot('manual', label || 'rucni');
      if (ok) notify(t('notice.snapshotCreated'));
      return ok;
    },
    listSnapshots: (): Promise<SnapshotInfo[]> => storage.listSnapshots(),
    deleteSnapshot: (name: string) => storage.deleteSnapshot(name),
    async restoreSnapshot(name: string): Promise<boolean> {
      let content: string;
      try { content = await storage.readSnapshot(name); } catch (e) { notify(t('notice.snapshotUnreadable', { err: errText(e) }), 'danger'); return false; }
      let parsed: unknown;
      try { parsed = JSON.parse(content); } catch { notify(t('notice.snapshotCorrupt'), 'danger'); return false; }
      const ok = await replaceState(normalize(parsed, now(), st().settings.lang), 'restore', 'pred obnovou');
      if (ok) notify(t('notice.restored'));
      return ok;
    },
    async importState(nextIn: AppState, raw: string, kind: 'app' | 'diary'): Promise<boolean> {
      /* Záloha nezapne buddyho ani nezmění zkratku a polohy tohoto počítače; sbírka dílů se sjednotí. */
      const cur = st().buddy;
      const next: AppState = { ...nextIn, buddy: { ...nextIn.buddy, enabled: cur.enabled, hotkey: cur.hotkey, autoOpen: cur.autoOpen, positions: cur.positions, monitor: cur.monitor, unlocked: [...new Set([...cur.unlocked, ...nextIn.buddy.unlocked])] } };
      /* 0.11.0: odemčené nátěry se sjednotí a rekordy miniher se importem nesníží */
      next.games = mergeGames(st().games, nextIn.games);
      /* 0.13.0: rozehrané kolo tohoto počítače má přednost; záloha doplní jen hry bez uloženého kola */
      next.gameRounds = mergeRounds(st().gameRounds, nextIn.gameRounds);
      const ok = await replaceState(next, 'import', kind === 'diary' ? 'pred importem deniku' : 'pred importem', raw);
      if (ok) notify(t(kind === 'diary' ? 'notice.importedDiary' : 'notice.importedBackup'));
      return ok;
    },
    async resetModule(mod: ResetModule): Promise<boolean> {
      const s = structuredClone(st());
      const d = defaultState(now(), s.settings.lang);
      switch (mod) {
        case 'profile': s.profile = d.profile; s.profileLog = []; break;
        case 'skills': s.skills = d.skills; break;
        case 'workshop': s.stations = d.stations; s.gameData.recipes = {}; break;
        case 'quests': s.quests = d.quests; s.projects = {}; break;
        case 'inventory': s.inventory = {}; s.items = {}; s.gameData.materials = {}; s.gameData.materialsCustom = []; s.advice = d.advice; break;
        case 'blueprints': s.blueprints = {}; break;
        case 'tiers': s.tierList = d.tierList; break;
        case 'raids': s.raids = []; for (const g of s.goals) g.doneRaid = ''; break;
        case 'trials': s.trials = { ...d.trials, week: s.trials.week }; break;
        case 'checklists': s.checklists = { templates: defaultTemplates(s.settings.lang), active: RAID_TEMPLATE_ID, checked: {}, routeChecks: {} }; break;
        case 'steps': s.steps = defaultSteps(s.settings.lang); break;
        case 'maps': s.maps = {}; break;
        case 'arc': s.arcNotes = {}; Object.assign(s.gameData, { arc: {}, arcCustom: [], arcHidden: {} }); break;
        case 'weapons': s.weaponNotes = {}; Object.assign(s.gameData, { weapons: {}, weaponsCustom: [], weaponsHidden: {} }); break;
        case 'dashboard': s.dashboard = d.dashboard; break;
        case 'goals': s.goals = []; for (const r of s.raids) r.goals = []; break;
        case 'planner': s.planner = emptyPlanner(); break;
        case 'loadouts': s.loadouts = []; for (const r of s.raids) r.loadout = ''; break;
        case 'games': s.games = d.games; s.gameRounds = d.gameRounds; break;
        case 'routes': Object.assign(s.gameData, { routes: {}, routesCustom: [], routesHidden: {}, sell: {}, sellCustom: [], sellHidden: {} }); break;
      }
      const ok = await replaceState(s, 'reset', 'pred resetem ' + mod);
      if (ok) notify(t('notice.moduleReset', { name: RESET_MODULES.some(m => m.id === mod) ? resetName(mod) : mod }));
      return ok;
    },
    async resetAll(): Promise<boolean> {
      const d = defaultState(now(), st().settings.lang);
      d.trials = rollWeek(d.trials, new Date(now()));
      d.gameData = emptyGameData();
      const ok = await replaceState(d, 'reset', 'pred uplnym resetem');
      if (ok) notify(t('notice.allReset'));
      return ok;
    },
    async exportBackup(fileName: string): Promise<boolean> {
      try {
        const ok = await storage.exportBackup(fileName, makeBackup(st(), new Date(now())));
        if (ok) notify(t('notice.backupSaved'));
        return ok;
      } catch (e) { notify(t('notice.backupFailed', { err: errText(e) }), 'danger'); return false; }
    },
    retrySave: () => doSave(),
  };

  return { store, actions, init, flush, notify, dismiss, change, storage, checkWeek };
}
