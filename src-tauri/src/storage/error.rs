use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum StorageError {
    Sqlite(rusqlite::Error),
    Io(std::io::Error),
    Validation {
        code: &'static str,
        field: Option<&'static str>,
        message: String,
    },
    NotFound {
        entity: &'static str,
        id: String,
    },
}

impl StorageError {
    pub fn validation(
        code: &'static str,
        field: impl Into<Option<&'static str>>,
        message: impl Into<String>,
    ) -> Self {
        Self::Validation {
            code,
            field: field.into(),
            message: message.into(),
        }
    }

    pub fn not_found(entity: &'static str, id: impl Into<String>) -> Self {
        Self::NotFound {
            entity,
            id: id.into(),
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::Sqlite(_) => "STORAGE_SQLITE_ERROR",
            Self::Io(_) => "STORAGE_IO_ERROR",
            Self::Validation { code, .. } => code,
            Self::NotFound { .. } => "NOT_FOUND",
        }
    }

    pub fn field(&self) -> Option<&'static str> {
        match self {
            Self::Validation { field, .. } => *field,
            _ => None,
        }
    }
}

impl Display for StorageError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sqlite(_) => formatter.write_str("本地数据库操作失败。"),
            Self::Io(_) => formatter.write_str("无法访问本地数据文件。"),
            Self::Validation { message, .. } => formatter.write_str(message),
            Self::NotFound { entity, id } => write!(formatter, "{entity} `{id}` was not found."),
        }
    }
}

impl Error for StorageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Sqlite(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Validation { .. } | Self::NotFound { .. } => None,
        }
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sqlite(value)
    }
}

impl From<std::io::Error> for StorageError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}
