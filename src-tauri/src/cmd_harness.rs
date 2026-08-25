// HARN — structured dev logging (opt-in). JSONL per kind, rotasi 50MB.
use std::fs;
use std::io::Write;
use std::path::PathBuf;

const MAX_BYTES: u64 = 50 * 1024 * 1024;

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
    match fs::OpenOptions::new().create(true).append(true).open(&file_path) {
        Ok(mut f) => {
            writeln!(f, "{line}").map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}
