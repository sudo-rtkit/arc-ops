//! Rust backend: jen soubory ve složce dat, snímky, souborové dialogy a otevření odkazu nebo složky.
//! Žádné čtení paměti ani souborů hry, žádné spouštění vlastních procesů, žádná síť.

mod storage;

use std::path::PathBuf;
use std::sync::Mutex;
use storage::{LoadResult, SnapshotInfo, Storage, MAX_FILE};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

struct AppStorage(Mutex<Storage>);

fn with<T>(st: &State<'_, AppStorage>, f: impl FnOnce(&Storage) -> Result<T, String>) -> Result<T, String> {
    let guard = st.0.lock().map_err(|_| "Úložiště je zablokované".to_string())?;
    f(&guard)
}

#[tauri::command]
fn storage_load(st: State<'_, AppStorage>) -> Result<LoadResult, String> {
    with(&st, |s| Ok(s.load()))
}

#[tauri::command]
fn storage_save(st: State<'_, AppStorage>, content: String) -> Result<(), String> {
    with(&st, |s| s.save(&content))
}

#[tauri::command]
fn snapshot_create(st: State<'_, AppStorage>, kind: String, label: String, content: String) -> Result<(), String> {
    with(&st, |s| s.create_snapshot(&kind, &label, &content).map(|_| ()))
}

#[tauri::command]
fn snapshot_list(st: State<'_, AppStorage>) -> Result<Vec<SnapshotInfo>, String> {
    with(&st, |s| s.list_snapshots())
}

#[tauri::command]
fn snapshot_read(st: State<'_, AppStorage>, name: String) -> Result<String, String> {
    with(&st, |s| s.read_snapshot(&name))
}

#[tauri::command]
fn snapshot_delete(st: State<'_, AppStorage>, name: String) -> Result<(), String> {
    with(&st, |s| s.delete_snapshot(&name))
}

#[tauri::command]
fn import_save_raw(st: State<'_, AppStorage>, content: String) -> Result<(), String> {
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
    suggested_name: String,
    content: String,
    title: Option<String>,
    filter: Option<String>,
) -> Result<bool, String> {
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
    storage::atomic_write(&path, &content)?;
    Ok(true)
}

/// Otevře systémový dialog a vrátí obsah vybraného souboru. Prázdný text = soubor je příliš velký.
#[tauri::command]
async fn import_backup(app: tauri::AppHandle, title: Option<String>, filter: Option<String>) -> Result<Option<String>, String> {
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
fn data_dir(st: State<'_, AppStorage>) -> Result<String, String> {
    with(&st, |s| Ok(s.dir.to_string_lossy().into_owned()))
}

#[tauri::command]
fn open_data_dir(app: tauri::AppHandle, st: State<'_, AppStorage>) -> Result<(), String> {
    let dir = with(&st, |s| Ok(s.dir.clone()))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Otevře odkaz ve výchozím prohlížeči. Povoleny jsou jen adresy https.
#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.len() > 2000 || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("Odkaz není povolený".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Druhé spuštění jen přepne na běžící okno, aby si dvě okna nepřepisovala data.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|e| format!("Složka dat není dostupná: {e}"))?;
            std::fs::create_dir_all(&dir)?;
            app.manage(AppStorage(Mutex::new(Storage::new(dir))));
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
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("chyba při spuštění aplikace");
}
