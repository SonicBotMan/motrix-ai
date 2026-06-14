// commands/protocol.rs — Deep link / custom URI scheme handler.
//
// Parses URLs from `magnet:`, `ed2k://`, `thunder://`, and the app's own
// `motrixai://` scheme so the frontend can react accordingly.

use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DeepLinkInfo {
    pub protocol: String,
    pub url: String,
}

/// Handle deep link URL (magnet://, ed2k://, thunder://)
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

    Ok(DeepLinkInfo {
        protocol: protocol.to_string(),
        url,
    })
}
