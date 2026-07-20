// commands/aria2.rs — Bundled aria2c process management.
// Start/stop/diagnose the aria2c daemon with RPC enabled.

use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::command;
use tauri::Emitter;
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

static ARIA2_INTENTIONAL_STOP: AtomicBool = AtomicBool::new(false);

/// Return the current session's aria2 RPC secret, generating one if needed.
pub fn get_aria2_secret() -> &'static str {
    ARIA2_SECRET.get_or_init(|| {
        let mut bytes = [0u8; 32];
        let _ = getrandom::getrandom(&mut bytes);
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

    cleanup_port(port);

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

    for key in &[
        "http_proxy",
        "https_proxy",
        "ftp_proxy",
        "all_proxy",
        "no_proxy",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "FTP_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
    ] {
        cmd.env(key, "");
    }

    let conf_path = resource_path
        .join("resources")
        .join("bin")
        .join("aria2.conf");
    let conf_str = dunce::simplified(&conf_path).to_string_lossy().to_string();
    if conf_path.exists() {
        cmd.arg(format!("--conf-path={}", conf_str));
    } else {
        cmd.args([
            "--enable-rpc=true",
            "--rpc-allow-origin-all=true",
            "--rpc-listen-all=false",
            "--check-certificate=false",
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
            "--connect-timeout=10",
            "--timeout=10",
            "--async-dns=false",
            "--http-accept-gzip=true",
            "--disk-cache=64M",
            "--max-tries=0",
            "--retry-wait=10",
        ]);
    }

    cmd.args([
        &format!("--rpc-listen-port={}", port),
        &format!("--rpc-secret={}", secret),
        "--daemon=false",
        &format!(
            "--dir={}",
            dunce::simplified(&download_dir).to_string_lossy()
        ),
    ]);

    let session_str = dunce::simplified(&session_file)
        .to_string_lossy()
        .to_string();
    cmd.arg(format!("--save-session={}", session_str));
    if session_file.exists() {
        let metadata = std::fs::metadata(&session_file);
        if let Ok(m) = metadata {
            if m.len() > 0 {
                cmd.arg(format!("--input-file={}", session_str));
            }
        }
    }

    cmd.arg("--auto-save-interval=30");

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

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    ARIA2_INTENTIONAL_STOP.store(false, Ordering::SeqCst);

    let mut child = match cmd.spawn() {
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

        let app_handle = app.clone();
        std::thread::spawn(move || {
            let _ = child.wait();
            let was_intentional = ARIA2_INTENTIONAL_STOP.swap(false, Ordering::SeqCst);
            if let Ok(mut gc) = ARIA2_CHILD.lock() {
                if *gc == Some(pid) {
                    *gc = None;
                }
            }
            ARIA2_STARTING.store(false, Ordering::SeqCst);
            if !was_intentional {
                log::warn!("aria2c process exited unexpectedly (PID {})", pid);
                let _ = app_handle.emit("aria2-crashed", serde_json::json!({ "pid": pid }));
            } else {
                log::info!("aria2c stopped intentionally (PID {})", pid);
            }
        });

        Ok(rpc_url)
    } else {
        {
            let mut global_child = ARIA2_CHILD
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            if let Some(p) = *global_child {
                let _ = kill_process_by_pid(p);
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
    ARIA2_INTENTIONAL_STOP.store(true, Ordering::SeqCst);
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
            log::warn!("aria2c did not exit gracefully after 5s, force killing");
            let _ = kill_process_by_pid(p);
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

#[command]
pub async fn get_aria2_log() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let log_path = home.join(".motrix-ai").join("aria2.log");
    tokio::task::spawn_blocking(move || {
        if !log_path.exists() {
            return Ok("No aria2.log file found".to_string());
        }
        let content =
            std::fs::read_to_string(&log_path).map_err(|e| format!("Failed to read log: {}", e))?;
        let lines: Vec<&str> = content.lines().collect();
        let start = if lines.len() > 50 {
            lines.len() - 50
        } else {
            0
        };
        Ok(lines[start..].join("\n"))
    })
    .await
    .map_err(|e| format!("Log join error: {}", e))?
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
        "motrix-ai-engine.exe"
    } else if cfg!(target_os = "macos") {
        "motrix-ai-engine-macos"
    } else {
        "motrix-ai-engine-linux"
    }
}

fn is_supported_engine_process(comm: &str) -> bool {
    comm.contains("motrix-ai-engine")
}

pub fn cleanup_port(port: u16) {
    #[cfg(unix)]
    {
        let port_str = port.to_string();
        let output = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port_str)])
            .stderr(std::process::Stdio::null())
            .output();

        if let Ok(out) = output {
            let pids = String::from_utf8_lossy(&out.stdout);
            let mut killed_any = false;
            for pid in pids.lines() {
                let pid = pid.trim();
                if pid.is_empty() {
                    continue;
                }
                let args_output = std::process::Command::new("ps")
                    .args(["-p", pid, "-o", "args="])
                    .stderr(std::process::Stdio::null())
                    .output();
                if let Ok(ao) = args_output {
                    let identity = String::from_utf8_lossy(&ao.stdout).trim().to_string();
                    if is_supported_engine_process(&identity) {
                        let _ = std::process::Command::new("kill")
                            .args(["-9", pid])
                            .stderr(std::process::Stdio::null())
                            .status();
                        killed_any = true;
                    }
                }
            }
            if killed_any {
                std::thread::sleep(std::time::Duration::from_millis(300));
            }
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as WinCommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = std::process::Command::new("cmd")
            .args(["/C", &format!("netstat -ano | findstr :{}", port)])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut killed_any = false;
            for line in text.lines() {
                if let Some(pid) = line.split_whitespace().last() {
                    if pid.parse::<u32>().is_ok() {
                        let check = std::process::Command::new("cmd")
                            .args([
                                "/C",
                                &format!("tasklist /FI \"PID eq {}\" /NH /FO CSV 2>NUL", pid),
                            ])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output();
                        let is_supported = check
                            .map(|o| {
                                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                                is_supported_engine_process(&s)
                            })
                            .unwrap_or(false);
                        if is_supported {
                            let _ = std::process::Command::new("taskkill")
                                .args(["/F", "/PID", pid])
                                .creation_flags(CREATE_NO_WINDOW)
                                .status();
                            killed_any = true;
                        }
                    }
                }
            }
            if killed_any {
                std::thread::sleep(std::time::Duration::from_millis(300));
            }
        }
    }
}

fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("taskkill failed for PID {pid}: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("taskkill failed for PID {pid}: {status}"))
        }
    }
    #[cfg(not(windows))]
    {
        let status = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status()
            .map_err(|e| format!("kill failed for PID {pid}: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("kill failed for PID {pid}: {status}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_binary_name_matches_target_os() {
        let name = bundled_aria2c_name();
        if cfg!(target_os = "windows") {
            assert_eq!(name, "motrix-ai-engine.exe");
        } else if cfg!(target_os = "macos") {
            assert_eq!(name, "motrix-ai-engine-macos");
        } else {
            assert_eq!(name, "motrix-ai-engine-linux");
        }
    }

    #[test]
    fn bundled_binary_name_is_static_str() {
        let name: &'static str = bundled_aria2c_name();
        assert!(!name.is_empty());
    }

    #[test]
    fn is_supported_engine_process_matches_our_binary() {
        assert!(is_supported_engine_process("motrix-ai-engine"));
        assert!(is_supported_engine_process("motrix-ai-engine.exe"));
        assert!(is_supported_engine_process(
            "/usr/bin/motrix-ai-engine-linux --conf-path=..."
        ));
        assert!(!is_supported_engine_process("aria2c"));
        assert!(!is_supported_engine_process("nginx"));
        assert!(!is_supported_engine_process(""));
    }

    // ── Integration tests ──────────────────────────────────────────────

    use std::path::PathBuf;

    fn find_bundled_binary() -> Option<PathBuf> {
        let name = bundled_aria2c_name();
        let candidates = [
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources/bin")
                .join(name),
            PathBuf::from("resources/bin").join(name),
        ];
        candidates.into_iter().find(|p| p.exists())
    }

    fn find_conf_file() -> Option<PathBuf> {
        let candidates = [
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/bin/aria2.conf"),
            PathBuf::from("resources/bin/aria2.conf"),
        ];
        candidates.into_iter().find(|p| p.exists())
    }

    fn wait_for_rpc(port: u16, secret: &str, timeout_ms: u64) -> bool {
        let url = format!("http://127.0.0.1:{}/jsonrpc", port);
        let body = format!(
            r#"{{"jsonrpc":"2.0","id":"health","method":"aria2.getVersion","params":["token:{}"]}}"#,
            secret
        );
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
        while std::time::Instant::now() < deadline {
            if let Ok(resp) = reqwest::blocking::Client::new()
                .post(&url)
                .header("Content-Type", "application/json")
                .body(body.clone())
                .timeout(std::time::Duration::from_secs(2))
                .send()
            {
                if resp.status().is_success() {
                    return true;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        false
    }

    fn rpc_call(
        port: u16,
        secret: &str,
        method: &str,
        params: serde_json::Value,
    ) -> serde_json::Value {
        let url = format!("http://127.0.0.1:{}/jsonrpc", port);
        let full_params = if params.is_array() {
            let mut arr = serde_json::json!([format!("token:{}", secret)]);
            if let Some(p) = params.as_array() {
                arr.as_array_mut().unwrap().extend(p.iter().cloned());
            }
            arr
        } else {
            serde_json::json!([format!("token:{}", secret), params])
        };
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "test",
            "method": method,
            "params": full_params
        });
        let resp = reqwest::blocking::Client::new()
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .unwrap_or_else(|e| panic!("RPC {} failed: {}", method, e));
        let result: serde_json::Value = resp.json().unwrap();
        assert!(
            result.get("error").is_none(),
            "RPC {} returned error: {:?}",
            method,
            result.get("error")
        );
        result["result"].clone()
    }

    struct Aria2Instance {
        child: std::process::Child,
        port: u16,
        secret: String,
        dir: tempfile::TempDir,
    }

    impl Aria2Instance {
        fn start() -> Option<Self> {
            let binary = find_bundled_binary()?;
            let conf = find_conf_file();
            let dir = tempfile::tempdir().unwrap();
            let port: u16 = 16800;
            let secret = "testsecret_integration".to_string();

            cleanup_port(port);

            let mut cmd = std::process::Command::new(&binary);
            cmd.stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());

            if let Some(ref conf_path) = conf {
                cmd.arg(format!(
                    "--conf-path={}",
                    dunce::simplified(conf_path).display()
                ));
            } else {
                cmd.args([
                    "--enable-rpc=true",
                    "--rpc-allow-origin-all=true",
                    "--rpc-listen-all=false",
                    "--check-certificate=false",
                ]);
            }

            cmd.args([
                format!("--rpc-listen-port={}", port),
                format!("--rpc-secret={}", secret),
                "--daemon=false".to_string(),
                format!("--dir={}", dir.path().display()),
            ]);

            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                cmd.process_group(0);
            }

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            let mut child = cmd.spawn().ok()?;

            if !wait_for_rpc(port, &secret, 10_000) {
                let _ = child.kill();
                return None;
            }

            Some(Self {
                child,
                port,
                secret,
                dir,
            })
        }

        fn rpc(&self, method: &str, params: serde_json::Value) -> serde_json::Value {
            rpc_call(self.port, &self.secret, method, params)
        }
    }

    impl Drop for Aria2Instance {
        fn drop(&mut self) {
            let _ = self.rpc("aria2.shutdown", serde_json::json!([]));
            std::thread::sleep(std::time::Duration::from_millis(500));
            let _ = self.child.kill();
            cleanup_port(self.port);
        }
    }

    #[test]
    fn integration_engine_full_lifecycle() {
        let aria2 = match Aria2Instance::start() {
            Some(a) => a,
            None => {
                eprintln!("SKIP: bundled binary not found");
                return;
            }
        };

        let version = aria2.rpc("aria2.getVersion", serde_json::json!([]));
        assert!(version["version"].is_string());
        eprintln!("aria2c version: {}", version["version"].as_str().unwrap());

        let stat = aria2.rpc("aria2.getGlobalStat", serde_json::json!([]));
        assert!(stat["downloadSpeed"].is_string());
        assert!(stat["numActive"].is_string());

        let url = "https://raw.githubusercontent.com/SonicBotMan/motrix-ai/main/LICENSE";
        let gid = aria2.rpc("aria2.addUri", serde_json::json!([[url]]));
        assert!(gid.is_string());
        let gid_str = gid.as_str().unwrap();

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        let mut final_status = "error".to_string();
        while std::time::Instant::now() < deadline {
            let status = aria2.rpc(
                "aria2.tellStatus",
                serde_json::json!([gid_str, ["status", "totalLength", "completedLength"]]),
            );
            final_status = status["status"].as_str().unwrap_or("error").to_string();
            if final_status == "complete" || final_status == "error" {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        assert_eq!(final_status, "complete", "download did not complete in 30s");
        eprintln!("download {} completed", url);
    }
}
