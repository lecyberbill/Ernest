use std::thread;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Démarrage du serveur hernest-ide-core sur le port 8090
  thread::spawn(|| {
    hernest_ide_core::server::start_http_server("127.0.0.1", 8090);
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
    .expect("error while running hernest ide application");
}
