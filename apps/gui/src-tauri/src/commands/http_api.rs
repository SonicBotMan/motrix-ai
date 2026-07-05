// commands/http_api.rs — Local HTTP API server for browser extension bridge.
//
// Implements a minimal HTTP/1.1 server bound to 127.0.0.1:18900 that the
// browser extension POSTs to (`POST /api/download`). The request is forwarded
// to the local aria2 daemon via JSON-RPC (`aria2.addUri`) so the raw RPC port
// (6800) never needs to be exposed to the browser.
//
// Design:
//   * Raw `tokio::net::TcpListener` — zero extra Rust dependencies.
//   * 64 KiB read buffer to avoid truncation of large link payloads.
//   * `tokio::select!` + `tokio::sync::watch` channel for graceful shutdown.
//   * `AtomicBool` guard prevents double-start.
//   * URL scheme allow-list mitigates SSRF (http/https/ftp/magnet only).
//   * Full CORS headers + OPTIONS preflight handling for browser fetch().

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::command;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::watch;

/// Default port for the local HTTP API (browser extension bridge).
const DEFAULT_PORT: u16 = 18900;

/// URL of the local aria2 JSON-RPC endpoint.
const ARIA2_RPC_URL: &str = "http://127.0.0.1:6800/jsonrpc";

/// Max bytes we will read from a single request. Browser extension payloads
/// are tiny JSON (`{"url": "...", "title": "..."}`), but 64 KiB gives us
/// headroom for long magnet links with many trackers.
const MAX_REQUEST_SIZE: usize = 64 * 1024;

/// Guard that prevents `start_http_api` from spawning two listeners when
/// called more than once during a process lifetime.
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Process-wide shutdown sender. Held in a `OnceLock` so subsequent
/// `start_http_api` calls reuse the existing channel (which is already
/// closed) instead of panicking.
static SHUTDOWN_TX: OnceLock<watch::Sender<bool>> = OnceLock::new();

/// A download request payload sent from the browser extension.
#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadRequest {
    /// The URL to download. Must be `http://`, `https://`, `ftp://`, or `magnet:`.
    pub url: String,
    /// Optional display title for the download (currently advisory).
    pub title: Option<String>,
}

/// Start the local HTTP API server for browser extension communication.
///
/// Listens on `127.0.0.1:<port>` (or 18900 if unspecified) and exposes
/// `POST /api/download` for the extension to send URLs. Idempotent: a second
/// invocation returns the bound URL without starting a second listener.
///
/// # Arguments
/// * `port` - Optional port override. Falls back to 18900.
///
/// # Returns
/// The full URL the API is reachable at, or an error if the bind failed.
#[command]
pub async fn start_http_api(port: Option<u16>) -> Result<String, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    let bind_addr = format!("127.0.0.1:{}", port);

    // Idempotent: if a server is already running on this port, just return
    // the URL. This makes the setup hook safe to call on every app launch
    // even if a previous launch left the flag set in a reloaded webview.
    if SERVER_RUNNING.swap(true, Ordering::SeqCst) {
        log::info!("HTTP API already running on {}", bind_addr);
        return Ok(format!("http://{}", bind_addr));
    }

    let listener = TcpListener::bind(&bind_addr).await.map_err(|e| {
        // Release the flag so a later call (e.g. after freeing the port) can retry.
        SERVER_RUNNING.store(false, Ordering::SeqCst);
        format!("Failed to bind {}: {}", bind_addr, e)
    })?;

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    // OnceLock::set returns Err if already set; we ignore that — it means a
    // previous server existed in this process and is being replaced.
    let _ = SHUTDOWN_TX.set(shutdown_tx);

    let url = format!("http://{}", bind_addr);

    tokio::spawn(async move {
        log::info!("HTTP API server listening on {}", bind_addr);

        loop {
            tokio::select! {
                biased;
                _ = shutdown_rx.changed() => {
                    log::info!("HTTP API server shutting down");
                    break;
                }
                accept_result = listener.accept() => {
                    let (mut socket, peer) = match accept_result {
                        Ok(pair) => pair,
                        Err(e) => {
                            log::warn!("HTTP API accept failed: {}", e);
                            // Brief pause to avoid hot-looping on a stuck listener.
                            tokio::time::sleep(Duration::from_millis(100)).await;
                            continue;
                        }
                    };

                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(&mut socket).await {
                            log::debug!("HTTP API connection from {} failed: {}", peer, e);
                        }
                    });
                }
            }
        }

        // Mark the slot as free so a future start_http_api can rebind.
        SERVER_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(url)
}

/// Stop the HTTP API server, if any is running. Safe to call when not started.
#[command]
pub async fn stop_http_api() -> Result<(), String> {
    if let Some(tx) = SHUTDOWN_TX.get() {
        let _ = tx.send(true);
    }
    Ok(())
}

/// Handle a single HTTP/1.1 connection: read one request, dispatch, write
/// one response, then close (`Connection: close`).
async fn handle_connection(socket: &mut tokio::net::TcpStream) -> Result<(), String> {
    let mut buf = vec![0u8; MAX_REQUEST_SIZE];
    let mut total = 0;

    // Read until we see the end-of-headers marker or hit the buffer cap.
    loop {
        if total >= MAX_REQUEST_SIZE {
            let _ = socket
                .write_all(b"HTTP/1.1 413 Payload Too Large\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .await;
            return Err("Request exceeded 64 KiB".into());
        }
        let n = socket
            .read(&mut buf[total..])
            .await
            .map_err(|e| format!("Read failed: {}", e))?;
        if n == 0 {
            return Err("Connection closed before end of headers".into());
        }
        total += n;
        if buf[..total].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }

    let request = String::from_utf8_lossy(&buf[..total]).into_owned();
    let (method, path, body) = parse_http_request(&request)?;

    let response = match (method.as_str(), path.as_str()) {
        ("OPTIONS", _) => build_response(
            204,
            "",
            &[
                ("Access-Control-Allow-Origin", "*"),
                ("Access-Control-Allow-Methods", "POST, OPTIONS"),
                ("Access-Control-Allow-Headers", "Content-Type"),
                ("Access-Control-Max-Age", "86400"),
            ],
        ),
        ("POST", "/api/download") => match handle_download(&body).await {
            Ok(payload) => build_response(
                200,
                &payload,
                &[
                    ("Access-Control-Allow-Origin", "*"),
                    ("Content-Type", "application/json"),
                ],
            ),
            Err(e) => {
                log::warn!("HTTP API /api/download error: {}", e);
                build_response(
                    500,
                    &format!("{{\"error\":{:?}}}", e),
                    &[
                        ("Access-Control-Allow-Origin", "*"),
                        ("Content-Type", "application/json"),
                    ],
                )
            }
        },
        _ => build_response(
            404,
            "{\"error\":\"not found\"}",
            &[
                ("Access-Control-Allow-Origin", "*"),
                ("Content-Type", "application/json"),
            ],
        ),
    };

    socket
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("Write failed: {}", e))?;

    Ok(())
}

/// Parse the request line + headers + body of a raw HTTP/1.1 request.
fn parse_http_request(raw: &str) -> Result<(String, String, String), String> {
    let mut lines = raw.split("\r\n");
    let request_line = lines.next().ok_or("Missing request line")?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().ok_or("Missing method")?.to_string();
    let path = parts.next().ok_or("Missing path")?.to_string();

    // Body is whatever follows the blank line. We trim trailing NULs that
    // come from the fixed-size read buffer.
    let body = match raw.find("\r\n\r\n") {
        Some(idx) => raw[idx + 4..].trim_end_matches('\0').trim_end().to_string(),
        None => String::new(),
    };

    Ok((method, path, body))
}

/// Validate the payload and forward it to aria2 via JSON-RPC.
async fn handle_download(body: &str) -> Result<String, String> {
    if body.is_empty() {
        return Err("Empty request body".into());
    }

    let req: DownloadRequest =
        serde_json::from_str(body).map_err(|e| format!("Invalid JSON body: {}", e))?;

    if req.url.is_empty() {
        return Err("Missing required field: url".into());
    }

    // Scheme allow-list. `file://`, `data:`, `javascript:`, etc. must be
    // rejected — they could be used to probe the local filesystem or as
    // transport for unexpected handlers.
    if !["http://", "https://", "ftp://", "magnet:"]
        .iter()
        .any(|scheme| req.url.starts_with(scheme))
    {
        return Err(format!(
            "Unsupported URL scheme (allowed: http/https/ftp/magnet): {}",
            req.url.split(':').next().unwrap_or("?")
        ));
    }

    let client = reqwest::Client::new();
    let rpc_body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "motrix-http-api",
        "method": "aria2.addUri",
        "params": [[&req.url]],
    });

    let resp = client
        .post(ARIA2_RPC_URL)
        .header("Content-Type", "application/json")
        .json(&rpc_body)
        .timeout(Duration::from_secs(5))
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
        return Err(format!("aria2 RPC error: {}", err));
    }

    let gid = result
        .get("result")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    Ok(format!("{{\"ok\":true,\"gid\":\"{}\"}}", gid))
}

/// Build a minimal HTTP/1.1 response string.
fn build_response(status: u16, body: &str, headers: &[(&str, &str)]) -> String {
    let status_text = match status {
        200 => "OK",
        204 => "No Content",
        404 => "Not Found",
        413 => "Payload Too Large",
        500 => "Internal Server Error",
        _ => "Status",
    };

    let mut response = format!("HTTP/1.1 {} {}\r\n", status, status_text);
    for (k, v) in headers {
        response.push_str(&format!("{}: {}\r\n", k, v));
    }
    response.push_str(&format!("Content-Length: {}\r\n", body.len()));
    response.push_str("Connection: close\r\n");
    response.push_str("\r\n");
    response.push_str(body);
    response
}

/// Backwards-compatible command kept so the existing `invoke_handler!`
/// registration continues to compile. Frontend code can call this directly
/// if it ever needs to bypass the HTTP server (e.g. in tests).
#[command]
pub async fn handle_download_request(request: DownloadRequest) -> Result<String, String> {
    let body = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    handle_download(&body).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_http_request_get_no_body() {
        let raw = "GET /api/download HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let (method, path, body) = parse_http_request(raw).unwrap();
        assert_eq!(method, "GET");
        assert_eq!(path, "/api/download");
        assert_eq!(body, "");
    }

    #[test]
    fn parse_http_request_post_with_json_body() {
        let raw = "POST /api/download HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n\r\n{\"url\":\"https://example.com/file.zip\"}";
        let (method, path, body) = parse_http_request(raw).unwrap();
        assert_eq!(method, "POST");
        assert_eq!(path, "/api/download");
        assert!(body.contains("example.com"));
    }

    #[test]
    fn parse_http_request_missing_method() {
        let raw = " \r\n\r\n";
        let err = parse_http_request(raw).unwrap_err();
        assert!(err.contains("Missing method"));
    }

    #[test]
    fn build_response_200_with_body() {
        let r = build_response(200, "hello", &[("Content-Type", "text/plain")]);
        assert!(r.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(r.contains("Content-Type: text/plain\r\n"));
        assert!(r.contains("Content-Length: 5\r\n"));
        assert!(r.ends_with("hello"));
    }

    #[test]
    fn build_response_204_empty() {
        let r = build_response(204, "", &[]);
        assert!(r.starts_with("HTTP/1.1 204 No Content\r\n"));
        assert!(r.contains("Content-Length: 0\r\n"));
    }

    #[test]
    fn build_response_includes_cors_header() {
        let r = build_response(200, "{}", &[("Access-Control-Allow-Origin", "*")]);
        assert!(r.contains("Access-Control-Allow-Origin: *\r\n"));
    }

    #[tokio::test]
    async fn handle_download_rejects_empty_body() {
        let err = handle_download("").await.unwrap_err();
        assert!(err.contains("Empty request body"));
    }

    #[tokio::test]
    async fn handle_download_rejects_invalid_json() {
        let err = handle_download("not json").await.unwrap_err();
        assert!(err.contains("Invalid JSON body"));
    }

    #[tokio::test]
    async fn handle_download_rejects_missing_url() {
        let err = handle_download(r#"{"url":""}"#).await.unwrap_err();
        assert!(err.contains("Missing required field: url"));
    }

    #[tokio::test]
    async fn handle_download_rejects_file_scheme() {
        let err = handle_download(r#"{"url":"file:///etc/passwd"}"#)
            .await
            .unwrap_err();
        assert!(err.contains("Unsupported URL scheme"));
    }

    #[tokio::test]
    async fn handle_download_rejects_data_scheme() {
        let err = handle_download(r#"{"url":"data:text/plain,hi"}"#)
            .await
            .unwrap_err();
        assert!(err.contains("Unsupported URL scheme"));
    }

    #[tokio::test]
    async fn handle_download_accepts_https() {
        // No aria2 listening in CI — we expect a connection-refused style error,
        // but it must come from reqwest (proving we got past validation).
        let err = handle_download(r#"{"url":"https://example.com/x"}"#)
            .await
            .unwrap_err();
        assert!(
            err.contains("aria2 RPC call failed") || err.contains("aria2 RPC returned"),
            "unexpected error: {}",
            err
        );
    }

    #[tokio::test]
    async fn handle_download_accepts_magnet() {
        let err = handle_download(r#"{"url":"magnet:?xt=urn:btih:abcd"}"#)
            .await
            .unwrap_err();
        // Same as above — should fail at the aria2 RPC step, not validation.
        assert!(
            err.contains("aria2 RPC call failed") || err.contains("aria2 RPC returned"),
            "unexpected error: {}",
            err
        );
    }

    #[tokio::test]
    async fn start_http_api_binds_and_serves() {
        // Pick an ephemeral port so the test doesn't conflict with a real
        // server running on 18900.
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let port = addr.port();
        drop(listener);

        let url = start_http_api(Some(port)).await.unwrap();
        assert_eq!(url, format!("http://127.0.0.1:{}", port));

        // Give the spawned task a moment to start accepting.
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Send an OPTIONS preflight.
        let opts = reqwest::Client::new()
            .request(reqwest::Method::OPTIONS, &url)
            .header("Origin", "chrome-extension://abc")
            .header("Access-Control-Request-Method", "POST")
            .send()
            .await
            .unwrap();
        assert_eq!(opts.status(), 204);
        assert_eq!(
            opts.headers().get("access-control-allow-origin").unwrap(),
            "*"
        );

        // Send a POST with a URL we know aria2 will reject (wrong scheme).
        let post = reqwest::Client::new()
            .post(format!("{}/api/download", url))
            .json(&serde_json::json!({"url": "file:///etc/passwd"}))
            .send()
            .await
            .unwrap();
        assert_eq!(post.status(), 500);
        let body = post.text().await.unwrap();
        assert!(body.contains("Unsupported URL scheme"));

        // Unknown path -> 404.
        let not_found = reqwest::Client::new()
            .get(format!("{}/api/unknown", url))
            .send()
            .await
            .unwrap();
        assert_eq!(not_found.status(), 404);

        // Shut down cleanly.
        stop_http_api().await.unwrap();
        // Give the task a moment to observe the shutdown signal.
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
