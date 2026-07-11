// commands/http_api.rs — Local HTTP API server for browser extension bridge.

use super::aria2_add_uri;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{command, AppHandle, Emitter};
use tokio::sync::watch;

const DEFAULT_PORT: u16 = 18900;

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

static SHUTDOWN_TX: std::sync::OnceLock<watch::Sender<bool>> = std::sync::OnceLock::new();

static APP_HANDLE: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    #[allow(dead_code)]
    pub title: Option<String>,
}

#[command]
pub async fn start_http_api(port: Option<u16>, app: AppHandle) -> Result<String, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    let url = format!("http://127.0.0.1:{}", port);

    if SERVER_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(url);
    }

    let _ = APP_HANDLE.set(app);

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
                            tokio::spawn(async move {
                                let _ = handle_connection(&mut stream).await;
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

async fn handle_connection(stream: &mut tokio::net::TcpStream) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let mut buf = vec![0u8; 65536];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Read: {}", e))?;
    let request = String::from_utf8_lossy(&buf[..n]).to_string();

    let (status, body) = route_request(&request).await;

    // S1: restrict CORS to browser-extension origins only. A wildcard ("*")
    // would let any website read responses (incl. the RPC token from GET /)
    // and drive downloads — a localhost CSRF. Extension origins are echoed
    // verbatim; website origins get no CORS header so the browser blocks reads.
    let cors_header = match cors_origin(&request) {
        Some(o) => format!(
            "Access-Control-Allow-Origin: {}\r\n\
             Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
             Access-Control-Allow-Headers: Content-Type, X-Motrix-Token\r\n",
            o
        ),
        None => String::new(),
    };

    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         {}\r\n{}",
        status,
        status_text(status),
        body.len(),
        cors_header,
        body
    );

    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("Write: {}", e))?;
    Ok(())
}

async fn route_request(request: &str) -> (u16, String) {
    if request.starts_with("OPTIONS ") {
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

        return match aria2_add_uri(&req.url).await {
            Ok(gid) => {
                // S2: emit a visibility event so the GUI can surface downloads
                // enqueued via the HTTP API (extension bridge). The download
                // is already enqueued; this is non-blocking notification only.
                if let Some(handle) = APP_HANDLE.get() {
                    let _ = handle.emit(
                        "http-api-download",
                        serde_json::json!({ "url": req.url, "title": req.title, "gid": gid }),
                    );
                }
                (200, format!("{{\"status\":\"ok\",\"gid\":\"{}\"}}", gid))
            }
            Err(e) => (502, err_body(&e)),
        };
    }

    (404, err_body("not found"))
}

/// Return the request's `Origin` header value iff it is a browser-extension
/// scheme. Returns `None` for website (http/https) origins so the browser
/// blocks cross-origin reads — preventing token theft via CORS (S1).
fn cors_origin(request: &str) -> Option<String> {
    for line in request.lines().take(50) {
        let line = line.trim();
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("origin") {
                let origin = value.trim();
                if origin.starts_with("chrome-extension://")
                    || origin.starts_with("moz-extension://")
                    || origin.starts_with("safari-web-extension://")
                {
                    return Some(origin.to_string());
                }
                return None;
            }
        }
    }
    None
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
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
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

    #[tokio::test]
    async fn test_route_options_returns_204() {
        let (status, body) = route_request("OPTIONS /api/download HTTP/1.1\r\n\r\n").await;
        assert_eq!(status, 204);
        assert!(body.is_empty());
    }

    #[tokio::test]
    async fn test_route_get_health() {
        let (status, body) = route_request("GET / HTTP/1.1\r\n\r\n").await;
        assert_eq!(status, 200);
        assert!(body.contains("motrix-ai-http-api"));
    }

    #[tokio::test]
    async fn test_route_post_invalid_json() {
        let token = crate::commands::aria2::get_aria2_secret();
        let req = format!(
            "POST /api/download HTTP/1.1\r\nContent-Type: application/json\r\nX-Motrix-Token: {}\r\n\r\n{{bad}}",
            token
        );
        let (status, body) = route_request(&req).await;
        assert_eq!(status, 400);
        assert!(body.contains("invalid JSON"));
    }

    #[tokio::test]
    async fn test_route_post_empty_body() {
        let token = crate::commands::aria2::get_aria2_secret();
        let req = format!(
            "POST /api/download HTTP/1.1\r\nX-Motrix-Token: {}\r\n\r\n",
            token
        );
        let (status, _) = route_request(&req).await;
        assert_eq!(status, 400);
    }

    #[tokio::test]
    async fn test_route_post_without_token_returns_403() {
        let req = "POST /api/download HTTP/1.1\r\nContent-Type: application/json\r\n\r\n{\"url\":\"https://example.com\"}";
        let (status, body) = route_request(req).await;
        assert_eq!(status, 403);
        assert!(body.contains("token"));
    }

    #[tokio::test]
    async fn test_route_unknown_path_404() {
        let (status, _) = route_request("DELETE / HTTP/1.1\r\n\r\n").await;
        assert_eq!(status, 404);
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
    fn test_cors_origin_extension_schemes_allowed() {
        let req = "GET / HTTP/1.1\r\nOrigin: chrome-extension://abcdefg\r\n\r\n";
        assert_eq!(
            cors_origin(req).as_deref(),
            Some("chrome-extension://abcdefg")
        );

        let req = "GET / HTTP/1.1\r\nOrigin: moz-extension://12345\r\n\r\n";
        assert_eq!(cors_origin(req).as_deref(), Some("moz-extension://12345"));
    }

    #[test]
    fn test_cors_origin_website_origins_blocked() {
        // Website origins must NOT be echoed — otherwise a malicious page can
        // read the RPC token from GET / (S1).
        let req = "GET / HTTP/1.1\r\nOrigin: https://evil.example\r\n\r\n";
        assert_eq!(cors_origin(req), None);

        let req = "GET / HTTP/1.1\r\nOrigin: http://localhost:8080\r\n\r\n";
        assert_eq!(cors_origin(req), None);
    }

    #[test]
    fn test_cors_origin_missing_header() {
        assert_eq!(cors_origin("GET / HTTP/1.1\r\n\r\n"), None);
    }
}
