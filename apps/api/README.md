# @nexigrate/api

Backend API service. Phase 2.

- **Stack**: Node.js 22 + Hono + TypeScript
- **Runtime**: Containerized, deployed to Cloud Run (`asia-south1`)
- **Domain**: `api.nexigrate.com`
- **Auth**: Firebase Admin SDK to verify ID tokens from clients
- **Storage**: Firestore (primary), Cloud Storage (uploads)
- **Status**: not yet scaffolded \u2014 begins in Phase 2

Primary responsibilities:
- Issuing and consuming credits (idempotent)
- Generating personalized daily MCQs
- Routing AI calls (OpenAI / Gemini / Groq) and aggregating verifier responses
- Verification workflow (kicking off Cloud Vision OCR + Gemini doc analysis)
- Razorpay subscription webhooks
- Referral attribution
- Rate limits and abuse protection
