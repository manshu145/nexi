# Phase 3 — Productionising Nexigrate

> **Status (May 2026):** Planning + execution doc. Phase 1 (marketing site) and
> Phase 2 (sign-in → onboarding → dashboard → daily MCQ → credits) are live in
> production at https://nexigrate.com / https://app.nexigrate.com /
> https://api.nexigrate.com.

Phase 3 takes the platform from "working beta with one user" to "ready for
1000 students". Scope is bounded by what we can ship in 2-3 weeks without a
team, and what real beta feedback can actually exercise.

---

## Goals

1. **Stop losing data on every deploy.** Persistent Firestore-backed storage
   for users, credit ledger, and MCQ attempts.
2. **Fix the small visual cuts the founder has been ignoring.** Contrast,
   button sizing, copy rewrites, dead style code.
3. **Have enough content for a real daily habit.** Scale from 15 hand-curated
   MCQs to 50+, covering all five live exams.
4. **Be production-grade in posture.** Flip `NODE_ENV=production`, validate
   structured JSON logging, error reporting enabled.
5. **Open the monetisation path.** Wire Razorpay test-mode subscription so we
   can take a real signup-to-payment flow end-to-end, even if we keep prices
   off the website until the next phase.

Out of scope for Phase 3 (deferred to Phase 4):

- Phone OTP sign-in (Firebase Phone Auth code is scaffolded, disabled)
- AI-pipeline for MCQ generation (the 3-AI cross-check)
- Mock tests
- Streaks + leaderboards
- Mobile app (React Native)
- Admin panel for SME approval
- App Check / abuse rate limiting

---

## Sequenced milestones

### M1 — UI polish (≤ 1 day) ✅ ships first

**Why first:** founder is staring at these every time they sign in. Demoralising.

| # | Issue | Fix |
|---|-------|-----|
| 1 | Sign-out button on dashboard is too prominent | Add `.btn-ghost-sm` variant (smaller padding + 0.85rem font) |
| 2 | MCQ progress dots invisible for unanswered (`bg-line` on warm-paper bg) | Use `bg-paper-300` for unanswered, `bg-ink-900` answered, `bg-ember-600` current |
| 3 | Result page `Skipped` pill uses hard-coded `#F3D8C9` | Add `.pill-success` `.pill-warn` design tokens; replace inline hex |
| 4 | Result page correct-answer highlight too subtle | Bump from `bg-paper-200` to `bg-paper-300` and double the border |
| 5 | Verification card copy "Beta access. Verification flow coming soon." | "You're in our private beta. Identity verification arrives by end of June." |
| 6 | Sign-in copy "Verified students only." conflicts with "verification coming soon" | "Free forever. No ads. No distractions." |
| 7 | Loading states show `Loading…` flash with no spinner | Add a tiny inline spinner SVG for >300ms loads |

### M2 — MCQ content scale (1-2 days)

Current bank: 15 MCQs (12 JEE Main + 3 NEET UG).

Target: **50+ MCQs**, distributed:

- **Class 11 CBSE**: 8 MCQs (Physics + Chem + Bio mix)
- **Class 12 CBSE**: 8 MCQs (Physics + Chem + Bio mix)
- **JEE Main**: 18 MCQs (Physics + Chem + Math)
- **JEE Advanced**: 6 MCQs (harder physics + chem)
- **NEET UG**: 12 MCQs (Bio + Physics + Chem)

Constraints:
- Every question must cite NCERT chapter + page OR a verifiable previous-year
  paper (JEE Main 2019, NEET 2021, etc.)
- All questions go through `seed-mcqs.ts` so they're version-controlled and
  reviewable in PRs
- Tag with `difficulty: easy|medium|hard` for filtering once we add difficulty
  progression

### M3 — Firestore persistence (1 day, mostly config)

The code is already done — `apps/api/src/lib/firestoreLedger.ts`,
`firestoreUserStore`, `FirestoreMcqStore` all implemented and behind the
`PERSISTENCE=firestore` env switch.

Steps:

1. **Enable Firestore on `nexigrate-prod` GCP project**
   ```sh
   gcloud firestore databases create \
     --project=nexigrate-prod \
     --location=asia-south1 \
     --type=firestore-native
   ```

2. **Grant the runtime service account `roles/datastore.user`**
   ```sh
   gcloud projects add-iam-policy-binding nexigrate-prod \
     --member="serviceAccount:nexigrate-api@nexigrate-prod.iam.gserviceaccount.com" \
     --role="roles/datastore.user"
   ```

3. **Update Cloud Run service to flip the switch**
   ```sh
   gcloud run services update nexigrate-api \
     --region=asia-south1 --project=nexigrate-prod \
     --update-env-vars="PERSISTENCE=firestore,NODE_ENV=production"
   ```

4. **Verify end-to-end:** sign in, take MCQ, sign out, restart container
   (`gcloud run services update --revision-suffix=test`), sign in again,
   credits should still be there.

5. **Add Firestore security rules** (write-only via service account; clients
   never read directly):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /{document=**} {
         allow read, write: if false;  // service-account only
       }
     }
   }
   ```

### M4 — Production posture (½ day)

After M3 verified:

1. `NODE_ENV=production` (already in M3 step 3)
2. `LOG_JSON=true` (Cloud Logging parses structured logs natively)
3. Enable Cloud Error Reporting:
   ```sh
   gcloud services enable clouderrorreporting.googleapis.com \
     --project=nexigrate-prod
   ```
4. Set Cloud Run alerting policy: alert if 5xx rate > 1% for 5 min
5. Verify CORS allow-list covers production origins only (no localhost in prod)

### M5 — Razorpay subscription (2-3 days)

**Mode:** Test only for Phase 3. Live keys swap-in at Phase 4 launch.

Flow:

```
[Dashboard "Upgrade" button]
   -> POST /v1/billing/create-order  (server creates Razorpay order)
   -> Razorpay checkout modal opens
   -> User pays with test card 4111 1111 1111 1111
   -> Razorpay redirects with payment_id, signature
   -> POST /v1/billing/verify  (server verifies HMAC, marks subscription active)
   -> Dashboard shows "Pro" badge + extra features unlocked
```

**Plans (placeholder pricing for test):**

| Plan | Price | Daily MCQs | Mock tests | Verified syllabus |
|------|-------|------------|------------|-------------------|
| Free | ₹0 | 10 | 0 | All |
| Pro | ₹99/mo | 25 | 4/mo | All |
| Premium | ₹299/mo | Unlimited | Unlimited | All |

Code touchpoints:
- `apps/api/src/routes/billing.ts` (new) — create order + verify webhook
- `apps/api/src/lib/razorpay.ts` (new) — thin SDK wrapper
- `apps/web/src/app/upgrade/page.tsx` (new) — pricing + checkout button
- `apps/web/src/lib/razorpay.ts` (new) — load checkout.js dynamically

Secrets needed in GitHub Secrets (already present):
- `RAZORPAY_KEY_ID` (`rzp_test_SsPfzbJUMaK7Ow` is fine to commit, used as is)
- `RAZORPAY_KEY_SECRET` (server-only, do NOT bake into web bundle)
- `RAZORPAY_WEBHOOK_SECRET` (verify webhook HMAC)

### M6 — Ship + verify (½ day)

1. PRs land on `main` in this order: M1 → M2 → M3 → M4 → M5
2. Each PR triggers its own CI workflow → auto-deploy
3. Founder runs the smoke flow after each PR:
   - sign in → onboarding → daily MCQ → result → balance
   - on M3+: sign out → wait → sign in → balance still there
   - on M5+: click upgrade → pay with test card → verify "Pro" badge

---

## Open questions for the founder

1. **Verification ETA.** UI currently says "coming soon". A date helps trust.
   The original plan was DigiLocker-based. Skip it for Phase 3, replace with
   a manual KYC form (selfie + ID upload) reviewed by SME?
2. **Pricing.** ₹99 / ₹299 are guesses. Real numbers need cohort data.
3. **Refund policy.** Razorpay needs a public refund-policy URL on the
   marketing site before going live.
4. **Privacy policy + Terms.** Both pages are linked from sign-in but
   currently 404 on `nexigrate.com/terms` etc. Need real text by M5.

---

## Success metrics for Phase 3

- ✅ One user can sign in, take MCQ, sign out, sign back in, credits persist.
- ✅ Bank has ≥ 50 verified MCQs across all live exams.
- ✅ Production logs are structured JSON in Cloud Logging.
- ✅ No `localhost` references in deployed bundles or env.
- ✅ Razorpay test-mode payment completes end-to-end.
- ✅ All marketing-site links resolve (no 404s on terms/privacy/refund).
