// Artifact Registry repository that holds container images for the api
// Cloud Run service. One repo per project, format=Docker, region pinned to
// asia-south1 so the Cloud Run pull is local.
resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.region
  repository_id = "nexigrate"
  description   = "Container images for Nexigrate services"
  format        = "DOCKER"

  depends_on = [google_project_service.required_apis]
}
