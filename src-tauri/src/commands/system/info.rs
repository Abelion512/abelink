use serde::Serialize;

use super::cmd_misc::{total_ram_bytes_linux, LITE_RAM_THRESHOLD_BYTES};

#[derive(Serialize)]
pub struct SystemInfo {
    pub platform: String,
    pub arch: String,
    pub total_ram_mb: u64,
    pub cpu_cores: u32,
    pub distro: String,
    pub is_lite: bool,
}

fn cpu_count_linux() -> u32 {
    let Ok(s) = std::fs::read_to_string("/proc/cpuinfo") else { return 1 };
    s.lines().filter(|l| l.starts_with("processor")).count() as u32
}

fn distro_name_linux() -> String {
    let Ok(s) = std::fs::read_to_string("/etc/os-release") else { return "Linux".into() };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("PRETTY_NAME=") {
            return rest.trim_matches('"').to_string();
        }
    }
    "Linux".into()
}

#[tauri::command]
pub fn system_get_info() -> SystemInfo {
    let total_bytes = total_ram_bytes_linux();
    SystemInfo {
        platform: "linux".into(),
        arch: std::env::consts::ARCH.to_string(),
        total_ram_mb: total_bytes / 1024 / 1024,
        cpu_cores: cpu_count_linux(),
        distro: distro_name_linux(),
        is_lite: total_bytes > 0 && total_bytes <= LITE_RAM_THRESHOLD_BYTES,
    }
}
