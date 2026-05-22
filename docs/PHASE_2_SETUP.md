# Phase 2 Setup — GCP, Firebase, and the rest of the keys

> **Goal:** stand up the cloud resources Phase 2.2 will deploy to, and gather the API keys Phase 2.3+ need.
>
> **Cost:** ₹0 if you stay inside the free tiers (the GCP budget alert below makes sure you do).

You don't have to do all of this before Phase 2.1 lands — `apps/api` boots on stub auth and an in-memory ledger so we can build and test most of Phase 2 against a local dev server. You'll need this once we wire real Firestore + real auth in Phase 2.2.

---

## What you'll set up here

- A Google Cloud project (`nexigrate-prod`) with billing enabled and a hard ₹500 budget alert
- Firebase Auth (Google + phone) attached to that project
- Firestore (Native mode, Mumbai region)
- Cloud Storage bucket for verification uploads
- A service account the API uses to talk to Firestore and Storage
- API keys for OpenAI, Gemini, Groq, Resend, Razorpay
- A workload-identity-federation pool for GitHub Actions to deploy without long-lived keys

We'll add each of these to GitHub Secrets so the deploy workflow picks them up automatically.

---

## 1. GCP project + billing safety

1. [console.cloud.google.com](https://console.cloud.google.com) → top bar project picker → **New Project**
2. Name `nexigrate-prod`. Region defaults are fine; we'll override per-resource.
3. Wait ~30s, switch to it.
4. **Billing** (left nav) → Link a billing account → add a card.
5. **Billing → Budgets & alerts → Create budget**:
   - Name: `Nexigrate Safety Cap`
   - Amount: **₹500**
   - Alerts at 50%, 75%, 90%, 100%
   - Email: your founder email
6. **APIs & Services → Library** → enable each of:
   - Cloud Run Admin API
   - Cloud Build API
   - Artifact Registry API
   - Cloud Functions API
   - Cloud Firestore API
   - Cloud Storage API
   - Cloud Vision API
   - Vertex AI API
   - Identity Toolkit API (Firebase Auth)
   - Cloud Scheduler API
   - Cloud Logging API
   - IAM Service Account Credentials API

## 2. Firebase project

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → choose **Use existing GCP project** → `nexigrate-prod`.
2. Enable Google Analytics for Firebase if prompted (optional).
3. **Build → Authentication → Get started** → enable:
   - **Google** sign-in (primary)
   - **Phone** sign-in (the user opted to handle phone OTP entirely via Firebase rather than a third-party SMS provider; cost is ~₹4–5 per OTP in India and is paid for by the Firebase Blaze plan attached to this project)
4. **Build → Firestore Database → Create database**:
   - Mode: **Start in production mode**
   - Location: `asia-south1` (Mumbai)
5. **Build → Storage → Get started**: same region.
6. **Project settings → General → Your apps**:
   - **Add app → Web** for the marketing site (or a dummy app to get a `firebaseConfig` we can use locally if needed)
   - Save the resulting config; you'll paste the public-facing parts (`apiKey`, `authDomain`, `projectId`, etc.) into `apps/web/.env.local` later

## 3. Service account for the API

The API server (Cloud Run) uses a dedicated service account with the minimum permissions to touch Firestore, Storage, Vision, and Vertex AI.

1. **GCP Console → IAM & Admin → Service Accounts → Create service account**
2. Name: `nexigrate-api`
3. Grant these roles:
   - `Cloud Datastore User` (Firestore read/write)
   - `Storage Object Admin` (uploads bucket only — we'll restrict later)
   - `Cloud Vision API User`
   - `Vertex AI User`
   - `Service Account Token Creator` (so it can sign Cloud Storage URLs)
4. **Keys → Add key → JSON** → download. Save the file as `nexigrate-api-sa.json` somewhere outside the repo.

When deploying to Cloud Run we won't actually mount this JSON — we'll attach the service account directly to the Cloud Run service via Workload Identity. The JSON key is for local development; export it as `GOOGLE_APPLICATION_CREDENTIALS=/path/to/nexigrate-api-sa.json` to test against real Firestore from your laptop.

## 4. Workload Identity Federation for GitHub Actions

Long-lived JSON keys are a security risk. GitHub Actions can authenticate to GCP via short-lived OIDC tokens instead.

1. **IAM & Admin → Workload Identity Federation → Create pool**
   - Pool name: `github`
   - Provider name: `github-provider`
   - Issuer: `https://token.actions.githubusercontent.com`
   - Attribute mapping:
     - `google.subject` → `assertion.sub`
     - `attribute.repository` → `assertion.repository`
     - `attribute.actor` → `assertion.actor`
     - `attribute.ref` → `assertion.ref`
   - Attribute condition:
     ```
     assertion.repository == "manshu145/nexi"
     ```
2. Bind the pool to the `nexigrate-api` service account:
   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     nexigrate-api@nexigrate-prod.iam.gserviceaccount.com \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/attribute.repository/manshu145/nexi"
   ```
3. Note the workload identity provider full id, e.g.
   `projects/123456789/locations/global/workloadIdentityPools/github/providers/github-provider`

## 5. AI keys

Go to each provider, create a key, and copy it.

| Provider | Where | What to set |
|---|---|---|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Set a hard monthly limit: **Billing → Limits → Hard limit = $5** |
| Google Gemini (AI Studio) | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Free tier; no limits to set |
| Groq | [console.groq.com/keys](https://console.groq.com/keys) | Free tier; rate-limited |

## 6. Email + transactional services

| Service | Where | Free tier |
|---|---|---|
| Resend (transactional email) | [resend.com](https://resend.com) → **API keys → Create** → 'Sending access' on `nexigrate.com` | 3,000 emails/mo, 100/day |
| Sentry | [sentry.io](https://sentry.io) → **Create project → Node** for api, **Astro** for marketing, **Next.js** for web later | 5k events/mo |
| PostHog | [posthog.com](https://posthog.com) → New project → keep the project API key | 1M events/mo |

## 7. Phone OTP

Phone OTP is delivered by **Firebase Phone Auth**, not a third-party SMS provider. Trade-off: Firebase Phone Auth charges ~₹4–5 per India OTP whereas a provider like MSG91 charges ~₹0.15. We accept the higher per-message cost in exchange for:

- One fewer KYC, one fewer external account, one fewer secret to rotate
- Native Firebase Auth integration (custom claims, ID tokens, the `auth().verifyIdToken()` path) without writing a custom-token bridge
- Built-in abuse protection (reCAPTCHA on web, Play Integrity on Android)

To keep costs predictable:

- **Google sign-in is the default** on every client; phone OTP is offered only when the user has no Gmail. This typically routes 90%+ of signups through the free path.
- A daily-OTP-volume circuit breaker will be added in Phase 2.5 (in `apps/api`) so a runaway script can't drain the Blaze budget. Default cap: 500 OTPs/day; configurable from the admin panel.
- Re-evaluate at 1k DAU: if OTP volume drives Firebase Auth costs above ~₹2k/mo, the existing pluggable verifier interface (`TokenVerifier` in `apps/api/src/auth.ts`) makes it a 1-day swap to MSG91 or 2Factor without changing route handlers.

Phase 2.4 wires the actual flow:

- Web: `getAuth().signInWithPhoneNumber(phone, recaptchaVerifier)` + `confirmationResult.confirm(code)`
- Mobile: `@react-native-firebase/auth` `signInWithPhoneNumber()`
- Server: `firebase-admin` `auth().verifyIdToken(idToken)`

## 8. Razorpay

1. Sign up at [razorpay.com](https://razorpay.com) (KYC takes 2–3 business days; start now)
2. Once activated:
   - **Settings → API Keys → Generate Test Key** for development
   - Generate a Live key once you're ready to charge real students
3. **Subscriptions** product → enable
4. We'll create the actual subscription plans (one per tier × interval) via the Razorpay API in Phase 2.8

## 9. Wire up GitHub Actions secrets

In `manshu145/nexi` → **Settings → Secrets and variables → Actions → New repository secret**, add each of:

### Required for Phase 2.2 (api deploy)

- `GCP_PROJECT_ID` = `nexigrate-prod`
- `GCP_PROJECT_NUMBER` = (from GCP console, **IAM → Settings**)
- `GCP_WORKLOAD_IDENTITY_PROVIDER` = `projects/<NUMBER>/locations/global/workloadIdentityPools/github/providers/github-provider`
- `GCP_SERVICE_ACCOUNT` = `nexigrate-api@nexigrate-prod.iam.gserviceaccount.com`

### Required for Phase 2.3 (ai pipeline)

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`

### Required for Phase 2.4–2.5 (web app)

- `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_PROJECT_ID`, `FIREBASE_WEB_APP_ID`

### Required for Phase 2.5 (transactional)

- `RESEND_API_KEY`

### Required for Phase 2.7 (admin panel deploys with same auth)

(Reuses GCP secrets from above.)

### Required for Phase 2.8 (payments)

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

### Phone OTP

No additional secrets needed beyond the standard Firebase setup -- Phone Auth is enabled in the Firebase console (§ 2) and verified by `firebase-admin` on the server using the same service account we use for Firestore.

---

## What's already set up (Phase 1)

The Phase 1 marketing site needs none of the above. It only needs:

- Cloudflare account + nameservers (done)
- Cloudflare Pages project `nexigrate-marketing` (done)
- KV namespace `nexigrate-waitlist` bound as `WAITLIST_KV` (done)
- Custom domain `nexigrate.com` (done)

When you've worked through the sections above, we'll start landing Phase 2.2+ PRs and the secrets get plugged in as each phase needs them.
