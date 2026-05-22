# infra/terraform

Google Cloud infrastructure as code for the `nexigrate-prod` project.

## Status

**Phase 2.1 skeleton landed:** project + variables + required-API enablement. `terraform validate` succeeds from a fresh checkout. Phase 2.2 will add Cloud Run, Artifact Registry, Workload Identity Federation, the budget alert, and the credit-expiry Scheduler job.

## Project pinning

- `project_id` = `nexigrate-prod`
- `project_number` = `505978726927`
- `region` = `asia-south1` (Mumbai)
- `github_repository` = `manshu145/nexi`
- `api_service_account_email` = `nexigrate-api@nexigrate-prod.iam.gserviceaccount.com`

These live in `variables.tf` as defaults so `terraform plan` from a fresh checkout targets the right place. Override per environment via `terraform.tfvars` (gitignored) or `TF_VAR_*` env vars.

## Run

```bash
# from this directory
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

For first-time setup, you'll need to either:

1. Run with your gcloud user creds: `gcloud auth application-default login`
2. Or run via Workload Identity Federation in GitHub Actions (Phase 2.2)

## What lives here vs the dashboard

The GCP project, billing link, and primary service account were created manually via the Cloudflare-style click-through Phase 2 setup runbook. Terraform owns the **declarative** parts that change frequently or need to be reproducible: API enablement, Cloud Run service config, IAM bindings, scheduler jobs, budget alerts. One-off bootstrap (project, billing link) stays manual.
