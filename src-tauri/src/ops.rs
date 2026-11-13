//! Milník 5: buddy Ops, overlay, globální zkratka a snímek obrazovky.
//!
//! Jediný modul, který smí registrovat globální zkratku, snímat obrazovku a číst seznam běžících procesů
//! (hlídá to tests/safety-m5.test.ts). Platí pravidla ze specifikace:
//! - Vše je neaktivní, dokud hráč v nastavení nezapne „Buddy a zkratka“ (`ops_enable`). Bez zapnutí se neotevře
//!   žádné okno a nezaregistruje žádná zkratka.
//! - Zkratka jde přes RegisterHotKey (`tauri-plugin-global-shortcut`), žádné nízkoúrovňové háčky klávesnice.
//! - Snímek jen na stisk zkratky nebo tlačítka: kopie monitoru, na kterém je okno v popředí (jako Win+PrtScn).
//!   Do hry se nic nevkládá, z její paměti ani souborů se nic nečte, nikam se neposílá žádný vstup.
//! - Snímek leží jen v paměti, hlavní okno si ho jednou vyzvedne (`capture_take`) a tím se tady smaže;
//!   nevyzvednutý snímek se po 15 s zahodí. Na disk se nikdy nezapisuje.
//! - Rozpoznání spuštěné hry jen podle názvů v seznamu procesů (Toolhelp snapshot), bez otevírání procesů.
//!   Kromě hlídání („otevřít s hrou“) se seznam čte ještě jednou při startu aplikace (`game_running_now`, 0.8.0),
//!   nezávisle na přepínači buddyho: když hra běží, hlavní okno se ukáže minimalizované bez aktivace
//!   (`show_in_background`), aby hře nevzalo fokus.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::bus::{emit_native, only};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const BUDDY: &str = "buddy";
pub const OVERLAY: &str = "overlay";
const MAIN: &str = "main";
/* Nevyzvednutý snímek se zahodí po této době. */
const CAPTURE_TTL: Duration = Duration::from_secs(15);
/* Jak často se při zapnutém „otevřít s hrou“ prochází seznam procesů. */
const WATCH_EVERY: Duration = Duration::from_secs(1);
/* Krok téže hlídací smyčky: okno v popředí (0.13.1). Seznam procesů se dál čte jen jednou za WATCH_EVERY. */
const WATCH_TICK: Duration = Duration::from_millis(150);
/* Buddy se schová, až je v popředí cizí okno aspoň takhle dlouho (alt-tab, krátce žádné okno nebo plocha). */
const HIDE_AFTER: Duration = Duration::from_millis(400);
/* Největší snímek (8K × 8K). */
const MAX_SIDE: i32 = 8192;

struct Captured {
    id: u64,
    rgba: Vec<u8>,
}

#[derive(Default)]
pub struct OpsState {
    enabled: AtomicBool,
    busy: AtomicBool,
    next_id: AtomicU64,
    capture: Mutex<Option<Captured>>,
    hotkey: Mutex<Option<Shortcut>>,
    watch_gen: AtomicU64,
    /* okno v popředí před otevřením overlaye (HWND jako číslo a id jeho procesu), aby se mu po zavření vrátil
       fokus; 0.16.1: id procesu brání vrátit fokus cizímu oknu, které mezitím dostalo stejný HWND */
    prev_focus: Mutex<(isize, u32)>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CaptureReady {
    id: u64,
    width: u32,
    height: u32,
}

fn main_only<R: Runtime>(w: &WebviewWindow<R>) -> Result<(), String> {
    if w.label() == MAIN { Ok(()) } else { Err("Jen hlavní okno".into()) }
}
fn enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.state::<OpsState>().enabled.load(Ordering::SeqCst)
}

/* Příkazy jsou async: vytvoření okna ze synchronního příkazu (hlavní vlákno) ve Windows zablokuje smyčku událostí. */

/* ----- zkratka ----- */

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                on_hotkey(app);
            }
        })
        .build()
}

/* Stisk zkratky: otevřený overlay zavře, jinak pořídí snímek. */
fn on_hotkey<R: Runtime>(app: &AppHandle<R>) {
    if !enabled(app) {
        return;
    }
    if let Some(o) = app.get_webview_window(OVERLAY) {
        if o.is_visible().unwrap_or(false) {
            hide_overlay(app);
            return;
        }
    }
    start_capture(app.clone());
}

/// Zkontroluje text zkratky (formát `Ctrl+Shift+KeyS`). Bez modifikátoru projde jen funkční klávesa F1–F24,
/// aby zkratka nebrala hře běžné klávesy.
pub fn parse_hotkey(accel: &str) -> Result<Shortcut, String> {
    let accel = accel.trim();
    if accel.is_empty() || accel.len() > 60 {
        return Err("hotkey:invalid".into());
    }
    let parts: Vec<&str> = accel.split('+').collect();
    let key = parts.last().copied().unwrap_or("");
    let has_mod = parts.len() > 1;
    let fkey = key.len() >= 2 && key.starts_with('F') && key[1..].parse::<u8>().map(|n| (1..=24).contains(&n)).unwrap_or(false);
    if !has_mod && !fkey {
        return Err("hotkey:invalid".into());
    }
    accel.parse::<Shortcut>().map_err(|_| "hotkey:invalid".to_string())
}

#[tauri::command]
pub async fn ops_hotkey<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, accel: String) -> Result<(), String> {
    main_only(&window)?;
    let st = app.state::<OpsState>();
    let mut cur = st.hotkey.lock().map_err(|_| "hotkey:failed")?;
    if accel.trim().is_empty() {
        if let Some(old) = cur.take() {
            let _ = app.global_shortcut().unregister(old);
        }
        return Ok(());
    }
    if !st.enabled.load(Ordering::SeqCst) {
        return Err("hotkey:off".into());
    }
    let next = parse_hotkey(&accel)?;
    if cur.as_ref() == Some(&next) && app.global_shortcut().is_registered(next) {
        return Ok(());
    }
    if let Some(old) = cur.take() {
        let _ = app.global_shortcut().unregister(old);
    }
    app.global_shortcut().register(next).map_err(|_| "hotkey:taken".to_string())?;
    *cur = Some(next);
    Ok(())
}

/* ----- zapnutí a vypnutí ----- */

#[tauri::command]
pub async fn ops_enable<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, on: bool) -> Result<(), String> {
    main_only(&window)?;
    let st = app.state::<OpsState>();
    st.enabled.store(on, Ordering::SeqCst);
    if !on {
        shutdown(&app);
    }
    Ok(())
}

/// Vypne vše: zkratku, hlídání hry, obě okna a čekající snímek.
pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
    let st = app.state::<OpsState>();
    st.enabled.store(false, Ordering::SeqCst);
    if let Ok(mut h) = st.hotkey.lock() {
        *h = None;
    }
    let _ = app.global_shortcut().unregister_all();
    st.watch_gen.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut c) = st.capture.lock() {
        *c = None;
    }
    for label in [OVERLAY, BUDDY] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.destroy();
        }
    }
}

/* ----- okna ----- */

/// Alt+F4 na buddym nic nezavře (vypíná se přepínačem), na overlayi ho jen skryje. Vypnutí ruší okna přes destroy.
pub fn on_window_event<R: Runtime>(w: &tauri::Window<R>, e: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = e {
        match w.label() {
            BUDDY => api.prevent_close(),
            OVERLAY => {
                api.prevent_close();
                hide_overlay(w.app_handle());
            }
            _ => {}
        }
    }
}

#[tauri::command]
pub async fn buddy_open<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    if !enabled(&app) {
        return Err("ops:off".into());
    }
    if app.get_webview_window(BUDDY).is_some() {
        return Ok(());
    }
    /* Okno se ukáže samo, až si buddy spočítá velikost a polohu na monitoru. */
    let w = WebviewWindowBuilder::new(&app, BUDDY, WebviewUrl::App("buddy.html".into()))
        .title("Ops")
        .inner_size(96.0, 96.0)
        /* bez vlastního minima by Windows okno bez rámečku roztáhly na šířku titulku (~136 px) */
        .min_inner_size(16.0, 16.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    exclude_from_capture(&w);
    Ok(())
}

#[tauri::command]
pub async fn buddy_close<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    for label in [OVERLAY, BUDDY] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.destroy();
        }
    }
    Ok(())
}

/// Buddy se ukáže sám, až si spočítá velikost a polohu (0.13.1): bez aktivace, takže nevezme fokus hře ani
/// hlavnímu oknu. Smí ho volat jen okno buddyho.
#[tauri::command]
pub async fn buddy_reveal<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    if window.label() != BUDDY {
        return Err("Jen buddy".into());
    }
    #[cfg(windows)]
    {
        if win::reveal_no_activate(&window) {
            return Ok(());
        }
    }
    window.show().map_err(|e| e.to_string())
}

/* Overlay uprostřed monitoru, na kterém je buddy (jinak hlavního monitoru). */
fn overlay_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    if let Some(w) = app.get_webview_window(OVERLAY) {
        return Ok(w);
    }
    let mon = app
        .get_webview_window(BUDDY)
        .and_then(|b| b.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let (mut w, mut h, mut x, mut y) = (1100.0_f64, 760.0_f64, None, None);
    if let Some(m) = mon {
        let sf = m.scale_factor();
        let (mw, mh) = (m.size().width as f64 / sf, m.size().height as f64 / sf);
        w = w.min(mw * 0.96);
        h = h.min(mh * 0.94);
        x = Some(m.position().x as f64 / sf + (mw - w) / 2.0);
        y = Some(m.position().y as f64 / sf + (mh - h) / 2.0);
    }
    let mut b = WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("overlay.html".into()))
        .title("Ops")
        .inner_size(w, h)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .visible(false)
        .effects(tauri::utils::config::WindowEffectsConfig {
            effects: vec![tauri::window::Effect::Acrylic],
            ..Default::default()
        });
    if let (Some(x), Some(y)) = (x, y) {
        b = b.position(x, y);
    }
    let win = b.build().map_err(|e| e.to_string())?;
    exclude_from_capture(&win);
    Ok(win)
}

fn show_overlay<R: Runtime>(app: &AppHandle<R>, tab: Option<String>) -> Result<(), String> {
    if !enabled(app) {
        return Err("ops:off".into());
    }
    let w = overlay_window(app)?;
    if !w.is_visible().unwrap_or(false) {
        if let Ok(mut p) = app.state::<OpsState>().prev_focus.lock() {
            *p = foreground();
        }
    }
    w.show().map_err(|e| e.to_string())?;
    let _ = w.set_focus();
    emit_native(app, OVERLAY, "open", tab.unwrap_or_default());
    emit_native(app, MAIN, "overlay", true);
    Ok(())
}

fn hide_overlay<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(OVERLAY) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            let (prev, pid) = app.state::<OpsState>().prev_focus.lock().map(|p| *p).unwrap_or((0, 0));
            restore_focus(prev, pid);
            emit_native(app, MAIN, "overlay", false);
        }
    }
}

// 0.16.1: každý příkaz jen pro okna, která ho používají (stejně jako capabilities/<okno>.json).

/// Otevře overlay (hlavní okno: snímek z tlačítka v okně aplikace).
#[tauri::command]
pub async fn overlay_open<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, tab: Option<String>) -> Result<(), String> {
    main_only(&window)?;
    let tab = tab.filter(|t| t.len() <= 16 && t.bytes().all(|b| b.is_ascii_lowercase()));
    show_overlay(&app, tab)
}

/// Zavře overlay (tlačítko a Esc v overlayi).
#[tauri::command]
pub async fn overlay_close<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    only(&window, &[OVERLAY])?;
    hide_overlay(&app);
    Ok(())
}

/// Klik na buddyho: overlay otevře nebo zavře.
#[tauri::command]
pub async fn overlay_toggle<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    only(&window, &[BUDDY])?;
    let open = app.get_webview_window(OVERLAY).map(|w| w.is_visible().unwrap_or(false)).unwrap_or(false);
    if open {
        hide_overlay(&app);
        Ok(())
    } else {
        show_overlay(&app, None)
    }
}

/* Z overlaye „Otevřít v aplikaci“: hlavní okno do popředí. Volá ho hub v hlavním okně po ověření cesty. */
#[tauri::command]
pub async fn main_focus<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    hide_overlay(&app);
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    Ok(())
}

/* ----- poloha a tažení vlastního okna (0.16.1) ----- */

/// Rozumný obdélník okna ve fyzických px (buddy i overlay; plocha nejvýš ±100 000 px).
pub fn place_ok(x: i32, y: i32, w: u32, h: u32) -> bool {
    let side = 16..=16384;
    let pos = -100_000..=100_000;
    side.contains(&w) && side.contains(&h) && pos.contains(&x) && pos.contains(&y)
}

/// Velikost a poloha okna, které příkaz volá (buddy a overlay). Na jiné okno nedosáhne; okno se neaktivuje.
#[tauri::command]
pub async fn win_place<R: Runtime>(window: WebviewWindow<R>, x: i32, y: i32, w: u32, h: u32) -> Result<(), String> {
    only(&window, &[BUDDY, OVERLAY])?;
    if !place_ok(x, y, w, h) {
        return Err("win:invalid".into());
    }
    window.set_size(PhysicalSize::new(w, h)).map_err(|e| e.to_string())?;
    window.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())
}

/// Tažení buddyho myší (jen vlastní okno buddyho).
#[tauri::command]
pub fn win_drag<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    only(&window, &[BUDDY])?;
    window.start_dragging().map_err(|e| e.to_string())
}

/* ----- snímek ----- */

#[tauri::command]
pub async fn capture_now<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    only(&window, &[MAIN, OVERLAY])?;
    if !enabled(&app) {
        return Err("ops:off".into());
    }
    start_capture(app);
    Ok(())
}

fn start_capture<R: Runtime>(app: AppHandle<R>) {
    let st = app.state::<OpsState>();
    if st.busy.swap(true, Ordering::SeqCst) {
        return;
    }
    emit_native(&app, MAIN, "capture-start", ());
    std::thread::spawn(move || {
        let st = app.state::<OpsState>();
        let result = capture_foreground_monitor();
        match result {
            Ok((width, height, rgba)) => {
                let id = st.next_id.fetch_add(1, Ordering::SeqCst) + 1;
                if let Ok(mut c) = st.capture.lock() {
                    *c = Some(Captured { id, rgba });
                }
                st.busy.store(false, Ordering::SeqCst);
                emit_native(&app, MAIN, "capture-ready", CaptureReady { id, width, height });
                /* Nevyzvednutý snímek se zahodí. */
                let app2 = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(CAPTURE_TTL);
                    if let Ok(mut c) = app2.state::<OpsState>().capture.lock() {
                        if c.as_ref().map(|x| x.id) == Some(id) {
                            *c = None;
                        }
                    }
                });
            }
            Err(e) => {
                st.busy.store(false, Ordering::SeqCst);
                emit_native(&app, MAIN, "capture-failed", e);
            }
        }
    });
}

/// Hlavní okno si snímek vyzvedne jako binární data (RGBA). Snímek se tím tady smaže.
/// 0.16.1: s jiným id se čekající (novější) snímek nesmaže.
#[tauri::command]
pub async fn capture_take<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, id: u64) -> Result<tauri::ipc::Response, String> {
    main_only(&window)?;
    let st = app.state::<OpsState>();
    let mut c = st.capture.lock().map_err(|_| "capture:failed")?;
    take_if(&mut c, id).map(|x| tauri::ipc::Response::new(x.rgba)).ok_or_else(|| "capture:gone".into())
}

/// Vyzvedne čekající snímek jen při shodě id; jinak ho nechá na místě.
fn take_if(c: &mut Option<Captured>, id: u64) -> Option<Captured> {
    if c.as_ref().map(|x| x.id) == Some(id) { c.take() } else { None }
}

/* ----- hlídání spuštěné hry (jen názvy procesů) ----- */

/// Spustitelný soubor ARC Raiders (Unreal projekt „Pioneer“): PioneerGame.exe, případně s příponou buildu.
pub fn is_game_exe(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.starts_with("pioneergame") && n.ends_with(".exe")
}

/// Je mezi názvy procesů hra?
pub fn any_game(names: &[String]) -> bool {
    names.iter().any(|n| is_game_exe(n))
}

/// Jednorázová kontrola při startu aplikace (volá ji jen `setup` v lib.rs, žádná smyčka): běží ARC Raiders?
/// Jen názvy procesů, žádné otevírání procesů.
pub fn game_running_now() -> bool {
    any_game(&process_names())
}

/// Ukáže skryté okno minimalizované a bez aktivace (Windows `SW_SHOWMINNOACTIVE`): nic nepřekryje hru v celé
/// obrazovce a nevezme jí fokus. Okno je na hlavním panelu, hráč ho otevře, až bude chtít.
pub fn show_in_background<R: Runtime>(w: &WebviewWindow<R>) {
    #[cfg(windows)]
    {
        if let Ok(h) = w.hwnd() {
            let raw = h.0 as isize;
            let _ = w.run_on_main_thread(move || win::show_no_activate(raw, true));
            return;
        }
    }
    let _ = w.show();
}

#[tauri::command]
pub async fn ops_watch<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, on: bool) -> Result<(), String> {
    main_only(&window)?;
    let st = app.state::<OpsState>();
    let gen = st.watch_gen.fetch_add(1, Ordering::SeqCst) + 1;
    if !on || !st.enabled.load(Ordering::SeqCst) {
        return Ok(());
    }
    std::thread::spawn(move || {
        let own = std::process::id();
        let mut last: Option<bool> = None;
        let mut pids: Vec<u32> = Vec::new();
        let mut scanned: Option<Instant> = None;
        let mut gate = BuddyGate::default();
        loop {
            let st = app.state::<OpsState>();
            if st.watch_gen.load(Ordering::SeqCst) != gen || !st.enabled.load(Ordering::SeqCst) {
                break;
            }
            let now = Instant::now();
            if scanned.map_or(true, |t| now.duration_since(t) >= WATCH_EVERY) {
                scanned = Some(now);
                let running = any_game(&process_names());
                if last != Some(running) {
                    last = Some(running);
                    emit_native(&app, MAIN, "game", running);
                }
                pids = if running { game_pids() } else { Vec::new() };
            }
            /* 0.13.1: buddy jen nad hrou nebo nad vlastním oknem; okno hry musí být vidět (ne minimalizované) */
            let shown = !pids.is_empty() && game_window_shown(&pids);
            let fg = classify_foreground(foreground_pid(), own, &pids);
            if let Some(visible) = gate.update(shown, fg, now) {
                emit_native(&app, MAIN, "game-visible", visible);
            }
            std::thread::sleep(WATCH_TICK);
        }
    });
    Ok(())
}

/* ----- viditelnost buddyho podle okna v popředí (0.13.1) ----- */

/// Komu patří okno v popředí.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Foreground {
    /// proces hry
    Game,
    /// tato aplikace: buddy, overlay, hlavní nebo kompaktní okno, nabídka v oznamovací oblasti
    Own,
    /// jiný program, plocha nebo hlavní panel
    Other,
    /// žádné okno v popředí (krátce během přepínání oken)
    None,
}

/// Zařadí okno v popředí podle id procesu, kterému patří.
pub fn classify_foreground(fg_pid: Option<u32>, own_pid: u32, game_pids: &[u32]) -> Foreground {
    match fg_pid {
        None | Some(0) => Foreground::None,
        Some(p) if p == own_pid => Foreground::Own,
        Some(p) if game_pids.contains(&p) => Foreground::Game,
        Some(_) => Foreground::Other,
    }
}

/// Rozhoduje, jestli má být automatický buddy vidět. Ukáže se hned, schová se až po HIDE_AFTER bez přerušení,
/// aby při alt-tabu neblikal. Žádné okno v popředí nic nemění. Vrací novou hodnotu, jen když se změnila
/// (první volání ji vrátí vždy).
#[derive(Default)]
pub struct BuddyGate {
    shown: Option<bool>,
    hide_since: Option<Instant>,
}

impl BuddyGate {
    pub fn update(&mut self, game_window: bool, fg: Foreground, now: Instant) -> Option<bool> {
        let want = match fg {
            _ if !game_window => false,
            Foreground::Game | Foreground::Own => true,
            Foreground::Other => false,
            /* krátce žádné okno: nic neměnit (rozběhnuté schovávání ani nezrušit, ani nedokončit) */
            Foreground::None if self.shown.is_some() => return None,
            Foreground::None => false,
        };
        match self.shown {
            None => {
                self.shown = Some(want);
                self.hide_since = None;
                Some(want)
            }
            Some(cur) if cur == want => {
                self.hide_since = None;
                None
            }
            Some(_) if want => {
                self.shown = Some(true);
                self.hide_since = None;
                Some(true)
            }
            Some(_) => {
                let since = *self.hide_since.get_or_insert(now);
                if now.saturating_duration_since(since) >= HIDE_AFTER {
                    self.shown = Some(false);
                    self.hide_since = None;
                    Some(false)
                } else {
                    None
                }
            }
        }
    }
}

/* ----- Windows ----- */

#[cfg(windows)]
mod win {
    use std::ffi::c_void;
    use std::mem::{size_of, zeroed};
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW, MonitorFromWindow,
        ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
        SRCCOPY,
    };
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsIconic, IsWindowVisible, GetForegroundWindow, IsWindow, SetForegroundWindow, SetWindowDisplayAffinity, ShowWindow, SW_SHOWMINNOACTIVE,
        SW_SHOWNOACTIVATE, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    };

    /// Ukáže okno bez aktivace (nevezme fokus oknu v popředí): minimalizované, nebo v dosavadní velikosti a poloze.
    pub fn show_no_activate(hwnd: isize, minimized: bool) {
        unsafe {
            ShowWindow(hwnd as HWND, if minimized { SW_SHOWMINNOACTIVE } else { SW_SHOWNOACTIVATE });
        }
    }

    /// Kopie celého monitoru, na kterém je okno v popředí (GDI BitBlt z plochy). Vrací šířku, výšku a RGBA.
    pub fn capture_foreground_monitor() -> Result<(u32, u32, Vec<u8>), String> {
        unsafe {
            let fg = GetForegroundWindow();
            let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTOPRIMARY);
            let mut mi: MONITORINFO = zeroed();
            mi.cbSize = size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(mon, &mut mi) == 0 {
                return Err("capture:failed".into());
            }
            let r = mi.rcMonitor;
            let (w, h) = (r.right - r.left, r.bottom - r.top);
            if w <= 0 || h <= 0 || w > super::MAX_SIDE || h > super::MAX_SIDE {
                return Err("capture:failed".into());
            }
            let screen = GetDC(null_mut());
            if screen.is_null() {
                return Err("capture:failed".into());
            }
            let mem = CreateCompatibleDC(screen);
            let mut bmi: BITMAPINFO = zeroed();
            bmi.bmiHeader = BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..zeroed()
            };
            let mut bits: *mut c_void = null_mut();
            let dib = CreateDIBSection(screen, &bmi, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
            let mut out = Err("capture:failed".to_string());
            if !dib.is_null() && !bits.is_null() && !mem.is_null() {
                let old = SelectObject(mem, dib);
                if BitBlt(mem, 0, 0, w, h, screen, r.left, r.top, SRCCOPY) != 0 {
                    let n = (w as usize) * (h as usize) * 4;
                    let src = std::slice::from_raw_parts(bits as *const u8, n);
                    let mut rgba = Vec::with_capacity(n);
                    for px in src.chunks_exact(4) {
                        rgba.extend_from_slice(&[px[2], px[1], px[0], 255]);
                    }
                    out = Ok((w as u32, h as u32, rgba));
                }
                SelectObject(mem, old);
            }
            if !dib.is_null() {
                DeleteObject(dib);
            }
            if !mem.is_null() {
                DeleteDC(mem);
            }
            ReleaseDC(null_mut(), screen);
            out
        }
    }

    /// Vlastní okno se nezobrazí na snímcích obrazovky (ani na našem), takže Ops ani overlay nezakryjí inventář.
    pub fn exclude_from_capture(hwnd: *mut c_void) {
        set_capture_affinity(hwnd, true);
    }

    /// Zapne nebo vypne vynechání okna ze snímků (kompaktní hlavní okno, 0.9.0).
    pub fn set_capture_affinity(hwnd: *mut c_void, exclude: bool) {
        unsafe {
            SetWindowDisplayAffinity(hwnd as HWND, if exclude { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE });
        }
    }

    /// Světlý hlavní panel Windows? (HKCU …\Themes\Personalize, hodnota SystemUsesLightTheme; jen čtení.)
    pub fn taskbar_light() -> bool {
        let key: Vec<u16> = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize".encode_utf16().chain([0]).collect();
        let name: Vec<u16> = "SystemUsesLightTheme\0".encode_utf16().collect();
        let mut value: u32 = 0;
        let mut size = size_of::<u32>() as u32;
        let rc = unsafe {
            RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr(), RRF_RT_REG_DWORD, null_mut(), &mut value as *mut u32 as *mut c_void, &mut size)
        };
        rc == 0 && value == 1
    }

    /// Okno v popředí (HWND jako číslo) a id procesu, kterému patří (jen čtení).
    pub fn foreground() -> (isize, u32) {
        unsafe {
            let h = GetForegroundWindow();
            let mut pid = 0;
            if !h.is_null() {
                GetWindowThreadProcessId(h, &mut pid);
            }
            (h as isize, pid)
        }
    }

    /// Vrátí fokus oknu, které bylo v popředí před otevřením overlaye. Žádný vstup se neposílá.
    /// 0.16.1: jen když okno pořád existuje a patří stejnému procesu (HWND zavřeného okna může dostat jiné okno).
    pub fn restore_focus(prev: isize, pid: u32) {
        if prev == 0 || pid == 0 {
            return;
        }
        unsafe {
            let h = prev as HWND;
            if IsWindow(h) == 0 {
                return;
            }
            let mut now_pid = 0;
            GetWindowThreadProcessId(h, &mut now_pid);
            if super::same_owner(pid, now_pid) {
                SetForegroundWindow(h);
            }
        }
    }

    /// Id procesu, kterému patří okno v popředí (jen čtení; nic se neaktivuje).
    pub fn foreground_pid() -> Option<u32> {
        unsafe {
            let h = GetForegroundWindow();
            if h.is_null() {
                return None;
            }
            let mut pid = 0;
            GetWindowThreadProcessId(h, &mut pid);
            if pid == 0 { None } else { Some(pid) }
        }
    }

    /// Má některý z procesů hry viditelné okno, které není minimalizované?
    pub fn game_window_shown(pids: &[u32]) -> bool {
        struct Find<'a> {
            pids: &'a [u32],
            found: bool,
        }
        unsafe extern "system" fn check(hwnd: HWND, data: isize) -> i32 {
            let f = &mut *(data as *mut Find);
            if IsWindowVisible(hwnd) != 0 && IsIconic(hwnd) == 0 {
                let mut pid = 0;
                GetWindowThreadProcessId(hwnd, &mut pid);
                if f.pids.contains(&pid) {
                    f.found = true;
                    return 0;
                }
            }
            1
        }
        let mut f = Find { pids, found: false };
        unsafe {
            EnumWindows(Some(check), &mut f as *mut Find as isize);
        }
        f.found
    }

    /// Id běžících procesů hry (podle názvu spustitelného souboru).
    pub fn game_pids() -> Vec<u32> {
        processes().into_iter().filter(|(_, n)| super::is_game_exe(n)).map(|(pid, _)| pid).collect()
    }

    /// Názvy spustitelných souborů běžících procesů. Procesy se neotevírají.
    pub fn process_names() -> Vec<String> {
        processes().into_iter().map(|(_, n)| n).collect()
    }

    /// Id a názvy běžících procesů z Toolhelp snapshotu. Procesy se neotevírají.
    fn processes() -> Vec<(u32, String)> {
        let mut out = vec![];
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE || snap.is_null() {
                return out;
            }
            let mut e: PROCESSENTRY32W = zeroed();
            e.dwSize = size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(snap, &mut e) != 0;
            while ok {
                let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                out.push((e.th32ProcessID, String::from_utf16_lossy(&e.szExeFile[..len])));
                ok = Process32NextW(snap, &mut e) != 0;
            }
            CloseHandle(snap);
        }
        out
    }

    /// Buddy se poprvé ukáže bez aktivace. Tauri si pak okno označí za viditelné; SW_SHOW na už viditelném
    /// okně nic nedělá, takže se nic neaktivuje.
    pub fn reveal_no_activate<R: tauri::Runtime>(w: &tauri::WebviewWindow<R>) -> bool {
        let Ok(h) = w.hwnd() else { return false };
        let raw = h.0 as isize;
        let w2 = w.clone();
        w.run_on_main_thread(move || {
            show_no_activate(raw, false);
            let _ = w2.show();
        })
        .is_ok()
    }
}

#[cfg(windows)]
use win::{capture_foreground_monitor, foreground, foreground_pid, game_pids, game_window_shown, process_names, restore_focus};

/* SetWindowDisplayAffinity musí volat vlákno, které okno vlastní (hlavní vlákno). */
#[cfg(windows)]
fn exclude_from_capture<R: Runtime>(w: &WebviewWindow<R>) {
    if let Ok(h) = w.hwnd() {
        let raw = h.0 as isize;
        let _ = w.run_on_main_thread(move || win::exclude_from_capture(raw as *mut std::ffi::c_void));
    }
}

/// Kompaktní hlavní okno se nezobrazí na snímcích (0.9.0): připnuté nad hrou by jinak zakrylo inventář na snímku
/// ze zkratky i z tlačítka Snímek. V plném režimu je okno na snímcích normálně vidět.
pub fn set_capture_excluded<R: Runtime>(w: &WebviewWindow<R>, exclude: bool) {
    #[cfg(windows)]
    {
        if let Ok(h) = w.hwnd() {
            let raw = h.0 as isize;
            let _ = w.run_on_main_thread(move || win::set_capture_affinity(raw as *mut std::ffi::c_void, exclude));
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (w, exclude);
    }
}

/// Je hlavní panel Windows ve světlém motivu? (Volba ikony v oznamovací oblasti; mimo Windows ne.)
pub fn taskbar_light() -> bool {
    #[cfg(windows)]
    {
        win::taskbar_light()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(not(windows))]
fn capture_foreground_monitor() -> Result<(u32, u32, Vec<u8>), String> {
    Err("capture:unsupported".into())
}
#[cfg(not(windows))]
fn exclude_from_capture<R: Runtime>(_w: &WebviewWindow<R>) {}
#[cfg(not(windows))]
fn foreground() -> (isize, u32) {
    (0, 0)
}
#[cfg(not(windows))]
fn restore_focus(_prev: isize, _pid: u32) {}

/// Patří okno pořád stejnému procesu jako při uložení? (0 = neznámý proces, fokus se nevrací.)
pub fn same_owner(saved_pid: u32, now_pid: u32) -> bool {
    saved_pid != 0 && saved_pid == now_pid
}
#[cfg(not(windows))]
fn foreground_pid() -> Option<u32> {
    None
}
#[cfg(not(windows))]
fn game_window_shown(_pids: &[u32]) -> bool {
    false
}
#[cfg(not(windows))]
fn game_pids() -> Vec<u32> {
    vec![]
}
#[cfg(not(windows))]
fn process_names() -> Vec<String> {
    vec![]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zkratka_vyzaduje_modifikator_nebo_f_klavesu() {
        assert!(parse_hotkey("Ctrl+Shift+KeyS").is_ok());
        assert!(parse_hotkey("Alt+F9").is_ok());
        assert!(parse_hotkey("F9").is_ok());
        assert!(parse_hotkey("F24").is_ok());
        assert!(parse_hotkey("KeyS").is_err());
        assert!(parse_hotkey("F25").is_err());
        assert!(parse_hotkey("").is_err());
        assert!(parse_hotkey("Ctrl+Nonsense").is_err());
    }

    #[test]
    fn hra_podle_nazvu_procesu() {
        assert!(is_game_exe("PioneerGame.exe"));
        assert!(is_game_exe("PioneerGame-Win64-Shipping.exe"));
        assert!(!is_game_exe("arc-companion.exe"));
        assert!(!is_game_exe("PioneerGame.dll"));
    }

    #[test]
    fn hra_v_seznamu_procesu() {
        let names = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(any_game(&names(&["explorer.exe", "PioneerGame-Win64-Shipping.exe"])));
        assert!(!any_game(&names(&["explorer.exe", "arc-companion.exe"])));
        assert!(!any_game(&[]));
    }

    #[test]
    fn popredi_podle_procesu() {
        let game = [4321, 4322];
        assert_eq!(classify_foreground(Some(4322), 100, &game), Foreground::Game);
        assert_eq!(classify_foreground(Some(100), 100, &game), Foreground::Own);
        assert_eq!(classify_foreground(Some(777), 100, &game), Foreground::Other);
        assert_eq!(classify_foreground(None, 100, &game), Foreground::None);
        assert_eq!(classify_foreground(Some(0), 100, &game), Foreground::None);
        /* hra neběží: vlastní okno je pořád vlastní, ostatní cizí */
        assert_eq!(classify_foreground(Some(100), 100, &[]), Foreground::Own);
        assert_eq!(classify_foreground(Some(4321), 100, &[]), Foreground::Other);
    }

    fn ms(t0: Instant, n: u64) -> Instant {
        t0 + Duration::from_millis(n)
    }

    #[test]
    fn buddy_nad_hrou_a_vlastnim_oknem_jinak_schovany() {
        let t0 = Instant::now();
        let mut g = BuddyGate::default();
        /* první hodnota přijde hned */
        assert_eq!(g.update(true, Foreground::Game, t0), Some(true));
        assert_eq!(g.update(true, Foreground::Game, ms(t0, 150)), None);
        /* vlastní okno (klik na buddyho, overlay, hlavní okno) ho neschová */
        assert_eq!(g.update(true, Foreground::Own, ms(t0, 300)), None);
        assert_eq!(g.update(true, Foreground::Own, ms(t0, 5_000)), None);
        /* cizí okno: schová se až po HIDE_AFTER */
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 6_000)), None);
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 6_150)), None);
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 6_399)), None);
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 6_400)), Some(false));
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 7_000)), None);
        /* hra zpět v popředí: ukáže se hned */
        assert_eq!(g.update(true, Foreground::Game, ms(t0, 7_150)), Some(true));
        /* první hodnota bez hry je schovaný */
        let mut g = BuddyGate::default();
        assert_eq!(g.update(true, Foreground::Other, t0), Some(false));
        assert_eq!(g.update(true, Foreground::Own, ms(t0, 150)), Some(true));
    }

    #[test]
    fn buddy_pri_alt_tabu_neblika() {
        let t0 = Instant::now();
        let mut g = BuddyGate::default();
        assert_eq!(g.update(true, Foreground::Game, t0), Some(true));
        /* krátce přepínač oken, plocha nebo žádné okno, pak zase hra: nic se nezmění */
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 150)), None);
        assert_eq!(g.update(true, Foreground::None, ms(t0, 300)), None);
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 450)), None);
        assert_eq!(g.update(true, Foreground::Game, ms(t0, 500)), None);
        /* návrat do hry odpočet zrušil: nové cizí okno čeká zase celou dobu */
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 600)), None);
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 900)), None);
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 1_000)), Some(false));
    }

    #[test]
    fn buddy_bez_okna_v_popredi_nic_nemeni() {
        let t0 = Instant::now();
        let mut g = BuddyGate::default();
        assert_eq!(g.update(true, Foreground::Game, t0), Some(true));
        /* dlouho žádné okno (zamčená obrazovka, UAC): buddy zůstane */
        assert_eq!(g.update(true, Foreground::None, ms(t0, 10_000)), None);
        /* žádné okno nezruší ani nedokončí rozběhnuté schovávání */
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 20_000)), None);
        assert_eq!(g.update(true, Foreground::None, ms(t0, 20_500)), None);
        assert_eq!(g.update(true, Foreground::Other, ms(t0, 20_600)), Some(false));
        /* schovaný zůstane schovaný */
        assert_eq!(g.update(true, Foreground::None, ms(t0, 21_000)), None);
        /* první hodnota bez okna v popředí: schovaný */
        let mut g = BuddyGate::default();
        assert_eq!(g.update(true, Foreground::None, t0), Some(false));
    }

    #[test]
    fn buddy_se_schova_kdyz_hra_neni_videt() {
        let t0 = Instant::now();
        let mut g = BuddyGate::default();
        assert_eq!(g.update(true, Foreground::Game, t0), Some(true));
        /* hra minimalizovaná nebo ukončená: ani vlastní okno v popředí ho neudrží (0.12.1) */
        assert_eq!(g.update(false, Foreground::Own, ms(t0, 150)), None);
        assert_eq!(g.update(false, Foreground::Own, ms(t0, 550)), Some(false));
        assert_eq!(g.update(false, Foreground::Game, ms(t0, 700)), None);
        assert_eq!(g.update(true, Foreground::Game, ms(t0, 850)), Some(true));
        let mut g = BuddyGate::default();
        assert_eq!(g.update(false, Foreground::Game, t0), Some(false));
    }

    #[test]
    fn snimek_s_jinym_id_zustane() {
        let mut c = Some(Captured { id: 7, rgba: vec![1, 2, 3, 4] });
        assert!(take_if(&mut c, 6).is_none());
        assert!(c.is_some(), "starší id nesmí smazat novější snímek");
        assert_eq!(take_if(&mut c, 7).map(|x| x.rgba), Some(vec![1, 2, 3, 4]));
        assert!(c.is_none());
        assert!(take_if(&mut c, 7).is_none());
    }

    #[test]
    fn fokus_jen_stejnemu_procesu() {
        assert!(same_owner(1234, 1234));
        assert!(!same_owner(1234, 999));
        assert!(!same_owner(0, 0));
        assert!(!same_owner(1234, 0));
    }

    #[test]
    fn poloha_okna_v_mezich() {
        assert!(place_ok(0, 0, 96, 96));
        assert!(place_ok(-3840, -200, 1100, 760));
        assert!(!place_ok(0, 0, 0, 96));
        assert!(!place_ok(0, 0, 96, 20000));
        assert!(!place_ok(i32::MIN, 0, 96, 96));
        assert!(!place_ok(0, 200_000, 96, 96));
    }

    #[cfg(windows)]
    #[test]
    fn seznam_procesu_jde_precist() {
        assert!(!process_names().is_empty());
    }
}
