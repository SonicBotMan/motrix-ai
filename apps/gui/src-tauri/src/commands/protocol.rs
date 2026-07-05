// commands/protocol.rs — Deep link / custom URI scheme handler.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct DeepLinkInfo {
    pub protocol: String,
    pub url: String,
    pub queued: bool,
}

/// Handle deep link URL (magnet:, ed2k://, thunder://, motrixai://)
#[command]
pub async fn handle_deep_link(url: String) -> Result<DeepLinkInfo, String> {
    let protocol = if url.starts_with("magnet:") {
        "magnet"
    } else if url.starts_with("ed2k://") {
        "ed2k"
    } else if url.starts_with("thunder://") {
        "thunder"
    } else if url.starts_with("motrixai://") {
        "motrixai"
    } else {
        "unknown"
    };

    let mut queued = false;

    if protocol == "magnet" || protocol == "ed2k" || protocol == "thunder" {
        match forward_to_aria2(&url).await {
            Ok(gid) => {
                log::info!("Deep link queued: {} → gid {}", protocol, gid);
                queued = true;
            }
            Err(e) => {
                log::warn!("Deep link forward failed: {}", e);
            }
        }
    }

    Ok(DeepLinkInfo {
        protocol: protocol.to_string(),
        url,
        queued,
    })
}

async fn forward_to_aria2(url: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
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
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("aria2 RPC: {}", e))?;

    let data: serde_json::Value = resp.json().await.map_err(|e| format!("Parse: {}", e))?;
    data.get("result")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| {
            format!(
                "aria2 error: {}",
                data.get("error").map(|v| v.to_string()).unwrap_or_default()
            )
        })
}
