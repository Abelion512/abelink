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
use base64::Engine as _;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Paritas dgn engine.mjs (`os.totalmem() <= 4.5e9`).
pub(crate) const LITE_RAM_THRESHOLD_BYTES: u64 = 4_500_000_000;

/// Namespace /tmp per flavor: dev (debug profile, ABELINK_DATA_HOME set oleh
/// dev.sh) memakai subdir -dev agar file sementara tak dibaca instansi prod.
fn tmp_flavored(top: &str) -> std::path::PathBuf {
    let dev = std::env::var("ABELINK_DATA_HOME")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .is_some();
    let name = if dev { format!("{top}-dev") } else { top.to_string() };
    std::env::temp_dir().join(name)
}

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

/// Host internal/privat? (paritas dgn validasi SSRF di attachments.js)
fn is_private_host(host: &str) -> bool {
    let h = host
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_lowercase();
    if h.is_empty() {
        return true;
    }
    if h == "localhost"
        || h.ends_with(".localhost")
        || h.ends_with(".local")
        || h.ends_with(".internal")
        || h.ends_with(".intranet")
        || h.ends_with(".lan")
    {
        return true;
    }
    if let Ok(ip) = h.parse::<std::net::Ipv4Addr>() {
        let o = ip.octets();
        return o[0] == 0
            || o[0] == 10
            || o[0] == 127
            || (o[0] == 100 && (64..=127).contains(&o[1]))
            || (o[0] == 169 && o[1] == 254)
            || (o[0] == 172 && (16..=31).contains(&o[1]))
            || (o[0] == 192 && o[1] == 168);
    }
    if let Ok(ip) = h.parse::<std::net::Ipv6Addr>() {
        let seg = ip.segments();
        return ip.is_loopback()
            || ip.is_unspecified()
            || (seg[0] & 0xffc0) == 0xfe80 // fe80::/10 link-local
            || (seg[0] & 0xfe00) == 0xfc00; // fc00::/7 ULA
    }
    false
}

/// Fetch resource web (gambar drop) DI SINI, bukan di renderer:
/// - URL taint dari user tidak pernah menyentuh fetch renderer (CodeQL SSRF)
/// - Validasi scheme + host privat di native, timeout & cap 10MB
/// - Bonus arsitektur: tidak terkena CORS situs — drop gambar web lebih sering
///   jadi file nyata, bukan link-only.
#[tauri::command]
pub async fn misc_fetch_web_resource(url: String) -> Result<serde_json::Value, String> {
    const MAX_BYTES: usize = 10 * 1024 * 1024;
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("URL tidak valid: {e}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Hanya http/https yang diizinkan.".into());
    }
    let host = parsed.host_str().unwrap_or("").to_string();
    if is_private_host(&host) {
        return Err("URL menuju host internal/privat ditolak.".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Gagal menyiapkan client: {e}"))?;
    let resp = client
        .get(parsed.clone())
        .send()
        .await
        .map_err(|e| format!("Fetch gagal: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    if let Some(len) = resp.content_length() {
        if len as usize > MAX_BYTES {
            return Err("Ukuran melebihi 10MB".into());
        }
    }
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| format!("Gagal baca body: {e}"))?;
    if bytes.len() > MAX_BYTES {
        return Err("Ukuran melebihi 10MB".into());
    }
    use base64::Engine as _;
    Ok(serde_json::json!({
        "dataB64": base64::engine::general_purpose::STANDARD.encode(&bytes),
        "mime": mime,
        "finalUrl": parsed.as_str()
    }))
}

/// Konfirmasi NATIVE generik (rfd dialog di main thread) untuk aksi berisiko
/// yang tidak lewat jalur sidecar — mis. trading-deposit (gerbang uang).
/// Keputusan tetap di luar renderer; renderer kompromi tidak bisa konfirmasi.
#[tauri::command]
pub fn misc_native_confirm(app: AppHandle, message: String) -> Result<bool, String> {
    let msg = message.trim();
    if msg.is_empty() || msg.len() > 1000 {
        return Err("Pesan konfirmasi kosong atau terlalu panjang.".into());
    }
    Ok(crate::cmd_node_bridge::confirm_on_main_thread(
        &app,
        msg.to_string(),
    ))
}

/// Baca MemTotal dari /proc/meminfo (kB). Gagal deteksi -> 0 (dianggap bukan lite,
/// aman: lebih baik fitur penuh jalan daripada salah masuk mode hemat).
pub(crate) fn total_ram_bytes_linux() -> u64 {
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
    // totalRAMGB: RAM nyata (bulat ke atas, +0.5GB) — dipakai auto-profile.
    // -1 = deteksi gagal (bukan 0, agar dibedakan dari "belum terbaca").
    let gb = if total > 0 {
        serde_json::Value::from(((total as f64 / 1_073_741_824.0) + 0.5).floor() as i64)
    } else {
        serde_json::Value::from(-1)
    };
    serde_json::json!({ "isLite": total > 0 && total <= LITE_RAM_THRESHOLD_BYTES, "totalRAMGB": gb })
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
    let dir = tmp_flavored("abelink-attachments");
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
        .unwrap_or_else(|| "Abelink".into());
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

/// Dialog multi-select: kembalikan semua file yang dipilih (kosong = cancel).
/// Pola main-thread sama dengan pick_native_path (GTK melarang dialog non-main).
#[tauri::command]
pub fn misc_open_files_dialog(app: AppHandle) -> Vec<String> {
    let (tx, rx) = std::sync::mpsc::channel::<Vec<String>>();
    let dispatched = app.run_on_main_thread(move || {
        let picked = rfd::FileDialog::new().pick_files();
        let _ = tx.send(
            picked
                .map(|paths| {
                    paths
                        .into_iter()
                        .map(|p| p.to_string_lossy().into_owned())
                        .collect()
                })
                .unwrap_or_default(),
        );
    });
    if dispatched.is_err() {
        return Vec::new();
    }
    rx.recv_timeout(Duration::from_secs(600)).unwrap_or_default()
}

/// Stat metadata file untuk preview: (size_bytes, is_dir, modified_unix_secs).
/// Hanya membaca metadata — tidak pernah membaca isi file.
#[tauri::command]
pub fn misc_stat_path(path: String) -> Result<(u64, bool, i64), String> {
    let p = std::path::PathBuf::from(&path);
    let meta = std::fs::metadata(&p).map_err(|e| format!("{}: {}", e, path))?;
    let size = meta.len();
    let is_dir = meta.is_dir();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    Ok((size, is_dir, modified))
}

#[tauri::command]
pub fn misc_open_directory_dialog(app: AppHandle) -> Option<String> {
    pick_native_path(&app, true)
}

// ---- Screenshot layar penuh (Fase B5 dipercepat) ---------------------------
// CATATAN: opasitas window TIDAK bisa diimplement di Tauri 2.11 (API
// set_opacity hanya ada di v1). Limitasi platform didokumentasikan di
// session log; slider UI tidak dibuat agar tidak menjanjikan hal mustahil.

fn b64_encode(data: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(data)
}

/// Screenshot layar penuh via tool sistem yang tersedia (X11). Kembalikan
/// data URL PNG; Err berisi alasan tool terakhir bila semua gagal.
#[tauri::command]
pub fn misc_take_screenshot() -> Result<String, String> {
    let dir = tmp_flavored("abelink-screenshots");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Gagal menyiapkan folder screenshot: {e}"))?;
    let path = dir.join(format!(
        "abelink-screenshot-{}.png",
        chrono::Local::now().timestamp_millis()
    ));
    let path_str = path.to_string_lossy().into_owned();
    let attempts: Vec<(&str, Vec<String>)> = vec![
        ("maim", vec![path_str.clone()]),
        ("scrot", vec!["-z".into(), path_str.clone()]),
        (
            "import",
            vec!["-window".into(), "root".into(), "-silent".into(), path_str.clone()],
        ),
        ("gnome-screenshot", vec!["-f".into(), path_str.clone()]),
    ];
    let mut last_err = String::from(
        "Tidak ada tool screenshot terpasang (coba: sudo apt install scrot / maim)",
    );
    for (prog, args) in attempts {
        match Command::new(prog).args(&args).output() {
            Ok(out)
                if out.status.success()
                    && path.is_file()
                    && path.metadata().map(|m| m.len() > 0).unwrap_or(false) =>
            {
                let bytes =
                    std::fs::read(&path).map_err(|e| format!("Gagal baca screenshot: {e}"))?;
                let _ = std::fs::remove_file(&path);
                return Ok(format!("data:image/png;base64,{}", b64_encode(&bytes)));
            }
            Ok(out) => {
                last_err = format!("{prog} gagal: {}", String::from_utf8_lossy(&out.stderr));
            }
            Err(_) => {
                last_err = format!("{prog} tidak tersedia");
            }
        }
    }
    let _ = std::fs::remove_file(&path);
    Err(last_err)
}

/// Baca file biner (gambar lampiran) sebagai data URL base64 untuk vision payload.
/// Batas 10MB sama seperti fs_read_file. Tanpa confinement workspace seperti
/// misc_stat_path — path berasal dari dialog native / temp file lampiran.
#[tauri::command]
pub fn misc_read_file_base64(path: String) -> Result<String, String> {
    const MAX_BYTES: u64 = 10 * 1024 * 1024;
    let p = std::path::PathBuf::from(&path);
    let meta = std::fs::metadata(&p).map_err(|e| format!("{}: {}", e, path))?;
    if meta.len() > MAX_BYTES {
        return Err(format!("File >10MB, tolak baca: {}", path));
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("{}: {}", e, path))?;
    let mime = match p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{mime};base64,{}", b64_encode(&bytes)))
}

/// Salin folder extension ter-bundel ke data dir agar pengguna binary
/// (tanpa folder repo) bisa load unpacked. Idempoten: timpa file berubah.
/// Mengembalikan path folder hasil instalasi.
#[tauri::command]
pub fn misc_ensure_extension_files(app: AppHandle) -> Result<String, String> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("extension"));
        candidates.push(resource_dir.join("_up_/extension"));
    }
    candidates.push(std::path::PathBuf::from("extension"));
    candidates.push(std::path::PathBuf::from("../extension"));

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("extension"));
            candidates.push(parent.join("_up_/extension"));
            candidates.push(parent.join("../extension"));
        }
    }

    let src = candidates
        .into_iter()
        .find(|p| p.join("manifest.json").is_file())
        .ok_or_else(|| "Folder extension tidak ditemukan di bundle maupun workspace dev.".to_string())?;

    let dest = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal resolve data dir: {e}"))?
        .join("extension");

    let should_copy = match (src.canonicalize(), dest.canonicalize()) {
        (Ok(s), Ok(d)) => s != d,
        _ => true,
    };

    if should_copy {
        copy_dir_recursive(&src, &dest)?;
    }

    dest.to_str()
        .map(|s| s.to_owned())
        .ok_or_else(|| "Path extension non-UTF8.".into())
}

fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| format!("Gagal buat dir extension: {e}"))?;
    let entries =
        std::fs::read_dir(src).map_err(|e| format!("Gagal baca resource extension: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Gagal baca entry: {e}"))?;
        let (s, d) = (entry.path(), dest.join(entry.file_name()));
        if s.is_dir() {
            copy_dir_recursive(&s, &d)?;
        } else {
            std::fs::copy(&s, &d).map_err(|e| format!("Gagal salin extension: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn misc_open_folder(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("Folder tidak ditemukan.".into());
    }
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Gagal membuka folder: {e}"))?;
    Ok(())
}
