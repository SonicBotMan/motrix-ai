// services/tracker.rs — BitTorrent tracker list management.
//
// Fetches and serves the latest curated tracker list so users'
// BitTorrent downloads benefit from healthy peer discovery without
// manual configuration.

use serde::{Deserialize, Serialize};
use tauri::command;

/// Canonical source for the best-of tracker list.
const TRACKER_LIST_URL: &str =
    "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt";

/// A fetched tracker list with a UTC timestamp.
#[derive(Debug, Serialize, Deserialize)]
pub struct TrackerList {
    /// Tracker announce URLs, one per entry.
    pub trackers: Vec<String>,
    /// RFC 3339 timestamp of when the list was fetched.
    pub updated_at: String,
}

/// Fetch the latest best-of tracker list from the public GitHub mirror.
///
/// # Returns
/// A [`TrackerList`] containing every non-empty line from the remote
/// file and the current UTC timestamp.
///
/// # Errors
/// Returns a string description if the HTTP request or body read fails.
#[command]
pub async fn fetch_trackers() -> Result<TrackerList, String> {
    let response = reqwest::get(TRACKER_LIST_URL)
        .await
        .map_err(|e| format!("Failed to fetch trackers: {}", e))?;

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read tracker response: {}", e))?;

    let trackers: Vec<String> = text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(TrackerList {
        trackers,
        updated_at: chrono::Utc::now().to_rfc3339(),
    })
}
