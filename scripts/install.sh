#!/bin/sh
# Installs or updates Igrek on Linux and macOS, without Docker:
#   curl -fsSL https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.sh | sh
# It needs git; Bun is installed when missing (from bun.sh, Bun's own installer). Nothing is sent
# anywhere else, and nothing runs as root. IGREK_DIR chooses the folder (default ~/.local/share/igrek-app).
set -eu

REPO="${IGREK_REPO:-https://github.com/Mohamedattiadev/igrek.git}"
DIR="${IGREK_DIR:-$HOME/.local/share/igrek-app}"
BIN="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { say "Igrek install: $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is needed. Install it (macOS: xcode-select --install; Linux: your package manager) and run this again."

if ! command -v bun >/dev/null 2>&1 && [ ! -x "$HOME/.bun/bin/bun" ]; then
  say "Installing Bun (bun.sh)..."
  curl -fsSL https://bun.sh/install | bash
fi
PATH="$HOME/.bun/bin:$PATH"
export PATH

if [ -d "$DIR/.git" ]; then
  say "Updating Igrek in $DIR..."
  git -C "$DIR" pull --ff-only
else
  say "Downloading Igrek into $DIR..."
  mkdir -p "$(dirname "$DIR")"
  git clone --depth 1 "$REPO" "$DIR"
fi

cd "$DIR"
bun install --frozen-lockfile
bun run build

mkdir -p "$BIN"
cat > "$BIN/igrek" <<LAUNCH
#!/bin/sh
# Starts Igrek (installed by scripts/install.sh). "igrek doctor" and the other commands pass through.
PATH="\$HOME/.bun/bin:\$PATH"
cd "$DIR" || exit 1
if [ \$# -eq 0 ]; then exec bun run start; fi
exec bun run apps/server/src/cli.ts "\$@"
LAUNCH
chmod +x "$BIN/igrek"

say ""
say "Igrek is installed. Start it with:  igrek"
say "Then open http://localhost:7777 (Settings > Igrek as an app gives it a window of its own)."
case ":$PATH:" in *":$BIN:"*) ;; *) say "Note: add $BIN to your PATH, or run $BIN/igrek." ;; esac
say "You also need Claude Code: https://docs.claude.com/en/docs/claude-code (run 'claude' once to log in)."
