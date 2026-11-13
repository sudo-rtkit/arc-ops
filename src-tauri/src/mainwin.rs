//! Hlavní okno (0.9.0): plný a kompaktní režim, připnutí, zavření křížkem a ikona v oznamovací oblasti.
//!
//! - Režim mění jen frontend (`main_mode`); Rust okno přestaví (rámeček, rozsah velikosti, poloha, vždy navrchu)
//!   a vrátí geometrii opouštěného režimu, kterou frontend uloží do stavu (state.json). Při startu se režim
//!   a geometrie přečtou ze state.json, aby okno nebliklo v jiné velikosti.
//! - Vždy navrchu jen v kompaktu se zapnutým připnutím; v plném režimu se nativně vypne.
//! - Kompaktní okno se nezobrazí na snímcích (`ops::set_capture_excluded`), aby nad hrou nezakrylo inventář.
//! - Křížek (i Alt+F4): když frontend běží, zavření se zastaví a frontend rozhodne (zeptat se / skrýt do
//!   oznamovací oblasti / ukončit). Bez připraveného frontendu se okno zavře jako dřív (ukončí aplikaci).
//! - Nic z toho nebere hře fokus: přestavba okna ho neaktivuje, start při běžící hře zůstává na pozadí (lib.rs).
//! - Žádné Win32 volání ani síť; motiv hlavního panelu a vynechání ze snímků obstarává ops.rs.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow, WebviewWindowBuilder};

use crate::ops;

const MAIN: &str = "main";
const TRAY: &str = "main";
/* Rozsah velikosti (logické px): kompakt podle návrhu, plné okno podle tauri.conf.json. */
pub const COMPACT: (f64, f64) = (420.0, 720.0);
pub const COMPACT_MIN: (f64, f64) = (380.0, 520.0);
pub const COMPACT_MAX: (f64, f64) = (480.0, 900.0);
pub const FULL: (f64, f64) = (1440.0, 900.0);
pub const FULL_MIN: (f64, f64) = (1024.0, 640.0);
/* Když frontend na „Ukončit“ z oznamovací oblasti neodpoví, aplikace skončí sama. */
const QUIT_FALLBACK: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Full,
    Compact,
}

/// Poloha (vnější, fyzické px) a velikost (vnitřní, fyzické px).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// Uložené nastavení okna (část `mainWindow` ze state.json).
#[derive(Clone, Debug, PartialEq)]
pub struct Prefs {
    pub mode: Mode,
    pub pin: bool,
    pub full: Option<Rect>,
    pub full_max: bool,
    pub compact: Option<Rect>,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs { mode: Mode::Full, pin: false, full: None, full_max: false, compact: None }
    }
}

pub struct MainWin {
    /* frontend zaregistroval posluchače (zavření, oznamovací oblast); do té doby křížek zavírá jako dřív */
    ready: AtomicBool,
    mode: Mutex<Mode>,
    /* Okno ukázané na pozadí (start při běžící hře, `ops::show_in_background`) mimo tao: tao ho má za skryté a
       změna rámečku by ho úplně skryla. Do prvního obnovení uživatelem se přestavba okna jen odloží. */
    synced: AtomicBool,
    pending: Mutex<Option<ModeArgs>>,
}

impl MainWin {
    pub fn new(mode: Mode) -> Self {
        MainWin { ready: AtomicBool::new(false), mode: Mutex::new(mode), synced: AtomicBool::new(true), pending: Mutex::new(None) }
    }
    /// Start na pozadí: přestavby okna čekají, až ho uživatel obnoví.
    pub fn background_start(&self) {
        self.synced.store(false, Ordering::SeqCst);
    }
}

fn rect_of(v: &serde_json::Value) -> Option<Rect> {
    let n = |k: &str| v.get(k).and_then(|x| x.as_f64()).filter(|x| x.is_finite());
    let (x, y, w, h) = (n("x")?, n("y")?, n("w")?, n("h")?);
    if w < 100.0 || h < 100.0 || w > 20000.0 || h > 20000.0 || x.abs() > 100000.0 || y.abs() > 100000.0 {
        return None;
    }
    Some(Rect { x: x as i32, y: y as i32, w: w as u32, h: h as u32 })
}

/// Nastavení okna z obsahu state.json; cokoli nečitelného dá výchozí plný režim.
pub fn prefs_from_json(content: &str) -> Prefs {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(content.trim_start_matches('\u{feff}')) else { return Prefs::default() };
    let Some(m) = v.get("mainWindow") else { return Prefs::default() };
    Prefs {
        mode: if m.get("mode").and_then(|x| x.as_str()) == Some("compact") { Mode::Compact } else { Mode::Full },
        pin: m.get("pin").and_then(|x| x.as_bool()) == Some(true),
        full: m.get("full").and_then(rect_of),
        full_max: m.get("fullMax").and_then(|x| x.as_bool()) == Some(true),
        compact: m.get("compact").and_then(rect_of),
    }
}

/// Jen čtení state.json ve složce dat (bez obnovy ze zálohy; tu řeší frontend přes storage_load).
pub fn boot_prefs(dir: &Path) -> Prefs {
    std::fs::read_to_string(dir.join("state.json")).map(|c| prefs_from_json(&c)).unwrap_or_default()
}

/// Leží uložené okno na některé pracovní ploše? Stačí, když je na ploše horní pruh okna (místo pro tažení),
/// jinak by po odpojení monitoru zůstalo mimo obrazovku.
pub fn visible_on(r: &Rect, work: &[Rect]) -> bool {
    let (cx, cy) = (r.x as i64 + r.w as i64 / 2, r.y as i64 + 16);
    work.iter().any(|a| cx >= a.x as i64 && cx < a.x as i64 + a.w as i64 && cy >= a.y as i64 && cy < a.y as i64 + a.h as i64)
}

/// Výchozí umístění: uprostřed pracovní plochy, velikost zmenšená, aby se vešla.
pub fn centered(work: &Rect, w: u32, h: u32) -> Rect {
    let (w, h) = (w.min(work.w), h.min(work.h));
    Rect { x: work.x + (work.w - w) as i32 / 2, y: work.y + (work.h - h) as i32 / 2, w, h }
}

fn work_areas<R: Runtime>(w: &WebviewWindow<R>) -> Vec<Rect> {
    w.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let a = m.work_area();
            Rect { x: a.position.x, y: a.position.y, w: a.size.width, h: a.size.height }
        })
        .collect()
}

/* Pracovní plocha monitoru, na kterém okno je (jinak hlavního), a jeho měřítko. */
fn current_work<R: Runtime>(w: &WebviewWindow<R>) -> Option<(Rect, f64)> {
    let m = w.current_monitor().ok().flatten().or_else(|| w.primary_monitor().ok().flatten())?;
    let a = m.work_area();
    Some((Rect { x: a.position.x, y: a.position.y, w: a.size.width, h: a.size.height }, m.scale_factor()))
}

/// Geometrie okna; None u minimalizovaného (poloha by byla mimo obrazovku).
fn geometry<R: Runtime>(w: &WebviewWindow<R>) -> (Option<Rect>, bool) {
    let max = w.is_maximized().unwrap_or(false);
    if w.is_minimized().unwrap_or(false) || !w.is_visible().unwrap_or(true) {
        return (None, max);
    }
    match (w.outer_position(), w.inner_size()) {
        (Ok(p), Ok(s)) => (Some(Rect { x: p.x, y: p.y, w: s.width, h: s.height }), max),
        _ => (None, max),
    }
}

/* Rozsah velikosti a rámeček podle režimu. Kompakt: bez rámečku (vlastní lišta), mírná změna velikosti. */
fn apply_frame<R: Runtime>(w: &WebviewWindow<R>, mode: Mode, pin: bool) {
    match mode {
        Mode::Compact => {
            if w.is_maximized().unwrap_or(false) {
                let _ = w.unmaximize();
            }
            let _ = w.set_decorations(false);
            let _ = w.set_maximizable(false);
            let _ = w.set_min_size(Some(LogicalSize::new(COMPACT_MIN.0, COMPACT_MIN.1)));
            let _ = w.set_max_size(Some(LogicalSize::new(COMPACT_MAX.0, COMPACT_MAX.1)));
            let _ = w.set_always_on_top(pin);
            ops::set_capture_excluded(w, true);
        }
        Mode::Full => {
            let _ = w.set_always_on_top(false);
            ops::set_capture_excluded(w, false);
            let _ = w.set_max_size(None::<LogicalSize<f64>>);
            let _ = w.set_min_size(Some(LogicalSize::new(FULL_MIN.0, FULL_MIN.1)));
            let _ = w.set_maximizable(true);
            let _ = w.set_decorations(true);
        }
    }
}

/* Poloha a velikost: uložená, pokud leží na pracovní ploše, jinak výchozí uprostřed monitoru. */
fn apply_rect<R: Runtime>(w: &WebviewWindow<R>, mode: Mode, saved: Option<Rect>) {
    let (work, sf) = current_work(w).unwrap_or((Rect { x: 0, y: 0, w: 1920, h: 1040 }, 1.0));
    let r = match saved {
        Some(r) if visible_on(&r, &work_areas(w)) => r,
        _ => {
            let (lw, lh) = if mode == Mode::Compact { COMPACT } else { FULL };
            centered(&work, (lw * sf) as u32, (lh * sf) as u32)
        }
    };
    let _ = w.set_size(PhysicalSize::new(r.w, r.h));
    let _ = w.set_position(PhysicalPosition::new(r.x, r.y));
}

/// Rámeček a rozměry před sestavením okna (start): kompakt vzniká rovnou bez rámečku a skrytý, aby se před
/// zobrazením stihla nastavit poloha. Plné okno s uloženou geometrií taky skryté.
pub fn prepare<'a, R: Runtime, M: Manager<R>>(b: WebviewWindowBuilder<'a, R, M>, p: &Prefs) -> WebviewWindowBuilder<'a, R, M> {
    match p.mode {
        Mode::Compact => b
            .decorations(false)
            .maximizable(false)
            .inner_size(COMPACT.0, COMPACT.1)
            .min_inner_size(COMPACT_MIN.0, COMPACT_MIN.1)
            .max_inner_size(COMPACT_MAX.0, COMPACT_MAX.1)
            .always_on_top(p.pin)
            .visible(false),
        Mode::Full if p.full.is_some() || p.full_max => b.visible(false),
        Mode::Full => b,
    }
}

/// Po sestavení: uložená poloha, vynechání ze snímků a zobrazení. Při běžící hře okno nezobrazí (to udělá
/// lib.rs minimalizovaně bez aktivace), jinak ho ukáže a aktivuje jako dřív.
pub fn finish<R: Runtime>(w: &WebviewWindow<R>, p: &Prefs, game_running: bool) {
    let hidden = p.mode == Mode::Compact || p.full.is_some() || p.full_max;
    if !hidden {
        return;
    }
    if p.mode == Mode::Compact {
        apply_rect(w, Mode::Compact, p.compact);
        ops::set_capture_excluded(w, true);
    } else {
        if p.full.is_some() {
            apply_rect(w, Mode::Full, p.full);
        }
        if p.full_max {
            let _ = w.maximize();
        }
    }
    if !game_running {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/* ----- příkazy (jen hlavní okno) ----- */

fn main_only<R: Runtime>(w: &WebviewWindow<R>) -> Result<(), String> {
    if w.label() == MAIN { Ok(()) } else { Err("Jen hlavní okno".into()) }
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct ModeArgs {
    mode: Mode,
    pin: bool,
    full: Option<Rect>,
    full_max: bool,
    compact: Option<Rect>,
}

/// Geometrie opouštěného (nebo právě platného) režimu pro uložení ve frontendu.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Left {
    mode: Mode,
    rect: Option<Rect>,
    max: bool,
}

/// Přepne režim okna. Vrací geometrii režimu, který okno opustilo. Okno se neaktivuje.
#[tauri::command]
pub async fn main_mode<R: Runtime>(window: WebviewWindow<R>, st: tauri::State<'_, MainWin>, args: ModeArgs) -> Result<Left, String> {
    main_only(&window)?;
    let cur = *st.mode.lock().map_err(|_| "mode")?;
    let (rect, max) = geometry(&window);
    let left = Left { mode: cur, rect, max };
    /* minimalizované nebo na pozadí ukázané okno: přestavba počká na obnovení (nic se neaktivuje ani neskryje) */
    if !st.synced.load(Ordering::SeqCst) || window.is_minimized().unwrap_or(false) {
        let mut p = st.pending.lock().map_err(|_| "mode")?;
        *p = Some(args);
        return Ok(left);
    }
    if cur == args.mode {
        if cur == Mode::Compact {
            let _ = window.set_always_on_top(args.pin);
        }
        return Ok(left);
    }
    rebuild(&window, &args);
    *st.mode.lock().map_err(|_| "mode")? = args.mode;
    Ok(left)
}

fn rebuild<R: Runtime>(window: &WebviewWindow<R>, args: &ModeArgs) {
    apply_frame(window, args.mode, args.pin);
    match args.mode {
        Mode::Compact => apply_rect(window, Mode::Compact, args.compact),
        Mode::Full => {
            apply_rect(window, Mode::Full, args.full);
            if args.full_max {
                let _ = window.maximize();
            }
        }
    }
}

/// Hlavní okno dostalo fokus (uživatel ho obnovil): po startu na pozadí sladit viditelnost v tao (okno už je
/// aktivní, show nic nepřebírá) a provést odloženou přestavbu.
pub fn on_focused<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = app.get_webview_window(MAIN) else { return };
    let st = app.state::<MainWin>();
    if !st.synced.swap(true, Ordering::SeqCst) {
        let _ = w.show();
    }
    let pending = st.pending.lock().ok().and_then(|mut p| p.take());
    if let Some(args) = pending {
        let cur = st.mode.lock().map(|m| *m).unwrap_or(Mode::Full);
        if cur != args.mode {
            rebuild(&w, &args);
            if let Ok(mut m) = st.mode.lock() {
                *m = args.mode;
            }
        } else if cur == Mode::Compact {
            let _ = w.set_always_on_top(args.pin);
        }
    }
}

/// Připnutí „vždy navrchu“: platí jen v kompaktu, v plném režimu se nic nezmění.
#[tauri::command]
pub async fn main_pin<R: Runtime>(window: WebviewWindow<R>, st: tauri::State<'_, MainWin>, on: bool) -> Result<bool, String> {
    main_only(&window)?;
    let compact = *st.mode.lock().map_err(|_| "mode")? == Mode::Compact;
    if !st.synced.load(Ordering::SeqCst) || window.is_minimized().unwrap_or(false) {
        /* odložit spolu s případnou přestavbou */
        if let Ok(mut p) = st.pending.lock() {
            if let Some(a) = p.as_mut() {
                a.pin = on;
            } else {
                *p = Some(ModeArgs { mode: *st.mode.lock().map_err(|_| "mode")?, pin: on, full: None, full_max: false, compact: None });
            }
        }
        return Ok(compact && on);
    }
    window.set_always_on_top(compact && on).map_err(|e| e.to_string())?;
    Ok(compact && on)
}

/// Aktuální geometrie (před skrytím do oznamovací oblasti nebo ukončením).
#[tauri::command]
pub async fn main_geometry<R: Runtime>(window: WebviewWindow<R>, st: tauri::State<'_, MainWin>) -> Result<Left, String> {
    main_only(&window)?;
    let (rect, max) = geometry(&window);
    Ok(Left { mode: *st.mode.lock().map_err(|_| "mode")?, rect, max })
}

/// Tažení za vlastní lištu kompaktu (místo oprávnění pro JS).
#[tauri::command]
pub fn main_drag<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn main_minimize<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    window.minimize().map_err(|e| e.to_string())
}

/// Skrytí do oznamovací oblasti: aplikace, buddy i zkratka běží dál.
#[tauri::command]
pub async fn main_hide<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    window.hide().map_err(|e| e.to_string())
}

/// Zobrazí okno (dialog při zavření z minimalizovaného okna). Jen na akci uživatele.
#[tauri::command]
pub async fn main_show<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    show_main(window.app_handle());
    Ok(())
}

/// Frontend je připraven řešit zavření a nabídku oznamovací oblasti.
#[tauri::command]
pub async fn main_ready<R: Runtime>(window: WebviewWindow<R>, st: tauri::State<'_, MainWin>) -> Result<(), String> {
    main_only(&window)?;
    st.ready.store(true, Ordering::SeqCst);
    Ok(())
}

/// Ukončení aplikace (po uložení ve frontendu): vypne buddyho, overlay a zkratku a skončí.
#[tauri::command]
pub async fn app_quit<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<(), String> {
    main_only(&window)?;
    ops::shutdown(&app);
    app.exit(0);
    Ok(())
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Křížek nebo Alt+F4 na hlavním okně: s připraveným frontendem zastaví zavření a nechá ho rozhodnout.
pub fn on_close_requested<R: Runtime>(w: &tauri::Window<R>, api: &tauri::CloseRequestApi) {
    if w.label() != MAIN || !w.state::<MainWin>().ready.load(Ordering::SeqCst) {
        return;
    }
    api.prevent_close();
    crate::bus::emit_native(w.app_handle(), MAIN, "win-close", ());
}

/* ----- oznamovací oblast ----- */

/// Texty nabídky v jazyce UI a stav buddyho (posílá frontend). `buddy` None = položka se nezobrazí
/// (buddy je v Nastavení vypnutý). 0.20.0: `auto` = automatické snímání (Some(true) běží, Some(false) pozastavené,
/// None = vypnuté v Nastavení, položka se nezobrazí); přepíná jen pozastavení, bez další globální zkratky.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrayMenu {
    open: String,
    compact: String,
    buddy_label: String,
    buddy: Option<bool>,
    #[serde(default)]
    auto_label: String,
    #[serde(default)]
    auto: Option<bool>,
    quit: String,
    tooltip: String,
}

fn label(v: &str, fallback: &str) -> String {
    let t = v.trim();
    if t.is_empty() || t.chars().count() > 60 || t.chars().any(char::is_control) { fallback.to_string() } else { t.to_string() }
}

impl Default for TrayMenu {
    fn default() -> Self {
        TrayMenu {
            open: "Otevřít".into(),
            compact: "Kompaktní režim".into(),
            buddy_label: "Buddy Ops".into(),
            buddy: None,
            auto_label: "Automatické snímání".into(),
            auto: None,
            quit: "Ukončit".into(),
            tooltip: "ARC Raiders Companion".into(),
        }
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, m: &TrayMenu) -> tauri::Result<Menu<R>> {
    let d = TrayMenu::default();
    let open = MenuItem::with_id(app, "open", label(&m.open, &d.open), true, None::<&str>)?;
    let compact = MenuItem::with_id(app, "compact", label(&m.compact, &d.compact), true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", label(&m.quit, &d.quit), true, None::<&str>)?;
    let buddy = match m.buddy {
        Some(on) => Some(CheckMenuItem::with_id(app, "buddy", label(&m.buddy_label, &d.buddy_label), true, on, None::<&str>)?),
        None => None,
    };
    let auto = match m.auto {
        Some(on) => Some(CheckMenuItem::with_id(app, "auto", label(&m.auto_label, &d.auto_label), true, on, None::<&str>)?),
        None => None,
    };
    let mut items: Vec<&dyn tauri::menu::IsMenuItem<R>> = vec![&open, &compact];
    if let Some(b) = &buddy {
        items.push(b);
    }
    if let Some(a) = &auto {
        items.push(a);
    }
    items.push(&sep);
    items.push(&quit);
    Menu::with_items(app, &items)
}

/* Ikony Bedňáka 2.0 z docs/design/buddy/bednak2/icon jako surová RGBA (scripts/gen-tray-icons.mjs). */
static TRAY_DARK_16: &[u8] = include_bytes!("../icons/tray/tray-dark-16.rgba");
static TRAY_DARK_32: &[u8] = include_bytes!("../icons/tray/tray-dark-32.rgba");
static TRAY_LIGHT_16: &[u8] = include_bytes!("../icons/tray/tray-light-16.rgba");
static TRAY_LIGHT_32: &[u8] = include_bytes!("../icons/tray/tray-light-32.rgba");

/// Ikona podle motivu hlavního panelu (světlý panel = tmavá kontura) a měřítka (nad 125 % větší ikona).
pub fn tray_icon_bytes(light_taskbar: bool, scale: f64) -> (&'static [u8], u32) {
    let big = scale > 1.25;
    match (light_taskbar, big) {
        (false, false) => (TRAY_DARK_16, 16),
        (false, true) => (TRAY_DARK_32, 32),
        (true, false) => (TRAY_LIGHT_16, 16),
        (true, true) => (TRAY_LIGHT_32, 32),
    }
}

fn tray_image<R: Runtime>(app: &AppHandle<R>) -> Image<'static> {
    let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
    let (bytes, size) = tray_icon_bytes(ops::taskbar_light(), scale);
    Image::new(bytes, size, size)
}

/// Po změně motivu Windows vyměnit ikonu.
pub fn refresh_tray_icon<R: Runtime>(app: &AppHandle<R>) {
    if let Some(t) = app.tray_by_id(TRAY) {
        let _ = t.set_icon(Some(tray_image(app)));
    }
}

fn emit_tray<R: Runtime>(app: &AppHandle<R>, action: &str) {
    crate::bus::emit_native(app, MAIN, "win-tray", action);
}

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_menu(app, &TrayMenu::default())?;
    TrayIconBuilder::with_id(TRAY)
        .icon(tray_image(app))
        .tooltip(TrayMenu::default().tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| on_menu(app, e.id().as_ref()))
        .on_tray_icon_event(|tray, e| {
            /* levé kliknutí: obnoví okno v posledním režimu */
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn ready<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.state::<MainWin>().ready.load(Ordering::SeqCst)
}

fn on_menu<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "open" => {
            show_main(app);
            emit_tray(app, "full");
        }
        "compact" => {
            show_main(app);
            emit_tray(app, "compact");
        }
        "buddy" => emit_tray(app, "buddy"),
        "auto" => emit_tray(app, "auto"),
        "quit" => {
            if !ready(app) {
                ops::shutdown(app);
                app.exit(0);
                return;
            }
            /* frontend uloží stav a zavolá app_quit; když neodpoví, aplikace skončí sama */
            emit_tray(app, "quit");
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(QUIT_FALLBACK);
                ops::shutdown(&app);
                app.exit(0);
            });
        }
        _ => {}
    }
}

#[tauri::command]
pub async fn tray_sync<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, menu: TrayMenu) -> Result<(), String> {
    main_only(&window)?;
    let Some(t) = app.tray_by_id(TRAY) else { return Ok(()) };
    let m = build_menu(&app, &menu).map_err(|e| e.to_string())?;
    t.set_menu(Some(m)).map_err(|e| e.to_string())?;
    let _ = t.set_tooltip(Some(label(&menu.tooltip, "ARC Raiders Companion")));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nastaveni_okna_ze_stavu() {
        let p = prefs_from_json(r#"{"schema":7,"mainWindow":{"mode":"compact","pin":true,"compact":{"x":10,"y":20,"w":420,"h":720},"full":null,"fullMax":true}}"#);
        assert_eq!(p.mode, Mode::Compact);
        assert!(p.pin);
        assert_eq!(p.compact, Some(Rect { x: 10, y: 20, w: 420, h: 720 }));
        assert_eq!(p.full, None);
        assert!(p.full_max);
    }

    #[test]
    fn starsi_nebo_poskozeny_stav_da_plny_rezim() {
        assert_eq!(prefs_from_json(r#"{"schema":6}"#), Prefs::default());
        assert_eq!(prefs_from_json("{nesmysl"), Prefs::default());
        assert_eq!(prefs_from_json(""), Prefs::default());
        let p = prefs_from_json(r#"{"mainWindow":{"mode":"x","pin":"ano","compact":{"x":1,"y":1,"w":5,"h":5}}}"#);
        assert_eq!(p, Prefs::default());
        assert_eq!(boot_prefs(Path::new("Z:\\neexistuje\\nikde")), Prefs::default());
    }

    #[test]
    fn okno_mimo_pracovni_plochu_se_nepouzije() {
        let work = [Rect { x: 0, y: 0, w: 1920, h: 1040 }, Rect { x: 1920, y: 0, w: 2560, h: 1400 }];
        assert!(visible_on(&Rect { x: 100, y: 100, w: 420, h: 720 }, &work));
        assert!(visible_on(&Rect { x: 2000, y: 50, w: 420, h: 720 }, &work));
        /* odpojený třetí monitor */
        assert!(!visible_on(&Rect { x: 4600, y: 100, w: 420, h: 720 }, &work));
        /* lišta nad horním okrajem */
        assert!(!visible_on(&Rect { x: 100, y: -200, w: 420, h: 720 }, &work));
    }

    #[test]
    fn vychozi_okno_uprostred_a_vejde_se() {
        let work = Rect { x: 0, y: 0, w: 1366, h: 728 };
        assert_eq!(centered(&work, 420, 720), Rect { x: 473, y: 4, w: 420, h: 720 });
        assert_eq!(centered(&work, 1440, 900), Rect { x: 0, y: 0, w: 1366, h: 728 });
    }

    #[test]
    fn ikona_podle_motivu_a_meritka() {
        assert_eq!(tray_icon_bytes(false, 1.0).1, 16);
        assert_eq!(tray_icon_bytes(true, 1.5).1, 32);
        for (light, scale) in [(false, 1.0), (false, 2.0), (true, 1.0), (true, 2.0)] {
            let (b, s) = tray_icon_bytes(light, scale);
            assert_eq!(b.len() as u32, s * s * 4);
        }
        assert_ne!(tray_icon_bytes(false, 1.0).0, tray_icon_bytes(true, 1.0).0);
    }

    #[test]
    fn popisky_nabidky() {
        assert_eq!(label("  Open ", "x"), "Open");
        assert_eq!(label("", "Otevřít"), "Otevřít");
        assert_eq!(label("a\nb", "Ukončit"), "Ukončit");
    }
}
