// Mark Light — Tauri v2 shell (Linux-native)
mod cmd_fs;
mod cmd_harness;
mod cmd_node_bridge;

use cmd_node_bridge::{start_node_engine, NodeBridgeState};
use std::sync::Arc;
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

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
        .plugin(tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: Some("mark-light".into()) }),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(Arc::new(NodeBridgeState::new()))
        .setup(|app| {
            // ---- Sidecar node engine ----
            let handle = app.handle().clone();
            let state = Arc::clone(&app.state::<Arc<NodeBridgeState>>());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_node_engine(handle, state).await {
                    log::error!("[NodeBridge] {}", e);
                }
            });

            // ---- Tray (Linux: Ayatana AppIndicator) ----
            let show = MenuItem::with_id(app, "show", "Tampilkan MARK", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("mark-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("MARK — Mark Agent")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // ---- Global shortcut Ctrl+Alt+M: toggle tampil/sembunyi ----
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
            app.global_shortcut()
                .on_shortcut("Ctrl+Alt+M", |app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(true) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Broadcast window-state untuk easter-egg orb (jam fullscreen-only)
            if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(_)) {
                emit_window_state(window.app_handle());
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
            window_minimize,
            window_maximize_toggle,
            window_fullscreen_toggle,
            window_close,
            window_get_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
