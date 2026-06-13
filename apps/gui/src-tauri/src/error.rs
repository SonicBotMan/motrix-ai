use serde::Serialize;

/// Application-level error type for structured error handling across modules.
/// Derives `Serialize` so it can be returned from Tauri commands.
#[derive(Debug, Serialize, thiserror::Error)]
#[allow(dead_code)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_error_display() {
        let err = AppError::Aria2("connection failed".to_string());
        assert_eq!(err.to_string(), "Aria2 error: connection failed");
    }

    #[test]
    fn test_app_error_from_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_err = AppError::from(io_err);
        assert!(matches!(app_err, AppError::Io(_)));
    }

    #[test]
    fn test_app_error_serialize() {
        let err = AppError::Search("no results".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("Search"));
    }
}
