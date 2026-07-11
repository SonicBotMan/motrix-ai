use serde_json::Value;
use std::path::PathBuf;

fn config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    Ok(home.join(".motrix-ai").join("config.json"))
}

fn default_config() -> Value {
    serde_json::json!({
        "ai": { "provider": "opencode", "model": "opencode/deepseek-v4-flash-free" },
        "aria2": { "rpc_url": "http://127.0.0.1:6800/jsonrpc" },
        "downloads": {
            "base_dir": "~/Downloads/Motrix AI",
            "movie_dir": "~/Downloads/Motrix AI/Movies",
            "software_dir": "~/Downloads/Motrix AI/Software",
            "other_dir": "~/Downloads/Motrix AI/Other",
            "rename_template": "{title} ({year})/{title}.{quality}.{ext}"
        },
        "schedule": {
            "enabled": true,
            "rules": [
                { "name": "Night Full Speed", "time_start": "23:00", "time_end": "07:00", "speed_limit": 0, "max_concurrent": 5 },
                { "name": "Daytime Throttle", "time_start": "07:00", "time_end": "18:00", "speed_limit": 5000000, "max_concurrent": 2 },
                { "name": "Evening Moderate", "time_start": "18:00", "time_end": "23:00", "speed_limit": 10000000, "max_concurrent": 3 }
            ]
        },
        "disk": { "enabled": true, "thresholds": { "low_gb": 5, "critical_gb": 2, "resume_gb": 20 } },
        "subtitles": {
            "enabled": true,
            "preferred_languages": ["zh", "en"],
            "sources": { "shooter": true, "subhd": true, "opensubtitles": false },
            "subtitle_dir": "~/Downloads/Motrix AI/Subtitles",
            "opensubtitles_api_key": "",
            "auto_search": true
        },
        "archive": { "enabled": false, "targets": [] },
        "nas": { "enabled": false, "host": "192.168.1.100", "port": "22", "username": "", "moviePath": "/volume1/Media/Movies", "softwarePath": "/volume1/Software", "musicPath": "/volume1/Music" },
        "ui": { "theme": "dark", "language": "en", "log_level": "info" },
        "schemaVersion": 3
    })
}

#[tauri::command]
pub async fn load_config() -> Result<Value, String> {
    let path = config_path()?;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        if !path.exists() {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
            }
            let defaults = default_config();
            std::fs::write(
                &path,
                serde_json::to_string_pretty(&defaults).unwrap_or_default(),
            )
            .map_err(|e| format!("Write failed: {}", e))?;
            return Ok(defaults);
        }
        let raw = std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
        let mut config: Value = serde_json::from_str(&raw)
            .map_err(|e| format!("Parse failed: {}, using defaults", e))?;
        // Simple migration: ensure schemaVersion and ui section exist
        if config
            .get("schemaVersion")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            < 2
        {
            if config.get("ui").is_none() {
                config["ui"] =
                    serde_json::json!({ "theme": "dark", "language": "en", "log_level": "info" });
            }
            if let Some(subs) = config.get_mut("subtitles") {
                if subs.get("subtitle_dir").is_none() {
                    subs["subtitle_dir"] = serde_json::json!("");
                }
                if subs.get("opensubtitles_api_key").is_none() {
                    subs["opensubtitles_api_key"] = serde_json::json!("");
                }
                if subs.get("auto_search").is_none() {
                    subs["auto_search"] = serde_json::json!(true);
                }
            }
            config["schemaVersion"] = serde_json::json!(3);
            let _ = std::fs::write(
                &path,
                serde_json::to_string_pretty(&config).unwrap_or_default(),
            );
        }
        Ok(config)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn save_config(config: Value) -> Result<(), String> {
    let path = config_path()?;
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if path.exists() {
                let meta = std::fs::metadata(&path).map_err(|e| format!("Stat failed: {}", e))?;
                if meta.file_type().is_symlink() {
                    return Err("Refusing to write to symlink".to_string());
                }
            }
            let json = serde_json::to_string_pretty(&config)
                .map_err(|e| format!("Serialize failed: {}", e))?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
            }
            std::fs::write(&path, &json).map_err(|e| format!("Write failed: {}", e))?;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
                .map_err(|e| format!("Set permissions failed: {}", e))?;
        }
        #[cfg(not(unix))]
        {
            let json = serde_json::to_string_pretty(&config)
                .map_err(|e| format!("Serialize failed: {}", e))?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
            }
            std::fs::write(&path, &json).map_err(|e| format!("Write failed: {}", e))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn update_config_section(section: String, value: Value) -> Result<Value, String> {
    let path = config_path()?;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let raw = if path.exists() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };
        let mut config: Value = if raw.is_empty() {
            default_config()
        } else {
            serde_json::from_str(&raw).unwrap_or_else(|_| default_config())
        };
        config[&section] = value;
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Serialize failed: {}", e))?;
        std::fs::write(&path, json).map_err(|e| format!("Write failed: {}", e))?;
        Ok(config)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn test_nas_connection(host: String, port: String) -> Result<bool, String> {
    let port_num = port
        .parse::<u16>()
        .map_err(|_| format!("Invalid port: {}", port))?;
    let target = format!("{}:{}", host, port_num);
    tokio::net::TcpStream::connect(target)
        .await
        .map(|_| true)
        .or_else(|e| {
            let msg = e.to_string();
            if msg.contains("dns") || msg.contains("resolve") {
                Err(format!("DNS resolution failed for {}: {}", host, msg))
            } else {
                Ok(false)
            }
        })
}
