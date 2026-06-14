// services/port_guard.rs — Port conflict detection and recovery.
//
// Checks if the aria2 RPC port is available and suggests alternatives.

use std::net::TcpListener;
use tauri::command;

/// Check if a port is available by attempting to bind to it.
pub fn is_port_available(port: u16) -> bool {
    TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok()
}

/// Find the first available port starting from `start_port`.
///
/// Scans up to 100 consecutive ports. Returns `None` if none are free.
pub fn find_available_port(start_port: u16) -> Option<u16> {
    (start_port..start_port.saturating_add(100)).find(|&port| is_port_available(port))
}

/// Check port availability and suggest alternative if occupied.
#[command]
pub async fn check_port(port: u16) -> Result<serde_json::Value, String> {
    let available = is_port_available(port);
    let alternative = if !available {
        find_available_port(port + 1)
    } else {
        None
    };

    Ok(serde_json::json!({
        "port": port,
        "available": available,
        "alternative": alternative,
    }))
}
