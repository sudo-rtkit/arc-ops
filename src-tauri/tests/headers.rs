//! 0.20.0: rozpoznání nadpisů obrazovek (ops::header) na vlastních snímcích hráče a generování vzorů.
//!
//! Snímky leží jen lokálně v tests/fixtures/vision/own/ (v .gitignore, nikdy se necommitují). Bez nich se testy
//! přeskočí. Vzory se generují příkazem `GEN_HEADERS=1 cargo test --test headers` do src/ops_headers.in
//! (malé binární masky nadpisů, ne herní grafika).

use arc_companion_lib::ops::header::{self, Frame, Screen};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;

fn own_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("tests").join("fixtures").join("vision").join("own")
}

/// RGBA celého snímku (šířka, výška, data), nebo None, když snímek chybí.
fn load(rel: &str) -> Option<(usize, usize, Vec<u8>)> {
    let path = own_dir().join(rel);
    let file = File::open(&path).ok()?;
    let mut dec = png::Decoder::new(BufReader::new(file));
    dec.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = dec.read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()?];
    let info = reader.next_frame(&mut buf).ok()?;
    let (w, h) = (info.width as usize, info.height as usize);
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf[..w * h * 4].to_vec(),
        png::ColorType::Rgb => buf[..w * h * 3].chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => buf[..w * h * 2].chunks_exact(2).flat_map(|p| [p[0], p[0], p[0], 255]).collect(),
        png::ColorType::Grayscale => buf[..w * h].iter().flat_map(|&v| [v, v, v, 255]).collect(),
        png::ColorType::Indexed => return None,
    };
    Some((w, h, rgba))
}

/// Horní pás snímku tak, jak ho dodá Rust při automatickém snímání.
fn strip(w: usize, h: usize, rgba: &[u8]) -> (usize, Vec<u8>) {
    let rows = header::strip_rows(h as u32) as usize;
    (rows, rgba[..w * rows * 4].to_vec())
}

/* Snímky a očekávaná obrazovka (None = žádná známá obrazovka). */
const CASES: &[(&str, Option<Screen>)] = &[
    ("own-prerade-free-loadout.png", Some(Screen::Loadout)),
    ("own-after-raid-knocked-out.png", Some(Screen::KnockedOut)),
    ("own-after-raid-survived-findings.png", Some(Screen::Findings)),
    ("return-and-progression/return-findings.png", Some(Screen::Findings)),
    ("own-all-1-top.png", Some(Screen::Stash)),
    ("own-all-2.png", Some(Screen::Stash)),
    ("own-all-3.png", Some(Screen::Stash)),
    ("own-all-4.png", Some(Screen::Stash)),
    ("own-all-5-end.png", Some(Screen::Stash)),
    /* výřez bez horní lišty (1901×1044): nadpis chybí, nic se nehlásí */
    ("own-all-legendary-cropped-tooltip.png", None),
    ("own-materials-scrolled-tooltip-crude-explosives.png", Some(Screen::Stash)),
    ("own-materials-scrolled-tooltip-fabric.png", Some(Screen::Stash)),
    ("own-materials-tooltip-battery.png", Some(Screen::Stash)),
    ("own-materials-tooltip-medium-gun-parts.png", Some(Screen::Stash)),
    ("own-materials-top-taskbar.png", Some(Screen::Stash)),
    ("own-quickuse-filter.png", Some(Screen::Stash)),
    ("return-and-progression/profile.png", Some(Screen::Profile)),
    ("return-and-progression/workshop-overview.png", Some(Screen::Workshop)),
    ("return-and-progression/gear-level.png", Some(Screen::Workshop)),
    ("return-and-progression/gunsmith-level.png", Some(Screen::Workshop)),
    ("return-and-progression/quest-shoring.png", Some(Screen::Quests)),
    ("return-and-progression/quest-battening.png", Some(Screen::Quests)),
    ("return-and-progression/skill-tree.png", Some(Screen::Skills)),
    ("return-and-progression/skill-looters-partial.png", Some(Screen::Skills)),
    ("return-and-progression/skill-marathon-max.png", Some(Screen::Skills)),
];

#[test]
fn generovani_vzoru() {
    if std::env::var("GEN_HEADERS").ok().as_deref() != Some("1") {
        return;
    }
    let mut out = String::from(
        "// Vygenerováno: GEN_HEADERS=1 cargo test --test headers (src-tauri/tests/headers.rs) z vlastních snímků hráče.\n\
         // Hrubé masky světlého písma nadpisů (buňka 2 × 2 jednotky 1080p, '#' = písmo), ne herní grafika.\n\
         pub const BITS: &[(&str, &[&str])] = &[\n",
    );
    for g in header::GEOS {
        let (w, h, rgba) = load(g.src).unwrap_or_else(|| panic!("chybí snímek {}", g.src));
        let (rows, px) = strip(w, h, &rgba);
        let f = Frame { w, h: rows, screen_h: h, rgba: &px };
        let t = header::template_rows(&f, g);
        out.push_str(&format!("    (\"{}\", &[\n", g.name));
        for r in t {
            out.push_str(&format!("        \"{r}\",\n"));
        }
        out.push_str("    ]),\n");
    }
    out.push_str("];\n");
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src").join("ops_headers.in");
    std::fs::write(&path, out).expect("zápis vzorů");
    println!("vzory zapsány do {}", path.display());
}

#[test]
fn vlastni_snimky_spravna_obrazovka() {
    let mut seen = 0;
    let mut wrong = Vec::new();
    for (rel, want) in CASES {
        let Some((w, h, rgba)) = load(rel) else { continue };
        seen += 1;
        let (rows, px) = strip(w, h, &rgba);
        let f = Frame { w, h: rows, screen_h: h, rgba: &px };
        let got = header::classify(&f, header::ALL_BITS);
        let probes: Vec<String> = header::GEOS.iter().map(|g| format!("{}={:.2}", g.name, header::probe(&f, g.name))).collect();
        println!("{rel}: {:?} ({})", got, probes.join(" "));
        if got.map(|x| x.0) != *want {
            wrong.push(format!("{rel}: čekáno {want:?}, vyšlo {got:?}"));
        }
        /* bez vybrané obrazovky se nehlásí nic jiného */
        if let Some(s) = want {
            let other = header::classify(&f, header::ALL_BITS & !s.bit()).map(|x| x.0);
            if other.is_some() && !(matches!(s, Screen::KnockedOut) && other == Some(Screen::Findings)) {
                wrong.push(format!("{rel}: bez {s:?} vyšlo {other:?}"));
            }
        }
    }
    if seen == 0 {
        println!("vlastní snímky chybí, test přeskočen");
        return;
    }
    println!("správně {}/{seen}", seen - wrong.len());
    assert!(wrong.is_empty(), "{wrong:#?}");
}

#[test]
fn vlastni_snimky_zmensene_a_posunute() {
    /* stejné snímky zmenšené na 1280×720 (průměr bloků 3×3 → 2×2 by byl složitý, vezme se každý 1,5. pixel) */
    let mut seen = 0;
    for (rel, want) in CASES {
        let Some((w, h, rgba)) = load(rel) else { continue };
        if w != 1920 || h != 1080 {
            continue;
        }
        seen += 1;
        let (nw, nh) = (1280usize, 720usize);
        let mut small = vec![0u8; nw * nh * 4];
        for y in 0..nh {
            for x in 0..nw {
                let (sx, sy) = (x * 3 / 2, y * 3 / 2);
                let mut acc = [0u32; 3];
                for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                    let i = ((sy + dy).min(h - 1) * w + (sx + dx).min(w - 1)) * 4;
                    for c in 0..3 {
                        acc[c] += rgba[i + c] as u32;
                    }
                }
                let o = (y * nw + x) * 4;
                small[o..o + 4].copy_from_slice(&[(acc[0] / 4) as u8, (acc[1] / 4) as u8, (acc[2] / 4) as u8, 255]);
            }
        }
        let (rows, px) = strip(nw, nh, &small);
        let f = Frame { w: nw, h: rows, screen_h: nh, rgba: &px };
        let got = header::classify(&f, header::ALL_BITS).map(|x| x.0);
        println!("720p {rel}: {got:?}");
        assert_eq!(got, *want, "720p {rel}");
    }
    if seen == 0 {
        println!("vlastní snímky chybí, test přeskočen");
    }
}
