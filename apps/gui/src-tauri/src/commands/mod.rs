// commands/mod.rs — Module registry for all Tauri commands.
// Split from the original monolithic commands.rs for maintainability.

pub mod aria2;
pub mod config;
pub mod fs;
pub mod intent;
pub mod search;

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Search result from torrent search engines
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub magnet: String,
    pub size: u64,
    pub seeders: u32,
    pub leechers: u32,
    pub source: String,
    pub quality: Option<String>,
}

/// Search proxy response
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total: usize,
    pub source: String,
}

/// Download intent extracted from natural language
#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadIntent {
    pub title: String,
    pub year: Option<u32>,
    pub quality: String,
    pub need_subtitle: bool,
    pub search_keywords: Vec<String>,
    pub resource_type: String,
    pub raw_input: String,
}

/// Build a shared HTTP client with timeout and User-Agent
pub(crate) fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Client build failed: {}", e))
}
