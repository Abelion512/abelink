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
/// Sidecar dijalankan sebagai pemimpin process group sendiri, sehingga
/// kill di sini memakai killpg: cucu-cucu (linux-daemon.py, background
/// task, dsb.) ikut mati dan tidak jadi orphan yang nyangkut.
pub fn kill_engine(state: &Arc<NodeBridgeState>) {
    if let Ok(mut guard) = state.child.try_lock() {
        if let Some(mut c) = guard.take() {
            log::warn!("[NodeBridge] Menghentikan sidecar engine...");
            if let Some(pid) = c.id() {
                // Matikan seluruh grup dulu (cucu ikut mati), lalu anak langsung.
                // Guard comm: jangan kill grup bila PID sudah dipakai ulang
                // proses lain (race task pendek selesai sebelum exit).
                if group_is_ours(pid, &["bun", "mark-engine"]) {
                    unsafe {
                        libc::kill(-(pid as libc::pid_t), libc::SIGKILL);
                    }
                }
            }
            let _ = c.start_kill();
        }
    }
}

/// Cek /proc/<pid>/comm agar killpg tidak mengenai grup proses lain bila
/// PID sudah dipakai ulang. Linux-only (sesuai target proyek).
pub(crate) fn group_is_ours(pid: u32, names: &[&str]) -> bool {
    match std::fs::read_to_string(format!("/proc/{pid}/comm")) {
        Ok(comm) => names.iter().any(|n| comm.trim() == *n),
        Err(_) => false,
    }
}

/// Ambil pesan error dari frame respons engine.
///
/// Engine mengirim `error` sebagai string ATAU objek `{message, code}`
/// (mis. channel `ai:fetch`). Versi lama hanya membaca bentuk string —
/// pesan objek (termasuk seluruh error provider AI) diam-diam hilang dan
/// renderer hanya melihat `error: null` ("AI fetch gagal" tanpa sebab).
/// Helper murni agar bisa di-unit-test.
pub fn error_message(value: &serde_json::Value) -> Option<String> {
    match value.get("error") {
        Some(serde_json::Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        Some(serde_json::Value::Object(map)) => {
            // Objek tanpa message yang bisa dipakai tidak ada gunanya untuk
            // user (JSON mentah) — kembalikan None agar renderer memakai
            // fallback ramah yang memberi langkah perbaikan.
            match map.get("message").and_then(|v| v.as_str()) {
                Some(m) if !m.trim().is_empty() => Some(m.to_string()),
                _ => None,
            }
        }
        // Angka/bool sebagai error: teruskan apa adanya; null/absen -> None.
        Some(other) => {
            let s = other.to_string();
            if s.trim().is_empty() || s == "null" {
                None
            } else {
                Some(s.trim_matches('"').to_string())
            }
        }
        None => None,
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
///
/// Dipakai juga watchdog Fase 2 sebagai definisi "aksi destruktif".
pub(crate) fn is_gated_action(action: &str) -> bool {
    APPROVAL_ACTIONS.contains(&action)
}
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
    // Capability Manager (fase Kapabilitas): eksekusi connector yang BERISIKO
    // (tulis/hapus/shell/authorize) dikonfirmasi native (rfd) di main thread —
    // keputusan di luar renderer/model. Aksi read-only aman (weather/time,
    // fs list/read, status extension) lolos via is_readonly_capability.
    "capabilities:execute",
    // Authorize/revoke = memberi/mencabut izin kredensial connector — setara
    // keamanan dgn connect google / start tg. Wajib gate native (rfd).
    "capabilities:authorize",
    "capabilities:revoke",
    // OS automation namespace colon (Fase B6, engine/channels/os.mjs): aksi
    // MUTASI fisik (klik/ketik/shortcut/scroll/buka) wajib dialog native.
    // Baca/list/fokus/tanya = observasi, lolos (verifier butuh sunyi).
    "os:click",
    "os:type",
    "os:key",
    "os:scroll",
    "os:open",
];

/// Peta aksi -> family kebijakan approval berjenjang (approval_policy.rs).
/// Family read-only (fs-read) default "always"; sisanya default "ask".
fn action_family(action: &str) -> &'static str {
    match action {
        "skills:save" | "skills:delete" | "skills:save-file" | "skills:create-item"
        | "skills:delete-item" | "skills:rename-item" | "skills:install" => "skills-write",
        "plugin:create" | "plugin:delete" => "plugin-write",
        "tg:start" | "tg:stop" => "tg-control",
        "google:connect" | "google:disconnect" => "google-auth",
        "capabilities:execute" => "capabilities-execute",
        "capabilities:authorize" | "capabilities:revoke" => "capabilities-authorize",
        _ => "connector-approve",
    }
}

/// Kembalikan Some(deskripsi) bila aksi butuh persetujuan native.
/// Kebijakan berjenjang: family "always" -> tanpa dialog; "session" ->
/// grant in-memory sekali tanya; "ask" -> dialog rfd tiap kali.
fn approval_reason(action: &str, payload: &Option<serde_json::Value>) -> Option<String> {
    if APPROVAL_ACTIONS.contains(&action) {
        // Tiering capabilities: aksi read-only yang aman lolos tanpa dialog
        // (weather/time, status/faq extension, fs list/read). Tulis/hapus,
        // shell, dan connector tak dikenal tetap lewat dialog.
        if action == "capabilities:execute" && is_readonly_capability(payload) {
            return None;
        }
        let family = action_family(action);
        let eff = crate::approval_policy::effective_policy(family);
        if eff == crate::approval_policy::POLICY_ALWAYS || eff == crate::approval_policy::POLICY_SESSION {
            return None;
        }
        return Some(format!("Aksi \"{action}\" membutuhkan izin."));
    }
    None
}

/// Pasangan (connector, aksi) capabilities yang read-only dan aman:
/// cuaca/waktu, status/faq extension, baca/list file workspace.
/// Payload capabilities:execute = [connectorId, actionId, args, opts].
fn is_readonly_capability(payload: &Option<serde_json::Value>) -> bool {
    let arr = match payload.as_ref().and_then(|p| p.as_array()) {
        Some(a) => a,
        None => return false,
    };
    let conn = arr.first().and_then(|v| v.as_str()).unwrap_or("");
    let act = arr.get(1).and_then(|v| v.as_str()).unwrap_or("");
    matches!(
        (conn, act),
        ("weather", _)
            | ("time", _)
            | ("browser-extension", "status")
            | ("browser-extension", "guide-install")
            | ("browser-extension", "close-session")
            | ("fs", "list")
            | ("fs", "read")
    )
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
            .set_title("Abelink - Perlu Persetujuan")
            .set_description(&description)
            .set_buttons(rfd::MessageButtons::OkCancel)
            .show();
        // OkCancel: OK -> Ok/Yes, Cancel -> Cancel/No
        let approved = matches!(
            result,
            rfd::MessageDialogResult::Ok | rfd::MessageDialogResult::Yes
        );
        let _ = tx.send(approved);
    });
    if dispatched.is_err() {
        // Aplikasi sedang berhenti / main loop tidak tersedia -> default TOLAK.
        return false;
    }
    rx.recv_timeout(Duration::from_secs(180)).unwrap_or(false)
}

pub async fn start_node_engine(app: AppHandle, state: Arc<NodeBridgeState>) -> Result<(), String> {
    // Rilis: binary single-file hasil `bun run build:sidecar` — tanpa butuh
    // bun/node_modules di mesin user. Dev: source tree via `bun run` (+ --watch).
    // Kandidat ganda karena Tauri memetakan resource `..` ke `_up_/` di bundle.
    let mut cmd = if cfg!(debug_assertions) {
        let candidates = [
            std::path::PathBuf::from("sidecar/engine.mjs"),
            std::path::PathBuf::from("../sidecar/engine.mjs"),
        ];
        let engine_path = candidates.iter().find(|p| p.exists()).cloned().ok_or_else(|| {
            "engine.mjs tidak ditemukan (dev: jalankan dari repo root)".to_string()
        })?;
        log::info!(
            "[NodeBridge] Memulai sidecar engine (bun, dev) di path: {}",
            engine_path.display()
        );
        let mut c = Command::new("bun");
        c.arg("--watch").arg("run").arg(&engine_path);
        // Grup proses sendiri: kill_engine memakai killpg agar cucu sidecar
        // (daemon python, background task) ikut mati saat aplikasi keluar.
        c.process_group(0);
        c
    } else {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Gagal resolve resource dir: {e}"))?;
        let exe = ["mark-engine", "_up_/dist-sidecar/mark-engine"]
            .iter()
            .map(|p| resource_dir.join(p))
            .find(|p| p.exists())
            .ok_or_else(|| {
                "mark-engine tidak ditemukan di bundle (rilis: jalankan `bun run build:sidecar` sebelum `tauri build`)".to_string()
            })?;
        log::info!(
            "[NodeBridge] Memulai sidecar engine (binary) di path: {}",
            exe.display()
        );
        let mut c = Command::new(&exe);
        let scripts = ["pc-agent-scripts", "_up_/sidecar/main/pc-agent-scripts"]
            .iter()
            .map(|p| resource_dir.join(p))
            .find(|p| p.is_dir());
        if let Some(dir) = scripts {
            c.env("MARK_RESOURCE_DIR", dir);
        }
        // Grup proses sendiri: kill_engine memakai killpg agar cucu sidecar
        // ikut mati saat aplikasi keluar (tidak jadi orphan yang nyangkut).
        c.process_group(0);
        c
    };

    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Gagal menjalankan sidecar engine: {}", e))?;

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

    // 1.5) Watchdog Fase 2 (di luar jangkauan JS): hitung invoke per sesi.
    //    Soft breach -> cabut session grants + emit event, request ini tetap
    //    diproses lewat gate normal (yang kini kembali bertanya). Hard breach
    //    (runaway) -> tolak request; loop JS melihat error dan berhenti graceful.
    if let Some(breach) = crate::watchdog::record_action(is_gated_action(&action)) {
        log::warn!(
            "[Watchdog] breach {} pada aksi '{}' — mencabut session grants",
            breach.kind(),
            action
        );
        crate::approval_policy::reset_session();
        let _ = app.emit(
            "watchdog-breach",
            serde_json::json!({ "kind": breach.kind(), "action": action }),
        );
        if breach.is_hard() {
            return Err(format!(
                "Watchdog: laju invoke runaway ({}), request '{}' ditolak. Kurangi kecepatan atau mulai ulang misi.",
                breach.kind(),
                action
            ));
        }
    }

    // 1.6) Mission scope Fase 3: penolakan deterministik tanpa dialog bila aksi
    //    di luar tool yang dideklarasikan misi. Nonaktif secara default.
    if let Err(e) = crate::mission_scope::check_tool(&action) {
        return Err(e);
    }

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
            let error = error_message(&response_json);

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

#[cfg(test)]
mod tests {
    use super::error_message;

    fn frame(json: serde_json::Value) -> Option<String> {
        error_message(&json)
    }

    #[test]
    fn string_error_passes_through() {
        let v = serde_json::json!({ "success": false, "error": "Sidecar engine tidak aktif" });
        assert_eq!(frame(v).as_deref(), Some("Sidecar engine tidak aktif"));
    }

    #[test]
    fn object_error_keeps_message_field() {
        // Bentuk yang dikirim channel ai:fetch — inilah yang dulu hilang.
        let v = serde_json::json!({
            "success": false,
            "error": { "message": "9Router tidak jalan di localhost:20128", "code": "FETCH_FAILED" }
        });
        assert_eq!(
            frame(v).as_deref(),
            Some("9Router tidak jalan di localhost:20128")
        );
    }

    #[test]
    fn object_error_without_usable_message_is_none() {
        // Objek tanpa message: renderer memakai fallback ramah, bukan JSON mentah.
        let v = serde_json::json!({ "success": false, "error": { "code": "X" } });
        assert_eq!(frame(v), None);
    }

    #[test]
    fn missing_or_null_error_is_none() {
        assert_eq!(frame(serde_json::json!({ "success": true })), None);
        assert_eq!(frame(serde_json::json!({ "success": false, "error": null })), None);
        assert_eq!(frame(serde_json::json!({ "success": false, "error": "" })), None);
        assert_eq!(
            frame(serde_json::json!({ "success": false, "error": { "message": "  " } })),
            None
        );
    }
}
