// Mission scope Fase 3: pagar proaktif per misi (deklaratif).
//
// Berbeda dari approval (tanya user) dan watchdog (hitung sesi): scope MENOLAK
// deterministik tanpa dialog bila aksi/path di luar yang dideklarasikan.
// Default: TIDAK ADA scope aktif -> perilaku lama (backward compatible).
// Scope di-set eksplisit per misi (bridge mission_scope_set) dan dibersihkan
// saat misi selesai. Tidak ada produsen scope otomatis: auto-scope menebak
// sama berbahayanya dengan tidak ada scope (didokumentasikan, bukan diimplementasi).
//
// Dua dimensi independen (salah satu boleh kosong = dimensi itu terbuka):
//   - tools: daftar nama aksi/channel yang boleh (node_invoke + native).
//     Native memakai kunci family granular: "run-shell", "git-commit",
//     "git-revert", "os-control". Contoh: ["read-file", "grep-search"].
//   - dirs: direktori absolut yang boleh (fs + git cwd). Dikanonikalisasi saat
//     set (typo path yang tak ada = Err, bukan scope bocor) + prefix check
//     saat pakai (kebal symlink escape, pola resolve_contained).
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct MissionScope {
    dirs: Vec<PathBuf>,
    tools: Option<Vec<String>>,
}

static SCOPE: Mutex<Option<MissionScope>> = Mutex::new(None);

fn with_scope<T>(f: impl FnOnce(&Option<MissionScope>) -> T) -> T {
    let guard = SCOPE.lock().unwrap_or_else(|e| e.into_inner());
    f(&guard)
}

/// Aktifkan scope. Dir harus ada (canonicalize) agar typo tidak jadi lubang.
/// tools=None -> dimensi tool terbuka; Some([]) -> semua tool ditolak.
pub fn set_scope(dirs: Vec<String>, tools: Option<Vec<String>>) -> Result<(), String> {
    let mut canon = Vec::with_capacity(dirs.len());
    for d in &dirs {
        let p = std::fs::canonicalize(d)
            .map_err(|e| format!("Scope dir tidak valid '{d}': {e}"))?;
        canon.push(p);
    }
    let tools = tools.map(|ts| {
        ts.into_iter()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
    });
    let mut guard = SCOPE.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(MissionScope { dirs: canon, tools });
    Ok(())
}

pub fn clear_scope() {
    let mut guard = SCOPE.lock().unwrap_or_else(|e| e.into_inner());
    *guard = None;
}

pub fn get_scope() -> serde_json::Value {
    with_scope(|s| match s {
        None => serde_json::json!({ "active": false }),
        Some(m) => serde_json::json!({
            "active": true,
            "dirs": m.dirs.iter().map(|p| p.to_string_lossy()).collect::<Vec<_>>(),
            "tools": m.tools,
        }),
    })
}

/// Gerbang tool: scope nonaktif / tools=None -> boleh. Selain itu harus cocok persis.
pub fn check_tool(name: &str) -> Result<(), String> {
    with_scope(|s| match s {
        None => Ok(()),
        Some(m) => match &m.tools {
            None => Ok(()),
            Some(list) if list.iter().any(|t| t == name) => Ok(()),
            _ => Err(format!(
                "Ditolak mission scope: tool '{name}' di luar daftar misi. Minta perluasan scope atau pakai tool yang diizinkan."
            )),
        },
    })
}

fn canonicalize_for_check(raw: &str) -> Result<PathBuf, String> {
    let p = Path::new(raw.trim());
    if p.exists() {
        return std::fs::canonicalize(p).map_err(|e| format!("Gagal resolusi path: {e}"));
    }
    // Target tulis baru: kanonikalkan parent + sambungkan nama akhir.
    let parent = p.parent().filter(|pp| !pp.as_os_str().is_empty()).ok_or_else(|| {
        "Ditolak mission scope: path tidak valid".to_string()
    })?;
    if !parent.exists() {
        return Err("Ditolak mission scope: parent path tidak ada".to_string());
    }
    let cp =
        std::fs::canonicalize(parent).map_err(|e| format!("Gagal resolusi parent: {e}"))?;
    Ok(cp.join(p.file_name().unwrap_or_default()))
}

/// Gerbang direktori: scope nonaktif / dirs kosong -> boleh. Selain itu path
/// kanonik harus berprefix salah satu dir scope (kebal symlink escape).
/// Hanya dipakai test + calon pemakaian raw-path; bukan dead code.
#[allow(dead_code)]
pub fn check_path(raw: &str) -> Result<(), String> {
    let resolved = canonicalize_for_check(raw)?;
    check_canonical(&resolved)
}

/// Varian untuk path yang SUDAH diresolusi absolut (mis. hasil
/// resolve_contained di cmd_fs — jangan canonicalize ulang terhadap cwd).
pub fn check_canonical(resolved: &Path) -> Result<(), String> {
    with_scope(|s| match s {
        None => Ok(()),
        Some(m) if m.dirs.is_empty() => Ok(()),
        Some(m) => {
            if m.dirs.iter().any(|d| resolved.starts_with(d)) {
                Ok(())
            } else {
                Err("Ditolak mission scope: path di luar direktori misi.".into())
            }
        }
    })
}

// ---- Tauri commands ----
#[tauri::command]
pub fn mission_scope_set(dirs: Vec<String>, tools: Option<Vec<String>>) -> Result<(), String> {
    set_scope(dirs, tools)
}

#[tauri::command]
pub fn mission_scope_clear() -> bool {
    clear_scope();
    true
}

#[tauri::command]
pub fn mission_scope_get() -> serde_json::Value {
    get_scope()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reset() {
        clear_scope();
    }

    #[test]
    fn inactive_allows_everything() {
        reset();
        assert!(check_tool("run-shell").is_ok());
        assert!(check_path("/etc/passwd").is_ok());
    }

    #[test]
    fn typo_dir_rejected_at_set() {
        reset();
        assert!(set_scope(vec!["/tidak/ada/dir-ini-xyz".into()], None).is_err());
        // Scope gagal = tetap nonaktif, bukan setengah jadi.
        assert!(check_tool("run-shell").is_ok());
    }

    #[test]
    fn tool_allowlist_exact_match() {
        reset();
        set_scope(vec![], Some(vec!["read-file".into()])).unwrap();
        assert!(check_tool("read-file").is_ok());
        assert!(check_tool("run-shell").is_err());
        assert!(check_tool("read-file-evil").is_err());
        reset();
    }

    #[test]
    fn empty_tools_deny_all() {
        reset();
        set_scope(vec![], Some(vec![])).unwrap();
        assert!(check_tool("read-file").is_err());
        reset();
    }

    #[test]
    fn dir_prefix_and_symlink_escape() {
        reset();
        let base = std::env::temp_dir().join("mark-scope-test");
        let inner = base.join("inner");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&inner).unwrap();
        set_scope(vec![base.to_string_lossy().into_owned()], None).unwrap();
        assert!(check_path(inner.to_string_lossy().as_ref()).is_ok());
        assert!(check_path("/etc/passwd").is_err());
        // Symlink keluar -> resolved di luar -> ditolak.
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let link = inner.join("escape");
            let _ = symlink("/etc", &link);
            if link.exists() || std::fs::symlink_metadata(&link).is_ok() {
                assert!(check_path(link.to_string_lossy().as_ref()).is_err());
            }
        }
        let _ = std::fs::remove_dir_all(&base);
        reset();
    }

    #[test]
    fn clear_restores_open() {
        reset();
        set_scope(vec![], Some(vec!["read-file".into()])).unwrap();
        assert!(check_tool("run-shell").is_err());
        clear_scope();
        assert!(check_tool("run-shell").is_ok());
    }
}
