// commands/http_api.rs — Local HTTP API server for browser extension bridge.

use super::aria2_add_uri;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::command;

const DEFAULT_PORT: u16 = 18900;

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    #[allow(dead_code)]
    pub title: Option<String>,
}

#[command]
pub async fn start_http_api(port: Option<u16>) -> Result<String, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    let url = format!("http://127.0.0.1:{}", port);

    if SERVER_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(url);
    }

    let bind_addr = format!("127.0.0.1:{}", port);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("Failed to bind HTTP API to {}: {}", bind_addr, e))?;

    tokio::spawn(async move {
        log::info!("HTTP API listening on {}", bind_addr);
        loop {
            match listener.accept().await {
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

    let response = format!(
        "HTTP/1.1 {} OK\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         \r\n{}",
        status,
        body.len(),
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
        return (
            200,
            r#"{"status":"ok","service":"motrix-ai-http-api"}"#.to_string(),
        );
    }

    if request.starts_with("POST ") {
        let body_str = match request.find("\r\n\r\n") {
            Some(idx) => &request[idx + 4..],
            None => return (400, err_body("empty body")),
        };

        let req: DownloadRequest = match serde_json::from_str(body_str.trim()) {
            Ok(r) => r,
            Err(_) => return (400, err_body("invalid JSON")),
        };

        return match aria2_add_uri(&req.url).await {
            Ok(gid) => (200, format!("{{\"status\":\"ok\",\"gid\":\"{}\"}}", gid)),
            Err(e) => (502, err_body(&e)),
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

#[command]
pub async fn handle_download_request(request: DownloadRequest) -> Result<String, String> {
    aria2_add_uri(&request.url).await
}
