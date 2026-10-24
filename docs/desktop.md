# The desktop app

Igrek in a window of its own (plan.md Faz 17), made with [Tauri 2](https://tauri.app) in `apps/desktop`.

## How it works

- The window shows the same web app the browser does. Igrek's server is built into one file with
  `bun build --compile` (`apps/server/src/desktop.ts` is its entry) and shipped beside the app as a Tauri
  "sidecar". The app starts it hidden on a free port on 127.0.0.1, shows a loading page until it answers, then
  opens it.
- The data folder is the usual one (`~/.igrek`, or `IGREK_HOME`), so the app, the browser version and the CLI
  share the same data. Run only one of them at a time.
- The app holds the server's stdin open. When the app closes, or is killed, stdin closes and the server stops the
  way Ctrl+C stops it: chats, terminals and dev servers it started are stopped too. If it has not stopped after
  10 seconds the app ends it.
- Files the single-file server cannot hold as files (the web app, cheat sheets, the preview helpers, axe) are
  shipped as Tauri resources; `apps/server/src/packaged.ts` finds them (`IGREK_RESOURCES`).
- Started from a launcher or Finder, programs get a short PATH. The app asks the user's login shell for its PATH
  (`$SHELL -ilc env`), so `claude`, `codex` and `git` are found as in a terminal.
- The AppImage runs with its own libraries first (`LD_LIBRARY_PATH`, `PYTHONHOME`, `GTK_PATH` and others point
  into its mount). The server gets the environment without them, so the programs it starts load the system's
  libraries; passed on, they broke Codex ("symbol lookup error").
- Claude Code and Codex are not inside. When they are missing, the first-run wizard shows each one's install
  command.
- Only pages of this server (the exact `http://127.0.0.1:<port>`) may call the app's commands: notifications,
  start with the computer, the tray menu's words, updates (`src-tauri/src/main.rs`).

On Linux the .deb puts Igrek in the desktop's app search. An AppImage is not installed by anything, so on
each start it writes that entry itself (`~/.local/share/applications/igrek-desktop.desktop` and its icon),
pointing at where the file is now; save it somewhere lasting (for example `~/Applications`) and start it once.

Around the window: a tray icon (Open, Hide, Quit), the system's notifications for Igrek's desktop notifications,
"Start with the computer" in Settings (off by default), and `Ctrl+Space` from any program for a quick question.
While Igrek's window has the focus the shortcut is left to the web app, so `Ctrl+Space` in the code editor
still completes code.

Known limits:

- Searching the library by meaning needs ONNX Runtime, which cannot travel inside one file; the app searches by
  words. The browser version from source still has both.
- On Linux under Wayland, many desktops do not let a program take a shortcut for the whole system; there
  `Ctrl+Space` works inside Igrek's window only. Bind it in the desktop's own settings to the app with
  `--quick-ask` instead, which opens the quick question in the running Igrek (Hyprland:
  `bind = CTRL, SPACE, exec, ~/Applications/Igrek.AppImage --quick-ask`). Input methods (IBus, Fcitx) may
  also own `Ctrl+Space`.
- The built-in terminal does not work on Windows (as in the browser version).

## Building it on your computer

You need Rust (<https://rustup.rs>) and Bun. On Linux also the WebKitGTK libraries
(Debian/Ubuntu: `libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`;
Arch: `webkit2gtk-4.1 libappindicator-gtk3 librsvg xdotool`).

```sh
bun install
bun run build                       # the web app
cd apps/desktop
bun run app -- --bundles appimage   # or deb, msi, dmg; the package is in src-tauri/target/release/bundle
```

To check the built server without the app: it starts as the app starts it, must answer with the web app, and must
stop once its stdin closes, which is how the app stops it. The workflow runs this on every system.

```sh
bun run sidecar
bun scripts/smoke.ts
```

The Rust build takes a few GB; `CARGO_TARGET_DIR` can put it elsewhere, and deleting it afterwards is safe.

## Packages for every system

`.github/workflows/desktop.yml` makes the AppImage and .deb (Ubuntu 22.04), the .msi (Windows) and the .dmg
(macOS, Apple silicon and Intel) on GitHub's free runners. It runs by hand (Actions > Desktop app > Run workflow)
or when a `v*` tag is pushed. It publishes nothing: the packages stay on the run as artifacts.

The packages are not signed with a paid OS certificate. Windows and macOS ask once on first start; the steps are
in the README and on the site. The Mac app has an ad-hoc signature, which Apple silicon needs to run it at all.

## Updates and the update key

The app updates itself with Tauri's updater. Each update is signed with Igrek's own key (not an OS certificate),
and the app installs only what that key signed. The key is made once, by the maintainer, and is never committed.

1. Make the key pair (asks for a password; keep it):

   ```sh
   cd apps/desktop
   bun run tauri signer generate -w ~/.tauri/igrek-updater.key
   ```

   This writes `~/.tauri/igrek-updater.key` (private) and `~/.tauri/igrek-updater.key.pub` (public). Keep a copy of
   the private key and its password somewhere safe: without them no installed app can be updated again, and a
   new key means everyone has to install the app by hand once more.

2. On GitHub, open the repository's **Settings > Secrets and variables > Actions**:

   - **Secrets** tab, **New repository secret**:
     - `TAURI_SIGNING_PRIVATE_KEY`: the whole content of `~/.tauri/igrek-updater.key`
     - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password
   - **Variables** tab, **New repository variable**:
     - `TAURI_UPDATER_PUBKEY`: the whole content of `~/.tauri/igrek-updater.key.pub` (it is public)

   The workflow builds the public key into the app (`IGREK_UPDATER_PUBKEY`) and signs the packages with the
   private one. Without them it still makes the packages, but that app cannot update itself and says so in
   Settings.

3. A release:

   ```sh
   git tag v0.2.0 && git push origin v0.2.0
   ```

   The run's version is the tag's. When it is done, download its artifacts, make a release for the tag on GitHub
   (Releases > Draft a new release) and upload every file: the packages, their `.sig` files, the
   `.app.tar.gz` files and `latest.json`. Installed apps read
   `https://github.com/Mohamedattiadev/igrek/releases/latest/download/latest.json`, so they see the new version
   once the release is published (not while it is a draft).
