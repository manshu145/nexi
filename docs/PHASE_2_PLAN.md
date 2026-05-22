# Phase 2 — Plan and Status

> **Goal of Phase 2:** Ship a working MVP for verified students preparing for Class 11–12 + JEE Main/Advanced + NEET UG. Sign in, get verified, see their syllabus, take a daily MCQ, earn and spend credits, all on free-tier infrastructure.

This document is the living plan for Phase 2. It groups the work into commits/PRs you can ship independently.

## Status legend

- ✅ landed
- 🟢 in flight (open PR)
- ⬜ not started

## Phase 2.1 — Foundation (this PR)

The bedrock everything else builds on. Pure logic and a working API skeleton, no GCP credentials required.

- ✅ `packages/shared` — types, Zod schemas, constants (credit rates, exam catalog, subscription tiers)
- ✅ `packages/credits` — pure credit-economy engine with FIFO bucket spend, idempotency, expiry
- ✅ Vitest workspace setup with 90%/85% coverage thresholds for `credits`
- ✅ `apps/api` skeleton — Hono on Node 22, stub auth for local dev, in-memory ledger, real `/v1/credits/*` routes
- ✅ Dockerfile for Cloud Run deployment
- ✅ Turbo `test` task wired up
- ✅ `docs/PHASE_2_SETUP.md` — GCP + Firebase + service account walkthrough
- ✅ `docs/PHASE_2_PLAN.md` — this file

After this PR merges, you can `pnpm install && PORT=9090 pnpm --filter @nexigrate/api dev` and exercise the engine end-to-end with stub bearer tokens. No external service is required.

## Phase 2.2 — Real Firestore + Real Firebase Auth

Swap the in-memory ledger and stub auth for production implementations. The HTTP surface does not change.

- ⬜ `apps/api/src/lib/firebaseAdmin.ts` — Firebase Admin SDK init from service-account JSON or workload identity
- ⬜ `apps/api/src/lib/firestore.ts` — typed Firestore wrappers + transaction helpers
- ⬜ `apps/api/src/routes/credits.ts` — replace `InMemoryLedgerStore` with `FirestoreLedgerStore` (same interface)
- ⬜ `apps/api/src/auth.ts` — wire `FirebaseTokenVerifier` to `firebase-admin` `auth().verifyIdToken()`
- ⬜ Firestore security rules in `infra/firebase/firestore.rules`
- ⬜ Firestore composite indexes in `infra/firebase/firestore.indexes.json`
- ⬜ Firebase emulator config in `infra/firebase/firebase.json` for local dev
- ⬜ `infra/terraform/` — minimal Terraform: project, billing budget alert (₹500), required APIs enabled, Artifact Registry repo, Cloud Run service, IAM, Cloud Scheduler entry for the nightly credit-expiry sweeper
- ⬜ GitHub Actions: `deploy-api.yml` builds the container, pushes to Artifact Registry, deploys to Cloud Run via OIDC

## Phase 2.3 — Onboarding + Verification

- ⬜ `apps/api/src/routes/users.ts` — `POST /v1/users/me/onboarding`, `GET /v1/users/me`
- ⬜ `apps/api/src/routes/verifications.ts` — `POST /v1/verifications/start` (signed Cloud Storage URL), `POST /v1/verifications/complete`
- ⬜ Cloud Function `onVerificationFileUploaded` — runs Cloud Vision OCR + Gemini check, sets `Verification.ai`, auto-approves above 0.85 confidence, otherwise `queued`
- ⬜ Parental-consent flow for under-18 users (verifiable via parent OTP from Firebase Phone Auth)
- ⬜ Audit log entries on every admin decision

## Phase 2.4 — Web app shell (`apps/web`)

- ⬜ Next.js 15 (App Router) on Cloud Run, deployed at `app.nexigrate.com`
- ⬜ Firebase Auth client — Google sign-in primary, Firebase Phone OTP fallback (with reCAPTCHA on web, Play Integrity on Android)
- ⬜ Onboarding flow (target exam, school, optional class, optional parent contact)
- ⬜ Verification upload UI with progress, approval polling, retry on rejection
- ⬜ Kindle-style dashboard: today's plan, streak, credits balance, "resume where you left off"
- ⬜ Server-side `@nexigrate/api-client` — typed `ofetch` client with auto-attached Firebase ID token

## Phase 2.5 — Daily MCQ + reading mode

- ⬜ `apps/api/src/routes/mcqs.ts` — `GET /v1/mcqs/daily`, `POST /v1/mcqs/:id/attempts`
- ⬜ Server-side MCQ selection algorithm (chapter rotation, difficulty calibration to attempt history)
- ⬜ MCQ reader UI (10 questions, single page, no navigation away mid-attempt)
- ⬜ Result screen with explanations + credit award via `@nexigrate/credits.award({ source: 'mcq_pass' })`
- ⬜ Read-mode chapter UI (Kindle-style paper, drop cap, page-turn keyboard nav)

## Phase 2.6 — Mobile app shell (`apps/mobile`)

- ⬜ Expo SDK on RN 0.76+, TypeScript strict
- ⬜ Auth flow shared with web via `packages/auth`
- ⬜ Dashboard + daily MCQ + read-mode parity with web
- ⬜ EAS build pipeline (iOS + Android) with internal-distribution channel for beta

## Phase 2.7 — Admin panel (`apps/admin`)

- ⬜ Refine.dev on Next.js, deployed at `admin.nexigrate.com`, gated by Firebase Auth `isAdmin` custom claim
- ⬜ Verification queue (the human-in-the-loop layer for documents AI flagged as low confidence)
- ⬜ User search + profile + credits ledger viewer + suspend/unsuspend
- ⬜ MCQ moderation queue (the third gate after the AI verifier triple)
- ⬜ Broadcast (email + push) + announcement composer
- ⬜ Audit log viewer with filter/search

## Phase 2.8 — Payments (Razorpay)

- ⬜ Razorpay subscription plans created via API (one per tier × interval)
- ⬜ `apps/api/src/routes/subscriptions.ts` — `POST /v1/subscriptions/checkout`, `POST /v1/subscriptions/cancel`
- ⬜ Razorpay webhook receiver for `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `payment.failed`
- ⬜ Subscription state on the user dashboard, prorated upgrades/downgrades

## Phase 2.9 — AI verification pipeline

- ⬜ `packages/ai-pipeline` — generator (GPT-4o-mini), two verifiers (Gemini Flash, Groq Llama 3.3), router with per-task model selection
- ⬜ Cloud Function `verifyMcqDraft` — every draft MCQ goes through 3-AI cross-check before publication
- ⬜ Provenance metadata stored alongside every published MCQ (source, model versions, scores, optional SME approver)
- ⬜ SME review queue in the admin panel for any MCQ where verifiers disagreed
