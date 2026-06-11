// Cloud Run service for the api.
//
// The image tag is intentionally a placeholder ("latest") because the deploy
// workflow updates the running revision via gcloud after pushing a new tag.
// `lifecycle.ignore_changes` keeps Terraform from fighting the pipeline.

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  location = var.region
  name     = "nexigrate-api"

  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.api_service_account_email

    scaling {
      # Keep one instance always warm so the in-process cron scheduler
      # (apps/api/src/lib/scheduler.ts) keeps ticking between requests.
      min_instance_count = 1
      max_instance_count = 3
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/nexigrate/api:bootstrap"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # CPU must stay allocated (no idle throttling) so the background
        # cron timer fires reliably outside request handling. Mirrors the
        # deploy pipeline's `--no-cpu-throttling`.
        cpu_idle          = false
        startup_cpu_boost = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "AUTH_MODE"
        value = "firebase"
      }
      env {
        name  = "PERSISTENCE"
        value = "firestore"
      }
      env {
        name  = "LOG_JSON"
        value = "true"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_PROJECT_NUMBER"
        value = var.project_number
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "GCP_SERVICE_ACCOUNT"
        value = var.api_service_account_email
      }
      env {
        name = "CORS_ALLOWED_ORIGINS"
        // Web + admin + the api's own *.run.app URL for sanity-curl from
        // a Cloud Shell / local debug. Update once app.nexigrate.com lives.
        value = "https://app.nexigrate.com,https://admin.nexigrate.com"
      }

      ports {
        container_port = 8080
      }

      startup_probe {
        http_get {
          path = "/healthz"
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 6
        timeout_seconds       = 3
      }

      liveness_probe {
        http_get {
          path = "/healthz"
        }
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
      }
    }

    timeout = "30s"
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  lifecycle {
    // Image tag changes via the deploy pipeline; don't fight it from TF.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required_apis,
    google_artifact_registry_repository.containers,
  ]
}

// Allow public, unauthenticated access. The api gates everything itself
// via the auth middleware; we don't want IAM in the request path.
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "api_service_url" {
  description = "Cloud Run URL of the api service. Map to api.nexigrate.com via Domain Mapping."
  value       = google_cloud_run_v2_service.api.uri
}
