// commands/search.rs — Torrent search proxy and HTML parsing.
// Handles CORS-free proxying to Btdig, Mikan, 1337x, Nyaa, TorrentGalaxy.

use super::{build_http_client, SearchResponse, SearchResult};
use std::sync::LazyLock;
use tauri::command;

// ---------------------------------------------------------------------------
// Pre-compiled regexes (Bug 6)
// ---------------------------------------------------------------------------

// Btdig
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

// Mikan
static MIKAN_ITEM_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<item>([\s\S]*?)</item>"#).unwrap());
static MIKAN_TITLE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<title>([^<]+)</title>"#).unwrap());
static MIKAN_ENCLOSURE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<enclosure[^>]*url="([^"]+)"[^>]*length="(\d+)""#).unwrap()
});
static MIKAN_MAGNET_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(magnet:\?[\\<\s"]+)"#).unwrap());

// 1337x
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

// Nyaa
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

// TorrentGalaxy
static TG_ROW_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<div[^>]*class="tgxtable[^"]*"[^>]*>([\s\S]*?)</div>\s*</div>"#).unwrap()
});
static TG_TITLE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<a[^>]*href="(/torrent/[^"]+)"[^>]*>([\s\S]*?)</a>"#).unwrap()
});
static TG_MAGNET_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<a[^>]*href="(magnet:\?[^"]+)"[^>]*>"#).unwrap());
static TG_SIZE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"Size:\s*([\d.]+\s*[KMGT]?i?B)"#).unwrap());
static TG_SEEDER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(?:Seeders?|S(?:hd)?):\s*(\d+)"#).unwrap());
static TG_LEECHER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(?:Leechers?|L(?:hd)?):\s*(\d+)"#).unwrap());

// Shared helpers
static STRIP_TAGS_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"<[^>]*>").unwrap());

static PARSE_SIZE_UNIT_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^([\d.]+)\s*([KMGT]?I?B|BYTES?)$").unwrap());

// ---------------------------------------------------------------------------
// Search proxy command
// ---------------------------------------------------------------------------

/// Proxy search request to avoid CORS issues
#[command]
pub async fn search_proxy(
    query: String,
    source: String,
    page: Option<u32>,
) -> Result<SearchResponse, String> {
    let client = build_http_client()?;
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
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "en-US,en;q=0.5")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let html = response
        .text()
        .await
        .map_err(|e| format!("Read failed: {}", e))?;

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

// ---------------------------------------------------------------------------
// Per-source HTML parsers
// ---------------------------------------------------------------------------

/// Parse Btdig HTML results
fn parse_btdig_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();
    let blocks: Vec<&str> = html.split("class=\"one_result\"").collect();

    for block in blocks.iter().skip(1) {
        let magnet = if let Some(caps) = BTDIG_MAGNET_RE.captures(block) {
            caps[1].to_string()
        } else {
            continue;
        };

        let title = if let Some(caps) = BTDIG_TITLE_RE.captures(block) {
            caps[1].trim().to_string()
        } else {
            "Unknown".to_string()
        };

        let size = if let Some(caps) = BTDIG_SIZE_RE.captures(block) {
            parse_size(caps[1].trim())
        } else {
            0
        };

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

        let magnet = if let Some(caps) = MIKAN_ENCLOSURE_RE.captures(item) {
            let url = &caps[1];
            if url.starts_with("magnet:") {
                url.to_string()
            } else if let Some(mag_caps) = MIKAN_MAGNET_RE.captures(item) {
                mag_caps[1].to_string()
            } else {
                continue;
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

/// Parse 1337x HTML search results.
/// 1337x search results page lists torrents with links to detail pages.
/// Magnet links are only on detail pages, so the magnet field contains the
/// detail-page URL as a placeholder.
fn parse_1337x_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    for row_caps in X1337_ROW_RE.captures_iter(html) {
        let row = &row_caps[1];

        let link_caps = match X1337_TITLE_LINK_RE.captures(row) {
            Some(c) => c,
            None => continue,
        };

        let detail_path = &link_caps[1];
        let raw_title = &link_caps[2];
        let title = STRIP_TAGS_RE.replace_all(raw_title, "").trim().to_string();

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
                let size_text = STRIP_TAGS_RE.replace_all(&c[1], "").trim().to_string();
                parse_size(&size_text)
            })
            .unwrap_or(0);

        let quality = detect_quality(&title);
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

/// Parse Nyaa.si HTML search results.
/// Nyaa.si has magnet links directly on the search results page.
fn parse_nyaa_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    for row_caps in NYAA_ROW_RE.captures_iter(html) {
        let row = &row_caps[1];

        let magnet = match NYAA_MAGNET_RE.captures(row) {
            Some(c) => c[1].to_string(),
            None => continue,
        };

        let title = if let Some(caps) = NYAA_TITLE_RE.captures(row) {
            caps[2].trim().to_string()
        } else if let Some(caps) = NYAA_TITLE_FALLBACK_RE.captures(row) {
            STRIP_TAGS_RE.replace_all(&caps[2], "").trim().to_string()
        } else {
            "Unknown".to_string()
        };

        if title == "Unknown" {
            continue;
        }

        let size = NYAA_SIZE_RE
            .captures(row)
            .map(|c| parse_size(c[1].trim()))
            .unwrap_or(0);

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

        let title_caps = match TG_TITLE_RE.captures(row) {
            Some(c) => c,
            None => continue,
        };

        let raw_title = &title_caps[2];
        let title = STRIP_TAGS_RE.replace_all(raw_title, "").trim().to_string();

        if title.is_empty() {
            continue;
        }

        let magnet = match TG_MAGNET_RE.captures(row) {
            Some(c) => c[1].to_string(),
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

// ---------------------------------------------------------------------------
// Shared parsing helpers
// ---------------------------------------------------------------------------

/// Parse human-readable size to bytes
fn parse_size(s: &str) -> u64 {
    let s = s.trim().to_uppercase();
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() < 2 {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_size_bytes() {
        assert_eq!(parse_size("100 B"), 100);
    }

    #[test]
    fn test_parse_size_kb() {
        assert_eq!(parse_size("1.5 KB"), 1536);
    }

    #[test]
    fn test_parse_size_mb() {
        assert_eq!(parse_size("100 MB"), 104857600);
    }

    #[test]
    fn test_parse_size_gb() {
        assert_eq!(parse_size("1.5 GB"), 1610612736);
    }

    #[test]
    fn test_detect_quality_4k() {
        assert_eq!(detect_quality("Movie.4K.BluRay"), Some("4K".to_string()));
    }

    #[test]
    fn test_detect_quality_1080p() {
        assert_eq!(
            detect_quality("Movie.1080p.WEB-DL"),
            Some("1080p".to_string())
        );
    }

    #[test]
    fn test_detect_quality_other() {
        assert_eq!(detect_quality("Movie.DVDRip"), None);
    }
}
