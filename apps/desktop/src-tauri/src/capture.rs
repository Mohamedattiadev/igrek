//! A picture of the screen for the screen helper, taken only when the user asks for one. Linux goes
//! through the desktop portal (xdg-desktop-portal), so Wayland compositors such as Hyprland and GNOME
//! decide and may ask the user; macOS uses its own screencapture, which asks for the Screen Recording
//! permission once; Windows copies the screen with .NET from PowerShell. Nothing is kept: the file is
//! read and deleted, and the picture goes back to the page as base64.

use std::path::PathBuf;
#[cfg(not(target_os = "linux"))]
use std::process::Command;

/// The PNG of the whole screen, base64.
pub fn screen_png() -> Result<String, String> {
    let path = take()?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string());
    // The portal writes into the user's Pictures folder: the picture must not stay there.
    let _ = std::fs::remove_file(&path);
    Ok(base64(&bytes?))
}

#[cfg(target_os = "linux")]
fn take() -> Result<PathBuf, String> {
    portal::screenshot()
}

#[cfg(target_os = "macos")]
fn take() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("igrek-screen-{}.png", std::process::id()));
    // -x: no camera sound.
    let ok = Command::new("screencapture").arg("-x").arg("-t").arg("png").arg(&path).status();
    match ok {
        Ok(s) if s.success() && path.exists() => Ok(path),
        _ => Err("screencapture failed: allow Igrek in System Settings, Privacy, Screen Recording".into()),
    }
}

#[cfg(target_os = "windows")]
fn take() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("igrek-screen-{}.png", std::process::id()));
    let script = format!(
        "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; \
         $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; \
         $i=New-Object System.Drawing.Bitmap $b.Width,$b.Height; \
         $g=[System.Drawing.Graphics]::FromImage($i); \
         $g.CopyFromScreen($b.Left,$b.Top,0,0,$i.Size); \
         $i.Save('{}',[System.Drawing.Imaging.ImageFormat]::Png)",
        path.display().to_string().replace('\'', "''")
    );
    let ok = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script]).status();
    match ok {
        Ok(s) if s.success() && path.exists() => Ok(path),
        _ => Err("The screen could not be copied".into()),
    }
}

#[cfg(target_os = "linux")]
mod portal {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use zbus::blocking::{Connection, MessageIterator, Proxy};
    use zbus::zvariant::{OwnedObjectPath, OwnedValue, Value};
    use zbus::MatchRule;

    /// org.freedesktop.portal.Screenshot: the answer comes as a Response signal on a request object
    /// whose path is known in advance from our name and a token, so we listen before asking.
    pub fn screenshot() -> Result<PathBuf, String> {
        let err = |e: zbus::Error| e.to_string();
        let conn = Connection::session().map_err(err)?;
        let token = format!("igrek{}", std::process::id());
        let sender = conn
            .unique_name()
            .map(|n| n.trim_start_matches(':').replace('.', "_"))
            .ok_or("No D-Bus name")?;
        let request = format!("/org/freedesktop/portal/desktop/request/{sender}/{token}");
        let rule = MatchRule::builder()
            .msg_type(zbus::message::Type::Signal)
            .interface("org.freedesktop.portal.Request")
            .and_then(|b| b.member("Response"))
            .and_then(|b| b.path(request.as_str()))
            .map_err(err)?
            .build();
        let mut answers = MessageIterator::for_match_rule(rule, &conn, Some(1)).map_err(err)?;
        let proxy = Proxy::new(
            &conn,
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Screenshot",
        )
        .map_err(err)?;
        let mut options: HashMap<&str, Value> = HashMap::new();
        options.insert("handle_token", Value::from(token.as_str()));
        options.insert("interactive", Value::from(false));
        let _: OwnedObjectPath = proxy.call("Screenshot", &("", options)).map_err(err)?;
        let message = answers.next().ok_or("The portal did not answer")?.map_err(err)?;
        let (code, results): (u32, HashMap<String, OwnedValue>) =
            message.body().deserialize().map_err(err)?;
        if code != 0 {
            return Err("The screenshot was cancelled".into());
        }
        let uri: String = results
            .get("uri")
            .and_then(|v| String::try_from(v.clone()).ok())
            .ok_or("The portal gave no picture")?;
        let path = uri.strip_prefix("file://").ok_or("The portal gave no file")?;
        Ok(PathBuf::from(percent_decode(path)))
    }

    /// "%20" and the like in the file URI the portal gives back.
    fn percent_decode(s: &str) -> String {
        let bytes = s.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' && i + 2 < bytes.len() {
                if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(b);
                    i += 3;
                    continue;
                }
            }
            out.push(bytes[i]);
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }
}

/// Standard base64, so the picture can go to the page as text (no crate for twenty lines).
fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        for (i, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            if i <= chunk.len() {
                out.push(TABLE[((n >> shift) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn base64_matches_the_standard() {
        assert_eq!(super::base64(b""), "");
        assert_eq!(super::base64(b"f"), "Zg==");
        assert_eq!(super::base64(b"fo"), "Zm8=");
        assert_eq!(super::base64(b"foo"), "Zm9v");
        assert_eq!(super::base64(b"foobar"), "Zm9vYmFy");
    }
}
