use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct GitResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

fn resolve_cwd(cwd: Option<String>) -> PathBuf {
    let root = crate::cmd_fs::workspace_root();
    cwd.and_then(|c| {
        let p = PathBuf::from(c);
        if p.is_absolute() { Some(p) } else { Some(root.join(p)) }
    }).unwrap_or(root)
}

fn git(cwd: &std::path::Path, args: &[&str]) -> GitResult {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    match out {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            if o.status.success() {
                GitResult { success: true, output: stdout, error: None }
            } else {
                GitResult { success: false, output: stdout, error: Some(stderr) }
            }
        }
        Err(e) => GitResult {
            success: false,
            output: String::new(),
            error: Some(format!("git tidak tersedia: {e}")),
        },
    }
}

#[tauri::command]
pub fn git_status(cwd: Option<String>) -> GitResult {
    git(&resolve_cwd(cwd), &["status", "--short"])
}

#[tauri::command]
pub fn git_diff(cwd: Option<String>, range: Option<String>) -> GitResult {
    let mut args: Vec<&str> = vec!["diff"];
    if let Some(ref r) = range { args.push(r); }
    git(&resolve_cwd(cwd), &args)
}

#[tauri::command]
pub fn git_commit(app: tauri::AppHandle, message: String, cwd: Option<String>) -> GitResult {
    let path = resolve_cwd(cwd);
    let desc = format!("Mark ingin git commit:\n\n{}\n\nPath: {}", message, path.display());
    if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
        return GitResult { success: false, output: String::new(), error: Some("Ditolak pengguna.".into()) };
    }
    git(&path, &["commit", "-m", &message])
}

#[tauri::command]
pub fn git_revert(app: tauri::AppHandle, target: String, cwd: Option<String>) -> GitResult {
    let path = resolve_cwd(cwd);
    let desc = format!("Mark ingin revert git:\n\nTarget: {}\nPath: {}", target, path.display());
    if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
        return GitResult { success: false, output: String::new(), error: Some("Ditolak pengguna.".into()) };
    }
    git(&path, &["revert", "--no-commit", &target])
}
