// HARN — structured logging lokal (selalu aktif). JSONL per kind/hari,
// rotasi 50MB × 3 generasi bernomor (standar retensi waktu+ukuran).
// KEAMANAN (audit 2026-08-26): `kind` divalidasi ketat (anti path escape),
// tiap entri diserialisasi via serde_json sehingga output DIJAMIN JSONL valid,
// dan panjang baris dibatasi agar rotasi 50MB tidak bisa dilewati satu tulisan.
use std::fs;
use std::io::Write;
use std::path::PathBuf;

const MAX_BYTES: u64 = 50 * 1024 * 1024;
const MAX_LINE_CHARS: usize = 256 * 1024;
// Generasi retensi per kind (`.1` terbaru … `.3` terlama), gaya logrotate.
const MAX_GENERATIONS: u8 = 3;

fn harness_dir() -> PathBuf {
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let dir = crate::data_home().join("abelink").join("harness").join(date);
    let _ = fs::create_dir_all(&dir);
    dir
}

// Pasangan rename rantai generasi (murni, untuk unit test).
fn rotation_chain(kind: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for gen in (1..=MAX_GENERATIONS).rev() {
        let src = if gen == 1 {
            format!("{kind}.jsonl")
        } else {
            format!("{kind}.{}.jsonl", gen - 1)
        };
        pairs.push((src, format!("{kind}.{gen}.jsonl")));
    }
    pairs
}

#[tauri::command]
pub fn harness_append(kind: String, line: String) -> Result<(), String> {
    // Anti path escape: kind hanya [A-Za-z0-9_-], 1..=64 karakter.
    let valid_kind = !kind.is_empty()
        && kind.chars().count() <= 64
        && kind
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid_kind {
        return Err("Kind harness tidak valid (hanya A-Za-z0-9_-, maks 64 karakter).".into());
    }
    if line.chars().count() > MAX_LINE_CHARS {
        return Err(format!("Baris harness melebihi batas {MAX_LINE_CHARS} karakter."));
    }

    let dir = harness_dir();
    let file_path = dir.join(format!("{kind}.jsonl"));
    if file_path.exists() {
        if let Ok(meta) = fs::metadata(&file_path) {
            if meta.len() > MAX_BYTES {
                // Rantai generasi: aktif -> .1 -> .2 -> .3 (terlama dibuang).
                for (src_name, dst_name) in rotation_chain(&kind) {
                    let dst = dir.join(&dst_name);
                    if dst_name.ends_with(".3.jsonl") {
                        let _ = fs::remove_file(&dst);
                    }
                    let src = dir.join(&src_name);
                    if src.exists() {
                        let _ = fs::rename(&src, &dst);
                    }
                }
            }
        }
    }
    let entry = serde_json::json!({
        "ts": chrono::Local::now().to_rfc3339(),
        "kind": kind,
        "line": line
    });
    match fs::OpenOptions::new().create(true).append(true).open(&file_path) {
        Ok(mut f) => {
            writeln!(f, "{entry}").map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_chain_tiga_generasi_berurutan() {
        assert_eq!(
            rotation_chain("tool-calls"),
            vec![
                ("tool-calls.2.jsonl".to_string(), "tool-calls.3.jsonl".to_string()),
                ("tool-calls.1.jsonl".to_string(), "tool-calls.2.jsonl".to_string()),
                ("tool-calls.jsonl".to_string(), "tool-calls.1.jsonl".to_string()),
            ]
        );
    }
}
