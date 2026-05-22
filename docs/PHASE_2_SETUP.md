# Phase 2 Setup — GCP, Firebase, and the rest of the keys

> **Goal:** track the cloud resources Phase 2.2+ deploy to, and the API keys Phase 2.3+ need.
>
> **Status:** the GCP project, Firebase project, service account, and Razorpay test keys are **already provisioned** by the founder. This doc is now mostly a record of what exists and what GitHub Secrets still need to land for the deploy workflow.

---

## Project pinning (already provisioned)

| Resource | Value |
|---|---|
| GCP project id | `nexigrate-prod` |
| GCP project number | `505978726927` |
| Region | `asia-south1` (Mumbai) |
| Service account (api Cloud Run) | `nexigrate-api@nexigrate-prod.iam.gserviceaccount.com` |
| Firebase project | `nexigrate-prod` (linked to the GCP project above) |
| Firebase Auth providers enabled | Google sign-in (primary), Phone sign-in (fallback) |
| Firestore mode | Native, location `asia-south1` |
| Firebase plan | Blaze (pay-as-you-go) |
| Razorpay test KEY_ID | `rzp_test_SsPfzbJUMaK7Ow` (committed; safe — publishable half) |

The Firebase Web SDK config is committed at `infra/firebase/web-config.ts` and is consumed by `apps/web` (when scaffolded) and `apps/mobile`. Per Firebase's official docs, the apiKey in this config is **not** a secret — security comes from `firestore.rules`, `storage.rules`, and App Check.

---

## What still needs to happen on GitHub

Add each of these as a **repo Secret** at `manshu145/nexi → Settings → Secrets and variables → Actions → New repository secret`. Phase 2.2 onward picks them up via `${{ secrets.NAME }}` in the deploy workflows.

### Phase 2.2 (api deploy via Workload Identity Federation)

These four are the WIF setup. Phase 2.2 walks through creating the WIF pool in the GCP console; for now, just have the names written down.

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — full path, e.g. `projects/505978726927/locations/global/workloadIdentityPools/github/providers/github-provider`
- `GCP_PROJECT_ID` — `nexigrate-prod` (also exposed as a non-secret repo variable for convenience)
- `GCP_PROJECT_NUMBER` — `505978726927`
- `GCP_SERVICE_ACCOUNT` — `nexigrate-api@nexigrate-prod.iam.gserviceaccount.com`

### Phase 2.3 (api server + AI verification)

- `OPENAI_API_KEY` — set a $5 hard monthly limit on platform.openai.com first
- `GEMINI_API_KEY` — from aistudio.google.com (free tier)
- `GROQ_API_KEY` — from console.groq.com (free tier)
- `FIREBASE_SERVICE_ACCOUNT_JSON` — entire JSON content of the service-account key downloaded for `nexigrate-api`. The api server uses this for local dev; in Cloud Run we use Workload Identity instead.

### Phase 2.5 (transactional email)

- `RESEND_API_KEY` — from resend.com (3k emails/mo free)

### Phase 2.8 (payments)

- `RAZORPAY_KEY_SECRET` — the secret half of `rzp_test_SsPfzbJUMaK7Ow`. **Never commit this**, even though it's a test key — public-repo scrapers will find it.
- `RAZORPAY_WEBHOOK_SECRET` — generated when the webhook endpoint is registered in Phase 2.8.

---

## Phone OTP

Phone OTP is delivered by **Firebase Phone Auth**, not a third-party SMS provider. Trade-off: Firebase Phone Auth charges ~₹4–5 per India OTP whereas a provider like MSG91 charges ~₹0.15. We accept the higher per-message cost in exchange for:

- One fewer KYC, one fewer external account, one fewer secret to rotate
- Native Firebase Auth integration (custom claims, ID tokens, the `auth().verifyIdToken()` path) without writing a custom-token bridge
- Built-in abuse protection (reCAPTCHA on web, Play Integrity on Android)

Cost-control measures:

- **Google sign-in is the default** on every client; phone OTP is offered only when the user has no Gmail. This typically routes 90%+ of signups through the free path.
- A daily-OTP-volume circuit breaker lands in `apps/api` during Phase 2.5 so a runaway script can't drain the Blaze budget. Default cap: 500 OTPs/day; configurable from the admin panel.
- Re-evaluate at 1k DAU: if OTP volume drives Firebase Auth costs above ~₹2k/mo, the existing pluggable verifier interface (`TokenVerifier` in `apps/api/src/auth.ts`) makes it a 1-day swap to MSG91 or 2Factor without changing route handlers.

Phase 2.4 wires the actual flow:

- Web: `getAuth().signInWithPhoneNumber(phone, recaptchaVerifier)` + `confirmationResult.confirm(code)`
- Mobile: `@react-native-firebase/auth` `signInWithPhoneNumber()`
- Server: `firebase-admin` `auth().verifyIdToken(idToken)`

---

## Skipped (per founder decision)

- **PostHog** (product analytics) — Firebase Analytics + Cloud Logging will cover us until product analytics specifically becomes a need.
- **Sentry** (error tracking) — Firebase Crashlytics for mobile + Cloud Logging structured errors for the api will suffice for the foreseeable future. Easy to add later if it stops being enough.
- **MSG91** — see Phone OTP section above.

---

## What's already set up (Phase 1)

- Cloudflare account + nameservers ✅
- Cloudflare Pages project `nexigrate-marketing` ✅
- KV namespace `nexigrate-waitlist` bound as `WAITLIST_KV` ✅
- Custom domain `nexigrate.com` ✅
- DNS pointed at Cloudflare ✅
