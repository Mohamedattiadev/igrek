//! Igrek in a window of its own (plan.md Faz 17). The window shows the same web app the browser
//! does, served by Igrek's own server, which this program starts hidden and stops on the way out.
//! Around it: a tray icon, the system's notifications, starting with the computer, Ctrl+Space from
//! anywhere for a quick question, and updates signed with Igrek's own key.

// No console window next to the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod overlay;
#[cfg(target_os = "linux")]
mod launcher;
mod server;
mod texts;

use server::Server;
use std::sync::Mutex;
use tauri::ipc::CapabilityBuilder;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const MAIN: &str = "main";
const QUICK_ASK: &str = "ctrl+space";
const QUICK_ASK_ARG: &str = "--quick-ask";
/// The screen helper: a question about what is on the screen, with a picture taken only on request.
const SCREEN_ASK: &str = "ctrl+shift+space";
/// For the user's own shortcut where the system has no global ones (Wayland), like `--quick-ask`.
const SCREEN_ASK_ARG: &str = "--screen-ask";

/// The public half of Igrek's update key, set when the release build is made (docs/desktop.md).
/// Without it the app is built without updates.
const UPDATER_KEY: Option<&str> = option_env!("IGREK_UPDATER_PUBKEY");

/// The tray menu's items, kept to change their words when the user picks another language.
struct TrayItems {
    open: MenuItem<tauri::Wry>,
    hide: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

fn show(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Ctrl+Space from another program: bring Igrek forward with its quick question open. While Igrek
/// itself has the focus the shortcut is not taken, so the web app's own Ctrl+Space (and the code
/// editor's) keep working as in the browser.
fn quick_ask(app: &AppHandle) {
    show(app);
    if let Some(window) = main_window(app) {
        let _ = window.eval("window.dispatchEvent(new CustomEvent('igrek:quick-ask'))");
    }
}

/// Ctrl+Shift+Space from another program: Igrek comes forward with the screen helper open. No picture
/// is taken yet; the helper takes one only when the user presses its button.
fn screen_ask(app: &AppHandle) {
    // The screen is taken before Igrek comes forward (as Clicky does), so it shows what the user was
    // looking at when they pressed the key. Nothing is sent: the helper shows it and waits for "Send".
    let handle = app.clone();
    std::thread::spawn(move || {
        let picture = capture::screen_png().ok();
        if let Some(state) = handle.try_state::<PendingShot>() {
            *state.0.lock().unwrap_or_else(|e| e.into_inner()) = picture;
        }
        show(&handle);
        if let Some(window) = main_window(&handle) {
            let _ = window.eval("window.dispatchEvent(new CustomEvent('igrek:screen-ask'))");
        }
    });
}

/// The picture taken when the screen helper's key was pressed, until the page takes it (once).
#[derive(Default)]
struct PendingShot(Mutex<Option<String>>);

#[tauri::command]
fn take_pending_shot(state: State<PendingShot>) -> Option<String> {
    state.0.lock().unwrap_or_else(|e| e.into_inner()).take()
}

/// The screen helper's picture: Igrek's window steps aside while it is taken, then comes back.
#[tauri::command]
async fn capture_screen(app: AppHandle) -> Result<String, String> {
    let window = main_window(&app).ok_or("No window")?;
    tauri::async_runtime::spawn_blocking(move || {
        let aside = overlay::step_aside(&window);
        let picture = capture::screen_png();
        overlay::come_back(&window, &aside);
        picture
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The pointer on the real screen where an answer points (a place on the screen helper's picture).
#[tauri::command]
fn show_pointer(app: AppHandle, x: f64, y: f64, width: f64, height: f64, label: String) -> Result<(), String> {
    let (sx, sy) = overlay::to_screen(&app, x, y, width, height);
    overlay::show_pointer(&app, sx, sy, &label)
}

/// The answer read out loud with the system's own voice.
#[tauri::command]
fn speak(text: String, language: String) -> Result<(), String> {
    overlay::speak(&text, &language)
}

/// One step the user allowed on the desktop: a click on a place of the picture, typing, or a key.
/// Igrek's window steps aside while it happens, so it lands on what the user saw.
#[tauri::command]
async fn screen_step(
    app: AppHandle,
    action: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    text: String,
) -> Result<(), String> {
    let (sx, sy) = overlay::to_screen(&app, x, y, width, height);
    let window = main_window(&app).ok_or("No window")?;
    tauri::async_runtime::spawn_blocking(move || {
        let aside = overlay::step_aside(&window);
        let done = overlay::input_step(&action, sx, sy, &text);
        overlay::come_back(&window, &aside);
        done
    })
    .await
    .map_err(|e| e.to_string())?
}

fn quick_ask_at_start() -> bool {
    std::env::args().any(|a| a == QUICK_ASK_ARG)
}

fn updates_enabled() -> bool {
    UPDATER_KEY.is_some_and(|key| !key.trim().is_empty())
}

/// A system notification, for the web app's desktop notifications.
#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: AppHandle, on: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if on { manager.enable() } else { manager.disable() }.map_err(|e| e.to_string())
}

/// The newer version waiting, if any. An error when this build has no update key.
#[tauri::command]
async fn update_check(app: AppHandle) -> Result<Option<String>, String> {
    if !updates_enabled() {
        return Err("off".into());
    }
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| u.version))
}

/// How much of the update has come down: bytes so far, and the size when the server gave one.
#[derive(Default)]
struct UpdateProgress(Mutex<(u64, Option<u64>)>);

/// Downloads the update, checks its signature against Igrek's key, installs it and restarts.
#[tauri::command]
async fn update_install(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(());
    };
    let progress = app.state::<UpdateProgress>();
    let set = |value: (u64, Option<u64>)| {
        if let Ok(mut p) = progress.0.lock() {
            *p = value;
        }
    };
    set((0, None));
    let mut done = 0u64;
    let downloaded = update
        .download_and_install(
            |chunk, total| {
                done += chunk as u64;
                set((done, total));
            },
            || {},
        )
        .await;
    downloaded.map_err(|e| e.to_string())?;
    app.restart();
}

/// Read by Settings while an update installs: the download took minutes and showed nothing moving.
#[tauri::command]
fn update_progress(progress: State<UpdateProgress>) -> (u64, Option<u64>) {
    progress.0.lock().map(|p| *p).unwrap_or_default()
}

/// The tray menu in the language the user chose in Igrek.
#[tauri::command]
fn tray_texts(items: State<TrayItems>, open: String, hide: String, quit: String) {
    let _ = items.open.set_text(open);
    let _ = items.hide.set_text(hide);
    let _ = items.quit.set_text(quit);
}

fn tray(app: &AppHandle) -> tauri::Result<()> {
    let items = TrayItems {
        open: MenuItem::with_id(app, "open", texts::get("desktop.trayOpen"), true, None::<&str>)?,
        hide: MenuItem::with_id(app, "hide", texts::get("desktop.trayHide"), true, None::<&str>)?,
        quit: MenuItem::with_id(app, "quit", texts::get("desktop.trayQuit"), true, None::<&str>)?,
    };
    let menu = Menu::with_items(app, &[&items.open, &items.hide, &items.quit])?;
    let mut builder = TrayIconBuilder::with_id("igrek")
        .tooltip("Igrek")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show(app),
            "hide" => {
                if let Some(window) = main_window(app) {
                    let _ = window.hide();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    app.manage(items);
    Ok(())
}

/// Links that would open a new tab (target="_blank") go to the user's own browser.
fn window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let opener = app.clone();
    WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("Igrek")
        .inner_size(1280.0, 820.0)
        .min_inner_size(720.0, 480.0)
        .on_new_window(move |url, _| {
            let _ = opener.opener().open_url(url.as_str(), None::<&str>);
            NewWindowResponse::Deny
        })
        .build()
}

/// Starts the server in the background; the window shows a quiet loading page until it answers,
/// then the app itself. If it does not start, the loading page says so and where the log is.
fn start_server(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let resources = app.path().resource_dir().map(|d| d.join("resources")).unwrap_or_default();
        let logs = app.path().app_log_dir().unwrap_or_else(|_| std::env::temp_dir());
        let _ = std::fs::create_dir_all(&logs);
        let log = logs.join("server.log");
        let Some(window) = main_window(&app) else { return };
        match server::start(&resources, &log) {
            Ok((child, port)) => {
                *app.state::<Server>().0.lock().unwrap() = Some(child);
                let origin = format!("http://127.0.0.1:{port}");
                // Only this server's pages may call the commands above; no other page the window
                // might show (a link, a project's dev server) can.
                let _ = app.add_capability(
                    CapabilityBuilder::new("igrek-server")
                        // Every page of it, not only the first (Settings calls them too).
                        .remote(format!("{origin}/*"))
                        .window(MAIN)
                        .permission("allow-notify")
                        .permission("allow-autostart")
                        .permission("allow-set-autostart")
                        .permission("allow-update-check")
                        .permission("allow-update-install")
                        .permission("allow-update-progress")
                        .permission("allow-tray-texts")
                        .permission("allow-capture-screen")
                        .permission("allow-take-pending-shot")
                        .permission("allow-show-pointer")
                        .permission("allow-speak")
                        .permission("allow-screen-step"),
                );
                // Started by the user's quick-question shortcut while Igrek was closed: the page
                // opens with it (takeQuickAskFromStart in the web app).
                let start = if quick_ask_at_start() {
                    format!("{origin}/?quick-ask")
                } else if std::env::args().any(|a| a == SCREEN_ASK_ARG) {
                    format!("{origin}/?screen-ask")
                } else {
                    origin.clone()
                };
                if let Ok(url) = start.parse() {
                    let _ = window.navigate(url);
                }
            }
            Err(reason) => {
                // A server that fails at once can beat the loading page; let the page be there first.
                std::thread::sleep(std::time::Duration::from_millis(500));
                let message = format!("{} ({reason})", texts::get("desktop.serverFailed"));
                let detail = format!("{}: {}", texts::get("desktop.serverLog"), log.display());
                let script = format!(
                    "window.showError({}, {})",
                    serde_json::Value::from(message),
                    serde_json::Value::from(detail)
                );
                let _ = window.eval(&script);
            }
        }
    });
}

fn stop_server(app: &AppHandle) {
    let child = app.try_state::<Server>().and_then(|s| s.0.lock().unwrap().take());
    if let Some(child) = child {
        server::stop(child);
    }
}

fn main() {
    // Claude Code starting Igrek's MCP tools through this program (see server::run_helper).
    if let Some(role) = std::env::args().nth(1).filter(|a| a == "mcp") {
        std::process::exit(server::run_helper(&role));
    }

    let mut builder = tauri::Builder::default()
        // A second start brings the open window forward instead of a second server on the same data.
        // `--quick-ask` opens the quick question too: where the system does not let a program take a
        // shortcut for itself (Wayland), the user binds Ctrl+Space to that command instead.
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if args.iter().any(|a| a == QUICK_ASK_ARG) {
                quick_ask(app)
            } else if args.iter().any(|a| a == SCREEN_ASK_ARG) {
                screen_ask(app)
            } else {
                show(app)
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if SCREEN_ASK.parse::<Shortcut>().is_ok_and(|screen| &screen == shortcut) {
                        screen_ask(app);
                    } else {
                        quick_ask(app);
                    }
                })
                .build(),
        )
        .manage(Server(Default::default()))
        .manage(UpdateProgress::default())
        .manage(PendingShot::default())
        .invoke_handler(tauri::generate_handler![
            notify,
            autostart,
            set_autostart,
            update_check,
            update_install,
            update_progress,
            tray_texts,
            capture_screen,
            take_pending_shot,
            show_pointer,
            speak,
            screen_step
        ]);
    if let Some(key) = UPDATER_KEY.filter(|_| updates_enabled()) {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().pubkey(key).build());
    }

    let app = builder
        .setup(|app| {
            let handle = app.handle();
            #[cfg(target_os = "linux")]
            launcher::register();
            tray(handle)?;
            let window = window(handle)?;
            for key in [QUICK_ASK, SCREEN_ASK] {
                if let Ok(shortcut) = key.parse::<Shortcut>() {
                    // Until the window first has the focus.
                    let _ = handle.global_shortcut().register(shortcut);
                }
            }
            let focus = handle.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Focused(focused) = event {
                    let shortcuts = focus.global_shortcut();
                    for key in [QUICK_ASK, SCREEN_ASK] {
                        if let Ok(shortcut) = key.parse::<Shortcut>() {
                            // Taken by another program (some input methods use Ctrl+Space): Igrek's own
                            // shortcuts still work inside its window.
                            let _ = if *focused { shortcuts.unregister(shortcut) } else { shortcuts.register(shortcut) };
                        }
                    }
                }
            });
            start_server(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Igrek could not start");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            stop_server(app);
        }
    });
}
