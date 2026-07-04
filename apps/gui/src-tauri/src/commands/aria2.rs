// commands/aria2.rs — Bundled aria2c process management.
// Start/stop/diagnose the aria2c daemon with RPC enabled.

use std::sync::Mutex;
use std::time::Duration;
use tauri::command;
use tauri::Manager;

/// Global store for the aria2c child PID
static ARIA2_CHILD: Mutex<Option<u32>> = Mutex::new(None);

/// Start the bundled aria2c daemon with RPC enabled.
#[command]
pub async fn start_aria2(app: tauri::AppHandle, rpc_port: Option<u16>) -> Result<String, String> {
    let port = rpc_port.unwrap_or(6800);
    let rpc_url = format!("http://127.0.0.1:{}/jsonrpc", port);

    // Check if already running (release lock before any await!)
    let already_running = {
        let child = ARIA2_CHILD
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        child.is_some()
    };
    if already_running {
        let client = reqwest::Client::new();
        if let Ok(resp) = client
            .post(&rpc_url)
            .header("Content-Type", "application/json")
            .body(r#"{"jsonrpc":"2.0","id":"check","method":"aria2.getVersion"}"#)
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                return Ok(rpc_url);
            }
        }
    }

    // Find bundled aria2c binary
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Resource dir error: {}", e))?;
    let aria2c_path = resource_path.join("resources").join("bin").join("aria2c");

    if !aria2c_path.exists() {
        return Err(format!(
            "Bundled aria2c not found at: {}",
            aria2c_path.display()
        ));
    }

    // Prepare directories, session file, and log handle on a blocking thread.
    // These are all sync std::fs operations; running them inline would block
    // the Tauri async runtime, freezing every other concurrent command.
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let prep = tokio::task::spawn_blocking(move || -> Result<(std::path::PathBuf, std::path::PathBuf, std::fs::File), String> {
        let download_dir = home.join("Downloads").join("Motrix AI");
        std::fs::create_dir_all(&download_dir)
            .map_err(|e| format!("Create download dir failed: {}", e))?;

        let session_dir = home.join(".motrix-ai");
        std::fs::create_dir_all(&session_dir)
            .map_err(|e| format!("Create session dir failed: {}", e))?;
        let session_file = session_dir.join("aria2.session");
        if !session_file.exists() {
            std::fs::write(&session_file, "")
                .map_err(|e| format!("Create session file failed: {}", e))?;
        }

        let log_path = session_dir.join("aria2.log");
        let log_file = std::fs::File::create(&log_path)
            .map_err(|e| format!("Failed to create {}: {}", log_path.display(), e))?;

        Ok((download_dir, session_file, log_file))
    })
    .await
    .map_err(|e| format!("Setup task join error: {}", e))??;

    let (download_dir, session_file, log_file) = prep;
    let session_dir = session_file.parent().map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from(".motrix-ai"));

    // Start aria2c (detached from parent process)
    let mut cmd = std::process::Command::new(&aria2c_path);
    cmd.args([
        &format!("--rpc-listen-port={}", port),
        "--enable-rpc=true",
        "--rpc-allow-origin-all=true",
        "--rpc-listen-all=false",
        "--daemon=false",
        "--continue=true",
        "--max-connection-per-server=16",
        "--split=16",
        "--min-split-size=1M",
        "--max-concurrent-downloads=5",
        "--auto-file-renaming=true",
        "--follow-torrent=true",
        "--enable-dht=true",
        "--bt-enable-lpd=true",
        "--bt-max-peers=100",
        &format!("--dir={}", download_dir.display()),
        &format!("--input-file={}", session_file.display()),
        &format!("--save-session={}", session_file.display()),
        "--auto-save-interval=30",
    ])
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::from(log_file));

    // Detach from parent so process survives when Child handle is dropped
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start aria2c: {}", e))?;

    let pid = child.id();
    {
        let mut global_child = ARIA2_CHILD
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        *global_child = Some(pid);
    }

    // Wait for startup
    tokio::time::sleep(Duration::from_millis(800)).await;

    // Verify RPC is alive
    let rpc_url = format!("http://127.0.0.1:{}/jsonrpc", port);
    let client = reqwest::Client::new();
    let check = client
        .post(&rpc_url)
        .header("Content-Type", "application/json")
        .body(r#"{"jsonrpc":"2.0","id":"check","method":"aria2.getVersion"}"#)
        .timeout(Duration::from_secs(3))
        .send()
        .await;

    match check {
        Ok(resp) if resp.status().is_success() => {
            log::info!("aria2c started on port {} (PID {})", port, pid);
            Ok(rpc_url)
        }
        _ => {
            let mut global_child = ARIA2_CHILD
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            if let Some(p) = *global_child {
                let _ = std::process::Command::new("kill")
                    .args(["-9", &p.to_string()])
                    .output();
            }
            *global_child = None;
            let log_path = session_dir.join("aria2.log");
            // Read the last log line on a blocking thread so we don't
            // stall the async runtime on slow disks.
            let log_tail = tokio::task::spawn_blocking(move || {
                std::fs::read_to_string(&log_path)
                    .unwrap_or_default()
                    .lines()
                    .last()
                    .unwrap_or("")
                    .to_string()
            })
            .await
            .unwrap_or_default();
            Err(format!(
                "aria2c started but RPC verification failed: {}",
                log_tail
            ))
        }
    }
}

/// Stop the bundled aria2c daemon.
#[command]
pub async fn stop_aria2() -> Result<String, String> {
    let pid = {
        let mut child = ARIA2_CHILD
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        let pid = *child;
        *child = None;
        pid
    };

    if let Some(p) = pid {
        let client = reqwest::Client::new();
        let _ = client
            .post("http://127.0.0.1:6800/jsonrpc")
            .header("Content-Type", "application/json")
            .body(r#"{"jsonrpc":"2.0","id":"shutdown","method":"aria2.shutdown"}"#)
            .timeout(Duration::from_secs(2))
            .send()
            .await;

        tokio::time::sleep(Duration::from_millis(500)).await;

        let _ = std::process::Command::new("kill")
            .args(["-9", &p.to_string()])
            .output();

        Ok(format!("aria2c (PID {}) stopped", p))
    } else {
        Ok("aria2c not running".to_string())
    }
}

/// Diagnostic: check bundled aria2c binary path and permissions
#[command]
pub async fn check_aria2_binary(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Resource dir error: {}", e))?;
    let aria2c_path = resource_path.join("resources").join("bin").join("aria2c");
    let aria2c_path_for_blocking = aria2c_path.clone();
    // stat() on a network mount or slow disk blocks; do it on a worker.
    let metadata = tokio::task::spawn_blocking(move || std::fs::metadata(&aria2c_path_for_blocking).ok())
        .await
        .map_err(|e| format!("Stat join error: {}", e))?;
    let exists = metadata.is_some();
    let executable = metadata
        .as_ref()
        .map(|m| !m.permissions().readonly())
        .unwrap_or(false);
    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

    Ok(serde_json::json!({
        "resource_dir": resource_path.to_string_lossy(),
        "binary_path": aria2c_path.to_string_lossy(),
        "exists": exists,
        "executable": executable,
        "size": size,
    }))
}

/// Helper: forward a JSON-RPC call to the local aria2 daemon.
async fn aria2_rpc(method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "motrix-gui",
        "method": method,
        "params": params,
    });
    let resp = client
        .post("http://127.0.0.1:6800/jsonrpc")
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("aria2 RPC failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("aria2 RPC returned {}", resp.status()));
    }
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("aria2 RPC parse failed: {}", e))?;
    if let Some(err) = data.get("error") {
        return Err(format!("aria2 error: {}", err));
    }
    Ok(data.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

/// Pause all active downloads (aria2.pauseAll).
#[command]
pub async fn pause_all() -> Result<String, String> {
    aria2_rpc("aria2.pauseAll", serde_json::json!([]))
        .await
        .map(|_| "Paused all downloads".to_string())
}

/// Resume all paused downloads (aria2.unpauseAll).
#[command]
pub async fn unpause_all() -> Result<String, String> {
    aria2_rpc("aria2.unpauseAll", serde_json::json!([]))
        .await
        .map(|_| "Resumed all downloads".to_string())
}

/// Add a .torrent file to aria2 by reading the file and base64-encoding it.
#[command]
pub async fn add_torrent_file(path: String) -> Result<String, String> {
    // File read + base64 encode are CPU/IO-bound; offload so we don't
    // stall the async runtime for large torrents.
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|e| format!("Read join error: {}", e))?
        .map_err(|e| format!("Failed to read torrent file: {}", e))?;
    use base64::Engine as _;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    aria2_rpc("aria2.addTorrent", serde_json::json!([base64]))
        .await
        .and_then(|v| v.as_str().map(String::from).ok_or_else(|| "aria2 returned non-string gid".to_string()))
}
