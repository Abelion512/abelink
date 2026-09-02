use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// State untuk menyimpan info task
pub struct TasksState(pub Arc<Mutex<HashMap<String, TaskInfo>>>);

/// State untuk menyimpan output task (stdout lines)
pub struct TaskOutputsState(pub Arc<Mutex<HashMap<String, Vec<String>>>>);

#[derive(Serialize, Clone)]
pub struct TaskInfo {
    pub id: String,
    pub command: String,
    pub cwd: String,
    pub status: String, // "running" | "stopped" | "completed"
    pub started_at: String,
    pub pid: Option<u32>,
}

/// Jalankan task di background
#[tauri::command]
pub async fn run_task(
    app: AppHandle,
    state: State<'_, TasksState>,
    outputs_state: State<'_, TaskOutputsState>,
    task_id: String,
    command: String,
    cwd: Option<String>,
) -> Result<TaskInfo, String> {
    let workspace = crate::cmd_fs::workspace_root();
    let cwd_path = cwd
        .and_then(|c| {
            let p = std::path::PathBuf::from(c);
            if p.is_absolute() {
                Some(p)
            } else {
                Some(workspace.join(p))
            }
        })
        .unwrap_or(workspace);

    let now = chrono::Local::now().to_rfc3339();

    let task_info = TaskInfo {
        id: task_id.clone(),
        command: command.clone(),
        cwd: cwd_path.to_string_lossy().into_owned(),
        status: "running".into(),
        started_at: now,
        pid: None,
    };

    // Simpan task info
    {
        let mut map = state.0.lock().unwrap();
        map.insert(task_id.clone(), task_info.clone());
    }

    // Inisialisasi output buffer
    {
        let mut map = outputs_state.0.lock().unwrap();
        map.insert(task_id.clone(), Vec::new());
    }

    // Spawn task di background
    let app_handle = app.clone();
    let task_id_clone = task_id.clone();
    let state_clone = Arc::clone(&state.0);
    let outputs_clone = Arc::clone(&outputs_state.0);

    tauri::async_runtime::spawn(async move {
        let mut cmd = std::process::Command::new("bash");
        cmd.arg("-c").arg(&command).current_dir(&cwd_path);
        cmd.stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let mut map = state_clone.lock().unwrap();
                if let Some(t) = map.get_mut(&task_id_clone) {
                    t.status = "stopped".into();
                }
                let mut out_map = outputs_clone.lock().unwrap();
                if let Some(buf) = out_map.get_mut(&task_id_clone) {
                    buf.push(format!("Error spawning: {}", e));
                }
                let _ = app_handle.emit("task-output", serde_json::json!({
                    "taskId": task_id_clone,
                    "line": format!("Error spawning: {}", e)
                }));
                return;
            }
        };

        let pid = child.id();
        {
            let mut map = state_clone.lock().unwrap();
            if let Some(t) = map.get_mut(&task_id_clone) {
                t.pid = Some(pid);
            }
        }

        // Read stdout line by line
        use std::io::{BufRead, BufReader};
        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let mut out_map = outputs_clone.lock().unwrap();
                    if let Some(buf) = out_map.get_mut(&task_id_clone) {
                        buf.push(l.clone());
                        if buf.len() > 1000 {
                            buf.drain(0..buf.len() - 1000);
                        }
                    }
                    let _ = app_handle.emit("task-output", serde_json::json!({
                        "taskId": task_id_clone,
                        "line": l
                    }));
                }
                Err(_) => break,
            }
        }

        let status = child.wait().map_err(|e| e.to_string());
        let mut map = state_clone.lock().unwrap();
        if let Some(t) = map.get_mut(&task_id_clone) {
            t.status = match status {
                Ok(s) if s.success() => "completed",
                _ => "stopped",
            }
            .into();
        }
        let _ = app_handle.emit("task-completed", serde_json::json!({
            "taskId": task_id_clone,
            "status": map.get(&task_id_clone).map(|t| t.status.clone())
        }));
    });

    Ok(task_info)
}

/// List semua task
#[tauri::command]
pub fn list_tasks(state: State<'_, TasksState>) -> Result<Vec<TaskInfo>, String> {
    let map = state.0.lock().unwrap();
    Ok(map.values().cloned().collect())
}

/// Baca N baris terakhir output task
#[tauri::command]
pub fn read_task_output(
    state: State<'_, TaskOutputsState>,
    task_id: String,
    lines: Option<usize>,
) -> Result<Vec<String>, String> {
    let map = state.0.lock().unwrap();
    let n = lines.unwrap_or(40);
    Ok(map
        .get(&task_id)
        .map(|buf| buf.iter().rev().take(n).rev().cloned().collect())
        .unwrap_or_default())
}

/// Kill task (mark stopped)
#[tauri::command]
pub fn kill_task(
    state: State<'_, TasksState>,
    task_id: String,
) -> Result<bool, String> {
    let mut map = state.0.lock().unwrap();
    if let Some(t) = map.get_mut(&task_id) {
        t.status = "stopped".into();
        Ok(true)
    } else {
        Ok(false)
    }
}