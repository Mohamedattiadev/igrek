//! The JavaScript runtime Igrek's server runs on (Bun), fetched once on the first start instead of
//! shipped inside every package: it is most of the download (about 90 MB of 110), and the packages
//! stay near 15 MB without it. The version is fixed and the file is checked against Bun's own
//! published SHA-256 before it is used; a file that does not match is deleted, never run.

use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

/// The Bun the server bundle is built and tested with (CI pins the same version).
pub const BUN_VERSION: &str = "1.4.3";

/// Bun's release file for this computer and its SHA-256 (from SHASUMS256.txt of that release).
fn asset() -> Option<(&'static str, &'static str)> {
    let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);
    Some(match (os, arch) {
        ("linux", "x86_64") => ("bun-linux-x64", "3e730528d89775f03f87f05c06787c4df4099d0a37f3f252e7b829cb23816e18"),
        ("linux", "aarch64") => ("bun-linux-aarch64", "efa9813da5ed72423bf847f916e8d2c47c0d776add972354026a75e10da9aa21"),
        ("macos", "x86_64") => ("bun-darwin-x64", "62660e6438eb872278877acca77e1152d5d031324df368d4a81b428211489d2d"),
        ("macos", "aarch64") => ("bun-darwin-aarch64", "80afd4c069b46a6fa8f3ec520bebc750a7843e4a8d5b9583d29ad436c00a3403"),
        ("windows", "x86_64") => ("bun-windows-x64", "0bf84e808552beea67bf1202a287a35c6c825d837b287b3f8e9dd513dba35d3d"),
        ("windows", "aarch64") => ("bun-windows-aarch64", "5e8f142ef722cbc9f67dc068a166e46ee72be8307b38cac7186589d2face668f"),
        _ => return None,
    })
}

/// Where the runtime lives, the same for the app and for `igrek-desktop mcp` (which has no app
/// around it): the user's local data folder, outside any project and outside the AppImage.
pub fn root() -> PathBuf {
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
    };
    base.unwrap_or_else(std::env::temp_dir).join("igrek-runtime")
}

pub fn bun_path() -> PathBuf {
    root().join(format!("bun-{BUN_VERSION}")).join(if cfg!(windows) { "bun.exe" } else { "bun" })
}

/// Fetches with the system's own curl (on Windows 10 and later, macOS and almost every Linux),
/// or wget; `progress` is told how many bytes have arrived.
fn download(url: &str, to: &Path, progress: &dyn Fn(u64)) -> Result<(), String> {
    let target = to.to_string_lossy().to_string();
    // The system's own curl, with the system's own libraries: inside an AppImage the app's library
    // path points at the libraries it carries, and the system curl crashed on them (seen in 0.1.5).
    let tool = |program: &str, args: &[&str]| {
        let mut command = Command::new(program);
        command.args(args).stdout(Stdio::null()).stderr(Stdio::null());
        crate::server::outside_appimage(&mut command);
        crate::server::hide_console(&mut command);
        command.spawn()
    };
    let curl = if cfg!(windows) { "curl.exe" } else { "curl" };
    let mut child = tool(curl, &["-fsSL", "--retry", "3", "-o", &target, url])
        .or_else(|_| tool("wget", &["-q", "-O", &target, url]))
        .map_err(|_| "Neither curl nor wget is installed".to_string())?;
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return if status.success() { Ok(()) } else { Err("The download failed".into()) };
        }
        progress(fs::metadata(to).map(|m| m.len()).unwrap_or(0));
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn sha256(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// The bun executable from the release zip ("bun-linux-x64/bun"), written to `to`.
fn unpack(zip: &Path, to: &Path) -> Result<(), String> {
    let file = fs::File::open(zip).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let name = if cfg!(windows) { "bun.exe" } else { "bun" };
    let index = (0..archive.len())
        .find(|&i| archive.by_index(i).is_ok_and(|f| f.name().rsplit('/').next() == Some(name)))
        .ok_or("No bun in the download")?;
    let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
    let mut out = fs::File::create(to).map_err(|e| e.to_string())?;
    std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(to, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The runtime, fetched and checked first if it is not here yet.
pub fn ensure(progress: &dyn Fn(u64)) -> Result<PathBuf, String> {
    let bun = bun_path();
    if bun.exists() {
        return Ok(bun);
    }
    let (name, expected) = asset().ok_or("No Bun for this computer")?;
    let dir = bun.parent().ok_or("No folder")?.to_path_buf();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let zip = dir.join(format!("{name}.zip.part"));
    let url = format!("https://github.com/oven-sh/bun/releases/download/bun-v{BUN_VERSION}/{name}.zip");
    let result = download(&url, &zip, progress).and_then(|()| {
        let got = sha256(&zip)?;
        if got != expected {
            return Err(format!("The download did not match Bun's published checksum ({got})"));
        }
        let partial = dir.join(format!("{}.part", bun.file_name().unwrap_or_default().to_string_lossy()));
        unpack(&zip, &partial)?;
        fs::rename(&partial, &bun).map_err(|e| e.to_string())
    });
    let _ = fs::remove_file(&zip);
    result.map(|()| bun)
}

#[cfg(test)]
mod tests {
    #[test]
    fn every_supported_computer_has_a_checked_download() {
        let (name, sum) = super::asset().expect("this computer");
        assert!(name.starts_with("bun-"));
        assert_eq!(sum.len(), 64);
        assert!(super::bun_path().ends_with(if cfg!(windows) { "bun.exe" } else { "bun" }));
    }
}
