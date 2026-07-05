mod commands;
mod error;
mod history;
mod services;
mod tray;

use std::time::Duration;
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
            // When second instance tries to launch, focus the existing window.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
            log::info!("Single instance: focusing existing window");
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            // ---- Logging ----
            // Must run in release builds too. Without logs we cannot diagnose
            // field issues; Info level is cheap and matches desktop-app norms.
            // (Previously this was gated on cfg!(debug_assertions), leaving
            // release builds completely silent.)
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            // ---- Deep Link ----
            // Forward magnet://, ed2k://, thunder://, motrixai:// URLs to the
            // local aria2 daemon. The previous handler only logged the URL,
            // so clicking a magnet link in a browser did nothing inside the
            // app. The handler is synchronous, so we spawn an async task.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().on_open_url(|event| {
                    for url in event.urls() {
                        let url_str = url.to_string();
                        log::info!("Deep link opened: {}", url_str);
                        tauri::async_runtime::spawn(async move {
                            match forward_url_to_aria2(&url_str).await {
                                Ok(gid) => {
                                    log::info!(
                                        "Deep link forwarded to aria2: {} → gid {}",
                                        url_str,
                                        gid
                                    );
                                }
                                Err(e) => {
                                    log::warn!("Deep link forward failed for {}: {}", url_str, e);
                                }
                            }
                        });
                    }
                });
            }

            // ---- System Tray ----
            tray::create_tray(app.handle())?;

            // ---- Auto-start bundled services ----
            // All three are spawned on the async runtime so a failure in one
            // does not block the others. Order matters only between aria2 and
            // HTTP API: aria2 must come up first so the HTTP API can forward
            // requests to it (though the HTTP API also tolerates aria2 being
            // momentarily unavailable — each request retries up to 5s).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 1. aria2 RPC daemon (port 6800)
                match commands::aria2::start_aria2(handle.clone(), Some(6800)).await {
                    Ok(url) => log::info!("Bundled aria2c started: {}", url),
                    Err(e) => log::warn!(
                        "Bundled aria2c not available: {} (user can start manually)",
                        e
                    ),
                }

                // 2. Local HTTP API for browser extension (port 18900).
                // The extension POSTs download URLs here so we don't have to
                // expose the raw aria2 RPC port to the browser.
                match commands::http_api::start_http_api(Some(18900)).await {
                    Ok(url) => log::info!("HTTP API server started: {}", url),
                    Err(e) => log::warn!("HTTP API server failed to start: {}", e),
                }

                // 3. Prevent the OS from going to sleep while downloads are
                // active. Long BT downloads would otherwise be killed by
                // idle-suspend on laptops. `allow_sleep` is invoked elsewhere
                // if we ever add an explicit "all downloads done" signal.
                match services::power::prevent_sleep().await {
                    Ok(msg) => log::info!("Power: {}", msg),
                    Err(e) => log::warn!("Power prevent_sleep failed: {}", e),
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
            commands::aria2::pause_all,
            commands::aria2::unpause_all,
            commands::aria2::add_torrent_file,
            commands::intent::parse_nl_intent,
            commands::fs::organize_file,
            commands::fs::show_in_folder,
            commands::request_notification_permission,
            commands::send_notification,
            commands::http_api::start_http_api,
            commands::http_api::stop_http_api,
            commands::http_api::handle_download_request,
            commands::protocol::handle_deep_link,
            history::get_download_history,
            history::clear_download_history,
            services::port_guard::check_port,
            services::power::prevent_sleep,
            services::power::allow_sleep,
            services::tracker::fetch_trackers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Forward a deep-link URL (`magnet:`, `ed2k://`, `thunder://`, `motrixai://`)
/// to the local aria2 daemon via `aria2.addUri` JSON-RPC.
///
/// Magnet links are added directly; other schemes are also passed through
/// (aria2 itself rejects unsupported protocols with a clear RPC error which
/// will be logged by the caller).
///
/// This helper exists because the Tauri deep-link plugin's `on_open_url`
/// callback is synchronous, so we cannot `.await` inside it. The callback
/// spawns an async task that calls this function.
async fn forward_url_to_aria2(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client build failed: {}", e))?;

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "motrix-deep-link",
        "method": "aria2.addUri",
        "params": [[url]],
    });

    let resp = client
        .post("http://127.0.0.1:6800/jsonrpc")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("aria2 RPC call failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("aria2 RPC returned HTTP {}", resp.status()));
    }

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("aria2 RPC response parse failed: {}", e))?;

    if let Some(err) = result.get("error") {
        return Err(format!("aria2 error: {}", err));
    }

    Ok(result
        .get("result")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string())
}
