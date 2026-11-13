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
//! - 0.20.0 (žlutá zóna, výchozí vypnuto): automatické snímání obrazovek mimo raid (`ops_autocapture`). Jen když ho hráč
//!   zapne a jen v hlídací smyčce `ops_watch` (žádná druhá smyčka), jen při hře v popředí a vidět. Asi každé 2 s se
//!   zkopíruje jen horní pás obrazovky s nadpisy (`capture_header_strip`), z něj se spočítá hrubá mapa světlého písma
//!   a porovná se se vzory známých obrazovek (modul `header`). Teprve při známé obrazovce, která se liší od naposledy
//!   zpracované (`AutoGate`), se pořídí jeden plný snímek stejnou cestou jako u zkratky (paměť, `capture_take`, 15 s).
//!   Pás se po porovnání hned zahodí; na disk se nic nezapisuje.
//! - 0.22.0: widgety nad hrou. Jedno sdílené průhledné okno vždy navrchu přes celý monitor hry (`widgets`), které ve Hře
//!   propouští myš (`set_ignore_cursor_events(true)`) a nejde aktivovat (`focusable(false)`, WS_EX_NOACTIVATE), takže
//!   nikdy nevezme hře myš ani fokus. Úpravy zapne jen výslovná akce (klik na Opse, zkratka Úprav, tlačítko
//!   v Nastavení): okno přestane propouštět myš a dostane fokus; po Hotovo / Esc se vše vrátí a fokus dostane okno,
//!   které bylo v popředí předtím (jako u overlaye), ale jen když fokus pořád patří této aplikaci. Malé okno Opse
//!   (buddy) zůstává jediným místem, které ve Hře přijme klik. Žádné nové API pro procesy, paměť ani vstup.
//! - 0.22.1: buddy nikdy nevezme hře fokus. Okno buddyho nejde aktivovat (`focusable(false)`, WS_EX_NOACTIVATE) a ve
//!   výchozím stavu propouští myš do hry (`set_ignore_cursor_events(true)`), dokud je v popředí hra (`buddy_pass_through`,
//!   přepíná hlídací smyčka `ops_watch` podle okna v popředí; volba v Nastavení `ops_passthrough`). Klik, tažení
//!   a Úpravy z buddyho se při hře v popředí odmítnou (`buddy_click_ok`); Úpravy widgetů skončí, když se hráč vrátí
//!   do hry (`edit_must_end`). Ovládání během hry jde přes zkratku. Jen okenní API: žádný háček myši, žádné vkládání
//!   vstupu, žádné čtení polohy kurzoru ani stavu kláves.
//! - 0.22.1: okna buddyho a widgetů vznikají rovnou viditelná s `focused(false)`: tao je ukáže při vytvoření přes
//!   SW_SHOWNOACTIVATE. Dřívější „ukázání bez aktivace“ (SW_SHOWNOACTIVATE a pak `show()`) aktivovalo: tao u okna,
//!   které pokládá za skryté, odebere WS_VISIBLE a zavolá SW_SHOW, takže okno vzalo popředí, kdykoli ho aplikace
//!   směla vzít. Buddy je do umístění průhledný a propouští myš (`buddy_ready`); `show()` se na buddyho ani widgety
//!   nevolá nikde.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::bus::{emit_native, only};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const BUDDY: &str = "buddy";
pub const OVERLAY: &str = "overlay";
pub const WIDGETS: &str = "widgets";
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
/* 0.20.0: krok automatického snímání (pás s nadpisy) a nejkratší odstup dvou plných snímků. */
const AUTO_EVERY: Duration = Duration::from_secs(2);
pub const AUTO_COOLDOWN: Duration = Duration::from_secs(8);

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
    /* 0.20.0: automatické snímání mimo raid (zapíná jen hlavní okno, výchozí vypnuto) a vybrané obrazovky (bity Screen) */
    auto_on: AtomicBool,
    auto_mask: AtomicU32,
    auto_stats: Mutex<AutoStats>,
    /* 0.22.0: okno widgetů v Úpravách, okno v popředí před Úpravami a dvě volitelné zkratky (Úpravy, Skrýt / zobrazit) */
    edit: AtomicBool,
    edit_focus: Mutex<(isize, u32)>,
    edit_key: Mutex<Option<Shortcut>>,
    hide_key: Mutex<Option<Shortcut>>,
    /* 0.22.1: hráč vypnul „Buddy propouští kliky do hry“ (výchozí false = propouští), buddy teď propouští myš
       a od kdy běží Úpravy widgetů */
    pass_off: AtomicBool,
    buddy_pass: AtomicBool,
    /* 0.22.1: buddy už je umístěný (buddy_reveal); do té doby propouští myš */
    buddy_ready: AtomicBool,
    edit_since: Mutex<Option<Instant>>,
}

/// Měření automatického snímání (0.20.0): doba jednoho kroku (snímek pásu + porovnání) a velikost pásu v paměti.
/// Doba je na hodinách (horní mez času CPU); pás existuje jen během kroku.
#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AutoStats {
    pub ticks: u64,
    pub total_us: u64,
    pub max_us: u64,
    pub last_us: u64,
    pub strip_bytes: u64,
    pub captures: u64,
    pub screen: Option<&'static str>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CaptureReady {
    id: u64,
    width: u32,
    height: u32,
    /* 0.20.0: snímek z automatického snímání a obrazovka podle nadpisu (jinak chybí) */
    #[serde(skip_serializing_if = "Option::is_none")]
    auto: Option<&'static str>,
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
        .with_handler(|app, shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                on_hotkey(app, shortcut);
            }
        })
        .build()
}

/* Stisk zkratky: otevřený overlay zavře, jinak pořídí snímek. 0.22.0: zkratka Úprav přepne Úpravy widgetů,
   zkratka Skrýt / zobrazit pošle oknu widgetů jen událost (nic se neaktivuje). */
fn on_hotkey<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut) {
    if !enabled(app) {
        return;
    }
    let st = app.state::<OpsState>();
    let is = |m: &Mutex<Option<Shortcut>>| m.lock().map(|k| k.as_ref() == Some(shortcut)).unwrap_or(false);
    if is(&st.edit_key) {
        let _ = set_edit(app, None);
        return;
    }
    if is(&st.hide_key) {
        if app.get_webview_window(WIDGETS).is_some() {
            emit_native(app, WIDGETS, "widgets-hide", ());
        }
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

/// Zkratka snímku (slot chybí nebo „capture“), Úprav widgetů („edit“) nebo Skrýt / zobrazit widgety („hide“).
/// Stejná zkratka nesmí být ve dvou slotech.
#[tauri::command]
pub async fn ops_hotkey<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, accel: String, slot: Option<String>) -> Result<(), String> {
    main_only(&window)?;
    let st = app.state::<OpsState>();
    let slot = slot.as_deref().unwrap_or("capture");
    let slots = [("capture", &st.hotkey), ("edit", &st.edit_key), ("hide", &st.hide_key)];
    let cell = slots.iter().find(|(n, _)| *n == slot).map(|(_, c)| *c).ok_or("hotkey:invalid")?;
    if !accel.trim().is_empty() {
        let next = parse_hotkey(&accel)?;
        for (n, other) in slots {
            if n != slot && other.lock().map(|o| o.as_ref() == Some(&next)).unwrap_or(false) {
                return Err("hotkey:taken".into());
            }
        }
    }
    let mut cur = cell.lock().map_err(|_| "hotkey:failed")?;
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
    st.auto_on.store(false, Ordering::SeqCst);
    st.edit.store(false, Ordering::SeqCst);
    for k in [&st.hotkey, &st.edit_key, &st.hide_key] {
        if let Ok(mut h) = k.lock() {
            *h = None;
        }
    }
    let _ = app.global_shortcut().unregister_all();
    st.watch_gen.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut c) = st.capture.lock() {
        *c = None;
    }
    for label in [WIDGETS, OVERLAY, BUDDY] {
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
            /* Alt+F4 v Úpravách widgety nezavře, jen ukončí Úpravy */
            WIDGETS => {
                api.prevent_close();
                let _ = set_edit(w.app_handle(), Some(false));
            }
            _ => {}
        }
    }
    if w.label() == WIDGETS && matches!(e, tauri::WindowEvent::Destroyed) {
        w.app_handle().state::<OpsState>().edit.store(false, Ordering::SeqCst);
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
        /* 0.22.1: klik na buddyho nikdy neaktivuje jeho okno (WS_EX_NOACTIVATE), hra si fokus nechá */
        .focusable(false)
        /* 0.22.1: viditelné hned při vytvoření (tao ho ukáže přes SW_SHOWNOACTIVATE, nic se neaktivuje). Do umístění
           je obsah průhledný (BuddyApp nic nekreslí) a okno propouští myš; pozdější show() by okno aktivovalo. */
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    let st = app.state::<OpsState>();
    st.buddy_ready.store(false, Ordering::SeqCst);
    let _ = w.set_ignore_cursor_events(true);
    st.buddy_pass.store(true, Ordering::SeqCst);
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

/// Buddy si spočítal velikost a polohu (0.13.1) a ukáže se. 0.22.1: okno je viditelné od vytvoření (bez aktivace),
/// tady se jen přestane propouštět myš, pokud v popředí není hra; nic se neukazuje ani neaktivuje.
/// Smí ho volat jen okno buddyho.
#[tauri::command]
pub async fn buddy_reveal<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    if window.label() != BUDDY {
        return Err("Jen buddy".into());
    }
    let app = window.app_handle();
    app.state::<OpsState>().buddy_ready.store(true, Ordering::SeqCst);
    refresh_buddy_pass(app);
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
        let prev = focus_target(app);
        if let Ok(mut p) = app.state::<OpsState>().prev_focus.lock() {
            *p = prev;
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
    buddy_click_guard(&app)?;
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

/* ----- 0.22.0: widgety nad hrou ----- */

/* Kam vrátit fokus po zavření overlaye nebo konci Úprav: okno v popředí. Když je to Ops nebo okno widgetů (hráč
   klikl na Opse), tak okno hry, aby fokus nedostal Ops místo hry. Jen čtení oken, nic se neaktivuje. */
fn focus_target<R: Runtime>(app: &AppHandle<R>) -> (isize, u32) {
    let fg = foreground();
    let child = [BUDDY, WIDGETS].iter().any(|l| app.get_webview_window(l).and_then(|w| hwnd_of(&w)) == Some(fg.0));
    if fg.1 == std::process::id() && child {
        if let Some(g) = game_window(&game_pids()) {
            return g;
        }
    }
    fg
}

#[cfg(windows)]
fn hwnd_of<R: Runtime>(w: &WebviewWindow<R>) -> Option<isize> {
    w.hwnd().ok().map(|h| h.0 as isize)
}
#[cfg(not(windows))]
fn hwnd_of<R: Runtime>(_w: &WebviewWindow<R>) -> Option<isize> {
    None
}

/// Obdélník monitoru hry ve fyzických px: monitor největšího viditelného okna hry, jinak monitor Opse, jinak hlavní.
fn widgets_rect<R: Runtime>(app: &AppHandle<R>) -> Option<(i32, i32, u32, u32)> {
    if let Some(r) = game_monitor(&game_pids()) {
        return Some(r);
    }
    let m = app
        .get_webview_window(BUDDY)
        .and_then(|b| b.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    Some((m.position().x, m.position().y, m.size().width, m.size().height))
}

/// Okno widgetů přes celý monitor hry (bez aktivace; změna jen při jiném monitoru nebo rozlišení). Poloha se nastaví
/// před velikostí i po ní: přesun na monitor s jiným DPI by jinak velikost přepočítal.
fn fit_widgets<R: Runtime>(app: &AppHandle<R>, w: &WebviewWindow<R>) {
    let Some((x, y, mw, mh)) = widgets_rect(app) else { return };
    if !place_ok(x, y, mw, mh) {
        return;
    }
    if let (Ok(p), Ok(s)) = (w.outer_position(), w.inner_size()) {
        if p.x == x && p.y == y && s.width == mw && s.height == mh {
            return;
        }
    }
    let _ = w.set_position(PhysicalPosition::new(x, y));
    let _ = w.set_size(PhysicalSize::new(mw, mh));
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

/// Otevře okno widgetů (jen hlavní okno, jen se zapnutým Ops). Ve Hře propouští myš a nejde aktivovat.
#[tauri::command]
pub async fn widgets_open<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    if !enabled(&app) {
        return Err("ops:off".into());
    }
    if let Some(w) = app.get_webview_window(WIDGETS) {
        fit_widgets(&app, &w);
        return Ok(());
    }
    let w = WebviewWindowBuilder::new(&app, WIDGETS, WebviewUrl::App("widgets.html".into()))
        .title("Ops widgets")
        .inner_size(640.0, 480.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .focusable(false)
        /* 0.22.1: viditelné hned při vytvoření (SW_SHOWNOACTIVATE v tao); pozdější show() by okno aktivovalo */
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    app.state::<OpsState>().edit.store(false, Ordering::SeqCst);
    w.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    exclude_from_capture(&w);
    fit_widgets(&app, &w);
    Ok(())
}

/// Zavře okno widgetů (hlavní okno: vypnutí widgetů nebo schování Opse). Rozpracované Úpravy se nejdřív ukončí.
#[tauri::command]
pub async fn widgets_close<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    if app.state::<OpsState>().edit.load(Ordering::SeqCst) {
        let _ = set_edit(&app, Some(false));
    }
    if let Some(w) = app.get_webview_window(WIDGETS) {
        let _ = w.destroy();
    }
    app.state::<OpsState>().edit.store(false, Ordering::SeqCst);
    Ok(())
}

/// Úpravy widgetů zapnout (true), vypnout (false) nebo přepnout (bez hodnoty). Klik na Opse, Hotovo / Esc v okně
/// widgetů a tlačítko v Nastavení; zkratku obslouží Rust sám.
#[tauri::command]
pub async fn widgets_edit<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, on: Option<bool>) -> Result<(), String> {
    only(&window, &[MAIN, BUDDY, WIDGETS])?;
    if window.label() == BUDDY {
        buddy_click_guard(&app)?;
    }
    set_edit(&app, on)
}

fn set_edit<R: Runtime>(app: &AppHandle<R>, want: Option<bool>) -> Result<(), String> {
    if !enabled(app) {
        return Err("ops:off".into());
    }
    let w = app.get_webview_window(WIDGETS).ok_or("widgets:off")?;
    let st = app.state::<OpsState>();
    let cur = st.edit.load(Ordering::SeqCst);
    let on = want.unwrap_or(!cur);
    if on == cur {
        if on {
            let _ = w.set_focus();
        }
        return Ok(());
    }
    if on {
        let prev = focus_target(app);
        if let Ok(mut p) = st.edit_focus.lock() {
            *p = prev;
        }
        st.edit.store(true, Ordering::SeqCst);
        if let Ok(mut t) = st.edit_since.lock() {
            *t = Some(Instant::now());
        }
        fit_widgets(app, &w);
        w.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
        let _ = w.set_focusable(true);
        let _ = w.set_focus();
        emit_native(app, WIDGETS, "widgets-mode", "edit");
        emit_native(app, MAIN, "widgets-mode", true);
    } else {
        st.edit.store(false, Ordering::SeqCst);
        /* panel Aplikace otevřený z Úprav se zavře s nimi (vrátí fokus oknu widgetů, to ho pak vrátí hře) */
        hide_overlay(app);
        emit_native(app, WIDGETS, "widgets-mode", "play");
        emit_native(app, MAIN, "widgets-mode", false);
        let _ = w.set_ignore_cursor_events(true);
        let _ = w.set_focusable(false);
        let (prev, pid) = st.edit_focus.lock().map(|p| *p).unwrap_or((0, 0));
        /* hráč mezitím přepnul jinam (Alt+Tab): fokus mu nebrat */
        if foreground_pid() == Some(std::process::id()) {
            restore_focus(prev, pid);
        }
    }
    Ok(())
}

/// Okno widgetů po změně rozlišení, DPI nebo monitoru hry: znovu přes celý monitor hry (bez aktivace).
#[tauri::command]
pub async fn widgets_fit<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    only(&window, &[WIDGETS])?;
    fit_widgets(&app, &window);
    Ok(())
}

/// Tab nebo modul panelu Aplikace (overview, scan, apps, apps:journal …): malá písmena, nejvýš 16 + 16 znaků.
pub fn app_tab_ok(tab: &str) -> bool {
    let mut parts = tab.splitn(2, ':');
    let ok = |p: &str| !p.is_empty() && p.len() <= 16 && p.bytes().all(|b| b.is_ascii_lowercase());
    parts.next().map_or(false, ok) && parts.next().map_or(true, ok)
}

/// Tlačítko Aplikace v Úpravách: otevře stávající panel overlaye (plné moduly), volitelně rovnou na záložce nebo modulu.
#[tauri::command]
pub async fn widgets_app<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, tab: Option<String>) -> Result<(), String> {
    only(&window, &[WIDGETS])?;
    let tab = tab.filter(|t| app_tab_ok(t));
    show_overlay(&app, tab)
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
    buddy_click_guard(window.app_handle())?;
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
    start_capture_as(app, None);
}

/* auto = obrazovka z automatického snímání: bez události capture-start (žádná animace ani zvuk nad hrou). */
fn start_capture_as<R: Runtime>(app: AppHandle<R>, auto: Option<&'static str>) {
    let st = app.state::<OpsState>();
    if st.busy.swap(true, Ordering::SeqCst) {
        return;
    }
    if auto.is_none() {
        emit_native(&app, MAIN, "capture-start", ());
    }
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
                emit_native(&app, MAIN, "capture-ready", CaptureReady { id, width, height, auto });
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
        /* 0.20.0: automatické snímání ve stejné smyčce (žádné další vlákno ani smyčka) */
        let mut auto = AutoGate::default();
        let mut auto_at: Option<Instant> = None;
        let mut auto_seen: Option<Option<&'static str>> = None;
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
            /* 0.22.1: buddy propouští myš, dokud je v popředí hra; Úpravy widgetů skončí, když se hráč vrátí do hry
               (jinak by okno přes celý monitor bralo hře kliky). Jen okenní API, nic se neaktivuje. */
            apply_buddy_pass(&app, fg);
            let since = st.edit_since.lock().map(|t| *t).unwrap_or(None);
            if edit_must_end(st.edit.load(Ordering::SeqCst), fg, since, now) {
                let _ = set_edit(&app, Some(false));
            }
            /* 0.20.0: pás s nadpisy jen při zapnutém automatickém snímání a hře v popředí (vidět, ne minimalizovaná) */
            if auto_due(st.auto_on.load(Ordering::SeqCst), shown, fg, auto_at, now) {
                auto_at = Some(now);
                let mask = st.auto_mask.load(Ordering::SeqCst);
                let t0 = Instant::now();
                /* 0.22.1: bez známé obrazovky ještě kontrola inventáře v raidu (jen signál pro průběh raidu, žádný snímek) */
                let (seen, raid, bytes) = match capture_header_strip() {
                    Ok((w, h, screen_h, rgba)) => {
                        let f = header::Frame { w: w as usize, h: h as usize, screen_h: screen_h as usize, rgba: &rgba };
                        let seen = header::classify(&f, mask).map(|x| x.0);
                        (seen, seen.is_none() && header::in_raid(&f), rgba.len() as u64)
                    }
                    Err(_) => (None, false, 0),
                };
                let us = t0.elapsed().as_micros() as u64;
                let fire = auto.update(seen, now);
                if let Ok(mut s) = st.auto_stats.lock() {
                    s.ticks += 1;
                    s.total_us += us;
                    s.last_us = us;
                    s.max_us = s.max_us.max(us);
                    s.strip_bytes = bytes;
                    s.screen = auto_label(seen, raid);
                    if fire.is_some() {
                        s.captures += 1;
                    }
                }
                let label = auto_label(seen, raid);
                if auto_seen != Some(label) {
                    auto_seen = Some(label);
                    emit_native(&app, MAIN, "auto-screen", label);
                }
                if let Some(screen) = fire {
                    start_capture_as(app.clone(), Some(screen.id()));
                }
            }
            std::thread::sleep(WATCH_TICK);
        }
    });
    Ok(())
}

/* ----- 0.22.1: buddy propouští kliky do hry ----- */

/// Zapne nebo vypne „Buddy propouští kliky do hry“ (jen hlavní okno, výchozí zapnuto). Okno buddyho se hned
/// nastaví podle okna v popředí; dál ho přepíná hlídací smyčka `ops_watch`.
#[tauri::command]
pub async fn ops_passthrough<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, on: bool) -> Result<(), String> {
    main_only(&window)?;
    app.state::<OpsState>().pass_off.store(!on, Ordering::SeqCst);
    refresh_buddy_pass(&app);
    Ok(())
}

/// Má buddy propouštět myš do hry? Při hře v popředí podle volby, nad vlastním oknem, jiným programem nebo
/// plochou ne (buddy jde kliknout jako dřív). Krátce žádné okno v popředí (přepínání oken) nic nemění.
pub fn buddy_pass_through(pref_on: bool, fg: Foreground, prev: bool) -> bool {
    match fg {
        Foreground::Game => pref_on,
        Foreground::None => pref_on && prev,
        Foreground::Own | Foreground::Other => false,
    }
}

/// Smí klik (tažení, overlay, Úpravy) z buddyho něco udělat? Ne, když je v popředí hra a buddy má propouštět kliky:
/// klik, který k buddymu dorazil dřív, než se okno přeplo, tak hře nevezme fokus.
pub fn buddy_click_ok(pref_on: bool, fg: Foreground) -> bool {
    !(pref_on && fg == Foreground::Game)
}

/// Úpravy widgetů běží chvíli po zapnutí bez kontroly (zkratka nebo klik převádí fokus).
pub const EDIT_GRACE: Duration = Duration::from_secs(1);

/// Skončit Úpravy widgetů? Ano, když je v popředí hra (hráč se do ní vrátil) a Úpravy běží aspoň EDIT_GRACE.
pub fn edit_must_end(editing: bool, fg: Foreground, since: Option<Instant>, now: Instant) -> bool {
    editing && fg == Foreground::Game && since.map_or(true, |t| now.saturating_duration_since(t) >= EDIT_GRACE)
}

/* Okno v popředí teď (jen čtení: okno v popředí a názvy procesů). */
fn foreground_now() -> Foreground {
    let pids = game_pids();
    classify_foreground(foreground_pid(), std::process::id(), &pids)
}

/* Nastaví propouštění myši oknem buddyho podle okna v popředí (jen při změně). */
fn apply_buddy_pass<R: Runtime>(app: &AppHandle<R>, fg: Foreground) {
    let Some(w) = app.get_webview_window(BUDDY) else { return };
    let st = app.state::<OpsState>();
    let prev = st.buddy_pass.load(Ordering::SeqCst);
    /* neumístěný buddy propouští myš vždy */
    let want = !st.buddy_ready.load(Ordering::SeqCst) || buddy_pass_through(!st.pass_off.load(Ordering::SeqCst), fg, prev);
    if want != prev && w.set_ignore_cursor_events(want).is_ok() {
        st.buddy_pass.store(want, Ordering::SeqCst);
    }
}

fn refresh_buddy_pass<R: Runtime>(app: &AppHandle<R>) {
    if app.get_webview_window(BUDDY).is_some() {
        apply_buddy_pass(app, foreground_now());
    }
}

/* Klik z buddyho při hře v popředí: nic neotevřít ani netáhnout, jen okno přepnout na propouštění myši. */
fn buddy_click_guard<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let fg = foreground_now();
    if buddy_click_ok(!app.state::<OpsState>().pass_off.load(Ordering::SeqCst), fg) {
        return Ok(());
    }
    apply_buddy_pass(app, fg);
    Err("buddy:pass".into())
}

/* ----- 0.20.0: automatické snímání obrazovek mimo raid ----- */

/// Zapne nebo vypne automatické snímání a vybere obrazovky (bity `header::Screen`). Jen hlavní okno a jen při
/// zapnutém Ops. Samotné hlídání běží v `ops_watch` (hub ho při zapnutém snímání spustí).
#[tauri::command]
pub async fn ops_autocapture<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, on: bool, screens: u32) -> Result<(), String> {
    main_only(&window)?;
    let st = app.state::<OpsState>();
    if on && !st.enabled.load(Ordering::SeqCst) {
        return Err("ops:off".into());
    }
    st.auto_mask.store(screens & header::ALL_BITS, Ordering::SeqCst);
    st.auto_on.store(on && screens & header::ALL_BITS != 0, Ordering::SeqCst);
    Ok(())
}

/// Měření automatického snímání pro Nastavení (jen hlavní okno, jen čtení).
#[tauri::command]
pub async fn ops_autostats<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<AutoStats, String> {
    main_only(&window)?;
    let st = app.state::<OpsState>();
    let s = st.auto_stats.lock().map_err(|_| "auto:failed")?.clone();
    Ok(s)
}

/// Co automatické snímání hlásí hlavnímu oknu: známá obrazovka, jinak „inRaid“ (inventář v raidu), jinak nic.
/// „inRaid“ jen posune průběh raidu, plný snímek spouští jen `AutoGate` podle obrazovky (0.22.1).
pub fn auto_label(seen: Option<header::Screen>, in_raid: bool) -> Option<&'static str> {
    match seen {
        Some(s) => Some(s.id()),
        None if in_raid => Some(IN_RAID_ID),
        None => None,
    }
}
pub const IN_RAID_ID: &str = "inRaid";

/// Je čas na další pás s nadpisy? Jen při zapnutém snímání, viditelné hře v popředí a nejdřív AUTO_EVERY po minulém.
pub fn auto_due(on: bool, game_shown: bool, fg: Foreground, last: Option<Instant>, now: Instant) -> bool {
    on && game_shown && fg == Foreground::Game && last.map_or(true, |t| now.saturating_duration_since(t) >= AUTO_EVERY)
}

/* Kolikrát po sobě musí pás ukázat stejnou obrazovku (přechodové animace) a kolik kroků bez ní ukončí „výskyt“. */
const AUTO_CONFIRM: u32 = 2;
const AUTO_GONE: u32 = 2;

/// Rozhoduje, kdy pořídit plný snímek: jednou za každý výskyt známé obrazovky (potvrzený dvěma kroky po sobě),
/// jen když se liší od naposledy zpracované, a nejdřív AUTO_COOLDOWN po předchozím. Výskyt končí jinou obrazovkou
/// nebo AUTO_GONE kroky bez známé obrazovky; krátké zakrytí (jeden krok) ho neukončí.
#[derive(Default, Debug)]
pub struct AutoGate {
    cur: Option<header::Screen>,
    streak: u32,
    gone: u32,
    fired: Option<header::Screen>,
    last_fire: Option<Instant>,
}

impl AutoGate {
    pub fn update(&mut self, seen: Option<header::Screen>, now: Instant) -> Option<header::Screen> {
        if seen == self.cur {
            self.streak = self.streak.saturating_add(1);
        } else {
            self.cur = seen;
            self.streak = 1;
        }
        let Some(s) = seen else {
            self.gone = self.gone.saturating_add(1);
            if self.gone >= AUTO_GONE {
                self.fired = None;
            }
            return None;
        };
        self.gone = 0;
        if self.fired.is_some() && self.fired != Some(s) {
            self.fired = None;
        }
        let cooled = self.last_fire.map_or(true, |t| now.saturating_duration_since(t) >= AUTO_COOLDOWN);
        if self.streak >= AUTO_CONFIRM && self.fired.is_none() && cooled {
            self.fired = Some(s);
            self.last_fire = Some(now);
            return Some(s);
        }
        None
    }
}

/// Rozpoznání známé obrazovky podle pásu s nadpisy (0.20.0). Pás = horních STRIP_UNITS z 1080 jednotek výšky
/// obrazovky (UI hry se škáluje podle výšky). Z pásu se v oblastech sond spočítá hrubá mřížka „světlého písma“
/// (buňka CELL × CELL jednotek: světlý neutrální nebo krémový pixel) a porovná se se vzorem (Jaccardova shoda,
/// posun o jednu buňku). Vzory jsou malé binární masky nadpisů vygenerované z vlastních snímků hráče
/// (src-tauri/tests/headers.rs, GEN_HEADERS=1; snímky se nikdy necommitují), jako vzory písmen v core/vision.
/// Obrazovka platí, když všechny její sondy projdou prahem (záporná sonda naopak nesmí). Novou obrazovku jde
/// doplnit přidáním sondy do GEOS a obrazovky do DEFS. Čisté funkce, jen čtou pixely.
pub mod header {
    pub const CELL: i32 = 2;
    pub const STRIP_UNITS: i32 = 240;
    /* shoda sondy od tohoto prahu; záporná sonda musí zůstat pod NEG_MAX */
    pub const THRESH: f32 = 0.6;
    pub const NEG_MAX: f32 = 0.35;

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Screen {
        Loadout,
        Findings,
        KnockedOut,
        Stash,
        Profile,
        Workshop,
        Quests,
        Skills,
    }
    pub const ALL: [Screen; 8] = [
        Screen::Loadout,
        Screen::Findings,
        Screen::KnockedOut,
        Screen::Stash,
        Screen::Profile,
        Screen::Workshop,
        Screen::Quests,
        Screen::Skills,
    ];
    pub const ALL_BITS: u32 = (1 << ALL.len()) - 1;
    impl Screen {
        pub fn id(self) -> &'static str {
            match self {
                Screen::Loadout => "loadout",
                Screen::Findings => "findings",
                Screen::KnockedOut => "knockedOut",
                Screen::Stash => "stash",
                Screen::Profile => "profile",
                Screen::Workshop => "workshop",
                Screen::Quests => "quests",
                Screen::Skills => "skills",
            }
        }
        pub fn bit(self) -> u32 {
            1 << (self as u32)
        }
        pub fn from_id(id: &str) -> Option<Screen> {
            ALL.iter().copied().find(|s| s.id() == id)
        }
    }

    /// Ukotvení sondy: od levé hrany, od středu, nebo od pravé hrany obrazovky (souřadnice pro 1920 × 1080).
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Anchor {
        L,
        C,
        R,
    }
    /// Sonda: obdélník v jednotkách 1080p (násobky CELL) a snímek, ze kterého se generuje vzor.
    pub struct Geo {
        pub name: &'static str,
        pub anchor: Anchor,
        pub x: i32,
        pub y: i32,
        pub w: i32,
        pub h: i32,
        pub src: &'static str,
    }
    use Anchor::{C, L, R};
    pub const GEOS: &[Geo] = &[
        /* MANAGE LOADOUT vlevo nahoře (příprava před raidem) */
        Geo { name: "manage", anchor: L, x: 136, y: 16, w: 204, h: 32, src: "own-prerade-free-loadout.png" },
        /* LOADOUT nad výbavou na obrazovce výsledku raidu a nadpis KNOCKED OUT */
        Geo { name: "res-loadout", anchor: C, x: 792, y: 204, w: 124, h: 28, src: "own-after-raid-survived-findings.png" },
        Geo { name: "res-knocked", anchor: C, x: 708, y: 146, w: 304, h: 40, src: "own-after-raid-knocked-out.png" },
        /* za KNOCKED OUT je tma; delší nadpis přežití (RETURNING TO SPERANZA) tam pokračuje */
        Geo { name: "res-knocked-end", anchor: C, x: 1020, y: 146, w: 200, h: 40, src: "own-after-raid-knocked-out.png" },
        /* INVENTORY: zvýrazněná záložka a nadpis STASH */
        Geo { name: "inv-pill", anchor: C, x: 762, y: 10, w: 152, h: 44, src: "own-all-1-top.png" },
        Geo { name: "stash-label", anchor: L, x: 146, y: 142, w: 86, h: 28, src: "own-all-1-top.png" },
        /* hlavní nabídka: zvýrazněná záložka RAIDER (profil) nebo WORKSHOP; horní hrana „pilulky“ odliší nevybranou */
        Geo { name: "raider-pill", anchor: L, x: 306, y: 10, w: 110, h: 44, src: "return-and-progression/profile.png" },
        Geo { name: "raider-edge", anchor: L, x: 318, y: 8, w: 84, h: 8, src: "return-and-progression/profile.png" },
        Geo { name: "workshop-pill", anchor: L, x: 162, y: 10, w: 150, h: 44, src: "return-and-progression/workshop-overview.png" },
        Geo { name: "workshop-edge", anchor: L, x: 176, y: 8, w: 122, h: 8, src: "return-and-progression/workshop-overview.png" },
        /* detail stanice: krémový panel vpravo začíná níž než panel úkolu */
        Geo { name: "station-panel", anchor: R, x: 1410, y: 168, w: 160, h: 20, src: "return-and-progression/gear-level.png" },
        /* úkol obchodníka: krémový panel cílů vpravo nahoře */
        Geo { name: "quest-panel", anchor: R, x: 1410, y: 116, w: 160, h: 20, src: "return-and-progression/quest-shoring.png" },
        /* tmavá mezera vlevo od krémového panelu (celobílý snímek tak panel nepředstírá) */
        Geo { name: "quest-gap", anchor: R, x: 1362, y: 116, w: 36, h: 20, src: "return-and-progression/quest-shoring.png" },
        Geo { name: "station-gap", anchor: R, x: 1362, y: 168, w: 36, h: 20, src: "return-and-progression/gear-level.png" },
        /* SKILL TREE vlevo nahoře */
        Geo { name: "skill-title", anchor: L, x: 136, y: 16, w: 116, h: 32, src: "return-and-progression/skill-tree.png" },
        /* za SKILL TREE je tma (detail stanice tam má „— LEVEL 01“ a záložky) */
        Geo { name: "skill-end", anchor: L, x: 258, y: 16, w: 160, h: 32, src: "return-and-progression/skill-tree.png" },
        /* 0.22.1: inventář V RAIDU: zvýrazněná záložka INVENTORY vlevo od středu, nadpis LOADOUT pod ní (jinde než na
           MANAGE LOADOUT i na výsledku raidu) a za záložkou šedé CRAFTING MAP LOGBOOK SYSTEM (šedá není světlé písmo,
           sonda tedy hlídá, že tam žádné světlé písmo není). Jen signál „v raidu“ (IN_RAID), nikdy obrazovka pro
           snímek: v DEFS není a Screen ho nezná. */
        Geo { name: "raid-pill", anchor: C, x: 654, y: 20, w: 152, h: 48, src: "own-inraid-inventory.png" },
        Geo { name: "raid-loadout", anchor: C, x: 726, y: 166, w: 124, h: 30, src: "own-inraid-inventory.png" },
        Geo { name: "raid-tabs", anchor: C, x: 812, y: 24, w: 444, h: 40, src: "own-inraid-inventory.png" },
    ];

    /// 0.22.1: sondy inventáře v raidu. Shoda všech = hráč je v raidu. Nikdy nespustí plný snímek (fair play: snímá se
    /// jen mimo raid), jen posune průběh raidu do fáze „v raidu“ (core/raidLife.ts).
    pub const IN_RAID: &[&str] = &["raid-pill", "raid-loadout", "raid-tabs"];

    /// Je v pásu inventář v raidu? Jen čtení pixelů pásu, který už automatické snímání má.
    pub fn in_raid(f: &Frame) -> bool {
        if f.w == 0 || f.h == 0 || f.screen_h == 0 || f.rgba.len() < f.w * f.h * 4 {
            return false;
        }
        IN_RAID.iter().all(|p| probe(f, p) >= THRESH)
    }

    /// Obrazovka a její sondy (`!` = záporná sonda). Pořadí rozhoduje: konkrétnější obrazovka je dřív.
    pub struct Def {
        pub screen: Screen,
        pub probes: &'static [&'static str],
    }
    pub const DEFS: &[Def] = &[
        Def { screen: Screen::KnockedOut, probes: &["res-loadout", "res-knocked", "res-knocked-end"] },
        Def { screen: Screen::Findings, probes: &["res-loadout"] },
        Def { screen: Screen::Loadout, probes: &["manage"] },
        Def { screen: Screen::Stash, probes: &["inv-pill", "stash-label"] },
        Def { screen: Screen::Profile, probes: &["raider-pill", "raider-edge"] },
        Def { screen: Screen::Workshop, probes: &["workshop-pill", "workshop-edge"] },
        Def { screen: Screen::Quests, probes: &["quest-panel", "quest-gap"] },
        Def { screen: Screen::Workshop, probes: &["station-panel", "station-gap", "!quest-panel"] },
        Def { screen: Screen::Skills, probes: &["skill-title", "skill-end"] },
    ];

    include!("ops_headers.in");

    /// Vzor sondy (řádky '#' a '.'), nebo None, když ještě není vygenerovaný.
    pub fn bits(name: &str) -> Option<&'static [&'static str]> {
        BITS.iter().find(|(n, _)| *n == name).map(|(_, b)| *b)
    }
    pub fn geo(name: &str) -> Option<&'static Geo> {
        GEOS.iter().find(|g| g.name == name)
    }

    /// Pás s nadpisy: RGBA, šířka a výška pásu v px a výška celé obrazovky (měřítko UI).
    pub struct Frame<'a> {
        pub w: usize,
        pub h: usize,
        pub screen_h: usize,
        pub rgba: &'a [u8],
    }

    /// Výška pásu v px pro obrazovku vysokou `screen_h` px.
    pub fn strip_rows(screen_h: u32) -> u32 {
        ((screen_h as u64 * STRIP_UNITS as u64 + 1079) / 1080).min(screen_h as u64) as u32
    }

    /// Světlé písmo: jasný neutrální nebo krémový pixel (bílá, krém tlačítek a panelů), ne barevný.
    #[inline]
    pub fn is_ink(r: u8, g: u8, b: u8) -> bool {
        let (r, g, b) = (r as i32, g as i32, b as i32);
        let lum = (299 * r + 587 * g + 114 * b) / 1000;
        let spread = r.max(g).max(b) - r.min(g).min(b);
        lum >= 170 && spread <= 70
    }

    /// Mřížka světlého písma v obdélníku sondy rozšířeném o jednu buňku na každou stranu ((w/CELL+2) × (h/CELL+2)).
    /// Buňka je „písmo“, když je světlá aspoň čtvrtina pixelů; mimo pás je prázdná.
    pub fn grid(f: &Frame, g: &Geo) -> (usize, usize, Vec<bool>) {
        let u = f.screen_h as f32 / 1080.0;
        let wu = f.w as f32 / u;
        let ox = match g.anchor {
            Anchor::L => g.x as f32,
            Anchor::C => wu / 2.0 + (g.x as f32 - 960.0),
            Anchor::R => wu - (1920.0 - g.x as f32),
        } - CELL as f32;
        let oy = (g.y - CELL) as f32;
        let (cw, ch) = ((g.w / CELL) as usize + 2, (g.h / CELL) as usize + 2);
        let mut out = vec![false; cw * ch];
        for cy in 0..ch {
            let y0 = ((oy + (cy as i32 * CELL) as f32) * u).floor() as i64;
            let y1 = (((oy + ((cy as i32 + 1) * CELL) as f32) * u).ceil() as i64).max(y0 + 1);
            if y0 < 0 || y1 > f.h as i64 {
                continue;
            }
            for cx in 0..cw {
                let x0 = ((ox + (cx as i32 * CELL) as f32) * u).floor() as i64;
                let x1 = (((ox + ((cx as i32 + 1) * CELL) as f32) * u).ceil() as i64).max(x0 + 1);
                if x0 < 0 || x1 > f.w as i64 {
                    continue;
                }
                let (mut on, mut n) = (0u32, 0u32);
                for y in y0..y1 {
                    let row = y as usize * f.w * 4;
                    for x in x0..x1 {
                        let i = row + x as usize * 4;
                        n += 1;
                        if is_ink(f.rgba[i], f.rgba[i + 1], f.rgba[i + 2]) {
                            on += 1;
                        }
                    }
                }
                out[cy * cw + cx] = n > 0 && on * 4 >= n;
            }
        }
        (cw, ch, out)
    }

    /// Mřížka sondy bez posunu (pro generování vzoru): řádky '#' a '.'.
    pub fn template_rows(f: &Frame, g: &Geo) -> Vec<String> {
        let (cw, ch, cells) = grid(f, g);
        (1..ch - 1).map(|y| (1..cw - 1).map(|x| if cells[y * cw + x] { '#' } else { '.' }).collect()).collect()
    }

    /// Shoda sondy se vzorem (0–1), nejlepší přes posun o -1, 0, +1 buňku v obou osách: buňky písma vzoru musí
    /// v pásu ležet přesně (rozliší text), písmo navíc se ale nepočítá, když sousedí s písmem vzoru (tenká čára
    /// při neceločíselném měřítku vyjde o buňku tlustší). shoda = nalezené buňky vzoru / (buňky vzoru + písmo
    /// daleko od vzoru); obojí prázdné = 1.
    pub fn score(f: &Frame, g: &Geo, rows: &[&str]) -> f32 {
        let (cw, ch, cells) = grid(f, g);
        let (tw, th) = (cw - 2, ch - 2);
        if rows.len() != th || rows.iter().any(|r| r.len() != tw) {
            return 0.0;
        }
        let tpl: Vec<bool> = rows.iter().flat_map(|r| r.bytes().map(|b| b == b'#')).collect();
        /* písmo vzoru rozšířené o jednu buňku */
        let mut dil = vec![false; tw * th];
        for y in 0..th {
            for x in 0..tw {
                if tpl[y * tw + x] {
                    for yy in y.saturating_sub(1)..=(y + 1).min(th - 1) {
                        for xx in x.saturating_sub(1)..=(x + 1).min(tw - 1) {
                            dil[yy * tw + xx] = true;
                        }
                    }
                }
            }
        }
        let nt = tpl.iter().filter(|&&b| b).count() as u32;
        let mut best = 0.0f32;
        for dy in 0..3 {
            for dx in 0..3 {
                let (mut hit, mut far) = (0u32, 0u32);
                for y in 0..th {
                    for x in 0..tw {
                        let a = cells[(y + dy) * cw + x + dx];
                        let i = y * tw + x;
                        if a && tpl[i] {
                            hit += 1;
                        } else if a && !dil[i] {
                            far += 1;
                        }
                    }
                }
                let s = if nt + far == 0 { 1.0 } else { hit as f32 / (nt + far) as f32 };
                best = best.max(s);
            }
        }
        best
    }

    /// Shoda pojmenované sondy (0 bez vzoru).
    pub fn probe(f: &Frame, name: &str) -> f32 {
        match (geo(name), bits(name)) {
            (Some(g), Some(b)) => score(f, g, b),
            _ => 0.0,
        }
    }

    /// Známá obrazovka v pásu (jen vybrané bity `mask`) a její skóre (nejhorší kladná sonda), nebo None.
    pub fn classify(f: &Frame, mask: u32) -> Option<(Screen, f32)> {
        if f.w == 0 || f.h == 0 || f.screen_h == 0 || f.rgba.len() < f.w * f.h * 4 {
            return None;
        }
        let mut cache: Vec<(&str, f32)> = Vec::new();
        for d in DEFS {
            if mask & d.screen.bit() == 0 {
                continue;
            }
            let mut worst = 1.0f32;
            let mut ok = true;
            for p in d.probes {
                let (neg, name) = match p.strip_prefix('!') {
                    Some(n) => (true, n),
                    None => (false, *p),
                };
                let s = match cache.iter().find(|(n, _)| *n == name) {
                    Some((_, s)) => *s,
                    None => {
                        let s = probe(f, name);
                        cache.push((name, s));
                        s
                    }
                };
                if neg {
                    ok &= s < NEG_MAX;
                } else {
                    ok &= s >= THRESH;
                    worst = worst.min(s);
                }
                if !ok {
                    break;
                }
            }
            if ok {
                return Some((d.screen, worst));
            }
        }
        None
    }
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
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW, MonitorFromWindow,
        ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTONULL, MONITOR_DEFAULTTOPRIMARY,
        SRCCOPY,
    };
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible, GetForegroundWindow, IsWindow, SetForegroundWindow, SetWindowDisplayAffinity, ShowWindow, SW_SHOWMINNOACTIVE,
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
        capture_monitor(false).map(|(w, h, _, rgba)| (w, h, rgba))
    }

    /// 0.20.0: jen horní pás téhož monitoru s nadpisy obrazovek (header::STRIP_UNITS z 1080 jednotek výšky).
    /// Vrací šířku a výšku pásu, výšku celé obrazovky a RGBA pásu.
    pub fn capture_header_strip() -> Result<(u32, u32, u32, Vec<u8>), String> {
        capture_monitor(true)
    }

    fn capture_monitor(strip: bool) -> Result<(u32, u32, u32, Vec<u8>), String> {
        unsafe {
            let fg = GetForegroundWindow();
            let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTOPRIMARY);
            let mut mi: MONITORINFO = zeroed();
            mi.cbSize = size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(mon, &mut mi) == 0 {
                return Err("capture:failed".into());
            }
            let r = mi.rcMonitor;
            let (w, screen_h) = (r.right - r.left, r.bottom - r.top);
            if w <= 0 || screen_h <= 0 || w > super::MAX_SIDE || screen_h > super::MAX_SIDE {
                return Err("capture:failed".into());
            }
            let h = if strip { super::header::strip_rows(screen_h as u32) as i32 } else { screen_h };
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
                    out = Ok((w as u32, h as u32, screen_h as u32, rgba));
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
        game_window(pids).is_some()
    }

    /// Největší viditelné, neminimalizované okno procesů hry (HWND jako číslo a id procesu). Jen čtení.
    pub fn game_window(pids: &[u32]) -> Option<(isize, u32)> {
        struct Find<'a> {
            pids: &'a [u32],
            best: Option<(isize, u32, i64)>,
        }
        unsafe extern "system" fn check(hwnd: HWND, data: isize) -> i32 {
            let f = &mut *(data as *mut Find);
            if IsWindowVisible(hwnd) != 0 && IsIconic(hwnd) == 0 {
                let mut pid = 0;
                GetWindowThreadProcessId(hwnd, &mut pid);
                if f.pids.contains(&pid) {
                    let mut r: RECT = zeroed();
                    let area = if GetWindowRect(hwnd, &mut r) != 0 { (r.right - r.left) as i64 * (r.bottom - r.top) as i64 } else { 0 };
                    if f.best.map_or(true, |b| area > b.2) {
                        f.best = Some((hwnd as isize, pid, area));
                    }
                }
            }
            1
        }
        if pids.is_empty() {
            return None;
        }
        let mut f = Find { pids, best: None };
        unsafe {
            EnumWindows(Some(check), &mut f as *mut Find as isize);
        }
        f.best.map(|b| (b.0, b.1))
    }

    /// Celý monitor, na kterém je okno hry (fyzické px). Bez okna hry nic.
    pub fn game_monitor(pids: &[u32]) -> Option<(i32, i32, u32, u32)> {
        let (h, _) = game_window(pids)?;
        unsafe {
            let mon = MonitorFromWindow(h as HWND, MONITOR_DEFAULTTONULL);
            if mon.is_null() {
                return None;
            }
            let mut mi: MONITORINFO = zeroed();
            mi.cbSize = size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(mon, &mut mi) == 0 {
                return None;
            }
            let r = mi.rcMonitor;
            let (w, hh) = (r.right - r.left, r.bottom - r.top);
            if w <= 0 || hh <= 0 {
                return None;
            }
            Some((r.left, r.top, w as u32, hh as u32))
        }
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
}

#[cfg(windows)]
use win::{capture_foreground_monitor, capture_header_strip, foreground, foreground_pid, game_monitor, game_pids, game_window, game_window_shown, process_names, restore_focus};

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
fn capture_header_strip() -> Result<(u32, u32, u32, Vec<u8>), String> {
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
fn game_window(_pids: &[u32]) -> Option<(isize, u32)> {
    None
}
#[cfg(not(windows))]
fn game_monitor(_pids: &[u32]) -> Option<(i32, i32, u32, u32)> {
    None
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

    /* 0.22.1: buddy propouští kliky do hry, jen když je v popředí hra (a volba je zapnutá) */
    #[test]
    fn buddy_propousti_kliky_jen_pri_hre_v_popredi() {
        use Foreground::*;
        for prev in [false, true] {
            assert!(buddy_pass_through(true, Game, prev));
            assert!(!buddy_pass_through(false, Game, prev));
            for fg in [Own, Other] {
                assert!(!buddy_pass_through(true, fg, prev));
                assert!(!buddy_pass_through(false, fg, prev));
            }
            /* krátce žádné okno: beze změny, s vypnutou volbou nikdy */
            assert_eq!(buddy_pass_through(true, None, prev), prev);
            assert!(!buddy_pass_through(false, None, prev));
        }
        /* zařazení okna v popředí podle procesu: hra / vlastní okno / jiný program */
        assert!(buddy_pass_through(true, classify_foreground(Some(77), 10, &[77]), false));
        assert!(!buddy_pass_through(true, classify_foreground(Some(10), 10, &[77]), false));
        assert!(!buddy_pass_through(true, classify_foreground(Some(5), 10, &[77]), false));
    }

    #[test]
    fn klik_z_buddyho_pri_hre_v_popredi_se_odmitne() {
        use Foreground::*;
        assert!(!buddy_click_ok(true, Game));
        assert!(buddy_click_ok(false, Game));
        for fg in [Own, Other, None] {
            assert!(buddy_click_ok(true, fg));
            assert!(buddy_click_ok(false, fg));
        }
    }

    #[test]
    fn upravy_widgetu_skonci_po_navratu_do_hry() {
        use Foreground::*;
        let t0 = Instant::now();
        let late = t0 + EDIT_GRACE;
        assert!(edit_must_end(true, Game, Some(t0), late));
        assert!(edit_must_end(true, Game, Option::None, t0));
        /* hned po zapnutí (fokus se ještě převádí) ne */
        assert!(!edit_must_end(true, Game, Some(t0), t0 + Duration::from_millis(300)));
        for fg in [Own, Other, None] {
            assert!(!edit_must_end(true, fg, Some(t0), late));
        }
        assert!(!edit_must_end(false, Game, Some(t0), late));
    }

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
    fn zalozka_panelu_aplikace() {
        for ok in ["apps", "scan", "overview", "apps:journal", "apps:checklist"] {
            assert!(app_tab_ok(ok), "{ok}");
        }
        let long = "a".repeat(17);
        for bad in ["", "Apps", "apps:", ":x", "apps:journal:x", long.as_str(), "apps:Jo", "scan/1", "apps:j-1"] {
            assert!(!app_tab_ok(bad), "{bad}");
        }
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

    /* ----- 0.20.0: automatické snímání ----- */
    use header::{Anchor, Screen};

    #[test]
    fn auto_jen_pri_hre_v_popredi_a_zapnutem_snimani() {
        let t0 = Instant::now();
        assert!(auto_due(true, true, Foreground::Game, None, t0));
        assert!(!auto_due(false, true, Foreground::Game, None, t0), "vypnuté snímání");
        assert!(!auto_due(true, false, Foreground::Game, None, t0), "hra minimalizovaná nebo zakrytá");
        for fg in [Foreground::Own, Foreground::Other, Foreground::None] {
            assert!(!auto_due(true, true, fg, None, t0), "{fg:?}");
        }
        /* nejdřív po AUTO_EVERY */
        assert!(!auto_due(true, true, Foreground::Game, Some(t0), ms(t0, 1_999)));
        assert!(auto_due(true, true, Foreground::Game, Some(t0), ms(t0, 2_000)));
    }

    #[test]
    fn auto_jeden_snimek_za_vyskyt_obrazovky() {
        let t0 = Instant::now();
        let mut g = AutoGate::default();
        let s = |n: u64| ms(t0, n * 2_000);
        /* potvrzení dvěma kroky po sobě */
        assert_eq!(g.update(Some(Screen::Loadout), s(0)), None);
        assert_eq!(g.update(Some(Screen::Loadout), s(1)), Some(Screen::Loadout));
        /* stejná obrazovka dál: nic */
        for n in 2..10 {
            assert_eq!(g.update(Some(Screen::Loadout), s(n)), None);
        }
        /* krátké zakrytí (jeden krok bez obrazovky) výskyt neukončí */
        assert_eq!(g.update(None, s(10)), None);
        assert_eq!(g.update(Some(Screen::Loadout), s(11)), None);
        assert_eq!(g.update(Some(Screen::Loadout), s(12)), None);
        /* raid: dlouho žádná známá obrazovka, pak výsledek */
        for n in 13..100 {
            assert_eq!(g.update(None, s(n)), None);
        }
        assert_eq!(g.update(Some(Screen::Findings), s(100)), None);
        assert_eq!(g.update(Some(Screen::Findings), s(101)), Some(Screen::Findings));
        assert_eq!(g.update(Some(Screen::Findings), s(102)), None);
        /* zpět na loadout po dvou krocích bez obrazovky = nový výskyt */
        assert_eq!(g.update(None, s(103)), None);
        assert_eq!(g.update(None, s(104)), None);
        assert_eq!(g.update(Some(Screen::Loadout), s(105)), None);
        assert_eq!(g.update(Some(Screen::Loadout), s(106)), Some(Screen::Loadout));
    }

    #[test]
    fn auto_prechodovy_snimek_a_odstup() {
        let t0 = Instant::now();
        let mut g = AutoGate::default();
        /* jediný krok s obrazovkou (přechodová animace) nestačí */
        assert_eq!(g.update(Some(Screen::Stash), t0), None);
        assert_eq!(g.update(None, ms(t0, 2_000)), None);
        assert_eq!(g.update(Some(Screen::Stash), ms(t0, 4_000)), None);
        assert_eq!(g.update(Some(Screen::Stash), ms(t0, 6_000)), Some(Screen::Stash));
        /* rychlé přepnutí na jinou obrazovku: čeká se na AUTO_COOLDOWN, pak jeden snímek */
        assert_eq!(g.update(Some(Screen::Profile), ms(t0, 8_000)), None);
        assert_eq!(g.update(Some(Screen::Profile), ms(t0, 10_000)), None, "odstup 8 s od minulého snímku");
        assert_eq!(g.update(Some(Screen::Profile), ms(t0, 14_000)), Some(Screen::Profile));
        assert_eq!(g.update(Some(Screen::Profile), ms(t0, 16_000)), None);
        /* zpět na STASH bez mezery: jiná obrazovka = nový výskyt */
        assert_eq!(g.update(Some(Screen::Stash), ms(t0, 24_000)), None);
        assert_eq!(g.update(Some(Screen::Stash), ms(t0, 26_000)), Some(Screen::Stash));
    }

    #[test]
    fn auto_obrazovky_maji_bity_a_id() {
        assert_eq!(header::ALL_BITS, 0xff);
        for s in header::ALL {
            assert_eq!(Screen::from_id(s.id()), Some(s));
            assert_eq!(s.bit().count_ones(), 1);
        }
        assert_eq!(Screen::from_id("raid"), None);
        assert_eq!(header::strip_rows(1080), 240);
        assert_eq!(header::strip_rows(1440), 320);
        assert_eq!(header::strip_rows(2160), 480);
        assert_eq!(header::strip_rows(100), 23);
    }

    /* Umělý pás: tmavé pozadí se šumem a světlé buňky vzorů vybraných sond (v měřítku obrazovky). */
    fn synth(w: usize, screen_h: usize, probes: &[&str], seed: u32) -> Vec<u8> {
        let h = header::strip_rows(screen_h as u32) as usize;
        let mut px = vec![0u8; w * h * 4];
        let mut r = seed.wrapping_mul(2_654_435_761).max(1);
        for p in px.chunks_exact_mut(4) {
            r ^= r << 13;
            r ^= r >> 17;
            r ^= r << 5;
            let v = 8 + (r % 70) as u8;
            p.copy_from_slice(&[v, v + 4, v + 12, 255]);
        }
        let u = screen_h as f32 / 1080.0;
        let wu = w as f32 / u;
        for name in probes {
            let g = header::geo(name).unwrap();
            let rows = header::bits(name).unwrap();
            let ox = match g.anchor {
                Anchor::L => g.x as f32,
                Anchor::C => wu / 2.0 + (g.x as f32 - 960.0),
                Anchor::R => wu - (1920.0 - g.x as f32),
            };
            for (cy, row) in rows.iter().enumerate() {
                for (cx, b) in row.bytes().enumerate() {
                    if b != b'#' {
                        continue;
                    }
                    let x0 = ((ox + (cx as i32 * header::CELL) as f32) * u).round() as usize;
                    let x1 = ((ox + ((cx as i32 + 1) * header::CELL) as f32) * u).round() as usize;
                    let y0 = (((g.y + cy as i32 * header::CELL) as f32) * u).round() as usize;
                    let y1 = (((g.y + (cy as i32 + 1) * header::CELL) as f32) * u).round() as usize;
                    for y in y0..y1.min(h) {
                        for x in x0..x1.min(w) {
                            px[(y * w + x) * 4..(y * w + x) * 4 + 4].copy_from_slice(&[236, 232, 222, 255]);
                        }
                    }
                }
            }
        }
        px
    }
    fn classify_synth(w: usize, screen_h: usize, probes: &[&str], mask: u32) -> Option<Screen> {
        let px = synth(w, screen_h, probes, 7);
        let f = header::Frame { w, h: header::strip_rows(screen_h as u32) as usize, screen_h, rgba: &px };
        header::classify(&f, mask).map(|x| x.0)
    }

    /* 0.22.1: inventář v raidu je jen signál „v raidu“: nikdy obrazovka pro plný snímek */
    #[test]
    fn inventar_v_raidu_nikdy_nespusti_snimek() {
        for (w, h) in [(1920, 1080), (2560, 1440), (3840, 2160), (1280, 720), (3440, 1440)] {
            let px = synth(w, h, header::IN_RAID, 7);
            let f = header::Frame { w, h: header::strip_rows(h as u32) as usize, screen_h: h, rgba: &px };
            assert!(header::in_raid(&f), "{w}×{h}");
            /* žádná obrazovka, ani s každým bitem zvlášť */
            assert_eq!(header::classify(&f, header::ALL_BITS), None, "{w}×{h}");
            for s in header::ALL {
                assert_eq!(header::classify(&f, s.bit()), None, "{w}×{h} {s:?}");
            }
            /* AutoGate: v raidu se nikdy nepořídí plný snímek, ani po dlouhé době */
            let mut gate = AutoGate::default();
            let t0 = Instant::now();
            for i in 0..50 {
                let seen = header::classify(&f, header::ALL_BITS).map(|x| x.0);
                assert_eq!(gate.update(seen, t0 + Duration::from_secs(2 * i)), None);
            }
            assert_eq!(auto_label(None, true), Some("inRaid"));
        }
        /* pás každé obrazovky pro snímek není inventář v raidu */
        for d in header::DEFS {
            let pos: Vec<&str> = d.probes.iter().filter(|p| !p.starts_with('!')).copied().collect();
            let px = synth(1920, 1080, &pos, 7);
            let f = header::Frame { w: 1920, h: header::strip_rows(1080) as usize, screen_h: 1080, rgba: &px };
            assert!(!header::in_raid(&f), "{:?}", d.screen);
        }
        /* „inRaid“ není id žádné obrazovky, takže ho výběr obrazovek ani hlavní okno nevezmou za obrazovku */
        assert!(header::Screen::from_id(IN_RAID_ID).is_none());
        assert!(header::IN_RAID.iter().all(|p| !header::DEFS.iter().any(|d| d.probes.iter().any(|q| q.trim_start_matches('!') == *p))));
        assert_eq!(auto_label(Some(Screen::Loadout), true), Some("loadout"));
        assert_eq!(auto_label(None, false), None);
    }

    #[test]
    fn hlavicky_maji_vygenerovane_vzory_sedi_s_geometrii() {
        for g in header::GEOS {
            let rows = header::bits(g.name).unwrap_or_else(|| panic!("chybí vzor {}", g.name));
            assert_eq!(rows.len() as i32, g.h / header::CELL, "{}", g.name);
            assert!(rows.iter().all(|r| r.len() as i32 == g.w / header::CELL && r.bytes().all(|b| b == b'#' || b == b'.')), "{}", g.name);
            assert_eq!(g.x % header::CELL + g.y % header::CELL + g.w % header::CELL + g.h % header::CELL, 0, "{}", g.name);
            assert!(g.y + g.h <= header::STRIP_UNITS, "{} mimo pás", g.name);
        }
        for d in header::DEFS {
            for p in d.probes {
                assert!(header::geo(p.trim_start_matches('!')).is_some(), "{p}");
            }
        }
    }

    #[test]
    fn hlavicky_umely_pas_kazde_obrazovky_v_ruznych_rozlisenich() {
        for (w, h) in [(1920, 1080), (2560, 1440), (3840, 2160), (1280, 720)] {
            for d in header::DEFS {
                let pos: Vec<&str> = d.probes.iter().filter(|p| !p.starts_with('!')).copied().collect();
                let px = synth(w, h, &pos, 7);
                let f = header::Frame { w, h: header::strip_rows(h as u32) as usize, screen_h: h, rgba: &px };
                let scores: Vec<String> = d.probes.iter().map(|p| format!("{p}={:.2}", header::probe(&f, p.trim_start_matches('!')))).collect();
                assert_eq!(classify_synth(w, h, &pos, header::ALL_BITS), Some(d.screen), "{w}×{h} {:?} {scores:?}", d.screen);
            }
        }
        /* ultrawide 21:9: sondy ukotvené ke středu a k pravé hraně se posunou */
        assert_eq!(classify_synth(3440, 1440, &["res-loadout", "res-knocked"], header::ALL_BITS), Some(Screen::KnockedOut));
        assert_eq!(classify_synth(3440, 1440, &["quest-panel", "quest-gap"], header::ALL_BITS), Some(Screen::Quests));
    }

    #[test]
    fn hlavicky_jen_vybrane_obrazovky_a_nic_navic() {
        /* výsledek raidu: KNOCKED OUT má přednost, bez nadpisu je to FINDINGS */
        assert_eq!(classify_synth(1920, 1080, &["res-loadout"], header::ALL_BITS), Some(Screen::Findings));
        /* nevybraná obrazovka se nehlásí */
        assert_eq!(classify_synth(1920, 1080, &["manage"], header::ALL_BITS & !Screen::Loadout.bit()), None);
        assert_eq!(classify_synth(1920, 1080, &["manage"], Screen::Loadout.bit()), Some(Screen::Loadout));
        /* jen šum, nebo samotná záložka bez horní hrany (nevybraná), nebo jen nadpis STASH: nic */
        assert_eq!(classify_synth(1920, 1080, &[], header::ALL_BITS), None);
        assert_eq!(classify_synth(1920, 1080, &["stash-label"], header::ALL_BITS), None);
        assert_eq!(classify_synth(1920, 1080, &["raider-edge"], header::ALL_BITS), None);
        /* celobílý snímek (záblesk) není žádná obrazovka */
        let (w, sh) = (1920usize, 1080usize);
        let h = header::strip_rows(sh as u32) as usize;
        let white = vec![240u8; w * h * 4];
        assert_eq!(header::classify(&header::Frame { w, h, screen_h: sh, rgba: &white }, header::ALL_BITS), None);
        /* prázdný nebo krátký pás */
        assert_eq!(header::classify(&header::Frame { w: 0, h: 0, screen_h: 1080, rgba: &[] }, header::ALL_BITS), None);
        assert_eq!(header::classify(&header::Frame { w: 10, h: 10, screen_h: 1080, rgba: &[0; 12] }, header::ALL_BITS), None);
    }

    #[test]
    fn hlavicky_jeden_krok_je_levny() {
        /* doba porovnání na 4K pásu (bez snímku obrazovky): vypíše se pro report, mez je velkorysá kvůli CI */
        let (w, sh) = (3840usize, 2160usize);
        let px = synth(w, sh, &["manage"], 3);
        let f = header::Frame { w, h: header::strip_rows(sh as u32) as usize, screen_h: sh, rgba: &px };
        let t0 = Instant::now();
        let n = 20;
        for _ in 0..n {
            assert_eq!(header::classify(&f, header::ALL_BITS).map(|x| x.0), Some(Screen::Loadout));
        }
        let per = t0.elapsed() / n;
        println!("classify 4K pás: {per:?} na krok, pás {} B", px.len());
        assert!(per < Duration::from_millis(250), "{per:?}");
    }

    #[cfg(windows)]
    #[test]
    #[ignore]
    fn auto_mereni_snimku_pasu_na_tomto_pocitaci() {
        /* ruční měření (cargo test -- --ignored): snímek pásu z plochy + porovnání */
        let mut total = Duration::ZERO;
        let mut max = Duration::ZERO;
        let n = 30;
        let mut bytes = 0;
        for _ in 0..n {
            let t0 = Instant::now();
            let (w, h, sh, rgba) = capture_header_strip().expect("pás");
            let f = header::Frame { w: w as usize, h: h as usize, screen_h: sh as usize, rgba: &rgba };
            let _ = header::classify(&f, header::ALL_BITS);
            let d = t0.elapsed();
            bytes = rgba.len();
            total += d;
            max = max.max(d);
        }
        let avg = total / n;
        println!("krok automatického snímání: průměr {avg:?}, max {max:?}, pás {bytes} B; při kroku 2 s = {:.3} % jednoho jádra", avg.as_secs_f64() / 2.0 * 100.0);
    }

    #[cfg(windows)]
    #[test]
    fn seznam_procesu_jde_precist() {
        assert!(!process_names().is_empty());
    }
}
