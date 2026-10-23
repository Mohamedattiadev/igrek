# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.4.3

# ---- 1. Build the web UI ---------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app
# Igrek sends nothing anywhere: OpenUI's install telemetry stays off (plan.md 16.2).
ENV OPENUI_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/hub/package.json apps/hub/
COPY apps/desktop/package.json apps/desktop/
COPY packages/core/package.json packages/core/
COPY packages/i18n/package.json packages/i18n/
COPY packages/learn/package.json packages/learn/
COPY packages/genui/package.json packages/genui/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- 2. Production dependencies only ---------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS deps
WORKDIR /app
ENV OPENUI_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/hub/package.json apps/hub/
COPY apps/desktop/package.json apps/desktop/
COPY packages/core/package.json packages/core/
COPY packages/i18n/package.json packages/i18n/
COPY packages/learn/package.json packages/learn/
COPY packages/genui/package.json packages/genui/
RUN bun install --frozen-lockfile --production --filter '@igrek/server' \
 # The search model runtime ships binaries for every OS; keep only this one's (about 250 MB less).
 && ARCH=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/') \
 && for napi in $(find node_modules -type d -path '*onnxruntime-node/bin/napi-v*' -name 'napi-v*'); do \
      for os in "$napi"/*; do [ "$(basename "$os")" = linux ] || rm -rf "$os"; done; \
      for arch in "$napi"/linux/*; do [ "$(basename "$arch")" = "$ARCH" ] || rm -rf "$arch"; done; \
    done \
 # Only text is read from PDFs: no page drawing (canvas), viewer, source maps or the non-legacy build.
 && rm -rf node_modules/.bun/@napi-rs+canvas* node_modules/.bun/bun-types@* node_modules/.bun/@types+* \
 && find node_modules -type d -path '*pdfjs-dist/*' \( -name web -o -name image_decoders -o -name types \) -prune -exec rm -rf {} + \
 && find node_modules -type d -path '*node_modules/pdfjs-dist/build' -prune -exec rm -rf {} + \
 && find node_modules -name '*.map' -type f -delete

# ---- 3. Codex (optional): its npm package carries a native binary; keep only that ----
FROM oven/bun:${BUN_VERSION}-slim AS codex
ARG INSTALL_CODEX=false
ARG CODEX_VERSION=0.163.0
RUN mkdir -p /out && if [ "$INSTALL_CODEX" = "true" ]; then \
      bun install -g "@openai/codex@${CODEX_VERSION}" \
      && install -m 0755 "$(find /root/.bun/install/global/node_modules -type f -name codex -path '*vendor*' | head -1)" /out/codex; \
    fi

# ---- 4. Runtime --------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runtime
# Set to "true" to bake Claude Code / Codex into the image (each adds its native binary).
ARG INSTALL_CLAUDE=false

RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssh-client ca-certificates \
 && if [ "$INSTALL_CLAUDE" = "true" ]; then \
      apt-get install -y --no-install-recommends curl \
      && curl -fsSL https://claude.ai/install.sh | bash \
      && install -m 0755 "$(readlink -f /root/.local/bin/claude)" /usr/local/bin/claude \
      && rm -rf /root/.local /root/.cache \
      && apt-get purge -y curl && apt-get autoremove -y; \
    fi \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man
COPY --from=codex /out/ /usr/local/bin/

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY packages/core packages/core
COPY packages/i18n packages/i18n
COPY packages/learn packages/learn
COPY packages/genui packages/genui
COPY --from=build /app/apps/web/dist apps/web/dist

ENV NODE_ENV=production \
    IGREK_HOST=0.0.0.0 \
    IGREK_PORT=7777 \
    IGREK_WEB_DIST=/app/apps/web/dist

EXPOSE 7777
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:7777/api/health',{headers:{host:'localhost:7777'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "apps/server/src/index.ts"]
