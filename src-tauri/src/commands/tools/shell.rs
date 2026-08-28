use serde::Serialize;
use std::process::{Command, Stdio};
use tauri::AppHandle;

#[derive(Serialize)]
pub struct ToolResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn is_dangerous(query: &str) -> bool {
    let lower = query.to_lowercase();
    [
        "remove-item", "rm ", "del ", "rmdir", "format-", "clear-disk",
        "stop-process", "kill ", "taskkill", "set-executionpolicy", "restart-computer",
        "shutdown", "reg delete",
    ]
    .iter()
    .any(|kw| lower.contains(kw))
}

#[tauri::command]
pub async fn tools_run_shell(
    app: AppHandle,
    query: String,
    cwd: Option<String>,
) -> Result<ToolResult, String> {
    if query.trim().is_empty() {
        return Ok(ToolResult {
            success: false,
            output: None,
            error: Some("Query kosong.".into()),
        });
    }

    if is_dangerous(&query) {
        let desc =
            format!("Mark ingin mengeksekusi perintah shell:\n\n{}", query);
        if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
            return Ok(ToolResult {
                success: false,
                output: None,
                error: Some("Ditolak pengguna.".into()),
            });
        }
    }

    let workspace = crate::cmd_fs::workspace_root();
    let cwd_path = cwd.and_then(|c| {
        let p = std::path::PathBuf::from(c);
        if p.is_absolute() {
            Some(p)
        } else {
            Some(workspace.join(&p))
        }
    }).unwrap_or(workspace);

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<ToolResult, String> {
        let mut cmd = Command::new("bash");
        cmd.arg("-c").arg(&query).current_dir(&cwd_path);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        match cmd.output() {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                if out.status.success() {
                    Ok(ToolResult {
                        success: true,
                        output: Some(
                            if stdout.is_empty() {
                                "Perintah berhasil (tanpa output).".into()
                            } else {
                                stdout
                            },
                        ),
                        error: if stderr.is_empty() { None } else { Some(stderr) },
                    })
                } else {
                    Ok(ToolResult {
                        success: false,
                        output: Some(stdout),
                        error: Some(format!(
                            "Exit code: {}\n{}",
                            out.status.code().unwrap_or(-1),
                            stderr
                        )),
                    })
                }
            }
            Err(e) => Ok(ToolResult {
                success: false,
                output: None,
                error: Some(format!("Gagal spawn bash: {e}")),
            }),
        }
    })
    .await
    .map_err(|e| format!("Task join gagal: {e}"))??;

    Ok(result)
}
