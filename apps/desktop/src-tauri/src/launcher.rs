//! An AppImage is one file the user runs from wherever they saved it; unlike the .deb nothing
//! installs it, so the desktop's app search would never find Igrek. On each start from an
//! AppImage this writes the entry (and its icon) that launchers read, pointing at where the file
//! is now, so moving it keeps the entry right. TryExec hides the entry once the file is gone.

use std::fs;
use std::path::{Path, PathBuf};

/// Named after the class the window carries (the program's name, not the app's id), so the
/// desktop matches the running window to this entry and its icon.
const ID: &str = "igrek-desktop";
const ICON: &[u8] = include_bytes!("../icons/128x128.png");

fn data_home() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| Path::new(&h).join(".local/share")))
}

/// Only what changed is written, so an unchanged start touches nothing.
fn write_if_changed(path: &Path, content: &[u8]) -> std::io::Result<()> {
    if fs::read(path).is_ok_and(|old| old == content) {
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(path, content)
}

/// Quoted the way the desktop entry spec asks, for a path with spaces or quotes in it.
fn quoted(path: &str) -> String {
    let escaped = path.replace('\\', "\\\\").replace('"', "\\\"").replace('`', "\\`").replace('$', "\\$");
    format!("\"{escaped}\"")
}

pub fn register() {
    let Some(appimage) = std::env::var_os("APPIMAGE").and_then(|p| p.into_string().ok()) else { return };
    let Some(data) = data_home() else { return };
    let icon = data.join(format!("icons/hicolor/128x128/apps/{ID}.png"));
    if write_if_changed(&icon, ICON).is_err() {
        return;
    }
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Igrek\nExec={}\nTryExec={appimage}\nIcon={}\nTerminal=false\nCategories=Development;\nStartupWMClass={ID}\n",
        quoted(&appimage),
        icon.display()
    );
    let _ = write_if_changed(&data.join(format!("applications/{ID}.desktop")), entry.as_bytes());
}
