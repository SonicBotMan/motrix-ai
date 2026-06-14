// services/power.rs — System power management.
//
// Prevents the OS from going to sleep while downloads are active and
// restores normal sleep behaviour when downloads complete.
//
// Platform implementations:
//   * macOS  — `caffeinate`
//   * Linux  — `systemd-inhibit`
//   * Windows — `SetThreadExecutionState` (not yet wired)

use tauri::command;

/// Prevent the system from sleeping during downloads.
///
/// On macOS this spawns `caffeinate -i -w <pid>` which inhibits idle
/// sleep until the calling process exits. On other platforms the call is
/// a no-op that still reports success so callers don't need branching
/// logic.
#[command]
pub async fn prevent_sleep() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("caffeinate")
            .args(["-i", "-w", &std::process::id().to_string()])
            .spawn()
            .map_err(|e| format!("Failed to start caffeinate: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // systemd-inhibit --what=idle --mode=block -- <keep-alive>
        // For simplicity we spawn a short-lived inhibitor; a more robust
        // implementation would hold the inhibitor FD open.
        let _ = std::process::Command::new("systemd-inhibit")
            .args(["--what=idle", "--mode=block", "--", "sleep", "infinity"])
            .spawn();
    }

    #[cfg(target_os = "windows")]
    {
        // SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
        // Requires linking against kernel32; left as a TODO placeholder.
    }

    Ok("Sleep prevention enabled".to_string())
}

/// Re-allow the system to sleep.
///
/// On macOS this kills any lingering `caffeinate` processes. On other
/// platforms the call is currently a no-op.
#[command]
pub async fn allow_sleep() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("pkill")
            .args(["-f", "caffeinate"])
            .output();
    }

    Ok("Sleep prevention disabled".to_string())
}
