// FB#1 — File operations native Rust (menggantikan handler node-tools.js)
// Query format tetap kompatibel dgn AI tools: "path||arg2||arg3"
use serde::Serialize;
use std::fs;
use std::io::Write as _;
use std::path::Path;

fn workspace_root() -> String {
    let xdg = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
        format!("{}/.local/share", std::env::var("HOME").unwrap_or_default())
    });
    format!("{xdg}/mark/workspace")
}

fn resolve(base: &str, p: &str) -> String {
    let p = p.trim();
    let expanded = if let Some(rest) = p.strip_prefix("~/") {
        format!("{}/{}", std::env::var("HOME").unwrap_or_default(), rest)
    } else {
        p.to_string()
    };
    if Path::new(&expanded).is_absolute() {
        expanded
    } else if expanded == "." || expanded.is_empty() {
        base.to_string()
    } else {
        format!("{base}/{expanded}")
    }
}

#[derive(Serialize)]
pub struct FsResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn ok(data: impl Into<String>) -> FsResult {
    FsResult { success: true, data: Some(data.into()), message: None }
}
fn msg(m: impl Into<String>) -> FsResult {
    FsResult { success: true, data: None, message: Some(m.into()) }
}
fn err(e: impl Into<String>) -> FsResult {
    FsResult { success: false, data: None, message: Some(e.into()) }
}

#[tauri::command]
pub fn fs_read_file(path: String, start_line: Option<u32>, end_line: Option<u32>) -> FsResult {
    let p = resolve(&workspace_root(), &path);
    match fs::read_to_string(&p) {
        Ok(content) => {
            if start_line.is_none() && end_line.is_none() {
                return ok(content);
            }
            let start = start_line.unwrap_or(1).max(1) as usize;
            let end = end_line.unwrap_or(u32::MAX) as usize;
            let selected: Vec<&str> = content
                .lines()
                .enumerate()
                .filter(|(i, _)| *i + 1 >= start && *i + 1 <= end)
                .map(|(_, l)| l)
                .collect();
            if selected.is_empty() {
                err(format!("Range baris {start}-{end} di luar cakupan file."))
            } else {
                let numbered: String = selected
                    .iter()
                    .enumerate()
                    .map(|(i, l)| format!("{}: {}", start + i, l))
                    .collect::<Vec<_>>()
                    .join("\n");
                ok(numbered)
            }
        }
        Err(e) => err(format!("Gagal baca {p}: {e}")),
    }
}

#[tauri::command]
pub fn fs_write_file(path: String, content: String) -> FsResult {
    let p = resolve(&workspace_root(), &path);
    if let Some(parent) = Path::new(&p).parent() {
        let _ = fs::create_dir_all(parent);
    }
    match fs::File::create(&p).and_then(|mut f| f.write_all(content.as_bytes())) {
        Ok(_) => msg(format!("File dibuat/ditulis: {p}")),
        Err(e) => err(format!("Gagal tulis {p}: {e}")),
    }
}

#[tauri::command]
pub fn fs_delete_file(path: String) -> FsResult {
    let p = resolve(&workspace_root(), &path);
    let sp = Path::new(&p);
    if !sp.exists() {
        return err(format!("Path tidak ditemukan: {p}"));
    }
    let r = if sp.is_dir() { fs::remove_dir_all(sp) } else { fs::remove_file(sp) };
    match r {
        Ok(_) => msg(format!("Dihapus: {p}")),
        Err(e) => err(format!("Gagal hapus {p}: {e}")),
    }
}

#[tauri::command]
pub fn fs_list_dir(path: String) -> FsResult {
    let root = workspace_root();
    let p = resolve(&root, &path);
    match fs::read_dir(&p) {
        Ok(entries) => {
            let mut out: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| {
                    let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    let marker = if is_dir { "/" } else { "" };
                    format!("{}{marker}", e.file_name().to_string_lossy())
                })
                .collect();
            out.sort();
            if out.is_empty() {
                msg(format!("(folder kosong) {p}"))
            } else {
                ok(out.join("\n"))
            }
        }
        Err(e) => err(format!("Gagal baca folder {p}: {e}")),
    }
}

const IGNORED_DIRS: &[&str] = &[
    "node_modules", ".git", "dist", "build", ".next", ".vite", ".nuxt",
    "coverage", ".cache", "out", ".idea", ".vscode", "target", "bin", "obj",
];

#[tauri::command]
pub fn fs_grep_search(dir: String, keyword: String) -> FsResult {
    if keyword.is_empty() {
        return err("Kata kunci tidak boleh kosong.");
    }
    let root = workspace_root();
    let base = resolve(&root, &dir);
    if !Path::new(&base).exists() {
        return err(format!("Direktori tidak ditemukan: {base}"));
    }
    let mut hits: Vec<String> = Vec::new();
    let mut stack = vec![base.clone()];
    while let Some(cur) = stack.pop() {
        let Ok(entries) = fs::read_dir(&cur) else { continue };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let full = format!("{}/{}", cur, name);
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if !IGNORED_DIRS.contains(&name.as_str()) && !name.starts_with('.') {
                    stack.push(full);
                }
                continue;
            }
            if let Ok(content) = fs::read_to_string(&full) {
                for (i, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&keyword.to_lowercase()) {
                        hits.push(format!("{}:{}: {}", full.replace(&format!("{root}/"), ""), i + 1, line.trim()));
                        if hits.len() >= 200 {
                            hits.push("... (dipotong 200 hasil pertama)".into());
                            return ok(hits.join("\n"));
                        }
                    }
                }
            }
        }
    }
    if hits.is_empty() {
        msg(format!("Tidak ditemukan '{keyword}' di {base}"))
    } else {
        ok(hits.join("\n"))
    }
}

#[derive(Serialize)]
pub struct LegacyPick {
    pub path: String,
    pub content: String,
}

/// Deteksi profil Electron lama (IndexedDB / Local Storage Chromium)
#[tauri::command]
pub fn fs_detect_legacy_profiles() -> Vec<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = ["Mark Agent", "mark-agent", "mark-agent-fork", "Electron"];
    let mut found = Vec::new();
    for c in candidates {
        let base = format!("{home}/.config/{c}");
        let markers = [
            format!("{base}/IndexedDB"),
            format!("{base}/Local Storage"),
            format!("{base}/Session Storage"),
        ];
        if markers.iter().any(|m| Path::new(m).exists()) {
            found.push(base);
        }
    }
    found
}

/// Picker file export JSON (dexie-export-import) + baca isinya
#[tauri::command]
pub fn fs_import_pick_and_read() -> Result<LegacyPick, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Dexie Export JSON", &["json"])
        .set_title("Pilih file export database Mark lama")
        .pick_file();
    match file {
        Some(f) => {
            let path = f.to_string_lossy().to_string();
            let content =
                fs::read_to_string(&f).map_err(|e| format!("Gagal baca {path}: {e}"))?;
            Ok(LegacyPick { path, content })
        }
        None => Err("__canceled__".into()),
    }
}
