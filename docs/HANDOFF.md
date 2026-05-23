# HANDOFF — Nexigrate (the always-current state of the world)

> **For Kiro / future contributors:** read this file FIRST every time you
> open the repo. It supersedes anything older you might find in
> `PHASE_*_PLAN.md`. Update it at the end of every PR.

**Last updated:** May 23, 2026 (after PR #3, Phase 4 M5)

---

## Product in one paragraph

Nexigrate is a verified, distraction-free study OS for Indian students from
Class 5 to UPSC. Three differentiators: (1) every fact is cross-checked by
3 LLMs (OpenAI + Gemini + Groq) before reaching a student, (2) free
forever via a credit economy with a single ₹599/month skip-the-grind
subscription, (3) Kindle-inspired UX with no ads, no notifications, no
distractions.

Domain: **nexigrate.com**. Region: **asia-south1 (Mumbai)** for DPDP.

---

## What's live in production

| Surface | URL | Stack |
|---|---|---|
| Marketing | https://nexigrate.com | Astro 5 + Tailwind 4 → Cloudflare Pages |
| Web app | https://app.nexigrate.com | Next.js 15 → Cloud Run (asia-south1) → Cloudflare Worker proxy |
| API | https://api.nexigrate.com | Hono on Node 22 → Cloud Run (asia-south1) → Cloudflare Worker proxy |

`api.nexigrate.com` and `app.nexigrate.com` are routed via **Cloudflare
Workers** (not direct CNAMEs) because Cloud Run domain-mappings are not
supported in `asia-south1`. The Workers rewrite the `Host` header so
Cloud Run accepts the request. See `apps/api/wrangler.toml` and the
Cloudflare dashboard for the worker source.

API runtime config (verified live):
- `NODE_ENV=production` ✓ (returned by `/readyz`)
- `AUTH_MODE=firebase` ✓ (Firebase Admin verifyIdToken)
- `PERSISTENCE=firestore` ✓
- `CORS_ALLOWED_ORIGINS=https://app.nexigrate.com,https://nexigrate.com`
- `min-instances=1, max-instances=3, cpu=1, memory=512Mi`

`/healthz` returns 404 in prod despite the route being in source code; the
identical-handler `/readyz` works fine, so Cloud Run probes pass via
`/readyz` and we are NOT investigating /healthz further (`gcloud run`
quirk, deferred).

---

## Phase progress

| Phase | What | Status |
|---|---|---|
| 0 | Validate (waitlist live) | ✅ done |
| 1 | Foundations + marketing | ✅ done |
| 2 | Student MVP (sign-in → MCQ → credits) | ✅ done |
| 3 | Productionising (UI polish, 50+ MCQs, Firestore, Razorpay test mode) | ✅ done |
| **4** | Pre-launch hardening (legal, pricing, streaks, rate limit, AI scaffold) | ✅ **done after PR #3** |
| 4.5 | Real AI generation in prod + admin panel + verification flow | ⬜ next up |
| 5 | Tier expansion (Class 5–10 + Grad/PG + UPSC + SSC + State PSCs + NDA + Agniveer + 25 exams) | ⬜ |
| 6 | Long-form descriptive Q + Mock tests + Nexipedia + current affairs daily | ⬜ |
| 7 | Mobile (Expo) + extracted api-client / ui packages | ⬜ |
| 8 | Live Razorpay + Pvt Ltd + GST + lawyer-reviewed legal | ⬜ |
| 9 | Production posture (Sentry, alerting, distributed rate limit, load testing) | ⬜ |

---

## What just shipped (PR #3, branch `phase-4/m5-ai-scaffold`)

**Phase 4 Milestone 5: AI MCQ generation scaffold.**

New code:
- `packages/shared/src/types/mcqDraft.ts` — `McqDraft`, `DraftCandidate`,
  `VerifierResult`, `DraftStatus`, `McqGenerationOutput` types
- `apps/api/src/lib/llm/` — `LLMClient` interface + OpenAI / Gemini / Groq
  clients (raw fetch, no SDK bloat) + `StubLLMClient` + `makeLLMTriadFromEnv()`
- `apps/api/src/lib/mcqGen/` — `generateMcqDraft()` orchestrator,
  `pickConsensusIndex()`, prompt templates, `InMemoryMcqDraftStore`,
  `FirestoreMcqDraftStore` (transactional approve)
- `apps/api/src/routes/admin.ts` — 5 admin-gated endpoints
- `apps/api/src/__tests__/mcqGen.test.ts` — 12 tests
- `apps/api/src/__tests__/admin.routes.test.ts` — 6 tests
- `apps/api/src/logger.ts` — added `silentLogger` for tests

Modified:
- `apps/api/src/env.ts` — added `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`
- `apps/api/src/app.ts` — wires the `McqDraftStore` + `LLMTriad` into deps and mounts `/v1/admin`
- `packages/shared/src/types/index.ts` — exports new mcqDraft types
- `.github/workflows/deploy-api.yml` — provisions `openai-api-key` /
  `gemini-api-key` / `groq-api-key` in Secret Manager and `--set-secrets`
  them onto Cloud Run (only when the corresponding GH Secret is present)

**Tests: 33 passing total** (15 credits + 18 api). Typecheck clean.

How to use the new endpoints once deployed:

```bash
# As an admin (via stub mode for local testing):
TOKEN="stub:u_admin:admin"

# Generate a draft
curl -X POST https://api.nexigrate.com/v1/admin/mcq-drafts/generate \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  -d '{
    "exam": "jee-main",
    "subject": "physics",
    "chapter": "units-and-measurements",
    "sourceText": "The SI base unit of force is the newton ...",
    "sourceCitation": "NCERT Class 11 Physics, Ch 1, p. 12",
    "difficulty": "easy"
  }'

# List pending drafts
curl -H "authorization: Bearer ${TOKEN}" \
  'https://api.nexigrate.com/v1/admin/mcq-drafts?status=pending'

# Approve the draft (publishes to mcqs collection)
curl -X POST -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  -d '{"note": "looks good"}' \
  https://api.nexigrate.com/v1/admin/mcq-drafts/<draftId>/approve
```

---

## Open product questions (founder-only)

1. **Tier expansion order**: founder said "all tiers from Class 5 to UPSC".
   Tracked in Phase 5; first PR will scaffold the catalog + COPPA-equivalent
   under-13 consent.
2. **Pricing**: keep `subscriptions.ts` as-is (₹99 / ₹299 / ₹599).
3. **Verification SLA**: 24h target.
4. **Nexipedia gating**: 5 credits/lookup, 3 free/day.
5. **Legal entity**: incorporate Pvt Ltd before live Razorpay (Phase 8).
6. **SME hire**: not happening; rely on 3-AI verification + admin override
   (already wired in PR #3).
7. **Legal text**: I draft `terms`, `privacy`, `refund` text; founder skims.

---

## Repo conventions

- **Branches**: `phase-N/short-name` (e.g. `phase-4/m5-ai-scaffold`).
- **PRs**: one focused goal per PR. CI auto-deploys `apps/api` and
  `apps/web` on merge to main. Marketing auto-deploys via Cloudflare's
  Git integration on the same merge.
- **No direct push to main.** Every change goes through a PR for the
  audit trail.
- **Tests required for new logic.** Unit tests for stores and pure
  functions; route-level tests via `app.request()` for HTTP contracts.
- **No secrets in code.** Public values (Firebase Web SDK, Razorpay
  publishable KEY_ID) MAY be committed; everything else lives in GitHub
  Secrets and is bridged into Cloud Run via Secret Manager by the deploy
  workflow.

---

## Next PR (PR #4): Phase 4.5 — Trust foundation part 1

Branch: `phase-4.5/trust-foundation-1`

- Phone OTP signin UI + flow (Firebase Phone Auth, with cost guards)
- Referral system implementation (invite codes + attribution + reward
  grant via the credits engine)
- Parental consent flow for under-18 students

Depends on: nothing in PR #3; can branch off main as soon as PR #3 merges.
