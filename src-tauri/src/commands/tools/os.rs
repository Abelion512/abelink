use serde::Serialize;
use std::process::Command;
use tauri::AppHandle;

/// Detect whether the current session is X11. Returns true only when $DISPLAY
/// is set and $WAYLAND_DISPLAY is absent. All xdotool-based commands require X11.
fn is_x11() -> bool {
    std::env::var("DISPLAY").is_ok() && std::env::var("WAYLAND_DISPLAY").is_err()
}

#[derive(Serialize)]
pub struct ToolResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn xdotool(args: &[&str]) -> Result<String, String> {
    let out = Command::new("xdotool")
        .args(args)
        .output()
        .map_err(|e| format!("xdotool tidak tersedia: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if out.status.success() {
        Ok(stdout)
    } else {
        Err(stderr)
    }
}

fn require_x11() -> Result<(), String> {
    if is_x11() {
        Ok(())
    } else {
        Err("Otomatisasi PC (xdotool) hanya didukung di X11. Wayland tidak didukung saat ini.".into())
    }
}

const DANGEROUS_KEYS: &[&str] =
    &["ctrl", "alt", "super", "shift", "escape", "backspace", "delete"];

fn is_dangerous_key(q: &str) -> bool {
    let lower = q.to_lowercase();
    DANGEROUS_KEYS.iter().any(|kw| lower.contains(kw))
}

#[tauri::command]
pub fn os_is_x11() -> bool {
    is_x11()
}

#[tauri::command]
pub fn os_click(app: AppHandle, query: String) -> Result<ToolResult, String> {
    require_x11()?;
    let lower = query.to_lowercase();
    if is_dangerous_key(&query) && lower.contains("click") {
        // Approval berjenjang (family os-control).
        let eff = crate::approval_policy::effective_policy("os-control");
        if eff != crate::approval_policy::POLICY_ALWAYS && eff != crate::approval_policy::POLICY_SESSION {
            let desc = format!("Mark ingin klik mouse:\n{}", query);
            if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("Ditolak.".into()),
                });
            }
        }
    }
    let out = xdotool(&["click", "1"])?;
    Ok(ToolResult {
        success: true,
        output: Some(out),
        error: None,
    })
}

#[tauri::command]
pub fn os_double_click(app: AppHandle, query: String) -> Result<ToolResult, String> {
    require_x11()?;
    if is_dangerous_key(&query) {
        // Approval berjenjang (family os-control).
        let eff = crate::approval_policy::effective_policy("os-control");
        if eff != crate::approval_policy::POLICY_ALWAYS && eff != crate::approval_policy::POLICY_SESSION {
            let desc = format!("Mark ingin double-click mouse:\n{}", query);
            if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("Ditolak.".into()),
                });
            }
        }
    }
    let out = xdotool(&["click", "2"])?;
    Ok(ToolResult {
        success: true,
        output: Some(out),
        error: None,
    })
}

#[tauri::command]
pub fn os_delay(query: String) -> Result<ToolResult, String> {
    require_x11()?;
    let ms: u64 = query.trim().parse().unwrap_or(100);
    std::thread::sleep(std::time::Duration::from_millis(ms));
    Ok(ToolResult {
        success: true,
        output: Some(format!("Delay {}ms", ms)),
        error: None,
    })
}

#[tauri::command]
pub fn os_type(app: AppHandle, text: String) -> Result<ToolResult, String> {
    require_x11()?;
    if is_dangerous_key(&text) {
        // Approval berjenjang (family os-control): owner bisa set always/session.
        let eff = crate::approval_policy::effective_policy("os-control");
        if eff != crate::approval_policy::POLICY_ALWAYS && eff != crate::approval_policy::POLICY_SESSION {
            let desc = format!("Mark ingin mengetik teks berbahaya:\n{}", text);
            if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("Ditolak.".into()),
                });
            }
        }
    }
    let out = xdotool(&["type", "--delay", "10", &text])?;
    Ok(ToolResult {
        success: true,
        output: Some(out),
        error: None,
    })
}

#[tauri::command]
pub fn os_key(app: AppHandle, key: String) -> Result<ToolResult, String> {
    require_x11()?;
    if is_dangerous_key(&key) {
        // Approval berjenjang (family os-control): owner bisa set always/session.
        let eff = crate::approval_policy::effective_policy("os-control");
        if eff != crate::approval_policy::POLICY_ALWAYS && eff != crate::approval_policy::POLICY_SESSION {
            let desc = format!("Mark ingin menekan shortcut berbahaya:\n{}", key);
            if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
                return Ok(ToolResult {
                    success: false,
                    output: None,
                    error: Some("Ditolak.".into()),
                });
            }
        }
    }
    let xk = match key.to_lowercase().as_str() {
        "enter" => "Return",
        "esc" => "Escape",
        "tab" => "Tab",
        "space" => "space",
        "up" => "Up",
        "down" => "Down",
        "left" => "Left",
        "right" => "Right",
        "backspace" => "BackSpace",
        k if k.starts_with('f') && k.len() == 2 => {
            let n = k.chars().nth(1).unwrap_or('0');
            if n.is_ascii_digit() {
                let out = xdotool(&["key", "--delay", "50", &format!("F{}", n)])?;
                return Ok(ToolResult {
                    success: true,
                    output: Some(out),
                    error: None,
                });
            }
            return Ok(ToolResult {
                success: false,
                output: None,
                error: Some("Unknown F-key".into()),
            });
        }
        _ => &key,
    };
    let out = xdotool(&["key", "--delay", "50", xk])?;
    Ok(ToolResult {
        success: true,
        output: Some(out),
        error: None,
    })
}

#[tauri::command]
pub fn os_scroll(query: String) -> Result<ToolResult, String> {
    require_x11()?;
    // xdotool: button 4=scroll up, button 5=scroll down
    let btn = if query.to_lowercase().contains("up") {
        "4"
    } else {
        "5"
    };
    let out = xdotool(&["click", btn])?;
    Ok(ToolResult {
        success: true,
        output: Some(out),
        error: None,
    })
}

#[tauri::command]
pub fn os_read() -> Result<ToolResult, String> {
    require_x11()?;
    let wid = xdotool(&["getactivewindow"])?;
    let name = xdotool(&["getwindowname", &wid])?;
    Ok(ToolResult {
        success: true,
        output: Some(name),
        error: None,
    })
}

#[tauri::command]
pub fn os_list_windows() -> Result<ToolResult, String> {
    require_x11()?;
    let out = xdotool(&["getwindowlist"])?;
    Ok(ToolResult {
        success: true,
        output: Some(out),
        error: None,
    })
}

#[tauri::command]
pub fn os_focus_window(query: String) -> Result<ToolResult, String> {
    require_x11()?;
    let out = xdotool(&["windowfocus", &query])?;
    Ok(ToolResult {
        success: true,
        output: Some(out),
        error: None,
    })
}

#[tauri::command]
pub fn os_open(_app: AppHandle, query: String) -> Result<ToolResult, String> {
    // os-open via xdg-open (Linux standard)
    let out = Command::new("xdg-open")
        .arg(&query)
        .output()
        .map_err(|e| format!("xdg-open tidak tersedia: {e}"))?;
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Ok(ToolResult {
        success: out.status.success(),
        output: None,
        error: if out.status.success() {
            None
        } else {
            Some(stderr)
        },
    })
}

#[tauri::command]
pub fn os_search(query: String) -> Result<ToolResult, String> {
    require_x11()?;
    let out = xdotool(&["search", "--name", &query])?;
    Ok(ToolResult {
        success: true,
        output: Some(out),
        error: None,
    })
}

#[tauri::command]
pub fn os_ask(prompt: String) -> Result<ToolResult, String> {
    // os-ask returns structured prompt; pc-agent.js handles overlay UI
    Ok(ToolResult {
        success: true,
        output: Some(format!("ASK: {}", prompt)),
        error: None,
    })
}

#[tauri::command]
pub fn os_control_open() -> Result<ToolResult, String> {
    Ok(ToolResult {
        success: true,
        output: Some("PC Control session opened".into()),
        error: None,
    })
}

#[tauri::command]
pub fn os_control_close() -> Result<ToolResult, String> {
    Ok(ToolResult {
        success: true,
        output: Some("PC Control session closed".into()),
        error: None,
    })
}
