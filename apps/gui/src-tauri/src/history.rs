// history.rs — Download history persistence (JSON file based).
//
// Stores completed downloads in `history.json` inside the app data dir.
// Capped at 1000 entries to prevent unbounded growth.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Manager;

/// A single completed download record.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub file_path: String,
    pub file_size: u64,
    pub completed_at: String,
    pub resource_type: String,
}

/// Simple JSON-backed download history store.
pub struct DownloadHistory {
    db_path: PathBuf,
}

impl DownloadHistory {
    pub fn new(app_dir: &Path) -> Self {
        Self {
            db_path: app_dir.join("history.json"),
        }
    }

    /// Append a completed download to the history file.
    /// Keeps at most the last 1000 entries.
    #[allow(dead_code)]
    pub fn add(&self, entry: HistoryEntry) -> Result<(), String> {
        let mut history = self.load();
        history.push(entry);
        // Keep last 1000 entries
        if history.len() > 1000 {
            history = history[history.len() - 1000..].to_vec();
        }
        let json = serde_json::to_string_pretty(&history).map_err(|e| e.to_string())?;
        std::fs::write(&self.db_path, json).map_err(|e| e.to_string())
    }

    /// Load all history entries from disk.
    pub fn load(&self) -> Vec<HistoryEntry> {
        if !self.db_path.exists() {
            return Vec::new();
        }
        let data = std::fs::read_to_string(&self.db_path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    }

    /// Remove all entries (resets file to `[]`).
    pub fn clear(&self) -> Result<(), String> {
        std::fs::write(&self.db_path, "[]").map_err(|e| e.to_string())
    }
}

/// Load all download history entries from disk.
#[tauri::command]
pub async fn get_download_history(app: tauri::AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let history = DownloadHistory::new(&app_dir);
    Ok(history.load())
}

/// Delete all download history entries.
#[tauri::command]
pub async fn clear_download_history(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let history = DownloadHistory::new(&app_dir);
    history.clear()
}
