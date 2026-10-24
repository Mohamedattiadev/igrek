fn main() {
    // The commands the web app may call; only pages of Igrek's own server get them (main.rs).
    let commands = &["notify", "autostart", "set_autostart", "update_check", "update_install", "update_progress", "tray_texts", "capture_screen"];
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("tauri build");
}
