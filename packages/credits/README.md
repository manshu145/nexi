# @nexigrate/credits

The credit economy logic, isolated and testable.

- Pure functions: `awardCredits(event)`, `chargeCredits(action)`, `expireCredits(date)`
- Deterministic and idempotent (safe to retry)
- Single source of truth for the earn/spend table
- **Status**: scaffolded in Phase 2

Earn table (initial):
- `signup_verified` \u2192 +200 (expires 14 days)
- `daily_login` \u2192 +10
- `mcq_pass` \u2192 +50
- `mcq_fail_attempted` \u2192 +5
- `streak_7d` \u2192 +150
- `referral_signup` \u2192 +100
- `referral_retained_7d` \u2192 +200

Spend table (initial):
- `read_chapter` \u2192 -5
- `focus_session_1h` \u2192 -10
- `mock_test` \u2192 -20
- `ai_tutor_question` \u2192 -5
- `concept_video` \u2192 -5
