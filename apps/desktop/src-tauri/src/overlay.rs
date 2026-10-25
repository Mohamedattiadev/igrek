//! The screen helper on the real screen (after Clicky): a pointer that appears where an answer points,
//! the answer read out loud, and, step by step with the user's OK each time, a click or typing done
//! for them. Nothing here decides anything: the page asks for one step after the user pressed its
//! button. The tools are the system's own or common free ones (hyprctl, ydotool, wtype, xdotool,
//! espeak-ng, say, PowerShell); when one is missing, the error names it.

use std::process::Command;
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

const POINTER: &str = "igrek-pointer";
/// How long the pointer stays on the screen.
const POINTER_SECONDS: u64 = 6;

/// The rectangle all screens make together, in logical points: a picture of the whole screen is
/// mapped onto it, so a point on the picture becomes a point on the screen.
fn screen_box(app: &AppHandle) -> (f64, f64, f64, f64) {
    let monitors = app.available_monitors().unwrap_or_default();
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for m in &monitors {
        let s = m.scale_factor();
        let p = m.position();
        let z = m.size();
        let (x, y) = (f64::from(p.x) / s, f64::from(p.y) / s);
        x0 = x0.min(x);
        y0 = y0.min(y);
        x1 = x1.max(x + f64::from(z.width) / s);
        y1 = y1.max(y + f64::from(z.height) / s);
    }
    if monitors.is_empty() {
        return (0.0, 0.0, 1920.0, 1080.0);
    }
    (x0, y0, x1 - x0, y1 - y0)
}

/// A point on the picture (its pixels) as a point on the screen.
pub fn to_screen(app: &AppHandle, x: f64, y: f64, width: f64, height: f64) -> (i32, i32) {
    let (bx, by, bw, bh) = screen_box(app);
    let sx = bx + x / width.max(1.0) * bw;
    let sy = by + y / height.max(1.0) * bh;
    (sx.round() as i32, sy.round() as i32)
}

fn hyprland() -> bool {
    std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_some()
}

fn wayland() -> bool {
    std::env::var("XDG_SESSION_TYPE").is_ok_and(|v| v == "wayland")
}

fn run(program: &str, args: &[&str]) -> Result<(), String> {
    match Command::new(program).args(args).status() {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err(format!("{program} failed")),
        Err(_) => Err(format!("{program} is not installed")),
    }
}

/// Igrek's own window as Hyprland sees it: its address and fullscreen state (0 none, 1 maximized,
/// 2 fullscreen). Hiding a window there loses that state, so it is put back afterwards.
fn hypr_own_window() -> Option<(String, i64)> {
    let out = Command::new("hyprctl").args(["clients", "-j"]).output().ok()?;
    let clients: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    let pid = i64::from(std::process::id());
    clients.as_array()?.iter().find_map(|c| {
        let mine = c["pid"].as_i64() == Some(pid) && c["title"].as_str() != Some(POINTER);
        mine.then(|| (c["address"].as_str().unwrap_or_default().to_string(), c["fullscreen"].as_i64().unwrap_or(0)))
    })
}

/// How Igrek's window was before it stepped aside, to come back the same way.
pub struct Aside {
    hypr: Option<(String, i64)>,
    fullscreen: bool,
    maximized: bool,
}

/// Igrek's window leaves the screen, and this waits until the compositor has really taken it off,
/// so a picture or a click right after does not meet Igrek itself.
pub fn step_aside(window: &tauri::WebviewWindow) -> Aside {
    let aside = Aside {
        hypr: if hyprland() { hypr_own_window() } else { None },
        fullscreen: window.is_fullscreen().unwrap_or(false),
        maximized: window.is_maximized().unwrap_or(false),
    };
    let _ = window.hide();
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1500);
    if let Some((address, _)) = &aside.hypr {
        while std::time::Instant::now() < deadline && hypr_own_window().is_some_and(|(a, _)| &a == address) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
    // The compositor's fade-out, and a frame drawn without the window.
    std::thread::sleep(std::time::Duration::from_millis(if aside.hypr.is_some() { 300 } else { 500 }));
    aside
}

/// Back, fullscreen or maximized again if it was.
pub fn come_back(window: &tauri::WebviewWindow, aside: &Aside) {
    let _ = window.show();
    let _ = window.set_focus();
    if let Some((_, mode)) = aside.hypr {
        if mode > 0 {
            std::thread::sleep(std::time::Duration::from_millis(150));
            // Hyprland: "fullscreen 0" is fullscreen, "fullscreen 1" is maximized.
            let _ = run("hyprctl", &["dispatch", "fullscreen", if mode == 2 { "0" } else { "1" }]);
        }
    } else if aside.fullscreen {
        let _ = window.set_fullscreen(true);
    } else if aside.maximized {
        let _ = window.maximize();
    }
}

/// Shows the pointer at a place on the screen for a few seconds; it never takes the focus or a click.
pub fn show_pointer(app: &AppHandle, x: i32, y: i32, label: &str) -> Result<(), String> {
    if let Some(old) = app.get_webview_window(POINTER) {
        let _ = old.close();
    }
    let url = format!("pointer.html#{}", urlencode(label));
    let window = WebviewWindowBuilder::new(app, POINTER, WebviewUrl::App(url.into()))
        .title(POINTER)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .resizable(false)
        .shadow(false)
        .inner_size(280.0, 64.0)
        .position(f64::from(x) - 4.0, f64::from(y) - 4.0)
        .build()
        .map_err(|e| e.to_string())?;
    // Clicks go through it to whatever is underneath.
    let _ = window.set_ignore_cursor_events(true);
    if hyprland() {
        // Wayland does not let a program place its own window; Hyprland's dispatchers do it.
        let sel = format!("title:^({POINTER})$");
        std::thread::sleep(std::time::Duration::from_millis(250));
        let batch = format!(
            "dispatch setfloating {sel} ; dispatch pin {sel} ; dispatch movewindowpixel exact {} {},{sel}",
            x - 4,
            y - 4
        );
        let _ = run("hyprctl", &["--batch", &batch]);
    } else {
        let _ = window.set_position(LogicalPosition::new(f64::from(x) - 4.0, f64::from(y) - 4.0));
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(POINTER_SECONDS));
        if let Some(w) = handle.get_webview_window(POINTER) {
            let _ = w.close();
        }
    });
    Ok(())
}

fn urlencode(s: &str) -> String {
    s.chars()
        .take(60)
        .flat_map(|c| {
            if c.is_ascii_alphanumeric() || c == ' ' || c == '-' {
                vec![if c == ' ' { '+' } else { c }]
            } else {
                let mut buf = [0u8; 4];
                c.encode_utf8(&mut buf).bytes().flat_map(|b| format!("%{b:02X}").chars().collect::<Vec<_>>()).collect()
            }
        })
        .collect()
}

/// Reads the answer out loud with the system's own voice (espeak-ng on Linux, say on macOS, the
/// Windows speech engine); no service is called.
pub fn speak(text: &str, language: &str) -> Result<(), String> {
    let text: String = text.chars().take(1500).collect();
    let lang = if language.starts_with("tr") { "tr" } else { "en" };
    let mut command = if cfg!(target_os = "macos") {
        let mut c = Command::new("say");
        c.arg(&text);
        c
    } else if cfg!(target_os = "windows") {
        let mut c = Command::new("powershell");
        c.args([
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($input)",
        ]);
        c.stdin(std::process::Stdio::piped());
        c
    } else {
        let mut c = Command::new("espeak-ng");
        c.args(["-v", lang, "--", &text]);
        c
    };
    let mut child = command.spawn().map_err(|_| "No speech program found (espeak-ng on Linux)".to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(text.as_bytes());
    }
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// One step the user allowed: a click at a place, typing text, or a key. Igrek's window is out of the
/// way while it happens, so the click lands on what the user saw.
pub fn input_step(action: &str, x: i32, y: i32, text: &str) -> Result<(), String> {
    match action {
        "click" => click(x, y),
        "type" => type_text(text),
        "key" => key(text),
        _ => Err("Unknown step".into()),
    }
}

fn click(x: i32, y: i32) -> Result<(), String> {
    let (xs, ys) = (x.to_string(), y.to_string());
    if cfg!(target_os = "windows") {
        let script = format!(
            "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int x,int y); [DllImport(\"user32.dll\")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name U -Namespace W; [W.U]::SetCursorPos({x},{y}); [W.U]::mouse_event(2,0,0,0,0); [W.U]::mouse_event(4,0,0,0,0)"
        );
        return run("powershell", &["-NoProfile", "-Command", &script]);
    }
    if cfg!(target_os = "macos") {
        return run("cliclick", &[&format!("c:{x},{y}")])
            .map_err(|e| format!("{e} (brew install cliclick, and allow Igrek in Accessibility)"));
    }
    if hyprland() {
        run("hyprctl", &["dispatch", "movecursor", &xs, &ys])?;
        // 0xC0: left button down and up.
        return run("ydotool", &["click", "0xC0"]).map_err(|e| format!("{e} (ydotool, with ydotoold running)"));
    }
    if wayland() {
        run("ydotool", &["mousemove", "--absolute", "-x", &xs, "-y", &ys])?;
        return run("ydotool", &["click", "0xC0"]).map_err(|e| format!("{e} (ydotool, with ydotoold running)"));
    }
    run("xdotool", &["mousemove", &xs, &ys, "click", "1"])
}

fn type_text(text: &str) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        let escaped = text.replace('\'', "''");
        let script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{}')",
            escaped.replace(['+', '^', '%', '~', '(', ')', '{', '}', '[', ']'], "")
        );
        return run("powershell", &["-NoProfile", "-Command", &script]);
    }
    if cfg!(target_os = "macos") {
        return run("cliclick", &[&format!("t:{text}")]);
    }
    if wayland() {
        return run("wtype", &["--", text]);
    }
    run("xdotool", &["type", "--delay", "20", "--", text])
}

fn key(name: &str) -> Result<(), String> {
    // Only a few named keys: Enter, Tab, Escape.
    let (wtype, xdotool, mac, win) = match name {
        "Enter" => ("Return", "Return", "kp:return", "{ENTER}"),
        "Tab" => ("Tab", "Tab", "kp:tab", "{TAB}"),
        "Escape" => ("Escape", "Escape", "kp:esc", "{ESC}"),
        _ => return Err("Only Enter, Tab and Escape".into()),
    };
    if cfg!(target_os = "windows") {
        return run(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                &format!("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{win}')"),
            ],
        );
    }
    if cfg!(target_os = "macos") {
        return run("cliclick", &[mac]);
    }
    if wayland() {
        return run("wtype", &["-k", wtype]);
    }
    run("xdotool", &["key", xdotool])
}

#[cfg(test)]
mod tests {
    #[test]
    fn labels_go_into_the_address_safely() {
        assert_eq!(super::urlencode("save button"), "save+button");
        assert_eq!(super::urlencode("Kaydet & çık"), "Kaydet+%26+%C3%A7%C4%B1k");
    }
}
