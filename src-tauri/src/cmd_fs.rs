// FB#1 — File operations native Rust (menggantikan handler node-tools.js)
// KEAMANAN (audit 2026-08-26): semua path DIBATASI di dalam workspace root
// (XDG_DATA_HOME/mark/workspace). Path absolut, '..', dan '~' DITOLAK;
// symlink & escape dicek lewat fs::canonicalize + prefix check.
// Operasi berat berjalan di spawn_blocking agar tidak membekukan main thread.
use serde::Serialize;
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};

/// Batas ukuran baca satu file (10MB) — pakai rentang baris untuk file besar.
const MAX_READ_BYTES: u64 = 10 * 1024 * 1024;
/// File lebih besar dari ini dilewati oleh grep (hindari baca memori rakusasa).
const MAX_GREP_FILE_BYTES: u64 = 1024 * 1024;

pub fn workspace_root() -> PathBuf {
    let xdg = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
        format!("{}/.local/share", std::env::var("HOME").unwrap_or_default())
    });
    PathBuf::from(xdg).join("mark").join("workspace")
}

/// Pastikan workspace ada dan kembalikan bentuk kanoniknya.
fn ensure_workspace() -> Result<PathBuf, String> {
    let root = workspace_root();
    fs::create_dir_all(&root).map_err(|e| format!("Gagal menyiapkan workspace: {e}"))?;
    fs::canonicalize(&root).map_err(|e| format!("Gagal resolusi workspace: {e}"))
}

/// Resolusi path yang DIJAMIN tetap di dalam `base`.
/// - string kosong setelah trim -> base
/// - tolak '~', path absolut, dan komponen '..'
/// - kanonikalisasi (melunturkan symlink) + prefix check terhadap base kanonik
fn resolve_contained(base: &Path, raw: &str, must_exist: bool) -> Result<PathBuf, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Ok(base.to_path_buf());
    }
    if t.starts_with('~') {
        return Err("Akses ditolak: '~' tidak diizinkan, gunakan path relatif workspace.".into());
    }
    let cand = Path::new(t);
    if cand.is_absolute() {
        return Err("Akses ditolak: path absolut di luar workspace tidak diizinkan.".into());
    }
    if cand.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Akses ditolak: '..' tidak diizinkan.".into());
    }
    let joined = base.join(cand);
    let resolved = if joined.exists() {
        fs::canonicalize(&joined)
    } else {
        // Untuk file/folder baru: kanonikalkan parent-nya saja lalu sambungkan nama akhir.
        let parent = joined.parent().ok_or_else(|| "Path tidak valid".to_string())?;
        fs::create_dir_all(parent).map_err(|e| format!("Gagal menyiapkan folder: {e}"))?;
        fs::canonicalize(parent)
            .map(|pp| pp.join(joined.file_name().unwrap_or_default()))
    }
    .map_err(|e| format!("Gagal resolusi path: {e}"))?;
    let cbase = fs::canonicalize(base).map_err(|e| format!("Gagal resolusi workspace: {e}"))?;
    if !resolved.starts_with(&cbase) {
        return Err("Akses ditolak: path keluar dari batas workspace.".into());
    }
    if must_exist && !resolved.exists() {
        return Err(format!("Path tidak ditemukan: {t}"));
    }
    Ok(resolved)
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
pub async fn fs_read_file(path: String, start_line: Option<u32>, end_line: Option<u32>) -> FsResult {
    let p = match ensure_workspace().and_then(|b| resolve_contained(&b, &path, true)) {
        Ok(p) => p,
        Err(e) => return err(e),
    };
    let read = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let meta = fs::metadata(&p).map_err(|e| format!("Gagal baca metadata: {e}"))?;
        if meta.len() > MAX_READ_BYTES {
            return Err(format!(
                "File terlalu besar ({} bytes, batas {}). Gunakan rentang baris.",
                meta.len(),
                MAX_READ_BYTES
            ));
        }
        let content =
            fs::read_to_string(&p).map_err(|e| format!("Gagal baca {}: {e}", p.display()))?;
        if start_line.is_none() && end_line.is_none() {
            return Ok(content);
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
            return Err(format!("Range baris {start}-{end} di luar cakupan file."));
        }
        let numbered: String = selected
            .iter()
            .enumerate()
            .map(|(i, l)| format!("{}: {}", start + i, l))
            .collect::<Vec<_>>()
            .join("\n");
        Ok(numbered)
    })
    .await
    .unwrap_or_else(|e| Err(format!("Task join gagal: {e}")));
    match read {
        Ok(s) => ok(s),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn fs_write_file(path: String, content: String) -> FsResult {
    if content.len() > 20 * 1024 * 1024 {
        return err("Konten terlalu besar (batas tulis 20MB).");
    }
    let p = match ensure_workspace().and_then(|b| resolve_contained(&b, &path, false)) {
        Ok(p) => p,
        Err(e) => return err(e),
    };
    let p_out = p.clone();
    let wrote: Result<(), String> = tauri::async_runtime::spawn_blocking(move || {
        if let Some(parent) = Path::new(&p).parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::File::create(&p)
            .and_then(|mut f| f.write_all(content.as_bytes()))
            .map_err(|e| format!("Gagal tulis {}: {e}", p.display()))
    })
    .await
    .unwrap_or_else(|e| Err(format!("Task join gagal: {e}")));
    match wrote {
        Ok(()) => msg(format!("File dibuat/ditulis: {}", p_out.display())),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn fs_delete_file(path: String) -> FsResult {
    let base = match ensure_workspace() {
        Ok(b) => b,
        Err(e) => return err(e),
    };
    let p = match resolve_contained(&base, &path, true) {
        Ok(p) => p,
        Err(e) => return err(e),
    };
    // Larang hapus root workspace itu sendiri.
    if p == base {
        return err("Ditolak: root workspace tidak boleh dihapus.");
    }
    let p_out = p.clone();
    let removed: Result<(), String> = tauri::async_runtime::spawn_blocking(move || {
        let sp = Path::new(&p);
        let r = if sp.is_dir() { fs::remove_dir_all(sp) } else { fs::remove_file(sp) };
        r.map_err(|e| format!("Gagal hapus {}: {e}", p.display()))
    })
    .await
    .unwrap_or_else(|e| Err(format!("Task join gagal: {e}")));
    match removed {
        Ok(()) => msg(format!("Dihapus: {}", p_out.display())),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub async fn fs_list_dir(path: String) -> FsResult {
    let p = match ensure_workspace().and_then(|b| resolve_contained(&b, &path, true)) {
        Ok(p) => p,
        Err(e) => return err(e),
    };
    let listed = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let entries =
            fs::read_dir(&p).map_err(|e| format!("Gagal baca folder {}: {e}", p.display()))?;
        let mut out: Vec<String> = entries
            .flatten()
            .map(|e| {
                let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                let marker = if is_dir { "/" } else { "" };
                format!("{}{marker}", e.file_name().to_string_lossy())
            })
            .collect();
        out.sort();
        if out.is_empty() {
            Ok(format!("(folder kosong) {}", p.display()))
        } else {
            Ok(out.join("\n"))
        }
    })
    .await
    .unwrap_or_else(|e| Err(format!("Task join gagal: {e}")));
    match listed {
        Ok(s) => {
            if s.starts_with("(folder kosong)") {
                msg(s)
            } else {
                ok(s)
            }
        }
        Err(e) => err(e),
    }
}

const IGNORED_DIRS: &[&str] = &[
    "node_modules", ".git", "dist", "build", ".next", ".vite", ".nuxt",
    "coverage", ".cache", "out", ".idea", ".vscode", "target", "bin", "obj",
];

#[tauri::command]
pub async fn fs_grep_search(dir: String, keyword: String) -> FsResult {
    if keyword.is_empty() {
        return err("Kata kunci tidak boleh kosong.");
    }
    let root_display = workspace_root();
    let base = match ensure_workspace().and_then(|b| resolve_contained(&b, &dir, true)) {
        Ok(b) => b,
        Err(e) => return err(e),
    };
    let kw_msg = keyword.clone();
    let base_disp = base.display().to_string();
    let hits = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<String>, String> {
        let kw = keyword.to_lowercase();
        let mut hits: Vec<String> = Vec::new();
        let mut stack = vec![base.clone()];
        while let Some(cur) = stack.pop() {
            let Ok(entries) = fs::read_dir(&cur) else { continue };
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                let full = cur.join(&name);
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    if !IGNORED_DIRS.contains(&name.as_str()) && !name.starts_with('.') {
                        stack.push(full);
                    }
                    continue;
                }
                // Lewati file besar supaya tidak memakan memori/waktu berlebihan.
                if let Ok(meta) = fs::metadata(&full) {
                    if meta.len() > MAX_GREP_FILE_BYTES {
                        continue;
                    }
                }
                let Ok(content) = fs::read_to_string(&full) else { continue };
                for (i, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&kw) {
                        hits.push(format!(
                            "{}:{}: {}",
                            full.strip_prefix(&root_display).unwrap_or(&full).display(),
                            i + 1,
                            line.trim()
                        ));
                        if hits.len() >= 200 {
                            hits.push("... (dipotong 200 hasil pertama)".into());
                            return Ok(hits);
                        }
                    }
                }
            }
        }
        Ok(hits)
    })
    .await
    .unwrap_or_else(|e| Err(format!("Task join gagal: {e}")));
    match hits {
        Ok(h) if h.is_empty() => msg(format!("Tidak ditemukan '{kw_msg}' di {base_disp}")),
        Ok(h) => ok(h.join("\n")),
        Err(e) => err(e),
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
    let candidates = ["Mark Agent", "mark-agent", "mark-agent-fork", "Electron", "mark", "Mark"];
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

/// Picker file export JSON (dexie-export-import) + baca isinya.
/// Aman secara desain: path dipilih user lewat dialog native (command sinkron
/// di main thread), bukan dikirim dari renderer/AI.
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
