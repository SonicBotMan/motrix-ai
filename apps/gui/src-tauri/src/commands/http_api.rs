// commands/http_api.rs — Local HTTP API server for browser extension bridge.
//
//! Security notes:
//! - Bound to 127.0.0.1 only.
//! - No `Access-Control-Allow-Origin` — browser web pages cannot read the
//!   token or POST with custom headers. Extension service workers are not
//!   subject to CORS and remain the supported client.
//! - Authenticated POSTs enqueue a *pending* download via a Tauri event;
//!   the frontend shows the same confirm dialog used for deep links.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, command};
use tokio::sync::watch;

const DEFAULT_PORT: u16 = 18900;
const DOWNLOAD_EVENT: &str = "deep-link-download";

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

static SHUTDOWN_TX: std::sync::OnceLock<watch::Sender<bool>> = std::sync::OnceLock::new();

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    #[allow(dead_code)]
    pub title: Option<String>,
}

#[command]
pub async fn start_http_api(app: AppHandle, port: Option<u16>) -> Result<String, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    let url = format!("http://127.0.0.1:{}", port);

    if SERVER_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(url);
    }

    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
    let _ = SHUTDOWN_TX.set(shutdown_tx);

    let bind_addr = format!("127.0.0.1:{}", port);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("Failed to bind HTTP API to {}: {}", bind_addr, e))?;

    tokio::spawn(async move {
        log::info!("HTTP API listening on {}", bind_addr);
        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    log::info!("HTTP API shutting down");
                    break;
                }
                result = listener.accept() => {
                    match result {
                        Ok((mut stream, _)) => {
                            let app = app.clone();
                            tokio::spawn(async move {
                                let _ = handle_connection(&mut stream, &app).await;
                            });
                        }
                        Err(e) => {
                            log::warn!("HTTP API accept error: {}", e);
                            break;
                        }
                    }
                }
            }
        }
        SERVER_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(url)
}

async fn handle_connection(
    stream: &mut tokio::net::TcpStream,
    app: &AppHandle,
) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let mut buf = vec![0u8; 65536];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Read: {}", e))?;
    let request = String::from_utf8_lossy(&buf[..n]).to_string();

    let (status, body) = route_request(&request, app).await;

    // Intentionally omit CORS headers so arbitrary websites cannot read the
    // token from GET / or issue credentialed POSTs from a page context.
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store\r\n\
         \r\n{}",
        status,
        status_text(status),
        body.len(),
        body
    );

    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("Write: {}", e))?;
    Ok(())
}

async fn route_request(request: &str, app: &AppHandle) -> (u16, String) {
    if request.starts_with("OPTIONS ") {
        // No CORS — browsers will fail preflight from web origins (desired).
        return (204, String::new());
    }

    if request.starts_with("GET / ") {
        let token = crate::commands::aria2::get_aria2_secret();
        return (
            200,
            format!(
                r#"{{"status":"ok","service":"motrix-ai-http-api","token":"{}"}}"#,
                token
            ),
        );
    }

    if request.starts_with("POST ") {
        let token = crate::commands::aria2::get_aria2_secret();
        let has_valid_token = request
            .lines()
            .take(20)
            .any(|line| line.eq_ignore_ascii_case(&format!("X-Motrix-Token: {}", token)));

        if !has_valid_token {
            return (403, err_body("missing or invalid token"));
        }

        let body_str = match request.find("\r\n\r\n") {
            Some(idx) => &request[idx + 4..],
            None => return (400, err_body("empty body")),
        };

        let req: DownloadRequest = match serde_json::from_str(body_str.trim()) {
            Ok(r) => r,
            Err(_) => return (400, err_body("invalid JSON")),
        };

        // Emit to frontend for the same confirm gate as deep links — do not
        // silently enqueue from the extension/HTTP bridge.
        return match app.emit(DOWNLOAD_EVENT, &req.url) {
            Ok(()) => (
                202,
                r#"{"status":"pending","message":"awaiting user confirmation"}"#.to_string(),
            ),
            Err(e) => (500, err_body(&format!("emit failed: {}", e))),
        };
    }

    (404, err_body("not found"))
}

fn err_body(msg: &str) -> String {
    format!(
        "{{\"status\":\"error\",\"error\":\"{}\"}}",
        msg.replace('"', "\\\"")
    )
}

fn status_text(code: u16) -> &'static str {
    match code {
        200 => "OK",
        202 => "Accepted",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        _ => "Error",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_err_body_escapes_quotes() {
        let body = err_body(r#"she said "hi""#);
        assert!(body.contains(r#"\"hi\""#));
        assert!(body.starts_with("{\"status\":\"error\""));
    }

    #[test]
    fn test_download_request_deserialize() {
        let json = r#"{"url":"https://example.com/file.zip","title":"My File"}"#;
        let req: DownloadRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.url, "https://example.com/file.zip");
        assert_eq!(req.title.as_deref(), Some("My File"));
    }

    #[test]
    fn test_download_request_deserialize_no_title() {
        let json = r#"{"url":"magnet:?xt=urn:btih:abc123"}"#;
        let req: DownloadRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.url, "magnet:?xt=urn:btih:abc123");
        assert!(req.title.is_none());
    }

    #[test]
    fn test_status_text_includes_202() {
        assert_eq!(status_text(202), "Accepted");
    }
}
