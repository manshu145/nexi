// Skeleton. Phase 2.1 lands the project metadata and required-API list so
// `terraform validate` runs from a fresh checkout. Phase 2.2 will append:
//
//   - google_artifact_registry_repository
//   - google_cloud_run_v2_service for `nexigrate-api`
//   - google_iam_workload_identity_pool + provider for GitHub Actions
//   - google_billing_budget enforcing the variable budget cap
//   - google_cloud_scheduler_job for the nightly credit-expiry sweeper
//
// Run from this directory:
//
//   terraform init
//   terraform plan -out=tfplan
//   terraform apply tfplan

terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30, < 7.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

// APIs that need to be enabled before any subsequent resource can be created.
// Listed explicitly so a fresh project can be bootstrapped from this file alone.
locals {
  required_apis = [
    "run.googleapis.com",                        // Cloud Run
    "cloudbuild.googleapis.com",                 // Cloud Build (container images)
    "artifactregistry.googleapis.com",           // image registry
    "cloudfunctions.googleapis.com",             // background workers
    "firestore.googleapis.com",                  // Firestore
    "storage.googleapis.com",                    // Cloud Storage
    "vision.googleapis.com",                     // Cloud Vision (verification OCR)
    "aiplatform.googleapis.com",                 // Vertex AI (Gemini)
    "identitytoolkit.googleapis.com",            // Firebase Auth
    "cloudscheduler.googleapis.com",             // cron triggers
    "logging.googleapis.com",                    // Cloud Logging
    "iamcredentials.googleapis.com",             // SA token creator (signed URLs)
    "iam.googleapis.com",                        // IAM bindings
    "billingbudgets.googleapis.com",             // budget alerts
  ]
}

resource "google_project_service" "required_apis" {
  for_each = toset(local.required_apis)

  project = var.project_id
  service = each.value

  // Phase 2.1: do not destroy these on terraform destroy. They were enabled
  // manually first and we don't want a `destroy` to silently turn off
  // billing-critical APIs.
  disable_on_destroy         = false
  disable_dependent_services = false
}
