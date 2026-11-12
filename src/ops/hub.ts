/* Hub buddyho v hlavním okně (milník 5). Jediné místo, které mění stav: okna buddy a overlay dostávají kopii
   a posílají sem pojmenované akce, které projdou stejnými akcemi store jako v hlavním okně.
   - Přepínač „Buddy a zkratka“ promítá do Rustu: vypnuto = žádné okno, žádná zkratka, žádné hlídání hry.
   - Snímek ze zkratky se tu přečte (readCapture) a obrazová data se hned zahodí; drží se jen ScreenRead
     v paměti. Prázdný snímek (bez inventáře) ani jiná obrazovka nic nezapíše.
   - 0.8.1: STASH (stránky stashe) a loot po raidu (FINDINGS) jsou oddělené: stránky jdou do dávky stashe,
     snímek FINDINGS do samostatného místa pro loot (novější nahradí starší). Nikdy se nemíchají.
   - 0.10.1: obrazovka postupu (profil, dílna, úkol, skill tree) jde do vlastního místa (novější nahradí starší);
     drží se jen přečtená čísla a názvy, zápis až po potvrzení v revizi (importProgress).
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

export interface Shot { id: number; at: number; read: ScreenRead }
/* Snímek FINDINGS po raidu: jen BACKPACK a QUICK USE, sig = podpis proti opakovanému zápisu. */
export interface LootShot extends Shot { sig: string }
/* Snímek obrazovky postupu (0.10.1). */
export interface ProgressShot { id: number; at: number; read: ProgressRead }
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
}
export interface OverlayView { state: AppState; batch: BatchView; savedAt: number; hotkey: string }
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

  /* Nativní volání jdou za sebou, aby se zapnutí a vypnutí nepředběhla. */
  let queue: Promise<unknown> = Promise.resolve();
  const run = (fn: () => Promise<unknown>) => { queue = queue.then(fn).catch(() => undefined); return queue; };

  /* ----- kopie stavu pro okna ----- */
  const buddyView = (s: AppState): BuddyView => ({
    lang: s.settings.lang, level: s.profile.level, outfit: resolveOutfit(s.profile.level, s.buddy), scale: s.buddy.scale, paint: s.games.paint,
    positions: s.buddy.positions, monitor: s.buddy.monitor, hotkey: s.buddy.hotkey,
    personality: s.opsPrefs.personality, sound: s.opsPrefs.sound, volume: s.opsPrefs.volume, dialogs: s.opsPrefs.dialogs,
    game: gameKnown ? gameRunning : null,
  });
  const overlayView = (): OverlayView => ({ state: st(), batch, savedAt: app.store.getState().lastSavedAt, hotkey: st().buddy.hotkey });
  const pushBuddy = (force = false) => {
    const v = buddyView(st()), sig = JSON.stringify(v);
    if (!force && sig === lastBuddy) return;
    lastBuddy = sig;
    bus.send('buddy', 'view', v);
  };
  const pushOverlay = (now = false) => {
    if (!overlayKnown) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    if (now || pushMs <= 0) { bus.send('overlay', 'state', overlayView()); return; }
    pushTimer = setTimeout(() => { pushTimer = null; bus.send('overlay', 'state', overlayView()); }, pushMs);
  };
  const ui = (): UiActivity => ({ overlayOpen, appFocused: appFocused() });
  /* Stav jde buddymu, overlayi (když existuje) a místním posluchačům hlavního okna (kompakt, průvodce). */
  const status = (anim: OpsAnim, l: LineRef | null = null, solicited = true) => {
    const s: BuddyStatus = { anim, line: l, sound: SOUND_OF[anim] ?? (l ? 'beep' : null), solicited, ui: ui() };
    bus.send('buddy', 'status', s);
    if (overlayKnown) bus.send('overlay', 'status', s);
    statusListeners.forEach(f => f(s));
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
    await native.buddyClose();
  };
  const openBuddy = async () => {
    closing++;
    /* znovu otevřen během odchodu: okno ještě existuje, Ops se musí vrátit příchodem */
    if (dismissing) { dismissing = false; bus.send('buddy', 'status', { anim: 'appear', line: null, sound: null, solicited: false, ui: ui() } satisfies BuddyStatus); }
    await native.buddyOpen();
  };

  /* ----- přepínač a okna ----- */
  function syncNative(s: AppState) {
    const b = s.buddy;
    if (b.enabled !== applied.enabled) {
      applied = { enabled: b.enabled, autoOpen: b.autoOpen };
      if (b.enabled) {
        const hotkey = b.hotkey, auto = b.autoOpen;
        run(async () => {
          await native.enable(true);
          if (hotkey) await native.setHotkey(hotkey).catch(() => app.notify(t('ops.hotkey.lost'), 'warning'));
          if (auto) await native.watch(true); else if (!buddyHidden) await openBuddy();
        });
      } else {
        batch = emptyBatch();
        overlayKnown = false;
        setHidden(false);
        run(() => native.enable(false));
      }
      return;
    }
    if (b.enabled && b.autoOpen !== applied.autoOpen) {
      applied.autoOpen = b.autoOpen;
      const auto = b.autoOpen;
      run(async () => {
        await native.watch(auto);
        if (!auto) { if (!buddyHidden) await openBuddy(); }
        else if (!gameVisible) await closeBuddy();
      });
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
    if (!st().buddy.enabled || !native.available) return false;
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
    try {
      await run(async () => undefined);
      await native.setHotkey(accel);
      app.actions.setBuddy({ hotkey: accel });
      return null;
    } catch (e) {
      const code = String((e as Error)?.message || e);
      return /^hotkey:(invalid|taken|off)$/.test(code) ? code : 'hotkey:taken';
    }
  }

  /* ----- snímek ----- */
  /* Zahodí jen stránky stashe; loot po raidu zůstane. */
  const lastOf = (b: BatchView): BatchView['last'] => (b.progress ? 'progress' : b.loot ? 'loot' : b.shots.length ? 'stash' : null);
  function clearBatch() { batch = { ...batch, shots: [], emptyAt: 0, rejected: '', failed: '' }; batch.last = batch.last === 'stash' ? lastOf(batch) : batch.last; }
  function clearLoot() { batch = { ...batch, loot: null }; batch.last = batch.last === 'loot' ? lastOf(batch) : batch.last; }
  function clearProgress() { batch = { ...batch, progress: null }; batch.last = batch.last === 'progress' ? lastOf(batch) : batch.last; }
  const matchCtx = (s: AppState) => matchContext(getMaterials(s).map(m => m.name), [...new Set(Object.values(s.items).map(x => x.name))]);

  /* Přečte snímek a zahodí obrazová data. Nic nezapisuje do stavu ani do úložiště. */
  function handleCapture(img: RgbaImage): 'empty' | 'read' | 'loot' | 'progress' {
    const r = readCapture(img);
    if (r.kind === 'progress') {
      batch = { ...batch, progress: { id: nextShot++, at: now(), read: r.progress }, last: 'progress', emptyAt: 0, rejected: '', failed: '' };
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
      batch = { ...batch, loot: { id: nextShot++, at: now(), read: r.read, sig }, last: 'loot', emptyAt: 0, rejected: '', failed: '' };
      const a = analyzeLoot(r.read, s.vision.learned, matchCtx(s));
      if (raidWithSig(s, sig)) status('annoyed', line('loot.dup'));
      else if (a.empty) status('shrug', line('loot.empty'));
      else status('inspect', line('loot.found', { count: a.groups.length }));
      pushOverlay(true);
      return 'loot';
    }
    const shots = [...batch.shots, { id: nextShot++, at: now(), read: r.read }].slice(-BATCH_MAX);
    batch = { ...batch, shots, last: 'stash', emptyAt: 0, rejected: '', failed: '' };
    const mats = getMaterials(s).map(m => m.name);
    const a = analyzeShots(shots.map(x => x.read), s.vision.learned, matchContext(mats, [...new Set(Object.values(s.items).map(x => x.name))]));
    const check = a.groups.filter(g => g.match.status !== 'known' || !g.countSure).length;
    if (check) status('thinking', line('scan.check', { count: check, pages: shots.length }));
    else status('talk', line('scan.read', { count: a.groups.length, pages: shots.length }));
    pushOverlay(true);
    return 'read';
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
    const sum = await app.actions.importFromScreens(input);
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
      res = await app.actions.importRaidLoot(input, shot.sig);
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
      sum = await app.actions.importProgress(input);
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
        if (typeof o.id !== 'string' || !(o.id in st().stations)) return;
        if (dir === 1) app.actions.levelUp(o.id); else if (dir === -1) app.actions.levelDown(o.id);
        return;
      case 'inv': {
        if (typeof o.name !== 'string' || typeof o.value !== 'number' || !Number.isFinite(o.value)) return;
        const name = o.name;
        if (!(name in st().inventory) && !getMaterials(st()).some(m => m.name === name)) return;
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
      if (prevLevel !== null && s.profile.level !== prevLevel) {
        const ev: LevelEvent | null = levelEvent(prevLevel, s.profile.level);
        if (ev) { bus.send('buddy', 'event', { ...ev, ui: ui() } satisfies BuddyLevelEvent); eventListeners.forEach(f => f(ev)); }
      }
      prevLevel = s.profile.level;
    };
    /* Nejdřív posluchače (hello, akce oken, události z Rustu), pak teprve stav: nativní volání, která otevírají
       okna, čekají ve frontě na bus.ready(), takže první hello od nového okna už má kdo přijmout (0.8.0). */
    offs.push(bus.on('hello', p => {
      const from = (p as { from?: string } | null)?.from;
      if (!st().buddy.enabled) return;
      if (from === 'buddy') pushBuddy(true);
      if (from === 'overlay') { overlayKnown = true; pushOverlay(true); }
    }));
    offs.push(bus.on('import', p => { const input = (p as { input?: VisionApply } | null)?.input; if (input && Array.isArray(input.rows)) void importShots(input); }));
    offs.push(bus.on('questSet', p => {
      const q = p as { id?: unknown; done?: unknown } | null;
      if (q && typeof q.id === 'string' && typeof q.done === 'boolean') app.actions.questSet(q.id, q.done);
    }));
    /* 0.14.0: zaškrtnutí „mám“ v záložce Raid; jen orientační, inventář se nemění */
    offs.push(bus.on('raidFound', p => {
      const o = p as { mat?: unknown; on?: unknown } | null;
      if (o && typeof o.mat === 'string' && typeof o.on === 'boolean') app.actions.setRaidFound(o.mat, o.on);
    }));
    /* 0.15.0: „Uložit do deníku“ z vyhodnocení v overlayi: aktivní plán k záznamu raidu (inventář se nemění) */
    offs.push(bus.on('raidPlanSave', p => {
      const id = (p as { raidId?: unknown } | null)?.raidId;
      if (typeof id === 'string' && id.length <= 24 && st().raids.some(r => r.id === id)) app.actions.attachRaidPlan(id);
    }));
    /* 0.10.1: rychlé úpravy z modulů overlaye; jen známé operace a hodnoty, provede je stejná akce store */
    offs.push(bus.on('edit', p => applyEdit(p)));
    offs.push(bus.on('opacity', p => { const v = Number((p as { value?: unknown } | null)?.value); if (Number.isFinite(v)) app.actions.setBuddy({ opacity: v }); }));
    offs.push(bus.on('batchClear', () => { clearBatch(); pushOverlay(true); }));
    offs.push(bus.on('lootImport', p => { const x = lootInput(p); if (x) void importLoot(x.shotId, x.input); }));
    offs.push(bus.on('lootClear', () => { clearLoot(); pushOverlay(true); }));
    offs.push(bus.on('progressImport', p => {
      const o = p as { shotId?: unknown; input?: unknown } | null;
      const input = normalizeProgressApply(o?.input);
      if (o && Number.isFinite(o.shotId) && input) void importProgress(Number(o.shotId), input);
    }));
    offs.push(bus.on('progressClear', () => { clearProgress(); pushOverlay(true); }));
    offs.push(bus.on('moved', p => {
      const m = p as { monitor?: unknown; x?: unknown; y?: unknown } | null;
      if (m && typeof m.monitor === 'string' && Number.isFinite(m.x) && Number.isFinite(m.y)) app.actions.setBuddyPosition(m.monitor, Number(m.x), Number(m.y));
    }));
    offs.push(bus.on('open', p => {
      const route = (p as { route?: unknown } | null)?.route;
      if (typeof route === 'string' && /^[a-z]+(\/[a-z-]+)?$/.test(route)) { navigate?.(route); void native.mainFocus(); }
    }));
    /* události z Rustu */
    offs.push(bus.on('capture-start', () => status('scanning')));
    /* overlay otevřený/zavřený (z Rustu) */
    offs.push(bus.on('overlay', p => { overlayOpen = p === true; bus.send('buddy', 'ui', ui()); }));
    offs.push(bus.on('capture-ready', p => { const c = p as { id: number; width: number; height: number }; if (c && Number.isFinite(c.id)) void takeCapture(c); }));
    offs.push(bus.on('capture-failed', () => { batch = { ...batch, failed: 'capture' }; status('error', line('scan.failed')); pushOverlay(true); afterAppCapture('failed'); }));
    offs.push(bus.on('game', p => {
      gameRunning = p === true;
      gameKnown = true;
      if (st().buddy.enabled) pushBuddy();
    }));
    offs.push(bus.on('game-visible', p => {
      gameVisible = p === true;
      const b = st().buddy;
      if (!b.enabled || !b.autoOpen || buddyHidden) return;
      run(() => (gameVisible ? openBuddy() : closeBuddy()));
    }));

    queue = queue.then(() => bus.ready());
    let last: AppState | null = null;
    offs.push(app.store.subscribe(x => { if (x.ready && x.state !== last) { last = x.state; onState(x.state); } }));
    if (app.store.getState().ready) { last = st(); onState(st()); }
  }

  function stop() { offs.splice(0).forEach(f => f()); if (pushTimer) clearTimeout(pushTimer); }

  const onStatus = (f: (s: BuddyStatus) => void) => { statusListeners.add(f); return () => { statusListeners.delete(f); }; };
  const onLevel = (f: (e: LevelEvent) => void) => { eventListeners.add(f); return () => { eventListeners.delete(f); }; };

  return {
    start, stop, setHotkey, handleCapture, importShots, importLoot, importProgress, batch: () => batch, idle: () => queue,
    captureFromApp, setBuddyVisible, buddyVisible: () => !buddyHidden, onVisibility, onStatus, onLevel, ui,
  };
}
export type OpsHub = ReturnType<typeof createOpsHub>;
