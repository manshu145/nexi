# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for the Nexigrate student web app on Cloud Run.
#
# Build from the repo root:
#   docker build -f apps/web/Dockerfile -t nexigrate-web:local .

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# Resolve workspace deps first, for layer cache.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# Copy sources and build.
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @nexigrate/shared build
RUN pnpm --filter @nexigrate/web build

# ---------- runner ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Next standalone bundle has its own node_modules; we just need the bundle.
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080

CMD ["node", "apps/web/server.js"]
