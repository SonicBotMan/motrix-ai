mod commands;
mod error;
mod tray;

use tauri::WindowEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ---- System Tray ----
            tray::create_tray(app.handle())?;

            // Auto-start bundled aria2c
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match commands::aria2::start_aria2(handle, Some(6800)).await {
                    Ok(url) => log::info!("Bundled aria2c started: {}", url),
                    Err(e) => log::warn!(
                        "Bundled aria2c not available: {} (user can start manually)",
                        e
                    ),
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray instead of closing
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::search::search_proxy,
            commands::fs::save_file,
            commands::fs::download_subtitle,
            commands::fs::get_download_path,
            commands::fs::opensubtitles_search,
            commands::fs::opensubtitles_download,
            commands::aria2::start_aria2,
            commands::aria2::stop_aria2,
            commands::aria2::check_aria2_binary,
            commands::intent::parse_nl_intent,
            commands::fs::organize_file,
            commands::fs::show_in_folder,
            commands::request_notification_permission,
            commands::send_notification,
            commands::http_api::start_http_api,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
