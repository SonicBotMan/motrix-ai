// commands/search.rs — Torrent search proxy and HTML parsing.
// Handles CORS-free proxying to Btdig, Mikan, 1337x, Nyaa, TorrentGalaxy.

use super::{build_http_client, SearchResponse, SearchResult};
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;
use tauri::command;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

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
// Detail-page magnet regex — 1337x puts the magnet link inside a dropdown
// block on the torrent's detail page (e.g. /torrent/12345/). Format:
//   <a href="magnet:?xt=urn:btih:<40-hex>&dn=...&tr=...">
static X1337_DETAIL_MAGNET_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"href="(magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^"]*)""#).unwrap()
});

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
        "1337x" => parse_1337x_results(&client, &html).await,
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
///
/// 1337x search results pages list torrents with links to detail pages but
/// do NOT include magnet links. The magnet link only appears on each
/// torrent's detail page (e.g. `/torrent/12345/Title-720p/`).
///
/// This function:
///   1. Parses the search page into a list of intermediate entries.
///   2. Concurrently fetches each entry's detail page to resolve the magnet
///      link, with a `Semaphore(3)` cap to avoid being rate-limited.
///   3. Drops any entry whose detail page can't be fetched or whose magnet
///      link can't be parsed — better to return fewer usable results than
///      many unusable detail-URLs masquerading as magnets.
async fn parse_1337x_results(client: &reqwest::Client, html: &str) -> Vec<SearchResult> {
    let entries = extract_1337x_search_entries(html);
    if entries.is_empty() {
        return Vec::new();
    }

    let semaphore = Arc::new(Semaphore::new(3));
    let client = Arc::new(client.clone());

    let mut set: JoinSet<(X1337Entry, Option<String>)> = JoinSet::new();
    for entry in entries {
        let sem = semaphore.clone();
        let client = client.clone();
        set.spawn(async move {
            let magnet = fetch_1337x_magnet(&client, &sem, &entry.detail_url).await;
            (entry, magnet)
        });
    }

    let mut results = Vec::new();
    while let Some(res) = set.join_next().await {
        if let Ok((entry, Some(magnet))) = res {
            results.push(SearchResult {
                title: entry.title,
                magnet,
                size: entry.size,
                seeders: entry.seeders,
                leechers: entry.leechers,
                source: "1337x".to_string(),
                quality: entry.quality,
            });
        }
    }
    results
}

/// Intermediate entry produced by parsing the 1337x search-results page.
struct X1337Entry {
    detail_url: String,
    title: String,
    seeders: u32,
    leechers: u32,
    size: u64,
    quality: Option<String>,
}

/// Walk the 1337x search-results HTML and produce one [`X1337Entry`] per row
/// that has a parseable title and detail-page link. Pure parsing — no network I/O.
fn extract_1337x_search_entries(html: &str) -> Vec<X1337Entry> {
    let mut entries = Vec::new();

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

        entries.push(X1337Entry {
            detail_url: format!("https://1337x.to{}", detail_path),
            title,
            seeders,
            leechers,
            size,
            quality,
        });
    }

    entries
}

/// Fetch a single 1337x detail page and extract its magnet link.
///
/// Returns `None` when:
///   * the semaphore can't be acquired (shouldn't happen normally),
///   * the request times out (5s cap, avoids hanging the whole search),
///   * the response status is not 2xx,
///   * the page body doesn't contain a recognisable magnet link.
async fn fetch_1337x_magnet(
    client: &reqwest::Client,
    semaphore: &Semaphore,
    detail_url: &str,
) -> Option<String> {
    let _permit = semaphore.acquire().await.ok()?;

    let response = tokio::time::timeout(
        Duration::from_secs(5),
        client
            .get(detail_url)
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .header("Accept-Language", "en-US,en;q=0.5")
            .send(),
    )
    .await
    .ok()?;

    let response = response.ok()?;
    if !response.status().is_success() {
        return None;
    }

    let html = response.text().await.ok()?;
    X1337_DETAIL_MAGNET_RE
        .captures(&html)
        .map(|c| c[1].to_string())
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

    #[test]
    fn extract_1337x_entries_parses_well_formed_row() {
        let html = r#"
        <table>
          <tr>
            <td><a href="/torrent/12345/Inception-2010-1080p/">Inception (2010) [1080p]</a></td>
            <td class="seeds">120</td>
            <td class="leeches">12</td>
            <td class="size">2.5 GB</td>
          </tr>
        </table>"#;
        let entries = extract_1337x_search_entries(html);
        assert_eq!(entries.len(), 1);
        let e = &entries[0];
        assert_eq!(
            e.detail_url,
            "https://1337x.to/torrent/12345/Inception-2010-1080p/"
        );
        assert_eq!(e.title, "Inception (2010) [1080p]");
        assert_eq!(e.seeders, 120);
        assert_eq!(e.leechers, 12);
        assert_eq!(e.size, 2_684_354_560);
        assert_eq!(e.quality, Some("1080p".to_string()));
    }

    #[test]
    fn extract_1337x_entries_skips_row_without_title_link() {
        let html = r#"
        <table>
          <tr><td>no link here</td></tr>
          <tr><td><a href="/torrent/1/Real-One/">Real One</a></td>
              <td class="seeds">5</td><td class="leeches">1</td>
              <td class="size">100 MB</td></tr>
        </table>"#;
        let entries = extract_1337x_search_entries(html);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title, "Real One");
    }

    #[test]
    fn extract_1337x_entries_skips_empty_title() {
        let html = r#"
        <table>
          <tr><td><a href="/torrent/2/x/">   </a></td></tr>
          <tr><td><a href="/torrent/3/Good/">Good</a></td></tr>
        </table>"#;
        let entries = extract_1337x_search_entries(html);
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn extract_1337x_entries_returns_empty_for_unrelated_html() {
        let entries = extract_1337x_search_entries("<html><body>nothing</body></html>");
        assert!(entries.is_empty());
    }

    #[test]
    fn x1337_detail_magnet_regex_matches_standard_magnet() {
        let html = r#"<a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Test">download</a>"#;
        let caps = X1337_DETAIL_MAGNET_RE.captures(html);
        assert!(caps.is_some(), "regex should match a valid 40-hex magnet");
        let m = caps.unwrap();
        assert!(m[1].starts_with("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"));
        assert!(m[1].contains("&dn=Test"));
    }

    #[test]
    fn x1337_detail_magnet_regex_matches_32_char_base32_hash() {
        // Base32 info-hash variant (aria2 also accepts these).
        // The regex strictly requires 40 hex chars; base32 magnets are rejected.
        // (If 1337x ever serves base32 magnets we'll need to loosen the regex,
        // but every observed 1337x detail page uses 40-hex.)
        let html =
            r#"<a href="magnet:?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&dn=Base32">x</a>"#;
        assert!(X1337_DETAIL_MAGNET_RE.captures(html).is_none());
    }

    #[test]
    fn x1337_detail_magnet_regex_rejects_short_hash() {
        let html = r#"<a href="magnet:?xt=urn:btih:abcd&dn=Short">x</a>"#;
        assert!(X1337_DETAIL_MAGNET_RE.captures(html).is_none());
    }

    #[test]
    fn x1337_detail_magnet_regex_rejects_non_magnet_href() {
        let html = r#"<a href="https://example.com/not-a-magnet">x</a>"#;
        assert!(X1337_DETAIL_MAGNET_RE.captures(html).is_none());
    }

    #[test]
    fn x1337_detail_magnet_regex_finds_magnet_in_full_detail_page_snippet() {
        let html = r#"
        <div class="dropdown">
          <button>Magnet</button>
          <ul>
            <li><a href="magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01&dn=Movie.2020&tr=udp%3A%2F%2Ftracker.example.com%3A1337">Magnet Download</a></li>
          </ul>
        </div>"#;
        let caps = X1337_DETAIL_MAGNET_RE.captures(html);
        assert!(caps.is_some());
        assert!(caps.unwrap()[1].contains("dn=Movie.2020"));
    }
}
