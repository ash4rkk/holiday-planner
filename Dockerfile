# syntax=docker/dockerfile:1
# Jeden obraz bazowy dla całego monorepo; serwisy to osobne cele (target).

FROM node:26-alpine AS base
# Node 25+ nie ma już corepacka — pnpm w wersji z packageManager instalujemy wprost.
RUN npm install -g pnpm@11.10.0 && npm cache clean --force
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/sync/package.json apps/sync/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS source
COPY . .

# Migracje Drizzle — uruchamiane raz przed startem web.
FROM source AS migrate
USER node
CMD ["pnpm", "--filter", "@planer/core", "db:migrate"]

FROM source AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @planer/web build

FROM node:26-alpine AS web
WORKDIR /app
# PDF z planu wyjazdu (lib/export/pdf.ts): Chromium i fonty z polskimi znakami.
RUN apk add --no-cache chromium font-dejavu
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S planer && adduser -S planer -G planer
# Katalog załączników (UPLOAD_DIR) należy do planer; pusty nazwany wolumen montowany tutaj
# przejmuje właściciela z obrazu przy pierwszym montowaniu.
RUN mkdir -p /data/uploads && chown planer:planer /data/uploads
COPY --from=web-build --chown=planer:planer /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=planer:planer /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=planer:planer /repo/apps/web/public ./apps/web/public
USER planer
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# Node wprost jako PID 1: pnpm nie przekazuje SIGTERM, więc server.destroy() nie zapisałby dokumentów.
FROM source AS sync
ENV NODE_ENV=production
WORKDIR /repo/apps/sync
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM source AS worker
ENV NODE_ENV=production
# Nocne kopie: pg_dump zgodny z serwerem (PostgreSQL 17).
RUN apk add --no-cache postgresql17-client
WORKDIR /repo/apps/worker
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]
