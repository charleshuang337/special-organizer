pub mod commands;
pub mod domain;
pub mod errors;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_status,
            commands::cleanup_preview,
            commands::list_suppliers,
            commands::create_series,
            commands::update_series,
            commands::archive_series,
            commands::delete_series,
            commands::list_series,
            commands::mark_series_closure_completed,
            commands::reapply_series,
            commands::list_report_series,
            commands::list_series_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
