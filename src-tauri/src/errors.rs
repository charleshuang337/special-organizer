use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: String,
    pub field: Option<String>,
    pub message: String,
}

impl AppError {
    pub fn new(
        code: impl Into<String>,
        field: impl Into<Option<String>>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            field: field.into(),
            message: message.into(),
        }
    }

    pub fn storage_path(message: impl Into<String>) -> Self {
        Self::new("STORAGE_PATH_ERROR", None, message)
    }
}

impl From<crate::storage::StorageError> for AppError {
    fn from(value: crate::storage::StorageError) -> Self {
        Self {
            code: value.code().to_owned(),
            field: value.field().map(str::to_owned),
            message: value.to_string(),
        }
    }
}
