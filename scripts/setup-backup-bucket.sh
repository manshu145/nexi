#!/usr/bin/env bash
# One-time bucket setup for the daily Firestore backup workflow
# (.github/workflows/backup-firestore.yml).
#
# Run this ONCE locally with `gcloud auth login` already done. The
# workflow polls for bucket existence on every run and fails fast with
# a friendly message until this has been executed.
#
# Why a script instead of a workflow?
#   - Bucket creation is idempotent, runs once in the project's lifetime
#   - Lifecycle rules need a JSON payload that's easier to review here
#     than in YAML
#   - Keeps the workflow stateless: the workflow only does the actual
#     backup, not the infrastructure setup

set -euo pipefail

PROJECT="${GCP_PROJECT:-nexigrate-prod}"
BUCKET="${BACKUP_BUCKET:-nexigrate-prod-firestore-backups}"
LOCATION="${LOCATION:-asia-south1}"  # same region as Firestore for fastest export

echo "Setting up Firestore backup bucket"
echo "  Project:  ${PROJECT}"
echo "  Bucket:   gs://${BUCKET}"
echo "  Location: ${LOCATION}"
echo ""

# 1. Create the bucket if it doesn't exist.
if gcloud storage buckets describe "gs://${BUCKET}" --project="${PROJECT}" >/dev/null 2>&1; then
  echo "✓ Bucket already exists. Skipping creation."
else
  echo "Creating Coldline-class bucket…"
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="${PROJECT}" \
    --location="${LOCATION}" \
    --default-storage-class=COLDLINE \
    --uniform-bucket-level-access
  echo "✓ Bucket created."
fi

# 2. Apply the 7-day lifecycle rule.
LIFECYCLE_JSON=$(mktemp)
cat >"${LIFECYCLE_JSON}" <<'JSON'
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "age": 7 }
      }
    ]
  }
}
JSON

echo "Applying 7-day deletion lifecycle rule…"
gcloud storage buckets update "gs://${BUCKET}" \
  --project="${PROJECT}" \
  --lifecycle-file="${LIFECYCLE_JSON}"
rm -f "${LIFECYCLE_JSON}"
echo "✓ Lifecycle applied (objects older than 7 days will auto-delete)."

# 3. Grant the Firestore service account permission to write to the bucket.
#    The Cloud Firestore service account is the principal that runs
#    `gcloud firestore export` on the project's behalf and needs
#    objectAdmin on the destination bucket.
FS_SA="service-$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')@gcp-sa-firestore.iam.gserviceaccount.com"
echo "Granting roles/storage.objectAdmin to ${FS_SA}…"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --project="${PROJECT}" \
  --member="serviceAccount:${FS_SA}" \
  --role="roles/storage.objectAdmin" >/dev/null
echo "✓ IAM granted."

# 4. Also grant the deploy service account (the one in
#    FIREBASE_SERVICE_ACCOUNT_JSON, used by the workflow) permission to
#    KICK OFF Firestore exports on the project.
DEPLOY_SA=$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -1 || echo '')
if [ -n "${DEPLOY_SA}" ]; then
  echo "Active gcloud account: ${DEPLOY_SA}"
  echo "If you use a different service account in CI for FIREBASE_SERVICE_ACCOUNT_JSON,"
  echo "ensure it has the role 'roles/datastore.importExportAdmin' on project ${PROJECT}."
fi

echo ""
echo "✓ Backup bucket ready."
echo ""
echo "Test it with a manual backup:"
echo "  gh workflow run 'Daily Firestore backup' --field reason='setup-test'"
echo ""
echo "Or via the GitHub UI:"
echo "  https://github.com/manshu145/nexi/actions/workflows/backup-firestore.yml"
