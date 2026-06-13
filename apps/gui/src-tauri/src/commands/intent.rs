// commands/intent.rs — NL Intent Parsing (PRD §6.1).
// Parses natural-language download requests into structured intent,
// using heuristic parsing or an LLM if configured.

use super::{build_http_client, DownloadIntent};
use std::time::Duration;
use tauri::command;

/// Parse natural language download request into structured intent.
/// Uses heuristic parsing (no external API required for zero-config).
/// If llm_config is provided, tries LLM first for better accuracy.
#[command]
pub async fn parse_nl_intent(
    input: String,
    llm_config: Option<serde_json::Value>,
) -> Result<DownloadIntent, String> {
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
    let quality = if lower.contains("4k")
        || lower.contains("2160p")
        || lower.contains("蓝光")
        || lower.contains("uhd")
        || lower.contains("蓝光原盘")
    {
        "4K".to_string()
    } else if lower.contains("1080p") || lower.contains("fhd") || lower.contains("全高清") {
        "1080p".to_string()
    } else if lower.contains("720p") || lower.contains("hd") || lower.contains("高清") {
        "720p".to_string()
    } else {
        "other".to_string()
    };

    // --- Extract year ---
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
    let action_words = [
        "下载",
        "下个",
        "下",
        "帮我下",
        "download",
        "get",
        "帮我找",
        "找一下",
        "找",
        "给我",
    ];
    for word in &action_words {
        if title.starts_with(word) {
            title = title[word.chars().count()..].trim_start().to_string();
            break;
        }
    }
    for marker in &[
        "4k", "1080p", "720p", "2160p", "蓝光", "高清", "uhd", "fhd", "中字", "双语", "字幕",
        "subtitle",
    ] {
        title = title.replace(marker, "");
    }
    if let Some(yr) = extracted_year {
        title = title.replace(&yr.to_string(), "");
    }
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
    if title
        .chars()
        .any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c))
    {
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
    let api_key = config.get("api_key").and_then(|v| v.as_str()).unwrap_or("");
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

    let parsed: DownloadIntent =
        serde_json::from_str(content).map_err(|e| format!("LLM JSON parse failed: {}", e))?;

    Ok(parsed)
}
