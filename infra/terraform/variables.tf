// Project identifiers.
//
// These are non-secret. They appear in URLs, IAM bindings, and dashboards.
// Default values point at the production project so a fresh `terraform plan`
// from the repo root targets the right place.

variable "project_id" {
  description = "GCP project id."
  type        = string
  default     = "nexigrate-prod"
}

variable "project_number" {
  description = "GCP project number (numeric). Used in Workload Identity Pool member strings."
  type        = string
  default     = "505978726927"
}

variable "region" {
  description = "Primary region for regional resources (Cloud Run, Firestore, Storage)."
  type        = string
  default     = "asia-south1"
}

variable "github_repository" {
  description = "GitHub repository in `owner/name` form, used to scope the WIF pool."
  type        = string
  default     = "manshu145/nexi"
}

variable "api_service_account_email" {
  description = "Service account that the api Cloud Run service runs as."
  type        = string
  default     = "nexigrate-api@nexigrate-prod.iam.gserviceaccount.com"
}

variable "budget_amount_inr" {
  description = "Monthly budget alert threshold in INR."
  type        = number
  default     = 500
}

variable "budget_alert_email" {
  description = "Where to send budget alerts. Set this via TF_VAR_budget_alert_email or terraform.tfvars (don't commit)."
  type        = string
  default     = ""
}
