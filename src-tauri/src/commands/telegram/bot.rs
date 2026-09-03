use std::sync::{Arc, Mutex};
use tauri::State;
use reqwest::Client;

pub struct TelegramState(pub Arc<Mutex<TelegramInner>>);

#[derive(Clone)]
pub struct TelegramInner {
    pub token: String,
    pub chat_ids: Vec<String>,
}

impl TelegramInner {
    pub fn new(token: String) -> Self {
        Self { token, chat_ids: Vec::new() }
    }
}

/// Kirim pesan langsung ke Telegram Bot API (tanpa bot runtime).
/// Digunakan untuk send-message & broadcast — bot event loop tetap di JS (Telegraf).
fn call_api(token: &str, method: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let runtime = tokio::runtime::Runtime::new().map_err(|e| format!("RT: {e}"))?;
    runtime.block_on(async {
        let client = Client::new();
        let resp = client
            .post(format!("https://api.telegram.org/bot{}/{}", token, method))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP: {e}"))?;
        resp.json().await.map_err(|e| format!("JSON: {e}"))
    })
}

#[tauri::command]
pub fn telegram_configure(state: State<TelegramState>, token: String) -> Result<serde_json::Value, String> {
    let mut guard = state.0.lock().map_err(|e| format!("Lock: {}", e))?;
    guard.token = token.clone();
    Ok(serde_json::json!({ "status": "configured", "token_set": !token.is_empty() }))
}

#[tauri::command]
pub fn telegram_send_message(
    state: State<TelegramState>,
    chat_id: String,
    text: String,
) -> Result<serde_json::Value, String> {
    let token = { state.0.lock().map_err(|e| format!("Lock: {}", e))?.token.clone() };
    if token.is_empty() {
        return Err("Bot belum dikonfigurasi (token kosong).".into());
    }
    let body = serde_json::json!({ "chat_id": chat_id, "text": text });
    call_api(&token, "sendMessage", body)
}

#[tauri::command]
pub fn telegram_broadcast_to_admins(
    state: State<TelegramState>,
    text: String,
) -> Result<serde_json::Value, String> {
    let (token, chat_ids) = {
        let guard = state.0.lock().map_err(|e| format!("Lock: {}", e))?;
        (guard.token.clone(), guard.chat_ids.clone())
    };
    if token.is_empty() {
        return Err("Bot belum dikonfigurasi (token kosong).".into());
    }
    if chat_ids.is_empty() {
        return Err("Belum ada admin chat yang terdaftar. Panggil telegram_register_admin_chat dulu.".into());
    }
    let mut results = Vec::new();
    for cid in &chat_ids {
        let body = serde_json::json!({ "chat_id": cid, "text": text });
        results.push(call_api(&token, "sendMessage", body)?);
    }
    Ok(serde_json::json!({ "sent": results.len() }))
}

#[tauri::command]
pub fn telegram_register_admin_chat(state: State<TelegramState>, chat_id: String) -> Result<serde_json::Value, String> {
    let mut guard = state.0.lock().map_err(|e| format!("Lock: {}", e))?;
    if !guard.chat_ids.contains(&chat_id) {
        guard.chat_ids.push(chat_id);
    }
    Ok(serde_json::json!({ "registered": guard.chat_ids.len() }))
}

#[tauri::command]
pub fn telegram_status(state: State<TelegramState>) -> Result<serde_json::Value, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock: {}", e))?;
    Ok(serde_json::json!({
        "status": if guard.token.is_empty() { "disconnected" } else { "connected" },
        "chat_count": guard.chat_ids.len()
    }))
}

/// Kirim foto PNG (base64 dari misc_take_screenshot) ke satu chat Telegram.
/// Menggantikan channel sidecar lama `tg:take-screenshot` yang handler-nya
/// dihapus saat pembersihan electron (9923989) — pemanggil tool AI
/// `screenshot-to-tg` sempat mati total sejak commit itu.
#[tauri::command]
pub fn telegram_send_photo(
    state: State<TelegramState>,
    chat_id: String,
    png_base64: String,
    caption: Option<String>,
) -> Result<serde_json::Value, String> {
    let token = { state.0.lock().map_err(|e| format!("Lock: {}", e))?.token.clone() };
    if token.is_empty() {
        return Err("Bot belum dikonfigurasi (token kosong).".into());
    }
    use base64::Engine as _;
    let png = base64::engine::general_purpose::STANDARD
        .decode(png_base64.trim())
        .map_err(|e| format!("Base64 tidak valid: {e}"))?;
    if png.is_empty() {
        return Err("Foto kosong.".into());
    }
    if png.len() > 10 * 1024 * 1024 {
        return Err("Foto melebihi batas 10MB Bot API.".into());
    }
    let name = format!("mark-screen-{}.png", chrono::Local::now().timestamp_millis());

    let runtime = tokio::runtime::Runtime::new().map_err(|e| format!("RT: {e}"))?;
    runtime.block_on(async {
        let part = reqwest::multipart::Part::bytes(png)
            .file_name(name)
            .mime_str("image/png")
            .map_err(|e| format!("MIME: {e}"))?;
        let mut form = reqwest::multipart::Form::new().part("photo", part);
        if let Some(cap) = caption {
            let cap = cap.trim();
            if !cap.is_empty() {
                form = form.text("caption", cap.to_string());
            }
        }
        let client = Client::new();
        let resp = client
            .post(format!("https://api.telegram.org/bot{}/sendPhoto", token))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("HTTP: {e}"))?;
        resp.json().await.map_err(|e| format!("JSON: {e}"))
    })
}
