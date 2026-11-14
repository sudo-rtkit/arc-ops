/* 0.16.0: celá aplikace v overlayi bez druhého zapisovatele.
   Overlay vykresluje skutečné moduly. Jejich akce store se v okně overlaye provedou jen na kopii stavu (zrcadlo,
   nic se neukládá), aby modul hned viděl výsledek, a stejná akce se jménem a argumenty pošle do hlavního okna.
   Hlavní okno je jediný zapisovatel: akci ověří (jen akce ze seznamu RELAY_ACTIONS, jen čistá data, omezená
   velikost) a provede ji stejnou akcí store jako vlastní UI. Výsledný stav pak pošle zpět s potvrzením (ack).
   - Id nových záznamů: overlay zaznamená id, která akce vytvořila (recordIds), a hlavní okno je přehraje
     (replayIds), takže nový raid, bod mapy nebo build má v obou oknech stejné id.
   - Shoda stavů: overlay drží nepotvrzené akce. Nový stav z hlavního okna je vždy základ; nepotvrzené akce se
     na něj jen znovu přehrají, dokud je hlavní okno nepotvrdí. Potvrzený stav je přesně stav hlavního okna, takže
     se okna nemohou trvale rozejít. Nepotvrzená akce starší než PENDING_MS se zahodí (platí stav hlavního okna).
   - Akce, které potřebují soubory, dialogy, úložiště nebo nastavení okna, jsou v BLOCKED_ACTIONS: v overlayi nic
     neudělají a UI místo nich nabídne „Otevřít v aplikaci“.
   Bez Reactu a DOM, takže jde testovat v Node. */
import type { App } from './app';
import type { AppState } from '../core/types';
import { isObj, recordIds, replayIds, UNSAFE_KEYS } from '../core/util';

type Actions = App['actions'];
type ActionName = keyof Actions;

/* Akce, které smí overlay poslat do hlavního okna. Všechny berou jen data (žádné funkce) a samy ořezávají vstup. */
export const RELAY_ACTIONS = [
  'setProfile', 'bumpProfile', 'skillAdd', 'skillRemove', 'planNext', 'planFill', 'setPlan', 'setShowPlan', 'treeReset', 'saveBuild', 'updateBuild', 'deleteBuild',
  'upgrade', 'levelUp', 'levelDown', 'setRecipe', 'invSet', 'invAdd', 'setMaterialMeta', 'addCustomMaterial', 'deleteCustomMaterial',
  'itemSave', 'itemSetCount', 'itemDelete', 'clearLearned',
  'addRaid', 'attachRaidPlan', 'detachRaidPlan', 'updateRaid', 'deleteRaid', 'applyRaidLoot', 'revertRaidLoot',
  'addGoal', 'updateGoal', 'setGoalProgress', 'setGoalDone', 'deleteGoal',
  'setPlannerTarget', 'plannerAll', 'setPlannerIncludeGoals', 'setPlannerIncludeQuests', 'addPlannerItem', 'updatePlannerItem', 'deletePlannerItem',
  'questSet', 'questObjective', 'questPin', 'adviceKeep', 'blueprintSet', 'tierPlace', 'tierMove', 'tierClear', 'projectSetPhases',
  'saveLoadout', 'duplicateLoadout', 'deleteLoadout',
  'setStar', 'setStarsExact', 'setTrialName', 'setTrialNote',
  'toggleCheck', 'resetChecklist', 'setActiveTemplate', 'addTemplate', 'renameTemplate', 'deleteTemplate', 'restoreDefaultTemplate',
  'addTemplateItem', 'editTemplateItem', 'deleteTemplateItem', 'moveTemplateItem', 'toggleRouteCheck', 'resetRouteChecks',
  'editRoute', 'resetRoute', 'setRouteHidden', 'addCustomRoute', 'deleteCustomRoute', 'editSell', 'resetSell', 'setSellHidden', 'addCustomSell', 'deleteCustomSell',
  'toggleStep', 'addStep', 'editStep', 'deleteStep', 'moveStep',
  'setMapNotes', 'toggleVisited', 'addPoi', 'addMapPoint', 'updatePoi', 'movePoi', 'restorePoi', 'setMapHarmonise', 'deletePoi', 'addMapTodo', 'toggleMapTodo', 'deleteMapTodo',
  'startRaidPlan', 'endRaidPlan', 'setRaidFound',
  'setArcNote', 'editArc', 'resetArc', 'setArcHidden', 'addCustomArc', 'deleteCustomArc',
  'setWeaponNote', 'editWeapon', 'resetWeapon', 'setWeaponHidden', 'addCustomWeapon', 'deleteCustomWeapon',
  'setCardHidden', 'moveCard', 'resetDashboard', 'setCompactQuests', 'setCompactCollapsed', 'setOpsPrefs', 'setBuddyOutfit', 'resetBuddyOutfit',
  'finishGame', 'quizAnswer', 'saveRound', 'finishRound', 'discardRound', 'answerQuiz', 'setPaint',
  /* 0.17.0: rádce „Co dál?“ (id tipu podle TIP_ID_RE (nejvýš 121 znaků), klíč 200 znaků, odložení 1–30 dní; ořezává akce) */
  'advisorDismiss', 'advisorSnooze', 'advisorRestore', 'advisorRestoreAll',
  /* 0.20.0: Zpět u automatického zápisu, upozornění viděna, vyřízení fronty „Ke kontrole“ (akce samy ověřují id a data) */
  'autoUndo', 'autoSeen', 'reviewApply',
  /* 0.24.0: potvrzení původu hodnoty a oblasti (oblast ze seznamu, klíč nejvýš 130 znaků; akce samy ověřují) */
  'provConfirm', 'provConfirmArea',
] as const satisfies readonly ActionName[];

/* Akce jen pro hlavní okno a co vrátí v overlayi místo provedení:
   - snímky, import a export zálohy, reset a ukládání (soubory, dialogy, úložiště);
   - zápis ze snímku obrazovky (jde přes hub se snímkem; v modulech je za výběrem souboru);
   - snímek mapy (obrázek v IndexedDB zapisuje jen hlavní okno) a mapEdit (bere funkci);
   - nastavení tohoto počítače z Nastavení (buddy a zkratka, okno, jazyk, automatické snímky);
   - 0.19.0: zavření karty „Co je nového“ (ukazuje se jen v hlavním okně);
   - 0.22.0: widgety nad hrou a jejich globální zkratky (nastavení tohoto počítače, jen Nastavení hlavního okna);
   - 0.22.1: buddy propouští kliky do hry (nastavení tohoto počítače, jen Nastavení hlavního okna);
   - 0.20.0: automatické snímání a hlavní vypínač napojení na hru (nastavení tohoto počítače), kroky průběhu raidu
     a automatický zápis (jen hub v hlavním okně, ze snímku). */
const none = () => undefined;
const later = <T>(v: T) => () => Promise.resolve(v);
export const BLOCKED_ACTIONS = {
  importFromScreens: later(null), importRaidLoot: later({ ok: false as const, reason: 'notReady' as const }), importProgress: later(null),
  mapEdit: none, setMapImage: none,
  setAutoSnapshot: none, setLang: none, whatsNewSeen: none, setWidgets: none, setPassClicks: none, setLowImpact: none, setConsoleKey: none,
  setAutoCapture: () => false, setGameLinkOff: () => false, lifeEvent: () => null, autoRaid: later(null), reviewAddScreen: () => false, setBuddy: none, setMainWindow: none, setCloseAction: none, setBuddyPosition: none,
  createManualSnapshot: later(false), listSnapshots: later([]), deleteSnapshot: later(undefined), restoreSnapshot: later(false),
  importState: later(false), resetModule: later(false), resetAll: later(false), exportBackup: later(false), retrySave: later(undefined),
} satisfies Partial<Record<ActionName, () => unknown>>;

/* Set (ne objekt), takže jméno jako 'constructor' nebo '__proto__' nikdy neprojde přes prototyp. */
const RELAY = new Set<string>(RELAY_ACTIONS);
export const isRelayAction = (name: unknown): name is (typeof RELAY_ACTIONS)[number] => typeof name === 'string' && RELAY.has(name);

/* ----- argumenty: čistá data, která přežijí JSON (události Tauri) beze ztráty undefined a NaN ----- */
const UNDEF = '\u0000u';
const NUM = '\u0000n';
const MAX_DEPTH = 12;
/* Nejvýš tolik znaků v JSON jedné akce (raid s lootem, build, poznámka mapy se vejdou). */
export const RELAY_MAX_CHARS = 256 * 1024;
/* 0.16.1: meze jednotlivých hodnot v argumentech (nejdelší text v modulech je 8000 znaků, seznamy pár set). */
export const RELAY_MAX_STRING = 64 * 1024;
export const RELAY_MAX_ITEMS = 5000;

export class RelayArgError extends Error {}
export function encodeArgs(v: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw new RelayArgError('depth');
  if (v === undefined) return { [UNDEF]: 1 };
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { [NUM]: String(v) };
  if (Array.isArray(v)) return v.map(x => encodeArgs(x, depth + 1));
  if (isObj(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = encodeArgs(x, depth + 1);
    return o;
  }
  /* funkce, třídy, Map, Date… se do hlavního okna neposílají */
  throw new RelayArgError(typeof v);
}
const SPECIAL: Record<string, number> = { NaN: NaN, Infinity: Infinity, '-Infinity': -Infinity };
export function decodeArgs(v: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw new RelayArgError('depth');
  if (typeof v === 'string') { if (v.length > RELAY_MAX_STRING) throw new RelayArgError('string'); return v; }
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new RelayArgError('number'); return v; }
  if (Array.isArray(v)) { if (v.length > RELAY_MAX_ITEMS) throw new RelayArgError('items'); return v.map(x => decodeArgs(x, depth + 1)); }
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (keys.length > RELAY_MAX_ITEMS) throw new RelayArgError('items');
    if (keys.length === 1 && keys[0] === UNDEF) return undefined;
    if (keys.length === 1 && keys[0] === NUM && typeof v[NUM] === 'string' && Object.hasOwn(SPECIAL, v[NUM] as string)) return SPECIAL[v[NUM] as string];
    const o: Record<string, unknown> = {};
    for (const k of keys) { if (UNSAFE_KEYS.has(k) || k.length > 200) continue; o[k] = decodeArgs(v[k], depth + 1); }
    return o;
  }
  throw new RelayArgError(typeof v);
}

/* Zpráva overlay → hlavní okno. session odliší nové okno overlaye (po zavření a otevření začíná seq znovu od 1). */
export interface RelayCall { session: string; seq: number; name: string; args: unknown; ids: string[] }
/* Potvrzení v kopii stavu z hlavního okna: poslední zpracovaná akce dané relace. */
export interface RelayAck { session: string; seq: number }

/* ----- hlavní okno: ověřit a provést ----- */
export type RelayResult = { ack: RelayAck; applied: boolean };
export function applyRelay(app: App, raw: unknown): RelayResult | null {
  const m = raw as Partial<RelayCall> | null;
  if (!m || typeof m !== 'object' || typeof m.session !== 'string' || !/^[0-9a-z]{4,40}$/.test(m.session)) return null;
  if (!Number.isSafeInteger(m.seq) || (m.seq as number) < 1) return null;
  const ack: RelayAck = { session: m.session, seq: m.seq as number };
  if (!isRelayAction(m.name) || !Array.isArray(m.args) || m.args.length > 6 || !Array.isArray(m.ids) || m.ids.length > 32) return { ack, applied: false };
  let args: unknown[];
  try {
    if (JSON.stringify(m.args).length > RELAY_MAX_CHARS) return { ack, applied: false };
    args = decodeArgs(m.args) as unknown[];
  } catch { return { ack, applied: false }; }
  /* jen vlastní funkce objektu akcí (ne zděděná vlastnost) */
  const fn = Object.hasOwn(app.actions, m.name) ? (app.actions[m.name] as unknown) : null;
  if (typeof fn !== 'function') return { ack, applied: false };
  const before = app.store.getState().state;
  try {
    replayIds(m.ids, () => (fn as (...a: unknown[]) => unknown)(...args));
  } catch { return { ack, applied: false }; }
  return { ack, applied: app.store.getState().state !== before };
}

/* ----- 0.22.0: úpravy z okna widgetů ----- */
/* Okno widgetů smí poslat jen tyto dvě akce, a jen v Úpravách (hra nikdy nedostane vstup, okno ve Hře nic neposílá):
   zaškrtnutí cíle úkolu a orientační „mám“ v seznamu k nalezení (inventář se nemění). Argumenty mají pevný tvar
   a meze; cokoli jiného se zahodí. Akce provede stejná akce store jako vlastní UI hlavního okna. */
export const WIDGET_ACTIONS = ['questObjective', 'setRaidFound'] as const satisfies readonly ActionName[];
export type WidgetAction = (typeof WIDGET_ACTIONS)[number];
const shortText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
export function applyWidgetAction(app: App, raw: unknown): boolean {
  const m = raw as { name?: unknown; args?: unknown } | null;
  if (!m || typeof m !== 'object' || !Array.isArray(m.args) || JSON.stringify(m.args).length > 512) return false;
  const [a, b, c] = m.args as unknown[];
  const before = app.store.getState().state;
  if (m.name === 'questObjective') {
    if (!shortText(a, 80) || !Number.isSafeInteger(b) || (b as number) < 0 || (b as number) > 63 || typeof c !== 'boolean' || m.args.length !== 3) return false;
    app.actions.questObjective(a, b as number, c);
  } else if (m.name === 'setRaidFound') {
    if (!shortText(a, 80) || typeof b !== 'boolean' || m.args.length !== 2) return false;
    app.actions.setRaidFound(a, b);
  } else return false;
  return app.store.getState().state !== before;
}

/* ----- overlay: zrcadlo ----- */
export interface MirrorOptions {
  send: (call: RelayCall) => void;
  now?: () => number;
  /* id relace (jinak náhodné) */
  session?: string;
}
/* Jak dlouho čeká nepotvrzená akce, než ji overlay zahodí (hlavní okno ji nedostalo nebo neodpovědělo). */
export const PENDING_MS = 5000;

interface Pending { seq: number; name: string; args: unknown[]; ids: string[]; at: number }

export function createMirror(app: App, { send, now = Date.now, session = Math.random().toString(36).slice(2, 12) || 'ovr0' }: MirrorOptions) {
  if (!app.setMirror()) throw new Error('mirror: store is already loaded');
  const actions = app.actions as unknown as Record<string, (...a: unknown[]) => unknown>;
  const orig: Record<string, (...a: unknown[]) => unknown> = { ...actions };
  let seq = 0;
  let depth = 0;
  let pending: Pending[] = [];
  let base: AppState | null = null;

  for (const name of Object.keys(orig)) {
    if (isRelayAction(name)) {
      actions[name] = (...args: unknown[]) => {
        /* vnořené volání (akce volá jinou akci) jde jen do kopie; do hlavního okna jde jen vnější akce */
        if (depth > 0) return orig[name](...args);
        let encoded: unknown;
        try { encoded = encodeArgs(args); } catch { return undefined; }
        depth++;
        try {
          const { value, ids } = recordIds(() => orig[name](...args));
          const p: Pending = { seq: ++seq, name, args, ids, at: now() };
          pending.push(p);
          send({ session, seq: p.seq, name, args: encoded, ids });
          return value;
        } finally { depth--; }
      };
    } else {
      const stub = (BLOCKED_ACTIONS as Record<string, () => unknown>)[name];
      actions[name] = stub ?? none;
    }
  }

  /* Nepotvrzené akce přehrát na stav z hlavního okna (jen kopie, nic se neposílá). */
  function rebase() {
    if (!base) return;
    app.store.setState({ state: base });
    depth++;
    try {
      for (const p of pending) { try { replayIds(p.ids, () => orig[p.name](...p.args)); } catch { /* akce se na novém stavu nepovedla */ } }
    } finally { depth--; }
  }

  /* Nový stav z hlavního okna. Vrací počet ještě nepotvrzených akcí. */
  function receive(state: AppState, ack?: RelayAck | null) {
    base = state;
    const t = now();
    const done = ack && ack.session === session ? ack.seq : 0;
    pending = pending.filter(p => p.seq > done && t - p.at < PENDING_MS);
    if (!pending.length) app.store.setState({ state });
    else rebase();
    return pending.length;
  }

  return { session, receive, pending: () => pending.length };
}
export type Mirror = ReturnType<typeof createMirror>;
