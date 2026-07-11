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

/// Read the user-configured download directory from config.json.
/// Falls back to ~/Downloads/Motrix AI when config is missing or the
/// downloads.base_dir field is empty.
pub(crate) fn configured_download_dir() -> std::path::PathBuf {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return std::path::PathBuf::from("~/Downloads/Motrix AI"),
    };
    let default = home.join("Downloads").join("Motrix AI");
    let config_path = home.join(".motrix-ai").join("config.json");
    match std::fs::read_to_string(&config_path) {
        Ok(content) => {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(base) = json
                    .get("downloads")
                    .and_then(|d| d.get("base_dir"))
                    .and_then(|v| v.as_str())
                {
                    let trimmed = base.trim();
                    if !trimmed.is_empty() {
                        let expanded = if trimmed == "~" {
                            home.clone()
                        } else if let Some(rest) = trimmed.strip_prefix("~/") {
                            home.join(rest)
                        } else if let Some(rest) = trimmed.strip_prefix("~\\") {
                            home.join(rest)
                        } else {
                            std::path::PathBuf::from(trimmed)
                        };
                        return expanded;
                    }
                }
            }
            default
        }
        Err(_) => default,
    }
}

pub(crate) fn configured_proxy_args() -> Vec<String> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };
    let config_path = home.join(".motrix-ai").join("config.json");
    let content = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(j) => j,
        Err(_) => return vec![],
    };
    let net = match json.get("network") {
        Some(n) => n,
        None => return vec![],
    };
    let mut args = vec![];
    if let Some(v) = net
        .get("http_proxy")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
    {
        args.push(format!("--http-proxy={}", v));
    }
    if let Some(v) = net
        .get("https_proxy")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
    {
        args.push(format!("--https-proxy={}", v));
    }
    if let Some(v) = net
        .get("ftp_proxy")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
    {
        args.push(format!("--ftp-proxy={}", v));
    }
    if let Some(v) = net
        .get("no_proxy")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
    {
        args.push(format!("--no-proxy={}", v));
    }
    args
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
    let normalized = url.trim().to_lowercase();
    if !ALLOWED_SCHEMES.iter().any(|s| normalized.starts_with(s)) {
        return Err(format!("Unsupported URL scheme: {}", url));
    }

    let secret = crate::commands::aria2::get_aria2_secret();
    let client = build_http_client()?;
    let download_dir = configured_download_dir();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "motrix-internal",
        "method": "aria2.addUri",
        "params": [
            format!("token:{}", secret),
            [url],
            serde_json::json!({ "dir": download_dir.display().to_string() })
        ],
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
