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
import { isObj, recordIds, replayIds } from '../core/util';

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
] as const satisfies readonly ActionName[];

/* Akce jen pro hlavní okno a co vrátí v overlayi místo provedení:
   - snímky, import a export zálohy, reset a ukládání (soubory, dialogy, úložiště);
   - zápis ze snímku obrazovky (jde přes hub se snímkem; v modulech je za výběrem souboru);
   - snímek mapy (obrázek v IndexedDB zapisuje jen hlavní okno) a mapEdit (bere funkci);
   - nastavení tohoto počítače z Nastavení (buddy a zkratka, okno, jazyk, automatické snímky). */
const none = () => undefined;
const later = <T>(v: T) => () => Promise.resolve(v);
export const BLOCKED_ACTIONS = {
  importFromScreens: later(null), importRaidLoot: later({ ok: false as const, reason: 'notReady' as const }), importProgress: later(null),
  mapEdit: none, setMapImage: none,
  setAutoSnapshot: none, setLang: none, setBuddy: none, setMainWindow: none, setCloseAction: none, setBuddyPosition: none,
  createManualSnapshot: later(false), listSnapshots: later([]), deleteSnapshot: later(undefined), restoreSnapshot: later(false),
  importState: later(false), resetModule: later(false), resetAll: later(false), exportBackup: later(false), retrySave: later(undefined),
} satisfies Partial<Record<ActionName, () => unknown>>;

const RELAY = new Set<string>(RELAY_ACTIONS);
export const isRelayAction = (name: unknown): name is (typeof RELAY_ACTIONS)[number] => typeof name === 'string' && RELAY.has(name);

/* ----- argumenty: čistá data, která přežijí JSON (události Tauri) beze ztráty undefined a NaN ----- */
const UNDEF = '\u0000u';
const NUM = '\u0000n';
const MAX_DEPTH = 12;
/* Nejvýš tolik znaků v JSON jedné akce (raid s lootem, build, poznámka mapy se vejdou). */
export const RELAY_MAX_CHARS = 256 * 1024;

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
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.map(x => decodeArgs(x, depth + 1));
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === UNDEF) return undefined;
    if (keys.length === 1 && keys[0] === NUM && typeof v[NUM] === 'string' && v[NUM] in SPECIAL) return SPECIAL[v[NUM] as string];
    const o: Record<string, unknown> = {};
    for (const k of keys) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue; o[k] = decodeArgs(v[k], depth + 1); }
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
  const before = app.store.getState().state;
  try {
    const fn = app.actions[m.name] as (...a: unknown[]) => unknown;
    replayIds(m.ids, () => fn(...args));
  } catch { return { ack, applied: false }; }
  return { ack, applied: app.store.getState().state !== before };
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
