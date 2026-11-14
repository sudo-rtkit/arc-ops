/* Hub buddyho v hlavním okně (milník 5). Jediné místo, které mění stav: okna buddy a overlay dostávají kopii
   a posílají sem pojmenované akce, které projdou stejnými akcemi store jako v hlavním okně.
   - Přepínač „Buddy a zkratka“ promítá do Rustu: vypnuto = žádné okno, žádná zkratka, žádné hlídání hry.
   - Snímek ze zkratky se tu přečte (readCapture) a obrazová data se hned zahodí; drží se jen ScreenRead
     v paměti. Prázdný snímek (bez inventáře) ani jiná obrazovka nic nezapíše.
   - 0.8.1: STASH (stránky stashe) a loot po raidu (FINDINGS) jsou oddělené: stránky jdou do dávky stashe,
     snímek FINDINGS do samostatného místa pro loot (novější nahradí starší). Nikdy se nemíchají.
   - 0.10.1: obrazovka postupu (profil, dílna, úkol, skill tree) jde do vlastního místa (novější nahradí starší);
     drží se jen přečtená čísla a názvy, zápis až po potvrzení v revizi (importProgress).
   - 0.22.0: widgety nad hrou. Okno widgetů dostává kopii stavu (jen čtení) a smí poslat jen dvě úpravy z Úprav
     (store/relay.ts WIDGET_ACTIONS). Otevírá se se zapnutým přepínačem widgetů, když je vidět Ops (stejné pravidlo
     „otevřít s hrou“), a zavírá se s ním. Dvě volitelné zkratky (Úpravy, Skrýt / zobrazit) registruje Rust.
   Bez Reactu a bez DOM, takže jde testovat v Node se zástupným bus a native. */
import type { App } from '../store/app';
import type { AppState } from '../core/types';
import type { ScreenRead } from '../core/vision/read';
import type { RgbaImage } from '../core/vision/image';
import { readCapture } from '../core/opsCapture';
import type { ProgressRead } from '../core/vision/progress';
import { normalizeProgressApply, proposalChanges, proposeProgress, type ProgressApply, type ProgressSummary } from '../core/progressImport';
import { analyzeLoot, analyzeShots, type VisionApply, type VisionSummary } from '../core/visionImport';
import { lootSignature, raidWithSig, type RaidLootInput } from '../core/lootImport';
import { normalizeItems } from '../core/raidItems';
import { evalLine, evaluateRaid } from '../core/raidEval';
import { dayKey } from '../core/util';
import type { ProfileField, RaidLootResult } from '../store/app';
import { SKILL } from '../core/data/skills';
import { matchContext } from '../core/catalog';
import { getMaterials } from '../core/gamedata';
import { animMs, levelEvent, resolveOutfit, type LevelEvent, type OpsAnim } from '../core/ops';
import { line, sayLine, type LineRef } from '../core/opsVoice';
import type { SoundId } from '../core/opsSound';
import type { OpsPersonality } from '../core/types';
import { getLang, t, type Key, type Lang } from '../i18n';
import type { Bus } from './bus';
import type { Native } from './native';
import { applyRelay, applyWidgetAction, type RelayAck } from '../store/relay';
import { readAutoCapture } from '../core/opsCapture';
import { autoActive, autoIndicator, isRustScreen, screenBits, type AutoIndicator, type RustScreen } from '../core/autoCapture';
import { IN_RAID_SIGNAL, loadoutSnap } from '../core/raidLife';
import { emoteFor, type AutoEmote, type AutoOutcome, type EmoteMsg } from '../core/opsEmote';
import { calmNow, widgetPushMs } from '../core/lowImpact';

/* auto (0.21.0): snímek z automatického snímání (původ hodnot po zápisu), jinak ze zkratky */
export interface Shot { id: number; at: number; read: ScreenRead; auto?: true }
/* Snímek FINDINGS po raidu: jen BACKPACK a QUICK USE, sig = podpis proti opakovanému zápisu. */
export interface LootShot extends Shot { sig: string }
/* Snímek obrazovky postupu (0.10.1). */
export interface ProgressShot { id: number; at: number; read: ProgressRead; auto?: true }
export interface BatchView {
  /* stránky stashe */
  shots: Shot[];
  /* loot po raidu (odděleně od stashe) */
  loot: LootShot | null;
  /* obrazovka postupu (profil, dílna, úkol, skill tree) */
  progress: ProgressShot | null;
  /* poslední přečtený druh (overlay podle něj otevře revizi) */
  last: 'stash' | 'loot' | 'progress' | null;
  emptyAt: number;
  /* proč se poslední snímek zahodil: bez inventáře, nebo jiná obrazovka s batohem (např. příprava loadoutu) */
  rejected: '' | 'noInventory' | 'otherScreen';
  failed: string;
}
export interface BuddyView {
  lang: Lang; level: number; outfit: Record<string, string | null>; scale: 1 | 2;
  /* 0.11.0: nátěr Opse */
  paint: string;
  positions: Record<string, { x: number; y: number }>; monitor: string; hotkey: string;
  /* 0.10.0: povaha, zvuky a dialogy; hra běží (null = nevíme, hlídání je vypnuté) */
  personality: OpsPersonality; sound: boolean; volume: number; dialogs: boolean; game: boolean | null;
  /* 0.20.0: ukazatel automatického snímání (běží / pozastaveno / vypnuto) */
  auto: AutoIndicator;
  /* 0.22.0: widgety nad hrou zapnuté: klik na Opse otevře jejich Úpravy (jinak overlay jako dřív) */
  widgets: boolean;
  /* 0.23.0: režim nízké zátěže právě šetří (zapnutý a hra v popředí): animace stojí */
  calm: boolean;
}
/* 0.22.0: kopie stavu pro okno widgetů (jen čtení) a co čeká na revizi ze snímku (widget Ke kontrole) */
export interface WidgetView { state: AppState; pending: { stash: number; loot: boolean; progress: boolean }; game: boolean | null; calm?: boolean }
/* 0.23.0: údaje pro panel Zátěž aplikace (okna widgetů a jak často se obnovují, šetří se právě teď?) */
export interface PerfInfo { widgetWindows: number; widgetPushMs: number; calm: boolean; lowImpact: boolean }
/* Widgety: zapnuté v Nastavení, se zapnutým Opsem a bez hlavního vypínače napojení na hru. */
export const widgetsOn = (s: AppState): boolean => s.buddy.enabled && s.opsPrefs.widgets.on && !s.gameLink.off;
/* relay (0.16.0): poslední zpracovaná akce plného modulu z overlaye (store/relay.ts) */
export interface OverlayView { state: AppState; batch: BatchView; savedAt: number; hotkey: string; relay: RelayAck | null }
/* Je Ops UI právě v použití (pro zvuky a nevyžádané bubliny)? */
export interface UiActivity { overlayOpen: boolean; appFocused: boolean }
/* Stav Opse: animace, hláška (varianta podle povahy se vybere v okně), zvuk a zda šlo o odpověď na akci hráče. */
export interface BuddyStatus { anim: OpsAnim; line: LineRef | null; sound: SoundId | null; solicited: boolean; ui: UiActivity }
/* Událost levelu pro okno buddyho, s informací o použití UI. */
export type BuddyLevelEvent = LevelEvent & { ui: UiActivity };

/* Nejvýš tolik stránek stashe v jedné dávce. */
export const BATCH_MAX = 12;

export interface HubOptions {
  app: App; bus: Bus; native: Native; now?: () => number; pushMs?: number; navigate?: (route: string) => void;
  /* má hlavní okno fokus (plný nebo kompaktní režim)? */
  appFocused?: () => boolean;
  /* jak dlouho před zavřením okna buddyho hraje odchod (dismiss); 0 = zavřít hned */
  dismissMs?: number;
}
/* Délka odchodu podle manifestu. */
export const DISMISS_MS = animMs('dismiss');
const SOUND_OF: Partial<Record<OpsAnim, SoundId>> = { scanning: 'scan', thinking: 'unsure', success: 'done', error: 'error', inspect: 'unsure', shrug: 'unsure', annoyed: 'unsure' };

export function createOpsHub({ app, bus, native, now = Date.now, pushMs = 120, navigate, appFocused = () => false, dismissMs = 0 }: HubOptions) {
  const st = () => app.store.getState().state;
  const emptyBatch = (): BatchView => ({ shots: [], loot: null, progress: null, last: null, emptyAt: 0, rejected: '', failed: '' });
  let batch: BatchView = emptyBatch();
  let nextShot = 1;
  let applied: { enabled: boolean; autoOpen: boolean } = { enabled: false, autoOpen: false };
  /* 0.20.0: co je v Rustu nastavené pro automatické snímání (on:maska), hlídání a zkratka */
  let appliedAuto = 'off';
  let appliedWatch = false;
  let appliedHotkey = '';
  /* 0.22.1: propouštění kliků buddyho, jak ho hub naposledy poslal do Rustu (null = po zapnutí ještě ne) */
  let appliedPass: boolean | null = null;
  let prevLevel: number | null = null;
  let lastBuddy = '';
  let overlayKnown = false;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let gameRunning = false;
  let gameVisible = false;
  /* hlídání hry dalo odpověď (jinak nevíme, jestli hra běží) */
  let gameKnown = false;
  let overlayOpen = false;
  const statusListeners = new Set<(s: BuddyStatus) => void>();
  const eventListeners = new Set<(e: LevelEvent) => void>();
  /* 0.9.0: buddy skrytý z nabídky oznamovací oblasti (jen pro tuto relaci; zkratka a snímek běží dál) */
  let buddyHidden = false;
  const visListeners = new Set<() => void>();
  /* 0.9.0: snímek z tlačítka v kompaktním okně: po přečtení otevřít revizi v overlayi, nezdar ohlásit v okně */
  let appCaptureAt = 0;
  const APP_CAPTURE_MS = 15_000;
  const offs: (() => void)[] = [];
  /* 0.16.0: potvrzení poslední akce plného modulu z overlaye */
  let relayAck: RelayAck | null = null;
  /* 0.20.1: emoce automatického snímku: poslední začatý snímek, poslední snímek s výslednou emocí a čísla snímků
     bez Rustu (testovací cesta v prohlížeči, záporná, aby se nepletla s čísly z Rustu) */
  const emoteListeners = new Set<(e: EmoteMsg) => void>();
  let emoteCur = 0, emoteDone = 0, localShot = 0;
  /* 0.22.0: okno widgetů: ozvalo se, je otevřené (jak ho hub naposledy nastavil), Ops je vidět, Úpravy běží,
     zkratky widgetů v Rustu */
  let widgetsKnown = false, widgetsApplied = false, buddyShown = false, widgetsEditing = false;
  let widgetsTimer: ReturnType<typeof setTimeout> | null = null;
  let appliedKeys = { edit: '', hide: '' };
  /* 0.23.0: zkratka polní konzole, jak ji hub naposledy poslal do Rustu; posluchači změny hry v popředí */
  let appliedConsole = '';
  const frontListeners = new Set<(front: boolean) => void>();
  /* 0.23.0: režim nízké zátěže šetří, když je zapnutý a hra je vidět v popředí (game-visible z hlídací smyčky) */
  const calm = () => calmNow(st().opsPrefs.lowImpact, gameVisible);

  /* Nativní volání jdou za sebou, aby se zapnutí a vypnutí nepředběhla. */
  let queue: Promise<unknown> = Promise.resolve();
  const run = (fn: () => Promise<unknown>) => { queue = queue.then(fn).catch(() => undefined); return queue; };

  /* ----- kopie stavu pro okna ----- */
  const buddyView = (s: AppState): BuddyView => ({
    lang: s.settings.lang, level: s.profile.level, outfit: resolveOutfit(s.profile.level, s.buddy), scale: s.buddy.scale, paint: s.games.paint,
    positions: s.buddy.positions, monitor: s.buddy.monitor, hotkey: s.buddy.hotkey,
    personality: s.opsPrefs.personality, sound: s.opsPrefs.sound, volume: s.opsPrefs.volume, dialogs: s.opsPrefs.dialogs,
    game: gameKnown ? gameRunning : null,
    auto: autoIndicator(s),
    widgets: widgetsOn(s),
    calm: calmNow(s.opsPrefs.lowImpact, gameVisible),
  });
  const overlayView = (): OverlayView => ({ state: st(), batch, savedAt: app.store.getState().lastSavedAt, hotkey: st().buddy.hotkey, relay: relayAck });
  const pushBuddy = (force = false) => {
    const v = buddyView(st()), sig = JSON.stringify(v);
    if (!force && sig === lastBuddy) return;
    lastBuddy = sig;
    bus.send('buddy', 'view', v);
  };
  const pushOverlay = (now = false) => {
    /* 0.22.0: změna dávky snímků (počet Ke kontrole) jde i oknu widgetů */
    pushWidgets();
    if (!overlayKnown) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    if (now || pushMs <= 0) { bus.send('overlay', 'state', overlayView()); return; }
    pushTimer = setTimeout(() => { pushTimer = null; bus.send('overlay', 'state', overlayView()); }, pushMs);
  };
  /* 0.22.0: okno widgetů dostává stav s větším odstupem (jen zobrazení, nic se v něm nepíše) */
  const widgetView = (): WidgetView => ({
    state: st(), pending: { stash: batch.shots.length, loot: !!batch.loot, progress: !!batch.progress }, game: gameKnown ? gameRunning : null, calm: calm(),
  });
  const pushWidgets = (now = false) => {
    if (!widgetsKnown) return;
    if (widgetsTimer) clearTimeout(widgetsTimer);
    widgetsTimer = null;
    if (now || pushMs <= 0) { bus.send('widgets', 'state', widgetView()); return; }
    widgetsTimer = setTimeout(() => { widgetsTimer = null; bus.send('widgets', 'state', widgetView()); }, widgetPushMs(pushMs, calm()));
  };
  /* Úpravy widgetů jsou použití UI stejně jako otevřený overlay (zvuky, bubliny) */
  const ui = (): UiActivity => ({ overlayOpen: overlayOpen || widgetsEditing, appFocused: appFocused() });
  /* Stav jde buddymu, overlayi (když existuje) a místním posluchačům hlavního okna (kompakt, průvodce). */
  const say = (anim: OpsAnim, l: LineRef | null = null, solicited = true) => {
    const s: BuddyStatus = { anim, line: l, sound: SOUND_OF[anim] ?? (l ? 'beep' : null), solicited, ui: ui() };
    bus.send('buddy', 'status', s);
    if (overlayKnown) bus.send('overlay', 'status', s);
    statusListeners.forEach(f => f(s));
  };
  const status = say;
  /* 0.20.1: tichá emoce automatického snímku pro buddyho, overlay a Opse v hlavním okně. Jen při běžícím
     automatickém snímání (zapnuté, bez pozastavení a bez hlavního vypínače napojení na hru). Žádný zvuk ani hláška:
     stav (status) se neposílá, takže hlavní okno ani overlay nic nepřehrají. */
  const emote = (anim: AutoEmote, id: number) => {
    if (!autoActive(st())) return;
    /* 0.23.0: režim nízké zátěže při hře v popředí: emoce stojí */
    if (calm()) return;
    const m: EmoteMsg = { anim, id };
    bus.send('buddy', 'emote', m);
    if (overlayKnown) bus.send('overlay', 'emote', m);
    emoteListeners.forEach(f => f(m));
  };
  /* Začátek automatického snímku: scan jednou za snímek (opakování téhož čísla nic nedělá). */
  const emoteStart = (id: number) => { if (id === emoteCur) return; emoteCur = id; emote('scan', id); };
  /* Výsledná emoce jen jednou za snímek a jen pro poslední začatý snímek (zastaralý výsledek se zahodí). */
  const emoteEnd = (id: number, anim: AutoEmote | null) => {
    if (!anim || id !== emoteCur || id === emoteDone) return;
    emoteDone = id;
    emote(anim, id);
  };
  /* Text hlášky pro hlášení v hlavním okně (podle povahy a jazyka). */
  const text = (l: LineRef) => sayLine(l, st().opsPrefs.personality, getLang());
  /* Okno buddyho zavřít až po odchodu (dismiss); bez zpoždění v testech. */
  let closing = 0, dismissing = false;
  const closeBuddy = async () => {
    if (dismissMs > 0) {
      const id = ++closing;
      dismissing = true;
      bus.send('buddy', 'status', { anim: 'dismiss', line: null, sound: null, solicited: false, ui: ui() } satisfies BuddyStatus);
      await new Promise(r => setTimeout(r, dismissMs));
      if (id !== closing) return;
      dismissing = false;
    }
    buddyShown = false;
    await syncWidgetsWindow();
    await native.buddyClose();
  };
  const openBuddy = async () => {
    closing++;
    /* znovu otevřen během odchodu: okno ještě existuje, Ops se musí vrátit příchodem */
    if (dismissing) { dismissing = false; bus.send('buddy', 'status', { anim: 'appear', line: null, sound: null, solicited: false, ui: ui() } satisfies BuddyStatus); }
    await native.buddyOpen();
    buddyShown = true;
    await syncWidgetsWindow();
  };
  /* 0.22.0: okno widgetů je otevřené, právě když jsou widgety zapnuté a Ops je vidět (volá se z fronty run) */
  async function syncWidgetsWindow() {
    const want = buddyShown && widgetsOn(st());
    if (want === widgetsApplied) return;
    widgetsApplied = want;
    if (want) await native.widgetsOpen().catch(() => { widgetsApplied = false; });
    else { widgetsKnown = false; widgetsEditing = false; await native.widgetsClose().catch(() => undefined); }
  }
  /* Zkratky widgetů: jen se zapnutými widgety; nepřijatá zkratka se ohlásí (uložená zůstane, Nastavení ji ukáže). */
  function syncWidgetKeys(s: AppState) {
    const on = widgetsOn(s), next = { edit: on ? s.opsPrefs.widgets.editKey : '', hide: on ? s.opsPrefs.widgets.hideKey : '' };
    for (const slot of ['edit', 'hide'] as const) {
      if (next[slot] === appliedKeys[slot]) continue;
      appliedKeys = { ...appliedKeys, [slot]: next[slot] };
      const accel = next[slot];
      run(() => native.setHotkey(accel, slot).catch(() => { if (accel) app.notify(t('wg.hotkeyLost'), 'warning'); }));
    }
  }

  /* 0.23.0: zkratka polní konzole: se zapnutým Opsem a bez hlavního vypínače napojení na hru */
  function syncConsoleKey(s: AppState) {
    const next = s.buddy.enabled && !s.gameLink.off ? s.opsPrefs.consoleKey : '';
    if (next === appliedConsole) return;
    appliedConsole = next;
    run(() => native.setHotkey(next, 'console').catch(() => { if (next) app.notify(t('ops.hotkey.lost'), 'warning'); }));
  }

  /* ----- přepínač a okna ----- */
  /* 0.20.0: automatické snímání a hlídání hry. Hlídací smyčka v Rustu běží, když je zapnuté automatické zobrazení
     buddyho NEBO automatické snímání (jedna smyčka pro obojí). 0.22.1: NEBO propouštění kliků buddyho do hry (smyčka
     podle okna v popředí přepíná, jestli buddy propouští myš; jen čtení okna v popředí a názvů procesů). */
  const autoKey = (s: AppState) => { const on = autoActive(s); return on ? 'on:' + screenBits(s.autoCapture.screens) : 'off'; };
  function syncAuto(s: AppState) {
    const key = autoKey(s), watch = s.buddy.autoOpen || autoActive(s) || s.opsPrefs.passClicks, bits = screenBits(s.autoCapture.screens);
    if (key !== appliedAuto) {
      appliedAuto = key;
      const on = key !== 'off';
      run(() => native.autoCapture(on, on ? bits : 0));
    }
    if (watch !== appliedWatch) { appliedWatch = watch; run(() => native.watch(watch)); }
    if (s.opsPrefs.passClicks !== appliedPass) { const pass = s.opsPrefs.passClicks; appliedPass = pass; run(() => native.passThrough(pass)); }
  }
  function syncNative(s: AppState) {
    const b = s.buddy;
    if (b.enabled !== applied.enabled) {
      applied = { enabled: b.enabled, autoOpen: b.autoOpen };
      appliedHotkey = b.hotkey;
      if (b.enabled) {
        const hotkey = b.hotkey, auto = b.autoOpen;
        /* Rust po zapnutí nesnímá ani nehlídá; posílá se jen zapnuté (propouštění kliků vždy) */
        appliedAuto = 'off'; appliedWatch = false; appliedPass = null;
        run(async () => {
          await native.enable(true);
          if (hotkey) await native.setHotkey(hotkey).catch(() => app.notify(t('ops.hotkey.lost'), 'warning'));
          if (!auto && !buddyHidden) await openBuddy();
        });
        syncAuto(s);
        syncWidgetKeys(s);
        appliedConsole = '';
        syncConsoleKey(s);
      } else {
        appliedAuto = 'off'; appliedWatch = false; appliedPass = null;
        batch = emptyBatch();
        overlayKnown = false;
        /* Rust při vypnutí zruší všechna okna i zkratky */
        widgetsKnown = false; widgetsApplied = false; buddyShown = false; widgetsEditing = false; appliedKeys = { edit: '', hide: '' };
        appliedConsole = '';
        setHidden(false);
        run(() => native.enable(false));
      }
      return;
    }
    if (b.enabled && b.autoOpen !== applied.autoOpen) {
      applied.autoOpen = b.autoOpen;
      const auto = b.autoOpen;
      syncAuto(s);
      run(async () => {
        if (!auto) { if (!buddyHidden) await openBuddy(); }
        else if (!gameVisible) await closeBuddy();
      });
    }
    if (b.enabled) syncAuto(s);
    if (b.enabled) { syncWidgetKeys(s); syncConsoleKey(s); run(syncWidgetsWindow); }
    /* zkratku změnil stav (hlavní vypínač napojení na hru a jeho obnovení), ne Nastavení přes setHotkey */
    if (b.enabled && b.hotkey !== appliedHotkey) {
      const next = b.hotkey;
      appliedHotkey = next;
      run(() => native.setHotkey(next).catch(() => { if (next) app.notify(t('ops.hotkey.lost'), 'warning'); }));
    }
  }

  /* ----- viditelnost buddyho z oznamovací oblasti (0.9.0) ----- */
  function setHidden(v: boolean) { if (buddyHidden === v) return; buddyHidden = v; visListeners.forEach(f => f()); }
  /* Zobrazí nebo skryje postavičku buddyho; přepínač v Nastavení, zkratka ani snímek se nemění. */
  function setBuddyVisible(visible: boolean) {
    const b = st().buddy;
    if (!b.enabled) return;
    setHidden(!visible);
    run(() => (!visible ? closeBuddy() : !b.autoOpen || gameVisible ? openBuddy() : Promise.resolve()));
  }
  const onVisibility = (f: () => void) => { visListeners.add(f); return () => { visListeners.delete(f); }; };

  /* ----- snímek z tlačítka v okně aplikace (0.9.0) ----- */
  /* Stejná cesta jako zkratka (Rust snímá monitor okna v popředí; kompaktní okno je ze snímku vynechané).
     Vrací false, když buddy není zapnutý nebo snímání není k dispozici. */
  async function captureFromApp(): Promise<boolean> {
    /* 0.20.0: hlavní vypínač napojení na hru vypne i snímek z tlačítka */
    if (!st().buddy.enabled || st().gameLink.off || !native.available) return false;
    appCaptureAt = now();
    try { await run(() => native.captureNow()); return true; }
    catch { appCaptureAt = 0; return false; }
  }
  /* Výsledek snímku z okna: přečtený snímek otevře revizi v overlayi, prázdný nebo neúspěšný se ohlásí v okně. */
  function afterAppCapture(result: 'empty' | 'read' | 'loot' | 'progress' | 'failed', reason: '' | 'noInventory' | 'otherScreen' = '') {
    if (!appCaptureAt || now() - appCaptureAt > APP_CAPTURE_MS) { appCaptureAt = 0; return; }
    appCaptureAt = 0;
    if (result === 'read' || result === 'loot' || result === 'progress') { void run(() => native.overlayOpen('scan')); return; }
    if (result === 'failed') app.notify(text(line('scan.failed')), 'danger');
    else app.notify(text(line(reason === 'otherScreen' ? 'scan.otherScreen' : 'scan.nothing')), 'warning');
  }

  /* ----- zkratka (volá ji Nastavení): uloží se jen ta, kterou systém přijal ----- */
  async function setHotkey(accel: string): Promise<string | null> {
    if (accel && st().gameLink.off) return 'hotkey:off';
    try {
      await run(async () => undefined);
      await native.setHotkey(accel);
      appliedHotkey = accel;
      app.actions.setBuddy({ hotkey: accel });
      return null;
    } catch (e) {
      const code = String((e as Error)?.message || e);
      return /^hotkey:(invalid|taken|off)$/.test(code) ? code : 'hotkey:taken';
    }
  }

  /* ----- 0.22.0: zkratky widgetů (volá je Nastavení): uloží se jen zkratka, kterou systém přijal ----- */
  async function setWidgetKey(slot: 'edit' | 'hide', accel: string): Promise<string | null> {
    const s = st();
    if (accel && s.gameLink.off) return 'hotkey:off';
    if (accel && (accel === s.buddy.hotkey || accel === s.opsPrefs.widgets[slot === 'edit' ? 'hideKey' : 'editKey'])) return 'hotkey:taken';
    if (!widgetsOn(s)) { app.actions.setWidgets({ [slot + 'Key']: accel }); return null; }
    try {
      await run(async () => undefined);
      await native.setHotkey(accel, slot);
      appliedKeys = { ...appliedKeys, [slot]: accel };
      app.actions.setWidgets({ [slot + 'Key']: accel });
      return null;
    } catch (e) {
      const code = String((e as Error)?.message || e);
      return /^hotkey:(invalid|taken|off)$/.test(code) ? code : 'hotkey:taken';
    }
  }

  /* ----- 0.23.0: zkratka polní konzole (volá ji Nastavení): uloží se jen zkratka, kterou systém přijal ----- */
  async function setConsoleKey(accel: string): Promise<string | null> {
    const s = st();
    if (accel && s.gameLink.off) return 'hotkey:off';
    if (accel && (accel === s.buddy.hotkey || accel === s.opsPrefs.widgets.editKey || accel === s.opsPrefs.widgets.hideKey)) return 'hotkey:taken';
    if (!s.buddy.enabled) { app.actions.setConsoleKey(accel); return null; }
    try {
      await run(async () => undefined);
      await native.setHotkey(accel, 'console');
      appliedConsole = accel;
      app.actions.setConsoleKey(accel);
      return null;
    } catch (e) {
      const code = String((e as Error)?.message || e);
      return /^hotkey:(invalid|taken|off)$/.test(code) ? code : 'hotkey:taken';
    }
  }
  /* 0.23.0: panel Zátěž aplikace: kolik oken widgetů hub otevřel a jak často jim posílá stav */
  const perfInfo = (): PerfInfo => ({ widgetWindows: widgetsApplied ? 1 : 0, widgetPushMs: widgetPushMs(pushMs, calm()), calm: calm(), lowImpact: st().opsPrefs.lowImpact });
  const onFront = (f: (front: boolean) => void) => { frontListeners.add(f); return () => { frontListeners.delete(f); }; };

  /* ----- snímek ----- */
  /* Zahodí jen stránky stashe; loot po raidu zůstane. */
  const lastOf = (b: BatchView): BatchView['last'] => (b.progress ? 'progress' : b.loot ? 'loot' : b.shots.length ? 'stash' : null);
  function clearBatch() { batch = { ...batch, shots: [], emptyAt: 0, rejected: '', failed: '' }; batch.last = batch.last === 'stash' ? lastOf(batch) : batch.last; }
  function clearLoot() { batch = { ...batch, loot: null }; batch.last = batch.last === 'loot' ? lastOf(batch) : batch.last; }
  function clearProgress() { batch = { ...batch, progress: null }; batch.last = batch.last === 'progress' ? lastOf(batch) : batch.last; }
  const matchCtx = (s: AppState) => matchContext(getMaterials(s).map(m => m.name), [...new Set(Object.values(s.items).map(x => x.name))]);

  /* Přečte snímek a zahodí obrazová data. Nic nezapisuje do stavu ani do úložiště. */
  /* silent (0.20.0, automatický snímek): bez animace, hlášky a zvuku Opse (hra je v popředí) */
  function handleCapture(img: RgbaImage, silent = false): 'empty' | 'read' | 'loot' | 'progress' {
    return ingest(readCapture(img), silent);
  }
  function ingest(r: ReturnType<typeof readCapture>, silent: boolean): 'empty' | 'read' | 'loot' | 'progress' {
    const status = silent ? () => undefined : say;
    const auto = silent ? { auto: true as const } : {};
    if (r.kind === 'progress') {
      batch = { ...batch, progress: { id: nextShot++, at: now(), read: r.progress, ...auto }, last: 'progress', emptyAt: 0, rejected: '', failed: '' };
      const p = proposeProgress(r.progress, st(), getLang());
      const what = t(`progress.screen.${p.kind === 'stations' ? (p.source === 'overview' ? 'workshop' : 'station') : p.kind}` as Key);
      status(proposalChanges(p) ? 'inspect' : 'talk', line(proposalChanges(p) ? 'progress.read' : 'progress.same', { what }));
      pushOverlay(true);
      return 'progress';
    }
    if (r.kind === 'empty') {
      batch = { ...batch, emptyAt: now(), rejected: r.reason, failed: '' };
      status('shrug', line(r.reason === 'otherScreen' ? 'scan.otherScreen' : 'scan.nothing'));
      pushOverlay(true);
      return 'empty';
    }
    const s = st();
    if (r.screen === 'loot') {
      const sig = lootSignature(r.read);
      batch = { ...batch, loot: { id: nextShot++, at: now(), read: r.read, sig, ...auto }, last: 'loot', emptyAt: 0, rejected: '', failed: '' };
      const a = analyzeLoot(r.read, s.vision.learned, matchCtx(s));
      if (raidWithSig(s, sig)) status('annoyed', line('loot.dup'));
      else if (a.empty) status('shrug', line('loot.empty'));
      else status('inspect', line('loot.found', { count: a.groups.length }));
      pushOverlay(true);
      return 'loot';
    }
    const shots = [...batch.shots, { id: nextShot++, at: now(), read: r.read, ...auto }].slice(-BATCH_MAX);
    batch = { ...batch, shots, last: 'stash', emptyAt: 0, rejected: '', failed: '' };
    const mats = getMaterials(s).map(m => m.name);
    const a = analyzeShots(shots.map(x => x.read), s.vision.learned, matchContext(mats, [...new Set(Object.values(s.items).map(x => x.name))]));
    const check = a.groups.filter(g => g.match.status !== 'known' || !g.countSure).length;
    if (check) status('thinking', line('scan.check', { count: check, pages: shots.length }));
    else status('talk', line('scan.read', { count: a.groups.length, pages: shots.length }));
    pushOverlay(true);
    return 'read';
  }

  /* ----- 0.20.0: automatický snímek obrazovky mimo raid ----- */
  /* Bez animace, hlášky a zvuku (hra je v popředí). Loadout a výsledek raidu jdou do průběhu raidu a automatického
     zápisu; ostatní obrazovky do stejné dávky jako snímek ze zkratky a do fronty „Ke kontrole“. Obrazová data se po
     přečtení zahodí, nic se neukládá. */
  /* 0.20.1: id = číslo snímku z Rustu; bez něj (testy, prohlížeč) vlastní záporné. Začátek zahraje scan, výsledek
     scan-ok (zapsáno) nebo scan-unsure (ke kontrole), viz core/opsEmote.ts. */
  async function handleAutoCapture(img: RgbaImage, screen: RustScreen, id = --localShot): Promise<AutoOutcome> {
    if (!autoActive(st())) return 'off';
    emoteStart(id);
    const r = await autoRead(img, screen);
    emoteEnd(id, emoteFor(r.outcome, r.review));
    return r.outcome;
  }
  /* Přečte automatický snímek a zapíše, co jde; review = kolik údajů šlo do fronty „Ke kontrole“. */
  async function autoRead(img: RgbaImage, screen: RustScreen): Promise<{ outcome: AutoOutcome; review: number }> {
    const s = st();
    const r = readAutoCapture(img, screen);
    const at = now();
    if (r.kind === 'empty') return { outcome: 'empty', review: 0 };
    if (r.kind === 'loadout') {
      app.actions.lifeEvent({ type: 'loadout', at, loadout: loadoutSnap(r.loadout, s.vision.learned, matchCtx(s), at) });
      return { outcome: 'loadout', review: 0 };
    }
    if (r.kind === 'result') {
      const loot = r.read ? analyzeLoot(r.read, s.vision.learned, matchCtx(s)) : null;
      const sig = r.read ? lootSignature(r.read) : null;
      if (sig && raidWithSig(s, sig)) return { outcome: 'dup', review: 0 };
      const pair = app.actions.lifeEvent({ type: 'result', at });
      /* 0.24.0: výbava z FINDINGS (zbraně, augment, štít) doplní, co loadout před raidem nezná */
      const gear = r.loadout ? loadoutSnap(r.loadout, s.vision.learned, matchCtx(s), at).fields.filter(f => f.slot !== 'backpack' && f.slot !== 'quickUse') : null;
      const done = await app.actions.autoRaid({ at, outcome: r.outcome, loot, sig, gear }, pair);
      pushOverlay(true);
      if (!done) return { outcome: 'dup', review: 0 };
      return { outcome: 'result', review: st().autoLog.find(w => w.id === done.writeId)?.review ?? 0 };
    }
    const res = ingest(r.result, true);
    if (res === 'empty') return { outcome: 'empty', review: 0 };
    app.actions.reviewAddScreen(screen);
    return { outcome: 'screen', review: 1 };
  }
  async function takeAutoCapture(p: { id: number; width: number; height: number }, screen: RustScreen) {
    let buf: ArrayBuffer | null = null;
    /* scan už při vyzvednutí snímku (čtení může chvíli trvat); nezdar = scan sám dohraje do klidu */
    if (autoActive(st())) emoteStart(p.id);
    try { buf = await native.captureTake(p.id); } catch { return; }
    let data: Uint8Array | null = new Uint8Array(buf);
    buf = null;
    try { await handleAutoCapture({ width: p.width, height: p.height, data }, screen, p.id); }
    finally { data = null; }
  }

  async function takeCapture(p: { id: number; width: number; height: number }) {
    let buf: ArrayBuffer | null = null;
    status('thinking');
    try { buf = await native.captureTake(p.id); } catch { status('error', line('scan.failed')); afterAppCapture('failed'); return; }
    let data: Uint8Array | null = new Uint8Array(buf);
    buf = null;
    try { const r = handleCapture({ width: p.width, height: p.height, data }); afterAppCapture(r, batch.rejected); }
    finally { data = null; }
  }

  async function importShots(input: VisionApply): Promise<VisionSummary | null> {
    status('carry');
    /* 0.21.0: původ hodnot: jen automatické stránky = automatické snímání, jinak zkratka */
    const via = batch.shots.length > 0 && batch.shots.every(x => x.auto) ? 'auto-capture' : 'screenshot-hotkey';
    const sum = await app.actions.importFromScreens(input, via);
    if (sum) { clearBatch(); status('success', line('scan.written', { count: sum.materials + sum.items })); }
    else status('error', null);
    bus.send('overlay', 'imported', { summary: sum });
    pushOverlay(true);
    return sum;
  }

  /* Loot po raidu: zapíše se jen právě zobrazený snímek FINDINGS (id), s jeho vlastním podpisem z hubu. */
  async function importLoot(shotId: number, input: RaidLootInput): Promise<RaidLootResult> {
    const shot = batch.loot;
    let res: RaidLootResult;
    if (!shot || shot.id !== shotId) res = { ok: false, reason: 'empty' };
    else {
      status('carry');
      res = await app.actions.importRaidLoot(input, shot.sig, shot.auto ? 'auto-capture' : 'screenshot-hotkey');
      if (res.ok) {
        if (batch.loot?.id === shotId) clearLoot();
        /* 0.15.0: při aktivním plánu shrne Ops vyhodnocení plánu (jen čtení), jinak potvrdí zápis */
        const s = st(), plan = s.raidPlan, raidId = res.raidId, raid = s.raids.find(r => r.id === raidId);
        status('success', plan && raid ? evalLine(evaluateRaid(s, plan, raid, s.settings.lang, dayKey(now()))) : line('loot.written', { count: res.items.length }));
      }
      else status('error', null);
    }
    bus.send('overlay', 'lootImported', { result: res });
    pushOverlay(true);
    return res;
  }
  /* Postup ze snímku: zapíše se jen právě zobrazený snímek (id) a jen potvrzené hodnoty. */
  async function importProgress(shotId: number, input: ProgressApply): Promise<ProgressSummary | null> {
    let sum: ProgressSummary | null = null;
    if (batch.progress && batch.progress.id === shotId) {
      status('carry');
      sum = await app.actions.importProgress(input, batch.progress.auto ? 'auto-capture' : 'screenshot-hotkey');
      if (sum) { if (batch.progress?.id === shotId) clearProgress(); status('success', line('progress.written', { count: sum.fields })); }
      else status('error', null);
    }
    bus.send('overlay', 'progressImported', { summary: sum });
    pushOverlay(true);
    return sum;
  }

  /* Úprava z modulu overlaye (Profil, Inventář, Dílna, Skill tree). Neznámá operace, pole nebo id se zahodí. */
  const EDIT_PROFILE: readonly ProfileField[] = ['level', 'xp', 'xpNext', 'coins', 'rounds', 'rewardPass'];
  function applyEdit(p: unknown) {
    const o = p as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || !st().buddy.enabled) return;
    const dir = o.dir === 1 ? 1 : o.dir === -1 ? -1 : 0;
    switch (o.op) {
      case 'profile':
        if (EDIT_PROFILE.includes(o.field as ProfileField) && typeof o.value === 'number' && Number.isFinite(o.value)) app.actions.setProfile(o.field as ProfileField, o.value);
        return;
      case 'station':
        /* 0.16.1: Object.hasOwn místo `in` (constructor, toString… nejsou stanice) */
        if (typeof o.id !== 'string' || !Object.hasOwn(st().stations, o.id)) return;
        if (dir === 1) app.actions.levelUp(o.id); else if (dir === -1) app.actions.levelDown(o.id);
        return;
      case 'inv': {
        if (typeof o.name !== 'string' || typeof o.value !== 'number' || !Number.isFinite(o.value)) return;
        const name = o.name;
        if (!Object.hasOwn(st().inventory, name) && !getMaterials(st()).some(m => m.name === name)) return;
        app.actions.invSet(name, o.value);
        return;
      }
      case 'skill':
        if (typeof o.id !== 'string' || !SKILL[o.id]) return;
        if (dir === 1) app.actions.skillAdd(o.id); else if (dir === -1) app.actions.skillRemove(o.id);
        return;
    }
  }

  /* Vstup z okna overlaye: jen očekávané typy, položky se normalizují. */
  function lootInput(p: unknown): { shotId: number; input: RaidLootInput } | null {
    const o = p as { shotId?: unknown; input?: Record<string, unknown> } | null;
    const i = o?.input;
    if (!o || !Number.isFinite(o.shotId) || !i || typeof i !== 'object') return null;
    if (!(i.raidId === null || typeof i.raidId === 'string') || !Array.isArray(i.items)) return null;
    return {
      shotId: Number(o.shotId),
      input: {
        raidId: i.raidId as string | null, map: typeof i.map === 'string' ? i.map : undefined, items: normalizeItems(i.items),
        replace: i.replace === true, toInventory: i.toInventory === true, gearChecked: i.gearChecked === true,
      },
    };
  }

  /* ----- start ----- */
  function start() {
    const onState = (s: AppState) => {
      syncNative(s);
      if (!s.buddy.enabled) return;
      pushBuddy();
      pushOverlay();
      pushWidgets();
      if (prevLevel !== null && s.profile.level !== prevLevel) {
        const ev: LevelEvent | null = levelEvent(prevLevel, s.profile.level);
        if (ev) { bus.send('buddy', 'event', { ...ev, ui: ui() } satisfies BuddyLevelEvent); eventListeners.forEach(f => f(ev)); }
      }
      prevLevel = s.profile.level;
    };
    /* Nejdřív posluchače (hello, akce oken, události z Rustu), pak teprve stav: nativní volání, která otevírají
       okna, čekají ve frontě na bus.ready(), takže první hello od nového okna už má kdo přijmout (0.8.0).
       0.16.1: každá zpráva jen od okna, které ji smí poslat (odesílatele ověřuje Rust, viz bus.ts);
       události z Rustu jdou přes onNative a z jiného okna je podvrhnout nejde. */
    const fromOverlay = (fn: (p: unknown) => void) => (p: unknown, from: string | null) => { if (from === 'overlay') fn(p); };
    const fromBuddy = (fn: (p: unknown) => void) => (p: unknown, from: string | null) => { if (from === 'buddy') fn(p); };
    offs.push(bus.on('hello', (p, sender) => {
      const from = (p as { from?: string } | null)?.from;
      if (from !== sender) return;
      if (!st().buddy.enabled) return;
      if (from === 'buddy') pushBuddy(true);
      if (from === 'overlay') { overlayKnown = true; pushOverlay(true); }
      if (from === 'widgets' && widgetsOn(st())) { widgetsKnown = true; pushWidgets(true); }
    }));
    /* 0.22.0: úprava z Úprav widgetů (zaškrtnutí cíle úkolu, „mám“ v seznamu); jen akce z WIDGET_ACTIONS */
    offs.push(bus.on('widgetAction', (p, from) => {
      if (from !== 'widgets' || !widgetsOn(st())) return;
      applyWidgetAction(app, p);
      pushWidgets(true);
    }));
    offs.push(bus.onNative('widgets-mode', p => { widgetsEditing = p === true; bus.send('buddy', 'ui', ui()); }));
    offs.push(bus.on('import', fromOverlay(p => { const input = (p as { input?: VisionApply } | null)?.input; if (input && Array.isArray(input.rows)) void importShots(input); })));
    offs.push(bus.on('questSet', fromOverlay(p => {
      const q = p as { id?: unknown; done?: unknown } | null;
      if (q && typeof q.id === 'string' && typeof q.done === 'boolean') app.actions.questSet(q.id, q.done);
    })));
    /* 0.14.0: zaškrtnutí „mám“ v záložce Raid; jen orientační, inventář se nemění */
    offs.push(bus.on('raidFound', fromOverlay(p => {
      const o = p as { mat?: unknown; on?: unknown } | null;
      if (o && typeof o.mat === 'string' && typeof o.on === 'boolean') app.actions.setRaidFound(o.mat, o.on);
    })));
    /* 0.15.0: „Uložit do deníku“ z vyhodnocení v overlayi: aktivní plán k záznamu raidu (inventář se nemění) */
    offs.push(bus.on('raidPlanSave', fromOverlay(p => {
      const id = (p as { raidId?: unknown } | null)?.raidId;
      if (typeof id === 'string' && id.length <= 24 && st().raids.some(r => r.id === id)) app.actions.attachRaidPlan(id);
    })));
    /* 0.10.1: rychlé úpravy z modulů overlaye; jen známé operace a hodnoty, provede je stejná akce store */
    offs.push(bus.on('edit', fromOverlay(p => applyEdit(p))));
    /* 0.16.0: akce plného modulu v overlayi. Hlavní okno je jediný zapisovatel: jen akce ze seznamu, ověřené
       argumenty, stejná akce store. Stav se vrátí vždy (i bez změny), s potvrzením, aby overlay zahodil svou kopii. */
    offs.push(bus.on('action', fromOverlay(p => {
      if (!st().buddy.enabled) return;
      const r = applyRelay(app, p);
      if (!r) return;
      relayAck = r.ack;
      pushOverlay();
    })));
    offs.push(bus.on('opacity', fromOverlay(p => { const v = Number((p as { value?: unknown } | null)?.value); if (Number.isFinite(v)) app.actions.setBuddy({ opacity: v }); })));
    offs.push(bus.on('batchClear', fromOverlay(() => { clearBatch(); pushOverlay(true); })));
    offs.push(bus.on('lootImport', fromOverlay(p => { const x = lootInput(p); if (x) void importLoot(x.shotId, x.input); })));
    offs.push(bus.on('lootClear', fromOverlay(() => { clearLoot(); pushOverlay(true); })));
    offs.push(bus.on('progressImport', fromOverlay(p => {
      const o = p as { shotId?: unknown; input?: unknown } | null;
      const input = normalizeProgressApply(o?.input);
      if (o && Number.isFinite(o.shotId) && input) void importProgress(Number(o.shotId), input);
    })));
    offs.push(bus.on('progressClear', fromOverlay(() => { clearProgress(); pushOverlay(true); })));
    offs.push(bus.on('moved', fromBuddy(p => {
      const m = p as { monitor?: unknown; x?: unknown; y?: unknown } | null;
      if (m && typeof m.monitor === 'string' && m.monitor.length <= 200 && Number.isFinite(m.x) && Number.isFinite(m.y)) app.actions.setBuddyPosition(m.monitor, Number(m.x), Number(m.y));
    })));
    offs.push(bus.on('open', fromOverlay(p => {
      const route = (p as { route?: unknown } | null)?.route;
      if (typeof route === 'string' && route.length <= 60 && /^[a-z]+(\/[a-z-]+)?$/.test(route)) { navigate?.(route); void native.mainFocus(); }
    })));
    /* události z Rustu (jen onNative) */
    offs.push(bus.onNative('capture-start', () => status('scanning')));
    /* overlay otevřený/zavřený */
    offs.push(bus.onNative('overlay', p => { overlayOpen = p === true; bus.send('buddy', 'ui', ui()); }));
    offs.push(bus.onNative('capture-ready', p => {
      const c = p as { id: number; width: number; height: number; auto?: unknown } | null;
      if (!c || !Number.isSafeInteger(c.id) || !Number.isSafeInteger(c.width) || !Number.isSafeInteger(c.height)) return;
      /* 0.20.0: automatický snímek nese obrazovku podle nadpisu */
      if (c.auto !== undefined) { if (isRustScreen(c.auto)) void takeAutoCapture(c, c.auto); return; }
      void takeCapture(c);
    }));
    /* 0.20.0: obrazovka v pásu s nadpisy se změnila (null = žádná známá, např. v raidu) */
    offs.push(bus.onNative('auto-screen', p => {
      /* 0.22.1: inventář v raidu jen posune průběh raidu (žádný snímek, žádná obrazovka) */
      if (p === IN_RAID_SIGNAL && autoActive(st())) { app.actions.lifeEvent({ type: 'inRaid', at: now() }); return; }
      if ((p === null || isRustScreen(p)) && autoActive(st())) app.actions.lifeEvent({ type: 'screen', at: now(), screen: p });
    }));
    offs.push(bus.onNative('capture-failed', () => { batch = { ...batch, failed: 'capture' }; status('error', line('scan.failed')); pushOverlay(true); afterAppCapture('failed'); }));
    offs.push(bus.onNative('game', p => {
      gameRunning = p === true;
      gameKnown = true;
      if (st().buddy.enabled) pushBuddy();
    }));
    offs.push(bus.onNative('game-visible', p => {
      const was = gameVisible;
      gameVisible = p === true;
      /* 0.23.0: režim nízké zátěže se zapne nebo vypne s hrou v popředí (buddy, widgety, rádce) */
      if (was !== gameVisible) {
        frontListeners.forEach(f => f(gameVisible));
        if (st().buddy.enabled) pushBuddy();
        pushWidgets();
      }
      const b = st().buddy;
      if (!b.enabled || !b.autoOpen || buddyHidden) return;
      run(() => (gameVisible ? openBuddy() : closeBuddy()));
    }));

    queue = queue.then(() => bus.ready());
    let last: AppState | null = null;
    offs.push(app.store.subscribe(x => { if (x.ready && x.state !== last) { last = x.state; onState(x.state); } }));
    if (app.store.getState().ready) { last = st(); onState(st()); }
  }

  function stop() { offs.splice(0).forEach(f => f()); if (pushTimer) clearTimeout(pushTimer); if (widgetsTimer) clearTimeout(widgetsTimer); }

  const onStatus = (f: (s: BuddyStatus) => void) => { statusListeners.add(f); return () => { statusListeners.delete(f); }; };
  const onLevel = (f: (e: LevelEvent) => void) => { eventListeners.add(f); return () => { eventListeners.delete(f); }; };
  const onEmote = (f: (e: EmoteMsg) => void) => { emoteListeners.add(f); return () => { emoteListeners.delete(f); }; };

  return {
    start, stop, setHotkey, setWidgetKey, setConsoleKey, perfInfo, onFront, widgetsEditing: () => widgetsEditing, handleCapture, handleAutoCapture, importShots, importLoot, importProgress, batch: () => batch, idle: () => queue,
    captureFromApp, setBuddyVisible, buddyVisible: () => !buddyHidden, onVisibility, onStatus, onLevel, onEmote, ui,
  };
}
export type OpsHub = ReturnType<typeof createOpsHub>;
