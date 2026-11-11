use std::thread;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Démarrer le serveur HTTP Earnest Core en tâche de fond sur le port 8080 (si non déjà en écoute)
  thread::spawn(|| {
    earnest_ide_core::server::start_http_server("127.0.0.1", 8080);
  });

  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
