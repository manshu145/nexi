# infra/terraform

Google Cloud infrastructure as code.

- **Status**: not yet written \u2014 begins in Phase 2

Will provision:
- Project, billing link, budget alerts (\u20b9500 cap initial)
- Required APIs enabled (Cloud Run, Functions, Firestore, Storage, Vision, Vertex AI, Identity Toolkit, Scheduler, Logging, Build, Artifact Registry)
- Cloud Run services (api, web, admin)
- Firestore database (region `asia-south1`)
- Cloud Storage buckets (`nexigrate-uploads`, `nexigrate-public`)
- IAM service accounts and roles
- Cloud Scheduler jobs for daily MCQ generation, current affairs ingest, credit expiry sweeper
- Cloud Build triggers wired to GitHub
