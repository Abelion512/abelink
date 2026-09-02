// Jembatan stdio ke Node sidecar engine (sidecar/engine.mjs) — fase A/B migrasi.
// Protokol: request {"id",action,payload} -> response {"id",success,data|error}
//           event  : {"event","payload"} -> emit ke frontend (Tauri event system)
//
// KEAMANAN (audit 2026-08-26):
// - Aksi dibolehkan semua (deny-by-default dihapus); APPROVAL_ACTIONS tetap melindungi
//   operasi berbahaya (tg:start, tg:stop, google:connect/disconnect, dll.).
// - Aksi/tool berbahaya WAJIB melewati dialog persetujuan NATIVE di main thread
//   (rfd) — keputusan user di luar renderer, sehingga renderer kompromi pun
//   tidak bisa mengeksekusi shell tanpa klik nyata.
// - Saat engine mati, semua request pending didrain dengan error (tidak menggantung
//   sampai timeout), dan proses child dibunuh saat aplikasi keluar.
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::oneshot;

static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

type PendingRequests = Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>>;

pub struct NodeBridgeState {
    stdin_writer: Arc<tokio::sync::Mutex<Option<ChildStdin>>>,
    pending_requests: PendingRequests,
    child: Arc<tokio::sync::Mutex<Option<Child>>>,
}

impl NodeBridgeState {
    pub fn new() -> Self {
        Self {
            stdin_writer: Arc::new(tokio::sync::Mutex::new(None)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            child: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }
}

/// Bunuh proses sidecar (dipanggil saat aplikasi keluar).
pub fn kill_engine(state: &Arc<NodeBridgeState>) {
    if let Ok(mut guard) = state.child.try_lock() {
        if let Some(mut c) = guard.take() {
            log::warn!("[NodeBridge] Menghentikan sidecar engine...");
            let _ = c.start_kill();
        }
    }
}

#[derive(Serialize)]
pub struct NodeResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

// ---- Gerbang otorisasi ----------------------------------------------------
/// (deny-by-default dihapus — bypass semua aksi; APPROVAL_ACTIONS tetap melindungi
/// operasi berbahaya. Jika butuh allowlist, baca dari config file di sini.)

/// Channel sidecar yang selalu butuh persetujuan native.
/// (open-external pindah ke cmd_misc.rs::misc_open_external dengan gate rfd yang sama.)
const APPROVAL_ACTIONS: &[&str] = &[
    "skills:save",
    "skills:delete",
    "skills:save-file",
    "skills:create-item",
    "skills:delete-item",
    "skills:rename-item",
    "skills:install",
    "plugin:create",
    "plugin:delete",
    "tg:start",
    "tg:stop",
    "google:connect",
    "google:disconnect",
];

/// Kembalikan Some(deskripsi) bila aksi butuh persetujuan native.
fn approval_reason(action: &str, _payload: &Option<serde_json::Value>) -> Option<String> {
    if APPROVAL_ACTIONS.contains(&action) {
        return Some(format!("Aksi \"{action}\" membutuhkan izin."));
    }
    None
}

pub(crate) fn payload_preview(payload: &Option<serde_json::Value>) -> String {
    let s = serde_json::to_string(payload.as_ref().unwrap_or(&serde_json::Value::Null))
        .unwrap_or_default();
    if s.len() > 200 {
        format!("{}...", &s[..200])
    } else {
        s
    }
}

/// Dialog konfirmasi NATIVE — dieksekusi di MAIN thread via run_on_main_thread,
/// hasilnya dikirim balik lewat mpsc. Ini boundary di luar renderer.
/// (dipakai ulang cmd_misc.rs untuk aksi native yang setara APPROVAL_ACTIONS.)
pub(crate) fn confirm_on_main_thread(app: &AppHandle, description: String) -> bool {
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let dispatched = app.run_on_main_thread(move || {
        // rfd 0.15: tombol pakai MessageButtons, hasilnya enum MessageDialogResult.
        let result = rfd::MessageDialog::new()
            .set_title("MARK - Perlu Persetujuan")
            .set_description(&description)
            .set_buttons(rfd::MessageButtons::OkCancel)
            .show();
        // OkCancel: OK -> Yes, Cancel -> No
        let approved = matches!(result, rfd::MessageDialogResult::Yes);
        let _ = tx.send(approved);
    });
    if dispatched.is_err() {
        // Aplikasi sedang berhenti / main loop tidak tersedia -> default TOLAK.
        return false;
    }
    rx.recv_timeout(Duration::from_secs(180)).unwrap_or(false)
}

pub async fn start_node_engine(app: AppHandle, state: Arc<NodeBridgeState>) -> Result<(), String> {
    // Cari engine.mjs: cwd dev (src-tauri) -> repo root; lalu resource dir (bundled).
    let candidates = [
        std::path::PathBuf::from("sidecar/engine.mjs"),
        std::path::PathBuf::from("../sidecar/engine.mjs"),
    ];
    let mut engine_path: Option<std::path::PathBuf> = candidates
        .iter()
        .find(|p| p.exists())
        .cloned();
    if engine_path.is_none() {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let bundled = resource_dir.join("sidecar/engine.mjs");
            if bundled.exists() {
                engine_path = Some(bundled);
            }
        }
    }
    let engine_path = match engine_path {
        Some(p) => p,
        None => {
            return Err(
                "engine.mjs tidak ditemukan (dev: jalankan dari repo root; bundled: pastikan bundle.resources memuat sidecar/)".into(),
            )
        }
    };

    log::info!(
        "[NodeBridge] Memulai sidecar engine (bun) di path: {}",
        engine_path.display()
    );

    let mut cmd = Command::new("bun");

    // Dev mode: auto-reload engine saat file berubah (flag bawaan Node-compatible)
    if cfg!(debug_assertions) {
        cmd.arg("--watch");
    }

    let mut child = cmd
        .arg("run")
        .arg(&engine_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Gagal menjalankan sidecar engine (butuh bun di PATH): {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Gagal mengambil stdout sidecar engine".to_string())?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Gagal mengambil stdin sidecar engine".to_string())?;

    {
        let mut writer_lock = state.stdin_writer.lock().await;
        *writer_lock = Some(stdin);
    }
    {
        let mut child_lock = state.child.lock().await;
        *child_lock = Some(child);
    }

    let pending = state.pending_requests.clone();
    let app_handle = app.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                if let Some(event_name) = json.get("event").and_then(|v| v.as_str()) {
                    let payload = json.get("payload").unwrap_or(&serde_json::Value::Null);
                    let _ = app_handle.emit(event_name, payload);
                    continue;
                }

                if let Some(id) = json.get("id").and_then(|v| v.as_u64()) {
                    let sender_opt = {
                        let mut map = pending.lock().unwrap();
                        map.remove(&id)
                    };
                    if let Some(sender) = sender_opt {
                        let _ = sender.send(json);
                    }
                }
            }
        }
        log::warn!("[NodeBridge] Sidecar engine stdout tertutup - drain request pending");
        // Drain: semua pemanggil aktif langsung dapat error, bukan menggantung 300s.
        let stale: Vec<(u64, oneshot::Sender<serde_json::Value>)> = {
            let mut map = pending.lock().unwrap();
            map.drain().collect()
        };
        for (id, sender) in stale {
            let frame = serde_json::json!({
                "id": id,
                "success": false,
                "error": "Sidecar engine berhenti sebelum merespons"
            });
            let _ = sender.send(frame);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn node_invoke(
    app: AppHandle,
    action: String,
    payload: Option<serde_json::Value>,
) -> Result<NodeResponse, String> {
    // 1) Bypass deny-by-default — aksi bebas lewat, APPROVAL_ACTIONS tetap dicek di bawah.
    //    (Elemen keamanan: aksi berbahaya tetap minta konfirmasi native.)
    //    Jika butuh pendalaman, ganti ke allowlist whitelist yang dibaca dari config file.

    // 2) Persetujuan NATIVE untuk aksi/tool berbahaya (di luar kendali renderer).
    if let Some(desc) = approval_reason(&action, &payload) {
        if !confirm_on_main_thread(&app, desc) {
            return Err(format!("Ditolak pengguna (approval gate Tauri): {action}"));
        }
    }

    let state = app.state::<Arc<NodeBridgeState>>();
    let req_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::SeqCst);

    let (tx, rx) = oneshot::channel();
    {
        let mut map = state.pending_requests.lock().unwrap();
        map.insert(req_id, tx);
    }

    let request_json = serde_json::json!({
        "id": req_id,
        "action": action,
        "payload": payload.unwrap_or(serde_json::Value::Null)
    });

    let mut request_str = request_json.to_string();
    request_str.push('\n');

    {
        let mut writer_lock = state.stdin_writer.lock().await;
        if let Some(ref mut stdin) = *writer_lock {
            stdin
                .write_all(request_str.as_bytes())
                .await
                .map_err(|e| format!("Gagal menulis ke sidecar: {}", e))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("Gagal flush ke sidecar: {}", e))?;
        } else {
            let mut map = state.pending_requests.lock().unwrap();
            map.remove(&req_id);
            return Err("Sidecar engine tidak aktif".to_string());
        }
    }

    // Timeout panjang untuk operasi AI berat
    match tokio::time::timeout(Duration::from_secs(300), rx).await {
        Ok(Ok(response_json)) => {
            let success = response_json
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let data = response_json.get("data").cloned();
            let error = response_json
                .get("error")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            Ok(NodeResponse { success, data, error })
        }
        Ok(Err(_)) => Err("Koneksi channel sidecar terputus".to_string()),
        Err(_) => {
            let mut map = state.pending_requests.lock().unwrap();
            map.remove(&req_id);
            Err(format!("Request timeout (300s) untuk aksi '{}'", action))
        }
    }
}
