// commands/mod.rs — Module registry for all Tauri commands.
// Split from the original monolithic commands.rs for maintainability.

pub mod aria2;
pub mod config;
pub mod fs;
pub mod http_api;
pub mod intent;
pub mod search;

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Search result from torrent search engines
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub magnet: String,
    pub size: u64,
    pub seeders: u32,
    pub leechers: u32,
    pub source: String,
    pub quality: Option<String>,
}

/// Search proxy response
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total: usize,
    pub source: String,
}

/// Download intent extracted from natural language
#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadIntent {
    pub title: String,
    pub year: Option<u32>,
    pub quality: String,
    pub need_subtitle: bool,
    pub search_keywords: Vec<String>,
    pub resource_type: String,
    pub raw_input: String,
}

/// Request notification permission from the OS.
/// On desktop platforms permission is granted by default.
#[tauri::command]
pub async fn request_notification_permission() -> String {
    "granted".to_string()
}

/// Send a desktop notification via tauri-plugin-notification.
#[tauri::command]
pub async fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: Option<String>,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let mut builder = app.notification().builder().title(&title);
    if let Some(body_text) = body {
        builder = builder.body(&body_text);
    }
    builder
        .show()
        .map_err(|e| format!("Failed to send notification: {}", e))?;

    Ok(())
}

/// Build a shared HTTP client with timeout and User-Agent
pub(crate) fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Client build failed: {}", e))
}

/// Forward a download URL to the local aria2 daemon via JSON-RPC addUri.
/// Shared by the HTTP API server (browser extension bridge) and the deep
/// link handler (magnet:// protocol) so behaviour stays consistent.
pub(crate) async fn aria2_add_uri(url: &str) -> Result<String, String> {
    const ALLOWED_SCHEMES: &[&str] = &[
        "http://",
        "https://",
        "ftp://",
        "magnet:",
        "ed2k://",
        "thunder://",
    ];
    if !ALLOWED_SCHEMES.iter().any(|s| url.starts_with(s)) {
        return Err(format!("Unsupported URL scheme: {}", url));
    }

    let client = build_http_client()?;
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "motrix-internal",
        "method": "aria2.addUri",
        "params": [[url]],
    });
    let resp = client
        .post("http://127.0.0.1:6800/jsonrpc")
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("aria2 RPC: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("aria2 parse: {}", e))?;

    data.get("result")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| {
            format!(
                "aria2 error: {}",
                data.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown")
            )
        })
}
