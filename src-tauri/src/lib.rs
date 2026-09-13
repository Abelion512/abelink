// Abelink — Tauri v2 shell (Linux-native)
mod approval_policy;
mod cmd_fs;
mod cmd_harness;
mod cmd_misc;
mod cmd_music;
mod cmd_node_bridge;
mod mission_scope;
mod watchdog;
#[path = "commands/tools/shell.rs"]
mod commands_tools_shell;
#[path = "commands/tools/git.rs"]
mod commands_tools_git;
#[path = "commands/tools/tasks.rs"]
mod commands_tools_tasks;
#[path = "commands/system/info.rs"]
mod commands_system_info;
#[path = "commands/awareness/window_tracker.rs"]
mod commands_awareness_window_tracker;
#[path = "commands/tools/os.rs"]
mod commands_tools_os;
#[path = "commands/telegram/bot.rs"]
mod commands_telegram_bot;

use cmd_node_bridge::{start_node_engine, NodeBridgeState};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

/// Home data dir: ABELINK_DATA_HOME menang atas XDG_DATA_HOME.
/// (dev.sh men-set-nya ke .../abelink-dev agar mode dev & prod bisa jalan
/// bersamaan tanpa berebut data, lock single-instance, dan WM_CLASS.)
pub(crate) fn data_home() -> PathBuf {
    let base = std::env::var("ABELINK_DATA_HOME")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
                format!(
                    "{}/.local/share",
                    std::env::var("HOME").unwrap_or_default()
                )
            })
        });
    PathBuf::from(base)
}

fn emit_window_state(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let state = serde_json::json!({
            "isMaximized": w.is_maximized().unwrap_or(false),
            "isFullScreen": w.is_fullscreen().unwrap_or(false)
        });
        use tauri::Emitter;
        let _ = app.emit("window-state", state);
    }
}

#[tauri::command]
fn window_minimize(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
}

#[tauri::command]
fn window_maximize_toggle(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = if w.is_maximized().unwrap_or(false) {
            w.unmaximize()
        } else {
            w.maximize()
        };
    }
    emit_window_state(&app);
}

#[tauri::command]
fn window_fullscreen_toggle(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = if w.is_fullscreen().unwrap_or(false) {
            w.set_fullscreen(false)
        } else {
            w.set_fullscreen(true)
        };
    }
    emit_window_state(&app);
}

#[tauri::command]
fn window_close(app: tauri::AppHandle) {
    app.exit(0)
}

#[tauri::command]
fn window_get_state(app: tauri::AppHandle) -> serde_json::Value {
    if let Some(w) = app.get_webview_window("main") {
        serde_json::json!({
            "isMaximized": w.is_maximized().unwrap_or(false),
            "isFullScreen": w.is_fullscreen().unwrap_or(false)
        })
    } else {
        serde_json::json!({ "isMaximized": false, "isFullScreen": false })
    }
}

#[tauri::command]
fn window_set_mode(app: tauri::AppHandle, mode: String) -> Result<String, String> {
    if let Some(w) = app.get_webview_window("main") {
        use tauri::Emitter;
        if mode == "spotlight" {
            let _ = w.set_size(tauri::LogicalSize::new(680.0, 84.0));
            let _ = w.set_always_on_top(true);
            let _ = w.center();
            let _ = app.emit("window-mode-changed", "spotlight");
            Ok("spotlight".into())
        } else {
            let _ = w.set_size(tauri::LogicalSize::new(1280.0, 800.0));
            let _ = w.set_always_on_top(false);
            let _ = w.center();
            let _ = app.emit("window-mode-changed", "dashboard");
            Ok("dashboard".into())
        }
    } else {
        Err("Window main tidak ditemukan".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance: panggilan kedua → fokus window yang ada (harus paling awal)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        // (tauri_plugin_log cukup didaftarkan SEKALI — duplikat lama dihapus;
        //  plugin opener dilepas karena renderer tidak memakainya)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: Some("abelink".into()) }),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(Arc::new(NodeBridgeState::new()))
        .manage(commands_tools_tasks::TasksState(Arc::new(Mutex::new(HashMap::new()))))
        .manage(commands_tools_tasks::TaskOutputsState(Arc::new(Mutex::new(HashMap::new()))))
        .manage(commands_telegram_bot::TelegramState(Arc::new(Mutex::new(commands_telegram_bot::TelegramInner::new(String::new())))))
        .setup(|app| {
            // ---- Migrasi data dir sekali-jalan: XDG/abelink (brand lama) -> XDG/abelink.
            // Idempoten + silent: hanya rename bila lama ada dan baru belum ada.
            // (Native-host/sidecar hanya menulis file regenerable; workspace +
            // approval-policy milik user ikut pindah di sini.)
            {
                let xdg = data_home();
                let old = xdg.join("mark");
                let new = xdg.join("abelink");
                if old.is_dir() && !new.exists() {
                    let _ = std::fs::rename(&old, &new);
                }
            }

            // Judul pembeda visual khusus dev (debug profile): "Abelink (dev)".
            // Rilis (.deb) tidak tersentuh. Identifier/lock/WM_CLASS dipisah
            // lewat TAURI_CONFIG di dev.sh, bukan di sini.
            #[cfg(debug_assertions)]
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("Abelink (dev)");
            }

            // ---- Sidecar node engine ----
            let handle = app.handle().clone();
            let state = Arc::clone(&app.state::<Arc<NodeBridgeState>>());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_node_engine(handle, state).await {
                    log::error!("[NodeBridge] {}", e);
                }
            });

            // ---- Window tracker (replaces sidecar/window-tracker.js) ----
            // Depends on: xdotool, xprintidle (see docs/superpowers/specs/)
            app.manage(commands_awareness_window_tracker::WindowTrackerState(
                Arc::new(Mutex::new(VecDeque::new())),
            ));
            commands_awareness_window_tracker::start_window_tracker(app.handle().clone());

            // ---- Telegram state (replaces telegram-service.js native commands) ----
            // Bot event loop tetap di JS (Telegraf); ini hanya API send-message + broadcast.
            // (state di-manage di builder chain atas agar tersedia sebelum setup)

            // ---- Tray (Linux: Ayatana AppIndicator) ----
            let show = MenuItem::with_id(app, "show", "Tampilkan Abelink", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::with_id("abelink-tray")
                .tooltip(if cfg!(debug_assertions) {
                    "Abelink (dev) - Autonomous Linux AI OS Companion"
                } else {
                    "Abelink - Autonomous Linux AI OS Companion"
                })
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            use tauri::Emitter;
                            let _ = w.unminimize();
                            let _ = w.set_size(tauri::LogicalSize::new(1280.0, 800.0));
                            let _ = w.set_always_on_top(false);
                            let _ = w.center();
                            let _ = app.emit("window-mode-changed", "dashboard");
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            // Ikon tray dan window: fallback aman, jangan panic bila aset hilang.
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_icon(icon.clone());
                }
            } else {
                log::warn!("[Tray] default_window_icon tidak tersedia; tray berjalan tanpa ikon.");
            }
            tray.build(app)?;

            // ---- Linux WebKitGTK: Izinkan permission-request (kamera & mic) & aktifkan media stream ----
            #[cfg(target_os = "linux")]
            {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.with_webview(|webview| {
                        use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
                        let wv = webview.inner();
                        if let Some(settings) = wv.settings() {
                            settings.set_enable_media_stream(true);
                            settings.set_enable_mediasource(true);
                            settings.set_media_playback_requires_user_gesture(false);
                            settings.set_media_playback_allows_inline(true);
                        }
                        wv.connect_permission_request(|_, req| {
                            req.allow();
                            true
                        });
                    });
                }
            }

            // ---- Global shortcut Ctrl+Alt+M: toggle Dashboard Window ----
            // Rilis saja (alasan sama seperti Ctrl+Shift+S di bawah).
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
                app.global_shortcut()
                .on_shortcut("Ctrl+Alt+M", |app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(true) {
                                let _ = w.hide();
                            } else {
                                use tauri::Emitter;
                                let _ = w.unminimize();
                                let _ = w.set_size(tauri::LogicalSize::new(1280.0, 800.0));
                                let _ = w.set_always_on_top(false);
                                let _ = w.center();
                                let _ = app.emit("window-mode-changed", "dashboard");
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })?;
            }

            // ---- Global shortcut Ctrl+Shift+S: emergency stop otomasi PC ----
            // (broadcast event; channel sidecar menyusul saat os-* diporting Fase B)
            // Rilis saja: hotkey system-wide milik SATU instansi. Dev (debug)
            // sengaja dilewati agar dev & prod bisa jalan bersamaan — setup
            // panic bila rebutan justru mengalahkan tujuan koeksistensi.
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
                app.global_shortcut()
                .on_shortcut("Ctrl+Shift+S", |app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        use tauri::Emitter;
                        let _ = app.emit("pc-emergency-stop", true);
                        log::warn!("[Shortcut] Emergency stop diminta (Ctrl+Shift+S)");
                    }
                })?;
            }
            #[cfg(debug_assertions)]
            log::warn!("[Shortcut] global shortcut dilewati (dev): pakai prod untuk hotkey");

            Ok(())
        })
        .on_window_event(|window, event| {
            // Broadcast window-state untuk easter-egg orb (jam fullscreen-only)
            if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(_)) {
                emit_window_state(window.app_handle());
            }
            // Quit-on-close: tanpa ini, menutup window utama (X/Alt+F4) hanya
            // menghancurkan window sementara tray menahan event loop — proses
            // tetap jalan tak terlihat dan user mengira aplikasi sudah tutup.
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            cmd_fs::fs_read_file,
            cmd_fs::fs_write_file,
            cmd_fs::fs_delete_file,
            cmd_fs::fs_list_dir,
            cmd_fs::fs_grep_search,
            cmd_fs::fs_detect_legacy_profiles,
            cmd_fs::fs_import_pick_and_read,
            cmd_harness::harness_append,
            cmd_node_bridge::node_invoke,
            // Fase B0 — cluster lite & misc (sidecar tidak lagi melayani ini)
            cmd_misc::misc_get_documents_path,
            cmd_misc::misc_get_lite_mode,
            cmd_misc::misc_save_temp_file,
            cmd_misc::misc_open_external,
            cmd_misc::misc_show_notification,
            cmd_misc::misc_open_file_dialog,
            cmd_misc::misc_open_files_dialog,
            cmd_misc::misc_stat_path,
            cmd_misc::misc_open_directory_dialog,
            cmd_misc::misc_take_screenshot,
            cmd_misc::misc_read_file_base64,
            cmd_misc::misc_native_confirm,
            cmd_misc::misc_fetch_web_resource,
            cmd_misc::misc_ensure_extension_files,
            cmd_misc::misc_open_folder,
            approval_policy::approval_policy_get,
            approval_policy::approval_policy_set,
            approval_policy::approval_policy_reset_session,
            approval_policy::approval_policy_grant_session,
            mission_scope::mission_scope_set,
            mission_scope::mission_scope_clear,
            mission_scope::mission_scope_get,
            commands_tools_shell::tools_run_shell,
            commands_tools_git::git_status,
            commands_tools_git::git_diff,
            commands_tools_git::git_commit,
            commands_tools_git::git_revert,
            commands_tools_tasks::run_task,
            commands_tools_tasks::list_tasks,
            commands_tools_tasks::read_task_output,
            commands_tools_tasks::kill_task,
            // Fase B2 — PC automation tools (os-*) via xdotool
            commands_tools_os::os_is_x11,
            commands_tools_os::os_click,
            commands_tools_os::os_double_click,
            commands_tools_os::os_delay,
            commands_tools_os::os_type,
            commands_tools_os::os_key,
            commands_tools_os::os_scroll,
            commands_tools_os::os_read,
            commands_tools_os::os_list_windows,
            commands_tools_os::os_focus_window,
            commands_tools_os::os_open,
            commands_tools_os::os_search,
            commands_tools_os::os_ask,
            commands_tools_os::os_control_open,
            commands_tools_os::os_control_close,
            // Fase B0 — cluster system info (parity sidecar systemInfo.js)
            commands_system_info::system_get_info,
            commands_telegram_bot::telegram_configure,
            commands_telegram_bot::telegram_send_message,
            commands_telegram_bot::telegram_broadcast_to_admins,
            commands_telegram_bot::telegram_register_admin_chat,
            commands_telegram_bot::telegram_status,
            commands_telegram_bot::telegram_send_photo,
            commands_awareness_window_tracker::awareness_get_buffer,
            commands_awareness_window_tracker::awareness_clear_buffer,
            window_minimize,
            window_maximize_toggle,
            window_fullscreen_toggle,
            window_close,
            window_get_state,
            window_set_mode,
            cmd_music::music_player_toggle,
            cmd_music::music_player_show,
            cmd_music::music_player_hide,
            cmd_music::music_player_play_url,
            cmd_music::music_player_command
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Pastikan tidak ada proses anak/cucu yang jadi orphan dan
            // nyangkut setelah aplikasi keluar: sidecar segrup-proses
            // (killpg) + semua run_task yang masih running.
            if let tauri::RunEvent::Exit = event {
                cmd_node_bridge::kill_engine(app_handle.state::<Arc<NodeBridgeState>>().inner());
                commands_tools_tasks::kill_all_tasks(
                    app_handle.state::<commands_tools_tasks::TasksState>().inner(),
                );
            }
        });
}
