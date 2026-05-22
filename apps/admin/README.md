# @nexigrate/admin

Internal admin panel. Phase 3.

- **Stack**: Next.js 15 + Refine.dev + shadcn/ui
- **Auth**: Firebase Auth restricted to admin custom claims
- **Deploy target**: Cloud Run on `admin.nexigrate.com`
- **Status**: not yet scaffolded \u2014 begins in Phase 3

Capabilities planned:
- User management (search, suspend, delete, force re-verify)
- Document verification queue (manual approve/reject of marksheet uploads)
- Content moderation queue (AI-flagged questions, human SME review)
- Analytics dashboards (DAU, MAU, conversion, retention, credit flow)
- Marketing tools (broadcast email/push/SMS, feature flags via Remote Config)
- Payments console (refunds, subscription state, dunning)
- Help & support inbox
- Audit log of all admin actions
