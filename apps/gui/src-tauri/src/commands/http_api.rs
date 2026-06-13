// commands/http_api.rs — Local HTTP API server for browser extension bridge.
//
// Provides a simple HTTP endpoint that the browser extension can POST to,
// forwarding download requests to aria2 without exposing the raw RPC port.

use tauri::command;

/// Default port for the local HTTP API (browser extension bridge).
const DEFAULT_PORT: u16 = 18900;

/// Start the local HTTP API server for browser extension communication.
///
/// Listens on `127.0.0.1:<port>` (or 18900 if unspecified) and exposes
/// `POST /api/download` for the extension to send URLs.
///
/// # Arguments
/// * `port` - Optional port override. Falls back to 18900.
///
/// # Returns
/// A message indicating the port the API is (or would be) running on.
//
// TODO: Implement the actual HTTP server using a lightweight framework
// (e.g. axum or tiny_http) once the build pipeline is ready.  For now we
// return the configured port so the frontend and browser extension can
// reference it.
#[command]
pub async fn start_http_api(port: Option<u16>) -> Result<String, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    Ok(format!("HTTP API would start on port {}", port))
}
