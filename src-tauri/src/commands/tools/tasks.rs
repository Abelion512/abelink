use serde::Serialize;
use std::collections::HashMap;
use std::os::unix::process::CommandExt;
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
        .map(|c| {
            let p = std::path::PathBuf::from(c);
            if p.is_absolute() {
                p
            } else {
                workspace.join(p)
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
        // Grup proses sendiri: kill_task/kill_all_tasks memakai killpg agar
        // anak-cucu task ikut mati (bash -c menelurkan proses anak sendiri).
        cmd.process_group(0);
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

/// Kill task: bunuh grup prosesnya (bukan cuma tandai status, yang
/// membiarkan proses anak jalan terus sebagai orphan).
#[tauri::command]
pub fn kill_task(
    state: State<'_, TasksState>,
    task_id: String,
) -> Result<bool, String> {
    let mut map = state.0.lock().unwrap();
    if let Some(t) = map.get_mut(&task_id) {
        if t.status == "running" {
            if let Some(pid) = t.pid {
                if crate::cmd_node_bridge::group_is_ours(pid, &["bash"]) {
                    unsafe {
                        libc::kill(-(pid as libc::pid_t), libc::SIGKILL);
                    }
                }
            }
        }
        t.status = "stopped".into();
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Bunuh semua task yang masih running (dipanggil saat aplikasi keluar agar
/// tidak ada proses anak yang nyangkut setelah window ditutup).
pub fn kill_all_tasks(state: &TasksState) {
    if let Ok(mut map) = state.0.lock() {
        for t in map.values_mut() {
            if t.status == "running" {
                if let Some(pid) = t.pid {
                    if crate::cmd_node_bridge::group_is_ours(pid, &["bash"]) {
                        unsafe {
                            libc::kill(-(pid as libc::pid_t), libc::SIGKILL);
                        }
                    }
                }
                t.status = "stopped".into();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn proc_gone(pid: u32) -> bool {
        // Hilang dari /proc ATAU sudah zombie (mati, tinggal nunggu reparent
        // me-reap) dihitung mati: SIGKILL-nya terbukti sampai.
        match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
            Err(_) => true,
            Ok(stat) => stat
                .rfind(')')
                .and_then(|i| stat[i + 2..].split_whitespace().next())
                == Some("Z"),
        }
    }

    fn wait_gone(pid: u32) -> bool {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(5) {
            if proc_gone(pid) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        proc_gone(pid)
    }

    // spawn() kembali setelah fork tapi SEBELUM exec() anak selesai — pada
    // CI yang lambat/terbeban, /proc/<pid>/comm sesaat masih memuat nama
    // induknya (rusak asumsi "comm = bash langsung setelah spawn").
    // Polling dengan batas waktu membuat test deterministik.
    fn wait_comm_is(pid: u32, expected: &str) -> bool {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(5) {
            if crate::cmd_node_bridge::group_is_ours(pid, &[expected]) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        crate::cmd_node_bridge::group_is_ours(pid, &[expected])
    }

    #[test]
    fn group_is_ours_matches_bash_child_only() {
        use std::os::unix::process::CommandExt;
        let mut cmd = std::process::Command::new("bash");
        cmd.arg("-c").arg("sleep 60").process_group(0);
        let mut child = cmd.spawn().expect("spawn bash test");
        let pid = child.id();
        // Tunggu exec() anak selesai sebelum menilai comm (lihat wait_comm_is).
        assert!(wait_comm_is(pid, "bash"), "comm anak harus jadi 'bash' setelah exec");
        assert!(!crate::cmd_node_bridge::group_is_ours(pid, &["tidak-ada"]));
        // PID yang tidak ada -> false (tidak pernah kill buta).
        assert!(!crate::cmd_node_bridge::group_is_ours(u32::MAX, &["bash"]));
        unsafe {
            libc::kill(-(pid as libc::pid_t), libc::SIGKILL);
        }
        assert!(wait_gone(pid), "grup bash harus mati oleh killpg");
        // Reap setelah assert: urutan penting, wait() di depan akan membuat
        // wait_gone() lolos hanya karena kita sendiri yang membersihkan zombie.
        let _ = child.wait();
    }

    #[test]
    fn kill_all_tasks_kills_grandchildren_too() {
        use std::os::unix::process::CommandExt;
        // `& wait` memaksa bash menelurkan cucu sleep (tanpa exec langsung).
        let mut cmd = std::process::Command::new("bash");
        cmd.arg("-c").arg("sleep 60 & wait").process_group(0);
        let mut child = cmd.spawn().expect("spawn bash test");
        let pid = child.id();
        // exec() anak harus selesai dulu agar grup-0-nya pasti ada (kommutator
        // 'bash' sebagai penanda); sekaligus deterministik di CI lambat.
        assert!(wait_comm_is(pid, "bash"), "comm anak harus jadi 'bash' setelah exec");
        // Tunggu cucu sleep muncul di grup yang sama.
        let grandchild: Option<u32> = {
            let start = Instant::now();
            let mut found = None;
            while start.elapsed() < Duration::from_secs(5) && found.is_none() {
                if let Ok(entries) = std::fs::read_dir("/proc") {
                    for e in entries.flatten() {
                        let name = e.file_name().to_string_lossy().into_owned();
                        if let Ok(p) = name.parse::<u32>() {
                            if p == pid {
                                continue;
                            }
                            let stat = std::fs::read_to_string(format!("/proc/{p}/stat"))
                                .unwrap_or_default();
                            // field 4 = ppid, field 5 = pgrp (dalam tanda kurung nama bisa ada spasi).
                            if let Some(rparen) = stat.rfind(')') {
                                let fields: Vec<&str> =
                                    stat[rparen + 2..].split_whitespace().collect();
                                if fields.len() >= 3
                                    && fields[1] == pid.to_string()
                                    && fields[2] == pid.to_string()
                                {
                                    found = Some(p);
                                    break;
                                }
                            }
                        }
                    }
                }
                if found.is_none() {
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
            found
        };
        assert!(grandchild.is_some(), "cucu sleep harus ada di grup bash");

        let state = TasksState(Arc::new(Mutex::new(HashMap::new())));
        state.0.lock().unwrap().insert(
            "t1".into(),
            TaskInfo {
                id: "t1".into(),
                command: "sleep 60 & wait".into(),
                cwd: "/tmp".into(),
                status: "running".into(),
                started_at: String::new(),
                pid: Some(pid),
            },
        );
        kill_all_tasks(&state);

        assert_eq!(
            state.0.lock().unwrap().get("t1").unwrap().status,
            "stopped"
        );
        assert!(wait_gone(pid), "bash induk harus mati");
        assert!(
            wait_gone(grandchild.unwrap()),
            "cucu sleep harus ikut mati (inilah bug orphan kemarin)"
        );
        let _ = child.wait();
    }
}