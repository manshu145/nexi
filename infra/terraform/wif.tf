// Workload Identity Federation pool + provider for GitHub Actions.
//
// This lets the deploy-api workflow authenticate to GCP using a short-lived
// OIDC token issued by GitHub. No long-lived JSON service-account keys ever
// leave GCP. The pool is restricted to the manshu145/nexi repository.

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "Federation pool for GitHub Actions deploys"

  depends_on = [google_project_service.required_apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "github.com"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  // Lock to our repo. Tokens issued for any other repo are rejected.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

// Allow the GitHub repo (any branch) to impersonate the api service account.
resource "google_service_account_iam_member" "github_can_impersonate_api_sa" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.api_service_account_email}"
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

// Project-level roles the api service account needs to deploy + run.
locals {
  api_sa_roles = [
    "roles/run.admin",                    // deploy Cloud Run revisions
    "roles/iam.serviceAccountUser",       // act-as the runtime SA
    "roles/artifactregistry.writer",      // push images
    "roles/datastore.user",               // Firestore reads/writes
    "roles/storage.admin",                // Cloud Storage uploads
    "roles/iam.serviceAccountTokenCreator", // sign Cloud Storage URLs
    "roles/aiplatform.user",              // Vertex AI / Gemini calls
  ]
}

resource "google_project_iam_member" "api_sa_roles" {
  for_each = toset(local.api_sa_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${var.api_service_account_email}"
}

output "workload_identity_provider" {
  description = "Full path to use as GCP_WORKLOAD_IDENTITY_PROVIDER GitHub Secret."
  value       = google_iam_workload_identity_pool_provider.github.name
}
