// Mark Light — Tauri v2 shell
mod cmd_node_bridge;

use cmd_node_bridge::{start_node_engine, NodeBridgeState};
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(NodeBridgeState::new()))
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<Arc<NodeBridgeState>>();
            let state = Arc::clone(&state);
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_node_engine(handle, state).await {
                    log::error!("[NodeBridge] {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![cmd_node_bridge::node_invoke])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
