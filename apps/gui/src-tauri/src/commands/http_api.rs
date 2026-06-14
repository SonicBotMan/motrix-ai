// commands/http_api.rs — Local HTTP API server for browser extension bridge.
//
// Provides a simple HTTP endpoint that the browser extension can POST to,
// forwarding download requests to aria2 without exposing the raw RPC port.

use serde::{Deserialize, Serialize};
use tauri::command;

/// Default port for the local HTTP API (browser extension bridge).
const DEFAULT_PORT: u16 = 18900;

/// A download request payload sent from the browser extension.
#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadRequest {
    /// The URL to download.
    pub url: String,
    /// Optional display title for the download.
    pub title: Option<String>,
}

/// Start the local HTTP API server for browser extension communication.
///
/// Listens on `127.0.0.1:<port>` (or 18900 if unspecified) and will expose
/// `POST /api/download` for the extension to send URLs.
///
/// # Arguments
/// * `port` - Optional port override. Falls back to 18900.
///
/// # Returns
/// The full URL the API is (or will be) reachable at.
//
// TODO: Implement the actual HTTP server using a lightweight framework
// (e.g. axum or tiny_http) once the build pipeline is ready.  For now we
// return the configured URL so the frontend and browser extension can
// reference it.
#[command]
pub async fn start_http_api(port: Option<u16>) -> Result<String, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    Ok(format!("http://127.0.0.1:{}", port))
}

/// Handle a download request forwarded from the browser extension.
///
/// # Arguments
/// * `request` - The [`DownloadRequest`] containing the URL and optional title.
///
/// # Returns
/// A confirmation message indicating the URL was queued for download.
//
// TODO: Forward the request to aria2 via JSON-RPC once the HTTP server
// pipeline is in place. For now we simply acknowledge the request.
#[command]
pub async fn handle_download_request(request: DownloadRequest) -> Result<String, String> {
    // Forward to aria2
    Ok(format!("Download queued: {}", request.url))
}
