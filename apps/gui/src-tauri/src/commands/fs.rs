// commands/fs.rs — File system operations.
// save_file, download_subtitle, opensubtitles_search/download,
// get_download_path, organize_file, show_in_folder.

use super::build_http_client;
use std::path::PathBuf;
use tauri::command;

/// Save file to disk (Bug 3: wrap blocking I/O in spawn_blocking)
#[command]
pub async fn save_file(path: String, content: Vec<u8>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&path);

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

    let content = response
        .bytes()
        .await
        .map_err(|e| format!("Read failed: {}", e))?;

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

/// Search OpenSubtitles API for subtitles
#[command]
pub async fn opensubtitles_search(
    api_key: String,
    query: String,
    languages: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = build_http_client()?;

    let mut params = vec![("query", query)];
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

/// Download a subtitle from OpenSubtitles and save it to disk
#[command]
pub async fn opensubtitles_download(
    api_key: String,
    subtitle_id: String,
    file_name: String,
) -> Result<String, String> {
    let client = build_http_client()?;

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
        return Err(format!(
            "OpenSubtitles download API error ({}): {}",
            status, body
        ));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse download response: {}", e))?;

    let download_url = json["link"]
        .as_str()
        .ok_or("No download link in response")?;

    let subtitle_response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Subtitle file download failed: {}", e))?;

    let content = subtitle_response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read subtitle content: {}", e))?;

    // Return base64-encoded content
    use std::io::Write;
    let mut buf = Vec::new();
    {
        let mut encoder =
            base64::write::EncoderWriter::new(&mut buf, &base64::engine::general_purpose::STANDARD);
        encoder
            .write_all(&content)
            .map_err(|e| format!("Base64 encode failed: {}", e))?;
    }

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

        std::fs::create_dir_all(&download_dir).map_err(|e| format!("Create dir failed: {}", e))?;

        Ok(download_dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

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
    // Wrap all blocking IO (path inspection, dir creation, rename, copy) in
    // spawn_blocking so we don't stall the tokio runtime.
    tokio::task::spawn_blocking(move || {
        organize_file_blocking(file_path, title, year, quality, resource_type)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Blocking implementation of [`organize_file`]. Must be called inside
/// `spawn_blocking` — direct use from an async context will stall the runtime.
fn organize_file_blocking(
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

    let rtype = resource_type.unwrap_or_else(|| categorize_by_extension(&ext));
    let quality = sanitize_path_component(&quality.unwrap_or_else(|| "other".to_string()));
    // title comes from torrent metadata / external sources — sanitize to
    // neutralize `../` and absolute-path attempts (path traversal mitigation).
    let raw_title = title.unwrap_or_else(|| {
        src.file_stem()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    });
    let title = sanitize_path_component(&raw_title);

    let home = dirs::home_dir().ok_or("Cannot find home")?;
    let base_dir = home.join("Downloads").join("Motrix AI");

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
            (dir, filename)
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

    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let target_path = target_dir.join(&new_filename);

    let final_path = if target_path.exists() && target_path != src {
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

    // Defense in depth: verify the final path stays under base_dir after
    // sanitization. If sanitization missed anything (e.g. a Windows UNC path
    // or a symlink escape), this is the last line of defense.
    let canonical_base = base_dir.canonicalize().unwrap_or_else(|_| base_dir.clone());
    let canonical_final = final_path
        .parent()
        .and_then(|p| p.canonicalize().ok())
        .unwrap_or_else(|| canonical_base.clone());
    if !canonical_final.starts_with(&canonical_base) {
        return Err(format!(
            "Refusing to organize file outside base dir: {} not under {}",
            canonical_final.display(),
            canonical_base.display()
        ));
    }

    if src != final_path {
        std::fs::rename(&src, &final_path)
            .or_else(|_| std::fs::copy(&src, &final_path).and_then(|_| std::fs::remove_file(&src)))
            .map_err(|e| format!("Failed to move file: {}", e))?;
    }

    Ok(final_path.to_string_lossy().to_string())
}

/// Sanitize a single path component (filename / folder name) to make it safe
/// to join onto a trusted base directory.
///
/// Defends against:
///   * Path traversal via `..` segments or leading `/`/`\\`.
///   * Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
///   * Control characters (0x00-0x1F).
///   * Overly long names (limit 200 chars; most filesystems allow 255).
///
/// The sanitiser is conservative: it replaces risky characters with `_`
/// rather than removing them, so titles remain recognisable.
fn sanitize_path_component(input: &str) -> String {
    let mut cleaned: String = input
        .chars()
        .map(|c| if c.is_control() { '_' } else { c })
        .collect();

    // Strip path separators and traversal segments.
    cleaned = cleaned.replace(['/', '\\'], "_");
    // Collapse multiple consecutive underscores into one for readability.
    while cleaned.contains("__") {
        cleaned = cleaned.replace("__", "_");
    }
    // Trim leading dots and underscores (defends against `..`, `...`, `._`).
    cleaned = cleaned
        .trim_start_matches('.')
        .trim_start_matches('_')
        .to_string();
    // Strip leading drive-letter-like prefixes (Windows: `C:`).
    if cleaned.len() >= 2 && cleaned.as_bytes()[1] == b':' {
        cleaned = cleaned.split_off(2);
    }

    // Windows reserved names — replace with a safe alternative.
    let upper = cleaned.to_uppercase();
    let reserved_stems = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    let stem = upper.split('.').next().unwrap_or("");
    if reserved_stems.iter().any(|r| stem == *r) {
        cleaned = format!("_{}", cleaned);
    }

    // Enforce a sane length limit (200 chars; leaves headroom for path join).
    if cleaned.chars().count() > 200 {
        cleaned = cleaned.chars().take(200).collect();
    }

    if cleaned.is_empty() {
        "Unknown".to_string()
    } else {
        cleaned
    }
}

/// Determine file category from its extension
fn categorize_by_extension(ext: &str) -> String {
    match ext {
        "mkv" | "mp4" | "avi" | "mov" | "wmv" | "flv" | "ts" | "m4v" => "movie".to_string(),
        "mp3" | "flac" | "wav" | "aac" | "ogg" | "m4a" | "wma" => "music".to_string(),
        "exe" | "dmg" | "deb" | "rpm" | "appimage" | "msi" | "apk" | "pkg" => {
            "software".to_string()
        }
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" => "software".to_string(),
        "torrent" => "other".to_string(),
        _ => "other".to_string(),
    }
}

/// Expand a leading `~` or `~/` to the user's home directory.
fn expand_home(path: &str) -> PathBuf {
    if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    if let Some(rest) = path.strip_prefix("~\\") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

/// Open a file's containing folder in the system file manager.
#[command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    let p = expand_home(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", p.display()));
    }
    let path_str = p.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path_str])
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path_str])
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_passes_through_clean_name() {
        assert_eq!(sanitize_path_component("Inception"), "Inception");
        assert_eq!(sanitize_path_component("Movie (2010)"), "Movie (2010)");
    }

    #[test]
    fn sanitize_strips_path_traversal_dots() {
        let evil = "../../etc/cron.d/evil";
        let cleaned = sanitize_path_component(evil);
        assert!(!cleaned.contains(".."));
        assert!(!cleaned.starts_with('.'));
        assert!(!cleaned.starts_with('/'));
    }

    #[test]
    fn sanitize_replaces_separators() {
        let cleaned = sanitize_path_component("a/b\\c");
        assert!(!cleaned.contains('/'));
        assert!(!cleaned.contains('\\'));
        assert!(cleaned.contains("a"));
        assert!(cleaned.contains("b"));
        assert!(cleaned.contains("c"));
    }

    #[test]
    fn sanitize_replaces_control_chars() {
        let cleaned = sanitize_path_component("name\x00with\x01control");
        assert!(!cleaned.contains('\x00'));
        assert!(!cleaned.contains('\x01'));
    }

    #[test]
    fn sanitize_handles_drive_letter_prefix() {
        let cleaned = sanitize_path_component("C:something");
        assert!(!cleaned.starts_with("C:"));
    }

    #[test]
    fn sanitize_renames_windows_reserved_names() {
        for reserved in ["CON", "PRN", "AUX", "NUL", "COM1", "LPT9"] {
            let cleaned = sanitize_path_component(reserved);
            assert_ne!(cleaned, reserved);
            assert!(cleans_starts_with_underscore_or_differs(&cleaned, reserved));
        }
    }

    fn cleans_starts_with_underscore_or_differs(cleaned: &str, original: &str) -> bool {
        cleaned != original
    }

    #[test]
    fn sanitize_truncates_overly_long_names() {
        let long = "a".repeat(500);
        let cleaned = sanitize_path_component(&long);
        assert!(cleaned.chars().count() <= 200);
    }

    #[test]
    fn sanitize_returns_unknown_for_empty_input() {
        assert_eq!(sanitize_path_component(""), "Unknown");
        assert_eq!(sanitize_path_component("..."), "Unknown");
        assert_eq!(sanitize_path_component("/"), "Unknown");
    }

    #[test]
    fn sanitize_collapses_repeated_separators() {
        let cleaned = sanitize_path_component("a///b\\\\\\c");
        assert!(!cleaned.contains("___"));
    }

    #[test]
    fn categorize_by_extension_returns_correct_category() {
        assert_eq!(categorize_by_extension("mkv"), "movie");
        assert_eq!(categorize_by_extension("mp4"), "movie");
        assert_eq!(categorize_by_extension("mp3"), "music");
        assert_eq!(categorize_by_extension("flac"), "music");
        assert_eq!(categorize_by_extension("exe"), "software");
        assert_eq!(categorize_by_extension("dmg"), "software");
        assert_eq!(categorize_by_extension("zip"), "software");
        assert_eq!(categorize_by_extension("torrent"), "other");
        assert_eq!(categorize_by_extension("xyz"), "other");
    }

    #[test]
    fn expand_home_resolves_tilde() {
        let resolved = expand_home("~/test");
        assert!(!resolved.to_string_lossy().contains('~'));
        assert!(resolved.is_absolute());
    }

    #[test]
    fn expand_home_passes_through_absolute_paths() {
        let resolved = expand_home("/tmp/foo");
        assert_eq!(resolved, PathBuf::from("/tmp/foo"));
    }
}
