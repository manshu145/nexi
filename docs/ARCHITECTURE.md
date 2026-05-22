# Architecture

> **Status:** living document. Reflects the planned production architecture.
> **Phase:** Phase 1 \u2014 only the marketing site is currently deployed. The rest is designed but not yet built.

---

## Goals

1. **Run on free tiers** until \~5,000 monthly active users.
2. **India-first** \u2014 hosted in `asia-south1` (Mumbai), DPDP-compliant.
3. **Verified content only** \u2014 every fact triple-checked by AI and human SMEs.
4. **Distraction-free UX** \u2014 Kindle-inspired reader; no ads, no algorithmic feeds.
5. **Mobile + web parallel** from day 1, sharing TypeScript business logic.

---

## High-level diagram

```
                                  nexigrate.com  (Cloudflare DNS + WAF + CDN)
                                              \u2502
            \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
            \u2502                                  \u2502                                          \u2502
       www.nexigrate                       app.nexigrate                              admin.nexigrate
   (Astro \u2192 CF Pages)                 (Next.js \u2192 Cloud Run)                   (Refine \u2192 Cloud Run + IAP)

                                              \u2502
                                       api.nexigrate.com
                                    (Hono on Cloud Run, Mumbai)
                                              \u2502
            \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
       Firebase   Firestore   Cloud Storage   Vertex AI    Cloud Functions
        Auth       (data)        (uploads)     (Gemini)     (workers / cron)
                                                                       \u2502
                              External: OpenAI \u00b7 Groq \u00b7 MSG91 \u00b7 Razorpay \u00b7 Resend
```

---

## Domain map

| Subdomain | Hosts | Phase |
|---|---|---|
| `nexigrate.com` (apex) | Marketing landing site | 1 \u2705 |
| `www.nexigrate.com` | Same as apex | 1 \u2705 |
| `app.nexigrate.com` | Student web app | 2 |
| `api.nexigrate.com` | Backend API | 2 |
| `admin.nexigrate.com` | Admin panel | 3 |
| `cdn.nexigrate.com` | Content delivery (chapter PDFs, images) | 2 |

---

## Data model (Firestore, Phase 2)

Top-level collections:

```
users/{userId}                    \u2014 profile, target exam, verification status, custom claims
credits/{userId}                  \u2014 balance, expiring buckets, ledger pointer
credit_events/{eventId}           \u2014 append-only ledger of every earn/spend
syllabus/{exam}/subjects/{subject}/chapters/{chapter}
mcqs/{mcqId}                      \u2014 question, options, answer, source, verifier scores
mcq_attempts/{attemptId}          \u2014 user, mcq, response, score, timestamp
mock_tests/{testId}
mock_attempts/{attemptId}
verifications/{verificationId}    \u2014 uploaded doc, OCR result, AI confidence, admin decision
referrals/{referralId}            \u2014 referrer, referred, status, attribution timestamps
subscriptions/{userId}            \u2014 razorpay subscription state, plan, renewal
audit_log/{entryId}               \u2014 every admin action
notifications/{userId}/inbox/{id} \u2014 in-app messages
```

Security rules: each collection scoped via `request.auth.uid` and `request.auth.token.admin == true` for elevated access.

---

## Credit engine

Source of truth: append-only `credit_events` collection. Balance is computed (and cached) in `credits/{userId}`.

- Idempotency keys on every event (`(source, sourceId)` unique)
- Buckets expire (e.g., signup grant expires 14 days after award)
- Cloud Scheduler runs nightly sweeper that expires stale buckets and writes balance snapshot
- Atomic transactions when consuming (read-modify-write Firestore txn)

---

## 3-model AI verification pipeline

Already documented in [`packages/ai-pipeline/README.md`](../packages/ai-pipeline/README.md). Key principle: **never publish AI-generated content to students without provenance and verifier scores.**

---

## Cost model

| Stage | Users | Estimated monthly bill |
|---|---|---|
| Pre-launch | 0 | \u20b90 |
| MVP beta | 100 | < \u20b9100 |
| Soft launch | 1,000 | \u20b9500\u20131,500 |
| Public launch | 10,000 | \u20b98,000\u201315,000 |
| At \u20b93 lakh MRR | 25,000 | \u20b930,000\u201360,000 |

Biggest variable is phone OTP volume; mitigation is Google sign-in primary + MSG91 fallback (~\u20b90.15 / OTP).

---

## What's next

Phase 2 will introduce: GCP project + Terraform, Firebase project, the API service skeleton, the web app skeleton, the mobile app skeleton, the credit engine, and Google sign-in.

See `docs/PHASE_1_SETUP.md` for the current phase\u2019s setup steps.
