use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::Duration;
use tauri::command;

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

/// Build a shared HTTP client with timeout and User-Agent (Bug 2 & 10)
fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Client build failed: {}", e))
}

// Pre-compiled regexes for Btdig parsing (Bug 6)
static BTDIG_MAGNET_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"class="torrent_magnet"[^>]*>\s*<a[^>]*href="(magnet:[^"]+)""#).unwrap()
});
static BTDIG_TITLE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"class="torrent_name"[^>]*>([^<]+)"#).unwrap());
static BTDIG_SIZE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"class="torrent_size"[^>]*>([^<]+)"#).unwrap());
static BTDIG_SEEDER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(\d+)\s*seeds?"#).unwrap());
static BTDIG_LEECHER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(\d+)\s*leech?"#).unwrap());

// Pre-compiled regexes for Mikan parsing (Bug 6)
static MIKAN_ITEM_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<item>([\s\S]*?)</item>"#).unwrap());
static MIKAN_TITLE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<title>([^<]+)</title>"#).unwrap());
static MIKAN_ENCLOSURE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<enclosure[^>]*url="([^"]+)"[^>]*length="(\d+)""#).unwrap()
});
static MIKAN_MAGNET_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(magnet:\?[\\<\s"]+)"#).unwrap());

// Pre-compiled regexes for 1337x parsing (Bug 6)
static X1337_ROW_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<tr>([\s\S]*?)</tr>"#).unwrap());
static X1337_TITLE_LINK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<a[^>]*href="(/torrent/[^"]+)"[^>]*>(.*?)</a>"#).unwrap()
});
static X1337_SEEDER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<td[^>]*class="seeds?"[^>]*>(\d+)</td>"#).unwrap());
static X1337_LEECHER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<td[^>]*class="leeches?"[^>]*>(\d+)</td>"#).unwrap());
static X1337_SIZE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<td[^>]*class="size"[^>]*>([\s\S]*?)</td>"#).unwrap());

// Pre-compiled regexes for Nyaa parsing (Bug 6)
static NYAA_ROW_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<tr[^>]*class="(?:default|success|danger)"[^>]*>([\s\S]*?)</tr>"#).unwrap()
});
static NYAA_TITLE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<a[^>]*href="(/view/[^"]+)"[^>]*title="([^"]*)"[^>]*>"#).unwrap()
});
static NYAA_TITLE_FALLBACK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<a[^>]*href="(/view/[^"]+)"[^>]*>([\s\S]*?)</a>"#).unwrap()
});
static NYAA_MAGNET_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<a[^>]*href="(magnet:\?[^"]+)"[^>]*>"#).unwrap());
static NYAA_SIZE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<td[^>]*class="text-center"[^>]*>([\d.]+\s*[KMGT]?i?B)</td>"#).unwrap()
});
static NYAA_NUM_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<td[^>]*class="text-center"[^>]*>(\d+)</td>"#).unwrap());

// Pre-compiled regexes for TorrentGalaxy parsing (Bug 6)
static TG_ROW_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<div[^>]*class="tgxtable[^"]*"[^>]*>([\s\S]*?)</div>\s*</div>"#).unwrap()
});
static TG_TITLE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<a[^>]*href="(/torrent/[^"]+)"[^>]*>([\s\S]*?)</a>"#).unwrap());
static TG_MAGNET_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<a[^>]*href="(magnet:\?[^"]+)"[^>]*>"#).unwrap());
static TG_SIZE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"Size:\s*([\d.]+\s*[KMGT]?i?B)"#).unwrap());
static TG_SEEDER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(?:Seeders?|S(?:hd)?):\s*(\d+)"#).unwrap());
static TG_LEECHER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(?:Leechers?|L(?:hd)?):\s*(\d+)"#).unwrap());

// Pre-compiled regex for stripping HTML tags (Bug 6)
static STRIP_TAGS_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"<[^>]*>").unwrap());

// Pre-compiled regex for parse_size (Bug 6)
static PARSE_SIZE_UNIT_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^([\d.]+)\s*([KMGT]?I?B|BYTES?)$").unwrap());

/// Proxy search request to avoid CORS issues
#[command]
pub async fn search_proxy(
    query: String,
    source: String,
    page: Option<u32>,
) -> Result<SearchResponse, String> {
    let client = build_http_client()?; // Bug 2 & 10: shared client with timeout + UA
    let page = page.unwrap_or(0);

    let url = match source.as_str() {
        "btdig" => format!(
            "https://btdig.com/search?q={}&p={}",
            urlencoding::encode(&query),
            page
        ),
        "mikan" => format!(
            "https://mikanani.me/RSS/Search?searchstr={}",
            urlencoding::encode(&query)
        ),
        "1337x" => format!(
            "https://1337x.to/search/{}/{}/",
            urlencoding::encode(&query),
            page + 1
        ),
        "nyaa" => format!(
            "https://nyaa.si/?f=0&c=0_0&q={}&s=seeders&o=desc",
            urlencoding::encode(&query)
        ),
        "torrentgalaxy" => format!(
            "https://torrentgalaxy.to/torrents.php?search={}&sort=seeders&order=desc",
            urlencoding::encode(&query)
        ),
        _ => return Err(format!("Unknown source: {}", source)),
    };

    let response = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.5")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let html = response.text().await.map_err(|e| format!("Read failed: {}", e))?;

    let results = match source.as_str() {
        "btdig" => parse_btdig_results(&html),
        "mikan" => parse_mikan_results(&html),
        "1337x" => parse_1337x_results(&html),
        "nyaa" => parse_nyaa_results(&html),
        "torrentgalaxy" => parse_torrentgalaxy_results(&html),
        _ => Vec::new(),
    };

    let total = results.len();
    Ok(SearchResponse {
        results,
        total,
        source,
    })
}

/// Parse Btdig HTML results
fn parse_btdig_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();
    let blocks: Vec<&str> = html.split("class=\"one_result\"").collect();

    for block in blocks.iter().skip(1) {
        // Extract magnet link
        let magnet = if let Some(caps) = BTDIG_MAGNET_RE.captures(block) {
            caps[1].to_string()
        } else {
            continue;
        };

        // Extract title
        let title = if let Some(caps) = BTDIG_TITLE_RE.captures(block) {
            caps[1].trim().to_string()
        } else {
            "Unknown".to_string()
        };

        // Extract size
        let size = if let Some(caps) = BTDIG_SIZE_RE.captures(block) {
            parse_size(caps[1].trim())
        } else {
            0
        };

        // Extract seeders/leechers
        let seeders = if let Some(caps) = BTDIG_SEEDER_RE.captures(block) {
            caps[1].parse().unwrap_or(0)
        } else {
            0
        };

        let leechers = if let Some(caps) = BTDIG_LEECHER_RE.captures(block) {
            caps[1].parse().unwrap_or(0)
        } else {
            0
        };

        let quality = detect_quality(&title);

        results.push(SearchResult {
            title,
            magnet,
            size,
            seeders,
            leechers,
            source: "btdig".to_string(),
            quality,
        });
    }

    results
}

/// Parse Mikan RSS results
fn parse_mikan_results(xml: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    for item_caps in MIKAN_ITEM_RE.captures_iter(xml) {
        let item = &item_caps[1];

        let title = if let Some(caps) = MIKAN_TITLE_RE.captures(item) {
            caps[1].trim().to_string()
        } else {
            continue;
        };

        // Try to find magnet in enclosure or description
        let magnet = if let Some(caps) = MIKAN_ENCLOSURE_RE.captures(item) {
            let url = &caps[1];
            if url.starts_with("magnet:") {
                url.to_string()
            } else {
                // Look for magnet in the item content
                if let Some(mag_caps) = MIKAN_MAGNET_RE.captures(item) {
                    mag_caps[1].to_string()
                } else {
                    continue;
                }
            }
        } else if let Some(caps) = MIKAN_MAGNET_RE.captures(item) {
            caps[1].to_string()
        } else {
            continue;
        };

        let size = if let Some(caps) = MIKAN_ENCLOSURE_RE.captures(item) {
            caps[2].parse().unwrap_or(0)
        } else {
            0
        };

        let quality = detect_quality(&title);

        results.push(SearchResult {
            title,
            magnet,
            size,
            seeders: 0,
            leechers: 0,
            source: "mikan".to_string(),
            quality,
        });
    }

    results
}

/// Parse 1337x HTML search results
/// 1337x search results page lists torrents with links to detail pages.
/// Magnet links are only on detail pages, so we extract detail page URLs
/// and construct placeholder magnet info. The frontend can fetch detail
/// pages on-demand if needed.
///
/// Known limitation (Bug 7): 1337x does not expose magnet links on its
/// search results page — only on individual torrent detail pages. The
/// `magnet` field therefore contains the detail-page URL (e.g.
/// `https://1337x.to/torrent/...`) rather than a real magnet URI.
/// Resolving magnets would require an extra HTTP round-trip per result.
fn parse_1337x_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    for row_caps in X1337_ROW_RE.captures_iter(html) {
        let row = &row_caps[1];

        // Must contain a /torrent/ link
        let link_caps = match X1337_TITLE_LINK_RE.captures(row) {
            Some(c) => c,
            None => continue,
        };

        let detail_path = &link_caps[1];
        // Strip any HTML tags from the title text
        let raw_title = &link_caps[2];
        let title = STRIP_TAGS_RE
            .replace_all(raw_title, "")
            .trim()
            .to_string();

        if title.is_empty() {
            continue;
        }

        let seeders = X1337_SEEDER_RE
            .captures(row)
            .and_then(|c| c[1].parse::<u32>().ok())
            .unwrap_or(0);

        let leechers = X1337_LEECHER_RE
            .captures(row)
            .and_then(|c| c[1].parse::<u32>().ok())
            .unwrap_or(0);

        let size = X1337_SIZE_RE
            .captures(row)
            .map(|c| {
                let size_text = STRIP_TAGS_RE
                    .replace_all(&c[1], "")
                    .trim()
                    .to_string();
                parse_size(&size_text)
            })
            .unwrap_or(0);

        let quality = detect_quality(&title);

        // Store detail URL as magnet placeholder — frontend can resolve via fetch_detail_page
        let magnet = format!("https://1337x.to{}", detail_path);

        results.push(SearchResult {
            title,
            magnet,
            size,
            seeders,
            leechers,
            source: "1337x".to_string(),
            quality,
        });
    }

    results
}

/// Parse Nyaa.si HTML search results
/// Nyaa.si has magnet links directly on the search results page.
fn parse_nyaa_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    for row_caps in NYAA_ROW_RE.captures_iter(html) {
        let row = &row_caps[1];

        // Try to find magnet link
        let magnet = match NYAA_MAGNET_RE.captures(row) {
            Some(c) => c[1].to_string(),
            None => continue,
        };

        // Try to find title (prefer title= attribute, fall back to link text)
        let title = if let Some(caps) = NYAA_TITLE_RE.captures(row) {
            caps[2].trim().to_string()
        } else if let Some(caps) = NYAA_TITLE_FALLBACK_RE.captures(row) {
            STRIP_TAGS_RE
                .replace_all(&caps[2], "")
                .trim()
                .to_string()
        } else {
            "Unknown".to_string()
        };

        if title == "Unknown" {
            continue;
        }

        // Extract size
        let size = NYAA_SIZE_RE
            .captures(row)
            .map(|c| parse_size(c[1].trim()))
            .unwrap_or(0);

        // Extract seeders and leechers — nyaa has multiple text-center cells
        // Bug 5 fix: take the LAST two numbers (seeders=second-to-last, leechers=last)
        let nums: Vec<u32> = NYAA_NUM_RE
            .captures_iter(row)
            .filter_map(|c| c[1].parse::<u32>().ok())
            .collect();

        let seeders = nums.iter().rev().nth(1).copied().unwrap_or(0);
        let leechers = nums.last().copied().unwrap_or(0);

        let quality = detect_quality(&title);

        results.push(SearchResult {
            title,
            magnet,
            size,
            seeders,
            leechers,
            source: "nyaa".to_string(),
            quality,
        });
    }

    results
}

/// Parse TorrentGalaxy HTML search results
fn parse_torrentgalaxy_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    for row_caps in TG_ROW_RE.captures_iter(html) {
        let row = &row_caps[1];

        // Extract title link
        let title_caps = match TG_TITLE_RE.captures(row) {
            Some(c) => c,
            None => continue,
        };

        let raw_title = &title_caps[2];
        let title = STRIP_TAGS_RE
            .replace_all(raw_title, "")
            .trim()
            .to_string();

        if title.is_empty() {
            continue;
        }

        // Extract magnet link
        let magnet = match TG_MAGNET_RE.captures(row) {
            Some(c) => c[1].to_string(),
            // If no magnet directly, store detail page URL
            None => format!("https://torrentgalaxy.to{}", &title_caps[1]),
        };

        let size = TG_SIZE_RE
            .captures(row)
            .map(|c| parse_size(c[1].trim()))
            .unwrap_or(0);

        let seeders = TG_SEEDER_RE
            .captures(row)
            .and_then(|c| c[1].parse::<u32>().ok())
            .unwrap_or(0);

        let leechers = TG_LEECHER_RE
            .captures(row)
            .and_then(|c| c[1].parse::<u32>().ok())
            .unwrap_or(0);

        let quality = detect_quality(&title);

        results.push(SearchResult {
            title,
            magnet,
            size,
            seeders,
            leechers,
            source: "torrentgalaxy".to_string(),
            quality,
        });
    }

    results
}

/// Parse human-readable size to bytes
fn parse_size(s: &str) -> u64 {
    let s = s.trim().to_uppercase();
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() < 2 {
        // Try splitting on boundary between digits and letters (e.g., "1.5GB")
        if let Some(caps) = PARSE_SIZE_UNIT_RE.captures(&s) {
            let num: f64 = caps[1].parse().unwrap_or(0.0);
            let unit = caps[2].to_uppercase();
            return match unit.as_str() {
                "TB" | "TIB" => (num * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64,
                "GB" | "GIB" => (num * 1024.0 * 1024.0 * 1024.0) as u64,
                "MB" | "MIB" => (num * 1024.0 * 1024.0) as u64,
                "KB" | "KIB" => (num * 1024.0) as u64,
                _ => num as u64,
            };
        }
        return 0;
    }

    let num: f64 = parts[0].parse().unwrap_or(0.0);
    let unit = parts[1];

    match unit {
        "TB" | "TIB" => (num * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64,
        "GB" | "GIB" => (num * 1024.0 * 1024.0 * 1024.0) as u64,
        "MB" | "MIB" => (num * 1024.0 * 1024.0) as u64,
        "KB" | "KIB" => (num * 1024.0) as u64,
        "B" | "BYTES" => num as u64,
        _ => 0,
    }
}

/// Detect quality from title
fn detect_quality(title: &str) -> Option<String> {
    let upper = title.to_uppercase();
    if upper.contains("2160P") || upper.contains("4K") || upper.contains("UHD") {
        Some("4K".to_string())
    } else if upper.contains("1080P") || upper.contains("FHD") {
        Some("1080p".to_string())
    } else if upper.contains("720P") || upper.contains("HD") {
        Some("720p".to_string())
    } else {
        None
    }
}

/// Save file to disk (Bug 3: wrap blocking I/O in spawn_blocking)
#[command]
pub async fn save_file(path: String, content: Vec<u8>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&path);

        // Create parent directories if they don't exist
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
        }

        std::fs::write(&path, content).map_err(|e| format!("Write failed: {}", e))?;

        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Download subtitle from URL (Bug 3: wrap blocking I/O; Bug 10: shared client)
#[command]
pub async fn download_subtitle(url: String, save_path: String) -> Result<String, String> {
    let client = build_http_client()?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let content = response.bytes().await.map_err(|e| format!("Read failed: {}", e))?;

    let path = save_path.clone();
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
        }

        std::fs::write(&path, &content).map_err(|e| format!("Write failed: {}", e))?;

        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Search OpenSubtitles API for subtitles (Bug 9: remove unnecessary clone; Bug 10: shared client)
#[command]
pub async fn opensubtitles_search(
    api_key: String,
    query: String,
    languages: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = build_http_client()?;

    let mut params = vec![("query", query)]; // Bug 9: use query directly, no clone
    if let Some(ref langs) = languages {
        params.push(("languages", langs.clone()));
    }

    let response = client
        .get("https://api.opensubtitles.com/api/v1/subtitles")
        .header("Api-Key", &api_key)
        .header("Content-Type", "application/json")
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("OpenSubtitles request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenSubtitles API error ({}): {}", status, body));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenSubtitles response: {}", e))?;

    Ok(json)
}

/// Download a subtitle from OpenSubtitles and save it to disk (Bug 10: shared client)
#[command]
pub async fn opensubtitles_download(
    api_key: String,
    subtitle_id: String,
    file_name: String,
) -> Result<String, String> {
    let client = build_http_client()?;

    // Step 1: Request the download link
    let body = serde_json::json!({
        "file_name": file_name,
        "subtitle_id": subtitle_id,
    });

    let response = client
        .post("https://api.opensubtitles.com/api/v1/download")
        .header("Api-Key", &api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenSubtitles download request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenSubtitles download API error ({}): {}", status, body));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse download response: {}", e))?;

    let download_url = json["link"]
        .as_str()
        .ok_or("No download link in response")?;

    // Step 2: Download the actual subtitle file
    let subtitle_response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Subtitle file download failed: {}", e))?;

    let content = subtitle_response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read subtitle content: {}", e))?;

    // Return base64-encoded content so the frontend can save it
    use std::io::Write;
    let mut buf = Vec::new();
    {
        let mut encoder = base64::write::EncoderWriter::new(&mut buf, &base64::engine::general_purpose::STANDARD);
        encoder.write_all(&content).map_err(|e| format!("Base64 encode failed: {}", e))?;
    }

    // Return the base64 content + original file_name so frontend can handle saving
    let result = serde_json::json!({
        "file_name": file_name,
        "content_base64": String::from_utf8(buf).map_err(|e| format!("UTF-8 conversion failed: {}", e))?,
    });

    Ok(result.to_string())
}

/// Get default download path (Bug 3: wrap blocking I/O in spawn_blocking)
#[command]
pub async fn get_download_path() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let home = dirs::home_dir().ok_or("Cannot find home directory")?;
        let download_dir = home.join("Downloads").join("Motrix AI");

        // Create directory if it doesn't exist
        std::fs::create_dir_all(&download_dir)
            .map_err(|e| format!("Create dir failed: {}", e))?;

        Ok(download_dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ---- Bundled aria2c process management ----

use std::sync::Mutex;
use tauri::Manager;

static ARIA2_CHILD: Mutex<Option<u32>> = Mutex::new(None); // Store PID only

/// Start the bundled aria2c daemon with RPC enabled.
#[command]
pub async fn start_aria2(app: tauri::AppHandle, rpc_port: Option<u16>) -> Result<String, String> {
    let port = rpc_port.unwrap_or(6800);
    let rpc_url = format!("http://127.0.0.1:{}/jsonrpc", port);

    // Check if already running (release lock before any await!)
    let already_running = {
        let child = ARIA2_CHILD.lock().map_err(|e| format!("Lock error: {}", e))?;
        child.is_some()
    };
    if already_running {
        // Try connecting (no lock held)
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
        return Err(format!("Bundled aria2c not found at: {}", aria2c_path.display()));
    }

    // Get download directory
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let download_dir = home.join("Downloads").join("Motrix AI");
    std::fs::create_dir_all(&download_dir).map_err(|e| format!("Create download dir failed: {}", e))?;

    // Session file
    let session_dir = home.join(".motrix-ai");
    std::fs::create_dir_all(&session_dir).map_err(|e| format!("Create session dir failed: {}", e))?;
    let session_file = session_dir.join("aria2.session");
    // Ensure session file exists — aria2c aborts if --input-file points to a missing file
    if !session_file.exists() {
        std::fs::write(&session_file, "").map_err(|e| format!("Create session file failed: {}", e))?;
    }

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
        .stderr(std::process::Stdio::from({
            let log_file = std::fs::File::create(session_dir.join("aria2.log"))
                .unwrap_or_else(|_| panic!("cannot create aria2.log"));
            log_file
        })); // redirect stderr to log file for diagnostics

    // Detach from parent so process survives when Child handle is dropped
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let child = cmd.spawn()
        .map_err(|e| format!("Failed to start aria2c: {}", e))?;

    let pid = child.id();
    {
        let mut global_child = ARIA2_CHILD.lock().map_err(|e| format!("Lock error: {}", e))?;
        *global_child = Some(pid);
    }
    // child is dropped here but the process keeps running (it's detached)

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
            // Clean up
            let mut global_child = ARIA2_CHILD.lock().map_err(|e| format!("Lock error: {}", e))?;
            if let Some(p) = *global_child {
                let _ = std::process::Command::new("kill")
                    .args(["-9", &p.to_string()])
                    .output();
            }
            *global_child = None;
            // Read aria2 stderr log for diagnostics
            let log_path = session_dir.join("aria2.log");
            let log_tail = std::fs::read_to_string(&log_path)
                .unwrap_or_default()
                .lines()
                .last()
                .unwrap_or("")
                .to_string();
            Err(format!("aria2c started but RPC verification failed: {}", log_tail))
        }
    }
}

/// Stop the bundled aria2c daemon.
#[command]
pub async fn stop_aria2() -> Result<String, String> {
    let pid = {
        let mut child = ARIA2_CHILD.lock().map_err(|e| format!("Lock error: {}", e))?;
        let pid = *child;
        *child = None;
        pid
    };

    if let Some(p) = pid {
        // Try graceful shutdown via RPC
        let client = reqwest::Client::new();
        let _ = client
            .post("http://127.0.0.1:6800/jsonrpc")
            .header("Content-Type", "application/json")
            .body(r#"{"jsonrpc":"2.0","id":"shutdown","method":"aria2.shutdown"}"#)
            .timeout(Duration::from_secs(2))
            .send()
            .await;

        tokio::time::sleep(Duration::from_millis(500)).await;

        // Force kill via system command
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
    let exists = aria2c_path.exists();
    let metadata = if exists {
        std::fs::metadata(&aria2c_path).ok()
    } else {
        None
    };
    let executable = metadata.as_ref().map(|m| m.permissions().readonly() == false).unwrap_or(false);
    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

    Ok(serde_json::json!({
        "resource_dir": resource_path.to_string_lossy(),
        "binary_path": aria2c_path.to_string_lossy(),
        "exists": exists,
        "executable": executable,
        "size": size,
    }))
}

// =====================================================
// NL Intent Parsing (PRD §6.1)
// =====================================================

/// Download intent extracted from natural language
#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadIntent {
    pub title: String,
    pub year: Option<u32>,
    pub quality: String, // "4K" | "1080p" | "720p" | "other"
    pub need_subtitle: bool,
    pub search_keywords: Vec<String>,
    pub resource_type: String, // "movie" | "tv" | "software" | "music" | "anime" | "other"
    pub raw_input: String,
}

/// Parse natural language download request into structured intent.
/// Uses heuristic parsing (no external API required for zero-config).
/// If llm_config is provided, tries LLM first for better accuracy.
#[command]
pub async fn parse_nl_intent(input: String, llm_config: Option<serde_json::Value>) -> Result<DownloadIntent, String> {
    let raw = input.clone();

    // Try LLM if configured
    if let Some(cfg) = &llm_config {
        if let Ok(intent) = parse_with_llm(&input, cfg).await {
            let mut intent = intent;
            intent.raw_input = raw;
            return Ok(intent);
        }
        // Fall through to heuristic
    }

    // Heuristic parsing (zero-config fallback)
    Ok(parse_heuristic(&input))
}

/// Heuristic NL parser — handles Chinese/English, quality, year, resource type
fn parse_heuristic(input: &str) -> DownloadIntent {
    let lower = input.to_lowercase();

    // --- Extract quality ---
    let quality = if lower.contains("4k") || lower.contains("2160p") || lower.contains("蓝光") || lower.contains("uhd") || lower.contains("蓝光原盘") {
        "4K".to_string()
    } else if lower.contains("1080p") || lower.contains("fhd") || lower.contains("全高清") {
        "1080p".to_string()
    } else if lower.contains("720p") || lower.contains("hd") || lower.contains("高清") {
        "720p".to_string()
    } else {
        "other".to_string()
    };

    // --- Extract year ---
    // Try to find a 4-digit year (19xx or 20xx)
    let mut extracted_year: Option<u32> = None;
    let chars: Vec<char> = input.chars().collect();
    for i in 0..chars.len().saturating_sub(3) {
        if chars[i].is_ascii_digit()
            && chars[i + 1].is_ascii_digit()
            && chars[i + 2].is_ascii_digit()
            && chars[i + 3].is_ascii_digit()
        {
            let yr: String = chars[i..i + 4].iter().collect();
            if let Ok(y) = yr.parse::<u32>() {
                if (1930..=2030).contains(&y) {
                    extracted_year = Some(y);
                    break;
                }
            }
        }
    }

    // --- Detect subtitle request ---
    let need_subtitle = lower.contains("字幕")
        || lower.contains("subtitle")
        || lower.contains("cc")
        || lower.contains("srt")
        || lower.contains("中字")
        || lower.contains("双语");

    // --- Detect resource type ---
    let resource_type = if lower.contains("电视剧")
        || lower.contains("剧集")
        || lower.contains("tv")
        || lower.contains("season")
        || lower.contains("第") && lower.contains("季")
        || lower.contains("ep")
        || (lower.contains("s") && lower.contains("e") && lower.len() > 6)
    {
        "tv".to_string()
    } else if lower.contains("软件")
        || lower.contains("software")
        || lower.contains("app")
        || lower.contains("vscode")
        || lower.contains("photoshop")
        || lower.contains("office")
        || lower.contains(".dmg")
        || lower.contains(".exe")
        || lower.contains("安装包")
    {
        "software".to_string()
    } else if lower.contains("音乐")
        || lower.contains("music")
        || lower.contains("专辑")
        || lower.contains("album")
        || lower.contains("flac")
        || lower.contains("mp3")
    {
        "music".to_string()
    } else if lower.contains("动漫")
        || lower.contains("anime")
        || lower.contains("番剧")
        || lower.contains("ova")
        || lower.contains("magnet")
        || lower.contains("nyaa")
    {
        "anime".to_string()
    } else if lower.contains("电影")
        || lower.contains("movie")
        || lower.contains("film")
        || quality != "other"
        || extracted_year.is_some()
    {
        "movie".to_string()
    } else {
        "other".to_string()
    };

    // --- Clean title ---
    let mut title = input.to_string();
    // Remove common action words
    let action_words = ["下载", "下个", "下", "帮我下", "download", "get", "帮我找", "找一下", "找", "给我"];
    for word in &action_words {
        if title.starts_with(word) {
            title = title[word.chars().count()..].trim_start().to_string();
            break;
        }
    }
    // Remove quality markers from title
    for marker in &["4k", "1080p", "720p", "2160p", "蓝光", "高清", "uhd", "fhd", "中字", "双语", "字幕", "subtitle"] {
        title = title.replace(marker, "");
    }
    // Remove year from title if present
    if let Some(yr) = extracted_year {
        title = title.replace(&yr.to_string(), "");
    }
    // Clean up punctuation and whitespace
    title = title
        .replace(['（', '('], " ")
        .replace(['）', ')'], " ")
        .replace(['【', '['], " ")
        .replace(['】', ']'], " ")
        .replace(['《', '〈', '》', '〉'], "")
        .trim()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if title.is_empty() {
        title = input.trim().to_string();
    }

    // --- Generate search keywords ---
    let mut keywords = vec![title.clone()];
    if quality != "other" {
        keywords.push(format!("{} {}", title, quality));
    }
    if let Some(yr) = extracted_year {
        keywords.push(format!("{} {}", title, yr));
    }
    // Add English-friendly keyword for Chinese titles (helps cross-language search)
    if title.chars().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c)) {
        keywords.push(format!("{} 中字", title));
    }

    DownloadIntent {
        title,
        year: extracted_year,
        quality,
        need_subtitle,
        search_keywords: keywords,
        resource_type,
        raw_input: input.to_string(),
    }
}

/// Call an LLM API (OpenAI-compatible) for better intent parsing
async fn parse_with_llm(input: &str, config: &serde_json::Value) -> Result<DownloadIntent, String> {
    let endpoint = config
        .get("endpoint")
        .and_then(|v| v.as_str())
        .ok_or("No endpoint")?;
    let api_key = config
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let model = config
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-4o-mini");

    let prompt = format!(
        r#"Extract download intent from this user request and return JSON only, no markdown:
Request: "{input}"

Return this exact JSON format:
{{"title":"clean title without quality/year words","year":null,"quality":"4K|1080p|720p|other","need_subtitle":true/false,"search_keywords":["keyword1","keyword2"],"resource_type":"movie|tv|software|music|anime|other"}}"#
    );

    let client = build_http_client()?;
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    });

    let resp = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let resp_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("LLM response parse failed: {}", e))?;

    let content = resp_json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or("LLM response missing content")?;

    let parsed: DownloadIntent = serde_json::from_str(content)
        .map_err(|e| format!("LLM JSON parse failed: {}", e))?;

    Ok(parsed)
}

// =====================================================
// File Organization (PRD §6.5)
// =====================================================

/// Organize a downloaded file: categorize, rename, and move to the right folder.
/// Returns the new path of the organized file.
#[command]
pub async fn organize_file(
    file_path: String,
    title: Option<String>,
    year: Option<u32>,
    quality: Option<String>,
    resource_type: Option<String>,
) -> Result<String, String> {
    let src = PathBuf::from(&file_path);
    if !src.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let filename = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // Determine category from resource_type or extension
    let rtype = resource_type.unwrap_or_else(|| categorize_by_extension(&ext));
    let quality = quality.unwrap_or_else(|| "other".to_string());
    let title = title.unwrap_or_else(|| {
        // Use filename without extension as title
        src.file_stem()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    });

    let home = dirs::home_dir().ok_or("Cannot find home")?;
    let base_dir = home.join("Downloads").join("Motrix AI");

    // Build target directory and filename based on category
    let (target_dir, new_filename) = match rtype.as_str() {
        "movie" => {
            let dir = base_dir.join("Movies").join(format!(
                "{}{}",
                title,
                year.map(|y| format!(" ({})", y)).unwrap_or_default()
            ));
            let fname = format!(
                "{}{}.{}",
                title,
                year.map(|y| format!(".{}", y)).unwrap_or_default(),
                if quality != "other" {
                    format!(".{}.{}", quality, ext)
                } else {
                    ext.clone()
                }
            );
            (dir, fname)
        }
        "tv" => {
            let dir = base_dir.join("TV").join(&title);
            (dir, filename) // Keep original filename for TV (has SxxExx)
        }
        "anime" => {
            let dir = base_dir.join("Anime").join(&title);
            (dir, filename)
        }
        "music" => {
            let dir = base_dir.join("Music").join(&title);
            (dir, filename)
        }
        "software" => {
            let dir = base_dir.join("Software").join(&title);
            (dir, filename)
        }
        _ => {
            let dir = base_dir.join("Other");
            (dir, filename)
        }
    };

    // Create target directory
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let target_path = target_dir.join(&new_filename);

    // Handle name conflicts
    let final_path = if target_path.exists() && target_path != src {
        // Add a suffix to avoid overwriting
        let stem = target_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let ext = target_path
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        target_dir.join(format!("{} (2){}", stem, ext))
    } else {
        target_path
    };

    // Move the file
    if src != final_path {
        std::fs::rename(&src, &final_path)
            .or_else(|_| {
                // Cross-device rename fails; fall back to copy + delete
                std::fs::copy(&src, &final_path).and_then(|_| std::fs::remove_file(&src))
            })
            .map_err(|e| format!("Failed to move file: {}", e))?;
    }

    Ok(final_path.to_string_lossy().to_string())
}

/// Determine file category from its extension
fn categorize_by_extension(ext: &str) -> String {
    match ext {
        "mkv" | "mp4" | "avi" | "mov" | "wmv" | "flv" | "ts" | "m4v" => "movie".to_string(),
        "mp3" | "flac" | "wav" | "aac" | "ogg" | "m4a" | "wma" => "music".to_string(),
        "exe" | "dmg" | "deb" | "rpm" | "appimage" | "msi" | "apk" | "pkg" => "software".to_string(),
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" => "software".to_string(),
        "torrent" => "other".to_string(),
        _ => "other".to_string(),
    }
}

/// Open a file's containing folder in the system file manager (Finder on macOS).
#[command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(p.parent().unwrap_or(&p))
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}
