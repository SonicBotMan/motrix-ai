// commands/aria2.rs — Bundled aria2c process management.
// Start/stop/diagnose the aria2c daemon with RPC enabled.

use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::command;
use tauri::Manager;

/// Global store for the aria2c child PID
static ARIA2_CHILD: Mutex<Option<u32>> = Mutex::new(None);

/// P0-2 FIX: Prevents concurrent start_aria2 calls from both passing the
/// "already running" check and spawning duplicate processes.
static ARIA2_STARTING: AtomicBool = AtomicBool::new(false);

/// P0-3 FIX: Stores the actual RPC port so aria2_rpc / stop_aria2 use the
/// correct port instead of a hardcoded 6800.
pub static ARIA2_RPC_PORT: AtomicU16 = AtomicU16::new(6800);

/// Random secret generated on first start, reused across restarts within
/// a single app session. Passed to aria2 via --rpc-secret and included
/// in every JSON-RPC call as the first param ("token:<secret>").
static ARIA2_SECRET: OnceLock<String> = OnceLock::new();

/// Return the current session's aria2 RPC secret, generating one if needed.
pub fn get_aria2_secret() -> &'static str {
    ARIA2_SECRET.get_or_init(|| {
        use rand::RngCore;
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        hex_encode(&bytes)
    })
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Tauri command exposing the secret to the frontend so it can include
/// the token in its own JSON-RPC calls to aria2.
#[command]
pub fn get_rpc_secret() -> String {
    get_aria2_secret().to_string()
}

/// Start the bundled aria2c daemon with RPC enabled.
#[command]
pub async fn start_aria2(app: tauri::AppHandle, rpc_port: Option<u16>) -> Result<String, String> {
    let port = rpc_port.unwrap_or(6800);

    if ARIA2_STARTING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("aria2 is already starting".to_string());
    }

    let rpc_url = format!("http://127.0.0.1:{}/jsonrpc", port);

    let already_running = {
        let child = ARIA2_CHILD
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        child.is_some()
    };
    if already_running {
        let secret = get_aria2_secret();
        let client = reqwest::Client::new();
        if let Ok(resp) = client
            .post(&rpc_url)
            .header("Content-Type", "application/json")
            .body(format!(
                r#"{{"jsonrpc":"2.0","id":"check","method":"aria2.getVersion","params":["token:{}"]}}"#,
                secret
            ))
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                ARIA2_STARTING.store(false, Ordering::SeqCst);
                return Ok(rpc_url);
            }
        }
    }

    // Find bundled aria2c binary — name depends on the host platform.
    // All three platform binaries are bundled via tauri.conf.json's
    // resources glob so a single install works out-of-the-box.
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Resource dir error: {}", e))?;
    let binary_name = bundled_aria2c_name();
    let aria2c_path = resource_path
        .join("resources")
        .join("bin")
        .join(binary_name);

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
    let prep = tokio::task::spawn_blocking(
        move || -> Result<(std::path::PathBuf, std::path::PathBuf, std::fs::File), String> {
            let download_dir = super::configured_download_dir();
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
        },
    )
    .await
    .map_err(|e| format!("Setup task join error: {}", e))??;

    let (download_dir, session_file, log_file) = prep;
    let session_dir = session_file
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from(".motrix-ai"));

    let secret = get_aria2_secret();

    let mut cmd = std::process::Command::new(&aria2c_path);
    cmd.args([
        &format!("--rpc-listen-port={}", port),
        "--enable-rpc=true",
        "--rpc-allow-origin-all=true",
        "--rpc-listen-all=false",
        &format!("--rpc-secret={}", secret),
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
    ]);

    let proxy_args = super::configured_proxy_args();
    for arg in &proxy_args {
        cmd.arg(arg);
    }

    cmd.stdout(std::process::Stdio::from(
        log_file
            .try_clone()
            .map_err(|e| format!("Clone log fd: {}", e))?,
    ))
    .stderr(std::process::Stdio::from(log_file));

    // Detach from parent so process survives when Child handle is dropped
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            ARIA2_STARTING.store(false, Ordering::SeqCst);
            return Err(format!("Failed to start aria2c: {}", e));
        }
    };

    let pid = child.id();
    {
        let mut global_child = ARIA2_CHILD
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        *global_child = Some(pid);
    }

    // Wait for startup
    let rpc_url = format!("http://127.0.0.1:{}/jsonrpc", port);
    let client = reqwest::Client::new();
    let body = format!(
        r#"{{"jsonrpc":"2.0","id":"check","method":"aria2.getVersion","params":["token:{}"]}}"#,
        secret
    );

    let mut rpc_ready = false;
    for _attempt in 0..10u32 {
        tokio::time::sleep(Duration::from_millis(200)).await;
        if let Ok(resp) = client
            .post(&rpc_url)
            .header("Content-Type", "application/json")
            .body(body.clone())
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                rpc_ready = true;
                break;
            }
        }
    }
    let _ = &body;

    if rpc_ready {
        ARIA2_RPC_PORT.store(port, Ordering::SeqCst);
        ARIA2_STARTING.store(false, Ordering::SeqCst);
        log::info!("aria2c started on port {} (PID {})", port, pid);
        Ok(rpc_url)
    } else {
        {
            let mut global_child = ARIA2_CHILD
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            if let Some(p) = *global_child {
                let _ = std::process::Command::new("kill")
                    .args(["-9", &p.to_string()])
                    .output();
            }
            *global_child = None;
        }
        ARIA2_STARTING.store(false, Ordering::SeqCst);
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

/// Stop the bundled aria2c daemon.
#[command]
pub async fn stop_aria2() -> Result<String, String> {
    let port = ARIA2_RPC_PORT.load(Ordering::SeqCst);
    let rpc_url = format!("http://127.0.0.1:{}/jsonrpc", port);
    let pid = {
        let mut child = ARIA2_CHILD
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        let pid = *child;
        *child = None;
        pid
    };

    if let Some(p) = pid {
        let secret = get_aria2_secret();
        let client = reqwest::Client::new();
        let _ = client
            .post(&rpc_url)
            .header("Content-Type", "application/json")
            .body(format!(
                r#"{{"jsonrpc":"2.0","id":"save-session","method":"aria2.saveSession","params":["token:{}"]}}"#,
                secret
            ))
            .timeout(Duration::from_secs(2))
            .send()
            .await;
        let _ = client
            .post(&rpc_url)
            .header("Content-Type", "application/json")
            .body(format!(
                r#"{{"jsonrpc":"2.0","id":"shutdown","method":"aria2.shutdown","params":["token:{}"]}}"#,
                secret
            ))
            .timeout(Duration::from_secs(2))
            .send()
            .await;

        #[cfg(unix)]
        let mut exited = false;
        #[cfg(not(unix))]
        let exited = true;

        #[cfg(unix)]
        {
            let deadline = Duration::from_secs(5);
            let interval = Duration::from_millis(200);
            let start = std::time::Instant::now();
            while start.elapsed() < deadline {
                let result = std::process::Command::new("kill")
                    .args(["-0", &p.to_string()])
                    .output();
                let alive = result.map(|o| o.status.success()).unwrap_or(false);
                if !alive {
                    exited = true;
                    break;
                }
                tokio::time::sleep(interval).await;
            }
        }

        #[cfg(not(unix))]
        {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        if !exited {
            if let Ok(mut child) = ARIA2_CHILD.lock() {
                *child = pid;
            }
            log::warn!("aria2c did not exit gracefully after 5s, sending SIGKILL");
            let _ = std::process::Command::new("kill")
                .args(["-9", &p.to_string()])
                .output();
        }

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
    let aria2c_path = resource_path
        .join("resources")
        .join("bin")
        .join(bundled_aria2c_name());
    let aria2c_path_for_blocking = aria2c_path.clone();
    // stat() on a network mount or slow disk blocks; do it on a worker.
    let metadata =
        tokio::task::spawn_blocking(move || std::fs::metadata(&aria2c_path_for_blocking).ok())
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
    // Prepend the aria2 RPC secret token. When aria2 starts with --rpc-secret,
    // every JSON-RPC method's params array MUST start with "token:<secret>"
    // or the call is rejected with error code 1 (Unauthorized). This helper
    // was previously passing params through verbatim, so pause_all /
    // unpause_all / add_torrent_file all failed auth (G2).
    let secret = get_aria2_secret();
    let mut params_arr = params.as_array().cloned().unwrap_or_default();
    params_arr.insert(0, serde_json::json!(format!("token:{}", secret)));

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "motrix-gui",
        "method": method,
        "params": serde_json::Value::Array(params_arr),
    });
    let port = ARIA2_RPC_PORT.load(Ordering::SeqCst);
    let rpc_url = format!("http://127.0.0.1:{}/jsonrpc", port);
    let resp = client
        .post(&rpc_url)
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
    Ok(data
        .get("result")
        .cloned()
        .unwrap_or(serde_json::Value::Null))
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
    // Cap at 5 MB — valid .torrent files are well under 1 MB even with
    // thousands of pieces; larger inputs are almost certainly mistakes or
    // abuse (memory exhaustion via base64 inflation).
    const MAX_TORRENT_SIZE: u64 = 5 * 1024 * 1024;
    let path_for_stat = path.clone();
    let size =
        tokio::task::spawn_blocking(move || std::fs::metadata(&path_for_stat).map(|m| m.len()))
            .await
            .map_err(|e| format!("Stat join error: {}", e))?
            .map_err(|e| format!("Failed to stat torrent file: {}", e))?;
    if size > MAX_TORRENT_SIZE {
        return Err(format!(
            "Torrent file too large ({} bytes, max {} bytes)",
            size, MAX_TORRENT_SIZE
        ));
    }

    let bytes = tokio::task::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|e| format!("Read join error: {}", e))?
        .map_err(|e| format!("Failed to read torrent file: {}", e))?;
    use base64::Engine as _;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    aria2_rpc("aria2.addTorrent", serde_json::json!([base64]))
        .await
        .and_then(|v| {
            v.as_str()
                .map(String::from)
                .ok_or_else(|| "aria2 returned non-string gid".to_string())
        })
}

/// Add a .metalink/.meta4 file to aria2 by reading and base64-encoding it.
#[command]
pub async fn add_metalink_file(path: String) -> Result<Vec<String>, String> {
    const MAX_METALINK_SIZE: u64 = 5 * 1024 * 1024;
    let path_for_stat = path.clone();
    let size =
        tokio::task::spawn_blocking(move || std::fs::metadata(&path_for_stat).map(|m| m.len()))
            .await
            .map_err(|e| format!("Stat join error: {}", e))?
            .map_err(|e| format!("Failed to stat metalink file: {}", e))?;
    if size > MAX_METALINK_SIZE {
        return Err(format!(
            "Metalink file too large ({} bytes, max {} bytes)",
            size, MAX_METALINK_SIZE
        ));
    }

    let bytes = tokio::task::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|e| format!("Read join error: {}", e))?
        .map_err(|e| format!("Failed to read metalink file: {}", e))?;
    use base64::Engine as _;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    aria2_rpc("aria2.addMetalink", serde_json::json!([base64]))
        .await
        .and_then(|v| {
            v.as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| a.as_str().map(String::from))
                        .collect()
                })
                .ok_or_else(|| "aria2 returned non-array result for addMetalink".to_string())
        })
}

/// Return the bundled aria2c binary filename for the current target platform.
///
/// Three platform-specific binaries live under `resources/bin/`:
///   * `aria2c-macos` — Mach-O arm64 (Apple Silicon; Intel Macs fall back to
///     the system PATH via the frontend's `pickDefaultAria2Path()`)
///   * `aria2c-linux` — ELF x86_64 statically linked against musl
///   * `aria2c.exe`  — PE x86_64 (MinGW build)
///
/// All three are packaged into every install via `tauri.conf.json`'s
/// `resources` glob so a single release artifact works on its target
/// platform without a network fetch. The runtime cost is ~10 MB of
/// non-native binaries the user will never execute; acceptable for a
/// desktop download manager that already weighs 80+ MB.
fn bundled_aria2c_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "aria2c.exe"
    } else if cfg!(target_os = "macos") {
        "aria2c-macos"
    } else {
        "aria2c-linux"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_binary_name_matches_target_os() {
        let name = bundled_aria2c_name();
        if cfg!(target_os = "windows") {
            assert_eq!(name, "aria2c.exe");
        } else if cfg!(target_os = "macos") {
            assert_eq!(name, "aria2c-macos");
        } else {
            assert_eq!(name, "aria2c-linux");
        }
    }

    #[test]
    fn bundled_binary_name_is_static_str() {
        let name: &'static str = bundled_aria2c_name();
        assert!(!name.is_empty());
    }
}
