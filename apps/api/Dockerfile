# syntax=docker/dockerfile:1.7
#
# Single-stage Dockerfile for the Nexigrate API on Cloud Run.
# Simplified: builds everything in one stage to avoid workspace-linking issues.
#
# Build from the repo root:
#   docker build -f apps/api/Dockerfile -t nexigrate-api:local .

FROM node:22-alpine

# Enable pnpm via corepack (bundled with Node 22).
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./

# Copy all workspace package.json files for dependency resolution
COPY packages/shared/package.json       packages/shared/package.json
COPY packages/credits/package.json      packages/credits/package.json
COPY packages/ai-pipeline/package.json  packages/ai-pipeline/package.json
COPY apps/api/package.json              apps/api/package.json

# Install ALL dependencies (dev + prod) so tsc can run
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared       packages/shared
COPY packages/credits      packages/credits
COPY packages/ai-pipeline  packages/ai-pipeline
COPY apps/api              apps/api

# Build in dependency order. The ai-pipeline build MUST run before
# apps/api because aiEngine.ts imports from `@nexigrate/ai-pipeline` and
# pnpm's workspace-link surfaces the package via its `dist/` output --
# without this step, the symlink points at an empty directory and
# tsc fails with TS2307 (Cannot find module).
RUN pnpm --filter @nexigrate/shared build && \
    pnpm --filter @nexigrate/credits build && \
    pnpm --filter @nexigrate/ai-pipeline build && \
    pnpm --filter @nexigrate/api build

# Run as non-root
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

# Cloud Run sets PORT; default to 8080 locally.
ENV PORT=8080
EXPOSE 8080

# Start the server - NODE_ENV is set via Cloud Run env vars, NOT here
# (so we can control it per-revision without rebuilding)
CMD ["node", "apps/api/dist/server.js"]
