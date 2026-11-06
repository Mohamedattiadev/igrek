#!/bin/sh
# Installs or updates an Igrek team hub on a server with Docker:
#   curl -fsSL https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install-hub.sh | sh -s -- hub.example.com
# Point the domain's DNS at the server first; Caddy then gets the HTTPS certificate by itself. Without a
# domain the hub listens on 127.0.0.1:7700 only. Running it again updates the hub and keeps its data and keys.
# IGREK_HUB_DIR chooses the folder (default ~/igrek-hub); IGREK_HUB_IMAGE_FILE uses an image file you already have.
set -eu

DOMAIN="${1:-}"
ADMIN="${2:-admin}"
DIR="${IGREK_HUB_DIR:-$HOME/igrek-hub}"
RELEASES="${IGREK_RELEASES:-https://github.com/Mohamedattiadev/igrek/releases/latest/download}"
PORT="${IGREK_HUB_PORT:-7700}"

say() { printf '%s\n' "$*"; }
fail() { say "Igrek hub install: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker is needed: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose is needed: https://docs.docker.com/compose/install/"
command -v openssl >/dev/null 2>&1 || fail "openssl is needed."
case "$ADMIN" in *[!A-Za-z0-9_.-]*) fail "the admin name can have letters, numbers, dots, dashes and underscores." ;; esac
case "$DOMAIN" in *[!A-Za-z0-9.-]*) fail "write the domain alone, like hub.example.com." ;; esac

mkdir -p "$DIR"
cd "$DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [ -n "${IGREK_HUB_IMAGE_FILE:-}" ]; then
  docker load -i "$IGREK_HUB_IMAGE_FILE" >/dev/null
else
  say "Downloading the hub..."
  command -v curl >/dev/null 2>&1 || fail "curl is needed."
  curl -fL --progress-bar "$RELEASES/igrek-hub-image.tar.gz" -o "$TMP/hub.tar.gz" || fail "could not download the hub."
  docker load -i "$TMP/hub.tar.gz" >/dev/null
fi

# The backup key is made once and never replaced: without it old backups cannot be opened.
if [ ! -f hub.env ]; then
  umask 077
  printf 'HUB_BACKUP_KEY=%s\n' "$(openssl rand -base64 32)" >hub.env
  umask 022
fi

cat >compose.yml <<YAML
services:
  hub:
    image: igrek-hub:local
    container_name: igrek-hub
    restart: unless-stopped
    ports:
      - "127.0.0.1:$PORT:7700"
    environment:
      HUB_TRUST_PROXY: "1"
    env_file: hub.env
    volumes:
      - hub-data:/data
    mem_limit: 256m
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
YAML
if [ -n "$DOMAIN" ]; then
  cat >Caddyfile <<CADDY
$DOMAIN {
	encode zstd gzip
	reverse_proxy hub:7700
}
CADDY
  cat >>compose.yml <<YAML
  caddy:
    image: caddy:2.10.2-alpine
    container_name: igrek-hub-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
YAML
fi
cat >>compose.yml <<YAML
volumes:
  hub-data:
YAML
[ -z "$DOMAIN" ] || printf '  caddy-data:\n  caddy-config:\n' >>compose.yml

docker compose up -d --force-recreate hub >/dev/null 2>&1 || fail "the hub did not start. See: cd $DIR && docker compose logs hub"
[ -z "$DOMAIN" ] || docker compose up -d caddy >/dev/null 2>&1 || fail "HTTPS did not start. See: cd $DIR && docker compose logs caddy"

say "Waiting for the hub..."
tries=0
until docker compose exec -T hub igrek-hub health >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -lt 30 ] || fail "the hub did not start. See: cd $DIR && docker compose logs hub"
  sleep 1
done

PASSWORD=""
if [ ! -f .admin-created ]; then
  PASSWORD="$(openssl rand -base64 18 | tr -d '/+=')"
  docker compose exec -T -e HUB_PASSWORD="$PASSWORD" hub igrek-hub create-admin "$ADMIN" >/dev/null ||
    fail "could not create the first admin."
  : >.admin-created
fi

say ""
ADDRESS="http://127.0.0.1:$PORT"
[ -z "$DOMAIN" ] || ADDRESS="https://$DOMAIN"
say "The hub is running. Address: $ADDRESS"
if [ -n "$PASSWORD" ]; then
  say "In Igrek: Team > Sign in with username."
  say "  Username: $ADMIN"
  say "  Password: $PASSWORD   (shown once, change it after signing in)"
fi
say ""
say "Backups run every day into the hub's data. Copy the key in $DIR/hub.env somewhere safe, off this"
say "server: without it no backup can be opened. To keep backups off the server too, add the HUB_S3_ settings."
