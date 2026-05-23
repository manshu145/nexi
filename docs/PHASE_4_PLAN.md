# Phase 4 — Pre-launch hardening

> **Status (May 2026):** Phase 1 (marketing), Phase 2 (sign-in → MCQ → credits)
> and Phase 3 (UI polish, MCQ scale, Firestore persistence, Razorpay billing,
> production posture) are all live. Phase 4 takes us from "working beta with
> one founder testing" to "ready to send the link to a real cohort of 50-100
> students" without legal, abuse, or engagement gaps.

---

## Goals

1. **Be legally shippable.** Real Terms, Privacy, and Refund pages — required
   by Razorpay (live mode) and by the DPDP Act for student data.
2. **Show prices to non-signed-in users.** A marketing `/pricing` page so
   visitors can decide before they create an account.
3. **Lock the engagement loop.** Daily streak counter on the dashboard. The
   credits system already rewards effort; streaks make returning visible.
4. **Stop trivial abuse.** Rate limit the API per-user and per-IP so a bad
   actor can't blow through Razorpay quotas, OpenAI keys, or our database.
5. **Ground the AI promise.** Lay the data model + worker scaffolding for the
   3-AI MCQ generation pipeline. Actual generation lands in Phase 4.5.

Out of scope (deferred to Phase 5):
- Phone OTP sign-in (still scaffolded in firebase auth, not wired up)
- Live Razorpay mode (test mode is fine for the first cohort)
- Mock tests
- Mobile app (React Native)
- Leaderboards / social features
- AI-generated MCQs hitting production (Phase 4.5)
- Admin panel for SME approval (Phase 4.5)

---

## Milestones

### M1 — Legal pages (½ day) ✅ ships first

The marketing site has placeholder Terms and Privacy pages from Phase 1. They
say "pre-launch draft" and don't mention payments, MCQ attempts, Firestore,
or DPDP-compliance specifics. They need to be replaced with documents the
founder can show to a Razorpay reviewer and to a parent of a 16-year-old.

| Page | Path | Required by |
|------|------|-------------|
| Terms of Service | `/terms` | Razorpay, app trust |
| Privacy Policy | `/privacy` | DPDP Act 2023, Razorpay |
| Refund + Cancellation | `/refund` | Razorpay (mandatory) |

All three must:
- Cite the Indian jurisdiction
- Name the operator (will say "Nexigrate" until incorporation)
- Provide a contact: `hello@nexigrate.com`
- Cross-link the other two

### M2 — Marketing /pricing page (½ day)

Visitors currently see prices only after signing in (`/upgrade`). We want a
public page that shows the same plans + the same Razorpay test-mode CTA so
people can compare before account creation. The new page reuses the brand
tokens and links from the Footer.

### M3 — Daily streak (1 day)

Define a streak as consecutive IST days with at least one MCQ session
completed (any score). Persisted on the user document in Firestore as
`{ currentStreak, bestStreak, lastDailyAt }`. Auto-bumped by the
mcq-sessions/complete handler. Surfaced on the dashboard as a small card.

### M4 — Rate limiting (½ day)

Add a per-user-id and per-IP token bucket middleware to the v1 router:

- 60 requests / minute / authenticated user
- 30 requests / minute / IP for unauthenticated routes (only `/healthz`,
  `/`, and Razorpay webhook)
- Burst of 20

In-memory bucket is fine for the single-instance min=1 / max=3 setup; a
distributed bucket can come later if we shard. Returns 429 with
`Retry-After`.

### M5 — AI MCQ generation scaffold (1-2 days) ✅ shipped

Lay the foundation; actual generation hits production in Phase 4.5.

**Status: shipped in PR #3 (`phase-4/m5-ai-scaffold`).**

What landed:

- `apps/api/src/lib/llm/` — thin `LLMClient` interface + 3 production
  clients (OpenAI gpt-4o-mini, Gemini 2.5 flash, Groq Llama 3.3 70B) using
  raw `fetch` so the Docker image stays lean, plus a `StubLLMClient` for
  tests. `makeLLMTriadFromEnv()` wires all three from env vars and
  gracefully falls back to throwing stubs when keys are missing.
- `apps/api/src/lib/mcqGen/` — orchestrator that fans the same prompt
  across 3 primaries in parallel, picks the consensus answer (best 2-of-3
  by `correctOption`, falls back to first non-null), then runs an
  OpenAI gpt-4o verifier. Result is a `McqDraft` with provenance for
  every model call. `InMemoryMcqDraftStore` (tests) and
  `FirestoreMcqDraftStore` (prod) implement the same interface; approve
  publishes the chosen candidate to the live `mcqs` collection inside a
  Firestore transaction.
- `apps/api/src/routes/admin.ts` — admin-gated routes:
  - `POST /v1/admin/mcq-drafts/generate` — kicks off a generation run
  - `GET  /v1/admin/mcq-drafts` — lists drafts (filter by status)
  - `GET  /v1/admin/mcq-drafts/:id` — fetch one draft
  - `POST /v1/admin/mcq-drafts/:id/approve` — publish to `mcqs`
  - `POST /v1/admin/mcq-drafts/:id/reject` — mark rejected (note required)
- `packages/shared` — new `McqDraft`, `DraftCandidate`, `VerifierResult`,
  `DraftStatus`, `McqGenerationOutput` types exported from the barrel.
- `apps/api/src/__tests__/{mcqGen,admin.routes}.test.ts` — 18 tests using
  stub LLM clients; covers happy path, single-provider failure, all-three
  failure, verifier failure, idempotent state guards, and full HTTP
  contract (401/403/400/503/200) for every admin route.
- `.github/workflows/deploy-api.yml` — bootstraps `openai-api-key`,
  `gemini-api-key`, `groq-api-key` into Secret Manager (only if the
  corresponding GH Secret is present) and `--set-secrets` them into the
  Cloud Run revision. No keys in env-var land or workflow logs.

What's NOT in this PR (deferred to Phase 4.5):
- A scheduler that auto-generates MCQ drafts overnight.
- Any client surface (the admin panel in apps/admin consumes these
  endpoints; until that ships, an admin user with a Firebase admin claim
  drives the flow via curl).

### M6 — Ship + verify (½ day)

PRs land on `main` in this order: M1 → M2 → M3 → M4 → M5. Each triggers its
own CI workflow → auto-deploy. Founder runs the smoke flow after each PR.

---

## Open questions for the founder

1. **Legal entity.** "Nexigrate" is currently the brand. Do we want to
   register a private limited company before public launch? Razorpay live
   mode wants a registered business.
2. **Refund window.** 7 days from purchase is industry-standard for
   subscriptions. Confirm or override.
3. **Pricing finality.** The numbers ₹99/₹299/₹599 in shared/constants are
   the placeholder. Lock them or revise before Phase 4.5.
4. **Verification roadmap.** Manual KYC form (upload ID + selfie, SME
   reviews) is the cheapest path. DigiLocker integration is the gold
   standard but takes 6-8 weeks of paperwork. Plan?

---

## Success metrics for Phase 4

- ✅ All marketing legal pages exist and pass a casual lawyer-friend read.
- ✅ Public `/pricing` page exists and the dashboard "Upgrade" button still
  works.
- ✅ Dashboard shows a streak card, and the streak ticks up after a
  completed daily MCQ.
- ✅ A scripted attacker (`for i in {1..200}; curl ...; done`) sees 429s
  with proper `Retry-After`.
- ✅ AI scaffold compiles, tests pass with a stubbed LLM client. No
  production traffic hits real OpenAI/Gemini/Groq yet.
- ✅ All four CI workflows stay green.
