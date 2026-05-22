# Nexigrate

> The verified, distraction-free study OS for Indian students.
> Class 11 to UPSC. Powered by AI. Verified by experts. Free forever.

[![Status](https://img.shields.io/badge/status-pre--launch-orange)]() [![Phase](https://img.shields.io/badge/phase-1%20landing--page-blue)]() [![License](https://img.shields.io/badge/license-proprietary-red)]()

---

## What this is

Nexigrate is a multi-platform learning platform for Indian students preparing for school boards (Class 11–12), entrance exams (JEE, NEET), and competitive exams (SSC, UPSC, State PSCs, NDA, Banking, etc.).

The product has four pillars:

1. **Verified facts only.** Every chapter, MCQ, and explanation is generated and cross-checked by three different AI models, then reviewed by human subject-matter experts before it ships to students.
2. **Free forever, earn-as-you-learn.** No paywall. Students earn credits by taking daily MCQs, referring friends, and maintaining streaks. Power users can subscribe for unlimited access.
3. **Distraction-free by design.** Kindle-inspired reading mode, no ads, no popups, no algorithmic feeds. The UI exists to get out of the way.
4. **Built on official sources.** NCERT, UPSC PYQs, official Government of India publications. No clickbait, no second-hand notes.

---

## Repository layout

This is a Turborepo monorepo using pnpm workspaces.

```
nexigrate/
\u251c\u2500\u2500 apps/
\u2502   \u251c\u2500\u2500 marketing/        # Astro static landing site (Phase 1) \u2014 deployed to Cloudflare Pages
\u2502   \u251c\u2500\u2500 web/              # Next.js student web app (Phase 2)        \u2014 deployed to Cloud Run
\u2502   \u251c\u2500\u2500 mobile/           # React Native + Expo iOS/Android (Phase 2) \u2014 deployed via EAS
\u2502   \u251c\u2500\u2500 admin/            # Refine.dev admin panel (Phase 3)         \u2014 deployed to Cloud Run
\u2502   \u2514\u2500\u2500 api/              # Hono backend on Cloud Run (Phase 2)
\u251c\u2500\u2500 packages/
\u2502   \u251c\u2500\u2500 shared/           # Types, constants, Zod validators
\u2502   \u251c\u2500\u2500 api-client/       # Typed client used by web + mobile
\u2502   \u251c\u2500\u2500 credits/          # Credit economy logic
\u2502   \u251c\u2500\u2500 auth/             # Firebase Auth wrappers
\u2502   \u251c\u2500\u2500 ui-web/           # Shared web components (shadcn-based)
\u2502   \u251c\u2500\u2500 ui-mobile/        # Shared React Native components
\u2502   \u2514\u2500\u2500 ai-pipeline/      # 3-model verification pipeline
\u251c\u2500\u2500 infra/
\u2502   \u251c\u2500\u2500 terraform/        # GCP infrastructure as code
\u2502   \u2514\u2500\u2500 firebase/         # Firestore rules, indexes, Cloud Functions config
\u251c\u2500\u2500 docs/                 # Phase setup guides, architecture docs
\u2514\u2500\u2500 .github/workflows/    # CI/CD pipelines
```

Most directories outside `apps/marketing/` are placeholders for upcoming phases.

---

## Build phases

| Phase | Scope | Status |
|---|---|---|
| **0. Validate** | Landing page live at nexigrate.com, waitlist open | \ud83d\udd28 in progress |
| **1. Foundations** | Monorepo, marketing site, CI/CD | \ud83d\udd28 in progress |
| **2. MVP build** | Auth, onboarding, syllabus, daily MCQ, credits engine, Razorpay | \u23f3 next |
| **3. Public launch** | Class 11\u201312 + JEE/NEET wedge, mobile app, Product Hunt launch | \u23f3 |
| **4. Expand** | Class 8\u201310 boards, then SSC/Banking, then UPSC/State PSC | \u23f3 |

See [`docs/PHASE_1_SETUP.md`](./docs/PHASE_1_SETUP.md) for the current phase\u2019s exact setup steps.

---

## Tech stack at a glance

| Layer | Choice |
|---|---|
| Domain | nexigrate.com |
| DNS / CDN / WAF | Cloudflare |
| Marketing site | Astro \u2192 Cloudflare Pages |
| Web app | Next.js 15 \u2192 Cloud Run (Mumbai) |
| Mobile | React Native + Expo (iOS + Android) |
| Backend API | Node.js + Hono \u2192 Cloud Run |
| Auth | Firebase Auth (Google sign-in primary; Firebase Phone OTP fallback) |
| Database | Firestore |
| Object storage | Cloud Storage (GCS) |
| Background jobs | Cloud Functions 2nd gen + Cloud Scheduler |
| AI verification | OpenAI + Gemini + Groq (3-model cross-check) |
| OCR for doc verification | Cloud Vision API |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Email | Resend |
| Payments | Razorpay (UPI, cards, recurring) |
| Analytics | Firebase Analytics + PostHog |
| Errors | Firebase Crashlytics + Sentry |
| Admin panel | Refine.dev on Next.js |

---

## Local development

### Prerequisites

- Node.js \u2265 22 (use `nvm use` \u2014 see `.nvmrc`)
- pnpm \u2265 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- Git

### Bootstrap

```bash
git clone https://github.com/manshu145/nexi.git nexigrate
cd nexigrate
pnpm install
```

### Run the marketing site

```bash
pnpm --filter @nexigrate/marketing dev
# \u2192 http://localhost:4321
```

### Build everything

```bash
pnpm build
```

---

## Contributing

This is a private repository while the product is in pre-launch. Code contributions are restricted to the founding team. Bug reports and product feedback are welcome at hello@nexigrate.com.

---

## License

Proprietary. See [`LICENSE`](./LICENSE).

\u00a9 2026 Nexigrate. All rights reserved.
