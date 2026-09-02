use serde::Serialize;
use std::collections::VecDeque;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

const WINDOW_TRACKER_MAX_EVENTS: usize = 100;
const WINDOW_TRACKER_INTERVAL_SEC: u64 = 60;

#[derive(Clone, Serialize)]
pub struct WindowEvent {
    pub window_id: String,
    pub title: String,
    pub timestamp: String,
    pub is_idle: bool,
    pub idle_seconds: u64,
}

pub struct WindowTrackerState(pub Arc<Mutex<VecDeque<WindowEvent>>>);

fn get_active_window_linux() -> Option<(String, String)> {
    let wid = Command::new("xdotool")
        .arg("getactivewindow")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let id = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if id.is_empty() { None } else { Some(id) }
        })?;
    let title = Command::new("xdotool")
        .arg("getwindowname")
        .arg(&wid)
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    Some((wid, title))
}

fn get_idle_seconds_linux() -> u64 {
    Command::new("xprintidle")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().ok())
        .map(|ms| ms / 1000)
        .unwrap_or(0)
}

#[tauri::command]
pub fn awareness_get_buffer(state: State<WindowTrackerState>) -> Vec<WindowEvent> {
    state.0.lock().unwrap().iter().cloned().collect()
}

#[tauri::command]
pub fn awareness_clear_buffer(state: State<WindowTrackerState>) {
    state.0.lock().unwrap().clear();
}

// ponytail: global Mutex lock. Upgradable to per-event RwLock if front-end polls during poll cycle.
pub fn start_window_tracker(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let state = app.state::<WindowTrackerState>();
            if let Some((wid, title)) = get_active_window_linux() {
                let idle = get_idle_seconds_linux();
                let event = WindowEvent {
                    window_id: wid,
                    title: title.clone(),
                    timestamp: chrono::Local::now().to_rfc3339(),
                    is_idle: idle > 120,
                    idle_seconds: idle,
                };
                let mut buf = state.0.lock().unwrap();
                buf.push_back(event);
                while buf.len() > WINDOW_TRACKER_MAX_EVENTS {
                    buf.pop_front();
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(WINDOW_TRACKER_INTERVAL_SEC)).await;
        }
    });
}
