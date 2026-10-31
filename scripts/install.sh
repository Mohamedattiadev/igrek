#!/bin/sh
# Installs or updates Igrek on Linux and macOS, without Docker and without the source code:
#   curl -fsSL https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.sh | sh
# It downloads the ready-made server of the latest release (igrek-server.tar.gz) and installs Bun when
# missing (from bun.sh, Bun's own installer). Nothing is sent anywhere else, and nothing runs as root.
# IGREK_DIR chooses the folder (default ~/.local/share/igrek-app); IGREK_PACKAGE installs a package
# file you already have instead of downloading one. Your data (~/.igrek) is never touched.
set -eu

URL="${IGREK_RELEASES:-https://github.com/Mohamedattiadev/igrek/releases/latest/download}/igrek-server.tar.gz"
DIR="${IGREK_DIR:-$HOME/.local/share/igrek-app}"
BIN="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { say "Igrek install: $*" >&2; exit 1; }

command -v tar >/dev/null 2>&1 || fail "tar is needed. Install it with your package manager and run this again."
command -v curl >/dev/null 2>&1 || fail "curl is needed. Install it with your package manager and run this again."

if ! command -v bun >/dev/null 2>&1 && [ ! -x "$HOME/.bun/bin/bun" ]; then
  say "Installing Bun (bun.sh)..."
  curl -fsSL https://bun.sh/install | bash
fi
PATH="$HOME/.bun/bin:$PATH"
export PATH

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [ -n "${IGREK_PACKAGE:-}" ]; then
  cp "$IGREK_PACKAGE" "$TMP/igrek-server.tar.gz"
else
  say "Downloading Igrek..."
  curl -fL --progress-bar "$URL" -o "$TMP/igrek-server.tar.gz" || fail "could not download $URL"
fi
mkdir -p "$TMP/new"
tar -xzf "$TMP/igrek-server.tar.gz" -C "$TMP/new" || fail "the download is damaged; run this again."
[ -f "$TMP/new/server/desktop.js" ] || fail "the download is not an Igrek server package."

# An older install from the source code, or an older package: replaced whole (the data lives elsewhere).
mkdir -p "$(dirname "$DIR")"
rm -rf "$DIR"
mv "$TMP/new" "$DIR"

mkdir -p "$BIN"
cat > "$BIN/igrek" <<LAUNCH
#!/bin/sh
# Starts Igrek (installed by scripts/install.sh). "igrek doctor" and the other commands pass through.
PATH="\$HOME/.bun/bin:\$PATH"
export IGREK_RESOURCES="$DIR" IGREK_STDIN_LIFELINE=0
if [ \$# -eq 0 ]; then exec bun "$DIR/server/desktop.js"; fi
exec bun "$DIR/server/cli.js" "\$@"
LAUNCH
chmod +x "$BIN/igrek"

say ""
say "Igrek is installed. Start it with:  igrek"
say "Then open http://localhost:7777 (Settings > Igrek as an app gives it a window of its own)."
case ":$PATH:" in *":$BIN:"*) ;; *) say "Note: add $BIN to your PATH, or run $BIN/igrek." ;; esac
say "You also need Claude Code: https://docs.claude.com/en/docs/claude-code (run 'claude' once to log in)."
