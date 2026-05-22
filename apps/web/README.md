# @nexigrate/web

Student-facing web app at `app.nexigrate.com`.

## Stack

- Next.js 15 (App Router) with `output: 'standalone'`
- React 19
- Tailwind CSS v4 (PostCSS plugin)
- Firebase Web SDK for auth (Google sign-in primary; Phone OTP fallback in 2.5)
- Talks to the api via the typed client in `src/lib/api.ts`
- Deploys as a containerized Cloud Run service

## Pages

```
/                  client-side redirect: signed-in -> /dashboard, else -> /signin
/signin            Google sign-in
/onboarding        target-exam picker (one screen)
/dashboard         today's MCQ card + credits balance + verification badge
/mcq               daily MCQ player (10 questions, no nav-away)
/mcq/result        score, +credits earned, full review with explanations
```

## Run locally

```bash
cp apps/web/.env.example apps/web/.env.local
# point NEXT_PUBLIC_API_BASE_URL at your local api (default: http://localhost:9090)

# in one terminal:
PORT=9090 AUTH_MODE=stub PERSISTENCE=memory pnpm --filter @nexigrate/api dev

# in another:
pnpm --filter @nexigrate/web dev
# -> http://localhost:3000
```

For the local-dev path with stub auth, the api accepts `Authorization: Bearer stub:<uid>:<role>`. The browser flow uses real Firebase IDs, so flip the api to `AUTH_MODE=firebase` once you start exercising the full chain.

## Deploy

`.github/workflows/deploy-web.yml` (Phase 2.4 follow-up) builds the Dockerfile and pushes to Cloud Run on every push to main that touches `apps/web` or `packages/shared`. Custom domain `app.nexigrate.com` mapped via Cloud Run domain mappings (one-time dashboard step).
