# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for the Nexigrate student web app on Cloud Run.
#
# Build from the repo root:
#   docker build -f apps/web/Dockerfile -t nexigrate-web:local \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.nexigrate.com \
#     .
#
# IMPORTANT: NEXT_PUBLIC_* values are baked into the JS bundle at BUILD time
# (Next.js standalone mode). Setting them at `gcloud run deploy --set-env-vars`
# has NO effect on the browser bundle. They MUST be passed as --build-arg.

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# ---- public env (baked into the client bundle) -----------------------------
ARG NEXT_PUBLIC_API_BASE_URL=https://api.nexigrate.com
ARG NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBQuLPo3N9PMWov9sUrp7czVzBix4lPj8M
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=nexigrate-prod.firebaseapp.com
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=nexigrate-prod
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=nexigrate-prod.firebasestorage.app
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=505978726927
ARG NEXT_PUBLIC_FIREBASE_APP_ID=1:505978726927:web:066fb77f927442d1e3117a
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY=

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_VAPID_KEY=$NEXT_PUBLIC_FIREBASE_VAPID_KEY

# Resolve workspace deps first, for layer cache.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/credits/package.json packages/credits/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --no-frozen-lockfile

# Copy sources and build.
COPY packages/shared packages/shared
COPY packages/credits packages/credits
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
