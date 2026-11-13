//! Úložiště stavu ve složce dat aplikace.
//!
//! - `state.json` aktuální stav, `state.json.bak` předchozí úspěšně uložený stav,
//!   `snapshots/` automatické a ruční snímky, `imports/` původní text importovaných záloh.
//! - Zápis jde přes dočasný soubor a přejmenování, takže přerušený zápis nepoškodí data.
//! - Poškozený soubor se nikdy nepřepíše bez kopie: odloží se jako `state.corrupt-<čas>.json`.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const KEEP_AUTO: usize = 30;
pub const KEEP_OTHER: usize = 30;
pub const KINDS: [&str; 5] = ["auto", "manual", "import", "restore", "reset"];
/// Největší soubor stavu, snímku nebo zálohy, který se načte. 0.16.1: stejný limit platí i pro zápis, takže větší
/// stav se odmítne už při uložení (s varováním v UI) a při dalším startu se tiše nevrátí starší `.bak`.
pub const MAX_FILE: u64 = 20 * 1024 * 1024;
/// Kolik původních textů importovaných záloh se drží ve složce `imports/` (stejně jako prohlížečová verze).
pub const KEEP_IMPORTS: usize = 10;
/// Chyba při překročení limitu (začátek textu překládá src/i18n/system.ts).
pub const ERR_TOO_BIG: &str = "Stav je příliš velký (víc než 20 MB)";

fn check_size(content: &str) -> Result<(), String> {
    if content.len() as u64 > MAX_FILE { Err(ERR_TOO_BIG.into()) } else { Ok(()) }
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    pub content: Option<String>,
    pub source: String,
    pub warning: Option<String>,
    pub recovered_from: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct SnapshotInfo {
    pub name: String,
    pub kind: String,
    pub label: String,
    pub ts: u64,
    pub size: u64,
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn is_json(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text).is_ok()
}

/// Zápis přes dočasný soubor a přejmenování.
pub fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("Neplatná cesta")?;
    fs::create_dir_all(dir).map_err(|e| format!("Nelze vytvořit složku dat: {e}"))?;
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("Nelze zapsat dočasný soubor: {e}"))?;
        f.write_all(content.as_bytes()).map_err(|e| format!("Zápis selhal: {e}"))?;
        f.sync_all().map_err(|e| format!("Zápis na disk selhal: {e}"))?;
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Přejmenování selhalo: {e}")
    })
}

/// Zápis do souboru, který vybral uživatel (export zálohy, 0.16.1): dočasný soubor má jedinečný název
/// `<název>.<pid>-<čas>-<n>.tmp` a vzniká přes create_new, takže cizí soubor ve složce nikdy nepřepíše.
/// Pak se atomicky přejmenuje na cílový název.
pub fn atomic_write_unique(path: &Path, content: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("Neplatná cesta")?;
    let name = path.file_name().ok_or("Neplatná cesta")?.to_string_lossy().into_owned();
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut last = String::new();
    for n in 0..16u32 {
        let tmp = dir.join(format!("{name}.{}-{stamp}-{n}.tmp", std::process::id()));
        let mut f = match fs::OpenOptions::new().write(true).create_new(true).open(&tmp) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => {
                last = e.to_string();
                break;
            }
        };
        let written = f.write_all(content.as_bytes()).and_then(|_| f.sync_all());
        drop(f);
        if let Err(e) = written {
            let _ = fs::remove_file(&tmp);
            return Err(format!("Zápis selhal: {e}"));
        }
        return fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("Přejmenování selhalo: {e}")
        });
    }
    Err(format!("Nelze zapsat dočasný soubor: {last}"))
}

pub struct Storage {
    pub dir: PathBuf,
}

impl Storage {
    pub fn new(dir: PathBuf) -> Self {
        Storage { dir }
    }
    fn state(&self) -> PathBuf {
        self.dir.join("state.json")
    }
    fn bak(&self) -> PathBuf {
        self.dir.join("state.json.bak")
    }
    fn snaps(&self) -> PathBuf {
        self.dir.join("snapshots")
    }
    fn imports(&self) -> PathBuf {
        self.dir.join("imports")
    }

    fn read_valid(path: &Path) -> Option<String> {
        let meta = fs::metadata(path).ok()?;
        if meta.len() > MAX_FILE {
            return None;
        }
        let text = fs::read_to_string(path).ok()?;
        if is_json(&text) {
            Some(text)
        } else {
            None
        }
    }

    /// state.json → state.json.bak → nejnovější snímek → prázdný stav s varováním.
    pub fn load(&self) -> LoadResult {
        let state = self.state();
        let had_state = state.exists();
        if let Some(c) = Self::read_valid(&state) {
            return LoadResult { content: Some(c), source: "state".into(), warning: None, recovered_from: None };
        }
        if had_state {
            let aside = self.dir.join(format!("state.corrupt-{}.json", now_ms()));
            let _ = fs::rename(&state, &aside);
        }
        if let Some(c) = Self::read_valid(&self.bak()) {
            let warning = if had_state { Some("Uložený stav byl poškozený. Načetla se předchozí záloha.".to_string()) } else { None };
            return LoadResult { content: Some(c), source: "bak".into(), warning, recovered_from: Some("state.json.bak".into()) };
        }
        if let Ok(list) = self.list_snapshots() {
            for s in list {
                if let Some(c) = Self::read_valid(&self.snaps().join(&s.name)) {
                    return LoadResult {
                        content: Some(c),
                        source: "snapshot".into(),
                        warning: Some("Uložený stav ani záloha nešly načíst. Načetl se nejnovější snímek.".into()),
                        recovered_from: Some(s.name),
                    };
                }
            }
        }
        LoadResult {
            content: None,
            source: "none".into(),
            warning: if had_state { Some("Data se nepodařilo načíst. Je otevřen prázdný stav.".into()) } else { None },
            recovered_from: None,
        }
    }

    /// Předchozí platný stav se zkopíruje do .bak, nový se zapíše atomicky.
    pub fn save(&self, content: &str) -> Result<(), String> {
        check_size(content)?;
        if !is_json(content) {
            return Err("Stav není platný JSON".into());
        }
        let state = self.state();
        if Self::read_valid(&state).is_some() {
            let tmp = self.bak().with_extension("bak.tmp");
            fs::copy(&state, &tmp).map_err(|e| format!("Záloha předchozího stavu selhala: {e}"))?;
            fs::rename(&tmp, self.bak()).map_err(|e| format!("Záloha předchozího stavu selhala: {e}"))?;
        }
        atomic_write(&state, content)
    }

    pub fn create_snapshot(&self, kind: &str, label: &str, content: &str) -> Result<String, String> {
        if !KINDS.contains(&kind) {
            return Err("Neplatný typ snímku".into());
        }
        check_size(content)?;
        if !is_json(content) {
            return Err("Snímek není platný JSON".into());
        }
        fs::create_dir_all(self.snaps()).map_err(|e| format!("Nelze vytvořit složku snímků: {e}"))?;
        let mut ts = now_ms();
        let existing: Vec<u64> = self.list_snapshots()?.iter().map(|s| s.ts).collect();
        while existing.contains(&ts) {
            ts += 1;
        }
        let name = snapshot_name(ts, kind, label);
        atomic_write(&self.snaps().join(&name), content)?;
        self.prune()?;
        Ok(name)
    }

    pub fn list_snapshots(&self) -> Result<Vec<SnapshotInfo>, String> {
        let dir = self.snaps();
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut out = vec![];
        for entry in fs::read_dir(&dir).map_err(|e| format!("Nelze číst snímky: {e}"))? {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(mut info) = parse_snapshot_name(&name) {
                info.size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(info);
            }
        }
        out.sort_by(|a, b| b.ts.cmp(&a.ts));
        Ok(out)
    }

    fn prune(&self) -> Result<(), String> {
        let list = self.list_snapshots()?;
        let (auto, other): (Vec<_>, Vec<_>) = list.into_iter().partition(|s| s.kind == "auto");
        for s in auto.iter().skip(KEEP_AUTO).chain(other.iter().skip(KEEP_OTHER)) {
            let _ = fs::remove_file(self.snaps().join(&s.name));
        }
        Ok(())
    }

    pub fn read_snapshot(&self, name: &str) -> Result<String, String> {
        if parse_snapshot_name(name).is_none() {
            return Err("Neplatný název snímku".into());
        }
        fs::read_to_string(self.snaps().join(name)).map_err(|e| format!("Snímek nejde přečíst: {e}"))
    }

    pub fn delete_snapshot(&self, name: &str) -> Result<(), String> {
        if parse_snapshot_name(name).is_none() {
            return Err("Neplatný název snímku".into());
        }
        fs::remove_file(self.snaps().join(name)).map_err(|e| format!("Snímek nejde smazat: {e}"))
    }

    /// Původní text importované zálohy (pojistka). 0.16.1: nejvýš MAX_FILE a jen KEEP_IMPORTS nejnovějších.
    pub fn save_import_raw(&self, content: &str) -> Result<(), String> {
        check_size(content)?;
        let mut ts = now_ms();
        while self.imports().join(format!("import-{ts}.txt")).exists() {
            ts += 1;
        }
        atomic_write(&self.imports().join(format!("import-{ts}.txt")), content)?;
        self.prune_imports();
        Ok(())
    }

    /// Smaže starší původní texty importů, nechá KEEP_IMPORTS nejnovějších. Jiné soubory ve složce nechá být.
    fn prune_imports(&self) {
        let Ok(rd) = fs::read_dir(self.imports()) else { return };
        let mut list: Vec<(u64, PathBuf)> = rd
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                let ts = name.strip_prefix("import-")?.strip_suffix(".txt")?;
                if ts.is_empty() || ts.len() > 16 || !ts.bytes().all(|b| b.is_ascii_digit()) {
                    return None;
                }
                Some((ts.parse().ok()?, e.path()))
            })
            .collect();
        list.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, p) in list.into_iter().skip(KEEP_IMPORTS) {
            let _ = fs::remove_file(p);
        }
    }
}

/// Stejný formát jako v src/storage/adapter.ts: `<čas>-<typ>[-<popisek>].json`.
pub fn snapshot_name(ts: u64, kind: &str, label: &str) -> String {
    let mut slug = String::new();
    for c in label.chars() {
        let c = fold(c).to_ascii_lowercase();
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let slug: String = slug.trim_matches('-').chars().take(40).collect();
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        format!("{ts}-{kind}.json")
    } else {
        format!("{ts}-{kind}-{slug}.json")
    }
}

/// Česká diakritika na ASCII (pro popisek v názvu souboru).
fn fold(c: char) -> char {
    match c {
        'á' | 'Á' => 'a',
        'č' | 'Č' => 'c',
        'ď' | 'Ď' => 'd',
        'é' | 'É' | 'ě' | 'Ě' => 'e',
        'í' | 'Í' => 'i',
        'ň' | 'Ň' => 'n',
        'ó' | 'Ó' => 'o',
        'ř' | 'Ř' => 'r',
        'š' | 'Š' => 's',
        'ť' | 'Ť' => 't',
        'ú' | 'Ú' | 'ů' | 'Ů' => 'u',
        'ý' | 'Ý' => 'y',
        'ž' | 'Ž' => 'z',
        _ => c,
    }
}

/// Přijme jen název bez cesty: `^\d{1,16}-(typ)(-[a-z0-9-]{1,40})?\.json$`.
pub fn parse_snapshot_name(name: &str) -> Option<SnapshotInfo> {
    let stem = name.strip_suffix(".json")?;
    let (ts_str, rest) = stem.split_once('-')?;
    if ts_str.is_empty() || ts_str.len() > 16 || !ts_str.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let (kind, label) = match rest.split_once('-') {
        Some((k, l)) => (k, l),
        None => (rest, ""),
    };
    if !KINDS.contains(&kind) {
        return None;
    }
    if rest.contains('-') && (label.is_empty() || label.len() > 40 || !label.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')) {
        return None;
    }
    Some(SnapshotInfo { name: name.to_string(), kind: kind.to_string(), label: label.replace('-', " "), ts: ts_str.parse().ok()?, size: 0 })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("arc-companion-test-{tag}-{}-{}", std::process::id(), now_ms()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn zapis_a_cteni() {
        let s = Storage::new(temp_dir("rw"));
        assert_eq!(s.load().source, "none");
        assert_eq!(s.load().warning, None);
        s.save(r#"{"a":1}"#).unwrap();
        let r = s.load();
        assert_eq!(r.source, "state");
        assert_eq!(r.content.as_deref(), Some(r#"{"a":1}"#));
        s.save(r#"{"a":2}"#).unwrap();
        assert_eq!(fs::read_to_string(s.bak()).unwrap(), r#"{"a":1}"#);
        assert_eq!(s.load().content.as_deref(), Some(r#"{"a":2}"#));
        assert!(!s.state().with_extension("tmp").exists());
        assert!(s.save("{nic").is_err());
        assert_eq!(s.load().content.as_deref(), Some(r#"{"a":2}"#));
    }

    #[test]
    fn obnova_z_bak_po_poskozeni() {
        let s = Storage::new(temp_dir("bak"));
        s.save(r#"{"v":1}"#).unwrap();
        s.save(r#"{"v":2}"#).unwrap();
        fs::write(s.state(), "{poškozeno").unwrap();
        let r = s.load();
        assert_eq!(r.source, "bak");
        assert_eq!(r.content.as_deref(), Some(r#"{"v":1}"#));
        assert!(r.warning.is_some());
        let corrupt: Vec<_> = fs::read_dir(&s.dir).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.starts_with("state.corrupt-")).collect();
        assert_eq!(corrupt.len(), 1);
        assert_eq!(fs::read_to_string(s.dir.join(&corrupt[0])).unwrap(), "{poškozeno");
    }

    #[test]
    fn obnova_ze_snimku_kdyz_chybi_bak() {
        let s = Storage::new(temp_dir("snapload"));
        s.create_snapshot("manual", "x", r#"{"s":1}"#).unwrap();
        fs::write(s.state(), "rozbite").unwrap();
        let r = s.load();
        assert_eq!(r.source, "snapshot");
        assert_eq!(r.content.as_deref(), Some(r#"{"s":1}"#));
    }

    #[test]
    fn rotace_snimku() {
        let s = Storage::new(temp_dir("rot"));
        for _ in 0..35 {
            s.create_snapshot("auto", "start", "{}").unwrap();
        }
        for i in 0..33 {
            s.create_snapshot(if i % 2 == 0 { "manual" } else { "import" }, "před úpravou", "{}").unwrap();
        }
        let list = s.list_snapshots().unwrap();
        assert_eq!(list.iter().filter(|x| x.kind == "auto").count(), KEEP_AUTO);
        assert_eq!(list.iter().filter(|x| x.kind != "auto").count(), KEEP_OTHER);
        assert!(list.iter().any(|x| x.label == "pred upravou"));
        let first = &list[0];
        assert_eq!(s.read_snapshot(&first.name).unwrap(), "{}");
        s.delete_snapshot(&first.name).unwrap();
        assert_eq!(s.list_snapshots().unwrap().len(), KEEP_AUTO + KEEP_OTHER - 1);
    }

    #[test]
    fn odmitnuti_nazvu_s_cestou() {
        let s = Storage::new(temp_dir("path"));
        for bad in ["../state.json", "..\\state.json", "1-auto/../../x.json", "C:\\x.json", "1-hack.json", "1-auto-A.json", "abc-auto.json", "1-auto-.json"] {
            assert!(parse_snapshot_name(bad).is_none(), "{bad}");
            assert!(s.read_snapshot(bad).is_err(), "{bad}");
            assert!(s.delete_snapshot(bad).is_err(), "{bad}");
        }
        assert!(parse_snapshot_name("1762700000000-auto.json").is_some());
        assert!(parse_snapshot_name("5-manual-pred-upravou.json").is_some());
        assert!(s.create_snapshot("evil", "x", "{}").is_err());
    }

    #[test]
    fn prilis_velky_stav_se_neulozi() {
        let s = Storage::new(temp_dir("big"));
        s.save(r#"{"v":1}"#).unwrap();
        let big = format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_FILE as usize));
        assert_eq!(s.save(&big), Err(ERR_TOO_BIG.to_string()));
        assert!(s.create_snapshot("manual", "x", &big).is_err());
        assert!(s.save_import_raw(&big).is_err());
        /* uložený stav zůstal a načte se bez varování (žádný tichý návrat na .bak) */
        let r = s.load();
        assert_eq!(r.source, "state");
        assert_eq!(r.content.as_deref(), Some(r#"{"v":1}"#));
        assert_eq!(r.warning, None);
        /* přesně na limitu projde */
        let pad = MAX_FILE as usize - r#"{"x":""}"#.len();
        let edge = format!("{{\"x\":\"{}\"}}", "a".repeat(pad));
        assert_eq!(edge.len() as u64, MAX_FILE);
        s.save(&edge).unwrap();
        assert_eq!(s.load().source, "state");
    }

    #[test]
    fn importy_jen_deset_nejnovejsich() {
        let s = Storage::new(temp_dir("imports"));
        fs::create_dir_all(s.imports()).unwrap();
        fs::write(s.imports().join("poznamka.txt"), "cizí").unwrap();
        for i in 0..14 {
            s.save_import_raw(&format!("{{\"i\":{i}}}")).unwrap();
        }
        let mut names: Vec<String> = fs::read_dir(s.imports()).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        assert_eq!(names.iter().filter(|n| n.starts_with("import-")).count(), KEEP_IMPORTS);
        assert!(names.contains(&"poznamka.txt".to_string()));
        let texts: Vec<String> = names.iter().filter(|n| n.starts_with("import-")).map(|n| fs::read_to_string(s.imports().join(n)).unwrap()).collect();
        for i in 4..14 {
            assert!(texts.contains(&format!("{{\"i\":{i}}}")), "{i}");
        }
    }

    #[test]
    fn export_neprepise_cizi_tmp() {
        let d = temp_dir("export");
        let target = d.join("zaloha.json");
        fs::write(d.join("zaloha.tmp"), "cizí soubor").unwrap();
        fs::write(d.join("zaloha.json.tmp"), "jiný cizí soubor").unwrap();
        atomic_write_unique(&target, r#"{"ok":1}"#).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), r#"{"ok":1}"#);
        assert_eq!(fs::read_to_string(d.join("zaloha.tmp")).unwrap(), "cizí soubor");
        assert_eq!(fs::read_to_string(d.join("zaloha.json.tmp")).unwrap(), "jiný cizí soubor");
        /* přepis existující zálohy a žádný zbylý dočasný soubor */
        atomic_write_unique(&target, r#"{"ok":2}"#).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), r#"{"ok":2}"#);
        let left: Vec<_> = fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(left.len(), 3, "{left:?}");
    }

    #[test]
    fn nazev_snimku_odpovida_frontendu() {
        assert_eq!(snapshot_name(5, "manual", "Před úpravou!"), "5-manual-pred-upravou.json");
        assert_eq!(snapshot_name(7, "auto", ""), "7-auto.json");
        assert_eq!(snapshot_name(7, "reset", "před resetem raids"), "7-reset-pred-resetem-raids.json");
    }
}
