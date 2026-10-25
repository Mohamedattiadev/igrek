//! The Igrek server the window shows: one JavaScript file in the app's resources, run by Bun (see
//! runtime.rs), started hidden on a free port when the app opens and stopped, with everything it
//! started, when the app closes.

use std::fs::File;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// The server bundle inside the resources (apps/desktop/scripts/sidecar.ts writes it).
const SCRIPT: &str = "server/desktop.js";
/// Where the app last found its server bundle, for `igrek-desktop mcp`, which runs without the app.
const SCRIPT_NOTE: &str = "server-script.txt";

/// The running server; `None` once it has been stopped.
pub struct Server(pub Mutex<Option<Child>>);

/// Bun with the server bundle as its first argument.
fn server_command(bun: &Path, script: &Path) -> Command {
    let mut command = Command::new(bun);
    command.arg(script);
    command
}

/// The command Claude Code's settings may keep for Igrek's MCP tools. An AppImage runs from a new
/// folder each time, so there it is the AppImage file itself (see `run_helper`).
fn launcher() -> std::io::Result<PathBuf> {
    match std::env::var_os("APPIMAGE") {
        Some(image) => Ok(PathBuf::from(image)),
        None => std::env::current_exe(),
    }
}

fn hide_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: the server is a console program; no black window next to the app.
        command.creation_flags(0x0800_0000);
    }
    #[cfg(not(windows))]
    let _ = command;
}

/// Programs started from the desktop (a launcher, Finder) get a short PATH without the folders the
/// user's shell adds, where Claude Code, Codex, git and the like usually are. The user's own shell
/// is asked for its PATH, through `env`, which prints it the same way whatever the shell is.
#[cfg(unix)]
fn user_path() -> Option<String> {
    use std::io::Read;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let mut shell = Command::new(shell);
    outside_appimage(&mut shell);
    let mut child = shell
        .args(["-ilc", "env"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let started = Instant::now();
    // A shell start-up that waits for something must not hold Igrek up.
    while child.try_wait().ok()?.is_none() {
        if started.elapsed() > Duration::from_secs(5) {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    out.lines().rev().find_map(|line| line.strip_prefix("PATH=")).map(str::to_string)
}

fn with_user_path(command: &mut Command) {
    #[cfg(unix)]
    if let Some(path) = user_path() {
        let current = std::env::var("PATH").unwrap_or_default();
        let current = appimage_dir().map_or(current.clone(), |dir| outside(&current, &dir));
        command.env("PATH", if current.is_empty() { path } else { format!("{path}:{current}") });
    }
    #[cfg(not(unix))]
    let _ = command;
}

/// Where the AppImage is mounted while it runs, if Igrek was started from one.
fn appimage_dir() -> Option<String> {
    std::env::var("APPDIR").ok().filter(|dir| !dir.is_empty())
}

/// A list of paths ("a:b:c") without the ones inside `dir`.
fn outside(list: &str, dir: &str) -> String {
    list.split(':').filter(|p| !p.is_empty() && !p.starts_with(dir)).collect::<Vec<_>>().join(":")
}

/// The AppImage starts Igrek with its own libraries first: LD_LIBRARY_PATH, PYTHONHOME, GTK_PATH
/// and the like all point into its mount. Passed on, they reached every program the server starts
/// and broke the ones built for the system's libraries (Codex stopped with "symbol lookup error").
/// Those that point into the mount are dropped; a list keeps its entries outside it. PATH is left
/// to with_user_path.
fn outside_appimage(command: &mut Command) {
    let Some(dir) = appimage_dir() else { return };
    for (name, value) in std::env::vars() {
        if name == "PATH" || !value.contains(&dir) {
            continue;
        }
        let rest = outside(&value, &dir);
        if rest.is_empty() || !value.contains(':') {
            command.env_remove(&name);
        } else {
            command.env(&name, rest);
        }
    }
}

/// A port nobody listens on now. The server binds it a moment later; another program taking it in
/// between is unlikely, and then the server fails to start and the window says so.
fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port())
}

/// Starts the server and waits until it answers. Its output goes to `log`.
pub fn start(resources: &Path, log: &Path, bun: &Path) -> Result<(Child, u16), String> {
    let port = free_port().map_err(|e| e.to_string())?;
    let out = File::create(log).map_err(|e| e.to_string())?;
    let err = out.try_clone().map_err(|e| e.to_string())?;
    let script = resources.join(SCRIPT);
    // An AppImage mounts somewhere new each start: the helper reads where it is this time.
    let _ = std::fs::write(crate::runtime::root().join(SCRIPT_NOTE), script.to_string_lossy().as_bytes());
    let mut command = server_command(bun, &script);
    command
        .env("IGREK_PORT", port.to_string())
        .env("IGREK_HOST", "127.0.0.1")
        .env("IGREK_RESOURCES", resources)
        .env("IGREK_LAUNCHER", launcher().map_err(|e| e.to_string())?)
        // Held open for as long as the app runs; the server stops when it closes (desktop.ts).
        .stdin(Stdio::piped())
        .stdout(out)
        .stderr(err);
    hide_console(&mut command);
    outside_appimage(&mut command);
    with_user_path(&mut command);
    let mut child = command.spawn().map_err(|e| e.to_string())?;

    let started = Instant::now();
    while TcpStream::connect(("127.0.0.1", port)).is_err() {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("{status}"));
        }
        // The first start creates the database and reads the user's sessions; give it time.
        if started.elapsed() > Duration::from_secs(90) {
            stop(child);
            return Err("timeout".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Ok((child, port))
}

/// Closes the server's stdin so it shuts down the way Ctrl+C does, then waits a little before
/// forcing it.
pub fn stop(mut child: Child) {
    drop(child.stdin.take());
    let asked = Instant::now();
    while asked.elapsed() < Duration::from_secs(10) {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// `igrek mcp`: the AppImage (or the installed program) stands in for the server file when Claude
/// Code starts Igrek's MCP tools, passing its stdin and stdout straight through.
pub fn run_helper(role: &str) -> i32 {
    let bun = crate::runtime::bun_path();
    let Ok(script) = std::fs::read_to_string(crate::runtime::root().join(SCRIPT_NOTE)) else { return 1 };
    let mut command = server_command(&bun, Path::new(script.trim()));
    command.arg(role).args(std::env::args_os().skip(2));
    hide_console(&mut command);
    outside_appimage(&mut command);
    match command.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(_) => 1,
    }
}
