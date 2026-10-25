#!/usr/bin/env bash
# The Linux AppImage the way a user first opens it (docs/release.md): no runtime yet, an empty data
# folder. It must fetch Bun, start its server, and that server must say this release's version.
# 0.1.5 shipped without this check and could not start (its download crashed on the AppImage's
# libraries). Run on the CI runner, under a virtual screen.
#
#   bash apps/desktop/scripts/first-start.sh <Igrek_x.y.z_amd64.AppImage> <x.y.z>
set -euo pipefail
image="$1"
version="$2"
chmod +x "$image"
data="$(mktemp -d)"
home="$(mktemp -d)"
log="$data/dev.igrek.desktop/logs/server.log"
# A virtual screen where there is none (CI); a desktop session uses its own screen.
screen=()
command -v xvfb-run >/dev/null && screen=(xvfb-run -a)
# No FUSE on the runner: the AppImage unpacks itself and runs from there.
APPIMAGE_EXTRACT_AND_RUN=1 XDG_DATA_HOME="$data" IGREK_HOME="$home" "${screen[@]}" "$image" &
app=$!
ok=""
for _ in $(seq 1 240); do
  if [ -f "$log" ] && grep -q "Igrek .* →" "$log"; then
    ok="yes"
    break
  fi
  kill -0 "$app" 2>/dev/null || break
  sleep 1
done
kill "$app" 2>/dev/null || true
sleep 3
if [ -z "$ok" ]; then
  echo "x the server did not start within 4 minutes"
  [ -f "$log" ] && cat "$log"
  ls -la "$data/igrek-runtime" 2>/dev/null || echo "x no runtime was fetched"
  exit 1
fi
grep "Igrek .* →" "$log"
if ! grep -q "Igrek $version →" "$log"; then
  echo "x the server does not say version $version"
  exit 1
fi
[ -x "$data/igrek-runtime/bun-"*/bun ] || { echo "x the runtime is not where the app keeps it"; exit 1; }
echo "first start: runtime fetched and checked, server $version answering"
rm -rf "$data" "$home"
