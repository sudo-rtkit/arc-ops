//! Rust backend: jen soubory ve složce dat, snímky, souborové dialogy a otevření odkazu nebo složky.
//! Žádné čtení paměti ani souborů hry, žádné spouštění vlastních procesů, žádná síť.
//! Buddy, overlay, zkratka a snímek obrazovky (milník 5, výchozí stav vypnuto) žijí jen v modulu `ops`.
//! Kompaktní režim, zavření křížkem a ikona v oznamovací oblasti (0.9.0) žijí v modulu `mainwin`.

mod bus;
mod mainwin;
pub mod ops;
mod storage;

use std::path::PathBuf;
use std::sync::Mutex;
use storage::{LoadResult, SnapshotInfo, Storage, MAX_FILE};
use tauri::{Manager, State, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

struct AppStorage(Mutex<Storage>);

/// Jak se aplikace spustila (0.8.0): běžela při startu hra? Pak je hlavní okno na pozadí a UI ukáže upozornění.
#[derive(Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchInfo {
    game_running: bool,
}

#[tauri::command]
fn launch_info(window: WebviewWindow, info: State<'_, LaunchInfo>) -> Result<LaunchInfo, String> {
    main_window(&window)?;
    Ok(*info)
}

fn with<T>(st: &State<'_, AppStorage>, f: impl FnOnce(&Storage) -> Result<T, String>) -> Result<T, String> {
    let guard = st.0.lock().map_err(|_| "Úložiště je zablokované".to_string())?;
    f(&guard)
}

/* Ukládá jen hlavní okno: buddy a overlay mají jen kopii stavu, takže nemůže vzniknout dvojí zápis.
   0.16.1: i čtení stavu, snímků a složky dat jen hlavní okno (obrana do hloubky vedle capabilities/main.json). */
fn main_window(w: &WebviewWindow) -> Result<(), String> {
    if w.label() == "main" { Ok(()) } else { Err("Ukládat smí jen hlavní okno".into()) }
}

#[tauri::command]
fn storage_load(window: WebviewWindow, st: State<'_, AppStorage>) -> Result<LoadResult, String> {
    main_window(&window)?;
    with(&st, |s| Ok(s.load()))
}

#[tauri::command]
fn storage_save(window: WebviewWindow, st: State<'_, AppStorage>, content: String) -> Result<(), String> {
    main_window(&window)?;
    with(&st, |s| s.save(&content))
}

#[tauri::command]
fn snapshot_create(window: WebviewWindow, st: State<'_, AppStorage>, kind: String, label: String, content: String) -> Result<(), String> {
    main_window(&window)?;
    with(&st, |s| s.create_snapshot(&kind, &label, &content).map(|_| ()))
}

#[tauri::command]
fn snapshot_list(window: WebviewWindow, st: State<'_, AppStorage>) -> Result<Vec<SnapshotInfo>, String> {
    main_window(&window)?;
    with(&st, |s| s.list_snapshots())
}

#[tauri::command]
fn snapshot_read(window: WebviewWindow, st: State<'_, AppStorage>, name: String) -> Result<String, String> {
    main_window(&window)?;
    with(&st, |s| s.read_snapshot(&name))
}

#[tauri::command]
fn snapshot_delete(window: WebviewWindow, st: State<'_, AppStorage>, name: String) -> Result<(), String> {
    main_window(&window)?;
    with(&st, |s| s.delete_snapshot(&name))
}

#[tauri::command]
fn import_save_raw(window: WebviewWindow, st: State<'_, AppStorage>, content: String) -> Result<(), String> {
    main_window(&window)?;
    with(&st, |s| s.save_import_raw(&content))
}

/// Text dialogu v jazyce UI (posílá ho frontend); bez něj nebo s nevhodným textem česká výchozí podoba.
fn dialog_text(v: Option<String>, fallback: &str) -> String {
    match v {
        Some(t) if !t.trim().is_empty() && t.chars().count() <= 80 && !t.chars().any(char::is_control) => t,
        _ => fallback.to_string(),
    }
}

/// Uloží zálohu do souboru, který uživatel vybere v systémovém dialogu. Vrací false, když dialog zavřel.
#[tauri::command]
async fn export_backup(
    app: tauri::AppHandle,
    window: WebviewWindow,
    suggested_name: String,
    content: String,
    title: Option<String>,
    filter: Option<String>,
) -> Result<bool, String> {
    main_window(&window)?;
    let name: String = suggested_name.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')).take(80).collect();
    let picked = app
        .dialog()
        .file()
        .set_title(dialog_text(title, "Exportovat zálohu"))
        .set_file_name(if name.is_empty() { "arc-companion-zaloha.json" } else { &name })
        .add_filter(dialog_text(filter, "Záloha JSON"), &["json"])
        .blocking_save_file();
    let Some(path) = picked else { return Ok(false) };
    let path: PathBuf = path.into_path().map_err(|e| format!("Neplatná cesta: {e}"))?;
    /* 0.16.1: dočasný soubor s jedinečným názvem (cizí <název>.tmp ve vybrané složce se nepřepíše) */
    storage::atomic_write_unique(&path, &content)?;
    Ok(true)
}

/// Otevře systémový dialog a vrátí obsah vybraného souboru. Prázdný text = soubor je příliš velký.
#[tauri::command]
async fn import_backup(app: tauri::AppHandle, window: WebviewWindow, title: Option<String>, filter: Option<String>) -> Result<Option<String>, String> {
    main_window(&window)?;
    let picked = app
        .dialog()
        .file()
        .set_title(dialog_text(title, "Importovat zálohu"))
        .add_filter(dialog_text(filter, "Záloha"), &["json", "txt"])
        .blocking_pick_file();
    let Some(path) = picked else { return Ok(None) };
    let path: PathBuf = path.into_path().map_err(|e| format!("Neplatná cesta: {e}"))?;
    let meta = std::fs::metadata(&path).map_err(|e| format!("Soubor nejde přečíst: {e}"))?;
    if meta.len() > MAX_FILE {
        return Ok(Some(String::new()));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Soubor nejde přečíst: {e}"))?;
    Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
}

#[tauri::command]
fn data_dir(window: WebviewWindow, st: State<'_, AppStorage>) -> Result<String, String> {
    main_window(&window)?;
    with(&st, |s| Ok(s.dir.to_string_lossy().into_owned()))
}

#[tauri::command]
fn open_data_dir(app: tauri::AppHandle, window: WebviewWindow, st: State<'_, AppStorage>) -> Result<(), String> {
    main_window(&window)?;
    let dir = with(&st, |s| Ok(s.dir.clone()))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Otevře odkaz ve výchozím prohlížeči. Povoleny jsou jen adresy https a jen z hlavního okna nebo overlaye
/// (odkaz v modulu, na který hráč klikl).
#[tauri::command]
fn open_external(app: tauri::AppHandle, window: WebviewWindow, url: String) -> Result<(), String> {
    bus::only(&window, &[bus::MAIN, bus::OVERLAY])?;
    if !url.starts_with("https://") || url.len() > 2000 || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("Odkaz není povolený".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Druhé spuštění jen přepne na běžící okno (i skryté v oznamovací oblasti), aby si dvě okna nepřepisovala data.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            mainwin::show_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(ops::plugin())
        .manage(ops::OpsState::default())
        /* Zničení hlavního okna ukončí celou aplikaci včetně buddyho a overlaye (jinak by zůstaly bez stavu). */
        .on_window_event(|w, e| {
            ops::on_window_event(w, e);
            /* křížek na hlavním okně: rozhodne frontend (zeptat se, skrýt do oznamovací oblasti, ukončit) */
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                mainwin::on_close_requested(w, api);
            }
            if w.label() == "main" && matches!(e, tauri::WindowEvent::Focused(true)) {
                mainwin::on_focused(w.app_handle());
            }
            if w.label() == "main" && matches!(e, tauri::WindowEvent::ThemeChanged(_)) {
                mainwin::refresh_tray_icon(w.app_handle());
            }
            if w.label() == "main" && matches!(e, tauri::WindowEvent::Destroyed) {
                ops::shutdown(w.app_handle());
                w.app_handle().exit(0);
            }
        })
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|e| format!("Složka dat není dostupná: {e}"))?;
            std::fs::create_dir_all(&dir)?;
            /* režim a geometrie okna z minula (jen čtení state.json), aby okno nebliklo v jiné velikosti */
            let boot = mainwin::boot_prefs(&dir);
            app.manage(mainwin::MainWin::new(boot.mode));
            app.manage(AppStorage(Mutex::new(Storage::new(dir))));
            /* Hlavní okno vzniká až tady (v tauri.conf.json má "create": false). Když běží ARC Raiders, okno se
               nesmí aktivovat ani překrýt hru (hra v exkluzivní celé obrazovce by se mohla minimalizovat nebo
               spadnout): vznikne skryté a ukáže se minimalizované bez aktivace. Jednorázová kontrola názvů procesů. */
            let game_running = ops::game_running_now();
            app.manage(LaunchInfo { game_running });
            let cfg = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("V konfiguraci chybí okno main")?;
            let mut builder = WebviewWindowBuilder::from_config(app.handle(), &cfg)?;
            if game_running {
                builder = builder.focused(false).visible(false);
            }
            builder = mainwin::prepare(builder, &boot);
            let main = builder.build()?;
            mainwin::finish(&main, &boot, game_running);
            if game_running {
                ops::show_in_background(&main);
                app.state::<mainwin::MainWin>().background_start();
            }
            mainwin::create_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage_load,
            storage_save,
            snapshot_create,
            snapshot_list,
            snapshot_read,
            snapshot_delete,
            import_save_raw,
            export_backup,
            import_backup,
            data_dir,
            open_data_dir,
            open_external,
            launch_info,
            bus::bus_send,
            ops::ops_enable,
            ops::ops_hotkey,
            ops::ops_watch,
            ops::buddy_open,
            ops::buddy_close,
            ops::buddy_reveal,
            ops::overlay_open,
            ops::overlay_close,
            ops::overlay_toggle,
            ops::main_focus,
            ops::capture_now,
            ops::capture_take,
            ops::ops_autocapture,
            ops::ops_autostats,
            ops::win_place,
            ops::win_drag,
            mainwin::main_mode,
            mainwin::main_pin,
            mainwin::main_geometry,
            mainwin::main_drag,
            mainwin::main_minimize,
            mainwin::main_hide,
            mainwin::main_show,
            mainwin::main_ready,
            mainwin::app_quit,
            mainwin::tray_sync
        ])
        .run(tauri::generate_context!())
        .expect("chyba při spuštění aplikace");
}
