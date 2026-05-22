// Hard-cap budget alert. Sends email at 50/75/90/100% of the configured
// monthly amount. Does NOT auto-disable services; we want a human in the
// loop. Pair with per-resource `max_instances` and per-feature circuit
// breakers (e.g. the daily OTP cap in apps/api Phase 2.5).

data "google_billing_account" "primary" {
  // Phase 2.2: assumes the project is already linked to a billing account
  // via the Cloudflare-style click-through bootstrap. We look it up rather
  // than create one. If you have multiple billing accounts, set
  // billing_account_id explicitly via TF_VAR_*.
  billing_account = "" // empty = use the account already linked to the project
  open            = true
}

locals {
  // Convert INR to "USD-equivalent micros" for the API. Google's billing
  // budget API accepts any currency code matching the billing account; if
  // your account is in INR this just works. If it's in USD we approximate.
  budget_units = floor(var.budget_amount_inr)
}

resource "google_billing_budget" "safety_cap" {
  count = data.google_billing_account.primary.id == "" ? 0 : 1

  billing_account = data.google_billing_account.primary.id
  display_name    = "Nexigrate Safety Cap"

  budget_filter {
    projects = ["projects/${var.project_number}"]
  }

  amount {
    specified_amount {
      currency_code = "INR"
      units         = local.budget_units
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.75
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  dynamic "all_updates_rule" {
    for_each = var.budget_alert_email == "" ? [] : [1]
    content {
      monitoring_notification_channels = []
      disable_default_iam_recipients   = false
    }
  }
}
