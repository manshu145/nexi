# Nexigrate — Project Handoff

> **Read this first.** It tells you everything that exists, everything that doesn't, and exactly how to ship the rest.

Last updated: 2026-05-22 (end of Phase 2.2 PR).

---

## What's live right now

| Surface | State | URL |
|---|---|---|
| Marketing site | ✅ live, collecting waitlist | https://nexigrate.com |
| Waitlist API | ✅ live, KV-backed | https://nexigrate.com/api/waitlist |
| Privacy + Terms pages | ✅ live | /privacy, /terms |
| Backend API (`@nexigrate/api`) | 🟢 code complete; **not yet deployed** to Cloud Run | will be `api.nexigrate.com` |
| Student web app (`apps/web`) | ⬜ not scaffolded | will be `app.nexigrate.com` |
| Mobile apps | ⬜ not scaffolded | iOS + Android |
| Admin panel | ⬜ not scaffolded | will be `admin.nexigrate.com` |
| Razorpay payments | ⬜ not integrated | Phase 2.8 |
| AI verification pipeline | ⬜ not integrated | Phase 2.9 |

---

## The repo at a glance

```
nexi/                              github.com/manshu145/nexi
├── apps/
│   ├── marketing/    ✅ Astro static site, deployed to Cloudflare Pages
│   ├── api/          ✅ Hono on Node 22, code-complete, deploys to Cloud Run via OIDC
│   ├── web/          ⬜ placeholder README only
│   ├── mobile/       ⬜ placeholder README only
│   └── admin/        ⬜ placeholder README only
├── packages/
│   ├── shared/       ✅ types, Zod schemas, constants (used by everything else)
│   ├── credits/      ✅ pure credit engine, 15 unit tests passing
│   ├── auth/         ⬜ placeholder
│   ├── api-client/   ⬜ placeholder
│   ├── ui-web/       ⬜ placeholder
│   ├── ui-mobile/    ⬜ placeholder
│   └── ai-pipeline/  ⬜ placeholder
├── infra/
│   ├── firebase/     ✅ rules, indexes, emulator config, web SDK config
│   └── terraform/    ✅ project + WIF + Cloud Run + Artifact Registry + budget
└── .github/workflows/
    ├── ci.yml                  ✅ typecheck + build on every PR
    ├── deploy-marketing.yml    ✅ Cloudflare Pages auto-deploys (legacy fallback)
    ├── deploy-api.yml          ✅ Cloud Run deploy via OIDC (lights up next)
    └── deploy-firebase.yml     ✅ Firestore rules + indexes deploy
```

---

## How to flip the api live (1 hour, one-time)

This is the path from "code merged" to "api.nexigrate.com responds with real Firebase Auth + Firestore". It is the *only* setup work left for Phase 2.2.

### 1. Apply the Terraform (15 min)

From a laptop with `gcloud` and `terraform` installed, signed in to the `nexigrate-prod` project as a user with Owner:

```bash
gcloud auth application-default login
cd infra/terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

This creates:

- The Workload Identity Federation pool + provider for `manshu145/nexi`
- The `nexigrate` Artifact Registry repo
- The `nexigrate-api` Cloud Run service (initially with a placeholder image)
- IAM roles on the api service account: `run.admin`, `serviceAccountUser`, `artifactregistry.writer`, `datastore.user`, `storage.admin`, `serviceAccountTokenCreator`, `aiplatform.user`
- The ₹500 budget alert with 50/75/90/100% thresholds

Capture the output:

```bash
terraform output workload_identity_provider
# -> projects/505978726927/locations/global/workloadIdentityPools/github/providers/github-provider
```

### 2. Add `GCP_WORKLOAD_IDENTITY_PROVIDER` to GitHub Secrets

GitHub → repo Settings → Secrets and variables → Actions → New repository secret:

- Name: `GCP_WORKLOAD_IDENTITY_PROVIDER`
- Value: the output from step 1

(Other GCP secrets — `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT` — are already configured per the Phase 2 setup.)

### 3. Push to main → Cloud Run deploy fires automatically

Either merge a PR or push an empty commit. The `deploy-api.yml` workflow:

1. Authenticates to GCP via WIF (no JSON key)
2. Builds the multi-stage Dockerfile in `apps/api/Dockerfile` from the repo root
3. Pushes the image to Artifact Registry as `<sha>` tag
4. Deploys a new Cloud Run revision pointing at that tag
5. Smoke-tests `/healthz` 5 times

Watch in GitHub Actions. Total ~5 min on first run, ~3 min thereafter.

### 4. Map `api.nexigrate.com` to the Cloud Run service

In the Cloud Run console → `nexigrate-api` → **Domain Mappings** → Add Mapping → enter `api.nexigrate.com`. Cloudflare DNS gets a CNAME automatically; SSL takes 5–15 min.

### 5. Verify

```bash
curl https://api.nexigrate.com/healthz
# {"ok":true,"service":"nexigrate-api","env":"production","ts":"..."}

# A real Firebase ID token (from any signed-in client) should now pass auth:
curl -H "Authorization: Bearer <real-id-token>" https://api.nexigrate.com/v1/credits/balance
# {"userId":"...","total":0,"expiringSoon":0,"lastEventId":null,"computedAt":"..."}
```

---

## The credit ledger is real now

The api defaults to `PERSISTENCE=memory` in dev (zero-config local boot) and `firestore` in production. The Cloud Run env vars in `deploy-api.yml` set `PERSISTENCE=firestore`, so on first request to a user, it reads/writes the `credit_events` Firestore collection via `FirestoreLedgerStore` (in `apps/api/src/lib/firestoreLedger.ts`).

**Idempotency is enforced twice**: the engine checks the in-memory snapshot it was given, and the Firestore transaction inside `append()` re-checks `(userId, idempotencyKey)` to close the read-modify-write race. Two replicas racing the same retry produce one event, not two.

---

## How to ship the remaining phases

Each phase below is a self-contained PR you can land independently. They're ordered by leverage — Phase 2.4 unblocks the most user-facing value.

### Phase 2.4 — Student web app (`apps/web`) [biggest unlock]

What to build:

- Next.js 15 (App Router) on Cloud Run, deployed at `app.nexigrate.com`
- Firebase Auth client wired with Google sign-in primary + Phone OTP fallback
- Onboarding flow (target exam, school, optional class, optional parent contact)
- Verification upload UI (POST to `/v1/verifications/start` then upload to the signed URL)
- Kindle-style dashboard: today's plan, streak, credits balance, "resume where you left off"
- Server-side `@nexigrate/api-client` package — typed `ofetch` wrapper that auto-attaches the Firebase ID token

Estimate: 5–7 dev days for a single dev. The Firebase Web config is already in `infra/firebase/web-config.ts` — just import it.

### Phase 2.3 — Onboarding + verification routes in api

These are server-side prerequisites for 2.4:

- `POST /v1/users/me/onboarding` — first-time profile create
- `GET /v1/users/me` — fetch current profile
- `POST /v1/verifications/start` — create a Verification doc + signed upload URL
- Cloud Function `onVerificationFileUploaded` — trigger Cloud Vision OCR + Gemini check on the uploaded file, set `Verification.ai`, auto-approve above 0.85 confidence, otherwise `queued`
- Parental-consent flow for under-18 users (verifiable via parent OTP from Firebase Phone Auth)

### Phase 2.5 — Daily MCQ + reading mode

- `GET /v1/mcqs/daily` — server picks 10 questions calibrated to the user's level
- `POST /v1/mcqs/:id/attempts` — record an attempt + award credits via the engine
- MCQ reader UI (10 questions, single page, no navigation away mid-attempt)
- Read-mode chapter UI (Kindle-style paper, drop cap, page-turn keyboard nav)

### Phase 2.6 — Mobile shell

- Expo SDK on RN 0.76+, TypeScript strict
- Auth + dashboard + daily MCQ + read-mode parity with web
- EAS build pipeline (iOS + Android) with internal-distribution channel

### Phase 2.7 — Admin panel (`apps/admin`)

- Refine.dev on Next.js, deployed at `admin.nexigrate.com`, gated by Firebase Auth `isAdmin` custom claim
- Verification queue (the human-in-the-loop layer for documents the AI flagged as low confidence)
- User search + profile + credits ledger viewer + suspend/unsuspend
- MCQ moderation queue (the third gate after the AI verifier triple)
- Broadcast (email + push) + announcement composer
- Audit log viewer

### Phase 2.8 — Payments (Razorpay)

- Razorpay subscription plans (one per tier × interval) created via API
- `POST /v1/subscriptions/checkout`, `POST /v1/subscriptions/cancel`
- Razorpay webhook receiver: `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `payment.failed`
- Subscription state on the user dashboard, prorated upgrades/downgrades

### Phase 2.9 — AI verification pipeline (`packages/ai-pipeline`)

- Generator (GPT-4o-mini), two verifiers (Gemini Flash, Groq Llama 3.3), router with per-task model selection
- Cloud Function `verifyMcqDraft` — every draft MCQ goes through 3-AI cross-check before publication
- Provenance metadata stored alongside every published MCQ
- SME review queue in the admin panel for any MCQ where verifiers disagreed

---

## How to keep the lights on

### Daily

- Watch the GitHub Actions tab. CI failures usually mean a test regressed; the offending PR can't merge.
- Watch the Cloudflare Pages "Deployments" tab. Marketing site failures usually mean someone broke the Astro build.

### Weekly

- Check the GCP **Billing → Reports** for spend trend. The ₹500 budget alert will email you anyway.
- Check Firebase **Authentication → Users** for any signups (you'll start seeing them once Phase 2.4 launches).
- Check Firestore **credit_events** collection — make sure events are growing roughly in line with active users.

### Monthly

- Rotate the Razorpay test keys (you mentioned regenerating before going live — don't forget).
- Review the Cloud Run revisions and prune anything older than 30 days you don't need to roll back to.

---

## Cost discipline reminders

- **OpenAI**: hard $5/month limit set on the platform side. The api routes most traffic to Gemini Flash + Groq (both free tier) and only uses GPT-4o-mini for the generator step.
- **Firebase Phone Auth**: ~₹4–5 per India OTP. Google sign-in is the default on every client; phone OTP only fires when the user has no Gmail. A daily-OTP-volume circuit breaker lands in Phase 2.5.
- **Cloud Run**: `max-instances=3` configured both in `deploy-api.yml` and `infra/terraform/cloudrun.tf`. Caps the blast radius of a runaway loop.
- **Firestore**: free tier covers up to ~5,000 active users. The `pages_build_output_dir` Pages site needs zero Firestore reads.

The hard cap is the ₹500 GCP budget alert. If you ever get the 90% email, look at **Billing → Cost breakdown** before doing anything else.

---

## Repository conventions worth keeping

- **No deep imports from `@nexigrate/shared`.** Anything you need is re-exported from `src/index.ts`. This keeps refactors safe.
- **Append-only constants in `packages/shared/src/constants/`.** Adding a new credit source or exam slug is fine; renaming or removing one is a breaking product decision and should be paired with a migration.
- **Pure functions in `packages/credits/`.** No I/O, no clock, no random — `EngineDeps` injects what's needed. This is what makes the engine testable in milliseconds.
- **Branded id types.** `UserId`, `McqId`, `CreditEventId` etc. are nominally strings but the type system refuses cross-type assignments. Use `asUserId()` etc. when crossing a trust boundary (HTTP, Firestore read).
- **Stub auth in dev, real auth in prod.** `loadEnv()` refuses `AUTH_MODE=stub` in production so a misconfigured deploy fails fast.

---

## Useful commands

```bash
# install deps
pnpm install

# run all checks (typecheck + tests)
pnpm typecheck
pnpm test

# api dev server with stub auth + in-memory ledger (zero external deps)
PORT=9090 pnpm --filter @nexigrate/api dev

# api dev server against the local Firebase emulator suite
firebase emulators:start --project nexigrate-prod
PORT=9090 \
  AUTH_MODE=firebase \
  PERSISTENCE=firestore \
  GCP_PROJECT_ID=nexigrate-prod \
  FIRESTORE_EMULATOR_HOST=localhost:8080 \
  FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  pnpm --filter @nexigrate/api dev

# manual deploy of api (normally fires automatically on push to main)
gh workflow run deploy-api.yml

# manual deploy of Firestore rules + indexes
gh workflow run deploy-firebase.yml

# apply Terraform changes
cd infra/terraform && terraform apply

# build the marketing site once (Cloudflare Pages does this automatically)
pnpm --filter @nexigrate/marketing build
```

---

## What I'd do next if I were you

1. **Merge PR #1** (`phase-1/foundation` → `main`) — Cloudflare's production branch can then point at `main`.
2. **Merge PR #2** (`phase-2/foundation` → `main`) — gives you Firestore-backed api + Cloud Run deploy.
3. **Apply the Terraform** in `infra/terraform/` — provisions WIF + Cloud Run + Artifact Registry + budget alert.
4. **Add `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub Secret** (the only one that comes from Terraform output, not from you).
5. **Push any commit to `main`** — `deploy-api.yml` fires; in 5 minutes `api.nexigrate.com` is live.
6. **Start Phase 2.4** — student web app — that's what unblocks every actual student. Hire or partner with one more dev for this; it's where the next 2 weeks of work lives.

Good luck. Everything you need to ship is in this repo.
