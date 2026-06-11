---
inclusion: always
---

# Nexigrate — Product Vision (founder-locked)

The single source of truth for what this product is. Update only when the
founder explicitly revises the vision; everything in code and copy must
fold back to this document.

## Who we serve

Indian students from **Class 5 through PG**, plus **competitive-exam
aspirants**: SSC, JEE, NEET, NORCET, UPSC, State PSCs, NDA, Agniveer, and
similarly authoritative public exams. We meet a student wherever they are
and stay with them through their full ladder.

## What we promise

1. **Only verified facts.** Every MCQ, syllabus map, and explanation is
   cross-checked by **three independent AI models** and grounded in
   **NCERT, UPSC published syllabi, PYQ papers, PIB releases, and other
   official Government of India publications**. Never inferred trivia.

2. **A Kindle-clean dashboard.** No social feeds, no notifications,
   no algorithmic engagement bait. Warm-paper colours, serif headlines,
   exactly one primary action per screen.

3. **Free for the disciplined student.** Sign-up takes 60 seconds:
   mobile OTP + name + a one-tap proof of student status (Aadhaar, recent
   marksheet, admit card, or school ID + district). Users earn enough
   credits via the daily MCQ + a referral to never see a paywall.

4. **₹599/month only if you don't show up.** A user who skips the daily
   MCQ stream burns through starter credits in ~7 days; at that point a
   single ₹599/mo plan unlocks unlimited use. Discipline is the discount.

## Surfaces and roles

- **Marketing** at `nexigrate.com` — Astro static, Cloudflare Pages.
- **Student web app** at `app.nexigrate.com` — Next.js 15 on Cloud Run.
- **Backend API** at `api.nexigrate.com` — Hono on Cloud Run.
- **Admin panel** at `admin.nexigrate.com` (planned) — Refine/Next on
  Cloud Run, separate service for blast-radius isolation.
- **Mobile** (planned) — React Native + Expo, shared TypeScript packages.

All user-facing surfaces share the same brand tokens (paper / ink / ember
/ gold) and the same shared types from `@nexigrate/shared`.

## Authoritative tech stack

- **Auth:** Firebase Auth (Google now; Phone OTP next).
- **DB:** Firestore (Mumbai, asia-south1).
- **Files:** Cloud Storage (marksheet uploads, chapter PDFs).
- **AI generation:** OpenAI gpt-4o-mini.
- **AI verification:** Gemini 2.5 Flash + Groq Llama 3.3 70B.
- **OCR (admit cards / marksheets):** Cloud Vision API.
- **Payments:** Razorpay (UPI/cards, INR, India-first).
- **Email:** Resend.
- **Push:** FCM.
- **CI/CD:** GitHub Actions → Cloud Run / Cloudflare Pages.
- **Logs / metrics:** Cloud Logging + Cloud Monitoring + Sentry.

## Hard product principles (do not violate)

1. **Three-AI cross-check is non-negotiable** for any MCQ that hits
   production. Two-out-of-three agreement minimum, then human SME review.
2. **No content without a citation.** Every published MCQ, note, and
   explanation must carry a source string the user can verify.
3. **Verification is opt-in but rewarded.** Users can browse without it,
   but verified users get higher rate limits, mock-test bonuses, and the
   eventual "verified" badge.
4. **The dashboard never grows.** New features get their own page; the
   dashboard stays a one-screen calm.
5. **Respect students' time.** Default to fewer notifications, fewer
   modals, fewer interstitials. The product earns attention by being
   useful, not by hijacking it.

## Owner-side capabilities (admin panel scope)

- Live user list + search + drill-in (sessions, credits, attempts).
- MCQ-draft review queue (3-AI scored, SME-approved → published).
- Syllabus + chapter editing.
- Mock-test composition.
- Announcements: in-app + email + push.
- Refunds, support tickets, plan overrides.
- Funnel + retention analytics, content-quality metrics.
- Feature flags, blog/changelog editor.

## Non-goals

- Social feed, leaderboards visible to other users, gamified streaks
  shown publicly. Discipline is private.
- Generic test prep (we are India-only, government-curriculum-only by
  design).
- Adaptive recommendations that feel like surveillance.

This file is referenced by every Kiro session via steering inclusion.
