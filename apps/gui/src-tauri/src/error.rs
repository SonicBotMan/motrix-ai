use serde::Serialize;

/// Application-level error type for structured error handling across modules.
/// Derives `Serialize` so it can be returned from Tauri commands.
#[derive(Debug, Serialize, thiserror::Error)]
pub enum AppError {
    #[error("Aria2 error: {0}")]
    Aria2(String),

    #[error("Search error: {0}")]
    Search(String),

    #[error("Intent parse error: {0}")]
    Intent(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Config error: {0}")]
    Config(String),
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}
