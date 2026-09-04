// Gerbang approval BERJENJANG (graduated approval UX).
//
// Latar (masukan owner): dialog rfd untuk SETIAP aksi berbahaya merusak
// user-experience. Model referensi yang diminta owner: "read-only always
// allow, sisanya ikut guidebook". Karena itu kebijakan per-jenis aksi bisa
// diatur ke salah satu dari:
//   "ask"     -> dialog native rfd setiap kali (default, paling aman)
//   "session" -> tanya SEKALI per runtime aplikasi per jenis, lalu ingat
//   "always"  -> selalu izinkan jenis aksi ini (owner yang memutuskan)
//
// Default per jenis (baseline tetap aman, UX jauh lebih ringan):
//   - fs-read / os-read  : "always" (murni read-only — paritas dgn keinginan
//     owner "read only always allow")
//   - jenis lain         : "ask"
//
// Keputusan persisten tersimpan di `<XDG>/mark/capabilities/approval-policy.json`
// (sama seperti connections.json — lokal penuh, tanpa telemetri). Renderer
// TIDAK pernah menulis file ini: pengaturan kebijakan lewat rfd dialog juga
// ("Remember for this session / Always allow this type").

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub const POLICY_ASK: &str = "ask";
pub const POLICY_SESSION: &str = "session";
pub const POLICY_ALWAYS: &str = "always";

/// Jenis aksi yang dikenali gerbang (family). Semua aksi selain daftar ini
/// default "ask" — perilaku aman tidak berubah.
pub const ACTION_FAMILIES: &[&str] = &[
    "fs-read",
    "fs-write",
    "fs-delete",
    "shell-exec",
    "git-write",
    "os-control",
    "capabilities-execute",
    "capabilities-authorize",
    "skills-write",
    "plugin-write",
    "tg-control",
    "google-auth",
    "connector-approve",
];

/// Kebijakan default per family. Read-only = always (permintaan owner);
/// sisanya ask. Family yang tidak tercantum = ask.
fn default_policy(family: &str) -> &'static str {
    match family {
        "fs-read" | "os-read" => POLICY_ALWAYS,
        _ => POLICY_ASK,
    }
}

pub fn normalize_family(family: &str) -> Option<String> {
    let known = ACTION_FAMILIES.iter().find(|f| **f == family).copied();
    match known {
        Some(f) => Some(f.to_string()),
        None => {
            let valid = !family.is_empty()
                && family.len() <= 48
                && family
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-');
            if valid {
                Some(family.to_string())
            } else {
                None
            }
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct PolicyFile {
    #[serde(default)]
    families: HashMap<String, String>,
}

// Cache in-memory: policy dibaca sekali, session-allowlist hidup di RAM.
static POLICY: Mutex<Option<PolicyState>> = Mutex::new(None);

struct PolicyState {
    families: HashMap<String, String>,
    // family -> true (diizinkan untuk sesi runtime ini via dialog "Remember")
    session_granted: Vec<String>,
    path: PathBuf,
    loaded: bool,
}

fn policy_path() -> PathBuf {
    let xdg = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
        format!(
            "{}/.local/share",
            std::env::var("HOME").unwrap_or_default()
        )
    });
    PathBuf::from(xdg)
        .join("mark")
        .join("capabilities")
        .join("approval-policy.json")
}

fn load_state() -> PolicyState {
    let path = policy_path();
    let families = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<PolicyFile>(&raw).ok())
        .map(|p| p.families)
        .unwrap_or_default();
    PolicyState {
        families,
        session_granted: Vec::new(),
        path,
        loaded: true,
    }
}

fn with_state<T>(f: impl FnOnce(&mut PolicyState) -> T) -> T {
    let mut guard = POLICY.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(load_state());
    }
    f(guard.as_mut().unwrap())
}

/// Kebijakan efektif sebuah family.
pub fn effective_policy(family: &str) -> String {
    let family = normalize_family(family).unwrap_or_else(|| "ask-family".to_string());
    with_state(|s| {
        if s.session_granted.iter().any(|f| f == family) {
            return POLICY_SESSION.to_string();
        }
        s.families
            .get(family)
            .cloned()
            .unwrap_or_else(|| default_policy(family).to_string())
    })
}

/// Ubah kebijakan persisten (dipanggil dari dialog rfd sendiri atau command
/// settings). Menulis file atomik mode 0600.
pub fn set_policy(family: &str, policy: &str) -> Result<(), String> {
    let family = normalize_family(family).ok_or("Family tidak valid")?;
    if policy != POLICY_ASK && policy != POLICY_SESSION && policy != POLICY_ALWAYS {
        return Err("Policy harus ask|session|always".into());
    }
    let (path, to_write) = with_state(|s| {
        if policy == POLICY_SESSION {
            if !s.session_granted.iter().any(|f| f == family) {
                s.session_granted.push(family.to_string());
            }
            return (None, None); // session-only: tidak persist
        }
        if policy == POLICY_ASK && default_policy(family) == POLICY_ASK {
            s.families.remove(family);
        } else {
            s.families.insert(family.to_string(), policy.to_string());
        }
        (Some(s.path.clone()), Some(s.families.clone()))
    });
    if let (Some(path), Some(families)) = (path, to_write) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let payload = PolicyFile { families };
        let json = serde_json::to_string_pretty(&payload).unwrap_or_default();
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, json)
            .map_err(|e| format!("Gagal menulis policy: {e}"))?;
        std::fs::rename(&tmp, &path).map_err(|e| format!("Gagal finalisasi policy: {e}"))?;
    }
    Ok(())
}

/// Set family langsung ke granted untuk sesi ini (hasil tombol dialog).
pub fn grant_session(family: &str) {
    let family = normalize_family(family).unwrap_or_else(|| family.to_string());
    with_state(|s| {
        if !s.session_granted.iter().any(|f| f == family) {
            s.session_granted.push(family.to_string());
        }
    });
}

/// Reset session grants (mis. tombol darurat / restart otomatis saat app exit).
pub fn reset_session() {
    with_state(|s| s.session_granted.clear());
}

// ---- Tauri commands (diatur lewat Configuration > Capabilities) ----------

#[tauri::command]
pub fn approval_policy_get() -> Vec<serde_json::Value> {
    ACTION_FAMILIES
        .iter()
        .map(|f| {
            serde_json::json!({ "family": f, "policy": effective_policy(f) })
        })
        .collect()
}

#[tauri::command]
pub fn approval_policy_set(family: String, policy: String) -> Result<(), String> {
    set_policy(&family, &policy)
}

#[tauri::command]
pub fn approval_policy_reset_session() -> bool {
    reset_session();
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_only_defaults_to_always() {
        assert_eq!(default_policy("fs-read"), POLICY_ALWAYS);
        assert_eq!(default_policy("os-read"), POLICY_ALWAYS);
    }

    #[test]
    fn dangerous_defaults_to_ask() {
        for f in ["shell-exec", "fs-delete", "git-write", "capabilities-execute"] {
            assert_eq!(default_policy(f), POLICY_ASK, "{f} harus ask");
        }
        assert_eq!(default_policy("family-baru-aneh"), POLICY_ASK);
    }

    #[test]
    fn normalize_rejects_garbage() {
        assert!(normalize_family("shell-exec").is_some());
        assert!(normalize_family("").is_none());
        assert!(normalize_family(&"a".repeat(60)).is_none());
        // known family dikembalikan sebagai &'static str -> String
        assert_eq!(normalize_family("shell-exec"), Some("shell-exec".to_string()));
        assert!(normalize_family("bad;family").is_none());
    }

    #[test]
    fn set_policy_validates_values() {
        assert!(set_policy("fs-read", "nope").is_err());
    }
}
