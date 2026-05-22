# @nexigrate/api

Backend HTTP API for Nexigrate. Hono on Node 22, deployed to Cloud Run (`asia-south1`).

## Status

**Phase 2.1 scaffold** — boots locally with stub auth and an in-memory credit ledger. Phase 2.2 swaps the in-memory ledger for Firestore and the stub verifier for the real Firebase Admin SDK. The HTTP surface itself does not change.

## Run locally

```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter @nexigrate/api dev
```

The server listens on `http://localhost:8080` by default.

```bash
# health
curl -i http://localhost:8080/healthz

# get my balance with a stub token
curl -i -H "Authorization: Bearer stub:u_alice" \
  http://localhost:8080/v1/credits/balance

# admin: grant 500 credits
curl -i -H "Authorization: Bearer stub:u_admin:admin" \
  -H "Content-Type: application/json" \
  -d '{"userId":"u_alice","source":"admin_grant","amountOverride":500,"sourceRef":null,"idempotencyKey":"k1"}' \
  http://localhost:8080/v1/credits/award
```

## HTTP surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/` | public | service banner |
| `GET` | `/healthz` | public | liveness |
| `GET` | `/readyz` | public | readiness |
| `GET` | `/v1/credits/balance` | user | caller's own balance |
| `GET` | `/v1/credits/balance/:userId` | admin | look up another user |
| `GET` | `/v1/credits/events` | user | recent ledger events |
| `POST` | `/v1/credits/award` | admin | admin grant or test fixture |
| `POST` | `/v1/credits/spend` | admin | server-to-server spend |

User-facing earn/spend (e.g. mcq_pass, read_chapter) will land in subsequent commits as their own routes (`/v1/mcqs/...`, `/v1/chapters/...`) that internally call into `@nexigrate/credits`. Direct user-callable `award`/`spend` would let users grant themselves credits, so the public surface is admin-only.

## Layout

```
src/
├── server.ts     # composition root: load env, build app, listen
├── app.ts        # buildApp(deps) factory: wires middleware + routes
├── env.ts        # zod-validated process.env loader
├── logger.ts     # tiny structured logger (json for Cloud Logging)
├── auth.ts       # token verifier interface + stub + Firebase placeholder
└── routes/
    ├── health.ts
    └── credits.ts
```

## Deploy to Cloud Run (Phase 2.2 onward)

Build and push a container image, then deploy:

```bash
# from repo root
gcloud builds submit --tag asia-south1-docker.pkg.dev/$GCP_PROJECT_ID/nexigrate/api:$(git rev-parse --short HEAD) \
  --gcs-source-staging-dir=gs://$GCP_PROJECT_ID-cloudbuild --file=apps/api/Dockerfile .

gcloud run deploy nexigrate-api \
  --image=asia-south1-docker.pkg.dev/$GCP_PROJECT_ID/nexigrate/api:<tag> \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars=NODE_ENV=production,AUTH_MODE=firebase,LOG_JSON=true,GCP_PROJECT_ID=$GCP_PROJECT_ID \
  --max-instances=3 \
  --cpu=1 --memory=512Mi
```

Phase 2.2 will move the deploy into a GitHub Actions workflow (`deploy-api.yml`) and provision the supporting infra (Artifact Registry, service account, Cloud Run service) via Terraform in `infra/terraform`.
