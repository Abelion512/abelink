// HARN — structured dev logging (opt-in). JSONL per kind, rotasi 50MB.
// KEAMANAN (audit 2026-08-26): `kind` divalidasi ketat (anti path escape),
// tiap entri diserialisasi via serde_json sehingga output DIJAMIN JSONL valid,
// dan panjang baris dibatasi agar rotasi 50MB tidak bisa dilewati satu tulisan.
use std::fs;
use std::io::Write;
use std::path::PathBuf;

const MAX_BYTES: u64 = 50 * 1024 * 1024;
const MAX_LINE_CHARS: usize = 256 * 1024;

fn harness_dir() -> PathBuf {
    let xdg = std::env::var("XDG_DATA_HOME")
        .unwrap_or_else(|_| format!("{}/.local/share", std::env::var("HOME").unwrap_or_default()));
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let dir = PathBuf::from(xdg).join("mark").join("harness").join(date);
    let _ = fs::create_dir_all(&dir);
    dir
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
                let rotated = dir.join(format!("{kind}.old.jsonl"));
                let _ = fs::rename(&file_path, rotated);
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
