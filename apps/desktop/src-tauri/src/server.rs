//! The Igrek server the window shows. It is the single-file server (`bun build --compile`) shipped
//! beside this program, started hidden on a free port when the app opens and stopped, with
//! everything it started, when the app closes.

use std::fs::File;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const SERVER: &str = if cfg!(windows) { "igrek-server.exe" } else { "igrek-server" };

/// The running server; `None` once it has been stopped.
pub struct Server(pub Mutex<Option<Child>>);

/// The server file, which the bundler puts next to this program.
fn server_file() -> std::io::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    Ok(exe.with_file_name(SERVER))
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
    let mut child = Command::new(shell)
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
        command.env("PATH", if current.is_empty() { path } else { format!("{path}:{current}") });
    }
    #[cfg(not(unix))]
    let _ = command;
}

/// A port nobody listens on now. The server binds it a moment later; another program taking it in
/// between is unlikely, and then the server fails to start and the window says so.
fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port())
}

/// Starts the server and waits until it answers. Its output goes to `log`.
pub fn start(resources: &Path, log: &Path) -> Result<(Child, u16), String> {
    let port = free_port().map_err(|e| e.to_string())?;
    let out = File::create(log).map_err(|e| e.to_string())?;
    let err = out.try_clone().map_err(|e| e.to_string())?;
    let mut command = Command::new(server_file().map_err(|e| e.to_string())?);
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
    let Ok(file) = server_file() else { return 1 };
    let mut command = Command::new(file);
    command.arg(role).args(std::env::args_os().skip(2));
    hide_console(&mut command);
    match command.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(_) => 1,
    }
}
