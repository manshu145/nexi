# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for the Nexigrate API on Cloud Run.
#
# Stage 1: install dependencies (pnpm) and build the TypeScript into ./dist.
# Stage 2: a minimal runtime image with just node + production node_modules.
#
# Build from the repo root:
#   docker build -f apps/api/Dockerfile -t nexigrate-api:local .

# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder

# Enable pnpm via corepack (bundled with Node 22).
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo

# Copy only the files needed to resolve the workspace, to maximise cache reuse.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/shared/package.json   packages/shared/package.json
COPY packages/credits/package.json  packages/credits/package.json
COPY apps/api/package.json          apps/api/package.json

RUN pnpm install --frozen-lockfile

# Copy sources and build workspace packages first, then the api.
COPY packages/shared  packages/shared
COPY packages/credits packages/credits
COPY apps/api         apps/api

# Build shared + credits BEFORE the api (api imports their dist/ output)
RUN pnpm --filter @nexigrate/shared build && \
    pnpm --filter @nexigrate/credits build && \
    pnpm --filter @nexigrate/api build

# ---------- Stage 2: runner ----------
FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy only what the runtime needs.
COPY --from=builder /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=builder /repo/packages packages
COPY --from=builder /repo/apps/api/package.json apps/api/package.json
COPY --from=builder /repo/apps/api/dist         apps/api/dist

# Production-only install -- much smaller node_modules than the builder layer.
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

# Run as a non-root user for defence in depth.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

# Cloud Run sets PORT; default to 8080 locally.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "apps/api/dist/server.js"]
