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
use std::time::Duration;
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const BUDDY: &str = "buddy";
pub const OVERLAY: &str = "overlay";
const MAIN: &str = "main";
/* Nevyzvednutý snímek se zahodí po této době. */
const CAPTURE_TTL: Duration = Duration::from_secs(15);
/* Jak často se při zapnutém „otevřít s hrou“ prochází seznam procesů. */
const WATCH_EVERY: Duration = Duration::from_secs(10);
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
    /* okno v popředí před otevřením overlaye (HWND jako číslo), aby se mu po zavření vrátil fokus */
    prev_focus: Mutex<isize>,
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
        .inner_size(64.0, 64.0)
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
    let _ = w.emit_to(OVERLAY, "ops:open", tab.unwrap_or_default());
    let _ = app.emit_to(MAIN, "ops:overlay", true);
    Ok(())
}

fn hide_overlay<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(OVERLAY) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            let prev = app.state::<OpsState>().prev_focus.lock().map(|p| *p).unwrap_or(0);
            restore_focus(prev);
            let _ = app.emit_to(MAIN, "ops:overlay", false);
        }
    }
}

#[tauri::command]
pub async fn overlay_open<R: Runtime>(app: AppHandle<R>, tab: Option<String>) -> Result<(), String> {
    show_overlay(&app, tab)
}

#[tauri::command]
pub async fn overlay_close<R: Runtime>(app: AppHandle<R>) {
    hide_overlay(&app);
}

#[tauri::command]
pub async fn overlay_toggle<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let open = app.get_webview_window(OVERLAY).map(|w| w.is_visible().unwrap_or(false)).unwrap_or(false);
    if open {
        hide_overlay(&app);
        Ok(())
    } else {
        show_overlay(&app, None)
    }
}

/* Z overlaye „Otevřít v aplikaci“: hlavní okno do popředí. */
#[tauri::command]
pub async fn main_focus<R: Runtime>(app: AppHandle<R>) {
    hide_overlay(&app);
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/* ----- snímek ----- */

#[tauri::command]
pub async fn capture_now<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
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
    let _ = app.emit_to(MAIN, "ops:capture-start", ());
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
                let _ = app.emit_to(MAIN, "ops:capture-ready", CaptureReady { id, width, height });
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
                let _ = app.emit_to(MAIN, "ops:capture-failed", e);
            }
        }
    });
}

/// Hlavní okno si snímek vyzvedne jako binární data (RGBA). Snímek se tím tady smaže.
#[tauri::command]
pub async fn capture_take<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, id: u64) -> Result<tauri::ipc::Response, String> {
    main_only(&window)?;
    let st = app.state::<OpsState>();
    let mut c = st.capture.lock().map_err(|_| "capture:failed")?;
    match c.take() {
        Some(x) if x.id == id => Ok(tauri::ipc::Response::new(x.rgba)),
        _ => Err("capture:gone".into()),
    }
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
            let _ = w.run_on_main_thread(move || win::show_min_no_activate(raw));
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
        let mut last: Option<bool> = None;
        loop {
            let st = app.state::<OpsState>();
            if st.watch_gen.load(Ordering::SeqCst) != gen || !st.enabled.load(Ordering::SeqCst) {
                break;
            }
            let running = any_game(&process_names());
            if last != Some(running) {
                last = Some(running);
                let _ = app.emit_to(MAIN, "ops:game", running);
            }
            std::thread::sleep(WATCH_EVERY);
        }
    });
    Ok(())
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
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, IsWindow, SetForegroundWindow, SetWindowDisplayAffinity, ShowWindow, SW_SHOWMINNOACTIVE,
        WDA_EXCLUDEFROMCAPTURE,
    };

    /// Ukáže okno minimalizované bez aktivace (nevezme fokus oknu v popředí).
    pub fn show_min_no_activate(hwnd: isize) {
        unsafe {
            ShowWindow(hwnd as HWND, SW_SHOWMINNOACTIVE);
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
        unsafe {
            SetWindowDisplayAffinity(hwnd as HWND, WDA_EXCLUDEFROMCAPTURE);
        }
    }

    pub fn foreground() -> isize {
        unsafe { GetForegroundWindow() as isize }
    }

    /// Vrátí fokus oknu, které bylo v popředí před otevřením overlaye. Žádný vstup se neposílá.
    pub fn restore_focus(prev: isize) {
        if prev == 0 {
            return;
        }
        unsafe {
            let h = prev as HWND;
            if IsWindow(h) != 0 {
                SetForegroundWindow(h);
            }
        }
    }

    /// Názvy spustitelných souborů běžících procesů. Procesy se neotevírají.
    pub fn process_names() -> Vec<String> {
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
                out.push(String::from_utf16_lossy(&e.szExeFile[..len]));
                ok = Process32NextW(snap, &mut e) != 0;
            }
            CloseHandle(snap);
        }
        out
    }
}

#[cfg(windows)]
use win::{capture_foreground_monitor, foreground, process_names, restore_focus};

/* SetWindowDisplayAffinity musí volat vlákno, které okno vlastní (hlavní vlákno). */
#[cfg(windows)]
fn exclude_from_capture<R: Runtime>(w: &WebviewWindow<R>) {
    if let Ok(h) = w.hwnd() {
        let raw = h.0 as isize;
        let _ = w.run_on_main_thread(move || win::exclude_from_capture(raw as *mut std::ffi::c_void));
    }
}

#[cfg(not(windows))]
fn capture_foreground_monitor() -> Result<(u32, u32, Vec<u8>), String> {
    Err("capture:unsupported".into())
}
#[cfg(not(windows))]
fn exclude_from_capture<R: Runtime>(_w: &WebviewWindow<R>) {}
#[cfg(not(windows))]
fn foreground() -> isize {
    0
}
#[cfg(not(windows))]
fn restore_focus(_prev: isize) {}
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

    #[cfg(windows)]
    #[test]
    fn seznam_procesu_jde_precist() {
        assert!(!process_names().is_empty());
    }
}
