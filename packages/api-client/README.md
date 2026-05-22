# @nexigrate/api-client

Typed HTTP client for the `@nexigrate/api` service. Used by web, mobile, and admin apps.

- Built with `ofetch` + Zod-validated responses
- Auto-attaches the Firebase ID token on every request
- Retries with exponential backoff on 5xx
- Surfaces typed errors to the caller
- **Status**: scaffolded in Phase 2
