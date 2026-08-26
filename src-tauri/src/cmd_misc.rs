// Fase B0 — cluster "Lite & misc": port ringan pertama dari sidecar/engine.mjs.
// Pengganti 1:1 lima handler JS: save-temp-file, open-external, show-notification,
// app:get-documents-path, system:get-lite-mode. `ping` SENGAJA tidak diporting karena
// semantiknya adalah health-check proses sidecar itu sendiri (lihat tauri-bridge.js).
//
// KEAMANAN (lanjutan audit 2026-08-26):
// - open-external TETAP wajib persetujuan NATIVE via rfd di main thread — paritas
//   dgn gerbang lama APPROVAL_ACTIONS di cmd_node_bridge; keputusan user diambil
//   di luar renderer sehingga renderer kompromi tetap tidak bisa membuka URL.
// - Skema URL dibatasi http/https/mailto: xdg-open bisa mengeksekusi launcher
//   .desktop untuk skema/file arbitrer, jadi jangan diteruskan mentah-mentah.
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Paritas dgn engine.mjs (`os.totalmem() <= 4.5e9`).
const LITE_RAM_THRESHOLD_BYTES: u64 = 4_500_000_000;

/// Spawn fire-and-forget: child ditunggu thread terpisah agar tidak menjadi zombie.
fn spawn_detached(cmd: &mut Command) -> Result<(), String> {
    let mut child = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Gagal spawn proses: {e}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[tauri::command]
pub fn misc_get_documents_path(app: AppHandle) -> Result<String, String> {
    // Tauri resolver memakai xdg-user-dir di bawah hood — paritas dgn versi JS.
    if let Ok(dir) = app.path().document_dir() {
        let s = dir.to_string_lossy().into_owned();
        if !s.trim().is_empty() {
            return Ok(s);
        }
    }
    std::env::var_os("HOME")
        .map(|h| {
            std::path::PathBuf::from(h)
                .join("Documents")
                .to_string_lossy()
                .into_owned()
        })
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "Folder Documents tidak ditemukan".into())
}

/// Baca MemTotal dari /proc/meminfo (kB). Gagal deteksi -> 0 (dianggap bukan lite,
/// aman: lebih baik fitur penuh jalan daripada salah masuk mode hemat).
fn total_ram_bytes_linux() -> u64 {
    let Ok(s) = std::fs::read_to_string("/proc/meminfo") else {
        return 0;
    };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            let kb = rest.trim().trim_end_matches("kB").trim();
            if let Ok(v) = kb.parse::<u64>() {
                return v.saturating_mul(1024);
            }
        }
    }
    0
}

#[tauri::command]
pub fn misc_get_lite_mode() -> serde_json::Value {
    let total = total_ram_bytes_linux();
    serde_json::json!({ "isLite": total > 0 && total <= LITE_RAM_THRESHOLD_BYTES })
}

#[tauri::command]
pub fn misc_save_temp_file(data: Vec<u8>, name: Option<String>) -> Result<String, String> {
    let raw = name.unwrap_or_default();
    // Sanitasi paritas JS: [^a-zA-Z0-9._-] -> '_'.
    let mut clean: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect();
    // Hardening kecil: "." dan ".." lolos filter karakter tapi bahaya sebagai nama file.
    if matches!(clean.as_str(), "" | "." | "..") {
        clean = format!("attachment_{}.png", chrono::Local::now().timestamp_millis());
    }
    let dir = std::env::temp_dir().join("mark-attachments");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Gagal menyiapkan folder sementara: {e}"))?;
    let target = dir.join(&clean);
    std::fs::write(&target, &data).map_err(|e| format!("Gagal menulis file sementara: {e}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn misc_open_external(app: AppHandle, url: String) -> Result<bool, String> {
    let trimmed = url.trim().to_string();
    const ALLOWED_SCHEMES: [&str; 3] = ["http://", "https://", "mailto:"];
    if !ALLOWED_SCHEMES.iter().any(|p| trimmed.starts_with(p)) {
        let scheme = trimmed.split(':').next().unwrap_or("");
        return Err(format!("Skema URL tidak diizinkan: {scheme}"));
    }
    let desc = format!(
        "Aksi \"open-external\" membutuhkan izin.\n\nPayload:\n{}",
        crate::cmd_node_bridge::payload_preview(&Some(serde_json::json!([trimmed])))
    );
    if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
        return Err("Ditolak pengguna (approval gate Tauri): open-external".into());
    }
    let mut cmd = Command::new("xdg-open");
    cmd.arg(&trimmed);
    spawn_detached(&mut cmd)?;
    Ok(true)
}

#[tauri::command]
pub fn misc_show_notification(title: Option<String>, body: Option<String>) -> bool {
    let title = title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "MARK".into());
    let mut cmd = Command::new("notify-send");
    cmd.arg(title);
    if let Some(b) = body.filter(|b| !b.is_empty()) {
        cmd.arg(b);
    }
    // Paritas perilaku engine: gagal spawn dikembalikan sebagai false, bukan error.
    spawn_detached(&mut cmd).is_ok()
}

// ---- Dialog file/folder native (pengganti stub Fase B5 dialog:*) ----------
// GTK melarang dialog dari thread non-main — pola sama dgn confirm_on_main_thread:
// dispatch ke main thread, hasil dikirim balik lewat mpsc.
fn pick_native_path(app: &AppHandle, is_dir: bool) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
    let dispatched = app.run_on_main_thread(move || {
        let picked = if is_dir {
            rfd::FileDialog::new().pick_folder()
        } else {
            rfd::FileDialog::new().pick_file()
        };
        let _ = tx.send(picked.map(|p| p.to_string_lossy().into_owned()));
    });
    if dispatched.is_err() {
        return None; // app sedang berhenti — anggap dibatalkan
    }
    rx.recv_timeout(Duration::from_secs(600)).ok().flatten()
}

#[tauri::command]
pub fn misc_open_file_dialog(app: AppHandle) -> Option<String> {
    pick_native_path(&app, false)
}

#[tauri::command]
pub fn misc_open_directory_dialog(app: AppHandle) -> Option<String> {
    pick_native_path(&app, true)
}
