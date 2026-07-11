// commands/fs.rs — File system operations.
// save_file, download_subtitle, opensubtitles_search/download,
// get_download_path, organize_file, show_in_folder.

use super::{build_http_client, configured_download_dir};
use std::path::{Path, PathBuf};
use tauri::command;

/// Sanitize a user/metadata-provided string so it is safe to use as a
/// single path component. Strips path separators, parent-dir traversal
/// sequences, null bytes, and leading dots that could escape the base dir
/// when joined. Returns the cleaned string.
///
/// Defence against torrent titles like `../../etc/cron.d/evil` reaching
/// `organize_file` via external metadata.
fn sanitize_path_component(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| match c {
            '/' | '\\' | '\0' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let trimmed = cleaned.trim_start_matches('.').trim();
    let stripped = trimmed.replace("..", "_");
    if stripped.is_empty() {
        "Unknown".to_string()
    } else {
        stripped
    }
}

/// Build a path under `base`, asserting the result actually stays under
/// `base`. Defends against any path-escape attempt that slipped past
/// `sanitize_path_component` (defence in depth).
fn safe_join(base: &Path, components: &[&str]) -> Result<PathBuf, String> {
    let mut out = base.to_path_buf();
    for c in components {
        let cleaned = sanitize_path_component(c);
        out.push(&cleaned);
    }
    let canon_base = base.canonicalize().unwrap_or_else(|_| base.to_path_buf());
    let parent_out = out.parent().unwrap_or(&out);
    let canon_parent = parent_out
        .canonicalize()
        .unwrap_or_else(|_| parent_out.to_path_buf());
    if !canon_parent.starts_with(&canon_base) {
        return Err(format!(
            "Refusing to organize outside download dir: {} not under {}",
            out.display(),
            canon_base.display()
        ));
    }
    Ok(out)
}

/// Read a configured subdirectory name from the `downloads` section of
/// config.json (e.g. `movie_dir`, `software_dir`, `other_dir`).
/// Returns `fallback` when the field is missing or empty, so callers keep
/// the historical hardcoded behaviour when the user has not customised it.
fn configured_subdir(field: &str, fallback: &str) -> String {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return fallback.to_string(),
    };
    let config_path = home.join(".motrix-ai").join("config.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(v) = json
                .get("downloads")
                .and_then(|d| d.get(field))
                .and_then(|v| v.as_str())
            {
                let trimmed = v.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }
    fallback.to_string()
}

/// Save file to disk. Validates the path stays within the user's home directory.
#[command]
pub async fn save_file(path: String, content: Vec<u8>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let path = expand_home(&path);

        if let Some(home) = dirs::home_dir() {
            let canon_home = home.canonicalize().unwrap_or_else(|_| home.clone());
            let parent = path.parent().unwrap_or(&path);
            std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
            let canon_parent = parent
                .canonicalize()
                .unwrap_or_else(|_| parent.to_path_buf());
            if !canon_parent.starts_with(&canon_home) {
                return Err(format!(
                    "Refusing to write outside home directory: {}",
                    path.display()
                ));
            }
        } else {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
            }
        }

        std::fs::write(&path, content).map_err(|e| format!("Write failed: {}", e))?;

        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Download subtitle from URL and save to disk. Only HTTP(S) URLs are accepted.
#[command]
pub async fn download_subtitle(url: String, save_path: String) -> Result<String, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only HTTP(S) URLs are allowed for subtitle download".to_string());
    }
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
        let path = expand_home(&path);

        if let Some(home) = dirs::home_dir() {
            let canon_home = home.canonicalize().unwrap_or_else(|_| home.clone());
            let parent = path.parent().unwrap_or(&path);
            std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
            let canon_parent = parent
                .canonicalize()
                .unwrap_or_else(|_| parent.to_path_buf());
            if !canon_parent.starts_with(&canon_home) {
                return Err(format!(
                    "Refusing to write outside home directory: {}",
                    path.display()
                ));
            }
        } else {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
            }
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
        let download_dir = configured_download_dir();

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
    // All filesystem ops (stat, mkdir, rename, copy) are blocking. Run
    // them on a worker so the async runtime stays free for other commands.
    tokio::task::spawn_blocking(move || -> Result<String, String> {
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
        let title = sanitize_path_component(&title.unwrap_or_else(|| {
            src.file_stem()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Unknown".to_string())
        }));

        let base_dir = configured_download_dir();
        let movie_dir = configured_subdir("movie_dir", "Movies");
        let software_dir = configured_subdir("software_dir", "Software");
        let other_dir = configured_subdir("other_dir", "Other");

        let (target_dir, new_filename) = match rtype.as_str() {
            "movie" => {
                let dir = safe_join(
                    &base_dir,
                    &[
                        &movie_dir,
                        &format!(
                            "{}{}",
                            title,
                            year.map(|y| format!(" ({})", y)).unwrap_or_default()
                        ),
                    ],
                )?;
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
                let dir = safe_join(&base_dir, &["TV", &title])?;
                (dir, filename)
            }
            "anime" => {
                let dir = safe_join(&base_dir, &["Anime", &title])?;
                (dir, filename)
            }
            "music" => {
                let dir = safe_join(&base_dir, &["Music", &title])?;
                (dir, filename)
            }
            "software" => {
                let dir = safe_join(&base_dir, &[&software_dir, &title])?;
                (dir, filename)
            }
            _ => {
                let dir = base_dir.join(&other_dir);
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

        if src != final_path {
            std::fs::rename(&src, &final_path)
                .or_else(|_| {
                    std::fs::copy(&src, &final_path).and_then(|_| std::fs::remove_file(&src))
                })
                .map_err(|e| format!("Failed to move file: {}", e))?;
        }

        Ok(final_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &p.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &p.to_string_lossy()])
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
