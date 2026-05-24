use serde::Serialize;

#[derive(Serialize)]
pub struct AppStatus {
    pub app_name: &'static str,
    pub storage: &'static str,
}

#[tauri::command]
pub fn app_status() -> AppStatus {
    AppStatus {
        app_name: "Special Organizer",
        storage: "not_configured",
    }
}
