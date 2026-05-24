use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::errors::AppError;
use crate::storage::{
    Database, DeleteSeriesResult, ListSeriesQuery, ReportSeriesQuery, ReportSeriesResult,
    SeriesHistoryEvent, SeriesMutationInput, SpecialSeries, StorageStatus, Supplier,
};

#[derive(Serialize)]
pub struct AppStatus {
    pub app_name: &'static str,
    pub storage: &'static str,
    pub database: StorageStatus,
}

#[derive(Serialize)]
pub struct CleanupPreview {
    pub app_data_dir: String,
    pub app_local_data_dir: String,
    pub app_log_dir: String,
    pub database_path: String,
    pub warning: &'static str,
}

#[tauri::command]
pub fn app_status(app: AppHandle) -> Result<AppStatus, AppError> {
    let database = database(&app)?;

    Ok(AppStatus {
        app_name: "Special Organizer",
        storage: "sqlite_configured",
        database: database.status(),
    })
}

#[tauri::command]
pub fn cleanup_preview(app: AppHandle) -> Result<CleanupPreview, AppError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        AppError::storage_path(format!("无法定位应用数据目录：{error}"))
    })?;
    let app_local_data_dir = app.path().app_local_data_dir().map_err(|error| {
        AppError::storage_path(format!("无法定位应用本地数据目录：{error}"))
    })?;
    let app_log_dir = app.path().app_log_dir().map_err(|error| {
        AppError::storage_path(format!("无法定位应用日志目录：{error}"))
    })?;
    let database_path = app_data_dir.join("special-organizer.sqlite3");

    Ok(CleanupPreview {
        app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        app_local_data_dir: app_local_data_dir.to_string_lossy().into_owned(),
        app_log_dir: app_log_dir.to_string_lossy().into_owned(),
        database_path: database_path.to_string_lossy().into_owned(),
        warning: "删除工作包会清理应用数据、日志和本地 SQLite。请先关闭应用并备份需要保留的数据。",
    })
}

#[tauri::command]
pub fn list_suppliers(app: AppHandle) -> Result<Vec<Supplier>, AppError> {
    database(&app)?.list_suppliers().map_err(AppError::from)
}

#[tauri::command]
pub fn create_series(
    app: AppHandle,
    input: SeriesMutationInput,
) -> Result<SpecialSeries, AppError> {
    database(&app)?
        .create_series(input)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn update_series(
    app: AppHandle,
    id: String,
    input: SeriesMutationInput,
) -> Result<SpecialSeries, AppError> {
    database(&app)?
        .update_series(&id, input)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn archive_series(app: AppHandle, id: String) -> Result<SpecialSeries, AppError> {
    database(&app)?
        .archive_series(&id)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn delete_series(app: AppHandle, id: String) -> Result<DeleteSeriesResult, AppError> {
    database(&app)?
        .delete_series(&id)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn list_series(
    app: AppHandle,
    query: Option<ListSeriesQuery>,
) -> Result<Vec<SpecialSeries>, AppError> {
    database(&app)?
        .list_series(query.unwrap_or_default())
        .map_err(AppError::from)
}

#[tauri::command]
pub fn mark_series_closure_completed(
    app: AppHandle,
    id: String,
    event_note: Option<String>,
    as_of_date: Option<String>,
) -> Result<SpecialSeries, AppError> {
    database(&app)?
        .mark_series_closure_completed(&id, event_note, as_of_date)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn reapply_series(
    app: AppHandle,
    id: String,
    input: SeriesMutationInput,
) -> Result<SpecialSeries, AppError> {
    database(&app)?
        .reapply_series(&id, input)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn list_report_series(
    app: AppHandle,
    query: ReportSeriesQuery,
) -> Result<ReportSeriesResult, AppError> {
    database(&app)?
        .list_report_series(query)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn list_series_history(
    app: AppHandle,
    series_id: Option<String>,
) -> Result<Vec<SeriesHistoryEvent>, AppError> {
    database(&app)?
        .list_series_history(series_id)
        .map_err(AppError::from)
}

fn database(app: &AppHandle) -> Result<Database, AppError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        AppError::storage_path(format!("无法定位应用数据目录：{error}"))
    })?;

    Database::initialize(app_data_dir).map_err(AppError::from)
}
