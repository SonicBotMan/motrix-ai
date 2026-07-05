// commands/http_api.rs — Local HTTP API server for browser extension bridge.
//
// Provides a simple HTTP endpoint that the browser extension can POST to,
// forwarding download requests to aria2 without exposing the raw RPC port.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::command;

const DEFAULT_PORT: u16 = 18900;

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    pub title: Option<String>,
}

/// Start the local HTTP API server for browser extension communication.
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

    let mut buf = [0u8; 4096];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Read: {}", e))?;
    let request = String::from_utf8_lossy(&buf[..n]).to_string();

    let (status, body) = if request.starts_with("POST ") {
        if let Some(json_start) = request.find("\r\n\r\n") {
            let body_str = &request[json_start + 4..];
            match serde_json::from_str::<DownloadRequest>(body_str.trim()) {
                Ok(req) => match forward_to_aria2(&req.url).await {
                    Ok(gid) => (200, format!("{{\"status\":\"ok\",\"gid\":\"{}\"}}", gid)),
                    Err(e) => (502, format!("{{\"status\":\"error\",\"error\":\"{}\"}}", e)),
                },
                Err(_) => (
                    400,
                    r#"{"status":"error","error":"invalid JSON"}"#.to_string(),
                ),
            }
        } else {
            (
                400,
                r#"{"status":"error","error":"empty body"}"#.to_string(),
            )
        }
    } else if request.starts_with("GET / ") {
        (
            200,
            r#"{"status":"ok","service":"motrix-ai-http-api"}"#.to_string(),
        )
    } else {
        (404, r#"{"status":"error","error":"not found"}"#.to_string())
    };

    let response = format!(
        "HTTP/1.1 {} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
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

async fn forward_to_aria2(url: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "motrix-http-api",
        "method": "aria2.addUri",
        "params": [[url]],
    });
    let resp = client
        .post("http://127.0.0.1:6800/jsonrpc")
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
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

/// Handle a download request forwarded from the browser extension.
#[command]
pub async fn handle_download_request(request: DownloadRequest) -> Result<String, String> {
    forward_to_aria2(&request.url).await
}
