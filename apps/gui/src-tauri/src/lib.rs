mod commands;
mod error;
mod services;
mod tray;

use tauri::Manager;
use tauri::WindowEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // When second instance tries to launch, focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
            println!("Single instance: focusing existing window");
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ---- Deep Link ----
            // Forward magnet://ed2k://thunder:// URLs to the frontend for
            // user confirmation before adding to aria2.
            #[cfg(desktop)]
            {
                use tauri::Emitter;
                use tauri_plugin_deep_link::DeepLinkExt;
                let dl_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let url_str = url.to_string();
                        log::info!("Deep link opened: {}", url_str);
                        if url_str.starts_with("magnet:")
                            || url_str.starts_with("ed2k://")
                            || url_str.starts_with("thunder://")
                        {
                            let _ = dl_handle.emit("deep-link-download", &url_str);
                        }
                    }
                });
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

                // Start the local HTTP API for browser extension bridge
                match commands::http_api::start_http_api(Some(18900)).await {
                    Ok(url) => log::info!("HTTP API started: {}", url),
                    Err(e) => log::warn!("HTTP API failed to start: {}", e),
                }

                // Prevent system sleep while the app is running (download manager)
                match services::power::prevent_sleep().await {
                    Ok(msg) => log::info!("Power: {}", msg),
                    Err(e) => log::warn!("Power management failed: {}", e),
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
            commands::config::load_config,
            commands::config::save_config,
            commands::config::update_config_section,
            commands::config::test_nas_connection,
            commands::search::search_proxy,
            commands::fs::save_file,
            commands::fs::download_subtitle,
            commands::fs::get_download_path,
            commands::fs::opensubtitles_search,
            commands::fs::opensubtitles_download,
            commands::aria2::start_aria2,
            commands::aria2::stop_aria2,
            commands::aria2::check_aria2_binary,
            commands::aria2::get_rpc_secret,
            commands::aria2::pause_all,
            commands::aria2::unpause_all,
            commands::aria2::add_torrent_file,
            commands::intent::parse_nl_intent,
            commands::fs::organize_file,
            commands::fs::show_in_folder,
            commands::request_notification_permission,
            commands::send_notification,
            commands::http_api::start_http_api,
            services::power::prevent_sleep,
            services::power::allow_sleep,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
