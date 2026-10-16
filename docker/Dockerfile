# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.4.3

# ---- 1. Build the web UI ---------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/i18n/package.json packages/i18n/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- 2. Production dependencies only ---------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/i18n/package.json packages/i18n/
RUN bun install --frozen-lockfile --production --filter '@godeye/server'

# ---- 3. Runtime --------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runtime
# Set to "true" to bake Claude Code into the image (adds its native binary).
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

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY packages/core packages/core
COPY packages/i18n packages/i18n
COPY --from=build /app/apps/web/dist apps/web/dist

ENV NODE_ENV=production \
    GODEYE_HOST=0.0.0.0 \
    GODEYE_PORT=7777 \
    GODEYE_WEB_DIST=/app/apps/web/dist

EXPOSE 7777
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:7777/api/health',{headers:{host:'localhost:7777'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "apps/server/src/index.ts"]
