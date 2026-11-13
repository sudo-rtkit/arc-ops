/* Jádro ovládání hlavního okna (0.9.0) bez store, Reactu a Tauri: řadič nad zástupným oknem, takže jde testovat
   v Node. Instance a nativní volání jsou v windowCtl.ts. */
import { closeDecision, rememberClose, setPin, switchMode, withGeometry, type LeftGeometry } from '../core/mainWindow';
import type { CloseAction, MainWindowPrefs, WinRect, WindowMode } from '../core/types';

/* 0.20.0: auto = automatické snímání (true běží, false pozastavené, null vypnuté = bez položky); klik ho pozastaví/obnoví */
export interface TrayMenu { open: string; compact: string; buddyLabel: string; buddy: boolean | null; autoLabel: string; auto: boolean | null; quit: string; tooltip: string }
export interface WinNative {
  available: boolean;
  mode(args: { mode: WindowMode; pin: boolean; full: WinRect | null; fullMax: boolean; compact: WinRect | null }): Promise<LeftGeometry | null>;
  pin(on: boolean): Promise<void>;
  geometry(): Promise<LeftGeometry | null>;
  drag(): Promise<void>;
  minimize(): Promise<void>;
  hide(): Promise<void>;
  show(): Promise<void>;
  ready(): Promise<void>;
  quit(): Promise<void>;
  traySync(menu: TrayMenu): Promise<void>;
}

/* V prohlížeči: žádné okno ani oznamovací oblast. Volání se zaznamenají (E2E je čte přes window.__winTest). */
export function browserWin(log: string[] = []): WinNative {
  const rec = (name: string) => async () => { log.push(name); };
  return {
    available: false,
    mode: async a => { log.push('mode:' + a.mode); return null; },
    pin: async on => { log.push('pin:' + on); },
    geometry: async () => null,
    drag: rec('drag'), minimize: rec('minimize'), hide: rec('hide'), show: rec('show'), ready: rec('ready'), quit: rec('quit'),
    traySync: async m => { log.push('tray:' + (m.buddy === null ? '-' : m.buddy)); },
  };
}

export interface WindowCtlDeps {
  win: WinNative;
  prefs: () => MainWindowPrefs;
  save: (p: MainWindowPrefs) => void;
  flush: () => Promise<void>;
  askClose: (open: boolean) => void;
}

/* Řadič bez Reactu: jde testovat v Node se zástupným oknem. */
export function createWindowCtl({ win, prefs, save, flush, askClose }: WindowCtlDeps) {
  /* nativní přestavby okna jdou za sebou */
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => { const p = queue.then(fn); queue = p.catch(() => undefined); return p; };
  let closing = false;
  /* čas posledního přepnutí režimu: nový pohled pak dá fokus tlačítku přepnutí (jen když okno fokus má) */
  let lastSwitch = 0;

  async function setMode(mode: WindowMode): Promise<void> {
    return run(async () => {
      const p = prefs();
      if (p.mode === mode) return;
      let left: LeftGeometry | null = null;
      try { left = await win.mode({ mode, pin: p.pin, full: p.full, fullMax: p.fullMax, compact: p.compact }); } catch { /* okno zůstane, rozhraní se přepne */ }
      lastSwitch = Date.now();
      save(switchMode(prefs(), mode, left));
    });
  }
  const toggleMode = () => setMode(prefs().mode === 'compact' ? 'full' : 'compact');

  /* Připnutí jen v kompaktu; v plném režimu nic. */
  async function togglePin(): Promise<void> {
    return run(async () => {
      const p = prefs(), next = setPin(p, !p.pin);
      if (next === p) return;
      try { await win.pin(next.pin); } catch { return; }
      save(next);
    });
  }

  async function saveGeometry(): Promise<void> {
    let g: LeftGeometry | null = null;
    try { g = await win.geometry(); } catch { /* bez geometrie zůstane poslední známá */ }
    if (g) save(withGeometry(prefs(), g));
  }

  async function hideToTray(): Promise<void> {
    await run(async () => { await saveGeometry(); await flush(); await win.hide(); });
  }
  async function quit(): Promise<void> {
    if (closing) return;
    closing = true;
    try { await run(async () => { await saveGeometry(); await flush(); await win.quit(); }); }
    finally { closing = false; }
  }

  /* Křížek (vlastní v kompaktu, systémový, Alt+F4): zapamatovaná volba, nebo dialog. fromSystem = okno může být
     minimalizované nebo skryté, pro dialog ho ukázat (akce uživatele, fokus tedy smí převzít). */
  async function requestClose(fromSystem = false): Promise<CloseAction> {
    const d = closeDecision(prefs());
    if (d === 'tray') await hideToTray();
    else if (d === 'quit') await quit();
    else {
      if (fromSystem) { try { await win.show(); } catch { /* okno už je vidět */ } }
      askClose(true);
    }
    return d;
  }

  /* Volba z dialogu: se zapamatováním se uloží (v Nastavení jde změnit), jinak se příště zeptá znovu. */
  async function chooseClose(choice: Exclude<CloseAction, 'ask'>, remember: boolean): Promise<void> {
    askClose(false);
    save(rememberClose(prefs(), choice, remember));
    if (choice === 'tray') await hideToTray(); else await quit();
  }

  return { justSwitched: () => Date.now() - lastSwitch < 1500, setMode, toggleMode, togglePin, requestClose, chooseClose, hideToTray, quit, saveGeometry, idle: () => queue };
}
export type WindowCtl = ReturnType<typeof createWindowCtl>;
