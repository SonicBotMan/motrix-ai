// commands/protocol.rs — Deep link / custom URI scheme handler.

use super::aria2_add_uri;
use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct DeepLinkInfo {
    pub protocol: String,
    pub url: String,
    pub queued: bool,
}

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

    if matches!(protocol, "magnet" | "ed2k" | "thunder") {
        match aria2_add_uri(&url).await {
            Ok(gid) => {
                log::info!("Deep link queued via {}: gid {}", protocol, gid);
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
